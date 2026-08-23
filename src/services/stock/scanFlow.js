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
 *
 * ═══ القاعدة الحاكمة (CAP-101 · تحليل المالك 2026-08-23) ═══
 * **الالتقاط لا يُحاسِب.** هذه الوحدة تسجّل ما رآه الإنسان على الرفّ فقط:
 * لا تقرأ رصيدًا، ولا تحسب فرقًا، ولا تُسوّي شيئًا.
 *
 * وليست هذه أناقةً معماريّة بل تصحيحُ عطبٍ مرصود: صنفٌ رصيده ٤٧٥ كان يظهر
 * صفرًا — والعلّة أنّ الشاشة **ادّعت معرفة** شيءٍ ليس من اختصاصها. وأخطر
 * منه أنّ الرقم الدفتريّ أمام العادّ **يوجّه عدّه**: يرى ٤٧٥ فيميل لكتابتها
 * بدل أن يعدّ، فيُلغى معنى الجرد من أصله.
 *
 * فالرصيد والفرق والتسوية كلّها لطبقة المطابقة: كشفٌ مختوم + لقطةُ رصيدٍ
 * بلحظة القطع ⟵ `locations/reconcile.js` ⟵ محضر `CC` ⟵ تسوية `ADJ`.
 * وهي مبنيّةٌ ومختبَرة، ومؤجَّلةٌ بقرار المالك (ق-٦) حتّى تجهز الأرصدة.
 *
 * الوثيقة الحاكمة: `docs/خطة-طبقة-الالتقاط.md`.
 */
import { normalizeBarcode } from '../excel/excelSchema.js';
import {
  baseUomOf,
  checkFraction,
  uomLabel,
  factorToBase,
  availableUoms,
  hasUomDefinition,
  normalizeUom,
} from '../items/uomModel.js';
import { unitForBarcode } from '../items/uomWiring.js';

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

/** تقريب ٦ منازل — نفس قاعدة محرّك الوحدات، يمنع تراكم أخطاء العشريّة. */
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/**
 * حلّ وحدة القيد من الباركود الممسوح — **مصدرٌ واحد** لخانة التعبئة ولحكم
 * الحفظ معًا، فلا تفترق الوحدة المعروضة عن الوحدة المختومة (CAP-102/103).
 *
 * @returns {{unit:string, baseUom:string, factor:number|null, fromBarcode:boolean}}
 *   و`factor === null` تعني **لا أعرف** لا «صفر» — فلا يُحسب رقمٌ من جهل.
 */
export function resolveScanUom(code, item) {
  if (!item) return { unit: '', baseUom: '', factor: null, fromBarcode: false };
  const baseUom = baseUomOf(item) || String(item.unit ?? '').trim();
  const scanned = unitForBarcode(item, code); // باركود الوحدة أخصُّ فيفوز
  const unit = scanned || baseUom;
  return { unit, baseUom, factor: factorToBase(item, unit), fromBarcode: Boolean(scanned) };
}

/**
 * تسمية الوحدة في خانة التعبئة — تقول المعامل حين يكون له معنًى.
 *
 * «كرتون (12 قطعة)» بدل «كرتون» المجرّدة: العادّ يحتاج أن يعرف **ما الذي
 * يعدّه** قبل أن يكتب رقمًا. و«معاملٌ غير معرّف» تُقال صراحةً ولا تُخفى —
 * لأنّ الصمت هنا يوحي بتحويلٍ معروفٍ وهو مجهول (`factorToBase` تُرجع `null`
 * بمعنى «لا أعرف» لا «صفر»).
 */
function unitPanelLabel(item, unit, base) {
  const label = uomLabel(unit);
  if (!unit || unit === base) return label;
  const factor = factorToBase(item, unit);
  if (factor === null) return `${label} (معاملٌ غير معرّف)`;
  if (factor === 1) return label;
  return `${label} (${factor} ${uomLabel(base)})`;
}

