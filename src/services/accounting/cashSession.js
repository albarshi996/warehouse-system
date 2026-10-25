/**
 * الخزينة والتسكير (§7 من خطّة الدفتر المحليّ) — منطقٌ خالص.
 *
 * العقودُ من نصّ الخطّة، مُمَكْنَنةً:
 *  • **المتوقَّع = البداية + كلُّ واردٍ نقديّ − كلُّ صادرٍ نقديّ**، ولكلّ حركةٍ نوعٌ
 *    يمنع حسابَها مرّتين.
 *  • **البطاقةُ والبنكُ لا يدخلان درجَ النقد** — تُتابَع على حدة.
 *  • **الفرقُ يحتاج سببًا واعتمادًا**، ولا يتحوّل تلقائيًّا دَينًا على الموظّف.
 *  • **لا إغلاقان متزامنان** ولا قيدٌ يتسلّل بعد القطع.
 *  • **يدعم ما بعد منتصف الليل**: نافذةُ العمل بالطوابع لا باليوم التقويميّ.
 *
 * كلُّ المبالغ بالوحدة الصغرى الصحيحة (راجع money.js). بلا Firestore وبلا شبكة.
 */
import { isWholeMinor } from './money.js';

const str = (v) => String(v ?? '').trim();

/** أنواعُ حركة الخزينة واتّجاهُها (وارد/صادر على الدرج). */
export const CASH_MOVEMENTS = Object.freeze({
  customer_receipt: { dir: 'in', labelAr: 'قبض عميل' },
  cash_sale: { dir: 'in', labelAr: 'بيع نقديّ' },
  deposit_in: { dir: 'in', labelAr: 'إيداع وارد' },
  expense: { dir: 'out', labelAr: 'مصروف' },
  supplier_payment: { dir: 'out', labelAr: 'سداد مورّد' },
  withdrawal: { dir: 'out', labelAr: 'سحب' },
  transfer_out: { dir: 'out', labelAr: 'تحويل للخزينة الرئيسيّة' },
  bank_deposit: { dir: 'out', labelAr: 'إيداع بنكيّ' },
});

/** وسائلُ السداد — النقدُ وحدَه يدخل درجَ الوردية. */
export const PAYMENT_METHODS = Object.freeze(['cash', 'bank', 'card']);

/** يفتح ورديةً بحالة `open` ورصيدِ بدايةٍ صحيح. */
export function openSession({ id, shift = '', openingBalance = 0, openedBy = '', openedAt = '' } = {}) {
  if (!str(id)) throw new Error('الوردية تحتاج معرّفًا فريدًا');
  if (!isWholeMinor(openingBalance) || openingBalance < 0) {
    throw new Error('رصيدُ البداية بالوحدة الصغرى الصحيحة وغيرُ سالب');
  }
  return {
    id: str(id),
    shift: str(shift),
    openingBalance,
    openedBy: str(openedBy),
    openedAt: str(openedAt),
    state: 'open',
  };
}

/** يتحقّق من حركةٍ واحدة، أو يرمي بسببٍ عربيّ. */
export function validateMovement({ kind, method, amount } = {}) {
  if (!CASH_MOVEMENTS[kind]) throw new Error(`حركةُ خزينةٍ مجهولة: «${kind}»`);
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`وسيلةُ سدادٍ مجهولة: «${method}»`);
  if (!isWholeMinor(amount) || amount <= 0) throw new Error('مبلغُ الحركة بالوحدة الصغرى الصحيحة الموجبة');
  return true;
}

/**
 * ملخّصٌ خالص للوردية: الواردُ والصادرُ النقديّان والمتوقَّع في الدرج، ومجاميعُ
 * كلّ وسيلةٍ على حدة. **النقدُ وحده يدخل الدرج**؛ البطاقةُ والبنكُ يُتابَعان منفصلَين.
 */
export function summarize(session, movements = []) {
  let cashIn = 0;
  let cashOut = 0;
  const byMethod = { cash: 0, bank: 0, card: 0 };
  for (const m of movements) {
    validateMovement(m);
    const dir = CASH_MOVEMENTS[m.kind].dir;
    byMethod[m.method] += dir === 'in' ? m.amount : -m.amount;
    if (m.method !== 'cash') continue; // لا تدخل درجَ النقد
    if (dir === 'in') cashIn += m.amount;
    else cashOut += m.amount;
  }
  const opening = session?.openingBalance || 0;
  return { openingBalance: opening, cashIn, cashOut, expectedCash: opening + cashIn - cashOut, byMethod };
}

/**
 * التسكير: يقارن المعدودَ بالمتوقَّع. الفرقُ موجبٌ فائضٌ وسالبٌ عجز، ويحتاج سببًا
 * قبل القبول — **ولا يتحوّل تلقائيًّا دَينًا على الموظّف**. ولا تُسكَّر ورديةٌ غيرُ
 * مفتوحة (يمنع إغلاقَين متزامنَين).
 */
export function closeSession(session, movements = [], { countedCash, reason = '', closedBy = '', closedAt = '' } = {}) {
  if (!session || session.state !== 'open') {
    throw new Error('لا تُسكَّر وردية غير مفتوحة — ولا إغلاقان متزامنان على وردية واحدة');
  }
  if (!isWholeMinor(countedCash) || countedCash < 0) {
    throw new Error('النقدُ المعدود بالوحدة الصغرى الصحيحة وغيرُ سالب');
  }
  const { expectedCash, cashIn, cashOut, byMethod } = summarize(session, movements);
  const variance = countedCash - expectedCash;
  if (variance !== 0 && !str(reason)) {
    throw new Error('الفرقُ يحتاج سببًا واعتمادًا — ولا يتحوّل تلقائيًّا دَينًا على الموظّف');
  }
  return {
    sessionId: session.id,
    openingBalance: session.openingBalance,
    cashIn,
    cashOut,
    expectedCash,
    countedCash,
    variance,
    byMethod,
    reason: str(reason),
    closedBy: str(closedBy),
    closedAt: str(closedAt),
    state: 'closed',
  };
}

/** يُعيد الوردية مُسكَّرة — ولا إغلاقَ ثانٍ (يحرس التزامن على مستوى الحالة). */
export function markClosed(session) {
  if (!session || session.state !== 'open') throw new Error('الوردية ليست مفتوحة — لا إغلاق ثانٍ');
  return { ...session, state: 'closed' };
}

/**
 * حركاتُ نافذة العمل (تدعم ما بعد منتصف الليل): ما طابعُه بين الفتح `from` والقطع
 * `to`. ما يتسلّل **عند القطع أو بعده** يُستبعد (`at >= to`) فلا يُحسب في تسكيرٍ أُقفل.
 */
export function movementsInWindow(movements = [], { from = '', to = '' } = {}) {
  const f = str(from);
  const t = str(to);
  return (movements || []).filter((m) => {
    const at = str(m?.at);
    if (!at) return false;
    if (f && at < f) return false;
    if (t && at >= t) return false;
    return true;
  });
}
