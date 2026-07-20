/**
 * جرد المركبات في السحابة — سجلّ الأسطول الحيّ لإدارة الحركة.
 *
 * البنية:
 *   vehicles/{vehicleId}                 ← بطاقة المركبة (رأس السجلّ)
 *      ├── inspections/{inspId}          ← نماذج الفحص الكاملة (تاريخ المركبة)
 *      ├── maintenance/{reqId}           ← طلبات الصيانة (مفتوحة → منجزة)
 *      ├── oil_changes/{entryId}         ← سجلّ تغيير الزيت
 *      └── accidents/{caseId}            ← محاضر الحوادث
 *
 * المبادئ (نمط `operationsService`):
 *   - لا حذف: التصحيح بقيد جديد، والتاريخ يبقى (قواعد الأمان تفرضها).
 *   - معرّف المركبة حتميّ من اللوحة ⇒ إعادة رفع نفس الملف تُحدّث لا تُكرّر.
 *   - ترقيم الفحوصات تسلسليّ رسمي من عدّاد السحابة: `VINSP-2026-0001`
 *     (نفس محرّك ترقيم المستندات — لا أرقام عشوائية بعد اليوم).
 *   - بطاقة المركبة تحمل خلاصةً حيّة (آخر فحص · صيانة مفتوحة · آخر زيت ·
 *     عدد الحوادث) كي يعرض سجلّ الأسطول كل شيء دون قراءة الفروع.
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
  serverTimestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numbering.js';
import { vehicleIdFor, vehicleHeadFrom, summarize } from './inspectionModel.js';

const VEHICLES = 'vehicles';

/** نوع عدّاد ترقيم الفحوصات: VINSP-2026-0001 (يستعمل مجموعة counters القائمة). */
export const INSPECTION_NUMBER_TYPE = 'VINSP';

/** هوية الكاتب من Auth مباشرةً — قواعد الأمان تُحاسِب على uid الحقيقي. */
function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يحجز الرقم الرسمي التالي للفحص (معاملة سحابية — يحتاج اتصالًا). */
export function reserveInspectionNumber() {
  return reserveNumber(INSPECTION_NUMBER_TYPE);
}

/** يستمع لسجلّ الأسطول كاملًا لحظيًّا (مرتّبًا باللوحة). */
export function listenVehicles(callback) {
  const q = query(collection(db, VEHICLES), orderBy('plateNo'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      snap.metadata.hasPendingWrites
    );
  });
}

