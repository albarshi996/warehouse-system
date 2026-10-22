/**
 * ‹ODOO-RPT› اختبارات تقارير أودو — الفرزُ والتجميع، والمخزونُ في يومٍ بالرجوع من الرصيد الآن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLUMNS,
  dailyStock,
  daysBetween,
  docDeltas,
  eventDayOf,
  isDelivery,
  isReceipt,
  isReturn,
  isReturnDoc,
  libyaDayOf,
  lineRows,
  monthlyStock,
  orderLineRows,
  ordersReport,
  returnDirection,
  salesOrdersReport,
  selectDocs,
  stockAsOf,
  summarize,
  toAoa,
} from './odooReports.js';

/** مستندٌ مُرحَّلٌ بشكل البوّابة. */
const doc = (id, type, day, header = {}, lines = [{ sku: 'A', qty: 5, unitCost: 2 }], extra = {}) => ({
  id, type, number: `${type}-${id}`, state: 'done', posted: true,
  header: { sourceRef: `ODOO/${id}`, sourceDoneDate: day, ...header }, lines, ...extra,
});

const DOCS = [
  doc('1', 'SRO', '2026-10-20', { warehouse: 'WH001', partner: 'صيدلية القلعه', partnerCode: 'ODOO-829', orderRef: 'SBEN00074' }, [{ sku: 'A', qty: 1, unitCost: 28 }]),
  doc('2', 'SRO', '2026-10-21', { warehouse: 'WH002', partner: 'التفاح الأخضر', partnerCode: 'ODOO-758', orderRef: 'STIP00053' }, [{ sku: 'A', qty: 6, unitCost: 10 }, { sku: 'B', qty: 4, unitCost: 5 }]),
  doc('3', 'SRO', '2026-10-21', { warehouse: 'WH002', partner: 'التفاح الأخضر', partnerCode: 'ODOO-758', orderRef: 'STIP00053' }, [{ sku: 'B', qty: 2, unitCost: 5 }]),
  doc('4', 'SRI', '2026-10-21', { warehouse: 'WH001', partner: 'مورّد', isReturn: false }, [{ sku: 'C', qty: 100, unitCost: 1 }]),
  doc('5', 'SRI', '2026-10-21', { warehouse: 'WH001', partner: 'صيدلية القلعه', isReturn: true }, [{ sku: 'A', qty: 1, unitCost: 28 }]),
  doc('6', 'SRO', '2026-10-21', { warehouse: 'WH002', partner: 'مورّد', notes: 'مرتجعٌ أُنجز في المصدر' }, [{ sku: 'B', qty: 3, unitCost: 5 }]),
  doc('7', 'SRA', '2026-10-21', { warehouse: 'WH001' }, [{ sku: 'C', qty: -28 }]),
  doc('8', 'SXO', '2026-10-22', { fromWarehouse: 'WH001', toWarehouse: 'WH002' }, [{ sku: 'C', qty: 10 }]),
  // أُلغي قبل الترحيل — والمُرحَّلُ لا يُلغى أصلًا (يُغلق فتبقى حركاتُه).
  doc('9', 'SRO', '2026-10-22', { warehouse: 'WH001' }, [{ sku: 'A', qty: 1 }], { state: 'canceled', posted: false }),
];

/* ═══════════ ١. اليومُ والمرتجع ═══════════ */

test('يومُ الواقعة: الإنجازُ في المصدر أوّلًا، ثمّ يومُ الترحيل بتوقيت ليبيا', () => {
  assert.equal(eventDayOf(DOCS[0]), '2026-10-20');
  assert.equal(eventDayOf({ header: {}, postedAtMs: Date.UTC(2026, 9, 20, 23, 0) }), '2026-10-21', 'الحادية عشرة ليلًا بالعالميّ = الواحدة فجرًا في طرابلس');
  assert.equal(libyaDayOf(NaN), '');
});

