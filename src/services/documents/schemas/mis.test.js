/** حارس صرف الموادّ ‹FNB-502› — والانحراف عن الوصفة يُعلَن. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import schema, { materialIssueWarnings } from './mis.js';

test('صرف الموادّ: يحمل المطلوب من الوصفة والمصروف فعلًا — والفرق هو الـYield', () => {
  assert.equal(schema.type, 'MIS');
  const cols = schema.sections.find((s) => s.kind === 'table').columns.map((c) => c.key);
  assert.ok(cols.includes('qtyRequired'), 'المحسوب من الوصفة');
  assert.ok(cols.includes('qtyIssued'), 'والمصروف فعلًا');
  assert.ok(cols.includes('batch') && cols.includes('expiry'), 'وتتبّعٌ لا ينقطع');
});

test('★ انحرافٌ يتجاوز ٪١٠ عن المحسوب يُعلَن ليُفسَّر — ولا يُمنع', () => {
  assert.ok(materialIssueWarnings({ lines: [{ qtyRequired: 100, qtyIssued: 130, batch: 'B1' }] })
    .some((m) => m.includes('٪١٠')));
  // وضمن الحدّ يصمت.
  assert.deepEqual(materialIssueWarnings({ lines: [{ qtyRequired: 100, qtyIssued: 105, batch: 'B1' }] }), []);
});

test('بندٌ بلا تشغيلةٍ ولا صلاحيّة يقطع التتبّع — يُعلَن', () => {
  assert.ok(materialIssueWarnings({ lines: [{ qtyIssued: 10 }] })
    .some((m) => m.includes('ينقطع التتبّع')));
  assert.ok(materialIssueWarnings({ lines: [] }).some((m) => m.includes('لا بند مصروف')));
});
