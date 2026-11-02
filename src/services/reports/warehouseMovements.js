/**
 * تقرير حركة المستودعات وفق كلّ مستودع (طلب المالك) — منطق خالص.
 *
 * يأخذ حركات الدفتر (`stock_moves`) ويجمعها **لكلّ مستودعٍ على حدة**: ما دخل
 * رفوفه (الوارد) وما خرج منها (المنصرف) وصافيهما وقيمتهما وعددها، مع تفصيلٍ
 * بالسبب وقائمةٍ بالحركات جاهزةٍ للعرض والتصدير.
 *
 * ═══ المستودع يُشتقّ من الحركات لا من قائمةٍ ثابتة ═══
 * أيّ مستودعٍ يظهر في `from`/`to` يظهر في التقرير تلقائيًّا — فمستودعٌ جديد لا
 * ينتظر تعديلَ قائمة. والمواقع الانتقاليّة (ساحةُ الاستلام · مخزنُ النقل · تحت
 * الإنتاج …) والمركباتُ والعملاءُ والخارجُ ليست مستودعاتٍ، بل هي الطرفُ المقابل.
 *
 * ═══ الاتجاه من `from`/`to` لا من إشارة الكمية ═══
 * الكمّيّةُ موجبةٌ أبدًا في الدفتر، والاتجاه يحمله الطرفان:
 *   حركةٌ وجهتُها (`to`) مستودعٌ    ⟵ واردٌ إليه.
 *   حركةٌ مصدرُها (`from`) مستودعٌ  ⟶ منصرفٌ منه.
 * وحركةُ نقلٍ بين مستودعَين تُحسب واردًا لوجهتها ومنصرفًا لمصدرها معًا — وهو
 * الصحيح: رفٌّ امتلأ ورفٌّ فرغ.
 *
 * منطق خالص: بلا Firestore وبلا DOM — يُختبَر في Node بحركاتٍ مُصطنَعة.
 */
import {
  isSystemLocation,
  isVehicleLocation,
  isCustomerLocation,
  locationLabel,
} from '../ledger/locations.js';

const num = (v) => Number(v) || 0;

/** هل هذا الرمز كودُ مستودعٍ حقيقيّ (لا موقعَ نظامٍ ولا مركبةً ولا عميلًا ولا الخارج)؟ */
export function isWarehouseCode(code) {
  const c = String(code ?? '').trim();
  if (!c) return false; // الخارج (EXTERNAL = null/'') ليس مستودعًا
  return !isSystemLocation(c) && !isVehicleLocation(c) && !isCustomerLocation(c);
}

/** يومُ الحركة للعرض والترشيح: يومُ الواقعة، فيومُ الترحيل. */
export function moveDay(m) {
  return String(m?.eventDay || m?.postedDay || m?.postedAtDay || '').slice(0, 10);
}

