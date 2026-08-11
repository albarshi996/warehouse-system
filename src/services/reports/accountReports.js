/**
 * تقارير الحسابات الستّة (ر‑٢ · تعتمد على م‑٤).
 *
 * كلّها مبنيّةٌ على **دفتر الذمم** (م٤-ج) وعلى المستندات المنجَزة — لا على
 * استعلاماتٍ جديدة تُخترع لكلّ تقرير فتنحرف عن الدفتر. وهذا هو الفرق بين
 * تقريرٍ يُحتجّ به وتقريرٍ يُناقَش.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { statement, aging, AGING_BUCKETS } from '../ledger/partnerLedger.js';

const str = (v) => String(v ?? '').trim();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => str(v).slice(0, 10);

const FINANCE_ROLES = ['warehouse_manager', 'finance_manager', 'treasury'];
const SALES_ROLES = ['warehouse_manager', 'finance_manager', 'sales_supervisor'];

/** كشف حسابٍ لطرفٍ واحد — قالبٌ يخدم المورّد والعميل بلا تكرار. */
function statementReport({ id, titleAr, party, roles, note }) {
  return {
    id,
    titleAr,
    group: 'الحسابات',
    roles,
    note,
    filters: [
      { key: 'partyCode', label: 'الطرف', kind: 'text' },
      { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
      { key: 'docType', label: 'نوع المستند', kind: 'text' },
    ],
    columns: [
      { key: 'date', label: 'التاريخ', kind: 'date' },
      { key: 'partyName', label: 'الطرف', kind: 'text' },
      { key: 'docNumber', label: 'المستند', kind: 'text' },
      { key: 'labelAr', label: 'البيان', kind: 'text' },
      { key: 'debit', label: 'مدين', kind: 'money', sum: true },
      { key: 'credit', label: 'دائن', kind: 'money', sum: true },
      { key: 'balance', label: 'الرصيد المتراكم', kind: 'money' },
    ],
    rows: (data, values = {}) => {
      const entries = (data?.ledger || []).filter((e) => e.party === party);
      const view = statement(entries, { partyCode: str(values.partyCode) });
      return view.rows.map((r) => ({
        ...r,
        debit: r.direction === 'debit' ? money(r.amount) : 0,
        credit: r.direction === 'credit' ? money(r.amount) : 0,
      }));
    },
  };
}

/* ═══════════ ١ و٢. كشفا الحساب ═══════════ */

const supplierStatement = statementReport({
  id: 'supplier-statement',
  titleAr: 'كشف حساب مورّد (دائن)',
  party: 'supplier',
  roles: FINANCE_ROLES,
  note: 'الرصيد الموجب يعني ما علينا للمورّد. وكلّ سطرٍ يحمل مستنده — فإن اختُلف، هذا ما يُفتح.',
});

const customerStatement = statementReport({
  id: 'customer-statement',
  titleAr: 'كشف حساب عميل (مدين)',
  party: 'customer',
  roles: [...FINANCE_ROLES, 'sales_supervisor'],
  note: 'الرصيد الموجب يعني ما على العميل لنا.',
});

/* ═══════════ ٣. أعمار الديون ═══════════ */

const agingReport = {
  id: 'aging',
  titleAr: 'أعمار الديون (خمس شرائح)',
  group: 'الحسابات',
  roles: [...FINANCE_ROLES, 'sales_supervisor'],
  note: 'المقاصّة بالأقدم أوّلًا — فمن دفع سدّد أقدم فاتورةٍ لا أحدثها. وفائض الدائن دفعةٌ مقدَّمة لا دَين.',
  filters: [
    { key: 'partyName', label: 'الطرف', kind: 'text' },
    { key: 'party', label: 'النوع', kind: 'select', options: ['customer', 'supplier'] },
    { key: 'minTotal', label: 'رصيدٌ لا يقلّ عن', kind: 'number', field: 'total' },
  ],
  columns: [
    { key: 'partyName', label: 'الطرف', kind: 'text' },
    ...AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, kind: 'money', sum: true })),
    { key: 'total', label: 'الإجماليّ', kind: 'money', sum: true },
    { key: 'advance', label: 'دفعة مقدَّمة', kind: 'money', sum: true },
  ],
  rows: (data, values = {}) =>
    aging(data?.ledger || [], day(values.today || data?.today)).map((r) => ({
      partyName: r.partyName,
      partyCode: r.partyCode,
      party: r.party,
      ...r.buckets,
      total: r.total,
      advance: r.advance,
    })),
};

