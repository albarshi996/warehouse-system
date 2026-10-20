/**
 * حارسُ محرّك القواعد المُهيَّأ — ‹WMS-601›.
 *
 * ★★★ وأهمُّ بندٍ فيه **حارسُ الانحراف**: الثوابتُ المُعادةُ بلا تهيئةٍ تُقارن
 * بثوابت المحرّكات **مفتاحًا مفتاحًا**. وهو نمطُ `itemShape` ↔ `excelSchema`
 * نفسُه الذي وُلد من خللٍ حقيقيّ: عقدان في موضعين يفترقان يومًا، **إلّا أن
 * يُقارنا باختبار**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RULE_SETS,
  RULE_SET_IDS,
  HISTORY_CAP,
  ruleSet,
  defaultsOf,
  validateWeights,
  resolveWeights,
  applyChange,
  resetScope,
  changeLog,
  tunedWarehouses,
  weightsView,
} from './rulesProfile.js';
import { WEIGHTS as PUTAWAY_WEIGHTS, scoreLocation } from '../locations/putawaySuggest.js';
import { WEIGHTS as PRIORITY_WEIGHTS, priorityOf } from '../tasks/priority.js';
import { WEIGHTS as ASSIGN_WEIGHTS, scoreWorker } from '../tasks/assignEngine.js';

const NOW = Date.UTC(2026, 9, 3);
const ACT = { actor: 'U1', actorName: 'محمد', at: NOW, reason: 'المستودعُ ضيّقٌ فالسعةُ أهمُّ من القرب' };

/* ══════════ ① حارسُ الانحراف ══════════ */

test('🚨 ثوابتُ كلّ مجموعةٍ هي ثوابتُ محرّكها نفسُها — مفتاحًا مفتاحًا', () => {
  const engines = { putaway: PUTAWAY_WEIGHTS, priority: PRIORITY_WEIGHTS, assign: ASSIGN_WEIGHTS };
  for (const [id, live] of Object.entries(engines)) {
    assert.deepEqual(
      defaultsOf(id),
      { ...live },
      `ثوابتُ «${id}» في التهيئة فارقت ثوابتَ محرّكها — نسخةٌ ثانيةٌ ستنحرف بترقية`
    );
  }
  assert.deepEqual(RULE_SET_IDS, ['putaway', 'priority', 'assign']);
});

test('ولكلّ مجموعةٍ تسميةٌ وإرشادٌ ومرجعُ محرّكها — فلا رقمٌ بلا مرجع', () => {
  for (const id of RULE_SET_IDS) {
    const set = ruleSet(id);
    assert.ok(set.labelAr && set.hint && set.engine, `مجموعةٌ ناقصةُ الوصف: ${id}`);
    assert.ok(Object.keys(set.defaults).length > 0);
  }
  assert.equal(ruleSet('مجهولة'), null);
  assert.equal(defaultsOf('مجهولة'), null);
});

test('★ والمُعادُ نسخةٌ قابلةٌ للتعديل لا الكائنُ المجمَّد — فمن عدّلها لا يُفسد المحرّك', () => {
  const copy = defaultsOf('priority');
  copy.due = 999;
  assert.equal(PRIORITY_WEIGHTS.due, 40, 'عُدِّل ثابتُ المحرّك من نسخةٍ — والمجمَّدُ تسرّب');
});

/* ══════════ ② غيابُ التهيئة = الثوابت حرفًا ══════════ */

test('★★★ بلا تهيئةٍ تُعاد الثوابتُ حرفًا — فلا سلوكَ يتغيّر بالترقية وحدها', () => {
  for (const id of RULE_SET_IDS) {
    const r = resolveWeights(id, null);
    assert.deepEqual(r.weights, defaultsOf(id), `انحرفت «${id}» بلا تهيئة`);
    assert.equal(r.source, 'default');
    assert.deepEqual(r.overrides, []);
    assert.equal(r.version, 0);
  }
  // وملفٌّ فارغٌ أو مشوَّهٌ كذلك.
  assert.deepEqual(resolveWeights('priority', {}).weights, defaultsOf('priority'));
  assert.deepEqual(resolveWeights('priority', { sets: {} }).weights, defaultsOf('priority'));
  assert.deepEqual(resolveWeights('priority', { sets: { priority: {} } }).weights, defaultsOf('priority'));
});

