/**
 * التقارير التشغيليّة — البيع والفروع والنقل والمندوبون (SAP-14 · يسدّ ف‑٤٧).
 *
 * ═══ القاعدة الحاكمة (طلب المالك 2026-08-14) ═══
 * «كلّ ما له أثرٌ في البوابة يجب أن يكون له تقرير». وقد كانت التقارير
 * تذكر ١٤ نوع مستندٍ من ٣٨ — فأربعةٌ وعشرون نوعًا تُحرّك بضاعةً أو مالًا
 * ولا يظهر أثرها في تقرير. هذه الدفعة تُغلق الفجوة، **ويحرسها اختبارٌ
 * آليّ** (`reportCoverage`) يمنع أن يُضاف نوعٌ ذو أثرٍ بلا تقريرٍ بعد اليوم.
 *
 * ═══ ولا شاشة جديدة ═══
 * التقرير **تعريفٌ لا شاشة** (نمط `REPORTS` القائم): أعمدةٌ وفلاترٌ ودالّةُ
 * صفوفٍ خالصة، والمحرّك يتولّى الفلترة والمجاميع والطباعة والتصدير. ومصدر
 * الحقيقة الدفتر `stock_moves` والمستندات — لا استعلاماتٌ تُخترع فتنحرف.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { SALES_DOC_TYPES } from '../items/uomWiring.js';
import { forwardTrace, reverseTrace, supplier360 } from './traceReports.js';

const str = (v) => String(v ?? '').trim();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => str(v).slice(0, 10);

const OPS_ROLES = ['warehouse_manager', 'storekeeper', 'inventory_auditor', 'finance_manager', 'sales_supervisor'];
const FIELD_ROLES = ['warehouse_manager', 'sales_supervisor', 'finance_manager'];

/** تاريخ الحركة أو المستند — الدفتر يحمل `postedAtDay`، والمستند رأسه. */
const dateOf = (r) => day(r?.postedAtDay || r?.date || r?.docDate || r?.header?.issueDate || r?.header?.date);

/** رأس مستندٍ بأمان. */
const head = (d) => d?.header || {};

/* ═══════════ ١. تقرير المبيعات — ما خرج بيعًا وبكم ═══════════ */

const salesReport = {
  id: 'sales-movement',
  titleAr: 'تقرير المبيعات',
  group: 'العمليات',
  roles: OPS_ROLES,
  note: 'من الدفتر: كلّ ما خرج بيعًا (تسليم · بيع من المركبة · فاتورة) بكمّيّته وقيمته.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'docType', label: 'نوع المستند', kind: 'text' },
    { key: 'warehouse', label: 'المصدر', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'docType', label: 'النوع', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'nameAr', label: 'الاسم', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
    { key: 'warehouse', label: 'المصدر', kind: 'text' },
    { key: 'repName', label: 'المندوب', kind: 'text' },
  ],
  rows: (data) =>
    (data?.moves || [])
      .filter((m) => SALES_DOC_TYPES.has(str(m.docType)))
      .map((m) => ({
        ...m,
        date: dateOf(m),
        qty: num(m.qty),
        value: money(m.value),
        warehouse: str(m.from),
      })),
};

/* ═══════════ ٢. تقرير الفروع/المستودعات — أثر كلّ موقع ═══════════ */

const branchReport = {
  id: 'branch-activity',
  titleAr: 'تقرير الفروع والمستودعات',
  group: 'العمليات',
  roles: OPS_ROLES,
  note: 'لكلّ موقعٍ: ما دخله وما خرج منه وصافيه — من الدفتر مباشرةً.',
  filters: [
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'inQty', label: 'وارد', kind: 'qty', sum: true },
    { key: 'outQty', label: 'صادر', kind: 'qty', sum: true },
    { key: 'netQty', label: 'الصافي', kind: 'qty', sum: true },
    { key: 'inValue', label: 'قيمة الوارد', kind: 'money', sum: true },
    { key: 'outValue', label: 'قيمة الصادر', kind: 'money', sum: true },
    { key: 'moves', label: 'عدد الحركات', kind: 'number', sum: true },
    { key: 'date', label: 'آخر حركة', kind: 'date' },
  ],
  rows: (data) => {
    const byWh = new Map();
    const touch = (code, dir, m) => {
      const key = str(code).toUpperCase();
      if (!key) return;
      const prev = byWh.get(key) || {
        warehouse: key, inQty: 0, outQty: 0, netQty: 0, inValue: 0, outValue: 0, moves: 0, date: '',
      };
      const q = num(m.qty);
      const v = money(m.value);
      if (dir > 0) { prev.inQty += q; prev.inValue += v; } else { prev.outQty += q; prev.outValue += v; }
      prev.netQty = prev.inQty - prev.outQty;
      prev.moves += 1;
      const d = dateOf(m);
      if (d > prev.date) prev.date = d;
      byWh.set(key, prev);
    };
    for (const m of data?.moves || []) {
      touch(m.to, +1, m);
      touch(m.from, -1, m);
    }
    return [...byWh.values()].map((r) => ({
      ...r, inValue: money(r.inValue), outValue: money(r.outValue),
    }));
  },
};

