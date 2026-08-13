/**
 * تدفّق المسح على الهاتف — امسح فتُعبَّأ (SAP-19 · طلب المالك 2026-08-13).
 *
 * ═══ الشكوى الحرفيّة ═══
 * «المنطق متشعّب، صعبة الاستخدام من الهاتف، لا يُفهم ماذا يؤدّي إلى أين.
 * المفروض: أختار وضعًا مثل استلام، أقرأ باركودًا، تظهر خانة تعبئة فيها
 * الاسم إن كان في الذاكرة أو أسمّيه، والكمّيّة».
 *
 * ═══ فالتدفّق ثلاث خطوات لا أكثر ═══
 *   الوضع ⇒ المسح ⇒ خانة التعبئة (اسمٌ من الماستر أو تسمية) ⇒ حفظ.
 * كلّ قرارات هذا التدفّق هنا — منطقٌ خالص بلا Firestore وبلا DOM، فيُختبر
 * وحده (§22 ‹995›) وتبقى الشاشة عرضًا له.
 *
 * ═══ ومسار البيانات لا يُمسّ ═══
 * الحفظ قيدُ `appendScan` الملحق-فقط نفسه في `stock_operations` القائمة،
 * والباركود المجهول يدخل `Items_Pending` القائمة بعد تسميته — لا مجموعة
 * جديدة ولا ازدواج مسار.
 */
import { normalizeBarcode } from '../excel/excelSchema.js';
import { baseUomOf, checkFraction, uomLabel } from '../items/uomModel.js';

/**
 * الأوضاع الثلاثة — نفس قيم `opType` التي يكتبها المسار القديم حرفيًّا،
 * فتقارير العمليات القائمة تقرأ الجديد والقديم بلا تفريق.
 */
export const SCAN_MODES = Object.freeze([
  { id: 'جرد', label: 'جرد', icon: 'clipboardList', hint: 'عدُّ ما على الرفّ' },
  { id: 'استلام', label: 'استلام', icon: 'arrowDownTray', hint: 'بضاعة داخلة' },
  { id: 'صرف', label: 'صرف', icon: 'arrowUpTray', hint: 'بضاعة خارجة' },
]);

/** هل هذا وضعٌ معروف؟ */
export function isScanMode(mode) {
  return SCAN_MODES.some((m) => m.id === mode);
}

/**
 * خانة التعبئة بعد المسح: ما يظهر للموظّف وما يُطلب منه.
 *
 * المعروف في الماستر: الاسم والوحدة يظهران ويُطلب الكمّيّة وحدها.
 * والمجهول: يُطلب الاسم («سمِّه») والكمّيّة — ولا يوقف العمل (قرار المالك).
 *
 * @param {string} code الباركود الممسوح كما قُرئ
 * @param {object|null} item صنف الماستر إن وُجد
 * @returns {{barcode:string, known:boolean, sku:string, name:string, unit:string, unitLabel:string}}
 */
export function panelForScan(code, item) {
  const barcode = normalizeBarcode(code);
  if (!item) {
    return { barcode, known: false, sku: '', name: '', unit: '', unitLabel: '' };
  }
  const unit = baseUomOf(item) || String(item.unit ?? '').trim();
  return {
    barcode,
    known: true,
    sku: String(item.sku ?? '').trim(),
    name: [item.nameAr, item.shade].filter(Boolean).join(' — '),
    unit,
    unitLabel: uomLabel(unit),
  };
}

/**
 * حكم الحفظ: يفحص ويبني قيد المسح — أو يقول ما ينقص بالاسم.
 *
 * @param {{mode:string, barcode:string, qty:*, name?:string, item?:object|null}} input
 * @returns {{ok:boolean, problems:string[], entry:object|null}}
 */
export function scanEntryVerdict({ mode, barcode, qty, name = '', item = null }) {
  const problems = [];
  if (!isScanMode(mode)) problems.push('اختر الوضع أوّلًا: جرد أو استلام أو صرف.');

  const code = normalizeBarcode(barcode);
  if (!code) problems.push('لا باركود — امسح أو اكتبه.');

  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    problems.push('الكمّيّة مطلوبة — رقمٌ أكبر من صفر.');
  } else if (item) {
    // حارس الكسر بوحدة أساس الصنف: نصف قطعةٍ رقمٌ لا يقابله شيء على الرفّ.
    const unit = baseUomOf(item) || String(item.unit ?? '').trim();
    const fraction = checkFraction(n, unit);
    if (!fraction.ok) problems.push(fraction.problem);
  }

  const finalName = item
    ? [item.nameAr, item.shade].filter(Boolean).join(' — ')
    : String(name ?? '').trim();
  if (!item && !finalName) {
    problems.push('الصنف غير معرّف في الماستر — سمِّه ليُحفظ ويدخل قائمة الاعتماد.');
  }

  if (problems.length) return { ok: false, problems, entry: null };
  return {
    ok: true,
    problems: [],
    entry: { barcode: code, name: finalName, qty: n, opType: mode },
  };
}

/**
 * ملخّص جلسة المسح من قيودها — أرقامٌ يفهمها الواقف في المخزن:
 * كم قيدًا، وكم صنفًا مختلفًا، وكم إجمالي الكمّيّة، وكم مجهولًا سمّاه.
 */
export function sessionSummary(scans, knownBarcodes = new Set()) {
  const codes = new Set();
  let totalQty = 0;
  let unknown = 0;
  for (const s of scans || []) {
    const code = normalizeBarcode(s?.barcode);
    if (code) {
      if (!codes.has(code) && knownBarcodes.size && !knownBarcodes.has(code)) unknown += 1;
      codes.add(code);
    }
    totalQty += Number(s?.qty) || 0;
  }
  return {
    scanCount: (scans || []).length,
    itemCount: codes.size,
    totalQty: Math.round(totalQty * 1e6) / 1e6,
    unknownCount: unknown,
  };
}
