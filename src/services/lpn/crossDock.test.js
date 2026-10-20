/**
 * حارسُ التجهيز المباشر — ‹WMS-401›.
 *
 * ★★★ وأدقُّ بندٍ فيه: **الصلاحيّةُ تُقاس بموعد الشحن لا بـ«الآن».** فبضاعةٌ
 * صالحةٌ اليوم ومنتهيةٌ بعد أسبوعٍ تمرّ على حارسٍ يقرأ «الآن» — ثمّ تُرفض على
 * الرصيف بعد أسبوع، أو أسوأ: تُسلَّم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMAND_TYPES,
  ROUTES,
  shipByOf,
  expiryVerdict,
  crossDockCandidates,
  crossDockPlan,
  routeDecision,
  crossDockSummary,
} from './crossDock.js';

const NOW = Date.UTC(2026, 9, 3);
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** صفُّ صندوقِ عملٍ مفتوح — شكلُ `measureDocument` حرفًا. */
const row = ({ id = 'D1', type = 'so', number = 'SO-100', wh = 'WH001', shipBy, party = 'عميلٌ', lines = [] } = {}) => ({
  document: {
    id,
    type,
    number,
    state: 'approved',
    header: { warehouse: wh, partyName: party, ...(shipBy ? { mustShipBy: iso(shipBy) } : {}) },
  },
  open: true,
  lines: lines.map((l, i) => ({ lineId: `${id}-L${i}`, lineNumber: i + 1, uom: 'carton', ...l })),
});

const got = (over = {}) => ({ sku: 'ITM-1', qty: 100, uom: 'carton', warehouse: 'WH001', ...over });

/* ══════════ ① لا اقتراحَ بلا طلب، ولا فوق المطلوب ══════════ */

test('★★★ بندٌ عليه طلبٌ مفتوحٌ يُقترح عبورًا بمرجع الطلب ورقمه', () => {
  const openRows = [row({ shipBy: NOW + DAY, lines: [{ sku: 'ITM-1', open: 40 }] })];
  const out = crossDockCandidates(got(), { openRows, nowMs: NOW });
  assert.equal(out.candidates.length, 1, out.problem);
  const c = out.candidates[0];
  assert.equal(c.docNumber, 'SO-100');
  assert.equal(c.docId, 'D1');
  assert.equal(c.needed, 40);
  assert.equal(c.suggestQty, 40, 'اقتُرح أكثرُ من المطلوب');
  assert.equal(c.party, 'عميلٌ');
  assert.ok(c.reason.includes('مناولتين'), c.reason);
});

test('★★ ولا طلبَ ⟹ لا اقتراح، ويُقال «يُخزَّن»', () => {
  const out = crossDockCandidates(got(), { openRows: [], nowMs: NOW });
  assert.equal(out.candidates.length, 0);
  assert.equal(out.remainder, 100);
  assert.ok(out.problem.includes('يُخزَّن'), out.problem);
});

test('★★ والباقي فوق المطلوب يُخزَّن — العبورُ بقدر الحاجة لا بقدر الوصول', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 30 }] })];
  const out = crossDockCandidates(got({ qty: 100 }), { openRows, nowMs: NOW });
  assert.equal(out.coverable, 30);
  assert.equal(out.remainder, 70);
});

test('والمطلوبُ فوق الموجود يُغطّى بالموجود وحده', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 500 }] })];
  const out = crossDockCandidates(got({ qty: 100 }), { openRows, nowMs: NOW });
  assert.equal(out.candidates[0].suggestQty, 100);
  assert.equal(out.remainder, 0);
});

test('★★ طلبان: الأعجلُ يأخذ حاجتَه والذي بعده ما بقي — ولا تُوزَّع كمّيّةٌ مرّتين', () => {
  const openRows = [
    row({ id: 'D1', number: 'SO-100', shipBy: NOW + 5 * DAY, lines: [{ sku: 'ITM-1', open: 60 }] }),
    row({ id: 'D2', number: 'SO-099', shipBy: NOW + DAY, lines: [{ sku: 'ITM-1', open: 70 }] }),
  ];
  const out = crossDockCandidates(got({ qty: 100 }), { openRows, nowMs: NOW });
  assert.equal(out.candidates[0].docNumber, 'SO-099', 'الأعجلُ لم يسبق');
  assert.equal(out.candidates[0].suggestQty, 70);
  assert.equal(out.candidates[1].suggestQty, 30);
  assert.equal(out.coverable, 100);
  assert.equal(out.remainder, 0);
});

