/**
 * مسار توريد الصنف ‹FNB-203› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * «ليس كلّ صنفٍ يجب أن يمرّ بنفس المسار» (سطر 282) — وخمسةُ مساراتٍ نصّ
 * عليها المستند، ولا ذكرَ لـ`supplyRoute` في المستودع كلّه. فالدجاج المجمّد
 * القادم من مورّدٍ إلى المخزن المركزيّ، والخبز الطازج القادم يوميًّا إلى
 * الفرع مباشرةً — يسلكان اليوم الطريق نفسه في النظام، وهما لا يتشابهان.
 *
 * ═══ ★ المسار الثالث هو الخطر ═══
 * `Supplier → Restaurant Direct` (سطر 292) **يتخطّى المخزن والمطبخ**: الاستلام
 * يقع في الفرع لا في المستودع المركزيّ، فالقيد يقع على مستودع الفرع مباشرةً.
 * وهو ما أسقطته القراءة الأولى للمستند — وأثرُه في **القيد** لا في العرض:
 * من نسيه قيّد استلامًا في مخزنٍ لم تدخله البضاعة قطّ.
 *
 * ═══ الترحيل صفر الأثر ═══
 * الحقل يُضاف بنمط `itemShape.FIELD_CASTS` المنفَّذ مرّتين (`itemType`
 * و`baseUom`): صنفٌ بلا مسارٍ مصرَّح يسلك **المسار الافتراضيّ** — وهو
 * حرفيًّا سلوك اليوم (مورّد ← مخزن مركزيّ ← فرع).
 */
import { normalizeItemCode } from './itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/* ═══════════════ ١. العُقَد والمسارات ═══════════════ */

/** عُقَد المسار — أطرافُه الممكنة. */
export const ROUTE_NODES = Object.freeze({
  supplier: { id: 'supplier', labelAr: 'المورّد' },
  central_warehouse: { id: 'central_warehouse', labelAr: 'المخزن المركزيّ' },
  central_kitchen: { id: 'central_kitchen', labelAr: 'المطبخ المركزيّ' },
  restaurant: { id: 'restaurant', labelAr: 'الفرع/المطعم' },
});

/**
 * المسارات الخمسة نصًّا (أسطر 284–300)، ولكلٍّ سلسلتُه المستنديّة
 * **من المستندات المبنيّة فعلًا** — و`pending` يقول ما ينتظر بناءً،
 * فلا يَعِد السجلّ بما لم يُبنَ (نفس عقد `KITCHEN_FLOW`).
 */
export const SUPPLY_ROUTES = Object.freeze({
  supplier_wh_branch: {
    id: 'supplier_wh_branch',
    labelAr: 'مورّد ← مخزن مركزيّ ← فرع',
    nodes: ['supplier', 'central_warehouse', 'restaurant'],
    docChain: ['PR', 'PO', 'GRN', 'QC', 'PUTAWAY', 'TR', 'TRN', 'TRC'],
    receivesAtBranch: false,
    pending: '',
  },
  supplier_kitchen_branch: {
    id: 'supplier_kitchen_branch',
    labelAr: 'مورّد ← مطبخ مركزيّ ← فرع',
    nodes: ['supplier', 'central_kitchen', 'restaurant'],
    docChain: ['PR', 'PO', 'GRN', 'QC', 'PUTAWAY', 'TR', 'TRN', 'TRC'],
    receivesAtBranch: false,
    pending: 'FNB-502', // حلقة الإنتاج بين الاستلام والشحن.
  },
  // ★ المسار الذي أُسقط في القراءة الأولى — وأثرُه في القيد لا في العرض.
  supplier_direct: {
    id: 'supplier_direct',
    labelAr: 'مورّد ← الفرع مباشرةً',
    nodes: ['supplier', 'restaurant'],
    docChain: ['PR', 'PO', 'GRN', 'QC'],
    receivesAtBranch: true,
    pending: '',
  },
  wh_kitchen: {
    id: 'wh_kitchen',
    labelAr: 'مخزن مركزيّ ← مطبخ مركزيّ',
    nodes: ['central_warehouse', 'central_kitchen'],
    docChain: ['TR', 'TRN', 'TRC'],
    receivesAtBranch: false,
    pending: '',
  },
  kitchen_branch: {
    id: 'kitchen_branch',
    labelAr: 'مطبخ مركزيّ ← فرع',
    nodes: ['central_kitchen', 'restaurant'],
    docChain: ['TR', 'TRN', 'TRC'],
    receivesAtBranch: false,
    pending: 'FNB-502',
  },
});

/** المسار الافتراضيّ — سلوك اليوم حرفيًّا، فالترحيل بلا أثر. */
export const DEFAULT_ROUTE = 'supplier_wh_branch';

const ROUTE_ALIASES = {
  supplier_wh_branch: ['warehouse', 'central', 'مخزن', 'المخزن المركزي', 'عبر المخزن'],
  supplier_kitchen_branch: ['kitchen', 'مطبخ', 'عبر المطبخ', 'المطبخ المركزي'],
  supplier_direct: ['direct', 'supplier direct', 'مباشر', 'توريد مباشر', 'مباشرة', 'direct to branch'],
  wh_kitchen: ['wh to kitchen', 'مخزن الى مطبخ', 'مخزن إلى مطبخ'],
  kitchen_branch: ['kitchen to branch', 'مطبخ الى فرع', 'مطبخ إلى فرع'],
};

