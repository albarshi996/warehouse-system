/**
 * حارسُ وصلِ GS1 بهويّة المسح — ‹WMS-102›.
 *
 * ولهذا الحارسِ وظيفتان لا واحدة:
 * ① أن تصل بياناتُ الملصق إلى بطاقة الهويّة فعلًا — **لا محلّلٌ يُستدعى
 *    وتُرمى مخرجاتُه** (وهو عطبٌ وقع في هذا المستودع مرّتين: منطقٌ مبنيٌّ بلا
 *    مستدعٍ، وحارسٌ يقرأ حقلًا لا يُكتب أبدًا).
 * ② أن **لا تتغيّر** مسحةٌ عاديّةٌ واحدةً بحرف. فالشاشاتُ الخمسُ القائمةُ لم
 *    تُلمَس، ولو انحرف سلوكُها لانكسر عملٌ يعمل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GS } from './gs1.js';
import { identifyScan, isRescanOfSame, gs1Candidates, SCAN_PHASES } from './scanIdentity.js';

const NOW = Date.UTC(2026, 9, 3);

/** ماسترٌ مصغَّر — والصنفُ مسجَّلٌ **بباركود العلبة** ثلاثةَ عشرَ، كحال الواقع. */
const MASTER = [
  { sku: 'ITM-1', nameAr: 'لبن طازج 500مل', barcode: '6281000112342', uom: 'carton', factor: 12 },
  { sku: 'ITM-2', nameAr: 'لبن طازج 200مل', barcode: '6281000112359', uom: 'piece', factor: 1 },
];
const resolve = (code) => {
  const hit = MASTER.find((m) => m.barcode === code || m.sku === code);
  return hit ? { item: hit, uom: hit.uom, factor: hit.factor } : null;
};

/** عنصرُ GS1 كاملٌ يحمل كلَّ ما يهمّ المستودع. */
const FULL =
  ']C1' +
  '01' + '06281000112342' +
  '17' + '270331' +
  '10' + 'LOT4471' + GS +
  '21' + 'SER-9' + GS +
  '3102' + '001250' +
  '37' + '48' + GS +
  '400' + 'PO-881';

/* ══════════ ① لا تتغيّر مسحةٌ عاديّة ══════════ */

test('★★★ المسحُ العاديُّ يسلك مساره القديم حرفًا — ولا حمولةَ GS1 عليه', () => {
  const r = identifyScan('6281000112342', resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.identified.id);
  assert.equal(r.name, 'لبن طازج 500مل');
  assert.equal(r.code, '6281000112342', 'الكودُ المعروضُ تغيّر على مسحةٍ عاديّة');
  assert.equal(r.gs1, null, 'حمولةُ GS1 ظهرت على مسحةٍ ليست GS1');
  assert.deepEqual(r.prefill, {}, 'مُلئ حقلٌ لم يُقرأ من ملصق');
  assert.equal(r.factor, 12);
  // وسطورُ البطاقة ثلاثةٌ وأربعة: الرمزُ والباركودُ والوحدةُ والمعامل.
  assert.equal(r.lines.length, 4);
});

test('المجهولُ العاديُّ يبقى مجهولًا بسببه — وبلا حمولة', () => {
  const r = identifyScan('9999999999999', resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.unknown.id);
  assert.equal(r.gs1, null);
  assert.ok(r.problem.includes('غير معروف'));
});

/* ══════════ ② الوصلُ — وكلُّ حقلٍ يُشترط وصولُه ══════════ */

test('★★★ كلُّ حقلٍ قرأه الملصقُ يصل البطاقةَ — فلا محلّلٌ تُرمى مخرجاتُه', () => {
  const r = identifyScan(FULL, resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.identified.id, r.problem);
  assert.equal(r.sku, 'ITM-1');
  assert.ok(r.gs1, 'حمولةُ GS1 غائبة — المحلّلُ استُدعي وأُهملت مخرجاتُه');

  assert.equal(r.gs1.gtin, '06281000112342');
  assert.equal(r.gs1.batch, 'LOT4471');
  assert.equal(r.gs1.expiry, '2027-03-31');
  assert.equal(r.gs1.serial, 'SER-9');
  assert.equal(r.gs1.netWeightKg, 12.5);
  assert.equal(r.gs1.purchaseOrder, 'PO-881');
  assert.deepEqual(r.gs1.warnings, [], 'تحذيرٌ على ملصقٍ سليم');

  // وتُعرض موسومةً بمصدرها: العاملُ يعرف أنّها قُرئت ولم تُكتب.
  const labels = r.lines.map((l) => l.label).join(' | ');
  for (const needed of ['الدفعة (من الباركود)', 'الصلاحية (من الباركود)', 'التسلسل (من الباركود)', 'الوزن (من الباركود)', 'أمر الشراء (من الباركود)']) {
    assert.ok(labels.includes(needed), `سطرٌ مفقودٌ من البطاقة: ${needed} — فالعاملُ لا يرى ما قُرئ. السطور: ${labels}`);
  }
});