test('ومن بلا موعدٍ يُؤخَّر عن ذي الموعد — ولا يُقدَّم بصفرٍ مفترَض', () => {
  const openRows = [
    row({ id: 'D1', number: 'SO-A', lines: [{ sku: 'ITM-1', open: 50 }] }), // بلا موعد
    row({ id: 'D2', number: 'SO-B', shipBy: NOW + 30 * DAY, lines: [{ sku: 'ITM-1', open: 50 }] }),
  ];
  const out = crossDockCandidates(got({ qty: 100 }), { openRows, nowMs: NOW });
  assert.equal(out.candidates[0].docNumber, 'SO-B');
});

/* ══════════ ② الصلاحيّةُ بموعد الشحن ══════════ */

test('★★★ منتهيةٌ قبل موعد الشحن لا تعبُر — ولو كانت صالحةً اليوم', () => {
  const shipBy = NOW + 30 * DAY;
  const received = got({ expiry: iso(NOW + 7 * DAY) }); // صالحةٌ اليوم، منتهيةٌ قبل الشحن
  const openRows = [row({ shipBy, lines: [{ sku: 'ITM-1', open: 40 }] })];
  const out = crossDockCandidates(received, { openRows, nowMs: NOW });
  assert.equal(out.candidates.length, 0, 'مرّت على حارسٍ يقرأ «الآن» — فتُرفض على الرصيف أو تُسلَّم');
  assert.equal(out.rejected.length, 1);
  assert.ok(out.rejected[0].reason.includes('قبل موعد الشحن'), out.rejected[0].reason);
  assert.ok(out.rejected[0].reason.includes('تُخزَّن'), 'لم يُقل ما العمل');
});

test('والصالحةُ بعد موعد الشحن تعبُر', () => {
  const openRows = [row({ shipBy: NOW + 5 * DAY, lines: [{ sku: 'ITM-1', open: 40 }] })];
  const out = crossDockCandidates(got({ expiry: iso(NOW + 90 * DAY) }), { openRows, nowMs: NOW });
  assert.equal(out.candidates.length, 1, out.problem);
});

test('وبلا موعدِ شحنٍ يُقاس بـ«الآن» — فمنتهيةُ اليوم لا تعبُر بحال', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 40 }] })];
  assert.equal(crossDockCandidates(got({ expiry: iso(NOW - DAY) }), { openRows, nowMs: NOW }).candidates.length, 0);
  assert.equal(crossDockCandidates(got({ expiry: iso(NOW + 60 * DAY) }), { openRows, nowMs: NOW }).candidates.length, 1);
});

test('ولا صلاحيّةَ معلَنةٌ ⟹ لا حكم، وبلا وقتٍ ممرَّرٍ لا حكم', () => {
  assert.equal(expiryVerdict({ expiry: '' }, { nowMs: NOW }).ok, true);
  assert.equal(expiryVerdict({ expiry: iso(NOW - DAY) }, {}).ok, true, 'حُكم بلا وقتٍ ممرَّر');
});

test('موعدُ الشحن يُقرأ من أربعة حقولٍ وأربعة أشكال', () => {
  assert.equal(shipByOf({ header: { mustShipBy: '2026-10-10' } }), Date.UTC(2026, 9, 10));
  assert.equal(shipByOf({ header: { shipDate: NOW } }), NOW);
  assert.equal(shipByOf({ header: { dueDate: { toMillis: () => NOW } } }), NOW);
  assert.equal(shipByOf({ header: { deliveryDate: { seconds: NOW / 1000 } } }), NOW);
  assert.equal(shipByOf({ header: {} }), null);
  assert.equal(shipByOf(null), null);
});

/* ══════════ ③ الأنواعُ والمستودعُ والوجهة ══════════ */

