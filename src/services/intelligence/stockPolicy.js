/**
 * سياسة المخزون لكلّ صنف×فرع ‹FNB-202› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * `replenishmentFor` (operationalIntelligence.js:61) يقبل `leadDays`
 * و`safetyDays` **وسيطَين عامَّين للمنشأة كلّها**: مهلةُ توريد الدجاج
 * كمهلة الأرزّ، ومخزونُ أمان فرعٍ في بنغازي كفرعٍ في طرابلس. وخطة القطاع
 * تطلب لكلّ فرعٍ حدَّه الأدنى وPar Level وأيّام تغطيته.
 *
 * ═══ الوراثة الثلاثيّة ═══
 * سياسةٌ لكلّ (صنف × فرع) صريحة تفوز؛ فإن غابت وُرثت من **البراند** ثمّ من
 * **القطاع** ثمّ من الافتراض العامّ. ولهذا سببٌ عمليّ: ثلاثون فرعًا × ألف
 * صنفٍ = ثلاثون ألف سطرٍ لا يُدخلها بشر. فتُكتب سياسةُ القطاع مرّةً،
 * ويُستثنى منها ما يستحقّ.
 *
 * ═══ وأيّام التغطية بندٌ مستقلّ ═══
 * نصّ المعادلة (أسطر 116–123) يذكر **مخزون الأمان** و**أيّام التغطية
 * المطلوبة** بندَين منفصلين — وليسا مترادفين: الأمان يحمي من تذبذب الطلب
 * ومن تأخّر المورّد، والتغطية تقول «اطلب ما يكفي س يومًا» فتقلّل عدد
 * الطلبات. خلطُهما يجعل زيادة أحدهما تُلغي الآخر.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * الافتراض العامّ — سلوك اليوم حرفيًّا: نفس قيمتَي `replenishmentFor`،
 * فبلا سياسةٍ واحدة **لا يتغيّر رقم**.
 */
export const DEFAULT_POLICY = Object.freeze({
  minQty: 0,
  parLevel: 0,
  coverDays: 0,
  safetyDays: 7,
  leadDays: 14,
});

/** مستويات الوراثة من الأخصّ إلى الأعمّ — الترتيب نفسه هو الأسبقيّة. */
export const POLICY_SCOPES = Object.freeze(['branch', 'brand', 'sector', 'default']);

/** معرّف السياسة الحتميّ: (النطاق × رمزه × الصنف) — إعادة الإدخال تحديثٌ لا تكرار. */
export function policyId({ scope, scopeCode, sku } = {}) {
  const s = str(scope).toLowerCase();
  if (!POLICY_SCOPES.includes(s) || s === 'default') return null;
  const code = up(scopeCode);
  const item = normalizeItemCode(sku);
  if (!code || !item) return null;
  return `${s.toUpperCase()}__${code}__${item}`;
}