test('★★ ما يُملأ تلقائيًّا هو الدفعةُ والصلاحيّةُ والعدد — بالصيغة التي يقرؤها حقل التاريخ', () => {
  const r = identifyScan(']C1' + '01' + '06281000112342' + '17' + '270331' + '10' + 'LOT9' + GS + '30' + '24', resolve, { nowMs: NOW });
  assert.deepEqual(r.prefill, { batch: 'LOT9', expiry: '2027-03-31', qty: 24 });
  assert.ok(!Number.isNaN(Date.parse(r.prefill.expiry)), 'الصلاحيّةُ لا تُقرأ بـDate.parse — فيعجز حقلُ التاريخ');
});

test('★★★ المفاتيحُ الغائبةُ تُحذف لا تُفرَّغ — وإلّا مُحيت دفعةٌ كتبها العاملُ بيده', () => {
  const r = identifyScan(']C1' + '01' + '06281000112342' + '17' + '270331', resolve, { nowMs: NOW });
  assert.deepEqual(r.prefill, { expiry: '2027-03-31' });
  assert.ok(!('batch' in r.prefill), 'مفتاحُ دفعةٍ فارغٌ موجودٌ — سيمحو ما كُتب');
  // ومحاكاةُ ما تفعله الشاشةُ حرفًا:
  const typed = { qty: 3, batch: 'كتبها العامل', expiry: '' };
  const merged = { ...typed, ...r.prefill };
  assert.equal(merged.batch, 'كتبها العامل', 'الدمجُ محا دفعةً مكتوبةً بيد');
  assert.equal(merged.expiry, '2027-03-31');
});

/* ══════════ ③ الفخُّ القاتل: الفاصلُ يُحذف بالتنظيف ══════════ */

test('★★★ الفاصلُ GS يُحلَّل قبل التنظيف — ولولاه التصقت الدفعةُ بما بعدها', () => {
  // `normalizeScanned` تحذف محارفَ التحكّم وفيها GS. فلو حُلِّل بعدها لصارت
  // الدفعةُ «LOT4471172703» — تبدو سليمةً ولا أحدَ يشكّ.
  const r = identifyScan(']C1' + '01' + '06281000112342' + '10' + 'LOT4471' + GS + '17' + '270331', resolve, { nowMs: NOW });
  assert.equal(r.gs1.batch, 'LOT4471', 'الدفعةُ ابتلعت ما بعد الفاصل — حُلِّل بعد التنظيف');
  assert.equal(r.gs1.expiry, '2027-03-31', 'الصلاحيّةُ ضاعت داخل الدفعة');
});

/* ══════════ ④ المطابقةُ 14 ⟷ 13 ══════════ */

test('★★★ GTIN بأربعةَ عشرَ يُطابق صنفًا مسجَّلًا بثلاثةَ عشرَ — وبلا هذا لا يُطابَق صنفٌ أبدًا', () => {
  const r = identifyScan('(01)06281000112342', resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.identified.id, r.problem);
  assert.equal(r.sku, 'ITM-1');
  assert.equal(r.code, '6281000112342', 'الكودُ المطابِقُ ليس الصيغةَ التي عرف بها الماستر');
  assert.equal(r.name, 'لبن طازج 500مل');
});

test('مرشَّحاتُ الكود تُعلَن بالترتيب — أربعةَ عشرَ ثمّ ثلاثةَ عشرَ', () => {
  const { candidates } = gs1Candidates('(01)06281000112342');
  assert.equal(candidates[0], '06281000112342');
  assert.ok(candidates.includes('6281000112342'));
});