test('★★ أنواعُ الطلب معلَنةٌ قابلةٌ للتبديل — والنقلُ بين المخازن داخلٌ عمدًا', () => {
  for (const t of ['so', 'pick', 'dlv', 'trn', 'mis']) assert.ok(DEMAND_TYPES.includes(t), `نوعٌ ناقص: ${t}`);
  // ونوعٌ ليس طلبًا لا يُقترح: أمرُ شراءٍ ليس وجهةً.
  const openRows = [row({ type: 'po', lines: [{ sku: 'ITM-1', open: 40 }] })];
  assert.equal(crossDockCandidates(got(), { openRows, nowMs: NOW }).candidates.length, 0);
  // والتبديلُ يعمل.
  assert.equal(crossDockCandidates(got(), { openRows, nowMs: NOW, demandTypes: ['po'] }).candidates.length, 1);
});

test('★★ وجهةُ العبور تُقال بحسب نوع الطلب — فلا يُرسَل عاملٌ إلى الرصيف وطلبُه للمطبخ', () => {
  const kitchen = crossDockCandidates(got(), { openRows: [row({ type: 'mis', lines: [{ sku: 'ITM-1', open: 10 }] })], nowMs: NOW });
  assert.ok(kitchen.candidates[0].destinationHint.includes('المطبخ'), kitchen.candidates[0].destinationHint);
  const dock = crossDockCandidates(got(), { openRows: [row({ type: 'dlv', lines: [{ sku: 'ITM-1', open: 10 }] })], nowMs: NOW });
  assert.ok(dock.candidates[0].destinationHint.includes('رصيف'));
  const van = crossDockCandidates(got(), { openRows: [row({ type: 'vld', lines: [{ sku: 'ITM-1', open: 10 }] })], nowMs: NOW });
  assert.ok(van.candidates[0].destinationHint.includes('عربة'));
});

test('★★ طلبٌ على مستودعٍ آخرَ يُرفض بسببه ولا يُخفى', () => {
  const openRows = [row({ wh: 'WH002', lines: [{ sku: 'ITM-1', open: 40 }] })];
  const out = crossDockCandidates(got({ warehouse: 'WH001' }), { openRows, nowMs: NOW });
  assert.equal(out.candidates.length, 0);
  assert.equal(out.rejected.length, 1);
  assert.ok(out.rejected[0].reason.includes('WH002') && out.rejected[0].reason.includes('WH001'), out.rejected[0].reason);
});

/* ══════════ ④ المطابقةُ والجمعُ من الأسطر ══════════ */

test('★★★ الكمّيّةُ تُجمَع من أسطر الصنف لا من إجماليّ المستند', () => {
  const openRows = [
    row({
      lines: [
        { sku: 'ITM-1', open: 10 },
        { sku: 'ITM-9', open: 900 }, // صنفٌ آخرُ في نفس المستند
        { sku: 'ITM-1', open: 5 },
      ],
    }),
  ];
  const out = crossDockCandidates(got(), { openRows, nowMs: NOW });
  assert.equal(out.candidates[0].needed, 15, 'حُسب إجماليُّ المستند — فاقتُرح عبورُ كمّيّةِ بنودٍ أخرى');
  assert.equal(out.candidates[0].lines.length, 2);
});

test('والسطرُ المُنفَّذُ كاملًا (open=0) لا يُحتسب', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 0 }] })];
  assert.equal(crossDockCandidates(got(), { openRows, nowMs: NOW }).candidates.length, 0);
});

test('المطابقةُ بالكود ثمّ بالباركود بصيغتيه — وأصفارُه البادئة', () => {
  const openRows = [row({ lines: [{ barcode: '0006281000112342', open: 20 }] })];
  const out = crossDockCandidates(got({ sku: '', barcode: '6281000112342' }), { openRows, nowMs: NOW });
  assert.equal(out.candidates.length, 1, 'الباركودُ بأصفارٍ بادئةٍ لم يُطابق');
});

test('بندٌ بلا هويّةٍ أو بكمّيّةٍ صفرٍ يُعلَن سببُه', () => {
  assert.ok(crossDockCandidates({ qty: 5 }, { openRows: [], nowMs: NOW }).problem.includes('بلا كود'));
  assert.ok(crossDockCandidates(got({ qty: 0 }), { openRows: [], nowMs: NOW }).problem.includes('صفر'));
});

/* ══════════ ⑤ خطّةُ استلامٍ كاملة ══════════ */

