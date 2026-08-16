/**
 * اختبارات سجلّ الأسباب ‹EXE-203› — الجمع بالإحالة لا بالنسخ، والسبب مقيَّد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OTHER,
  REASONS,
  REASON_CONTEXTS,
  blamesWorker,
  reasonLabel,
  reasonProblem,
  reasonReport,
  reasonsFor,
} from './reasonCodes.js';
import { SKIP_REASONS } from '../field/visitModel.js';

test('★★ أسباب الزيارة إحالةٌ إلى القائمة القائمة لا نسخةٌ منها', () => {
  // نسخةٌ ثانية كانت ستفترق أوّل إضافةٍ في إحداهما.
  assert.equal(REASONS.visit_skip.length, SKIP_REASONS.length);
  assert.deepEqual(REASONS.visit_skip.map((r) => r.label), SKIP_REASONS);
});

test('★ لكلّ سياقٍ قائمةٌ — والسياقات مغطّاة كلّها', () => {
  for (const ctx of Object.keys(REASON_CONTEXTS)) {
    assert.ok(reasonsFor(ctx).length > 0, `السياق «${ctx}» بلا أسباب`);
  }
  assert.deepEqual(reasonsFor('طيران'), [], 'وسياقٌ مجهول قائمةٌ فارغة لا انهيار');
});

test('★★ السبب مقيَّد — النصّ الحرّ لا يُجمَع منه تقرير', () => {
  const v = reasonProblem('pick_short', { id: 'نقص شوي' });
  assert.equal(v.ok, false);
  assert.match(v.problem, /اختر سببًا من القائمة/);
});

test('★★ «سببٌ آخر» يُلزم ببيان — وإلّا كان بابًا للهروب من التصنيف', () => {
  assert.equal(reasonProblem('pick_short', { id: OTHER }).ok, false);
  assert.equal(reasonProblem('pick_short', { id: OTHER, note: 'الرفّ انهار' }).ok, true);
  assert.equal(reasonProblem('pick_short', { id: 'not_found' }).ok, true, 'والسبب المصنَّف لا يحتاج بيانًا');
});

test('★★ ما هو خارج إرادة المنفّذ لا يُحمَّل عليه', () => {
  // نصّ تطوير.md: المعيار أداة اكتشافِ مشكلةٍ لا حكمٌ آليّ على الموظف.
  for (const id of ['device', 'equipment', 'congestion', 'labels', 'qc_wait']) {
    assert.equal(blamesWorker('task_delay', id), false, id);
  }
  assert.equal(blamesWorker('receipt_variance', 'count_error'), true, 'وخطأ العدّ يُحمَّل');
});

test('★ السبب المجهول لا يُحمَّل — الشكّ لصالح المنفّذ', () => {
  assert.equal(blamesWorker('task_delay', 'لا يوجد'), false);
});

test('التسمية تُقرأ من السجلّ لا تُكتب في الشاشة', () => {
  assert.equal(reasonLabel('qc_reject', 'no_label'), 'غياب ملصق البراند');
  assert.equal(reasonLabel('qc_reject', 'مجهول'), '');
});

/* ── التقرير الذي لم يكن له مكانٌ يُسأل فيه ────────────────────── */

const entries = [
  { context: 'pick_short', reasonId: 'not_found', qty: 12 },
  { context: 'pick_short', reasonId: 'not_found', qty: 8 },
  { context: 'pick_short', reasonId: 'damaged', qty: 3 },
  { context: 'receipt_variance', reasonId: 'count_error', qty: 5 },
];

test('★★ «لماذا نقصت الكمّيّات» يُجاب من مصدرٍ واحد', () => {
  const r = reasonReport(entries);
  assert.equal(r.total, 28);
  assert.equal(r.rows[0].reasonId, 'not_found', 'الأكبر أثرًا أوّلًا');
  assert.equal(r.rows[0].qty, 20);
  assert.equal(r.rows[0].count, 2);
  assert.equal(r.rows[0].label, 'الصنف غير موجود في الموقع');
});

test('★ ما هو خارج الإرادة يُفرَز — الرقم الذي يوجّه الإدارة لا الذي يعاقب', () => {
  const r = reasonReport(entries);
  assert.equal(r.outOfControl, 23, 'الخمسة الوحيدة المحمَّلة هي خطأ العدّ');
});

test('الحصر بسياقٍ يعمل · والسبب المجهول لا يدخل التقرير', () => {
  assert.equal(reasonReport(entries, 'receipt_variance').total, 5);
  assert.equal(reasonReport([{ context: 'pick_short', reasonId: 'مجهول', qty: 99 }]).total, 0);
});

test('مدخلٌ فارغ لا يُسقط التقرير', () => {
  assert.deepEqual(reasonReport(null), { rows: [], total: 0, outOfControl: 0 });
});
