/**
 * آلة الحالات — الحالتان الجديدتان وحالة التنفيذ المحسوبة (SAP-4 · يسدّ ف‑١٤).
 *
 * حارسٌ لثلاثة مبادئ لا يجوز أن تُكسر بعد ستّة أشهر:
 *   1. **«مغلق» ≠ «ملغى»** — §11.2 ‹272› يمنع المساواة بينهما نصًّا.
 *   2. **لا إلغاء بعد الإنجاز** — المنجَز رحّل حركاتٍ في دفترٍ ملحق-فقط،
 *      فقلبُ حالته يترك أثرًا بلا مستندٍ يبرّره. التصحيح بمستندٍ عكسيّ.
 *   3. **حالة التنفيذ تُحسب ولا تُخزَّن** — المخزَّن يتقادم ويتعارض.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  EXECUTION_STATUS,
  isTerminal,
  canDeriveFrom,
  isLegalTransition,
  availableTransitions,
  executionStatus,
  hasOpenWork,
  getState,
  isEditable,
} from './states.js';

/* ═══════════ 1. الحالتان الجديدتان ═══════════ */

test('الحالات سبعٌ الآن — وفيها «مغلق» و«ملغى»', () => {
  assert.equal(Object.keys(STATES).length, 7);
  assert.equal(STATES.closed.label, 'مغلق');
  assert.equal(STATES.canceled.label, 'ملغى');
  // ولكلٍّ تلميحٌ يشرح الفرق للموظّف — لا اسمٌ مجرّد.
  assert.ok(STATES.closed.hint);
  assert.ok(STATES.canceled.hint);
});

test('★★ «مغلق» و«ملغى» لا يتساويان — §11.2 ‹272›', () => {
  assert.notEqual(STATES.closed.id, STATES.canceled.id);
  assert.notEqual(STATES.closed.label, STATES.canceled.label);
  assert.deepEqual(TERMINAL_STATES.slice().sort(), ['canceled', 'closed']);
  assert.equal(isTerminal('closed'), true);
  assert.equal(isTerminal('canceled'), true);
  assert.equal(isTerminal('done'), false, 'المنجَز يبقى مصدرًا للاشتقاق حتى يُغلق');
});

test('★★ لا إيموجي في الحالات — §3-٧ ‹46›', () => {
  const serialized = JSON.stringify(STATES);
  assert.doesNotMatch(serialized, /[\u{1F300}-\u{1FAFF}]/u, 'إيموجي في جدول الحالات');
  assert.doesNotMatch(serialized, /[\u{2600}-\u{27BF}]/u, 'رمزٌ تصويريّ في جدول الحالات');
  for (const s of Object.values(STATES)) {
    assert.equal(s.emoji, undefined, `${s.id}: حقل emoji يجب أن يزول`);
    assert.ok(s.icon, `${s.id}: بلا أيقونة خطّيّة`);
  }
});

/* ═══════════ 2. النقلات ═══════════ */

test('★★ لا إلغاء بعد الإنجاز — التصحيح بمستندٍ عكسيّ لا بقلب حالة', () => {
  assert.equal(isLegalTransition('done', 'canceled'), false);
  assert.equal(isLegalTransition('done', 'closed'), true, 'الإغلاق وحده متاحٌ بعد الإنجاز');
  // ولا رجوع من المنتهيتين إطلاقًا.
  assert.deepEqual(TRANSITIONS.closed, []);
  assert.deepEqual(TRANSITIONS.canceled, []);
  for (const to of ['draft', 'submitted', 'approved', 'done']) {
    assert.equal(isLegalTransition('closed', to), false, `مغلق → ${to} يجب أن يُمنع`);
    assert.equal(isLegalTransition('canceled', to), false, `ملغى → ${to} يجب أن يُمنع`);
  }
});

test('الإلغاء متاحٌ قبل الترحيل فقط — والترحيل عند الإنجاز حصرًا', () => {
  for (const from of ['draft', 'rejected', 'approved']) {
    assert.equal(isLegalTransition(from, 'canceled'), true, `${from} → ملغى يجب أن يُتاح`);
  }
});

test('★★ ولا إلغاء من «مُرسَل» — ما خرج للمراجعة لا يُسحب من تحت المراجع', () => {
  // مخرج الخطأ موجودٌ أصلًا: يرفضه المراجع فيعود «مرفوضًا»، فيُلغيه صاحبه.
  // وإتاحته هنا كانت سلطةً جديدة لا مصدر لها (§3-٩ ‹48›).
  assert.equal(isLegalTransition('submitted', 'canceled'), false);
  const schema = { roles: { approve: ['qc_inspector'], complete: ['warehouse_manager'] } };
  const doc = { state: 'submitted', createdByUid: 'u1' };
  assert.deepEqual(availableTransitions(doc, { role: 'storekeeper', uid: 'u1' }, schema), []);
  assert.deepEqual(
    availableTransitions(doc, { role: 'qc_inspector', uid: 'u9' }, schema).map((t) => t.to).sort(),
    ['approved', 'rejected']
  );
});

test('★ الإلغاء والإغلاق كلاهما يلزمه سببٌ مكتوب', () => {
  for (const [from, list] of Object.entries(TRANSITIONS)) {
    for (const t of list) {
      if (t.to === 'canceled' || t.to === 'closed') {
        assert.equal(t.needsNote, true, `${from} → ${t.to} بلا سببٍ مُلزِم`);
      }
    }
  }
});

