/**
 * نوع المنشأة ومناطق المطبخ المركزيّ ‹FNB-106› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * نصّ خطة القطاع صريح: «يجب ألّا يتم تعريف Central Kitchen **كمخزن فقط**،
 * وإنما كـCentral Production Unit» — ومنشأةٌ واحدة تخدم الشبكة كاملةً لا
 * مطبخًا لكلّ براند. وسيّد المستودعات اليوم لا يعرف إلّا نوعًا واحدًا ضمنيًّا:
 * مخزنٌ يستقبل ويصرف. فلا شيء في البيانات يقول «هذه المنشأة تُنتج».
 *
 * ═══ لماذا هنا لا في سيّدٍ ثانٍ ═══
 * المناطق الستّ (Freezer · Cold · Dry · Packing · Dispatch · Staging) **مواقع
 * تخزينٍ بأنواعها القائمة** لا كيانٌ جديد: `STORAGE_TYPES` فيه `frozen`
 * و`chilled` و`ambient` منذ خطة المواقع، و`shapeLocation` يقبلها. فالمنطقة
 * هنا **بذرةُ مواقع** تمرّ بالسيّد نفسه — ومن بنى سيّدَ مناطقَ ثانيًا صنع
 * تعريفين لنوع التبريد يفترقان يومًا.
 *
 * والنوع صفةٌ على سجلّ المستودع بترحيلٍ **صفر الأثر**: مستودعٌ بلا نوعٍ
 * مصرَّح هو `warehouse` — سلوك اليوم حرفيًّا.
 */
import { STORAGE_TYPES } from './locationsModel.js';
import { formatLocationCode } from './locationCode.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/* ═══════════════ ١. نوع المنشأة ═══════════════ */

/**
 * أنواع المنشآت وما تقدر عليه.
 * `produces` هو الحقل الحاسم: منشأةٌ تُنتج تقبل أوامر الإنتاج وصرف الموادّ
 * واستلام المنتَج (ق٤) — والمخزن العاديّ لا. وما عداه واحدٌ في الاثنين:
 * كلاهما يستقبل ويخزّن ويصرف، فالإنتاج **زيادةٌ لا استبدال**.
 */
export const FACILITY_TYPES = Object.freeze({
  warehouse: { id: 'warehouse', labelAr: 'مستودع', hint: 'يستقبل ويخزّن ويصرف', receives: true, stores: true, issues: true, produces: false },
  production_unit: {
    id: 'production_unit',
    labelAr: 'وحدة إنتاج مركزيّة',
    hint: 'مطبخٌ مركزيّ: يستقبل ويخزّن ويُنتج ويعبّئ ويشحن',
    receives: true,
    stores: true,
    issues: true,
    produces: true,
  },
});

/** النوع الافتراضيّ — سلوك اليوم حرفيًّا، فالترحيل بلا أثر. */
export const DEFAULT_FACILITY_TYPE = 'warehouse';

/** مرادفات النوع كما تُكتب في الشيتات. */
const TYPE_ALIASES = {
  warehouse: ['warehouse', 'wh', 'store', 'مستودع', 'مخزن'],
  production_unit: ['production', 'production unit', 'kitchen', 'central kitchen', 'مطبخ', 'مطبخ مركزي', 'مطبخ مركزيّ', 'وحدة إنتاج', 'إنتاج'],
};

/** يحوّل قيمةً مكتوبة بأيّ صيغة إلى نوعٍ معروف، أو `''` إن لم تُعرف. */
export function normalizeFacilityType(raw) {
  const s = str(raw).toLowerCase();
  if (!s) return '';
  for (const [id, aliases] of Object.entries(TYPE_ALIASES)) {
    if (id === s || aliases.includes(s)) return id;
  }
  return '';
}

/** نوع منشأةٍ من سجلّها. المجهول والفارغ ⇒ `warehouse`. */
export function facilityTypeOf(warehouse) {
  const raw = str(warehouse?.facilityType);
  if (FACILITY_TYPES[raw]) return raw;
  return normalizeFacilityType(raw) || DEFAULT_FACILITY_TYPE;
}

const can = (type, key) => Boolean(FACILITY_TYPES[type]?.[key] ?? FACILITY_TYPES[DEFAULT_FACILITY_TYPE][key]);

/** أتُنتج هذه المنشأة؟ — عليه تتوقّف أوامر الإنتاج (ق٤). */
export const producesGoods = (type) => can(type, 'produces');

/** وحدات الإنتاج من سيّد المستودعات — للقوائم والحرّاس. */
export function productionUnits(warehouses = []) {
  return (Array.isArray(warehouses) ? warehouses : [])
    .filter((w) => producesGoods(facilityTypeOf(w)))
    .map((w) => ({ code: up(w?.code), nameAr: str(w?.name || w?.nameAr) || up(w?.code) }))
    .filter((w) => w.code);
}

/**
 * حارس «مطبخٌ واحد يخدم الشبكة» (سطر 22 من المستند).
 * تعدُّدها ليس خطأً بنيويًّا يمنع — قد تتوسّع الشركة — لكنّه **قرارٌ يُعلَن**
 * لا يقع سهوًا بأن يُوسم مستودعٌ إنتاجًا وهو ليس كذلك.
 */
export function facilityWarnings(warehouses = []) {
  const units = productionUnits(warehouses);
  if (units.length <= 1) return [];
  return [
    `${units.length} وحدات إنتاج معرَّفة (${units.map((u) => u.code).join(' · ')}) — ` +
      'وخطة القطاع تنصّ على مطبخٍ مركزيٍّ واحد يخدم الشبكة كاملة. تأكّد أنّ التعدّد مقصود.',
  ];
}

