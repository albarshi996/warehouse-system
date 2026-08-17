/**
 * اختبارات محرّك الأولويّة ‹EXE-302› — القواعد الثلاث محروسةٌ هنا:
 * الدرجة تُعيد عواملها · قابليّة التنفيذ حاكمة · واليدويّة تجاوزٌ معلَن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPORTANCE,
  RELEASE_STATE,
  reassignVerdict,
  releaseVerdict,
  WEIGHTS,
  explain,
  manualScore,
  priorityOf,
  rankTasks,
  rankValue,
} from './priority.js';

const NOW = Date.parse('2026-08-17T09:00:00Z');
const base = { nowMs: NOW, importance: 'med', lines: 10, executable: true };

test('★★ الأوزان في مصدرٍ واحد ومجموعها 100 — فتُقرأ الدرجة نسبةً', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100, 'وتعديلها قرارُ المالك ت-O03 في موضعٍ واحد');
});

test('★★ الدرجة تُعيد عواملها لا رقمها وحده — «الرقم بلا مرجعٍ لا يُعرض»', () => {
  const v = priorityOf({}, base);
  assert.equal(v.factors.length, Object.keys(WEIGHTS).length, 'عاملٌ لكلّ وزن');
  for (const f of v.factors) {
    assert.ok(f.label, 'لكلّ عاملٍ تسمية');
    assert.ok(f.weight > 0);
    assert.ok(Number.isInteger(f.points));
  }
});

test('★★ قابليّة التنفيذ حاكمة — بلا رصيدٍ لا تتصدّر مهما قرب موعدها', () => {
  // إرسالُ عاملٍ إلى رفٍّ فارغ ليس أولويّة بل إهدارُ رحلة.
  const urgent = priorityOf({}, { ...base, dueAt: '2026-08-17T06:00:00Z', executable: false, blockReason: 'لا رصيد' });
  const calm = priorityOf({}, { ...base, dueAt: '2026-08-25T09:00:00Z' });
  assert.ok(urgent.score > calm.score, 'درجتها المحسوبة أعلى فعلًا');
  assert.ok(rankValue(urgent) < rankValue(calm), 'ومع ذلك تُؤخَّر');
  assert.equal(urgent.blocked, true);
});

test('★★ المحجوبة تُعلَن ولا تُدفَن — السبب مكتوب', () => {
  const v = priorityOf({}, { ...base, executable: false, blockReason: 'لا رصيد في الموقع' });
  assert.match(v.reason, /لا رصيد في الموقع/);
  assert.match(explain(v), /مؤجَّلة/);
});

test('بلا سببٍ مكتوب يُقال سببٌ عامّ ولا تُترك فارغة', () => {
  assert.ok(priorityOf({}, { ...base, executable: false }).reason.length > 0);
});

/* ── المهلة ─────────────────────────────────────────────────── */

test('★★ المتأخّر يبلغ نصيب المهلة كاملًا', () => {
  const late = priorityOf({}, { ...base, dueAt: '2026-08-17T06:00:00Z' });
  assert.equal(late.factors.find((f) => f.id === 'due').points, WEIGHTS.due);
});

test('★★ «بلا موعد» نصفُ النصيب — الجهل لا يُرقّي ولا يُسقِط', () => {
  const none = priorityOf({}, base);
  assert.equal(none.factors.find((f) => f.id === 'due').points, Math.round(WEIGHTS.due * 0.5));
  assert.equal(none.factors.find((f) => f.id === 'due').note, 'بلا موعدٍ معلن');
});

test('الأقرب موعدًا أعلى من الأبعد', () => {
  const near = priorityOf({}, { ...base, dueAt: '2026-08-17T15:00:00Z' });
  const far = priorityOf({}, { ...base, dueAt: '2026-08-20T09:00:00Z' });
  assert.ok(near.score > far.score);
});

/* ── العوامل الأخرى ─────────────────────────────────────────── */

test('القديم يتقدّم كي لا يُنسى تحت زحام الجديد', () => {
  const old = priorityOf({}, { ...base, createdAt: '2026-08-10T09:00:00Z' });
  const fresh = priorityOf({}, { ...base, createdAt: '2026-08-17T08:00:00Z' });
  assert.ok(old.score > fresh.score);
});

test('الصغير يتقدّم — يُنجَز فيُفرَّغ الطابور', () => {
  const small = priorityOf({}, { ...base, lines: 2 });
  const big = priorityOf({}, { ...base, lines: 60 });
  assert.ok(small.score > big.score);
  assert.equal(big.factors.find((f) => f.id === 'size').points, 0, 'وما فوق الحدّ لا يزيد أثره');
});

test('ما بدأ ولم ينتهِ يتقدّم — تركُه يضاعف المشي', () => {
  const resumed = priorityOf({}, { ...base, resumed: true });
  assert.equal(resumed.factors.find((f) => f.id === 'resumed').points, WEIGHTS.resumed);
  assert.ok(resumed.score > priorityOf({}, base).score);
});

