/**
 * ملخّصُ المصاريف لكلّ فئة (ذ · «تقريرٌ نظيفٌ لكلّ فئة») — من مستندات
 * EXP/SAL/ADV/ADVR المنجَزة، مُرشَّحًا بالمحلّ اختياريًّا.
 *
 * ★ الراتبُ والمصروفُ التشغيليُّ **مصروفاتٌ** تُجمع في «إجماليّ المصروف».
 *   أمّا السلفةُ فليست مصروفًا بل **دَينٌ على العامل** يُسترَدّ — فتُعرض صافيةً
 *   (سلفٌ − سداد) على حدةٍ ولا تُضاف إلى الإجماليّ، وإلّا تضخّم المصروفُ بما
 *   سيعود. منطق خالصٌ يُغذّى بالمستندات: بلا Firestore وبلا شبكة.
 */
import { EXPENSE_CATEGORIES } from './expenseCategories.js';
import { EXPENSE_EVENTS, expenseCategoryOf } from './deriveEntries.js';

const num = (v) => Number(v) || 0;
const money = (n) => Math.round(num(n) * 100) / 100;
const shopOf = (d) => d?.shop ?? d?.header?.shop ?? null;
const amountOf = (d) => num(d?.header?.amount ?? d?.header?.total ?? d?.header?.amountPaid);

/**
 * @param {Array} documents مستنداتُ المصاريف (EXP/SAL/ADV/ADVR)
 * @param {{shop?:string, states?:string[]}} opts المحلُّ (null=الكلّ) والحالات المقبولة
 * @returns {{rows, expenseTotal, advancesOut, docs}} صفوفُ الفئات الفعّالة، والإجماليّان، وعددُ المستندات
 */
export function expenseSummary(documents = [], { shop, states = ['done', 'closed'] } = {}) {
  const scoped = shop !== undefined && shop !== null && shop !== '';
  const docs = (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state))
    .filter((d) => !scoped || shopOf(d) === shop);

  const cats = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, { key: c.key, labelAr: c.labelAr, total: 0, count: 0 }]));
  const bump = (key, delta) => {
    const r = cats.get(key);
    if (!r) return;
    r.total = money(r.total + delta);
    r.count += 1;
  };

  for (const d of docs) {
    // مصاريفُ الدفتر المزدوج (EXP/SAL ومستنداتُ التشغيل) تُبوَّب بفئتها التقريريّة.
    if (EXPENSE_EVENTS[d?.type]) bump(expenseCategoryOf(d), amountOf(d));
    // السلفةُ دَينٌ لا مصروف: صافيةٌ (سلفٌ − سداد) على حدة.
    else if (d?.type === 'ADV') bump('worker_advance', amountOf(d));
    else if (d?.type === 'ADVR') bump('worker_advance', -amountOf(d));
  }

  const rows = [...cats.values()].filter((r) => r.count > 0);
  const expenseTotal = money(rows.filter((r) => r.key !== 'worker_advance').reduce((s, r) => s + r.total, 0));
  const advancesOut = money(cats.get('worker_advance')?.total || 0);
  return { rows, expenseTotal, advancesOut, docs: docs.length };
}