test('المرتجعُ بالعلَم، والمستندُ القديمُ بملاحظته', () => {
  assert.equal(isReturnDoc(DOCS[4]), true);
  assert.equal(isReturnDoc(DOCS[3]), false, 'العلَمُ الصريحُ يغلب');
  assert.equal(isReturnDoc(DOCS[5]), true, 'مستندٌ رُحّل قبل وجود العلَم');
  assert.equal(returnDirection(DOCS[4]), 'من عميل');
  assert.equal(returnDirection(DOCS[5]), 'إلى مورّد');
});

/* ═══════════ ٢. التقاريرُ المستنديّة ═══════════ */

test('الاستلامُ والتوصيلُ والمرتجعُ يفترقون — والملغى لا يُعدّ', () => {
  assert.deepEqual(selectDocs(DOCS, isReceipt).map((d) => d.id), ['4']);
  assert.deepEqual(selectDocs(DOCS, isDelivery).map((d) => d.id).sort(), ['1', '2', '3']);
  assert.deepEqual(selectDocs(DOCS, isReturn).map((d) => d.id).sort(), ['5', '6']);
});

test('المرشّحات مجتمعة: المدّة والمستودع والطرف', () => {
  assert.deepEqual(selectDocs(DOCS, isDelivery, { from: '2026-10-21', to: '2026-10-21' }).map((d) => d.id).sort(), ['2', '3']);
  assert.deepEqual(selectDocs(DOCS, isDelivery, { warehouse: 'WH001' }).map((d) => d.id), ['1']);
  assert.deepEqual(selectDocs(DOCS, isDelivery, { party: 'odoo-758' }).map((d) => d.id).sort(), ['2', '3'], 'بالكود وبلا حساسيّة حروف');
  assert.deepEqual(selectDocs(DOCS, isDelivery, { party: 'القلعه' }).map((d) => d.id), ['1']);
});

test('أوامرُ البيع: التسليماتُ مجمّعةٌ بمرجع الأمر', () => {
  const rows = salesOrdersReport(DOCS);
  const o = rows.find((r) => r.orderRef === 'STIP00053');
  assert.equal(o.deliveries, 2);
  assert.equal(o.qty, 12);
  assert.equal(o.value, 6 * 10 + 4 * 5 + 2 * 5);
  assert.equal(o.partner, 'التفاح الأخضر');
  assert.equal(rows[0].lastDay, '2026-10-21', 'الأحدث أوّلًا');
});

test('الملخّصُ يطابق الصفوف — والبنودُ صفٌّ لكلّ بند', () => {
  const delivered = selectDocs(DOCS, isDelivery);
  const lines = lineRows(delivered);
  assert.equal(lines.length, 4);
  const s = summarize(delivered.map((d) => ({ lines: d.lines.length, qty: d.lines.reduce((a, l) => a + l.qty, 0), value: 0 })));
  assert.equal(s.lines, lines.length);
  assert.equal(s.qty, lines.reduce((a, l) => a + l.qty, 0));
});

/* ═══════════ ٣. المخزونُ اليوميّ والشهريّ ═══════════ */

test('أثرُ المستندات بمحرّك القيد: التسويةُ تُنقص، والإرساليّةُ تنقل إلى الطريق', () => {
  const { rows, problems } = docDeltas(DOCS);
  assert.deepEqual(problems, []);
  const sum = (wh, day) => rows.filter((r) => r.warehouse === wh && (!day || r.day === day)).reduce((s, r) => s + r.delta, 0);
  assert.equal(sum('WH001', '2026-10-21'), 100 + 1 - 28, 'استلامٌ + مرتجعٌ وارد − تسوية');
  assert.equal(sum('WH001', '2026-10-22'), -10);
  assert.equal(sum('TRANSIT', '2026-10-22'), 10);
  assert.equal(rows.find((r) => r.docId === '7').flow, 'adjustment');
  assert.equal(rows.find((r) => r.docId === '6').flow, 'returnOut');
  assert.ok(!rows.some((r) => r.docId === '9'), 'الملغى غيرُ مُرحَّل لا أثرَ له');
});

