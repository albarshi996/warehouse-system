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

const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

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
  if (problems.length) return { ok: false, problems, entry: null };

  const delta = round6(target - (Number(row?.countedQty) || 0));
  if (delta === 0) return { ok: false, problems: ['لا تغيير — الكمّيّة هي نفسها.'], entry: null };
  return {
    ok: true,
    problems: [],
    entry: { barcode: code, name: String(row?.name ?? '').trim(), qty: delta, opType: mode },
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
    'عدد القيود': r.scanCount ?? 0,
    'الحالة': r.known ? (r.scanned === false ? 'لم يُمسح' : 'معروف') : 'غير معرّف — بانتظار الاعتماد',
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
    countedQty: 0,
    scanned: false,
    scanCount: 0,
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
        : { barcode: code, sku: '', name: String(s?.name ?? '').trim(), known: false, countedQty: 0, scanned: false, scanCount: 0 };
      rows.set(key, row);
    }
    if (!row.name && s?.name) row.name = String(s.name).trim();
    row.countedQty = round6(row.countedQty + (Number(s?.qty) || 0));
    row.scanCount += 1;
    row.scanned = true;
  }

  return [...rows.values()];
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
