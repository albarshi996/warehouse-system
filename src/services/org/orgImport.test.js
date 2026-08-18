/**
 * حارس غرس شجرة القطاع ‹FNB-101›.
 *
 * أخطر ما يحرسه: **لا حفظَ جزئيّ صامت** — شجرةٌ فيها عطبٌ واحد تُرفض كاملةً،
 * و`toWrite` تخرج فارغةً ولو سلمت تسعةُ أعشار الصفوف. فمن كتب النصف ترك
 * شجرةً نصفها أيتام وحمّل التكلفة على «غير مربوط» وهو يظنّها موصولة.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLevel, readOrgRow, planOrgImport,
  sectorSeed, isSeedLocation, seedWarnings, SEED_PREFIX,
} from './orgImport.js';
import { locationProblems, indexLocations, dimensionsOf } from './orgLocations.js';

/** شجرة قطاعٍ سليمة — قطاعٌ فبراندٌ ففرع. */
const VALID_ROWS = [
  { code: 'FNB', nameAr: 'قطاع الأغذية', level: 'قطاع' },
  { code: 'BRD1', nameAr: 'براند أول', level: 'براند', parentCode: 'FNB' },
  { code: 'BR01', nameAr: 'فرع أول', level: 'فرع', parentCode: 'BRD1', city: 'بنغازي' },
];

test('المستوى يُقرأ بالعربيّة وبالإنجليزيّة وبرمزه — والمجهول يُرفض لا يُخمَّن', () => {
  assert.equal(resolveLevel('قطاع'), 'sector');
  assert.equal(resolveLevel('البراند'), 'brand');
  assert.equal(resolveLevel('branch'), 'branch');
  assert.equal(resolveLevel('مركز التكلفة'), 'cost_center');
  assert.equal(resolveLevel('cost center'), 'cost_center');
  assert.equal(resolveLevel('مستودع'), '');
  assert.equal(resolveLevel(''), '');
});

test('الصفّ يُسوّى: الرمز كبيرًا والفرع بأبيه — والقطاع الجذر يرفض أبًا', () => {
  const ok = readOrgRow({ code: 'br01', nameAr: 'فرع', level: 'فرع', parentCode: 'brd1' });
  assert.equal(ok.problem, '');
  assert.equal(ok.location.code, 'BR01');
  assert.equal(ok.location.parentCode, 'BRD1');

  assert.match(readOrgRow({ nameAr: 'بلا رمز', level: 'فرع' }).problem, /بلا رمز/);
  assert.match(readOrgRow({ code: 'BR X', nameAr: 'فراغ', level: 'فرع', parentCode: 'B' }).problem, /فراغ/);
  assert.match(readOrgRow({ code: 'BR01', nameAr: 'فرع', level: 'فرع' }).problem, /بلا أب/);
  assert.match(readOrgRow({ code: 'FNB', nameAr: 'قطاع', level: 'قطاع', parentCode: 'X' }).problem, /جذر/);
});

test('شجرةٌ سليمة تُقبل كاملةً وتصمد أمام حارس السيّد نفسه', () => {
  const plan = planOrgImport(VALID_ROWS, []);
  assert.equal(plan.ok, true);
  assert.equal(plan.toWrite.length, 3);
  assert.equal(plan.counts.created, 3);
  // العقد الأهمّ: ما يخرج للكتابة يجتاز `locationProblems` — الحارس واحدٌ لا اثنان.
  assert.deepEqual(locationProblems(plan.toWrite), []);
  // والأبعاد تُشتقّ فعلًا من المكتوب — الفرع يعرف برانده وقطاعه.
  const dims = dimensionsOf(indexLocations(plan.toWrite), { header: { costCenter: 'BR01' } });
  assert.equal(dims.brand.code, 'BRD1');
  assert.equal(dims.sector.code, 'FNB');
});

test('★ العقد: عطبٌ واحد يُسقط الدفعة كلّها — لا حفظَ جزئيّ صامت', () => {
  // الفرع الثالث أبوه مفقود — والصفّان الأوّلان سليمان تمامًا.
  const rows = [...VALID_ROWS, { code: 'BR99', nameAr: 'يتيم', level: 'فرع', parentCode: 'GHOST' }];
  const plan = planOrgImport(rows, []);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.toWrite, []); // ولا صفٌّ واحد — ولو سلم ثلاثة من أربعة.
  assert.ok(plan.problems.some((p) => p.includes('GHOST')));
});

test('حلقة الملكيّة تُرفض كاملةً — برسالةٍ تسمّي الحلقة', () => {
  const rows = [
    { code: 'A', nameAr: 'براند أ', level: 'براند', parentCode: 'B' },
    { code: 'B', nameAr: 'فرع ب', level: 'فرع', parentCode: 'A' },
  ];
  const plan = planOrgImport(rows, []);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.toWrite, []);
});

test('التكرار داخل الدفعة يُسمّى برقمَي السطرين — لا خطأً غامضًا من الشجرة', () => {
  const rows = [...VALID_ROWS, { code: 'BR01', nameAr: 'فرع مكرّر', level: 'فرع', parentCode: 'BRD1' }];
  const plan = planOrgImport(rows, []);
  assert.equal(plan.ok, false);
  const dup = plan.rows.find((r) => r.line === 4);
  assert.equal(dup.verdict, 'reject');
  assert.match(dup.problem, /السطر 3/);
});

test('إعادة استيراد الشجرة نفسها تحديثٌ لا تكرار — الاستبدال لا الإلحاق', () => {
  const first = planOrgImport(VALID_ROWS, []);
  const again = planOrgImport(VALID_ROWS, first.toWrite);
  assert.equal(again.ok, true);
  assert.equal(again.counts.updated, 3);
  assert.equal(again.counts.created, 0);
});

test('الوارد يُدمج مع القائم: فرعٌ جديد يستند إلى براندٍ محفوظٍ سلفًا', () => {
  const existing = planOrgImport(VALID_ROWS, []).toWrite;
  const plan = planOrgImport(
    [{ code: 'BR02', nameAr: 'فرع ثانٍ', level: 'فرع', parentCode: 'BRD1' }],
    existing
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.counts.created, 1);
});

test('البذرة: شجرةٌ سليمة موسومةٌ بالوسم وبالبادئة معًا', () => {
  const seed = sectorSeed();
  assert.equal(planOrgImport(seed, []).ok, true);
  for (const loc of seed) {
    assert.equal(loc.seed, true);
    assert.ok(loc.code.startsWith(SEED_PREFIX));
    assert.equal(isSeedLocation(loc), true);
  }
  // والوسم يعبر خطّة الاستيراد ولا يسقط في الطريق.
  const written = planOrgImport(seed, []).toWrite;
  assert.ok(written.every((l) => l.seed === true));
});

test('حارس الاختلاط: بذرةٌ وإنتاجٌ معًا يُنبَّه عليهما — وكلٌّ وحده صامت', () => {
  const seed = sectorSeed();
  const real = planOrgImport(VALID_ROWS, []).toWrite;
  assert.deepEqual(seedWarnings(seed), []);
  assert.deepEqual(seedWarnings(real), []);
  assert.equal(seedWarnings([...seed, ...real]).length, 1);
  // والبذرة المطفأة لا تُحسب اختلاطًا — الإطفاء هو العلاج المقصود.
  const off = seed.map((l) => ({ ...l, active: false }));
  assert.deepEqual(seedWarnings([...off, ...real]), []);
});
