/**
 * ‹ODOO-RPT› تقاريرُ أودو — منطقٌ خالص بلا Firestore وبلا DOM.
 *
 * طلبُ المالك 2026-10-21: «البوّابةُ هي الشاشةُ السهلةُ الفهم لأحداث أودو» — أوامرُ البيع والاستلامُ
 * والتوصيلُ والمرتجعُ والمخزونُ اليوميّ والشهريّ، مع التنزيل إكسل.
 *
 * ═══ المصدرُ واحد: مستنداتُ المصدر المُرحَّلة ═══
 * كلُّ ما أُنجز في أودو يصل البوّابةَ مستندًا مُرحَّلًا (SRI · SRO · SXO · SXI · SRA — انظر
 * `locations/postedImport.js`). فالتقريرُ يقرأ المستندَ نفسَه — رقمَه في أودو ويومَ إنجازه هناك وطرفَه
 * وبنودَه — لا جدولًا موازيًا يتباعد عنه. والقراءةُ مستندٌ لكلّ سطرٍ في الجدول لا بندٌ لكلّ سطر.
 *
 * ═══ المخزونُ في يوم: الرصيدُ الآن ناقصَ ما وقع بعده ═══
 * لا لقطةَ مخزَّنةً لكلّ يوم؛ والرصيدُ الجاري (`balances`) صادقٌ الآن. فرصيدُ نهاية اليوم D =
 * رصيدُ الآن − صافي كلِّ مستندٍ مُرحَّلٍ وقع بعد D. وأثرُ المستند يُحسب **بمحرّك القيد نفسه**
 * (`buildMoves` ثمّ `balanceDeltas`) فلا يفترق التقريرُ عن الدفتر.
 * ويومُ الواقعة: يومُ الإنجاز في المصدر لمستند أودو، ويومُ الترحيل لغيره.
 */
import { buildMoves, balanceDeltas } from '../ledger/movements.js';
import { OPENING_CUTOFF } from '../locations/postedImport.js';

/**
 * أوّلُ يومٍ يُعرف رصيدُه: يومُ لقطة الافتتاح (19 أكتوبر) — آخرُه هو الافتتاحيّ. وما قبله لا تعرفه البوّابة،
 * فلا يُعرض له رقمٌ يبدو صادقًا وهو مجرّدُ الافتتاحيّ مكرَّرًا.
 */
