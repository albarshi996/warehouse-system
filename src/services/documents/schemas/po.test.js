/**
 * اختبارات حارس إرسال أمر الشراء (MG-07) — الشرطُ الصلب الذي لم يكن محميًّا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { poSubmitProblems } from './po.js';

test('★★ يرفض الكمّيّةَ غير الموجبة على بندٍ مملوء', () => {
  assert.ok(poSubmitProblems({ lines: [{ sku: 'A', qty: -3, uom: 'كرتون' }] }).some((p) => /غير موجبة/.test(p)));
  assert.ok(poSubmitProblems({ lines: [{ sku: 'A', qty: 0, uom: 'كرتون' }] }).some((p) => /غير موجبة/.test(p)));
});

test('★★ يرفض الكمّيّةَ بلا وحدة', () => {
  assert.ok(poSubmitProblems({ lines: [{ sku: 'A', qty: 5 }] }).some((p) => /بلا وحدة/.test(p)));
  assert.deepEqual(poSubmitProblems({ header: {}, lines: [{ sku: 'A', qty: 5, uom: 'كرتون' }] }), []);
});

test('★★ يرفض أمرًا بلا بندٍ موجب', () => {
  assert.ok(poSubmitProblems({ lines: [] }).some((p) => /بلا طلب/.test(p)));
  assert.ok(poSubmitProblems({ lines: [{ sku: 'A', qty: 0 }] }).some((p) => /بلا طلب/.test(p)));
});

test('★★ يرفض التاريخَ المقلوب (التسليمُ قبل الأمر)', () => {
  assert.ok(
    poSubmitProblems({ header: { issueDate: '2026-10-21', requiredDelivery: '2026-10-10' }, lines: [{ sku: 'A', qty: 5, uom: 'ك' }] })
      .some((p) => /مقلوب/.test(p))
  );
});

test('★ أمرٌ سليمٌ يمرّ بلا اعتراض', () => {
  assert.deepEqual(
    poSubmitProblems({ header: { issueDate: '2026-10-21', requiredDelivery: '2026-10-28' }, lines: [{ sku: 'A', qty: 5, uom: 'كرتون' }] }),
    []
  );
  // بندٌ فارغٌ (بلا صنفٍ ولا كمّيّة) مع بندٍ سليم لا يُعطّل الإرسال.
  assert.deepEqual(
    poSubmitProblems({ header: {}, lines: [{ sku: 'A', qty: 5, uom: 'ك' }, { qty: 0 }] }),
    []
  );
});
