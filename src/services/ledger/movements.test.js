/**
 * اختبارات بناء الحركات — نوع الصنف والوحدات داخل الدفتر (م٣-أ · م٣-ب).
 *
 * الاختباران الحاكمان  يحرسان الترحيل: بلا خريطة أصنافٍ ولصنفٍ غير
 * معرَّف الوحدات، **لا يتغيّر رقم واحد**. وما بينهما تفعيلٌ صنفًا صنفًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMoves, balanceDeltas } from './movements.js';
import { indexLocations } from '../org/orgLocations.js';


/* ═══════════ نوع الصنف والوحدات في الدفتر (م٣-أ · م٣-ب) ═══════════ */

test('★★ الترحيل: بلا خريطة أصناف لا يتغيّر رقم واحد', () => {
  const doc = {
    id: 'D1', type: 'GRN', number: 'GRN-1',
    header: { warehouse: 'MAIN', receivedAt: '2026-08-11' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const before = buildMoves(doc);
  const after = buildMoves(doc, { items: null });
  assert.equal(before.moves[0].qty, 20);
  assert.equal(after.moves[0].qty, 20, 'الرقم نفسه حرفيًّا');
});

test('★★ صنفٌ قديم غير معرَّف الوحدات: يمرّ رقمه كما هو ولو كانت وحدته صندوقًا', () => {
  const items = new Map([['A', { sku: 'A', unit: 'piece' }]]); // بلا baseUom ولا uomFactors
  const doc = {
    id: 'D2', type: 'GRN', number: 'GRN-2',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const r = buildMoves(doc, { items });
  assert.deepEqual(r.problems, [], 'لا يُرفض');
  assert.equal(r.moves[0].qty, 20, 'ولا يُحوَّل');
});

test('★★ صنفٌ معرَّف: يُقيَّد بوحدة الأساس ويحفظ وحدة الإدخال', () => {
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { box: 12 } }]]);
  const doc = {
    id: 'D3', type: 'GRN', number: 'GRN-3',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 20, uom: 'box' }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves[0].qty, 240, 'الدفتر بالأساس');
  assert.equal(r.moves[0].entryQty, 20, 'والأصل محفوظ');
  assert.equal(r.moves[0].entryUom, 'box');
  assert.equal(r.moves[0].baseUom, 'piece');
});

test('★★ SAP-3 §10 ‹256›: معامل الطرف المختوم على السطر يتقدّم على معامل الصنف', () => {
  // الصنف كرتونه 24، لكن مورّد هذا المستند تعبئته 20 — خُتم من كتالوجه.
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { carton: 24 } }]]);
  const doc = {
    id: 'D3P', type: 'GRN', number: 'GRN-3P',
    header: { warehouse: 'MAIN' },
    lines: [{
      sku: 'A', qtyReceived: 3, uom: 'carton',
      uomFactor: 20, uomFactorFor: 'carton', uomFactorSource: 'partner',
    }],
  };
  const r = buildMoves(doc, { items });
  assert.deepEqual(r.problems, []);
  assert.equal(r.moves[0].qty, 60, 'تعبئة المورّد 20 لا كرتون الصنف 24');
  assert.equal(r.moves[0].entryQty, 3);
  assert.equal(r.moves[0].baseUom, 'piece');
});

test('★ SAP-3: ختمٌ لوحدةٍ غير وحدة السطر لا يُعتدّ به — يسقط لمعامل الصنف', () => {
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { carton: 24 } }]]);
  const doc = {
    id: 'D3Q', type: 'GRN', number: 'GRN-3Q',
    header: { warehouse: 'MAIN' },
    lines: [{
      sku: 'A', qtyReceived: 3, uom: 'carton',
      uomFactor: 20, uomFactorFor: 'piece', uomFactorSource: 'partner', // ختمٌ قديم لوحدةٍ أخرى
    }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves[0].qty, 72, 'معامل الصنف 24 — الختم البائت لا يلتصق');
});

