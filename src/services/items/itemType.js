/**
 * نوع الصنف: بيع · داخليّ · خدمة (م٣-أ · يسدّ ف‑٤ب).
 *
 * ═══ العطب ═══
 * كلّ صنفٍ اليوم يُعامَل بضاعةً مخزنيّة. فإن أُضيف «رسوم نقل» صنفًا ودخل مستندًا
 * بكمّيّة ١، **بنى له الدفتر رصيدًا** — فتظهر بضاعةٌ وهميّة في الجرد، ويعدّها
 * أمين المخزن فلا يجدها، ويُفتح محضر عجزٍ عن شيءٍ لم يوجد قطّ.
 *
 * ═══ الترحيل لا يغيّر رقمًا واحدًا ═══
 * `typeOf` يُعيد `sale` لكلّ صنفٍ بلا نوع — أي **سلوك اليوم حرفيًّا**. فالترحيل
 * صفرُ أثر، ثمّ يُعيد المالك تصنيف ما يلزم من الشاشة صنفًا صنفًا. ولا حاجة إلى
 * تشغيل سكربتٍ على قاعدة البيانات ولا إلى يوم توقّف.
 *
 * ═══ الحرّاس هنا قرارات لا اكتشافات ═══
 * منع الصنف الداخليّ في أمر بيع يُقرأ من `settings.items` (م١-ج) لا من الكود:
 * المالك يخفّفه إلى تنبيهٍ أو يفتحه، ويُنقل دور فكّ المنع، بلا نشرةِ إصدار.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { internalItemInSaleVerdict } from '../settings/settingsModel.js';

/**
 * الأنواع الثلاثة وسلوك كلٍّ منها.
 * `stocked` هو الحقل الحاسم: ما لا يُخزَّن لا يُقيَّد في الدفتر ولا يظهر في جرد.
 */
export const ITEM_TYPES = Object.freeze({
  sale: { id: 'sale', label: 'بيع', hint: 'البضاعة المعتادة', stocked: true, sellable: true, movable: true },
  internal: {
    id: 'internal',
    label: 'نقل أو داخليّ',
    hint: 'مواد تغليف · قطع غيار · مواد تشغيل',
    stocked: true,
    sellable: false,
    movable: true,
  },
  service: {
    id: 'service',
    label: 'خدمة',
    hint: 'نقل · تركيب · مناولة · رسوم',
    stocked: false,
    sellable: true,
    movable: false,
  },
});

/** النوع الافتراضيّ — سلوك اليوم حرفيًّا، فالترحيل بلا أثر. */
export const DEFAULT_ITEM_TYPE = 'sale';

/** خيارات الشاشة — مصدرٌ واحد فلا تنحرف القائمة عن المنطق. */
export const ITEM_TYPE_OPTIONS = Object.values(ITEM_TYPES).map((t) => ({
  value: t.id,
  label: t.label,
  hint: t.hint,
}));

/**
 * مرادفات النوع كما تُكتب فعلًا في شيتات المالك.
 * بلا هذا التطبيع يكتب أمين البيانات «خدمة» في العمود فيسقط صامتًا إلى «بيع»،
 * ويظنّ أنّه صنّف مئة صنفٍ وهو لم يصنّف واحدًا — وهو أسوأ من ألّا يُصنَّف شيء.
 */
const TYPE_ALIASES = {
  sale: ['sale', 'sales', 'goods', 'stock', 'بيع', 'مبيعات', 'بضاعة', 'بضاعه', 'صنف بيع'],
  internal: ['internal', 'transfer', 'consumable', 'داخلي', 'داخليّ', 'نقل', 'تشغيل', 'مواد تشغيل', 'تغليف', 'قطع غيار'],
  service: ['service', 'services', 'fee', 'charge', 'خدمة', 'خدمه', 'خدمات', 'رسوم', 'رسم', 'أجرة'],
};

/** يحوّل قيمةً مكتوبة بأيّ صيغة إلى نوعٍ معروف، أو `''` إن لم تُعرف. */
export function normalizeItemType(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  for (const [id, aliases] of Object.entries(TYPE_ALIASES)) {
    if (id === s || aliases.includes(s)) return id;
  }
  return '';
}

/** نوع صنفٍ من سجلّه. المجهول والفارغ والفاسد ⇒ `sale`. */
export function typeOf(item) {
  const raw = String(item?.itemType ?? '').trim();
  if (ITEM_TYPES[raw]) return raw;
  return normalizeItemType(raw) || DEFAULT_ITEM_TYPE;
}

const flag = (type, key) => Boolean(ITEM_TYPES[type]?.[key] ?? ITEM_TYPES[DEFAULT_ITEM_TYPE][key]);

/** أيُقيَّد مخزنيًّا؟ الخدمة لا. */
export const isStocked = (type) => flag(type, 'stocked');
/** أيُباع؟ الداخليّ لا. */
export const isSellable = (type) => flag(type, 'sellable');
/** أيُنقل بين المواقع؟ الخدمة لا — ولا تُحمَّل على مركبة. */
export const isMovable = (type) => flag(type, 'movable');

/**
 * خريطة `sku → نوع` من ماستر الأصناف.
 * الرموز بحروفٍ كبيرة لأنّ البنود تكتبها كيفما اتّفق.
 */
