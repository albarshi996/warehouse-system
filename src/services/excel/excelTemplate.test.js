/**
 * حارس قالب التعبئة — **ما يُكتب في القالب يُقرأ منه**.
 *
 * العطب الذي يحرسه ليس نظريًّا: القالب يُولَّد من عناوين `DATASETS`، والمستورِد
 * يحلّ العناوين بمرادفاتٍ من الجدول نفسه. فلو غُيّر `labelAr` لعمودٍ ولم يُضَف
 * إلى `aliases`، خرج قالبٌ **يرفضه مستورِدُنا نفسه** — والمستخدم يملؤه ويرفعه
 * فيُقال له «عمود إلزامي مفقود»، وهو لم يكتب العنوان بل نحن سلّمناه إيّاه.
 *
 * ولذلك الرحلة هنا كاملةٌ لا مجزّأة: قالبٌ ← ملفُّ xlsx حقيقيّ ← المستورِد ←
 * خطّة الغرس. وهي تعمل في Node لأنّ SheetJS لا يلزمه متصفّح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { buildTemplateWorkbook, buildWorkbook } from './excelExport.js';
import { importSheet } from './excelImport.js';
import { DATASETS } from './excelSchema.js';
import { orgTemplateGuide, planOrgImport } from '../org/orgImport.js';

const GUIDE = orgTemplateGuide();
const COLUMNS = DATASETS.orgLocations.columns;

/** المصنّف ← بايتاتٍ ← ما يبتلعه `importSheet` (نفس ما يصل من `<input type=file>`). */
function toBytes(wb) {
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

test('★ القالب ورقتان بترتيبهما: التعبئة أوّلًا فلا يقرأ المستورِدُ الشرحَ بيانًا', () => {
  const wb = buildTemplateWorkbook('orgLocations', GUIDE, { sheetName: 'الشجرة' });
  assert.deepEqual(wb.SheetNames, ['الشجرة', 'تعليمات']);

  // ورقة التعبئة: صفُّ عناوينٍ واحد بلا بيانات — فلا مثالَ يُستورد سهوًا.
  const fill = XLSX.utils.sheet_to_json(wb.Sheets['الشجرة'], { header: 1, blankrows: false, defval: '' });
  assert.equal(fill.length, 1, 'ورقة التعبئة تخرج فارغةً إلّا من عناوينها');
  assert.deepEqual(fill[0], COLUMNS.map((c) => c.labelAr));

  // وورقة الشرح تحمل القواعد والمثال.
  const guideText = XLSX.utils.sheet_to_json(wb.Sheets['تعليمات'], { header: 1, blankrows: false, defval: '' })
    .map((r) => r.join(' '))
    .join(' | ');
  assert.ok(guideText.includes(GUIDE.title));
  for (const [label] of GUIDE.rules) assert.ok(guideText.includes(label), `قاعدة «${label}» غابت عن الورقة`);
  assert.ok(guideText.includes('SEC01') && guideText.includes('مركز تكلفة'));
});

test('★★ الرحلة كاملةً: عناوينُ القالب ← ملفٌّ ← المستورِد ← غرسٌ مقبول', async () => {
  // المستخدم يملأ ورقة التعبئة بصفوفٍ على شاكلة المثال — بعناوين القالب نفسها.
  const filled = buildWorkbook([{ datasetKey: 'orgLocations', records: GUIDE.example, sheetName: 'الشجرة' }]);
  const result = await importSheet(toBytes(filled), 'orgLocations');

  assert.deepEqual(result.summary.missingColumns, [], 'عمودٌ إلزاميّ لم يتعرّف عليه المستورِد في قالبنا');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, GUIDE.example.length);

  // وما قرأه يُغرَس: الشجرة تُقبل كاملةً.
  const plan = planOrgImport(result.rows, []);
  assert.equal(plan.ok, true, plan.problems.join(' · '));
  assert.equal(plan.counts.created, GUIDE.example.length);
  assert.equal(plan.toWrite.find((l) => l.code === 'BR01').parentCode, 'BRD01');
});

test('كلّ عمودٍ في القالب يحلّه المستورِد بعنوانه المكتوب — لا بمرادفٍ يصادف', async () => {
  // ورقةٌ فيها عناوين القالب وصفٌّ واحد: كلّ عمودٍ يجب أن يصل بقيمته.
  const one = {
    code: 'SEC09', nameAr: 'قطاعٌ للفحص', level: 'قطاع', parentCode: '',
    nameEn: 'Probe', city: 'بنغازي', active: 'نشط', notes: 'ملاحظة',
  };
  const wb = buildWorkbook([{ datasetKey: 'orgLocations', records: [one], sheetName: 'الشجرة' }]);
  const result = await importSheet(toBytes(wb), 'orgLocations');
  assert.deepEqual(result.summary.detectedColumns.sort(), COLUMNS.map((c) => c.field).sort());
  for (const col of COLUMNS) {
    assert.equal(result.rows[0][col.field], one[col.field], `العمود «${col.labelAr}» لم يصل بقيمته`);
  }
});
