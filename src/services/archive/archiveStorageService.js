/**
 * مخزن مرفقات الأرشيف الكبيرة — Firebase Storage.
 *
 * الملفّ الصغير يبقى داخل وثيقة Firestore كما كان (يعمل بلا خطّةٍ مدفوعة)،
 * وهذه الطبقة للكبير وحده: ترفعه إلى `archive/{docId}/{اسم الملفّ}` وتُعيد
 * رابط تنزيلٍ دائمًا يُحفظ في حقل `storageUrl` المحجوز أصلًا في النموذج.
 *
 * ── لماذا الاستيراد كسولٌ (dynamic import)؟ ──
 * `firebase/storage` حزمةٌ لا تحتاجها إلّا هذه الشاشة عند رفع ملفٍّ كبير.
 * استيرادها من `config/firebase.js` كان سيُضيفها إلى **كلّ** صفحةٍ في البوابة
 * (فكلّها تستورد ذاك الملفّ). فتُحمَّل هنا عند أوّل رفعٍ فعليّ لا قبله.
 *
 * ── إن لم تكن Storage مفعّلة ──
 * لا ينهار شيء: الرفع الصغير يظلّ يعمل، والكبير يردّ رسالةً صريحة تقول ما
 * يجب فعله. `storageErrorMessage` تترجم أخطاء Firebase إلى جملةٍ عربيّة
 * واحدة بدل شفرةٍ لاتينيّة لا تعني للمستخدم شيئًا.
 */
import { getApp } from 'firebase/app';
import { auth } from '../../config/firebase.js';
import { safeFileName } from './archiveFile.js';

/** جذر مرفقات الأرشيف داخل المخزن — تُبنى عليه قواعد `storage.rules`. */
export const ARCHIVE_STORAGE_ROOT = 'archive';

/** مفتاح الملفّ: مجلّدٌ لكلّ وثيقة فلا يتصادم اسمان متطابقان لوثيقتين. */
export function storagePathFor(docId, fileName) {
  return `${ARCHIVE_STORAGE_ROOT}/${docId}/${safeFileName(fileName)}`;
}

let storageModule = null;

/** يحمّل `firebase/storage` مرّةً واحدة عند الحاجة. */
async function loadStorage() {
  if (!storageModule) storageModule = await import('firebase/storage');
  return storageModule;
}

/** يترجم خطأ Firebase Storage إلى جملةٍ عربيّة تقول ما العمل. */
export function storageErrorMessage(err) {
  const code = String(err?.code || '');
  if (code === 'storage/unauthorized') {
    return 'القاعدة منعت الرفع — الرفع للمديرَين فقط.';
  }
  if (code === 'storage/unauthenticated') {
    return 'انتهت الجلسة — سجّل الدخول ثمّ أعد الرفع.';
  }
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
    return 'انقطع الرفع — تحقّق من الاتصال وأعد المحاولة.';
  }
  if (code === 'storage/quota-exceeded') {
    return 'امتلأت حصّة المخزن — راجع خطّة Firebase.';
  }
  if (code === 'storage/unknown' || code === 'storage/project-not-found') {
    return 'مخزن الملفّات (Storage) غير مفعَّل لهذا المشروع — فعّله من Firebase Console، أو ارفع نسخةً أصغر تُحفظ داخل الوثيقة.';
  }
  return `تعذّر الرفع إلى المخزن: ${err?.message || 'سببٌ غير معروف'}`;
}

/**
 * يرفع ملفًّا كبيرًا ويُعيد `{ storagePath, storageUrl, size, contentType }`.
 * `onProgress` تُستدعى بنسبةٍ من ٠ إلى ١٠٠ لتحريك شريط التقدّم.
 * يرمي خطأً مترجَمًا (`storageErrorMessage`) فتعرضه الشاشة كما هو.
 */
export async function uploadArchiveFile(docId, file, onProgress) {
  const uploaderUid = auth?.currentUser?.uid;
  if (!uploaderUid) throw new Error('انتهت الجلسة — سجّل الدخول ثمّ أعد الرفع.');

  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await loadStorage();
  const storage = getStorage(getApp());
  const path = storagePathFor(docId, file.name);
  // `uploaderUid` ليس زينةً: قاعدة `storage.rules` تشترطه للإنشاء، وتقصر
  // تنظيف الرفع الفاشل على صاحبه وحده.
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: { uploaderUid },
  });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (typeof onProgress === 'function' && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(new Error(storageErrorMessage(err))),
      resolve
    );
  });

  return {
    storagePath: path,
    storageUrl: await getDownloadURL(task.snapshot.ref),
    size: file.size,
    contentType: file.type || '',
  };
}

/**
 * يحذف ملفًّا من المخزن — يُستدعى **فقط** لتنظيف رفعٍ فشلت كتابة وثيقته،
 * فلا يبقى ملفٌّ يتيمٌ يستهلك الحصّة. الأرشيف نفسه لا يُحذف منه شيء.
 */
export async function deleteOrphanFile(path) {
  try {
    const { getStorage, ref, deleteObject } = await loadStorage();
    await deleteObject(ref(getStorage(getApp()), path));
    return true;
  } catch {
    return false;
  }
}
