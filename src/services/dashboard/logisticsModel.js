/**
 * logisticsModel — نموذج «لوحة اللوجستيات التنفيذيّة» (المرحلة ٤).
 *
 * منطقٌ خالصٌ حتميّ: يُغذَّى بالبيانات الخام (أصناف · حركات · جلسات جرد · مستندات أودو · شركاء ·
 * عدّادات الرحلات والصيانة والعُهد) و`nowMs` مُمرَّرة، فيُعيد مؤشّرات تنفيذيّة موحّدة وقوائم «تدخّل الآن»
 * (إعادة الطلب/الراكد) والنشاط الأخير. لا Firestore ولا زمنٌ ضمنيّ (‏Date.now‏) — كي يبقى قابلًا للاختبار
 * بلا شبكة ولا ساعة.
 *
 * يعيد استعمال منطق تحليل المخزون المُختبَر (inventoryAnalytics) بدل تكراره، ومنطقَ تقارير أودو (odooReports)
 * بدل قراءةٍ ثانيةٍ لمعنى «أمرٍ مفتوح».
 *
 * ═══ ‹ODOO-ORD› العملُ الفعليّ وحده (قيس 2026-10-22) ═══
 * كانت اللوحةُ تعرض تجاربَ يوليو–أكتوبر وحدَها ولا شيءَ من أودو: «العمليّاتُ المفتوحة» جلساتُ جردٍ من أغسطس،
 * والحركاتُ لا يُعرف أودويُّها من تجريبيّها. فصارت:
 * - **الحركاتُ منذ الافتتاح** (`listenMovesSince`)، وكلُّ صفٍّ يحمل مستندَه (سببُه · رقمُه) ويومَ واقعته لا لحظةَ ترحيله.
 * - **جلساتُ الجرد** بلا ما أُنشئ قبل الافتتاح (`actualRecords`).
 * - **مستنداتُ أودو** مؤشّرًا («أوامرُ أودو مفتوحة» = بيعٌ + شراءٌ بقي منه شيء، والملغى خارجها) وجدولًا لآخرها.
 * - ★★★ **والراكدُ لا يُحكم به على تاريخٍ أقصرَ من نافذته**: «لا خروجَ منذ 90 يومًا» وتاريخُ الحركات يبدأ
 *   يومَ الافتتاح ⟵ كلُّ صنفٍ «راكد» حتّى يمضي 90 يومًا. فالنموذجُ يقيس نافذةَ التاريخ المتاحة أوّلًا،
 *   ولا يُطلق حكمًا قبل أن تكتمل — ويقول متى تكتمل بدل أن يقول «صفر».
 */
import {
  valuationReport,
  reorderReport,
  stagnantReport,
  canonKey,
} from '../inventory/inventoryAnalytics.js';
import {
  ODOO_TYPES,
  FLOW_LABELS,
  WAREHOUSE_NAMES,
  docRow,
  flowOf,
  ordersReport,
  selectDocs,
} from '../reports/odooReports.js';
import { OPENING_MS, actualMoves, actualRecords, isOdooDoc, libyaDayOfStamp, stampMs } from '../documents/actualWork.js';
import { SOURCE_ORDER_SCHEMAS } from '../documents/schemas/sourceOrders.js';

const DEFAULT_TOP = 8;
const MS_PER_DAY = 86400000;

/** نافذةُ تحليل الراكد بالأيّام. */
export const STAGNANT_DAYS = 90;

/** سقفُ قراءة الحركات منذ الافتتاح — والنموذجُ يعرفه ليعرف متى صار التاريخُ المقروءُ ناقصًا. */
export const MOVES_CAP = 2500;

/** أنواعُ مستندات أودو التي تعرضها اللوحة: المُرحَّلةُ الخمسة وأمرا البيع والشراء. */
export const ODOO_FEED_TYPES = Object.freeze([...ODOO_TYPES, 'OSO', 'OPO']);

/** سقفُ قراءة مستندات أودو — `in` على النوع بلا ترتيب، فبلوغُه يعني أنّ ما وصل عيّنةٌ لا الكلّ. */
export const ODOO_FEED_CAP = 500;

const asArray = (x) => (Array.isArray(x) ? x : []);
const str = (v) => (v === null || v === undefined || v === false ? '' : String(v).trim());
/** عدٌّ من الخادم: رقمٌ أو null («لم يصل بعد» أو «تعذّر») — فلا يُعرض صفرٌ لم يُعَدّ. */
const countOf = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** اسمُ الطرف نصًّا كان أو كائنًا. */
const textOf = (v) => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' ? str(v.nameAr || v.name) : '');

/**
 * نافذةُ التاريخ المتاحة للحكم بالركود.
 *
 * التاريخُ يبدأ من الافتتاح (لا حركةَ قبله في القراءة) — أو من أقدم حركةٍ قُرئت إن بلغت القراءةُ سقفَها،
 * فما قبلها موجودٌ في الدفتر وغائبٌ عن اليد. والحكمُ جاهزٌ حين يغطّي التاريخُ النافذةَ كلَّها.
 *
 * @returns {{ready:boolean, reason:''|'warming'|'truncated', stagnantDays:number, historyDays:number, readyDay:string}}
 *   `reason`: `warming` لم يمضِ على الافتتاح ما يكفي (و`readyDay` يومُ اكتماله) · `truncated` السقفُ قصّ التاريخ.
 */
