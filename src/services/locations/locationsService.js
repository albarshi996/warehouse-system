/**
 * سيّد مواقع التخزين — `bin_locations`.
 *
 *   bin_locations/{MAIN-A01-R01-B09-LF-P01}   ← المعرّف **هو** الكود
 *
 * لماذا مجموعةٌ مستقلّة لا توسعةٌ لـ`warehouses`؟ لأنّ `warehouses` ماستر
 * **منشآت** مسطّح (`code · name · manager · status`) بشاشته وقواعده، والمواقع
 * هرميّةٌ **داخله** وأكبر بمراتب: مستودعٌ واحد قد يحمل آلاف المواقع.
 *
 * ولماذا المعرّف هو الكود؟ لأنّ الكود هو الهويّة: يجعل الكتابة المتكرّرة
 * **تحديثًا لا تكرارًا**، ويجعل قراءة موقعٍ بعينه قراءةً واحدة بلا استعلام،
 * ويمنع وجود موقعين بالكود نفسه بحكم البنية لا بحكم فحصٍ قد يُنسى.
 *
 * **قاعدة الهويّة التاريخيّة:** الوصف والسعة والقواعد تُعدَّل؛ والكود **لا
 * يُغيَّر** بعد أوّل حركة — يُؤرشَف الموقع ويُنشأ بديل. ولا حذف إطلاقًا
 * (`delete:false` في القواعد) وإلّا انقطعت سلسلة التدقيق على حركاتٍ ماضية.
 */
import { collection, doc, documentId, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, db } from '../_db/index.js';
import { auth } from '../../config/firebase.js';
import { normalizeLocationCode } from './locationCode.js';
import { locationProblems, shapeLocation } from './locationsModel.js';
import { binPrefixRange, chunksOf } from './scopedQuery.js';
import { codesToRead, coordinatesProven, mergeById, skipScanPrefixes, skipScanZones, sortByCode } from './locationReads.js';

const COL = 'bin_locations';
const BATCH_LIMIT = 500;

/**
 * ⚠️ هذه القائمة **يجب أن تطابق** `isManager()` في `firestore.rules`.
 * (درسُ ل‑١٨: `BALANCES_ROLES` ادّعى تطابقًا لم يكن، فصارت الشاشة تمنع من
 * تسمح له القاعدة — وتناقضٌ كهذا يُكتشف يوم التشغيل لا يوم الكتابة.)
 */
export const LOCATIONS_ROLES = ['admin', 'warehouse_manager'];

