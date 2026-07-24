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
 * سلاسل الدورة الرسمية الأربع:
 *   **الوارد:**    `PR → PO → GRN → QC → PUTAWAY`  (طلب ← أمر ← استلام ← فحص ← تخزين)
 *   **الصادر:**    `PICK → PACK → DN → GP`         (سحب ← تعبئة ← إذن ← تصريح)
 *   **المرتجعات:** `RET → CN`                      (إرجاع ← إشعار دائن)
 *   **التسوية:**   `CC → ADJ`                       (جرد دوري ← سند تسوية)
 *
 * لماذا سلاسل منفصلة لا واحدة؟ لأن كلًّا منها رحلةٌ مستقلّة قد تقع في زمنٍ
 * آخر ولسببٍ آخر — وربطها قسرًا كان سيجعل كل مستندٍ يدّعي أصلًا في سلسلةٍ
 * لا تخصّه. والتالف (DMG) مستندٌ مفردٌ بلا سلسلة: قد يُكتشف بلا إرجاعٍ أصلًا.
 */
export const PURCHASE_CHAIN = ['PR', 'PO', 'GRN', 'QC', 'PUTAWAY'];
export const OUTBOUND_CHAIN = ['PICK', 'PACK', 'DN', 'GP'];
export const RETURN_CHAIN = ['RET', 'CN'];
export const COUNT_CHAIN = ['CC', 'ADJ'];

/** كل السلاسل — لتجول عليها الدوال بلا معرفة مسبقة بأيّها. */
export const CHAINS = [PURCHASE_CHAIN, OUTBOUND_CHAIN, RETURN_CHAIN, COUNT_CHAIN];

/** السلسلة التي ينتمي إليها النوع، أو null. */
export function chainFor(type) {
  return CHAINS.find((c) => c.includes(type)) || null;
}

/** ما الذي يُشتقّ من هذا النوع؟ (null = نهاية السلسلة) */
export function nextInChain(type) {
  const chain = chainFor(type);
  if (!chain) return null;
  const i = chain.indexOf(type);
  return i < chain.length - 1 ? chain[i + 1] : null;
}

/** ما الذي سبقه؟ */
export function previousInChain(type) {
  const chain = chainFor(type);
  if (!chain) return null;
  const i = chain.indexOf(type);
  return i > 0 ? chain[i - 1] : null;
}

/**
 * خرائط نقل البنود بين الأنواع: حقل المصدر ← حقل الهدف.
 * ما لا يُذكر هنا لا يُنقل — الاشتقاق لا يخترع بيانات.
 */
const LINE_MAP = {
  // الوارد
  'PR>PO': { sku: 'sku', barcode: 'barcode', description: 'description', uom: 'uom', qty: 'qty', estPrice: 'unitPrice' },
  'PO>GRN': { sku: 'sku', barcode: 'barcode', description: 'description', qty: 'qtyOrdered' },
  'GRN>QC': { sku: 'sku', barcode: 'barcode', description: 'description', qtyReceived: 'qtyInspected' },
  // المقبول جودةً وحده هو ما يُخزَّن — لا المستلَم كلّه.
  'QC>PUTAWAY': { sku: 'sku', barcode: 'barcode', description: 'description', qtyAccepted: 'qty' },
  // الصادر
  'PICK>PACK': { sku: 'sku', barcode: 'barcode', description: 'description', qtyPicked: 'qty', uom: 'uom' },
  'PACK>DN': { sku: 'sku', barcode: 'barcode', description: 'description', qty: 'qty', uom: 'uom' },
  'DN>GP': { sku: 'sku', barcode: 'barcode', description: 'description', qty: 'qty' },
  // المرتجعات: الإشعار الدائن يأخذ الكمية المُرجعة وسعرها لحساب مبلغ الخصم.
  'RET>CN': { sku: 'sku', barcode: 'barcode', description: 'description', qty: 'qty', unitPrice: 'unitPrice', reason: 'reason' },
  // التسوية: الفعلي المعدود يصير «الفعلي»، والدفتري يصير «الدفتري».
  'CC>ADJ': { sku: 'sku', barcode: 'barcode', description: 'description', bookQty: 'bookQty', count2: 'actualQty', unitPrice: 'unitPrice' },
};

