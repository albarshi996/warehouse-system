/**
 * حارسُ مكتبة القوالب وإسناداتها — يقيس ولا يصدّق.
 *
 * البذرةُ (`src/data/warehouse-schemes.json`) تدّعي أنّ قالبَها يُنتج ملصقات
 * المالك المطبوعة: ١٠٠٠ لطرابلس و٢٦٠٠ للرحبة. وهذا الملفّ **يعيد الحساب**
 * بالمولّد نفسِه الذي تستعمله البانية، فلا يبقى الادّعاء بلا برهان.
 *
 * ★★★ ولماذا حارسٌ مستقلٌّ لا سطرٌ في اختبارٍ آخر؟ لأنّ الملصقات **مطبوعةٌ
 * ومعلَّقةٌ على الرفوف**: من غيّر رقمًا في الإسناد غيّر بضغطةٍ ما لا يستطيع
 * تغييرَه في المستودع. فالحارسُ هنا يقف بين التعديل والواقع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyScan } from '../barcodes/barcodeCode.js';
import { binPrefixOf, prefixConflicts, warehouseForBin } from './binAnatomy.js';
import { countForTemplate, schemeFromTemplate, templateById, templateProblems } from './binTemplate.js';
import { shortLabelOf } from './locationCode.js';
import { expandScheme } from './locationScheme.js';

const SEED = JSON.parse(readFileSync(new URL('../../data/warehouse-schemes.json', import.meta.url), 'utf8'));
const tpl = (id) => templateById(SEED.templates, id);

/** كلُّ أكواد المستودعين — تُحسب مرّةً وتُقاس مرارًا. */
const ALL = SEED.assignments.flatMap(
  (a) => expandScheme(schemeFromTemplate(tpl(a.templateId), { binPrefix: a.binPrefix, params: a.params })).codes
);

test('★★★ الإسنادُ يُنتج الملصقات المطبوعة بالعدد: ١٠٠٠ طرابلس · ٢٦٠٠ الرحبة', () => {
  assert.equal(SEED.assignments.length, 2, 'مستودعان لا غير');
  for (const a of SEED.assignments) {
    const template = tpl(a.templateId);
    assert.ok(template, `قالبُ ${a.binPrefix} موجودٌ في المكتبة`);
    assert.deepEqual(templateProblems(template, { binPrefix: a.binPrefix, params: a.params }), [], `إسنادُ ${a.binPrefix} سليم`);
    assert.equal(countForTemplate(template, { binPrefix: a.binPrefix, params: a.params }), a.expectedCount, `عدُّ ${a.binPrefix} كما أُعلن`);

    const { codes, rejected } = expandScheme(schemeFromTemplate(template, { binPrefix: a.binPrefix, params: a.params }));
    assert.equal(rejected.length, 0, `لا كودَ مرفوضًا في ${a.binPrefix}`);
    assert.equal(codes.length, a.expectedCount);
    assert.equal(codes[0], a.firstCode, `أوّلُ ${a.binPrefix}`);
    assert.equal(codes[codes.length - 1], a.lastCode, `آخرُ ${a.binPrefix}`);
  }
  assert.equal(ALL.length, 3600, 'المجموع الذي طُبع');
});

test('★★ ومكتبةُ القوالب ليست حبيسةَ حالةٍ واحدة', () => {
  assert.ok(SEED.templates.length >= 2, 'قالبان على الأقلّ — وإلّا فهو مخطّطٌ جامدٌ باسمٍ آخر');
  const ids = SEED.templates.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ولا معرّفَ مكرّرًا');
  for (const t of SEED.templates) {
    assert.ok(t.nameAr && t.descriptionAr, `القالب ${t.id} مُسمًّى ومشروح`);
    assert.ok((t.params || []).length > 0, `والقالب ${t.id} له وسائطُ تُملأ`);
    assert.deepEqual(templateProblems(t, { binPrefix: 'X' }), [], `والقالب ${t.id} يعمل بوسائطه الافتراضيّة`);
    assert.ok(countForTemplate(t, { binPrefix: 'X' }) > 0, `ويُنتج أكوادًا: ${t.id}`);
  }
});

test('★★★ ولا تسميةَ لخانتين — ٣٦٠٠ خانةً ⟵ ٣٦٠٠ تسمية', () => {
  // بيّنةُ العطب قبل 2026-09-02: الاختصارُ كان يُسقط الممرّ، فتعود الـ٣٦٠٠
  // بمئةِ تسميةٍ فقط — و«L-01-01» وحدها تشير إلى ٢٦ خانةً في الرحبة. وهي
  // التسميةُ المطبوعةُ على الملصق وفي خطّة السحب ولوحة العامل والخريطة.
  assert.equal(new Set(ALL.map(shortLabelOf)).size, 3600);
  assert.equal(shortLabelOf('RH-A-L-01-01'), 'RH-A-L-01-01', 'ما يراه العاملُ هو ما على الملصق');
});

test('★★★ ولا تضاربَ مع الطبالي — الـ٣٦٠٠ كلُّها «موقع تخزين»', () => {
  const notLocation = ALL.filter((c) => classifyScan(c).kind !== 'LOCATION');
  assert.deepEqual(notLocation.slice(0, 5), [], 'كلُّ كودِ خانةٍ يُقرأ موقعًا');
  assert.equal(classifyScan('LPN-TR-20260901-000001').kind, 'PALLET', 'والطبليّةُ تبقى طبليّة');
  assert.equal(classifyScan('6281006521').kind, 'ITEM', 'والصنفُ يبقى صنفًا');
});

test('★★ الربطُ إلى مستودعات البوّابة الحيّة: RH ⟵ WH001 · TR ⟵ WH002', () => {
  const warehouses = SEED.assignments.map((a) => ({ code: a.warehouseCode, nameAr: a.nameAr, binPrefix: a.binPrefix }));
  assert.deepEqual(prefixConflicts(warehouses), [], 'لا بادئةَ يحملها مستودعان');
  assert.equal(warehouseForBin('RH-A-L-01-01', warehouses)?.code, 'WH001');
  assert.equal(warehouseForBin('TR-A-L-01-01', warehouses)?.code, 'WH002');
  for (const a of SEED.assignments) {
    assert.equal(binPrefixOf({ code: a.warehouseCode, binPrefix: a.binPrefix }), a.binPrefix, 'بادئةُ المستودع هي التي يُبنى بها الكود');
    assert.notEqual(a.binPrefix, a.warehouseCode, 'ولو تطابقا لَما احتجنا الحقل أصلًا');
  }
});

test('★★ والبذرةُ تُعلن أنّها قيست بالملصقات — لا تُقبل دعوى بلا قياس', () => {
  for (const a of SEED.assignments) {
    assert.equal(a.evidence.measuredAgainstLabels, true,
      `${a.binPrefix}: أُعيد التوليدُ بلا مجلّد الـPDF — شغّل: node scripts/generate-bin-schemes.mjs "<مجلد خانة>"`);
    assert.equal(a.evidence.labelCount, a.expectedCount);
    assert.equal(a.evidence.missing, 0);
    assert.equal(a.evidence.extra, 0);
  }
});
