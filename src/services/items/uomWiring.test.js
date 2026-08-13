/**
 * حارس وصل محرّك الوحدات (SAP-3) — الاختبار قبل الواجهة (§22 ‹995›).
 *
 * البوّابات الحرفيّة: §10 ‹255› (3 × CTN-24 = 72) · §10 ‹256› (موردان
 * بتعبئة 24 و20 لا يختلطان) · §10.1 ‹234› (السطر يحفظ الكمّيّة والوحدة
 * والمعامل والأساس) · §10.1 ‹238› (باركود الوحدة يحدّد الثلاثة معًا).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseUomFactors,
  formatUomFactors,
  parseUomBarcodes,
  formatUomBarcodes,
  uomOptionsForLine,
  defaultUomFor,
  unitForBarcode,
  buildItemIndexes,
  itemForLine,
  stampPartnerUom,
  refreshLineBase,
} from './uomWiring.js';

/** صنفٌ عرّف وحداته: الأساس قطعة، والكرتون ٢٤. */
const ITEM = { sku: 'ITM-1', unit: 'piece', baseUom: 'piece', uomFactors: { carton: 24 } };

/* ═══════════════ المحرّر: نصّ ⇄ بنية ═══════════════ */

test('★ parseUomFactors: «كرتون=24, box=12» يفهم المرادفات ويطبّع', () => {
  const { ok, factors } = parseUomFactors('كرتون=24, box=12');
  assert.equal(ok, true);
  assert.deepEqual(factors, { carton: 24, box: 12 });
});

test('parseUomFactors: الفاسد يُقال بالاسم — وحدة مجهولة ومعامل صفر', () => {
  const { ok, problems } = parseUomFactors('foo=5, carton=0');
  assert.equal(ok, false);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /غير معروفة/);
  assert.match(problems[1], /موجبًا/);
});

test('formatUomFactors ⇄ parseUomFactors رحلة ذهابٍ وإياب بلا فقد', () => {
  const text = formatUomFactors({ carton: 24, kg: 6 });
  assert.deepEqual(parseUomFactors(text).factors, { carton: 24, kg: 6 });
});

test('parseUomBarcodes: باركود⇐وحدة، والأصفار البادئة تُسقط كقاعدة الماستر', () => {
  const { ok, map } = parseUomBarcodes('0111=كرتون');
  assert.equal(ok, true);
  assert.deepEqual(map, { 111: 'carton' });
  assert.match(parseUomBarcodes('111=xyz').problems[0], /غير معروفة/);
  assert.deepEqual(parseUomBarcodes(formatUomBarcodes(map)).map, map);
});

/* ═══════════════ قائمة الوحدات (ف‑٤٢) ═══════════════ */

test('★★ صنفٌ عرّف وحداته: الخيارات وحداته المتاحة لا النصّ الحرّ', () => {
  const options = uomOptionsForLine({ uom: '' }, ITEM);
  const values = options.map((o) => o.value);
  assert.ok(values.includes('piece'));
  assert.ok(values.includes('carton'));
  assert.ok(!values.includes('kg')); // عائلة أخرى بلا معامل — لا تُعرض
});

test('★ التوافق الرجعيّ: نصّ السطر القديم يبقى خيارًا ظاهرًا كما كُتب', () => {
  const options = uomOptionsForLine({ uom: 'كرتونة قديمة' }, ITEM);
  const legacy = options.find((o) => o.value === 'كرتونة قديمة');
  assert.ok(legacy);
  assert.match(legacy.label, /نصّ قديم/);
});

test('صنفٌ مجهول أو بلا تعريف: سيّد الوحدات كلّه', () => {
  const values = uomOptionsForLine({}, null).map((o) => o.value);
  assert.ok(values.includes('piece') && values.includes('kg') && values.includes('litre'));
});

test('★ مرادفٌ مخزَّن («CTN») يبقى خيارًا بقيمته الحرفيّة وتفسيره القياسيّ', () => {
  const options = uomOptionsForLine({ uom: 'CTN' }, ITEM);
  const legacy = options.find((o) => o.value === 'CTN');
  assert.ok(legacy, 'القيمة المخزَّنة لا تختفي من القائمة');
  assert.match(legacy.label, /كرتون/);
});

/* ═══════════════ وحدة الشراء والبيع (ف‑٩) ═══════════════ */