test('★★ خطّةٌ كاملةٌ تُحصي ما يعبُر وما يُخزَّن', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 40 }] })];
  const plan = crossDockPlan(
    [got({ sku: 'ITM-1', qty: 100 }), got({ sku: 'ITM-9', qty: 50 })],
    { openRows, nowMs: NOW }
  );
  assert.equal(plan.totals.lines, 2);
  assert.equal(plan.totals.crossDockable, 1);
  assert.equal(plan.totals.qtyCovered, 40);
  assert.equal(plan.lines[1].candidates.length, 0);
  assert.ok(plan.lines[1].problem.includes('يُخزَّن'));
});

test('واستلامٌ لا يصلح منه شيءٌ يُقال صريحًا، والفارغُ كذلك', () => {
  assert.ok(crossDockPlan([got()], { openRows: [], nowMs: NOW }).problem.includes('كلُّه يُخزَّن'));
  assert.ok(crossDockPlan([], { openRows: [], nowMs: NOW }).problem.includes('لا بنودَ'));
});

/* ══════════ ⑥ القرارُ يُقيَّد ══════════ */

test('★★★ العبورُ يُقيَّد بطلبه وسببه — وعبورٌ بلا طلبٍ مرجعيٍّ يُردّ', () => {
  const demand = { docId: 'D1', docType: 'so', docNumber: 'SO-100', suggestQty: 40, destinationHint: 'الرصيف' };
  const bad = routeDecision({ route: ROUTES.crossDock.id, received: got(), demand: {}, note: 'سبب', profile: {} });
  assert.equal(bad.ok, false);
  assert.ok(bad.problem.includes('بلا طلبٍ مرجعي'), bad.problem);

  const noReason = routeDecision({ route: ROUTES.crossDock.id, received: got(), demand, note: '', profile: {} });
  assert.equal(noReason.ok, false);
  assert.ok(noReason.problem.includes('سببُ العبور'), noReason.problem);

  const ok = routeDecision({
    route: ROUTES.crossDock.id,
    received: got({ batch: 'L7', expiry: '2027-01-01' }),
    demand,
    note: 'الشاحنةُ على الرصيف والطلبُ يُشحَن اليوم',
    profile: { name: 'أحمد', role: 'storekeeper' },
    at: NOW,
  });
  assert.equal(ok.ok, true, ok.problem);
  assert.equal(ok.entry.action, 'receiving-route-decision');
  assert.equal(ok.entry.route, 'cross-dock');
  assert.equal(ok.entry.demandDocNumber, 'SO-100');
  assert.equal(ok.entry.batch, 'L7');
  assert.equal(ok.entry.byName, 'أحمد');
  assert.equal(ok.entry.at, NOW);
});

test('★★★ والتخزينُ لا يحتاج سببًا — سؤالُ «لماذا عملتَ عملَك المعتاد؟» يُميت الحقل', () => {
  const v = routeDecision({ route: ROUTES.putaway.id, received: got(), profile: { name: 'أحمد' } });
  assert.equal(v.ok, true, v.problem);
  assert.equal(v.entry.route, 'putaway');
  assert.equal(v.entry.note, '');
  assert.equal(v.entry.demandDocId, '');
});

test('ومسارٌ مجهولٌ يُردّ', () => {
  assert.equal(routeDecision({ route: 'طيران', received: got() }).ok, false);
  assert.equal(routeDecision({}).ok, false);
});

/* ══════════ ⑦ السطرُ المقروء ══════════ */

test('سطرُ العرض يقول الكمّيّةَ والطلبَ والوجهةَ وما يُخزَّن', () => {
  const openRows = [row({ lines: [{ sku: 'ITM-1', open: 40 }] })];
  const plan = crossDockPlan([got({ qty: 100 })], { openRows, nowMs: NOW });
  const line = crossDockSummary(plan.lines[0]);
  assert.ok(line.includes('40') && line.includes('SO-100') && line.includes('ويُخزَّن الباقي 60'), line);
  assert.equal(crossDockSummary(null), '');
  assert.ok(crossDockSummary(crossDockPlan([got()], { openRows: [], nowMs: NOW }).lines[0]).includes('يُخزَّن'));
});
