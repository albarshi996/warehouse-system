/**
 * سلسلة الشراء والمطابقة الثلاثية (F2) — منطق خالص، بلا Firestore وبلا DOM.
 *
 * المشكلة التي يحلّها (ROADMAP §11.1): «لا ترابط بين المستندات — أمر الشراء
 * والاستلام والفاتورة أوراق منفصلة ⇒ **المطابقة الثلاثية يدوية**».
 *
 * الحلّ في طبقتين:
 *   1. **الاشتقاق** (`deriveDocument`): المستند التالي يولد من سابقه ببنوده
 *      وبياناته، ويحمل `links` إلى أصله. فلا يُعاد إدخال ما أُدخل مرّة،
 *      ولا يُنسخ رقمٌ بالقلم.
 *   2. **المطابقة** (`threeWayMatch`): تقارن المطلوب (PO) بالمستلَم (GRN)
 *      بالمقبول (QC) صنفًا صنفًا، وتُخرج حكمًا مسبَّبًا لا رأيًا.
 *
 * لماذا خالص؟ ليُختبَر في Node بلا متصفّح — والشاشة محميّة بالدخول فلا
 * سبيل لفحصها بصريًّا دون حساب (نفس درس دفعتَي الهيكل والاجتماعات).
 */

/**
 * سلسلة الشراء الرسمية: كل نوع وما يُشتقّ منه.
 * `PR → PO → GRN → QC`
 */
export const PURCHASE_CHAIN = ['PR', 'PO', 'GRN', 'QC'];

/** ما الذي يُشتقّ من هذا النوع؟ (null = نهاية السلسلة) */
export function nextInChain(type) {
  const i = PURCHASE_CHAIN.indexOf(type);
  return i >= 0 && i < PURCHASE_CHAIN.length - 1 ? PURCHASE_CHAIN[i + 1] : null;
}

/** ما الذي سبقه؟ */
export function previousInChain(type) {
  const i = PURCHASE_CHAIN.indexOf(type);
  return i > 0 ? PURCHASE_CHAIN[i - 1] : null;
}

/**
 * خرائط نقل البنود بين الأنواع: حقل المصدر ← حقل الهدف.
 * ما لا يُذكر هنا لا يُنقل — الاشتقاق لا يخترع بيانات.
 */
const LINE_MAP = {
  'PR>PO': { sku: 'sku', barcode: 'barcode', description: 'description', uom: 'uom', qty: 'qty', estPrice: 'unitPrice' },
  'PO>GRN': { sku: 'sku', barcode: 'barcode', description: 'description', qty: 'qtyOrdered' },
  'GRN>QC': { sku: 'sku', barcode: 'barcode', description: 'description', qtyReceived: 'qtyInspected' },
};

/** خرائط نقل بيانات الرأس. */
const HEADER_MAP = {
  'PR>PO': { warehouse: 'warehouse' },
  'PO>GRN': { supplier: 'supplier' },
  'GRN>QC': { supplier: 'supplier' },
};

/** هل البند فارغ فعليًّا؟ (لا نورّث صفوفًا بيضاء) */
function hasContent(line) {
  return Object.values(line || {}).some((v) => String(v ?? '').trim() !== '');
}

/**
 * يشتقّ مسودّة المستند التالي من مستند قائم.
 *
 * القواعد:
 *  · لا يُشتقّ إلا من مستند **معتمَد أو منجَز** — الاشتقاق من مسودّة يعني
 *    بناء التزامٍ على ما لم يُعتمد بعد.
 *  · `links` تُورَّث ثم يُضاف إليها الأصل المباشر: فيصل QC إلى PO وPR عبر
 *    السلسلة كلها، وهو ما تحتاجه المطابقة الثلاثية.
 *  · المراجع النصّية (`prRef` · `poRef` · `grnRef`) تُملأ من أرقام الأصل —
 *    فما كان يُنسخ بالقلم صار مشتقًّا.
 *
 * @param {object} source المستند الأصل (بـ id و type و number و lines)
 * @returns {{type, header, lines, links}} مسودّة جاهزة للإنشاء
 */
