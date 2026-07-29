/**
 * اختبارات منطق الهيكل التشغيليّ المستهدف — تشمل تشغيل حارس `tomVerdict` على
 * ملفَي البيانات الحقيقيين (الدراسة المقارنة + الهيكل المستهدف): أيّ انكسارٍ في
 * روابط التصميم أو نقصٍ في الموجات يُسقط الحزمة هنا قبل أن يصل الموقع الحيّ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tomVerdict,
  maturityBand,
  maturitySnapshot,
  designMatrix,
  foundationPillars,
  transformationWaves,
  tomExecutiveSummary,
} from './tomModel.js';
import { REC_HORIZONS } from '../studies/studiesModel.js';

const study = JSON.parse(
  readFileSync(new URL('../../data/comparative-study.json', import.meta.url), 'utf8')
);
const tom = JSON.parse(
  readFileSync(new URL('../../data/target-operating-model.json', import.meta.url), 'utf8')
);

/* ---------- الحارس على البيانات الحقيقية ---------- */

test('🔒 ملف الهيكل المستهدف الحقيقيّ يجتاز الحارس بلا حواجب', () => {
  const v = tomVerdict(tom, study);
  assert.equal(v.ok, true, v.blockers.join(' · '));
});

test('🔒 كل فجوات الدراسة مغطّاة بأبعاد التصميم — لا تنبيه تغطية', () => {
  const v = tomVerdict(tom, study);
  assert.deepEqual(v.warnings, [], v.warnings.join(' · '));
});

test('كل توصيات الدراسة تجد أفقًا في الموجات', () => {
  const waveHorizons = tom.waves.map((w) => w.horizon);
  for (const r of study.recommendations) {
    assert.ok(waveHorizons.includes(r.horizon), `توصية ${r.id} بأفق ${r.horizon} بلا موجة`);
  }
});

test('الموجات تغطّي الآفاق الثلاثة المعتمدة بلا تكرار', () => {
  const horizons = tom.waves.map((w) => w.horizon);
  assert.deepEqual([...horizons].sort(), [...REC_HORIZONS].sort());
});

/* ---------- الحارس يمسك الأخطاء ---------- */

test('بُعد تصميم يربط فجوة غير موجودة يُحجب', () => {
  const broken = structuredClone(tom);
  broken.designDimensions[0].linkedGapIds = ['فجوة-وهمية'];
  const v = tomVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('فجوةً غير موجودة')));
});

test('بُعد تصميم يربط بُعد نضجٍ غير موجود يُحجب', () => {
  const broken = structuredClone(tom);
  broken.designDimensions[0].linkedScoreId = 'نضج-وهميّ';
  const v = tomVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بُعد نضجٍ غير موجود')));
});

test('موجة بأفق غير معتمد تُحجب', () => {
  const broken = structuredClone(tom);
  broken.waves[0].horizon = 'أفق مخترَع';
  const v = tomVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('أفقٍ غير معتمد') || b.includes('بلا موجة')));
});

test('موجة بلا نافذة زمنية تُحجب', () => {
  const broken = structuredClone(tom);
  broken.waves[1].window = '';
  const v = tomVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('window')));
});

test('طبقة معماريّة بلا بنود تُحجب', () => {
  const broken = structuredClone(tom);
  broken.targetArchitecture.bridge.points = [];
  const v = tomVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بلا بنود')));
});

/* ---------- التحويلات ---------- */

test('maturityBand يصنّف النطاقات على حدودها', () => {
  assert.equal(maturityBand(0.5), 'ضعيف');
  assert.equal(maturityBand(1.9), 'ضعيف');
  assert.equal(maturityBand(2), 'متوسط');
  assert.equal(maturityBand(3.4), 'متوسط');
  assert.equal(maturityBand(3.5), 'متين');
  assert.equal(maturityBand(4.5), 'متين');
  assert.equal(maturityBand('x'), 'غير مقيَّم');
});

test('maturitySnapshot يرتّب الأضعف أوّلًا ويُبرز التدخّل العاجل', () => {
  const snap = maturitySnapshot(study);
  assert.equal(snap.dimensions[0].id, 'demand-replenishment'); // 0.5 الأضعف
  assert.ok(snap.dimensions[0].score <= snap.dimensions[1].score);
  assert.ok(snap.interveneNow.every((d) => d.score < 2));
  assert.ok(snap.interveneNow.some((d) => d.id === 'demand-replenishment'));
  assert.ok(snap.interveneNow.some((d) => d.id === 'supplier-integration'));
});

test('designMatrix يصل كل بُعدٍ بدرجته وفجواته الحقيقية', () => {
  const matrix = designMatrix(tom, study);
  assert.equal(matrix.length, tom.designDimensions.length);
  const demand = matrix.find((m) => m.id === 'demand-planning');
  assert.equal(demand.score, 0.5);
  assert.equal(demand.band, 'ضعيف');
  assert.ok(demand.gaps.length >= 1);
  assert.ok(demand.gaps.every((g) => typeof g.title === 'string'));
});

test('designMatrix يرتّب الفجوات بالخطورة (الأشدّ أوّلًا)', () => {
  const matrix = designMatrix(tom, study);
  const demand = matrix.find((m) => m.id === 'demand-planning');
  // auto-replenishment (حرجة) و pos-integration (حرجة) قبل one-number-plan (متوسطة)
  assert.equal(demand.gaps[0].severity, 'حرجة');
});

test('transformationWaves تُحمّل كل موجةٍ بتوصياتها مرتّبةً بالأثر', () => {
  const waves = transformationWaves(tom, study);
  const total = waves.reduce((n, w) => n + w.recommendations.length, 0);
  assert.equal(total, study.recommendations.length); // كل توصية في موجةٍ واحدة
  for (const w of waves) {
    const ranks = w.recommendations.map((r) => ({ 'تحويلي': 0, 'مرتفع': 1, 'متوسط': 2 }[r.impact] ?? 9));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `ترتيب أثر ${w.id} مكسور`);
  }
});

test('foundationPillars يصل الركائز بدرجاتها الحيّة من الدراسة', () => {
  const pillars = foundationPillars(tom, study);
  assert.ok(pillars.length >= 1);
  const orgRoles = pillars.find((p) => p.linkedScoreId === 'org-roles');
  assert.equal(orgRoles.score, 4.5);
});

test('tomExecutiveSummary يشتقّ الأرقام لا يكتبها', () => {
  const s = tomExecutiveSummary(tom, study);
  assert.equal(s.dimensionsTotal, study.scores.dimensions.length);
  assert.equal(s.gapsTotal, study.gaps.length);
  assert.equal(s.recsTotal, study.recommendations.length);
  assert.equal(s.designPillars, tom.designDimensions.length);
  assert.equal(s.waves, 3);
  assert.ok(s.maturityNow > 0 && s.maturityNow <= 5);
  assert.ok(s.interveneNow >= 2); // إشارة الطلب + تكامل الموردين
});