test('★★★ المخزونُ اليوميّ بالرجوع من الرصيد الآن — أوّلُ اليوم + الصافي = آخرُه، وآخرُه = أوّلُ الغد', () => {
  const { rows } = docDeltas(DOCS);
  // افتتاحيٌّ معلوم ثمّ «الآن» = الافتتاحيّ + كلُّ الأثر — فالرجوعُ يجب أن يعيد الافتتاحيّ حرفًا.
  const opening = { WH001: 1000, WH002: 500, TRANSIT: 0 };
  const now = Object.fromEntries(Object.entries(opening).map(([wh, q]) => [wh, q + rows.filter((r) => r.warehouse === wh).reduce((s, r) => s + r.delta, 0)]));
  const daily = dailyStock({ currentByWarehouse: now, deltas: rows, from: '2026-10-20', to: '2026-10-22' });
  for (const wh of ['WH001', 'WH002', 'TRANSIT']) {
    const mine = daily.filter((r) => r.warehouse === wh);
    assert.equal(mine[0].opening, opening[wh], `${wh}: أوّلُ المدّة هو الافتتاحيّ`);
    assert.equal(mine.at(-1).closing, now[wh], `${wh}: آخرُ المدّة هو الرصيدُ الآن`);
    for (let i = 0; i < mine.length; i++) {
      assert.equal(mine[i].opening + mine[i].net, mine[i].closing);
      if (i) assert.equal(mine[i].opening, mine[i - 1].closing);
    }
  }
  const d21 = daily.find((r) => r.warehouse === 'WH002' && r.day === '2026-10-21');
  assert.equal(d21.deliveryOut, -(6 + 4 + 2));
  assert.equal(d21.returnOut, -3);
});

test('المخزونُ الشهريّ: أوّلُ الشهر من أوّل أيّامه وآخرُه من آخرها', () => {
  const { rows } = docDeltas(DOCS);
  const daily = dailyStock({ currentByWarehouse: { WH001: 1063, WH002: 485, TRANSIT: 10 }, deltas: rows, from: '2026-10-20', to: '2026-10-22' });
  const m = monthlyStock(daily).find((r) => r.warehouse === 'WH001');
  assert.equal(m.month, '2026-10');
  assert.equal(m.opening, daily.find((r) => r.warehouse === 'WH001' && r.day === '2026-10-20').opening);
  assert.equal(m.closing, 1063);
  assert.equal(m.opening + m.net, m.closing);
});

test('رصيدُ كلّ صنفٍ في نهاية يوم: الآن ناقصَ ما وقع بعده', () => {
  const { rows } = docDeltas(DOCS);
  const balances = [
    { sku: 'C', nameAr: 'صنف ج', warehouse: 'WH001', qty: 62 }, // 100 − 28 − 10
    { sku: 'C', nameAr: 'صنف ج', warehouse: 'TRANSIT', qty: 10 },
    { sku: 'C', nameAr: 'صنف ج', warehouse: 'ADJUSTMENT', qty: 28 },
  ];
  const at21 = stockAsOf(balances, rows, '2026-10-21');
  assert.equal(at21.find((r) => r.sku === 'C' && r.warehouse === 'WH001').qty, 72, 'قبل إرساليّة الثاني والعشرين');
  assert.equal(at21.find((r) => r.sku === 'C' && r.warehouse === 'TRANSIT')?.qty ?? 0, 0);
  assert.ok(!at21.some((r) => r.warehouse === 'ADJUSTMENT'), 'حسابُ التسوية ليس مستودعًا');
});