export function stagnantWindow(moves, nowMs, { stagnantDays = STAGNANT_DAYS, historySinceMs = OPENING_MS, movesCap = 0 } = {}) {
  const list = asArray(moves);
  let startMs = historySinceMs;
  let truncated = false;
  if (movesCap > 0 && list.length >= movesCap) {
    const oldest = list.reduce((min, m) => {
      const ms = stampMs(m?.postedAt);
      return Number.isFinite(ms) && ms < min ? ms : min;
    }, Infinity);
    if (Number.isFinite(oldest) && oldest > startMs) {
      startMs = oldest;
      truncated = true;
    }
  }
  const needMs = stagnantDays * MS_PER_DAY;
  const ready = nowMs - startMs >= needMs;
  return {
    ready,
    reason: ready ? '' : truncated ? 'truncated' : 'warming',
    stagnantDays,
    historyDays: Math.max(0, Math.floor((nowMs - startMs) / MS_PER_DAY)),
    // يومُ الاكتمال يُحسب من الافتتاح لا يُكتب — ولا يومَ للمقصوص: السقفُ يتحرّك مع كلّ حركةٍ جديدة.
    readyDay: ready || truncated ? '' : libyaDayOfStamp(historySinceMs + needMs),
  };
}

/**
 * كم حركةً تُقرأ عند الفتح — «يقرأ ما يعرضه».
 * ما دام الراكدُ لا يُحكم به (قبل اكتمال نافذته من الافتتاح) فالحركاتُ لا تخدم إلّا جدولَ آخرها: عشرٌ لا 2,500.
 * وحين يصير الحكمُ ممكنًا تُقرأ حتّى السقف، ويُمرَّر السقفُ للنموذج ليعرف إن قصّ التاريخ.
 * ★ وفي القراءة القصيرة لا يُمرَّر سقف: عشرُ حركاتٍ «بلغت سقفها» ليست تاريخًا مقصوصًا بل جدولًا.
 * @returns {{max:number, movesCap:number}}
 */
export function movesReadPlan(nowMs, { stagnantDays = STAGNANT_DAYS, historySinceMs = OPENING_MS, top = DEFAULT_TOP } = {}) {
  const due = nowMs - historySinceMs >= stagnantDays * MS_PER_DAY;
  return due ? { max: MOVES_CAP, movesCap: MOVES_CAP } : { max: top + 2, movesCap: 0 };
}

/** أُلغي في أودو؟ — حالةُ المصدر، فأمرٌ أُلغي هناك ولم يُلغَ هنا بعدُ لا يُحسب مفتوحًا. */
function canceledInSource(doc) {
  return str(doc?.header?.sourceState).toLowerCase() === 'cancel';
}

/** مستنداتُ أودو الحيّة: من أودو، وغيرُ ملغاةٍ هناك. (الملغى هنا يُسقطه `selectDocs`.) */
function liveOdooDocs(docs) {
  return asArray(docs).filter((d) => isOdooDoc(d) && !canceledInSource(d));
}

/**
 * أوامرُ أودو المفتوحة — ما بقي منه شيءٌ لم يُسلَّم أو يُستلَم، بتعريف تقارير أودو نفسِه (`ordersReport`)
 * فلا تفترق اللوحةُ عن شاشة التقارير.
 */
export function odooOpenOrders(docs) {
  const live = liveOdooDocs(docs);
  const sales = ordersReport(live, 'OSO', { openOnly: true }).length;
  const purchases = ordersReport(live, 'OPO', { openOnly: true }).length;
  return { sales, purchases, total: sales + purchases };
}

/** اسمُ نوع مستند أودو بلغة القارئ: الأمرُ باسم مخطّطه، والمُرحَّلُ بصنف حركته (استلام · توصيل · مرتجع · نقل · تسوية). */
export function odooDocLabel(doc) {
  const type = str(doc?.type);
  if (SOURCE_ORDER_SCHEMAS[type]) return SOURCE_ORDER_SCHEMAS[type].titleAr;
  return FLOW_LABELS[flowOf(doc, type === 'SXI' ? 1 : -1)] || type;
}

/** آخرُ مستندات أودو بيوم واقعتها (الإنجازُ في المصدر) — صفٌّ لكلّ مستند. */
export function latestOdooDocs(docs, top = DEFAULT_TOP) {
  const whName = (code) => WAREHOUSE_NAMES[code] || code;
  return selectDocs(liveOdooDocs(docs), () => true)
    .slice(0, top)
    .map((d) => {
      const r = docRow(d);
      const h = d.header || {};
      const transfer = r.type === 'SXO' || r.type === 'SXI';
      return {
        id: r.id || `${r.type}:${r.sourceRef}`,
        type: r.type,
        label: odooDocLabel(d),
        sourceRef: r.sourceRef,
        number: r.number,
        party: [h.partner, h.supplierName, h.supplier, h.customerName, h.customer].map(textOf).find(Boolean) || '',
        // النقلُ طرفان: من ⟵ إلى؛ وغيرُه مستودعٌ واحد.
        warehouse: transfer
          ? [str(h.fromWarehouse), str(h.toWarehouse)].filter(Boolean).map(whName).join(' ← ')
          : r.warehouseName,
        day: r.day,
        qty: r.qty,
        isOrder: Boolean(SOURCE_ORDER_SCHEMAS[r.type]),
      };
    });
}

