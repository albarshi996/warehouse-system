/**
 * حارسُ محلّل GS1 — ‹WMS-101›.
 *
 * وأوّلُ بندٍ فيه هو **سببُ وجود الملفّ**: باركودُ تجزئةٍ يبدأ بـ«17» لا يُقرأ
 * تاريخَ صلاحية. فلو سقط هذا البندُ وحدَه كان المحلّلُ أذًى لا نفعًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GS,
  BARE_DIGITS_MIN,
  checkDigitOk,
  padGtin14,
  gtinVariants,
  parseGs1Date,
  gs1SignalOf,
  parseGs1,
  gs1Summary,
} from './gs1.js';

/* ══════════ ① الحارسُ الحاكم: ما ليس GS1 لا يُفسَّر ══════════ */

test('★★★ باركود EAN-13 يبدأ بـ«17» لا يُقرأ صلاحيّةً — وهو سببُ وجود هذا الملفّ', () => {
  const ean = '1712345678901'; // ثلاثةَ عشرَ رقمًا، صنفٌ حقيقيٌّ في الماستر
  const r = parseGs1(ean);
  assert.equal(r.isGs1, false, 'EAN-13 فُسِّر GS1 — هذا يفسد المخزون صامتًا');
  assert.equal(r.expiry, '', 'اختُرعت صلاحيّةٌ من باركودِ تجزئة');
  assert.equal(r.value, ean, 'القيمةُ تغيّرت — والمسارُ القديم يحتاجها كما هي');
});

test('باركوداتُ التجزئة كلُّها أقصرُ من الحدّ — فلا واحدَ منها يدخل التفسير', () => {
  for (const code of ['12345678', '123456789012', '1712345678901', '17123456789012']) {
    assert.ok(code.length < BARE_DIGITS_MIN, `طولُ ${code} بلغ الحدّ — الحارسُ انهار`);
    assert.equal(parseGs1(code).isGs1, false, `${code} فُسِّر GS1`);
  }
});

test('الباركودُ الداخليُّ للبوّابة لا يُفسَّر تفسيرًا أجنبيًّا', () => {
  for (const code of ['BZ|LPN|RH|000123', 'RH-A-R-01-01', 'PLT-00099', 'WH001']) {
    const r = parseGs1(code);
    assert.equal(r.isGs1, false, `${code} فُسِّر GS1`);
    assert.equal(r.value, code);
  }
});

test('الفارغُ والفاسدُ يمرّان بلا انفجار', () => {
  for (const code of ['', null, undefined, '   ']) {
    const r = parseGs1(code);
    assert.equal(r.isGs1, false);
    assert.equal(r.ok, false);
  }
});

/* ══════════ ② الإشاراتُ الأربع ══════════ */

test('الإشاراتُ تُعرَف وتُسمّى — ومعرّفُ AIM يُقطع عن الجسم', () => {
  assert.equal(gs1SignalOf(']C1' + '0109501101530003').signal, 'معرّف ترميز AIM');
  assert.equal(gs1SignalOf(']C1' + '0109501101530003').body, '0109501101530003');
  assert.equal(gs1SignalOf('0109501101530003' + GS + '10A').signal, 'فاصل FNC1');
  assert.equal(gs1SignalOf('(01)09501101530003').signal, 'صيغةُ الأقواس المقروءة');
  assert.equal(gs1SignalOf('0109501101530003').signal, 'عنصرٌ رقميٌّ طويلٌ بمعرّفٍ قاطع');
  assert.equal(gs1SignalOf('010950110153000310LOT').signal, 'بادئةُ عنصرٍ معلَنِ الطول');
  assert.equal(gs1SignalOf('ABC').gs1, false);
});

test('★★ القويّةُ تُشخّص والظنّيّةُ تُسحَب — وهو فرقُ سلوكٍ لا تصنيف', () => {
  for (const s of [']C1' + '0109501101530003', '0109501101530003' + GS + '10A', '(01)09501101530003']) {
    assert.equal(gs1SignalOf(s).strong, true, `أُعلنت ظنّيّةً: ${s}`);
  }
  for (const s of ['0109501101530003', '010950110153000310LOT']) {
    assert.equal(gs1SignalOf(s).strong, false, `أُعلنت قويّةً: ${s}`);
  }
});

