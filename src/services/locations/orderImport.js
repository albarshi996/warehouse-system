/**
 * ‹ODOO-ORD› استيرادُ أوامر البيع والشراء من أودو — منطقٌ خالص بلا Firebase ولا DOM.
 *
 * مستندُ المصدر المنجَز (`postedImport.js`) واقعةٌ لا تتغيّر فيُرحَّل مرّة. أمّا الأمرُ فيتقدّم في أودو:
 * يُسلَّم جزئيًّا ثمّ كاملًا، ويُفوتَر، وقد يُلغى. فالقرارُ هنا لكلّ أمرٍ واحدٌ من سبعة:
 *
 *   new          جديدٌ نشط        ⟵ يُنشأ ويُعتمد (سجلٌّ للاطّلاع)
 *   newCanceled  جديدٌ ملغًى       ⟵ يُنشأ ملغًى — «كافّةُ ملفّات أودو في البوّابة» (المالك)
 *   update       تغيّر في أودو      ⟵ يُحدَّث في مكانه، والتدقيقُ يحفظ التحديث
 *   cancel       أُلغي بعد استيراده ⟵ يُلغى في البوّابة بسببٍ مكتوب
 *   resume       استيرادٌ انقطع      ⟵ يُكمَل بالمستند نفسه
 *   same         لم يتغيّر          ⟵ لا يُمسّ (صفرُ كتابة)
 *   skip         عرضُ سعرٍ لم يُؤكَّد ⟵ لا يُستورد
 * و`error` لما يُحجب بسببٍ مكتوب.
 *
 * والتغيّرُ يُعرف بـ`sourceUpdatedAt` (أحدثُ تعديلٍ على الأمر أو بنوده في أودو) — لا بمقارنة الحقول.
 */
import { fingerprintId } from './sourceImport.js';
import { PORTAL_WAREHOUSES } from './postedImport.js';

export const ORDER_KIND = 'order';
export const ORDER_TYPES = Object.freeze({ OSO: 'أمر بيع', OPO: 'أمر شراء' });

/** حالاتُ أودو بلغة القارئ. */
export const ODOO_STATE_LABELS = Object.freeze({
  draft: 'عرض سعر', sent: 'عرض مُرسَل', 'to approve': 'بانتظار الموافقة',
  sale: 'مؤكَّد', purchase: 'مؤكَّد', done: 'مقفل', cancel: 'ملغى',
});
export const DONE_STATUS_LABELS = Object.freeze({ pending: 'لم يبدأ', partial: 'جزئيّ', full: 'مكتمل', started: 'جارٍ' });
export const INVOICE_STATUS_LABELS = Object.freeze({ no: 'لا شيء للفوترة', 'to invoice': 'للفوترة', invoiced: 'مفوتَر', upselling: 'فرصة بيع إضافيّ' });

const ACTIVE = new Set(['sale', 'purchase', 'done']);
const QUOTE = new Set(['draft', 'sent', 'to approve']);

const str = (v) => (v === false || v === null || v === undefined ? '' : String(v).trim());
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const upper = (v) => str(v).toUpperCase();

/** معرّفُ سجلّ الأمر في `source_imports` — بنوعه ورقمه. */
export function orderFingerprint(type, sourceSystem, docRef) {
  return `ORDER__${upper(sourceSystem) || 'ODOO'}__${upper(type)}__${upper(docRef)}`;
}
export function orderMarkerId(type, sourceSystem, docRef) {
  return fingerprintId(orderFingerprint(type, sourceSystem, docRef));
}

const HEADER = [
  'docRef', 'docId', 'orderType', 'sourceSystem', 'docStatus', 'orderDate', 'warehouse', 'partnerCode', 'partner', 'orderRef',
  'doneStatus', 'invoiceStatus', 'amountTotal', 'currency', 'salesperson', 'commitmentDate', 'sourceUpdatedAt',
];

/** الصفوفُ المسطّحة ⟵ أوامر (بنوعها ورقمها) — واختلافُ رأسٍ بين صفَّين يُعلن. */
export function groupOrderRows(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const ref = str(row?.docRef);
    const type = upper(row?.orderType);
    if (!ref) continue;
    const key = `${type}|${ref}`;
    if (!byKey.has(key)) {
      const head = { lines: [], conflicts: [] };
      for (const f of HEADER) head[f] = f === 'orderType' ? type : str(row[f]);
      byKey.set(key, head);
    }
    const o = byKey.get(key);
    for (const f of HEADER) {
      const incoming = f === 'orderType' ? type : str(row[f]);
      if (!incoming) continue;
      if (!o[f]) o[f] = incoming;
      else if (o[f] !== incoming) o.conflicts.push(`«${f}»: ${o[f]} ≠ ${incoming}`);
    }
    o.lines.push({
      lineId: str(row.lineId), sku: str(row.sku), barcode: str(row.barcode), description: str(row.description), uom: str(row.uom),
      qty: num(row.qty), qtyDone: num(row.qtyDone), qtyInvoiced: num(row.qtyInvoiced),
      unitPrice: num(row.unitPrice), discount: num(row.discount), subtotal: num(row.subtotal),
    });
  }
  return [...byKey.values()];
}

