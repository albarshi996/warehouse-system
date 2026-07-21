/**
 * Excel <-> app schema definitions.
 *
 * Defines the canonical datasets (Items_Master, Inbound_Log, Outbound_Log) and,
 * for each, the columns, their types, whether they are required, and the set of
 * accepted header labels (Arabic + English aliases) so imported spreadsheets
 * don't have to match one exact header spelling.
 *
 * The canonical field names deliberately match the shapes used by
 * itemService.js / logService.js and src/services/odoo/odooMapper.js, so an
 * imported row can flow straight into Firestore OR Odoo unchanged.
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string}   field     canonical field name
 * @property {string}   labelAr   default Arabic header used when EXPORTING
 * @property {'string'|'number'} type
 * @property {boolean}  required
 * @property {string[]} aliases   accepted header labels when IMPORTING (lowercased match)
 * @property {boolean} [nonNegative] number columns that must be >= 0
 */

/** @type {Record<string, { key:string, labelAr:string, columns: ColumnDef[] }>} */
export const DATASETS = {
  /**
   * الأصناف — مصدر الحقيقة الواحد للبوابة كلّها.
   *
   * الأعمدة هنا هي **أعمدة عملك الحقيقية** المأخوذة من قالب التحميل في شاشة
   * الجرد (`stock-operations.astro` — الباركود · كود الصنف · اسم الصنف ·
   * الظل/اللون · التصنيف · التصنيف الفرعي · الكمية الدفترية · الوحدة ·
   * سعر الوحدة · ملاحظات) مدموجةً مع حقول `Items_Master`.
   * قبل 2026-07-15 كان هذا المخطّط **بلا عمود باركود إطلاقًا** — وهو سبب
   * عزلته عن الماسح الذي يعمل بالباركود وحده.
   *
   * أسماء الحقول تطابق `itemService.js` و`odooMapper.js`، فالصفّ المستورد
   * يمضي إلى Firestore أو أودو دون إعادة تشكيل (sku = default_code في أودو).
   */
  items: {
    key: 'items',
    labelAr: 'الأصناف (Items_Master)',
    columns: [
      // ── الهوية ───────────────────────────────────────────────────────
      // «حاوية الكود» (قرار المالك 2026-07-15): العمود موجود ويبقى **فارغًا**
      // اليوم، ويُملأ من أودو يوم الربط. لذلك **ليس إلزاميًّا وليس المعرّف** —
      // المعرّف كود داخلي ثابت، لأن أي قيمة ستُستبدل لاحقًا لا تصلح هوية:
      // لو كانت المعرّف لانكسر كل مستند أشار للصنف يوم وصلت أكواد أودو.
      { field: 'sku', labelAr: 'Item Code (كود الصنف)', type: 'string', required: false, aliases: ['sku', 'الكود', 'كود الصنف', 'رقم الصنف', 'item code', 'itemcode', 'item no', 'code', 'part no', 'default_code'] },
      { field: 'nameAr', labelAr: 'Item Description (اسم الصنف)', type: 'string', required: true, aliases: ['item description', 'itemdescription', 'namear', 'الاسم', 'اسم الصنف', 'الصنف', 'name', 'item name', 'product name', 'description', 'الوصف'] },

      // ── الباركودات: عمودان يُضمّان في barcodes[] ─────────────────────
      // شيتك يحمل عمودين، وقد أكّدت أن الفكرة «أكثر من باركود للصنف».
      // كلٌّ منهما يقبل أيضًا عدّة قيم في الخانة مفصولة بـ , أو / أو |
      { field: 'barcode', labelAr: 'Bar Code', type: 'string', required: false, multi: true, aliases: ['bar code', 'barcode', 'الباركود', 'باركود', 'الباركودات', 'ean', 'ean13', 'upc', 'product id'] },
      { field: 'barcodeAlt', labelAr: 'Bar Code - Code', type: 'string', required: false, multi: true, aliases: ['bar code - code', 'barcode - code', 'bar code code', 'barcode2', 'باركود اضافي', 'باركود إضافي', 'الباركود الثاني'] },

      // ── الأسعار ──────────────────────────────────────────────────────
      // سعران منفصلان: خلط الشراء بالبيع خطأ محاسبي.
      // ملاحظة: شيتك يكتبها «Purchese Price» — نقبل الإملاءين.
      { field: 'costPrice', labelAr: 'Purchase Price (سعر الشراء)', type: 'number', required: false, nonNegative: true, aliases: ['purchase price', 'purchese price', 'purchaseprice', 'سعر الشراء', 'cost', 'التكلفة', 'سعر الوحدة', 'unitprice', 'price'] },
      { field: 'sellPrice', labelAr: 'Sell Price (سعر البيع)', type: 'number', required: false, nonNegative: true, aliases: ['sell price', 'sellprice', 'selling price', 'سعر البيع', 'retail price', 'sale price'] },

      // ── الوحدة ───────────────────────────────────────────────────────
      { field: 'uomGroupCode', labelAr: 'UoM Group Code', type: 'string', required: false, aliases: ['uom group code', 'uomgroupcode', 'كود مجموعة الوحدة'] },
      { field: 'uomGroupName', labelAr: 'UoM Group Name', type: 'string', required: false, aliases: ['uom group name', 'uomgroupname', 'مجموعة الوحدة', 'unit', 'الوحدة', 'وحدة القياس', 'uom'] },

      // ── التسلسل الهرمي الرباعي (كما تعمل به فعلًا) ───────────────────
      { field: 'department', labelAr: 'Department (القسم)', type: 'string', required: false, aliases: ['department', 'القسم', 'dept'] },
      { field: 'section', labelAr: 'Section (الشعبة)', type: 'string', required: false, aliases: ['section', 'الشعبة', 'القطاع'] },
      { field: 'family', labelAr: 'Family (العائلة)', type: 'string', required: false, aliases: ['family', 'العائلة', 'category', 'الفئة', 'التصنيف', 'المجموعة', 'brand', 'براند'] },
      { field: 'subFamily', labelAr: 'Sub-Family (العائلة الفرعية)', type: 'string', required: false, aliases: ['sub-family', 'sub family', 'subfamily', 'العائلة الفرعية', 'subcategory', 'sub category', 'التصنيف الفرعي', 'الفئة الفرعية'] },

      { field: 'supplier', labelAr: 'المورد', type: 'string', required: false, aliases: ['المورد', 'المورّد', 'supplier', 'vendor', 'اسم المورد'] },

      // حدّ إعادة الطلب — خاصّية **تعريف** لا رصيد (لا يتغيّر يوميًّا).
      // بدونه كانت ميزة «تنبيه المخزون المنخفض» المبنيّة في شاشة الأصناف
      // (balance <= minStock) ميتةً: لا سبيل لضبط الحدّ إلا صنفًا صنفًا بيدك.
      { field: 'minStock', labelAr: 'Min Stock (الحد الأدنى)', type: 'number', required: false, nonNegative: true, aliases: ['minstock', 'min stock', 'الحد الأدنى', 'الحد الادنى', 'حد الطلب', 'reorder', 'reorder point'] },
      // حالة الصنف — بدونها لا سبيل لإيقاف صنف من الشيت، والنظام يحمل
      // `archived` أصلًا فيبقى معطَّلًا من جهة إكسيل.
      { field: 'status', labelAr: 'Status (الحالة)', type: 'string', required: false, aliases: ['status', 'الحالة', 'item status', 'حالة الصنف', 'active', 'نشط'] },

      // ── اختيارية: يقبلها المستورد ولا يحملها القالب القياسي ──────────
      // (أعادها حارس الانحراف 2026-07-16 — سقطت سهوًا أثناء اعتماد أعمدة المالك)
      { field: 'nameEn', labelAr: 'الاسم (إنجليزي)', type: 'string', required: false, aliases: ['nameen', 'name en', 'english name', 'الاسم بالانجليزي', 'الاسم الانجليزي'] },
      { field: 'shade', labelAr: 'الظل/اللون', type: 'string', required: false, aliases: ['shade', 'الظل', 'اللون', 'الظل/اللون', 'color', 'colour', 'درجة اللون'] },
      { field: 'balance', labelAr: 'الكمية الدفترية', type: 'number', required: false, nonNegative: true, aliases: ['balance', 'الرصيد', 'الكمية', 'الكمية الدفترية', 'المتوفر', 'qty', 'quantity', 'on hand', 'qty_available'] },
      { field: 'notes', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['notes', 'ملاحظات', 'ملاحظة', 'remarks', 'البيان'] },
    ],
    /** أعمدة القالب القياسي بالترتيب — ما يُصدَّر ويُسلَّم للمورّدين. */
    templateFields: [
      'sku', 'nameAr', 'barcode', 'barcodeAlt', 'costPrice', 'sellPrice',
      'uomGroupCode', 'uomGroupName', 'department', 'section', 'family',
      'subFamily', 'supplier', 'minStock', 'status',
    ],
  },
  /**
   * الأرصدة — الكميات، منفصلةً عن التعريفات (قرار المالك 2026-07-15).
   *
   * لماذا ورقة مستقلّة؟ لأن تعريف الصنف يتغيّر نادرًا ورصيده يتغيّر يوميًّا.
   * دمجهما يعني أن كل تصحيح اسمٍ فرصةٌ لدهس الأرصدة بأرقام قديمة من ملف
   * محفوظ — وهو أشيع سبب لفساد بيانات المخزون. الورقتان في **ملف واحد**،
   * فالمالك يتعامل مع ملف واحد والنظام يعاملهما منفصلين.
   *
   * المفتاح مركّب: (الصنف × المخزن × التشغيلة) — فالصنف الواحد له رصيد في
   * كل مخزن، ولكل تشغيلة صلاحيتها. بدون الصلاحية لا يملك حارس **FEFO**
   * (القاعدة الذهبية الثالثة) ما يحكم به، ولا تنبيه لقرب الانتهاء.
   */
  balances: {
    key: 'balances',
    labelAr: 'الأرصدة (Balances)',
    columns: [
      { field: 'barcode', labelAr: 'Bar Code', type: 'string', required: false, aliases: ['bar code', 'barcode', 'الباركود', 'باركود', 'ean', 'upc'] },
      { field: 'sku', labelAr: 'Item Code (كود الصنف)', type: 'string', required: false, aliases: ['sku', 'item code', 'itemcode', 'كود الصنف', 'الكود', 'code', 'default_code'] },
      { field: 'nameAr', labelAr: 'Item Description (اسم الصنف)', type: 'string', required: false, aliases: ['item description', 'اسم الصنف', 'الصنف', 'name', 'description', 'الوصف'] },
      { field: 'warehouse', labelAr: 'Warehouse (المخزن)', type: 'string', required: true, aliases: ['warehouse', 'المخزن', 'المستودع', 'whs', 'wh', 'الموقع العام', 'store'] },
      { field: 'location', labelAr: 'Location (الموقع/الرف)', type: 'string', required: false, aliases: ['location', 'الموقع', 'الرف', 'الرفّ', 'bin', 'rack', 'shelf', 'بوكس'] },
      { field: 'batch', labelAr: 'Batch / Lot (التشغيلة)', type: 'string', required: false, aliases: ['batch', 'lot', 'التشغيلة', 'رقم التشغيلة', 'lot no', 'batch no', 'التشغيله'] },
      { field: 'expiry', labelAr: 'Expiry (تاريخ الصلاحية)', type: 'string', required: false, aliases: ['expiry', 'expiry date', 'تاريخ الصلاحية', 'الصلاحية', 'exp', 'expiration', 'انتهاء الصلاحية'] },
      { field: 'qty', labelAr: 'Qty (الكمية)', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'quantity', 'الكمية', 'الرصيد', 'الكمية الدفترية', 'on hand', 'العدد', 'stock'] },
      // تكلفة **هذه التشغيلة** — لا سعر الشراء الحالي في ورقة التعريف.
      // الفرق جوهري: التشغيلة اشتُريت بسعر ذلك اليوم، وتقييم المخزون يُبنى
      // على ما دفعتَه فعلًا لا على سعر اليوم. وهذا أساس الإغلاق المالي (S12).
      { field: 'unitCost', labelAr: 'Unit Cost (تكلفة الوحدة)', type: 'number', required: false, nonNegative: true, aliases: ['unit cost', 'unitcost', 'تكلفة الوحدة', 'التكلفة', 'cost', 'سعر التكلفة'] },
      { field: 'countDate', labelAr: 'Count Date (تاريخ الرصيد)', type: 'string', required: false, aliases: ['count date', 'تاريخ الرصيد', 'تاريخ الجرد', 'date', 'التاريخ', 'as of'] },
      { field: 'notes', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['notes', 'ملاحظات', 'ملاحظة', 'remarks'] },
    ],
    templateFields: ['barcode', 'sku', 'nameAr', 'warehouse', 'location', 'batch', 'expiry', 'qty', 'unitCost', 'countDate'],
  },
  inbound: {
    key: 'inbound',
    labelAr: 'الوارد (Inbound_Log)',
    columns: [
      { field: 'itemCode', labelAr: 'الكود SKU', type: 'string', required: true, aliases: ['sku', 'itemcode', 'الكود', 'كود الصنف', 'item code', 'code'] },
      { field: 'qty', labelAr: 'الكمية', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'الكمية', 'العدد', 'quantity', 'الوارد'] },
      { field: 'date', labelAr: 'التاريخ', type: 'string', required: false, aliases: ['date', 'التاريخ', 'تاريخ'] },
      { field: 'supplier', labelAr: 'المورّد', type: 'string', required: false, aliases: ['supplier', 'المورد', 'المورّد', 'الجهة', 'vendor'] },
      { field: 'note', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['note', 'ملاحظات', 'ملاحظة', 'البيان', 'remarks'] },
    ],
  },
  outbound: {
    key: 'outbound',
    labelAr: 'الصادر (Outbound_Log)',
    columns: [
      { field: 'itemCode', labelAr: 'الكود SKU', type: 'string', required: true, aliases: ['sku', 'itemcode', 'الكود', 'كود الصنف', 'item code', 'code'] },
      { field: 'qty', labelAr: 'الكمية', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'الكمية', 'العدد', 'quantity', 'الصادر'] },
      { field: 'date', labelAr: 'التاريخ', type: 'string', required: false, aliases: ['date', 'التاريخ', 'تاريخ'] },
      { field: 'customer', labelAr: 'العميل', type: 'string', required: false, aliases: ['customer', 'العميل', 'الجهة', 'المستلم', 'الزبون'] },
      { field: 'note', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['note', 'ملاحظات', 'ملاحظة', 'البيان', 'remarks'] },
    ],
  },
};

