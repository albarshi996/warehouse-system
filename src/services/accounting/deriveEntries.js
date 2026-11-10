/**
 * اشتقاقُ القيد المزدوج من واقعةٍ ماليّةٍ قائمة — القبضُ والسداد (الشريحة الأولى).
 *
 * ★★★ **مصدرٌ واحدٌ للرقم**: المبلغُ والطرفُ والتاريخ تُقرأ من دفتر الذمم نفسه
 * (`partnerLedger.entryFor`)، فلا رقمَ ثانٍ ينحرف — ومن ثمّ يطابق القيدُ الذمّةَ
 * **بالبناء** لا بالصدفة. عرضٌ فقط: لا كتابةَ حيّة ولا مساسَ بأودو ولا بالذمم.
 *
 *  القبض (RCP): مدينٌ النقد، دائنٌ ذمّةُ العميل  (قبضنا نقدًا فنقصت ذمّتُه).
 *  السداد (SPV): مدينٌ ذمّةُ المورّد، دائنٌ النقد (سدّدنا نقدًا فنقصت ذمّتُه).
 *
 * منطق خالص.
 */
import { entryFor } from '../ledger/partnerLedger.js';
import { postEntry } from './journal.js';
import { subAccount } from './accounts.js';
import { toMinor } from './money.js';
import { normalizeCategory, categoryAccount } from './expenseCategories.js';

/** وقائعُ المال في هذه الشريحة، وأثرُها المزدوج. */
export const CASH_EVENTS = Object.freeze({
  RCP: { party: 'customer', sub: 'AR', cashSide: 'debit', labelAr: 'سند قبض' },
  SPV: { party: 'supplier', sub: 'AP', cashSide: 'credit', labelAr: 'سداد مورّد' },
});

/** رمزُ محلِّ المستند (وسمُ المرحلة ص) — من الجذر أو الترويسة، أو null. */
export const shopOfDoc = (doc) => doc?.shop ?? doc?.header?.shop ?? null;

/** هل طُلب ترشيحٌ بمحلٍّ بعينه؟ (null/فارغ = كلُّ المحلّات، فلا ترشيح). */
const shopScoped = (shop) => shop !== undefined && shop !== null && shop !== '';

/**
 * قيدٌ مزدوجٌ من مستند قبضٍ/سداد، أو null إن لم يكن منهما أو بلا مبلغٍ موجب.
 * قد يرمي `postEntry` إن كان تاريخُ المستند قبل T0 (فترةٌ مقفلة) — والمُجمِّع يلتقطه.
 */
export function deriveEntry(doc, { cashAccount = 'CASH' } = {}) {
  const spec = CASH_EVENTS[doc?.type];
  if (!spec) return null;

  const ple = entryFor(doc); // المصدرُ الواحد: المبلغ · الطرف · التاريخ · المعرّف الحتميّ
  if (!ple) return null;

  const units = toMinor(ple.amount);
  if (units <= 0) return null;

  const partyAcc = subAccount(spec.sub, ple.partyCode);
  const lines =
    spec.cashSide === 'debit'
      ? [
          { account: cashAccount, debit: units, credit: 0 },
          { account: partyAcc, party: ple.partyCode, debit: 0, credit: units },
        ]
      : [
          { account: partyAcc, party: ple.partyCode, debit: units, credit: 0 },
          { account: cashAccount, debit: 0, credit: units },
        ];

  const entry = postEntry({ key: ple.id, date: ple.date, memo: `${spec.labelAr} ${ple.docNumber}`.trim(), lines });
  entry.party = spec.party;
  entry.partyCode = ple.partyCode;
  entry.docType = ple.docType;
  entry.shop = shopOfDoc(doc); // وسمُ المحلّ (ص) — يُحمَل على القيد فيُخزَّن ويُرشَّح
  return entry;
}

/**
 * قيودُ القبض/السداد من مجموعة مستندات — المعتمَدة وحدها، وما قبل T0 يُسقط بهدوء.
 * ص: ترشيحٌ اختياريٌّ بمحلٍّ (`shop`) — الافتراضُ كلُّ المحلّات (بلا ترشيح).
 */
