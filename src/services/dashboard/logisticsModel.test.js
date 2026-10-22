import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  logisticsSummary,
  stagnantWindow,
  odooOpenOrders,
  latestOdooDocs,
  odooDocLabel,
  moveRow,
  movesReadPlan,
  MOVES_CAP,
  ODOO_FEED_TYPES,
  STAGNANT_DAYS,
} from './logisticsModel.js';
import { OPENING_MS, libyaDayOfStamp } from '../documents/actualWork.js';

const DAY = 86400000;
const sec = (ms) => ({ seconds: Math.floor(ms / 1000) });

/* بيانات عيّنة صغيرة قابلة للتنبّؤ */
const items = [
  { sku: 'A', nameAr: 'صنف أ', category: 'تغليف', balance: 5, minStock: 10, unitPrice: 100 }, // إعادة طلب (نقص 5) · قيمة 500
  { sku: 'B', nameAr: 'صنف ب', category: 'تغليف', balance: 20, minStock: 5, unitPrice: 50 }, // سليم · قيمة 1000
  { sku: 'C', nameAr: 'صنف ج', category: 'خام', balance: 0, minStock: 3, unitPrice: 0 }, // إعادة طلب · بلا سعر
];
// جلساتُ جردٍ بعد الافتتاح — وجلستا تجربةٍ من أغسطس (قبله)
const operations = [
  { id: 'o1', status: 'open', createdAt: sec(OPENING_MS + 2 * DAY), itemCount: 10, scannedCount: 4 },
  { id: 'o2', status: 'open', createdAt: sec(OPENING_MS + 1 * DAY), itemCount: 5, scannedCount: 5 },
  { id: 'o3', status: 'closed', createdAt: sec(OPENING_MS + 1000), itemCount: 8, scannedCount: 8 },
  { id: 't1', status: 'open', createdAt: sec(Date.parse('2026-08-10T09:00:00+02:00')), itemCount: 3, scannedCount: 0 },
  { id: 't2', status: 'open', createdAt: sec(OPENING_MS - 1000), itemCount: 3, scannedCount: 0 }, // آخرُ ثانيةٍ قبل الافتتاح
];
const suppliers = [{ code: 'S1' }, { code: 'S2' }];
const customers = [{ code: 'C1' }, { code: 'C2' }, { code: 'C3' }];
const counts = { trips: 1, workOrders: 4, custodies: 0 };

const NOW = OPENING_MS + 2 * DAY + 3600000; // يومان بعد الافتتاح
const READY_NOW = OPENING_MS + 91 * DAY; // نافذةُ الراكد اكتملت

test('المؤشّرات: قيمة المخزون وعدد الأصناف وغير المسعّر', () => {
  const s = logisticsSummary({ items, operations, suppliers, customers, counts }, NOW);
  assert.equal(s.kpis.totalValue, 1500); // 500 + 1000 + 0
  assert.equal(s.kpis.itemsTotal, 3);
  assert.equal(s.kpis.itemsUnpriced, 1); // C بلا سعر
});

test('إعادة الطلب: تُحصى الأصناف تحت الحدّ (A و C)', () => {
  const s = logisticsSummary({ items }, NOW);
  assert.equal(s.kpis.reorderCount, 2);
  assert.equal(s.reorderTop.length, 2);
  assert.ok(s.reorderTop.every((r) => r.balance <= r.minStock));
});

test('جلسات الجرد: تجاربُ ما قبل الافتتاح لا تُحصى ولا تُعرض', () => {
  const s = logisticsSummary({ operations }, NOW);
  assert.equal(s.kpis.openOperations, 2); // o1 · o2 — لا t1 ولا t2 وهما «مفتوحتان»
  assert.equal(s.kpis.operationsTotal, 3);
  assert.equal(s.kpis.preOpeningOperations, 2);
  assert.deepEqual(s.recentOperations.map((o) => o.id), ['o1', 'o2', 'o3']);
});

test('جلسات الجرد: جلسةٌ كُتبت للتوّ بلا طابعٍ بعدُ تُعرض لا تُخفى', () => {
  const s = logisticsSummary({ operations: [{ id: 'n', status: 'open', createdAt: null }] }, NOW);
  assert.equal(s.kpis.openOperations, 1);
});

