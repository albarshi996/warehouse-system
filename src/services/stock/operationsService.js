/**
 * العمليات المخزنية في السحابة — الحفظ الدائم والتزامن.
 *
 * الفكرة الحاكمة: **سجلّ لا يُحذف (append-only)**.
 * كل مسح يُضاف كقيد دائم في `operations/{opId}/scans` مع هوية من مسحه ووقته.
 * التصحيح لا يمحو التاريخ — يُضاف قيد عكسي (كمية سالبة) فيبقى الأثر كاملاً.
 * هكذا لا تضيع معلومة ولا تُزوَّر.
 *
 * البنية:
 *   operations/{opId}              ← رأس العملية (النوع · من بدأها · الحالة)
 *      └── scans/{scanId}          ← قيود المسح الدائمة (مصدر الحقيقة)
 *
 * ملاحظة: Firestore يخزّن الكتابات محلياً ويرفعها تلقائياً عند عودة الإنترنت،
 * لذا يعمل المستودع بلا شبكة دون فقد أي مسح.
 */
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { generateOperationCode, normalizeOperationCode } from './operationCode.js';
import { normalizeScope } from './operationScope.js';
import { issueScanId } from './scanIdentity.js';

const OPS = 'operations';

/**
 * هوية الكاتب الحقيقية من Firebase Auth مباشرة (لا من الملف الشخصي)،
 * لأن قواعد الأمان تشترط `byUid == request.auth.uid`. الاعتماد على الملف
 * الشخصي وحده قد يسبق تحميله فيُرفض القيد.
 */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

/**
 * ينشئ عملية جديدة ويُعيد معرّفها **ورمزها القصير**.
 *
 * والرمز يُكتب هنا لا في تحديثٍ لاحق عمدًا: قاعدة `operations` تسمح بالإنشاء
 * لكلّ فاعلٍ مخزنيّ وبالتعديل للمديرين وحدهم. فلو أُجّل الرمز إلى `update`
 * لَما استطاع أمينُ مخزنٍ يفتح جردًا أن يُنتج رمزًا لفريقه — وهو أوّل من
 * يحتاجه. أمّا **تغييره** بعد ذلك فللمدير، وهذا موضعه الصحيح.
 *
 * والتفرّد يُقاس على المفتوحة وحدها: رمزٌ لجلسةٍ أُقفلت قبل شهرٍ لا يزاحم.
 *
 * ═══ والنطاق يُكتب هنا ‹CAP-201 · ج‑٤› ═══
 * `warehouse` و`zone` **يُطلبان ولا يُلزمان** (ق-٣: «لا يقطع الفريق عند
 * الجرد»): جلسةٌ بلا نطاقٍ تُفتح وتعمل كاملةً، وإنّما يُعلَن أنّ كشفها لا
 * يُثبت تغطية. والحكمُ كلُّه في `operationScope.js` الخالص — يُستدعى ولا
 * يُعاد هنا، فلا يفترق ما يُكتب عمّا يُقاس عليه لاحقًا.
 *
 * ويُكتبان **دائمًا** ولو فارغَين: حقلٌ حاضرٌ فارغٌ يُستعلَم عنه، وحقلٌ غائبٌ
 * يحتاج قراءةَ كلّ مستندٍ لمعرفة غيابه.
 *
 * @returns {{id:string, code:string, scope:object}} و`scope` يحمل `notes`
 *   ممّا أُسقط — تعرضه الشاشة ولا يمنع شيئًا.
 */
