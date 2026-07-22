/**
 * عمليات الأسطول في السحابة — الرحلات والوقود وبروتوكول التسليم اليومي.
 *
 * البنية:
 *   trips/{tripId}                    ← رأس الرحلة (دورة Dispatch-to-POD)
 *      ├── fuel/{entryId}             ← قيود الوقود (إضافة فقط — لا تعديل)
 *      └── events/{eventId}           ← سجل تدقيق الانتقالات (إضافة فقط)
 *   vehicles/{vehicleId}/handovers/{تاريخ__وردية} ← نموذج التسليم اليومي
 *
 * المبادئ (نمط `vehiclesService`):
 *   - لا حذف: الرحلة الخاطئة تُلغى قبل تصريح البوابة وتبقى أثرًا.
 *   - الرقم الرسمي `TRIP-2026-0001` يُحجز عند إصدار تصريح البوابة —
 *     لا رقم لمسودة، تمامًا كنمط المستندات.
 *   - آلة الحالات في `fleetModel.js` تُفرض هنا: انتقال غير مشروع يُرمى.
 *   - بطاقة المركبة تحمل خلاصة حيّة: آخر تسليم يومي + الرحلة النشطة.
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numbering.js';
import {
  canTransitionTrip,
  handoverVerdict,
  handoverDocId,
  fuelStats,
  fuelAnomaly,
} from './fleetModel.js';

const TRIPS = 'trips';
const VEHICLES = 'vehicles';

/** نوع عدّاد ترقيم الرحلات: TRIP-2026-0001. */
export const TRIP_NUMBER_TYPE = 'TRIP';

/** هوية الكاتب من Auth مباشرة — قواعد الأمان تحاسب على uid الحقيقي. */
function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** سجل تدقيق على الرحلة (إضافة فقط — نمط scans). */
function logEvent(tripId, action, detail, who) {
  return addDoc(collection(db, TRIPS, tripId, 'events'), {
    action,
    detail: detail || '',
    ...who,
    at: serverTimestamp(),
  });
}

/** يستمع لكل الرحلات لحظيًّا (الأحدث إنشاءً أولًا، التصفية في الواجهة). */
export function listenTrips(callback) {
  const q = query(collection(db, TRIPS), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      snap.metadata.hasPendingWrites
    );
  });
}