export function canEditLocations(role) {
  return LOCATIONS_ROLES.includes(role);
}

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لكلّ المواقع لحظيًّا مرتّبةً بالكود. يُعيد دالّة إلغاء الاشتراك. */
export function listenLocations(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('code')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** قراءةٌ واحدة لكلّ المواقع — للاقتراح والمطابقة (لحظةٌ لا حلقة). */
export async function fetchLocationsOnce() {
  const s = await getDocs(collection(db, COL));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ‹DS-READS› خاناتُ مستودعاتٍ بعينها — قراءةٌ واحدةٌ مقصورة لا مستمعٌ على الكلّ.
 *
 * `warehouse` على الخانة هو أوّلُ مقطعٍ من كودها، مكتوبًا بالحروف الكبيرة
 * (`shapeLocation`)، فالمطابقةُ بالقيمة المطبَّعة تطابق `suggestLocations` حرفًا.
 * وبلا ترتيبٍ في الاستعلام عمدًا: `in` مع `orderBy` على حقلٍ آخر يطلب فهرسًا مركّبًا
 * — والترتيبُ يُعاد في الذاكرة.
 */
export async function fetchLocationsForWarehouses(warehouses) {
  const list = [...new Set((warehouses || []).map((w) => String(w ?? '').trim().toUpperCase()).filter(Boolean))];
  const snaps = await Promise.all(
    chunksOf(list).map((chunk) => getDocs(query(collection(db, COL), where('warehouse', 'in', chunk))))
  );
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// ═══════════════════════════════════════════════════════════════════════════
// ‹LOC-READS› قرّاءٌ مقصورون — الشاشةُ تقرأ ما تعرضه (المنطق في `locationReads.js`)
// ═══════════════════════════════════════════════════════════════════════════

const rowOf = (d) => ({ id: d.id, ...d.data() });
const upper = (v) => String(v ?? '').trim().toUpperCase();

/**
 * مستمعون عدّة يُدمجون في قائمةٍ واحدة — ولا يُسلَّم شيءٌ قبل أن يجيب كلُّهم مرّة،
 * وإلّا رأت الشاشةُ نصفَ المستودع لحظةً فحكمت عليه.
 */
function listenMerged(queries, cb, onError) {
  if (!queries.length) {
    const t = setTimeout(() => cb([]), 0);
    return () => clearTimeout(t);
  }
  const latest = new Array(queries.length).fill(null);
  const offs = queries.map((q, i) =>
    onSnapshot(
      q,
      (s) => {
        latest[i] = s.docs.map(rowOf);
        if (latest.every(Boolean)) cb(sortByCode(mergeById(...latest)));
      },
      (e) => onError?.(e)
    )
  );
  return () => offs.forEach((off) => off());
}

/**
 * خاناتُ مستودعٍ (أو مستودعات) حيّةً — `warehouse ==` لا المجموعة كلّها.
 * و`warehouse` على الخانة أوّلُ مقطعٍ من كودها (`shapeLocation`)، فهو ما يطابقه
 * `suggestLocations` و`locationOptions` و`facesNeedingReplenish` حرفًا.
 */
export function listenLocationsOfWarehouses(prefixes, cb, onError) {
  const list = [...new Set((prefixes || []).map(upper).filter(Boolean))].sort();
  const queries = chunksOf(list).map((chunk) =>
    chunk.length === 1
      ? query(collection(db, COL), where('warehouse', '==', chunk[0]))
      : query(collection(db, COL), where('warehouse', 'in', chunk))
  );
  return listenMerged(queries, cb, onError);
}

/** خانةٌ واحدةٌ حيّةً بكودها — و`null` إن لم توجد. */
export function listenLocation(code, cb, onError) {
  const id = normalizeLocationCode(code);
  if (!codesToRead([id]).length) {
    const t = setTimeout(() => cb(null), 0);
    return () => clearTimeout(t);
  }
  return onSnapshot(
    doc(db, COL, id),
    (s) => cb(s.exists() ? rowOf(s) : null),
    (e) => onError?.(e)
  );
}

/** خاناتٌ بأكوادها — `documentId() in` ثلاثين ثلاثين، والباطلُ لا يُسأل عنه. */
export async function fetchLocationsByCodes(codes) {
  const list = codesToRead(codes);
  const snaps = await Promise.all(
    chunksOf(list).map((chunk) => getDocs(query(collection(db, COL), where(documentId(), 'in', chunk))))
  );
  return sortByCode(mergeById(...snaps.map((s) => s.docs.map(rowOf))));
}

/**
 * خاناتُ بادئةٍ كاملةً — مدى الكود (`startsWith('RH-')` في كلّ مستهلك) قراءةً واحدة.
 * لمن يحتاج المستودعَ كلَّه فعلًا: شبكةُ المشي، وناقصُ التوليد إن لم تصدق الذاكرة.
 */
export async function fetchLocationsInPrefix(prefix) {
  const p = upper(prefix);
  if (!p) return [];
  const { start, end } = binPrefixRange(p);
  const s = await getDocs(query(collection(db, COL), where('code', '>=', start), where('code', '<', end)));
  return sortByCode(s.docs.map(rowOf));
}

/** عددُ خانات البادئة من الخادم — ألفُ مدخلٍ بقراءةٍ واحدة لا قراءةٌ لكلّ خانة. */
export async function countLocationsInPrefix(prefix) {
  const p = upper(prefix);
  if (!p) return 0;
  const { start, end } = binPrefixRange(p);
  const snap = await getCountFromServer(
    query(collection(db, COL), where('code', '>=', start), where('code', '<', end))
  );
  return snap.data().count;
}

/** عددُ خانات السيّد كلّه — و`inactiveOnly` لما وُسم `active:false` وحدَه. */
export async function countLocations({ inactiveOnly = false } = {}) {
  const q = inactiveOnly
    ? query(collection(db, COL), where('active', '==', false))
    : collection(db, COL);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/**
 * الشاهد — خانةٌ حقيقيّةٌ واحدة تُثبت أنّ السيّدَ غيرُ فارغ (انظر `locationReads.js`).
 *
 * و`accept` لمن يشترط في الشاهد صفةً (`active !== false` في الإسناد): يُمشى
 * بالمعرّف (خانةٌ ثمّ عشرون عشرون) حتّى يوجد مقبولٌ أو تنتهي المجموعة — فالجوابُ تامٌّ دائمًا،
 * وأسوأُ حالاته (لا مقبولَ أبدًا) قراءةُ الكلّ كما كان.
 *
 * @returns {Promise<object|null>} `null` تعني أنّ لا خانةَ مقبولةً في السيّد كلِّه
 */
export async function fetchLocationWitness(accept = null) {
  if (!accept) {
    const s = await getDocs(query(collection(db, COL), limit(1)));
    return s.docs.length ? rowOf(s.docs[0]) : null;
  }
  // الصفحةُ الأولى خانةٌ واحدة — فالشاهدُ المقبولُ في أوّل خانةٍ (وهو الغالب) بقراءةٍ واحدة.
  let after = '';
  let size = 1;
  for (;;) {
    const constraints = [orderBy(documentId()), limit(size)];
    if (after) constraints.unshift(where(documentId(), '>', after));
    const s = await getDocs(query(collection(db, COL), ...constraints));
    for (const d of s.docs) {
      const row = rowOf(d);
      if (accept(row)) return row;
    }
    if (s.docs.length < size) return null;
    after = s.docs[s.docs.length - 1].id;
    size = 20;
  }
}

/** الخاناتُ المربوطةُ بهذا الباركود — بصيغة الكاتب نفسِها (`bindLocationBarcode`). */
export async function fetchLocationsByBarcode(barcode) {
  const value = upper(barcode).replace(/\s+/g, '');
  if (!value) return [];
  const s = await getDocs(query(collection(db, COL), where('barcode', '==', value)));
  return sortByCode(s.docs.map(rowOf));
}

/** الخاناتُ المربوطةُ كلُّها حيّةً — لتقدّم التكويد وتصادم الملصقات، لا للمستودع كلِّه. */
export function listenBoundLocations(cb, onError) {
  return listenMerged([query(collection(db, COL), where('barcode', '>', ''))], cb, onError);
}

/**
 * أفي السيّد خانةٌ أعلنت سقفَ طبالٍ؟ — قراءةٌ واحدة (`limit(1)`).
 * الشجرةُ والخريطةُ تجلبان الطبالي الواقفة حين يوجد رفٌّ مسقوفٌ **في أيّ مستودع**،
 * فيُسأل السؤالُ نفسُه بلا قراءة المستودعات كلِّها.
 */
export async function hasPalletCapacity() {
  const s = await getDocs(query(collection(db, COL), where('capacity.pallets', '>', 0), limit(1)));
  return s.docs.length > 0;
}

/**
 * أكلُّ خانات السيّد «مُدخَلةُ الإحداثيّات» بحكم `buildGrid`؟ — بالعدّ لا بالقراءة.
 *
 * `buildGrid` يقول عن الشبكة «تقريبيّة» إن وُجدت **في السيّد كلّه** خانةٌ بلا `x` و`y`
 * مُدخَلين — و`null` «لم يُدخَل» (هو ما يكتبه `gridFields` للخانة المولَّدة). وهذا حكمٌ
 * على الكلّ يُكتب في مهمّة السحب (`pathBasis`) فلا يُخمَّن من مستودع المسار. فيُعدّ: لكلّ
 * محورٍ ما قيمتُه رقمٌ محدود — فإن ساوى عددَ الكلّ ثبت أن لا خانةَ ناقصة. وإلّا لم يثبت
 * شيء (`null` · حقلٌ غائب · نوعٌ آخر) فيُقرأ الكلُّ ولا يُخمَّن.
 *
 * @returns {Promise<boolean>} `true` إن ثبت أنّ كلَّ خانةٍ مُدخَلة
 */
export async function allLocationsHaveCoordinates() {
  const col = collection(db, COL);
  const count = async (q) => (await getCountFromServer(q)).data().count;
  const nums = (f) => count(query(col, where(f, '>=', -Number.MAX_VALUE), where(f, '<=', Number.MAX_VALUE)));
  const [total, numX, numY] = await Promise.all([count(col), nums('x'), nums('y')]);
  return coordinatesProven({ total, numX, numY });
}

/** أوجهُ التجهيز كلُّها — `pickFace == true`، وهي قلّةٌ من آلاف الخانات. */
export function listenPickFaces(cb, onError) {
  return listenMerged([query(collection(db, COL), where('pickFace', '==', true))], cb, onError);
}

/**
 * أوّلُ خانةٍ كودُها في `[from, to)` (أو `(from, to)`) بترتيب الكود — خطوةُ «تخطّي المقطع».
 * مدى الكود وترتيبُه على حقلٍ واحد فلا فهرسَ مركّبًا، وقراءةٌ واحدةٌ لكلّ خطوة.
 */
async function firstCodeInRange(from, to, { after = false } = {}) {
  const constraints = [];
  if (from) constraints.push(where('code', after ? '>' : '>=', from));
  if (to) constraints.push(where('code', '<', to));
  const s = await getDocs(query(collection(db, COL), ...constraints, orderBy('code'), limit(1)));
  return s.docs.length ? rowOf(s.docs[0]) : null;
}

/** البادئاتُ القائمة — قراءةٌ لكلّ مستودعٍ وواحدةٌ بعدها (`skipScanPrefixes`). */
export function distinctPrefixes({ liveOnly = false } = {}) {
  return skipScanPrefixes(firstCodeInRange, { liveOnly });
}

/** مناطقُ مستودعٍ حيّة — قراءةٌ لكلّ منطقة (`skipScanZones`). */
export function distinctZones(prefix) {
  return skipScanZones(firstCodeInRange, prefix);
}

/** موقعٌ بعينه بكوده — قراءةٌ واحدة بلا استعلام (المعرّف هو الكود). */
export async function getLocation(code) {
  const id = normalizeLocationCode(code);
  if (!id) return null;
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * إنشاء موقعٍ أو تحديثه. المعرّف هو الكود، فإعادة الحفظ تحديثٌ لا تكرار.
 * `createdAt` يُكتب مرّةً واحدة عند الإنشاء ولا يُدهس بعدها.
 */
export async function saveLocation(input, profile) {
  const problems = locationProblems(input);
  if (problems.length) throw new Error(problems.join(' · '));

  const shaped = shapeLocation(input);
  const ref = doc(db, COL, shaped.code);
  const existing = await getDoc(ref);

  await setDoc(
    ref,
    {
      ...shaped,
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      ...whoami(profile),
    },
    { merge: true }
  );
  return shaped.code;
}

/**
 * أرشفة موقع — **لا حذف**. الحركات الماضية تشير إليه، ومحوُه يقطع أثرها.
 * وهذا هو البديل المعتمَد عن «تغيير الكود»: يُؤرشَف القديم ويُنشأ الجديد.
 */
export async function archiveLocation(code, profile) {
  const id = normalizeLocationCode(code);
  if (!id) throw new Error('كود الموقع مطلوب.');
  await updateDoc(doc(db, COL, id), {
    status: 'archived',
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}

/** تغيير حالة موقع (فعّال · محجوز · ممتلئ · متوقّف · صيانة). */
export async function setLocationStatus(code, status, profile) {
  const id = normalizeLocationCode(code);
  if (!id) throw new Error('كود الموقع مطلوب.');
  await updateDoc(doc(db, COL, id), {
    status,
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}

/**
 * إنشاء مواقع بالجملة — توليد رفوفٍ ومستوياتٍ دفعةً واحدة.
 * يرفض **الدفعة كلّها** إن كان فيها كودٌ واحد غير صالح: إنشاءٌ جزئيّ صامت
 * يترك المستودع نصفَ معرَّف ولا أحد يعلم أيّ نصف.
 */
export async function saveLocationsBulk(inputs, profile) {
  const shaped = [];
  const rejected = [];
  for (const input of inputs || []) {
    const problems = locationProblems(input);
    if (problems.length) rejected.push({ code: input?.code ?? '', problems });
    else shaped.push(shapeLocation(input));
  }
  if (rejected.length) {
    const head = rejected.slice(0, 3).map((r) => `«${r.code}»: ${r.problems[0]}`).join(' · ');
    throw new Error(`${rejected.length} كودًا غير صالح — لم يُحفظ شيء. ${head}`);
  }

  const seen = new Set();
  const unique = shaped.filter((s) => (seen.has(s.code) ? false : seen.add(s.code)));

  for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const s of unique.slice(i, i + BATCH_LIMIT)) {
      batch.set(
        doc(db, COL, s.code),
        { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...whoami(profile) },
        { merge: true }
      );
    }
    await batch.commit();
  }
  return { saved: unique.length, duplicates: shaped.length - unique.length };
}

/**
 * ربطُ باركودِ الملصق بموقعٍ ‹LOC-708› — «الباركودُ يُربط بعنوانه، ولا يُفترض».
 *
 * ═══ ★★★ ولماذا حقلٌ يُكتب وحدَه لا حقلٌ في النموذج ═══
 * `shapeLocation` **لا يعرف الباركود عمدًا**. فلو عرفه لَكتبه فارغًا مع كلّ
 * توليد، و`saveLocationsBulk` يدمج (`merge:true`) — فيمسح ضغطةُ «ولّد الناقص»
 * ربطَ ثلاثةِ آلافِ ملصقٍ **بلا صوت**. فالربطُ يُكتب هنا وحدَه، وحقولُه
 * الثلاثةُ لا يمسّها التوليدُ أبدًا.
 *
 * والهويّةُ تبقى الكودَ القانونيّ: الباركودُ حقلٌ عليه ومفتاحُ بحثٍ عكسيّ.
 * فمن بدّل ملصقًا يومًا يربط الجديدَ بالعنوان نفسِه، ولا تتحرّك حركةٌ واحدة.
 *
 * @param {string} code كود الموقع القانونيّ (`RH-A-R-01-01`)
 * @param {string} barcode باركود الملصق الملصوق فعلًا
 * @param {object} [profile]
 */
export async function bindLocationBarcode(code, barcode, profile) {
  const id = normalizeLocationCode(code);
  const value = String(barcode ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!id) throw new Error('كود الموقع مطلوب.');
  if (!value) throw new Error('باركود الملصق مطلوب.');

  await updateDoc(doc(db, COL, id), {
    barcode: value,
    barcodeBoundAt: serverTimestamp(),
    ...(() => {
      const me = whoami(profile);
      return { barcodeBoundBy: me.byName, barcodeBoundByUid: me.byUid };
    })(),
  });
}

/** نزعُ الربط — ملصقٌ تلف أو نُقل. ولا يُحذف الموقع، فالحركاتُ تشير إليه. */
export async function unbindLocationBarcode(code, profile) {
  const id = normalizeLocationCode(code);
  if (!id) throw new Error('كود الموقع مطلوب.');
  const me = whoami(profile);
  await updateDoc(doc(db, COL, id), {
    barcode: '',
    barcodeBoundAt: serverTimestamp(),
    barcodeBoundBy: me.byName,
    barcodeBoundByUid: me.byUid,
  });
}
