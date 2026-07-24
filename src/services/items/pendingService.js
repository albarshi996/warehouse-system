/**
 * الأصناف المعلّقة في السحابة (I-د).
 *
 * البنية: `Items_Pending/{باركود مطبَّع}` — معرّف **حتميّ** لا عشوائي، فمسحُ
 * الباركود المجهول عشر مرّات يُحدّث سجلًّا واحدًا ويزيد عدّاده بدل أن يُخلّف
 * عشرة سجلّات متطابقة.
 *
 * دورة الحياة: يُسجَّل عند المسح (أي مصادق يكتب — الماسح موظّف ميداني)،
 * ويبتّ فيه المدير وحده: **اعتماد** يكتب الصنف في `Items_Master` ويقفل
 * السجلّ، أو **رفض بسبب**. ولا حذف — السجلّ المرفوض يبقى أثرًا يمنع
 * إعادة السؤال عن الباركود نفسه كل جلسة.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { upsertItems } from '../itemService.js';
import {
  pendingId,
  newSighting,
  repeatPatch,
  approvalVerdict,
  rejectionVerdict,
  toMasterItem,
} from './pendingModel.js';

const COL = 'Items_Pending';

const ref = (id) => doc(db, COL, id);

function whoami(profile) {
  return {
    uid: auth?.currentUser?.uid || null,
    name: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/**
 * يسجّل مشاهدة باركود مجهول. لا يوقف عمل الماسح ولا يلوّث الماستر.
 *
 * أوّل مشاهدة تُنشئ السجلّ؛ وما بعدها يزيد `seenCount` **بالخادم**
 * (`increment`) لا بقيمة محسوبة محليًّا — فمسحان متزامنان من جهازين لا
 * يدهس أحدهما عدّ الآخر.
 *
 * @returns {Promise<{created:boolean, id:string}>}
 */
export async function registerPending(input, profile) {
  const id = pendingId(input?.barcode);
  if (!id) throw new Error('لا باركود — لا يُسجَّل معلّق بلا معرّف');
  const who = whoami(profile);
  const snap = await getDoc(ref(id));

  if (!snap.exists()) {
    await setDoc(ref(id), {
      ...newSighting(input, who),
      firstSeenAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
    return { created: true, id };
  }

  // سجلّ مبتوت فيه: لا نُحييه — نكتفي بتحديث آخر مشاهدة كي يعرف المدير
  // أن الباركود المرفوض ما زال يُمسح في الميدان.
  await updateDoc(ref(id), {
    ...repeatPatch(input, who),
    seenCount: increment(1),
    lastSeenAt: serverTimestamp(),
  });
  return { created: false, id };
}

/** يستمع لكل المعلّقات لحظيًّا — شاشة المراجعة تتحدّث فور مسحٍ في الميدان. */
export function listenPending(callback, onError) {
  return onSnapshot(
    collection(db, COL),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** قراءة سجلّ واحد. */
export async function getPending(barcode) {
  const snap = await getDoc(ref(pendingId(barcode)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * اعتماد المعلّق: يكتب الصنف في الماستر أولًا، ثم يقفل السجلّ.
 *
 * الترتيب مقصود — لو فشلت كتابة الماستر بقي السجلّ معلّقًا فيُعاد المحاولة،
 * والعكس كان سيُقفل السجلّ على صنفٍ لم يُكتب فيضيع الأثران معًا.
 */
export async function approvePending(record, draft, profile) {
  const verdict = approvalVerdict(record, draft);
  if (!verdict.ok) {
    const err = new Error('لا يُعتمد:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }

  const item = toMasterItem(record, draft);
  const result = await upsertItems([item]);

  const who = whoami(profile);
  await updateDoc(ref(record.id || record.barcode), {
    state: 'approved',
    approvedSku: item.sku,
    decidedByUid: who.uid,
    decidedByName: who.name,
    decidedAt: serverTimestamp(),
  });

  return { sku: item.sku, ...result };
}

/** رفض المعلّق بسببٍ موثَّق — لا حذف، الأثر يبقى. */
export async function rejectPending(record, reason, profile) {
  const verdict = rejectionVerdict(record, reason);
  if (!verdict.ok) {
    const err = new Error('لا يُرفض:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const who = whoami(profile);
  await updateDoc(ref(record.id || record.barcode), {
    state: 'rejected',
    rejectReason: String(reason).trim(),
    decidedByUid: who.uid,
    decidedByName: who.name,
    decidedAt: serverTimestamp(),
  });
}
