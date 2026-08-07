import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDecisionSession,
  normalizeDecisionSession,
  summarizeDecisionSession,
  updateDecision,
} from './decisionSession.js';

test('ينشئ جلسة بعدد القرارات وكلها معلقة', () => {
  const session = createDecisionSession(3);
  assert.equal(session.decisions.length, 3);
  assert.deepEqual(summarizeDecisionSession(session), {
    pending: 3, approved: 0, conditional: 0, deferred: 0, review: 0,
    total: 3, resolved: 0, remaining: 3,
  });
});
test('يحدّث قرارًا واحدًا دون المساس ببقية القرارات', () => {
  const original = createDecisionSession(2);
  const updated = updateDecision(original, 1, { status: 'approved', owner: 'تقنية المعلومات' });
  assert.equal(original.decisions[1].status, 'pending');
  assert.equal(updated.decisions[0].status, 'pending');
  assert.equal(updated.decisions[1].status, 'approved');
  assert.equal(updated.decisions[1].owner, 'تقنية المعلومات');
  assert.ok(updated.updatedAt);
});

test('ينظف الجلسة المخزنة ويطابقها مع العدد الحالي', () => {
  const normalized = normalizeDecisionSession({
    updatedAt: '2026-08-07T10:00:00.000Z',
    decisions: [{ status: 'unknown', note: 5 }, { status: 'deferred', note: 'لاحقًا' }],
  }, 3);
  assert.equal(normalized.decisions[0].status, 'pending');
  assert.equal(normalized.decisions[0].note, '');
  assert.equal(normalized.decisions[1].status, 'deferred');
  assert.equal(normalized.decisions[2].status, 'pending');
});
