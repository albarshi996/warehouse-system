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
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { appendAudit } from './documentsService.js';
import { kindLabel, sha256Hex, dataUrlBytes } from './attachmentFile.js';

const DOCS = 'documents';
const ATT = 'attachments';
/** مرفقات البطاقات (SAP-11 · ف‑٢٨): الصنف والمورّد والعميل — مجموعةٌ عليا واحدة. */
const ENTITY_ATT = 'entity_attachments';

/** أنواع الكيانات المقبولة لمرفقات البطاقات — تطابق قاعدة Firestore حرفيًّا. */
export const ATTACHMENT_ENTITY_KINDS = ['item', 'supplier', 'customer'];

/**
 * جسم المرفق الواحد — لكلّ المواضع (SR-57): الهويّة والاسم والنوع والحجم
 * والتصنيف **والنسخة** والرافع والوقت **والبصمة**. البصمة والحجم يُحسبان هنا
 * في المكان الواحد فلا موضعَ يرفع بلا بصمة.
 */
async function attachmentBody({ kind, label = '', name = '', mime = '', dataUrl, note = '', version = 1, supersedes = null, profile }) {
  if (!dataUrl) throw new Error('لا محتوى للمرفق.');
  return {
    kind: kind || 'other',
    label: String(label || kindLabel(kind)),
    name: String(name || ''),
    mime: String(mime || ''),
    dataUrl,
    note: String(note || ''),
    // SAP-11 (ف‑٢٦ · ف‑٢٧): النسخة والسلف والبصمة والحجم — عقد SR-57.
    version: Number(version) || 1,
    supersedes: supersedes || null,
    sha256: await sha256Hex(dataUrl),
    size: dataUrlBytes(dataUrl),
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    byRole: profile?.role || '',
    at: serverTimestamp(),
  };
}

/**
 * يُرفق دليلًا بمستند. يُعيد معرّف المرفق.
 * يُثبت أثرًا في سجلّ التدقيق (من أرفق ماذا ومتى) — الرقابة تُوثَّق لا تُفترض.
 * فشل الأثر (لو لم يكن المستخدم فاعلًا مخزنيًّا) لا يُسقط الإرفاق.
 *
 * @param {string} docId
 * @param {object} p { kind, label?, name?, mime?, dataUrl, note?, version?, supersedes?, profile }
 */
export async function addAttachment(docId, payload) {
  if (!docId) throw new Error('لا مستند لإرفاق الدليل به — احفظ المستند أولًا.');
  const body = await attachmentBody(payload);
  const ref = await addDoc(collection(db, DOCS, docId, ATT), body);
  try {
    await appendAudit(docId, {
      action: 'attach',
      note: `أُرفق دليل: ${body.label}${body.name ? ` (${body.name})` : ''}${body.version > 1 ? ` — إصدار ${body.version}` : ''}`,
      profile: payload?.profile,
    });
  } catch {
    // سجلّ التدقيق قد يرفض غير الفاعل المخزنيّ — لا نُسقط الدليل لأجل أثره.
  }
  return ref.id;
}

/**
 * مرفق بطاقةٍ (ف‑٢٨ · SR-55): صنفٌ أو مورّد أو عميل — شهادة صنف، عقد مورّد،
 * سجلّ عميل… نفس الجسم ونفس نموذج الإلحاق-فقط، والتتبّع بالكيان ومعرّفه
 * (§17 ‹881›: المرفق قابل للتتبّع إلى كيانٍ أو مستندٍ محدّد).
 *
 * @param {'item'|'supplier'|'customer'} entityKind
 * @param {string} entityId كود الصنف أو رمز الطرف
 */
export async function addEntityAttachment(entityKind, entityId, payload) {
  if (!ATTACHMENT_ENTITY_KINDS.includes(entityKind)) throw new Error(`نوع كيانٍ غير معروف: «${entityKind}»`);
  const id = String(entityId ?? '').trim().toUpperCase();
  if (!id) throw new Error('لا كيان لإرفاق الملفّ به.');
  const body = await attachmentBody(payload);
  const ref = await addDoc(collection(db, ENTITY_ATT), { entityKind, entityId: id, ...body });
  return ref.id;
}

/**
 * يستمع لمرفقات بطاقةٍ لحظيًّا. الترتيب محلّيًّا بوقت الإرفاق — شرطا التساوي
 * لا يحتاجان فهرسًا مركّبًا، وإضافة orderBy كانت ستحتاجه.
 */
export function listenEntityAttachments(entityKind, entityId, callback) {
  const id = String(entityId ?? '').trim().toUpperCase();
  if (!ATTACHMENT_ENTITY_KINDS.includes(entityKind) || !id) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, ENTITY_ATT),
    where('entityKind', '==', entityKind),
    where('entityId', '==', id)
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
    callback(rows);
  });
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