/* ═══════════ ٤. المشتريات بالمورّد والصنف ═══════════ */

const purchasesReport = {
  id: 'purchases-by-supplier',
  titleAr: 'المشتريات بالمورّد والصنف',
  group: 'الحسابات',
  roles: [...FINANCE_ROLES, 'purchase_officer'],
  note: 'من الاستلامات المنجَزة — لا من أوامر الشراء: الأمر نيّةٌ والاستلام واقعة.',
  filters: [
    { key: 'supplier', label: 'المورّد', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'الاستلام', kind: 'text' },
    { key: 'supplier', label: 'المورّد', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
  ],
  rows: (data) =>
    (data?.documents || [])
      .filter((d) => d.type === 'GRN' && d.state === 'done')
      .flatMap((d) =>
        (d.lines || []).map((l) => {
          const qty = num(l.qtyAccepted ?? l.qtyReceived);
          return {
            date: day(d.header?.receivedAt),
            docNumber: str(d.number),
            supplier: str(d.header?.supplier),
            sku: str(l.sku),
            qty,
            value: money(qty * num(l.unitCost ?? l.unitPrice)),
          };
        })
      )
      .filter((r) => r.qty > 0),
};

/* ═══════════ ٥. المبيعات بالعميل والصنف والمندوب ═══════════ */

const salesReport = {
  id: 'sales-by-customer',
  titleAr: 'المبيعات بالعميل والصنف والمندوب',
  group: 'الحسابات',
  roles: SALES_ROLES,
  filters: [
    { key: 'customer', label: 'العميل', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'rep', label: 'المندوب', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'customer', label: 'العميل', kind: 'text' },
    { key: 'rep', label: 'المندوب', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'net', label: 'الصافي', kind: 'money', sum: true },
    { key: 'manualPrice', label: 'سعر يدويّ', kind: 'text' },
  ],
  rows: (data) =>
    (data?.documents || [])
      .filter((d) => ['INV', 'VSI', 'VCS'].includes(d.type) && d.state === 'done')
      .flatMap((d) =>
        (d.lines || []).map((l) => ({
          date: day(d.header?.invoiceDate || d.header?.saleDate),
          docNumber: str(d.number),
          customer: str(d.header?.customer || d.header?.customerCode),
          rep: str(d.header?.repName || d.createdByName),
          sku: str(l.sku),
          qty: num(l.qty),
          net: money(Math.max(0, num(l.qty) * num(l.unitPrice) - num(l.discount))),
          // وسم م٣-ج يظهر هنا: من باع بغير سعر القائمة يُرى في تقرير المبيعات نفسه.
          manualPrice: l.pricing?.manualPrice ? 'نعم' : '',
        }))
      )
      .filter((r) => r.qty > 0),
};

/* ═══════════ ٦. المرتجعات والإشعارات ═══════════ */

const returnsReport = {
  id: 'returns-notes',
  titleAr: 'المرتجعات والإشعارات',
  group: 'الحسابات',
  roles: [...FINANCE_ROLES, 'return_manager', 'sales_supervisor'],
  filters: [
    { key: 'party', label: 'الطرف', kind: 'text' },
    { key: 'docType', label: 'النوع', kind: 'select', options: ['RET', 'CRN', 'CN', 'SRN'] },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'docType', label: 'النوع', kind: 'text' },
    { key: 'party', label: 'الطرف', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
    { key: 'reason', label: 'السبب', kind: 'text' },
  ],
  rows: (data) =>
    (data?.documents || [])
      .filter((d) => ['RET', 'CRN', 'CN', 'SRN'].includes(d.type) && d.state === 'done')
      .flatMap((d) =>
        (d.lines || []).map((l) => {
          const qty = num(l.qty ?? l.qtyReturned ?? l.qtyRejected);
          return {
            date: day(d.header?.returnDate || d.header?.issueDate || d.header?.rejectionDate),
            docNumber: str(d.number),
            docType: str(d.type),
            party: str(d.header?.customer || d.header?.supplier || d.header?.customerCode),
            sku: str(l.sku),
            qty,
            value: money(qty * num(l.unitPrice ?? l.unitCost)),
            reason: str(l.reason || d.header?.reason),
          };
        })
      )
      .filter((r) => r.qty > 0),
};

/** الدفعة ر‑٢ — ستّة تقارير تعتمد على م‑٤. */
export const ACCOUNT_REPORTS = [
  supplierStatement,
  customerStatement,
  agingReport,
  purchasesReport,
  salesReport,
  returnsReport,
];
