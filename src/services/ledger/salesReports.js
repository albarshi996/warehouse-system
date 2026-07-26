/**
 * التقارير الرقابية للمبيعات — منطق خالص يحوّل أوامر البيع إلى قرار.
 *
 * تقريران يجيبان عن سؤالَي الإدارة عن كل طلبٍ لم يُنفَّذ:
 *   1. **لماذا لم يُنفَّذ؟** (تقرير الطلبات المعلّقة) — أهو رصيدٌ ناقص أم تنفيذٌ
 *      متعثّر؟ وإن كان الرصيد موجودًا، فأين توقّف: بلا اعتماد · بلا سحب · قيد
 *      التجهيز؟ التصنيف يُشتقّ من حالة المستند وسلسلته لا من ظنّ.
 *   2. **ماذا نشتري؟** (تقرير الأصناف غير المتوفّرة) — كل صنفٍ عجز المخزون عن
 *      تلبيته: كم مرّة طُلب، وكم القيمة المفقودة، وما متوسط طلبه الشهري، ومتى
 *      آخر نفاد — فيصير العجز إشارةَ شراءٍ مسبَّبة لا شكوى.
 *
 * خالصٌ عمدًا: يأخذ مستندات سلسلة المبيعات ويُخرج بنيةً للعرض بلا Firestore
 * وبلا ساعةٍ (لا `Date.now`) — كي يُختبَر في Node ويبقى حسابه ثابتًا.
 *
 * مصدر الحقيقة: `soShortfall` و`soAllocation` المثبّتان على أمر البيع لحظة
 * اعتماده (انظر `salesService.js`)، وبنودُه وحالتُه وسلسلتُه.
 */

/** مفتاح الصنف: الكود أولًا فالباركود، مطبَّعًا. */
function itemKey(row) {
  return String(row?.sku || row?.barcode || '').trim().toUpperCase();
}

/** حالات الطلب في تقرير الطلبات المعلّقة. */
export const ORDER_STATUS = {
  'not-approved': { id: 'not-approved', label: 'لم يُعتمد بعد', emoji: '⏳', color: '#f59e0b', hasStock: null },
  'no-stock': { id: 'no-stock', label: 'لا يوجد رصيد', emoji: '🚫', color: '#ef4444', hasStock: false },
  'awaiting-pick': { id: 'awaiting-pick', label: 'يوجد رصيد — لم تتم التعبئة', emoji: '📦', color: '#3b82f6', hasStock: true },
  'in-fulfillment': { id: 'in-fulfillment', label: 'يوجد رصيد — قيد التجهيز', emoji: '🚚', color: '#0ea5e9', hasStock: true },
  'on-hold': { id: 'on-hold', label: 'موقوف (سببٌ مسجَّل)', emoji: '✋', color: '#8b5cf6', hasStock: true },
  delivered: { id: 'delivered', label: 'سُلّم', emoji: '✅', color: '#10b981', hasStock: null },
  closed: { id: 'closed', label: 'مقفل', emoji: '🏁', color: '#059669', hasStock: null },
};

/** أبناء أمر البيع من نوعٍ ما (يحملون رابطًا إليه في `links.SO`). */
function childrenOf(so, docs, type) {
  return (docs || []).filter((d) => d?.type === type && d?.links?.SO?.id === so.id);
}

/** قيمة أمر البيع (كمية × سعر). */
function orderValue(so) {
  return (so?.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0) * (Number(l?.unitPrice) || 0), 0);
}

/**
 * يصنّف أمر بيعٍ واحدًا: أهو معلّقٌ؟ ولماذا؟
 * الأولوية: التسليم يُنهي كل شيء ← الإقفال ← عدم الاعتماد ← الإيقاف اليدوي ←
 * انعدام الرصيد ← التعثّر في التعبئة أو التجهيز.
 */
export function classifyOrder(so, docs) {
  const dnDone = childrenOf(so, docs, 'DN').some((d) => d.state === 'done');
  if (dnDone) return { status: 'delivered', pending: false };
  if (so.state === 'done') return { status: 'closed', pending: false };

  const shortfall = so.soShortfall || [];
  const reservedNothing = so.soReserved && (so.soAllocation || []).length === 0;

  if (['draft', 'submitted', 'rejected'].includes(so.state)) {
    return { status: 'not-approved', pending: true, shortfall };
  }
  // معتمَد ولم يُسلَّم:
  const hold = String(so.header?.holdReason || '').trim();
  if (hold && hold !== '—') return { status: 'on-hold', pending: true, holdReason: hold, shortfall };
  if (shortfall.length && reservedNothing) return { status: 'no-stock', pending: true, shortfall };
  const pickExists = childrenOf(so, docs, 'PICK').length > 0;
  if (pickExists) return { status: 'in-fulfillment', pending: true, shortfall };
  return { status: 'awaiting-pick', pending: true, shortfall };
}

