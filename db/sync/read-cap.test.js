/**
 * بيّنةُ سقف القراءة اليوميّ.
 *
 * ★★★ **ولماذا هذا الملفُّ موجود:** في 2026-10-21 فُتحت المرآةُ الكاملةُ على
 *     خطّةٍ مبنيّةٍ على جردِ أحجامٍ من سبتمبر. وكان الجردُ يقول
 *     `bin_locations = 0` وهي **٨٤٠٢**، فصُنّفت «باردةً · مسحًا كاملًا» ⇒
 *     **١٥٬١٦٤ مستندًا في الدورة الواحدة**، أي ٣٦٤ ألفًا يوميًّا: سبعةُ أضعاف
 *     الحصّة. ولم تنجُ البوّابةُ إلّا بإيقافٍ يدويٍّ بعد دورةٍ واحدة.
 *
 *     **والجردُ يشيخ دائمًا.** فالحارسُ هنا لا يسأله شيئًا: يحكم على **ما
 *     قُرئ فعلًا**، ورقمٌ من السجلّ لا يشيخ ولا يُقدَّر.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readsTodayOrCap, capReached, BUDGET_READS_PER_DAY } from './watermark.js';

test('يمرّ ما دام دون السقف، ويقف عنده', () => {
  assert.equal(capReached(0, 20000), false);
  assert.equal(capReached(19999, 20000), false);
  assert.equal(capReached(20000, 20000), true, 'الحدُّ نفسُه توقّف');
  assert.equal(capReached(364000, 20000), true);
});

test('★★★ نقض: قيمةٌ لا تُقرأ تُعدّ مستنفَدةً — لا صفرًا', () => {
  // لو عُدّت صفرًا لانفتح البابُ على مصراعيه **يومَ يقع العطب** — وهو اليومُ
  // الذي يُحتاج فيه الحارسُ بالذات.
  for (const bad of [null, undefined, '', 'لا رقم', NaN, {}, [], -5]) {
    assert.equal(readsTodayOrCap(bad, 20000), 20000, `«${String(bad)}» يجب أن تُعدّ مستنفَدة`);
  }
});

test('والرقمُ الصحيحُ يمرّ كما هو — ولو كان صفرًا حقيقيًّا', () => {
  assert.equal(readsTodayOrCap(0, 20000), 0);
  assert.equal(readsTodayOrCap('15791', 20000), 15791);
  assert.equal(readsTodayOrCap(15791, 20000), 15791);
});

test('★★ والسقفُ الافتراضيُّ دون الحصّة المجّانيّة بهامشٍ واضح', () => {
  // الحصّةُ ٥٠٬٠٠٠. والسقفُ يترك متّسعًا لقراءات البوّابة نفسِها.
  assert.ok(BUDGET_READS_PER_DAY > 0);
  assert.ok(BUDGET_READS_PER_DAY <= 25000, 'سقفٌ يقارب الحصّةَ ليس هامشًا');
});

test('★★★ ويُحاكى اليومُ الذي وقع: الدورةُ تتوقّف في منتصفها لا بعد فوات الأمر', () => {
  const cap = 20000;
  // أحجامٌ حقيقيّةٌ مقيسةٌ من المرآة بعد الدورة الأولى.
  const sizes = [8402, 1762, 1388, 392, 143, 14, 14, 10, 6, 6];
  let spent = 0;
  let read = 0;
  let stopped = 0;
  for (const n of sizes) {
    if (capReached(spent, cap)) {
      stopped += 1;
      continue;
    }
    spent += n;
    read += 1;
  }
  assert.equal(spent <= cap + 8402, true, 'لا تتجاوز بأكثر من أكبرِ مسارٍ واحد');
  assert.equal(read + stopped, sizes.length, 'كلُّ مسارٍ إمّا قُرئ أو أُوقف صراحةً');

  // وبسقفٍ ضيّقٍ يقف مبكّرًا فعلًا — وإلّا فالحارسُ لا يطلق أبدًا.
  let s2 = 0;
  let r2 = 0;
  for (const n of sizes) {
    if (capReached(s2, 5000)) continue;
    s2 += n;
    r2 += 1;
  }
  assert.ok(r2 < sizes.length, 'بسقفٍ ضيّقٍ يجب أن يُمنع بعضُها');
  assert.equal(r2, 1, 'أوّلُ مسارٍ (٨٤٠٢) وحدَه يمرّ ثمّ يُوقَف الباقي');
});

test('★★★ ويُعَدّ بيوم الحصّة لا بيومنا — وإلّا فالحارسُ يحرس يومًا آخر', () => {
  // قوقل تُصفّر الحصّةَ عند منتصف ليل المحيط الهادئ، لا UTC. وقِيس الفرقُ
  // حيًّا 2026-10-20: حدُّنا ٣٠١١٢ · حدُّ قوقل ١٣٣٩٨ — في اللحظة نفسِها.
  const src = readFileSync(new URL('./sync.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("America/Los_Angeles"), 'منطقةُ الحصّة غيرُ مذكورة');
  assert.ok(
    src.includes("date_trunc('day', now() AT TIME ZONE"),
    'الحدُّ لا يُحسب بمنطقة الحصّة'
  );
  // ونقضًا: لا يبقى حدٌّ خامٌ بتوقيت الخادم.
  assert.equal(
    src.includes("started_at >= date_trunc('day', now());"),
    false,
    'ما زال حدٌّ بتوقيت الخادم — وهو ما يُفسد الحساب'
  );
});