/** معرّف مستند فحص نظيف من رقم النموذج (حتميّ ⇒ لا ازدواج عند إعادة الرفع). */
function inspectionDocId(inspection) {
  const formNo = String(inspection?.info?.formNo || '').trim();
  const clean = formNo.replace(/[/\\.#$[\]\s]+/g, '-').replace(/^-|-$/g, '');
  return clean || null;
}

/**
 * يحفظ فحصًا كاملًا: مستند الفحص + تحديث بطاقة المركبة (رأس السجلّ).
 * يُعيد { vehicleId, inspId }.
 */
export async function saveInspection(inspection, { profile, source = 'live' } = {}) {
  const vehicleId = vehicleIdFor(inspection);
  if (!vehicleId) throw new Error('لا يمكن الحفظ بلا رقم لوحة أو رقم هيكل');

  const who = whoami(profile);
  const summary = summarize(inspection);
  const inspId = inspectionDocId(inspection);
  if (!inspId) throw new Error('لا يمكن الحفظ بلا رقم نموذج');

  const vehicleRef = doc(db, VEHICLES, vehicleId);
  const inspRef = doc(db, VEHICLES, vehicleId, 'inspections', inspId);
  const exists = (await getDoc(vehicleRef)).exists();

  const head = vehicleHeadFrom(inspection);
  const batch = writeBatch(db);
  batch.set(
    inspRef,
    { ...inspection, summary, source, ...who, savedAt: serverTimestamp() },
    { merge: true }
  );
  batch.set(
    vehicleRef,
    {
      ...head,
      lastInspection: { ...head.lastInspection, inspId },
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      ...(exists ? {} : { createdAt: serverTimestamp(), createdBy: who.byName, source }),
    },
    { merge: true }
  );
  await batch.commit();
  return { vehicleId, inspId };
}

/**
 * رفع دفعة فحوصات (بذرة الأرشيف أو استيراد نسخ احتياطية متعدّدة).
 * حتميّ المعرّفات ⇒ إعادة تشغيله تُحدّث المستندات نفسها ولا تكرّرها.
 * يُعيد عدد المركبات المكتوبة.
 */
export async function uploadInspectionsBatch(records, { profile, source = 'seed', onProgress } = {}) {
  const who = whoami(profile);
  let written = 0;
  // دفعات صغيرة (حدّ Firestore للدفعة 500 عملية؛ كل مركبة عمليتان).
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const batch = writeBatch(db);
    for (const rec of chunk) {
      const inspection = rec.inspection || rec;
      const vehicleId = rec.vehicleId || vehicleIdFor(inspection);
      const inspId = inspectionDocId(inspection);
      if (!vehicleId || !inspId) continue;
      const summary = summarize(inspection);
      batch.set(
        doc(db, VEHICLES, vehicleId, 'inspections', inspId),
        { ...inspection, summary, source, ...who, savedAt: serverTimestamp() },
        { merge: true }
      );
      const head = vehicleHeadFrom(inspection);
      batch.set(
        doc(db, VEHICLES, vehicleId),
        {
          ...head,
          lastInspection: { ...head.lastInspection, inspId },
          updatedAt: serverTimestamp(),
          updatedBy: who.byName,
          source,
        },
        { merge: true }
      );
      written += 1;
    }
    await batch.commit();
    if (onProgress) onProgress(Math.min(i + chunk.length, records.length), records.length);
  }
  return written;
}

/** فحوصات مركبة (الأحدث حفظًا أولًا). */
export async function listInspections(vehicleId) {
  const snap = await getDocs(
    query(collection(db, VEHICLES, vehicleId, 'inspections'), orderBy('savedAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** يقرأ فحصًا واحدًا كاملًا. */
export async function getInspection(vehicleId, inspId) {
  const snap = await getDoc(doc(db, VEHICLES, vehicleId, 'inspections', inspId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** يستمع لفرع من فروع المركبة (maintenance / oil_changes / accidents). */
export function listenSub(vehicleId, sub, callback) {
  const q = query(collection(db, VEHICLES, vehicleId, sub), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** طلب صيانة جديد — يرفع عدّاد «الصيانة المفتوحة» على بطاقة المركبة. */
export async function addMaintenanceRequest(vehicleId, { title, details, priority }, profile) {
  const who = whoami(profile);
  const ref = await addDoc(collection(db, VEHICLES, vehicleId, 'maintenance'), {
    title: String(title || '').trim(),
    details: String(details || '').trim(),
    priority: priority || 'عادية',
    status: 'open',
    ...who,
    createdAt: serverTimestamp(),
    closedAt: null,
  });
  await setDoc(
    doc(db, VEHICLES, vehicleId),
    { openMaintenance: increment(1), updatedAt: serverTimestamp() },
    { merge: true }
  );
  return ref.id;
}

/** إنجاز طلب صيانة (لا حذف — يبقى في السجلّ). */
export async function closeMaintenanceRequest(vehicleId, reqId, note, profile) {
  const who = whoami(profile);
  await updateDoc(doc(db, VEHICLES, vehicleId, 'maintenance', reqId), {
    status: 'done',
    closeNote: String(note || '').trim(),
    closedBy: who.byName,
    closedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, VEHICLES, vehicleId),
    { openMaintenance: increment(-1), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** قيد تغيير زيت — يُحدّث «آخر زيت» على بطاقة المركبة لمتابعة الاستحقاق. */
export async function addOilChange(vehicleId, { date, odometer, oilType, nextKm, nextDate, notes }, profile) {
  const who = whoami(profile);
  const entry = {
    date: String(date || '').trim(),
    odometer: String(odometer || '').trim(),
    oilType: String(oilType || '').trim(),
    nextKm: String(nextKm || '').trim(),
    nextDate: String(nextDate || '').trim(),
    notes: String(notes || '').trim(),
    ...who,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, VEHICLES, vehicleId, 'oil_changes'), entry);
  await setDoc(
    doc(db, VEHICLES, vehicleId),
    {
      lastOilChange: {
        date: entry.date,
        odometer: entry.odometer,
        nextKm: entry.nextKm,
        nextDate: entry.nextDate,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return ref.id;
}

/** محضر حادث — يرفع عدّاد الحوادث على بطاقة المركبة. */
export async function addAccidentReport(
  vehicleId,
  { date, place, driver, description, damage, actions },
  profile
) {
  const who = whoami(profile);
  const ref = await addDoc(collection(db, VEHICLES, vehicleId, 'accidents'), {
    date: String(date || '').trim(),
    place: String(place || '').trim(),
    driver: String(driver || '').trim(),
    description: String(description || '').trim(),
    damage: String(damage || '').trim(),
    actions: String(actions || '').trim(),
    ...who,
    createdAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, VEHICLES, vehicleId),
    { accidentCount: increment(1), lastAccidentDate: String(date || '').trim(), updatedAt: serverTimestamp() },
    { merge: true }
  );
  return ref.id;
}
