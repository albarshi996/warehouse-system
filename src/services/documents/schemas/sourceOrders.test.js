/**
 * ‹ODOO-ORD› مخطّطا أمرَي أودو — سجلّان بلا أثرٍ مخزنيٍّ ولا حجز، ولا يُنشآن باليد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_ORDER_SCHEMAS, isSourceOrderType, oso, opo } from './sourceOrders.js';
import { movesStock } from '../../ledger/postingRules.js';
import { IMPORT_ONLY_TYPES } from '../startGroups.js';

const keys = (schema, section) => schema.sections.find((s) => s.key === section)[section === 'header' ? 'fields' : 'columns'].map((f) => f.key);

test('أمرا أودو مسجّلان ولا يُنشآن باليد', () => {
  assert.deepEqual(Object.keys(SOURCE_ORDER_SCHEMAS), ['OSO', 'OPO']);
  for (const type of ['OSO', 'OPO']) {
    assert.ok(Object.hasOwn(IMPORT_ONLY_TYPES, type), `${type} خارج «بدء مستندٍ جديد»`);
    assert.equal(SOURCE_ORDER_SCHEMAS[type].sourceOrder, true);
  }
  assert.ok(isSourceOrderType('oso'));
  assert.ok(!isSourceOrderType('SO'), 'أمرُ البيع المحلّيّ ليس أمرَ أودو');
});

test('★★★ لا أثرَ مخزنيًّا — وإلّا حُجز الرصيدُ أو حُرّك مرّتين: في أودو وهنا', () => {
  assert.equal(movesStock('OSO'), false);
  assert.equal(movesStock('OPO'), false);
});

test('الرأسُ يحمل ما يُعرف به الأمرُ ويُحدَّث، والبنودُ المطلوبَ والمنجَزَ والمفوتَر', () => {
  for (const schema of [oso, opo]) {
    for (const k of ['sourceRef', 'sourceDoneDate', 'warehouse', 'partner', 'partnerCode', 'sourceState', 'doneStatus', 'amountTotal', 'sourceUpdatedAt']) {
      assert.ok(keys(schema, 'header').includes(k), `${schema.type}.${k}`);
    }
    for (const k of ['sku', 'qty', 'qtyDone', 'qtyInvoiced', 'unitPrice', 'subtotal']) assert.ok(keys(schema, 'lines').includes(k), `${schema.type}.${k}`);
  }
  assert.equal(oso.sections[1].columns.find((c) => c.key === 'qtyDone').label, 'المسلَّم');
  assert.equal(opo.sections[1].columns.find((c) => c.key === 'qtyDone').label, 'المستلَم');
});
