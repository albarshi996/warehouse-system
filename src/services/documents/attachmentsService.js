/**
 * مرفقات المستند — الأدلّة الماديّة (فاتورة مورّد · توقيع مندوب · صورة بضاعة).
 *
 * البنية:  documents/{docId}/attachments/{attId}
 * نمط **ملحق-فقط** كسجلّ التدقيق و`scans`: يُضاف ولا يُعدَّل ولا يُحذف. الدليل
 * الذي يُمحى ليس دليلًا. كلٌّ مستندٌ مستقلّ فلا يتضخّم رأس المستند ولا يُجمَّد.
 *
 * لماذا مجموعة فرعية لا حقل في الرأس؟ لأن قاعدة الأمان تمنع تغيير `header` بعد
 * الإرسال — ومندوب المورّد يوقّع **عند التسليم**، بعد الإرسال بمدّة. لو كان
 * المرفق في الرأس لاستحال إرفاقه في وقته. المجموعة الفرعية حرّة من هذا القيد.
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
import { kindLabel } from './attachmentFile.js';

const DOCS = 'documents';
const ATT = 'attachments';

/**
 * يُرفق دليلًا بمستند. يُعيد معرّف المرفق.
 * يُثبت أثرًا في سجلّ التدقيق (من أرفق ماذا ومتى) — الرقابة تُوثَّق لا تُفترض.
 * فشل الأثر (لو لم يكن المستخدم فاعلًا مخزنيًّا) لا يُسقط الإرفاق.
 *
 * @param {string} docId
 * @param {object} p { kind, label?, name?, mime?, dataUrl, note?, profile }
 */
export async function addAttachment(docId, { kind, label = '', name = '', mime = '', dataUrl, note = '', profile }) {
  if (!docId) throw new Error('لا مستند لإرفاق الدليل به — احفظ المستند أولًا.');
  if (!dataUrl) throw new Error('لا محتوى للمرفق.');
  const ref = await addDoc(collection(db, DOCS, docId, ATT), {
    kind: kind || 'other',
    label: String(label || kindLabel(kind)),
    name: String(name || ''),
    mime: String(mime || ''),
    dataUrl,
    note: String(note || ''),
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    byRole: profile?.role || '',
    at: serverTimestamp(),
  });
  try {
    await appendAudit(docId, {
      action: 'attach',
      note: `أُرفق دليل: ${label || kindLabel(kind)}${name ? ` (${name})` : ''}`,
      profile,
    });
  } catch {
    // سجلّ التدقيق قد يرفض غير الفاعل المخزنيّ — لا نُسقط الدليل لأجل أثره.
  }
  return ref.id;
}

/** يستمع لمرفقات المستند (الأقدم أولًا — بترتيب إرفاقها). */
export function listenAttachments(docId, callback) {
  if (!docId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, DOCS, docId, ATT), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
