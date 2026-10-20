/**
 * حارسُ سرعة الدوران — ‹WMS-202›.
 *
 * وأخطرُ بندٍ هنا الثالث: **الدورانُ طلبٌ لا حركة.** فلو عُدَّت المناقلةُ
 * الداخليّةُ دورانًا لصار كلُّ صنفٍ وصل أمس «سريعَ الدوران» — لأنّه استُلم
 * وخُزِّن فتحرّك مرّتين — ثمّ مُنح أقربَ رفٍّ إلى التجهيز وهو لم يُطلب قطّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMAND_REASONS,
  DEFAULT_THRESHOLDS,
  moveTimeOf,
  velocityOf,
  rankOf,
  rankLabel,
  velocityFactorOf,
  velocitySnapshot,
} from './velocity.js';
import { scoreLocation, suggestLocations } from './putawaySuggest.js';

const NOW = Date.UTC(2026, 9, 3);
const DAY = 86400000;
const ago = (d) => NOW - d * DAY;

/** حركةُ طلبٍ واحدة. */
const pick = (sku, qty, daysAgo, over = {}) => ({
  sku,
  qty,
  reason: 'pick',
  from: 'WH001',
  postedAt: ago(daysAgo),
  ...over,
});

/* ══════════ ① لا ساعةَ تُقرأ ══════════ */

test('★★ بلا تمرير الوقت لا نافذةَ ولا حكم — بسببٍ مكتوب', () => {
  const r = velocityOf([pick('A', 10, 1)], {});
  assert.equal(r.total, 0);
  assert.equal(r.ranks.size, 0);
  assert.ok(r.problem.includes('لم يُمرَّر الوقت'), r.problem);
});

test('نفسُ المدخل ونفسُ nowMs ⟹ نفسُ المخرَج دائمًا', () => {
  const moves = [pick('A', 10, 1), pick('B', 5, 2)];
  const a = velocityOf(moves, { nowMs: NOW });
  const b = velocityOf(moves, { nowMs: NOW });
  assert.deepEqual([...a.ranks.entries()], [...b.ranks.entries()]);
});

/* ══════════ ② الدورانُ طلبٌ لا حركة ══════════ */

test('★★★ المناقلةُ الداخليّةُ لا تُحتسب دورانًا — وإلّا صار كلُّ مستلَمٍ أمسِ «سريعًا»', () => {
  const moves = [
    { sku: 'NEW', qty: 1000, reason: 'receipt', from: 'WH001', postedAt: ago(1) },
    { sku: 'NEW', qty: 1000, reason: 'putaway', from: 'WH001', postedAt: ago(1) },
    { sku: 'NEW', qty: 1000, reason: 'transfer-out', from: 'WH001', postedAt: ago(1) },
    { sku: 'NEW', qty: 1000, reason: 'van-load', from: 'WH001', postedAt: ago(1) },
    pick('REAL', 5, 2),
  ];
  const r = velocityOf(moves, { nowMs: NOW });
  assert.equal(r.ranks.has('NEW'), false, 'صنفٌ استُلم وخُزِّن حُسب دورانًا — فيحتلّ أقربَ رفٍّ وهو لم يُطلب');
  assert.equal(rankOf(r, 'NEW'), 'DEAD');
  assert.equal(r.ranks.get('REAL').qty, 5);
  assert.equal(r.skippedReasons, 4);
});

test('أسبابُ الطلب الستّةُ معلَنةٌ — والمستدعي يبدّلها وسيطًا', () => {
  for (const x of ['pick', 'delivery', 'van-sale', 'material-issue', 'consign-sold']) {
    assert.ok(DEMAND_REASONS.includes(x), `سببُ طلبٍ ناقص: ${x}`);
  }
  assert.ok(!DEMAND_REASONS.includes('putaway'));
  assert.ok(!DEMAND_REASONS.includes('transfer-out'));
  // والتبديلُ يعمل: عُدَّ التخزينَ وحدَه فصار هو الدوران.
  const r = velocityOf([{ sku: 'X', qty: 9, reason: 'putaway', postedAt: ago(1) }], { nowMs: NOW, reasons: ['putaway'] });
  assert.equal(r.ranks.get('X').qty, 9);
});

