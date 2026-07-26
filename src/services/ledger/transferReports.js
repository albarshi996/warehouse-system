/**
 * تقارير النقل — منطق خالص يقرأ مستندات النقل ويُخرج حالة كل شحنة وفروقها.
 *
 * يجيب عن سؤالين لا يجيب عنهما الورق:
 *   1. **ماذا في الطريق؟** — أيّ شحنةٍ غادرت ولم تُستلم بعد (تقرير الشحنات
 *      المعلّقة). هذا هو رصيد مخزن النقل مفصّلًا بمستنداته.
 *   2. **أين ضاع الفرق؟** — الكمية المشحونة مقابل المستلَمة صنفًا صنفًا،
 *      بمسؤولها وسببها وحالة تسويته (تقرير فروقات النقل).
 *
 * خالصٌ عمدًا: يأخذ مصفوفة مستندات النقل ويُخرج بنيةً جاهزة للعرض بلا Firestore
 * وبلا DOM — كي يُختبَر في Node، تمامًا كـ`chain.js` و`inbox.js`.
 *
 * القاعدة الحاكمة: **مخزن النقل يجب أن يعود صفرًا**. فكل شحنةٍ لم تُقفل، وكل
 * فرقٍ لم يُسوَّ، رصيدٌ باقٍ في مخزن النقل — والتقرير يكشفه لا يُخفيه.
 */
import { lineKey } from '../documents/chain.js';

/** حالات الشحنة في تقرير الشحنات المعلّقة. */
export const SHIPMENT_STATUS = {
  draft: { id: 'draft', label: 'قيد التجهيز', emoji: '📝', color: '#6b7280' },
  'in-transit': { id: 'in-transit', label: 'في الطريق (لم تُستلم)', emoji: '🚚', color: '#f59e0b' },
  received: { id: 'received', label: 'استُلمت كاملةً', emoji: '✅', color: '#10b981' },
  variance: { id: 'variance', label: 'استُلمت بفرق كميات', emoji: '⚠️', color: '#ef4444' },
};

/** يجمع كميات مستندٍ في خريطة مفتاح → كمية. */
function tallyBy(lines, field) {
  const map = new Map();
  for (const line of lines || []) {
    const key = lineKey(line);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(line?.[field]) || 0));
  }
  return map;
}

/** إجمالي كمية حقلٍ في مستند. */
function sumField(lines, field) {
  return (lines || []).reduce((s, l) => s + (Number(l?.[field]) || 0), 0);
}

/** استلاماتُ مستند نقلٍ بعينه: من يحمل رابطًا إليه في `links.TRN`. */
function receiptsFor(trn, receipts) {
  return (receipts || []).filter((r) => r?.links?.TRN?.id === trn.id);
}

/**
 * تقرير الشحنات المعلّقة — لكل مستند نقلٍ **مُنجَز** (غادر فعلًا) حالتُه:
 * في الطريق · استُلم كاملًا · استُلم بفرق. الشحنة غير المنجَزة لم تغادر بعد.
 *
 * @param {Array} docs مستندات النقل (TR · TRN · TRC مختلطة)
 * @returns {{rows:Array, inTransit:number, withVariance:number, transitValue:number}}
 */
