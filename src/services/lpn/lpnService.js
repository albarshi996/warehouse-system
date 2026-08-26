/**
 * خدمة الطبالي السحابية — الحفظ والتزامن فوق المنطق الخالص. تنقل ولا تقرّر.
 *
 * البنية:
 *   handling_units/{lpnCode}            ← كيان الطبلية (المعرّف = LPN نفسه)
 *      └── events/{eventId}             ← سجلّ أحداثها الملحق-فقط
 *   lpn_counters/{LPN-WH-YYYYMMDD}      ← عدّاد التسلسل اليومي لكلّ مستودع
 *
 * ═══ القواعد الحاكمة ═══
 * ١· **الحكم كلّه في الوحدات الخالصة** (`lpnCode` · `lpnLifecycle` ·
 *    `lpnContents` · `lpnEvents`) — هذه الخدمة تستدعيها قبل كلّ كتابة ولا
 *    تحمل قاعدة عملٍ واحدة (EXE-002: المنطق في الكود والقاعدة مخزن).
 * ٢· **لا دالّة حذفٍ هنا أصلًا** — الإلغاء حالةٌ وحدثٌ لا محو، والهويّة لا
 *    يُعاد استخدامها ولو أُغلقت (خطة ٧). وقواعد Firestore تسدّ الباب الثاني.
 * ٣· **الهويّة تولد في معاملةٍ ذرّية** على العدّاد اليومي — جهازان في اللحظة
 *    نفسها يأخذان رقمين لا رقمًا (نمط `reserveNumber` القائم حرفيًّا).
 *    ⚠️ ولا تعمل بلا إنترنت — كالترقيم الرسمي: هويّةٌ مؤقّتة أسوأ من انتظار
 *    الشبكة، والطبلية قبل الاعتماد تعيش داخل جلستها بلا هويّة أصلًا.
 * ٤· **الميلاد في المجموعة عند ولادة الهويّة**: دورة `قيد الإنشاء ← قيد
 *    القراءة ← بانتظار الحوكمة` تعيش في جلسة الاستلام (م٢)؛ ولا يدخل
 *    `handling_units` إلّا معتمَدٌ بهويّته (`APPROVED`) أو طبليةُ صرفٍ تولد
 *    قيد التحضير (`PICKING`).
 *
 * الوثيقة الحاكمة: docs/خطة-طبقة-الطبالي.md — والحدّ ح-٢: هذه الطبقة لا
 * تكتب دفترًا ولا مستندًا؛ حركتها تتبع قيدًا وقع (حارسها lpnIsolation).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { normalizeLocationCode } from '../locations/locationCode.js';
import { formatLpnCode, isValidLpnCode, lpnCounterKey, normalizeLpnCode } from './lpnCode.js';
import { unitTransitionProblem, flagProblem, activeFlags, initialStateProblem, contentChangeProblem } from './lpnLifecycle.js';
import { buildEvent, docEventId } from './lpnEvents.js';

const UNITS = 'handling_units';
const EVENTS = 'events';
const COUNTERS = 'lpn_counters';

/** هوية الكاتب من Auth مباشرة — قواعد الأمان تشترط `byUid == request.auth.uid`. */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

/**
 * حجز هويّة LPN التالية لمستودعٍ ويوم — معاملة ذرّية على العدّاد اليومي.
 *
 * @returns {Promise<{code:string, seq:number}>}
 */
export async function reserveLpnCode({ warehouse, date }) {
  const key = lpnCounterKey({ warehouse, date });
  if (!key) throw new Error('عدّاد الهويّة يحتاج مستودعًا ويومًا صالحَين.');

  const ref = doc(db, COUNTERS, key);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists() ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(ref, { key, seq: next, byUid: currentUid() }, { merge: true });
    return next;
  });

  const code = formatLpnCode({ warehouse, date, seq });
  if (!code) throw new Error(`تعذّر بناء الهويّة من (${warehouse} · ${date} · ${seq}) — راجع المدخلات.`);
  return { code, seq };
}

