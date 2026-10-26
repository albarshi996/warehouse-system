/**
 * تقاريرُ القيد الخالصة — نظيرُ دوالّ SQL (022) في الواجهة: ميزانُ المراجعة
 * وأرصدةُ الحسابات من المستندات، لعرضٍ حيٍّ بلا قاعدة. منطق خالص.
 */
import { createLedger } from './journal.js';
import { deriveLedgerEntries } from './deriveEntries.js';
import { fromMinor } from './money.js';

/**
 * ميزانُ المراجعة من مستندات الدورة: لكلّ حسابٍ مدينُه ودائنُه ورصيدُه.
 * **الثابتةُ**: مجموعُ الأرصدة = صفرٌ في دفترٍ متوازن (يُعاد `balanced`).
 * @returns {{rows:Array<{account,debit,credit,balance}>, balanced:boolean, accounts:number}}
 */
export function trialBalance(documents = [], opts = {}) {
  const L = createLedger().postMany(deriveLedgerEntries(documents, opts));
  const map = new Map();
  for (const e of L.entries) {
    for (const l of e.lines) {
      const a = map.get(l.account) || { account: l.account, debitMinor: 0, creditMinor: 0 };
      a.debitMinor += l.debit;
      a.creditMinor += l.credit;
      map.set(l.account, a);
    }
  }

  let totalMinor = 0;
  const rows = [...map.values()]
    .map((a) => {
      totalMinor += a.debitMinor - a.creditMinor;
      return {
        account: a.account,
        debit: fromMinor(a.debitMinor),
        credit: fromMinor(a.creditMinor),
        balance: fromMinor(a.debitMinor - a.creditMinor),
      };
    })
    .sort((x, y) => x.account.localeCompare(y.account, 'ar'));

  return { rows, balanced: totalMinor === 0, accounts: rows.length };
}
