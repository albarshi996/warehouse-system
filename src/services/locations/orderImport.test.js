/**
 * ‹ODOO-ORD› اختبارات استيراد الأوامر — القراراتُ السبعة، والتحديثُ في المكان، والإلغاءُ اللاحق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrdersPreview, groupOrderRows, orderMarker, orderMarkerId, toOrderDraft } from './orderImport.js';

/** بندُ أمر بيعٍ حقيقيّ الشكل من أودو. */
const row = (over = {}) => ({
  docRef: 'SBEN00074', docId: '74', lineId: '901', orderType: 'OSO', sourceSystem: 'Odoo', docStatus: 'sale',
  orderDate: '2026-10-20', warehouse: 'WH001', partnerCode: 'ODOO-829', partner: 'صيدلية القلعه', orderRef: '',
  doneStatus: 'full', invoiceStatus: 'invoiced', amountTotal: '28.76', currency: 'LYD', salesperson: 'support',
  commitmentDate: '', sourceUpdatedAt: '2026-10-20 09:35:58',
  sku: '8068056931732', barcode: '8068056931732', description: 'LOOSE POWDER PINK CC006', uom: 'Units',
  qty: 1, qtyDone: 1, qtyInvoiced: 1, unitPrice: 28.76, discount: 0, subtotal: 28.76,
  ...over,
});
const known = (state, sourceUpdatedAt = '2026-10-20 09:35:58', exists = true) =>
  new Map([[orderMarkerId('OSO', 'Odoo', 'SBEN00074'), { documentId: 'D1', exists, state, sourceUpdatedAt }]]);
const statusOf = (rows, opts) => buildOrdersPreview(rows, opts).orders[0].status;

test('القراراتُ السبعة', () => {
  assert.equal(statusOf([row()]), 'new');
  assert.equal(statusOf([row({ docStatus: 'cancel' })]), 'newCanceled', 'كافّةُ ملفّات أودو — والملغى سجلٌّ أيضًا');
  assert.equal(statusOf([row({ docStatus: 'draft' })]), 'skip', 'عرضُ السعر ليس أمرًا');
  assert.equal(statusOf([row()], { known: known('approved') }), 'same', 'لم يتغيّر ⟵ صفرُ كتابة');
  assert.equal(statusOf([row({ sourceUpdatedAt: '2026-10-21 08:00:00' })], { known: known('approved') }), 'update');
  assert.equal(statusOf([row({ docStatus: 'cancel', sourceUpdatedAt: '2026-10-21 08:00:00' })], { known: known('approved') }), 'cancel');
  assert.equal(statusOf([row()], { known: known('submitted') }), 'resume', 'انقطع بين الإرسال والاعتماد');
  assert.equal(statusOf([row()], { known: known('', '', false) }), 'resume', 'السجلُّ كُتب والمستندُ لم يُكتب');
  assert.equal(statusOf([row({ docStatus: 'cancel' })], { known: known('canceled') }), 'same', 'الملغى يبقى ملغًى');
});

test('ما يُحجب بسبب: مستودعٌ ليس للبوّابة · بلا تاريخ · بلا هويّة · تعارضُ رأس', () => {
  assert.equal(statusOf([row({ warehouse: 'WHNBE' })]), 'error');
  assert.equal(statusOf([row({ orderDate: '' })]), 'error');
  assert.equal(statusOf([row({ sku: '', barcode: '' })]), 'error');
  assert.equal(statusOf([row(), row({ lineId: '902', partner: 'آخر' })]), 'error');
  assert.equal(statusOf([row({ orderType: 'SO' })]), 'error', 'أمرُ البوّابة المحلّيّ ليس نوعَ استيراد');
});

test('البيعُ والشراءُ برقمٍ واحدٍ أمران لا أمرٌ واحد', () => {
  const orders = groupOrderRows([row(), row({ orderType: 'OPO', partner: 'مورّد' })]);
  assert.equal(orders.length, 2);
  assert.notEqual(orderMarkerId('OSO', 'Odoo', 'X1'), orderMarkerId('OPO', 'Odoo', 'X1'));
});

