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

/** وقائعُ المال في هذه الشريحة، وأثرُها المزدوج. */
export const CASH_EVENTS = Object.freeze({
  RCP: { party: 'customer', sub: 'AR', cashSide: 'debit', labelAr: 'سند قبض' },
  SPV: { party: 'supplier', sub: 'AP', cashSide: 'credit', labelAr: 'سداد مورّد' },
});

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
  return entry;
}

/** قيودُ القبض/السداد من مجموعة مستندات — المعتمَدة وحدها، وما قبل T0 يُسقط بهدوء. */
export function deriveEntries(documents = [], { states = ['done', 'approved'], cashAccount = 'CASH' } = {}) {
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state) && CASH_EVENTS[d?.type])
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
  INV: 'SALES', VSI: 'SALES', VCS: 'SALES',
  RCP: 'CASH', RCV: 'CASH_IN_TRANSIT',
  CN: 'SALES_RETURNS', RET: 'SALES_RETURNS', CRN: 'SALES_RETURNS',
  GRN: 'INVENTORY', SPV: 'CASH', SRN: 'INVENTORY',
});

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
  const counterpart = COUNTERPART[ple.docType];
  if (!counterpart) return null;
  const units = toMinor(ple.amount);
  if (units <= 0) return null;

  const partyAcc = subAccount(ple.party === 'customer' ? 'AR' : 'AP', ple.partyCode);
  const outstandingUp = ple.direction === 'debit'; // يزيد ما على الطرف
  const partyIsDebit = ple.party === 'customer' ? outstandingUp : !outstandingUp;
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
  return entry;
}

/** قيودُ الدورة الكاملة من مجموعة مستندات — المعتمَدة وحدها، وما قبل T0 يُسقط. */
export function deriveLedgerEntries(documents = [], { states = ['done', 'approved'] } = {}) {
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state) && COUNTERPART[d?.type])
    .map((d) => {
      try {
        return deriveLedgerEntry(d);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
