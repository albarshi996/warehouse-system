/**
 * خدمة الشحنات والطرود السحابيّة ‹LPN-714› — تنفّذ ولا تقرّر.
 *
 * البنية:
 *   shipments/{shipmentCode}        ← الشحنة وجلسةُ تعبئتها · المعرّف هو رقمها
 *      └── events/{eventId}         ← سجلّ أحداثها الملحق-فقط
 *   barcode_counters/{SHP-فرع-يوم}  ← تسلسل الشحنات (عدّاد `barcodeService`)
 *   barcodes/{value}                ← قيدُ كلّ شحنةٍ وكلّ طرد (سجلّ ‹LPN-704›)
 *
 * ═══ ولماذا مجموعةٌ جديدة ═══
 * القاعدة الحاكمة: **لا مجموعة Firestore جديدة إلّا ببيّنة أنّ لا نواة تصلح.**
 * والبيّنة: `documents` تحمل مستند `PACK` الورقيّ (بنودٌ وأرقام طرودٍ تُكتب)،
 * وهو **مستندُ إثباتٍ لا جلسةَ عمل**: يُنشأ مرّةً ويُعتمد. والتعبئة جلسةٌ حيّة
 * تُحدَّث مع كلّ كرتونة، ولها طرودٌ لها حالاتٌ وإعاداتُ فتح. وحشوُها في
 * `documents` يُفسد كلّ مؤشّرات المستندات بصفوفٍ تُكتب مئةَ مرّة في الساعة
 * (البيّنة نفسها التي بُنيت عليها `receiving_sessions` و`picking_tasks`).
 *
 * ═══ والحكم كلّه في `packingFlow` و`customerLabel` و`shipmentCode` ═══
 * كلُّ دالّةٍ هنا: اقرأ الحيّ ← استدعِ المنطق الخالص ← اكتب النتيجة. ولا
 * قاعدةَ عملٍ تُكتب في طبقة التخزين.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { BARCODE_KINDS, normalizeScan } from '../barcodes/barcodeCode.js';
import { registerBarcode, registerBatch, recordPrint, reserveSequence, setBarcodeStatus } from '../barcodes/barcodeService.js';
import { formatShipmentCode, shipmentCounterKey } from './shipmentCode.js';
import {
  cancelParcel,
  closePacking,
  closeParcel,
  markParcelPrinted,
  openPacking,
  packLine,
  reopenParcel,
  setParcelCount,
} from './packingFlow.js';

const SHIPMENTS = 'shipments';
const EVENTS = 'events';

/** سقفُ القراءة الحيّة — الشاشة تعرض الجاري لا تاريخَ المستودع. */
export const SHIPMENTS_CAP = 200;

/** أنواع أحداث الشحنة المقيَّدة — ما ليس منها لا يدخل السجلّ. */
export const SHIPMENT_EVENTS = Object.freeze({
  OPENED: 'فتح التعبئة',
  PARCELS_SET: 'تحديد عدد الطرود',
  PACKED: 'تعبئة بند',
  PARCEL_CLOSED: 'إغلاق طرد',
  PARCEL_REOPENED: 'إعادة فتح طرد',
  PARCEL_CANCELLED: 'إلغاء طرد',
  LABEL_PRINTED: 'طباعة ملصق العميل',
  READY: 'جاهز للتحميل',
  LOADED: 'محمَّل',
});

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function nowIso() {
  return new Date().toISOString();
}

/** يُلحق حدثًا بسجلّ الشحنة — ملحق-فقط، بمعرّفٍ حتميٍّ حين يُمرَّر. */
async function appendEvent(code, { type, actor, at, reason = '', details = null }, { id } = {}) {
  if (!Object.hasOwn(SHIPMENT_EVENTS, type)) throw new Error(`نوع حدثٍ غير معروف «${type ?? ''}».`);
  const eventId = id || `${type}__${at}__${actor}`;
  await setDoc(doc(db, SHIPMENTS, code, EVENTS, eventId), {
    type,
    label: SHIPMENT_EVENTS[type],
    shipment: code,
    actor: String(actor ?? '').trim(),
    at: String(at ?? '').trim(),
    reason: String(reason ?? '').trim(),
    details,
    byUid: currentUid(),
    recordedAt: serverTimestamp(),
  });
}

