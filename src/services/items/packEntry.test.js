/**
 * حارس «صناديق × قطع» (‹JR-301أ›) — الاختبار قبل الواجهة (§22 ‹995›).
 *
 * البوّابةُ الحاكمة نصُّ المالك حرفيًّا: «بشدّة الصندوق يكتب عددَ الصناديق
 * **ويضرب** في عدد القطع». وكلُّ فرعٍ منه مُثبَتٌ هنا، ومعه الحدودُ الثلاثة:
 * لا يبتلع المسارُ (ب) صنفًا معرَّفَ الوحدة · ولا يُكتب في `Items_Master` ·
 * ولا يُحسب مجموعٌ من جهل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { needsPackEntry, packEntryVerdict } from './packEntry.js';
import { normalizeUom } from './uomModel.js';
import { scanUomChoices, scanBaseQty } from '../stock/scanFlow.js';

/** أحدُ الـ١٠٤٠: في الماستر باسمه وكوده، وبلا وحدةِ أساسٍ ولا معاملات. */
const NO_UOM = { sku: 'ITM-9', nameAr: 'مسحوق غسيل', barcodes: ['777111'] };

/** صنفٌ تُعرَف وحدته — للمسار (أ) وحدَه. */
const WITH_UOM = { sku: 'ITM-1', nameAr: 'كريم يدين', unit: 'piece' };

/** وصنفٌ عرّف معاملاته صراحةً — أَولى بالمسار (أ). */
const DEFINED = { sku: 'ITM-2', baseUom: 'piece', uomFactors: { carton: 24 } };

/* ═══════════════ الحكم الفاصل بين المسارين ═══════════════ */

test('★★★ needsPackEntry: حكمٌ مصدَّرٌ لا ظنُّ شاشة — بلا وحدةٍ نعم، وبوحدةٍ لا', () => {
  assert.equal(needsPackEntry(NO_UOM), true);
  assert.equal(needsPackEntry(WITH_UOM), false);
  assert.equal(needsPackEntry(DEFINED), false);
});

test('★★ والحكمُ يسأل المسارَ (أ) نفسَه فلا يفترقان — قائمةٌ فارغة ⇔ يحتاج الوعاء', () => {
  for (const item of [NO_UOM, WITH_UOM, DEFINED, null]) {
    assert.equal(needsPackEntry(item), scanUomChoices(item).length === 0);
  }
});

test('الباركود المجهول في الورطة نفسها: لا وحدةَ له، فيُتاح له الوعاء', () => {
  assert.equal(needsPackEntry(null), true);
});

/* ═══════════════ البوّابة الحرفيّة: ٣ × ١٢ = ٣٦ ═══════════════ */

test('★★★ «عددَ الصناديق ويضرب في عدد القطع»: ٣ صناديق × ١٢ ⟵ ٣٦', () => {
  const { ok, problem, entry } = packEntryVerdict({
    item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 12,
  });
  assert.equal(ok, true);
  assert.equal(problem, '');
  assert.equal(entry.qty, 3);
  assert.equal(entry.uom, 'صندوق');
  assert.equal(entry.factor, 12);
  assert.equal(entry.baseQty, 36);
});

test('★★ والمعاملُ يُختم على القيد بمصدره: `declared` — أعلنه العادُّ لحركته', () => {
  const { entry } = packEntryVerdict({
    item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 12,
  });
  assert.equal(entry.factorSource, 'declared');
  assert.equal(entry.factorFor, 'box');
  // الحقول الستّة ولا سابعَ لها: بطاقةُ الصنف لا يُكتب فيها من هنا (الحدّ ②).
  assert.deepEqual(Object.keys(entry).sort(), ['baseQty', 'factor', 'factorFor', 'factorSource', 'qty', 'uom']);
});

test('★★ `factorFor` مطبَّعٌ و`uom` منطوق — وهو عينُ ما يقارنه دفترُ الحركات', () => {
  const { entry } = packEntryVerdict({
    item: NO_UOM, containerLabel: 'كرتون', containers: 2, perContainer: 6,
  });
  // شرط `movements.js` ‹١٥٠›: `stampedFor === (normalizeUom(entryUom) || entryUom)`.
  assert.equal(entry.factorFor, normalizeUom(entry.uom) || entry.uom);
  assert.equal(entry.uom, 'كرتون');
  assert.equal(entry.baseQty, 12);
});

test('وعاءٌ لا يعرفه سيّدُ الوحدات يمرّ بنطقه: «شوال» يبقى «شوال» في الحقلين', () => {
  const { ok, entry } = packEntryVerdict({
    item: NO_UOM, containerLabel: 'شوال', containers: 4, perContainer: 25,
  });
  assert.equal(ok, true);
  assert.equal(entry.uom, 'شوال');
  assert.equal(entry.factorFor, 'شوال');
  assert.equal(entry.baseQty, 100);
});

