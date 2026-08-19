/**
 * الأرشيف الدوريّ في السحابة — الرفع الحيّ ودورة حياة الوثيقة.
 *
 * البنية: `archive_documents/{id}` بمعرّف Firestore تلقائيّ، وتحته
 * `versions/{versionId}` لقطاتُ ما قبل كلّ تعديل.
 *
 * ── أين يُحفظ الملفّ؟ مساران يقرّرهما الحجم لا المستخدم ──
 *   · `inline`  — حمولة base64 داخل الوثيقة نفسها (لا Storage، ولا طلبَ
 *     شبكةٍ ثانٍ: تصل مع اللقطة الحيّة). هذا مسار الصغير.
 *   · `storage` — يُرفع إلى Firebase Storage ويُحفظ رابطه في `storageUrl`.
 *     يُرفع **قبل** كتابة الوثيقة ليكون المعرّف معروفًا، فإن فشلت الكتابة
 *     نُظِّف الملفّ المرفوع فلا تبقى بايتاتٌ يتيمة تأكل الحصّة.
 *
 * ── الحوكمة (تُطابق `firestore.rules`) ──
 *   · الكتابة للمديرَين · **لا حذف** (أرشفة لا محو).
 *   · `refNumber` لا يتغيّر بعد كتابته (كنمط الرقم في المستندات).
 *   · `versions` **ملحق-فقط**: لا تعديل ولا حذف — التاريخ لا يُزوَّر.
 *   · `tracking` سطرٌ لكلّ عملية، بوقتٍ نصّيّ (المصفوفات لا تقبل طوابع الخادم).
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { trackEntry, STORED_STATUSES, CONFIDENTIALITY } from './archiveModel.js';
import { uploadArchiveFile, deleteOrphanFile } from './archiveStorageService.js';

const COL = 'archive_documents';

/**
 * لحظةُ الآن نصًّا. الساعة تُقرأ هنا — في طبقةٍ تمسّ الشبكة — لا في
 * `archiveModel.js` الخالص الذي يُمرَّر إليه الوقت ولا يسأل عنه.
 */
function nowISO() {
  return new Date().toISOString();
}
const VERSIONS = 'versions';

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
 * يقرأ إصدارات وثيقةٍ بعينها (الأحدث أوّلًا). قراءةٌ لمرّةٍ لا اشتراكٌ دائم:
 * لا تُفتح إلّا حين يفتح المستخدم تبويب «الإصدارات».
 */
