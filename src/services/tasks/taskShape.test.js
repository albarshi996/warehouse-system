/**
 * اختبارات لغة المهمّة — الحمولة الميدانيّة ‹EXE-101› والحالات القائمة.
 *
 * الحارس الأوّل هنا: **المهمّة الإداريّة القائمة لا تنكسر.** إضافةُ الميدان
 * توسعةٌ لا استبدال — ومهمّةٌ بلا `workType` تبقى صالحةً كما كانت أمس.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TASK_STATUS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  WORK_TYPES,
  WORK_ENDPOINTS,
  canAssigneeMove,
  canManagerMove,
  dueMillis,
  isWorkTask,
  lineGaps,
  shapeWorkLine,
  shapeWorkPayload,
  unpolicedWorkTypes,
  workPayloadProblems,
  workProgress,
} from './taskShape.js';
import { ORDER_TYPES, lineProgress } from '../labor/laborModel.js';

const line = (over = {}) => ({ sku: 'WNW-001', batch: 'B12', qtyRequired: 30, qtyDone: 0, ...over });
const payload = (over = {}) => ({
  workType: 'pick',
  docRef: { type: 'PICK', number: 'PICK-2026-0001', id: 'x1' },
  lines: [line({ fromBin: 'MAIN-A01-R01-B01' })],
  ...over,
});

/* ── لا انكسار للقائم ──────────────────────────────────────────── */

test('★★ المهمّة الإداريّة القائمة تبقى صالحةً — الميدان توسعةٌ لا استبدال', () => {
  const admin = { title: 'راجع عقد المورّد', assigneeUid: 'u1', priority: 'high', dueDate: '2026-08-20' };
  assert.equal(isWorkTask(admin), false);
  assert.equal(dueMillis(admin.dueDate, ''), Date.parse('2026-08-20T23:59:00'));
  assert.equal(canAssigneeMove(TASK_STATUS.ASSIGNED, TASK_STATUS.DONE), true);
  assert.equal(canAssigneeMove(TASK_STATUS.DONE, TASK_STATUS.ASSIGNED), false, 'المُسنَد إليه لا يرجع للخلف');
  assert.equal(canManagerMove(TASK_STATUS.DONE, TASK_STATUS.ASSIGNED), true, 'المدير يملك المسار كلّه');
});

test('★★ الحالات والأولويّات لم تتغيّر — قواعد Firestore تكرّرها نصًّا', () => {
  assert.deepEqual(Object.values(TASK_STATUS), ['assigned', 'acknowledged', 'in_progress', 'done', 'canceled']);
  assert.deepEqual(STATUS_ORDER, ['assigned', 'acknowledged', 'in_progress', 'done']);
  assert.deepEqual(Object.keys(PRIORITY_LABELS), ['high', 'med', 'low']);
});

/* ── مصدرٌ واحد لأنواع العمل ───────────────────────────────────── */

test('★★ أنواع العمل إحالةٌ إلى `ORDER_TYPES` لا قائمةٌ ثانية', () => {
  assert.equal(WORK_TYPES, ORDER_TYPES, 'المرجع نفسه لا نسخةٌ منه');
});

test('★★ كلّ نوعٍ في `ORDER_TYPES` له قرارُ أطرافٍ — ونوعٌ جديد يُعلَن ولا يُبتلع', () => {
  assert.deepEqual(unpolicedWorkTypes(), [], 'نوعٌ بلا سياسة أطراف: أضِف قراره في WORK_ENDPOINTS');
  assert.equal(WORK_ENDPOINTS.putaway.to, true, 'التخزين وجهتُه هي القرار');
  assert.equal(WORK_ENDPOINTS.pick.from, true, 'السحب مصدرُه هو القرار');
  assert.deepEqual(WORK_ENDPOINTS.transfer, { from: true, to: true }, 'النقل طرفاه معًا');
});

/* ── الحمولة والتسوية ─────────────────────────────────────────── */

test('التسوية تُوحّد الكتابة: أكوادٌ كبيرة وكمّيّاتٌ غير سالبة', () => {
  const l = shapeWorkLine({ sku: ' wnw-001 ', batch: 'b12', fromBin: 'main a01', qtyRequired: -5, qtyDone: '7' });
  assert.equal(l.sku, 'WNW-001');
  assert.equal(l.batch, 'B12');
  assert.equal(l.fromBin, 'MAIN A01');
  assert.equal(l.qtyRequired, 0, 'الكمّيّة السالبة تُقصّ لا تُقبل');
  assert.equal(l.qtyDone, 7, 'النصّ الرقميّ يُقرأ');
});

