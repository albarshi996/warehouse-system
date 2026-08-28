/**
 * خدمة سجلّ الباركود السحابيّة ‹LPN-704› — تنفّذ ولا تقرّر.
 *
 * البنية:
 *   barcodes/{value}                 ← قيد الباركود · **المعرّف هو القيمة نفسها**
 *      └── prints/{copy-N}           ← سجلّ الطباعات الملحق-فقط
 *   barcode_counters/{key}           ← تسلسل الأنواع التي تحتاجه (شحنة · مركبة)
 *
 * ═══ ولماذا المعرّف هو القيمة ═══
 * لأنّ التفرّد حينئذٍ **تفرضه قاعدة البيانات** لا فحصٌ يسبق الكتابة. وفحصٌ
 * يسبق الكتابة يمرّ منه جهازان في اللحظة نفسها فيسجّلان القيمة مرّتين — وهو
 * بالضبط ما يجعل حمولتين بهويّةٍ واحدة. (نمط `handling_units/{lpnCode}` نفسه.)
 *
 * ═══ والحكم كلّه في الوحدات الخالصة ═══
 * `barcodeCode` · `barcodeKinds` · `barcodeRegistry` — هذه الطبقة تستدعيها
 * قبل كلّ كتابة ولا تحمل قاعدة عملٍ واحدة (EXE-002: المنطق في الكود، والقاعدة
 * مخزنٌ وبوّابةُ مستخدمين لا حاكم).
 *
 * ═══ ولا دالّة حذفٍ هنا أصلًا ═══
 * الإلغاء **حالةٌ** لا محو — والنصّ اشترطه: «الاحتفاظ بسجلّ حركاتٍ لا يمكن
 * حذفه من الواجهة التشغيليّة». وقواعد Firestore تسدّ الباب الثاني.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { classifyScan, normalizeScan } from './barcodeCode.js';
import { classOf, generateVerdict, opProblem, valueSourceProblem } from './barcodeKinds.js';
import {
  applyPrint,
  applyStatus,
  buildEntry,
  entryCard,
  reuseProblem,
  shapeEntry,
} from './barcodeRegistry.js';

const BARCODES = 'barcodes';
const PRINTS = 'prints';
const COUNTERS = 'barcode_counters';

/** سقفُ القراءة الحيّة — سجلٌّ يكبر بالآلاف ولا تُحمَّل الشاشة كلَّه. */
export const REGISTRY_CAP = 500;

/** هويّة الكاتب من Auth مباشرة — القواعد تشترط `createdByUid == request.auth.uid`. */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

/** وقتٌ نصّيٌّ للمنطق الخالص — وختمُ الخادم يُكتب بجانبه للترتيب الموثوق. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * حجز تسلسلٍ ذرّيّ لنوعٍ ونطاق — نمط `reserveLpnCode` حرفيًّا.
 *
 * `key` يصنعه المستدعي (`SHP-RH-20260827` مثلًا) فيبقى هذا الملفّ جاهلًا
 * بنحو كلّ نوع — والنحو في ملفّه.
 *
 * @returns {Promise<number>} التسلسل التالي
 */
export async function reserveSequence(key) {
  const id = normalizeScan(key);
  if (!id) throw new Error('عدّاد الباركود يحتاج مفتاحًا صالحًا.');
  const ref = doc(db, COUNTERS, id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists() ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(ref, { key: id, seq: next, byUid: currentUid() }, { merge: true });
    return next;
  });
}

/**
 * تسجيل باركودٍ في السجلّ — الحكم أوّلًا، ثمّ معاملةٌ ترفض القيمة المستعملة.
 *
 * @returns {Promise<{value:string}>}
 */
