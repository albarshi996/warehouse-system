/**
 * منطقُ **أصول إدارة المستودعات وعهدِها** — خالصٌ بلا DOM ولا Firestore.
 *
 * ═══ ★★★ ولماذا منظارٌ لا سجلٌّ رابع؟ ═══
 * في البوّابة ثلاثةُ سجلّاتٍ تتكلّم عن الأشياء: `department_assets` (ما
 * تملكه الإدارات) و`custodies` (ما يحمله الموظّف بسندٍ موقَّع)
 * و`warehouse_assets` (جردُ فينسيا). ورابعٌ يعني أنّ الـPDA الواحد يُسجَّل
 * في أربعة مواضعَ تتفارق. فهذا الملفّ **يجمع ولا يُنشئ**: يحصر أصولَ
 * الإدارة من سجلّها، ويربطها بعهدِها، ويقول ما لم يرتبط.
 *
 * ═══ ★★★ والثقبُ الحقيقيُّ أنّ العهدةَ لا تعرف رقمَ الأصل ═══
 * سندُ العهدة يصف الجهازَ نصًّا (`itemDesc`) ولا يحمل رقمًا. فسؤالُ «من
 * يحمل BRZ-0042؟» بلا جواب، والجهازُ الواحدُ مسجَّلٌ مرّتين ولا شيءَ
 * يربطهما. فـ`assetNo` على السند هو المفتاح، و`holderOf` هو الجواب.
 *
 * ═══ ★★★ وحقلُ الإدارة نصٌّ حرٌّ فالأخطاءُ واردة ═══
 * شاشةُ الأصول تقترح «مخازن» وهيكلُ الشركة يقول «إدارة السلاسل والإمداد
 * والمخازن». ومنظارٌ يُصفّي على نصٍّ واحدٍ **يُخفي** ما كُتب بغيره ولا
 * يشتكي. فـ`splitByDepartment` تُعيد ثلاثَ مجموعات، وفيها **`nearMiss`**:
 * ما يشبه الإدارةَ ولم يُطابق — يُعرض ليُصحَّح لا ليختفي.
 */

/** الاسمُ المعروض للإدارة. */
export const WH_DEPARTMENT_LABEL = 'إدارة المستودعات';

/**
 * القيمُ التي تعني هذه الإدارةَ في حقل `department` الحرّ.
 * مجمّدةٌ، وتُمرَّر للدوالّ فتُوسَّع من الشاشة بلا تعديل كود.
 */
export const WH_DEPARTMENT_VALUES = Object.freeze([
  'مخازن',
  'المخازن',
  'المستودعات',
  'إدارة المستودعات',
  'إدارة السلاسل والإمداد والمخازن',
  'قسم عمليات المستودعات',
]);

/** كلماتٌ تجعل القيمةَ «قريبةً» فتُعرض للتصحيح بدل أن تختفي. */
const NEAR_WORDS = ['مخزن', 'مخازن', 'مستودع', 'المستودعات', 'سلاسل', 'إمداد', 'امداد'];