/** Normalize a header cell for alias matching (trim, lowercase, collapse spaces). */
export const normalizeHeader = (h) =>
  String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Build a lookup from every accepted header alias → canonical column def, for
 * a given dataset. Used by the importer to resolve arbitrary spreadsheet headers.
 *
 * @param {string} datasetKey  'items' | 'inbound' | 'outbound'
 * @returns {Map<string, ColumnDef>}
 */
export function buildHeaderIndex(datasetKey) {
  const ds = DATASETS[datasetKey];
  if (!ds) throw new Error(`Unknown dataset: ${datasetKey}`);
  const index = new Map();
  for (const col of ds.columns) {
    index.set(normalizeHeader(col.field), col);
    index.set(normalizeHeader(col.labelAr), col);
    for (const alias of col.aliases) index.set(normalizeHeader(alias), col);
  }
  return index;
}

/** Coerce a raw cell to a number, returning NaN when it isn't numeric. */
export function toNumber(raw) {
  if (raw === '' || raw == null) return 0;
  // Tolerate Arabic-Indic digits and thousands separators.
  const western = String(raw)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/,/g, '')
    .trim();
  const n = Number(western);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * التطبيع الأساسي: أرقام عربية → غربية، وإزالة المسافات والشرطات.
 * حاسم للمطابقة: الماسح يقرأ `8059692040599` والشيت قد يحمل `8059-692-040599`
 * أو يخزّنها إكسيل رقمًا فيصير `8.05969e+12`.
 * (داخلي — الصيغة القياسية للجميع هي `normalizeBarcode` أدناه.)
 */