export function itemTypeMap(items = []) {
  const map = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const sku = String(it?.sku ?? '').trim().toUpperCase();
    if (sku) map.set(sku, typeOf(it));
  }
  return map;
}

/** نوع بندٍ من الخريطة. ما ليس في الماستر يُعامَل `sale` — لا نمنع بسبب جهلنا. */
export function lineType(line, typeMap) {
  const sku = String(line?.sku ?? line?.itemCode ?? '').trim().toUpperCase();
  if (!sku || !typeMap) return DEFAULT_ITEM_TYPE;
  const get = typeMap instanceof Map ? typeMap.get(sku) : typeMap[sku];
  return ITEM_TYPES[get] ? get : DEFAULT_ITEM_TYPE;
}

/**
 * البنود التي تُقيَّد مخزنيًّا — تُستدعى من `buildMoves`.
 * غياب الخريطة يعني سلوك اليوم: الكلّ يُقيَّد. فالميزة تُفعَّل بالبيانات لا بالنشر.
 */
export function stockableLines(lines = [], typeMap = null) {
  if (!typeMap) return Array.isArray(lines) ? lines : [];
  return (Array.isArray(lines) ? lines : []).filter((l) => isStocked(lineType(l, typeMap)));
}

/** البنود الخدميّة — تُحتسب قيمةً ولا تُقيَّد. */
export function serviceLines(lines = [], typeMap = null) {
  if (!typeMap) return [];
  return (Array.isArray(lines) ? lines : []).filter((l) => lineType(l, typeMap) === 'service');
}

/**
 * حارس أمر البيع: صنفٌ داخليّ لا يُباع (القرار ٤).
 * السياسة والدور من الإعدادات — والرسالة تسمّي البند بعينه لا «خطأ ما».
 *
 * @returns {{ok:boolean, problems:string[], warnings:string[]}}
 */
export function sellableProblems(lines = [], typeMap = null, settings = null, role = '') {
  const problems = [];
  const warnings = [];
  if (!typeMap) return { ok: true, problems, warnings };

  const verdict = internalItemInSaleVerdict(settings, role);
  (Array.isArray(lines) ? lines : []).forEach((l, i) => {
    if (isSellable(lineType(l, typeMap))) return;
    const name = String(l?.sku || l?.description || `البند ${i + 1}`).trim();
    const text = `${name}: صنفٌ داخليّ لا يُباع. ${verdict.message}`;
    if (verdict.allowed) warnings.push(text);
    else problems.push(text);
  });
  return { ok: problems.length === 0, problems, warnings };
}

/**
 * حارس التحميل على المركبة: الخدمة لا تُحمَّل.
 * «رسوم توصيل» على مركبةٍ تعني رصيدًا وهميًّا يطارده المندوب في تسويته.
 */
export function loadableProblems(lines = [], typeMap = null) {
  const problems = [];
  if (!typeMap) return { ok: true, problems };
  (Array.isArray(lines) ? lines : []).forEach((l, i) => {
    if (isMovable(lineType(l, typeMap))) return;
    const name = String(l?.sku || l?.description || `البند ${i + 1}`).trim();
    problems.push(`${name}: خدمةٌ لا تُحمَّل على مركبة ولا تُنقل بين المواقع.`);
  });
  return { ok: problems.length === 0, problems };
}

/**
 * أنواع المستندات التي **تُخرج الملكيّة** — يُمنع فيها الصنف الداخليّ.
 * قائمةٌ صريحة لا اشتقاقٌ من قواعد القيد: «يُخرج ملكيّة» غير «يُخرج مخزونًا»،
 * فالنقل بين مستودعَينا يُخرج مخزونًا ولا يبيع شيئًا.
 */
export const OWNERSHIP_DOC_TYPES = ['SO', 'DN', 'POD', 'INV', 'VSI', 'VCS'];

/** أنواعٌ تُحمِّل مركبةً أو تُودع عند عميل — لا تحمل خدمة. */
export const VEHICLE_LOAD_TYPES = ['VLD', 'VCD', 'CRN', 'VRT', 'VCR'];

/**
 * الحارس الجامع للمستند: يختار الفحص المناسب لنوعه.
 * موضعٌ واحد يُسأل من المحرّك، فلا تتفرّق القوائم في الشاشات.
 */
export function documentItemProblems(docType, lines, typeMap, settings, role) {
  const out = { ok: true, problems: [], warnings: [] };
  if (OWNERSHIP_DOC_TYPES.includes(docType)) {
    const v = sellableProblems(lines, typeMap, settings, role);
    out.problems.push(...v.problems);
    out.warnings.push(...v.warnings);
  }
  if (VEHICLE_LOAD_TYPES.includes(docType)) {
    out.problems.push(...loadableProblems(lines, typeMap).problems);
  }
  out.ok = out.problems.length === 0;
  return out;
}

/** إحصاءٌ للشاشة: كم صنفًا من كلّ نوع، وكم بلا تصنيفٍ صريح. */
export function itemTypeStats(items = []) {
  const counts = { sale: 0, internal: 0, service: 0 };
  let untyped = 0;
  for (const it of Array.isArray(items) ? items : []) {
    counts[typeOf(it)] += 1;
    if (!ITEM_TYPES[String(it?.itemType ?? '').trim()]) untyped += 1;
  }
  return { counts, untyped, total: (items || []).length };
}