test('★★ ف‑١٨ أُغلقت (LOC-108): موقع التخزين صار **في مفتاح الرصيد** لا عرضًا فقط', () => {
  const doc = {
    id: 'PW1', type: 'PUTAWAY', number: 'PW-1',
    header: { warehouse: 'E5' },
    lines: [{ sku: 'A', qty: 12, batch: 'B1', bin: 'a-01-03' }],
  };
  const r = buildMoves(doc);
  assert.equal(r.moves[0].bin, 'A-01-03', 'الحركة تعرف موقعها');
  const { deltas } = balanceDeltas(r.moves);
  const dest = deltas.find((d) => d.delta > 0);
  const source = deltas.find((d) => d.delta < 0);
  assert.equal(dest.bin, 'A-01-03', 'وجهة الرصيد تحمل الموقع');
  assert.equal(source.bin, '', 'ومصدر النظام لا موقع له');
  // ⟵ انقلب العقد هنا عمدًا: كان الموقع **خارج** المفتاح (قرارٌ مؤجَّل موثَّق
  // في sap-alignment.json حتى تحمل أسطر السحب مواقعها). تحقّق الشرط في
  // LOC-105، فدخل الموقع المفتاح في LOC-108 وأُغلقت ف‑١٨.
  assert.ok(dest.id.includes('A-01-03'), 'الموقع صار جزءًا من مفتاح الرصيد');
  assert.ok(!source.id.includes('A-01-03'), 'وساحة الاستلام تبقى على مفتاحها القديم — بلا موقع');
  assert.equal(source.id, 'A__RECEIVING__B1', '★★ الترحيل صفرُ الأثر: بلا موقعٍ ولا صلاحية ⇒ المفتاح القديم حرفيًّا');
});

test('★★ LOC-105: الموقع طرفٌ لا صفة — التخزين وجهةٌ والسحب مصدر', () => {
  // بلا هذا التمييز يستحيل قلبُ مفتاح الرصيد: يقيّد التخزين على مفتاحٍ بموقع
  // ويخصم السحب من مفتاحٍ بلا موقع، فتتباعد الأرصدة ويرفض حارس السالب سحبًا صحيحًا.
  const put = buildMoves({
    id: 'PW9', type: 'PUTAWAY', number: 'PW-9',
    header: { warehouse: 'E5' },
    lines: [{ sku: 'A', qty: 10, batch: 'B1', bin: 'MAIN-A01-R01' }],
  });
  assert.equal(put.moves[0].toBin, 'MAIN-A01-R01', 'التخزين يضع البضاعة على رفّ ⇒ الموقع وجهة');
  assert.equal(put.moves[0].fromBin, '', 'وساحة الاستلام بلا رفّ');

  const pick = buildMoves({
    id: 'PK9', type: 'PICK', number: 'PK-9',
    header: { warehouse: 'E5' },
    lines: [{ sku: 'A', qtyPicked: 4, batch: 'B1', bin: 'MAIN-A01-R01' }],
  });
  assert.equal(pick.moves[0].fromBin, 'MAIN-A01-R01', 'السحب يأخذها من رفّ ⇒ الموقع مصدر');
  assert.equal(pick.moves[0].toBin, '', 'وساحة التجهيز بلا رفّ');
});

test('★★ LOC-105: دورة تخزينٍ ثمّ سحبٍ من الرفّ نفسه تلتقي على مفتاحٍ واحد', () => {
  const put = buildMoves({
    id: 'PW8', type: 'PUTAWAY', header: { warehouse: 'E5' },
    lines: [{ sku: 'A', qty: 10, batch: 'B1', bin: 'MAIN-A01-R01' }],
  });
  const pick = buildMoves({
    id: 'PK8', type: 'PICK', header: { warehouse: 'E5' },
    lines: [{ sku: 'A', qtyPicked: 4, batch: 'B1', bin: 'MAIN-A01-R01' }],
  });
  const inKey = balanceDeltas(put.moves).deltas.find((d) => d.warehouse === 'E5').id;
  const outKey = balanceDeltas(pick.moves).deltas.find((d) => d.warehouse === 'E5').id;
  assert.equal(inKey, outKey, 'ما دخل الرفّ يخرج منه بالمفتاح نفسه — وإلّا رفض الحارس سحبًا صحيحًا');
});