export async function createOperation({ type, profile, note = '', warehouse = '', zone = '' }) {
  let code = '';
  try {
    // ★ سباقٌ بمهلة ‹CAP-303›: `getDocs` بلا شبكةٍ قد **يتعلّق** لا أن يرتدّ
    // (خاصّةً مع `experimentalForceLongPolling`) — فيقف فتحُ الجلسة إلى الأبد.
    // وفحصُ التفرّد رفاهيةٌ، وفتحُ الجلسة ضرورة. فمن لم يُجب في ثلاث ثوانٍ
    // يُمضى بدونه — وهو ما كان يفعله فرعُ الفشل أصلًا.
    const open = await Promise.race([
      listOpenOperations(100),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    code = generateOperationCode(Math.random, { taken: open.map((o) => o.code).filter(Boolean) });
  } catch {
    // تعذّرت قراءة المفتوحة (شبكةٌ أو صلاحية) — يُولَّد بلا فحص تفرّدٍ بدل أن
    // تُمنع العملية كلّها. واحتمال التصادم في ٣٢⁶ يقبل هذه المخاطرة.
    code = generateOperationCode();
  }
  const scope = normalizeScope({ warehouse, zone });
  // ★★ المعرّف يُولَّد **محلّيًّا** ثمّ يُكتب بلا انتظار ‹CAP-303›:
  // `addDoc` تُعيد وعدًا لا يُحلّ إلّا بإقرار الخادم — فانتظارُه بلا شبكةٍ
  // يعلّق فتحَ الجلسة أبدًا. و`doc(collection(…))` يُعطي معرّفًا كاملًا بلا
  // ذهابٍ إلى الخادم، فتُفتح الجلسة فورًا ويُرفع رأسُها حين تعود الشبكة.
  const ref = doc(collection(db, OPS));
  const saved = setDoc(ref, {
    type,
    status: 'open',
    code,
    note,
    // ‹CAP-201› نطاقُ الجلسة — بادئةُ كود موقعٍ لا تمثيلٌ ثانٍ.
    warehouse: scope.warehouse,
    zone: scope.zone,
    createdByUid: currentUid(),
    createdByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    createdAt: serverTimestamp(),
    closedAt: null,
  });
  // `saved` وعدُ الإقرار — يُعاد ولا يُنتظر هنا: المستدعي يُعلّق عليه رسالةَ
  // فشلٍ (صلاحيةٌ مرفوضة مثلًا) بلا أن يحبس الشاشةَ في انتظار شبكة.
  return { id: ref.id, code, scope, saved };
}

/**
 * يُضيف قيد مسح دائم. لا يُحدَّث ولا يُحذف أبداً.
 * يُعيد وعداً — لكن Firestore يقبله محلياً فوراً حتى بلا إنترنت.
 *
 * ═══ ما يحمله القيد (CAP-103) ═══
 * الباركود **كما مُسح** والصنف الذي حُلّ إليه معًا — فالباركود ليس مفتاحًا:
 * باركودٌ قد يشير لأكثر من صنف، وصنفٌ له عدّة باركودات.
 * والكمّيّة **بوحدتها** ومعاملها والكمّيّة الأساس — «الكمّيّة بلا وحدةٍ رقمٌ
 * بلا معنى». والمعامل المجهول يُكتب `null` لا صفرًا: صفرٌ صامتٌ يُنتج مجموعًا
 * كاذبًا، و`null` تُوسم في الجدول ولا تُخفى.
 *
 * والحقول الجديدة **لا تحتاج تعديل قواعد**: قاعدة `scans` تشترط الهويّة وفتحَ
 * العمليّة الأمّ ولا تحصر الحقول — فتمرّ بلا مساس.
 */
export function appendScan(opId, { barcode, sku, name, qty, uom, factor, baseQty, uomMissing, collision, profile, opType }) {
  const numOrNull = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  // ★★ المعرّفُ يُحسب ولا يُولَّد ‹CAP-302›: `{op}-{device}-{seq}`، فالقيدُ
  // نفسُه من الجهاز نفسِه له مسارٌ واحدٌ دائمًا — وإرسالُه مرّتين يُنتج
  // مستندًا واحدًا وكمّيّةً واحدة. والحساب في `scanIdentity.js` المختبَر.
  // وبلا تخزينٍ (تصفّحٌ خاصّ) يُولَّد معرّفٌ عابرٌ ويمضي العدّ (ق-٣).
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const { id: scanId, device, seq } = issueScanId(store, opId);
  return setDoc(doc(db, OPS, opId, 'scans', scanId), {
    // هويّةُ الجهاز والتسلسل يُختمان في القيد ‹CAP-301›: يفصلان عادَّين
    // يتشاركان حسابًا، ويجعلان مصدرَ كلّ رقمٍ معروفًا في المراجعة.
    deviceId: device,
    seq,
    barcode: String(barcode || ''),
    sku: String(sku || ''),
    name: String(name || ''),
    qty: Number(qty) || 0,
    uom: String(uom || ''),
    factor: numOrNull(factor),
    baseQty: numOrNull(baseQty),
    uomMissing: Boolean(uomMissing), // ق-٢: وسمٌ يُحسم في المراجعة لا حاجزٌ عند العدّ
    collision: Boolean(collision), // CAP-106: باركودٌ تصادم وفصله العادّ بيده
    opType: opType || '',
    byUid: currentUid(),
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    at: serverTimestamp(),
  });
}

/**
 * ★★ يُعلن حضورَ صاحب الجهاز في الجلسة — «مَن دخل» لا «مَن قرأ».
 *
 * ومعرّفُ المستند **هويّةُ صاحبه**: فلا يتكرّر عضوٌ مهما دخل وخرج، والقاعدة
 * تشترط `memberUid == request.auth.uid` فلا يُعلن أحدٌ حضورَ غيره.
 *
 * و`mergeFields` لا `set` كاملًا: عودةُ العضو تُحدّث `lastEnteredAt` **ولا
 * تمحو** `joinedAt` الأوّل — فيبقى معروفًا متى دخل أوّلَ مرّة.
 *
 * ★ ولا يُنتظر إقرارُه ولا يُسقط شيئًا عند الفشل: **الحضورُ إعلانٌ لا إذن**،
 *   ومن تعذّر تسجيلُه يعدّ كما هو ويظهر عند المدير من قراءاته (ق-٣).
 */
export function announceMember(opId, profile) {
  const uid = currentUid();
  if (!opId || !uid) return Promise.resolve();
  return setDoc(
    doc(db, OPS, opId, 'members', uid),
    {
      uid,
      name: profile?.name || auth?.currentUser?.email || 'غير معروف',
      role: profile?.role || '',
      joinedAt: serverTimestamp(),
      lastEnteredAt: serverTimestamp(),
    },
    { merge: true }
  ).catch(() => {});
}

/**
 * يستمع لأعضاء الجلسة لحظيًّا — لشاشة المدير.
 *
 * ولا `orderBy`: المجموعةُ صغيرةٌ (أفرادُ لجنة)، والترتيبُ حكمٌ خالصٌ في
 * `sessionPresence.js` يُقدّم **الصامتَ** لا الأقدمَ دخولًا.
 *
 * وفشلُ القراءة (قاعدةٌ لم تُنشر بعد) يُعيد قائمةً فارغةً ولا يُعطّل الشاشة:
 * الحضورُ إضافةٌ على الجدول لا شرطٌ له.
 */
export function listenMembers(opId, callback) {
  return onSnapshot(
    collection(db, OPS, opId, 'members'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

/**
 * يستمع لقيود المسح لحظياً (لدمج عمل بقيّة الموظّفين).
 *
 * ★ **ويختم كلَّ قيدٍ بـ`_pending` ‹CAP-303›:** `hasPendingWrites` على مستوى
 * اللقطة كانت تُمرَّر وسيطًا ثانيًا **ترميه الشاشة**، فيمسح العادّ خمسين صنفًا
 * والشبكة مقطوعة ويرى جدولَه ممتلئًا ويظنّ عملَه في السحابة. والعلامة على
 * **القيد نفسه** هي ما يُبنى منه العدد: «٤٠ قراءة لم تصل» — لا حالةٌ عامّةٌ
 * تقول «شيءٌ ما معلَّق».
 *
 * والحقل مسبوقٌ بشرطةٍ سفليّة عمدًا: صفةُ نقلٍ محلّيّة لا حقلَ مستندٍ مخزَّن،
 * فلا يُخلط بما يُكتب في Firestore ولا يُصدَّر عمودًا.
 */
export function listenScans(opId, callback) {
  const q = query(collection(db, OPS, opId, 'scans'), orderBy('at', 'asc'));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const scans = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      _pending: d.metadata.hasPendingWrites,
    }));
    callback(scans, snap.metadata.hasPendingWrites);
  });
}