/* ══════════ ③ العامُّ أساسٌ والمستودعُ يدهَس جزئيًّا ══════════ */

test('★★★ المستودعُ يدهَس **جزئيًّا** — والباقي يُورَث، وإلّا لم تبلغه ترقيةٌ أبدًا', () => {
  const profile = {
    sets: {
      priority: {
        version: 3,
        global: { due: 50 },
        warehouses: { WH001: { age: 5 } },
      },
    },
  };
  const g = resolveWeights('priority', profile);
  assert.equal(g.weights.due, 50);
  assert.equal(g.weights.age, PRIORITY_WEIGHTS.age, 'لم يُورَث العامُّ');
  assert.equal(g.source, 'global');

  const wh = resolveWeights('priority', profile, { warehouse: 'wh001' });
  assert.equal(wh.weights.due, 50, 'تهيئةُ المستودع محت العامَّ بدل أن تدهسه جزئيًّا');
  assert.equal(wh.weights.age, 5);
  assert.equal(wh.weights.customer, PRIORITY_WEIGHTS.customer, 'مفتاحٌ لم يُبدَّل لم يُورَث من الثوابت');
  assert.equal(wh.source, 'warehouse');
  assert.deepEqual(wh.overrides.sort(), ['age', 'due']);
  assert.equal(wh.version, 3);
});

test('ومستودعٌ لا تهيئةَ له يأخذ العامَّ وحدَه', () => {
  const profile = { sets: { priority: { global: { due: 50 }, warehouses: { WH001: { age: 5 } } } } };
  const other = resolveWeights('priority', profile, { warehouse: 'WH002' });
  assert.equal(other.weights.due, 50);
  assert.equal(other.weights.age, PRIORITY_WEIGHTS.age);
  assert.equal(other.source, 'global');
});

/* ══════════ ④ المفتاحُ المجهولُ والقيمةُ الفاسدة ══════════ */

test('★★★ مفتاحٌ مجهولٌ يُرفض بسببه — و«distnce» بخطئها تُكتب فلا تعمل ولا رسالة', () => {
  const v = validateWeights('putaway', { distnce: -1 });
  assert.equal(v.ok, false);
  assert.ok(v.problems[0].includes('distnce'), v.problems[0]);
  assert.ok(v.problems[0].includes('المعرَّفة'), 'لم تُسمَّ المفاتيحُ الصحيحة');
  assert.deepEqual(v.clean, {});
});

test('وغيرُ الرقميّ والخارجُ عن المدى يُرفضان', () => {
  assert.equal(validateWeights('priority', { due: 'كثير' }).ok, false);
  assert.ok(validateWeights('priority', { due: 'كثير' }).problems[0].includes('ليس رقمًا'));
  assert.equal(validateWeights('priority', { due: 5000 }).ok, false);
  assert.ok(validateWeights('priority', { due: 5000 }).problems[0].includes('المدى'));
  assert.equal(validateWeights('priority', {}).ok, false);
  assert.ok(validateWeights('priority', {}).problems[0].includes('فارغة'));
  assert.equal(validateWeights('مجهولة', { x: 1 }).ok, false);
});

test('★★★ الإشارةُ تُقاس بأصلها — فقلبُها يعكس المعنى ولا يُشخَّص', () => {
  // `distance` سالبٌ بالتصميم: عقوبةٌ على البُعد.
  assert.equal(PUTAWAY_WEIGHTS.distance < 0, true);
  const flipped = validateWeights('putaway', { distance: 2 });
  assert.equal(flipped.ok, false, 'قُلبت العقوبةُ مكافأةً — فتُفضَّل الرفوفُ البعيدة');
  assert.ok(flipped.problems[0].includes('يُفضّل البعيد'), flipped.problems[0]);
  // والسالبُ المسموحُ يمرّ.
  assert.equal(validateWeights('putaway', { distance: -2 }).ok, true);

  // وموجبٌ بالتصميم لا يُقلب سالبًا.
  const neg = validateWeights('putaway', { emptyLocation: -5 });
  assert.equal(neg.ok, false);
  assert.ok(neg.problems[0].includes('اجعله صفرًا'), 'لم تُقل البديلُ الصحيح');
  assert.equal(validateWeights('putaway', { emptyLocation: 0 }).ok, true, 'التعطيلُ بصفرٍ مُنع');
});