/**
 * وحدات هذا الصنف المتاحة للعدّ — قائمةٌ يُنقر منها، لا خانةُ نصّ (CAP-104).
 *
 * ═══ ولماذا لا يُعاد استعمال `uomOptionsForLine` كما هي ═══
 * تلك لسطر مستند، وتُرجع **سيّد الوحدات كلّه** حين لا يعرّف الصنف وحداته —
 * وهو سلوكٌ صحيحٌ هناك (محرّرٌ يكتب مستندًا) وخطأٌ هنا: عرضُ ثلاث عشرة وحدةً
 * على واقفٍ أمام رفٍّ دعوةٌ لاختيار الخطأ. فالقاعدة هنا أضيق:
 *   · صنفٌ عرّف وحداته ⇒ وحداته وحدها (`availableUoms` — النواة نفسها).
 *   · صنفٌ لم يُعرَّف   ⇒ وحدة أساسه وحدها، فلا خيار أصلًا ولا فرصةَ لخطأ.
 *
 * @returns {Array<{value:string,label:string}>} فارغةٌ للمجهول ولمن لا وحدة له
 */
export function scanUomChoices(item) {
  if (!item) return [];
  const base = baseUomOf(item) || String(item.unit ?? '').trim();
  const ids = hasUomDefinition(item) ? availableUoms(item) : [];
  const list = ids.length ? ids : base ? [base] : [];
  return list.map((id) => ({ value: id, label: unitPanelLabel(item, id, base) }));
}

/**
 * معاينة الكمّيّة الأساس **قبل** الحفظ (CAP-104).
 *
 * تبديل الوحدة يجب أن يُرى أثرُه فورًا: من يكتب ٢ ويختار «كرتون» يقرأ
 * «= 24 قطعة» قبل أن يضغط حفظ — فيُكشف الخطأ وهو لا يزال قابلًا للتصحيح.
 * وتُرجع نصًّا فارغًا حين لا معنى للمعاينة (الوحدة هي الأساس، أو لا كمّيّة).
 */
export function baseQtyPreview(item, qty, uom) {
  const n = Number(qty);
  if (!item || !Number.isFinite(n) || n <= 0) return '';
  const base = baseUomOf(item) || String(item.unit ?? '').trim();
  const u = normalizeUom(uom) || String(uom ?? '').trim();
  if (!base || !u || u === base) return '';
  const factor = factorToBase(item, u);
  if (factor === null) return 'المعامل غير معرّف — لن تُحسب الكمّيّة الأساس';
  return `= ${round6(n * factor)} ${uomLabel(base)}`;
}

/**
 * خانة التعبئة بعد المسح: ما يظهر للموظّف وما يُطلب منه.
 *
 * المعروف في الماستر: الاسم والوحدة يظهران ويُطلب الكمّيّة وحدها.
 * والمجهول: يُطلب الاسم («سمِّه») والكمّيّة — ولا يوقف العمل (قرار المالك).
 *
 * ═══ الوحدة تُحلّ من الباركود لا تُكتب (CAP-102) ═══
 * `unitForBarcode` مبنيٌّ ومختبَرٌ في `uomWiring.js` منذ SAP-3 ولم يستدعه
 * هذا التدفّق قطّ — فكان مسحُ باركود الكرتون يُظهر «قطعة»، والموظّف يكتب ١
 * قاصدًا كرتونًا. هنا يُستدعى: **باركود الوحدة يحدّد الوحدة والمعامل معًا**،
 * وما ليس باركود وحدةٍ يرجع إلى وحدة أساس الصنف — ترحيلٌ صفرُ الأثر.
 *
 * @param {string} code الباركود الممسوح كما قُرئ
 * @param {object|null} item صنف الماستر إن وُجد
 * @returns {{barcode:string, known:boolean, sku:string, name:string,
 *            unit:string, baseUom:string, factor:number|null,
 *            fromBarcode:boolean, unitLabel:string}}
 */
