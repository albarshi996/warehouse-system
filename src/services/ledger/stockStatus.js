/**
 * حالة المخزون — بُعدٌ صريح بجانب الصنف والموقع والدفعة والصلاحية.
 *
 * ═══ الخطر الذي يحكم تصميم هذا الملفّ ═══
 *
 * الحالة اليوم **مُشفَّرة في الموقع**: `QUARANTINE` تعني مرفوضًا، و`RETURNS`
 * غير مفروز، و`MAINTENANCE` يحتاج إصلاحًا، و`SCRAP` مشطوبًا. فإدخال بُعد
 * «حالة» بلا حَدٍّ يخلق **مصدرين للحقيقة**: صنفٌ في `QUARANTINE` بحالة `OK`
 * — أيّهما يُصدَّق؟
 *
 * فالقاعدة الحاكمة هنا:
 *
 *   > قيم الحالة **يجب أن تكون منفصلة تمامًا** عمّا يُشفِّره موقعُ النظام.
 *
 * هذه الحالات تصف ما يمكن أن **يتعايش في الرفّ الواحد** ولا يُميّزه موقعٌ:
 * طردٌ سليم وطردٌ تالف على الرفّ نفسه. وما يستدعي **نقلًا** (حجر · إتلاف ·
 * صيانة) يبقى مسؤولية الموقع لا الحالة، ويحرسه اختبارٌ في هذا الملفّ.
 *
 * ⚠️ **مجموعة القيم تنتظر اعتماد المالك (LOC-O02).** حتى يُحسم، السلوك
 * الافتراضيّ المعلَن: `OK` وحدها فاعلة، والحقل **لا يدخل مفتاح الرصيد** —
 * فالترحيل صفرُ الأثر (LOC-108).
 */

import { SYSTEM_LOCATIONS } from './locations.js';

/** الحالة الافتراضية — والغياب يعني هذه، أي «سلوك اليوم حرفيًّا». */
export const DEFAULT_STOCK_STATUS = 'OK';

/**
 * سجلّ الحالات المقترَح. `active` تعني: مفعَّلةٌ الآن؟
 * الثلاث المقترَحة معطَّلةٌ حتى يعتمدها المالك — فلا تُكتب قيمةٌ لم يُقرّها أحد.
 */
export const STOCK_STATUSES = {
  OK: {
    id: 'OK',
    labelAr: 'سليم',
    active: true,
    sellable: true,
    hint: 'صالحٌ للبيع والصرف — الحالة الافتراضية لكلّ رصيد.',
  },
  HOLD: {
    id: 'HOLD',
    labelAr: 'موقوف',
    active: false,
    sellable: false,
    hint: 'موقوفٌ إداريًّا على الرفّ نفسه — لا يُخصَّص للصرف ولم يُنقل إلى الحجر.',
  },
  DAMAGED: {
    id: 'DAMAGED',
    labelAr: 'تالف',
    active: false,
    sellable: false,
    hint: 'طردٌ تالف يتعايش مع السليم في الرفّ نفسه — قبل قرار الإتلاف ونقله إلى SCRAP.',
  },
  EXPIRED: {
    id: 'EXPIRED',
    labelAr: 'منتهي الصلاحية',
    active: false,
    sellable: false,
    hint: 'انتهت صلاحيته ولم يُتلَف بعد — يُستثنى من التخصيص العاديّ.',
  },
};

/** الحالات المفعَّلة الآن — ما عداها مقترحٌ ينتظر LOC-O02. */
export function activeStatuses() {
  return Object.values(STOCK_STATUSES).filter((s) => s.active).map((s) => s.id);
}

/**
 * يُطبّع قيمة الحالة. الفارغ والمجهول وغير المفعَّل ⇒ `OK`.
 *
 * لماذا يسقط المجهول إلى `OK` ولا يُرفض؟ لأنّ الرفض يوقف قيدًا صحيحًا بسبب
 * حقلٍ وصفيّ — وحارسٌ يمنع ما يجب أن يمرّ أسوأ من الفجوة التي يسدّها. والقيمة
 * غير المعتمدة تُعرض في تقرير الانحراف لا تكسر الدورة.
 */
export function normalizeStockStatus(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return DEFAULT_STOCK_STATUS;
  const known = STOCK_STATUSES[v];
  return known && known.active ? known.id : DEFAULT_STOCK_STATUS;
}

/** هل هذه الحالة الافتراضية؟ (أي: لا أثر لها على المفتاح ولا على السلوك) */
export function isDefaultStatus(raw) {
  return normalizeStockStatus(raw) === DEFAULT_STOCK_STATUS;
}

/** أيُصرف هذا الرصيد في الصرف العاديّ؟ */
export function isSellableStatus(raw) {
  return STOCK_STATUSES[normalizeStockStatus(raw)]?.sellable !== false;
}

/** تسمية الحالة للعرض. */
export function stockStatusLabel(raw) {
  return STOCK_STATUSES[normalizeStockStatus(raw)]?.labelAr || 'سليم';
}

/**
 * 🔒 حارس ازدواج الحقيقة: قيمةُ حالةٍ تحمل اسم موقع نظام تخلق مصدرين
 * لمعلومةٍ واحدة. يُستدعى في الاختبار، ويُعيد أسماء المتصادمين.
 */
export function statusLocationCollisions() {
  const locationCodes = new Set(Object.keys(SYSTEM_LOCATIONS));
  return Object.keys(STOCK_STATUSES).filter((id) => locationCodes.has(id));
}