export function deriveEntries(documents = [], { states = ['done', 'approved'], cashAccount = 'CASH', shop } = {}) {
  const scoped = shopScoped(shop);
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state) && CASH_EVENTS[d?.type])
    .filter((d) => !scoped || shopOfDoc(d) === shop)
    .map((d) => {
      try {
        return deriveEntry(d, { cashAccount });
      } catch {
        return null; // قبل T0 أو مستندٌ معطوب — لا يُسقط الباقي
      }
    })
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * الدورةُ الكاملة — كلُّ أنواع دفتر الذمم تصير قيدًا مزدوجًا (الشريحة الثانية).
 *
 * الطرفُ المقابلُ لكلّ نوع: البيعُ إيرادٌ، والمرتجعُ مرتجعَ مبيعاتٍ (لا مصروف)،
 * واستلامُ البضاعة مخزونًا، والتحصيلُ الميدانيُّ نقدًا في عهدة المندوب. وحركةُ
 * ذمّة الطرف (مدين/دائن) تُطابق دفترَ الذمم بالبناء لأنّ المبلغَ واتّجاهَه منه.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** الطرفُ المقابل لكلّ نوعٍ في دفتر الذمم (يغطّي أنواع `LEDGER_RULES` كلَّها). */
export const COUNTERPART = Object.freeze({
  INV: 'SALES', VSI: 'SALES', VCS: 'SALES', KSH: 'SALES',
  RCP: 'CASH', RCV: 'CASH_IN_TRANSIT',
  CN: 'SALES_RETURNS', RET: 'SALES_RETURNS', CRN: 'SALES_RETURNS',
  GRN: 'INVENTORY', SPV: 'CASH', SRN: 'INVENTORY',
  // ذ — فاتورةُ المورّد: «القيمة» مشترياتٌ (لا مخزون)، و«الأصناف» مخزون.
  SINV: 'PURCHASES', SINVI: 'INVENTORY',
  // ذ — سلفُ العامل: نقدٌ يخرج ثمّ يعود. الطرفُ المقابلُ نقديٌّ، **ويُحَلّ بطريقة
  // الدفع** (نقدًا من الصندوق، تحويلًا من البنك) في `deriveLedgerEntry` — فلا
  // يُثبَّت على الصندوق كما كان (راجعته مراجعةٌ عدائيّةٌ 2026-11-02).
  ADV: 'CASH', ADVR: 'CASH',
});

/** حسابُ الطرف الأساس في الدفتر المزدوج — العميلُ ذمّةٌ مدينة، المورّدُ دائنة، العاملُ سلفةٌ عليه. */
function partyBaseAccount(party) {
  if (party === 'customer') return 'AR';
  if (party === 'worker') return 'WORKER_ADV';
  return 'AP';
}

/** هل حسابُ الطرف أصلٌ (يزيد بالمدين)؟ العميلُ والعاملُ أصلٌ، المورّدُ التزام. */
function partyIsAssetSide(party) {
  return party === 'customer' || party === 'worker';
}

/** أنواعُ الدورة الكاملة (لاستماع الشاشة). */
export const LEDGER_DOC_TYPES = Object.freeze(Object.keys(COUNTERPART));

/**
 * قيدٌ مزدوجٌ من أيّ مستندٍ له أثرٌ في دفتر الذمم، أو null.
 * جهةُ ذمّة الطرف:
 *   العميل أصل (AR): زيادةُ ذمّته = مدين، نقصُها = دائن.
 *   المورّد التزام (AP): زيادةُ ما نَدينُه = دائن، نقصُه = مدين.
 */
export function deriveLedgerEntry(doc) {
  const ple = entryFor(doc); // المصدرُ الواحد: المبلغ · الطرف · الاتّجاه · التاريخ · المعرّف
  if (!ple) return null;
  let counterpart = COUNTERPART[ple.docType];
  if (!counterpart) return null;
  // ذ — سلفُ العامل (ADV/ADVR) تحترم طريقةَ الدفع كمسار المصروف: التحويلُ المصرفيّ
  // يصيب البنكَ لا الصندوق. محصورٌ بطرف العامل فلا يمسّ RCP/SPV القائمة.
  if (ple.party === 'worker' && counterpart === 'CASH') counterpart = cashSideOf(doc);
  const units = toMinor(ple.amount);
  if (units <= 0) return null;

  const partyAcc = subAccount(partyBaseAccount(ple.party), ple.partyCode);
  const outstandingUp = ple.direction === 'debit'; // يزيد ما على الطرف
  const partyIsDebit = partyIsAssetSide(ple.party) ? outstandingUp : !outstandingUp;
  const partyDebit = partyIsDebit ? units : 0;
  const partyCredit = partyIsDebit ? 0 : units;

  const entry = postEntry({
    key: ple.id,
    date: ple.date,
    memo: `${ple.labelAr} ${ple.docNumber}`.trim(),
    lines: [
      { account: partyAcc, party: ple.partyCode, debit: partyDebit, credit: partyCredit },
      { account: counterpart, debit: partyCredit, credit: partyDebit },
    ],
  });
  entry.party = ple.party;
  entry.partyCode = ple.partyCode;
  entry.docType = ple.docType;
  entry.shop = shopOfDoc(doc); // وسمُ المحلّ (ص) — يُحمَل على القيد فيُخزَّن ويُرشَّح
  return entry;
}

