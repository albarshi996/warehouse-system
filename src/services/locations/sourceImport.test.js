/**
 * اختبارات صندوق الاستيراد — منع التكرار وحدّ التحرير وتجميع المستند.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDENTITY_FIELDS,
  applyEdit,
  buildPreview,
  classifyRows,
  deviationReport,
  groupIntoDocuments,
  isEditable,
  qtyDeviation,
  toDocumentDraft,
} from './sourceImport.js';

const row = (over = {}) => ({
  docRef: 'IN-42',
  docId: '18342',
  lineId: '1',
  sourceUpdatedAt: '2026-08-16',
  sourceSystem: 'Odoo',
  docStatus: 'done',
  receiptDate: '2026-08-16',
  warehouse: 'E5',
  supplier: 'مورّد',
  sku: 'WNW-001',
  barcode: '629',
  description: 'زيت',
  uom: 'كرتون',
  qty: 100,
  batch: 'B1',
  expiry: '2027-06-30',
  fingerprint: 'IN-42__1__2026-08-16',
  ...over,
});

test('★★ الشيت مسطّح والمستند مركّب: صفوفٌ برأسٍ مكرّر تصير مستندًا واحدًا ببنود', () => {
  const { documents, conflicts } = groupIntoDocuments(
    [row(), row({ lineId: '2', sku: 'WNW-002', qty: 60, fingerprint: 'IN-42__2__2026-08-16' })],
    'receipt'
  );
  assert.equal(documents.length, 1, 'مرجعٌ واحد ⇒ مستندٌ واحد');
  assert.equal(documents[0].lines.length, 2);
  assert.equal(documents[0].warehouse, 'E5', 'الرأس يُلتقط مرّةً لا يتكرّر');
  assert.deepEqual(conflicts, []);
});

test('★★ اختلاف رأسٍ بين صفَّين يُعلَن تعارضًا ولا يُبتلع بأخذ آخر قيمة', () => {
  // مستودعان لمستندٍ واحد خطأٌ حقيقيّ — وأخذُ الأخير صامتًا يُخزّن في المكان الخطأ.
  const { conflicts } = groupIntoDocuments([row(), row({ lineId: '2', warehouse: 'E2' })], 'receipt');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, 'warehouse');
  assert.deepEqual(conflicts[0].values, ['E5', 'E2']);
});

test('★★ منع التكرار: بصمةٌ مستوردة سلفًا لا تدخل ثانيةً', () => {
  const { fresh, duplicate } = classifyRows([row(), row({ lineId: '2', fingerprint: 'NEW' })], new Set(['IN-42__1__2026-08-16']));
  assert.equal(duplicate.length, 1, 'المعروفة تُستبعد');
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].fingerprint, 'NEW');
});

test('★★ منع التكرار يشمل التكرار **داخل الملفّ نفسه**', () => {
  const { fresh, duplicate } = classifyRows([row(), row()], new Set());
  assert.equal(fresh.length, 1, 'صفّان ببصمةٍ واحدة ⇒ واحدٌ يمرّ');
  assert.equal(duplicate.length, 1);
});

test('★★ استيراد الملفّ نفسه مرّتين لا يضاعف شيئًا', () => {
  const rows = [row(), row({ lineId: '2', fingerprint: 'IN-42__2__2026-08-16' })];
  const first = buildPreview({ rows, errors: [] }, new Set(), 'receipt');
  assert.equal(first.summary.fresh, 2);
  assert.equal(first.summary.qty, 200);

  const known = new Set(rows.map((r) => r.fingerprint));
  const second = buildPreview({ rows, errors: [] }, known, 'receipt');
  assert.equal(second.summary.fresh, 0, 'لا شيء جديد');
  assert.equal(second.summary.duplicate, 2);
  assert.equal(second.documents.length, 0, 'ولا مستندَ يُنشأ');
  assert.equal(second.ok, false);
});

test('ملفٌّ نصفه مستوردٌ سلفًا: يمرّ نصفه الجديد ويُعلَن الباقي', () => {
  const rows = [row(), row({ lineId: '2', fingerprint: 'NEW' })];
  const p = buildPreview({ rows, errors: [] }, new Set(['IN-42__1__2026-08-16']), 'receipt');
  assert.equal(p.ok, true, 'المكرّر وحده لا يمنع الاستيراد');
  assert.equal(p.summary.fresh, 1);
  assert.equal(p.summary.duplicate, 1);
});

test('🔒 ★★ حدّ التحرير: هويّة السطر لا تُحرَّر — وتحريرها يكسر منع التكرار', () => {
  for (const f of IDENTITY_FIELDS) {
    assert.equal(isEditable(f), false, `${f} يجب ألّا يُحرَّر`);
    const v = applyEdit(row(), f, 'X');
    assert.equal(v.ok, false);
    assert.match(v.problem, /يكسر منع التكرار/);
    assert.equal(v.line.docRef, 'IN-42', 'ولا يُمسّ البند');
  }
});

test('التحرير مسموحٌ فيما عدا الهويّة', () => {
  for (const f of ['qty', 'batch', 'expiry', 'description', 'uom', 'notes']) {
    assert.equal(isEditable(f), true, `${f} يجب أن يُحرَّر`);
  }
  const v = applyEdit(row(), 'batch', 'B9');
  assert.equal(v.ok, true);
  assert.equal(v.line.batch, 'B9');
  assert.deepEqual(v.line._edited, ['batch']);
});

test('★★ تعديل الكمّيّة يُوسَم بقيمته الأصليّة — فلا يصير الفرق مع النظام كذبة', () => {
  const once = applyEdit(row(), 'qty', 90).line;
  assert.equal(once._originalQty, 100);
  assert.deepEqual(qtyDeviation(once), { original: 100, current: 90, diff: -10 });

  // تعديلان متتاليان لا يُضيعان الأصل.
  const twice = applyEdit(once, 'qty', 80).line;
  assert.equal(twice._originalQty, 100, 'الأصل يُحفظ مرّةً واحدة');
  assert.equal(qtyDeviation(twice).diff, -20);

  // والعودة إلى الأصل ليست انحرافًا.
  assert.equal(qtyDeviation(applyEdit(twice, 'qty', 100).line), null);
  assert.equal(qtyDeviation(row()), null, 'وبلا تحريرٍ لا انحراف');
});

test('تقرير الانحراف يجمع كلّ ما حُرّر عبر المستندات', () => {
  const { documents } = groupIntoDocuments([row(), row({ lineId: '2', sku: 'B', fingerprint: 'F2' })], 'receipt');
  documents[0].lines[0] = applyEdit(documents[0].lines[0], 'qty', 90).line;
  const rep = deviationReport(documents);
  assert.equal(rep.length, 1);
  assert.equal(rep[0].sku, 'WNW-001');
  assert.equal(rep[0].diff, -10);
});

test('★★ المسودّة تُشكَّل بلا موقع — العامل يختاره لحظة التنفيذ', () => {
  const { documents } = groupIntoDocuments([row()], 'receipt');
  const draft = toDocumentDraft(documents[0], { type: 'receipt' });
  assert.equal(draft.type, 'PUTAWAY');
  assert.equal(draft.header.warehouse, 'E5');
  assert.equal(draft.header.sourceRef, 'IN-42', 'الخيط إلى النظام المصدر محفوظ');
  assert.equal(draft.lines[0].qty, 100);
  assert.equal(draft.lines[0].bin, '', 'الموقع فارغٌ عمدًا — قرار المالك: العامل يختار');
});

test('المسودّة الصادرة تصير PICK بكمّيّةٍ مطلوبة لا كمّيّةٍ واردة', () => {
  const del = { docRef: 'OUT-9', deliveryDate: '2026-08-16', warehouse: 'E5', customer: 'عميل', orderRef: 'SO-3', lines: [{ sku: 'A', qty: 5, batch: 'B1', expiry: '2027-01-01' }] };
  const draft = toDocumentDraft(del, { type: 'delivery' });
  assert.equal(draft.type, 'PICK');
  assert.equal(draft.lines[0].qtyRequested, 5);
  assert.ok(!Object.hasOwn(draft.lines[0], 'qty'), 'لا كمّيّة واردة في مستند سحب');
  assert.equal(draft.header.branchOrderRef, 'SO-3', 'أمر البيع مرجعٌ فقط');
});

test('أخطاء الملفّ تمنع الاستيراد، والتنبيهات لا تمنعه', () => {
  const rows = [row()];
  const withError = buildPreview({ rows, errors: [{ row: 2, column: 'qty', message: 'خطأ' }] }, new Set(), 'receipt');
  assert.equal(withError.ok, false);
  assert.equal(withError.errors.length, 1);

  const withWarning = buildPreview({ rows, errors: [{ row: 2, column: 'lineId', severity: 'warning', message: 'تنبيه' }] }, new Set(), 'receipt');
  assert.equal(withWarning.ok, true, 'التنبيه يُعلَن ولا يمنع');
  assert.equal(withWarning.warnings.length, 1);
});
