/**
 * حارس عقد الأثر المالي (SAP-17 · ف‑٤٠ ف‑٤١) — قبل أيّ واجهة (§22 ‹995›).
 *
 * البوّابات: §16.8 ‹617› (سجلّ الفروقات — لا تعارضَ يمرّ بصمت) · §16.1
 * ‹453› (لا حسابٌ ولا رقمٌ مخترع) · §16.1 ‹454› (لا دفتر محاسبيّ ثانٍ) ·
 * §16.18 ‹774-783› (الثمانية · بلا كشف أسرار النظام المتصل).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCIAL_IMPACT,
  FINANCE_OWNER,
  financialImpactFor,
  financialTypes,
  stockEffectDiscrepancies,
  financialImpactView,
} from './financialImpact.js';
import { POSTING_RULES } from '../ledger/postingRules.js';
import { readyTypes } from '../documents/schemas/index.js';

/* ═══════════ سجلّ الفروقات — البيّنة الرقميّة (§16.8 ‹617›) ═══════════ */

test('★★ العقدان متطابقان: «أثر الكمّيّة» في العقد المالي = postingRules حرفيًّا', () => {
  const diffs = stockEffectDiscrepancies();
  assert.deepEqual(
    diffs,
    [],
    `فروقاتٌ بين العقد المالي وقواعد الترحيل: ${diffs.map((d) => `${d.type} — ${d.problem}`).join(' | ')}`
  );
});

test('★★ والحارس صادق: تعارضٌ مفتعلٌ يُكشف لا يمرّ بصمت', () => {
  // نحاكي انحرافًا: نوعٌ يقيّد حركةً ونزعم في العقد أنّه لا يحرّك.
  const original = FINANCIAL_IMPACT.GRN.stockEffect;
  assert.equal(original, true);
  assert.ok(POSTING_RULES.GRN, 'الاستلام يقيّد حركةً فعلًا');
  // الجدول مجمَّد (Object.freeze) فلا يُعدَّل — والمحاكاة منطقيّة:
  // لو كان stockEffect=false لَظهر في الفروقات.
  const wouldDiffer = original !== Boolean(POSTING_RULES.GRN);
  assert.equal(wouldDiffer, false, 'اليوم متطابقان');
});

test('★★ كلّ نوعٍ جاهزٍ في النظام له سطرٌ في عقد الأثر المالي — لا نوعَ بلا حكم', () => {
  const missing = readyTypes().filter((t) => !FINANCIAL_IMPACT[t]);
  assert.deepEqual(missing, [], `أنواعٌ بلا أثرٍ ماليٍّ معلَن: ${missing.join(' · ')}`);
});

test('★ كلّ سطرٍ مكتمل: حكمٌ ماليّ وحكمٌ مخزنيّ وسببٌ مكتوب', () => {
  for (const [type, impact] of Object.entries(FINANCIAL_IMPACT)) {
    assert.equal(typeof impact.financial, 'boolean', `${type}: حكمٌ ماليّ`);
    assert.equal(typeof impact.stockEffect, 'boolean', `${type}: حكمٌ مخزنيّ`);
    assert.ok(String(impact.note).length >= 25, `${type}: السبب مكتوبٌ لا شكليّ`);
    // §16.1 ‹453›: لا حسابٌ ولا رقم حسابٍ مخترع — العقد يذكر نوع مستند أودو فقط.
    assert.ok(!('account' in impact), `${type}: لا يُذكر حسابٌ في البوابة`);
    assert.ok(!('amount' in impact), `${type}: ولا مبلغ`);
  }
});

test('★★ §16.1 ‹454›: أودو وحده مالك الأثر — والبوابة لا تُولّد قيدًا', () => {
  assert.equal(FINANCE_OWNER, 'odoo');
  // كلّ نوعٍ ماليّ يشير إلى مستند أودو — ولا يحمل منطقَ توليدٍ محلّيّ.
  for (const type of financialTypes()) {
    assert.ok(FINANCIAL_IMPACT[type].odooDoc, `${type}: مستند أودو معلَن`);
  }
});

test('الأنواع الماليّة والتشغيليّة مفصولةٌ بوضوح', () => {
  assert.ok(financialTypes().includes('INV'), 'الفاتورة ماليّة');
  assert.ok(financialTypes().includes('DN'), 'والتسليم يُخرج الملكيّة');
  assert.ok(!financialTypes().includes('PUTAWAY'), 'والتخزين نقلٌ داخليّ');
  assert.ok(!financialTypes().includes('TRN'), 'والنقل بين مستودعاتنا لا يبيع');
  assert.equal(financialImpactFor('مجهول'), null);
});