/* ═══════════ ٣. تقرير النقل بين المستودعات ═══════════ */

const transferReport = {
  id: 'transfer-movement',
  titleAr: 'تقرير النقل بين المستودعات',
  group: 'العمليات',
  roles: OPS_ROLES,
  note: 'حركات النقل الثلاث (طلب · شحن · استلام). ما بقي في «العبور» شحنةٌ لم تُستلم.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'docType', label: 'نوع المستند', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'docType', label: 'النوع', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'from', label: 'من', kind: 'text' },
    { key: 'to', label: 'إلى', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
  ],
  rows: (data) =>
    (data?.moves || [])
      .filter((m) => ['TR', 'TRN', 'TRC'].includes(str(m.docType)))
      .map((m) => ({ ...m, date: dateOf(m), qty: num(m.qty), value: money(m.value) })),
};

/* ═══════════ ٤. تقرير المندوبين — أثر كلّ مندوب ═══════════ */

const repReport = {
  id: 'rep-activity',
  titleAr: 'تقرير المندوبين',
  group: 'العمليات',
  roles: FIELD_ROLES,
  note: 'لكلّ مندوب: ما حُمّل بعهدته وما باعه وما أرجعه — من الدفتر بحقل المندوب.',
  filters: [
    { key: 'repName', label: 'المندوب', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'repName', label: 'المندوب', kind: 'text' },
    { key: 'loadedQty', label: 'المحمَّل', kind: 'qty', sum: true },
    { key: 'soldQty', label: 'المُباع', kind: 'qty', sum: true },
    { key: 'returnedQty', label: 'المُرجَع', kind: 'qty', sum: true },
    { key: 'onVanQty', label: 'المتبقّي بالعهدة', kind: 'qty', sum: true },
    { key: 'soldValue', label: 'قيمة المبيعات', kind: 'money', sum: true },
    { key: 'trips', label: 'الرحلات', kind: 'number', sum: true },
    { key: 'date', label: 'آخر نشاط', kind: 'date' },
  ],
  rows: (data) => {
    const byRep = new Map();
    for (const m of data?.moves || []) {
      const rep = str(m.repName);
      if (!rep) continue;
      const prev = byRep.get(rep) || {
        repName: rep, loadedQty: 0, soldQty: 0, returnedQty: 0, onVanQty: 0,
        soldValue: 0, trips: 0, date: '', _trips: new Set(),
      };
      const t = str(m.docType);
      const q = num(m.qty);
      if (t === 'VLD') prev.loadedQty += q;
      else if (t === 'VSI' || t === 'VCS') { prev.soldQty += q; prev.soldValue += money(m.value); }
      else if (t === 'VRT' || t === 'CRN') prev.returnedQty += q;
      prev.onVanQty = prev.loadedQty - prev.soldQty - prev.returnedQty;
      const trip = str(m.tripRef);
      if (trip) prev._trips.add(trip);
      prev.trips = prev._trips.size;
      const d = dateOf(m);
      if (d > prev.date) prev.date = d;
      byRep.set(rep, prev);
    }
    return [...byRep.values()].map(({ _trips, ...r }) => ({ ...r, soldValue: money(r.soldValue) }));
  },
};

/* ═══════════ ٥. سجلّ المستندات — كلّ نوعٍ وأثره ═══════════ */

/**
 * التقرير الجامع الذي يُغلق ف‑٤٧ بنيويًّا: **كلّ** مستندٍ في النظام بنوعه
 * وحالته وطرفه وأثره المخزنيّ — فما من نوعٍ يغيب عن التقارير مهما نَدَر.
 * وهو مقصد المالك حرفيًّا: «أيّ شيءٍ له أثرٌ في البوابة يجب أن يكون له تقرير».
 */
const documentsRegister = {
  id: 'documents-register',
  titleAr: 'سجلّ المستندات وأثرها',
  group: 'العمليات',
  roles: OPS_ROLES,
  note: 'كلّ مستندٍ في النظام بنوعه وحالته وطرفه وأثره المخزنيّ — لا نوعَ خارج التقارير.',
  filters: [
    { key: 'type', label: 'النوع', kind: 'text' },
    { key: 'state', label: 'الحالة', kind: 'text' },
    { key: 'party', label: 'الطرف', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'number', label: 'الرقم', kind: 'text' },
    { key: 'type', label: 'النوع', kind: 'text' },
    { key: 'state', label: 'الحالة', kind: 'text' },
    { key: 'party', label: 'الطرف', kind: 'text' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'lines', label: 'البنود', kind: 'number', sum: true },
    { key: 'postedMoves', label: 'حركات مرحَّلة', kind: 'number', sum: true },
    { key: 'createdByName', label: 'المنشئ', kind: 'text' },
  ],
  rows: (data) =>
    (data?.documents || []).map((d) => {
      const h = head(d);
      return {
        ...d,
        date: dateOf(d),
        number: str(d.number) || '—',
        type: str(d.type),
        state: str(d.state),
        party: str(h.supplier || h.customer || h.beneficiary || h.repName || h.returningBranch),
        warehouse: str(h.warehouse || h.fromWarehouse),
        lines: (d.lines || []).length,
        postedMoves: num(d.postedMoves),
      };
    }),
};