/** خرائط نقل بيانات الرأس. */
const HEADER_MAP = {
  'PR>PO': { warehouse: 'warehouse' },
  'PO>GRN': { supplier: 'supplier' },
  'GRN>QC': { supplier: 'supplier' },
  'QC>PUTAWAY': { supplier: 'supplier' },
  'PICK>PACK': { destination: 'destination' },
  'PACK>DN': { customer: 'customer', destination: 'deliveryAddress' },
  // بيانات النقل تُورَّث للتصريح فلا تُعاد كتابتها على البوابة.
  'DN>GP': { driverName: 'driverName', vehiclePlate: 'vehiclePlate', customer: 'destination' },
  'RET>CN': { returningBranch: 'beneficiary' },
  'CC>ADJ': { zone: 'zone' },
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
  const refField = {
    PO: 'prRef', GRN: 'poRef', QC: 'grnRef', PUTAWAY: 'grnRef',
    PACK: 'pickRef', DN: 'packRef', GP: 'dnRef',
    CN: 'returnRef', ADJ: 'cycleCountRef',
  }[to];
  if (refField && source.number) header[refField] = source.number;
  // أمر التخزين يحمل رقم الاستلام لا رقم تقرير الفحص (هكذا ينصّ الورق).
  if (to === 'PUTAWAY' && source.links?.GRN?.number) header.grnRef = source.links.GRN.number;
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

/* ═══════════════ 🥇 حارس FEFO (F3) ═══════════════ */

/** يحوّل تاريخًا إلى رقم للترتيب؛ الفارغ = ما لا نهاية (يُسحب أخيرًا). */
function expiryValue(raw) {
  if (!raw) return Infinity;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Infinity : t;
}

/**
 * **First-Expired-First-Out**: لا يُسحب صنفٌ من تشغيلةٍ أبعدَ انتهاءً وفي
 * المخزن ما هو أقرب. مخالفتُه تعني أن القديم يبقى حتى ينتهي فيُتلف —
 * وهي خسارةٌ صامتة لا يكشفها جردٌ ولا تقرير.
 *
 * يُقارن كل بندٍ مسحوب بأقرب تشغيلةٍ **متاحة فعلًا** (كمية > 0) لنفس
 * الصنف: إن كانت المسحوبة أبعد انتهاءً، فهي مخالفة.
 *
 * @param {object} pickDoc مستند السحب (بنوده تحمل sku/barcode و expiry)
 * @param {object[]} balances أرصدة المخزن (`balances/{صنف__مخزن__تشغيلة}`)
 * @returns {object[]} قائمة المخالفات (فارغة = مطابق)
 */
export function fefoViolations(pickDoc, balances) {
  const out = [];
  const stock = balances || [];
  if (!stock.length) return out;

  for (const line of pickDoc?.lines || []) {
    const picked = Number(line?.qtyPicked) || 0;
    if (picked <= 0) continue;

    const key = lineKey(line);
    if (!key) continue;

    // تشغيلات هذا الصنف المتاحة فعلًا
    const lots = stock.filter((b) => {
      const bKey = String(b?.sku || b?.barcode || '').trim().toUpperCase();
      return bKey === key && (Number(b?.qty) || 0) > 0;
    });
    if (!lots.length) continue;

    const earliest = lots.reduce((a, b) => (expiryValue(a.expiry) <= expiryValue(b.expiry) ? a : b));
    const earliestVal = expiryValue(earliest.expiry);
    const pickedVal = expiryValue(line.expiry);

    // لا صلاحية للأقرب ⇒ لا معيار للمقارنة أصلًا
    if (earliestVal === Infinity) continue;

    if (pickedVal > earliestVal) {
      out.push({
        key,
        description: line.description || key,
        pickedExpiry: line.expiry || 'بلا تاريخ',
        earliestExpiry: earliest.expiry,
        earliestBatch: earliest.batch || '',
        earliestQty: Number(earliest.qty) || 0,
        message: `سُحب من تشغيلةٍ تنتهي ${line.expiry || 'بلا تاريخ'} بينما في المخزن ${earliest.qty} تنتهي ${earliest.expiry}`,
      });
    }
  }
  return out;
}

/* ═══════════════ 🏅 حارس البوابة (F3) ═══════════════ */

/**
 * «لا خروج بلا تصريح معتمد» — إحدى القواعد الذهبية الستّ.
 *
 * يفحص مشروعية تصريح خروج: هل يستند إلى **إذن تسليم معتمَد**؟ وهل كمياته
 * لا تتجاوز ما أذن به الإذن؟ فتصريحٌ بكمياتٍ أكبر من الإذن هو خروج بضاعة
 * غير مأذون بها ولو حمل رقمًا رسميًّا.
 *
 * @param {object} gpDoc تصريح الخروج
 * @param {object|null} dnDoc إذن التسليم المرتبط
 * @returns {{ok:boolean, problems:string[], warnings:string[]}}
 */
export function gateVerdict(gpDoc, dnDoc) {
  const problems = [];
  const warnings = [];

  if (!dnDoc) {
    problems.push('لا إذن تسليم مرتبط — لا خروج بلا سند');
    return { ok: false, problems, warnings };
  }
  if (!['approved', 'done'].includes(dnDoc.state)) {
    problems.push(`إذن التسليم ${dnDoc.number || ''} لم يُعتمد بعد — لا يُصرَّح بالخروج على إذنٍ معلَّق`.trim());
  }
  if (!dnDoc.number) {
    problems.push('إذن التسليم بلا رقم رسمي');
  }

  // الكميات: ما يخرج لا يتجاوز ما أُذن به
  const allowed = new Map();
  for (const l of dnDoc.lines || []) {
    const k = lineKey(l);
    if (k) allowed.set(k, (allowed.get(k) || 0) + (Number(l.qty) || 0));
  }
  for (const l of gpDoc?.lines || []) {
    const k = lineKey(l);
    if (!k) continue;
    const qty = Number(l.qty) || 0;
    if (qty <= 0) continue;
    if (!allowed.has(k)) {
      problems.push(`«${l.description || k}» يخرج ولا وجود له في إذن التسليم`);
    } else if (qty > allowed.get(k)) {
      problems.push(`«${l.description || k}»: يخرج ${qty} والمأذون به ${allowed.get(k)}`);
    } else if (qty < allowed.get(k)) {
      warnings.push(`«${l.description || k}»: يخرج ${qty} من أصل ${allowed.get(k)} مأذونة — خروج جزئي`);
    }
  }

  const h = gpDoc?.header || {};
  if (!String(h.driverId || '').trim()) warnings.push('رقم بطاقة السائق غير مُدخل');

  return { ok: problems.length === 0, problems, warnings };
}

/* ═══════════════ 🔒 حارس التسوية (F4) ═══════════════ */

/**
 * «لا تسوية بلا محضر جرد مصادَق» — إحدى القواعد الذهبية.
 *
 * تصحيح رقمٍ في النظام أثرٌ ماليّ على قيمة المخزون؛ فبلا محضر جردٍ **معتمَد**
 * يستند إليه، التسويةُ تغييرٌ للأرقام بالنيّة. ويفحص أيضًا أن كل بندٍ يُسوّى
 * له فرقٌ فعليّ وسببٌ موثَّق — فسندٌ يُصحّح ما لا فرق فيه عبثٌ يُربك التدقيق.
 *
 * @param {object} adjDoc سند التسوية
 * @param {object|null} ccDoc محضر الجرد المرتبط
 * @returns {{ok:boolean, problems:string[], warnings:string[]}}
 */
export function adjustmentVerdict(adjDoc, ccDoc) {
  const problems = [];
  const warnings = [];

  if (!ccDoc) {
    problems.push('لا محضر جرد مرتبط — التسوية تُبنى على عدٍّ موثَّق لا على تقدير');
    return { ok: false, problems, warnings };
  }
  if (!['approved', 'done'].includes(ccDoc.state)) {
    problems.push(`محضر الجرد ${ccDoc.number || ''} لم يُصادَق بعد — لا تُسوّى أرقامٌ على جردٍ معلَّق`.trim());
  }
  if (!ccDoc.number) {
    problems.push('محضر الجرد بلا رقم رسمي');
  }

  const lines = (adjDoc?.lines || []).filter((l) => String(l?.sku || l?.description || '').trim());
  for (const l of lines) {
    const variance = (Number(l.actualQty) || 0) - (Number(l.bookQty) || 0);
    const label = l.description || l.sku;
    if (variance === 0) {
      warnings.push(`«${label}»: لا فرق بين الدفتري والفعلي — لا شيء يُسوّى`);
    } else if (!String(l.notes || '').trim()) {
      problems.push(`«${label}»: فرقٌ ${variance > 0 ? '+' : ''}${variance} بلا سبب مكتوب`);
    }
  }
  if (!lines.length) problems.push('لا بنود للتسوية');

  return { ok: problems.length === 0, problems, warnings };
}

/* ═══════════════ ⚖️ حارس الإشعار الدائن (F4) ═══════════════ */

/**
 * «لا خصم ماليّ بلا مرتجعٍ معتمَد» — الإشعار الدائن أثرٌ ماليّ يُبنى على
 * إشعار إرجاعٍ **معتمَد جودةً**، لا على طلبٍ شفهيّ. ويفحص ألّا يتجاوز
 * المخصوم ما أُرجع فعلًا.
 *
 * @param {object} cnDoc الإشعار الدائن
 * @param {object|null} retDoc إشعار الإرجاع المرتبط
 */
export function creditNoteVerdict(cnDoc, retDoc) {
  const problems = [];
  const warnings = [];

  if (!retDoc) {
    problems.push('لا إشعار إرجاع مرتبط — الخصم الماليّ يُبنى على مرتجعٍ معتمَد');
    return { ok: false, problems, warnings };
  }
  if (!['approved', 'done'].includes(retDoc.state)) {
    problems.push(`إشعار الإرجاع ${retDoc.number || ''} لم يُعتمد بعد`.trim());
  }

  const returned = new Map();
  for (const l of retDoc.lines || []) {
    const k = lineKey(l);
    if (k) returned.set(k, (returned.get(k) || 0) + (Number(l.qty) || 0));
  }
  for (const l of cnDoc?.lines || []) {
    const k = lineKey(l);
    if (!k) continue;
    const qty = Number(l.qty) || 0;
    if (qty <= 0) continue;
    if (!returned.has(k)) {
      problems.push(`«${l.description || k}» يُخصَم ولا وجود له في المرتجع`);
    } else if (qty > returned.get(k)) {
      problems.push(`«${l.description || k}»: يُخصَم ${qty} والمُرجَع ${returned.get(k)}`);
    }
  }

  return { ok: problems.length === 0, problems, warnings };
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