test('الأمرُ ببنوده: المطلوبُ والمسلَّمُ مجموعان، والمسودّةُ بشكل OSO', () => {
  const p = buildOrdersPreview([row({ qty: 10, qtyDone: 4 }), row({ lineId: '902', sku: 'B', barcode: '', qty: 5, qtyDone: 0 })]);
  const o = p.orders[0];
  assert.equal(o.qty, 15);
  assert.equal(o.qtyDone, 4);
  const d = toOrderDraft(o);
  assert.equal(d.type, 'OSO');
  assert.equal(d.header.sourceRef, 'SBEN00074');
  assert.equal(d.header.sourceDoneDate, '2026-10-20');
  assert.equal(d.header.amountTotal, 28.76);
  assert.equal(d.lines[1].sourceLineId, '902');
  assert.ok(!('lineId' in d.lines[0]));
  assert.equal(toOrderDraft(buildOrdersPreview([row({ docStatus: 'cancel' })]).orders[0]).header.notes, 'أُلغي في أودو');
});

test('خطأٌ واحدٌ في الورقة يحجبها — والتنبيهُ لا يحجب', () => {
  assert.equal(buildOrdersPreview([row()], { sheetErrors: [{ row: 3, column: 'qty', message: 'x' }] }).ok, false);
  assert.equal(buildOrdersPreview([row()], { sheetErrors: [{ row: 3, column: 'lineId', severity: 'warning', message: 'x' }] }).ok, true);
  assert.equal(buildOrdersPreview([row()], { known: known('approved') }).ok, false, 'لا جديدَ ولا تغيير ⟵ لا شيء يُكتب');
});

test('سجلُّ الأمر من نوعٍ مستقلّ عن مستندات المصدر', () => {
  const o = buildOrdersPreview([row()]).orders[0];
  const m = orderMarker(o, 'DOC-1');
  assert.equal(m.kind, 'order');
  assert.equal(m.fingerprint, 'ORDER__ODOO__OSO__SBEN00074');
  assert.equal(m.documentType, 'OSO');
});

test('★★★ ورقةُ الأوامر تقبل أرقامَ أودو كما هي: بندٌ صفريٌّ ومفوتَرٌ سالب ومسلَّمٌ ناقصٌ بمرتجع — وورقةُ المستندات المنجَزة لا', async () => {
  const XLSX = await import('xlsx');
  const { importSheet } = await import('../excel/excelImport.js');
  const { DATASETS } = await import('../excel/excelSchema.js');
  const sheet = (key, rows) => {
    const ds = DATASETS[key];
    const head = ds.templateFields.map((f) => ds.columns.find((c) => c.field === f).labelAr);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows.map((r) => ds.templateFields.map((f) => r[f] ?? ''))]), ds.sheetName);
    return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  };
  const odd = [row({ qty: 0, docStatus: 'cancel' }), row({ lineId: '902', qty: 3, qtyDone: -1, qtyInvoiced: -2 }), row({ lineId: '903', qty: -1 })];
  const orders = await importSheet(sheet('sourceOrders', odd), 'sourceOrders', { sheetName: 'SourceOrders' });
  assert.equal(orders.errors.filter((e) => e.severity !== 'warning').length, 0, 'لا يُسقَط بندٌ واحدٌ ممّا في أودو');
  assert.equal(orders.rows.length, 3);
  // مستندُ المصدر المنجَز يُحرّك مخزونًا: الصفرُ فيه خطأٌ يُرفض.
  const posted = await importSheet(sheet('sourcePosted', [{ docRef: 'X/1', lineId: '1', doneDate: '2026-10-21', sku: 'A', qty: 0 }]), 'sourcePosted', { sheetName: 'SourcePosted' });
  assert.ok(posted.errors.some((e) => e.column === 'qty' && e.severity !== 'warning'));
});
