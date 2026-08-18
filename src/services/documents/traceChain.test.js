/**
 * حارس التتبّع المتّصل والهدر ‹FNB-405 · FNB-404›.
 *
 * أخطر ما يحرسه: **السلسلة تتّصل من إرساليّة المورّد إلى الرفّ** ولا تنقطع
 * عند الفحص (سطر 375: Traceability من المادّة الخام حتّى المنتج النهائيّ)،
 * و**دفعة المورّد صفةٌ تُقرأ لا مفتاحٌ يقسم الرصيد**، و**الهدر سببٌ محكوم
 * لا مستندٌ ثانٍ**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDocument } from './chain.js';
import { getSchema } from './schemas/index.js';
import { reasonsFor, reasonProblem, REASON_CONTEXTS } from './reasonCodes.js';
import { balanceId } from '../balances/balanceKey.js';

/**
 * حقول مخطّطٍ ما، مسطّحةً.
 * ⚠️ `columns` **عددٌ** في أقسام الحقول و**مصفوفةٌ** في الجداول — فالتحقّق
 * من النوع لا من الوجود، وإلّا انفجر التسطيح على أوّل قسمٍ عاديّ.
 */
const fieldsOf = (type) =>
  (getSchema(type)?.sections || []).flatMap((sec) => [
    ...(Array.isArray(sec.fields) ? sec.fields : []).map((f) => f.key),
    ...(Array.isArray(sec.columns) ? sec.columns : []).map((c) => c.key),
  ]);

/* ═══════════ ‹FNB-405› التتبّع المتّصل ═══════════ */

test('★ الاستلام يلتقط السبعة: الدفعة ودفعة المورّد وتاريخي الإنتاج والصلاحيّة', () => {
  const grn = fieldsOf('GRN');
  for (const key of ['batch', 'supplierBatch', 'mfgDate', 'expiryDate']) {
    assert.ok(grn.includes(key), `الاستلام ينقصه «${key}»`);
  }
});

test('★★ السلسلة تتّصل: إرساليّة المورّد ← الاستلام ← الفحص ← الرفّ بلا انقطاع', () => {
  const grn = {
    type: 'GRN', number: 'GRN-1', state: 'done',
    header: { warehouse: 'MAIN', supplier: 'مورّد' },
    lines: [{
      sku: 'CHICKEN', description: 'دجاج', qtyReceived: 100,
      batch: 'B-2026-01', supplierBatch: 'SUP-9931', mfgDate: '2026-08-01', expiryDate: '2026-09-01',
    }],
  };

  // ① الاستلام ← الفحص: الحقول الأربعة تعبر.
  const qc = deriveDocument(grn, 'QC');
  const qcLine = qc.lines[0];
  assert.equal(qcLine.batch, 'B-2026-01');
  assert.equal(qcLine.supplierBatch, 'SUP-9931', 'دفعة المورّد انقطعت عند الفحص');
  assert.equal(qcLine.mfgDate, '2026-08-01', 'تاريخ الإنتاج انقطع عند الفحص');
  assert.equal(qcLine.expiry, '2026-09-01');

  // ② الفحص ← التخزين: تعبر إلى الرفّ.
  // (والفحص يُعتمد أوّلًا — حارس «لا يُشتقّ إلّا من معتمَد» قائمٌ ويعمل.)
  qc.lines[0].qtyAccepted = 100;
  const putaway = deriveDocument({ ...qc, state: 'approved' }, 'PUTAWAY');
  const putLine = putaway.lines[0];
  assert.equal(putLine.supplierBatch, 'SUP-9931', 'دفعة المورّد لم تصل الرفّ');
  assert.equal(putLine.mfgDate, '2026-08-01', 'تاريخ الإنتاج لم يصل الرفّ');
  assert.equal(putLine.batch, 'B-2026-01');
});

test('★ ودفعة المورّد صفةٌ تُقرأ لا مفتاحٌ يقسم الرصيد', () => {
  // مفتاح الرصيد لم يُمسّ: نفس الصنف والمخزن والدفعة والصلاحيّة ⇒ رصيدٌ واحد
  // ولو اختلفت إرساليّة المورّد — وإلّا لانقسم الرصيد بلا داعٍ وسقط FEFO.
  const a = balanceId({ sku: 'CHICKEN', warehouse: 'MAIN', batch: 'B-1', expiry: '2026-09-01' });
  const b = balanceId({ sku: 'CHICKEN', warehouse: 'MAIN', batch: 'B-1', expiry: '2026-09-01', supplierBatch: 'SUP-2' });
  assert.equal(a, b, 'دفعة المورّد دخلت مفتاح الرصيد فقسمته');
});

/* ═══════════ ‹FNB-404› الهدر ═══════════ */

test('★ الهدر سياقٌ في سجلّ الأسباب القائم — لا مستندٌ ثانٍ يقسم رصيد التالف', () => {
  assert.ok(REASON_CONTEXTS.waste, 'سياق الهدر غائب');
  const ids = reasonsFor('waste').map((r) => r.id);
  for (const id of ['expired', 'overproduction', 'prep_error', 'customer_return', 'breakage', 'temperature', 'trim', 'other']) {
    assert.ok(ids.includes(id), `سبب الهدر «${id}» غائب`);
  }
  // والمستند هو سند التالف القائم — لا نوعٌ أربعون.
  assert.ok(getSchema('DMG'), 'سند التالف هو وعاء الهدر');
});

test('وأسباب الهدر تُميّزه عن التالف المخزنيّ — ومنها ما يُحمَّل ومنها ما لا يُحمَّل', () => {
  const reasons = reasonsFor('waste');
  assert.ok(reasons.some((r) => r.blamesWorker === true), 'خطأ التحضير يُحمَّل');
  assert.ok(reasons.some((r) => r.blamesWorker === false), 'وانتهاء الصلاحيّة لا يُحمَّل');
  // و«أخرى» تُلزم بنصّ كبقيّة السياقات.
  assert.ok(reasonProblem('waste', { id: 'other' }).problem);
  assert.equal(reasonProblem('waste', { id: 'expired' }).ok, true);
});
