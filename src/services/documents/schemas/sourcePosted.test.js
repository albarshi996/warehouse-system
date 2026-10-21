/**
 * ‹SRC-POST› مخطّطاتُ مستندات المصدر الخمسة — الحقولُ التي يقرأها القيد، والتحذيرات، والأدوار.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_POSTED_SCHEMAS, isSourcePostedType, sourcePostedWarnings, sri, sro, sxo, sxi, sra } from './sourcePosted.js';
import { warehouseFieldsFor } from '../../ledger/postingRules.js';
import { IMPORT_ONLY_TYPES } from '../startGroups.js';

const headerKeys = (schema) => schema.sections.find((s) => s.key === 'header').fields.map((f) => f.key);
const required = (schema) => schema.sections.find((s) => s.key === 'header').fields.filter((f) => f.required).map((f) => f.key);

test('الأنواعُ الخمسة — ولا يُنشأ أيٌّ منها باليد', () => {
  assert.deepEqual(Object.keys(SOURCE_POSTED_SCHEMAS), ['SRI', 'SRO', 'SXO', 'SXI', 'SRA']);
  for (const [type, schema] of Object.entries(SOURCE_POSTED_SCHEMAS)) {
    assert.equal(schema.type, type);
    assert.equal(schema.sourcePosted, true);
    assert.ok(Object.hasOwn(IMPORT_ONLY_TYPES, type), `${type} خارج «بدء مستندٍ جديد» بسببٍ مكتوب`);
  }
  assert.ok(isSourcePostedType('sro'), 'حالةُ الحروف لا تُخفي النوع');
  assert.ok(!isSourcePostedType('PICK'));
  assert.ok(!isSourcePostedType(''));
});

test('★★ كلُّ خانة مستودعٍ يقرأها القيد موجودةٌ في الرأس — ومطلوبةٌ حيث لا قيدَ بلاها', () => {
  for (const schema of [sri, sro, sxo, sxi, sra]) {
    for (const field of warehouseFieldsFor(schema.type)) {
      assert.ok(headerKeys(schema).includes(field), `${schema.type}: القيد يقرأ «${field}» والرأس لا يحمله`);
      assert.ok(required(schema).includes(field), `${schema.type}: «${field}» يُحرّك الرصيد فلا يُترك فارغًا`);
    }
    assert.ok(required(schema).includes('sourceRef'), 'المرجعُ مطلوب — به يُمنع التكرار');
    assert.ok(required(schema).includes('sourceDoneDate'));
  }
  assert.deepEqual(warehouseFieldsFor('SXO'), ['fromWarehouse']);
  assert.deepEqual(warehouseFieldsFor('SXI'), ['toWarehouse']);
  assert.deepEqual(warehouseFieldsFor('SRA'), ['warehouse']);
});

test('البنودُ تحمل ما يقرؤه القيد: الكمّيّة والصلاحية والتكلفة', () => {
  for (const schema of [sri, sro, sxo, sxi, sra]) {
    const cols = schema.sections.find((s) => s.key === 'lines').columns.map((c) => c.key);
    for (const key of ['sku', 'barcode', 'qty', 'batch', 'expiry', 'unitCost']) assert.ok(cols.includes(key), `${schema.type}.${key}`);
  }
});

test('الأدوارُ لمدير المستودع وحده — والمديرُ العامّ فوقها بحكم canDo', () => {
  for (const schema of [sri, sro, sxo, sxi, sra]) {
    assert.deepEqual(schema.roles.approve, ['warehouse_manager']);
    assert.deepEqual(schema.roles.complete, ['warehouse_manager']);
  }
});

test('التحذيرات: بندٌ بلا هويّة · كمّيّةٌ صفر · مرجعٌ مفقود', () => {
  assert.deepEqual(sourcePostedWarnings({ header: { sourceRef: 'WHNBE/OUT/00074' }, lines: [{ sku: 'A', qty: 2 }] }), []);
  assert.deepEqual(sourcePostedWarnings({ header: { sourceRef: 'INV/1' }, lines: [{ sku: 'A', qty: -3 }] }), [], 'نقصُ التسوية مشروع');
  const w = sourcePostedWarnings({ header: {}, lines: [{ sku: '', barcode: ' ', qty: 1 }, { sku: 'B', qty: 0 }] });
  assert.equal(w.length, 3);
  assert.match(w[0], /بلا كودٍ ولا باركود/);
  assert.match(w[1], /كمّيّتُه صفر/);
  assert.match(w[2], /يسقط منعُ التكرار/);
  assert.deepEqual(sourcePostedWarnings(null).length, 1, 'مستندٌ فارغٌ لا يُسقط الدالّة');
  assert.equal(sri.warnings, sourcePostedWarnings);
});
