/**
 * حقول الطرف في رأس المستند — اختيارٌ من قوائم النظام لا كتابةٌ حرّة
 * (SAP-20 · طلب المالك 2026-08-14 · يُغلق الشقّ الحيّ من ف‑٤٤).
 *
 * ═══ طلب المالك حرفيًّا ═══
 * «عند إنشاء أيّ مستند يجب تحديد (المورد · العميل · المندوب · الفرع) من
 * القائمة التي في النظام، وعند الضغط *** تظهر القائمة الموجودة — يجب أن
 * يكون منبثقًا من الذين تمّ إنشاؤهم وتسهل عملية البحث».
 *
 * ═══ فالعقد ═══
 * كلّ حقل طرفٍ في المخطّطات يُعلَن هنا **مركزيًّا** (لا في ٣٨ مخطّطًا):
 * مصدره (ماستر الموردين · العملاء · المخازن · المركبات · المندوبين)،
 * وقرينه (اختيار المورّد يملأ رمزَه واسمَه معًا — فالهويّة مرجعيّةٌ لا
 * نصّان قد يفترقان). والبحث بالاحتواء في الرمز والاسم معًا، و`*` أو
 * `***` تعرض القائمة كلّها.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */

import { levelOf } from '../org/orgLocations.js';

const text = (v) => String(v ?? '').trim();

/**
 * إعلان حقول الطرف: المفتاح في المخطّط ← مصدره وقرينه.
 * `codeKey`/`nameKey`: الاختيار الواحد يملأهما معًا حين وُجدا في المخطّط.
 */
export const PARTY_FIELDS = Object.freeze({
  // المورّد: الرمز والاسم قرينان — أيّهما فُتح يملأ الآخر.
  supplier: { source: 'supplier', codeKey: 'supplierCode', nameKey: 'supplier' },
  supplierCode: { source: 'supplier', codeKey: 'supplierCode', nameKey: 'supplier' },
  // العميل كذلك.
  customer: { source: 'customer', codeKey: 'customerCode', nameKey: 'customer' },
  customerCode: { source: 'customer', codeKey: 'customerCode', nameKey: 'customer' },
  // المخزن/الفرع: قيمةٌ واحدة هي الرمز.
  warehouse: { source: 'warehouse', codeKey: 'warehouse', nameKey: null },
  fromWarehouse: { source: 'warehouse', codeKey: 'fromWarehouse', nameKey: null },
  toWarehouse: { source: 'warehouse', codeKey: 'toWarehouse', nameKey: null },
  returningBranch: { source: 'warehouse', codeKey: 'returningBranch', nameKey: null },
  // المندوب: القيمة اسمه (كما تكتبه المستندات القائمة — لا كسر توافق).
  repName: { source: 'rep', codeKey: 'repName', nameKey: null },
  rep: { source: 'rep', codeKey: 'rep', nameKey: null },
  // المركبة: اللوحة — من جرد المركبات.
  vehiclePlate: { source: 'vehicle', codeKey: 'vehiclePlate', nameKey: null },
  // ‹FNB-102› مركز التكلفة: من سيّد المواقع التنظيميّة (قطاع › براند › فرع ›
  // مركز تكلفة) — به يتحقّق توجيه المدير العام «الصرف على الفرع المستفيد
  // لا على القطاع عامّةً». القيمة الرمز وحده؛ والاسم والمستوى للعرض.
  costCenter: { source: 'orgLocation', codeKey: 'costCenter', nameKey: null },
});

/** إعلان حقلٍ ما، أو null لغير حقول الطرف. */
export function partyFieldFor(key) {
  return PARTY_FIELDS[key] || null;
}

/**
 * خيارات مصدرٍ ما من القوائم الحيّة — بشكلٍ موحّد {code, name}.
 * المؤرشف لا يُعرض: لا يُبنى مستندٌ جديد على طرفٍ مُقفل.
 */
export function partyOptions(source, { suppliers = [], customers = [], warehouses = [], reps = [], vehicles = [], orgLocations = [] } = {}) {
  const alive = (list) => list.filter((r) => !r?.archived);
  switch (source) {
    case 'supplier':
      return alive(suppliers).map((s) => ({ code: text(s.code), name: text(s.nameAr || s.nameEn) }));
    case 'customer':
      return alive(customers).map((c) => ({ code: text(c.code), name: text(c.nameAr || c.nameEn) }));
    case 'warehouse':
      return alive(warehouses).map((w) => ({ code: text(w.code || w.id), name: text(w.nameAr || w.name) }));
    case 'rep':
      // المصدر ماستر المندوبين (SAP-21): صفوفه {name, active, archived} —
      // ويقبل توافقًا صفوف دليل المستخدمين القديمة (فيها role).
      return alive(reps)
        .filter((u) => u?.active !== false && (u?.role ? u.role === 'sales_rep' : true))
        .map((u) => ({ code: text(u.name || u.email), name: text(u.name || u.email) }));
    case 'vehicle':
      return alive(vehicles).map((v) => ({ code: text(v.plate || v.plateNo || v.id), name: text(v.nameAr || v.model || '') }));
    case 'orgLocation':
      // «الاسم (المستوى)» — فمن يبحث «فرع» يجد الفروع كلّها. والمعطَّل لا
      // يُعرض: لا يُبنى مستندٌ جديد على فرعٍ مُقفل (نفس عقد المؤرشف).
      return (orgLocations || [])
        .filter((l) => l?.active !== false)
        .map((l) => ({ code: text(l.code), name: `${text(l.nameAr) || text(l.code)} (${levelOf(l.level)?.labelAr || l.level})` }));
    default:
      return [];
  }
}

/**
 * البحث في القائمة: احتواءٌ في الرمز والاسم معًا، و`*`/`***` تعرض الكلّ
 * (طلب المالك: «عند الضغط *** تظهر القائمة»). الفارغ يعرض الكلّ أيضًا —
 * فالتركيز على الحقل يفتح القائمة بلا طقوس.
 */
export function filterPartyOptions(options, term, max = 30) {
  const t = text(term);
  const all = t === '' || /^\*+$/.test(t);
  const needle = t.toLowerCase();
  const list = all
    ? options
    : options.filter((o) =>
        [o.code, o.name].filter(Boolean).some((f) => f.toLowerCase().includes(needle))
      );
  return list.slice(0, max);
}

/**
 * أثر الاختيار على الرأس: قائمة تحديثات {key, value} — الرمزُ والاسمُ معًا
 * حين يكون للحقل قرين، فلا يبقى اسمٌ بلا رمزٍ أو رمزٌ بلا اسم (ف‑٤٤).
 */
export function applyPartySelection(fieldKey, option) {
  const decl = partyFieldFor(fieldKey);
  if (!decl || !option) return [];
  const patches = [{ key: decl.codeKey, value: text(option.code) }];
  if (decl.nameKey && decl.nameKey !== decl.codeKey) {
    patches.push({ key: decl.nameKey, value: text(option.name) });
  }
  return patches;
}
