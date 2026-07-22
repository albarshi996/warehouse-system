/**
 * الصيانة في السحابة — سجل الأصول وأوامر الشغل (المرجع م-٣).
 *
 * البنية:
 *   assets/{assetId}        ← بطاقة الأصل (فئة · موقع · جدولة وقائية · حالة)
 *   work_orders/{woId}      ← أمر الشغل بدورته الكاملة + طوابع الانتقالات
 *      └── events/{id}      ← سجل تدقيق الانتقالات (إضافة فقط)
 *
 * المبادئ:
 *   - معرف الأصل حتمي من كوده ⇒ إعادة التسجيل تُحدّث لا تكرّر.
 *   - رقم أمر الشغل الرسمي `WO-2026-0001` يُحجز عند الاعتماد (لا للمسودة).
 *   - آلة الحالات في `workOrderModel.js` تُفرض هنا.
 *   - الأصل يحمل خلاصة حية: أوامر مفتوحة + آخر أمر + حالة تشغيلية.
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
  increment,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { reserveNumber } from '../documents/numbering.js';
import { canTransitionWO, WO_PRIORITIES } from './workOrderModel.js';

const ASSETS = 'assets';
const WORK_ORDERS = 'work_orders';

/** نوع عدّاد ترقيم أوامر الشغل: WO-2026-0001. */
export const WO_NUMBER_TYPE = 'WO';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

function logWoEvent(woId, action, detail, who) {
  return addDoc(collection(db, WORK_ORDERS, woId, 'events'), {
    action,
    detail: detail || '',
    ...who,
    at: serverTimestamp(),
  });
}

/** معرف أصل نظيف من كوده (حتمي). */
export function assetIdFor(code) {
  const clean = String(code || '')
    .trim()
    .replace(/[/\\.#$[\]\s]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || null;
}

/** يستمع لسجل الأصول (مرتبًا بالاسم). */
export function listenAssets(callback) {
  const q = query(collection(db, ASSETS), orderBy('name'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      snap.metadata.hasPendingWrites
    );
  });
}

/**
 * تسجيل/تحديث أصل: { code, name, category, location, serial, notes,
 *   pmEveryDays, pmEveryKm, nextPmDate, nextPmKm, currentKm }
 */
export async function saveAsset(asset, profile) {
  const id = assetIdFor(asset.code || asset.name);
  if (!id) throw new Error('كود الأصل أو اسمه مطلوب');
  const who = whoami(profile);
  const ref = doc(db, ASSETS, id);
  const exists = (await getDoc(ref)).exists();
  await setDoc(
    ref,
    {
      code: String(asset.code || '').trim(),
      name: String(asset.name || '').trim(),
      category: asset.category || 'device',
      location: String(asset.location || '').trim(),
      serial: String(asset.serial || '').trim(),
      notes: String(asset.notes || '').trim(),
      pmEveryDays: asset.pmEveryDays || '',
      pmEveryKm: asset.pmEveryKm || '',
      nextPmDate: asset.nextPmDate || '',
      nextPmKm: asset.nextPmKm || '',
      currentKm: asset.currentKm || '',
      status: asset.status || 'in_service',
      updatedAt: serverTimestamp(),
      updatedBy: who.byName,
      ...(exists ? {} : { createdAt: serverTimestamp(), createdBy: who.byName, openWorkOrders: 0 }),
    },
    { merge: true }
  );
  return id;
}

/** يستمع لأوامر الشغل كلها (الأحدث أولًا). */
export function listenWorkOrders(callback) {
  const q = query(collection(db, WORK_ORDERS), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      snap.metadata.hasPendingWrites
    );
  });
}

/**
 * فتح طلب صيانة (مسودة): { assetId, assetName, category, type, priority,
 *   description } — العالي الخطورة يوقف الأصل فورًا (٣-٢).
 */
