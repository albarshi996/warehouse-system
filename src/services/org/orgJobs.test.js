/**
 * اختبارات CRUD بطاقات الأدوار الخالصة — تحرير الأدوار من الواجهة سحابيًّا (أ‑٤/ق‑٣).
 * دوالٌّ لا تُعدّل المدخل، كسائر عمليات الهيكل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { addJob, updateJob, removeJob, nextJobId } from './orgModel.js';

test('addJob يضيف دورًا جديدًا بمعرّف فريد دون لمس المدخل', () => {
  const jobs = [{ id: 'J01', title: 'أ' }];
  const out = addJob(jobs, { id: 'J02', title: 'ب', orgId: 'x' });
  assert.equal(out.length, 2);
  assert.equal(out[1].id, 'J02');
  assert.deepEqual(out[1].duties, [], 'قيمة افتراضيّة للمهام');
  assert.equal(out[1].occupied, false);
  assert.equal(jobs.length, 1, 'المدخل الأصليّ لم يُعدَّل');
});

test('addJob يرفض المعرّف المكرّر أو الناقص أو بلا مسمّى', () => {
  assert.throws(() => addJob([{ id: 'J01', title: 'أ' }], { id: 'J01', title: 'ب' }), /مستخدم/);
  assert.throws(() => addJob([], { title: 'بلا معرّف' }), /معرّف/);
  assert.throws(() => addJob([], { id: 'J09' }), /مسمّى/);
});

test('updateJob يعدّل بالمعرّف دون لمس غيره ولا المدخل', () => {
  const jobs = [{ id: 'J01', title: 'أ' }, { id: 'J02', title: 'ب' }];
  const out = updateJob(jobs, 'J02', { title: 'ب-معدّل', occupied: true });
  assert.equal(out[1].title, 'ب-معدّل');
  assert.equal(out[1].occupied, true);
  assert.equal(out[0].title, 'أ');
  assert.equal(jobs[1].title, 'ب', 'المدخل الأصليّ لم يُعدَّل');
});

test('removeJob يحذف بالمعرّف', () => {
  const out = removeJob([{ id: 'J01' }, { id: 'J02' }], 'J01');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'J02');
});

test('nextJobId يعطي أعلى رقم + 1 بنمط Jxx', () => {
  assert.equal(nextJobId([{ id: 'J01' }, { id: 'J36' }, { id: 'J07' }]), 'J37');
  assert.equal(nextJobId([]), 'J01');
  assert.equal(nextJobId([{ id: 'support-x' }]), 'J01', 'يتجاهل المعرّفات غير المرقّمة');
});