/**
 * المعاينة — ما يُعرض قبل أيّ كتابة.
 * @param {Map<string,{documentId:string, exists:boolean, state:string, sourceUpdatedAt:string}>} [opts.known]
 */
export function buildOrdersPreview(rows, { known = new Map(), warehouses = PORTAL_WAREHOUSES, sheetErrors = [] } = {}) {
  const accepted = new Set(warehouses.map(upper));
  const orders = groupOrderRows(rows).map((o) => {
    const problems = o.conflicts.map((c) => `تعارضُ رأس — ${c}`);
    const state = o.docStatus.toLowerCase();
    if (!ORDER_TYPES[o.orderType]) problems.push(`نوعٌ غير معروف «${o.orderType}» — OSO أو OPO.`);
    if (!/^\d{4}-\d{2}-\d{2}/.test(o.orderDate)) problems.push('بلا تاريخ أمر.');
    if (o.warehouse && !accepted.has(upper(o.warehouse))) problems.push(`المستودع «${o.warehouse}» ليس من مستودعات البوّابة.`);
    if (!o.lines.length) problems.push('بلا بنود.');
    o.lines.forEach((l, i) => { if (!l.sku && !l.barcode) problems.push(`البند ${i + 1}: لا كود ولا باركود.`); });

    const markerId = orderMarkerId(o.orderType, o.sourceSystem, o.docRef);
    const prior = known.get(markerId);
    const canceled = state === 'cancel';
    let status;
    if (problems.length) status = 'error';
    else if (QUOTE.has(state) && !prior) status = 'skip';
    else if (!prior) status = canceled ? 'newCanceled' : ACTIVE.has(state) ? 'new' : 'skip';
    else if (!prior.exists || ['draft', 'submitted', 'rejected'].includes(prior.state)) status = 'resume';
    else if (canceled && prior.state !== 'canceled') status = 'cancel';
    else if (prior.state === 'canceled' || str(prior.sourceUpdatedAt) === o.sourceUpdatedAt) status = 'same';
    else status = 'update';

    return {
      ...o, markerId, status, problems, canceled,
      documentId: prior?.documentId || '', priorState: prior?.state || '',
      qty: o.lines.reduce((s, l) => s + l.qty, 0), qtyDone: o.lines.reduce((s, l) => s + l.qtyDone, 0),
    };
  });
  const count = (s) => orders.filter((o) => o.status === s).length;
  const errors = (sheetErrors || []).filter((e) => e?.severity !== 'warning');
  const actionable = orders.filter((o) => ['new', 'newCanceled', 'update', 'cancel', 'resume'].includes(o.status));
  return {
    orders,
    errors,
    summary: {
      total: orders.length,
      new: count('new'), newCanceled: count('newCanceled'), update: count('update'), cancel: count('cancel'),
      resume: count('resume'), same: count('same'), skip: count('skip'), error: count('error'),
      lines: actionable.reduce((s, o) => s + o.lines.length, 0),
    },
    ok: actionable.length > 0 && errors.length === 0,
  };
}

/** أمرُ المعاينة ⟵ رأسٌ وبنود بشكل OSO/OPO. */
export function toOrderDraft(o) {
  return {
    type: o.orderType,
    header: {
      sourceRef: o.docRef, sourceSystem: o.sourceSystem || 'Odoo', sourceDoneDate: o.orderDate.slice(0, 10),
      warehouse: upper(o.warehouse), partner: o.partner, partnerCode: o.partnerCode, orderRef: o.orderRef,
      sourceState: o.docStatus, doneStatus: o.doneStatus, invoiceStatus: o.invoiceStatus,
      amountTotal: num(o.amountTotal), currency: o.currency, salesperson: o.salesperson,
      commitmentDate: o.commitmentDate.slice(0, 10), sourceUpdatedAt: o.sourceUpdatedAt, sourceDocId: o.docId,
      notes: o.canceled ? 'أُلغي في أودو' : '',
    },
    lines: o.lines.map(({ lineId, ...l }) => ({ ...l, sourceLineId: lineId })),
  };
}

/** سجلُّ منع التكرار للأمر — يُكتب قبل المستند ويحمل معرّفه. */
export function orderMarker(o, documentId) {
  return {
    fingerprint: orderFingerprint(o.orderType, o.sourceSystem, o.docRef),
    kind: ORDER_KIND,
    docRef: o.docRef,
    lineId: '',
    sourceUpdatedAt: o.sourceUpdatedAt || '',
    sourceSystem: o.sourceSystem || 'Odoo',
    documentId,
    documentType: o.orderType,
    lines: o.lines.length,
  };
}