function baseNormalizeBarcode(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  // إكسيل يحوّل الباركودات الطويلة إلى صيغة أسّية — نُعيدها رقمًا كاملًا.
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = BigInt(Math.round(n)).toString();
  }
  return s
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[\s\-_]/g, '')
    .toLowerCase();
}

/**
 * الصيغة القياسية للباركود — التطبيع الأساسي + **إسقاط الأصفار البادئة**
 * من القيم الرقمية الخالصة.
 *
 * لماذا؟ (طلب المالك 2026-07-21) الملصق قد يطبع `00251` والشيت يحمل `251`
 * — وكلاهما نفس الصنف. الماسحات نفسها تختلف: قارئ UPC-A يعطي 12 خانة
 * وقارئ EAN-13 يعطيها بصفر بادئ. المساواة الصحيحة هي «متساويان بعد إسقاط
 * الأصفار البادئة»، وتخزين الصيغة المُسقَطة يجعل `array-contains` في
 * Firestore يلتقطها من أي قارئ. غير الرقمي (`IP34927`) لا يُمسّ.
 */
export function normalizeBarcode(raw) {
  const s = baseNormalizeBarcode(raw);
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/**
 * صيغتا البحث عن باركود مُدخل: القياسية (بلا أصفار بادئة) + الأساسية كما
 * كُتبت. الثانية تلتقط أصنافًا خُزّنت **قبل** اعتماد إسقاط الأصفار — وإعادة
 * استيراد الشيت مرّة واحدة توحّد المخزون كلّه على الصيغة القياسية.
 */
export function barcodeLookupVariants(raw) {
  return [...new Set([normalizeBarcode(raw), baseNormalizeBarcode(raw)])].filter(Boolean);
}

/** الفواصل المقبولة بين عدّة باركودات داخل خانة واحدة. */
export function splitMulti(raw) {
  return String(raw ?? '')
    .split(/[,،/|;]+/)
    .map((v) => normalizeBarcode(v))
    .filter(Boolean);
}

/**
 * يُرجّح أي صفّ هو صفّ العناوين بفحص أول `maxScan` صفوف واختيار الأعلى تطابقًا
 * مع مرادفات المخطّط.
 *
 * لماذا؟ شيتات المستودع الحقيقية نادرًا ما تبدأ بالعناوين في الصف الأول —
 * فوقها شعار أو عنوان تقرير أو أسطر فارغة. النسخة السابقة كانت تفترض الصف
 * الأول دائمًا فتفشل صامتة. هذا المنطق منقول من المستورد الحيّ في شاشة الجرد
 * (الذي كان يعرف عملك أكثر من المخطّط «الرسمي»).
 *
 * @returns {{ index:number, hits:number }} موضع صفّ العناوين وعدد الأعمدة المتعرَّف عليها
 */
export function detectHeaderRow(matrix, datasetKey, maxScan = 10) {
  const index = buildHeaderIndex(datasetKey);
  let best = { index: 0, hits: -1 };
  const limit = Math.min(maxScan, matrix.length);

  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    // نعدّ الأعمدة **المتمايزة** المتعرَّف عليها — لا الخانات، فصفٌّ فيه
    // «الكمية» ثلاث مرّات ليس صفّ عناوين أفضل من صفّ فيه أربعة أعمدة حقيقية.
    const fields = new Set();
    for (const cell of row) {
      const col = resolveHeaderCell(cell, index);
      if (col) fields.add(col.field);
    }
    if (fields.size > best.hits) best = { index: i, hits: fields.size };
  }
  return best;
}