/** يُسوّي سياسةً خامًا. القيم السالبة تُصفَّر — سياسةٌ سالبة لا معنى لها. */
export function shapePolicy(raw) {
  const clamp = (v, fallback) => {
    const n = num(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  };
  return {
    scope: POLICY_SCOPES.includes(str(raw?.scope)) ? str(raw.scope) : 'branch',
    scopeCode: up(raw?.scopeCode),
    sku: normalizeItemCode(raw?.sku),
    minQty: clamp(raw?.minQty, 0),
    parLevel: clamp(raw?.parLevel, 0),
    coverDays: clamp(raw?.coverDays, 0),
    safetyDays: raw?.safetyDays == null || str(raw.safetyDays) === '' ? null : clamp(raw.safetyDays, DEFAULT_POLICY.safetyDays),
    leadDays: raw?.leadDays == null || str(raw.leadDays) === '' ? null : clamp(raw.leadDays, DEFAULT_POLICY.leadDays),
  };
}

/** أعطابٌ تمنع الحفظ — والمنعُ لما يكذب: سقفٌ دون أرضيّة. */
export function policyProblems(raw) {
  const p = shapePolicy(raw);
  const out = [];
  if (!p.sku) out.push('السياسة بلا صنف — لمن تُكتب؟');
  if (p.scope !== 'default' && !p.scopeCode) out.push('السياسة بلا رمز نطاق — لأيّ فرعٍ أو براندٍ أو قطاع؟');
  if (p.parLevel > 0 && p.minQty > p.parLevel) {
    out.push(`الحدّ الأدنى (${p.minQty}) فوق Par Level (${p.parLevel}) — أرضيّةٌ فوق السقف.`);
  }
  return out;
}

/** فهرس السياسات: `SCOPE__CODE__SKU` ← السياسة. */
export function indexPolicies(policies = []) {
  const map = new Map();
  for (const raw of Array.isArray(policies) ? policies : []) {
    const p = shapePolicy(raw);
    const id = policyId(p);
    if (id) map.set(id, p);
  }
  return map;
}

/**
 * السياسة السارية لصنفٍ في فرعٍ — **بالوراثة الثلاثيّة**.
 *
 * يُدمج حقلًا حقلًا لا كائنًا كائنًا: فرعٌ حدَّد `parLevel` وحده يرث بقيّة
 * حقوله من برانده. ودمجُ الكائن كاملًا كان سيُسقط ما لم يُذكر إلى الافتراض
 * العامّ ويُلغي سياسة البراند بلا أن يقصد أحد.
 *
 * @param {Map} index فهرس السياسات
 * @param {string} sku الصنف
 * @param {{branch?:string, brand?:string, sector?:string}} dims أبعاد الفرع (من `dimensionsOf`)
 * @returns {{minQty,parLevel,coverDays,safetyDays,leadDays, sources:object}}
 *   `sources` يقول لكلّ حقلٍ **من أين جاء** — فالرقم يُفسَّر ولا يُتَّهم.
 */
export function policyFor(index, sku, dims = {}) {
  const item = normalizeItemCode(sku);
  const chain = [
    ['branch', up(dims.branch)],
    ['brand', up(dims.brand)],
    ['sector', up(dims.sector)],
  ].filter(([, code]) => code);

  const out = { ...DEFAULT_POLICY };
  const sources = Object.fromEntries(Object.keys(DEFAULT_POLICY).map((k) => [k, 'default']));

  // من الأخصّ إلى الأعمّ: أوّل من يُصرّح بالحقل يفوز به.
  const claimed = new Set();
  for (const [scope, code] of chain) {
    const p = index?.get?.(policyId({ scope, scopeCode: code, sku: item }));
    if (!p) continue;
    for (const key of Object.keys(DEFAULT_POLICY)) {
      if (claimed.has(key)) continue;
      const value = p[key];
      // `null` تعني «لم أُصرّح» فتمرّ للأعمّ؛ والصفر تصريحٌ صريح إلّا في
      // الحقول التي صفرُها يعني «غير مضبوط» (الحدّ وPar والتغطية).
      const declared = value !== null && value !== undefined && !(value === 0 && ['minQty', 'parLevel', 'coverDays'].includes(key));
      if (!declared) continue;
      out[key] = value;
      sources[key] = scope;
      claimed.add(key);
    }
  }
  return { ...out, sources };
}

/**
 * ما الأصناف التي لا سياسةَ لها في فرعٍ — للعرض وترتيب ما يحتاج ضبطًا.
 * وليست عطبًا: صنفٌ بلا سياسة يسلك الافتراض العامّ ولا يُسكِت المقترح.
 */
export function policyGaps(index, skus = [], dims = {}) {
  return (Array.isArray(skus) ? skus : [])
    .map(normalizeItemCode)
    .filter(Boolean)
    .filter((sku) => {
      const p = policyFor(index, sku, dims);
      return Object.values(p.sources).every((s) => s === 'default');
    })
    .sort();
}