/** يقرأ قيود عملية مرّة واحدة. */
export async function getScans(opId) {
  const snap = await getDocs(query(collection(db, OPS, opId, 'scans'), orderBy('at', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يقرأ رأس عملية واحدة (أو null إن لم توجد) — يخدم استئناف الجلسة:
 * قبل إعادة استعمال معرّف محفوظ محليًّا يجب التأكد أن العملية ما زالت مفتوحة.
 */
export async function getOperation(opId) {
  const snap = await getDoc(doc(db, OPS, opId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** العمليات المفتوحة (للانضمام إليها أو متابعتها). */
export async function listOpenOperations(max = 20) {
  const snap = await getDocs(
    query(collection(db, OPS), where('status', '==', 'open'), limit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يستمع لكل العمليات لحظياً (الأحدث أولاً) — لشاشة متابعة المدير.
 * نرتّب بحقل واحد فقط ونُصفّي الحالة في الواجهة، فلا نحتاج فهرساً مركّباً.
 */
export function listenOperations(callback, max = 50) {
  const q = query(collection(db, OPS), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** يقفل العملية (لا مسح بعدها). */
export function closeOperation(opId) {
  return updateDoc(doc(db, OPS, opId), { status: 'closed', closedAt: serverTimestamp() });
}

/** يحفظ لقطة ملخّصة على رأس العملية (اختياري — للعرض السريع). */
export function updateOperationSummary(opId, { itemCount, scannedCount }) {
  return setDoc(
    doc(db, OPS, opId),
    { itemCount: itemCount ?? 0, scannedCount: scannedCount ?? 0, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * كلّ العمليّات التي تحمل هذا الرمز — المفتوحة والمُقفلة معًا.
 *
 * الاستعلام بحقلٍ واحد عمدًا (`code` فقط، بلا `status`): Firestore يفهرس
 * الحقل المفرد تلقائيًّا، أمّا شرطان فيحتاجان فهرسًا مركّبًا يُنشئه المالك
 * بيده من الكونسول. والحسمُ بين المرشّحات منطقٌ خالصٌ مختبَر في
 * `resolveOperationByCode` — فلا يُفقد شيء، ولا يُطلب من المالك عمل.
 */
export async function findOperationsByCode(code) {
  const norm = normalizeOperationCode(code);
  if (!norm) return [];
  const snap = await getDocs(query(collection(db, OPS), where('code', '==', norm), limit(10)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ★★ يربط جلسةً بحملةٍ (أو يفكّها) — **دمجُ الجلسات منطقيٌّ لا فيزيائيّ**.
 *
 * ولا يُنقل قيدُ مسحٍ واحد: قاعدة `scans` تمنع التعديل والحذف منعًا باتًّا،
 * والنسخُ يكتب `byUid` الناسخِ فيصير جردُ محمدٍ باسم المدير — تزويرٌ للأثر
 * الذي طُلب الدمجُ من أجله. فتبقى كلُّ جلسةٍ بقيودها وكاتبيها، ويُكتب على
 * **رأسها** انتماؤها.
 *
 * ★ **وبلا تعديلِ سطرٍ في `firestore.rules`:** `allow update: if isManager()`
 *   قائمةٌ ولا تحصر الحقول — فالميزةُ تعمل يومَ رفعها بلا نشرٍ من الكونسول.
 *   ومَن دون المديرين يرتدّ طلبُه `permission-denied`، فتقول الشاشة ذلك.
 *
 * @param {string} opId
 * @param {{campaignId?:string, campaignName?:string}} campaign
 *   ومعرّفٌ فارغٌ **يفكّ** الارتباط — مسحُ حقلٍ لا حذفُ بيان.
 */
export function setOperationCampaign(opId, { campaignId = '', campaignName = '' } = {}) {
  return updateDoc(doc(db, OPS, opId), {
    campaignId: String(campaignId || ''),
    campaignName: String(campaignName || ''),
  });
}

/**
 * يُغيّر رمز عمليةٍ قائمة — للمديرين وحدهم بحكم قاعدة `operations`.
 * ومَن دونهم يرتدّ طلبُه بـ`permission-denied`، فتقول الواجهة ذلك صراحةً.
 */
export function setOperationCode(opId, code) {
  const norm = normalizeOperationCode(code);
  if (norm.length !== 6) throw new Error('رمز العملية ستّة محارف من أبجديّة الرموز.');
  return updateDoc(doc(db, OPS, opId), { code: norm });
}
