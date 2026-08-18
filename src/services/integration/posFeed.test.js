/**
 * حارس تغذية نقطة البيع ‹FNB-704›.
 *
 * أخطر ما يحرسه: **انقطاع المصدر لا يُسكِت الاستهلاك النظريّ بصمت** —
 * فمصدرٌ توقّف بلا إعلان يجعل كلّ فرعٍ يبدو مهدِرًا بينما العطب في
 * التغذية؛ و**المصدر غير الجاهز يُعلَن ولا يُفعَّل**؛ و**غير المطابق
 * يُسمّى** فدقّةٌ ٪٩٠ بلا معرفة الـ١٠٪ رقمٌ لا يُعالَج.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POS_SOURCES, POS_POLICY, readySources, sourceVerdict,
  posAccuracy, feedOutageException, measurableWindow, FEED_GRACE_DAYS,
} from './posFeed.js';
import { DIRECTION_IDS, MONEY_MODES } from './integrationPolicy.js';
import { EXCEPTION_TYPES } from '../ledger/exceptions.js';

test('★ الاتّجاه محسومٌ ولا ينتظر ق-O06 — تُسحب ولا تُدفع', () => {
  assert.equal(POS_POLICY.direction, 'pull');
  assert.ok(DIRECTION_IDS.includes(POS_POLICY.direction), 'اتّجاهٌ من السجلّ القائم');
  assert.equal(POS_POLICY.money, 'pull');
  assert.ok(MONEY_MODES.some((m) => m.id === POS_POLICY.money));
  assert.match(POS_POLICY.why, /مصدرَين/);
});

test('★★ المصدر غير الجاهز يُعلَن ولا يُفعَّل — والتفعيل بلا موصِّلٍ صمتٌ يُظنّ فراغًا', () => {
  assert.deepEqual(readySources(), ['file'], 'الملفّ اليوميّ وحده متاحٌ دائمًا');
  assert.equal(sourceVerdict('file').ok, true);

  const odoo = sourceVerdict('odoo');
  assert.equal(odoo.ok, false);
  assert.match(odoo.problem, /ق-O06/);
  assert.match(odoo.problem, /يُعلَن ولا يُفعَّل/);
  assert.equal(sourceVerdict('foodics').ok, false);
  assert.equal(sourceVerdict('مخترَع').ok, false);
  // والثلاثة معلَنةٌ بلا اختيار — القرار للمالك.
  assert.equal(Object.keys(POS_SOURCES).length, 3);
});

test('★ دقّة نقطة البيع — وغيرُ المطابق يُسمّى صنفًا صنفًا', () => {
  const known = new Set(['BURGER', 'FRIES']);
  const r = posAccuracy(
    [{ sku: 'BURGER', qty: 80 }, { sku: 'FRIES', qty: 10 }, { sku: 'PIZZA', qty: 8 }, { sku: 'SHAWARMA', qty: 2 }],
    known
  );
  assert.equal(r.total, 100);
  assert.equal(r.matched, 90);
  assert.equal(r.accuracy, 90);
  assert.deepEqual(r.unknown.map((u) => u.sku), ['PIZZA', 'SHAWARMA'], 'الأكثر أثرًا أوّلًا');
  assert.match(r.why, /يحتاج ضبط الماستر/);
});

test('وبلا مبيعاتٍ لا تُحسب دقّةٌ على فراغ', () => {
  const r = posAccuracy([], new Set(['X']));
  assert.equal(r.accuracy, null);
  assert.match(r.why, /لا تُحسب دقّةٌ على فراغ/);
});

test('★★ انقطاع التغذية يُعلَن — والاستهلاك النظريّ «غير محسوب» لا صفر', () => {
  // داخل المهلة: لا استثناء.
  assert.equal(feedOutageException({ branch: 'BR01', lastFeedDay: '2026-08-17' }, { today: '2026-08-18' }), null);

  const out = feedOutageException({ branch: 'BR01', lastFeedDay: '2026-08-10' }, { today: '2026-08-18' });
  assert.ok(out);
  assert.equal(out.type, 'approval_stale');
  assert.ok(EXCEPTION_TYPES.approval_stale, 'النوع مبنيٌّ من قبل — لا صنفٌ جديد');
  assert.match(out.reason, /غير محسوب.. لا صفر/);
  assert.match(out.reason, /فلا يُقاس عليه انحراف/);
  assert.equal(FEED_GRACE_DAYS, 2);
});

test('★ وفرعٌ لم تصله بياناتٌ قطّ يُعلَن كذلك — الصفر ليس حقيقةً', () => {
  const never = feedOutageException({ branch: 'BR09' }, { today: '2026-08-18' });
  assert.ok(never);
  assert.match(never.reason, /لم تصل بيانات نقطة بيعٍ قطّ/);
  assert.match(never.reason, /ولا يعني ذلك أنّه صفر/);
});

test('★★ مدّةٌ فيها انقطاعٌ لا يُقاس عليها انحراف — واتّهامُ فرعٍ بريء أسوأ من صمت', () => {
  const full = measurableWindow({
    branch: 'BR01', from: '2026-08-16', to: '2026-08-18',
    feedDays: ['2026-08-16', '2026-08-17', '2026-08-18'],
  });
  assert.equal(full.ok, true);

  const gap = measurableWindow({
    branch: 'BR01', from: '2026-08-16', to: '2026-08-18',
    feedDays: ['2026-08-16', '2026-08-18'],
  });
  assert.equal(gap.ok, false);
  assert.deepEqual(gap.missing, ['2026-08-17']);
  assert.match(gap.problem, /لا يُقاس انحرافُ استهلاكٍ على مدّةٍ ناقصة/);
});