test('أهمّيّة مجهولة تُعامَل متوسّطةً لا مرتفعة', () => {
  const unknown = priorityOf({}, { ...base, importance: 'ملكيّ' });
  assert.equal(unknown.factors.find((f) => f.id === 'customer').points, Math.round(WEIGHTS.customer * IMPORTANCE.med));
});

/* ── التجاوز اليدويّ ────────────────────────────────────────── */

test('★★ اليدويّة تُطاع — وتظهر تجاوزًا باسم صاحبه لا تُدهس ولا تُخلط', () => {
  const manual = priorityOf({}, { ...base, manualPriority: 'high', manualBy: 'محمد البرشي' });
  const computed = priorityOf({}, { ...base, dueAt: '2026-08-17T06:00:00Z' });
  assert.ok(rankValue(manual) > rankValue(computed), 'فوق كلّ محسوب');
  assert.equal(manual.manual.by, 'محمد البرشي');
  assert.match(explain(manual), /تجاوزٌ يدويّ من محمد البرشي/);
});

test('اليدويّة متدرّجةٌ بينها · والمحجوب يبقى أسفلَ الكلّ ولو كان يدويًّا', () => {
  assert.ok(manualScore('high') > manualScore('med'));
  assert.ok(manualScore('med') > manualScore('low'));
  const blockedManual = priorityOf({}, { ...base, manualPriority: 'high', executable: false });
  assert.equal(rankValue(blockedManual), -1, 'لا يُرسَل عاملٌ إلى رفٍّ فارغ بأمرٍ يدويّ');
});

/* ── الترتيب والشرح ─────────────────────────────────────────── */

test('★ الترتيب ثلاث طبقات: المحجوب أسفلَ · ثمّ اليدويّ · ثمّ المحسوب', () => {
  const ranked = rankTasks(
    [
      { task: { id: 'blocked' }, ctx: { ...base, dueAt: '2026-08-17T06:00:00Z', executable: false } },
      { task: { id: 'computed' }, ctx: { ...base, dueAt: '2026-08-17T10:00:00Z' } },
      { task: { id: 'manual' }, ctx: { ...base, manualPriority: 'high' } },
    ],
    NOW
  );
  assert.deepEqual(ranked.map((r) => r.task.id), ['manual', 'computed', 'blocked']);
});

test('★ الشرح يعرض الأكبر أثرًا · ولا يعرض عاملًا بصفر', () => {
  const v = priorityOf({}, { ...base, dueAt: '2026-08-17T06:00:00Z', lines: 60 });
  const text = explain(v);
  assert.match(text, /قرب المهلة/);
  assert.doesNotMatch(text, /حجم العمل/, 'وقد كان صفرًا');
});

test('قائمةٌ فارغة لا تُسقط الترتيب', () => {
  assert.deepEqual(rankTasks(null, NOW), []);
});

/* ═══ الإطلاق وإعادة التعيين ‹EXE-303› ═══ */

test('★★ لا تُطلق مرّتين فتصير مهمّتين', () => {
  const v = releaseVerdict({ releaseState: RELEASE_STATE.RELEASED }, {}, { crewId: 'c1' });
  assert.equal(v.ok, false);
  assert.match(v.problem, /مُطلقةٌ سلفًا/);
});

test('★ مهمّةٌ بلا منفّذٍ لا تصل أحدًا', () => {
  assert.match(releaseVerdict({}, {}, {}).problem, /اختر المنفّذ/);
});

test('★★ المؤجَّلة تُطلَق **وهي مُعلَنة** — المشرف قد يعلم أنّ الرصيد في الطريق', () => {
  const v = releaseVerdict({}, { blocked: true, reason: 'لا رصيد' }, { crewId: 'c1' });
  assert.equal(v.ok, true, 'لا تُمنع');
  assert.match(v.warning, /تُطلَق وهي مؤجَّلة/, 'لكنّه يُطلقها عالِمًا');
});

test('المهمّة السليمة تُطلَق بلا تحذير', () => {
  const v = releaseVerdict({}, { blocked: false }, { crewId: 'c1' });
  assert.deepEqual({ ok: v.ok, warning: v.warning }, { ok: true, warning: '' });
});

test('★★ سبب إعادة التعيين مطلوب — بلاه يظلم التقريرُ من سُحبت منه', () => {
  // بلا سببٍ يظهر الأوّل أنّه بدأ ولم يُنهِ، ولا يُعرف أنّ المشرف سحبها لأعجل.
  assert.match(reassignVerdict({ assigneeUid: 'a' }, { toUid: 'b' }).problem, /سبب إعادة التعيين مطلوب/);
  assert.equal(reassignVerdict({ assigneeUid: 'a' }, { toUid: 'b', reason: 'شحنة أعجل' }).ok, true);
});

test('إعادةُ تعيينٍ لنفس المنفّذ ليست تغييرًا', () => {
  assert.match(reassignVerdict({ assigneeUid: 'a' }, { toUid: 'a', reason: 'x' }).problem, /المنفّذ نفسه/);
});