export function panelForScan(code, item) {
  const barcode = normalizeBarcode(code);
  if (!item) {
    return {
      barcode, known: false, sku: '', name: '',
      unit: '', baseUom: '', factor: null, fromBarcode: false, unitLabel: '',
    };
  }
  const { unit, baseUom, factor, fromBarcode } = resolveScanUom(code, item);
  return {
    barcode,
    known: true,
    sku: String(item.sku ?? '').trim(),
    name: [item.nameAr, item.shade].filter(Boolean).join(' — '),
    unit,
    baseUom,
    factor,
    fromBarcode,
    unitLabel: unitPanelLabel(item, unit, baseUom),
  };
}

/**
 * حكم الحفظ: يفحص ويبني قيد المسح — أو يقول ما ينقص بالاسم.
 *
 * ═══ القيد يُختم بوحدته ومعاملها (CAP-103) ═══
 * «الكمّيّة بلا وحدةٍ رقمٌ بلا معنى» — نصّ المالك. فكرتونٌ فيه ١٢ قطعة
 * يُكتب «١» يعني ١٢ لا ١، وفارقُ ذلك ١١٠٠٪.
 *
 * ولذلك يحمل القيد **ستّة حقول لا اثنين**: الباركود كما مُسح، والصنف الذي
 * حُلّ إليه (فالباركود ليس مفتاحًا)، والكمّيّة بوحدتها، والوحدة، والمعامل،
 * والكمّيّة الأساس. و`baseQty` **تُحسب وقت الالتقاط لا وقت العرض**: المعامل
 * قد يُصحَّح غدًا، وتصحيحُه لا يجوز أن يُعيد كتابة ما عُدّ أمس.
 *
 * والمعامل المجهول يُختم `null` و`baseQty` معه `null` — لا صفرًا ولا رقمًا
 * مخترعًا. والقيد يُحفظ على كلّ حال، فلا يُوقَف العادّ على الرفّ (ق-٢).
 *
 * ═══ والوحدة المبدَّلة تُفحص لا تُصدَّق (CAP-104) ═══
 * `uom` وسيطٌ اختياريّ: ما اختاره العادّ من قائمة وحدات الصنف. ويُفحص هنا
 * لا في الواجهة — وحدةٌ خارج تعريف الصنف تُرفض **بالاسم** ولا تُقبل صامتة،
 * لأنّ القبول الصامت يُنتج معاملًا مخترعًا أو مفقودًا.
 *
 * @param {{mode:string, barcode:string, qty:*, name?:string, item?:object|null, uom?:string}} input
 * @returns {{ok:boolean, problems:string[], entry:object|null}}
 */
export function scanEntryVerdict({ mode, barcode, qty, name = '', item = null, uom = '' }) {
  const problems = [];
  if (!isScanMode(mode)) problems.push('اختر الوضع أوّلًا: جرد أو استلام أو صرف.');

  const code = normalizeBarcode(barcode);
  if (!code) problems.push('لا باركود — امسح أو اكتبه.');

  const resolved = resolveScanUom(barcode, item);
  let unit = resolved.unit;
  const chosen = normalizeUom(uom) || String(uom ?? '').trim();
  if (chosen && item) {
    const allowed = scanUomChoices(item).map((o) => o.value);
    if (!allowed.includes(chosen)) {
      problems.push(`الوحدة «${uomLabel(chosen)}» ليست من وحدات هذا الصنف — اخترها من القائمة.`);
    } else {
      unit = chosen;
    }
  }
  const factor = unit === resolved.unit ? resolved.factor : factorToBase(item, unit);
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    problems.push('الكمّيّة مطلوبة — رقمٌ أكبر من صفر.');
  } else if (item) {
    // حارس الكسر **بوحدة القيد** لا بوحدة الأساس المفترضة (CAP-103): من
    // يمسح باركود كرتونٍ يُحاسَب بقاعدة الكرتون، والرسالة تسمّي ما كتبه هو.
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
    entry: {
      barcode: code,
      sku: item ? String(item.sku ?? '').trim() : '',
      name: finalName,
      qty: n,
      uom: unit,
      factor,
      baseQty: factor === null ? null : round6(n * factor),
      opType: mode,
    },
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
    totalQty += scanBaseQty(s); // بوحدة الأساس — جمعُ الوحدات المختلفة لا يصحّ
  }
  return {
    scanCount: (scans || []).length,
    itemCount: codes.size,
    totalQty: Math.round(totalQty * 1e6) / 1e6,
    unknownCount: unknown,
  };
}

