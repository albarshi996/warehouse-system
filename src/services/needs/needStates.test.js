/**
 * اختبارات آلة حالات «احتياجات الموقع» — منطقٌ خالصٌ يُفحص في Node العاري.
 *
 * يُثبت بالنقض: لا قفزَ من «جديد» إلى «منجَز»، والحالتان الختاميّتان نهائيّتان،
 * والاعتماد للمديرَين وحدهما، والتنفيذ لهما ولأمين المخزن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEED_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  INITIAL_STATE,
  NEED_CATEGORIES,
  isLegalTransition,
  canDo,
  canTransition,
  availableTransitions,
  canCreateNeed,
  canReviewNeeds,
  getNeedState,
  isTerminal,
} from './needStates.js';

test('الحالات الخمس بالترتيب، والابتدائيّة «جديد»', () => {
  assert.deepEqual(Object.keys(NEED_STATES), ['new', 'approved', 'in_progress', 'done', 'rejected']);
  assert.equal(INITIAL_STATE, 'new');
});

test('الدورة الرسميّة: جديد→معتمَد→قيد التنفيذ→منجَز، وجديد→مرفوض', () => {
  assert.ok(isLegalTransition('new', 'approved'));
  assert.ok(isLegalTransition('new', 'rejected'));
  assert.ok(isLegalTransition('approved', 'in_progress'));
  assert.ok(isLegalTransition('in_progress', 'done'));
});

test('★ لا قفز: «جديد»→«منجَز» ممنوعٌ، ولا «جديد»→«قيد التنفيذ» مباشرةً', () => {
  assert.equal(isLegalTransition('new', 'done'), false);
  assert.equal(isLegalTransition('new', 'in_progress'), false);
  assert.equal(isLegalTransition('approved', 'done'), false);
});

test('★ الحالتان الختاميّتان نهائيّتان: لا نقلةَ بعد «منجَز» ولا «مرفوض»', () => {
  assert.deepEqual(TRANSITIONS.done, []);
  assert.deepEqual(TRANSITIONS.rejected, []);
  assert.ok(isTerminal('done'));
  assert.ok(isTerminal('rejected'));
  assert.equal(isTerminal('approved'), false);
  assert.deepEqual(TERMINAL_STATES, ['done', 'rejected']);
});

test('كلّ نقلةٍ تشير إلى حالةٍ معرَّفة', () => {
  for (const [from, list] of Object.entries(TRANSITIONS)) {
    assert.ok(NEED_STATES[from], `حالةُ المصدر «${from}» معرَّفة`);
    for (const t of list) assert.ok(NEED_STATES[t.to], `حالةُ الهدف «${t.to}» معرَّفة`);
  }
});

test('الاعتماد والرفض للمديرَين وحدهما — أمين المخزن لا يعتمد', () => {
  assert.ok(canTransition('new', 'approved', 'warehouse_manager'));
  assert.ok(canTransition('new', 'approved', 'admin'));
  assert.equal(canTransition('new', 'approved', 'storekeeper'), false);
  assert.equal(canTransition('new', 'rejected', 'storekeeper'), false);
  // ودورٌ خارج المنظومة لا يعتمد قطعًا:
  assert.equal(canTransition('new', 'approved', 'viewer'), false);
});

test('التنفيذ (البدء والإنهاء) للمديرَين ولأمين المخزن', () => {
  assert.ok(canTransition('approved', 'in_progress', 'storekeeper'));
  assert.ok(canTransition('in_progress', 'done', 'storekeeper'));
  assert.ok(canTransition('approved', 'in_progress', 'warehouse_manager'));
  assert.equal(canTransition('approved', 'in_progress', 'viewer'), false);
});

test('الأدمن يملك كلَّ نقلةٍ مشروعة', () => {
  assert.ok(canDo(TRANSITIONS.new[0], 'admin'));
  assert.ok(canDo(TRANSITIONS.new[1], 'admin'));
  assert.ok(canTransition('approved', 'in_progress', 'admin'));
  // لكنّ الأدمن لا يصنع نقلةً غيرَ مشروعة:
  assert.equal(canTransition('new', 'done', 'admin'), false);
});

test('availableTransitions يُرجع ما يملكه الدور فقط', () => {
  const mgr = availableTransitions('new', 'warehouse_manager').map((t) => t.to);
  assert.deepEqual(mgr.sort(), ['approved', 'rejected']);
  // أمين المخزن لا يرى أيّ إجراءٍ على «جديد» (لا يعتمد):
  assert.deepEqual(availableTransitions('new', 'storekeeper'), []);
  // لكنّه يرى «بدء التنفيذ» على «معتمَد»:
  assert.deepEqual(availableTransitions('approved', 'storekeeper').map((t) => t.to), ['in_progress']);
  // ولا إجراءَ على حالةٍ ختاميّة لأحد:
  assert.deepEqual(availableTransitions('done', 'admin'), []);
});

test('الرفض يُلزِم بسببٍ مكتوب (needsNote)', () => {
  const reject = TRANSITIONS.new.find((t) => t.to === 'rejected');
  assert.equal(reject.needsNote, true);
});

test('canCreateNeed: المديران وأمين المخزن يسجّلون، والمشاهد لا', () => {
  assert.ok(canCreateNeed('admin'));
  assert.ok(canCreateNeed('warehouse_manager'));
  assert.ok(canCreateNeed('storekeeper'));
  assert.equal(canCreateNeed('viewer'), false);
  assert.equal(canCreateNeed(undefined), false);
});

test('canReviewNeeds: المديران يراجعان لا أمين المخزن', () => {
  assert.ok(canReviewNeeds('admin'));
  assert.ok(canReviewNeeds('warehouse_manager'));
  assert.equal(canReviewNeeds('storekeeper'), false);
});

test('getNeedState يسقط على الابتدائيّة عند معرّفٍ مجهول', () => {
  assert.equal(getNeedState('new').id, 'new');
  assert.equal(getNeedState('لا-وجود-له').id, INITIAL_STATE);
});

test('فئات الاحتياج الخمس معرَّفة', () => {
  assert.deepEqual(Object.keys(NEED_CATEGORIES), ['spare_parts', 'packaging', 'tools', 'maintenance', 'other']);
});