test('★ «ضمن الأمر» يُحكَم على المرشَّحات كلِّها — فلا يُقال «غيرُ مذكور» لصيغةِ كتابة', () => {
  const r = identifyScan('(01)06281000112342', resolve, {
    nowMs: NOW,
    expectedCodes: ['6281000112342'], // الأمرُ مكتوبٌ بباركود العلبة
  });
  assert.equal(r.expectation, 'expected', 'صنفٌ مذكورٌ في الأمر وُسم «غيرَ مذكور» لأنّ GS1 كتبه بأربعةَ عشرَ');
});

/* ══════════ ⑤ المجهولُ لا تُهدر بيانتُه ══════════ */

test('★★ صنفٌ لا يعرفه الماسترُ يبقى مجهولًا — ومعه الدفعةُ والصلاحيّةُ المقروءتان', () => {
  const r = identifyScan(']C1' + '01' + '09501101530003' + '10' + 'LOT-X' + GS + '17' + '271231', resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.unknown.id);
  assert.ok(r.gs1, 'بيانةٌ قُرئت وأُهدرت — فتراجع الحوكمةُ رقمًا أعمى');
  assert.equal(r.gs1.batch, 'LOT-X');
  assert.equal(r.gs1.expiry, '2027-12-31');
  assert.deepEqual(r.prefill, { batch: 'LOT-X', expiry: '2027-12-31' });
});

/* ══════════ ⑥ الطبليّة ══════════ */

test('SSCC تُعرض هويّةَ طبليّةٍ في البطاقة — لا كودَ صنفٍ مجهول', () => {
  const r = identifyScan('(00)106141412345678908', resolve, { nowMs: NOW });
  assert.equal(r.phase, SCAN_PHASES.unknown.id, 'لا صنفَ في الماستر — والطبليّةُ ليست صنفًا');
  assert.equal(r.gs1.sscc, '106141412345678908');
  assert.equal(r.gs1.kind, 'SSCC');
});

/* ══════════ ⑦ إعادةُ المسح — صنفٌ ودفعة ══════════ */

test('★★ كرتونتان من الطبليّة نفسِها إعادةٌ — فتبقى السرعة', () => {
  const first = identifyScan(']C1' + '01' + '06281000112342' + '10' + 'LOT1', resolve, { nowMs: NOW });
  assert.equal(isRescanOfSame(first, ']C1' + '01' + '06281000112342' + '10' + 'LOT1'), true);
});

test('★★★ دفعةٌ أخرى من الصنف نفسِه هويّةٌ جديدة — وإلّا جُمعت دفعتان في عدّادٍ واحد', () => {
  const first = identifyScan(']C1' + '01' + '06281000112342' + '10' + 'LOT1', resolve, { nowMs: NOW });
  assert.equal(
    isRescanOfSame(first, ']C1' + '01' + '06281000112342' + '10' + 'LOT2'),
    false,
    'دفعتان مختلفتان حُسبتا تكرارًا — فضاع تتبّعُ الصلاحية'
  );
});

test('إعادةُ المسح العاديّةُ لم تتغيّر — ولو اختلفت صيغةُ الكتابة', () => {
  const plain = identifyScan('6281000112342', resolve, { nowMs: NOW });
  assert.equal(isRescanOfSame(plain, '6281000112342'), true);
  assert.equal(isRescanOfSame(plain, '6281000112359'), false);
  assert.equal(isRescanOfSame(plain, ''), false);
  assert.equal(isRescanOfSame(null, '6281000112342'), false);
  // وبطاقةٌ عُرِّفت بالصيغة الثلاثةَ عشرَ ثمّ أُعيد المسحُ بـGS1 — إعادةٌ لا هويّةٌ جديدة.
  assert.equal(isRescanOfSame(plain, '(01)06281000112342'), true);
});

/* ══════════ ⑧ الباركودُ الداخليُّ لا يُمسّ ══════════ */

test('★★ الباركودُ الداخليُّ للبوّابة يمرّ كما هو — لا تفسيرَ أجنبيًّا عليه', () => {
  for (const code of ['BZ|LPN|RH|000123', 'RH-A-R-01-01', '1712345678901']) {
    const r = identifyScan(code, resolve, { nowMs: NOW });
    assert.equal(r.gs1, null, `فُسِّر GS1: ${code}`);
    assert.equal(r.code, code, `تغيّرت قيمتُه: ${code}`);
  }
});
