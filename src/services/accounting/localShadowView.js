/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  نموذجُ عرض «ظلِّ» المخزن المحلّيّ — يقرأ ما كتبته الشريحتان الأولى والثانية
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * م٢ · الشريحةُ الثالثة: **القارئُ** الذي يُغلق حلقةَ الكتابة. الشريحةُ الأولى
 * (`localLedgerStore`) تكتب القيدَ، والثانيةُ (`localTreasuryStore`) تكتب الخزينة،
 * وهذه تقرؤهما من المخزن المحلّيّ (SQLite عبر Tauri) وتُشكّلهما للعرض — فيُرى على
 * الجهاز، بلا إنترنت، أنّ الدفترَ متوازنٌ والورديّاتِ مُسكَّرةٌ بفروقِها.
 *
 * ★★★ **للقراءة فقط — صفرُ كتابة.** لا `setDoc` ولا `runTransaction` يُستدعى هنا:
 *     `buildLedger`/`listSessions`/`summary` كلُّها قراءاتٌ خالصة. فلا يمسّ الحيَّ
 *     ولا المخزنَ، ولا يُحسب في عقد «الكاتب الواحد».
 *
 * ★★ **محايدُ الخلفيّة:** يأخذ بابَ بياناتٍ محقونًا يحقّق عقدَ Firestore — في سطح
 *    المكتب فضاءُ أسماء الباب `_db` (الخلفيّةُ `local-sqlite`)، وفي الاختبار
 *    `createLocalDb` على مخزنِ ذاكرةٍ أو SQLite حقيقيّة. فيُبرهَن بلا جهازٍ ولا Rust.
 *
 * ★ **خاملٌ:** ما يُقرأ هو ما كتبته الشريحتان — وهما خاملتان بلا كتابةٍ حيّةٍ بعد،
 *   فالظلُّ فارغٌ في كلّ مكانٍ حتّى القطع (م٣). والأرقامُ تُعاد بالوحدة الكبرى
 *   (`fromMinor`) جاهزةً للعرض، كأختها في `reports.trialBalance`.
 *
 * منطقُ تشكيلٍ خالصٌ فوق بابٍ محقون: بلا Firestore وبلا شبكةٍ هنا.
 */
import { createLocalLedger } from './localLedgerStore.js';
import { createLocalTreasury } from './localTreasuryStore.js';
import { trialBalanceFromEntries } from './reports.js';
import { fromMinor } from './money.js';

/** أرصدةُ الأطراف تحت حسابٍ أساس (AR/AP) → صفوفُ عرضٍ مرتّبةٌ بالرمز، بالوحدة الكبرى. */
function partyRows(ledger, base) {
  return [...ledger.subBalances(base)]
    .map(([code, minor]) => ({ code, balance: fromMinor(minor) }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'ar'));
}

/**
 * عرضُ الدفتر المحلّيّ: عددُ القيود المخزَّنة، ميزانُ المراجعة (مع شارة التوازن)،
 * وأرصدةُ الذمم المدينة (AR) والدائنة (AP). تُبنى من القيود المخزَّنة لا من
 * المستندات — فهي مرآةُ ما كُتب فعلًا، لا إعادةُ اشتقاق.
 */
export async function localLedgerView(db) {
  const ledger = await createLocalLedger(db).buildLedger();
  return {
    entryCount: ledger.entries.length,
    errorCount: ledger.errors.length, // قيودٌ مخزَّنةٌ مرفوضةٌ عند الرَّوز (ينبغي صفرًا)
    trialBalance: trialBalanceFromEntries(ledger.entries),
    receivables: partyRows(ledger, 'AR'),
    payables: partyRows(ledger, 'AP'),
  };
}

/**
 * عرضُ الخزينة المحلّيّة: كلُّ وردية بحالتها ومتوقَّعها ومعدودها وفرقها ومجاميع
 * وسائلها، ومجاميعُ مفتوحةٍ/مُسكَّرةٍ وإجماليُّ الفروق. المتوقَّعُ من محرّك
 * `summarize` نفسِه (البطاقةُ والبنكُ خارجَ الدرج).
 */
export async function localTreasuryView(db) {
  const T = createLocalTreasury(db);
  const sessions = (await T.listSessions()).slice().sort((a, b) => {
    const at = `${a.openedAt || ''}`.localeCompare(`${b.openedAt || ''}`);
    return at !== 0 ? at : String(a.id).localeCompare(String(b.id), 'ar');
  });

  const rows = [];
  let openCount = 0;
  let closedCount = 0;
  let totalVarianceMinor = 0;

  for (const s of sessions) {
    const sum = await T.summary(s.id); // قراءةٌ خالصةٌ — وردية + حركاتها عبر summarize
    const closed = s.state === 'closed';
    if (closed) {
      closedCount += 1;
      totalVarianceMinor += Number(s.variance) || 0;
    } else {
      openCount += 1;
    }
    rows.push({
      id: s.id,
      shift: s.shift || '',
      state: s.state,
      openingBalance: fromMinor(s.openingBalance || 0),
      cashIn: fromMinor(sum ? sum.cashIn : 0),
      cashOut: fromMinor(sum ? sum.cashOut : 0),
      expected: fromMinor(sum ? sum.expectedCash : 0),
      counted: s.countedCash == null ? null : fromMinor(s.countedCash),
      variance: s.variance == null ? null : fromMinor(s.variance),
      byMethod: {
        cash: fromMinor(sum ? sum.byMethod.cash : 0),
        bank: fromMinor(sum ? sum.byMethod.bank : 0),
        card: fromMinor(sum ? sum.byMethod.card : 0),
      },
    });
  }

  return {
    sessionCount: sessions.length,
    openCount,
    closedCount,
    totalVariance: fromMinor(totalVarianceMinor),
    rows,
  };
}

/** العرضُ الكامل: دفترٌ وخزينةٌ من المخزن المحلّيّ، للقراءة فقط. */
export async function localShadowView(db) {
  return {
    ledger: await localLedgerView(db),
    treasury: await localTreasuryView(db),
  };
}

/**
 * حالةُ عرضِ ميزان المراجعة (قرارٌ عرضيٌّ خالصٌ يحرسه اختبار): «ok» متوازنٌ ·
 * «bad» مختلٌّ فعلًا · «unknown» غيرُ معلومٍ بعد (تحميلٌ أو تعذّرُ قراءةٍ فـ`tb`
 * غائب). ★★★ الفصلُ بين «غيرُ معلوم» و«مختلّ» يمنع **إنذارًا أحمرَ كاذبًا** حين
 * يتعذّر القراءةُ لا حين يختلّ الدفترُ فعلًا — فالأحمرُ للتحذير فقط (قاعدة AGENTS)،
 * والدفترُ الفارغُ أو المتعذّرُ ليس «غيرَ متوازن».
 * @returns {'ok'|'bad'|'unknown'}
 */
export function balanceTone(ready, trialBalance) {
  if (!ready || !trialBalance) return 'unknown';
  return trialBalance.balanced ? 'ok' : 'bad';
}
