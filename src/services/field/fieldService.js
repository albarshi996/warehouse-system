/**
 * خدمة الميدان — الخطط والزيارات وإحداثيّات العملاء في Firestore.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. المنطق كلّه في `geo.js` و`journeyPlan.js`
 * و`visitModel.js` الخالصة — وهذه الوحدة تكتب وتقرأ فحسب.
 *
 * ثلاث قواعد بيتٍ تتبعها كغيرها:
 *   · معرّفات حتميّة — `‹يوم›__‹مندوب›__‹عميل›` فتكرار الضغط لا يُنشئ زيارتين.
 *   · لا حذف — الزيارة الملغاة تُوسَم `skipped` بسببٍ مكتوب ولا تُمحى.
 *   · سجلّ أحداثٍ ملحق-فقط تحت كلّ زيارة — من فعل ماذا ومتى وأين.
 *
 * ═══ لماذا الإحداثيّة تُكتب هنا لا عبر `updatePartner`؟ ═══
 * لأنّ `updatePartner` يمرّر ما يُعطى عبر `shapeImportedPartner`، وهو يحتفظ
 * بأعمدة شيت الاستيراد وحدها ويُسقط ما عداها **بصمت**. فكتابة `geo` عبره تضيع
 * بلا خطأ. الكتابة المباشرة هنا تتجنّب الفخّ، ولا تلمس بقيّة حقول العميل.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { canTransitionVisit } from './visitModel.js';
import { normalizeCoords } from './geo.js';

const PLANS = 'journey_plans';
const VISITS = 'visits';
const CUSTOMERS = 'Customers_Master';

/** هوية الفاعل من ملفّه — تُختم على كلّ كتابة. */
function whoami(profile) {
  return {
    byUid: profile?.uid || null,
    byName: profile?.displayName || profile?.email || 'مستخدم',
    byRole: profile?.role || null,
  };
}

/** معرّف الزيارة الحتميّ — يمنع ازدواج زيارة العميل نفسه في اليوم نفسه. */
export function visitId(day, repUid, customerCode) {
  const d = String(day || '').slice(0, 10);
  const r = String(repUid || '').trim();
  const c = String(customerCode || '').trim().toUpperCase();
  return d && r && c ? `${d}__${r}__${c}` : '';
}

/* ═══════════════════ إحداثيّات العملاء ═══════════════════ */

/**
 * يسجّل موقع متجر العميل. الإحداثيّة غير الصالحة تُرفض برسالة — لا تُكتب
 * صامتةً فيصير للمتجر «موقعٌ» في وسط المحيط.
 */
export async function setCustomerLocation(code, reading, profile) {
  const id = String(code || '').trim().toUpperCase();
  if (!id) throw new Error('رمز العميل مطلوب');
  const coords = normalizeCoords(reading);
  if (!coords) throw new Error('إحداثيّة غير صالحة — أعد التقاط الموقع.');

  await updateDoc(doc(db, CUSTOMERS, id), {
    geo: {
      ...coords,
      accuracy: Number(reading?.accuracy) || null,
      capturedAt: new Date().toISOString(),
      ...whoami(profile),
    },
    updatedAt: serverTimestamp(),
  });
}

/** يحدّث بيانات المتجر الميدانيّة (المنطقة · خطّ السير · نوع المنفذ · السياج). */
export async function setCustomerFieldData(code, patch, profile) {
  const id = String(code || '').trim().toUpperCase();
  if (!id) throw new Error('رمز العميل مطلوب');
  const field = {};
  for (const k of ['route', 'zone', 'outletType', 'address', 'landmark']) {
    if (patch?.[k] !== undefined) field[k] = String(patch[k]).trim();
  }
  if (patch?.fenceRadiusM !== undefined) field.fenceRadiusM = Number(patch.fenceRadiusM) || null;
  await updateDoc(doc(db, CUSTOMERS, id), { field, ...whoami(profile), updatedAt: serverTimestamp() });
}

/* ═══════════════════ خطط الزيارات ═══════════════════ */