/** يقرأ الشحنة الحيّة — أو يرمي إن غابت. */
async function liveShipment(code) {
  const snap = await getDoc(doc(db, SHIPMENTS, code));
  if (!snap.exists()) throw new Error(`الشحنة «${code}» غير موجودة.`);
  return { id: snap.id, ...snap.data() };
}

/** يحجز رقم شحنةٍ جديدًا — معاملةٌ ذرّيّة على عدّاد الفرع واليوم. */
export async function reserveShipmentCode({ branch, date = null } = {}) {
  const day = date ?? new Date();
  const key = shipmentCounterKey({ branch, date: day });
  if (!key) throw new Error('عدّاد الشحنات يحتاج فرعًا ويومًا صالحَين.');
  const seq = await reserveSequence(key);
  const code = formatShipmentCode({ branch, date: day, seq });
  if (!code) throw new Error(`تعذّر بناء رقم الشحنة من (${branch} · ${seq}).`);
  return { code, seq };
}

/**
 * يفتح شحنةً بجلسة تعبئتها — الرقمُ يُحجز، والقيدُ يدخل سجلّ الباركود.
 *
 * @returns {Promise<{code:string}>}
 */
export async function openShipment(order, { actor, actorName = '', at = '', stagingBin = '', role = '' } = {}) {
  const stamp = at || nowIso();
  const built = openPacking(order, { actor, actorName, at: stamp, stagingBin });
  if (built.problem) throw new Error(built.problem);

  const branch = built.session.branch || built.session.warehouse;
  const { code } = await reserveShipmentCode({ branch });

  await registerBarcode({
    value: code,
    kind: BARCODE_KINDS.SHIPMENT.id,
    role,
    actor,
    actorName,
    at: stamp,
    docRef: built.session.orderRef,
    warehouse: built.session.warehouse,
    reason: `تعبئة الطلب ${built.session.orderRef}`,
  });

  await setDoc(doc(db, SHIPMENTS, code), {
    ...built.session,
    shipment: code,
    // ★ مهمّةُ التحضير تُحفظ على الشحنة: بها تُستبعد المهمّة من قائمة
    // «ما لم يُعبَّأ بعد» فلا تُعبَّأ مرّتين (`listPackablePicks`).
    taskId: String(order?.taskId ?? '').trim(),
    openedByUid: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await appendEvent(code, { type: 'OPENED', actor, at: stamp, details: { orderRef: built.session.orderRef } }, { id: 'OPENED' });
  return { code };
}

/** يكتب نتيجة منطقٍ خالصٍ على الشحنة — نقطةُ كتابةٍ واحدةٌ لا تتكرّر. */
async function commit(code, session) {
  await setDoc(doc(db, SHIPMENTS, code), { ...session, shipment: code, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * يحدّد عدد الطرود ويقيّد باركود كلٍّ منها في السجلّ.
 *
 * التسجيل **بعد** الكتابة عمدًا: قيدٌ سجلّيٌّ يفشل لا يُسقط عملًا ميدانيًّا،
 * و`ensureRegistered` يستدركه عند أوّل مسح.
 */
export async function setParcels(code, total, { actor, actorName = '', at = '', role = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = setParcelCount(live, total, { shipment: code });
  if (out.problem) throw new Error(out.problem);

  await commit(code, out.session);
  await appendEvent(code, { type: 'PARCELS_SET', actor, at: stamp, details: { total } });

  const fresh = out.session.parcels.filter((p) => !(live.parcels ?? []).some((x) => x.no === p.no));
  if (fresh.length) {
    await registerBatch(
      fresh.map((p) => ({ value: p.code, kind: BARCODE_KINDS.PARCEL.id })),
      { role, actor, actorName, at: stamp, docRef: live.orderRef, warehouse: live.warehouse }
    );
  }
  return out.session;
}

/** يعبّئ بندًا في طرد. */
export async function packIntoParcel(code, parcelNo, line, { actor, at = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = packLine(live, parcelNo, line);
  if (out.problem) throw new Error(out.problem);
  await commit(code, out.session);
  await appendEvent(code, { type: 'PACKED', actor, at: stamp, details: { parcelNo, sku: line?.sku, qty: line?.qty } });
  return out.session;
}

/** يغلق طردًا. */
export async function closeParcelOn(code, parcelNo, { actor, at = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = closeParcel(live, parcelNo, { actor, at: stamp });
  if (out.problem) throw new Error(out.problem);
  await commit(code, out.session);
  await appendEvent(code, { type: 'PARCEL_CLOSED', actor, at: stamp, details: { parcelNo } });
  return out.session;
}

/**
 * ★★ يعيد فتح طردٍ مكتمل — ويُبطل ملصقه في سجلّ الباركود.
 *
 * وهو ما اشترطه النصّ: «إلغاء الملصق السابق أو توضيح أنّه أُعيدت طباعته».
 * والقرارُ في `packingFlow.reopenParcel`، والتنفيذُ هنا.
 */
export async function reopenParcelOn(code, parcelNo, { reason, actor, at = '', role = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = reopenParcel(live, parcelNo, { reason, actor, at: stamp });
  if (out.problem) throw new Error(out.problem);

  await commit(code, out.session);
  await appendEvent(code, { type: 'PARCEL_REOPENED', actor, at: stamp, reason, details: { parcelNo } });

  if (out.voidLabel) {
    try {
      await setBarcodeStatus(out.voidLabel, 'DAMAGED', { actor, at: stamp, reason: `أُعيد فتح الطرد: ${reason}`, role });
    } catch {
      // القيد السجلّيّ لا يُسقط عملًا ميدانيًّا — والحالةُ تُستدرك من الشاشة.
    }
  }
  return out.session;
}

/** يلغي طردًا بسبب — ويُبطل ملصقه إبطالًا نهائيًّا. */
export async function cancelParcelOn(code, parcelNo, { reason, actor, at = '', role = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = cancelParcel(live, parcelNo, { reason, actor, at: stamp });
  if (out.problem) throw new Error(out.problem);

  await commit(code, out.session);
  await appendEvent(code, { type: 'PARCEL_CANCELLED', actor, at: stamp, reason, details: { parcelNo } });
  if (out.voidLabel) {
    try {
      await setBarcodeStatus(out.voidLabel, 'VOID', { actor, at: stamp, reason, role });
    } catch {
      /* كسابقتها */
    }
  }
  return out.session;
}

/** يسجّل طباعة ملصق طردٍ — على الطرد وفي سجلّ الباركود معًا. */
export async function printParcelLabel(code, parcelNo, { actor, actorName = '', reason = '', role = '', at = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const parcel = (live.parcels ?? []).find((p) => p.no === Math.trunc(Number(parcelNo)));
  if (!parcel) throw new Error(`لا طردَ برقم ${parcelNo}.`);

  await recordPrint(parcel.code, { actor, actorName, reason, role, at: stamp, printer: 'PDF' });

  const out = markParcelPrinted(live, parcelNo);
  if (out.problem) throw new Error(out.problem);
  await commit(code, out.session);
  await appendEvent(code, { type: 'LABEL_PRINTED', actor, at: stamp, reason, details: { parcelNo, code: parcel.code } });
  return out.session;
}

/** يتمّ التعبئة — الطلب «جاهز للتحميل». */
export async function finishPacking(code, { actor, at = '', override = false, overrideNote = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  const out = closePacking(live, { actor, at: stamp, override, overrideNote });
  if (out.problem) throw new Error(out.problem);
  await commit(code, out.session);
  await appendEvent(code, { type: 'READY', actor, at: stamp, reason: overrideNote, details: { parcels: out.session.parcelTotal } });
  return out.session;
}

/** يسم الشحنة محمَّلةً — يُستدعى من دورة التحميل عند الباب ‹LPN-715›. */
export async function markShipmentLoaded(code, { actor, at = '', tripId = '', vehicle = '', door = '' } = {}) {
  const stamp = at || nowIso();
  const live = await liveShipment(code);
  // ★ مسحةٌ ثانيةٌ للشحنة نفسها لا تُكرّر الختم ولا تُخطئ: تُعلن ولا تكتب.
  // (والقواعد تختم `LOADED` نهائيًّا، فكتابةٌ ثانيةٌ كانت سترتدّ خطأً يربك العامل.)
  if (live.state === 'LOADED') return { already: true, loadedAt: live.loadedAt ?? '' };
  if (live.state !== 'READY') {
    throw new Error(`الشحنة «${live.state}» — لا تُحمَّل إلّا وهي جاهزة للتحميل.`);
  }
  await commit(code, { ...live, state: 'LOADED', loadedAt: stamp, tripId, vehicle, door });
  await appendEvent(code, { type: 'LOADED', actor, at: stamp, details: { tripId, vehicle, door } });
}

/** شحنةٌ واحدة — أو `null`. */
export async function getShipment(code) {
  const id = normalizeScan(code);
  if (!id) return null;
  const snap = await getDoc(doc(db, SHIPMENTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** سجلّ أحداث شحنة — مرتَّبًا زمنيًّا. */
export async function getShipmentEvents(code) {
  const id = normalizeScan(code);
  if (!id) return [];
  const snap = await getDocs(query(collection(db, SHIPMENTS, id, EVENTS), orderBy('at')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** استماعٌ حيٌّ للشحنات — بحالةٍ اختياريّة. */
export function listenShipments(callback, { state = '', max = SHIPMENTS_CAP, onError } = {}) {
  const base = collection(db, SHIPMENTS);
  const q = state ? query(base, where('state', '==', state), fsLimit(max)) : query(base, fsLimit(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => (onError ? onError(err) : console.error('shipments', err))
  );
}

/**
 * ★ مهامُّ التحضير المنفَّذة التي **لم تُعبَّأ بعد** — مدخلُ شاشة التعبئة.
 *
 * ولماذا تُقرأ من `picking_tasks` لا من مستندٍ ثانٍ؟ لأنّ ما يُعبَّأ هو **ما
 * سُحب فعلًا** لا ما طُلب. والسحبُ يعيش في خطوات المهمّة — فتُبنى بنودُ
 * التعبئة منه، ولا يُخترع لها مصدرٌ ثانٍ يفترق عنه.
 *
 * @returns {Promise<Array<{taskId:string, orderRef:string, lines:object[]}>>}
 */
export async function listPackablePicks({ max = 50 } = {}) {
  const snap = await getDocs(
    query(collection(db, 'picking_tasks'), where('state', '==', 'DONE'), fsLimit(max))
  );
  const shipped = new Set();
  const live = await getDocs(query(collection(db, SHIPMENTS), fsLimit(SHIPMENTS_CAP)));
  for (const d of live.docs) shipped.add(String(d.data()?.taskId ?? d.data()?.orderRef ?? ''));

  return snap.docs
    .map((d) => {
      const t = { id: d.id, ...d.data() };
      const by = new Map();
      for (const step of t.steps ?? []) {
        const qty = Number(step?.picked) || 0;
        if (qty <= 0) continue;
        const key = `${step.sku}__${step.batch ?? ''}`;
        const row = by.get(key) ?? {
          sku: step.sku,
          description: step.description ?? '',
          uom: step.uom ?? '',
          batch: step.batch ?? '',
          qty: 0,
        };
        row.qty += qty;
        by.set(key, row);
      }
      return {
        taskId: t.id,
        orderRef: t.source?.number || t.id,
        orderType: t.source?.type || '',
        customerName: t.source?.customerName || '',
        customerCode: t.source?.customerCode || '',
        branch: t.branch || t.warehouse || '',
        route: t.route || '',
        warehouse: t.warehouse || '',
        state: 'PICKED',
        lines: [...by.values()],
      };
    })
    .filter((t) => t.lines.length && !shipped.has(t.orderRef) && !shipped.has(t.taskId));
}

/** شحناتُ طلبٍ ما — طلبٌ قد يُشحن على دفعات. */
export async function shipmentsOfOrder(orderRef, max = 20) {
  const ref = String(orderRef ?? '').trim();
  if (!ref) return [];
  const snap = await getDocs(query(collection(db, SHIPMENTS), where('orderRef', '==', ref), fsLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export { SHIPMENTS as SHIPMENTS_COLLECTION };
