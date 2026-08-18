/** حارس استلام الإنتاج ‹FNB-502› — الدفعة تُولَد والـYield يُحسب. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import schema, { productionReceiptWarnings } from './prc.js';

test('استلام الإنتاج: الدفعة وتاريخا الإنتاج والصلاحيّة على المنتَج', () => {
  assert.equal(schema.type, 'PRC');
  const cols = schema.sections.find((s) => s.kind === 'table').columns.map((c) => c.key);
  for (const key of ['batch', 'mfgDate', 'expiry', 'qtyProduced']) {
    assert.ok(cols.includes(key), `ينقصه «${key}»`);
  }
});

test('★ الـYield محسوبٌ — والمخطَّط الصفريّ لا يُقسَم عليه', () => {
  const f = schema.sections.find((s) => s.key === 'summary').fields.find((x) => x.key === 'yieldPct');
  assert.equal(f.compute({ lines: [{ qtyPlanned: 200, qtyProduced: 180 }] }), 90);
  assert.equal(f.compute({ lines: [{ qtyProduced: 5 }] }), 0);
});

test('منتَجٌ بلا دفعةٍ أو صلاحيّةٍ أو فحصٍ يُعلَن — الجودة قبل التعبئة', () => {
  const w = productionReceiptWarnings({ header: {}, lines: [{ qtyProduced: 10 }] });
  assert.ok(w.some((m) => m.includes('بلا دفعة إنتاج')));
  assert.ok(w.some((m) => m.includes('بلا تاريخ صلاحيّة')));
  assert.ok(w.some((m) => m.includes('بلا مرجع فحص')));
});
