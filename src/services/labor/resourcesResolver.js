/**
 * مُحلِّل الموارد التشغيليّة ‹EXE-401› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب ═══
 * المورد موزَّعٌ على ثلاثة سجلّات لا يعرف بعضها بعضًا: `crews` (فرق العمل) ·
 * `vehicles` مع `fleetModel` (المركبات ورحلاتها) · و`ASSET_CATEGORIES.handling`
 * في [`workOrderModel.js`](../maintenance/workOrderModel.js) (الرافعات ومعدّات
 * المناولة بدورة صيانتها). ولا واحد منها يقول: **من متاحٌ الآن؟ ومن مشغولٌ
 * بماذا؟ ومن متوقّف ولماذا؟**
 *
 * ═══ ولماذا مُحلِّلٌ لا سجلٌّ رابع ═══
 * سجلٌّ رابع يعني كتابةً رابعة تتقادم: فرقةٌ تُؤرشَف في `crews` وتبقى «متاحة»
 * في السجلّ الجديد. فالحالة **تُحسب عند القراءة** من المصادر الثلاثة، ولا
 * يُنسَخ منها حقلٌ واحد — والسابقة المعتمَدة `jobsResolver` في خطة الهيكل.
 *
 * ═══ ونقطة التوسعة معلَنة ═══
 * الروبوت والسير وأيّ جهازٍ قادم يدخلان بإضافة **مصدرٍ** إلى `RESOURCE_KINDS`
 * بلا لمس المنطق (`resolveResources` لا يعرف نوعًا بعينه). وهذا ما تعنيه
 * توصية `تطوير.md`: «جهّز الهيكل ولا تبنِ نظام روبوتاتٍ قبل وجود روبوت».
 */

import { doorOccupancy } from '../fleet/yardModel.js';
import { ASSET_CATEGORIES, OPEN_WO_STATES } from '../maintenance/workOrderModel.js';
import { crewSize } from './laborModel.js';

/**
 * أنواع الموارد — كلٌّ باسم مصدره القائم. **لا مجموعة Firestore جديدة.**
 * و`door` وصل مصدره في ت٦ ‹EXE-601›: سجلّ الأبواب `doors` وإشغالُه محسوبٌ من
 * زيارات الساحة عبر `doorOccupancy` — فسقط وسمُ `pending` بلا لمس المنطق،
 * وهذا هو معنى «نقطة التوسعة معلَنة».
 */
export const RESOURCE_KINDS = Object.freeze({
  crew: { id: 'crew', label: 'فرقة عمل', source: 'crews' },
  vehicle: { id: 'vehicle', label: 'مركبة', source: 'vehicles' },
  handling: { id: 'handling', label: 'معدّة مناولة', source: 'assets', assetCategory: 'handling' },
  door: { id: 'door', label: 'باب تحميل', source: 'doors' },
});

/**
 * حالات المورد — **محسوبةٌ لا مخزَّنة**.
 * `unknown` ليست حالةً رابعة بل إقرارٌ بأنّ المصدر لم يقل شيئًا — ولا تُعامَل
 * «متاحًا» فيُرسَل إليها عمل.
 */
export const RESOURCE_STATE = Object.freeze({
  available: { id: 'available', label: 'متاح', assignable: true },
  busy: { id: 'busy', label: 'مشغول', assignable: false },
  maintenance: { id: 'maintenance', label: 'تحت الصيانة', assignable: false },
  stopped: { id: 'stopped', label: 'متوقّف', assignable: false },
  unknown: { id: 'unknown', label: 'غير معلوم', assignable: false },
});

const s = (v) => String(v ?? '').trim();

/** مهامّ المناولة المشغولة الآن، مفهرسةً بالفرقة. */
function busyCrewTasks(laborTasks) {
  const map = new Map();
  for (const t of laborTasks || []) {
    if (t?.state !== 'in_progress' && t?.state !== 'paused') continue;
    if (!t.crewId) continue;
    if (!map.has(t.crewId)) map.set(t.crewId, t);
  }
  return map;
}

/** أوامر الشغل المفتوحة، مفهرسةً بالأصل. */
function openWorkOrders(workOrders) {
  const map = new Map();
  for (const w of workOrders || []) {
    if (!OPEN_WO_STATES.includes(w?.state)) continue;
    const key = s(w.assetId || w.assetCode || w.plate);
    if (key && !map.has(key)) map.set(key, w);
  }
  return map;
}

/** رحلاتٌ جارية، مفهرسةً باللوحة. */
function runningTrips(trips) {
  const map = new Map();
  for (const t of trips || []) {
    if (t?.state !== 'enroute' && t?.state !== 'gatepass') continue;
    const key = s(t.plateNo || t.plate || t.vehicleId);
    if (key && !map.has(key)) map.set(key, t);
  }
  return map;
}

/**
 * يحلّ الموارد من مصادرها.
 *
 * @param {object} sources `{ crews, vehicles, assets, laborTasks, workOrders, trips, doors, yardVisits, nowMs }`
 * @returns {Array} موردًا لكلّ صفٍّ في المصادر، بحالته وسببها ومهمّته الحاليّة
 */
