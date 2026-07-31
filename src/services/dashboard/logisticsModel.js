/**
 * logisticsModel — نموذج «لوحة اللوجستيات التنفيذيّة» (المرحلة ٤).
 *
 * منطقٌ خالصٌ حتميّ: يُغذَّى بالبيانات الخام (أصناف · حركات · عمليات · شركاء ·
 * رحلات · أوامر صيانة · عُهد) و`nowMs` مُمرَّرة، فيُعيد مؤشّرات تنفيذيّة موحّدة
 * وقوائم «تدخّل الآن» (إعادة الطلب/الراكد) والنشاط الأخير. لا Firestore ولا زمنٌ
 * ضمنيّ (‏Date.now‏) — كي يبقى قابلًا للاختبار بلا شبكة ولا ساعة.
 *
 * يعيد استعمال منطق تحليل المخزون المُختبَر (inventoryAnalytics) بدل تكراره.
 */
import {
  valuationReport,
  reorderReport,
  stagnantReport,
  canonKey,
} from '../inventory/inventoryAnalytics.js';

const DEFAULT_TOP = 8;

const asArray = (x) => (Array.isArray(x) ? x : []);

/**
 * يجمّع مؤشّرات اللوحة من البيانات الخام.
 * @param {object} data { items, moves, operations, suppliers, customers, trips, workOrders, custodies }
 * @param {number} nowMs الآن بالمِلّي (حتميّ)
 * @param {object} opts { stagnantDays=90, top=8 }
 */
export function logisticsSummary(data = {}, nowMs = 0, opts = {}) {
  const { stagnantDays = 90, top = DEFAULT_TOP } = opts;
  const items = asArray(data.items);
  const moves = asArray(data.moves);
  const operations = asArray(data.operations);
  const suppliers = asArray(data.suppliers);
  const customers = asArray(data.customers);
  const trips = asArray(data.trips);
  const workOrders = asArray(data.workOrders);
  const custodies = asArray(data.custodies);

  const valuation = valuationReport(items);
  const reorder = reorderReport(items);
  const stagnant = stagnantReport(items, moves, nowMs, { stagnantDays });

  const itemsTotal = items.filter((it) => canonKey(it)).length;
  const openOperations = operations.filter((o) => o && o.status === 'open').length;

  return {
    kpis: {
      totalValue: valuation.total,
      itemsTotal,
      itemsUnpriced: valuation.itemsUnpriced,
      reorderCount: reorder.count,
      reorderWithoutMin: reorder.withoutMin,
      stagnantCount: stagnant.count,
      stagnantValue: stagnant.value,
      stagnantShare: valuation.total > 0 ? stagnant.value / valuation.total : null,
      openOperations,
      operationsTotal: operations.length,
      suppliersCount: suppliers.length,
      customersCount: customers.length,
      tripsTotal: trips.length,
      workOrdersTotal: workOrders.length,
      custodiesTotal: custodies.length,
    },
    // «تدخّل الآن»: أعلى النقص وأثقل الراكد (المصدر مرتّب تنازليًّا أصلًا)
    reorderTop: reorder.rows.slice(0, top),
    stagnantTop: stagnant.rows.slice(0, top),
    // النشاط الأخير (المصدر مرتّب بالأحدث أصلًا)
    recentOperations: operations.slice(0, top),
    recentMoves: moves.slice(0, top + 2),
    // قيمة المخزون بالفئات (أعلى ٦)
    categories: valuation.categories.slice(0, 6),
  };
}
