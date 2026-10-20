/**
 * حارسُ وجه التجهيز وحدّيه — ‹WMS-301›.
 *
 * وأربعةُ بنودٍ هنا كلٌّ منها عطلٌ يوميٌّ لو سقط:
 * ① خانةٌ بلا حدٍّ معلَنٍ تُنتج مهمّة ⟹ ألفُ مهمّةٍ في أوّل يومٍ تُهمَل كلُّها.
 * ② النقصُ إلى الأدنى ⟹ العاملُ يمشي عشرين مترًا لكرتونةٍ ويعود بعد ساعة.
 * ③ المحجوزُ لا يُخصَم ⟹ امتلاءٌ وهميٌّ، فيقف المجهّزُ أمام رصيدٍ لا يملكه.
 * ④ حدّان مقلوبان ⟹ نقصٌ سالبٌ فلا مهمّةَ أبدًا، والخانةُ تفرغ صامتةً.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACE_LEVELS,
  isPickFace,
  replenishSpec,
  faceStock,
  pickFaceState,
  facesNeedingReplenish,
  faceSummary,
} from './replenishModel.js';
import { shapeLocation, locationProblems } from './locationsModel.js';

const FACE = (over = {}) => ({
  code: 'RH-A-R-01-01',
  warehouse: 'RH',
  status: 'active',
  pickFace: true,
  pickSku: 'ITM-1',
  replenishMin: 20,
  replenishMax: 100,
  ...over,
});
const bal = (over = {}) => ({ bin: 'RH-A-R-01-01', sku: 'ITM-1', warehouse: 'RH', qty: 50, ...over });

/* ══════════ ① لا حدَّ مخترَعًا ══════════ */

test('★★★ خانةٌ لم تُعلَن وجهًا لا تُنتج مهمّةً أبدًا — ولا حدَّ مخترَعًا', () => {
  const plain = { code: 'RH-A-R-02-01', warehouse: 'RH', status: 'active' };
  assert.equal(isPickFace(plain), false);
  assert.equal(replenishSpec(plain), null);
  const s = pickFaceState(plain, []);
  assert.equal(s.level, 'unknown');
  assert.equal(s.shortfall, 0, 'وُلد نقصٌ لخانةٍ لا حدَّ لها — فطابورُ ألف مهمّة');
  assert.ok(s.reason.includes('ليس وجهَ تجهيزٍ'));
});

test('★★ وجهٌ معلَنٌ بلا حدٍّ أعلى لا مواصفةَ له — فإلى أيّ كمّيّةٍ يُزوَّد؟', () => {
  const s = pickFaceState(FACE({ replenishMax: null }), []);
  assert.equal(s.level, 'unknown');
  assert.equal(s.shortfall, 0);
  assert.ok(s.reason.includes('بلا حدٍّ أعلى'), s.reason);
});

test('وحدٌّ أدنى غائبٌ يسقط صفرًا إن أُعلن الأعلى — أي «زوِّده حين يفرغ»', () => {
  const spec = replenishSpec(FACE({ replenishMin: null }));
  assert.deepEqual(spec, { sku: 'ITM-1', min: 0, max: 100 });
  const s = pickFaceState(FACE({ replenishMin: null }), [bal({ qty: 1 })]);
  assert.equal(s.level, 'ok', 'واحدةٌ متاحةٌ فوق الصفر — فلا تزويد');
  const empty = pickFaceState(FACE({ replenishMin: null }), []);
  assert.equal(empty.level, 'empty');
  assert.equal(empty.shortfall, 100);
});

/* ══════════ ② النقصُ إلى الأعلى ══════════ */

test('★★★ النقصُ يُحتسب إلى الحدّ الأعلى لا إلى الأدنى — تزويدٌ يملأ لا يلمس العتبة', () => {
  const s = pickFaceState(FACE(), [bal({ qty: 20 })]); // بلغ العتبةَ بالضبط
  assert.equal(s.level, 'low');
  assert.equal(s.shortfall, 80, 'حُسب النقصُ إلى الأدنى — فيعود العاملُ بعد ساعة');
  assert.equal(s.available, 20);
});

test('والفارغُ نقصُه الحدُّ الأعلى كاملًا', () => {
  const s = pickFaceState(FACE(), []);
  assert.equal(s.level, 'empty');
  assert.equal(s.shortfall, 100);
  assert.ok(s.reason.includes('المجهّزُ يقف'), s.reason);
});

test('والكافي نقصُه صفرٌ ولا مهمّةَ له', () => {
  const s = pickFaceState(FACE(), [bal({ qty: 60 })]);
  assert.equal(s.level, 'ok');
  assert.equal(s.shortfall, 0);
});

/* ══════════ ③ المحجوزُ يُخصَم ══════════ */