/** أقصر مرادف يُسمح بمطابقته بالاحتواء — أقصر منه يلتقط كلمات عابرة. */
const MIN_CONTAINS_LEN = 4;

/** هل هذا المحرف فاصل بين كلمتين؟ (كل ما ليس حرفًا ولا رقمًا) */
const isBoundary = (ch) => ch === undefined || !/[\p{L}\p{N}]/u.test(ch);

/**
 * هل يقع `alias` داخل `key` **ككلمة كاملة** لا كجزء من كلمة؟
 *
 * جوهر المسألة: «كود الصنف» موجودة حرفيًّا داخل «باركود الصنف»، لكنها تبدأ
 * وسط كلمة (يسبقها حرف «ر»). المطابقة بالاحتواء المجرّد كانت تقبلها فتخطف
 * عمود الباركود. الحدود ترفضها.
 *
 * ونتسامح مع أداة التعريف: «الباركود» تطابق المرادف «باركود» لأن ما قبله «ال»
 * في أول الكلمة — وهذا لا يُعيد الخلل، إذ «كود» في «الباركود» يسبقها «ر» لا «ال».
 */
function containsAsWord(key, alias) {
  let from = 0;
  for (;;) {
    const at = key.indexOf(alias, from);
    if (at === -1) return false;
    const after = key[at + alias.length];
    const startsClean = at === 0 || isBoundary(key[at - 1]);
    const afterAl = at >= 2 && key[at - 1] === 'ل' && key[at - 2] === 'ا' && isBoundary(key[at - 3]);
    if ((startsClean || afterAl) && isBoundary(after)) return true;
    from = at + 1;
  }
}