export function resolveResources(sources = {}) {
  const {
    crews = [],
    vehicles = [],
    assets = [],
    laborTasks = [],
    workOrders = [],
    trips = [],
    doors = [],
    yardVisits = [],
    nowMs,
  } = sources;
  const busyCrews = busyCrewTasks(laborTasks);
  const openWO = openWorkOrders(workOrders);
  const onTrip = runningTrips(trips);
  const out = [];

  // ① فرق العمل — الأرشفة تُخرجها من الخدمة ولا تحذفها.
  for (const c of crews) {
    const task = busyCrews.get(c.id);
    const state = c.active === false ? 'stopped' : task ? 'busy' : 'available';
    out.push({
      id: `crew:${c.id}`,
      sourceId: c.id,
      kind: 'crew',
      label: `فرقة ${s(c.crewNo) || c.id}`,
      state,
      reason: c.active === false ? 'مؤرشَفة — خارج الخدمة' : task ? `مشغولة بمهمّة ${s(task.docRef?.number) || task.id}` : '',
      currentTaskId: task?.id || '',
      size: crewSize(c),
      shift: s(c.shift),
    });
  }

  // ② المركبات — الصيانة تسبق الرحلة: مركبةٌ في الورشة لا تُرسَل ولو كانت رحلتها مفتوحة.
  for (const v of vehicles) {
    // ⚠️ حقل اللوحة اسمه `plateNo` في سجلّ الأسطول — و`plate` في الرحلات.
    const key = s(v.plateNo || v.plate || v.id);
    const wo = openWO.get(key);
    const trip = onTrip.get(key);
    const state = wo ? 'maintenance' : trip ? 'busy' : v.status === 'stopped' ? 'stopped' : 'available';
    out.push({
      id: `vehicle:${v.id || key}`,
      sourceId: v.id || key,
      kind: 'vehicle',
      label: `مركبة ${key}`,
      state,
      reason: wo ? `أمر شغل مفتوح ${s(wo.number) || ''}`.trim() : trip ? `في رحلة ${s(trip.number) || trip.id}` : '',
      currentTaskId: trip?.id || '',
      plate: key,
    });
  }

  // ③ معدّات المناولة (الرافعات) — من ماستر الأصول بفئته.
  for (const a of assets) {
    if (s(a.category) !== ASSET_CATEGORIES.handling.id) continue;
    const key = s(a.code || a.id);
    const wo = openWO.get(key);
    out.push({
      id: `handling:${a.id || key}`,
      sourceId: a.id || key,
      kind: 'handling',
      label: s(a.name) || `معدّة ${key}`,
      state: wo ? 'maintenance' : a.active === false ? 'stopped' : 'available',
      reason: wo ? `أمر شغل مفتوح ${s(wo.number) || ''}`.trim() : a.active === false ? 'خارج الخدمة' : '',
      currentTaskId: '',
      code: key,
    });
  }

  // ④ أبواب التحميل ‹EXE-601› — إشغالها **محسوبٌ** من زيارات الساحة، وصيانتها
  //    من أوامر الشغل نفسها (بابٌ معطوبٌ أصلٌ كالرافعة). ولا حقلَ حالةٍ عليها.
  for (const door of doorOccupancy(doors, yardVisits, nowMs)) {
    const wo = openWO.get(door.code);
    const state = !door.active ? 'stopped' : wo ? 'maintenance' : door.occupied ? 'busy' : 'available';
    out.push({
      id: `door:${door.code}`,
      sourceId: door.code,
      kind: 'door',
      label: door.label || `باب ${door.code}`,
      state,
      reason: wo
        ? `أمر شغل مفتوح ${s(wo.number) || ''}`.trim()
        : !door.active
          ? 'خارج الخدمة'
          : door.occupied
            ? door.status
            : '',
      currentTaskId: '',
      code: door.code,
      plate: door.plate,
    });
  }

  return out;
}

/** أيصلح هذا المورد لعملٍ الآن؟ والمجهول **لا يصلح** — الشكّ لا يُرسِل عاملًا. */
export function isAssignable(resource) {
  return RESOURCE_STATE[resource?.state]?.assignable === true;
}

/** ترشيحٌ بالنوع والحالة. */
export function filterResources(resources, { kind, state, assignableOnly } = {}) {
  return (resources || []).filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (state && r.state !== state) return false;
    if (assignableOnly && !isAssignable(r)) return false;
    return true;
  });
}

/** لقطةٌ للوحة: كم متاحًا وكم مشغولًا وكم خارج الخدمة — لكلّ نوع. */
export function resourcesSnapshot(resources) {
  const byKind = {};
  const byState = {};
  for (const r of resources || []) {
    byKind[r.kind] = byKind[r.kind] || { total: 0, available: 0, busy: 0, out: 0 };
    byKind[r.kind].total += 1;
    if (r.state === 'available') byKind[r.kind].available += 1;
    else if (r.state === 'busy') byKind[r.kind].busy += 1;
    else byKind[r.kind].out += 1;
    byState[r.state] = (byState[r.state] || 0) + 1;
  }
  return {
    total: (resources || []).length,
    assignable: (resources || []).filter(isAssignable).length,
    byKind,
    byState,
  };
}

/** أنواعٌ معرَّفةٌ ولم يُبنَ مصدرها بعد — تُعلَن ولا تُخفى. */
export function pendingKinds() {
  return Object.values(RESOURCE_KINDS).filter((k) => k.pending).map((k) => k.id);
}
