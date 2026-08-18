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
  DECIDED_SOURCE, POS_DATASET, groupIntoBatches, batchVerdict, feedDaysOf,
} from './posFeed.js';
import { DATASETS } from '../excel/excelSchema.js';
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
  assert.deepEqual(readySources(), ['file'], 'الملفّ اليوميّ هو المعتمَد (ق-O06)');
  assert.equal(sourceVerdict('file').ok, true);

  const odoo = sourceVerdict('odoo');
  assert.equal(odoo.ok, false);
  assert.match(odoo.problem, /بديلٌ لاحق/, 'البديل معلَنٌ غير مفعَّل بعد حسم ق-O06');
  assert.match(odoo.problem, /يُعلَن ولا يُفعَّل/);
  assert.equal(sourceVerdict('foodics').ok, false);
  assert.equal(sourceVerdict('مخترَع').ok, false);
  // والثلاثة تبقى معلَنةً: تبديل المصدر لاحقًا لا يهدم شيئًا.
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

/* ═══════════ الملفّ اليوميّ — المصدر المعتمَد (ق-O06) ═══════════ */

test('★ المصدر المعتمَد يمرّ بمسار الاستيراد القائم — لا مسارَ رفعٍ ثانٍ', () => {
  assert.equal(DECIDED_SOURCE, 'file');
  assert.equal(POS_SOURCES[DECIDED_SOURCE].ready, true);
  // والمجموعة معرَّفةٌ في مخطّط الاستيراد نفسه الذي تستعمله بقيّة الشيتات.
  assert.ok(DATASETS[POS_DATASET], 'مجموعة الاستيراد غير معرَّفة');
  const cols = DATASETS[POS_DATASET].columns.map((c) => c.field);
  assert.deepEqual(cols, ['date', 'branch', 'sku', 'qty'], 'أربعةٌ لا أكثر — الملفّ يُملأ يوميًّا');
  // ★ والسعر لا يُطلب: الإيراد من أودو (حدّ ق‑ت١)، وطلبُه هنا مصدرٌ ثانٍ للمال.
  assert.ok(!cols.includes('price'));
  assert.ok(!cols.includes('amount'));
});

test('★★ رفعُ اليوم نفسه مرّتين **استبدالٌ لا إضافة** — وإلّا تضاعفت المبيعات', () => {
  const { batches } = groupIntoBatches([
    { date: '2026-08-18', branch: 'BR01', sku: 'BURGER', qty: 60 },
    { date: '2026-08-18', branch: 'BR01', sku: 'FRIES', qty: 40 },
    { date: '2026-08-18', branch: 'BR02', sku: 'BURGER', qty: 25 },
  ]);
  assert.equal(batches.length, 2, 'دفعةٌ لكلّ (فرع × يوم)');
  const br01 = batches.find((b) => b.branch === 'BR01');
  assert.equal(br01.id, 'BR01__2026-08-18', 'معرّفٌ حتميّ فالإعادة تستبدل');
  assert.equal(br01.qty, 100);

  // وإعادة الرفع تُعلَن استبدالًا **قبل** الحفظ لا بعده.
  const v = batchVerdict(br01, { existing: { qty: 60 }, today: '2026-08-19' });
  assert.equal(v.ok, true);
  assert.equal(v.mode, 'replace');
  assert.match(v.warnings[0], /يحلّ محلّها/);
  assert.match(v.warnings[0], /ولا يُضاف إليها/);
  // وأوّل رفعٍ جديدٌ بلا تحذير.
  assert.equal(batchVerdict(br01, { today: '2026-08-19' }).mode, 'new');
});

test('★ فرعٌ خارج الشجرة يُمنع — مبيعاتٌ لفرعٍ مجهول لا تُنسب إلى أحد', () => {
  const { batches } = groupIntoBatches([{ date: '2026-08-18', branch: 'GHOST', sku: 'X', qty: 5 }]);
  const v = batchVerdict(batches[0], { branches: new Set(['BR01', 'BR02']), today: '2026-08-19' });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /ليس فرعًا في الشجرة/);
  // وبلا قائمة فروعٍ لا يُحكم — لا حكمَ بجهل.
  assert.equal(batchVerdict(batches[0], { today: '2026-08-19' }).ok, true);
});

test('وتاريخٌ بعد اليوم يُمنع — مبيعاتٌ لم تقع بعد', () => {
  const { batches } = groupIntoBatches([{ date: '2026-09-01', branch: 'BR01', sku: 'X', qty: 5 }]);
  const v = batchVerdict(batches[0], { today: '2026-08-18' });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /لم تقع بعد/);
});

test('صفٌّ بلا فرعٍ يُعلَن ولا يُبتلع — البيع يُنسب لفرعٍ لا للقطاع عامّةً', () => {
  const { batches, problems } = groupIntoBatches([{ date: '2026-08-18', sku: 'X', qty: 5 }]);
  assert.deepEqual(batches, []);
  assert.match(problems[0], /البيع يُنسب لفرعٍ/);
});

test('★ أيّام التغذية تُقرأ من الدفعات نفسها — فتُعرف المدّة الصالحة للقياس', () => {
  const { batches } = groupIntoBatches([
    { date: '2026-08-16', branch: 'BR01', sku: 'X', qty: 1 },
    { date: '2026-08-18', branch: 'BR01', sku: 'X', qty: 1 },
    { date: '2026-08-17', branch: 'BR02', sku: 'X', qty: 1 },
  ]);
  assert.deepEqual(feedDaysOf(batches, 'BR01'), ['2026-08-16', '2026-08-18']);
  // ويومُ 17 ناقصٌ لـBR01 ⇒ المدّة لا تصلح للقياس.
  const w = measurableWindow({ branch: 'BR01', from: '2026-08-16', to: '2026-08-18', feedDays: feedDaysOf(batches, 'BR01') });
  assert.equal(w.ok, false);
  assert.deepEqual(w.missing, ['2026-08-17']);
});