/** حالات الميلاد في المجموعة — القاعدة الحاكمة ٤ أعلاه. */
const MATERIALIZE_STATES = ['APPROVED', 'PICKING'];

/** رقم نسخة الحمولة الابتدائيّ — يتزايد مع كلّ تغيير محتوى (حارس السباق). */
const INITIAL_CONTENT_REV = 0;

/**
 * إنشاء كيان الطبلية بهويّته — يرفض هويّةً مستعملة: **لا يُعاد استخدام LPN
 * أبدًا** يُفرض هنا بمعاملةٍ تقرأ قبل أن تكتب، لا بأمل ألّا يتصادف.
 *
 * @returns {Promise<{code:string}>}
 */
export async function createHandlingUnit({ code, state, warehouse = '', bin = '', lines = [], parentCodes = [], sourceDoc = null, orderRef = null, actor, at }) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) throw new Error(`هويّة الطبلية «${code ?? ''}» غير صالحة — تولد من reserveLpnCode لا من اليد.`);
  if (!MATERIALIZE_STATES.includes(state)) {
    // الدورة قبل الاعتماد تعيش في جلسة الاستلام — راجع initialStateProblem
    // للمفهوم؛ هنا يُحرس ميلاد **الكيان المسمّى** تحديدًا.
    throw new Error(`الكيان يولد «معتمدة» من الحوكمة أو «قيد التحضير» طبليةَ صرفٍ — لا «${state ?? ''}». ${initialStateProblem(state) || ''}`.trim());
  }
  if (!String(actor ?? '').trim()) throw new Error('إنشاء الطبلية بلا فاعلٍ لا يُسجَّل.');

  // حدث الميلاد يُبنى **قبل** المعاملة: سجلٌّ يبدأ من أوّل لحظةٍ لا من ثانيها.
  const born = buildEvent({ type: 'CREATED', lpn, actor, at, doc: sourceDoc, details: { state, parentCodes } });
  if (born.problem) throw new Error(born.problem);

  const ref = doc(db, UNITS, lpn);
  const bornId = 'CREATED'; // ميلادٌ واحد لكلّ هويّة — معرّفٌ ثابت فإعادة المحاولة تكتب فوق نفسها.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error(`الهويّة «${lpn}» مستعملة — LPN لا يُعاد استخدامه أبدًا، احجز هويّةً جديدة.`);
    tx.set(doc(db, UNITS, lpn, EVENTS, bornId), { ...born.event, byUid: currentUid(), recordedAt: serverTimestamp() });
    tx.set(ref, {
      code: lpn,
      state,
      flags: [],
      warehouse: String(warehouse ?? '').trim().toUpperCase(),
      // الموقع بمطبّع كود الموقع القائم — وإلا افترق bin الطبلية عن bin
      // مفتاح الرصيد حرفًا فانهار فاحص الاحتواء على أخطاء طباعة.
      bin: normalizeLocationCode(bin),
      lines,
      contentRev: INITIAL_CONTENT_REV,
      parentCodes,
      sourceDoc,
      orderRef,
      createdBy: String(actor).trim(),
      createdByUid: currentUid(),
      createdAt: serverTimestamp(),
    });
  });
  return { code: lpn };
}

/**
 * إلحاق حدثٍ بسجلّ الطبلية — ملحق-فقط.
 *
 * المعرّف الحتمي (من `docEventId`/`sessionEventId`) يُمرَّر في `id` فتكون
 * إعادة المحاولة كتابةً فوق نفسها؛ وبغيره يُولَّد معرّفٌ من مفتاح الحدث
 * (النوع والوقت والفاعل) — حتميٌّ أيضًا فلا يضاعف الانقطاع حدثًا.
 */
