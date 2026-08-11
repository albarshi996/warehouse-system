/**
 * محرّك التقارير — تعريفٌ لكلّ تقرير لا شاشةٌ لكلّ تقرير (ر‑٠ · يسدّ ف‑٧).
 *
 * ═══ لماذا محرّكٌ واحد ═══
 * ثلاثةٌ وثلاثون تقريرًا في ثلاثٍ وثلاثين شاشة تعني ثلاثًا وثلاثين طريقةً
 * للفلترة، ومثلها للطباعة، ومثلها للتصدير — تتباعد شهرًا بعد شهر حتّى يصير
 * «المجموع» في تقريرٍ غير «المجموع» في آخر. وقد نجح هذا النمط مع `SCHEMAS`:
 * نموذجٌ جديد ملفُّ تعريفٍ لا شاشة، والتقارير أولى به.
 *
 * ═══ عقد التعريف ═══
 * ```js
 * {
 *   id, titleAr, group,          // الهويّة
 *   roles: [...],                // من يفتحه — الرقم محصورٌ بأصحابه
 *   filters: [{key, label, kind, options?}],
 *   columns: [{key, label, kind, align?, sum?}],
 *   rows: (data, filters) => [], // منطقٌ خالص: بيانات ← صفوف
 *   note?: 'ما يفسّر الرقم'
 * }
 * ```
 *
 * ═══ معايير القبول الثمانية (نصّ الخطة) ═══
 * ① الفلاتر تعمل مجتمعة ② المجاميع تطابق الصفوف المعروضة ③ الطباعة بالتوقيعين
 * والرقم الإشاريّ ④ Excel بأعمدة حقيقيّة ⑤ الفارغ يعرض «لا بيانات» ⑥ محصورٌ
 * بأصحابه ⑦ ٥٠٠٠ صفٍّ بلا تجميد ⑧ المنطق خالصٌ ومختبَر في Node.
 * وهذا الملفّ يحمل ①②⑤⑥⑧، والشاشة تحمل ③④⑦.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

const str = (v) => String(v ?? '').trim();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** أنواع الفلاتر المدعومة — الشاشة ترسمها والمحرّك يطبّقها. */
export const FILTER_KINDS = ['text', 'select', 'date', 'dateRange', 'number'];

/** أنواع الأعمدة — تحكم المحاذاة والتنسيق والتصدير. */
export const COLUMN_KINDS = ['text', 'number', 'money', 'date', 'qty'];

/**
 * تحقّقٌ من تعريف تقرير — يُستدعى في الاختبار لا في كلّ عرض.
 * تعريفٌ معطوب يجب أن يسقط عند بناء السجلّ لا أمام المستخدم.
 */
export function definitionProblems(def) {
  const problems = [];
  if (!str(def?.id)) problems.push('تقريرٌ بلا معرّف.');
  if (!str(def?.titleAr)) problems.push(`${def?.id}: بلا عنوان عربيّ.`);
  if (!Array.isArray(def?.roles) || def.roles.length === 0) {
    problems.push(`${def?.id}: بلا أدوار — والرقم محصورٌ بأصحابه لا مباحٌ للجميع.`);
  }
  if (!Array.isArray(def?.columns) || def.columns.length === 0) problems.push(`${def?.id}: بلا أعمدة.`);
  if (typeof def?.rows !== 'function') problems.push(`${def?.id}: بلا دالّة صفوف.`);

  for (const c of def?.columns || []) {
    if (!str(c.key)) problems.push(`${def?.id}: عمودٌ بلا مفتاح.`);
    if (!str(c.label)) problems.push(`${def?.id}.${c.key}: عمودٌ بلا تسمية — عمودٌ بلا اسمٍ لا يُقرأ.`);
    if (c.kind && !COLUMN_KINDS.includes(c.kind)) problems.push(`${def?.id}.${c.key}: نوع عمودٍ غير معروف «${c.kind}».`);
    if (c.sum && !['number', 'money', 'qty'].includes(c.kind)) {
      problems.push(`${def?.id}.${c.key}: مجموعٌ على عمودٍ غير رقميّ.`);
    }
  }
  for (const f of def?.filters || []) {
    if (!str(f.key)) problems.push(`${def?.id}: فلترٌ بلا مفتاح.`);
    if (f.kind && !FILTER_KINDS.includes(f.kind)) problems.push(`${def?.id}.${f.key}: نوع فلترٍ غير معروف «${f.kind}».`);
    if (f.kind === 'select' && !Array.isArray(f.options)) {
      problems.push(`${def?.id}.${f.key}: قائمة اختيارٍ بلا خيارات.`);
    }
  }
  return problems;
}

/** هل يفتح هذا الدور هذا التقرير؟ الأدمن يفتح كلّ شيء. */
export function canOpen(def, role) {
  return role === 'admin' || (def?.roles || []).includes(role);
}

/**
 * تطبيق الفلاتر العامّة على الصفوف — **مجتمعةً** (المعيار الأوّل).
 *
 * الفلتر الفارغ لا يُقيّد. والمقارنة نصّيّةٌ متساهلة للنصوص (يحتوي) ودقيقةٌ
 * للاختيارات — فمن كتب «نور» يجد «بقالة النور»، ومن اختار «GRN» لا يجد «GRN2».
 */
