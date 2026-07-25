/**
 * اختبارات منطق مركز الدراسات — تشمل تشغيل الحارسَين على ملفَي البيانات
 * الحقيقيين: أي انكسار في بنية المكتبة أو الدراسة يُسقط الحزمة هنا
 * قبل أن يصل الموقع الحي.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companiesVerdict,
  studyVerdict,
  gapsBySeverity,
  riskMatrix,
  recsByHorizon,
  kpiGroups,
  questionsByDepartment,
  practiceCounts,
  maturityAverage,
  executiveSummary,
  GAP_SEVERITIES,
  REC_HORIZONS,
} from './studiesModel.js';

const companies = JSON.parse(
  readFileSync(new URL('../../data/global-doc-cycles.json', import.meta.url), 'utf8')
);
const study = JSON.parse(
  readFileSync(new URL('../../data/comparative-study.json', import.meta.url), 'utf8')
);

/* ---------- حارس مكتبة الشركات ---------- */

test('🔒 ملف الشركات الثمانية الحقيقي يجتاز الحارس بلا حواجب', () => {
  const v = companiesVerdict(companies);
  assert.equal(v.ok, true, v.blockers.join(' · '));
  assert.equal(companies.companies.length, 8);
});

test('شركة بلا مثلث إدارات تُحجب', () => {
  const broken = structuredClone(companies);
  broken.companies[0].triangle = '';
  const v = companiesVerdict(broken);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('triangle')));
});

test('العدد المعلن لا يطابق الفعلي = حاجب', () => {
  const broken = structuredClone(companies);
  broken.meta.companiesCount = 5;
  assert.equal(companiesVerdict(broken).ok, false);
});

test('معرّف مكرر يُحجب — الشركة تُعرَّف مرة واحدة', () => {
  const broken = structuredClone(companies);
  broken.companies[1].id = broken.companies[0].id;
  const v = companiesVerdict(broken);
  assert.ok(v.blockers.some((b) => b.includes('مكرر')));
});

/* ---------- 🔒 حارس الدراسة على الملف الحقيقي ---------- */

test('🔒 الدراسة المقارنة الحقيقية تجتاز الحارس بلا حواجب', () => {
  const v = studyVerdict(study);
  assert.equal(v.ok, true, v.blockers.join(' · '));
});

test('كل فجوة في الدراسة الحقيقية تحمل دليلًا وشركةً مرجعية', () => {
  for (const g of study.gaps) {
    assert.ok(g.ourEvidence.trim().length > 0, `فجوة ${g.id} بلا دليل`);
    assert.ok(g.worldCompanies.length >= 1, `فجوة ${g.id} بلا شركة`);
  }
});

test('كل توصية في الدراسة الحقيقية تربط فجوات موجودة فعلًا', () => {
  const ids = new Set(study.gaps.map((g) => g.id));
  for (const r of study.recommendations) {
    for (const gid of r.linkedGapIds) {
      assert.ok(ids.has(gid), `توصية ${r.id} تربط فجوة وهمية: ${gid}`);
    }
  }
});

/* ---------- حواجب الدراسة على بيانات معطوبة ---------- */

test('فجوة بلا دليل من نظامنا تُحجب — لا ادّعاء بلا إسناد', () => {
  const broken = structuredClone(study);
  broken.gaps[0].ourEvidence = '  ';
  const v = studyVerdict(broken);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بلا دليل')));
});

test('توصية تربط فجوة غير موجودة تُحجب', () => {
  const broken = structuredClone(study);
  broken.recommendations[0].linkedGapIds = ['gap-does-not-exist'];
  const v = studyVerdict(broken);
  assert.ok(v.blockers.some((b) => b.includes('غير موجودة')));
});

test('مؤشر بلا صيغة حسابية يُحجب', () => {
  const broken = structuredClone(study);
  broken.kpis[0].formula = '';
  assert.equal(studyVerdict(broken).ok, false);
});

test('درجة نضج خارج المدى تُحجب', () => {
  const broken = structuredClone(study);
  broken.scores.dimensions[0].score = 7;
  assert.equal(studyVerdict(broken).ok, false);
});