export async function appendUnitEvent(code, eventInput, { id } = {}) {
  const lpn = normalizeLpnCode(code);
  const built = buildEvent({ ...eventInput, lpn });
  if (built.problem) throw new Error(built.problem);

  // ★★ المعرّف **إلزاميّ صريح** — لا يُشتقّ من (النوع والوقت والفاعل):
  // قراءتان لصنفين مختلفين في الثانية نفسها كانتا تتشاركان المعرّف،
  // و`setDoc` يكتب الثانية فوق الأولى **بلا خطأ** — فقدُ حدثٍ صامتٍ في
  // سجلٍّ هو الحقيقة. فليبنِه المستدعي بـ`sessionEventId`/`docEventId`.
  const eventId = String(id ?? '').trim();
  if (!eventId) {
    throw new Error('حدثٌ بلا معرّفٍ صريح — ابنِه بـsessionEventId أو docEventId كي لا يبتلع حدثٌ حدثًا.');
  }
  const ref = doc(db, UNITS, lpn, EVENTS, eventId);
  await setDoc(ref, { ...built.event, byUid: currentUid(), recordedAt: serverTimestamp() });
  return { id: eventId };
}

/**
 * انتقال حالة — الحكم من مصفوفة الدورة، والحالة والحدث في معاملةٍ واحدة:
 * لا حالة بلا حدثٍ يفسّرها ولا حدث بلا حالةٍ تثبته.
 */
export async function transitionUnit(code, next, { actor, at, override = false, overrideNote = '', doc: sourceDoc = null } = {}) {
  const lpn = normalizeLpnCode(code);
  const ref = doc(db, UNITS, lpn);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`الطبلية «${lpn}» غير موجودة — امسح الملصق ثانيةً أو راجع الحوكمة.`);
    const unit = snap.data();

    const problem = unitTransitionProblem(unit, next, { override, overrideNote });
    if (problem) throw new Error(problem);
    if (!String(actor ?? '').trim()) throw new Error('الانتقال بلا فاعلٍ لا يُسجَّل.');

    const built = buildEvent({
      type: 'STATE_CHANGED',
      lpn,
      actor,
      at,
      doc: sourceDoc,
      details: { from: unit.state, to: next, ...(override ? { override: true, overrideNote } : {}) },
    });
    if (built.problem) throw new Error(built.problem);

    tx.update(ref, { state: next, stateChangedAt: at ?? null, stateChangedBy: String(actor).trim() });
    const evId = `STATE__${unit.state}__${next}__${String(at ?? '').replace(/[/.#$[\]\s]/g, '_')}`;
    tx.set(doc(db, UNITS, lpn, EVENTS, evId), { ...built.event, byUid: currentUid(), recordedAt: serverTimestamp() });
  });
}

/** وسم استثنائي — الحكم في `flagProblem`، والوسم والحدث معًا ذرّيًّا. */
export async function flagUnit(code, flag, { reason, actor, at } = {}) {
  const lpn = normalizeLpnCode(code);
  const ref = doc(db, UNITS, lpn);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`الطبلية «${lpn}» غير موجودة.`);
    const unit = snap.data();
    const problem = flagProblem(unit, flag, { reason, actor });
    if (problem) throw new Error(problem);

    const built = buildEvent({ type: 'FLAGGED', lpn, actor, at, reason, details: { flag } });
    if (built.problem) throw new Error(built.problem);

    const evId = `FLAG__${flag}__${String(at ?? '').replace(/[/.#$[\]\s]/g, '_')}`;
    tx.update(ref, { flags: [...activeFlags(unit), flag] });
    tx.set(doc(db, UNITS, lpn, EVENTS, evId), {
      ...built.event,
      byUid: currentUid(),
      recordedAt: serverTimestamp(),
    });
  });
}