test('★★★ كودٌ داخليٌّ تشابه شكلُه ثمّ انكسر تحليلُه يعود لمساره — لا «GS1 معطوب»', () => {
  // شكلُه شكلُ عنصرٍ معلَنِ الطول، وما بعده معرّفٌ مجهول. ولو أُعلن معطوبًا
  // لتوقّف عملٌ قائمٌ على كودٍ داخليٍّ يعمل.
  const internal = '0109501101530003' + '88ZZZ';
  const r = parseGs1(internal);
  assert.equal(r.isGs1, false, 'أُعلن GS1 معطوبًا — فيتوقّف مسحٌ كان يعمل');
  assert.equal(r.value, internal, 'القيمةُ تغيّرت فلا يجدها المسارُ القديم');
  assert.deepEqual(r.warnings, []);
});

/* ══════════ ③ التفكيكُ — الثلاثيُّ الذي طلبه المالك ══════════ */

test('(01)+(10)+(17) تُفكَّك ثلاثةَ حقولٍ مستقلّة — صنفٌ ودفعةٌ وصلاحيّة', () => {
  const raw = ']C1' + '0109501101530003' + '10LOT4471' + GS + '17270331';
  const r = parseGs1(raw, { nowMs: Date.UTC(2026, 9, 3) });
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.gtin, '09501101530003');
  assert.equal(r.batch, 'LOT4471');
  assert.equal(r.expiry, '2027-03-31');
  assert.equal(r.kind, 'ITEM');
  assert.equal(r.elements.length, 3);
  assert.deepEqual(r.warnings, [], 'تحذيرٌ على باركودٍ سليم');
});

test('(00) SSCC تُقرأ هويّةَ وحدةٍ لوجستيّة لا كودَ صنف', () => {
  const r = parseGs1('00106141412345678908', { nowMs: Date.UTC(2026, 9, 3) });
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.kind, 'SSCC');
  assert.equal(r.sscc, '106141412345678908');
  assert.equal(r.gtin, '', 'SSCC سُجِّل صنفًا');
  assert.equal(r.value, '106141412345678908');
});

test('★ الحقلُ المتغيّرُ يُقطع بالفاصل وما بعده يُقرأ — لا يُبتلع الباقي', () => {
  const raw = '0109501101530003' + '10AB' + GS + '21SER-9' + GS + '30012';
  const r = parseGs1(raw);
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.batch, 'AB');
  assert.equal(r.serial, 'SER-9');
  assert.equal(r.qty, 12, 'العددُ لم يُقرأ — ابتُلع الباقي بعد الفاصل');
});

test('★ الحقلُ المعلَنُ طولُه يُقطع بطوله بلا فاصل — فباركودُ المورّد الملتصقُ يُقرأ', () => {
  // لا فاصلَ واحدٌ في هذا النصّ: 01 أربعةَ عشرَ · 17 ستٌّ · ثمّ 10 إلى النهاية.
  const r = parseGs1('010950110153000317270331' + '10LOT-X');
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.gtin, '09501101530003');
  assert.equal(r.expiry, '2027-03-31');
  assert.equal(r.batch, 'LOT-X');
});

test('الفاصلُ الزائدُ بعد حقلٍ معلَنِ الطولِ يُتخطّى — ماسحاتٌ تُرسله', () => {
  const r = parseGs1('0109501101530003' + GS + '17270331' + GS + '10L1');
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.batch, 'L1');
  assert.equal(r.expiry, '2027-03-31');
});

test('صيغةُ الأقواس المقروءةُ تُفكَّك كما يُفكَّك الفاصل', () => {
  const r = parseGs1('(01)09501101530003(10)LOT4471(17)270331');
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.gtin, '09501101530003');
  assert.equal(r.batch, 'LOT4471');
  assert.equal(r.expiry, '2027-03-31');
});

