/**
 * اختبارات النقل بالطبالي — من «كمّيّاتٍ تُعدّ مرّتين» إلى «حمولاتٍ تُمسح».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCREPANCY_TYPES,
  applyReceive,
  buildDiscrepancies,
  decideDiscrepancy,
  receiveCloseProblem,
  receiveCounters,
  receiveScanVerdict,
  shipPalletProblem,
  shipmentManifest,
  transferIdentityDecision,
} from './transferPallets.js';

const A = 'LPN-MAIN-20260827-000001';
const B = 'LPN-MAIN-20260827-000002';
const C = 'LPN-MAIN-20260827-000003';

const UNIT = {
  code: A, state: 'STORED', flags: [], warehouse: 'MAIN',
  lines: [{ sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', baseQty: 60 }],
};

test('★★ الكاملة تعبر بهويّتها — والمفتوحة هويّةٌ جديدة بنسبها', () => {
  const keep = transferIdentityDecision({});
  assert.ok(keep.keepsIdentity);
  assert.match(keep.reason, /لا ينقطع خيط التتبّع/);

  for (const opt of [{ opened: true }, { split: true }, { merged: true }]) {
    const fresh = transferIdentityDecision(opt);
    assert.ok(!fresh.keepsIdentity);
    assert.match(fresh.reason, /هويّةٌ جديدة بنسبها/);
  }
});

test('★★★ الموسومة لا تُشحن — قرارُ الفحص يصل متأخّرًا لمستودعٍ لا يعرف قصّتها', () => {
  const p = shipPalletProblem({ ...UNIT, flags: ['INSPECTION'] }, { fromWarehouse: 'MAIN' });
  assert.match(p, /تحت الفحص/);
  assert.match(p, /لا يعرف قصّتها/);
  assert.equal(shipPalletProblem(UNIT, { fromWarehouse: 'MAIN' }), '');
});

test('🔒 حمولةٌ ليست في المستودع المصدر لا تُشحن — ولا الحالةُ غير الصالحة', () => {
  assert.match(shipPalletProblem(UNIT, { fromWarehouse: 'TRP' }), /ليست هنا/);
  assert.match(shipPalletProblem({ ...UNIT, state: 'ISSUED' }, {}), /لا تُشحن في هذه الحالة/);
  assert.match(shipPalletProblem({}, {}), /لا طبلية/);
});

test('★★ بيانُ الشحنة يجمع المحمول بطباليه — يُطبع ويُقارَن عند الوصول', () => {
  const units = [
    UNIT,
    { code: B, lines: [{ sku: 'WNW-001', batch: 'B2408', baseQty: 24 }, { sku: 'WNW-002', batch: 'B2409', baseQty: 10 }] },
  ];
  const m = shipmentManifest(units);
  assert.equal(m.palletCount, 2);
  assert.equal(m.totalQty, 94);
  const water = m.lines.find((l) => l.sku === 'WNW-001');
  assert.equal(water.qty, 84);
  assert.deepEqual(water.pallets, [A, B], 'ومن أيّ طبليةٍ جاء كلّ صنف');
});

test('★★★ القاعدة ٩: لا تُستلم مرّتين — تُحسب مرّتين فيظهر فائضٌ وهميّ', () => {
  let s = { state: 'OPEN', order: { number: 'TR-2026-0007' }, expected: [A, B], received: [] };
  assert.ok(receiveScanVerdict(s, A, { ...UNIT, state: 'LOADED' }).ok);
  s = applyReceive(s, A);
  const again = receiveScanVerdict(s, A, { ...UNIT, state: 'LOADED' });
  assert.equal(again.kind, 'DUPLICATE');
  assert.match(again.message, /مستلَمةٌ في هذه الجلسة أصلًا/);
});

test('★★ طبليةٌ خارج أمر النقل تُسجَّل فرقًا ولا تدخل المخزن بلا قرار', () => {
  const s = { state: 'OPEN', order: { number: 'TR-2026-0007' }, expected: [A], received: [] };
  const v = receiveScanVerdict(s, C, { ...UNIT, state: 'LOADED' });
  assert.equal(v.kind, 'NOT_EXPECTED');
  assert.match(v.message, /TR-2026-0007/);
  assert.match(v.message, /لا تدخلها المخزن بلا قرار/);
});

test('★ المفتوحةُ أو مكسورةُ الختم تُوسم لتُعدّ فعليًّا — والمغلقةُ السليمة لا تُعدّ', () => {
  let s = { state: 'OPEN', expected: [A, B], received: [] };
  s = applyReceive(s, A, { sealIntact: true, opened: false });
  assert.deepEqual(s.needsCount ?? [], [], 'المغلقة السليمة تُعتمد بمسحها');
  s = applyReceive(s, B, { sealIntact: false });
  assert.deepEqual(s.needsCount, [B]);
  assert.equal(receiveCounters(s).needsCount, 1);
});

test('عدّاد الاستلام: المتوقَّع والمستلَم والمفقود — ويسمّي المفقودة', () => {
  let s = { state: 'OPEN', expected: [A, B], received: [] };
  s = applyReceive(s, A);
  const c = receiveCounters(s);
  assert.deepEqual({ expected: c.expected, received: c.received, missing: c.missing, complete: c.complete }, { expected: 2, received: 1, missing: 1, complete: false });
  assert.deepEqual(c.missingList, [B]);
});

test('★★★ الفروق تُقاس آليًّا لا تُكتب بيد — فتوجد دائمًا حين يوجد فرق', () => {
  const s = {
    state: 'OPEN', expected: [A, B], received: [A],
    extras: [{ lpn: C, reason: 'وصلت مع الشحنة بلا بيان' }],
    sealBroken: [A],
  };
  const d = buildDiscrepancies(s, { manifest: { lines: [] } });
  const kinds = d.map((x) => x.type);
  assert.ok(kinds.includes('PALLET_MISSING'), 'الناقصة');
  assert.ok(kinds.includes('PALLET_EXTRA'), 'والزائدة');
  assert.ok(kinds.includes('SEAL_BROKEN'), 'والختم المكسور');
  assert.equal(d.find((x) => x.type === 'PALLET_MISSING').lpn, B);
});

test('★★ فرقُ الكمّيّة للمفتوحة التي عُدّت — والمغلقةُ السليمة لا تُعدّ أصلًا', () => {
  const manifest = { lines: [{ sku: 'WNW-001', batch: 'B2408', qty: 60, pallets: [A] }] };
  const s = { state: 'OPEN', expected: [A], received: [A], needsCount: [A] };

  const short = buildDiscrepancies(s, { manifest, counted: { [A]: [{ sku: 'WNW-001', batch: 'B2408', qty: 50 }] } });
  assert.equal(short[0].type, 'QTY_SHORT');
  assert.equal(short[0].sent, 60);
  assert.equal(short[0].received, 50);

  const over = buildDiscrepancies(s, { manifest, counted: { [A]: [{ sku: 'WNW-001', batch: 'B2408', qty: 70 }] } });
  assert.equal(over[0].type, 'QTY_OVER');

  const exact = buildDiscrepancies(s, { manifest, counted: { [A]: [{ sku: 'WNW-001', batch: 'B2408', qty: 60 }] } });
  assert.deepEqual(exact, [], 'المطابقة لا فرقَ لها');
});

test('★★★ القاعدة ١٥: لا يُغلق النقل بفرقٍ غير محسوم — ولا استثناءَ هنا', () => {
  const s = { state: 'OPEN', expected: [A], received: [] };
  const d = buildDiscrepancies(s, { manifest: { lines: [] } });
  const p = receiveCloseProblem(s, d);
  assert.match(p, /بلا قرار/);
  assert.match(p, /طبلية ناقصة/, 'تسمّي نوع الفرق');
  assert.match(p, /افتح محضرًا واحسمها/);

  const decided = d.map((x) => ({ ...x, decision: 'تُحمَّل على الناقل' }));
  assert.equal(receiveCloseProblem(s, decided), '');
  assert.equal(receiveCloseProblem({ state: 'OPEN', expected: [A], received: [A] }, []), '', 'المطابقة تُغلق');
});

test('★★ قرارُ الفرق يسمّي المسؤوليّة — وبلا ذلك يبقى الفرق بلا صاحب', () => {
  const d = { type: 'QTY_SHORT', lpn: A, sent: 60, received: 50 };
  assert.match(decideDiscrepancy(d, { actor: 'المدير' }).problem, /يحتاج نصًّا/);
  assert.match(decideDiscrepancy(d, { decision: 'نقصٌ في الطريق', actor: 'المدير' }).problem, /الطرف الذي يتحمّله/);
  const r = decideDiscrepancy(d, {
    decision: 'نقصٌ في الطريق — عشر وحدات',
    liability: 'الناقل', correction: 'خصمٌ من مستحقّاته', actor: 'المدير', at: '2026-08-27T12:00:00Z',
  });
  assert.equal(r.discrepancy.liability, 'الناقل');
  assert.equal(r.discrepancy.correction, 'خصمٌ من مستحقّاته');
  assert.equal(Object.keys(DISCREPANCY_TYPES).length, 9);
});
