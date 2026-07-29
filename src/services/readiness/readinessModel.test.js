/**
 * اختبارات منطق حزمة الاستعداد — تشمل تشغيل حارس `readinessVerdict` على
 * الملفات الحقيقية: أيّ رابط دليلٍ يشير لصفحةٍ غير مسجَّلة، أو اعتراضٍ يربط
 * نضجًا/أفقًا مخترعًا، يُسقط الحزمة هنا قبل أن تصل الموقع الحيّ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readinessVerdict,
  criticalNumbers,
  objectionsResolved,
  readinessSummary,
} from './readinessModel.js';
import { internalPaths } from '../auth/navCatalog.js';

const study = JSON.parse(
  readFileSync(new URL('../../data/comparative-study.json', import.meta.url), 'utf8')
);
const tom = JSON.parse(
  readFileSync(new URL('../../data/target-operating-model.json', import.meta.url), 'utf8')
);
const prep = JSON.parse(
  readFileSync(new URL('../../data/interview-readiness.json', import.meta.url), 'utf8')
);

/* ---------- الحارس على البيانات الحقيقية ---------- */

test('🔒 ملف حزمة الاستعداد الحقيقيّ يجتاز الحارس بلا حواجب', () => {
  const v = readinessVerdict(prep, study);
  assert.equal(v.ok, true, v.blockers.join(' · '));
});

test('🔒 كل بُعدٍ ضعيفٍ (< 2) يعالجه اعتراض — لا تنبيه', () => {
  const v = readinessVerdict(prep, study);
  assert.deepEqual(v.warnings, [], v.warnings.join(' · '));
});

test('كل روابط الأدلّة تشير إلى صفحاتٍ مسجَّلةٍ فعلًا في القائمة', () => {
  const paths = new Set(internalPaths());
  const links = [
    ...prep.pitch.stations.map((s) => s.page),
    ...prep.qa.map((q) => q.evidencePage),
    ...prep.objections.map((o) => o.proofPage),
    ...prep.evidenceMap.map((e) => e.page),
  ];
  for (const p of links) assert.ok(paths.has(p), `صفحةٌ غير مسجَّلة: ${p}`);
  // الصفحة المحوريّة لليوم الرابع ضمن الأدلّة:
  assert.ok(paths.has('/dashboard/target-operating-model'));
});

/* ---------- الحارس يمسك الأخطاء ---------- */

test('رابط دليلٍ لصفحةٍ غير مسجَّلة يُحجب', () => {
  const broken = structuredClone(prep);
  broken.qa[0].evidencePage = '/dashboard/صفحة-وهمية';
  const v = readinessVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('غير مسجَّلة')));
});

test('اعتراضٌ يربط بُعد نضجٍ غير موجود يُحجب', () => {
  const broken = structuredClone(prep);
  broken.objections[0].linkedScoreId = 'نضج-وهميّ';
  const v = readinessVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بُعد نضجٍ غير موجود')));
});

test('اعتراضٌ يربط أفقًا غير معتمد يُحجب', () => {
  const broken = structuredClone(prep);
  broken.objections[0].linkedWaveHorizon = 'أفق مخترَع';
  const v = readinessVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('أفقًا غير معتمد')));
});

test('محطّة عرضٍ بلا نصّ تُحجب', () => {
  const broken = structuredClone(prep);
  broken.pitch.stations[0].say = '';
  const v = readinessVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بلا نصّ عرض')));
});

test('بنك أسئلةٍ أقل من ستّة يُحجب', () => {
  const broken = structuredClone(prep);
  broken.qa = broken.qa.slice(0, 4);
  const v = readinessVerdict(broken, study);
  assert.equal(v.ok, false);
  assert.ok(v.blockers.some((b) => b.includes('بنك الأسئلة أقل')));
});

/* ---------- التحويلات ---------- */

test('criticalNumbers يشتقّ الأرقام من الدراسة لا يكتبها', () => {
  const n = criticalNumbers(study, tom);
  assert.equal(n.dimensionsTotal, study.scores.dimensions.length);
  assert.equal(n.gapsTotal, study.gaps.length);
  assert.equal(n.recsTotal, study.recommendations.length);
  assert.equal(n.waves, tom.waves.length);
  assert.equal(n.weakest[0].id, 'demand-replenishment'); // 0.5 الأضعف
  assert.equal(n.strongest[0].id, 'org-roles'); // 4.5 الأقوى
  assert.ok(n.maturity > 0 && n.maturity <= 5);
  assert.equal(n.systemStats.length, 4);
});

test('objectionsResolved يصل كل اعتراضٍ بدرجة نضجه ونافذة موجته', () => {
  const resolved = objectionsResolved(prep, study, tom);
  assert.equal(resolved.length, prep.objections.length);
  const supplier = resolved.find((o) => o.linkedScoreId === 'supplier-integration');
  assert.equal(supplier.dimensionScore, 1);
  assert.ok(supplier.waveWindow && supplier.waveWindow.length > 0);
  for (const o of resolved) {
    assert.ok(o.dimensionScore !== null, `اعتراض ${o.id} بلا درجة`);
    assert.ok(o.waveWindow !== null, `اعتراض ${o.id} بلا نافذة`);
  }
});

test('readinessSummary يحصي مكوّنات الحزمة', () => {
  const s = readinessSummary(prep);
  assert.equal(s.stations, prep.pitch.stations.length);
  assert.equal(s.questions, prep.qa.length);
  assert.equal(s.objections, prep.objections.length);
  assert.equal(s.evidence, prep.evidenceMap.length);
  assert.equal(s.pitchMinutes, prep.pitch.durationMin);
});