/* ══════════ ④ عائلاتُ القياس وأمرُ الشراء ══════════ */

test('عائلةُ الوزن (310n) تُقرأ بموضع فاصلتها — والرابعُ رقمٌ لا حشو', () => {
  assert.equal(parseGs1('0109501101530003' + '3102001500').netWeightKg, 15);
  assert.equal(parseGs1('0109501101530003' + '3103000195').netWeightKg, 0.195);
  assert.equal(parseGs1('0109501101530003' + '3100000020').netWeightKg, 20);
});

test('رقمُ أمر الشراء وعددُ الوحدات يُقرآن — فالربطُ بالأمر لا يحتاج كتابةَ يد', () => {
  const r = parseGs1('00106141412345678908' + '37048' + GS + '400PO-2026-881');
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.fields.contentCount, 48);
  assert.equal(r.purchaseOrder, 'PO-2026-881');
});

/* ══════════ ⑤ رقمُ التحقّق ══════════ */

test('رقمُ التحقّق يُحتسب — GTIN وSSCC وGLN', () => {
  assert.equal(checkDigitOk('09501101530003'), true);
  assert.equal(checkDigitOk('09501101530004'), false);
  assert.equal(checkDigitOk('106141412345678908'), true);
  assert.equal(checkDigitOk('106141412345678902'), false);
  assert.equal(checkDigitOk('ABC'), false);
  assert.equal(checkDigitOk(''), false);
});

test('★ GTIN المشوَّهُ يُعلَن تحذيرًا ولا يُسقِط المسحة — فيُقرَّر عليه', () => {
  const r = parseGs1('0109501101530004' + '10L1');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '09501101530004', 'القيمةُ حُجبت — والعاملُ لا يرى ما مسح');
  assert.equal(r.batch, 'L1', 'الدفعةُ أُهدرت بسبب رقم تحقّق');
  assert.ok(
    r.warnings.some((w) => w.includes('رقمُ التحقّق')),
    'مسحٌ مشوَّهٌ مرّ بلا تحذير — فيُفتح بلاغُ عطلٍ على ماسحٍ سليم'
  );
});

/* ══════════ ⑥ مطابقةُ الماستر — 13 ⟷ 14 ══════════ */

test('★★ التصفيرُ إلى أربعةَ عشرَ ومرادفاتُه — وإلّا لا يُطابَق صنفٌ واحدٌ أبدًا', () => {
  assert.equal(padGtin14('5449000996username'.slice(0, 13)), '5449000996use'); // غيرُ رقميٍّ يُعاد كما هو
  assert.equal(padGtin14('6281000112345'), '06281000112345');
  const v = gtinVariants('06281000112345');
  assert.ok(v.includes('06281000112345'), 'صيغةُ أربعةَ عشرَ مفقودة');
  assert.ok(v.includes('6281000112345'), 'صيغةُ ثلاثةَ عشرَ مفقودة — والماسترُ مكتوبٌ بها');
});

test('التصفيرُ لا يقطع رقمًا ذا معنى — لا تُسقط إلّا الأصفارُ البادئة', () => {
  const v = gtinVariants('16281000112345'); // بلا صفرٍ بادئ
  assert.deepEqual(v, ['16281000112345'], 'قُطع رقمٌ ذو معنى فوُلد باركودٌ وهميّ');
});

/* ══════════ ⑦ التواريخ — ولا ساعةَ تُقرأ ══════════ */

test('★ اليومُ صفرٌ يعني آخرَ الشهر — ومن تجاهله أنتج NaN فمرّت بضاعةٌ منتهية', () => {
  assert.equal(parseGs1Date('270300').date, '2027-03-31');
  assert.equal(parseGs1Date('270200').date, '2027-02-28');
  assert.equal(parseGs1Date('280200').date, '2028-02-29', 'السنةُ الكبيسةُ أخطأت');
  // والمخرَجُ يُقرأ بـDate.parse — وهو عقدُ expiryStatus حرفًا.
  assert.ok(!Number.isNaN(Date.parse(parseGs1Date('270300').date)));
});