test('الصلاحية محفوظة: الإغلاق لمن يملك الإنهاء، والإلغاء لمن يملك النقلة', () => {
  const schema = { roles: { approve: ['warehouse_manager'], complete: ['warehouse_manager'] } };
  const clerk = { role: 'clerk', uid: 'u1' };
  const doc = { state: 'done', createdByUid: 'u1' };
  assert.deepEqual(availableTransitions(doc, clerk, schema), [], 'الموظّف لا يُغلق');
  const manager = { role: 'warehouse_manager', uid: 'u2' };
  assert.deepEqual(availableTransitions(doc, manager, schema).map((t) => t.to), ['closed']);
  // الأدمن يملك كلّ شيء.
  assert.equal(availableTransitions(doc, { role: 'admin', uid: 'x' }, schema).length, 1);
});

test('المنتهيتان غير قابلتين للتعديل، وتُعرفان بمعرّفهما', () => {
  assert.equal(isEditable('closed'), false);
  assert.equal(isEditable('canceled'), false);
  assert.equal(getState('closed').id, 'closed');
  assert.equal(getState('لا-وجود-لها').id, 'draft', 'المجهول يسقط إلى المسودّة');
});

/* ═══════════ 3. الاشتقاق ═══════════ */

test('★★ لا اشتقاق من مغلقٍ ولا ملغى — وهذا ما يجعل «المؤهّل» مؤهّلًا', () => {
  assert.equal(canDeriveFrom('approved'), true);
  assert.equal(canDeriveFrom('done'), true);
  for (const s of ['draft', 'submitted', 'rejected', 'closed', 'canceled']) {
    assert.equal(canDeriveFrom(s), false, `${s}: يجب ألّا يُشتقّ منه`);
  }
});

/* ═══════════ 4. حالة التنفيذ المحسوبة ═══════════ */

test('★★ المثال الحاكم: 100 مطلوبًا و60 منفَّذًا ⇒ منفَّذ جزئيًّا و40 مفتوحًا', () => {
  const s = executionStatus('done', { capacity: 100, executed: 60 });
  assert.equal(s.id, EXECUTION_STATUS.partial.id);
  assert.equal(s.open, 40);
  assert.equal(s.ratio, 0.6);
});

test('لا تنفيذ ⇒ مفتوح · واكتمال ⇒ مكتمل', () => {
  assert.equal(executionStatus('done', { capacity: 100, executed: 0 }).id, 'open');
  assert.equal(executionStatus('done', { capacity: 100, executed: 100 }).id, 'fulfilled');
  assert.equal(executionStatus('done', { capacity: 0, executed: 0 }).id, 'none');
  assert.equal(executionStatus('done', null).id, 'none');
});

test('★★ الحالة المخزَّنة تحكم أوّلًا — والمغلق مغلقٌ ولو بقيت كمّيّة', () => {
  // مثال المالك: طُلب 100 ووصل 95 وأُغلق الباقي.
  const closed = executionStatus('closed', { capacity: 100, executed: 95 });
  assert.equal(closed.id, 'closed');
  assert.equal(closed.label, 'مغلق قبل الاكتمال');
  assert.equal(closed.open, 5, 'الرقم يبقى مرئيًّا للتاريخ — لكنّه لم يعد مطلوبًا');

  // ومغلقٌ اكتمل فعلًا يُعرض مكتملًا لا «مغلقًا قبل الاكتمال».
  assert.equal(executionStatus('closed', { capacity: 100, executed: 100 }).id, 'fulfilled');

  const canceled = executionStatus('canceled', { capacity: 100, executed: 0 });
  assert.equal(canceled.id, 'none');
  assert.match(canceled.label, /ملغى/);
});

test('★ الأرقام الفاسدة لا تُنتج كمّيّةً سالبة ولا NaN', () => {
  for (const bad of [{ capacity: -5, executed: 10 }, { capacity: 'س', executed: null }, {}, { capacity: 10, executed: 99 }]) {
    const s = executionStatus('done', bad);
    assert.ok(s.open >= 0, `كمّيّة مفتوحة سالبة من ${JSON.stringify(bad)}`);
    assert.ok(Number.isFinite(s.ratio) && s.ratio <= 1);
  }
});

/* ═══════════ 5. صندوق العمل اليوميّ ═══════════ */

test('★★ المغلق والملغى يخرجان من «المستندات المفتوحة» — وهذا معنى الإغلاق', () => {
  assert.equal(hasOpenWork('done', { capacity: 100, executed: 60 }), true);
  assert.equal(hasOpenWork('closed', { capacity: 100, executed: 60 }), false, 'المغلق يخرج ولو بقي رقم');
  assert.equal(hasOpenWork('canceled', { capacity: 100, executed: 0 }), false);
  assert.equal(hasOpenWork('done', { capacity: 100, executed: 100 }), false, 'المكتمل لا عملَ فيه');
  // وما لم يُعتمد بعد ليس «عملًا مفتوحًا» بل عملًا لم يبدأ.
  assert.equal(hasOpenWork('draft', { capacity: 100, executed: 0 }), false);
  assert.equal(hasOpenWork('submitted', { capacity: 100, executed: 0 }), false);
});
