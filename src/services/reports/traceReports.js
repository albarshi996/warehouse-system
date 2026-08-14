/**
 * تتبّع الدفعة أمامًا وخلفًا + تقريرا 360° (SAP-14 · يسدّ ف‑٣١ وف‑٣٢ وف‑٣٣).
 *
 * ═══ الأسئلة الثمانية (SR-66 ‹3885-3894›) ═══
 * «من أيّ موردٍ دخل؟ · بأيّ أمر شراء؟ · بأيّ استلام؟ · بأيّ Batch؟ · في أيّ
 * موقعٍ خُزن؟ · إلى أيّ عميلٍ خرج؟ · هل عاد؟ · هل أُرجع إلى المورد؟»
 * — وكلّها **قابلة للإجابة من الدفتر القائم** (`stock_moves`): التتبّع
 * استعلامٌ لا بناءُ بياناتٍ جديدة. فلا مجموعةَ تتبّعٍ تُخترع ولا حقلَ.
 *
 * ═══ الاتّجاهان (SR-67 ‹3899-3903›) ═══
 *   **أمامًا** (Forward): من الاستلام إلى العميل — أين ذهبت هذه الدفعة؟
 *   **خلفًا** (Reverse): من العميل إلى المورّد — من أين جاءت هذه القطعة؟
 * كلاهما من الحركات نفسها مرتّبةً زمنيًّا، والفرق اتّجاه القراءة والسؤال.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { normalizeItemCode } from '../items/itemIdentity.js';

const str = (v) => String(v ?? '').trim();
const num = (v) => Number(v) || 0;
const day = (v) => str(v).slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** تاريخ الحركة للترتيب. */
const at = (m) => day(m?.postedAtDay || m?.date || m?.docDate);

/** أنواعٌ تُدخل بضاعةً من الخارج (المنشأ) وأخرى تُخرجها (المصير). */
const INBOUND_TYPES = new Set(['GRN', 'RET', 'CRN', 'TRC']);
const OUTBOUND_TYPES = new Set(['DN', 'POD', 'VSI', 'VCS', 'GP']);
const VENDOR_RETURN_TYPES = new Set(['VRT', 'SRN']);
const CUSTOMER_RETURN_TYPES = new Set(['RET', 'CRN']);

/**
 * حركات دفعةٍ (أو صنفٍ) مرتّبةً زمنيًّا — أساس الاتّجاهين.
 * @param {Array} moves حركات الدفتر
 * @param {{sku?:string, batch?:string}} key
 */