/* ═══════════════ ٢. مناطق المطبخ الستّ ═══════════════ */

/**
 * المناطق الستّ من تصميم الـ1200م² في خطة القطاع، كلٌّ بنوع تخزينه من
 * `STORAGE_TYPES` القائم — لا نوعَ تخزينٍ جديد يُخترع.
 *
 * الثلاث الأولى **تخزينٌ** (بحرارتها)، والثلاث الأخيرة **مناطق تدفّقٍ**
 * تُعامَل تخزينًا عاديًّا لأنّ البضاعة تمرّ بها ولا تُقيم: التعبئة والتجهيز
 * والشحن. وتمييزها بالوسم `flow` لا بنوع تخزينٍ مخترَع.
 */
export const KITCHEN_ZONES = Object.freeze([
  { zone: 'FRZ', nameAr: 'التجميد (Freezer)', storageType: 'frozen', flow: false },
  { zone: 'CLD', nameAr: 'التبريد (Cold Storage)', storageType: 'chilled', flow: false },
  { zone: 'DRY', nameAr: 'التخزين الجافّ (Dry Storage)', storageType: 'ambient', flow: false },
  { zone: 'PCK', nameAr: 'التعبئة (Packing)', storageType: 'ambient', flow: true },
  { zone: 'STG', nameAr: 'التجهيز (Staging)', storageType: 'ambient', flow: true },
  { zone: 'DSP', nameAr: 'الشحن (Dispatch)', storageType: 'ambient', flow: true },
]);

/**
 * بذرةُ مواقعٍ للمناطق الستّ في منشأةٍ ما — تمرّ بسيّد المواقع نفسه
 * (`shapeLocation`/`locationProblems`) ولا تُكتب مباشرةً.
 * @returns {object[]} صفوفٌ جاهزة لسيّد المواقع
 */
export function kitchenZoneSeed(warehouseCode) {
  const wh = up(warehouseCode);
  if (!wh) return [];
  return KITCHEN_ZONES.map((z) => ({
    code: formatLocationCode({ warehouse: wh, zone: z.zone }),
    nameAr: z.nameAr,
    storageType: STORAGE_TYPES[z.storageType] ? z.storageType : 'ambient',
    status: 'active',
  })).filter((l) => l.code);
}

/** أنواع التخزين التي يجب أن تتوفّر في وحدة إنتاجٍ للأغذية. */
const REQUIRED_KITCHEN_TYPES = Object.freeze(['frozen', 'chilled', 'ambient']);

/**
 * ما ينقص وحدةَ إنتاجٍ من مناطق — يُنبَّه ولا يمنع: منشأةٌ تُجهَّز على مراحل
 * يجب ألّا تتوقّف عن العمل لأنّ منطقةً لم تُرمَّز بعد.
 */
export function kitchenZoneGaps(warehouseCode, locations = []) {
  const wh = up(warehouseCode);
  const mine = (Array.isArray(locations) ? locations : []).filter((l) => up(l?.warehouse) === wh || up(l?.code).startsWith(`${wh}-`));
  const have = new Set(mine.map((l) => str(l?.storageType) || 'ambient'));
  const missing = REQUIRED_KITCHEN_TYPES.filter((t) => !have.has(t));
  if (!missing.length) return [];
  const labels = missing.map((t) => STORAGE_TYPES[t]?.labelAr || t).join(' · ');
  return [`وحدة الإنتاج «${wh}» بلا مناطق: ${labels} — سلسلة التبريد لا تُحرَس بما لا يوجد.`];
}

/* ═══════════════ ٣. التدفّق المستهدَف ═══════════════ */

/**
 * `Receiving → Storage → Production → Packaging → Dispatch → Delivery`
 * — التدفّق الذي نصّت الخطة أن يكون **Workflow النظام نفسه** لا رسمًا في عرض.
 *
 * كلّ مرحلةٍ ومستنداتُها **الموجودة فعلًا اليوم**؛ ومرحلة الإنتاج معلَّقةٌ
 * صراحةً على `FNB-502` — فلا يَعِد هذا السجلّ بمستندٍ لم يُبنَ. ومن قرأه
 * عرف ما يعمل وما ينتظر، بلا أن يفتح الكود.
 */
export const KITCHEN_FLOW = Object.freeze([
  { id: 'receiving', labelAr: 'الاستلام', docTypes: ['GRN', 'QC'], pending: '' },
  { id: 'storage', labelAr: 'التخزين', docTypes: ['PUTAWAY'], pending: '' },
  { id: 'production', labelAr: 'الإنتاج', docTypes: [], pending: 'FNB-502' },
  { id: 'packaging', labelAr: 'التعبئة', docTypes: ['PACK'], pending: 'FNB-502' },
  { id: 'dispatch', labelAr: 'الشحن', docTypes: ['PICK', 'TRN', 'GP'], pending: '' },
  { id: 'delivery', labelAr: 'التسليم', docTypes: ['TRC', 'POD'], pending: '' },
]);

/** المراحل الجاهزة اليوم — وما ينتظر بناءً، بأسماء مهامّه. */
export function flowReadiness() {
  const ready = KITCHEN_FLOW.filter((s) => !s.pending && s.docTypes.length).map((s) => s.id);
  const pending = KITCHEN_FLOW.filter((s) => s.pending).map((s) => ({ stage: s.id, task: s.pending }));
  return { ready, pending };
}