export function listenJourneyPlans(callback, onError) {
  return onSnapshot(
    query(collection(db, PLANS), orderBy('name')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** خطط مندوبٍ بعينه — ما يحمّله جهازه أوّل اليوم. */
export function listenRepPlans(repUid, callback, onError) {
  if (!repUid) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, PLANS), where('repUid', '==', repUid)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

export async function saveJourneyPlan(plan, profile) {
  const id = String(plan?.id || '').trim() || doc(collection(db, PLANS)).id;
  const payload = {
    id,
    name: String(plan?.name || '').trim(),
    route: String(plan?.route || '').trim(),
    repUid: String(plan?.repUid || '').trim(),
    repName: String(plan?.repName || '').trim(),
    frequency: String(plan?.frequency || 'weekly'),
    weekdays: (plan?.weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6),
    startDate: String(plan?.startDate || '').slice(0, 10),
    customers: (plan?.customers || []).map((c, i) => ({
      code: String(c?.code || '').trim().toUpperCase(),
      name: String(c?.name || '').trim(),
      seq: Number(c?.seq) || i + 1,
    })),
    active: plan?.active !== false,
    ...whoami(profile),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, PLANS, id), payload, { merge: true });
  return id;
}

export async function setPlanActive(id, active, profile) {
  await updateDoc(doc(db, PLANS, id), { active: Boolean(active), ...whoami(profile), updatedAt: serverTimestamp() });
}

/* ═══════════════════ الزيارات ═══════════════════ */

/** زيارات يومٍ بعينه — تغذّي شاشة المندوب ولوحة المشرف معًا. */
export function listenVisitsOfDay(day, callback, onError, { repUid } = {}) {
  const clauses = [where('day', '==', String(day || '').slice(0, 10))];
  if (repUid) clauses.push(where('repUid', '==', repUid));
  return onSnapshot(
    query(collection(db, VISITS), ...clauses, limit(500)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** آخر الزيارات لتقرير التغطية — نافذةٌ واسعة لا يوم واحد. */
export function listenRecentVisits(callback, onError, max = 1000) {
  return onSnapshot(
    query(collection(db, VISITS), orderBy('day', 'desc'), limit(max)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** يكتب حدثًا في السجلّ الملحق-فقط تحت الزيارة. */
async function logEvent(id, kind, payload, profile) {
  const ref = doc(collection(db, VISITS, id, 'events'));
  await setDoc(ref, { kind, ...payload, at: serverTimestamp(), ...whoami(profile) });
}

/**
 * يبذر زيارات اليوم من الخطّة. `merge:true` مع المعرّف الحتميّ يجعلها
 * إيديمبوتنت: إعادة البذر لا تدهس زيارةً بدأت ولا تُنشئ نسخةً ثانية.
 */
export async function seedVisitsForDay(day, dueRows, profile) {
  const d = String(day || '').slice(0, 10);
  let created = 0;
  for (const row of dueRows || []) {
    const id = visitId(d, row.repUid || profile?.uid, row.customerCode);
    if (!id) continue;
    const ref = doc(db, VISITS, id);
    const existing = await getDoc(ref);
    if (existing.exists()) continue; // لا نمسّ زيارةً قائمة
    await setDoc(ref, {
      id,
      day: d,
      state: 'planned',
      customerCode: row.customerCode,
      customerName: row.customerName || '',
      customerCoords: normalizeCoords(row.coords) || null,
      seq: Number(row.seq) || 0,
      planId: row.planId || '',
      route: row.route || '',
      repUid: row.repUid || profile?.uid || null,
      repName: row.repName || profile?.displayName || '',
      createdAt: serverTimestamp(),
      ...whoami(profile),
    });
    created += 1;
  }
  return created;
}

/** زيارة غير مخطّطة يُنشئها المندوب في الميدان — تُوسَم `unplanned`. */
export async function createAdHocVisit({ day, customerCode, customerName, customerCoords }, profile) {
  const id = visitId(day, profile?.uid, customerCode);
  if (!id) throw new Error('يلزم اليوم ورمز العميل');
  await setDoc(
    doc(db, VISITS, id),
    {
      id,
      day: String(day).slice(0, 10),
      state: 'planned',
      unplanned: true,
      customerCode: String(customerCode).toUpperCase(),
      customerName: customerName || '',
      customerCoords: normalizeCoords(customerCoords) || null,
      repUid: profile?.uid || null,
      repName: profile?.displayName || '',
      createdAt: serverTimestamp(),
      ...whoami(profile),
    },
    { merge: true }
  );
  return id;
}

/** يُغيّر حالة الزيارة بعد التحقّق من مشروعيّة الانتقال. */
async function transition(id, to, extra, profile) {
  const ref = doc(db, VISITS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الزيارة غير موجودة');
  const from = snap.data().state;
  if (!canTransitionVisit(from, to)) {
    throw new Error(`انتقالٌ غير مسموح: ${from} ← ${to}`);
  }
  await updateDoc(ref, { state: to, ...extra, ...whoami(profile), updatedAt: serverTimestamp() });
  await logEvent(id, to, extra, profile);
}

/** تسجيل الحضور: الختم من الخادم، والموقع شهادةٌ تُحفظ بدقّتها. */
export async function checkIn(id, position, profile) {
  await transition(
    id,
    'checked_in',
    { checkInAt: serverTimestamp(), checkInPosition: position || null },
    profile
  );
}

/**
 * تسجيل الانصراف بنتيجةٍ مُلزِمة — زيارةٌ بلا نتيجة معلومةٌ ناقصة.
 *
 * و`visitType` (م٥-ب) يُكتب هنا إن لم يكن على الزيارة المخطّطة: النجاح يُقاس
 * بغرض الزيارة، وغيابُه يعني «بيع وتحصيل» — أوسع الأنواع وسلوك اليوم.
 */
export async function checkOut(id, { position, outcome, notes, visitType } = {}, profile) {
  if (!String(outcome || '').trim()) throw new Error('نتيجة الزيارة مطلوبة');
  await transition(
    id,
    'checked_out',
    {
      checkOutAt: serverTimestamp(),
      checkOutPosition: position || null,
      outcome: String(outcome),
      ...(String(visitType || '').trim() ? { visitType: String(visitType).trim() } : {}),
      notes: String(notes || '').trim(),
    },
    profile
  );
}

/** تعليم الزيارة «لم تُنفَّذ» بسببٍ مُلزَم. */
export async function skipVisit(id, reason, profile) {
  if (!String(reason || '').trim()) throw new Error('سبب عدم التنفيذ مطلوب');
  await transition(id, 'skipped', { skipReason: String(reason), skippedAt: serverTimestamp() }, profile);
}

/** يربط فاتورةً بالزيارة — فيصير للبيع مكانٌ ووقتٌ لا رقمٌ فقط. */
export async function attachInvoice(id, { docId, number, amount }, profile) {
  await updateDoc(doc(db, VISITS, id), {
    invoiceRef: { docId: docId || null, number: number || null, amount: Number(amount) || 0 },
    updatedAt: serverTimestamp(),
  });
  await logEvent(id, 'invoice', { number: number || null, amount: Number(amount) || 0 }, profile);
}
