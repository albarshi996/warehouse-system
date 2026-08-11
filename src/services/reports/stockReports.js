/**
 * تقارير المخزون الستّة (ر‑١ · يسدّ ف‑٧).
 *
 * كلٌّ منها **تعريفٌ لا شاشة**: أعمدةٌ وفلاترٌ ودالّةُ صفوفٍ خالصة. والمحرّك
 * يتولّى الفلترة والمجاميع والطباعة والتصدير — فلا تتباعد ستّة تقارير في ستّة
 * منطقات.
 *
 * مصدر الحقيقة دفتر الحركات `stock_moves` والأرصدة `balances` — لا استعلاماتٌ
 * جديدة تُخترع لكلّ تقرير فتنحرف عن الدفتر.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { uomLabel } from '../items/uomModel.js';

const str = (v) => String(v ?? '').trim();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => str(v).slice(0, 10);

/** فرق الأيّام بين تاريخين — موجبٌ يعني أنّ الأوّل بعد الثاني. */
function daysBetween(a, b) {
  const x = Date.parse(`${day(a)}T00:00:00Z`);
  const y = Date.parse(`${day(b)}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((x - y) / 86400000) : null;
}

const STOCK_ROLES = ['warehouse_manager', 'storekeeper', 'inventory_auditor', 'finance_manager'];

/* ═══════════ ١. كشف حركة الصنف ═══════════ */

/**
 * أوّل التقارير وأهمّها: كلّ حركةٍ للصنف برصيدها المتراكم.
 * الرصيد يُحسب **بعد الفلترة وبترتيب زمنيّ** — فمن فلتر مستودعًا رأى رصيده فيه.
 */
const itemMovement = {
  id: 'item-movement',
  titleAr: 'كشف حركة الصنف',
  group: 'المخزون',
  roles: STOCK_ROLES,
  note: 'الرصيد المتراكم محسوبٌ على الحركات المعروضة بترتيبها الزمنيّ.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'docType', label: 'نوع المستند', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المستند', kind: 'text' },
    { key: 'reasonLabel', label: 'نوع الحركة', kind: 'text' },
    { key: 'from', label: 'من', kind: 'text' },
    { key: 'to', label: 'إلى', kind: 'text' },
    { key: 'inQty', label: 'وارد', kind: 'qty', sum: true },
    { key: 'outQty', label: 'صادر', kind: 'qty', sum: true },
    { key: 'running', label: 'الرصيد المتراكم', kind: 'qty' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
    { key: 'expiry', label: 'الصلاحية', kind: 'date' },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
    { key: 'postedByName', label: 'الفاعل', kind: 'text' },
  ],
  rows: (data, values = {}) => {
    const wh = str(values.warehouse).toUpperCase();
    const out = (data?.moves || [])
      .map((m) => {
        // الوارد والصادر بالنسبة إلى الموقع المفلتَر؛ وبلا فلترٍ فالحركة كما هي.
        const isIn = wh ? str(m.to).toUpperCase() === wh : true;
        const isOut = wh ? str(m.from).toUpperCase() === wh : false;
        return {
          ...m,
          date: day(m.postedAtDay || m.date || m.docDate),
          warehouse: wh || `${str(m.from)}→${str(m.to)}`,
          inQty: isIn ? num(m.qty) : 0,
          outQty: isOut ? num(m.qty) : 0,
          value: money(m.value),
          uomLabel: uomLabel(m.baseUom),
        };
      })
      .filter((m) => !wh || str(m.from).toUpperCase() === wh || str(m.to).toUpperCase() === wh)
      .sort((a, b) => a.date.localeCompare(b.date) || str(a.id).localeCompare(str(b.id)));

    let running = 0;
    for (const r of out) {
      running = Math.round((running + r.inQty - r.outQty) * 1e6) / 1e6;
      r.running = running;
    }
    return out;
  },
};

/* ═══════════ ٢. أرصدة المواقع والدفعات ═══════════ */

const locationBalances = {
  id: 'location-balances',
  titleAr: 'أرصدة المواقع والدفعات',
  group: 'المخزون',
  roles: STOCK_ROLES,
  note: 'المتاح = الكمّيّة − المحجوز. ورصيدٌ باقٍ في موقع نظامٍ يعني عملًا لم يكتمل.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
  ],
  columns: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'nameAr', label: 'الاسم', kind: 'text' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
    { key: 'expiry', label: 'الصلاحية', kind: 'date' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'reserved', label: 'المحجوز', kind: 'qty', sum: true },
    { key: 'available', label: 'المتاح', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة', kind: 'money', sum: true },
  ],
  rows: (data) =>
    (data?.balances || [])
      .filter((b) => num(b.qty) !== 0 || num(b.reserved) !== 0)
      .map((b) => ({
        ...b,
        available: Math.round((num(b.qty) - num(b.reserved)) * 1e6) / 1e6,
        value: money(num(b.qty) * num(b.unitCost)),
      })),
};

/* ═══════════ ٣. الجرد والفروقات ═══════════ */

const countVariance = {
  id: 'count-variance',
  titleAr: 'الجرد والفروقات',
  group: 'المخزون',
  roles: STOCK_ROLES,
  note: 'الفرق = العدّ − الدفتريّ. والموجب زيادةٌ والسالب عجز.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'docNumber', label: 'المحضر', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'المحضر', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'bookQty', label: 'الدفتريّ', kind: 'qty', sum: true },
    { key: 'countedQty', label: 'العدّ', kind: 'qty', sum: true },
    { key: 'variance', label: 'الفرق', kind: 'qty', sum: true },
    { key: 'state', label: 'الحالة', kind: 'text' },
    { key: 'approvedBy', label: 'المعتمِد', kind: 'text' },
  ],
  rows: (data) =>
    (data?.documents || [])
      .filter((d) => d.type === 'CC' || d.type === 'ADJ')
      .flatMap((d) =>
        (d.lines || []).map((l) => ({
          date: day(d.header?.countDate || d.header?.adjustmentDate),
          docNumber: str(d.number),
          sku: str(l.sku),
          bookQty: num(l.bookQty ?? l.systemQty ?? l.qtyBook),
          countedQty: num(l.countedQty ?? l.counted ?? l.qtyCounted),
          variance: Math.round((num(l.countedQty ?? l.counted ?? l.qtyCounted) - num(l.bookQty ?? l.systemQty ?? l.qtyBook)) * 1e6) / 1e6,
          state: str(d.state),
          approvedBy: str(d.approvedByName),
        }))
      )
      .filter((r) => r.variance !== 0),
};

/* ═══════════ ٤. التالف والعجوزات ═══════════ */

const damageReport = {
  id: 'damage-losses',
  titleAr: 'التالف والعجوزات',
  group: 'المخزون',
  roles: STOCK_ROLES,
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'reason', label: 'السبب', kind: 'text' },
    { key: 'period', label: 'المدّة', kind: 'dateRange', field: 'date' },
  ],
  columns: [
    { key: 'date', label: 'التاريخ', kind: 'date' },
    { key: 'docNumber', label: 'السند', kind: 'text' },
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة المشطوبة', kind: 'money', sum: true },
    { key: 'reason', label: 'السبب', kind: 'text' },
    { key: 'responsible', label: 'المسؤول', kind: 'text' },
  ],
  rows: (data) =>
    (data?.documents || [])
      .filter((d) => d.type === 'DMG')
      .flatMap((d) =>
        (d.lines || []).map((l) => ({
          date: day(d.header?.discoveryDate),
          docNumber: str(d.number),
          sku: str(l.sku),
          qty: num(l.qty ?? l.qtyDamaged),
          value: money(num(l.qty ?? l.qtyDamaged) * num(l.unitCost ?? l.unitPrice)),
          reason: str(l.reason || d.header?.reason),
          responsible: str(d.header?.responsible || d.createdByName),
        }))
      ),
};

/* ═══════════ ٥. الراكد وإعادة الطلب ═══════════ */

const slowMoving = {
  id: 'slow-moving',
  titleAr: 'الراكد وإعادة الطلب',
  group: 'المخزون',
  roles: STOCK_ROLES,
  note: 'الأيّام بلا حركة تُحسب من آخر حركةٍ في الدفتر — وصنفٌ بلا حركةٍ قطّ يُعرض بلا رقمٍ لا بصفر.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'minDays', label: 'أيّامٌ بلا حركة لا تقلّ عن', kind: 'number', field: 'idleDays' },
  ],
  columns: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'nameAr', label: 'الاسم', kind: 'text' },
    { key: 'lastMove', label: 'آخر حركة', kind: 'date' },
    { key: 'idleDays', label: 'أيّام بلا حركة', kind: 'number' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة المجمّدة', kind: 'money', sum: true },
    { key: 'minStock', label: 'حدّ الطلب', kind: 'qty' },
    { key: 'reorderQty', label: 'كمّيّة التجديد', kind: 'qty', sum: true },
  ],
  rows: (data, values = {}) => {
    const today = day(values.today || data?.today);
    const lastBySku = new Map();
    for (const m of data?.moves || []) {
      const d = day(m.postedAtDay || m.date);
      const sku = str(m.sku).toUpperCase();
      if (d && (!lastBySku.has(sku) || d > lastBySku.get(sku))) lastBySku.set(sku, d);
    }
    const qtyBySku = new Map();
    const valueBySku = new Map();
    for (const b of data?.balances || []) {
      const sku = str(b.sku).toUpperCase();
      qtyBySku.set(sku, num(qtyBySku.get(sku)) + num(b.qty));
      valueBySku.set(sku, money(num(valueBySku.get(sku)) + num(b.qty) * num(b.unitCost)));
    }
    return (data?.items || [])
      .map((it) => {
        const sku = str(it.sku).toUpperCase();
        const lastMove = lastBySku.get(sku) || '';
        const qty = num(qtyBySku.get(sku));
        const minStock = num(it.minStock);
        return {
          sku: it.sku,
          nameAr: str(it.nameAr),
          lastMove,
          idleDays: lastMove && today ? daysBetween(today, lastMove) : null,
          qty,
          value: num(valueBySku.get(sku)),
          minStock,
          reorderQty: minStock > qty ? Math.round((minStock - qty) * 1e6) / 1e6 : 0,
        };
      })
      .filter((r) => r.qty > 0 || r.reorderQty > 0);
  },
};

/* ═══════════ ٦. الصلاحيات والدفعات ═══════════ */

const expiryReport = {
  id: 'expiry-batches',
  titleAr: 'الصلاحيات والدفعات',
  group: 'المخزون',
  roles: STOCK_ROLES,
  note: 'الأيّام المتبقّية سالبةً تعني دفعةً انتهت وما زالت على الرفّ.',
  filters: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
  ],
  columns: [
    { key: 'sku', label: 'الصنف', kind: 'text' },
    { key: 'batch', label: 'الدفعة', kind: 'text' },
    { key: 'expiry', label: 'الصلاحية', kind: 'date' },
    { key: 'daysLeft', label: 'الأيّام المتبقّية', kind: 'number' },
    { key: 'warehouse', label: 'الموقع', kind: 'text' },
    { key: 'qty', label: 'الكمّيّة', kind: 'qty', sum: true },
    { key: 'value', label: 'القيمة المعرّضة', kind: 'money', sum: true },
  ],
  rows: (data, values = {}) => {
    const today = day(values.today || data?.today);
    return (data?.balances || [])
      .filter((b) => str(b.expiry) && num(b.qty) > 0)
      .map((b) => ({
        sku: b.sku,
        batch: str(b.batch),
        expiry: day(b.expiry),
        daysLeft: today ? daysBetween(b.expiry, today) : null,
        warehouse: b.warehouse,
        qty: num(b.qty),
        value: money(num(b.qty) * num(b.unitCost)),
      }))
      .sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  },
};

/** الدفعة ر‑١ — ستّة تقارير، وأوّلها كشف حركة الصنف (نصّ الخطة). */
export const STOCK_REPORTS = [
  itemMovement,
  locationBalances,
  countVariance,
  damageReport,
  slowMoving,
  expiryReport,
];