export async function fetchArchiveVersions(id) {
  const snap = await getDocs(
    query(collection(db, COL, id, VERSIONS), orderBy('savedAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** الحقول الوصفيّة كما تُكتب — تُنقّى هنا فلا يصل للقاعدة ما لا نعرفه. */
function cleanFields(fields = {}) {
  return {
    category: fields.category === 'minutes' ? 'minutes' : 'report',
    title: String(fields.title || '').trim(),
    date: fields.date || '',
    period: String(fields.period || '').trim(),
    note: String(fields.note || '').trim(),
    format: fields.format || 'pdf',
    fileName: String(fields.fileName || '').trim(),
    primary: Boolean(fields.primary),
    // ── دورة الحياة ──
    type: String(fields.type || '').trim(),
    status: STORED_STATUSES[fields.status] ? fields.status : 'active',
    confidential: CONFIDENTIALITY[fields.confidential] ? fields.confidential : 'public',
    expiry: fields.expiry || '',
    keywords: String(fields.keywords || '').trim(),
    ocrText: String(fields.ocrText || '').trim(),
    dept: String(fields.dept || '').trim(),
    section: String(fields.section || '').trim(),
    project: String(fields.project || '').trim(),
    issuer: String(fields.issuer || '').trim(),
    client: String(fields.client || '').trim(),
  };
}

/**
 * يرفع وثيقةً جديدة إلى الأرشيف.
 *
 * `payload` يصف الحمولة ومسارها:
 *   { route:'inline',  fileData }          — dataURL يُكتب داخل الوثيقة.
 *   { route:'storage', file, onProgress? } — ملفٌّ يُرفع إلى Storage أوّلًا.
 *
 * يُعيد الوثيقة كما كُتبت (بمعرّفها). يرمي خطأً مترجَمًا عند فشل الرفع.
 */
export async function addArchiveDoc(fields, payload, profile) {
  const refNew = doc(collection(db, COL));
  const who = whoami(profile);
  const isStorage = payload?.route === 'storage';

  let uploaded = null;
  if (isStorage) {
    if (!payload.file) throw new Error('لا ملفّ للرفع.');
    uploaded = await uploadArchiveFile(refNew.id, payload.file, payload.onProgress);
  }

  const body = {
    ...cleanFields(fields),
    refNumber: String(fields.refNumber || '').trim(),
    fileData: isStorage ? null : payload?.fileData || null,
    storageUrl: uploaded ? uploaded.storageUrl : null,
    storagePath: uploaded ? uploaded.storagePath : null,
    fileSize: uploaded ? uploaded.size : null,
    versionCount: 0,
    approvedBy: '',
    approvedDate: '',
    tracking: [trackEntry('إضافة', who.byName, nowISO())],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...who,
  };

  try {
    await setDoc(refNew, body);
  } catch (err) {
    // فشلت كتابة السجلّ بعد نجاح الرفع — ننظّف البايتات فلا تبقى يتيمة.
    if (uploaded) await deleteOrphanFile(uploaded.storagePath);
    throw err;
  }
  return { id: refNew.id, ...body };
}

/**
 * يُحدّث البيانات الوصفيّة لوثيقةٍ مرفوعة (لا الملفّ).
 *
 * قبل الكتابة تُحفظ **لقطةُ ما قبل التعديل** في `versions` — فلا يضيع نصٌّ
 * صُحِّح ولا تاريخٌ عُدِّل. `prev` هي الوثيقة كما كانت (تمرّرها الشاشة من
 * لقطتها الحيّة فلا نحتاج قراءةً إضافية).
 *
 * الرقم الإشاريّ لا يُرسَل إن كان مكتوبًا — القاعدة تمنع تغييره، وإرساله
 * كما هو يمرّ لكنّ إسقاطه أوضح في النيّة.
 */
export async function updateArchiveDoc(id, changes, profile, prev = null) {
  const who = whoami(profile);

  if (prev) {
    // معرّفٌ تلقائيّ لا `v1`/`v2`: لو حرّر مديران معًا لتصادم المعرّف المرقَّم،
    // وقاعدةُ «لا تعديل» كانت سترفض الثاني فتُعطِّل تحريره بلا سبب.
    await setDoc(doc(collection(db, COL, id, VERSIONS)), {
      version: (prev.versionCount || 0) + 1,
      snapshot: snapshotOf(prev),
      savedAt: serverTimestamp(),
      ...who,
    });
  }

  const patch = { ...changes };
  if (prev?.refNumber) delete patch.refNumber;

  await setDoc(
    doc(db, COL, id),
    {
      ...patch,
      ...(prev ? { versionCount: increment(1) } : {}),
      tracking: arrayUnion(trackEntry('تعديل', who.byName, nowISO())),
      updatedAt: serverTimestamp(),
      ...who,
    },
    { merge: true }
  );
}

/**
 * يعتمد الوثيقة: الحالة `approved` مع اسم المعتمِد وتاريخه.
 * الاعتماد لا يُلغي الانتهاء — وثيقةٌ معتمدةٌ مضى أجلها تُعرض «منتهية»
 * (الحساب في `docStatus`)، فلا يخدع الاعتمادُ قارئَ الشاشة.
 */
export async function approveArchiveDoc(id, profile) {
  const who = whoami(profile);
  await setDoc(
    doc(db, COL, id),
    {
      status: 'approved',
      approvedBy: who.byName,
      approvedDate: new Date().toISOString().slice(0, 10),
      tracking: arrayUnion(trackEntry('اعتماد', who.byName, nowISO())),
      updatedAt: serverTimestamp(),
      ...who,
    },
    { merge: true }
  );
}

/**
 * اللقطة المحفوظة في الإصدار — الحقول الوصفيّة وحدها **بلا الحمولة**:
 * نسخُ base64 في كلّ إصدارٍ كان سيُفجّر حجم المجموعة الفرعية بلا فائدة،
 * والملفّ نفسه لا يتغيّر بالتعديل (التعديل وصفيٌّ لا استبدالُ ملفّ).
 */
function snapshotOf(prev = {}) {
  const {
    fileData: _fileData,
    tracking: _tracking,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = prev;
  return rest;
}