export function deriveDocument(source) {
  if (!source) throw new Error('لا مستند مصدر');
  const to = nextInChain(source.type);
  if (!to) throw new Error(`لا يُشتقّ من «${source.type}» مستندٌ تالٍ في سلسلة الشراء`);
  if (!['approved', 'done'].includes(source.state)) {
    throw new Error('لا يُشتقّ مستند إلا من مستندٍ معتمَد — الاعتماد أولًا');
  }

  const key = `${source.type}>${to}`;
  const lineMap = LINE_MAP[key] || {};
  const headerMap = HEADER_MAP[key] || {};

  const lines = (source.lines || []).filter(hasContent).map((line) => {
    const out = {};
    for (const [from, into] of Object.entries(lineMap)) {
      if (line[from] !== undefined && line[from] !== '') out[into] = line[from];
    }
    return out;
  });

  const header = {};
  for (const [from, into] of Object.entries(headerMap)) {
    const v = source.header?.[from];
    if (v !== undefined && v !== '') header[into] = v;
  }

  // المراجع النصّية المطبوعة على الورق — تُشتقّ ولا تُكتب.
  const refField = { PO: 'prRef', GRN: 'poRef', QC: 'grnRef' }[to];
  if (refField && source.number) header[refField] = source.number;
  // QC يحمل مرجع أمر الشراء أيضًا (الورق يطلبه) — نأخذه من سلسلة الروابط.
  if (to === 'QC' && source.header?.poRef) header.poRef = source.header.poRef;

  const links = { ...(source.links || {}), [source.type]: { id: source.id, number: source.number || null } };

  return { type: to, header, lines, links };
}

/* ═══════════════ المطابقة الثلاثية ═══════════════ */

/** مفتاح مطابقة البند: SKU أولًا، فالباركود، فالوصف — أول موجود. */
export function lineKey(line) {
  return String(line?.sku || line?.barcode || line?.description || '').trim().toUpperCase();
}

/** يجمع كميات نوعٍ ما في خريطة `مفتاح → كمية`. */
function tally(lines, field) {
  const map = new Map();
  for (const line of lines || []) {
    const key = lineKey(line);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(line[field]) || 0));
  }
  return map;
}

/** حدّ التسامح الافتراضي: 2% أو وحدة واحدة، أيّهما أكبر (فروق التقريب والوزن). */
export const DEFAULT_TOLERANCE = { pct: 2, min: 1 };

function withinTolerance(expected, actual, tol = DEFAULT_TOLERANCE) {
  const allowed = Math.max(tol.min, (Math.abs(expected) * tol.pct) / 100);
  return Math.abs(expected - actual) <= allowed;
}

/**
 * المطابقة الثلاثية: المطلوب (PO) ↔ المستلَم (GRN) ↔ المقبول (QC).
 *
 * تُخرج لكل صنف: الكميات الثلاث وفرقيها وحكمه. والحكم العام `ok` لا يكون
 * صحيحًا إلا إذا طابق كل صنف — **ولا تُغلق مطابقةٌ على نقص صامت**.
 *
 * حالات الصنف:
 *   match      — الثلاثة متساوية ضمن التسامح
 *   short      — استُلم أقلّ من المطلوب
 *   over       — استُلم أكثر من المطلوب (تسليم زائد يحتاج قرارًا)
 *   rejected   — استُلم كاملًا لكن الجودة رفضت بعضه أو كلّه
 *   missing-po — صنفٌ استُلم ولا وجود له في أمر الشراء (**الأخطر**)
 *   pending-qc — لم يُفحص بعد (لا مستند QC)
 *
 * @param {object} docs { po, grn, qc } — كلٌّ منها مستند أو null
 * @param {object} [tolerance]
 */