test('★★★ خانةٌ ممتلئةٌ بمحجوزٍ خانةٌ فارغةٌ عملًا — والمحجوزُ يُسمّى صريحًا', () => {
  const s = pickFaceState(FACE(), [bal({ qty: 100, qtyReserved: 100 })]);
  assert.equal(s.onHand, 100);
  assert.equal(s.available, 0);
  assert.equal(s.reserved, 100);
  assert.equal(s.level, 'empty', 'قُرئ qty وحدَه — فامتلاءٌ وهميٌّ والمجهّزُ يقف');
  assert.ok(s.reason.includes('محجوزة'), 'لم يُسمَّ المحجوز — فيقرأ المديرُ «فارغ» ويرى في الجرد مئة');
  assert.ok(s.reason.includes('100'));
});

test('والمحجوزُ الجزئيُّ يُخصَم بقدره', () => {
  const s = pickFaceState(FACE(), [bal({ qty: 100, qtyReserved: 85 })]);
  assert.equal(s.available, 15);
  assert.equal(s.level, 'low');
  assert.equal(s.shortfall, 85);
});

/* ══════════ ④ الحدّان المقلوبان يُردّان عند الحفظ ══════════ */

test('★★★ حدّان مقلوبان يُردّان عند الحفظ — ولا يُكتشفان في الميدان', () => {
  const problems = locationProblems({ code: 'RH-A-R-01-01', pickFace: true, replenishMin: 100, replenishMax: 20 });
  assert.ok(problems.some((p) => p.includes('مقلوبان')), problems.join(' | '));
  // وبلا ردٍّ كان النقصُ سالبًا فلا مهمّةَ أبدًا:
  assert.equal(replenishSpec(FACE({ replenishMin: 100, replenishMax: 20 })), null);
});

test('ووجهٌ بحدٍّ أدنى بلا أعلى يُردّ أيضًا، والسالبُ يُردّ', () => {
  assert.ok(locationProblems({ code: 'RH-A-R-01-01', pickFace: true, replenishMin: 20 }).some((p) => p.includes('بلا أعلى')));
  assert.ok(locationProblems({ code: 'RH-A-R-01-01', replenishMin: -1 }).some((p) => p.includes('سالبًا')));
  assert.ok(locationProblems({ code: 'RH-A-R-01-01', replenishMax: -5 }).some((p) => p.includes('سالبًا')));
});

/* ══════════ ⑤ التشكيلُ يحفظ الحقول ولا يُصفّر الفارغ ══════════ */

test('★★★ shapeLocation يحفظ حقولَ الوجه — ولا يُصفّر الفارغَ (null ≠ صفر)', () => {
  const shaped = shapeLocation({ code: 'RH-A-R-01-01', pickFace: true, pickSku: 'itm-1', replenishMin: 20, replenishMax: 100 });
  assert.equal(shaped.pickFace, true);
  assert.equal(shaped.pickSku, 'ITM-1');
  assert.equal(shaped.replenishMin, 20);
  assert.equal(shaped.replenishMax, 100);

  const plain = shapeLocation({ code: 'RH-A-R-02-01' });
  assert.equal(plain.pickFace, false);
  assert.equal(plain.replenishMin, null, 'صُفِّر الفارغ — فصارت كلُّ خانةٍ وجهَ تجهيزٍ حدُّه صفر');
  assert.equal(plain.replenishMax, null);
  // والحقولُ القائمةُ لم تُمسّ.
  assert.equal(plain.status, 'active');
  assert.equal(plain.handling, 'mixed');
  assert.equal(plain.mixItems, true);
});

test('والصفرُ المعلَنُ يُحفَظ صفرًا — فهو «لا تتركه يفرغ قطّ»', () => {
  const shaped = shapeLocation({ code: 'RH-A-R-01-01', pickFace: true, replenishMin: 0, replenishMax: 50 });
  assert.equal(shaped.replenishMin, 0);
  assert.notEqual(shaped.replenishMin, null, 'صفرٌ معلَنٌ قُرئ «غيرَ معلَن»');
});

/* ══════════ ⑥ «أعرف أنّها فارغة» ≠ «لا أعرف» ══════════ */

test('★★ قائمةُ أرصدةٍ لم تُمرَّر جهلٌ لا فراغٌ — فلا تُولَّد مهمّة', () => {
  const s = pickFaceState(FACE(), null);
  assert.equal(s.level, 'unknown');
  assert.equal(s.shortfall, 0, 'حُكم بالفراغ من جهل');
  assert.ok(s.reason.includes('لم تُمرَّر'), s.reason);
  // والحدّان يُعرَضان مع ذلك — فالمواصفةُ معلومةٌ ولو جُهل الرصيد.
  assert.equal(s.min, 20);
  assert.equal(s.max, 100);
});

test('وقائمةٌ فارغةٌ مُمرَّرةٌ فراغٌ يقينيّ', () => {
  assert.equal(pickFaceState(FACE(), []).level, 'empty');
});