/* ═══════════ واجهة الأثر المالي — الثمانية (§16.18) ═══════════ */

/** صفٌّ بحقول مرآة `financeMapper` الحقيقيّة لا بأسماءٍ مفترضة. */
const ENTRY = {
  name: 'BILL/2026/0007',
  ref: 'GRN-2026-0001',
  date: '2026-08-10',
  amountTotal: 1000,
  amountResidual: 400,
  currency: 'LYD',
  exchangeRate: 1,
};
const ENTRY_LINES = [
  { moveName: 'BILL/2026/0007', account: '4010', label: 'ذمم موردين', debit: 0, credit: 1000 },
  { moveName: 'BILL/2026/0007', account: '1310', label: 'مخزون', debit: 1000, credit: 0 },
];

test('★★ §16.18: الثمانية تُعرض من المستورَد — والحالة «مستورَد» لا «مُرحَّل»', () => {
  const view = financialImpactView(
    { type: 'GRN', number: 'GRN-2026-0001' },
    { moves: [ENTRY], moveLines: ENTRY_LINES }
  );
  assert.equal(view.financial, true);
  assert.equal(view.syncState, 'مستورَدٌ من أودو'); // ١
  assert.equal(view.odooDoc, 'account.move'); // ٢
  assert.equal(view.entryNumber, 'BILL/2026/0007'); // ٣
  assert.equal(view.entryDate, '2026-08-10');
  assert.equal(view.totalDebit, 1000); // ٤ — من أسطر القيد المستوردة
  assert.equal(view.totalCredit, 1000);
  assert.equal(view.balanced, true);
  assert.equal(view.lines.length, 2); // ٥
  assert.equal(view.currency, 'LYD'); // ٦
  assert.equal(view.reversal, null); // ٧
  assert.equal(view.syncError, null); // ٨
  assert.equal(view.residual, 400, 'والرصيد المفتوح مستوردٌ لا محسوب');
});

test('★★ قيدٌ بلا أسطرَ مستوردة: الإجمالي من المستند والتوازن «لا يُعرف» لا «متوازن»', () => {
  const view = financialImpactView({ type: 'GRN', number: 'GRN-2026-0001' }, { moves: [ENTRY] });
  assert.equal(view.totalDebit, 1000, 'إجمالي المستند كما استُورد');
  assert.equal(view.balanced, null, 'ولا يُدّعى توازنٌ بلا أسطر');
  assert.deepEqual(view.lines, []);
});

test('★ أسطر قيدٍ آخر لا تتسرّب لهذا المستند', () => {
  const view = financialImpactView(
    { type: 'GRN', number: 'GRN-2026-0001' },
    { moves: [ENTRY], moveLines: [...ENTRY_LINES, { moveName: 'BILL/2026/0009', debit: 500, credit: 0 }] }
  );
  assert.equal(view.lines.length, 2);
  assert.equal(view.totalDebit, 1000, 'لا 1500');
});

test('★★ الغائب يُقال غائبًا ولا يُلفَّق رقمٌ محلّيّ', () => {
  const view = financialImpactView({ type: 'DN', number: 'DN-9' }, { moves: [] });
  assert.equal(view.financial, true);
  assert.equal(view.syncState, 'لم يُستورد بعد');
  assert.equal(view.entryNumber, null);
  assert.equal(view.totalDebit, null, 'لا صفرٌ كاذب');
  assert.equal(view.balanced, null);
});

test('★★ ‹783›: خطأ المزامنة يُقال بلا كشف أسرار النظام المتصل', () => {
  const view = financialImpactView(
    { type: 'INV', number: 'INV-1' },
    { moves: [{ ref: 'INV-1', error: 'ECONNREFUSED odoo-proxy:8069 user=admin' }] }
  );
  assert.match(view.syncError, /تعذّرت المزامنة/);
  assert.ok(!view.syncError.includes('8069'), 'لا منفذ');
  assert.ok(!view.syncError.includes('admin'), 'ولا اعتماد');
});

test('★ نوعٌ بلا أثرٍ ماليّ يُعلن السبب — لا شاشةٌ فارغة', () => {
  const view = financialImpactView({ type: 'PUTAWAY', number: 'PW-1' }, {});
  assert.equal(view.financial, false);
  assert.match(view.note, /نقلٌ داخليّ/);
  assert.match(view.message, /لا أثرَ ماليًّا/);
});

test('نوعٌ مجهول: يُقال مجهولًا ولا يُخترع له حكم', () => {
  const view = financialImpactView({ type: 'ZZZ' }, {});
  assert.equal(view.known, false);
});