/* ══════════ ③ النافذةُ والختم ══════════ */

test('ما خرج من النافذة لا يُحتسب — وطلبُ العام الماضي ليس دورانَ اليوم', () => {
  const r = velocityOf([pick('OLD', 10000, 200), pick('NOW', 5, 3)], { nowMs: NOW, windowDays: 90 });
  assert.equal(r.ranks.has('OLD'), false);
  assert.equal(rankOf(r, 'OLD'), 'DEAD', 'صنفٌ ركد مئتي يومٍ لم يُصنَّف راكدًا');
  assert.equal(rankOf(r, 'NOW'), 'A');
});

test('★★ الحركةُ بلا ختمِ قيدٍ لا تُحتسب — ويُعلَن عددُها تحفّظًا', () => {
  const r = velocityOf([pick('A', 10, 1), { sku: 'B', qty: 999, reason: 'pick', from: 'WH001' }], { nowMs: NOW });
  assert.equal(r.undated, 1);
  assert.ok(r.caveat.includes('بلا ختمِ قيد'), r.caveat);
  assert.equal(r.ranks.has('B'), false, 'حُسبت حركةٌ لا يُعرف تاريخُها — فيُقال «سريع» لصنفٍ ركد منذ سنة');
});

test('★★★ ختمُ الإنشاء لا يُقرأ — فمستندُ يناير المُقيَّدُ في مارس حركةُ مارس', () => {
  assert.equal(moveTimeOf({ createdAt: ago(1) }), null, 'قُرئ createdAt — فانقلبت الموسميّةُ كلُّها');
  assert.equal(moveTimeOf({ postedAt: ago(1) }), ago(1));
  assert.equal(moveTimeOf({ at: ago(2) }), ago(2));
});

test('أشكالُ الختم الأربعةُ تُقرأ — رقمٌ وتاريخٌ وToMillis وseconds', () => {
  assert.equal(moveTimeOf({ postedAt: NOW }), NOW);
  assert.equal(moveTimeOf({ postedAt: new Date(NOW) }), NOW);
  assert.equal(moveTimeOf({ postedAt: { toMillis: () => NOW } }), NOW);
  assert.equal(moveTimeOf({ postedAt: { seconds: NOW / 1000 } }), NOW);
  assert.equal(moveTimeOf({ postedAt: '2026-10-03T00:00:00.000Z' }), NOW);
  assert.equal(moveTimeOf({ postedAt: 'ليس تاريخًا' }), null);
  assert.equal(moveTimeOf({}), null);
  assert.equal(moveTimeOf(null), null);
});

/* ══════════ ④ باريتو ══════════ */

test('★★ تصنيفُ A/B/C بالتراكم — والحدُّ يُقاس قبل الإضافة لا بعدها', () => {
  // صنفٌ واحدٌ يحمل تسعين في المئة: لو قيس الحدُّ بعد الإضافة لخرج من A.
  const r = velocityOf([pick('BIG', 900, 1), pick('MID', 80, 1), pick('SMALL', 20, 1)], { nowMs: NOW });
  assert.equal(r.ranks.get('BIG').rank, 'A', 'أسرعُ ما عندنا أُخرج من A');
  assert.equal(r.ranks.get('MID').rank, 'B');
  assert.equal(r.ranks.get('SMALL').rank, 'C');
  assert.equal(r.total, 1000);
  assert.equal(r.ranks.get('BIG').share, 0.9);
});

test('العتباتُ مُمرَّرةٌ لا مدفونة — والمالكُ يبدّلها بلا كوميت', () => {
  assert.equal(DEFAULT_THRESHOLDS.a, 0.8);
  assert.equal(DEFAULT_THRESHOLDS.b, 0.95);
  const moves = [pick('P1', 50, 1), pick('P2', 30, 1), pick('P3', 20, 1)];
  const tight = velocityOf(moves, { nowMs: NOW, thresholds: { a: 0.4, b: 0.7 } });
  assert.equal(tight.ranks.get('P1').rank, 'A');
  assert.equal(tight.ranks.get('P2').rank, 'B');
  assert.equal(tight.ranks.get('P3').rank, 'C');
});

