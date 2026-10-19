/**
 * جرد مخزن فينسيا في السحابة — `warehouse_assets/{المجموعة-الرقم}`.
 *
 * ═══ ولماذا مجموعةٌ جديدةٌ لا `assets` القائمة؟ ═══
 * `assets` مجموعةُ **الصيانة**: يكتبها `maintenanceService` ويقرأها أمرُ
 * الشغل، وقاعدتُها `isFleetWriter` أي دورُ الحركة. وإقحامُ خشبِ الباركي
 * وأكياسِ الإسمنت فيها يُفسد أوامرَ الشغل كما كان إقحامُ الطبالي يُفسد
 * `stock_moves` — وهي بيّنةٌ قائمةٌ في `firestore.rules` نفسِها. فمجموعةٌ
 * ثانيةٌ بحقل `warehouse`، تتوسّع غدًا لطرابلس والرحبة بلا شاشةٍ جديدة.
 *
 * ═══ ★★★ والاستعلامُ بشرطٍ واحدٍ عن قصد ═══
 * `where('warehouse','==',…)` وحدَه بلا `orderBy` — فجمعُهما يطلب فهرسًا
 * مركَّبًا، والفهرسُ **يُنشَر من Firebase Console** ولا يملكه الوكيل. فشاشةٌ
 * تُبنى على فهرسٍ لم يُنشَر تعمل عند من بناها وتسقط عند المالك بـ
 * `failed-precondition`. والترتيبُ في الشاشة — ومئةُ سجلٍّ لا تُحسّ.
 *
 * ═══ والملاحظاتُ ملحقةٌ-فقط ═══
 * `warehouse_assets/{id}/notes/{noteId}` — لا تعديلَ ولا حذف، كالمجموعات
 * المقدّسة. فمن كتب «١ عند سراج» يبقى قولُه بتاريخه واسمه، ومن خالفه يكتب
 * سطرًا ثانيًا. وحقلُ `notes` في الأصل يبقى **آخرَ ملاحظةٍ سارية** للعرض
 * في الجدول، والسجلُّ هو الذاكرة.
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
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { assetPhotoPatch } from './veneciaPhotos.js';
import {
  VENECIA_WAREHOUSE,
  assetDocId,
  assetVerdict,
  populationAssetType,
  rawQty,
  signedText,
} from './veneciaModel.js';

const ASSETS = 'warehouse_assets';
const NOTES = 'notes';

/** حدُّ الدفعة في Firestore ٥٠٠ عمليّة — والبذرةُ ١٠٤، فدفعتان بأمان. */
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
 * يستمع لجرد فينسيا كلِّه (المكهَّنُ ضمنَه — التصفيةُ في الشاشة).
 * يُعيد `(assets, pending)` حيث `pending` كتابةٌ لم تصل الخادمَ بعد.
 */
