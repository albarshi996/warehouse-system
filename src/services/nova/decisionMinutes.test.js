import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDecisionMinutes } from './decisionMinutes.js';
import { createDecisionSession, updateDecision } from '../executiveReview/decisionSession.js';
import { decisionPoints } from '../../data/nova-meeting.js';

const points = [{ title: 'موعد جرد بنغازي' }, { title: 'موعد جرد طرابلس' }];

test('المحضر يحمل كل بندٍ برقمه وحالته — والمعلّق يبقى معلنًا', () => {
  const session = updateDecision(createDecisionSession(points.length), 0, { status: 'approved' });
  const text = buildDecisionMinutes({ heading: 'محضر قرارات', points, session });

  assert.match(text, /1\. موعد جرد بنغازي — معتمد/);
  assert.match(text, /2\. موعد جرد طرابلس — لم يُحسم/);
  assert.match(text, /المحسوم: 1 من 2/);
});

test('المسؤول والموعد والملاحظة تدخل السطر عند تعبئتها فقط', () => {
  let session = createDecisionSession(points.length);
  session = updateDecision(session, 0, { status: 'conditional', owner: ' أ. رمزي ', due: '2026-09-01', note: ' بشرط وقف الحركة ' });
  // [0] العنوان · [1] فراغ · [2] البند الأول · [3] البند الثاني
  const [, , first, second] = buildDecisionMinutes({ heading: 'ح', points, session }).split('\n');

  assert.equal(first, '1. موعد جرد بنغازي — معتمد بشروط · المسؤول: أ. رمزي · الموعد: 2026-09-01 · ملاحظة: بشرط وقف الحركة');
  assert.equal(second, '2. موعد جرد طرابلس — لم يُحسم');
});

test('جلسةٌ تالفة أو ناقصة لا تُسقط المحضر', () => {
  const text = buildDecisionMinutes({ heading: 'ح', points, session: { decisions: [{ status: 'مجهول' }] } });

  assert.match(text, /1\. موعد جرد بنغازي — لم يُحسم/);
  assert.match(text, /2\. موعد جرد طرابلس — لم يُحسم/);
  assert.match(text, /المحسوم: 0 من 2/);
});

test('المحضر الكامل لاجتماع نوفا: سطرٌ لكل بندٍ من العشرة', () => {
  const session = createDecisionSession(decisionPoints.length);
  const lines = buildDecisionMinutes({ heading: 'محضر قرارات نوفا', points: decisionPoints, session }).split('\n');

  // عنوان + فراغ + عشرة بنود + فراغ + خلاصة
  assert.equal(lines.length, 14);
  assert.equal(lines[0], 'محضر قرارات نوفا');
  assert.equal(lines[12], '');
  assert.equal(lines[13], 'المحسوم: 0 من 10');
});