export function pendingShipments(docs) {
  const notes = (docs || []).filter((d) => d?.type === 'TRN');
  const receipts = (docs || []).filter((d) => d?.type === 'TRC');

  const rows = notes.map((trn) => {
    const rcpts = receiptsFor(trn, receipts).filter((r) => r.state === 'done');
    const shipped = sumField(trn.lines, 'qtyShipped');
    const received = rcpts.reduce((s, r) => s + sumField(r.lines, 'qtyReceived'), 0);
    const remaining = shipped - received;

    let status;
    if (trn.state !== 'done') status = 'draft';
    else if (!rcpts.length) status = 'in-transit';
    else if (remaining > 0.0001) status = 'variance';
    else status = 'received';

    return {
      id: trn.id,
      number: trn.number || null,
      fromWarehouse: trn.header?.fromWarehouse || '',
      toWarehouse: trn.header?.toWarehouse || '',
      driverName: trn.header?.driverName || '',
      vehiclePlate: trn.header?.vehiclePlate || '',
      shipmentDate: trn.header?.shipmentDate || '',
      shipped,
      received,
      remaining: Math.max(0, remaining),
      value: sumField(trn.lines, 'qtyShipped') && trn.lines
        ? trn.lines.reduce((s, l) => s + (Number(l?.qtyShipped) || 0) * (Number(l?.unitCost) || 0), 0)
        : 0,
      receiptNumbers: rcpts.map((r) => r.number).filter(Boolean),
      status,
      statusLabel: SHIPMENT_STATUS[status].label,
    };
  });

  // الأحدث أولًا، والمعلّق قبل المُقفل.
  const order = { 'in-transit': 0, variance: 1, draft: 2, received: 3 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || String(b.shipmentDate).localeCompare(String(a.shipmentDate)));

  const openRows = rows.filter((r) => r.status === 'in-transit' || r.status === 'variance');
  return {
    rows,
    inTransit: rows.filter((r) => r.status === 'in-transit').length,
    withVariance: rows.filter((r) => r.status === 'variance').length,
    received: rows.filter((r) => r.status === 'received').length,
    // القيمة العالقة في مخزن النقل = ما لم يصل بعدُ الوجهةَ.
    transitValue: openRows.reduce((s, r) => {
      const perUnit = r.shipped ? r.value / r.shipped : 0;
      return s + perUnit * r.remaining;
    }, 0),
  };
}

/**
 * تقرير فروقات النقل — لكل زوج (مستند نقل ↔ استلامه) الفروقُ صنفًا صنفًا:
 * المشحون · المستلَم · الفارق · السبب · حالة التسوية. لا فرق = لا صفّ.
 *
 * @param {Array} docs مستندات النقل
 * @returns {{rows:Array, totalShortage:number, unresolved:number}}
 */
export function transferVariances(docs) {
  const notes = (docs || []).filter((d) => d?.type === 'TRN');
  const receipts = (docs || []).filter((d) => d?.type === 'TRC' && d.state === 'done');
  const rows = [];

  for (const trn of notes) {
    const rcpts = receiptsFor(trn, receipts);
    if (!rcpts.length) continue; // لا استلام ⇒ لا فرق بعد (شحنةٌ في الطريق)

    const shippedBy = tallyBy(trn.lines, 'qtyShipped');
    const receivedBy = new Map();
    const reasonBy = new Map();
    const settlementBy = new Map();
    for (const r of rcpts) {
      for (const line of r.lines || []) {
        const key = lineKey(line);
        if (!key) continue;
        receivedBy.set(key, (receivedBy.get(key) || 0) + (Number(line?.qtyReceived) || 0));
        if (String(line?.varianceReason || '').trim()) reasonBy.set(key, line.varianceReason);
      }
      if (String(r.header?.settlementStatus || '').trim()) {
        for (const key of shippedBy.keys()) if (!settlementBy.has(key)) settlementBy.set(key, r.header.settlementStatus);
      }
    }

    const descByKey = new Map((trn.lines || []).map((l) => [lineKey(l), l.description || l.sku || l.barcode || '']));

    for (const [key, shipped] of shippedBy) {
      const received = receivedBy.get(key) || 0;
      const variance = received - shipped;
      if (Math.abs(variance) < 0.0001) continue; // لا فرق يُذكر
      const settlement = settlementBy.get(key) || 'قيد المراجعة';
      rows.push({
        key,
        transferNote: trn.number || trn.id,
        fromWarehouse: trn.header?.fromWarehouse || '',
        toWarehouse: trn.header?.toWarehouse || '',
        description: descByKey.get(key) || key,
        shipped,
        received,
        variance,
        shortage: variance < 0 ? -variance : 0,
        reason: reasonBy.get(key) || '',
        settlement,
        resolved: settlement === 'مسوّى' || settlement === 'مشطوب',
      });
    }
  }

  rows.sort((a, b) => b.shortage - a.shortage);
  return {
    rows,
    totalShortage: rows.reduce((s, r) => s + r.shortage, 0),
    unresolved: rows.filter((r) => !r.resolved).length,
  };
}