/**
 * تقرير الطلبات المعلّقة — كل أمر بيعٍ لم يُسلَّم، مصنَّفًا بالرصيد وسبب التعثّر.
 *
 * @param {Array} docs مستندات سلسلة المبيعات (SO · PICK · PACK · DN · GP · INV)
 * @returns {{rows, pending, withStock, noStock, byReason, pendingValue}}
 */
export function pendingOrders(docs) {
  const orders = (docs || []).filter((d) => d?.type === 'SO');
  const rows = orders
    .map((so) => {
      const c = classifyOrder(so, docs);
      const meta = ORDER_STATUS[c.status];
      return {
        id: so.id,
        number: so.number || null,
        customer: so.header?.customer || '',
        warehouse: so.header?.warehouse || '',
        orderDate: so.header?.orderDate || '',
        value: orderValue(so),
        shortfallCount: (c.shortfall || []).length,
        holdReason: c.holdReason || '',
        status: c.status,
        statusLabel: meta.label,
        hasStock: meta.hasStock,
        pending: c.pending,
      };
    })
    .filter((r) => r.pending);

  // المتأخّر رصيدًا (لا يوجد رصيد) أوّلًا، ثم الأقدم طلبًا.
  const order = { 'no-stock': 0, 'on-hold': 1, 'awaiting-pick': 2, 'in-fulfillment': 3, 'not-approved': 4 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || String(a.orderDate).localeCompare(String(b.orderDate)));

  const byReason = {};
  for (const r of rows) byReason[r.status] = (byReason[r.status] || 0) + 1;

  return {
    rows,
    pending: rows.length,
    withStock: rows.filter((r) => r.hasStock === true).length,
    noStock: rows.filter((r) => r.hasStock === false).length,
    byReason,
    pendingValue: rows.reduce((s, r) => s + r.value, 0),
  };
}

/** مفتاح الشهر من تاريخٍ نصّي `YYYY-MM-DD` — أو null إن تعذّر. */
function monthKey(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * تقرير الأصناف غير المتوفّرة — يجمع العجز عبر كل أوامر البيع صنفًا صنفًا:
 * عدد مرّات الطلب · الكمية العاجزة · القيمة المفقودة · متوسط الطلب الشهري ·
 * تاريخ آخر نفاد. يُغذّي التنبؤ بالطلب والتخطيط الشرائي وحدّ المخزون الأدنى.
 *
 * متوسط الطلب الشهري = إجمالي الطلب (لا العجز) ÷ عدد الأشهر التي شهدت طلبًا —
 * فهو حجم الطلب لا حجم الفشل، وعليه يُبنى حدّ المخزون.
 *
 * @param {Array} docs مستندات سلسلة المبيعات
 * @returns {{rows, totalLostValue, itemCount}}
 */
export function outOfStockItems(docs) {
  const orders = (docs || []).filter((d) => d?.type === 'SO');

  const months = new Set();
  for (const so of orders) {
    const mk = monthKey(so.header?.orderDate);
    if (mk) months.add(mk);
  }
  const monthCount = Math.max(1, months.size);

  const byItem = new Map();
  const init = (key, seed) => {
    if (!byItem.has(key)) byItem.set(key, { key, sku: '', barcode: '', nameAr: '', times: 0, shortQty: 0, lostValue: 0, demand: 0, lastStockout: '', ...seed });
    return byItem.get(key);
  };

  for (const so of orders) {
    const priceByKey = new Map();
    for (const l of so.lines || []) {
      const k = itemKey(l);
      if (!k) continue;
      priceByKey.set(k, Number(l?.unitPrice) || 0);
      const rec = init(k, { sku: l.sku || '', barcode: l.barcode || '', nameAr: l.description || '' });
      rec.demand += Number(l?.qty) || 0;
      if (!rec.nameAr && l.description) rec.nameAr = l.description;
    }
    for (const s of so.soShortfall || []) {
      const k = itemKey(s);
      if (!k) continue;
      const rec = init(k, { sku: s.sku || '', barcode: s.barcode || '', nameAr: s.nameAr || '' });
      rec.times += 1;
      rec.shortQty += Number(s?.shortfall) || 0;
      rec.lostValue += (Number(s?.shortfall) || 0) * (priceByKey.get(k) || 0);
      const od = String(so.header?.orderDate || '');
      if (od > rec.lastStockout) rec.lastStockout = od;
    }
  }

  const rows = [...byItem.values()]
    .filter((r) => r.times > 0)
    .map((r) => ({ ...r, avgMonthly: r.demand / monthCount }))
    .sort((a, b) => b.lostValue - a.lostValue || b.shortQty - a.shortQty);

  return {
    rows,
    totalLostValue: rows.reduce((s, r) => s + r.lostValue, 0),
    itemCount: rows.length,
    monthsSpanned: monthCount,
  };
}