/** يستمع لقيود وقود رحلة. */
export function listenTripFuel(tripId, callback) {
  const q = query(collection(db, TRIPS, tripId, 'fuel'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** يستمع لسجل تدقيق رحلة. */
export function listenTripEvents(tripId, callback) {
  const q = query(collection(db, TRIPS, tripId, 'events'), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * إنشاء رحلة جديدة (قيد التحضير — بلا رقم رسمي بعد).
 * `trip`: { vehicleId, plateNo, vehicleDesc, driverName, zone, destination,
 *           doRef, plannedDate, odoStart, baselineKmPerLiter, notes }
 */
export async function createTrip(trip, profile) {
  const who = whoami(profile);
  const ref = await addDoc(collection(db, TRIPS), {
    vehicleId: String(trip.vehicleId || '').trim(),
    plateNo: String(trip.plateNo || '').trim(),
    vehicleDesc: String(trip.vehicleDesc || '').trim(),
    driverName: String(trip.driverName || '').trim(),
    zone: trip.zone || '',
    destination: String(trip.destination || '').trim(),
    doRef: String(trip.doRef || '').trim(),
    plannedDate: trip.plannedDate || '',
    odoStart: trip.odoStart || '',
    odoEnd: '',
    baselineKmPerLiter: trip.baselineKmPerLiter || '',
    notes: String(trip.notes || '').trim(),
    state: 'preparing',
    number: null,
    gatePass: null,
    pod: null,
    deliveredDate: '',
    fuelSummary: { entries: 0, liters: 0, cost: 0, anomalies: 0 },
    createdAt: serverTimestamp(),
    createdByUid: who.byUid,
    createdBy: who.byName,
    updatedAt: serverTimestamp(),
  });
  await logEvent(ref.id, 'إنشاء', `رحلة إلى ${trip.destination || '—'}`, who);
  return ref.id;
}

/** يقرأ رأس الرحلة الحالي (للتحقق قبل الانتقال). */
async function getTrip(tripId) {
  const snap = await getDoc(doc(db, TRIPS, tripId));
  if (!snap.exists()) throw new Error('الرحلة غير موجودة');
  return { id: snap.id, ...snap.data() };
}

/**
 * حارس البروتوكول: هل لهذه المركبة نموذج تسليم يومي مكتمل بتاريخ اليوم؟
 * القاعدة (٢-٢): النموذج شرط إصدار تصريح البوابة — بلا نموذج لا تصريح.
 */
export async function todaysHandover(vehicleId, dateIso) {
  const snap = await getDoc(doc(db, VEHICLES, vehicleId));
  if (!snap.exists()) return null;
  const last = snap.data().lastHandover || null;
  if (!last || last.date !== dateIso || !last.ok) return null;
  return last;
}

/**
 * إصدار تصريح البوابة: يفرض البروتوكول اليومي ثم يحجز الرقم الرسمي.
 * يُعيد { number } — ويرمي خطأً عربيًّا واضحًا إن كان الشرط ناقصًا.
 */
export async function issueGatePass(tripId, { dateIso, skipHandoverCheck = false } = {}, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  if (!canTransitionTrip(trip.state, 'gatepass')) {
    throw new Error(`لا يمكن إصدار تصريح بوابة لرحلة في حالة «${trip.state}»`);
  }
  const today = dateIso || new Date().toISOString().slice(0, 10);
  if (!skipHandoverCheck && trip.vehicleId) {
    const hand = await todaysHandover(trip.vehicleId, today);
    if (!hand) {
      throw new Error(
        'لا تصريح بوابة بلا نموذج الفحص اليومي: أكمل «الاستلام والتسليم اليومي» لهذه المركبة بتاريخ اليوم أولًا (قاعدة ٢-٢)'
      );
    }
  }
  const { number } = await reserveNumber(TRIP_NUMBER_TYPE);
  await setDoc(
    doc(db, TRIPS, tripId),
    {
      state: 'gatepass',
      number,
      gatePass: { number, issuedAt: Date.now(), issuedBy: who.byName, date: today },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (trip.vehicleId) {
    await setDoc(
      doc(db, VEHICLES, trip.vehicleId),
      { activeTrip: { tripId, number, state: 'gatepass' }, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  await logEvent(tripId, 'تصريح بوابة', `صدر التصريح رقم ${number}`, who);
  return { number };
}

/** انطلاق الشاحنة (تسجيل الحارس خروجها). */
export async function departTrip(tripId, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  if (!canTransitionTrip(trip.state, 'enroute')) {
    throw new Error('الانطلاق يكون بعد تصريح البوابة فقط');
  }
  await setDoc(
    doc(db, TRIPS, tripId),
    { state: 'enroute', departedAtMs: Date.now(), updatedAt: serverTimestamp() },
    { merge: true }
  );
  if (trip.vehicleId) {
    await setDoc(
      doc(db, VEHICLES, trip.vehicleId),
      { activeTrip: { tripId, number: trip.number || '', state: 'enroute' }, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  await logEvent(tripId, 'انطلاق', 'خرجت الشاحنة من البوابة', who);
}

/**
 * إثبات التسليم POD: توقيع إلكتروني (صورة كانفس مضغوطة) + اسم المستلم
 * + صورة اختيارية للبضاعة. تتحول الحالة إلى «سُلّمت» فورًا.
 */
export async function recordPod(tripId, { receiverName, signature, photo, notes }, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  if (!canTransitionTrip(trip.state, 'delivered')) {
    throw new Error('إثبات التسليم يكون لرحلة في الطريق فقط');
  }
  if (!String(receiverName || '').trim() && !signature) {
    throw new Error('POD بلا اسم مستلم ولا توقيع لا يُقبل — هدف المرجع 100% موثقة');
  }
  const deliveredDate = new Date().toISOString().slice(0, 10);
  await setDoc(
    doc(db, TRIPS, tripId),
    {
      state: 'delivered',
      deliveredDate,
      deliveredAtMs: Date.now(),
      pod: {
        receiverName: String(receiverName || '').trim(),
        signature: signature || null,
        photo: photo || null,
        notes: String(notes || '').trim(),
        byName: who.byName,
        at: Date.now(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (trip.vehicleId) {
    await setDoc(
      doc(db, VEHICLES, trip.vehicleId),
      { activeTrip: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  await logEvent(tripId, 'POD', `استلمها ${receiverName || 'موقّع إلكترونيًّا'}`, who);
}

/**
 * إقفال الرحلة بمطابقة الوقود: قراءة العداد النهائية تُحسب ضد القيود،
 * وأي انحراف فوق 15% يُوثَّق على الرأس (تنبيه مدير الأسطول).
 */
export async function closeTrip(tripId, { odoEnd }, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  if (!canTransitionTrip(trip.state, 'closed')) {
    throw new Error('الإقفال يكون بعد إثبات التسليم فقط');
  }
  const stats = fuelStats({
    odoBefore: trip.odoStart,
    odoAfter: odoEnd,
    liters: trip.fuelSummary?.liters,
    cost: trip.fuelSummary?.cost,
  });
  const anomaly = stats
    ? fuelAnomaly(stats.kmPerLiter, trip.baselineKmPerLiter)
    : { anomalous: false, deviation: null };
  await setDoc(
    doc(db, TRIPS, tripId),
    {
      state: 'closed',
      odoEnd: odoEnd || '',
      closedAtMs: Date.now(),
      closedBy: who.byName,
      tripStats: stats
        ? { ...stats, anomalous: anomaly.anomalous, deviation: anomaly.deviation }
        : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await logEvent(
    tripId,
    'إقفال',
    stats
      ? `مسافة ${stats.distanceKm} كم${anomaly.anomalous ? ' — ⚠️ استهلاك غير طبيعي' : ''}`
      : 'أُقفلت بلا مطابقة (بيانات ناقصة)',
    who
  );
  return { stats, anomaly };
}

/** إلغاء رحلة قيد التحضير (تبقى أثرًا في السجل — لا حذف). */
export async function cancelTrip(tripId, reason, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  if (!canTransitionTrip(trip.state, 'cancelled')) {
    throw new Error('لا يُلغى إلا ما كان قيد التحضير — بعد التصريح تُكمل الدورة');
  }
  await setDoc(
    doc(db, TRIPS, tripId),
    { state: 'cancelled', cancelReason: String(reason || '').trim(), updatedAt: serverTimestamp() },
    { merge: true }
  );
  await logEvent(tripId, 'إلغاء', reason || '', who);
}

/**
 * قيد وقود على رحلة (السائق ملزم برفعه خلال ساعة — ٢-٥).
 * يُحدّث ملخص الوقود على رأس الرحلة ويكشف الانحراف فورًا إن أمكن.
 */
export async function addFuelEntry(tripId, entry, profile) {
  const who = whoami(profile);
  const trip = await getTrip(tripId);
  const liters = Number(entry.liters) || 0;
  const cost = Number(entry.cost) || 0;
  if (liters <= 0) throw new Error('كمية اللترات مطلوبة');

  const stats = fuelStats({
    odoBefore: entry.odoBefore,
    odoAfter: entry.odoAfter,
    liters,
    cost,
  });
  const anomaly = stats
    ? fuelAnomaly(stats.kmPerLiter, trip.baselineKmPerLiter)
    : { anomalous: false, deviation: null };

  await addDoc(collection(db, TRIPS, tripId, 'fuel'), {
    station: String(entry.station || '').trim(),
    receiptNo: String(entry.receiptNo || '').trim(),
    liters,
    cost,
    odoBefore: entry.odoBefore || '',
    odoAfter: entry.odoAfter || '',
    distanceKm: stats?.distanceKm ?? null,
    kmPerLiter: stats?.kmPerLiter ?? null,
    costPerKm: stats?.costPerKm ?? null,
    anomalous: anomaly.anomalous,
    deviation: anomaly.deviation,
    notes: String(entry.notes || '').trim(),
    ...who,
    createdAt: serverTimestamp(),
  });

  const prev = trip.fuelSummary || { entries: 0, liters: 0, cost: 0, anomalies: 0 };
  await setDoc(
    doc(db, TRIPS, tripId),
    {
      fuelSummary: {
        entries: (prev.entries || 0) + 1,
        liters: (prev.liters || 0) + liters,
        cost: (prev.cost || 0) + cost,
        anomalies: (prev.anomalies || 0) + (anomaly.anomalous ? 1 : 0),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { stats, anomaly };
}

/* ══════════════ بروتوكول الاستلام والتسليم اليومي ══════════════ */

/**
 * حفظ نموذج التسليم اليومي لمركبة (معرّف حتمي: تاريخ__وردية).
 * يرفض النموذج الناقص (حكم `handoverVerdict`) — القاعدة: لا استثناءات.
 * يُحدّث بطاقة المركبة بخلاصة آخر تسليم (حارس تصريح البوابة يقرأها).
 */
export async function saveHandover(vehicleId, handover, profile) {
  const verdict = handoverVerdict(handover);
  if (!verdict.ok) {
    const err = new Error('نموذج التسليم ناقص:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }
  const docId = handoverDocId(handover);
  if (!docId) throw new Error('التاريخ والوردية مطلوبان');
  const who = whoami(profile);

  await setDoc(
    doc(db, VEHICLES, vehicleId, 'handovers', docId),
    { ...handover, ok: true, ...who, savedAt: serverTimestamp() },
    { merge: true }
  );
  await setDoc(
    doc(db, VEHICLES, vehicleId),
    {
      lastHandover: {
        date: handover.date,
        shift: handover.shift,
        ok: true,
        odometer: handover.odometer,
        fuelLevel: handover.fuelLevel,
        fromDriver: handover.fromDriver,
        toDriver: handover.toDriver,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return docId;
}

/** يستمع لنماذج تسليم مركبة (الأحدث أولًا). */
export function listenHandovers(vehicleId, callback) {
  const q = query(collection(db, VEHICLES, vehicleId, 'handovers'), orderBy('savedAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