test('التاريخُ الفاسدُ يُرفض بسببٍ مكتوبٍ ولا يُخترَع', () => {
  assert.equal(parseGs1Date('271300').ok, false);
  assert.ok(parseGs1Date('271300').problem.includes('شهر'));
  assert.equal(parseGs1Date('270332').ok, false);
  assert.equal(parseGs1Date('27033').ok, false);
  assert.equal(parseGs1Date('ABCDEF').ok, false);
});

test('★ لا ساعةَ تُقرأ: نفسُ المدخل ونفسُ nowMs ⟹ نفسُ المخرَج دائمًا', () => {
  const a = parseGs1Date('270331', Date.UTC(2026, 0, 1)).date;
  const b = parseGs1Date('270331', Date.UTC(2026, 0, 1)).date;
  assert.equal(a, b);
  assert.equal(a, '2027-03-31');
  // وبلا nowMs قرنٌ معلَنٌ لا ساعةُ نظام.
  assert.equal(parseGs1Date('270331').date, '2027-03-31');
});

test('نافذةُ القرن: سنةٌ بعيدةٌ تُرجَع إلى الماضي بقاعدة GS1 لا إلى المستقبل', () => {
  // «99» مع «الآن» 2026: 2099 أبعدُ من خمسين سنةً ⟹ 1999.
  assert.equal(parseGs1Date('990101', Date.UTC(2026, 9, 3)).date, '1999-01-01');
  assert.equal(parseGs1Date('270101', Date.UTC(2026, 9, 3)).date, '2027-01-01');
});

/* ══════════ ⑧ لا يُخترع حقل ══════════ */

test('★★★ معرّفٌ مجهولٌ يُوقف التحليلَ ويُعلَن — ولا يُخمَّن طولُه', () => {
  const r = parseGs1(']C1' + '0109501101530003' + '88ZZZ');
  assert.equal(r.isGs1, true);
  assert.equal(r.ok, false, 'عنصرٌ فيه معرّفٌ مجهولٌ أُعلن سليمًا');
  assert.ok(r.problem.includes('مجهول'), r.problem);
  assert.equal(r.unparsed, '88ZZZ', 'ما لم يُحلَّل لم يُسمَّ — فلا يُشخَّص العطب');
  // وما قُرئ قبله يبقى مقروءًا — لا تُهدر بيانةٌ صحيحة.
  assert.equal(r.gtin, '09501101530003');
});

test('العنصرُ المقطوعُ يُعلَن بطوله المنتظَر لا يُكمَّل بالصفر', () => {
  const r = parseGs1('010950110153'); // 01 يحتاج أربعةَ عشرَ ووجد اثنتي عشرة
  assert.equal(r.isGs1, false, 'أقصرُ من الحدّ فلا يدخل التفسير أصلًا');
  const r2 = parseGs1(']C1' + '010950110153');
  assert.equal(r2.isGs1, true);
  assert.equal(r2.ok, false);
  assert.ok(r2.problem.includes('14'), r2.problem);
});

test('حقلٌ رقميٌّ ورد فيه حرفٌ يُرفض بسببه — ولا يُقيَّد NaN', () => {
  const r = parseGs1(']C1' + '0109501101AB0003');
  assert.equal(r.ok, false);
  assert.ok(r.problem.includes('أرقامًا'), r.problem);
});

/* ══════════ ⑨ السطرُ المقروء ══════════ */

test('سطرُ العرض يُسمّي ما فُهم — وبلا GS1 فراغٌ لا ضجيج', () => {
  const r = parseGs1('0109501101530003' + '10LOT1' + GS + '17270331');
  const s = gs1Summary(r);
  assert.ok(s.includes('صنف') && s.includes('دفعة') && s.includes('صلاحية'), s);
  assert.equal(gs1Summary(parseGs1('1712345678901')), '', 'ضجيجٌ على مسحةٍ عاديّة');
  assert.ok(gs1Summary(parseGs1(']C1' + '010950110153')).includes('لم يُقرأ كاملًا'));
});
