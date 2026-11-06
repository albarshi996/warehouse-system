/**
 * خدمة «احتياجات الموقع» — مجموعةُ Firestore خاصّةٌ `site_needs`.
 *
 * البنية:
 *   site_needs/{id}        ← بطاقة الاحتياج (وصفٌ · فئةٌ · كمّيّةٌ · أولويّةٌ …)
 *      └── events/{id}     ← سجلّ تغيّر الحالة — **إضافةٌ فقط** (تدقيقٌ دائم)
 *
 * المبادئ (نمط `maintenanceService` و`hiringRequestsService`):
 *   - كلُّ وصولٍ إلى القاعدة من البابِ الواحد `_db/index.js` لا من Firestore.
 *   - سجلُّ الحالة ملحق-فقط: التصحيحُ بقيدٍ جديدٍ لا بمحو القديم.
 *   - الاستعلامُ بلا `where`+`orderBy` معًا (يفرض فهرسًا مركّبًا): نقرأ
 *     المجموعة كاملةً ونرتّب في المتصفّح — نفس حلّ «متابعة العمليات».
 *   - آلةُ الحالات في `needStates.js` تُفرَض هنا (الطبقة الثانية).
 */
import { collection, doc, addDoc, setDoc, getDoc, onSnapshot, query, serverTimestamp, db } from '../_db/index.js';
import { auth } from '../../config/firebase.js';
import { canCreateNeed, canTransition, isLegalTransition, INITIAL_STATE, TERMINAL_STATES } from './needStates.js';

const COL = 'site_needs';

/** الموقع الافتراضيّ — موقع ١٥٥ (أبوهادي)؛ يُغيَّر من النموذج عند الحاجة. */
export const DEFAULT_SITE = '155';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    byRole: profile?.role || '',
  };
}

/** يكتب قيدًا في سجلّ التدقيق (ملحق-فقط). */
function logNeedEvent(needId, action, detail, who) {
  return addDoc(collection(db, COL, needId, 'events'), {
    action,
    detail: detail || '',
    ...who,
    at: serverTimestamp(),
  });
}

/** يشكّل حقول الاحتياج من مدخلات النموذج (نصوص مشذّبة). */
function shapeFields(input) {
  return {
    description: String(input.description ?? '').trim(),
    category: String(input.category ?? 'other').trim(),
    quantity: Number(input.quantity) || 0,
    unit: String(input.unit ?? '').trim(),
    priority: String(input.priority ?? 'NORMAL').trim(),
    requiredDate: String(input.requiredDate ?? '').slice(0, 10),
    site: String(input.site ?? DEFAULT_SITE).trim(),
    requester: String(input.requester ?? '').trim(),
    notes: String(input.notes ?? '').trim(),
  };
}

/**
 * يستمع لكلّ الاحتياجات (لوحةٌ تشغيليّةٌ مشتركة) — مرتّبةً محليًّا بالأحدث
 * أوّلًا (الاحتياجُ المعلّق بلا ختمِ وقتٍ يُعدّ الأحدث).
 */
export function subscribeSiteNeeds(callback, onError) {
  const q = query(collection(db, COL));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || Infinity) - (a.createdAt?.toMillis?.() || Infinity));
      callback(rows, snap.metadata?.hasPendingWrites || false);
    },
    (err) => onError?.(err)
  );
}

/**
 * يسجّل احتياجًا جديدًا بحالة «جديد» باسم صاحبه، مع قيدِ تدقيقٍ ابتدائيّ.
 */
export async function createSiteNeed(input, profile) {
  const fields = shapeFields(input);
  if (!fields.description) throw new Error('وصف الاحتياج إلزاميّ.');
  if (!canCreateNeed(profile?.role)) throw new Error('ليست لك صلاحيّة تسجيل احتياج.');

  const who = whoami(profile);
  if (!who.byUid) throw new Error('يجب تسجيل الدخول.');

  const ref = await addDoc(collection(db, COL), {
    ...fields,
    state: INITIAL_STATE,
    createdByUid: who.byUid,
    createdByName: who.byName,
    createdByRole: who.byRole,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });

  await logNeedEvent(ref.id, 'created', `تسجيل احتياجٍ جديد: ${fields.description}`, who);
  return ref.id;
}

/**
 * ينقل احتياجًا عبر دورته. يتحقّق من شرعيّة النقلة ومن صلاحيّة الدور
 * (الطبقة الثانية)، ثمّ يختم الوقتَ المناسبَ ويكتب قيدَ تدقيقٍ ملحق-فقط.
 *
 * @param {string} needId
 * @param {string} to الحالة الهدف
 * @param {{note?:string}} payload سببٌ اختياريّ (إلزاميّ للرفض)
 * @param {object} profile ملفّ المستخدم (role · name)
 */
export async function transitionSiteNeed(needId, to, payload = {}, profile) {
  const who = whoami(profile);
  const snap = await getDoc(doc(db, COL, needId));
  if (!snap.exists()) throw new Error('الاحتياج غير موجود.');
  const need = { id: snap.id, ...snap.data() };

  if (!isLegalTransition(need.state, to)) {
    throw new Error(`انتقالٌ غير مشروع من «${need.state}» إلى «${to}».`);
  }
  if (!canTransition(need.state, to, profile?.role)) {
    throw new Error('ليست لك صلاحيّة هذا التحوّل.');
  }
  const note = String(payload.note ?? '').trim();
  if (to === 'rejected' && !note) {
    throw new Error('الرفض يحتاج سببًا مكتوبًا.');
  }

  const patch = { state: to, updatedAt: serverTimestamp() };
  if (to === 'approved') { patch.approvedAtMs = Date.now(); patch.approvedBy = who.byName; }
  if (to === 'in_progress') { patch.startedAtMs = Date.now(); patch.startedBy = who.byName; }
  if (to === 'done') { patch.doneAtMs = Date.now(); patch.doneBy = who.byName; }
  if (to === 'rejected') { patch.rejectedAtMs = Date.now(); patch.rejectedBy = who.byName; patch.rejectReason = note; }
  if (TERMINAL_STATES.includes(to)) patch.closedAtMs = Date.now();

  await setDoc(doc(db, COL, needId), patch, { merge: true });
  await logNeedEvent(needId, to, note, who);
  return to;
}