export function applyFilters(rows = [], filterDefs = [], values = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    (filterDefs || []).every((f) => {
      const v = values?.[f.key];
      if (v === undefined || v === null || v === '') return true;
      const field = f.field || f.key;
      const cell = row?.[field];

      if (f.kind === 'select') return String(cell ?? '') === String(v);
      if (f.kind === 'number') return num(cell) >= num(v);
      if (f.kind === 'dateRange') {
        const from = str(v?.from);
        const to = str(v?.to);
        const d = str(cell).slice(0, 10);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }
      if (f.kind === 'date') return str(cell).slice(0, 10) === str(v);
      return String(cell ?? '').toLowerCase().includes(String(v).toLowerCase());
    })
  );
}

/**
 * مجاميع الأعمدة الموسومة `sum` — **من الصفوف المعروضة** (المعيار الثاني).
 * حسابُها من كامل البيانات كذبٌ مطبوع: يفلتر المستخدم مستودعًا فيرى مجموع الكلّ.
 */
export function totalsOf(rows = [], columns = []) {
  const out = {};
  for (const c of columns || []) {
    if (!c.sum) continue;
    const sum = (rows || []).reduce((s, r) => s + num(r?.[c.key]), 0);
    out[c.key] = c.kind === 'money' ? money(sum) : Math.round(sum * 1e6) / 1e6;
  }
  return out;
}

/**
 * تشغيل تقرير: تعريفٌ + بيانات + قِيَم فلاتر ⇒ نتيجةٌ جاهزة للعرض.
 *
 * @returns {{ok:boolean, rows:object[], totals:object, count:number, empty:boolean, message:string, truncated:boolean}}
 */
export function runReport(def, data, values = {}, { role = '', maxRows = 5000 } = {}) {
  if (!def) return { ok: false, rows: [], totals: {}, count: 0, empty: true, message: 'تقريرٌ غير معروف.', truncated: false };
  if (role && !canOpen(def, role)) {
    return { ok: false, rows: [], totals: {}, count: 0, empty: true, message: 'هذا التقرير محصورٌ بأصحابه.', truncated: false };
  }

  let built = [];
  try {
    built = def.rows(data, values) || [];
  } catch (e) {
    return { ok: false, rows: [], totals: {}, count: 0, empty: true, message: `تعذّر بناء التقرير: ${e?.message || e}`, truncated: false };
  }

  const filtered = applyFilters(built, def.filters, values);
  // الحدّ يُبلَّغ ولا يُبتلع: قصٌّ صامتٌ يُقرأ كأنّه كلّ البيانات.
  const truncated = filtered.length > maxRows;
  const rows = truncated ? filtered.slice(0, maxRows) : filtered;

  return {
    ok: true,
    rows,
    // المجاميع من **كلّ** ما طابق الفلاتر لا من المقصوص — وإلّا كذب المجموع مرّتين.
    totals: totalsOf(filtered, def.columns),
    count: filtered.length,
    empty: filtered.length === 0,
    message: filtered.length === 0 ? 'لا بيانات.' : '',
    truncated,
  };
}

/** تنسيق خليّةٍ للعرض. لا يخترع قيمةً: الفارغ يبقى فارغًا لا صفرًا. */
export function formatCell(value, kind) {
  if (value === null || value === undefined || value === '') return '';
  if (kind === 'money') return money(value).toFixed(2);
  if (kind === 'number' || kind === 'qty') return String(Math.round(num(value) * 1e6) / 1e6);
  if (kind === 'date') return str(value).slice(0, 10);
  return String(value);
}

/**
 * صفوف التصدير: قيمٌ **خامٌ** لا منسّقة — الرقم رقمٌ والتاريخ تاريخ (المعيار الرابع).
 * والتنسيق شأن العارض لا شأن الملفّ.
 */
export function exportRows(rows = [], columns = []) {
  return (rows || []).map((r) =>
    Object.fromEntries(
      (columns || []).map((c) => [
        c.label,
        ['number', 'money', 'qty'].includes(c.kind) ? num(r?.[c.key]) : str(r?.[c.key]),
      ])
    )
  );
}

/** سجلّ التقارير — يُبنى من الدفعات، ويُحرَس بالاختبار. */
export function buildRegistry(...batches) {
  const registry = {};
  for (const batch of batches) {
    for (const def of batch || []) {
      if (registry[def.id]) throw new Error(`تقريرٌ مكرّر: ${def.id}`);
      registry[def.id] = def;
    }
  }
  return registry;
}

/** تقارير دورٍ بعينه، مجموعةً بمجموعتها — لشاشة المركز. */
export function reportsForRole(registry, role) {
  const groups = new Map();
  for (const def of Object.values(registry || {})) {
    if (!canOpen(def, role)) continue;
    const key = def.group || 'أخرى';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: def.id, titleAr: def.titleAr, note: def.note || '' });
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}