/*
 * ملاحظة ترحيل (CAP-101): كانت هنا `aggregateSession` — نسخةٌ أقدم من
 * `buildSessionRows` تجمّع على الباركود لا على هويّة الصنف، وتحمل `bookQty`
 * و`diff`. لم يستدعها أحدٌ خارج اختبارها منذ أن حلّت محلَّها، وكان بقاؤها
 * يُبقي بابَ الرصيد مفتوحًا في النواة. فحُذفت — نواةٌ واحدة تكبر، لا نواتان
 * تتباعدان. وتاريخها في git.
 */

/**
 * تصحيح كمّيّة صفٍّ في دفترٍ ملحق-فقط: **قيدُ فرقٍ لا تعديل** — نفس مبدأ
 * دفتر الحركات. الكمّيّة الجديدة ٧ والمعدود ١٠ ⇒ قيدٌ بـ−٣، والحذف قيدٌ
 * يعكس المعدود كلّه. فالتاريخ كامل: من عدّ، ومن صحّح، وبكم.
 *
 * @returns {{ok:boolean, problems:string[], entry:object|null}}
 */
export function correctionEntry(row, newQty, mode) {
  const problems = [];
  if (!isScanMode(mode)) problems.push('اختر الوضع أوّلًا.');
  const code = normalizeBarcode(row?.barcode);
  if (!code) problems.push('صفٌّ بلا باركود.');
  const target = Number(newQty);
  if (!Number.isFinite(target) || target < 0) problems.push('الكمّيّة الجديدة رقمٌ صفرٌ فأكبر.');
  // صفٌّ فيه قيدٌ بوحدةٍ لم يُعرَف معاملها: مجموعه بوحدة الأساس **غير معلوم**،
  // فتصحيحه بفرقٍ محسوبٍ منه يكتب رقمًا مخترعًا. يُعرَّف المعامل أوّلًا.
  if (row?.uncertain) {
    problems.push('صفٌّ فيه وحدةٌ بلا معامل — عرِّف المعامل قبل التصحيح، فمجموعه بوحدة الأساس غير معلوم.');
  }
  if (problems.length) return { ok: false, problems, entry: null };

  const delta = round6(target - (Number(row?.countedQty) || 0));
  if (delta === 0) return { ok: false, problems: ['لا تغيير — الكمّيّة هي نفسها.'], entry: null };
  // التصحيح يُقال **بوحدة الأساس**: الصفّ مجموعُه بها، فالفرق منه بها.
  return {
    ok: true,
    problems: [],
    entry: {
      barcode: code,
      sku: String(row?.sku ?? '').trim(),
      name: String(row?.name ?? '').trim(),
      qty: delta,
      uom: String(row?.baseUom ?? '').trim(),
      factor: 1,
      baseQty: delta,
      opType: mode,
    },
  };
}

/**
 * صفوف التصدير — أعمدةٌ عربيّة ثابتة تفتح في إكسل كما هي.
 *
 * **ما التُقط فقط** (CAP-101): لا عمود رصيدٍ ولا عمود فرق. والإكسل هنا
 * **مخرَجٌ لا مصدر حقيقة** — ومصدرها الكشف المختوم حين يُبنى (CAP-404).
 *
 * والصفّ الذي لم يُمسح يُصدَّر «—» لا صفرًا: صفرٌ في خانة العدّ يقول «عددتُ
 * ولم أجد»، وهو غير «لم أصل إليه بعد». خلطهما هو ف‑٩ بعينها.
 */
