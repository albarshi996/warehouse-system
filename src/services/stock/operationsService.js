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
  addDoc,
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
    const open = await listOpenOperations(100);
    code = generateOperationCode(Math.random, { taken: open.map((o) => o.code).filter(Boolean) });
  } catch {
    // تعذّرت قراءة المفتوحة (شبكةٌ أو صلاحية) — يُولَّد بلا فحص تفرّدٍ بدل أن
    // تُمنع العملية كلّها. واحتمال التصادم في ٣٢⁶ يقبل هذه المخاطرة.
    code = generateOperationCode();
  }
  const scope = normalizeScope({ warehouse, zone });
  const ref = await addDoc(collection(db, OPS), {
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
  return { id: ref.id, code, scope };
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
  return addDoc(collection(db, OPS, opId, 'scans'), {
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

/** يستمع لقيود المسح لحظياً (لدمج عمل بقيّة الموظّفين). */
export function listenScans(opId, callback) {
  const q = query(collection(db, OPS, opId, 'scans'), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => {
    const scans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
 * يُغيّر رمز عمليةٍ قائمة — للمديرين وحدهم بحكم قاعدة `operations`.
 * ومَن دونهم يرتدّ طلبُه بـ`permission-denied`، فتقول الواجهة ذلك صراحةً.
 */
export function setOperationCode(opId, code) {
  const norm = normalizeOperationCode(code);
  if (norm.length !== 6) throw new Error('رمز العملية ستّة محارف من أبجديّة الرموز.');
  return updateDoc(doc(db, OPS, opId), { code: norm });
}
