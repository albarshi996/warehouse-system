/**
 * محرّكُ القيد المزدوج الخالص — نواةُ الدفتر المحليّ (قرار المالك 2026-10-25:
 * «الدفترُ المحليّ يملك المحاسبة»).
 *
 * العقودُ الأربعة (نصّ الخطة §6)، مُمَكْنَنةً لا موصوفة:
 *  ① **متوازن**: مجموعُ المدين = مجموعُ الدائن بالوحدة الصغرى الصحيحة — يُطبق إلى الصفر.
 *  ② **مفتاحٌ فريد** يمنع تكرارَ الحركة عند إعادة المحاولة.
 *  ③ **تصحيحٌ بعكسٍ مرتبط** لا حذفٌ للتاريخ.
 *  ④ **فترةٌ مقفلة**: لا قيدَ قبل T0 (حدّ الافتتاح) — ما قبله رصيدٌ افتتاحيّ.
 *
 * منطق خالص: بلا Firestore وبلا شبكة. الكتابةُ الحيّة والتخزينُ شريحةٌ تالية.
 */
import { OPENING_CUTOFF } from '../locations/postedImport.js';
import { isWholeMinor } from './money.js';
import { accountDef } from './accounts.js';

/** أوّلُ يومٍ يقبله الدفترُ المحليّ — نفسُ حدّ الافتتاح الذي تحتكم إليه البوّابة. */
export const LEDGER_T0 = OPENING_CUTOFF;

const str = (v) => String(v ?? '').trim();
const day = (v) => str(v).slice(0, 10);

/**
 * يتحقّق من قيدٍ واحدٍ ويُعيده مُطبَّعًا، أو يرمي بسببٍ عربيٍّ صريح.
 * المبالغُ كلُّها بالوحدة الصغرى الصحيحة (راجع money.js).
 */
export function postEntry({ key, date, memo = '', lines = [] } = {}) {
  const k = str(key);
  if (!k) throw new Error('قيدٌ بلا مفتاحٍ فريد — المفتاحُ شرطُ منع التكرار');

  const d = day(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`تاريخُ القيد «${date}» ليس بصيغة YYYY-MM-DD`);
  if (d < LEDGER_T0) throw new Error(`فترةٌ مقفلة: ${d} قبل حدّ الافتتاح ${LEDGER_T0} — ما قبله رصيدٌ افتتاحيّ لا قيدٌ جارٍ`);

  if (!Array.isArray(lines) || lines.length < 2) throw new Error('القيدُ المزدوج سطران فأكثر');

  let debit = 0;
  let credit = 0;
  const norm = lines.map((l, i) => {
    const account = str(l?.account);
    if (!account) throw new Error(`السطر ${i + 1}: بلا حساب`);
    if (!accountDef(account)) throw new Error(`السطر ${i + 1}: حسابٌ مجهول «${account}»`);
    const dr = Number(l?.debit) || 0;
    const cr = Number(l?.credit) || 0;
    if (!isWholeMinor(dr) || !isWholeMinor(cr)) throw new Error(`السطر ${i + 1}: المبلغُ بالوحدة الصغرى الصحيحة لا كسرًا عائمًا`);
    if (dr < 0 || cr < 0) throw new Error(`السطر ${i + 1}: لا مبلغَ سالب — النقصُ يكون بالجهة المقابلة`);
    if ((dr > 0) === (cr > 0)) throw new Error(`السطر ${i + 1}: إمّا مدينٌ وإمّا دائن، لا كلاهما ولا صفرُهما`);
    debit += dr;
    credit += cr;
    return { account, party: str(l?.party), debit: dr, credit: cr };
  });

  if (debit !== credit) throw new Error(`قيدٌ غير متوازن: مدين ${debit} ≠ دائن ${credit} (بالوحدة الصغرى)`);
  if (debit === 0) throw new Error('قيدٌ بصفرٍ — لا أثرَ له');

  return { key: k, date: d, memo: str(memo), lines: norm, amount: debit };
}

/**
 * قيدٌ عكسيٌّ مرتبطٌ يُلغي أثرَ قيدٍ مرحّل — لا حذفٌ للأصل ولا تعديل.
 * يبادل المدينَ بالدائن، ويحمل مفتاحًا مشتقًّا ومرجعًا إلى الأصل.
 */
export function reverseEntry(entry, { date, reason = '' } = {}) {
  if (!entry?.key || !Array.isArray(entry?.lines)) throw new Error('لا قيدَ صالحٌ لعكسه');
  const out = postEntry({
    key: `${entry.key}~REV`,
    date: date || entry.date,
    memo: `عكسُ ${entry.key}${reason ? ` — ${reason}` : ''}`,
    lines: entry.lines.map((l) => ({ account: l.account, party: l.party, debit: l.credit, credit: l.debit })),
  });
  out.reverses = entry.key;
  return out;
}

/**
 * دفترٌ متراكمٌ خالص: يقبل القيود، يمنع تكرار المفتاح (القفزُ لا الرفض فلا يُضاعف
 * ولا يتعلّق)، ويجمع أرصدة الحسابات. القيدُ المرفوضُ يُسجَّل في `errors` ولا يُسقط
 * الباقي — فالشاشةُ تُظهر المشكلةَ بدل أن تبتلعها.
 */
export function createLedger() {
  const entries = [];
  const errors = [];
  const byKey = new Map();

  function post(input) {
    const k = str(input?.key);
    if (k && byKey.has(k)) return byKey.get(k); // مفتاحٌ مكرَّر: نفسُ القيد، لا يُضاعف
    try {
      const e = postEntry(input);
      byKey.set(e.key, e);
      entries.push(e);
      return e;
    } catch (err) {
      errors.push({ key: k, message: err.message });
      return null;
    }
  }

  return {
    post,
    postMany(list = []) {
      for (const it of list) post(it);
      return this;
    },
    get entries() {
      return entries;
    },
    get errors() {
      return errors;
    },
    /** رصيدُ حسابٍ (أساسًا كان أو فرعيًّا) بالوحدة الصغرى: مدين − دائن. */
    balanceOf(account) {
      const acc = str(account);
      let bal = 0;
      for (const e of entries) for (const l of e.lines) if (l.account === acc) bal += l.debit - l.credit;
      return bal;
    },
    /** أرصدةُ الأطراف تحت حسابٍ أساس (AR/AP) → Map(code → وحدة صغرى: مدين − دائن). */
    subBalances(base) {
      const pre = `${str(base)}:`;
      const map = new Map();
      for (const e of entries)
        for (const l of e.lines)
          if (l.account.startsWith(pre)) {
            const code = l.account.slice(pre.length);
            map.set(code, (map.get(code) || 0) + l.debit - l.credit);
          }
      return map;
    },
  };
}