export function threeWayMatch({ po, grn, qc } = {}, tolerance = DEFAULT_TOLERANCE) {
  const ordered = tally(po?.lines, 'qty');
  const received = tally(grn?.lines, 'qtyReceived');
  const accepted = tally(qc?.lines, 'qtyAccepted');
  const rejectedQty = tally(qc?.lines, 'qtyRejected');

  const names = new Map();
  for (const line of [...(po?.lines || []), ...(grn?.lines || []), ...(qc?.lines || [])]) {
    const key = lineKey(line);
    if (key && !names.has(key) && line.description) names.set(key, line.description);
  }

  const keys = [...new Set([...ordered.keys(), ...received.keys(), ...accepted.keys()])].sort();

  const rows = keys.map((key) => {
    const qtyOrdered = ordered.get(key) || 0;
    const qtyReceived = received.get(key) || 0;
    const qtyAccepted = accepted.get(key) || 0;
    const qtyRejected = rejectedQty.get(key) || 0;

    let status;
    let note = '';
    if (!ordered.has(key)) {
      status = 'missing-po';
      note = 'صنفٌ مستلَم لا وجود له في أمر الشراء';
    } else if (!withinTolerance(qtyOrdered, qtyReceived, tolerance)) {
      status = qtyReceived < qtyOrdered ? 'short' : 'over';
      note = status === 'short'
        ? `نقص ${qtyOrdered - qtyReceived} عن المطلوب`
        : `زيادة ${qtyReceived - qtyOrdered} عن المطلوب`;
    } else if (!qc) {
      status = 'pending-qc';
      note = 'بانتظار فحص الجودة';
    } else if (qtyRejected > 0 || !withinTolerance(qtyReceived, qtyAccepted, tolerance)) {
      status = 'rejected';
      note = `رُفض ${qtyRejected || qtyReceived - qtyAccepted} من المستلَم`;
    } else {
      status = 'match';
    }

    return {
      key,
      description: names.get(key) || key,
      qtyOrdered,
      qtyReceived,
      qtyAccepted,
      qtyRejected,
      varianceReceived: qtyReceived - qtyOrdered,
      varianceAccepted: qtyAccepted - qtyReceived,
      status,
      note,
    };
  });

  const problems = rows.filter((r) => r.status !== 'match');
  const missingDocs = [];
  if (!po) missingDocs.push('أمر الشراء');
  if (!grn) missingDocs.push('مذكرة الاستلام');
  if (!qc) missingDocs.push('تقرير الجودة');

  return {
    rows,
    problems,
    missingDocs,
    /** المطابقة تامّة: المستندات الثلاثة حاضرة وكل صنف مطابق. */
    ok: missingDocs.length === 0 && problems.length === 0 && rows.length > 0,
    summary: {
      items: rows.length,
      matched: rows.filter((r) => r.status === 'match').length,
      short: rows.filter((r) => r.status === 'short').length,
      over: rows.filter((r) => r.status === 'over').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      missingPo: rows.filter((r) => r.status === 'missing-po').length,
      pendingQc: rows.filter((r) => r.status === 'pending-qc').length,
      totalOrdered: rows.reduce((t, r) => t + r.qtyOrdered, 0),
      totalReceived: rows.reduce((t, r) => t + r.qtyReceived, 0),
      totalAccepted: rows.reduce((t, r) => t + r.qtyAccepted, 0),
    },
  };
}

/** تسميات عربية لحالات المطابقة — تُستهلك في الواجهة والطباعة. */
export const MATCH_STATUS = {
  match: { label: 'مطابق', emoji: '✅', color: '#059669' },
  short: { label: 'نقص', emoji: '⬇️', color: '#f59e0b' },
  over: { label: 'زيادة', emoji: '⬆️', color: '#3b82f6' },
  rejected: { label: 'مرفوض جودةً', emoji: '🚫', color: '#ef4444' },
  'missing-po': { label: 'خارج أمر الشراء', emoji: '⚠️', color: '#b91c1c' },
  'pending-qc': { label: 'بانتظار الفحص', emoji: '⏳', color: '#6b7280' },
};

/**
 * سلسلة المستند: ما قبله وما بعده، لعرض «أين نحن من الدورة».
 * @param {object} doc المستند الحالي
 * @param {object[]} related مستندات تشير إليه أو يشير إليها
 */
export function chainOf(doc, related = []) {
  const links = doc?.links || {};
  const before = PURCHASE_CHAIN.slice(0, PURCHASE_CHAIN.indexOf(doc?.type))
    .map((type) => {
      const link = links[type];
      if (!link) return null;
      const full = related.find((r) => r.id === link.id);
      return { type, id: link.id, number: link.number || full?.number || null, state: full?.state || null };
    })
    .filter(Boolean);

  const after = related
    .filter((r) => r.links?.[doc?.type]?.id === doc?.id)
    .map((r) => ({ type: r.type, id: r.id, number: r.number || null, state: r.state || null }));

  return { before, current: { type: doc?.type, id: doc?.id, number: doc?.number || null, state: doc?.state }, after };
}