test('نوع عملٍ مجهول لا يُحفظ نصًّا حرًّا', () => {
  assert.equal(shapeWorkPayload({ workType: 'طيران' }).workType, '');
});

/* ── ما يمنع وما يُعلَن ────────────────────────────────────────── */

test('★★ لا حركة بلا مستند — المهمّة الميدانيّة تحتاج مرجعها', () => {
  const problems = workPayloadProblems(payload({ docRef: {} }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /لا حركة بلا مستند/);
});

test('مهمّةٌ بلا بنودٍ أو بكمّيّاتٍ صفر لا تُنفَّذ ولا تُقاس', () => {
  assert.match(workPayloadProblems(payload({ lines: [] }))[0], /لا بنودَ/);
  assert.match(workPayloadProblems(payload({ lines: [line({ qtyRequired: 0 })] }))[0], /صفر/);
});

test('★★ الفراغ في الموقع يُعلَن ولا يمنع — وإلّا توقّفت الدورة القائمة', () => {
  // مستندات اليوم كلّها بلا مواقع؛ مهمّةٌ تُرفض لفراغ خانةٍ توقف المخزن.
  const p = payload({ lines: [line({ fromBin: '' })] });
  assert.deepEqual(workPayloadProblems(p), [], 'لا يمنع');
  const gaps = lineGaps(p.lines[0], 'pick');
  assert.equal(gaps.length, 1);
  assert.match(gaps[0], /موقع المصدر مفتوح/, 'ويُعلَن');
});

test('الطرف غير المطلوب لا يُشتكى منه', () => {
  assert.deepEqual(lineGaps({ sku: 'A', toBin: 'MAIN-A01' }, 'putaway'), [], 'التخزين لا يحتاج مصدرًا');
  assert.deepEqual(lineGaps({ sku: 'A', fromBin: 'MAIN-A01' }, 'pick'), [], 'السحب لا يحتاج وجهة');
});

test('صنفٌ بلا كودٍ ولا باركود يُعلَن — والباركود وحده يكفي', () => {
  assert.match(lineGaps({ toBin: 'X' }, 'putaway')[0], /الصنف غير معرَّف/);
  assert.deepEqual(lineGaps({ barcode: '629...', toBin: 'X' }, 'putaway'), []);
});

/* ── التقدّم بالإحالة لا بالنسخ ───────────────────────────────── */

test('★★ الكمّيّات الثلاث تُقرأ من `lineProgress` — لا حاسبَ ثانٍ', () => {
  const l = shapeWorkLine(line({ qtyRequired: 30, qtyDone: 12 }));
  assert.deepEqual(lineProgress(l), { required: 30, done: 12, remaining: 18, state: 'partial' });
});

test('★★ المتبقّي لا يُخزَّن — يُحسب عند القراءة فلا يفترق عن طرفيه', () => {
  const l = shapeWorkLine({ ...line(), remaining: 999 });
  assert.equal('remaining' in l, false, 'حقلٌ محفوظٌ للمتبقّي يصير حقيقةً ثالثة');
});

test('تقدّم المهمّة يجمع البنود ويحمل الفجوات المعلَنة', () => {
  const p = workProgress(
    payload({
      lines: [
        line({ fromBin: 'MAIN-A01-R01-B01', qtyDone: 30 }),
        line({ sku: 'WNW-002', fromBin: '', qtyRequired: 20, qtyDone: 5 }),
      ],
    })
  );
  assert.equal(p.totalRequired, 50);
  assert.equal(p.totalDone, 35);
  assert.equal(p.remaining, 15);
  assert.equal(p.complete, false, 'الإنجاز الجزئيّ لا يُغلق المهمّة');
  assert.equal(p.openEndpoints, 1, 'سطرٌ واحد بموقعٍ مفتوح');
  assert.equal(p.gaps[0].line, 1);
});

test('الحمولة تُقرأ تحت `work` أو في الجذر — فلا ينكسر مستهلكٌ بأيّ الشكلين', () => {
  const nested = { work: payload() };
  assert.equal(isWorkTask(nested), true);
  assert.equal(workProgress(nested).totalRequired, 30);
  assert.equal(workProgress(payload()).totalRequired, 30);
});

test('المهمّة الإداريّة لا تُنتج تقدّمًا كاذبًا', () => {
  const p = workProgress({ title: 'مهمّة إداريّة' });
  assert.equal(p.lines, 0);
  assert.equal(p.complete, false, 'صفرُ بنودٍ ليس اكتمالًا');
});