/** يحوّل مسارًا مكتوبًا بأيّ صيغة إلى معرّفه، أو `''` إن لم يُعرف. */
export function normalizeRoute(raw) {
  const s = str(raw).toLowerCase();
  if (!s) return '';
  if (SUPPLY_ROUTES[s]) return s;
  for (const [id, aliases] of Object.entries(ROUTE_ALIASES)) {
    if (aliases.includes(s)) return id;
  }
  return '';
}

/** مسار صنفٍ من سجلّه. المجهول والفارغ ⇒ الافتراضيّ. */
export function routeOf(item) {
  const raw = str(item?.supplyRoute);
  if (SUPPLY_ROUTES[raw]) return raw;
  return normalizeRoute(raw) || DEFAULT_ROUTE;
}

/** أيُستلم هذا الصنف في الفرع مباشرةً؟ — عليه يتوقّف موضعُ القيد. */
export function receivesAtBranch(item) {
  return Boolean(SUPPLY_ROUTES[routeOf(item)]?.receivesAtBranch);
}

/** سلسلة مستندات مسارٍ — من المبنيّ فعلًا. */
export function chainOf(routeId) {
  return SUPPLY_ROUTES[normalizeRoute(routeId) || DEFAULT_ROUTE]?.docChain || [];
}

/**
 * حكم موضع الاستلام ‹FNB-203› — **حيث يقع خطر المسار الثالث**.
 *
 * صنفٌ مسارُه «مباشر» يُستلم في مستودع الفرع؛ وصنفٌ عاديّ يُستلم في المخزن
 * المركزيّ. واستلامُ صنفٍ مباشرٍ في المخزن المركزيّ (أو العكس) **يُنبَّه
 * عليه ولا يُمنع**: قد يكون استثناءً مقصودًا، والمنعُ يوقف استلامًا واقعًا.
 *
 * @param {object[]} lines بنود المستند
 * @param {Map} itemsBySku فهرس الماستر
 * @param {{warehouse:string, branchWarehouses?:Set<string>|string[]}} ctx
 * @returns {string[]} تحذيراتٌ تسمّي البند بعينه
 */
export function receiptRouteWarnings(lines = [], itemsBySku = new Map(), ctx = {}) {
  const wh = up(ctx.warehouse);
  if (!wh) return [];
  const branchSet = new Set([...(ctx.branchWarehouses || [])].map(up));
  const isBranch = branchSet.has(wh);
  const out = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const sku = normalizeItemCode(line?.sku);
    if (!sku) continue;
    const item = itemsBySku.get(sku);
    if (!item) continue;
    const route = SUPPLY_ROUTES[routeOf(item)];
    if (route.receivesAtBranch && !isBranch && branchSet.size) {
      out.push(`«${sku}» مسارُه «${route.labelAr}» ويُستلم هنا في مخزنٍ مركزيّ — استلامٌ في مخزنٍ لم تدخله البضاعة يقلب الرصيد.`);
    } else if (!route.receivesAtBranch && isBranch) {
      out.push(`«${sku}» مسارُه «${route.labelAr}» ويُستلم هنا في فرع — تخطّى المخزن المركزيّ.`);
    }
  }
  return [...new Set(out)];
}

/* ═══════════════ ٢. الأصناف المعتمَدة للفرع ═══════════════ */

/**
 * الأصناف المعتمَدة لفرعٍ — **بلا تسجيل الفرع عميلًا**.
 *
 * كتالوج الأطراف (`itemPartnerCatalog`) نوعاه مورّد وعميل، وتسجيل الفرع
 * عميلًا **ممنوعٌ بحارسٍ صريح** (`internalBranchProblems`) لأنّه يجعل النقل
 * إليه بيعًا يفتح ذمّةً على أنفسنا. فالاعتماد هنا **قائمةٌ على صفّ الفرع**
 * كالمنيو — لا طرفٌ في كتالوجٍ لا يقبله.
 *
 * والقائمة الفارغة تعني **الكلّ مسموح** لا «لا شيء»: فرعٌ لم تُضبط أصنافه
 * بعد يطلب ما يشاء، ولا يتعطّل بانتظار ضبط.
 */
export function allowedItemsFor(branchProfile) {
  const list = (branchProfile?.allowedSkus || []).map(normalizeItemCode).filter(Boolean);
  return [...new Set(list)];
}

/** أمسموحٌ هذا الصنف لهذا الفرع؟ — والفارغة تعني الكلّ. */
export function isItemAllowed(branchProfile, sku) {
  const allowed = allowedItemsFor(branchProfile);
  if (!allowed.length) return true;
  return allowed.includes(normalizeItemCode(sku));
}

/**
 * أصنافٌ طُلبت ولم تُعتمد لهذا الفرع — تحذيرٌ يسمّيها ولا يمنع الطلب:
 * قد يكون احتياجًا طارئًا، ومنعُه يوقف مطعمًا عن العمل.
 */
export function unapprovedItems(branchProfile, lines = []) {
  if (!allowedItemsFor(branchProfile).length) return [];
  return [...new Set(
    (Array.isArray(lines) ? lines : [])
      .map((l) => normalizeItemCode(l?.sku))
      .filter((sku) => sku && !isItemAllowed(branchProfile, sku))
  )].sort();
}
