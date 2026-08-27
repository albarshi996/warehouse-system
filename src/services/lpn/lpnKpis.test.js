/**
 * اختبارات مؤشّرات الأداء — «لا رقمَ بلا أصل».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  exceptionHotspots,
  palletsByState,
  pickAccuracy,
  receiptToStorageMs,
  receivingCycleMs,
  reprintRate,
  scanRejectRate,
  scansByActor,
} from './lpnKpis.js';

test('★★★ كلّ مؤشّرٍ يفصح عن أصله وحجم عيّنته — ومؤشّرٌ على ثلاثٍ يُقال إنّه على ثلاث', () => {
  const r = scanRejectRate([{ result: 'ok' }, { result: 'rejected' }, { result: 'ok' }]);
  assert.equal(r.value, 33);
  assert.match(r.basis, /المرفوض من مجموع القراءات/);
  assert.equal(r.sample, 3);
  assert.equal(r.reliable, false, 'ثلاثُ عيّناتٍ لا يُبنى عليها قرار');

  const many = scanRejectRate(Array.from({ length: 20 }, (_, i) => ({ result: i < 2 ? 'rejected' : 'ok' })));
  assert.equal(many.value, 10);
  assert.ok(many.reliable);
});

test('الفارغُ يعيد null لا صفرًا — «لا أعرف» غير «صفر»', () => {
  assert.equal(scanRejectRate([]).value, null);
  assert.equal(pickAccuracy([]).value, null);
  assert.equal(reprintRate([]).value, null);
  assert.equal(receivingCycleMs([]).value, null);
});

test('★★ زمنُ الاستلام من فتح الجلسة إلى آخر قرار حوكمة', () => {
  const sessions = [
    { openedAt: '2026-08-27T08:00:00Z', closedAt: '2026-08-27T10:00:00Z' },
    { openedAt: '2026-08-27T08:00:00Z', drafts: [{ decidedAt: '2026-08-27T12:00:00Z' }] },
  ];
  const r = receivingCycleMs(sessions);
  assert.equal(r.value, 3 * 60 * 60 * 1000, 'متوسّط ساعتين وأربع');
  assert.equal(r.sample, 2);
});

test('★★ الوقت بين الاعتماد والتخزين — طبليةٌ تبقى في الساحة تُداس', () => {
  const units = [{ code: 'A' }];
  const events = {
    A: [
      { type: 'APPROVED', at: '2026-08-27T09:00:00Z' },
      { type: 'MOVED', at: '2026-08-27T11:00:00Z' },
      { type: 'MOVED', at: '2026-08-28T11:00:00Z' },
    ],
  };
  const r = receiptToStorageMs(units, events);
  assert.equal(r.value, 2 * 60 * 60 * 1000, 'أوّلُ انتقالٍ لا آخره');
});

test('★★★ دقّةُ التحضير بالخطوات لا بالكمّيّات — والنصفُ خطأٌ كاملٌ عند العميل', () => {
  const tasks = [{
    steps: [
      { state: 'DONE', required: 10, picked: 10 },
      { state: 'DONE', required: 10, picked: 5 },
      { state: 'SKIPPED', required: 10, picked: 0 },
      { state: 'DONE', required: 5, picked: 5 },
    ],
  }];
  const r = pickAccuracy(tasks);
  assert.equal(r.value, 50, 'اثنتان من أربع — والناقصةُ نصفَها لا تُحسب');
  assert.equal(r.sample, 4);
});

test('قراءاتُ كلّ موظّف مرتّبةً — للتوزيع لا للمقارنة العقابيّة', () => {
  const by = scansByActor([{ actor: 'محمد' }, { actor: 'أحمد' }, { actor: 'محمد' }, { actor: '' }]);
  assert.deepEqual(by, [{ actor: 'محمد', count: 2 }, { actor: 'أحمد', count: 1 }]);
});

test('عددُ الطبالي في كلّ حالة مرتّبًا', () => {
  const s = palletsByState([{ state: 'STORED' }, { state: 'STORED' }, { state: 'PICKING' }]);
  assert.deepEqual(s, [{ state: 'STORED', count: 2 }, { state: 'PICKING', count: 1 }]);
});

test('★★ إعادةُ الطباعة بأسبابها — مؤشّرٌ يكشف عطبًا ماديًّا لا بشريًّا', () => {
  const jobs = [
    { isReprint: false, state: 'PRINTED' },
    { isReprint: true, reason: 'تمزّق الملصق', state: 'PRINTED' },
    { isReprint: true, reason: 'تمزّق الملصق', state: 'PRINTED' },
    { isReprint: true, reason: 'سقط', state: 'PRINTED' },
    { isReprint: true, reason: 'x', state: 'CANCELLED' },
  ];
  const r = reprintRate(jobs);
  assert.equal(r.value, 75, 'ثلاثةٌ من أربع — والملغاة لا تُحسب');
  assert.deepEqual(r.topReasons[0], { reason: 'تمزّق الملصق', count: 2 }, 'والسببُ الغالب يُرفع');
});

test('★ مواضعُ تكرار الاستثناء — أين يتكرّر العطب', () => {
  const hot = exceptionHotspots([
    { sku: 'WNW-001', type: 'UNKNOWN_BARCODE' },
    { sku: 'WNW-001', type: 'OVER_RECEIPT' },
    { bin: 'MAIN-A01-R01-B01', type: 'BLOCKED' },
  ]);
  assert.equal(hot[0].key, 'WNW-001');
  assert.equal(hot[0].count, 2);
  assert.deepEqual(hot[0].types.sort(), ['OVER_RECEIPT', 'UNKNOWN_BARCODE']);
});