test('★★ LOC-105: التسوية السالبة تقلب الطرفين ويبقى الرفّ هو هو', () => {
  const surplus = buildMoves({
    id: 'AJ1', type: 'ADJ', header: { warehouse: 'E5' },
    lines: [{ sku: 'A', bookQty: 10, actualQty: 12, bin: 'MAIN-A01-R01' }],
  });
  const shortage = buildMoves({
    id: 'AJ2', type: 'ADJ', header: { warehouse: 'E5' },
    lines: [{ sku: 'A', bookQty: 10, actualQty: 8, bin: 'MAIN-A01-R01' }],
  });
  assert.equal(surplus.moves[0].toBin, 'MAIN-A01-R01', 'الفائض يدخل الرفّ');
  assert.equal(shortage.moves[0].fromBin, 'MAIN-A01-R01', 'والعجز يخرج منه');
  const inKey = balanceDeltas(surplus.moves).deltas.find((d) => d.warehouse === 'E5').id;
  const outKey = balanceDeltas(shortage.moves).deltas.find((d) => d.warehouse === 'E5').id;
  assert.equal(inKey, outKey, 'والرفّ هو هو في الحالين');
});

test('★★ LOC-105: الدورات الأخرى لم تتأثّر — لا موقعَ يُقحَم على TR/TRN/TRC ولا DN/POD', () => {
  // القاعدة بلا `binSide` ⇒ طرفاها بلا موقع ⇒ سلوك اليوم حرفيًّا.
  const trn = buildMoves({
    id: 'TRN1', type: 'TRN', header: { fromWarehouse: 'E5', toWarehouse: 'E2' },
    lines: [{ sku: 'A', qtyShipped: 5, bin: 'MAIN-A01-R01' }],
  });
  assert.equal(trn.moves[0].fromBin, '', 'النقل لا يعرف رفوفًا — ولا يُخترع له');
  assert.equal(trn.moves[0].toBin, '');
  const dn = buildMoves({
    id: 'DN1', type: 'DN', header: { warehouse: 'E5', vehiclePlate: 'ABC-1' },
    lines: [{ sku: 'A', qty: 3, bin: 'MAIN-A01-R01' }],
  });
  assert.equal(dn.moves[0].fromBin, '');
  assert.equal(dn.moves[0].toBin, '', 'ولا يُنسب رفٌّ إلى مركبة');
});

test('★ الخدمة تخرج من القيد وتُسجَّل في skipped — لا تُبتلع صامتة', () => {
  const items = new Map([
    ['A', { sku: 'A', itemType: 'sale' }],
    ['FEE', { sku: 'FEE', itemType: 'service' }],
  ]);
  const doc = {
    id: 'D4', type: 'GRN', number: 'GRN-4',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 5 }, { sku: 'FEE', qtyReceived: 1 }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].sku, 'A');
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].sku, 'FEE');
});

test('★ صنفٌ معرَّف بوحدةٍ لا معامل لها: يُرفض بسببٍ مكتوب لا يُقيَّد بالخطأ', () => {
  const items = new Map([['A', { sku: 'A', baseUom: 'piece', uomFactors: { box: 12 } }]]);
  const doc = {
    id: 'D5', type: 'GRN', number: 'GRN-5',
    header: { warehouse: 'MAIN' },
    lines: [{ sku: 'A', qtyReceived: 3, uom: 'pallet' }],
  };
  const r = buildMoves(doc, { items });
  assert.equal(r.moves.length, 0);
  assert.match(r.problems[0], /لا معامل تحويل/);
});

/* ═══════════ ‹FNB-104› البُعد التنظيميّ مختومًا لحظة القيد ═══════════ */