/** صفُّ حركةٍ للعرض: مستندُها (سببُه · رقمُه) ويومُ واقعتها — لا لحظةُ ترحيلها. */
export function moveRow(m) {
  return {
    ...m,
    docLabel: [str(m?.reasonLabel), str(m?.docNumber)].filter(Boolean).join(' · '),
    day: str(m?.eventDay).slice(0, 10) || libyaDayOfStamp(m?.postedAt),
  };
}

/**
 * يجمّع مؤشّرات اللوحة من البيانات الخام.
 * @param {object} data { items, moves, operations, odooDocs, suppliers, customers, counts: { trips, workOrders, custodies } }
 *   `counts` أعدادٌ من الخادم (`countCollection`) أو null ما لم تصل.
 * @param {number} nowMs الآن بالمِلّي (حتميّ)
 * @param {object} opts { stagnantDays=90, top=8, historySinceMs=OPENING_MS, movesCap=0, odooCap=0 }
 */
export function logisticsSummary(data = {}, nowMs = 0, opts = {}) {
  const {
    stagnantDays = STAGNANT_DAYS,
    top = DEFAULT_TOP,
    historySinceMs = OPENING_MS,
    movesCap = 0,
    odooCap = 0,
  } = opts;
  const items = asArray(data.items);
  const rawMoves = asArray(data.moves);
  // الحركاتُ تُقرأ منذ الافتتاح؛ والتصفيةُ هنا حصانةٌ لو غُذّي النموذجُ من مصدرٍ أوسع.
  const moves = actualMoves(rawMoves);
  // جلساتُ الجرد: تجاربُ ما قبل الافتتاح ليست «عمليّاتٍ مفتوحة».
  const allOperations = asArray(data.operations);
  const operations = actualRecords(allOperations, 'createdAt');
  const rawOdoo = asArray(data.odooDocs);
  const suppliers = asArray(data.suppliers);
  const customers = asArray(data.customers);
  const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};

  const valuation = valuationReport(items);
  const reorder = reorderReport(items);
  const win = stagnantWindow(rawMoves, nowMs, { stagnantDays, historySinceMs, movesCap });
  const stagnant = win.ready ? stagnantReport(items, moves, nowMs, { stagnantDays }) : null;
  const orders = odooOpenOrders(rawOdoo);

  const itemsTotal = items.filter((it) => canonKey(it)).length;
  const openOperations = operations.filter((o) => o && o.status === 'open').length;

  return {
    kpis: {
      totalValue: valuation.total,
      itemsTotal,
      itemsUnpriced: valuation.itemsUnpriced,
      reorderCount: reorder.count,
      reorderWithoutMin: reorder.withoutMin,
      // الراكدُ: null حتّى يكتمل التاريخ — «لم يُقَس» لا «صفر».
      stagnantReady: win.ready,
      stagnantReason: win.reason,
      stagnantDays: win.stagnantDays,
      stagnantHistoryDays: win.historyDays,
      stagnantReadyDay: win.readyDay,
      stagnantCount: stagnant ? stagnant.count : null,
      stagnantValue: stagnant ? stagnant.value : null,
      stagnantShare: stagnant && valuation.total > 0 ? stagnant.value / valuation.total : null,
      openOperations,
      operationsTotal: operations.length,
      preOpeningOperations: allOperations.length - operations.length,
      odooOpenOrders: orders.total,
      odooOpenSales: orders.sales,
      odooOpenPurchases: orders.purchases,
      // بلغت القراءةُ سقفَها ⇒ ما في اليد عيّنة، فيُقال ذلك تحت الجدول.
      odooDocsCapped: odooCap > 0 && rawOdoo.length >= odooCap,
      suppliersCount: suppliers.length,
      customersCount: customers.length,
      tripsTotal: countOf(counts.trips),
      workOrdersTotal: countOf(counts.workOrders),
      custodiesTotal: countOf(counts.custodies),
    },
    // «تدخّل الآن»: أعلى النقص وأثقل الراكد (المصدر مرتّب تنازليًّا أصلًا)
    reorderTop: reorder.rows.slice(0, top),
    stagnantTop: stagnant ? stagnant.rows.slice(0, top) : [],
    // النشاط الأخير (المصدر مرتّب بالأحدث أصلًا)
    recentOperations: operations.slice(0, top),
    recentMoves: moves.slice(0, top + 2).map(moveRow),
    recentOdooDocs: latestOdooDocs(rawOdoo, top),
    // قيمة المخزون بالفئات (أعلى ٦)
    categories: valuation.categories.slice(0, 6),
  };
}