test('فجوة حرجة بلا توصية تغطيها = تنبيه لا حاجب', () => {
  const broken = structuredClone(study);
  broken.gaps.push({
    ...structuredClone(broken.gaps[0]),
    id: 'gap-orphan-critical',
    title: 'فجوة يتيمة للاختبار',
    severity: 'حرجة',
  });
  const v = studyVerdict(broken);
  assert.equal(v.ok, true, v.blockers.join(' · '));
  assert.ok(v.warnings.some((w) => w.includes('يتيمة') || w.includes('لا تغطيها')));
});

/* ---------- المشتقات ---------- */

test('مصفوفة المخاطر تصنّف بالنطاقات الصحيحة وترتّب تنازليًّا', () => {
  const banded = riskMatrix([
    { id: 'a', probability: 5, impact: 5, },
    { id: 'b', probability: 4, impact: 4 },
    { id: 'c', probability: 2, impact: 4 },
    { id: 'd', probability: 1, impact: 3 },
  ]);
  assert.deepEqual(banded['مرتفع'].map((r) => r.id), ['a', 'b']);
  assert.deepEqual(banded['متوسط'].map((r) => r.id), ['c']);
  assert.deepEqual(banded['منخفض'].map((r) => r.id), ['d']);
  assert.equal(banded['مرتفع'][0].score, 25);
});

test('التوصيات تتوزع على الآفاق الثلاثة والتحويلي يتقدم', () => {
  const cols = recsByHorizon([
    { id: 'r1', horizon: 'مكسب سريع', impact: 'متوسط' },
    { id: 'r2', horizon: 'مكسب سريع', impact: 'تحويلي' },
    { id: 'r3', horizon: 'استراتيجي', impact: 'مرتفع' },
  ]);
  assert.deepEqual(cols.map((c) => c.horizon), REC_HORIZONS);
  assert.deepEqual(cols[0].recommendations.map((r) => r.id), ['r2', 'r1']);
  assert.equal(cols[1].recommendations.length, 0);
});

test('تجميع الفجوات يتبع ترتيب الخطورة المعتمد', () => {
  const grouped = gapsBySeverity(study.gaps);
  const order = grouped.map((g) => g.severity);
  const expected = GAP_SEVERITIES.filter((s) => order.includes(s));
  assert.deepEqual(order, expected);
});

test('مجموعات المؤشرات تحفظ ترتيب الظهور وتعدّ القابل للقياس', () => {
  const groups = kpiGroups([
    { id: 'k1', group: 'أ', measurableToday: true },
    { id: 'k2', group: 'ب', measurableToday: false },
    { id: 'k3', group: 'أ', measurableToday: false },
  ]);
  assert.deepEqual(groups.map((g) => g.group), ['أ', 'ب']);
  assert.equal(groups[0].measurableNow, 1);
});

test('أسئلة الاجتماعات تتجمع بإداراتها', () => {
  const grouped = questionsByDepartment(study.questions);
  assert.ok(grouped.length >= 5, `إدارات قليلة: ${grouped.length}`);
  for (const g of grouped) assert.ok(g.questions.length >= 1);
});

test('الملخص التنفيذي يُحسب من الدراسة لا يُكتب يدويًّا', () => {
  const s = executiveSummary(study);
  assert.equal(s.gapsTotal, study.gaps.length);
  assert.equal(s.recsTotal, study.recommendations.length);
  assert.ok(s.maturity >= 0 && s.maturity <= 5);
  const counts = practiceCounts(study.practices);
  assert.equal(
    counts['مطبَّق'] + counts['جزئي'] + counts['غائب'],
    study.practices.length,
    'كل ممارسة تُحسب في حالة واحدة'
  );
});

test('متوسط النضج يقرَّب لمنزلة واحدة و0 عند الغياب', () => {
  assert.equal(maturityAverage({ dimensions: [{ score: 3 }, { score: 4 }] }), 3.5);
  assert.equal(maturityAverage({ dimensions: [] }), 0);
  assert.equal(maturityAverage(undefined), 0);
});