test('العدّادات: الشركاء أطوالٌ، والرحلات والصيانة والعُهد أعدادٌ من الخادم', () => {
  const s = logisticsSummary({ suppliers, customers, counts }, NOW);
  assert.equal(s.kpis.suppliersCount, 2);
  assert.equal(s.kpis.customersCount, 3);
  assert.equal(s.kpis.tripsTotal, 1);
  assert.equal(s.kpis.workOrdersTotal, 4);
  assert.equal(s.kpis.custodiesTotal, 0); // صفرٌ عُدّ — لا null
});

test('العدّادات: ما لم يصل عدُّه null لا صفر — فلا يُعرض صفرٌ لم يُعَدّ', () => {
  const s = logisticsSummary({ counts: { trips: 7 } }, NOW);
  assert.equal(s.kpis.tripsTotal, 7);
  assert.equal(s.kpis.workOrdersTotal, null);
  assert.equal(s.kpis.custodiesTotal, null);
  assert.equal(logisticsSummary({}, NOW).kpis.tripsTotal, null);
});

test('القصّ إلى top: أكثر من 8 أصناف نقص → القائمة 8 فقط', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    sku: `X${i}`, nameAr: `صنف ${i}`, balance: 0, minStock: 10, unitPrice: 10 + i,
  }));
  const s = logisticsSummary({ items: many }, NOW);
  assert.equal(s.kpis.reorderCount, 12);
  assert.equal(s.reorderTop.length, 8); // مقصوصة
});

test('الفئات: مصفوفة تقييمٍ بالفئة موجودة', () => {
  const s = logisticsSummary({ items }, NOW);
  assert.ok(Array.isArray(s.categories));
  assert.ok(s.categories.length >= 1);
  assert.ok(s.categories[0].value >= s.categories[s.categories.length - 1].value); // تنازليّ
});

test('حصانة الفراغ: بيانات فارغة → أصفار بلا استثناء', () => {
  const s = logisticsSummary({}, 0);
  assert.equal(s.kpis.totalValue, 0);
  assert.equal(s.kpis.itemsTotal, 0);
  assert.equal(s.kpis.reorderCount, 0);
  assert.equal(s.kpis.openOperations, 0);
  assert.equal(s.kpis.odooOpenOrders, 0);
  assert.equal(s.kpis.stagnantShare, null); // لا مخزون → النسبة غير معرّفة
  assert.deepEqual(s.reorderTop, []);
  assert.deepEqual(s.recentMoves, []);
  assert.deepEqual(s.recentOdooDocs, []);
});

test('حصانة المدخلات غير المصفوفيّة: لا تنكسر', () => {
  const s = logisticsSummary({ items: null, operations: undefined, suppliers: 'x', odooDocs: 5, counts: 'x' }, NOW);
  assert.equal(s.kpis.itemsTotal, 0);
  assert.equal(s.kpis.suppliersCount, 0);
  assert.equal(s.kpis.odooOpenOrders, 0);
  assert.equal(s.kpis.tripsTotal, null);
});

/* ═══════════════ الراكد: لا حكمَ على تاريخٍ أقصرَ من نافذته ═══════════════ */

// صنفان برصيدٍ وقيمة: P لم يُصرف منذ الافتتاح، وQ صُرف أمس
const stockItems = [
  { sku: 'P', nameAr: 'راقد', balance: 10, unitPrice: 30 }, // قيمة 300
  { sku: 'Q', nameAr: 'متحرّك', balance: 4, unitPrice: 25 }, // قيمة 100
];
const outflowQ = (nowMs) => [{ id: 'q1', sku: 'Q', qty: 1, from: 'WH001', to: '', postedAt: sec(nowMs - DAY) }];

test('الراكد قبل اكتمال 90 يومًا من الافتتاح: لا صنفَ يُعلَّم، والأرقامُ null لا صفر', () => {
  const s = logisticsSummary({ items: stockItems, moves: outflowQ(NOW) }, NOW);
  assert.equal(s.kpis.stagnantReady, false);
  assert.equal(s.kpis.stagnantReason, 'warming');
  assert.equal(s.kpis.stagnantCount, null);
  assert.equal(s.kpis.stagnantValue, null);
  assert.equal(s.kpis.stagnantShare, null);
  assert.deepEqual(s.stagnantTop, []);
  assert.equal(s.kpis.stagnantDays, STAGNANT_DAYS);
  assert.equal(s.kpis.stagnantHistoryDays, 2);
});