export async function createWorkOrder(wo, profile) {
  const who = whoami(profile);
  if (!String(wo.description || '').trim()) throw new Error('وصف العطل أو العمل مطلوب');
  const ref = await addDoc(collection(db, WORK_ORDERS), {
    assetId: String(wo.assetId || '').trim(),
    assetName: String(wo.assetName || '').trim(),
    category: wo.category || '',
    type: wo.type || 'corrective',
    priority: wo.priority || 'medium',
    description: String(wo.description || '').trim(),
    state: 'draft',
    number: null,
    partsCost: 0,
    laborCost: 0,
    resolution: '',
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    createdByUid: who.byUid,
    createdBy: who.byName,
    updatedAt: serverTimestamp(),
  });
  if (wo.assetId) {
    const stops = WO_PRIORITIES[wo.priority]?.stopsAsset;
    await setDoc(
      doc(db, ASSETS, wo.assetId),
      {
        openWorkOrders: increment(1),
        ...(stops ? { status: 'down' } : {}),
        lastWO: { id: ref.id, state: 'draft', description: String(wo.description || '').trim() },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  await logWoEvent(ref.id, 'فتح الطلب', wo.description, who);
  return ref.id;
}

/**
 * نقل أمر شغل عبر دورته. `payload` اختياري حسب الوجهة:
 *   confirmed: يحجز الرقم الرسمي WO-… · repaired: { resolution, partsCost, laborCost }
 *   back_in_service / scrapped: يغلق الأمر ويحدّث الأصل.
 */
export async function advanceWorkOrder(woId, to, payload = {}, profile) {
  const who = whoami(profile);
  const snap = await getDoc(doc(db, WORK_ORDERS, woId));
  if (!snap.exists()) throw new Error('أمر الشغل غير موجود');
  const wo = { id: snap.id, ...snap.data() };
  if (!canTransitionWO(wo.state, to)) {
    throw new Error(`انتقال غير مشروع من «${wo.state}» إلى «${to}»`);
  }

  const patch = { state: to, updatedAt: serverTimestamp() };
  if (to === 'confirmed') {
    const { number } = await reserveNumber(WO_NUMBER_TYPE);
    patch.number = number;
    patch.confirmedAtMs = Date.now();
    patch.confirmedBy = who.byName;
  }
  if (to === 'in_progress') patch.startedAtMs = Date.now();
  if (to === 'repaired') {
    patch.repairedAtMs = Date.now();
    patch.resolution = String(payload.resolution || '').trim();
    patch.partsCost = Number(payload.partsCost) || 0;
    patch.laborCost = Number(payload.laborCost) || 0;
  }
  if (to === 'back_in_service' || to === 'scrapped') {
    patch.closedAtMs = Date.now();
    patch.closedBy = who.byName;
  }
  await setDoc(doc(db, WORK_ORDERS, woId), patch, { merge: true });

  // خلاصة الأصل: عودة للخدمة تعيده للعمل، والتكهين يخرجه نهائيًا.
  if (wo.assetId) {
    const assetPatch = {
      lastWO: { id: woId, state: to, number: patch.number || wo.number || '', description: wo.description },
      updatedAt: serverTimestamp(),
    };
    if (to === 'back_in_service') {
      assetPatch.openWorkOrders = increment(-1);
      assetPatch.status = 'in_service';
    }
    if (to === 'scrapped') {
      assetPatch.openWorkOrders = increment(-1);
      assetPatch.status = 'scrapped';
    }
    await setDoc(doc(db, ASSETS, wo.assetId), assetPatch, { merge: true });
  }
  await logWoEvent(woId, to, payload.resolution || '', who);
  return patch.number || wo.number || null;
}

/**
 * إنجاز صيانة وقائية على أصل: يعيد جدولة الاستحقاق القادم من فترته
 * (بالأيام و/أو بالكيلومترات) — يُستدعى بعد «عودة للخدمة» لأمر وقائي.
 */
export async function reschedulePm(assetId, { fromDate, currentKm }, profile) {
  const who = whoami(profile);
  const ref = doc(db, ASSETS, assetId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الأصل غير موجود');
  const a = snap.data();
  const patch = { updatedAt: serverTimestamp(), updatedBy: who.byName };
  const everyDays = Number(a.pmEveryDays);
  if (Number.isFinite(everyDays) && everyDays > 0 && fromDate) {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + everyDays);
    patch.nextPmDate = next.toISOString().slice(0, 10);
  }
  const everyKm = Number(a.pmEveryKm);
  const cur = Number(currentKm ?? a.currentKm);
  if (Number.isFinite(everyKm) && everyKm > 0 && Number.isFinite(cur) && cur > 0) {
    patch.nextPmKm = cur + everyKm;
    patch.currentKm = cur;
  }
  await setDoc(ref, patch, { merge: true });
  return patch;
}