const ORG_TREE = [
  { code: 'FNB', nameAr: 'قطاع الأغذية', level: 'sector' },
  { code: 'BRD1', nameAr: 'براند أول', level: 'brand', parentCode: 'FNB' },
  { code: 'BR01', nameAr: 'فرع أول', level: 'branch', parentCode: 'BRD1' },
];

// GRN كبقيّة اختبارات الملفّ — فالختم عامٌّ على كلّ قيدٍ لا على نوعٍ بعينه.
const ORG_DOC = {
  id: 'D-ORG', type: 'GRN', number: 'GRN-9',
  header: { warehouse: 'MAIN', costCenter: 'BR01', receivedAt: '2026-08-18' },
  lines: [{ sku: 'A', qtyReceived: 5 }],
};

test('★ الحركة تُختم بالرمز وأبعاده الثلاثة — القطاع والبراند والفرع من الشجرة وقت القيد', () => {
  const { moves } = buildMoves(ORG_DOC, { orgIndex: indexLocations(ORG_TREE) });
  assert.equal(moves[0].orgCode, 'BR01');
  assert.equal(moves[0].orgMatched, true);
  assert.equal(moves[0].orgBranch, 'BR01');
  assert.equal(moves[0].orgBrand, 'BRD1');
  assert.equal(moves[0].orgSector, 'FNB');
});

test('★ إعادة ربط الموقع لا تغيّر أبعاد حركةٍ قديمة — الختم وقت القيد لا وقت العرض', () => {
  const stamped = buildMoves(ORG_DOC, { orgIndex: indexLocations(ORG_TREE) }).moves[0];
  // غدًا يُنقل الفرع إلى براندٍ آخر — الحركة المختومة أمس لا تتأثّر.
  const movedTree = ORG_TREE.map((l) => (l.code === 'BR01' ? { ...l, parentCode: 'BRD2' } : l))
    .concat([{ code: 'BRD2', nameAr: 'براند ثانٍ', level: 'brand', parentCode: 'FNB' }]);
  const restamped = buildMoves(ORG_DOC, { orgIndex: indexLocations(movedTree) }).moves[0];
  assert.equal(stamped.orgBrand, 'BRD1'); // ختم الأمس كما هو.
  assert.equal(restamped.orgBrand, 'BRD2'); // وقيدُ اليوم بشجرة اليوم.
});

test('حركةٌ برمزٍ لا يطابق الشجرة تُختم matched:false — تُحصى في «غير مربوط» لا تذوب', () => {
  const doc = { ...ORG_DOC, header: { ...ORG_DOC.header, costCenter: 'GHOST' } };
  const { moves } = buildMoves(doc, { orgIndex: indexLocations(ORG_TREE) });
  assert.equal(moves[0].orgCode, 'GHOST');
  assert.equal(moves[0].orgMatched, false);
  assert.equal(moves[0].orgBranch, '');
});

test('بلا فهرسٍ (فشل قراءةٍ أو ما قبل الغرس): الرمز الخام يُختم وحده ولا يُخترع بُعد', () => {
  const { moves } = buildMoves(ORG_DOC);
  assert.equal(moves[0].orgCode, 'BR01');
  assert.equal('orgMatched' in moves[0], false); // لا حكمَ بجهل — الغائب غائب.
});

test('ترتيب orgCodeOf حتميّ: حقلان مملوءان يفوز أوّلهما في ORG_FIELDS — نفس النتيجة دائمًا', () => {
  const doc = {
    ...ORG_DOC,
    header: { ...ORG_DOC.header, costCenter: 'BR01', branch: 'GHOST' },
  };
  const a = buildMoves(doc, { orgIndex: indexLocations(ORG_TREE) }).moves[0];
  const b = buildMoves(doc, { orgIndex: indexLocations(ORG_TREE) }).moves[0];
  assert.equal(a.orgCode, 'BR01'); // costCenter قبل branch في القائمة المعلَنة.
  assert.equal(b.orgCode, a.orgCode);
});