test('يومُ اكتمال الراكد يُحسب من الافتتاح لا يُكتب: 2026-10-20 + 90 يومًا = 2027-01-18', () => {
  const w = stagnantWindow([], NOW);
  assert.equal(w.readyDay, '2027-01-18');
  assert.equal(w.readyDay, libyaDayOfStamp(OPENING_MS + STAGNANT_DAYS * DAY));
  // نافذةٌ أخرى ⟵ يومٌ آخر
  assert.equal(stagnantWindow([], NOW, { stagnantDays: 30 }).readyDay, '2026-11-19');
});

test('الراكد بعد اكتمال النافذة: يُعلَّم ما لم يُصرف ويُترك ما صُرف', () => {
  const s = logisticsSummary({ items: stockItems, moves: outflowQ(READY_NOW) }, READY_NOW);
  assert.equal(s.kpis.stagnantReady, true);
  assert.equal(s.kpis.stagnantReason, '');
  assert.equal(s.kpis.stagnantReadyDay, '');
  assert.equal(s.kpis.stagnantCount, 1);
  assert.equal(s.kpis.stagnantValue, 300);
  assert.equal(s.kpis.stagnantShare, 0.75); // 300 من 400
  assert.deepEqual(s.stagnantTop.map((r) => r.sku), ['P']);
});

test('حدُّ النافذة: 90 يومًا تمامًا جاهز، وقبلها بلحظةٍ لا', () => {
  assert.equal(stagnantWindow([], OPENING_MS + 90 * DAY).ready, true);
  assert.equal(stagnantWindow([], OPENING_MS + 90 * DAY - 1).ready, false);
});

test('سقفُ القراءة يقصّ التاريخ: الحركاتُ المقروءة لا تغطّي النافذة ⇒ لا حكم، ولا يومَ اكتمال', () => {
  const now = OPENING_MS + 200 * DAY;
  const moves = [5, 3, 1].map((d, i) => ({ id: `m${i}`, sku: 'Q', qty: 1, from: 'WH001', to: '', postedAt: sec(now - d * DAY) }));
  const w = stagnantWindow(moves, now, { movesCap: 3 });
  assert.equal(w.ready, false);
  assert.equal(w.reason, 'truncated');
  assert.equal(w.historyDays, 5);
  assert.equal(w.readyDay, '');
  const s = logisticsSummary({ items: stockItems, moves }, now, { movesCap: 3 });
  assert.equal(s.kpis.stagnantCount, null);
  assert.deepEqual(s.stagnantTop, []);
  // ودون السقف: التاريخُ من الافتتاح فالحكمُ جاهز
  assert.equal(stagnantWindow(moves, now, { movesCap: 4 }).ready, true);
  // وبلغ السقفَ لكنّ أقدمَ ما قُرئ أقدمُ من النافذة ⇒ جاهز
  const old = [...moves, { id: 'old', sku: 'Q', qty: 1, from: 'WH001', to: '', postedAt: sec(now - 120 * DAY) }];
  assert.equal(stagnantWindow(old, now, { movesCap: 4 }).ready, true);
});

/* ═══════════════ أودو: الأوامرُ المفتوحة وآخرُ المستندات ═══════════════ */