/** داخل المدى [from,to]؟ المجهولُ اليوم يسقط من ترشيحٍ بتاريخٍ لا يُبتلع صامتًا. */
function inRange(day, from, to) {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** صفٌّ فارغٌ لمستودعٍ ما. */
function emptyRow(code, name) {
  return {
    code,
    name: name || code,
    inQty: 0,
    outQty: 0,
    inValue: 0,
    outValue: 0,
    moveCount: 0,
    reasons: new Map(), // سببٌ → { inQty, outQty }
  };
}

function bumpReason(row, reasonLabel, dir, qty) {
  const key = reasonLabel || '—';
  const r = row.reasons.get(key) || { inQty: 0, outQty: 0 };
  if (dir === 'in') r.inQty += qty;
  else r.outQty += qty;
  row.reasons.set(key, r);
}

/**
 * تقرير الحركة وفق المستودع.
 *
 * @param {Array} moves حركات الدفتر (`stock_moves`)
 * @param {object} [opts]
 * @param {string} [opts.from] يومُ البداية YYYY-MM-DD (ضمنًا)
 * @param {string} [opts.to] يومُ النهاية YYYY-MM-DD (ضمنًا)
 * @param {string} [opts.warehouse] كودُ مستودعٍ بعينه (فارغ = الكلّ)
 * @param {Record<string,string>} [opts.names] كود المستودع → اسمه للعرض
 * @returns {{warehouses:Array, totals:object, details:Array, moveCount:number, undated:number}}
 */
export function warehouseMovementReport(moves, { from = '', to = '', warehouse = '', names = {} } = {}) {
  const only = String(warehouse ?? '').trim().toUpperCase();
  const rows = new Map(); // code → row
  const details = [];
  // حركةٌ بلا تاريخٍ تمسّ مستودعًا في النطاق: تُعَدّ دائمًا — مستبعَدةً إن أسقطها
  // ترشيحُ المدّة، مضمَّنةً إن دخلت — فلا تُبتلع صامتةً ولا يُكذَب على المستخدم.
  let undatedExcluded = 0;
  let undatedIncluded = 0;

  const rowFor = (code) => {
    if (!rows.has(code)) rows.set(code, emptyRow(code, names[code]));
    return rows.get(code);
  };

  for (const m of moves || []) {
    const day = moveDay(m);
    const qty = Math.abs(num(m?.qty));
    const value = Math.abs(num(m?.value));
    const fromCode = isWarehouseCode(m?.from) ? String(m.from).trim().toUpperCase() : '';
    const toCode = isWarehouseCode(m?.to) ? String(m.to).trim().toUpperCase() : '';
    const toInScope = Boolean(toCode) && (!only || toCode === only);
    const fromInScope = Boolean(fromCode) && (!only || fromCode === only);
    const kept = inRange(day, from, to);

    // تُحسب المجهولةُ اليومَ قبل بوّابة الإدراج — فتُعَدّ ولو أسقطها الترشيح.
    if (!day && (toInScope || fromInScope)) {
      if (kept) undatedIncluded += 1;
      else undatedExcluded += 1;
    }
    if (!kept) continue;

    // واردٌ إلى وجهةٍ مستودعيّة.
    if (toInScope) {
      const row = rowFor(toCode);
      row.inQty += qty;
      row.inValue += value;
      row.moveCount += 1;
      bumpReason(row, m?.reasonLabel, 'in', qty);
      details.push(detailRow(m, toCode, row.name, 'in', day, qty, value, m?.from));
    }
    // منصرفٌ من مصدرٍ مستودعيّ.
    if (fromInScope) {
      const row = rowFor(fromCode);
      row.outQty += qty;
      row.outValue += value;
      row.moveCount += 1;
      bumpReason(row, m?.reasonLabel, 'out', qty);
      details.push(detailRow(m, fromCode, row.name, 'out', day, qty, value, m?.to));
    }
  }

  const warehouses = [...rows.values()]
    .map((r) => ({
      code: r.code,
      name: r.name,
      inQty: round(r.inQty),
      outQty: round(r.outQty),
      net: round(r.inQty - r.outQty),
      inValue: round(r.inValue),
      outValue: round(r.outValue),
      moveCount: r.moveCount,
      reasons: [...r.reasons.entries()]
        .map(([label, v]) => ({ label, inQty: round(v.inQty), outQty: round(v.outQty) }))
        .sort((a, b) => b.inQty + b.outQty - (a.inQty + a.outQty)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'ar'));

  const totals = warehouses.reduce(
    (t, r) => ({
      inQty: round(t.inQty + r.inQty),
      outQty: round(t.outQty + r.outQty),
      net: round(t.net + r.net),
      inValue: round(t.inValue + r.inValue),
      outValue: round(t.outValue + r.outValue),
      moveCount: t.moveCount + r.moveCount,
    }),
    { inQty: 0, outQty: 0, net: 0, inValue: 0, outValue: 0, moveCount: 0 },
  );

  details.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)); // الأحدث أولًا

  return {
    warehouses,
    totals,
    details,
    moveCount: details.length,
    undated: undatedIncluded + undatedExcluded,
    undatedIncluded,
    undatedExcluded,
  };
}

function detailRow(m, code, name, dir, day, qty, value, otherSide) {
  return {
    day,
    warehouse: code,
    warehouseName: name,
    direction: dir,
    dirLabel: dir === 'in' ? 'وارد' : 'منصرف',
    docType: String(m?.docType || '').trim(),
    docNumber: String(m?.docNumber || '').trim(),
    sku: String(m?.sku || '').trim(),
    nameAr: String(m?.nameAr || '').trim(),
    qty: round(qty),
    value: round(value),
    reason: String(m?.reasonLabel || '').trim(),
    counterparty: locationLabel(otherSide),
    batch: String(m?.batch || '').trim(),
    expiry: String(m?.expiry || '').trim(),
  };
}

function round(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/**
 * أوراقُ إكسل جاهزةٌ لـ`exportAoaSheets`: ملخّصٌ وفق المستودع، وتفصيلُ الحركات.
 * @param {ReturnType<typeof warehouseMovementReport>} report
 * @returns {Array<{name:string, aoa:Array<Array>}>}
 */
export function warehouseMovementSheets(report) {
  const r = report || { warehouses: [], details: [], totals: {} };

  const summaryAoa = [
    ['المستودع', 'الكود', 'عدد الحركات', 'الوارد', 'المنصرف', 'الصافي', 'قيمة الوارد', 'قيمة المنصرف'],
    ...r.warehouses.map((w) => [w.name, w.code, w.moveCount, w.inQty, w.outQty, w.net, w.inValue, w.outValue]),
  ];
  const t = r.totals || {};
  summaryAoa.push(['الإجماليّ', '', t.moveCount || 0, t.inQty || 0, t.outQty || 0, t.net || 0, t.inValue || 0, t.outValue || 0]);

  const detailsAoa = [
    ['التاريخ', 'المستودع', 'الاتجاه', 'النوع', 'رقم المستند', 'الصنف', 'الوصف', 'الكمّيّة', 'القيمة', 'السبب', 'الطرف المقابل', 'الدفعة', 'الصلاحية'],
    ...r.details.map((d) => [
      d.day, d.warehouseName, d.dirLabel, d.docType, d.docNumber,
      d.sku, d.nameAr, d.qty, d.value, d.reason, d.counterparty, d.batch, d.expiry,
    ]),
  ];

  return [
    { name: 'الملخّص وفق المستودع', aoa: summaryAoa },
    { name: 'تفصيل الحركات', aoa: detailsAoa },
  ];
}
