/**
 * اختبارات منظومة التوظيف — المنطق الخالص: قيود السيرة وسلامة الكتالوج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateCv, base64Size, MAX_CV_BYTES } from './cvFile.js';
import { JOBS, getJob, jobOptions } from './jobsCatalog.js';

/** مصدر الهيكل الواحد — الكتالوج مولَّد منه، فيُقاس عليه لا على رقم ثابت. */
const ORG = JSON.parse(readFileSync(new URL('../../data/org-structure.json', import.meta.url), 'utf8'));

// ── السيرة الذاتية ─────────────────────────────────────────────────
test('🚨 حد 700KB يحمي سقف مستند Firestore (ميغابايت واحد بعد الترميز)', () => {
  // الترميز يضخّم بالثلث — لو قبلنا 900KB خامًا لتجاوز الترميزُ السقفَ ورُفض الحفظ.
  assert.ok(base64Size(MAX_CV_BYTES) < 1_000_000, 'الحد بعد الترميز يبقى دون الميغابايت');
  assert.ok(base64Size(900 * 1024) > 1_048_576, 'ولو كان الحد 900KB لانفجر السقف — الحد الحالي صحيح');
});

test('PDF والصور تُقبل وملفات Word تُرفض', () => {
  assert.equal(validateCv({ name: 'cv.pdf', size: 300 * 1024, type: 'application/pdf' }).ok, true);
  assert.equal(validateCv({ name: 'cv.jpg', size: 300 * 1024, type: 'image/jpeg' }).ok, true);
  assert.equal(validateCv({ name: 'cv.png', size: 300 * 1024, type: 'image/png' }).ok, true);
  const doc = validateCv({ name: 'cv.docx', size: 100 * 1024, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  assert.equal(doc.ok, false);
});

test('الكبير والفارغ والغائب تُرفض برسائل عربية', () => {
  const big = validateCv({ name: 'cv.pdf', size: MAX_CV_BYTES + 1, type: 'application/pdf' });
  assert.equal(big.ok, false);
  assert.ok(big.error.includes('700KB'));
  assert.equal(validateCv({ name: 'cv.pdf', size: 0, type: 'application/pdf' }).ok, false);
  assert.equal(validateCv(null).ok, false);
});

test('الحد نفسه بالضبط مقبول (لا خطأ الحدود)', () => {
  assert.equal(validateCv({ name: 'cv.pdf', size: MAX_CV_BYTES, type: 'application/pdf' }).ok, true);
});

// ── كتالوج الوظائف (مولَّد من `src/data/org-structure.json`) ────────
// كان هذا الاختبار يتوقّع 18 بينما الكتالوج يحمل 36 منذ توليده من ملف
// الهيكل الكامل — فظلّ أحمر. الآن يُقاس **من المصدر نفسه** فلا يتقادم
// كلّما أضاف المالك وظيفةً أو حذفها من الهيكل.
test('الكتالوج يطابق بطاقات الوصف في مصدر الهيكل عددًا ومعرّفات', () => {
  assert.equal(JOBS.length, ORG.jobs.length);
  assert.ok(JOBS.length >= 18, 'الهيكل الرسمي لا يقلّ عن 18 وظيفة');
  assert.deepEqual(
    JOBS.map((j) => j.id),
    ORG.jobs.map((j) => j.id)
  );
});

test('كل وظيفة في الكتالوج مربوطة بعقدة في شجرة الهيكل', () => {
  const ids = new Set();
  const walk = (n) => {
    ids.add(n.id);
    (n.children || []).forEach(walk);
  };
  walk(ORG.tree);
  ORG.supportFunctions.forEach((s) => ids.add(s.id));
  const orphans = JOBS.filter((j) => !ids.has(j.orgId)).map((j) => `${j.id} → ${j.orgId}`);
  assert.deepEqual(orphans, []);
});

test('كل وظيفة كاملة الحقول: معرّف فريد · مسمّى · مهام · تبعية', () => {
  const ids = new Set();
  for (const j of JOBS) {
    assert.match(j.id, /^J\d{2}$/, `معرّف ${j.title}`);
    assert.ok(!ids.has(j.id), 'لا تكرار في المعرّفات');
    ids.add(j.id);
    assert.ok(j.title.length > 3);
    assert.ok(Array.isArray(j.duties) && j.duties.length > 0, `مهام ${j.title}`);
    assert.ok(j.reportingTo, `تبعية ${j.title}`);
  }
});

test('علامة «📌 مشغول» استُخرجت حالةً ولم تبقَ داخل المهام', () => {
  const occupied = JOBS.filter((j) => j.occupied);
  assert.ok(occupied.length >= 1, 'الهيكل فيه مناصب مشغولة');
  for (const j of JOBS) {
    assert.ok(!j.duties.some((d) => d.startsWith('📌')), `علامة الحالة بقيت في مهام ${j.title}`);
  }
});

test('getJob وjobOptions: الشاغرة تتقدّم القائمة', () => {
  assert.equal(getJob('J01')?.id, 'J01');
  assert.equal(getJob('غير موجود'), null);
  const opts = jobOptions();
  const firstOccupied = opts.findIndex((j) => j.occupied);
  const lastVacant = opts.length - 1 - [...opts].reverse().findIndex((j) => !j.occupied);
  if (firstOccupied >= 0) assert.ok(lastVacant < firstOccupied, 'كل الشواغر قبل المشغولة');
});