/**
 * قيودُ الدورة الكاملة من مجموعة مستندات — المعتمَدة وحدها، وما قبل T0 يُسقط.
 * ص: ترشيحٌ اختياريٌّ بمحلٍّ (`shop`) — الافتراضُ كلُّ المحلّات (بلا ترشيح).
 */
export function deriveLedgerEntries(documents = [], { states = ['done', 'approved'], shop } = {}) {
  const scoped = shopScoped(shop);
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state) && COUNTERPART[d?.type])
    .filter((d) => !scoped || shopOfDoc(d) === shop)
    .map((d) => {
      try {
        return deriveLedgerEntry(d);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * المصروفاتُ النقديّة (ذ) — راتبٌ ومصروفٌ مبوّب: مدينٌ حسابُ المصروف، دائنٌ
 * النقدُ (أو البنك). لا طرفَ لها في دفتر الذمم (مصروفٌ لا دَين)، فمسارُها
 * مستقلٌّ عن `entryFor`/`COUNTERPART` — لكنّه يُقيَّد في الدفتر المزدوج نفسِه.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * وقائعُ المصروف النقديّ وحسابُها المدين:
 *   `categorized` — الفئةُ من رأس المستند (EXP: التبويبُ الهجين).
 *   `fixedCategory` — فئةٌ ثابتةٌ للنوع (مستنداتُ التشغيل س: نقلٌ/عمالةٌ/نظافة).
 *   وإلّا `debit` حسابٌ صريح (SAL: الرواتب).
 * و`reportCategory` فئةُ التقرير لغير المبوّب (الراتبُ يُجمع تحت «رواتب»).
 */
export const EXPENSE_EVENTS = Object.freeze({
  SAL: { debit: 'SALARIES', reportCategory: 'salaries', labelAr: 'صرف راتب' },
  EXP: { debit: 'EXPENSE', categorized: true, labelAr: 'مصروف' },
  // س — مستنداتُ التشغيل: لكلّ نوعٍ فئتُه الثابتة في حساب المصروفات المبوّب.
  TAXI: { debit: 'EXPENSE', fixedCategory: 'transport', labelAr: 'نقل/تاكسي' },
  LABOR: { debit: 'EXPENSE', fixedCategory: 'handling', labelAr: 'أجرة عمالة' },
  CLEAN: { debit: 'EXPENSE', fixedCategory: 'cleaning', labelAr: 'نظافة' },
});

/** مبلغُ مستند المصروف — من رأسه (قيمةٌ مفردةٌ لا بنود). */
export function expenseAmount(doc) {
  const h = doc?.header || {};
  return Number(h.amount ?? h.total ?? h.amountPaid) || 0;
}

/** حسابُ المصروف المدين لمستندٍ (مبوّبًا بفئته الثابتة أو المختارة، أو حسابُه الصريح). */
function expenseDebitAccount(doc) {
  const spec = EXPENSE_EVENTS[doc?.type];
  if (!spec) return '';
  const catKey = spec.fixedCategory || (spec.categorized ? normalizeCategory(doc?.header?.category) : '');
  return catKey ? subAccount(categoryAccount(catKey), catKey.toUpperCase()) : spec.debit;
}

/** فئةُ المصروف للتقرير (مُطبّعةً) — للتجميع في لوحة المصاريف، أو '' لغير المعروف. */
export function expenseCategoryOf(doc) {
  const spec = EXPENSE_EVENTS[doc?.type];
  if (!spec) return '';
  if (spec.fixedCategory) return spec.fixedCategory;
  if (spec.categorized) return normalizeCategory(doc?.header?.category);
  return spec.reportCategory || '';
}

/** حسابُ النقد بحسب طريقة الدفع — التحويلُ المصرفيّ بنكٌ، وما عداه نقد. */
function cashSideOf(doc) {
  const m = String(doc?.header?.paymentMethod || doc?.header?.method || '').trim();
  return m === 'تحويل مصرفي' ? 'BANK' : 'CASH';
}

/** أنواعُ المصروف النقديّ (لاستماع الشاشة). */
export const EXPENSE_DOC_TYPES = Object.freeze(Object.keys(EXPENSE_EVENTS));

/**
 * قيدٌ مزدوجٌ من مستند مصروفٍ نقديّ (SAL/EXP)، أو null. مدينٌ حسابُ المصروف
 * (مبوّبًا بالفئة في EXP)، دائنٌ النقدُ أو البنك. المعرّفُ حتميٌّ فالإعادةُ
 * تُتخطّى، والمحلُّ يُوسَم. قد يرمي `postEntry` قبل T0 — والمُجمِّعُ يلتقطه.
 */
export function deriveExpenseEntry(doc) {
  const spec = EXPENSE_EVENTS[doc?.type];
  if (!spec) return null;

  const units = toMinor(expenseAmount(doc));
  if (units <= 0) return null;

  const h = doc?.header || {};
  const debitAccount = expenseDebitAccount(doc);
  const worker = String(h.workerCode || h.worker || '').trim();
  const date = String(
    h.payDate || h.expenseDate || h.tripDate || h.workDate || h.serviceDate || h.date || h.paymentDate || ''
  ).slice(0, 10);

  const entry = postEntry({
    key: `${doc.type}__${String(doc.id ?? '')}`,
    date,
    memo: `${spec.labelAr} ${String(doc?.number || '')}`.trim(),
    lines: [
      { account: debitAccount, party: worker, debit: units, credit: 0 },
      { account: cashSideOf(doc), debit: 0, credit: units },
    ],
  });
  entry.docType = doc.type;
  entry.docId = String(doc.id ?? '');
  entry.shop = shopOfDoc(doc);
  return entry;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * المبيعاتُ النقديّة (‹POS م٧› · كاشير التجزئة) — بيعٌ نقديٌّ من نقطة بيعٍ ثابتة:
 * مدينٌ النقدُ (أو البنك بالبطاقة/التحويل)، دائنٌ المبيعات. لا طرفَ في دفتر الذمم
 * (بيعٌ نقديٌّ لا دَين، بخلاف INV/VSI الآجلَين) — فمسارُه مستقلٌّ كالمصروف النقديّ،
 * ويُقيَّد في الدفتر المزدوج نفسِه. والخصمُ المخزنيُّ يقع بمسار `POSTING_RULES`
 * (مخزن→خارج) لا هنا — فالمخزونُ لا يُقيَّد في الدفتر المزدوج (كبقيّة المبيعات).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** وقائعُ البيع النقديّ. */
export const SALE_EVENTS = Object.freeze({
  POS: { labelAr: 'بيع نقديّ' },
});

/** أنواعُ البيع النقديّ (لاستماع الشاشة والتوجيه). */
export const SALE_DOC_TYPES = Object.freeze(Object.keys(SALE_EVENTS));

/** حسابُ النقد لمستند البيع: نقدًا=الصندوق، وبطاقة/تحويل=البنك. */
function saleCashAccount(doc) {
  return String(doc?.header?.paymentMethod || '').trim() === 'نقدًا' ? 'CASH' : 'BANK';
}

/** مبلغُ البيع — إجماليُّ السلّة المحسوبُ المختومُ في الرأس وقت الإنجاز. */
export function saleAmount(doc) {
  const h = doc?.header || {};
  return Number(h.grandTotal ?? h.total ?? h.amount) || 0;
}

/**
 * قيدٌ مزدوجٌ من مستند بيعٍ نقديّ (POS)، أو null. مدينٌ النقدُ/البنكُ (بطريقة الدفع)،
 * دائنٌ المبيعات. المعرّفُ حتميٌّ فالإعادةُ تُتخطّى، والمحلُّ يُوسَم. قد يرمي
 * `postEntry` قبل T0 — والمُجمِّعُ يلتقطه.
 */
export function deriveSaleEntry(doc) {
  if (!SALE_EVENTS[doc?.type]) return null;
  const units = toMinor(saleAmount(doc));
  if (units <= 0) return null;

  const h = doc?.header || {};
  const date = String(h.saleDate || h.date || '').slice(0, 10);
  const entry = postEntry({
    key: `${doc.type}__${String(doc.id ?? '')}`,
    date,
    memo: `بيع نقديّ ${String(doc?.number || '')}`.trim(),
    lines: [
      { account: saleCashAccount(doc), debit: units, credit: 0 },
      { account: 'SALES', debit: 0, credit: units },
    ],
  });
  entry.docType = doc.type;
  entry.docId = String(doc.id ?? '');
  entry.shop = shopOfDoc(doc);
  return entry;
}

/** هل لهذا النوع قيدٌ مزدوجٌ محلّيّ (ذمّةٌ · مصروفٌ · بيعٌ نقديّ)؟ بوّابةُ تفعيل الكتابة. */
export function isPostableType(type) {
  return Boolean(COUNTERPART[type] || EXPENSE_EVENTS[type] || SALE_EVENTS[type]);
}