export async function registerBarcode({
  value,
  kind = '',
  role = '',
  reason = '',
  docRef = '',
  taskId = '',
  warehouse = '',
  actor,
  actorName = '',
  at = '',
  notes = '',
} = {}) {
  const scan = classifyScan(value);
  const resolvedKind = kind || scan.kind;
  if (scan.problem) throw new Error(scan.problem);

  // ① الصلاحية والسياق — من `barcodeKinds`، لا حكمَ يُكتب هنا.
  const verdict = generateVerdict(resolvedKind, { portalRole: role, docRef, taskId, reason });
  if (!verdict.ok) throw new Error(verdict.message);

  // ② «النظام يولّد لا الموظّف» — قيمةٌ ممرَّرةٌ لنوعٍ تشغيليّ تُرفض.
  const sourceProblem = valueSourceProblem(resolvedKind, { value });
  if (sourceProblem) throw new Error(sourceProblem);

  const stamp = at || nowIso();
  const built = buildEntry({
    value: scan.code,
    kind: resolvedKind,
    class: verdict.class || classOf(resolvedKind),
    createdBy: actor,
    createdByName: actorName,
    createdAt: stamp,
    reason,
    docRef,
    taskId,
    warehouse,
    notes,
  });
  if (built.problems) throw new Error(built.problems.join(' · '));

  const ref = doc(db, BARCODES, scan.code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      throw new Error(reuseProblem(scan.code, snap.data()) || `«${scan.code}» مسجَّلٌ سلفًا.`);
    }
    tx.set(ref, {
      ...built.entry,
      prints: [],
      createdByUid: currentUid(),
      recordedAt: serverTimestamp(),
    });
  });
  return { value: scan.code };
}

/**
 * تسجيلُ دفعةٍ — كلُّ قيمةٍ على حدة، والفاشلة تُعلَن ولا تُسقط الباقيات.
 *
 * ولماذا لا معاملةٌ واحدة؟ لأنّ دفعةً من ألفَي موقعٍ تسقط كلُّها بقيمةٍ واحدة
 * مكرّرة، فيُعيد المدير الكرّة ألفًا. والحصيلةُ المفصّلة أنفعُ من فشلٍ جامع.
 *
 * @returns {Promise<{ok:string[], failed:Array<{value:string, problem:string}>}>}
 */
export async function registerBatch(items, common = {}) {
  const ok = [];
  const failed = [];
  for (const item of items ?? []) {
    const input = typeof item === 'string' ? { value: item } : item;
    try {
      const out = await registerBarcode({ ...common, ...input });
      ok.push(out.value);
    } catch (err) {
      failed.push({ value: normalizeScan(input?.value), problem: err?.message || String(err) });
    }
  }
  return { ok, failed };
}

/**
 * تسجيل طباعةٍ أو إعادتها — يزيد العدّاد ويُلحق قيدًا في `prints/`.
 *
 * المعرّف `copy-N` **حتميّ**: انقطاعٌ بعد الكتابة وقبل التأكيد يُعيد الكتابة
 * فوق نفسها ولا يضاعف نسخةً في السجلّ (نمط `docEventId` نفسه).
 */
export async function recordPrint(value, { actor, actorName = '', reason = '', printer = 'PDF', role = '', at = '' } = {}) {
  const code = classifyScan(value).code;
  const ref = doc(db, BARCODES, code);
  const stamp = at || nowIso();

  const record = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`«${code}» ليس في سجلّ الباركود — سجّله قبل طباعته.`);
    const current = snap.data();

    // الصلاحية تُحكم بالنسخة: الأولى طباعة، وما بعدها إعادةُ طباعة.
    const op = Number(current?.printCount) > 0 ? 'REPRINT' : 'PRINT';
    if (role) {
      const denied = opProblem(op, current?.kind, { portalRole: role });
      if (denied) throw new Error(denied);
    }

    const out = applyPrint(current, { actor, actorName, at: stamp, reason, printer });
    if (out.problem) throw new Error(out.problem);

    tx.set(doc(db, BARCODES, code, PRINTS, `copy-${out.record.copy}`), {
      ...out.record,
      value: code,
      byUid: currentUid(),
      recordedAt: serverTimestamp(),
    });
    tx.set(
      ref,
      {
        printCount: out.entry.printCount,
        lastPrint: out.record,
        status: out.entry.status,
      },
      { merge: true }
    );
    return out.record;
  });

  return record;
}