const odoo = (type, sourceRef, day, header = {}, lines = [], extra = {}) => ({
  id: `${type}-${sourceRef}`,
  type,
  number: `${type}-2026-${sourceRef.slice(-4)}`,
  state: 'approved',
  header: { sourceSystem: 'Odoo', sourceRef, sourceDoneDate: day, ...header },
  lines,
  ...extra,
});
const odooDocs = [
  odoo('OSO', 'S00101', '2026-10-21', { partner: 'عميل أ', warehouse: 'WH001', sourceState: 'sale' }, [{ qty: 10, qtyDone: 4 }]), // مفتوح
  odoo('OSO', 'S00102', '2026-10-20', { partner: 'عميل ب', warehouse: 'WH002', sourceState: 'sale' }, [{ qty: 6, qtyDone: 6 }]), // مكتمل
  odoo('OSO', 'S00103', '2026-10-21', { partner: 'عميل ج', sourceState: 'cancel' }, [{ qty: 5, qtyDone: 0 }], { state: 'canceled' }), // ملغى هنا وهناك
  odoo('OSO', 'S00104', '2026-10-21', { partner: 'عميل د', sourceState: 'cancel' }, [{ qty: 5, qtyDone: 0 }]), // ملغى في أودو ولم يُلغَ هنا بعد
  odoo('OPO', 'P00011', '2026-10-19', { partner: 'مورّد أ', warehouse: 'WH001', sourceState: 'purchase' }, [{ qty: 100, qtyDone: 0 }]), // مفتوح
  odoo('OPO', 'P00012', '2026-10-21', { partner: 'مورّد ب', warehouse: 'WH002', sourceState: 'purchase' }, [{ qty: 50, qtyDone: 20 }, { qty: 5, qtyDone: 5 }]), // جزئيّ
  odoo('OPO', 'P00013', '2026-10-20', { partner: 'مورّد ب', warehouse: 'WH001', sourceState: 'purchase' }, [{ qty: 8, qtyDone: 8 }]), // استُلم كلُّه
  odoo('SRO', 'WHNBE/OUT/00031', '2026-10-22', { partner: 'عميل أ', warehouse: 'WH001' }, [{ qty: 3 }, { qty: 2.5 }], { posted: true, state: 'done' }),
  odoo('SRO', 'WHNBE/OUT/00032', '2026-10-21', { partner: 'مورّد أ', warehouse: 'WH001', isReturn: true }, [{ qty: 1 }], { posted: true, state: 'done' }),
  odoo('SXO', 'WHNBE/INT/00007', '2026-10-21', { fromWarehouse: 'WH001', toWarehouse: 'WH002' }, [{ qty: 12 }], { posted: true, state: 'done' }),
  odoo('SRA', 'ADJ-0009', '2026-10-20', { warehouse: 'WH002' }, [{ qty: -4 }], { posted: true, state: 'done' }),
  // أمرُ بيعٍ من البوّابة نفسِها (لا من أودو) — لا يدخل مؤشّرَ أودو ولا جدولَه
  { id: 'native', type: 'OSO', number: 'OSO-X', state: 'approved', header: { sourceRef: 'N1', sourceDoneDate: '2026-10-22' }, lines: [{ qty: 9, qtyDone: 0 }] },
];

test('أوامر أودو المفتوحة: بيعٌ وشراءٌ بقي منه شيء — والملغى هنا أو هناك خارجها، وما ليس من أودو كذلك', () => {
  assert.deepEqual(odooOpenOrders(odooDocs), { sales: 1, purchases: 2, total: 3 });
  const s = logisticsSummary({ odooDocs }, NOW);
  assert.equal(s.kpis.odooOpenOrders, 3);
  assert.equal(s.kpis.odooOpenSales, 1);
  assert.equal(s.kpis.odooOpenPurchases, 2);
});

test('أنواعُ تغذية أودو: المُرحَّلةُ الخمسة وأمرا البيع والشراء — ضمن حدّ `in` (30)', () => {
  assert.deepEqual([...ODOO_FEED_TYPES].sort(), ['OPO', 'OSO', 'SRA', 'SRI', 'SRO', 'SXI', 'SXO']);
  assert.ok(ODOO_FEED_TYPES.length <= 30);
});

test('آخر مستندات أودو: بيوم الواقعة تنازليًّا، بلا ملغًى ولا ما ليس من أودو', () => {
  const rows = latestOdooDocs(odooDocs, 20);
  const refs = rows.map((r) => r.sourceRef);
  assert.equal(refs[0], 'WHNBE/OUT/00031'); // 22 أكتوبر — الأحدث
  assert.equal(refs[refs.length - 1], 'P00011'); // 19 أكتوبر — الأقدم
  assert.ok(!refs.includes('S00103') && !refs.includes('S00104'), 'الملغى لا يظهر');
  assert.ok(!refs.includes('N1'), 'مستندُ البوّابة ليس من أودو');
  assert.ok(refs.includes('P00013'), 'المكتملُ مستندٌ يُعرض — وإن لم يكن مفتوحًا');
  assert.equal(rows.length, 9);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].day >= rows[i].day);
});

