/**
 * اختبارات مصدر الأدوار الحيّ — القرار ق‑٣: الحيّ أوّلًا، ثمّ الكتالوج fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JOBS } from './jobsCatalog.js';
import { resolveJobs, findJob, sortedJobOptions } from './jobsResolver.js';

const ORG = JSON.parse(readFileSync(new URL('../../data/org-structure.json', import.meta.url), 'utf8'));

test('بلا وثيقة سحابية (null/undefined/فارغة): يسقط للكتالوج المولَّد', () => {
  assert.equal(resolveJobs(null), JOBS);
  assert.equal(resolveJobs(undefined), JOBS);
  assert.equal(resolveJobs({}), JOBS);
  assert.equal(resolveJobs({ jobs: [] }), JOBS, 'مصفوفة فارغة = لا مصدر حيّ');
});

test('مع وثيقة سحابية: يقرأ الأدوار الحيّة مطبَّعةً (لا مرجع الكتالوج)', () => {
  const jobs = resolveJobs({ jobs: ORG.jobs });
  assert.equal(jobs.length, ORG.jobs.length);
  assert.notEqual(jobs, JOBS);
  const j = jobs[0];
  assert.equal(typeof j.occupied, 'boolean');
  assert.ok('requirements' in j);
  assert.ok(Array.isArray(j.duties));
});

test('التطبيع يضمن الحقول حتى لو نقصت في المصدر الحيّ', () => {
  const jobs = resolveJobs({ jobs: [{ id: 'JX', title: 'دور تجريبي' }] });
  const j = jobs[0];
  assert.equal(j.icon, '');
  assert.equal(j.occupied, false);
  assert.equal(j.requirements, null);
  assert.deepEqual(j.duties, []);
  assert.equal(j.orgId, '');
  assert.equal(j.reportingTo, '');
});

test('findJob يجد بالمعرّف ويعيد null للمفقود أو القائمة الفارغة', () => {
  assert.equal(findJob(JOBS, 'J01')?.id, 'J01');
  assert.equal(findJob(JOBS, 'لا-يوجد'), null);
  assert.equal(findJob(null, 'J01'), null);
});

test('sortedJobOptions: الشاغرة أوّلًا دون تعديل المدخل', () => {
  const input = [
    { id: 'a', occupied: true },
    { id: 'b', occupied: false },
    { id: 'c', occupied: true },
  ];
  const out = sortedJobOptions(input);
  assert.equal(out[0].id, 'b', 'الشاغرة تتقدّم');
  assert.equal(input[0].id, 'a', 'المدخل الأصليّ لم يُعدَّل');
  assert.equal(sortedJobOptions(null).length, 0);
});
