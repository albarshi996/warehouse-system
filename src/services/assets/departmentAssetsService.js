/**
 * جردُ أصول الإدارات في السحابة — `department_assets/{BRZ-0001}`.
 *
 * شاشةُ `/dashboard/assets-inventory` كانت تعمل في `let assets = []`، فكلُّ ما
 * يُدخَل فيها يضيع عند تحديث الصفحة. وهذه الخدمةُ هي ما يُبقيه، على نمط
 * `veneciaService` حرفيًّا: استماعٌ حيّ · حفظٌ بوضعَين · ملاحظاتٌ ملحقةٌ-فقط ·
 * تكهينٌ بسببٍ بدلًا من الحذف.
 *
 * ═══ ولا استعلامَ بشرطٍ ولا ترتيب ═══
 * المجموعةُ كلُّها لهذه الشاشة — بخلاف فينسيا التي تقتسم `warehouse_assets`
 * بحقل `warehouse` فتحتاج `where`. فلا شرطَ هنا ولا `orderBy`: **وجمعُهما هو
 * ما يطلب فهرسًا مركَّبًا، والفهرسُ يُنشَر من Firebase Console ولا يملكه
 * الوكيل** — فشاشةٌ تُبنى عليه تعمل عند من بناها وتسقط عند المالك بـ
 * `failed-precondition`. والترتيبُ في الشاشة.
 *
 * ═══ والملاحظاتُ ملحقةٌ-فقط ═══
 * `department_assets/{id}/notes/{noteId}` — لا تعديلَ ولا حذف. فمن كتب
 * «سُلّم لقسم الصيانة» يبقى قولُه بتاريخه واسمه، ومن خالفه يكتب سطرًا ثانيًا.
 * وحقلُ `notes` على السجلّ يبقى **آخرَ ملاحظةٍ** للعرض في الجدول، والسجلُّ
 * هو الذاكرة.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { assetQuantity } from './assetsModel.js';
import { cleanSpecs } from './whDepartment.js';
import {
  assetDocKey,
  assetVerdict,
  archiveVerdict,
  planAssetImport,
} from './departmentAssets.js';

const ASSETS = 'department_assets';
const NOTES = 'notes';

/** حدُّ الدفعة في Firestore ٥٠٠ عمليّة — فأربعُ مئةٍ هامشٌ آمن. */
const BATCH_LIMIT = 400;

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يومُ التقويم المحلّيّ `YYYY-MM-DD` — لا `toISOString` فليبيا على +2. */
export function todayLocal(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * يستمع للجرد كلِّه (المكهَّنُ ضمنَه — التصفيةُ في الشاشة).
 * يُعيد `(assets, pending)` حيث `pending` كتابةٌ لم تصل الخادمَ بعد.
 */
export function listenDepartmentAssets(callback, onError) {
  return onSnapshot(
    collection(db, ASSETS),
    (snap) => {
      callback(
        snap.docs.map((d) => ({ docId: d.id, ...d.data() })),
        snap.metadata.hasPendingWrites
      );
    },
    (e) => onError?.(e)
  );
}

/** سجلُّ ملاحظات أصلٍ واحد، الأحدثُ أوّلًا. */
export function listenAssetNotes(docId, callback, onError) {
  const q = query(collection(db, ASSETS, docId, NOTES), orderBy('at', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/**
 * الحقولُ التي يملكها المستخدم — بشكل سجلّ `assetsModel` نفسِه.
 *
 * ★★★ **وهذه الدالّةُ تبني شكلًا ثابتًا**: أيُّ حقلٍ لا تذكره هنا **يُمحى
 * قبل أن يُكتب**، بلا خطإٍ ولا رسالة. وهو نمطٌ وقع فعلًا في مرفقات الصور
 * فأعمى كاشفَ التكرار شهرًا لو لم يُكشف بالرفع الحيّ. فمن أضاف حقلًا إلى
 * السجلّ **يضيفه هنا**، ويحرسه `departmentAssetsPayload.test.js`.
 *
 * ‹WH-501› `equipmentKind` و`specs`: نوعُ المعدّة وتفاصيلُها («التفاصيلُ
 * المملّة» للرفّ والطبليّة والجهاز المحمول). والمواصفاتُ تُنقّى على حقول
 * النوع في `cleanSpecs`، فلا يُخزَّن فيها ما لا ينتمي إليه.
 */
function assetPayload(record) {
  const t = (v) => String(v ?? '').trim();
  const kind = t(record.equipmentKind);
  return {
    id: t(record.id),
    assetType: t(record.assetType),
    assetName: t(record.assetName),
    brand: t(record.brand),
    serial: t(record.serial),
    qty: assetQuantity(record.qty),
    condition: t(record.condition) || 'جيد',
    responsible: t(record.responsible),
    department: t(record.department),
    section: t(record.section),
    location: t(record.location),
    receivedDate: t(record.receivedDate),
    notes: t(record.notes),
    equipmentKind: kind,
    specs: cleanSpecs(kind, record.specs),
  };
}

/** الحقولُ التي تُولَد مع السجلّ أوّلَ مرّةٍ ولا تُعاد كتابتُها بعدها. */
function birthFields(who) {
  return {
    archived: false,
    archiveReason: '',
    createdAt: serverTimestamp(),
    createdBy: who.byName,
    createdByUid: who.byUid,
  };
}

function stampFields(who) {
  return { updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid };
}

/**
 * يُنشئ أصلًا أو يُعدّله. ويرفض الناقصَ بحكم `assetVerdict` **قبل** أن يلمس
 * السحابة — فالتحقّقُ في المنطق الخالص المختبَر لا في الشاشة وحدَها.
 *
 * و`mode`: `'create'` يمنع الكتابةَ فوق أصلٍ قائم (فرقمٌ مكرَّرٌ يُقال ولا
 * يُدهس صامتًا)، و`'edit'` يطلب وجودَه.
 */
export async function saveDepartmentAsset(record, profile, { mode = 'create' } = {}) {
  const verdict = assetVerdict(record);
  if (!verdict.ok) {
    const err = new Error('الأصل ناقص:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const docId = assetDocKey(record.id);
  const ref = doc(db, ASSETS, docId);
  const snap = await getDoc(ref);
  if (mode === 'create' && snap.exists()) {
    throw new Error(`الرقم ${docId} مستعملٌ — اختر رقمًا آخر.`);
  }
  if (mode === 'edit' && !snap.exists()) {
    throw new Error('الأصل غير موجود — لعلّه حُدِّث من جهازٍ آخر.');
  }

  const who = whoami(profile);
  const payload = assetPayload(record);
  await setDoc(
    ref,
    snap.exists()
      ? { ...payload, ...stampFields(who) }
      : { ...payload, ...birthFields(who), ...stampFields(who) },
    { merge: true }
  );
  return { docId };
}

/**
 * يُضيف ملاحظةً إلى سجلّ الأصل الملحق-فقط، ويُحدّث `notes` ليعرض الأخيرة.
 * ونصٌّ فارغٌ يُرفض: ملاحظةٌ فارغةٌ سطرٌ في السجلّ بلا معنى.
 */
export async function appendAssetNote(docId, text, profile) {
  const body = String(text || '').trim();
  if (!body) throw new Error('الملاحظة فارغة.');
  const who = whoami(profile);
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: body,
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
  await setDoc(doc(db, ASSETS, docId), { notes: body, ...stampFields(who) }, { merge: true });
}

/**
 * يُكهِّن أصلًا بسببٍ مكتوب — **بدلًا من الحذف**، وقاعدةُ الأمن تمنع الحذفَ
 * أصلًا. فرقمُ الأصل مطبوعٌ على شيءٍ كان في الإدارة، ومحوُه يجعل جردًا قديمًا
 * يذكر ما لا وجودَ له.
 */
export async function archiveDepartmentAsset(docId, reason, profile) {
  const v = archiveVerdict(reason);
  if (!v.ok) throw new Error(v.problems.join(' '));
  const who = whoami(profile);
  await setDoc(
    doc(db, ASSETS, docId),
    {
      archived: true,
      archiveReason: v.reason,
      archivedAt: serverTimestamp(),
      archivedBy: who.byName,
      ...stampFields(who),
    },
    { merge: true }
  );
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: `تكهينٌ: ${v.reason}`,
    kind: 'archive',
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
}

/** يُعيد مكهَّنًا إلى الجرد — والسببُ يُسجَّل كذلك. */
export async function restoreDepartmentAsset(docId, reason, profile) {
  const v = archiveVerdict(reason);
  if (!v.ok) throw new Error('الإرجاع يحتاج سببًا مكتوبًا.');
  const who = whoami(profile);
  await setDoc(
    doc(db, ASSETS, docId),
    { archived: false, archiveReason: '', ...stampFields(who) },
    { merge: true }
  );
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: `إرجاعٌ إلى الجرد: ${v.reason}`,
    kind: 'restore',
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
}

/**
 * يستورد صفوفَ الإكسل **ولا يدهس ما سُجِّل**.
 *
 * ★★★ وهذه هي النقطةُ التي تُفسد الاستيراداتُ عندها عادةً: الشاشةُ القديمة
 * كانت تكتب فوقَ أيِّ رقمٍ قائم (`assets[idx]=rec`) — مقبولٌ في ذاكرةٍ تزول،
 * ومُهلِكٌ في قاعدةٍ تبقى. فيُقرأ ما في السحابة أوّلًا، و`planAssetImport`
 * تُقرّر، ولا يُكتب إلّا **الغائب**. وإعادتُه عمليّةٌ آمنةٌ دائمًا، وتقول كم
 * كُتب وكم تُخطّي **وبأيّ أرقام**.
 */
export async function importDepartmentAssets(rows, profile) {
  // ★ تُمرَّر السجلّاتُ كاملةً لا مفاتيحُها وحدَها: `planAssetImport` تحتاج
  // المضمونَ لتعرف صفًّا بلا رقمٍ موجودًا أصلًا ببصمته.
  const snap = await getDocs(collection(db, ASSETS));
  const plan = planAssetImport(snap.docs.map((d) => ({ id: d.id, ...d.data() })), rows);
  if (!plan.toWrite.length) return plan;

  const who = whoami(profile);
  for (let i = 0; i < plan.toWrite.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const rec of plan.toWrite.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, ASSETS, rec.key), {
        ...assetPayload(rec),
        ...birthFields(who),
        imported: true,
        ...stampFields(who),
      });
    }
    await batch.commit();
  }
  return plan;
}
