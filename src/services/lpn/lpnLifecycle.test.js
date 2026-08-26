/**
 * اختبارات دورة حالات الطبلية — المصفوفة التي تمنع «حمولة تُصرف قبل أن تُعتمد».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LPN_TERMINAL_STATES,
  contentChangeProblem,
  isAvailable,
  ISSUE_BLOCKING_FLAGS,
  LPN_FLAGS,
  LPN_STATES,
  LPN_TRANSITIONS,
  activeFlags,
  applyFlag,
  applyTransition,
  clearFlag,
  flagProblem,
  initialStateProblem,
  isBlockedForIssue,
  stateLabel,
  transitionProblem,
  transitionVerdict,
  unitTransitionProblem,
} from './lpnLifecycle.js';

const CTX = { actor: 'محمد', at: '2026-08-26T10:00:00Z' };

test('دورة الاستلام تمرّ كاملة خطوةً خطوة — نصّ خطة ٧ حرفيًّا', () => {
  const chain = ['DRAFT', 'SCANNING', 'PENDING_GOVERNANCE', 'APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED'];
  let unit = { state: chain[0], flags: [] };
  for (const next of chain.slice(1)) {
    const r = applyTransition(unit, next, CTX);
    assert.equal(r.problem, undefined, `الانتقال ${unit.state} ← ${next} مشروع`);
    unit = r.unit;
  }
  assert.equal(unit.state, 'STORED');
  assert.equal(unit.stateChangedBy, 'محمد', 'كلّ انتقالٍ يحمل فاعله');
});

test('دورة الصرف تمرّ كاملة — من المخزَّنة إلى المصروفة', () => {
  const chain = ['STORED', 'RESERVED', 'PICKING', 'ISSUE_CLOSED', 'STAGED', 'LOADING', 'LOADED', 'ISSUED'];
  let unit = { state: chain[0], flags: [] };
  for (const next of chain.slice(1)) {
    const r = applyTransition(unit, next, CTX);
    assert.equal(r.problem, undefined, `الانتقال ${unit.state} ← ${next} مشروع`);
    unit = r.unit;
  }
  assert.equal(unit.state, 'ISSUED');
});

test('★★ القفزة خارج المصفوفة ترفض برسالةٍ تسمّي الحالة والمسموح — لا كلمة «خطأ»', () => {
  const p = transitionProblem('SCANNING', 'STORED');
  assert.match(p, /قيد القراءة/, 'تسمّي أين تقف');
  assert.match(p, /بانتظار الحوكمة/, 'وتسمّي المسموح');
  assert.doesNotMatch(p, /خطأ/);
});

test('★★ القفزة الاستثنائية تمرّ بسببٍ مكتوب فقط — لا تُمنع صمتًا ولا تمرّ صمتًا', () => {
  assert.match(transitionProblem('SCANNING', 'STORED', { override: true }), /سببًا مكتوبًا/);
  assert.equal(transitionProblem('SCANNING', 'STORED', { override: true, overrideNote: 'قرار المشرف: طبلية عيّنة معرض' }), '');
  const r = applyTransition({ state: 'SCANNING', flags: [] }, 'STORED', { ...CTX, override: true, overrideNote: 'قرار المشرف' });
  assert.equal(r.unit.lastOverride.note, 'قرار المشرف', 'القفزة تُقيَّد بسببها في السجلّ');
});

test('الحوكمة تُرجع للتصحيح والحجز يُفكّ — الرجوعان المقصودان يمرّان', () => {
  assert.equal(transitionProblem('PENDING_GOVERNANCE', 'SCANNING'), '');
  assert.equal(transitionProblem('RESERVED', 'STORED'), '');
});

test('🔒 بعد «مصروفة» لا انتقال — الهويّة لا يُعاد استخدامها أبدًا', () => {
  for (const next of Object.keys(LPN_STATES)) {
    if (next === 'ISSUED') continue;
    assert.match(transitionProblem('ISSUED', next), /لا يُعاد استخدامها/, `ISSUED ← ${next} ممنوع`);
  }
  assert.equal(LPN_TRANSITIONS.ISSUED.length, 0);
});

test('★★ الوسم لا يمحو موضع الدورة: تحت الفحص وهي بانتظار التخزين تبقى بانتظار التخزين', () => {
  const flagged = applyFlag({ state: 'PENDING_PUTAWAY', flags: [] }, 'INSPECTION', { reason: 'تلف ظاهر بالغلاف', actor: 'أحمد' });
  assert.equal(flagged.unit.state, 'PENDING_PUTAWAY', 'الحالة لا تُداس بالوسم');
  const cleared = clearFlag(flagged.unit, 'INSPECTION', { decision: 'الفحص سليم — الغلاف فقط', actor: 'لجنة الحوكمة' });
  assert.equal(cleared.unit.state, 'PENDING_PUTAWAY', 'تُكمل من حيث وقفت لا من أوّل الدورة');
  assert.deepEqual(activeFlags(cleared.unit), []);
});

test('الوسم يدخل بسببٍ إلزاميّ ويُرفع بقرارٍ مكتوب — والمكرّر يرفض', () => {
  assert.match(flagProblem({ flags: [] }, 'DAMAGED', { actor: 'أحمد' }), /سببًا مكتوبًا/);
  assert.match(flagProblem({ flags: [] }, 'DAMAGED', { reason: 'سقطت', actor: '' }), /بلا فاعل/);
  assert.match(flagProblem({ flags: ['DAMAGED'] }, 'DAMAGED', { reason: 'سقطت ثانيةً', actor: 'أحمد' }), /لا يُكرَّر/);
  assert.match(clearFlag({ flags: ['DAMAGED'] }, 'DAMAGED', { actor: 'أحمد' }).problem, /قرارُ حوكمة/);
});

test('🔒 الوسم الحاجب يمنع دورة الصرف كلّها — و«تحت الجرد» لا يحجب العمل', () => {
  const held = { state: 'STORED', flags: ['ON_HOLD'] };
  assert.ok(isBlockedForIssue(held));
  const p = unitTransitionProblem(held, 'PICKING');
  assert.match(p, /موقوفة/, 'الرسالة تسمّي الوسم');
  assert.match(p, /قرار حوكمة/, 'وتسمّي المخرج');

  const counted = { state: 'STORED', flags: ['UNDER_COUNT'] };
  assert.ok(!isBlockedForIssue(counted), 'الجرد يلتقط والعمل يمضي — ق-٣');
  assert.equal(unitTransitionProblem(counted, 'PICKING'), '');
  assert.ok(!ISSUE_BLOCKING_FLAGS.includes('UNDER_COUNT'));
});

test('الانتقال بلا فاعلٍ لا يُسجَّل — والحكم للشاشة بنمط {ok, message}', () => {
  assert.match(applyTransition({ state: 'DRAFT', flags: [] }, 'SCANNING', {}).problem, /فاعل/);
  assert.deepEqual(transitionVerdict({ state: 'DRAFT', flags: [] }, 'SCANNING'), { ok: true, message: '' });
  assert.equal(transitionVerdict({ state: 'DRAFT', flags: [] }, 'STORED').ok, false);
});

test('الميلاد «قيد الإنشاء» استلامًا أو «قيد التحضير» صرفًا — وغيرهما يرفض', () => {
  assert.equal(initialStateProblem('DRAFT'), '');
  assert.equal(initialStateProblem('PICKING'), '');
  assert.match(initialStateProblem('STORED'), /لا تولد/);
});

test('applyTransition يعيد نسخةً جديدة ولا يعدّل الأصل — عرف الدوال الخالصة', () => {
  const original = { state: 'DRAFT', flags: [] };
  applyTransition(original, 'SCANNING', CTX);
  assert.equal(original.state, 'DRAFT');
});

test('كلّ حالةٍ في المصفوفة معرّفة وكلّ وجهةٍ فيها معرّفة — لا انتقال إلى مجهول', () => {
  for (const [from, targets] of Object.entries(LPN_TRANSITIONS)) {
    assert.ok(from in LPN_STATES, `«${from}» معرّفة`);
    for (const to of targets) assert.ok(to in LPN_STATES, `«${to}» معرّفة`);
  }
  assert.equal(stateLabel('SCANNING'), 'قيد القراءة');
  assert.equal(Object.keys(LPN_FLAGS).length, 9, 'أوسمة خطة ٧ الثمانية + الفحص');
});

// ═══ ما كشفته المراجعة العدائية 2026-08-26 ═══

test('★★ حارس مسّ الحمولة: الموسومة حاجبًا لا تُقسَّم ولا يُسحب منها — والوسم لا يُغسل', () => {
  assert.equal(contentChangeProblem({ state: 'STORED', flags: [] }), '');

  const damaged = { state: 'STORED', flags: ['DAMAGED'] };
  const p = contentChangeProblem(damaged);
  assert.match(p, /تالفة/, 'الرسالة تسمّي الوسم');
  assert.match(p, /لا تُقسَّم ولا تُدمَج/, 'وتسمّي الممنوع');
  assert.match(contentChangeProblem(damaged, { override: true }), /سببًا مكتوبًا/);
  assert.equal(contentChangeProblem(damaged, { override: true, overrideNote: 'فرز التالف بقرار الحوكمة' }), '');
});

test('★★ الحمولة الختاميّة لا تُمسّ: مصروفةٌ أو ملغاةٌ تُصحَّح بحركةٍ عكسيةٍ لا بتعديل حمولتها', () => {
  for (const state of LPN_TERMINAL_STATES) {
    const p = contentChangeProblem({ state, flags: [] });
    assert.match(p, /دورتها انتهت/, `«${state}» لا تُمسّ`);
    assert.match(p, /حركةٍ عكسيةٍ معتمدة/, 'وتقول الصواب');
    assert.equal(contentChangeProblem({ state, flags: [] }, { override: true, overrideNote: 'أيًّا كان' }), p, 'ولا تُفتح بـoverride');
  }
});

test('★ «متاحة» مشتقّة لا مخزَّنة: مخزَّنةٌ بلا وسمٍ حاجب', () => {
  assert.ok(isAvailable({ state: 'STORED', flags: [] }));
  assert.ok(isAvailable({ state: 'STORED', flags: ['UNDER_COUNT'] }), 'الجرد لا يحجب');
  assert.ok(!isAvailable({ state: 'STORED', flags: ['ON_HOLD'] }));
  assert.ok(!isAvailable({ state: 'PICKING', flags: [] }), 'قيد التحضير ليست متاحة');
});

test('★ «ملغاة» ختاميّةٌ تسدّ وعد «الإلغاء حالةٌ لا محو» — ولا انتقال بعدها', () => {
  assert.equal(LPN_STATES.CANCELLED, 'ملغاة');
  assert.deepEqual(LPN_TRANSITIONS.CANCELLED, []);
  assert.match(transitionProblem('CANCELLED', 'STORED'), /لا يُعاد استخدامها/);
  // تُبلَغ بقرارٍ استثنائيٍّ مقيَّد — لا بانتقالٍ عاديّ.
  assert.match(transitionProblem('STORED', 'CANCELLED'), /صلاحية استثنائية/);
  assert.equal(transitionProblem('STORED', 'CANCELLED', { override: true, overrideNote: 'أُنشئت خطأً — قرار الحوكمة' }), '');
});

test('🔒 فحوص العضوية بـhasOwn لا in: سجلٌّ فاسد باسم «toString» يُردّ برسالةٍ لا بانهيار', () => {
  assert.match(transitionProblem('toString', 'STORED'), /غير معروفة/);
  assert.match(transitionProblem('STORED', 'constructor'), /غير معروفة/);
  assert.deepEqual(activeFlags({ flags: ['toString', 'DAMAGED'] }), ['DAMAGED'], 'الفاسد يُسقَط ولا يُقرأ وسمًا');
  assert.match(flagProblem({ flags: [] }, 'constructor', { reason: 'س', actor: 'أ' }), /غير معروف/);
});
