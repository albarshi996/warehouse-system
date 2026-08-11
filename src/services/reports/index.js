/**
 * سجلّ التقارير — أضف تعريفًا هنا، فيعمل في الشاشة كاملًا.
 *
 * نفس نمط `SCHEMAS` مع المستندات: التقرير ملفُّ تعريفٍ لا شاشة. والدفعات
 * الباقية (ر‑٣ وما بعدها في م‑٨) تُضاف مصفوفةً جديدةً هنا لا شاشاتٍ جديدة.
 */
import { buildRegistry } from './reportEngine.js';
import { STOCK_REPORTS } from './stockReports.js';
import { ACCOUNT_REPORTS } from './accountReports.js';

/** المعرّف → التعريف. `buildRegistry` يرمي عند التكرار. */
export const REPORTS = buildRegistry(STOCK_REPORTS, ACCOUNT_REPORTS);

/** تعريف تقريرٍ بعينه، أو `null`. */
export function getReport(id) {
  return REPORTS[id] || null;
}

/** كلّ المعرّفات — يقارنها الاختبار بالدفعات. */
export function reportIds() {
  return Object.keys(REPORTS);
}

export { STOCK_REPORTS, ACCOUNT_REPORTS };
