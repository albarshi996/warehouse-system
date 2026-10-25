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