test('★ ف‑٩: مستند الشراء يقترح وحدة الشراء، والبيع وحدة البيع، والغائب أساسًا', () => {
  const item = { ...ITEM, buyUom: 'carton', sellUom: 'piece' };
  assert.equal(defaultUomFor(item, 'PO'), 'carton');
  assert.equal(defaultUomFor(item, 'SO'), 'piece');
  assert.equal(defaultUomFor(ITEM, 'PO'), 'piece'); // لا buyUom ⇒ الأساس
  assert.equal(defaultUomFor(item, 'CC'), 'piece'); // خارج العائلتين ⇒ الأساس
  assert.equal(defaultUomFor(null, 'PO'), '');
});

/* ═══════════════ باركود الوحدة (ف‑١٠) ═══════════════ */

test('★★ §10.1 ‹238›: باركود الوحدة يحدّد الوحدة — وبصيغة الأصفار البادئة', () => {
  const item = { ...ITEM, uomBarcodes: { 111: 'carton' } };
  assert.equal(unitForBarcode(item, '111'), 'carton');
  assert.equal(unitForBarcode(item, '0111'), 'carton');
  assert.equal(unitForBarcode(item, '999'), '');
  assert.equal(unitForBarcode(ITEM, '111'), '');
});

/* ═══════════════ فهرسا الأصناف وصنف السطر ═══════════════ */

test('itemForLine: الكود أوّلًا (الهويّة) ثمّ الباركود', () => {
  const other = { sku: 'ITM-2', barcodes: ['555'] };
  const indexes = buildItemIndexes([ITEM, other]);
  assert.equal(itemForLine({ sku: 'itm-1' }, indexes), ITEM);
  assert.equal(itemForLine({ sku: '', barcode: '0555' }, indexes), other);
  assert.equal(itemForLine({ sku: 'X' }, indexes), null);
});

/* ═══════════════ إثراء السطر (ف‑١١ · §10.1 ‹234›) ═══════════════ */

test('★★ §10 ‹255›: 3 × كرتون-24 ⇒ 72 قطعة أساسيّة محفوظة على السطر', () => {
  const line = refreshLineBase({ sku: 'ITM-1', qty: 3, uom: 'carton' }, ITEM);
  assert.equal(line.uomFactor, 24);
  assert.equal(line.baseQty, 72);
  assert.equal(line.baseUom, 'piece');
  assert.equal(line.uomFactorSource, 'item');
});

test('★★ §10 ‹256›: موردان بتعبئة 24 و20 لا يختلط تحويلهما — معامل كلٍّ من سجلّه', () => {
  const entry24 = { uom: 'carton', conversionFactor: 24 };
  const entry20 = { uom: 'carton', conversionFactor: 20 };
  const a = refreshLineBase(stampPartnerUom({ qty: 3 }, entry24), ITEM);
  const b = refreshLineBase(stampPartnerUom({ qty: 3 }, entry20), ITEM);
  assert.equal(a.baseQty, 72);
  assert.equal(b.baseQty, 60);
  assert.equal(b.uomFactorSource, 'partner'); // معامل الطرف يتقدّم على معامل الصنف
});

test('★ تغيير الوحدة يُسقط معامل الطرف المختوم — لا يلتصق بوحدةٍ أخرى', () => {
  const stamped = stampPartnerUom({ qty: 3 }, { uom: 'carton', conversionFactor: 20 });
  const switched = refreshLineBase({ ...stamped, uom: 'piece' }, ITEM);
  assert.equal(switched.uomFactor, 1); // معامل الصنف للقطعة، لا 20
  assert.equal(switched.baseQty, 3);
  assert.equal(switched.uomFactorSource, 'item');
});

test('★ لا رقمَ من جهل: وحدةٌ بلا معامل تمحو حقول الاشتقاق ولا تُبقي قديمًا', () => {
  const line = refreshLineBase(
    { qty: 3, uom: 'box', uomFactor: 99, baseQty: 297, uomFactorFor: 'box', uomFactorSource: 'item' },
    ITEM // لا معامل لـbox عند هذا الصنف
  );
  assert.equal('uomFactor' in line, false);
  assert.equal('baseQty' in line, false);
});

test('صنفٌ لم يعرّف وحداته: السطر يمرّ كما هو — سلوك اليوم حرفيًّا', () => {
  const legacyItem = { sku: 'OLD-1', unit: 'piece' };
  const line = refreshLineBase({ qty: 5, uom: 'كرتونة' }, legacyItem);
  assert.equal('baseQty' in line, false);
  assert.equal(line.qty, 5);
  assert.equal(line.uom, 'كرتونة');
});
