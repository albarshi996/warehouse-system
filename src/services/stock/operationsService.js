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
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';

const OPS = 'operations';

/**
 * هوية الكاتب الحقيقية من Firebase Auth مباشرة (لا من الملف الشخصي)،
 * لأن قواعد الأمان تشترط `byUid == request.auth.uid`. الاعتماد على الملف
 * الشخصي وحده قد يسبق تحميله فيُرفض القيد.
 */
function currentUid() {
  return auth?.currentUser?.uid || null;
}

/** ينشئ عملية جديدة ويُعيد معرّفها. */
export async function createOperation({ type, profile, note = '' }) {
  const ref = await addDoc(collection(db, OPS), {
    type,
    status: 'open',
    note,
    createdByUid: currentUid(),
    createdByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    createdAt: serverTimestamp(),
    closedAt: null,
  });
  return ref.id;
}

/**
 * يُضيف قيد مسح دائم. لا يُحدَّث ولا يُحذف أبداً.
 * يُعيد وعداً — لكن Firestore يقبله محلياً فوراً حتى بلا إنترنت.
 */
export function appendScan(opId, { barcode, name, qty, profile, opType }) {
  return addDoc(collection(db, OPS, opId, 'scans'), {
    barcode: String(barcode || ''),
    name: String(name || ''),
    qty: Number(qty) || 0,
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

/** العمليات المفتوحة (للانضمام إليها أو متابعتها). */
export async function listOpenOperations(max = 20) {
  const snap = await getDocs(
    query(collection(db, OPS), where('status', '==', 'open'), limit(max))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