export const FIRST_KNOWN_DAY = new Date(Date.parse(`${OPENING_CUTOFF}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** أنواعُ مستندات المصدر المُرحَّلة. */
export const ODOO_TYPES = Object.freeze(['SRI', 'SRO', 'SXO', 'SXI', 'SRA']);

/** المستودعاتُ التي يعرضها تقريرُ المخزون — والطريقُ معها. */
export const STOCK_WAREHOUSES = Object.freeze(['WH001', 'WH002', 'TRANSIT']);
export const WAREHOUSE_NAMES = Object.freeze({ WH001: 'بنغازي', WH002: 'طرابلس', TRANSIT: 'الطريق' });

const str = (v) => (v === null || v === undefined || v === false ? '' : String(v).trim());
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n) => Math.round(n * 100) / 100;

/** يومُ ليبيا (UTC+2) من ملّي ثانية — `YYYY-MM-DD`. */
export function libyaDayOf(ms) {
  return Number.isFinite(ms) ? new Date(ms + 2 * 3600 * 1000).toISOString().slice(0, 10) : '';
}

/** يومُ واقعة المستند: إنجازُه في المصدر، وإلّا يومُ ترحيله. */
export function eventDayOf(doc) {
  return str(doc?.header?.sourceDoneDate).slice(0, 10) || libyaDayOf(num(doc?.postedAtMs) || NaN);
}

/** أمرتجعٌ هو؟ العلَمُ أوّلًا، والملاحظةُ لمستندٍ رُحّل قبل وجود العلَم. */
export function isReturnDoc(doc) {
  const flag = doc?.header?.isReturn;
  if (flag === true || flag === false) return flag;
  return /مرتجع/.test(str(doc?.header?.notes));
}

const inRange = (day, from, to) => Boolean(day) && (!from || day >= from) && (!to || day <= to);

function lineQty(doc) {
  return round((doc?.lines || []).reduce((s, l) => s + Math.abs(num(l?.qty)), 0));
}
function lineValue(doc) {
  return round((doc?.lines || []).reduce((s, l) => s + Math.abs(num(l?.qty)) * num(l?.unitCost), 0));
}
function matchesParty(doc, party) {
  const p = str(party).toLowerCase();
  if (!p) return true;
  return `${str(doc?.header?.partner)} ${str(doc?.header?.partnerCode)}`.toLowerCase().includes(p);
}
function warehouseOf(doc) {
  const h = doc?.header || {};
  return str(h.warehouse) || str(h.fromWarehouse) || str(h.toWarehouse);
}

/**
 * مستنداتُ نوعٍ في مدّة — الأساسُ المشترك لتقارير الاستلام والتوصيل والمرتجع.
 * @param {Array} docs
 * @param {{from?:string, to?:string, warehouse?:string, party?:string}} filters
 */
export function selectDocs(docs, predicate, { from = '', to = '', warehouse = '', party = '' } = {}) {
  return (docs || [])
    .filter((d) => d?.posted !== false && d?.state !== 'canceled')
    .filter(predicate)
    .filter((d) => inRange(eventDayOf(d), from, to))
    .filter((d) => !warehouse || warehouseOf(d) === warehouse || str(d?.header?.toWarehouse) === warehouse)
    .filter((d) => matchesParty(d, party))
    .sort((a, b) => eventDayOf(b).localeCompare(eventDayOf(a)) || str(b?.header?.sourceRef).localeCompare(str(a?.header?.sourceRef)));
}

/** صفٌّ لكلّ مستند — رأسُ التقرير. */
export function docRow(d) {
  const h = d?.header || {};
  return {
    day: eventDayOf(d),
    sourceRef: str(h.sourceRef),
    number: str(d?.number),
    type: str(d?.type),
    warehouse: warehouseOf(d),
    warehouseName: WAREHOUSE_NAMES[warehouseOf(d)] || warehouseOf(d),
    partner: str(h.partner),
    partnerCode: str(h.partnerCode),
    orderRef: str(h.orderRef),
    isReturn: isReturnDoc(d),
    lines: (d?.lines || []).length,
    qty: lineQty(d),
    value: lineValue(d),
    id: str(d?.id),
  };
}

/** صفٌّ لكلّ بند — ورقةُ «البنود» في الإكسل. */
export function lineRows(docs) {
  const out = [];
  for (const d of docs || []) {
    const r = docRow(d);
    for (const l of d?.lines || []) {
      out.push({
        day: r.day, sourceRef: r.sourceRef, number: r.number, warehouse: r.warehouse, partner: r.partner, orderRef: r.orderRef,
        sku: str(l?.sku), barcode: str(l?.barcode), description: str(l?.description),
        qty: round(Math.abs(num(l?.qty))), unitCost: num(l?.unitCost), value: round(Math.abs(num(l?.qty)) * num(l?.unitCost)),
        lot: str(l?.sourceLot),
      });
    }
  }
  return out;
}

/* ═══════════════ التقاريرُ الأربعة المستنديّة ═══════════════ */

export const isReceipt = (d) => d?.type === 'SRI' && !isReturnDoc(d);
export const isDelivery = (d) => d?.type === 'SRO' && !isReturnDoc(d);
export const isReturn = (d) => (d?.type === 'SRI' || d?.type === 'SRO') && isReturnDoc(d);

/** اتّجاهُ المرتجع بلغة القارئ. */
export function returnDirection(d) {
  return d?.type === 'SRI' ? 'من عميل' : 'إلى مورّد';
}

/**
 * أوامرُ البيع — من التسليمات المُرحَّلة مجمّعةً بمرجع أمر البيع في أودو.
 * (استيرادُ أوامر البيع نفسِها بكمّيّاتها المطلوبة مرحلةٌ تالية؛ وهذا ما سُلّم منها فعلًا.)
 */
export function salesOrdersReport(docs, filters = {}) {
  const deliveries = selectDocs(docs, isDelivery, filters);
  const byOrder = new Map();
  for (const d of deliveries) {
    const r = docRow(d);
    const key = r.orderRef || `بلا أمر · ${r.sourceRef}`;
    const o = byOrder.get(key) || {
      orderRef: key, partner: r.partner, partnerCode: r.partnerCode, warehouses: new Set(),
      firstDay: r.day, lastDay: r.day, deliveries: 0, lines: 0, qty: 0, value: 0, refs: [],
    };
    o.warehouses.add(r.warehouseName);
    if (r.day < o.firstDay) o.firstDay = r.day;
    if (r.day > o.lastDay) o.lastDay = r.day;
    o.deliveries += 1;
    o.lines += r.lines;
    o.qty = round(o.qty + r.qty);
    o.value = round(o.value + r.value);
    o.refs.push(r.sourceRef);
    byOrder.set(key, o);
  }
  return [...byOrder.values()]
    .map((o) => ({ ...o, warehouses: [...o.warehouses].join('، '), refs: o.refs.join('، ') }))
    .sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.orderRef.localeCompare(b.orderRef));
}

/** ملخّصُ أرقام تقريرٍ مستنديّ — للطبقة العليا من الشاشة. */
export function summarize(rows) {
  return {
    docs: rows.length,
    lines: rows.reduce((s, r) => s + (r.lines || 0), 0),
    qty: round(rows.reduce((s, r) => s + (r.qty || 0), 0)),
    value: round(rows.reduce((s, r) => s + (r.value || 0), 0)),
  };
}

/* ═══════════════ المخزونُ اليوميّ والشهريّ ═══════════════ */

/** صنفُ الحركة على المستودع — بلغة التقرير. */
export function flowOf(doc, delta) {
  const t = doc?.type;
  const ret = isReturnDoc(doc);
  if (t === 'SRI') return ret ? 'returnIn' : 'receiptIn';
  if (t === 'SRO') return ret ? 'returnOut' : 'deliveryOut';
  if (t === 'SXO' || t === 'SXI' || t === 'TRN' || t === 'TRC') return delta > 0 ? 'transferIn' : 'transferOut';
  if (t === 'SRA' || t === 'ADJ') return 'adjustment';
  return delta > 0 ? 'otherIn' : 'otherOut';
}

export const FLOW_LABELS = Object.freeze({
  receiptIn: 'استلام', returnIn: 'مرتجع وارد', transferIn: 'نقل وارد',
  deliveryOut: 'توصيل', returnOut: 'مرتجع صادر', transferOut: 'نقل صادر',
  adjustment: 'تسوية', otherIn: 'وارد آخر', otherOut: 'صادر آخر',
});

/**
 * أثرُ المستندات على المستودعات — صفٌّ لكلّ (مستند × صنف × مستودع) بيومه وصنف حركته.
 * يُحسب بمحرّك القيد نفسه؛ ومستندٌ تعذّر بناءُ حركاته يُعاد في `problems` ولا يُبتلع.
 */
export function docDeltas(docs, { warehouses = STOCK_WAREHOUSES } = {}) {
  const keep = new Set(warehouses);
  const rows = [];
  const problems = [];
  for (const d of docs || []) {
    if (!d?.posted) continue;
    const { moves, problems: p } = buildMoves({ ...d, state: 'done' });
    if (p.length) { problems.push(`${str(d?.number) || str(d?.id)}: ${p.join(' · ')}`); continue; }
    const day = eventDayOf(d);
    for (const x of balanceDeltas(moves).deltas) {
      if (!keep.has(x.warehouse)) continue;
      rows.push({ day, docId: str(d?.id), type: d?.type, sku: x.sku || x.barcode, nameAr: x.nameAr, warehouse: x.warehouse, delta: x.delta, flow: flowOf(d, x.delta) });
    }
  }
  return { rows, problems };
}

/** أيّامُ المدّة بالترتيب — `from` حتّى `to` شاملين. */
export function daysBetween(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (t <= end && out.length < 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

/**
 * المخزونُ اليوميّ لكلّ مستودع: أوّلُ اليوم · وارداتُه وصادراتُه بأصنافها · آخرُه.
 *
 * @param {object} p
 * @param {Record<string, number>} p.currentByWarehouse رصيدُ كلّ مستودعٍ **الآن**
 * @param {Array} p.deltas صفوفُ `docDeltas` لكلّ مستندٍ وقع **منذ `from` حتّى الآن**
 * @param {string} p.from
 * @param {string} p.to
 */
export function dailyStock({ currentByWarehouse = {}, deltas = [], from, to, warehouses = STOCK_WAREHOUSES, firstKnownDay = FIRST_KNOWN_DAY }) {
  const days = daysBetween(from < firstKnownDay ? firstKnownDay : from, to);
  const out = [];
  for (const wh of warehouses) {
    const mine = deltas.filter((r) => r.warehouse === wh);
    const after = (day) => round(mine.filter((r) => r.day > day).reduce((s, r) => s + r.delta, 0));
    for (const day of days) {
      const closing = round(num(currentByWarehouse[wh]) - after(day));
      const today = mine.filter((r) => r.day === day);
      const flows = Object.fromEntries(Object.keys(FLOW_LABELS).map((k) => [k, 0]));
      for (const r of today) flows[r.flow] = round(flows[r.flow] + r.delta);
      const net = round(today.reduce((s, r) => s + r.delta, 0));
      out.push({ day, warehouse: wh, warehouseName: WAREHOUSE_NAMES[wh] || wh, opening: round(closing - net), ...flows, net, closing });
    }
  }
  return out;
}

/** المخزونُ الشهريّ: أوّلُ الشهر من أوّل أيّامه، وآخرُه من آخرها، والحركاتُ مجموعة. */
export function monthlyStock(daily) {
  const byKey = new Map();
  for (const r of daily || []) {
    const key = `${r.warehouse}|${r.day.slice(0, 7)}`;
    const m = byKey.get(key);
    if (!m) {
      byKey.set(key, { ...r, month: r.day.slice(0, 7), firstDay: r.day, lastDay: r.day });
      continue;
    }
    if (r.day < m.firstDay) { m.firstDay = r.day; m.opening = r.opening; }
    if (r.day > m.lastDay) { m.lastDay = r.day; m.closing = r.closing; }
    for (const k of [...Object.keys(FLOW_LABELS), 'net']) m[k] = round(num(m[k]) + num(r[k]));
  }
  return [...byKey.values()].map(({ day: _day, firstDay, lastDay, ...m }) => ({ ...m, days: `${firstDay} ← ${lastDay}` }));
}

/**
 * المخزونُ لكلّ صنفٍ في نهاية يومٍ ما: رصيدُه الآن ناقصَ ما وقع بعد ذلك اليوم.
 * @param {Array} balances صفوفُ `balances` الآن ({sku, barcode, nameAr, warehouse, qty})
 * @param {Array} deltas صفوفُ `docDeltas`
 */
export function stockAsOf(balances, deltas, day, { warehouses = STOCK_WAREHOUSES } = {}) {
  const keep = new Set(warehouses);
  const key = (sku, wh) => `${str(sku).toUpperCase()}|${wh}`;
  const items = new Map();
  for (const b of balances || []) {
    if (!keep.has(str(b?.warehouse))) continue;
    const sku = str(b?.sku) || str(b?.barcode);
    const k = key(sku, b.warehouse);
    const it = items.get(k) || { sku, barcode: str(b?.barcode), nameAr: str(b?.nameAr), warehouse: b.warehouse, now: 0, after: 0 };
    it.now = round(it.now + num(b?.qty));
    items.set(k, it);
  }
  for (const r of deltas || []) {
    if (!(r.day > day)) continue;
    const k = key(r.sku, r.warehouse);
    const it = items.get(k) || { sku: r.sku, barcode: '', nameAr: r.nameAr, warehouse: r.warehouse, now: 0, after: 0 };
    it.after = round(it.after + r.delta);
    items.set(k, it);
  }
  return [...items.values()]
    .map((it) => ({ ...it, warehouseName: WAREHOUSE_NAMES[it.warehouse] || it.warehouse, qty: round(it.now - it.after) }))
    .filter((it) => it.qty !== 0 || it.now !== 0)
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.nameAr.localeCompare(b.nameAr) || a.sku.localeCompare(b.sku));
}

/* ═══════════════ أوراقُ الإكسل ═══════════════ */

/** أعمدةُ كلّ تقرير — ما يُعرض هو ما يُنزَّل، بالترتيب نفسِه. */
export const COLUMNS = Object.freeze({
  docs: [
    ['day', 'التاريخ'], ['sourceRef', 'المرجع في أودو'], ['number', 'رقم البوّابة'], ['warehouseName', 'المستودع'],
    ['partner', 'الطرف'], ['partnerCode', 'كود الطرف'], ['orderRef', 'أمر البيع/الشراء'], ['lines', 'البنود'], ['qty', 'الكمّيّة'], ['value', 'القيمة'],
  ],
  lines: [
    ['day', 'التاريخ'], ['sourceRef', 'المرجع في أودو'], ['number', 'رقم البوّابة'], ['warehouse', 'المستودع'], ['partner', 'الطرف'],
    ['orderRef', 'أمر البيع/الشراء'], ['sku', 'كود الصنف'], ['barcode', 'الباركود'], ['description', 'اسم الصنف'],
    ['qty', 'الكمّيّة'], ['unitCost', 'تكلفة الوحدة'], ['value', 'القيمة'], ['lot', 'الدفعة'],
  ],
  orders: [
    ['orderRef', 'أمر البيع'], ['partner', 'العميل'], ['partnerCode', 'كود العميل'], ['warehouses', 'المستودع'],
    ['firstDay', 'أوّل تسليم'], ['lastDay', 'آخر تسليم'], ['deliveries', 'التسليمات'], ['lines', 'البنود'], ['qty', 'الكمّيّة المسلَّمة'], ['value', 'القيمة'], ['refs', 'مراجع التسليم'],
  ],
  daily: [
    ['day', 'اليوم'], ['warehouseName', 'المستودع'], ['opening', 'أوّل اليوم'],
    ...Object.entries(FLOW_LABELS).map(([k, l]) => [k, l]), ['net', 'الصافي'], ['closing', 'آخر اليوم'],
  ],
  monthly: [
    ['month', 'الشهر'], ['warehouseName', 'المستودع'], ['days', 'الأيّام'], ['opening', 'أوّل الشهر'],
    ...Object.entries(FLOW_LABELS).map(([k, l]) => [k, l]), ['net', 'الصافي'], ['closing', 'آخر الشهر'],
  ],
  asOf: [['warehouseName', 'المستودع'], ['sku', 'كود الصنف'], ['barcode', 'الباركود'], ['nameAr', 'اسم الصنف'], ['qty', 'الرصيد']],
});

/** صفوفٌ ⟵ مصفوفةٌ للإكسل (عناوينُ ثمّ قيم) — والمرتجعُ يُضاف إليه اتّجاهُه. */
export function toAoa(columnsKey, rows, extra = []) {
  const cols = [...COLUMNS[columnsKey], ...extra];
  return [cols.map(([, label]) => label), ...(rows || []).map((r) => cols.map(([k]) => (r[k] === undefined ? '' : r[k])))];
}