test('آخر مستندات أودو: النوعُ بلغة القارئ والطرفُ والمستودعُ والكمّيّة', () => {
  const byRef = Object.fromEntries(latestOdooDocs(odooDocs, 20).map((r) => [r.sourceRef, r]));
  const out = byRef['WHNBE/OUT/00031'];
  assert.equal(out.label, 'توصيل');
  assert.equal(out.party, 'عميل أ');
  assert.equal(out.warehouse, 'بنغازي');
  assert.equal(out.day, '2026-10-22');
  assert.equal(out.qty, 5.5);
  assert.equal(out.isOrder, false);
  assert.equal(byRef['WHNBE/OUT/00032'].label, 'مرتجع صادر');
  assert.equal(byRef['WHNBE/INT/00007'].label, 'نقل صادر');
  assert.equal(byRef['WHNBE/INT/00007'].warehouse, 'بنغازي ← طرابلس');
  assert.equal(byRef['ADJ-0009'].label, 'تسوية');
  assert.equal(byRef['ADJ-0009'].qty, 4); // الكمّيّةُ مطلقة
  assert.equal(byRef.S00101.label, 'أمرُ بيعٍ من أودو');
  assert.equal(byRef.S00101.isOrder, true);
  assert.equal(byRef.P00011.label, 'أمرُ شراءٍ من أودو');
  assert.equal(byRef.P00011.party, 'مورّد أ');
});

test('آخر مستندات أودو: القصُّ إلى top (8) في الملخّص', () => {
  const s = logisticsSummary({ odooDocs }, NOW);
  assert.equal(s.recentOdooDocs.length, 8); // من تسعةٍ حيّة
  assert.ok(!s.recentOdooDocs.some((r) => r.sourceRef === 'P00011'), 'الأقدمُ (19 أكتوبر) هو المقصوص');
  assert.equal(latestOdooDocs(odooDocs, 3).length, 3);
});

test('اسمُ النوع: استلامٌ واستلامُ نقلٍ ومرتجعٌ وارد', () => {
  assert.equal(odooDocLabel({ type: 'SRI', header: {} }), 'استلام');
  assert.equal(odooDocLabel({ type: 'SRI', header: { isReturn: true } }), 'مرتجع وارد');
  assert.equal(odooDocLabel({ type: 'SXI', header: {} }), 'نقل وارد');
});

test('سقفُ قراءة أودو: بلوغُه يُعلَن', () => {
  assert.equal(logisticsSummary({ odooDocs }, NOW, { odooCap: odooDocs.length }).kpis.odooDocsCapped, true);
  assert.equal(logisticsSummary({ odooDocs }, NOW, { odooCap: 500 }).kpis.odooDocsCapped, false);
  assert.equal(logisticsSummary({ odooDocs }, NOW).kpis.odooDocsCapped, false); // بلا سقفٍ معلَن
});

/* ═══════════════ الحركات: مستندُها ويومُ واقعتها ═══════════════ */

test('صفُّ الحركة: المستندُ سببٌ · رقم، واليومُ يومُ الواقعة', () => {
  const r = moveRow({ reasonLabel: 'تسليمٌ منجَزٌ في المصدر', docNumber: 'SRO-2026-0003', eventDay: '2026-10-21', postedAt: sec(OPENING_MS + 2 * DAY) });
  assert.equal(r.docLabel, 'تسليمٌ منجَزٌ في المصدر · SRO-2026-0003');
  assert.equal(r.day, '2026-10-21'); // لا يومُ الترحيل (22)
});

test('صفُّ الحركة: بلا يوم واقعةٍ ⟵ يومُ الترحيل بتوقيت ليبيا، وبلا رقمٍ ⟵ السببُ وحده', () => {
  // 23:30 بتوقيت UTC = 01:30 من اليوم التالي في ليبيا
  const r = moveRow({ reasonLabel: 'رصيدٌ افتتاحيّ', postedAt: sec(Date.parse('2026-10-20T23:30:00Z')) });
  assert.equal(r.day, '2026-10-21');
  assert.equal(r.docLabel, 'رصيدٌ افتتاحيّ');
  assert.equal(moveRow({}).docLabel, '');
});

