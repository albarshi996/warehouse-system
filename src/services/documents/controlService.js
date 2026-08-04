/**
 * خدمة الرقابة/المطابقة — كتابة قيود «أداة المقارنة» وقراءتها لحظيًّا.
 *
 * البنية:  documents/{docId}/control/{recId}
 * نمط **ملحق-فقط** كالمرفقات وسجلّ التدقيق: قيدُ المطابقة يُضاف ولا يُعدَّل ولا
 * يُحذف. من طابق ومتى وبأيّ نتيجة يبقى أثرًا — إعادةُ المطابقة قيدٌ جديد لا محو
 * للسابق. أحدث قيدٍ هو الحالة الحاليّة (انظر `reconciliationVerdict`).
 *
 * حارس منطقيّ: المطابقة السلبية (`mismatch`) تُلزِم بوجه الاختلاف — كما يُلزِم
 * الرفضُ بسببٍ في آلة الحالات. مطابقةٌ سلبيّة بلا سببٍ لا تُوثَّق.
 */
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { appendAudit } from './documentsService.js';

const DOCS = 'documents';
const CTRL = 'control';

/**
 * يسجّل قيد مطابقة. يُعيد معرّفه.
 * @param {string} docId
 * @param {object} p { result: 'matched'|'mismatch', checklist?, note?, compared?, profile }
 */
export async function addReconciliation(docId, { result, checklist = {}, note = '', compared = [], profile }) {
  if (!docId) throw new Error('لا مستند للمطابقة — احفظ المستند أولًا.');
  if (result !== 'matched' && result !== 'mismatch') {
    throw new Error('نتيجة المطابقة يجب أن تكون «مطابق» أو «يوجد اختلاف».');
  }
  if (result === 'mismatch' && !String(note).trim()) {
    throw new Error('اكتب وجه الاختلاف — المطابقة السلبية بلا سبب لا تُوثَّق.');
  }
  const ref = await addDoc(collection(db, DOCS, docId, CTRL), {
    result,
    checklist: checklist || {},
    note: String(note || ''),
    compared: compared || [],
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    byRole: profile?.role || '',
    at: serverTimestamp(),
  });
  try {
    await appendAudit(docId, {
      action: 'reconcile',
      note: `مطابقة: ${result === 'matched' ? 'مطابق' : 'يوجد اختلاف'}${note ? ` — ${note}` : ''}`,
      profile,
    });
  } catch {
    // سجلّ التدقيق قد يرفض غير الفاعل المخزنيّ — لا نُسقط قيد المطابقة لأجل أثره.
  }
  return ref.id;
}

/** يستمع لقيود المطابقة (الأقدم أولًا — الأحدث يحكم الحالة). */
export function listenReconciliations(docId, callback) {
  if (!docId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, DOCS, docId, CTRL), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
