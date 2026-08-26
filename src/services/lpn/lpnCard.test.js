/**
 * اختبارات بطاقة الطبلية — «قراءة الباركود تُظهر بطاقةً كاملة» وعدُ خطة ٧.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCard, integrityOf, isClosedOf, lotsOf, traceLine } from './lpnCard.js';

const CODE = 'LPN-MAIN-20260826-000145';
const UNIT = {
  code: CODE,
  state: 'STORED',
  flags: [],
  warehouse: 'MAIN',
  bin: 'MAIN-A01-R01',
  lines: [
    { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'CTN', factor: 12, qty: 10, baseQty: 120 },
    { sku: 'WNW-002', batch: 'B2409', expiry: '2026-12-01', uom: 'EA', factor: 1, qty: 5, baseQty: 5 },
  ],
  sourceDoc: { type: 'GRN', number: 'GRN-2026-0032', links: { PO: { number: 'PO-2026-0015' } } },
  createdBy: 'محمد',
  createdAt: '2026-08-26T09:00:00Z',
};

const EVENTS = [
  { type: 'MOVED', lpn: CODE, at: '2026-08-26T11:00:00Z', actor: 'أحمد', doc: { type: 'PUTAWAY', number: 'PUTAWAY-2026-0002' }, seq: 1 },
  { type: 'CREATED', lpn: CODE, at: '2026-08-26T09:00:00Z', actor: 'محمد', seq: 1 },
  { type: 'PICKED_FROM', lpn: CODE, at: '2026-08-27T08:00:00Z', actor: 'سالم', doc: { type: 'PICK', number: 'PICK-2026-0021' }, seq: 1 },
  { type: 'CREATED', lpn: 'LPN-MAIN-20260826-000001', at: '2026-08-26T08:00:00Z', actor: 'غيره', seq: 1 },
];

test('★★ البطاقة كاملة من مصادرها الثلاثة — ولا حقل يُحسب مرّتين', () => {
  const card = buildCard(UNIT, { events: EVENTS, allUnits: [{ code: 'LPN-MAIN-20260827-000001', parentCodes: [CODE] }] });
  assert.equal(card.code, CODE);
  assert.equal(card.shortLabel, '000145');
  assert.equal(card.stateLabel, 'مخزَّنة');
  assert.equal(card.integrity, 'سليمة');
  assert.ok(card.isClosed);
  assert.ok(card.isMixed, 'الخلط يُشتقّ من البنود');
  assert.equal(card.totalBaseQty, 125);
  assert.equal(card.itemCount, 2);
  assert.equal(card.journey.length, 3, 'أحداث هذه الطبلية وحدها — حدث الطبلية الأخرى لا يتسرّب');
  assert.deepEqual(card.journey.map((e) => e.type), ['CREATED', 'MOVED', 'PICKED_FROM'], 'الرحلة مرتّبة بالوقت');
  assert.deepEqual(card.children, ['LPN-MAIN-20260827-000001']);
});

test('الغائب لا يُنهار عليه: طبليةٌ بلا أحداثٍ ولا نسبٍ بطاقتها صحيحة', () => {
  const card = buildCard({ code: CODE, state: 'DRAFT', flags: [], lines: [] });
  assert.equal(card.journey.length, 0);
  assert.deepEqual(card.parents, []);
  assert.ok(card.isEmpty);
  assert.ok(!card.isClosed, 'قيد الإنشاء مفتوحة');
  assert.equal(buildCard({ code: 'ليست-هويّة' }), null, 'الهويّة الفاسدة null لا بطاقة عرجاء');
});

test('السلامة تُشتقّ بترتيب الأخطر أوّلًا — والوسمُ لا يُخفي الحالة', () => {
  assert.equal(integrityOf({ flags: [] }), 'سليمة');
  assert.equal(integrityOf({ flags: ['INSPECTION'] }), 'تحت الفحص');
  assert.equal(integrityOf({ flags: ['INSPECTION', 'DAMAGED'] }), 'تالفة', 'التالفة قبل الفحص');
  const card = buildCard({ ...UNIT, flags: ['INSPECTION'] });
  assert.equal(card.stateLabel, 'مخزَّنة', 'الحالة باقية بجانب الوسم');
  assert.equal(card.integrity, 'تحت الفحص');
});

test('المغلقة تُشتقّ من الحالة: القراءة والتحضير مفتوحتان وما بعدهما مغلق', () => {
  assert.ok(!isClosedOf({ state: 'SCANNING' }));
  assert.ok(!isClosedOf({ state: 'PICKING' }));
  assert.ok(isClosedOf({ state: 'PENDING_GOVERNANCE' }));
  assert.ok(isClosedOf({ state: 'STORED' }));
});

test('التشغيلات تُجمَّع (دفعة×صلاحية) بمجموع كمّيّاتها — وبلا دفعةٍ ولا صلاحيةٍ لا صفّ', () => {
  const lots = lotsOf([
    { batch: 'B2408', expiry: '2027-01-01', qty: 10 },
    { batch: 'B2408', expiry: '2027-01-01', qty: 5 },
    { batch: '', expiry: '', qty: 7 },
  ]);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].qty, 15);
});

test('★★ سطر التتبّع بمثال خطة ٧: المستندات قبل الطبلية ثم هي ثم مستندات استهلاكها', () => {
  const card = buildCard(UNIT, { events: EVENTS });
  assert.equal(traceLine(card), `PO-2026-0015 → GRN-2026-0032 → ${CODE} → PUTAWAY-2026-0002 → PICK-2026-0021`);
  assert.equal(traceLine(null), '');
});