/** رفع وسم — قرار حوكمةٍ مكتوب، والطبلية تُكمل من موضعها. */
export async function clearUnitFlag(code, flag, { decision, actor, at } = {}) {
  const lpn = normalizeLpnCode(code);
  const ref = doc(db, UNITS, lpn);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`الطبلية «${lpn}» غير موجودة.`);
    const unit = snap.data();
    if (!activeFlags(unit).includes(flag)) throw new Error(`الطبلية ليست موسومة «${flag}».`);
    if (!String(decision ?? '').trim()) throw new Error('رفع الوسم قرارُ حوكمةٍ يحتاج نصًّا.');

    const built = buildEvent({ type: 'FLAG_CLEARED', lpn, actor, at, reason: decision, details: { flag } });
    if (built.problem) throw new Error(built.problem);

    const evId = `UNFLAG__${flag}__${String(at ?? '').replace(/[/.#$[\]\s]/g, '_')}`;
    tx.update(ref, { flags: activeFlags(unit).filter((f) => f !== flag) });
    tx.set(doc(db, UNITS, lpn, EVENTS, evId), {
      ...built.event,
      byUid: currentUid(),
      recordedAt: serverTimestamp(),
    });
  });
}

/**
 * انتقال موقع الطبلية — يتبع مستندًا قُيّد (PUTAWAY وأخواته)، بمعرّف حدثٍ
 * حتمي `docId__lpn`: مستندٌ واحد يحرّكها مرّةً مهما أُعيدت المعالجة.
 * **الطبلية في موقعٍ واحدٍ دائمًا** — الحقل يُستبدل والتاريخ في الأحداث.
 */
export async function moveUnit(code, { toBin, toWarehouse = '', docRef, actor, at } = {}) {
  const lpn = normalizeLpnCode(code);
  if (!docRef?.id) throw new Error('انتقال الموقع يتبع مستندًا — لا نقل بلا مستندٍ معتمد (القاعدة ١).');
  const ref = doc(db, UNITS, lpn);

  const eventRef = doc(db, UNITS, lpn, EVENTS, docEventId(docRef.id, lpn));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`الطبلية «${lpn}» غير موجودة.`);
    // ★★ الحتميّة الحقيقيّة: إن كان حدثُ هذا المستند مكتوبًا فقد عولج —
    // فلا يُحدَّث الموقع ثانيةً. وإلّا أعادت معالجةُ مستندٍ **قديم** الطبليةَ
    // إلى رفٍّ غادرته منذ نقلةٍ أحدث، بصمتٍ لأنّ الحدث يُكتب فوق نفسه.
    const already = await tx.get(eventRef);
    if (already.exists()) return;
    const unit = snap.data();

    const built = buildEvent({
      type: 'MOVED',
      lpn,
      actor,
      at,
      doc: docRef,
      details: { fromWarehouse: unit.warehouse ?? '', fromBin: unit.bin ?? '', toWarehouse: toWarehouse || (unit.warehouse ?? ''), toBin: toBin ?? '' },
    });
    if (built.problem) throw new Error(built.problem);

    tx.update(ref, {
      // نفس مطبّع مفتاح الرصيد — «MAIN A01» و«main-a01» موقعٌ واحد لا اثنان.
      bin: normalizeLocationCode(toBin),
      ...(toWarehouse ? { warehouse: String(toWarehouse).trim().toUpperCase() } : {}),
    });
    tx.set(eventRef, { ...built.event, byUid: currentUid(), recordedAt: serverTimestamp() });
  });
}

/**
 * تحديث محتويات — كلّ تغييرٍ بحدثٍ يفسّره في المعاملة نفسها. البنود تُحسب
 * في المنطق الخالص (`addReading`/`removeQty`/`splitUnit`) ثم تُسلَّم هنا
 * جاهزةً — الخدمة لا تحسب.
 */