/** نقلُ حالة باركودٍ — إلغاءٌ أو إيقافٌ أو تلفٌ أو إغلاق، بسببٍ حين يلزم. */
export async function setBarcodeStatus(value, next, { actor, reason = '', role = '', at = '' } = {}) {
  const code = classifyScan(value).code;
  const ref = doc(db, BARCODES, code);
  const stamp = at || nowIso();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`«${code}» ليس في سجلّ الباركود.`);
    const current = snap.data();

    if (role && (next === 'VOID' || next === 'CLOSED')) {
      const denied = opProblem('VOID', current?.kind, { portalRole: role });
      if (denied) throw new Error(denied);
    }

    const out = applyStatus(current, next, { actor, at: stamp, reason });
    if (out.problem) throw new Error(out.problem);

    tx.set(
      ref,
      {
        status: out.entry.status,
        statusReason: out.entry.statusReason,
        statusBy: out.entry.statusBy,
        statusAt: out.entry.statusAt,
      },
      { merge: true }
    );
  });
}

/** قيدُ باركودٍ واحد — أو `null`. */
export async function getBarcode(value) {
  const code = classifyScan(value).code;
  if (!code) return null;
  const snap = await getDoc(doc(db, BARCODES, code));
  return snap.exists() ? shapeEntry({ ...snap.data(), value: snap.id }) : null;
}

/** بطاقةُ عرضٍ جاهزة — للشاشة التي تسأل عن باركودٍ مسحه العامل. */
export async function getBarcodeCard(value) {
  const entry = await getBarcode(value);
  return entry ? entryCard(entry) : null;
}

/** سجلّ طباعات قيمةٍ ما — مرتَّبًا بالنسخة. */
export async function getPrintLog(value) {
  const code = classifyScan(value).code;
  if (!code) return [];
  const snap = await getDocs(query(collection(db, BARCODES, code, PRINTS), orderBy('copy')));
  return snap.docs.map((d) => d.data());
}

/** استماعٌ حيٌّ للسجلّ — بنوعٍ اختياريّ وسقفٍ يمنع تحميل الآلاف. */
export function listenBarcodes(callback, { kind = '', max = REGISTRY_CAP, onError } = {}) {
  const base = collection(db, BARCODES);
  const q = kind
    ? query(base, where('kind', '==', kind), fsLimit(max))
    : query(base, fsLimit(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => shapeEntry({ ...d.data(), value: d.id }))),
    (err) => (onError ? onError(err) : console.error('barcodes', err))
  );
}

/** قراءةٌ لمرّةٍ واحدة بنوعٍ محدَّد — للتقارير ولقوائم الاختيار. */
export async function listBarcodesByKind(kind, max = REGISTRY_CAP) {
  const snap = await getDocs(query(collection(db, BARCODES), where('kind', '==', kind), fsLimit(max)));
  return snap.docs.map((d) => shapeEntry({ ...d.data(), value: d.id }));
}

/**
 * تسجيلٌ **متسامح**: يسجّل إن لم يكن مسجَّلًا، ويصمت إن كان.
 *
 * ولماذا؟ لأنّ الطبالي والمواقع والأبواب وُلد أكثرُها **قبل** هذا السجلّ.
 * فحين يُمسح قديمٌ لأوّل مرّة يُقيَّد بأثرٍ رجعيّ بدل أن تُرفض حركةُ عاملٍ
 * لسببٍ إداريّ لا يفهمه — والقيدُ يقول صراحةً إنّه استدراكٌ لا إنشاء.
 */
export async function ensureRegistered(value, { role = '', actor, actorName = '', docRef = '', taskId = '', at = '' } = {}) {
  const code = classifyScan(value).code;
  if (!code) return null;
  const existing = await getBarcode(code);
  if (existing) return existing;
  try {
    await registerBarcode({
      value: code,
      role,
      actor,
      actorName,
      at,
      docRef,
      taskId,
      reason: 'استدراكٌ بأثرٍ رجعيّ — وُجد في الميدان قبل السجلّ',
      notes: 'BACKFILL',
    });
  } catch {
    // سباقٌ أو صلاحيةٌ ناقصة — الحركةُ لا تتوقّف لأجل قيدٍ سجلّيّ.
    return null;
  }
  return getBarcode(code);
}

/** يبني مفتاح عدّادٍ من نوعٍ ونطاقٍ ويوم — مفتاحٌ واحدٌ في موضعٍ واحد. */
export function counterKey(prefix, scope, day = '') {
  return [prefix, scope, day].filter(Boolean).map((p) => normalizeScan(p)).join('-');
}

export { BARCODES as BARCODES_COLLECTION, COUNTERS as BARCODE_COUNTERS_COLLECTION };
