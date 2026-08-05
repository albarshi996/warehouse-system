/**
 * اختبارات منطق التسكين الخالص — الشاغل الحاليّ = أحدث تسكين نشط.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { activeAssignmentsByJob, withLiveHolders } from './assignmentsModel.js';

test('activeAssignmentsByJob: يأخذ الأحدث النشط لكل وظيفة', () => {
  const a = [
    { id: '1', jobId: 'J01', personName: 'أ', active: true, startedAt: { seconds: 100 } },
    { id: '2', jobId: 'J01', personName: 'ب', active: true, startedAt: { seconds: 200 } },
    { id: '3', jobId: 'J02', personName: 'ج', active: true, startedAt: { seconds: 150 } },
  ];
  const m = activeAssignmentsByJob(a);
  assert.equal(m.get('J01').personName, 'ب', 'الأحدث يفوز');
  assert.equal(m.get('J02').personName, 'ج');
});

test('activeAssignmentsByJob: يتجاهل المنتهية (active:false) ولو كانت أحدث', () => {
  const a = [
    { id: '1', jobId: 'J01', personName: 'أ', active: false, startedAt: { seconds: 300 } },
    { id: '2', jobId: 'J01', personName: 'ب', active: true, startedAt: { seconds: 200 } },
  ];
  assert.equal(activeAssignmentsByJob(a).get('J01').personName, 'ب');
});

test('activeAssignmentsByJob: مدخل فارغ/بلا jobId يُتجاهل بأمان', () => {
  assert.equal(activeAssignmentsByJob(null).size, 0);
  assert.equal(activeAssignmentsByJob([{ personName: 'x' }]).size, 0);
});

test('withLiveHolders: يدمج الشاغل الحيّ ويضبط الإشغال دون لمس المدخل', () => {
  const jobs = [
    { id: 'J01', title: 'دور', occupied: false, holder: '' },
    { id: 'J02', title: 'ثانٍ', occupied: true, holder: 'قديم' },
  ];
  const assignments = [
    { id: 'a1', jobId: 'J01', personName: 'سالم', active: true, startedAt: { seconds: 100 }, candidateId: 'c1' },
  ];
  const out = withLiveHolders(jobs, assignments);
  assert.equal(out[0].holder, 'سالم');
  assert.equal(out[0].occupied, true);
  assert.equal(out[0].candidateId, 'c1');
  assert.equal(out[0].assignmentId, 'a1');
  assert.equal(out[1].holder, 'قديم', 'الوظيفة بلا تسكين حيّ تُبقي قيمة المصدر');
  assert.equal(jobs[0].holder, '', 'المدخل الأصليّ لم يُعدَّل');
});

test('withLiveHolders: بلا تسكينات يعيد الوظائف كما هي', () => {
  const jobs = [{ id: 'J01', occupied: true, holder: 'ح' }];
  assert.equal(withLiveHolders(jobs, [])[0].holder, 'ح');
  assert.equal(withLiveHolders(jobs, null)[0].holder, 'ح');
});