test('أيّامُ المدّة شاملةٌ ومرتّبة — والمعكوسةُ فارغة', () => {
  assert.deepEqual(daysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(daysBetween('2026-10-22', '2026-10-21'), []);
});

/* ═══════════ ٤. الإكسل ═══════════ */

test('ورقةُ الإكسل بعناوين التقرير وبترتيب أعمدته', () => {
  const aoa = toAoa('orders', salesOrdersReport(DOCS));
  assert.deepEqual(aoa[0], COLUMNS.orders.map(([, l]) => l));
  assert.equal(aoa.length, 1 + salesOrdersReport(DOCS).length);
  const withDir = toAoa('docs', [{ day: '2026-10-21', direction: 'من عميل' }], [['direction', 'الاتّجاه']]);
  assert.equal(withDir[0].at(-1), 'الاتّجاه');
  assert.equal(withDir[1].at(-1), 'من عميل');
});

test('★★ لا رصيدَ قبل لقطة الافتتاح — الجدولُ يبدأ من يومها ولا يكرّر الافتتاحيّ لأيّامٍ لا تعرفها البوّابة', () => {
  const daily = dailyStock({ currentByWarehouse: { WH001: 10 }, deltas: [], from: '2026-10-01', to: '2026-10-20', warehouses: ['WH001'] });
  assert.equal(daily[0].day, '2026-10-19');
  assert.equal(daily.length, 2);
  assert.equal(salesOrdersReport(DOCS)[0].warehouses, 'طرابلس', 'المستودعُ باسمه لا بكوده');
});

/* ═══════════ ٥. ‹ODOO-ORD› أوامرُ البيع والشراء كما في أودو ═══════════ */

const ORDERS = [
  doc('o1', 'OSO', '2026-10-20', { warehouse: 'WH001', partner: 'صيدلية القلعه', sourceState: 'sale', doneStatus: 'partial', invoiceStatus: 'to invoice', amountTotal: 500, sourceRef: 'SBEN00074' },
    [{ sku: 'A', qty: 10, qtyDone: 4, unitPrice: 20, subtotal: 200 }, { sku: 'B', qty: 5, qtyDone: 5, unitPrice: 60, subtotal: 300 }]),
  doc('o2', 'OSO', '2026-10-21', { warehouse: 'WH002', partner: 'التفاح', sourceState: 'sale', doneStatus: 'full' }, [{ sku: 'A', qty: 3, qtyDone: 3 }]),
  doc('o3', 'OSO', '2026-10-21', { warehouse: 'WH002', partner: 'ملغى', sourceState: 'cancel' }, [{ sku: 'A', qty: 9 }], { state: 'canceled' }),
  doc('p1', 'OPO', '2026-10-15', { warehouse: 'WH001', partner: 'مورّد', sourceState: 'purchase', doneStatus: 'pending' }, [{ sku: 'C', qty: 100, qtyDone: 0 }]),
];

test('أوامرُ البيع: المطلوبُ والمسلَّمُ والمتبقّي — والملغى لا يُعدّ', () => {
  const rows = ordersReport(ORDERS, 'OSO');
  assert.deepEqual(rows.map((r) => r.sourceRef).sort(), ['ODOO/o2', 'SBEN00074']);
  const o = rows.find((r) => r.sourceRef === 'SBEN00074');
  assert.deepEqual([o.qty, o.qtyDone, o.open], [15, 9, 6]);
  assert.equal(o.state, 'مؤكَّد');
  assert.equal(o.doneStatus, 'جزئيّ');
  assert.equal(o.amountTotal, 500);
  assert.deepEqual(ordersReport(ORDERS, 'OSO', { openOnly: true }).map((r) => r.sourceRef), ['SBEN00074'], 'المفتوحُ وحده');
});

test('أوامرُ الشراء منفصلةٌ عن البيع — والبنودُ بمتبقّيها', () => {
  assert.deepEqual(ordersReport(ORDERS, 'OPO').map((r) => r.open), [100]);
  const lines = orderLineRows(ordersReport(ORDERS, 'OSO').length ? selectDocs(ORDERS, (d) => d.type === 'OSO') : []);
  assert.deepEqual(lines.map((l) => l.open).sort((a, b) => a - b), [0, 0, 6]);
  assert.equal(toAoa('orderDocs', ordersReport(ORDERS, 'OSO'))[0].at(-3), 'المتبقّي');
});