test('★★★ تهيئةٌ تُصفّر كلَّ الأوزان تُرفض — محرّكٌ بلا وزنٍ يُرتّب عشوائيًّا', () => {
  const all = Object.fromEntries(Object.keys(PRIORITY_WEIGHTS).map((k) => [k, 0]));
  const v = validateWeights('priority', all);
  assert.equal(v.ok, false);
  assert.ok(v.problems[0].includes('عشوائيًّا'), v.problems[0]);
});

/* ══════════ ⑤ النسخةُ والتاريخُ وما كان قبله ══════════ */

test('★★★ كلُّ تعديلٍ بنسخةٍ ومن عدّل ومتى **وما كان قبله**', () => {
  const r1 = applyChange(null, { setId: 'priority', patch: { due: 50 }, ...ACT });
  assert.equal(r1.ok, true, r1.problem);
  assert.equal(r1.profile.sets.priority.version, 1);
  assert.equal(r1.entry.scope, 'GLOBAL');
  assert.deepEqual(r1.entry.before, {}, 'لم يُسجَّل ما كان قبله');
  assert.deepEqual(r1.entry.after, { due: 50 });
  assert.deepEqual(r1.entry.changed, ['due']);
  assert.equal(r1.entry.by, 'U1');
  assert.equal(r1.entry.byName, 'محمد');
  assert.equal(r1.entry.at, NOW);
  assert.ok(r1.entry.reason.includes('ضيّق'));

  const r2 = applyChange(r1.profile, { setId: 'priority', patch: { due: 60 }, ...ACT, reason: 'تبدّل الموسم' });
  assert.equal(r2.profile.sets.priority.version, 2);
  assert.deepEqual(r2.entry.before, { due: 50 }, 'السجلُّ يقول «بُدِّل» ولا يقول «من أيّ شيء»');
  assert.deepEqual(r2.entry.after, { due: 60 });
  assert.equal(changeLog(r2.profile, 'priority').length, 2);
  assert.equal(changeLog(r2.profile, 'priority')[0].version, 2, 'الأحدثُ ليس أوّلًا');
});

test('ونطاقُ المستودع لا يمسّ العامَّ ولا العكس', () => {
  const g = applyChange(null, { setId: 'priority', patch: { due: 50 }, ...ACT });
  const w = applyChange(g.profile, { setId: 'priority', warehouse: 'WH001', patch: { age: 5 }, ...ACT });
  assert.deepEqual(w.profile.sets.priority.global, { due: 50 }, 'تهيئةُ مستودعٍ مسّت العامَّ');
  assert.deepEqual(w.profile.sets.priority.warehouses.WH001, { age: 5 });
  assert.equal(w.entry.scope, 'WH001');
});

test('وتعديلٌ بلا فاعلٍ أو بلا سببٍ يُردّ — تهيئةٌ بلا صاحبٍ لا تُراجَع', () => {
  assert.equal(applyChange(null, { setId: 'priority', patch: { due: 50 }, reason: 'س' }).ok, false);
  assert.equal(applyChange(null, { setId: 'priority', patch: { due: 50 }, actor: 'U1' }).ok, false);
  assert.ok(applyChange(null, { setId: 'priority', patch: { due: 50 }, actor: 'U1' }).problem.includes('سببُ التعديل'));
  assert.equal(applyChange(null, { setId: 'مجهولة', patch: { x: 1 }, ...ACT }).ok, false);
  // ورقعةٌ فاسدةٌ لا تُكتب أصلًا.
  const bad = applyChange(null, { setId: 'priority', patch: { nope: 1 }, ...ACT });
  assert.equal(bad.ok, false);
  assert.equal(bad.profile, null, 'كُتب ملفٌّ من رقعةٍ فاسدة');
  assert.ok(bad.problems.length > 0);
});