/* ══════════ ⑦ قراءةُ الرصيد ══════════ */

test('رصيدُ الوجه يُحصر بصنفه المخصَّص — ولا يُحسب جارُه في الخانة', () => {
  const s = faceStock(FACE(), [bal({ qty: 30 }), bal({ sku: 'ITM-9', qty: 70 })]);
  assert.equal(s.onHand, 30, 'حُسب صنفٌ آخرُ في الخانة — فامتلاءٌ وهميّ');
  assert.equal(s.sku, 'ITM-1');
});

test('ووجهٌ بلا صنفٍ مخصَّصٍ يقرأ ما فيه — وهو حالُ أكثر المستودعات', () => {
  const s = faceStock(FACE({ pickSku: '' }), [bal({ sku: 'ITM-7', qty: 40 })]);
  assert.equal(s.onHand, 40);
  assert.equal(s.sku, 'ITM-7', 'صنفٌ وحيدٌ في الخانة لم يُستنتَج');
  const mixed = faceStock(FACE({ pickSku: '' }), [bal({ sku: 'A', qty: 1 }), bal({ sku: 'B', qty: 2 })]);
  assert.equal(mixed.sku, '', 'اختُرع صنفٌ لخانةٍ مختلطة');
  assert.equal(mixed.skus.length, 2);
});

test('وحقلُ location يُقرأ كـbin — استيرادُ إكسل يكتبه', () => {
  const s = faceStock(FACE(), [{ location: 'RH-A-R-01-01', sku: 'ITM-1', qty: 12 }]);
  assert.equal(s.onHand, 12);
});

/* ══════════ ⑧ الترتيبُ والإحصاء ══════════ */

test('★★ الفارغُ يسبق الناقصَ — فمجهّزٌ واقفٌ الآن أهمُّ من خانةٍ ستفرغ', () => {
  const locations = [
    FACE({ code: 'RH-A-R-01-01' }),
    FACE({ code: 'RH-A-R-02-01' }),
    FACE({ code: 'RH-A-R-03-01' }),
  ];
  const balances = [
    bal({ bin: 'RH-A-R-01-01', qty: 20 }), // ناقصٌ (عجزُه 80)
    // RH-A-R-02-01 فارغٌ تمامًا
    bal({ bin: 'RH-A-R-03-01', qty: 90 }), // كافٍ
  ];
  const { faces, counts } = facesNeedingReplenish(locations, balances, { warehouse: 'RH' });
  assert.equal(faces.length, 2);
  assert.equal(faces[0].code, 'RH-A-R-02-01', 'الفارغُ لم يسبق');
  assert.equal(faces[1].code, 'RH-A-R-01-01');
  assert.deepEqual(counts, { total: 3, empty: 1, low: 1, ok: 1, unknown: 0 });
});

test('والأكبرُ عجزًا يسبق بين المتساويين في المستوى، والترتيبُ حتميّ', () => {
  const locations = [
    FACE({ code: 'RH-A-R-01-01', replenishMax: 100 }),
    FACE({ code: 'RH-A-R-02-01', replenishMax: 500 }),
  ];
  const balances = [bal({ bin: 'RH-A-R-01-01', qty: 10 }), bal({ bin: 'RH-A-R-02-01', qty: 10 })];
  const { faces } = facesNeedingReplenish(locations, balances);
  assert.equal(faces[0].code, 'RH-A-R-02-01');
  assert.equal(faces[0].shortfall, 490);
});

test('المؤرشَفُ لا يُحتسب، والمستودعُ يُحصر', () => {
  const locations = [
    FACE({ code: 'RH-A-R-01-01', status: 'archived' }),
    FACE({ code: 'WH-A-R-01-01', warehouse: 'WH001' }),
  ];
  const { counts } = facesNeedingReplenish(locations, [], { warehouse: 'RH' });
  assert.equal(counts.total, 0);
});

test('لكلّ مستوًى نبرةٌ ونصّ — والأحمرُ للفارغ وحده', () => {
  for (const id of ['empty', 'low', 'ok', 'unknown']) {
    assert.ok(FACE_LEVELS[id].labelAr && FACE_LEVELS[id].hint, `مستوًى ناقص: ${id}`);
  }
  assert.equal(FACE_LEVELS.empty.tone, 'warn');
  assert.notEqual(FACE_LEVELS.low.tone, 'warn', 'الأحمرُ للتحذير وحده — و«تحت الحدّ» ليس تحذيرًا');
});

test('سطرُ العرض يُقرأ ولا يكتم المحجوز', () => {
  const s = pickFaceState(FACE(), [bal({ qty: 100, qtyReserved: 100 })]);
  const line = faceSummary(s);
  assert.ok(line.includes('فارغ') && line.includes('محجوزة') && line.includes('النقص 100'), line);
  assert.equal(faceSummary(null), '');
});