test('الترتيبُ حتميٌّ عند التساوي — فلا يتبدّل التصنيف بين فتحةٍ وأخرى', () => {
  const a = velocityOf([pick('ZZ', 10, 1), pick('AA', 10, 1)], { nowMs: NOW });
  const b = velocityOf([pick('AA', 10, 1), pick('ZZ', 10, 1)], { nowMs: NOW });
  assert.equal(a.order[0].sku, b.order[0].sku, 'ترتيبُ المتساويين تبدّل بتبدّل ترتيب المدخل');
  assert.equal(a.order[0].sku, 'AA');
});

/* ══════════ ⑤ راكد ≠ لا أعرف ══════════ */

test('★★★ دفترٌ خالٍ من الطلب لا يجعل الأصناف كلَّها راكدة — يجعلها مجهولة', () => {
  const r = velocityOf([{ sku: 'X', qty: 5, reason: 'putaway', postedAt: ago(1) }], { nowMs: NOW });
  assert.equal(r.total, 0);
  assert.equal(rankOf(r, 'X'), '', 'حُكم بالركود على مستودعٍ لم يُرحَّل دفترُه بعد');
  assert.equal(rankOf(r, 'ANY'), '');
  assert.ok(r.problem.includes('لا يُحكَم بالركود'), r.problem);
});

test('وبوجود طلبٍ على غيره يُحكَم بالركود — وهو حكمٌ لا سكوت', () => {
  const r = velocityOf([pick('LIVE', 10, 1)], { nowMs: NOW });
  assert.equal(rankOf(r, 'LIVE'), 'A');
  assert.equal(rankOf(r, 'GHOST'), 'DEAD');
  assert.notEqual(rankOf(r, 'GHOST'), 'C', '«راكد» خُلط بـ«بطيء» — والفرقُ قرارُ تصفية');
});

test('المطابقةُ بالكود ثمّ بالباركود، ولا تُبالي بحالة الأحرف', () => {
  const r = velocityOf([pick('itm-1', 10, 1)], { nowMs: NOW });
  assert.equal(rankOf(r, 'ITM-1'), 'A');
  assert.equal(rankOf(r, 'itm-1'), 'A');
  const byBarcode = velocityOf([{ sku: '', barcode: '628100', qty: 7, reason: 'pick', postedAt: ago(1) }], { nowMs: NOW });
  assert.equal(rankOf(byBarcode, '', '628100'), 'A');
});

test('حصرُ المستودع يعمل — ودورانُ طرابلس ليس دورانَ الرحبة', () => {
  const moves = [pick('A', 100, 1, { from: 'WH001' }), pick('B', 900, 1, { from: 'WH002' })];
  const tripoli = velocityOf(moves, { nowMs: NOW, warehouse: 'WH001' });
  assert.equal(tripoli.total, 100);
  assert.equal(rankOf(tripoli, 'B'), 'DEAD');
});

test('الكمّيّةُ الصفرُ والسالبةُ والصنفُ بلا هويّةٍ لا تُحتسب', () => {
  const r = velocityOf(
    [pick('A', 0, 1), pick('A', -5, 1), pick('', 9, 1), pick('B', 10, 1)],
    { nowMs: NOW }
  );
  assert.equal(r.total, 15, 'السالبُ يُقرأ بقيمته المطلقة (الدفترُ يكتب absQty) والصفرُ لا يُحتسب');
  assert.equal(r.ranks.has(''), false);
});

/* ══════════ ⑥ أثرُها في التسكين ══════════ */

const BIN = (code, distance) => ({ code, warehouse: 'RH', status: 'active', distance, capacity: {} });

