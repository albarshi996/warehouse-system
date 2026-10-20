/**
 * بيّنةُ الأرضيّة المؤكَّدة — ومحاكاةُ اليوم الذي وقع فيه العطب.
 *
 * ★★★ وأهمُّ ما تُثبته ليس التوفيرَ بل **أنّ الحمايةَ لم تسقط**: الاحتياطُ
 *     يبقى عاملًا فوق الأرضيّة حيث لم نتحقّق بعد. فحارسٌ يوفّر بإسقاط
 *     الحماية ليس توفيرًا بل تأجيلُ فقد.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowFloor, settled, windowStart, OVERLAP_MS } from './watermark.js';

const T = (iso) => new Date(iso).toISOString();
const W = T('2026-10-13T15:21:25.919Z');

test('بلا أرضيّةٍ مؤكَّدة: الاحتياطُ يعمل كما كان', () => {
  assert.equal(windowFloor(W, null), windowStart(W));
  assert.equal(windowFloor(W, null), T('2026-10-13T15:20:25.919Z'));
});

test('★★★ وبأرضيّةٍ مؤكَّدةٍ عند العلامة: لا تراجعَ البتّة', () => {
  // هذه هي الحالةُ التي أحرقت ٣٨٠٠ قراءةٍ في كلّ دورة.
  assert.equal(windowFloor(W, W), W, 'الأرضيّةُ تفوز على الاحتياط');
});

test('★★★ والحمايةُ باقيةٌ فوق الأرضيّة — وهذا شرطُ القبول', () => {
  // تقدّمت العلامةُ إلى لحظةٍ أحدث، والأرضيّةُ قديمة ⇒ يعود الاحتياطُ للعمل
  // في المجال الذي لم يُفحص بعد، ولا ينزل تحت المؤكَّد.
  const W2 = T('2026-10-13T15:30:00.000Z');
  const floor = windowFloor(W2, W);
  assert.equal(floor, T('2026-10-13T15:29:00.000Z'));
  assert.ok(Date.parse(floor) > Date.parse(W), 'لا ينزل تحت المؤكَّد');
  assert.ok(Date.parse(floor) < Date.parse(W2), 'ويظلّ يحتاط قبل العلامة');
});

test('★★ وأرضيّةٌ أحدثُ من نافذة الاحتياط تفوز', () => {
  const W2 = T('2026-10-13T15:21:40.000Z'); // بعد المؤكَّد بـ١٥ ثانية
  // الاحتياطُ يريد 15:20:40، والمؤكَّدُ 15:21:25 ⟵ المؤكَّدُ أعلى فيفوز.
  assert.equal(windowFloor(W2, W), W);
});

test('نقض: مدخلاتٌ معطوبةٌ لا تُنتج أرضيّةً كاذبة', () => {
  assert.equal(windowFloor(null, W), null, 'بلا علامةٍ لا نافذة');
  assert.equal(windowFloor('ليس تاريخًا', W), null);
  assert.equal(windowFloor(W, 'ليس تاريخًا'), windowStart(W), 'مؤكَّدٌ معطوب ⟵ الاحتياطُ وحدَه');
});

test('★★★ «تأكّد» يعني أنّ العلامةَ لم تتقدّم — لا أنّ الدورةَ نجحت', () => {
  assert.equal(settled(W, W), true);
  assert.equal(settled(W, T('2026-10-13T15:30:00.000Z')), false, 'تقدّمت ⇒ لم يتأكّد شيء');
  assert.equal(settled(null, null), false, 'بلا علامةٍ سابقةٍ لا تأكيد');
  assert.equal(settled(null, W), false);
});

test('★★★ محاكاةُ اليوم الذي وقع: تتقارب بعد دورةٍ واحدةٍ مهدورة', () => {
  // ٣٨٠٠ خانةٍ تحمل الدقيقةَ نفسَها، والعلامةُ عند أقصاها.
  let watermark = W;
  let confirmed = null;
  const reads = [];

  for (let cycle = 0; cycle < 4; cycle += 1) {
    const floor = windowFloor(watermark, confirmed, OVERLAP_MS);
    // كلُّ المستندات ختمُها W؛ فتُقرأ إن كانت الأرضيّةُ تحتها فقط.
    const hit = Date.parse(floor) < Date.parse(W) ? 3800 : 0;
    reads.push(hit);
    const after = watermark; // لا جديدَ في المصدر
    if (settled(watermark, after)) confirmed = watermark;
    watermark = after;
  }

  assert.deepEqual(reads, [3800, 0, 0, 0], 'دورةٌ واحدةٌ مهدورةٌ ثمّ صفر');
});