/* ═══════════ ٦. تتبّع الدفعة أمامًا وخلفًا (SR-66/67 · ف‑٣٣) ═══════════ */

/**
 * التتبّع تقريرٌ لا شاشةٌ مستقلّة: يُدخل المستخدم الصنف والدفعة والاتّجاه،
 * فيرى الرحلة خطوةً خطوة بمستنداتها. والحكم كلّه في `traceReports.js`
 * الخالص المُختبَر — هنا عرضُه في مركز التقارير مع بقيّة إخوته.
 */
const batchTrace = {
  id: 'batch-trace',
  titleAr: 'تتبّع الدفعة (أمامًا وخلفًا)',
  group: 'العمليات',
  roles: OPS_ROLES,
  note: 'اكتب الصنف (والدفعة إن شئت) واختر الاتّجاه: أمامًا من الاستلام إلى العميل، وخلفًا من العميل إلى المورّد.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
    { key: 'direction', label: 'الاتّجاه', kind: 'select', options: ['أمامًا', 'خلفًا'] },
  ],
  columns: [
    { key: 'step', label: '#', kind: 'number' },
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'docType', label: 'النوع', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty' },
    { key: 'from', label: 'من', kind: 'text' },
    { key: 'to', label: 'إلى', kind: 'text' },
    { key: 'party', label: 'الطرف', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
  ],
  rows: (data, values = {}) => {
    const key = { sku: str(values.sku), batch: str(values.batch) };
    if (!key.sku && !key.batch) return []; // بلا صنفٍ ولا دفعة: لا رحلة تُتبَّع
    const trace = str(values.direction) === 'خلفًا'
      ? reverseTrace(data?.moves || [], key)
      : forwardTrace(data?.moves || [], key);
    return trace.steps.map((s, i) => ({ ...s, step: i + 1 }));
  },
};

/* ═══════════ ٧. المورّد 360° (SR-65 · ف‑٣٢) ═══════════ */

const supplierScore = {
  id: 'supplier-360',
  titleAr: 'المورّدون 360° (زمن التوريد والرفض والالتزام)',
  group: 'العمليات',
  roles: ['warehouse_manager', 'purchase_officer', 'finance_manager'],
  note: 'المؤشّرات الثلاثة محسوبةٌ من المستندات — ومورّدٌ بلا مستندات مؤشّراته «—» لا أصفارٌ كاذبة.',
  filters: [
    { key: 'partnerCode', label: 'المورّد', kind: 'text' },
  ],
  columns: [
    { key: 'partnerCode', label: 'المورّد', kind: 'text' },
    { key: 'orderCount', label: 'أوامر الشراء', kind: 'number', sum: true },
    { key: 'receiptCount', label: 'الاستلامات', kind: 'number', sum: true },
    { key: 'avgLeadDays', label: 'متوسّط زمن التوريد (يوم)', kind: 'number' },
    { key: 'rejectionRate', label: 'نسبة الرفض ٪', kind: 'number' },
    { key: 'fulfilmentRate', label: 'نسبة الالتزام ٪', kind: 'number' },
    { key: 'returnCount', label: 'المرتجعات', kind: 'number', sum: true },
  ],
  rows: (data) => {
    // كلّ مورّدٍ ورد في المستندات — لا قائمةٌ اسميّة تُستورد (§16.6 ‹597›).
    const codes = new Set();
    for (const d of data?.documents || []) {
      const code = str(head(d).supplierCode || head(d).supplier).toUpperCase();
      if (code) codes.add(code);
    }
    return [...codes].map((code) => {
      const s = supplier360(code, data);
      return {
        partnerCode: code,
        ...s.metrics,
        avgLeadDays: s.metrics.avgLeadDays ?? '—',
        rejectionRate: s.metrics.rejectionRate ?? '—',
        fulfilmentRate: s.metrics.fulfilmentRate ?? '—',
        returnCount: s.returns.length,
      };
    });
  },
};

export const OPERATIONS_REPORTS = [
  salesReport,
  branchReport,
  transferReport,
  repReport,
  documentsRegister,
  batchTrace,
  supplierScore,
];
