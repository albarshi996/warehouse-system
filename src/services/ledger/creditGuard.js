/**
 * حارس حدّ الائتمان (م٤-د · يسدّ ف‑٢).
 *
 * ═══ العطب ═══
 * `creditLimit` يُخزَّن ويُعرض في بطاقة العميل، و**صفرُ استدعاءٍ له في منطق
 * البيع**. فالسقف رقمٌ للزينة: يبيع المندوب لعميلٍ بلغ ضعفَ سقفه ولا يعترض
 * شيء، ولا يُكتشف إلّا حين يُطلب التحصيل فلا يُحصَّل.
 *
 * ═══ ثلاثة مصادر تلتقي هنا ═══
 * ① **رصيدٌ حقيقيّ** من دفتر الذمم (م٤-ج) لا لقطة إكسل.
 * ② **سقفٌ** من ماستر الشركاء.
 * ③ **سياسةٌ** من `settings.credit` (م١-ج): متى يُنذَر ومتى يُمنع ومن يفكّ.
 * ولو نقص أحدها لصار الحكم تخمينًا — فغيابُ أيٍّ منها يعني «لا منع» لا «منعٌ
 * احتياطيّ»: نظامٌ يمنع بيعًا لأنّه يجهل رصيدًا يوقف تجارةً بلا سبب.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { creditVerdict } from '../settings/settingsModel.js';
import { ledgerRuleFor } from './partnerLedger.js';

const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const up = (v) => String(v ?? '').trim().toUpperCase();

/** رصيد طرفٍ من سطور الدفتر — موجبٌ يعني «عليه لنا». */
export function balanceOf(entries = [], partyCode, opening = 0) {
  const code = up(partyCode);
  if (!code) return money(opening);
  return money(
    (Array.isArray(entries) ? entries : [])
      .filter((e) => up(e.partyCode) === code)
      .reduce((sum, e) => sum + num(e.delta), money(opening))
  );
}

/** سقف ائتمان شريكٍ من سجلّه. صفرٌ أو غيابٌ = لا سقف مُدخَل. */
export function limitOf(partner) {
  return Math.max(0, num(partner?.creditLimit));
}

/** المبلغ الذي يضيفه هذا المستند إلى ذمّة الطرف — من جدول قواعد الذمم نفسه. */
export function documentExposure(doc) {
  const rule = ledgerRuleFor(doc?.type);
  if (!rule || rule.direction !== 'debit') return 0;
  return money(rule.amount(doc));
}

/**
 * الحكم الكامل على بيعٍ لعميل.
 *
 * @param {object} args
 * @param {object} args.doc المستند قيد الإعداد
 * @param {object[]} args.entries سطور دفتر الذمم
 * @param {object} args.partner سجلّ العميل (فيه `creditLimit`)
 * @param {object} args.settings سياسات التشغيل
 * @param {string} args.role دور الفاعل
 * @param {number} [args.opening] الرصيد الافتتاحيّ
 * @returns {{ok:boolean, verdict:string, balance:number, limit:number, addition:number, after:number, usedPct:number, unlockRole:string, message:string, canUnlock:boolean}}
 */
export function creditCheck({ doc, entries = [], partner = null, settings = null, role = '', opening = 0 }) {
  const rule = ledgerRuleFor(doc?.type);
  const idle = {
    ok: true, verdict: 'ok', balance: 0, limit: 0, addition: 0, after: 0,
    usedPct: 0, unlockRole: '', message: '', canUnlock: false,
  };
  // ما لا يزيد ذمّةً لا يُحاكَم: سند القبض ينقصها، والاستلام ذمّةُ مورّدٍ لا عميل.
  if (!rule || rule.party !== 'customer' || rule.direction !== 'debit') return idle;

  const code = up(doc?.header?.customerCode || doc?.header?.customer);
  if (!code) return idle; // بلا عميلٍ لا سقف

  const balance = balanceOf(entries, code, opening);
  const limit = limitOf(partner);
  const addition = documentExposure(doc);
  const v = creditVerdict(settings, { balance, limit, addition });

  const canUnlock = role === 'admin' || role === v.unlockRole;
  return {
    ok: v.verdict !== 'block' || canUnlock,
    verdict: v.verdict,
    balance,
    limit,
    addition,
    after: money(balance + addition),
    usedPct: v.usedPct,
    unlockRole: v.unlockRole,
    canUnlock,
    message: v.message
      ? `${v.message} (الرصيد ${balance} + ${addition} من ${limit || 'بلا سقف'})`
      : '',
  };
}

/**
 * ما يُعرض للمندوب **قبل** البيع (م‑٥ يستعمله أيضًا): مديونيّة العميل بلمحة.
 * لا يمنع شيئًا — يُخبر فقط. ومن باع وهو يعرف غير من باع وهو يجهل.
 */
export function customerExposure({ entries = [], partner = null, partyCode, settings = null, opening = 0 }) {
  const balance = balanceOf(entries, partyCode, opening);
  const limit = limitOf(partner);
  const v = creditVerdict(settings, { balance, limit, addition: 0 });
  return {
    partyCode: up(partyCode),
    balance,
    limit,
    available: limit > 0 ? money(limit - balance) : null,
    usedPct: v.usedPct,
    verdict: v.verdict,
  };
}