test('الحركاتُ الأخيرة: تُعرض بمستندها، وما قبل الافتتاح لا يُعرض', () => {
  const moves = [
    { id: 'a', sku: 'A', qty: 2, reasonLabel: 'تسليم', docNumber: 'SRO-1', eventDay: '2026-10-21', postedAt: sec(OPENING_MS + DAY) },
    { id: 'z', sku: 'A', qty: 9, postedAt: sec(OPENING_MS - DAY) }, // تجربة
  ];
  const s = logisticsSummary({ moves }, NOW);
  assert.deepEqual(s.recentMoves.map((m) => m.id), ['a']);
  assert.equal(s.recentMoves[0].docLabel, 'تسليم · SRO-1');
  assert.equal(s.recentMoves[0].day, '2026-10-21');
});

/* ═══════════════ قراءةُ الحركات: بقدر ما يُعرض ═══════════════ */

test('خطّةُ القراءة: قبل أن يصير الراكدُ ممكنًا تُقرأ حركاتُ الجدول وحدها (10) بلا سقفٍ يُوهم بالقصّ', () => {
  assert.deepEqual(movesReadPlan(NOW), { max: 10, movesCap: 0 });
  assert.deepEqual(movesReadPlan(OPENING_MS + 90 * DAY - 1), { max: 10, movesCap: 0 });
});

test('خطّةُ القراءة: حين يصير الحكمُ ممكنًا تُقرأ حتّى السقف ويُعلَن السقفُ للنموذج', () => {
  assert.deepEqual(movesReadPlan(OPENING_MS + 90 * DAY), { max: MOVES_CAP, movesCap: MOVES_CAP });
  assert.deepEqual(movesReadPlan(READY_NOW), { max: MOVES_CAP, movesCap: MOVES_CAP });
});

test('القراءةُ القصيرة لا تقلب سببَ الراكد إلى «مقصوص»: عشرُ حركاتٍ جدولٌ لا تاريخ', () => {
  const moves = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, sku: 'Q', qty: 1, from: 'WH001', to: '', postedAt: sec(NOW - i * 60000) }));
  const s = logisticsSummary({ items: stockItems, moves }, NOW, { movesCap: movesReadPlan(NOW).movesCap });
  assert.equal(s.kpis.stagnantReason, 'warming');
  assert.equal(s.kpis.stagnantReadyDay, '2027-01-18');
  assert.equal(s.recentMoves.length, 10);
});

test('★★★ ‹ODOO-ORD› القيمةُ من الأرصدة بتكلفة أودو حين تصل — لا من الماستر الفارغ', () => {
  const items = [{ sku: 'A', costPrice: 0, balance: 0, category: 'مكياج' }, { sku: 'B', costPrice: 0, balance: 99 }];
  const balances = [
    { sku: 'A', warehouse: 'WH001', qty: 10, unitCost: 5 },
    { sku: 'B', warehouse: 'WH002', qty: 4, unitCost: 0 },
    { sku: 'A', warehouse: 'TRANSIT', qty: 20, unitCost: 5 },
    { sku: 'A', warehouse: 'ADJUSTMENT', qty: 307, unitCost: 5 },
  ];
  const { kpis, categories } = logisticsSummary({ items, balances }, Date.parse('2026-10-22T10:00:00Z'));
  assert.equal(kpis.valueSource, 'balances');
  assert.equal(kpis.totalValue, 50, 'المستودعان وحدهما — لا الطريق ولا حساب التسوية');
  assert.equal(kpis.transitValue, 100);
  assert.equal(kpis.unpricedLines, 1);
  assert.equal(kpis.valueByWarehouse.WH001.value, 50);
  assert.equal(categories[0].category, 'مكياج');
});

test('بلا أرصدةٍ (لم تصل) يبقى السلوكُ القديم — ولا يُعلَن مصدرٌ لم يُقرأ', () => {
  const { kpis } = logisticsSummary({ items: [{ sku: 'A', costPrice: 2, balance: 3 }] }, Date.parse('2026-10-22T10:00:00Z'));
  assert.equal(kpis.valueSource, 'items');
  assert.equal(kpis.totalValue, 6);
  assert.equal(kpis.transitValue, null);
});