export function listenVeneciaAssets(callback, onError) {
  const q = query(collection(db, ASSETS), where('warehouse', '==', VENECIA_WAREHOUSE));
  return onSnapshot(
    q,
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

/** الحقولُ التي يملكها المستخدم — وما سواها يُحسب أو يُختم هنا. */
function assetPayload(record) {
  return {
    id: String(record.id || '').trim(),
    population: String(record.population || '').trim(),
    assetType: populationAssetType(record.population),
    assetName: String(record.assetName || '').trim(),
    brand: String(record.brand || '').trim(),
    serial: String(record.serial || '').trim(),
    qty: rawQty(record.qty),
    condition: String(record.condition || '').trim(),
    responsible: String(record.responsible || '').trim(),
    department: String(record.department || 'مخزن فينسيا').trim(),
    section: String(record.section || '').trim(),
    location: String(record.location || VENECIA_WAREHOUSE).trim(),
    receivedDate: String(record.receivedDate || '').trim(),
    notes: String(record.notes || '').trim(),
    warehouse: VENECIA_WAREHOUSE,
  };
}

/**
 * يُنشئ أصلًا أو يُعدّله. ويرفض الناقصَ بحكم `assetVerdict` **قبل** أن
 * يلمس السحابة — فالتحقّقُ في المنطق الخالص المختبَر لا في الشاشة وحدَها.
 *
 * و`mode`: `'create'` يمنع الكتابةَ فوق أصلٍ قائم (فرقمٌ مكرَّرٌ يُقال ولا
 * يُدهس صامتًا — عطبُ «١٣ مستندًا بأرقامٍ مكرَّرة» الذي كشفته الهجرة)،
 * و`'edit'` يطلب وجودَه.
 */
export async function saveVeneciaAsset(record, profile, { mode = 'create' } = {}) {
  const verdict = assetVerdict(record);
  if (!verdict.ok) {
    const err = new Error('الأصل ناقص:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const docId = assetDocId(record.population, record.id);
  const ref = doc(db, ASSETS, docId);
  const snap = await getDoc(ref);
  if (mode === 'create' && snap.exists()) {
    throw new Error(`الرقم ${record.id} مستعملٌ في «${record.population === 'issue' ? 'بضاعة الصرف' : 'أصول المدعوم'}» — اختر رقمًا آخر.`);
  }
  if (mode === 'edit' && !snap.exists()) throw new Error('الأصل غير موجود — لعلّه حُدِّث من جهازٍ آخر.');

  const who = whoami(profile);
  const payload = assetPayload(record);
  await setDoc(
    ref,
    snap.exists()
      ? { ...payload, updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid }
      : {
          ...payload,
          archived: false,
          archiveReason: '',
          countedQty: null,
          countedAt: '',
          countedBy: '',
          createdAt: serverTimestamp(),
          createdBy: who.byName,
          createdByUid: who.byUid,
          updatedAt: serverTimestamp(),
          updatedBy: who.byName,
          updatedByUid: who.byUid,
        },
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
  await setDoc(
    doc(db, ASSETS, docId),
    { notes: body, updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid },
    { merge: true }
  );
}

/**
 * يُقيّد عدَّ الجرد. و`countedQty` صفرٌ **عدٌّ صحيح** لا غياب — فالمفقودُ
 * يُقيَّد صفرًا ويظهر فرقُه، ولا يُترك «لم يُجرَد قطّ».
 *
 * ويُلحِق سطرًا في سجلّ الملاحظات بالفرق: الجردُ حدثٌ يُؤرَّخ بمن عدَّ
 * ومتى، فإن عاد أحدٌ فسأل «من قال إنّها ثلاث؟» وجد الجواب.
 */
export async function recordAssetCount(docId, countedQty, profile, { note = '' } = {}) {
  const n = Number(countedQty);
  if (!Number.isFinite(n) || n < 0) throw new Error('الكمّيّة المعدودة رقمٌ غير سالب.');
  const ref = doc(db, ASSETS, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الأصل غير موجود.');
  const who = whoami(profile);
  const day = todayLocal();
  const variance = n - rawQty(snap.data().qty);
  await setDoc(
    ref,
    {
      countedQty: n,
      countedAt: day,
      countedBy: who.byName,
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      updatedByUid: who.byUid,
    },
    { merge: true }
  );
  const line =
    `جردٌ: المعدود ${n} · المسجَّل ${rawQty(snap.data().qty)} · الفرق ${signedText(variance)}` +
    (note ? ` — ${String(note).trim()}` : '');
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: line,
    kind: 'count',
    at: serverTimestamp(),
    day,
    byUid: who.byUid,
    byName: who.byName,
  });
  return { variance };
}

/**
 * يُسوّي المسجَّلَ على المعدود — بعد أن يُقرّ المسؤولُ الفرق.
 * خطوتان لا خطوة: العدُّ يُثبت ما رآه، والتسويةُ قرارٌ بأنّ ما رآه هو الحقّ.
 */
export async function settleAssetCount(docId, profile, { reason = '' } = {}) {
  const ref = doc(db, ASSETS, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الأصل غير موجود.');
  const data = snap.data();
  const counted = data.countedQty;
  if (counted === null || counted === undefined || counted === '') {
    throw new Error('لا عدَّ ليُسوَّى — اجرد الأصلَ أوّلًا.');
  }
  const was = rawQty(data.qty);
  const now = rawQty(counted);
  if (was === now) throw new Error('لا فرقَ ليُسوَّى.');
  const who = whoami(profile);
  await setDoc(
    ref,
    { qty: now, updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid },
    { merge: true }
  );
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text:
      `تسويةُ جرد: المسجَّل ${was} ← ${now}` + (reason ? ` — ${String(reason).trim()}` : ''),
    kind: 'settle',
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
  return { from: was, to: now };
}

/**
 * يُكهِّن أصلًا بسببٍ مكتوب — **بدلًا من الحذف**، وقاعدةُ الأمن تمنع الحذفَ
 * أصلًا. فرقمُ الأصل مطبوعٌ على شيءٍ كان في المخزن، ومحوُه يجعل الجردَ
 * القديمَ يذكر ما لا وجودَ له.
 */
export async function archiveVeneciaAsset(docId, reason, profile) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('التكهين يحتاج سببًا مكتوبًا.');
  const who = whoami(profile);
  await setDoc(
    doc(db, ASSETS, docId),
    {
      archived: true,
      archiveReason: why,
      archivedAt: serverTimestamp(),
      archivedBy: who.byName,
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      updatedByUid: who.byUid,
    },
    { merge: true }
  );
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: `تكهينٌ: ${why}`,
    kind: 'archive',
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
}

/** يُعيد مكهَّنًا إلى الجرد — والسببُ يُسجَّل كذلك. */
export async function restoreVeneciaAsset(docId, reason, profile) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('الإرجاع يحتاج سببًا مكتوبًا.');
  const who = whoami(profile);
  await setDoc(
    doc(db, ASSETS, docId),
    {
      archived: false,
      archiveReason: '',
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      updatedByUid: who.byUid,
    },
    { merge: true }
  );
  await addDoc(collection(db, ASSETS, docId, NOTES), {
    text: `إرجاعٌ إلى الجرد: ${why}`,
    kind: 'restore',
    at: serverTimestamp(),
    day: todayLocal(),
    byUid: who.byUid,
    byName: who.byName,
  });
}

/**
 * يستورد بذرةَ الجرد الأوّل **مرّةً واحدة ولا يدهس شيئًا**.
 *
 * ★★★ وهذه هي النقطةُ التي تُفسد الاستيراداتُ عندها عادةً: استيرادٌ يُعاد
 * يكتب فوق ما جرَدَه الموظّفون فيمحو عملَ يومٍ كامل. فيُقرأ ما في السحابة
 * أوّلًا، ولا يُكتب إلّا **الغائب**. وإعادتُه عمليّةٌ آمنةٌ دائمًا
 * (idempotent)، وتقول كم كتبت وكم تخطّت.
 */
export async function importVeneciaSeed(seedAssets, profile) {
  const rows = (seedAssets ?? []).filter((a) => assetVerdict(a).ok);
  if (!rows.length) throw new Error('البذرة فارغةٌ أو غيرُ صالحة.');

  const snap = await getDocs(
    query(collection(db, ASSETS), where('warehouse', '==', VENECIA_WAREHOUSE))
  );
  const present = new Set(snap.docs.map((d) => d.id));
  const missing = rows.filter((a) => !present.has(assetDocId(a.population, a.id)));
  if (!missing.length) return { written: 0, skipped: rows.length };

  const who = whoami(profile);
  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const a of missing.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, ASSETS, assetDocId(a.population, a.id)), {
        ...assetPayload(a),
        archived: false,
        archiveReason: '',
        countedQty: null,
        countedAt: '',
        countedBy: '',
        seeded: true,
        createdAt: serverTimestamp(),
        createdBy: who.byName,
        createdByUid: who.byUid,
        updatedAt: serverTimestamp(),
        updatedBy: who.byName,
        updatedByUid: who.byUid,
      });
    }
    await batch.commit();
  }
  return { written: missing.length, skipped: rows.length - missing.length };
}

/**
 * يُحدّث **بصمةَ الصور** على سجلّ الأصل: مصغَّرةٌ صغيرةٌ جدًّا وعددٌ.
 *
 * ★★★ وهذا الحقلان وحدَهما ما يسكن السجلّ من أمر الصور — والصورُ كلُّها في
 * `entity_attachments` لا تُقرأ إلّا عند فتح لوح الأصل. فاللوحةُ تستمع إلى
 * الأصول كلِّها باستمرار، وصورةٌ على السجلّ تُنزَّل في كلّ لقطةٍ لكلّ
 * مستخدم. والمصغَّرةُ محروسةٌ بـ`assetPhotoPatch`: ما تجاوز ثمانيةَ
 * كيلوبايت يُكتب فراغًا ولا يُخزَّن.
 */
export async function setAssetPhotoBadge(docId, { photos, thumbDataUrl = '' }, profile) {
  const who = whoami(profile);
  const patch = assetPhotoPatch(photos, thumbDataUrl);
  await setDoc(
    doc(db, ASSETS, docId),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: who.byName, updatedByUid: who.byUid },
    { merge: true }
  );
  return patch;
}