/**
 * يحلّ خانة عنوان إلى عمود المخطّط.
 *
 * الترتيب: مطابقة تامّة ← مطابقة تامّة بعد تنظيف الأقواس والترقيم ←
 * احتواء **بأطول مرادف مطابق**.
 *
 * ⚠️ لماذا «أطول مرادف يفوز» وليس «أوّل من يُحتوى»؟
 * لأن كلمة «كود» (مرادف لـsku) **مُحتواة داخل كلمة «الباركود»**. المطابقة
 * بأول احتواء كانت تُسند عمود الباركود إلى حقل SKU، فتُستورد الباركودات
 * أكوادًا وتبقى الأصناف بلا باركود — ولا يطابق الماسح شيئًا أبدًا، بصمت.
 * (اكتشفه اختبار «العنوان المزيّن» 2026-07-15.) بأطول مرادف تفوز «الباركود»
 * (٨ أحرف) على «كود» (٣) فيُحلّ العمود صحيحًا.
 */
export function resolveHeaderCell(cell, headerIndex) {
  const key = normalizeHeader(cell);
  if (!key) return null;

  const exact = headerIndex.get(key);
  if (exact) return exact;

  // «الباركود (EAN)» ⇒ «الباركود» — نُسقط الأقواس وما بينها والترقيم.
  const cleaned = normalizeHeader(key.replace(/\([^)]*\)/g, '').replace(/[:*#.\-_]/g, ' '));
  if (cleaned && cleaned !== key) {
    const hit = headerIndex.get(cleaned);
    if (hit) return hit;
  }

  let best = null;
  for (const [alias, col] of headerIndex.entries()) {
    if (alias.length < MIN_CONTAINS_LEN) continue;
    if (!containsAsWord(key, alias)) continue;
    if (!best || alias.length > best.alias.length) best = { alias, col };
  }
  return best?.col ?? null;
}