test('وسجلُّ التعديلات محدودُ السقف — الأحدثُ يبقى', () => {
  let profile = null;
  for (let i = 0; i < HISTORY_CAP + 5; i += 1) {
    profile = applyChange(profile, { setId: 'priority', patch: { due: 30 + (i % 10) }, ...ACT }).profile;
  }
  assert.equal(changeLog(profile, 'priority').length, HISTORY_CAP);
  assert.equal(profile.sets.priority.version, HISTORY_CAP + 5);
});

/* ══════════ ⑥ الإعادةُ حذفُ تجاوزٍ لا كتابةُ أصفار ══════════ */

test('★★★ الإعادةُ تحذف التجاوزَ ولا تكتب الثوابتَ قيمةً — وإلّا لم تبلغه ترقيةٌ أبدًا', () => {
  const w = applyChange(null, { setId: 'priority', warehouse: 'WH001', patch: { due: 50 }, ...ACT }).profile;
  const r = resetScope(w, { setId: 'priority', warehouse: 'WH001', ...ACT, reason: 'عاد المستودعُ لطبيعته' });
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.profile.sets.priority.warehouses.WH001, undefined, 'بقي المفتاحُ — فالثوابتُ مجمَّدةٌ على المستودع');
  assert.deepEqual(resolveWeights('priority', r.profile, { warehouse: 'WH001' }).weights, defaultsOf('priority'));
  assert.equal(r.entry.reset, true);
  assert.deepEqual(r.entry.before, { due: 50 });
  assert.deepEqual(r.entry.after, {});
});

test('وإعادةُ نطاقٍ بلا تجاوزٍ تُردّ بسببها، وبلا فاعلٍ أو سببٍ تُردّ', () => {
  assert.ok(resetScope(null, { setId: 'priority', ...ACT }).problem.includes('لا تجاوزَ'));
  const w = applyChange(null, { setId: 'priority', patch: { due: 50 }, ...ACT }).profile;
  assert.equal(resetScope(w, { setId: 'priority', actor: 'U1' }).ok, false);
  assert.equal(resetScope(w, { setId: 'priority', reason: 'س' }).ok, false);
  assert.equal(resetScope(w, { setId: 'مجهولة', ...ACT }).ok, false);
});

/* ══════════ ⑦ المخزَّنُ الفاسدُ يُتخطّى ولا يُسقط التهيئة ══════════ */

test('★★★ مفتاحٌ قديمٌ في المخزَّن يُتخطّى بصمتٍ — ولا يُسقط التهيئةَ كلَّها', () => {
  const profile = {
    sets: { priority: { global: { due: 50, وزنٌ_أُسقط_بترقية: 9, age: 'ليس رقمًا' } } },
  };
  const r = resolveWeights('priority', profile);
  assert.equal(r.weights.due, 50, 'أُسقطت التهيئةُ كلُّها لمفتاحٍ واحدٍ قديم');
  assert.equal(r.weights.age, PRIORITY_WEIGHTS.age);
  assert.deepEqual(r.overrides, ['due']);
});

/* ══════════ ⑧ المحرّكاتُ الثلاثةُ تقرأ الأوزان فعلًا ══════════ */

test('★★★ التسكينُ يقرأ الوزنَ المُهيَّأ — ولا منطقٌ بلا مستدعٍ', () => {
  const location = { code: 'RH-A-R-01-01', warehouse: 'RH', status: 'active', capacity: {} };
  const line = { sku: 'ITM-1', qty: 5 };
  const before = scoreLocation(location, { line, balances: [] });
  const after = scoreLocation(location, { line, balances: [], weights: { emptyLocation: 90 } });
  assert.ok(after.score > before.score, 'الوزنُ المُهيَّأُ لم يُقرأ — فالتهيئةُ حبرٌ على شاشة');
  assert.equal(after.score - before.score, 90 - PUTAWAY_WEIGHTS.emptyLocation);
  // وبلا وسيطٍ الحكمُ كما كان حرفًا.
  assert.equal(scoreLocation(location, { line, balances: [] }).score, before.score);
});

