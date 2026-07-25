/**
 * كشف حركة الصنف — منطق خالص يحوّل الحركات الخام إلى قصّةٍ مقروءة برصيدٍ جارٍ.
 *
 * الحركة في الدفتر رقمٌ واتجاه؛ والمستخدم يريد قصّة: «كان عندي كذا، دخل كذا،
 * خرج كذا، فبقي كذا» — سطرًا سطرًا. هذا الملف يبني ذلك: يرتّب الحركات زمنيًّا،
 * ويحسب الرصيد الجاري بعد كل حركة، ويصنّفها دخولًا وخروجًا.
 *
 * خالصٌ عمدًا (لا Firestore) كي يُختبَر بلا شبكة — والعرض في المكوّن وحده.
 */

/** هل هذه الحركة دخولٌ إلى موقعٍ نراقبه؟ (الوجهة هي الموقع) */
function isInboundTo(move, location) {
  return String(move.to || '').toUpperCase() === location;
}

/** هل هذه الحركة خروجٌ من موقعٍ نراقبه؟ (المصدر هو الموقع) */
function isOutboundFrom(move, location) {
  return String(move.from || '').toUpperCase() === location;
}

/**
 * يبني كشف الحركة لصنفٍ في موقعٍ بعينه، برصيدٍ جارٍ.
 *
 * @param {Array} moves حركات الصنف (من `movesForSku`)
 * @param {string} location كود الموقع (مستودع حقيقي أو موقع نظام)
 * @param {number} opening الرصيد الافتتاحي قبل أوّل حركة معروضة
 * @returns {{rows:Array, closing:number, totalIn:number, totalOut:number}}
 */
export function buildLedgerCard(moves, location, opening = 0) {
  const loc = String(location || '').toUpperCase();
  const relevant = (moves || [])
    .filter((m) => isInboundTo(m, loc) || isOutboundFrom(m, loc))
    .slice()
    .sort((a, b) => (a.postedAt?.seconds || 0) - (b.postedAt?.seconds || 0));

  let running = Number(opening) || 0;
  let totalIn = 0;
  let totalOut = 0;

  const rows = relevant.map((m) => {
    const qty = Number(m.qty) || 0;
    const inbound = isInboundTo(m, loc);
    const signed = inbound ? qty : -qty;
    running += signed;
    if (inbound) totalIn += qty;
    else totalOut += qty;
    return {
      id: m.id,
      docType: m.docType,
      docNumber: m.docNumber,
      reason: m.reason,
      reasonLabel: m.reasonLabel,
      counterparty: inbound ? m.from : m.to,
      batch: m.batch,
      expiry: m.expiry,
      qtyIn: inbound ? qty : 0,
      qtyOut: inbound ? 0 : qty,
      balance: running,
      value: Number(m.value) || 0,
      postedAt: m.postedAt || null,
    };
  });

  return { rows, closing: running, totalIn, totalOut };
}

/**
 * ملخّص حركة صنفٍ عبر كل المواقع — للوحة المخزون.
 * يجمع الداخل والخارج والقيمة، ويحصي الحركات، بلا رصيد جارٍ (لأنه عبر مواقع).
 */
export function summarizeMovement(moves) {
  const rows = moves || [];
  let totalIn = 0;
  let totalOut = 0;
  let value = 0;
  rows.forEach((m) => {
    const qty = Number(m.qty) || 0;
    value += Number(m.value) || 0;
    // الداخل إلى مستودع حقيقي مقابل الخارج منه — الخارج للعميل خروجٌ صافٍ.
    if (m.to && !m.from) totalIn += qty; // من الخارج
    else if (m.from && !m.to) totalOut += qty; // إلى الخارج
  });
  return { count: rows.length, totalIn, totalOut, value };
}