/** تطبيعٌ للمقارنة: فراغاتٌ ومحارفُ تشكيلٍ وهمزاتٌ تختلف ولا تُغيّر المعنى. */
export function normDept(value) {
  return String(value ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** هل إدارةُ هذا الأصل من قيم الإدارة؟ */
export function matchesWhDepartment(asset, values = WH_DEPARTMENT_VALUES) {
  const d = normDept(asset?.department);
  if (!d) return false;
  return (values ?? []).some((v) => normDept(v) === d);
}

/** هل تُشبه الإدارةَ ولم تُطابق؟ (فتُعرض للتصحيح) */
export function isNearDepartment(asset, values = WH_DEPARTMENT_VALUES) {
  if (matchesWhDepartment(asset, values)) return false;
  const d = normDept(asset?.department);
  if (!d) return false;
  return NEAR_WORDS.some((w) => d.includes(normDept(w)));
}

/**
 * يقسم الجردَ ثلاثًا: ما يخصّ الإدارة · ما يشبهها ولم يُطابق · ما سواه.
 * ★ والمكهَّنُ يبقى في مجموعته ويُصفَّى في العرض — فالتكهينُ حالةٌ لا إدارة.
 */
export function splitByDepartment(assets, values = WH_DEPARTMENT_VALUES) {
  const inside = [];
  const nearMiss = [];
  const outside = [];
  for (const a of assets ?? []) {
    if (matchesWhDepartment(a, values)) inside.push(a);
    else if (isNearDepartment(a, values)) nearMiss.push(a);
    else outside.push(a);
  }
  return { inside, nearMiss, outside };
}

/* ═══════════ المعدّات: «التفاصيل المملّة» تتوسّع بلا تغيير بنية ═══════════ */

/**
 * أنواعُ المعدّات وحقولُ كلٍّ منها.
 *
 * ★★★ والحقولُ **بيانٌ لا كود**: إضافةُ نوعٍ أو حقلٍ سطرٌ هنا، فتظهر في
 * النموذج والجدول والتصدير معًا. ولو كُتبت في المكوّن لَوجب تعديلُ ثلاثة
 * مواضعَ لكلّ حقلٍ جديد، ولَافترقت — وهو عينُ ما يقع حين يُكرَّر البيان.
 */
export const EQUIPMENT_KINDS = Object.freeze([
  {
    id: 'rack',
    label: 'رفّ تخزين',
    fields: [
      { key: 'bay', label: 'الممرّ / الموقع' },
      { key: 'levels', label: 'عدد المستويات', numeric: true },
      { key: 'capacityKg', label: 'حمولة المستوى (كجم)', numeric: true },
      { key: 'dims', label: 'المقاس (طول×عرض×ارتفاع)' },
    ],
  },
  {
    id: 'pallet',
    label: 'طبليّة',
    fields: [
      { key: 'palletType', label: 'النوع (خشب / بلاستيك / حديد)' },
      { key: 'dims', label: 'المقاس' },
      { key: 'capacityKg', label: 'الحمولة (كجم)', numeric: true },
    ],
  },
  {
    id: 'trolley',
    label: 'عربة مناولة',
    fields: [
      { key: 'trolleyType', label: 'النوع (يدويّة / هيدروليّة)' },
      { key: 'capacityKg', label: 'الحمولة (كجم)', numeric: true },
    ],
  },
  {
    id: 'forklift',
    label: 'رافعة شوكيّة',
    fields: [
      { key: 'model', label: 'الموديل' },
      { key: 'chassis', label: 'رقم الهيكل' },
      { key: 'power', label: 'الطاقة (ديزل / غاز / كهرباء)' },
      { key: 'capacityKg', label: 'الحمولة (كجم)', numeric: true },
      { key: 'hours', label: 'ساعات التشغيل', numeric: true },
    ],
  },
  {
    id: 'handheld',
    label: 'جهاز مسح محمول (PDA)',
    fields: [
      { key: 'model', label: 'الموديل' },
      { key: 'serial', label: 'الرقم التسلسليّ' },
      { key: 'imei', label: 'IMEI' },
      { key: 'os', label: 'النظام' },
    ],
  },
  {
    id: 'printer',
    label: 'طابعة ملصقات',
    fields: [
      { key: 'model', label: 'الموديل' },
      { key: 'serial', label: 'الرقم التسلسليّ' },
      { key: 'connection', label: 'الوصل (بلوتوث / USB / شبكة)' },
      { key: 'labelWidth', label: 'عرض الملصق (مم)', numeric: true },
    ],
  },
  {
    id: 'computer',
    label: 'حاسوب أو لوحيّ',
    fields: [
      { key: 'model', label: 'الموديل' },
      { key: 'serial', label: 'الرقم التسلسليّ' },
      { key: 'cpu', label: 'المعالج' },
      { key: 'ram', label: 'الذاكرة (جيجا)', numeric: true },
    ],
  },
  {
    id: 'phone',
    label: 'هاتف عمل',
    fields: [
      { key: 'model', label: 'الموديل' },
      { key: 'imei', label: 'IMEI' },
      { key: 'simNumber', label: 'رقم الشريحة' },
    ],
  },
  {
    id: 'handtool',
    label: 'عدّة يدويّة',
    fields: [
      { key: 'toolType', label: 'النوع' },
      { key: 'count', label: 'العدد في الطقم', numeric: true },
    ],
  },
  { id: 'other', label: 'أخرى', fields: [] },
]);

const KIND_BY_ID = new Map(EQUIPMENT_KINDS.map((k) => [k.id, k]));

/** تعريفُ النوع، أو `null` — والمجهولُ لا يُفترض «أخرى». */
export const equipmentKind = (id) => KIND_BY_ID.get(id) || null;

/** اسمُ النوع للعرض. */
export const equipmentLabel = (id) => KIND_BY_ID.get(id)?.label || 'غير محدَّد';

/** حقولُ النوع — ومجهولٌ يُعيد فراغًا لا يرمي. */
export const specFields = (id) => KIND_BY_ID.get(id)?.fields ?? [];

/** يُنقّي المواصفاتِ على حقول النوع — فما لا ينتمي إليه لا يُخزَّن. */
export function cleanSpecs(kindId, specs) {
  const out = {};
  for (const f of specFields(kindId)) {
    const raw = specs?.[f.key];
    const v = String(raw ?? '').trim();
    if (v) out[f.key] = v;
  }
  return out;
}

/**
 * حكمٌ على المواصفات: الحقولُ الرقميّةُ أرقامٌ غيرُ سالبة.
 * ولا حقلَ **مطلوب**: «التفاصيلُ المملّة» تُستكمل مع الوقت، ومنعُ الحفظ
 * حتّى تكتمل يجعل الموظّفَ يترك التسجيلَ كلَّه.
 */
export function specVerdict(kindId, specs) {
  const problems = [];
  if (kindId && !equipmentKind(kindId)) problems.push(`نوعُ معدّةٍ غير معروف: «${kindId}»`);
  for (const f of specFields(kindId)) {
    if (!f.numeric) continue;
    const raw = specs?.[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) problems.push(`${f.label}: رقمٌ غيرُ سالب.`);
  }
  return { ok: problems.length === 0, problems };
}

/** وصفُ المواصفات نصًّا للعرض والتصدير — «الموديل: X · IMEI: Y». */
export function describeSpecs(kindId, specs) {
  return specFields(kindId)
    .map((f) => {
      const v = String(specs?.[f.key] ?? '').trim();
      return v ? `${f.label}: ${v}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/* ═══════════ العهد: من يحمل ماذا ═══════════ */

/** حالاتٌ تعني أنّ العهدةَ ما زالت بيد صاحبها. */
export const OPEN_CUSTODY_STATES = Object.freeze(['active']);

/** هل هذه العهدةُ مفتوحةٌ (بيد الموظّف الآن)؟ */
export const isOpenCustody = (c) => OPEN_CUSTODY_STATES.includes(String(c?.state ?? ''));

/** رقمُ الأصل الذي تشير إليه عهدةٌ ما، أو `''`. */
export const custodyAssetNo = (c) => String(c?.assetNo ?? '').trim();

/**
 * فهرسُ العهد برقم الأصل. يشمل المغلقةَ أيضًا — فتاريخُ من حمل الجهازَ
 * سابقًا جزءٌ من تتبّعه.
 */
export function custodyIndex(custodies) {
  const map = new Map();
  for (const c of custodies ?? []) {
    const no = custodyAssetNo(c);
    if (!no) continue;
    const list = map.get(no) || [];
    list.push(c);
    map.set(no, list);
  }
  return map;
}

/**
 * من يحمل هذا الأصلَ الآن: العهدةُ المفتوحة، أو `null`.
 * ★ وعهدتان مفتوحتان لنفس الأصل **تناقضٌ يُقال** لا يُختار أحدُهما صامتًا.
 */
export function holderOf(asset, index) {
  const list = index instanceof Map ? index.get(String(asset?.id ?? '').trim()) || [] : [];
  const open = list.filter(isOpenCustody);
  if (!open.length) return null;
  return {
    custody: open[0],
    employeeName: String(open[0].employeeName ?? '').trim(),
    conflict: open.length > 1 ? open.length : 0,
  };
}

/** تاريخُ حَمَلة الأصل — الأحدثُ أوّلًا. */
export function custodyHistory(asset, index) {
  const list = index instanceof Map ? index.get(String(asset?.id ?? '').trim()) || [] : [];
  return [...list].sort((a, b) => String(b.issueDate ?? '').localeCompare(String(a.issueDate ?? '')));
}

/**
 * تقريرُ الربط: ما ارتبط، وما بقي بلا حامل، **وعهدٌ تشير إلى رقمٍ لا وجودَ
 * له** — وهذه أخطرُها: سندٌ موقَّعٌ على جهازٍ غيرِ مسجَّلٍ في الجرد.
 */
export function linkReport(assets, custodies) {
  const index = custodyIndex(custodies);
  const known = new Set((assets ?? []).map((a) => String(a.id ?? '').trim()).filter(Boolean));
  const held = [];
  const free = [];
  for (const a of assets ?? []) {
    (holderOf(a, index) ? held : free).push(a);
  }
  const withNo = (custodies ?? []).filter((c) => custodyAssetNo(c));
  return {
    held,
    free,
    /** عهدٌ بلا رقمِ أصلٍ — لا يُعرف أيُّ جهازٍ بعينه تخصّ. */
    unlinked: (custodies ?? []).filter((c) => !custodyAssetNo(c) && isOpenCustody(c)),
    /** عهدٌ ترقِّم أصلًا غيرَ موجودٍ في الجرد. */
    danglingAssetNos: [
      ...new Set(withNo.map(custodyAssetNo).filter((no) => !known.has(no))),
    ],
  };
}

/** لقطةُ الطبقة الثانية. */
export function whSnapshot(assets, custodies, values = WH_DEPARTMENT_VALUES) {
  const split = splitByDepartment(assets, values);
  const live = split.inside.filter((a) => !a.archived);
  const link = linkReport(live, custodies);
  const byKind = new Map();
  for (const a of live) {
    const k = a.equipmentKind || 'other';
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  return {
    assets: live.length,
    archived: split.inside.length - live.length,
    nearMiss: split.nearMiss.length,
    held: link.held.length,
    free: link.free.length,
    unlinkedCustodies: link.unlinked.length,
    dangling: link.danglingAssetNos.length,
    byKind: [...byKind.entries()].sort((x, y) => y[1] - x[1]),
  };
}

/** تصفيةُ الفهرس. */
export function filterWh(
  assets,
  { q = '', kind = '', condition = '', holder = '', includeArchived = false, heldOnly = false, freeOnly = false } = {},
  index = new Map()
) {
  const term = String(q ?? '').trim().toLowerCase();
  return (assets ?? []).filter((a) => {
    if (!includeArchived && a.archived) return false;
    if (kind && (a.equipmentKind || 'other') !== kind) return false;
    if (condition && a.condition !== condition) return false;
    const h = holderOf(a, index);
    if (heldOnly && !h) return false;
    if (freeOnly && h) return false;
    if (holder && (!h || !h.employeeName.includes(holder))) return false;
    if (!term) return true;
    const hay = [
      a.id,
      a.assetName,
      a.assetType,
      a.brand,
      a.serial,
      a.location,
      a.section,
      a.responsible,
      a.notes,
      equipmentLabel(a.equipmentKind),
      describeSpecs(a.equipmentKind, a.specs),
      h?.employeeName,
    ]
      .map((x) => String(x ?? '').toLowerCase())
      .join(' ');
    return hay.includes(term);
  });
}