test('★★★ والأولويّةُ تقرأه', () => {
  const ctx = { nowMs: NOW, importance: 'high', lines: 1 };
  const before = priorityOf({}, ctx);
  const after = priorityOf({}, { ...ctx, weights: { customer: 60 } });
  assert.ok(after.score > before.score, 'وزنُ الأولويّةِ المُهيَّأُ لم يُقرأ');
  assert.equal(after.factors.find((f) => f.id === 'customer').weight, 60);
});

test('★★★ والإسنادُ يقرأه', () => {
  const w = { uid: 'U1', name: 'أحمد', portalRole: 'picking_unit', zone: 'RH-A', openTasks: 0 };
  const args = { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW };
  const before = scoreWorker(w, args);
  const after = scoreWorker(w, { ...args, weights: { zone: 50 } });
  assert.ok(after.score > before.score, 'وزنُ الإسنادِ المُهيَّأُ لم يُقرأ');
  assert.equal(after.factors.find((f) => f.id === 'zone').weight, 50);
});

/* ══════════ ⑨ اللقطةُ للعرض ══════════ */

test('لقطةُ العرض تقول القيمةَ وأصلَها وهل بُدِّلت', () => {
  const profile = applyChange(null, { setId: 'priority', patch: { due: 50 }, ...ACT }).profile;
  const view = weightsView('priority', profile);
  const due = view.rows.find((r) => r.key === 'due');
  assert.equal(due.value, 50);
  assert.equal(due.original, PRIORITY_WEIGHTS.due);
  assert.equal(due.overridden, true);
  assert.equal(view.rows.find((r) => r.key === 'age').overridden, false);
  assert.equal(view.rows.length, Object.keys(PRIORITY_WEIGHTS).length);
});

test('★★ والمجموعُ يُقال ولا يُفرض — فالمنعُ يُوقف عملًا والمالكُ قد يقصد مقياسًا آخر', () => {
  const profile = applyChange(null, { setId: 'priority', patch: { due: 50 }, ...ACT }).profile;
  const view = weightsView('priority', profile);
  assert.equal(view.sum, 110);
  assert.ok(view.sumNote.includes('110') && view.sumNote.includes('100'), view.sumNote);
  // وعلى العقد: لا ملاحظة.
  assert.equal(weightsView('priority', null).sumNote, '');
  // ومجموعةٌ بلا عقدِ مجموعٍ لا تُنبّه أبدًا.
  assert.equal(weightsView('putaway', null).sumNote, '');
  assert.equal(weightsView('مجهولة', null), null);
});

test('والمستودعاتُ المُهيَّأةُ تُسمّى — فلا تُكتشَف بالمفاجأة', () => {
  let p = applyChange(null, { setId: 'priority', warehouse: 'WH001', patch: { due: 50 }, ...ACT }).profile;
  p = applyChange(p, { setId: 'priority', warehouse: 'WH002', patch: { age: 5 }, ...ACT }).profile;
  assert.deepEqual(tunedWarehouses(p, 'priority').sort(), ['WH001', 'WH002']);
  assert.deepEqual(tunedWarehouses(null, 'priority'), []);
  // ومستودعٌ أُعيد لا يُسمّى.
  const r = resetScope(p, { setId: 'priority', warehouse: 'WH001', ...ACT }).profile;
  assert.deepEqual(tunedWarehouses(r, 'priority'), ['WH002']);
});

test('ومجموعاتُ القواعدِ مجمَّدةٌ فلا تُعدَّل في الذاكرة', () => {
  assert.ok(Object.isFrozen(RULE_SETS));
  assert.ok(Object.isFrozen(RULE_SET_IDS));
});