export function exportRows(rows) {
  return (rows || []).map((r) => ({
    'الباركود': r.barcode,
    'كود الصنف': r.sku || '—',
    'اسم الصنف': r.name || '—',
    'المعدود/المنفَّذ': r.scanned === false ? '—' : r.countedQty,
    // الوحدة عمودٌ لا زينة: رقمٌ بلا وحدةٍ لا يُقرأ (CAP-103).
    'الوحدة': r.baseUom ? uomLabel(r.baseUom) : '—',
    'عدد القيود': r.scanCount ?? 0,
    'الحالة': r.known ? (r.scanned === false ? 'لم يُمسح' : 'معروف') : 'غير معرّف — بانتظار الاعتماد',
    'ملاحظة': r.uncertain ? 'فيه وحدةٌ بلا معامل — المجموع غير مضمون' : '',
  }));
}

/**
 * صفوف الجلسة مع **قاعدة الجرد من الماستر** (تكامل الأداة القديمة —
 * `loadFromMaster`): في وضع الجرد يظهر كلّ أصناف الماستر، الممسوح منها
 * وغير الممسوح — فجوهر الجرد معرفةُ **ما لم يُعدّ بعد**، لا ما عُدّ وحده.
 *
 * المفتاح: الصنف المعروف يُجمع على هويّته (الكود) مهما تعدّدت باركوداته،
 * والمجهول على باركوده.
 *
 * ═══ ولا رصيد هنا (CAP-101) ═══
 * الماستر يأتي لـ**اسمٍ وهويّةٍ وقاعدةِ عملٍ** لا لرصيد: `item.balance` لا
 * يُقرأ إطلاقًا، والصفّ لا يحمل `bookQty` ولا `diff`. و«لم يُمسح» يبقى —
 * لأنّه **عملٌ متبقٍّ** لا فرق، وهو جوهر الجرد: معرفةُ ما لم يُعدّ بعد.
 *
 * @param {Array} scans قيود العملية
 * @param {Array} items أصناف الماستر (لقاعدة الجرد وأسماء الممسوح)
 * @param {Map<string,object>} byBarcode فهرس باركود ⇐ صنف
 * @param {{withBaseline?:boolean}} [opts] الجرد يعرض القاعدة كلّها؛ الاستلام/الصرف لا
 * @returns {Array<{barcode,sku,name,known,countedQty,scanned,scanCount}>}
 */
export function buildSessionRows(scans, items, byBarcode, { withBaseline = false } = {}) {
  const rows = new Map();
  const keyOf = (item, code) => (item ? `SKU:${String(item.sku).toUpperCase()}` : `BC:${code}`);

  const rowForItem = (item) => ({
    barcode: normalizeBarcode(item.barcodes?.[0]) || String(item.sku).toUpperCase(),
    sku: String(item.sku ?? '').trim(),
    name: [item.nameAr, item.shade].filter(Boolean).join(' — '),
    known: true,
    baseUom: baseUomOf(item) || String(item.unit ?? '').trim(),
    countedQty: 0,
    scanned: false,
    scanCount: 0,
    uncertain: false,
  });

  if (withBaseline) {
    for (const item of items || []) {
      if (!item?.sku || item.archived) continue;
      rows.set(keyOf(item), rowForItem(item));
    }
  }

  for (const s of scans || []) {
    const code = normalizeBarcode(s?.barcode);
    if (!code) continue;
    const item = byBarcode.get(code) || null;
    const key = keyOf(item, code);
    let row = rows.get(key);
    if (!row) {
      row = item
        ? rowForItem(item)
        : { barcode: code, sku: '', name: String(s?.name ?? '').trim(), known: false, baseUom: '', countedQty: 0, scanned: false, scanCount: 0, uncertain: false };
      rows.set(key, row);
    }
    if (!row.name && s?.name) row.name = String(s.name).trim();
    row.countedQty = round6(row.countedQty + scanBaseQty(s));
    if (isUncertainScan(s)) row.uncertain = true;
    row.scanCount += 1;
    row.scanned = true;
  }

  return [...rows.values()];
}

