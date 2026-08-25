/**
 * قراءة برج القطاع ‹FNB-801…804 · FNB-703› — منطق خالص بين المخزن والحساب.
 *
 * ═══ لماذا وحدةٌ مستقلّة ═══
 * البرج يقرأ من أربعة مخازن (الاستثناءات · الأرصدة · المستندات · الشجرة)
 * ويغذّي خمسَ حاسباتٍ مبنيّة. وبين القراءة والحساب **أحكامٌ لا عرض**، وإن
 * سكنت داخل مكوّنٍ انحرفت صامتة:
 *   ① **الرصيد ليس موضعًا**: مواضع الفروع تُبنى بجمع الأرصدة على (فرع·صنف)،
 *      و**أقربُ صلاحيّةٍ هي الحاكمة** لا آخرُ صفٍّ قُرئ — لأنّ حارس النقل
 *      يرفض ما لا يكفي طريقًا، والحكم يجب أن يقع على أقرب ما سيُصرف.
 *   ② **رصيدٌ خارج الشجرة ليس فرعًا** — يُعلَن ولا يُحسب موضعًا، فمستودعٌ
 *      مركزيٌّ يُعامَل فرعًا يقترح نقلًا من حيث لا فرع.
 *   ③ **موضعٌ بلا سياسة لا يُحكم عليه** — بلا حدٍّ أدنى ولا Par لا يُعرف
 *      ناقصٌ من فائض. فيُحصى ويُعلَن، ولا يُفترض له حدٌّ من عنده.
 */
import { ancestryOf } from '../org/orgLocations.js';
import { normalizeItemCode } from '../items/itemIdentity.js';
import { policyFor } from '../intelligence/stockPolicy.js';
import { buildDailyClose } from '../intelligence/dailyClose.js';
import { COST_SCOPE, ownerOf } from '../intelligence/foodCost.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/**
 * مواضعُ الأصناف في الفروع — مدخلُ `rebalanceSuggestions`.
 *
 * @param {object[]} balances صفوف الأرصدة `{sku, warehouse, qty, expiry}`
 * @param {{orgIndex?:Map, policyIndex?:Map}} [ctx]
 * @returns {{positions:object[], unlinked:number, unpolicied:number, branches:number}}
 *   `positions`: `{branch, sku, onHand, expiry, minQty, parLevel, policySource}`
 */
export function branchPositions(balances = [], { orgIndex = null, policyIndex = null } = {}) {
  const groups = new Map();
  let unlinked = 0;

  for (const row of Array.isArray(balances) ? balances : []) {
    const sku = normalizeItemCode(row?.sku);
    const code = up(row?.warehouse);
    if (!sku || !code) continue;

    // ★ الحكم ②: الفرع يُشتقّ من الشجرة. وما لا فرعَ له ليس موضعًا.
    const chain = orgIndex ? ancestryOf(orgIndex, code) : [];
    const branch = up(chain.find((n) => n.level === 'branch')?.code);
    if (!branch) { unlinked += 1; continue; }

    const key = `${branch}|${sku}`;
    const at = groups.get(key) || { branch, sku, onHand: 0, expiry: '' };
    at.onHand = round3(at.onHand + num(row?.qty));
    // ★ الحكم ①: أقربُ صلاحيّةٍ هي الحاكمة — عليها يقع حارس النقل.
    const exp = day(row?.expiry);
    if (exp && (!at.expiry || exp < at.expiry)) at.expiry = exp;
    groups.set(key, at);
  }

  let unpolicied = 0;
  const positions = [...groups.values()].map((p) => {
    const chain = orgIndex ? ancestryOf(orgIndex, p.branch) : [];
    const dims = {
      branch: p.branch,
      brand: up(chain.find((n) => n.level === 'brand')?.code),
      sector: up(chain.find((n) => n.level === 'sector')?.code),
    };
    const policy = policyFor(policyIndex, p.sku, dims);
    // ★ الحكم ③: بلا حدٍّ ولا سقفٍ لا يُعرف ناقصٌ من فائض — يُحصى ويُعلَن.
    if (num(policy.minQty) <= 0 && num(policy.parLevel) <= 0) unpolicied += 1;
    return {
      ...p,
      minQty: num(policy.minQty),
      parLevel: num(policy.parLevel),
      policySource: str(policy.sources?.minQty) || 'default',
    };
  });

  return {
    positions,
    unlinked,
    unpolicied,
    branches: new Set(positions.map((p) => p.branch)).size,
  };
}

/**
 * سجلّاتُ الإغلاق اليوميّ لفروعٍ في تاريخ — كلٌّ بعناصره العشرة وناقصه.
 * والمستندات تُمرَّر كما هي؛ `buildDailyClose` هو من يرشّحها بنوعها وتاريخها.
 */
export function closeRecords(branches = [], { documents = [], exceptions = [], date } = {}) {
  const at = day(date);
  return (Array.isArray(branches) ? branches : []).map((b) => {
    const code = up(b?.code ?? b);
    const mine = (Array.isArray(documents) ? documents : []).filter(
      (d) => up(d?.header?.toWarehouse || d?.header?.warehouse || d?.header?.costCenter) === code
    );
    const open = (Array.isArray(exceptions) ? exceptions : []).filter((e) => up(e?.location) === code);
    return buildDailyClose({ branch: code, date: at }, { documents: mine, exceptions: open });
  });
}

/**
 * حدُّ البوابة معروضًا صفًّا صفًّا ‹FNB-703 · ق-O07› — **ما تحسبه وما تقرؤه**.
 * سجلٌّ يُقرأ بلا فتح الكود: من حسب ربحيّة فرعٍ هنا فتح للمال دفترًا ثانيًا.
 */
export function costOwnership() {
  return [...COST_SCOPE.computed, ...COST_SCOPE.mirrored].map((metric) => ({
    metric,
    ...ownerOf(metric),
  }));
}
