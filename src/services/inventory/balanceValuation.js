/**
 * ‹ODOO-ORD› تقييمُ المخزون من الأرصدة بتكلفة أودو — منطقٌ خالص.
 *
 * «قيمة المخزون» كانت تُحسب من ماستر الأصناف: رصيدُ الصنف × تكلفتُه في الماستر — **وماسترُ الأصناف بلا تكاليف**
 * (3,438 صنفًا من 4,216) ورصيدُه ليس الدفتر، فعرضت اللوجستيات «0 د.ل» (2026-10-22). والحقيقةُ في الأرصدة: كلُّ سطرٍ
 * مستورَدٍ من أودو يحمل `unitCost` (تكلفةَ أودو)، والكمّيّةُ الحيّةُ هي الافتتاحيُّ ± أثرُ كلّ مستندٍ مُرحَّل.
 *
 * - **القيمة = Σ كمّيّة × تكلفة** لكلّ سطرٍ موجب: تكلفةُ السطر من أودو أوّلًا، فإن غابت فتكلفةُ الماستر، وإلّا «بلا تكلفة»
 *   تُعدّ ولا تُلفَّق.
 * - **المستودعان** (بنغازي · طرابلس) قيمةُ المخزون، و**الطريق** (`TRANSIT`) بضاعةٌ مملوكةٌ تُعرض بجانبها لا داخلها،
 *   و**الحساباتُ الافتراضيّة** (التسوية ADJUSTMENT ونحوها) مقابلٌ محاسبيٌّ لا مخزون — خارج القيمة. وكانت `stockValue`
 *   تجمعها كلَّها فتشوّه الرقم.
 */
import { canonKey } from './inventoryAnalytics.js';
import { PORTAL_WAREHOUSES } from '../locations/postedImport.js';

export const TRANSIT_ACCOUNT = 'TRANSIT';

const num = (v) => Number(v) || 0;
const whOf = (b) => String(b?.warehouse || '').trim().toUpperCase();

/** تكلفةُ الماستر لكلّ صنف (بهويّته القانونيّة) — ما كان موجبًا وحده. */
export function itemCostIndex(items) {
  const index = new Map();
  for (const it of items || []) {
    const key = canonKey(it);
    const cost = num(it?.costPrice || it?.unitPrice);
    if (key && cost > 0) index.set(key, cost);
  }
  return index;
}

/** تكلفةُ سطر الرصيد ومصدرُها: أودو (`unitCost`) ثمّ الماستر ثمّ لا شيء. */
export function balanceCost(balance, costIndex = new Map()) {
  const own = num(balance?.unitCost);
  if (own > 0) return { cost: own, source: 'balance' };
  const fromItem = costIndex.get(canonKey(balance)) || 0;
  return fromItem > 0 ? { cost: fromItem, source: 'item' } : { cost: 0, source: null };
}

const bucket = () => ({ value: 0, qty: 0, lines: 0 });

/**
 * التقييم: المستودعان (قيمةُ المخزون) · الطريق · وكلُّ مستودعٍ وحدَه · وبالفئة · وما بلا تكلفة.
 * @param {object[]} balances سطورُ `balances`
 * @param {object[]} items ماسترُ الأصناف — للتكلفة البديلة والفئة
 */
export function balanceValuation(balances, items = [], { warehouses = PORTAL_WAREHOUSES } = {}) {
  const real = new Set(warehouses.map((w) => String(w).toUpperCase()));
  const costIndex = itemCostIndex(items);
  const categoryOf = new Map();
  for (const it of items || []) {
    const key = canonKey(it);
    if (key) categoryOf.set(key, it.category || it.family || '');
  }

  const onHand = bucket();
  const transit = bucket();
  const byWarehouse = {};
  const byCat = new Map();
  const unpriced = { lines: 0, qty: 0 };
  let costFromItem = 0;

  for (const b of balances || []) {
    const qty = num(b?.qty);
    if (qty <= 0) continue;
    const wh = whOf(b);
    const inWarehouse = real.has(wh);
    if (!inWarehouse && wh !== TRANSIT_ACCOUNT) continue; // حسابٌ افتراضيّ (التسوية…) — مقابلٌ لا مخزون
    const { cost, source } = balanceCost(b, costIndex);
    if (!cost) {
      unpriced.lines += 1;
      unpriced.qty += qty;
    } else if (source === 'item') {
      costFromItem += 1;
    }
    const value = qty * cost;
    const target = inWarehouse ? onHand : transit;
    target.value += value;
    target.qty += qty;
    target.lines += 1;
    if (!inWarehouse) continue;
    byWarehouse[wh] = byWarehouse[wh] || bucket();
    byWarehouse[wh].value += value;
    byWarehouse[wh].qty += qty;
    byWarehouse[wh].lines += 1;
    const cat = categoryOf.get(canonKey(b)) || 'بلا فئة';
    const prev = byCat.get(cat) || { category: cat, value: 0, count: 0 };
    prev.value += value;
    prev.count += 1;
    byCat.set(cat, prev);
  }

  return {
    total: onHand.value,
    onHand,
    transit,
    byWarehouse,
    categories: [...byCat.values()].sort((a, b) => b.value - a.value),
    unpriced,
    costFromItem,
  };
}

/**
 * الماسترُ بأرصدة الدفتر وتكلفة أودو — لتقارير الراكد وإعادة الطلب التي تقرأ `balance` و`costPrice` من الصنف.
 * الرصيدُ = Σ كمّيّة المستودعين، والتكلفةُ = متوسّطُ تكلفة أودو الموزون بالكمّيّة، فإن غابت فتكلفةُ الماستر.
 */
export function itemsWithLedger(items, balances, { warehouses = PORTAL_WAREHOUSES } = {}) {
  const real = new Set(warehouses.map((w) => String(w).toUpperCase()));
  const agg = new Map();
  for (const b of balances || []) {
    if (!real.has(whOf(b))) continue;
    const key = canonKey(b);
    if (!key) continue;
    const qty = num(b.qty);
    const a = agg.get(key) || { qty: 0, costQty: 0, costValue: 0 };
    a.qty += qty;
    const own = num(b.unitCost);
    if (own > 0 && qty > 0) {
      a.costQty += qty;
      a.costValue += qty * own;
    }
    agg.set(key, a);
  }
  return (items || []).map((it) => {
    const a = agg.get(canonKey(it));
    const ledgerCost = a && a.costQty > 0 ? a.costValue / a.costQty : 0;
    const masterCost = num(it?.costPrice || it?.unitPrice);
    return { ...it, balance: a ? a.qty : 0, costPrice: ledgerCost > 0 ? ledgerCost : masterCost };
  });
}