export function traceMoves(moves, { sku = '', batch = '' } = {}) {
  const wantSku = normalizeItemCode(sku);
  const wantBatch = str(batch).toUpperCase();
  return (moves || [])
    .filter((m) => {
      if (wantSku && normalizeItemCode(m.sku) !== wantSku) return false;
      if (wantBatch && str(m.batch).toUpperCase() !== wantBatch) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
}

/**
 * الأسئلة الثمانية مُجابةً من الحركات (SR-66) — كلّ جوابٍ **بمستنده** فيُفتح.
 * @returns {{origin:object[], batches:string[], locations:string[], destinations:object[], returnedIn:object[], returnedToVendor:object[], answers:object}}
 */
export function traceAnswers(moves, key = {}) {
  const rows = traceMoves(moves, key);
  const docOf = (m) => ({
    docId: m.docId || null,
    docType: str(m.docType),
    docNumber: str(m.docNumber),
    date: at(m),
    qty: num(m.qty),
    party: str(m.supplier || m.customer || m.repName),
    batch: str(m.batch),
  });

  const origin = rows.filter((m) => INBOUND_TYPES.has(str(m.docType))).map(docOf);
  const destinations = rows.filter((m) => OUTBOUND_TYPES.has(str(m.docType))).map(docOf);
  const returnedIn = rows.filter((m) => CUSTOMER_RETURN_TYPES.has(str(m.docType))).map(docOf);
  const returnedToVendor = rows.filter((m) => VENDOR_RETURN_TYPES.has(str(m.docType))).map(docOf);
  const batches = [...new Set(rows.map((m) => str(m.batch)).filter(Boolean))];
  const locations = [...new Set(rows.map((m) => str(m.to).toUpperCase()).filter(Boolean))];

  return {
    origin,
    batches,
    locations,
    destinations,
    returnedIn,
    returnedToVendor,
    // الأجوبة الثمانية نصًّا — «لا يُعرف» صادقٌ ولا يُخترع.
    answers: {
      fromVendor: origin.find((o) => o.docType === 'GRN')?.party || 'لا يُعرف',
      byPurchaseOrder: origin.find((o) => o.docType === 'GRN')?.docNumber || 'لا يُعرف',
      byReceipt: origin.find((o) => o.docType === 'GRN')?.docNumber || 'لا يُعرف',
      byBatch: batches.join(' · ') || 'بلا دفعة',
      storedAt: locations.join(' · ') || 'لا يُعرف',
      toCustomer: destinations.map((d) => d.party).filter(Boolean).join(' · ') || 'لم يخرج بعد',
      cameBack: returnedIn.length > 0,
      returnedToVendor: returnedToVendor.length > 0,
    },
  };
}

/**
 * خطوات الرحلة بترتيبها الزمنيّ — **كلّ** حركةٍ للدفعة لا المنشأ والمصير
 * وحدهما (التخزين والنقل خطواتٌ في الرحلة لا حشو).
 */
function traceSteps(moves, key) {
  return traceMoves(moves, key).map((m) => ({
    docId: m.docId || null,
    docType: str(m.docType),
    docNumber: str(m.docNumber),
    date: at(m),
    qty: num(m.qty),
    from: str(m.from),
    to: str(m.to),
    party: str(m.supplier || m.customer || m.repName),
    batch: str(m.batch),
  }));
}

/**
 * التتبّع **أمامًا** (SR-67): من الاستلام إلى العميل — الرحلة بترتيبها
 * الزمنيّ، فأوّل خطوةٍ منشؤها وآخرها مصيرها الحاليّ.
 */
export function forwardTrace(moves, key) {
  return { direction: 'forward', steps: traceSteps(moves, key), ...traceAnswers(moves, key) };
}

/**
 * التتبّع **خلفًا**: من العميل (أو الرقم التسلسليّ) إلى المورّد والاستلام
 * الأصليّ — الرحلة نفسها معكوسة القراءة: أوّل خطوةٍ آخر ما جرى، وآخرها
 * منشؤها. فلا بياناتٌ ثانية ولا منطقٌ ثانٍ — اتّجاه السؤال وحده يختلف.
 */
export function reverseTrace(moves, key) {
  return { direction: 'reverse', steps: traceSteps(moves, key).reverse(), ...traceAnswers(moves, key) };
}

/* ═══════════ الصنف 360° (SR-64 · ف‑٣١) ═══════════ */

/**
 * أقسام بطاقة الصنف الشاملة — كلٌّ من مصدره القائم، وما لا مصدر له يُعلَن
 * فارغًا ولا يُلفَّق (§16.1 ‹453›: لا رقمَ مخترع).
 */
export function item360(sku, { items = [], balances = [], moves = [], catalog = [], openRows = {} } = {}) {
  const key = normalizeItemCode(sku);
  const item = (items || []).find((i) => normalizeItemCode(i.sku) === key) || null;
  const mine = (balances || []).filter((b) => normalizeItemCode(b.sku) === key);
  const myMoves = traceMoves(moves, { sku: key });

  const byWarehouse = groupSum(mine, (b) => str(b.warehouse).toUpperCase());
  const byLocation = groupSum(mine, (b) => str(b.bin) || '—');
  const byBatch = groupSum(mine, (b) => str(b.batch) || 'بلا دفعة');

  const lastPrices = (type) =>
    myMoves.filter((m) => str(m.docType) === type && num(m.unitCost) > 0).slice(-5)
      .map((m) => ({ date: at(m), docNumber: str(m.docNumber), price: round2(m.unitCost) }));

  return {
    item, // ① بيانات الصنف
    byWarehouse, // ② المخزون حسب المستودع
    byLocation, // ③ حسب الموقع
    byBatch, // ④ Batch/Serial
    reserved: round2(mine.reduce((s, b) => s + num(b.qtyReserved), 0)), // ⑤ المحجوزة
    ordered: round2(num(openRows?.ordered)), // ⑥ المطلوبة (من openDemand)
    openDocuments: openRows?.rows || [], // ⑦ الأوامر المفتوحة
    suppliers: (catalog || []).filter((c) => c.partnerType === 'supplier'), // ⑧ الموردون
    customers: (catalog || []).filter((c) => c.partnerType === 'customer'), // ⑨ العملاء
    lastPurchasePrices: lastPrices('GRN'), // ⑩ آخر أسعار الشراء
    lastSalePrices: lastPrices('DN'), // ⑪ آخر أسعار البيع
    moves: myMoves, // ⑫ الحركات
    returns: myMoves.filter((m) => CUSTOMER_RETURN_TYPES.has(str(m.docType)) || VENDOR_RETURN_TYPES.has(str(m.docType))), // ⑬ المرتجعات
    // ⑭ المرفقات تُقرأ حيًّا في البطاقة (SAP-11) — لا تُكرَّر هنا.
  };
}

/* ═══════════ المورّد 360° (SR-65 · ف‑٣٢) ═══════════ */

/**
 * بطاقة المورّد الشاملة بمؤشّراتها الثلاثة الحاكمة: **متوسّط زمن التوريد ·
 * نسبة الرفض · نسبة الالتزام** — كلّها محسوبةٌ من المستندات القائمة.
 */
export function supplier360(partnerCode, { documents = [], moves = [], ledger = [] } = {}) {
  const code = str(partnerCode).toUpperCase();
  const mine = (documents || []).filter((d) => {
    const h = d?.header || {};
    return str(h.supplierCode).toUpperCase() === code || str(h.supplier).toUpperCase() === code;
  });

  const orders = mine.filter((d) => d.type === 'PO');
  const receipts = mine.filter((d) => d.type === 'GRN');

  // متوسّط زمن التوريد: من تاريخ أمر الشراء إلى تاريخ استلامه.
  const leadDays = [];
  for (const grn of receipts) {
    const poNumber = str(grn.header?.poRef);
    const po = orders.find((o) => str(o.number) === poNumber);
    if (!po) continue;
    const a = Date.parse(`${day(po.header?.issueDate || po.header?.date)}T00:00:00Z`);
    const b = Date.parse(`${day(grn.header?.issueDate || grn.header?.receivedAt)}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) leadDays.push(Math.round((b - a) / 86400000));
  }

  // نسبة الرفض: المرفوض جودةً من إجمالي المستلَم.
  let received = 0;
  let rejected = 0;
  for (const grn of receipts) {
    for (const l of grn.lines || []) {
      received += num(l.qtyReceived ?? l.qty);
      rejected += num(l.qtyRejected);
    }
  }

  // نسبة الالتزام: أوامرٌ استُلمت كاملةً من إجمالي المعتمَدة.
  const approved = orders.filter((o) => ['approved', 'done', 'closed'].includes(str(o.state)));
  const fulfilled = approved.filter((o) => receipts.some((g) => str(g.header?.poRef) === str(o.number)));

  return {
    partnerCode: code,
    orders,
    receipts,
    returns: mine.filter((d) => ['VRT', 'SRN'].includes(d.type)),
    moves: (moves || []).filter((m) => str(m.supplier).toUpperCase() === code),
    ledger: (ledger || []).filter((e) => str(e.partyCode).toUpperCase() === code),
    metrics: {
      avgLeadDays: leadDays.length ? Math.round(leadDays.reduce((s, d) => s + d, 0) / leadDays.length) : null,
      rejectionRate: received > 0 ? round2((rejected / received) * 100) : null,
      fulfilmentRate: approved.length ? round2((fulfilled.length / approved.length) * 100) : null,
      orderCount: orders.length,
      receiptCount: receipts.length,
    },
  };
}

/** يجمع أرصدةً بمفتاحٍ ما — {key, qty}. */
function groupSum(balances, keyFn) {
  const map = new Map();
  for (const b of balances || []) {
    const k = keyFn(b);
    map.set(k, round2((map.get(k) || 0) + num(b.qty)));
  }
  return [...map.entries()].map(([key, qty]) => ({ key, qty }));
}
