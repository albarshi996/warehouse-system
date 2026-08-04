/**
 * الأرشيف الدوريّ في السحابة — الرفع الحيّ (في أيّ وقت).
 *
 * البنية: `archive_documents/{id}` بمعرّف Firestore تلقائيّ. تُخزَّن البيانات
 * الوصفيّة + حمولة الملفّ base64 (نصّ HTML أو PDF/صورة) داخل الوثيقة نفسها —
 * نفس قرار السِّير والمرفقات (لا Storage)، فيبقى الأرشيف يعمل بلا خطّة مدفوعة.
 * حقل `storageUrl` محجوزٌ فارغًا كمسار ترقية للملفّات الكبيرة لاحقًا.
 *
 * الحوكمة (تُطابق `firestore.rules`): الكتابة للمديرَين · لا حذف (أرشفة لا محو) ·
 * الرقم الإشاريّ `refNumber` **لا يتغيّر بعد كتابته** (كنمط الرقم في المستندات).
 */
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const COL = 'archive_documents';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لكل الوثائق المرفوعة ويُعيدها خريطةً بالمعرّف — جاهزةً للدمج مع البذرة. */
export function listenArchive(callback) {
  return onSnapshot(collection(db, COL), (snap) => {
    const byId = {};
    snap.docs.forEach((d) => {
      byId[d.id] = { id: d.id, ...d.data() };
    });
    callback(byId, snap.metadata.hasPendingWrites);
  });
}

/**
 * يرفع وثيقةً جديدة إلى الأرشيف. `fields` بياناتها الوصفيّة، و`fileData` حمولة
 * الملفّ (dataURL). يُسنَد معرّف Firestore جديد ويُعاد.
 */
export async function addArchiveDoc(fields, fileData, profile) {
  const refNew = doc(collection(db, COL));
  const body = {
    category: fields.category === 'minutes' ? 'minutes' : 'report',
    title: String(fields.title || '').trim(),
    refNumber: String(fields.refNumber || '').trim(),
    date: fields.date || '',
    period: String(fields.period || '').trim(),
    note: String(fields.note || '').trim(),
    format: fields.format || 'pdf',
    fileName: String(fields.fileName || '').trim(),
    fileData: fileData || null,
    // مسار ترقية Storage للملفّات الكبيرة — محجوزٌ فارغًا اليوم.
    storageUrl: null,
    primary: Boolean(fields.primary),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  };
  await setDoc(refNew, body);
  return { id: refNew.id, ...body };
}

/**
 * يُحدّث البيانات الوصفيّة لوثيقةٍ مرفوعة (لا الملفّ). `merge:true` فلا يمحو
 * الحمولة. الرقم الإشاريّ لا يُرسَل إن كان مكتوبًا (القاعدة تمنع تغييره).
 */
export async function updateArchiveDoc(id, changes, profile) {
  await setDoc(
    doc(db, COL, id),
    { ...changes, updatedAt: serverTimestamp(), ...whoami(profile) },
    { merge: true }
  );
}
