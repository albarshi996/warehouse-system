/**
 * حساب المندوب النقديّ (م٥-أ · يسدّ ف‑١٠).
 *
 * ═══ الفجوة ═══
 * الميدان بلا بُعدٍ ماليّ: المندوب يبيع ويحصّل ولا يعرف كم على عميله ولا كم في
 * عهدته. والمال يمرّ من يده إلى الخزينة بلا حسابٍ وسيط — فإن نقص لم يُعرف متى
 * نقص ولا من أيّ رحلة.
 *
 * ═══ الحساب الوسيط ═══
 * كلّ مندوبٍ حسابٌ نقديّ: **يزيد** بما حصّله (`RCV`) وبما باعه نقدًا (`VSI`
 * نقديّة)، و**ينقص** بما أودعه في تسوية الرحلة (`VSR`). والرصيد الباقي = ما في
 * جيبه الآن. ورقمٌ باقٍ بعد إقفال الرحلة عجزٌ يُسأل عنه لا سهوٌ يُنسى.
 *
 * ═══ حارس الإقفال ═══
 * لا تُقفَل رحلةٌ ورصيد مندوبها غير صفر — إلّا بفرقٍ مبرَّرٍ موثَّق. وإلّا صار
 * الإقفال طقسًا يُخفي العجز بدل أن يكشفه.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v) => String(v ?? '').trim();
const day = (v) => str(v).slice(0, 10);

/** ما يزيد نقد المندوب وما ينقصه — جدولٌ لا شيفرةٌ متفرّقة. */
export const CASH_RULES = Object.freeze({
  RCV: { direction: 'in', labelAr: 'تحصيل ميدانيّ', amount: (d) => sumAmount(d) },
  VSI: {
    direction: 'in',
    labelAr: 'بيع نقديّ من المركبة',
    // الآجل لا يدخل الجيب — يدخل ذمّة العميل. وخلطهما يُظهر نقدًا لا وجود له.
    amount: (d) => (isCash(d) ? sumSales(d) : 0),
  },
  VSR: { direction: 'out', labelAr: 'إيداع في التسوية', amount: (d) => num(d?.header?.cashDeposited) },
});

const isCash = (d) => /نقد/.test(str(d?.header?.paymentMode));

function sumAmount(doc) {
  return money((doc?.lines || []).reduce((s, l) => s + num(l?.amount), 0));
}

function sumSales(doc) {
  return money(
    (doc?.lines || []).reduce((s, l) => s + Math.max(0, num(l?.qty) * num(l?.unitPrice) - num(l?.discount)), 0)
  );
}

/** رمز المندوب من المستند — الاسم يكفي هويّةً حتّى يُربط بمستخدم. */
export function repOf(doc) {
  return str(doc?.header?.repName || doc?.createdByName);
}

/**
 * حركات نقد المندوب من المستندات المنجَزة.
 * @returns {{id,rep,tripRef,date,docType,docNumber,labelAr,direction,amount,delta}[]}
 */
export function cashMoves(documents = [], { states = ['done', 'approved'] } = {}) {
  const out = [];
  for (const d of Array.isArray(documents) ? documents : []) {
    const rule = CASH_RULES[d?.type];
    if (!rule || !states.includes(d?.state)) continue;
    const rep = repOf(d);
    if (!rep) continue;
    const amount = money(rule.amount(d));
    if (amount <= 0) continue;
    out.push({
      id: `${d.type}__${str(d.id)}`,
      rep,
      tripRef: str(d.header?.tripRef),
      date: day(d.header?.collectionDate || d.header?.saleDate || d.header?.settlementDate),
      docType: d.type,
      docNumber: str(d.number),
      labelAr: rule.labelAr,
      direction: rule.direction,
      amount,
      delta: rule.direction === 'in' ? amount : -amount,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** رصيد نقدٍ لمندوبٍ (أو لرحلةٍ بعينها). موجبٌ يعني «في جيبه». */
export function cashBalance(moves = [], { rep = '', tripRef = '' } = {}) {
  return money(
    (moves || [])
      .filter((m) => (!rep || m.rep === rep) && (!tripRef || m.tripRef === tripRef))
      .reduce((s, m) => s + m.delta, 0)
  );
}

/** أرصدة كلّ المندوبين — من عليه نقدٌ لم يودعه بعد. */
export function repBalances(moves = []) {
  const map = new Map();
  for (const m of moves) {
    const prev = map.get(m.rep) || { rep: m.rep, balance: 0, collected: 0, deposited: 0, lastDate: '' };
    prev.balance = money(prev.balance + m.delta);
    if (m.direction === 'in') prev.collected = money(prev.collected + m.amount);
    else prev.deposited = money(prev.deposited + m.amount);
    if (m.date > prev.lastDate) prev.lastDate = m.date;
    map.set(m.rep, prev);
  }
  return [...map.values()].sort((a, b) => b.balance - a.balance);
}

/**
 * حارس إقفال الرحلة: لا تُقفَل ورصيدها غير صفر إلّا بفرقٍ مبرَّر.
 *
 * @returns {{ok:boolean, balance:number, problem:string, needsReason:boolean}}
 */
export function tripCloseVerdict(moves = [], { rep, tripRef, reason = '', tolerance = 0.009 } = {}) {
  const balance = cashBalance(moves, { rep, tripRef });
  if (Math.abs(balance) <= tolerance) {
    return { ok: true, balance: 0, problem: '', needsReason: false };
  }
  const kind = balance > 0 ? 'نقدٌ لم يُودَع' : 'إيداعٌ يزيد على المحصَّل';
  if (!str(reason)) {
    return {
      ok: false,
      balance,
      needsReason: true,
      problem: `${kind} بمقدار ${Math.abs(balance)} — لا تُقفَل الرحلة بلا سببٍ مكتوب.`,
    };
  }
  return { ok: true, balance, needsReason: true, problem: '' };
}

/**
 * اللوحة المالية للمندوب (نصّ الخطة): مديونيّة عملائه · حسابه النقديّ ·
 * إجماليّ مبيعاته · إجماليّ المديونيّة.
 *
 * @param {object} args
 * @param {object[]} args.moves حركات النقد
 * @param {object[]} args.ledger سطور دفتر الذمم
 * @param {object[]} args.documents مستندات البيع
 * @param {string} args.rep اسم المندوب
 */
export function repDashboard({ moves = [], ledger = [], documents = [], rep = '' }) {
  const mine = (documents || []).filter((d) => repOf(d) === rep);
  const myCustomers = new Set(
    mine.map((d) => str(d.header?.customerCode || d.header?.customer).toUpperCase()).filter(Boolean)
  );

  const receivable = money(
    (ledger || [])
      .filter((e) => e.party === 'customer' && myCustomers.has(str(e.partyCode).toUpperCase()))
      .reduce((s, e) => s + num(e.delta), 0)
  );

  const sales = money(
    mine
      .filter((d) => ['VSI', 'VCS'].includes(d.type) && d.state === 'done')
      .reduce((s, d) => s + sumSales(d), 0)
  );

  return {
    rep,
    cash: cashBalance(moves, { rep }),
    receivable,
    sales,
    customers: myCustomers.size,
    // نسبة التحصيل: كم من مبيعاته حُصِّل. تُخبر عن جودة البيع لا كمّيّته وحدها.
    collectionRate: sales > 0 ? Math.round(((sales - receivable) / sales) * 100) : null,
  };
}