/**
 * كمّيّة القيد **بوحدة الأساس** — وهي وحدها ما يجوز جمعه.
 *
 * جمعُ «١ كرتون» و«٣ قطع» على أنّهما ٤ رقمٌ لا معنى له. فالمجموع يُبنى من
 * `baseQty` المختومة وقت الالتقاط (CAP-103).
 *
 * والقيد القديم بلا `baseQty` يُقرأ كما هو — كان معامله ١ ضمنًا، وهذا سلوك
 * اليوم حرفيًّا فالترحيل صفرُ الأثر. وكذلك القيد الذي جُهل معامله: يُقرأ خامًّا
 * ويُوسم صفُّه `uncertain`، فلا يُخفى ولا يُخترع له تحويل.
 */
export function scanBaseQty(scan) {
  // `== null` عمدًا: `Number(null)` صفرٌ محدود، فلو فُحص بـ`isFinite` وحده
  // لابتلع المعاملَ المجهولَ صفرًا صامتًا — وهو أخطر من غيابه.
  if (scan?.baseQty == null) return Number(scan?.qty) || 0;
  const base = Number(scan.baseQty);
  return Number.isFinite(base) ? base : Number(scan?.qty) || 0;
}

/** قيدٌ أعلن وحدةً وعجز عن تحويلها — مجموعه بوحدة الأساس غير مضمون. */
function isUncertainScan(scan) {
  return Boolean(scan?.uom) && scan?.baseQty == null;
}

/**
 * عدّادات الإنجاز: إجماليّ ومسحٌ ومتبقٍّ ومجهولٌ ونسبة.
 *
 * **ولا عدّاد فروقات** (CAP-101): الفرق حكمُ طبقة المطابقة. والمتبقّي هنا
 * يقيس **العمل** لا الانحراف.
 */
export function sessionProgress(rows) {
  const list = rows || [];
  const baseline = list.filter((r) => r.known);
  const scanned = baseline.filter((r) => r.scanned);
  const unknown = list.filter((r) => !r.known);
  return {
    total: baseline.length,
    scanned: scanned.length,
    remaining: baseline.length - scanned.length,
    unknown: unknown.length,
    pct: baseline.length ? Math.round((scanned.length / baseline.length) * 100) : 0,
  };
}

/** ترشيح الجدول: تبويبٌ (all/scanned/unscanned/unknown) + بحثٌ حرّ. */
export function filterRows(rows, { tab = 'all', term = '' } = {}) {
  let list = rows || [];
  if (tab === 'scanned') list = list.filter((r) => r.scanned);
  else if (tab === 'unscanned') list = list.filter((r) => r.known && !r.scanned);
  else if (tab === 'unknown') list = list.filter((r) => !r.known);
  const needle = String(term ?? '').trim().toLowerCase();
  if (needle) {
    list = list.filter((r) =>
      [r.barcode, r.sku, r.name].filter(Boolean).some((f) => String(f).toLowerCase().includes(needle))
    );
  }
  return list;
}

/**
 * لصق باركودات دفعةً (تكامل «لصق باركودات» القديمة): كلّ سطرٍ أو فاصلةٍ
 * باركودٌ بقيد كمّيّته ١ — والتكرار يتراكم كما في المسح المتتابع.
 */
export function parseBulkBarcodes(text) {
  const codes = String(text ?? '')
    .split(/[\s,،;|]+/)
    .map((c) => normalizeBarcode(c))
    .filter(Boolean);
  return { codes, count: codes.length };
}