test('★ والقيدُ يدخل مجاميعَ الجلسة القائمة بلا وسيط: `scanBaseQty` تقرأ ٣٦', () => {
  const { entry } = packEntryVerdict({
    item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 12,
  });
  assert.equal(scanBaseQty(entry), 36);
});

/* ═══════════════ الحدّ ①: لا يبتلع المسارُ (ب) صنفَ المسار (أ) ═══════════════ */

test('★★★ صنفٌ معرَّفُ الوحدة يُردّ إلى قائمته — لا معاملَ يُعلَن فوق تعريفٍ قائم', () => {
  const v = packEntryVerdict({ item: WITH_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 12 });
  assert.equal(v.ok, false);
  assert.equal(v.entry, null);
  assert.match(v.problem, /وحداتٌ معرّفة/);
});

test('وصنفٌ عرّف معاملاته كذلك — ولو كان الوعاءُ خارجَ معاملاته', () => {
  const v = packEntryVerdict({ item: DEFINED, containerLabel: 'شدّة', containers: 2, perContainer: 5 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /اختر وحدته من القائمة/);
});

/* ═══════════════ الحدّ ③: لا مجموعَ من جهل ═══════════════ */

test('★★★ `perContainer` صفرٌ يُرفض بسببٍ مسمًّى — لا مجموعَ صفرٍ صامت', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 0 });
  assert.equal(v.ok, false);
  assert.equal(v.entry, null);
  assert.match(v.problem, /كم قطعةً في صندوق الواحد؟/);
});

test('★★ والفراغُ مثلُه: `Number("")` صفرٌ محدود، فلولا الحارس لَمرّ', () => {
  for (const bad of ['', null, undefined, '  ', -2]) {
    const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: bad });
    assert.equal(v.ok, false, `مرّ محتوًى فاسد: ${JSON.stringify(bad)}`);
    assert.match(v.problem, /لا يُحسب منه مجموع/);
  }
});

test('عددُ الأوعية مطلوبٌ أكبرَ من صفر، ويُسمّى الوعاءُ في السؤال', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'شدّة', containers: 0, perContainer: 12 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /كم شدّة؟/);
});

test('والوعاءُ بلا اسمٍ يُرفض: «صندوق» بلا كلمةٍ رقمٌ بلا معنًى', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: '   ', containers: 3, perContainer: 12 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /سمِّ الوعاء/);
});

/* ═══════════════ حارس الكسر ═══════════════ */

test('★★ نصفُ صندوقٍ لا يوجد على الرفّ — والرسالةُ من النواة تسمّي الوعاء', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'صندوق', containers: 2.5, perContainer: 12 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /«صندوق» لا تقبل الكسور/);
});

test('★★★ ومزلقُ المجهول: «شوال» عائلتُه فارغةٌ فيتساهل `allowsFraction` — ويُحرَس هنا', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'شوال', containers: 1.5, perContainer: 25 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /«شوال» تُعدّ عدًّا/);
});

test('ونصفُ قطعةٍ داخل الوعاء يُرفض كذلك — المحتوى قِطَعٌ بنصّ المالك', () => {
  const v = packEntryVerdict({ item: NO_UOM, containerLabel: 'صندوق', containers: 3, perContainer: 12.5 });
  assert.equal(v.ok, false);
  assert.match(v.problem, /«قطعة» لا تقبل الكسور/);
});

/* ═══════════════ الحدّ ②: لا كتابةَ في بطاقة الصنف ═══════════════ */

test('★★★ إعلانُ المعامل قيدٌ على الحركة لا تعريفٌ للصنف — البطاقةُ تخرج كما دخلت', () => {
  const item = { sku: 'ITM-9', nameAr: 'مسحوق غسيل' };
  const before = JSON.stringify(item);
  packEntryVerdict({ item, containerLabel: 'صندوق', containers: 3, perContainer: 12 });
  assert.equal(JSON.stringify(item), before);
  assert.equal(item.uomFactors, undefined);
  assert.equal(item.baseUom, undefined);
});

test('★★ ولذلك صندوقان مختلفان في حركتين لا يتناقضان — لكلٍّ معاملُه المختوم', () => {
  const item = { sku: 'ITM-9' };
  const a = packEntryVerdict({ item, containerLabel: 'صندوق', containers: 1, perContainer: 12 });
  const b = packEntryVerdict({ item, containerLabel: 'صندوق', containers: 1, perContainer: 24 });
  assert.equal(a.entry.baseQty, 12);
  assert.equal(b.entry.baseQty, 24);
});

/* ═══════════════ الاستدعاء الفارغ لا ينفجر ═══════════════ */

test('نداءٌ بلا وسائطَ يُرفض بسببٍ مقروء ولا يرمي', () => {
  const v = packEntryVerdict();
  assert.equal(v.ok, false);
  assert.equal(v.entry, null);
  assert.equal(typeof v.problem, 'string');
  assert.ok(v.problem.length > 0);
});