export async function applyContentChange(code, { lines, baseRev, event, eventId } = {}) {
  const lpn = normalizeLpnCode(code);
  if (!Array.isArray(lines)) throw new Error('تغيير المحتوى يحتاج البنود الجديدة كاملةً.');
  if (!Number.isInteger(baseRev)) {
    throw new Error('تغيير المحتوى يحتاج رقم النسخة التي حُسب عليها (contentRev) — بلا مقارنةٍ تُمحى سحبةُ زميلك بصمت.');
  }
  const evId = String(eventId ?? '').trim();
  if (!evId) throw new Error('تغيير المحتوى يحتاج معرّف حدثٍ صريحًا.');
  const built = buildEvent({ ...event, lpn });
  if (built.problem) throw new Error(built.problem);

  const ref = doc(db, UNITS, lpn);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`الطبلية «${lpn}» غير موجودة.`);
    const unit = snap.data();

    // ★★ الحمولة لا تُمسّ إن كانت الدورة انتهت أو الوسم حاجبًا — الحكم من
    // الوحدة الخالصة على **البيانات الحيّة** لا على نسخةٍ قرأتها الشاشة.
    const guard = contentChangeProblem(unit);
    if (guard) throw new Error(guard);

    // ★★ حارس فقدان التحديث: عاملان يسحبان من الطبلية نفسها في اللحظة
    // نفسها — البنود تُحسب في المنطق الخالص **خارج** المعاملة، فكتابةُ
    // أحدهما جملةً واحدة كانت تمحو سحبَ الآخر بلا أثر. النسخة تتزايد مع
    // كلّ تغيير، ومن حسب على نسخةٍ قديمة يُردّ ليقرأ ثمّ يعيد.
    const currentRev = Number(unit.contentRev) || 0;
    if (currentRev !== baseRev) {
      throw new Error(
        `تغيّرت حمولة الطبلية «${lpn}» بينما كنت تعمل (النسخة ${currentRev} لا ${baseRev}) — أعِد قراءتها ثمّ كرّر العملية؛ زميلٌ سحب منها الآن.`
      );
    }

    tx.update(ref, { lines, contentRev: currentRev + 1 });
    tx.set(doc(db, UNITS, lpn, EVENTS, evId), { ...built.event, byUid: currentUid(), recordedAt: serverTimestamp() });
  });
}

// ── قراءات — البطاقة والشاشات تقف عليها ────────────────────────────────────

/** كيان الطبلية — أو null. */
export async function getUnit(code) {
  const lpn = normalizeLpnCode(code);
  if (!lpn) return null;
  const snap = await getDoc(doc(db, UNITS, lpn));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** سجلّ أحداثها — الترتيب في المنطق الخالص (`orderEvents`) لا في الاستعلام. */
export async function getUnitEvents(code) {
  const lpn = normalizeLpnCode(code);
  if (!lpn) return [];
  const snap = await getDocs(collection(db, UNITS, lpn, EVENTS));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** استماع حيّ لكيان الطبلية — لشاشة الحوكمة والبطاقة. */
export function listenUnit(code, onChange) {
  const lpn = normalizeLpnCode(code);
  return onSnapshot(doc(db, UNITS, lpn), (snap) => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

/** الطبالي بحالةٍ — لعدّادات لوحة الحوكمة. */
export async function listUnitsByState(state, max = 200) {
  const snap = await getDocs(query(collection(db, UNITS), where('state', '==', state), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** الطبالي الواقفة في موقعٍ — «افتح الموقع تجد طباليه» (LPN-211). */
export async function listUnitsAt({ warehouse, bin }, max = 200) {
  const filters = [where('warehouse', '==', String(warehouse ?? '').trim().toUpperCase())];
  // ★ المطبّع نفسه الذي كتب الحقل يقرأه — وإلّا لم يجد «MAIN A01» ما خُزّن
  // «MAIN-A01» فعرضت شاشة «افتح الموقع تجد طباليه» فراغًا كاذبًا.
  const normalizedBin = normalizeLocationCode(bin);
  if (normalizedBin) filters.push(where('bin', '==', normalizedBin));
  const snap = await getDocs(query(collection(db, UNITS), ...filters, limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