test('★★★ السريعُ يُلاحق القريبَ — والراكدُ يُدفع إلى أبعد رفّ', () => {
  const locations = [BIN('RH-A-R-01-01', 2), BIN('RH-A-R-40-01', 60)];
  const line = { sku: 'ITM-1', qty: 5, uom: 'piece' };

  const fast = suggestLocations({ line, locations, balances: [], warehouse: 'RH', velocity: 'A' });
  assert.equal(fast.candidates[0].code, 'RH-A-R-01-01', 'السريعُ لم يُلاحق القريب');

  const dead = suggestLocations({ line, locations, balances: [], warehouse: 'RH', velocity: 'DEAD' });
  assert.equal(dead.candidates[0].code, 'RH-A-R-40-01', 'الراكدُ احتلّ أغلى رفٍّ في المستودع');
  assert.ok(
    dead.candidates[0].reasons.some((r) => r.includes('لا يُشغَل أغلى رفٍّ')),
    dead.candidates[0].reasons.join(' | ')
  );
});

test('★★★ وبلا تصنيفٍ يبقى حكمُ التسكين كما كان حرفًا — صفرُ انحراف', () => {
  const location = BIN('RH-A-R-40-01', 60);
  const line = { sku: 'ITM-1', qty: 5, uom: 'piece' };
  const before = scoreLocation(location, { line, balances: [] });
  const withC = scoreLocation(location, { line, balances: [], velocity: 'C' });
  assert.equal(before.score, withC.score, 'مرتبةُ C غيَّرت الدرجة — وهي سلوكُ اليوم');
  assert.equal(before.reasons.length, withC.reasons.length, 'سطرٌ زائدٌ على المجهول');
});

test('ورفٌّ بلا بُعدٍ معلَنٍ لا يتأثّر بالمرتبة — لا يُخترع بُعد', () => {
  const location = { code: 'RH-A-R-01-01', warehouse: 'RH', status: 'active', capacity: {} };
  const line = { sku: 'ITM-1', qty: 5, uom: 'piece' };
  const a = scoreLocation(location, { line, balances: [], velocity: 'A' });
  const d = scoreLocation(location, { line, balances: [], velocity: 'DEAD' });
  assert.equal(a.score, d.score);
});

/* ══════════ ⑦ المعامل والتسميات واللقطة ══════════ */

test('معاملُ البُعد مُعلَنٌ — والمجهولُ واحدٌ حتمًا', () => {
  assert.equal(velocityFactorOf('A'), 3);
  assert.equal(velocityFactorOf('B'), 1.5);
  assert.equal(velocityFactorOf('C'), 1);
  assert.equal(velocityFactorOf('DEAD'), -1);
  assert.equal(velocityFactorOf(''), 1, 'المجهولُ غيَّر الحكم');
  assert.equal(velocityFactorOf('ليس مرتبة'), 1);
});

test('لكلّ مرتبةٍ تسميةٌ وإرشاد — والمجهولُ له تسميتُه لا فراغ', () => {
  for (const r of ['A', 'B', 'C', 'DEAD', '']) {
    assert.ok(rankLabel(r).labelAr, `مرتبةٌ بلا تسمية: ${r}`);
    assert.ok(rankLabel(r).hint);
  }
  assert.ok(rankLabel('DEAD').labelAr.includes('راكد'));
  assert.ok(rankLabel('مجهول').labelAr.includes('غيرُ مصنَّف'));
});

test('اللقطةُ تُحصي المراتبَ ونصيبَها، وتحمل التحفّظَ معها', () => {
  const r = velocityOf([pick('P1', 900, 1), pick('P2', 80, 1), pick('P3', 20, 1), { sku: 'P4', qty: 5, reason: 'pick' }], { nowMs: NOW });
  const s = velocitySnapshot(r);
  assert.equal(s.counts.A, 1);
  assert.equal(s.counts.B, 1);
  assert.equal(s.counts.C, 1);
  assert.equal(s.shares.A, 90);
  assert.equal(s.items, 3);
  assert.equal(s.days, 90);
  assert.ok(s.caveat.includes('بلا ختمِ قيد'), s.caveat);
});

test('اللقطةُ لا تنفجر على نتيجةٍ فارغة', () => {
  const s = velocitySnapshot(velocityOf([], { nowMs: NOW }));
  assert.equal(s.items, 0);
  assert.equal(s.counts.A, 0);
  assert.ok(s.problem);
  assert.equal(velocitySnapshot(null).items, 0);
});
