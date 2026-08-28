/**
 * اختبارات سلسلة العهدة — «باب التحميل ← السيارة ← بوّابة الخروج ← باب الاستلام».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAIN_LINKS,
  buildCustodyChain,
  chainDurations,
  chainFor,
  chainLine,
  chainSummary,
  openLink,
  sessionTouches,
} from './custodyChain.js';

const A = 'LPN-W01-20260827-000001';
const PARCEL = 'SHP-RH-20260827-000125-01';

const DOCK = {
  door: 'W01-DOCK-OUT-01',
  vehicle: 'VEH-RH-TRK-001',
  tripRef: 'TRIP-2026-0001',
  openedAt: '2026-08-27T09:00:00.000Z',
  closedAt: '2026-08-27T10:00:00.000Z',
  openedByName: 'سالم',
  proofs: [
    { role: 'DESTINATION', kind: 'DOCK_OUT', code: 'W01-DOCK-OUT-01', method: 'SCAN', at: '2026-08-27T09:00:00.000Z' },
    { role: 'DESTINATION', kind: 'VEHICLE', code: 'VEH-RH-TRK-001', method: 'SCAN', at: '2026-08-27T09:05:00.000Z' },
    { role: 'DESTINATION', kind: 'DOCUMENT', code: 'TRIP-2026-0001', method: 'SCAN', at: '2026-08-27T09:06:00.000Z' },
  ],
  itemProofs: [{ role: 'SOURCE', kind: 'PALLET', code: A, method: 'SCAN' }],
  loading: { expected: [A, PARCEL], loaded: [A, PARCEL] },
};

const EXIT = {
  gate: 'GATE-OUT-01',
  vehicle: 'VEH-RH-TRK-001',
  exitedAt: '2026-08-27T11:00:00.000Z',
  exitedBy: 'ضابط البوّابة',
  openedAt: '2026-08-27T10:50:00.000Z',
  proofs: [
    { role: 'DESTINATION', kind: 'GATE_OUT', code: 'GATE-OUT-01', method: 'SCAN' },
    { role: 'SOURCE', kind: 'VEHICLE', code: 'VEH-RH-TRK-001', method: 'SCAN' },
  ],
};

const INBOUND = {
  door: 'W02-DOCK-IN-01',
  vehicle: 'VEH-RH-TRK-001',
  openedAt: '2026-08-27T13:00:00.000Z',
  closedAt: '2026-08-27T13:30:00.000Z',
  openedByName: 'فرع بنغازي',
  proofs: [
    { role: 'DESTINATION', kind: 'DOCK_IN', code: 'W02-DOCK-IN-01', method: 'SCAN', at: '2026-08-27T13:00:00.000Z' },
    { role: 'SOURCE', kind: 'VEHICLE', code: 'VEH-RH-TRK-001', method: 'SCAN', at: '2026-08-27T13:01:00.000Z' },
  ],
  itemProofs: [{ role: 'SOURCE', kind: 'PALLET', code: A, method: 'SCAN' }],
  received: [A],
  expected: [A],
};

test('الحلقات الأربع بالترتيب الذي كتبه النصّ', () => {
  assert.deepEqual(CHAIN_LINKS.map((l) => l.id), ['DOCK_OUT', 'VEHICLE', 'GATE_OUT', 'DOCK_IN']);
});

test('★ السلسلة الكاملة تُبنى من الجلسات الثلاث', () => {
  const chain = buildCustodyChain({ dock: DOCK, exit: EXIT, inbound: INBOUND });
  assert.equal(chain.complete, true);
  assert.deepEqual(chain.links.map((l) => l.code), ['W01-DOCK-OUT-01', 'VEH-RH-TRK-001', 'GATE-OUT-01', 'W02-DOCK-IN-01']);
  assert.equal(chain.links[2].actor, 'ضابط البوّابة');
  assert.equal(chain.spanMs, 4 * 3600 * 1000, 'من أوّل مسحةٍ عند الباب إلى الوصول');
});

test('★★ الحلقة الناقصة تُسمّى — وسلسلةٌ تسكت عمّا لا تعرفه تكذب بالصمت', () => {
  const chain = buildCustodyChain({ dock: DOCK, exit: EXIT });
  assert.equal(chain.complete, false);
  assert.deepEqual(chain.gaps, ['باب الاستلام']);

  const open = openLink(chain);
  assert.equal(open.id, 'DOCK_IN');
  assert.match(open.message, /بوّابة الخروج تمّ ولم يتمّ «باب الاستلام»/);
  assert.match(open.message, /بابٌ مفتوحٌ يُلاحَق/);
});

test('★★ «حُمِّلت ولم تخرج» — أنفعُ ما في السلسلة', () => {
  const chain = buildCustodyChain({ dock: DOCK });
  assert.deepEqual(chain.gaps, ['بوّابة الخروج', 'باب الاستلام']);
  assert.equal(openLink(chain).labelAr, 'بوّابة الخروج');
});

test('سلسلةٌ فارغةٌ لا تُخرج حلقةً مفتوحة', () => {
  const chain = buildCustodyChain({});
  assert.equal(chain.complete, false);
  assert.equal(openLink(chain), null);
  assert.equal(chain.spanMs, null);
});

test('★★ تُقرأ من أيّ طرف — العامل يمسك طردًا ويسأل «أين مرّ هذا؟»', () => {
  const ctx = { docks: [DOCK], exits: [EXIT], inbounds: [INBOUND] };

  const byParcel = chainFor(PARCEL, ctx);
  assert.equal(byParcel.kind, 'PARCEL');
  assert.equal(byParcel.links[0].code, 'W01-DOCK-OUT-01', 'الطرد يجد بابه من جلسة التحميل');
  assert.equal(byParcel.complete, true, 'وتُوصَل بقيّة الحلقات بالمركبة والرحلة');

  const byVehicle = chainFor('VEH-RH-TRK-001', ctx);
  assert.equal(byVehicle.complete, true);

  const byDoor = chainFor('W01-DOCK-OUT-01', ctx);
  assert.equal(byDoor.links[0].present, true);

  const unknown = chainFor('LPN-W09-20260827-000009', ctx);
  assert.equal(unknown.complete, false);
  assert.equal(unknown.gaps.length, 4);
});

test('مسحةٌ فارغةٌ لا تُخرج سلسلة', () => {
  const out = chainFor('', {});
  assert.equal(out.query, '');
  assert.equal(out.complete, false);
});

test('sessionTouches يعرف ما تخصّه الجلسة — بيّناتٍ وحمولةً وأطرافًا', () => {
  assert.equal(sessionTouches(DOCK, A), true);
  assert.equal(sessionTouches(DOCK, PARCEL), true, 'من قائمة التحميل أيضًا');
  assert.equal(sessionTouches(DOCK, 'TRIP-2026-0001'), true);
  assert.equal(sessionTouches(DOCK, 'GATE-OUT-01'), false);
  assert.equal(sessionTouches(DOCK, ''), false);
});

test('★ الأزمنة بين الحلقات تُحسب — وكم بقيت الشاحنة بين البابِ والبوّابة', () => {
  const chain = buildCustodyChain({ dock: DOCK, exit: EXIT, inbound: INBOUND });
  const d = chainDurations(chain);
  assert.equal(d.length, 3);
  assert.equal(d[1].from, 'السيارة');
  assert.equal(d[1].to, 'بوّابة الخروج');
  assert.equal(d[2].minutes, 120, 'ساعتان بين الخروج والوصول');
  assert.equal(d.some((x) => x.backwards), false);
});

test('★ زمنٌ راجعٌ للخلف يُعلَن ولا يُخفى', () => {
  const chain = buildCustodyChain({
    dock: DOCK,
    exit: { ...EXIT, exitedAt: '2026-08-27T08:00:00.000Z' },
  });
  assert.equal(chainDurations(chain).some((x) => x.backwards), true);
});

test('السطر والخلاصة — للسجلّ وللوحة', () => {
  const chain = buildCustodyChain({ dock: DOCK, exit: EXIT });
  assert.match(chainLine(chain), /باب التحميل: W01-DOCK-OUT-01/);
  assert.match(chainLine(chain), /باب الاستلام: ✕/);

  const sum = chainSummary(chain);
  assert.equal(sum.done, 3);
  assert.equal(sum.spanMinutes, 120, 'من أوّل مسحةٍ عند الباب إلى ختم الخروج');
  assert.equal(sum.total, 4);
  assert.equal(sum.lastLink, 'بوّابة الخروج');
  assert.equal(sum.trust, 100);
  assert.equal(chainSummary(buildCustodyChain({})).trust, 0);
});
