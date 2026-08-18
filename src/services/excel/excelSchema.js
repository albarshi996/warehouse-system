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

/**
 * أعمدة ماستر شركاء الأعمال (مورّد/عميل) — بنية موحّدة (§15.2/15.3): الموردون
 * والعملاء توأمان، فمحرّكٌ واحد لا نسختان تتباعدان. `kind` يغيّر المرادفات
 * العربية فقط (مورّد ↔ عميل)؛ والحقول والأنواع واحدة. مبنيّة على نموذج
 * «موردين v.xlsx» (BP Code · BP Name · المفوّض · الهاتف · البريد · الأرصدة)
 * ومُثراة بحقول عالميّة (الرقم الضريبي · التصنيف · شروط الدفع · العملة · حد
 * الائتمان · العنوان · الحالة) — كلّها Odoo-Ready عبر `res.partner` لاحقًا.
 * الأرصدة الثلاثة **افتتاحيّة للعرض** (قرار المالك §19#3) لا محرّك تسوية.
 */
function partnerColumns(kind) {
  const ar = kind === 'customer' ? 'العميل' : 'المورد';
  const arAlt = kind === 'customer' ? 'الزبون' : 'المورّد';
  const en = kind === 'customer' ? 'customer' : 'supplier';
  const enAlt = kind === 'customer' ? 'client' : 'vendor';
  return [
    { field: 'code', labelAr: `BP Code (رمز ${ar})`, type: 'string', required: false, aliases: ['bp code', 'bpcode', 'business partner', `${en} code`, `${enAlt} code`, 'partner code', 'code', 'الرمز', 'الكود', `رمز ${ar}`, `كود ${ar}`] },
    { field: 'nameAr', labelAr: `BP Name (اسم ${ar})`, type: 'string', required: true, aliases: ['bp name', 'bpname', `${en} name`, `${enAlt} name`, 'partner name', 'name', 'الاسم', 'اسم الشركة', 'الشركة', `اسم ${ar}`, `اسم ${arAlt}`] },
    { field: 'contactPerson', labelAr: 'الشخص المفوّض', type: 'string', required: false, aliases: ['الشخص المفوض', 'الشخص المفوّض', 'المفوض', 'جهة الاتصال', 'المسؤول', 'المندوب', 'contact', 'contact person', 'authorized person', 'representative'] },
    { field: 'phone', labelAr: 'رقم الهاتف', type: 'string', required: false, aliases: ['رقم الهاتف', 'الهاتف', 'هاتف', 'تلفون', 'الجوال', 'رقم الجوال', 'الموبايل', 'phone', 'tel', 'telephone', 'mobile'] },
    { field: 'email', labelAr: 'البريد الإلكتروني', type: 'string', required: false, aliases: ['البريد الالكتروني', 'البريد الإلكتروني', 'البريد', 'ايميل', 'إيميل', 'email', 'e-mail', 'mail'] },
    { field: 'accountBalance', labelAr: 'Account Balance (رصيد الحساب)', type: 'number', required: false, aliases: ['account balance', 'accountbalance', 'account', 'رصيد الحساب', 'الرصيد', 'رصيد', 'balance'] },
    { field: 'openOrders', labelAr: 'Open Orders Balance (أوامر مفتوحة)', type: 'number', required: false, aliases: ['open orders balance', 'open orders', 'openorders', 'أوامر مفتوحة', 'اوامر مفتوحة', 'رصيد الأوامر المفتوحة', 'الطلبات المفتوحة'] },
    { field: 'openDeliveries', labelAr: 'Open Deliveries/GRPO (استلامات مفتوحة)', type: 'number', required: false, aliases: ['open deliveries/grpo balance', 'open deliveries', 'opendeliveries', 'grpo', 'grpo balance', 'استلامات مفتوحة', 'رصيد الاستلامات المفتوحة', 'تسليمات مفتوحة'] },
    { field: 'nameEn', labelAr: 'الاسم (إنجليزي)', type: 'string', required: false, aliases: ['nameen', 'name en', 'english name', 'الاسم بالانجليزي', 'الاسم الانجليزي'] },
    { field: 'taxNo', labelAr: 'الرقم الضريبي', type: 'string', required: false, aliases: ['tax number', 'taxno', 'tax', 'vat', 'vat no', 'الرقم الضريبي', 'الرقم الضريبى', 'رقم ضريبي'] },
    { field: 'category', labelAr: 'التصنيف', type: 'string', required: false, aliases: ['category', 'التصنيف', 'الفئة', 'النوع', 'المجموعة', 'type', 'group'] },
    { field: 'paymentTerms', labelAr: 'شروط الدفع', type: 'string', required: false, aliases: ['payment terms', 'paymentterms', 'شروط الدفع', 'شروط السداد', 'الشروط', 'terms'] },
    { field: 'currency', labelAr: 'العملة', type: 'string', required: false, aliases: ['currency', 'العملة', 'عملة', 'cur'] },
    { field: 'creditLimit', labelAr: 'حد الائتمان', type: 'number', required: false, nonNegative: true, aliases: ['credit limit', 'creditlimit', 'حد الائتمان', 'الحد الائتماني', 'سقف الائتمان', 'الائتمان'] },
    { field: 'address', labelAr: 'العنوان', type: 'string', required: false, aliases: ['address', 'العنوان', 'عنوان', 'المدينة', 'city', 'الدولة', 'country'] },
    { field: 'status', labelAr: 'الحالة', type: 'string', required: false, aliases: ['status', 'الحالة', 'active', 'نشط', `حالة ${ar}`] },
    { field: 'notes', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['notes', 'ملاحظات', 'ملاحظة', 'remarks', 'البيان'] },
  ];
}

/**
 * أعمدة هويّة السطر القادم من نظامٍ خارجيّ (LOC-201).
 *
 * الثلاثة الأولى هي **بصمة منع التكرار**: مرجع المستند × معرّف السطر × تاريخ
 * آخر تعديل بالمصدر. استيراد الملفّ نفسه مرّتين يُحدّث السجلّ ولا يضاعف
 * المخزون. ولذلك **لا تُحرَّر داخل البوابة** (قرار المالك 2026-08-16): تحريرها
 * يكسر منع التكرار فيصير الاستيراد الثاني مخزونًا ثانيًا.
 */
function sourceIdentityColumns() {
  return [
    { field: 'docRef', labelAr: 'Document Reference (مرجع المستند)', type: 'string', required: true, aliases: ['document reference', 'doc reference', 'odoo reference', 'reference', 'ref', 'picking', 'مرجع المستند', 'المرجع', 'رقم المستند'] },
    { field: 'docId', labelAr: 'Document ID (معرّف المستند)', type: 'string', required: false, aliases: ['document id', 'doc id', 'odoo record id', 'record id', 'معرف المستند', 'معرّف المستند'] },
    { field: 'lineId', labelAr: 'Line ID (معرّف السطر)', type: 'string', required: false, aliases: ['line id', 'odoo line id', 'move line id', 'line', 'معرف السطر', 'معرّف السطر', 'رقم السطر'] },
    { field: 'sourceUpdatedAt', labelAr: 'Source Updated At (تاريخ آخر تعديل بالمصدر)', type: 'string', required: false, aliases: ['source updated at', 'odoo write date', 'write date', 'write_date', 'last modified', 'updated at', 'تاريخ آخر تعديل', 'تاريخ التعديل'] },
    { field: 'sourceSystem', labelAr: 'Source System (النظام المصدر)', type: 'string', required: false, aliases: ['source system', 'system', 'source', 'erp', 'النظام المصدر', 'النظام', 'المصدر'] },
  ];
}

/**
 * أعمدة بند الصنف المشتركة بين أمر الاستلام وأمر التسليم.
 * `qtyLabel` و`batchLabel` يختلفان بالمعنى (كمّيّة واردة ↔ كمّيّة مطلوبة).
 */
function itemLineColumns(qtyLabel, batchLabel = 'Batch / Lot (الدفعة)') {
  return [
    { field: 'sku', labelAr: 'Item Code (كود الصنف)', type: 'string', required: true, aliases: ['item code', 'itemcode', 'sku', 'code', 'default_code', 'product code', 'part no', 'كود الصنف', 'الكود', 'رقم الصنف'] },
    { field: 'barcode', labelAr: 'Barcode (الباركود)', type: 'string', required: false, aliases: ['barcode', 'bar code', 'ean', 'ean13', 'upc', 'product id', 'الباركود', 'باركود'] },
    // «DISCREPTION» خطأٌ إملائيّ شائع في شيتات المستودعات — يُقبل عمدًا.
    { field: 'description', labelAr: 'Description (اسم الصنف)', type: 'string', required: false, aliases: ['description', 'discreption', 'item description', 'product name', 'name', 'اسم الصنف', 'الصنف', 'الوصف'] },
    { field: 'uom', labelAr: 'UOM (وحدة القياس)', type: 'string', required: false, aliases: ['uom', 'unit', 'unit of measure', 'وحدة القياس', 'الوحدة'] },
    { field: 'qty', labelAr: qtyLabel, type: 'number', required: true, nonNegative: true, aliases: ['quantity', 'qty', 'demand', 'done', 'الكمية', 'الكميه', 'العدد', 'الكمية المطلوبة'] },
    { field: 'batch', labelAr: batchLabel, type: 'string', required: false, aliases: ['batch', 'lot', 'batch no', 'lot no', 'lot/serial', 'الدفعة', 'التشغيلة', 'رقم الدفعة'] },
    { field: 'expiry', labelAr: 'Expiry Date (تاريخ الصلاحية)', type: 'string', required: false, aliases: ['expiry date', 'expiry', 'expiration', 'exp', 'تاريخ الصلاحية', 'الصلاحية', 'انتهاء الصلاحية'] },
  ];
}

/** مجموعات قالب الاستيراد القياسيّ — منها يُولَّد الملفّ ومنها يقرأ المستورد. */
export const IMPORT_TEMPLATE_DATASETS = ['receipt', 'delivery', 'stockSnapshot', 'posSales'];

/**
 * بصمة السطر المستورد — تمنع أن يضاعف الاستيرادُ الثاني المخزون.
 *
 * الأصل: مرجع المستند + معرّف السطر + تاريخ آخر تعديل بالمصدر. وإن عجز النظام
 * المصدر عن توفير معرّف سطر، نسقط إلى **بصمة محتوى الصفّ** (الصنف والدفعة
 * والكمّيّة) — فيبقى المنع قائمًا ولو بدقّةٍ أقلّ، بدل أن يسقط كلّه.
 */
export function importFingerprint(row) {
  const part = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  const ref = part(row?.docRef);
  const line = part(row?.lineId);
  const stamp = part(row?.sourceUpdatedAt);
  if (ref && line) return `${ref}__${line}__${stamp || 'NOSTAMP'}`;
  // لا معرّف سطر ⇒ بصمة المحتوى، ومعها المرجع إن وُجد.
  const body = [part(row?.sku) || part(row?.barcode), part(row?.batch) || 'NOBATCH', part(row?.qty)].join('_');
  return `${ref || 'NOREF'}__C_${body}__${stamp || 'NOSTAMP'}`;
}

/** أعمدة القالب القياسيّ للشركاء بالترتيب — ما يُصدَّر ويُسلَّم. */
const PARTNER_TEMPLATE_FIELDS = [
  'code', 'nameAr', 'contactPerson', 'phone', 'email',
  'accountBalance', 'openOrders', 'openDeliveries',
  'taxNo', 'category', 'paymentTerms', 'currency', 'creditLimit', 'status',
];

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
      // نوع الصنف (م٣-أ): بيع · داخليّ · خدمة. عمودٌ لا شاشةٌ وحدها — تصنيفُ
      // مئات الأصناف صنفًا صنفًا بيدٍ عملٌ لا يُنجَز، فيبقى الكلّ `sale` إلى
      // الأبد وتبقى الفجوة. والفراغ والمجهول يسقطان إلى `sale` في `typeOf`.
      { field: 'itemType', labelAr: 'Item Type (نوع الصنف)', type: 'string', required: false, aliases: ['itemtype', 'item type', 'نوع الصنف', 'النوع', 'type', 'نوع'] },
      // وحدة أساس الصنف (م٣-ب): بها يبدأ التحويل لهذا الصنف وحده.
      { field: 'baseUom', labelAr: 'Base UoM (وحدة الأساس)', type: 'string', required: false, aliases: ['baseuom', 'base uom', 'وحدة الأساس', 'وحدة الاساس', 'الوحدة الأساسية'] },
      // ‹FNB-203› مسار التوريد: مخزن · مطبخ · مباشر — والفارغ يسلك الافتراضيّ.
      { field: 'supplyRoute', labelAr: 'Supply Route (مسار التوريد)', type: 'string', required: false, aliases: ['supply route', 'supplyroute', 'route', 'مسار التوريد', 'المسار', 'مسار'] },
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
   * الموردون — ماستر الموردين (§15.2). المعرّف رمز المورّد (BP Code)، وينبع
   * الاستيراد من نموذج «موردين v.xlsx». لا حذف — أرشفة (`status`) لا محو.
   */
  /**
   * الشجرة التنظيميّة ‹FNB-101› — قطاع › براند › فرع › مركز تكلفة.
   *
   * وعاء `org_locations` (م٦-أ) قائمٌ ومحروسٌ وفارغ؛ وهذه بوّابة ملئه بالجملة:
   * صفٌّ لكلّ موقع. **صحّة الأبوّة لا تُفحص هنا** — الشيت يُقرأ شكلًا، والشجرة
   * تُحكم كاملةً في `org/orgImport.js` (`planOrgImport`) فتُقبل كاملةً أو تُرفض
   * كاملةً — لا حفظَ جزئيّ صامت.
   */
  orgLocations: {
    key: 'orgLocations',
    labelAr: 'الشجرة التنظيميّة (Org_Locations)',
    columns: [
      { field: 'code', labelAr: 'Code (الرمز)', type: 'string', required: true, aliases: ['code', 'الرمز', 'الكود', 'رمز الموقع', 'location code', 'org code'] },
      { field: 'nameAr', labelAr: 'الاسم العربيّ', type: 'string', required: true, aliases: ['name', 'الاسم', 'الاسم العربي', 'الاسم العربيّ', 'اسم الموقع', 'name ar'] },
      { field: 'level', labelAr: 'المستوى (قطاع/براند/فرع/مركز تكلفة)', type: 'string', required: true, aliases: ['level', 'المستوى', 'النوع', 'type'] },
      { field: 'parentCode', labelAr: 'Parent (رمز الأب)', type: 'string', required: false, aliases: ['parent', 'parent code', 'parentcode', 'الأب', 'الاب', 'رمز الأب', 'رمز الاب', 'التبعية', 'يتبع'] },
      { field: 'nameEn', labelAr: 'الاسم (إنجليزي)', type: 'string', required: false, aliases: ['name en', 'nameen', 'english name', 'الاسم بالانجليزي', 'الاسم الانجليزي'] },
      { field: 'city', labelAr: 'المدينة', type: 'string', required: false, aliases: ['city', 'المدينة', 'مدينة'] },
      { field: 'active', labelAr: 'الحالة (نشط/معطّل)', type: 'string', required: false, aliases: ['active', 'الحالة', 'status', 'نشط'] },
      { field: 'notes', labelAr: 'ملاحظات', type: 'string', required: false, aliases: ['notes', 'ملاحظات', 'ملاحظة', 'remarks'] },
    ],
  },
  suppliers: {
    key: 'suppliers',
    labelAr: 'الموردون (Suppliers_Master)',
    columns: partnerColumns('supplier'),
    templateFields: PARTNER_TEMPLATE_FIELDS,
  },
  /**
   * العملاء — ماستر العملاء (§15.3). توأم الموردين بنيةً؛ نفس المحرّك والحقول،
   * ومرادفات عربية للعميل بدل المورّد. المعرّف رمز العميل، وربط كل بيع بمعرّفه.
   */
  customers: {
    key: 'customers',
    labelAr: 'العملاء (Customers_Master)',
    columns: partnerColumns('customer'),
    templateFields: PARTNER_TEMPLATE_FIELDS,
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
  /**
   * مبيعات نقطة البيع اليوميّة ‹FNB-704 · قرار المالك ق-O06: **ملفٌّ يوميّ**›.
   *
   * أربعة أعمدة لا أكثر: اليوم والفرع وصنف البيع والكمّيّة. وكلّ ما عداها
   * يُقرأ من الماستر — فملفٌّ بعشرين عمودًا لا يُملأ يوميًّا، وملفٌّ بأربعة
   * يُملأ. والسعر **لا يُطلب**: التكلفة تُقرأ من دفترنا، والإيراد من أودو
   * (حدّ ق‑ت١)، فطلبُه هنا يفتح مصدرًا ثانيًا للمال.
   *
   * والمرادفات تقبل ما تُخرجه أنظمة نقاط البيع الشائعة بلا إعادة تسمية.
   */
  posSales: {
    key: 'posSales',
    labelAr: 'مبيعات نقطة البيع (يوميّ)',
    columns: [
      { field: 'date', labelAr: 'التاريخ', type: 'string', required: true, aliases: ['date', 'day', 'business date', 'businessdate', 'order date', 'التاريخ', 'اليوم', 'تاريخ البيع'] },
      { field: 'branch', labelAr: 'الفرع', type: 'string', required: true, aliases: ['branch', 'branch code', 'branchcode', 'outlet', 'store', 'location', 'الفرع', 'رمز الفرع', 'المطعم', 'الفروع'] },
      { field: 'sku', labelAr: 'صنف البيع (Menu Item)', type: 'string', required: true, aliases: ['sku', 'item', 'item code', 'itemcode', 'product', 'product code', 'menu item', 'menuitem', 'default_code', 'الصنف', 'كود الصنف', 'الكود', 'صنف البيع'] },
      { field: 'qty', labelAr: 'الكمّيّة المباعة', type: 'number', required: true, nonNegative: true, aliases: ['qty', 'quantity', 'count', 'sold', 'units', 'الكمية', 'العدد', 'المباع', 'الكميه'] },
    ],
    templateFields: ['date', 'branch', 'sku', 'qty'],
  },
  balances: {
    key: 'balances',
    labelAr: 'الأرصدة (Balances)',
    columns: [
      { field: 'barcode', labelAr: 'Bar Code', type: 'string', required: false, aliases: ['bar code', 'barcode', 'الباركود', 'باركود', 'ean', 'upc'] },
      { field: 'sku', labelAr: 'Item Code (كود الصنف)', type: 'string', required: false, aliases: ['sku', 'item code', 'itemcode', 'كود الصنف', 'الكود', 'code', 'default_code'] },
      { field: 'nameAr', labelAr: 'Item Description (اسم الصنف)', type: 'string', required: false, aliases: ['item description', 'اسم الصنف', 'الصنف', 'name', 'description', 'الوصف'] },
      { field: 'warehouse', labelAr: 'Warehouse (المخزن)', type: 'string', required: true, aliases: ['warehouse', 'المخزن', 'المستودع', 'whs', 'wh', 'الموقع العام', 'store'] },
      // ‹LOC-106› الحقل القياسيّ اسمه `bin` — نفس ما يكتبه القيد المخزنيّ.
      // كان `location` فصار للموقع حقلان: يكتب الشيتُ أحدَهما والقيدُ الآخر
      // ولا يوحّدهما أحد. العنوان المعروض لم يتغيّر، و`location` تبقى مرادفًا
      // مقبولًا عند الاستيراد فلا ينكسر شيتٌ قائم.
      { field: 'bin', labelAr: 'Location (الموقع/الرف)', type: 'string', required: false, aliases: ['location', 'الموقع', 'الرف', 'الرفّ', 'bin', 'rack', 'shelf', 'بوكس'] },
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
    templateFields: ['barcode', 'sku', 'nameAr', 'warehouse', 'bin', 'batch', 'expiry', 'qty', 'unitCost', 'countDate'],
  },
  /**
   * ═══ قالب الاستيراد القياسيّ (LOC-201) — عقدُ البوابة مع أيّ نظام ═══
   *
   * البوابة **لا تتّصل بأيّ نظامٍ خارجيّ** ولا تكتب فيه. هذه الأوراق الثلاث هي
   * المدخل الوحيد، والمنشأة تُكيّف مخرجات نظامها (أودو أو غيره) لتطابقها.
   * ولذلك الأعمدة **محايدة الاسم** (`Document Reference` لا `Odoo Reference`)،
   * وأسماء أودو تبقى مرادفاتٍ مقبولة فلا ينكسر شيتٌ صُدّر منه مباشرةً.
   *
   * وهذا المخطّط هو **المصدر الواحد**: منه يُولَّد القالب القابل للتنزيل ومنه
   * يقرأ المستورد — فيستحيل أن يفترق ما يُصدَّر عمّا يُقرأ.
   *
   * ⚠️ «اسم الملفّ» و«من استورد» و«وقت الاستيراد» **ليست أعمدةً هنا** عمدًا:
   * تكتبها البوابة من هويّة المستخدم المسجَّل (قرار المالك 2026-08-16)، ووضعُها
   * في الشيت يجعلها قابلةً للتزوير بيد من يملأ الملفّ.
   */
  receipt: {
    key: 'receipt',
    labelAr: 'أمر الاستلام (Receipt)',
    sheetName: 'Receipt',
    columns: [
      ...sourceIdentityColumns(),
      { field: 'docStatus', labelAr: 'Document Status (حالة المستند)', type: 'string', required: false, aliases: ['document status', 'status', 'odoo status', 'state', 'حالة المستند', 'الحالة'] },
      { field: 'receiptDate', labelAr: 'Receipt Date (تاريخ الاستلام)', type: 'string', required: false, aliases: ['receipt date', 'date', 'scheduled date', 'تاريخ الاستلام', 'التاريخ', 'تاريخ'] },
      { field: 'warehouse', labelAr: 'Warehouse (المستودع)', type: 'string', required: true, aliases: ['warehouse', 'المستودع', 'المخزن', 'whs', 'wh', 'store'] },
      { field: 'sourceLocation', labelAr: 'Source Location (الموقع المصدر)', type: 'string', required: false, aliases: ['source location', 'from location', 'الموقع المصدر', 'من موقع'] },
      { field: 'destinationLocation', labelAr: 'Destination Location (الموقع الوجهة)', type: 'string', required: false, aliases: ['destination location', 'to location', 'dest location', 'الموقع الوجهة', 'إلى موقع', 'الى موقع'] },
      { field: 'supplierCode', labelAr: 'Supplier Code (رمز المورّد)', type: 'string', required: false, aliases: ['supplier code', 'vendor code', 'partner code', 'رمز المورد', 'رمز المورّد', 'كود المورد'] },
      { field: 'supplier', labelAr: 'Supplier (اسم المورّد)', type: 'string', required: false, aliases: ['supplier', 'vendor', 'partner', 'المورد', 'المورّد', 'اسم المورد'] },
      ...itemLineColumns('Quantity (الكمية)'),
      { field: 'unitWeight', labelAr: 'Unit Weight (وزن الوحدة)', type: 'number', required: false, nonNegative: true, aliases: ['unit weight', 'weight', 'وزن الوحدة', 'الوزن'] },
      { field: 'unitVolume', labelAr: 'Unit Volume (حجم الوحدة)', type: 'number', required: false, nonNegative: true, aliases: ['unit volume', 'volume', 'حجم الوحدة', 'الحجم'] },
      { field: 'notes', labelAr: 'Notes (ملاحظات)', type: 'string', required: false, aliases: ['notes', 'note', 'remarks', 'ملاحظات', 'ملاحظة', 'البيان'] },
    ],
    templateFields: [
      'docRef', 'docId', 'lineId', 'sourceUpdatedAt', 'sourceSystem', 'docStatus', 'receiptDate',
      'warehouse', 'sourceLocation', 'destinationLocation', 'supplierCode', 'supplier',
      'sku', 'barcode', 'description', 'uom', 'qty', 'batch', 'expiry',
      'unitWeight', 'unitVolume', 'notes',
    ],
  },

  delivery: {
    key: 'delivery',
    labelAr: 'أمر التسليم (Delivery)',
    sheetName: 'Delivery',
    columns: [
      ...sourceIdentityColumns(),
      { field: 'docStatus', labelAr: 'Document Status (حالة المستند)', type: 'string', required: false, aliases: ['document status', 'status', 'odoo status', 'state', 'حالة المستند', 'الحالة'] },
      { field: 'deliveryDate', labelAr: 'Delivery Date (تاريخ التسليم)', type: 'string', required: false, aliases: ['delivery date', 'date', 'scheduled date', 'تاريخ التسليم', 'التاريخ', 'تاريخ'] },
      { field: 'warehouse', labelAr: 'Warehouse (المستودع)', type: 'string', required: true, aliases: ['warehouse', 'المستودع', 'المخزن', 'whs', 'wh', 'store'] },
      { field: 'customerCode', labelAr: 'Customer Code (رمز العميل)', type: 'string', required: false, aliases: ['customer code', 'client code', 'partner code', 'رمز العميل', 'كود العميل'] },
      { field: 'customer', labelAr: 'Customer (اسم العميل)', type: 'string', required: false, aliases: ['customer', 'client', 'partner', 'العميل', 'اسم العميل', 'الزبون'] },
      // أمر البيع **مرجعٌ فقط**: التنفيذ يقوم على أمر التسليم لأنّ أمر البيع
      // قد يحمل كمّيّةً غير متاحة أو غير محجوزة بعد (تنبيه المالك، معتمَد).
      { field: 'orderRef', labelAr: 'Order Reference (مرجع الطلب)', type: 'string', required: false, aliases: ['order reference', 'sales order ref', 'sale order', 'so ref', 'مرجع الطلب', 'أمر البيع', 'امر البيع'] },
      ...itemLineColumns('Quantity (الكمية المطلوبة)', 'Batch / Lot (الدفعة المحجوزة)'),
      { field: 'notes', labelAr: 'Notes (ملاحظات)', type: 'string', required: false, aliases: ['notes', 'note', 'remarks', 'ملاحظات', 'ملاحظة', 'البيان'] },
    ],
    templateFields: [
      'docRef', 'docId', 'lineId', 'sourceUpdatedAt', 'sourceSystem', 'docStatus', 'deliveryDate',
      'warehouse', 'customerCode', 'customer', 'orderRef',
      'sku', 'barcode', 'description', 'uom', 'qty', 'batch', 'expiry', 'notes',
    ],
  },

  /**
   * لقطة مخزون النظام — تُرفَق يوميًّا لمقارنة الفعليّ بالنظام.
   *
   * ⚠️ `systemLocation` هو موقع **النظام المصدر** لا رفوف البوابة. رفوف البوابة
   * تُعرَّف داخلها (`bin_locations`) ولا يعرفها أيّ نظامٍ خارجيّ. فإن جاء فارغًا
   * حُسب الفرق على «الصنف × المستودع»، وإن جاء مملوءًا صار أدقّ. والخلط بين
   * المرجعين يُنتج مطابقةً كاذبة.
   */
  stockSnapshot: {
    key: 'stockSnapshot',
    labelAr: 'لقطة مخزون النظام (StockSnapshot)',
    sheetName: 'StockSnapshot',
    columns: [
      { field: 'snapshotDate', labelAr: 'Snapshot Date (تاريخ اللقطة)', type: 'string', required: true, aliases: ['snapshot date', 'date', 'as of', 'as of date', 'تاريخ اللقطة', 'التاريخ', 'تاريخ الرصيد'] },
      { field: 'sourceSystem', labelAr: 'Source System (النظام المصدر)', type: 'string', required: false, aliases: ['source system', 'system', 'source', 'النظام المصدر', 'النظام', 'المصدر'] },
      { field: 'warehouse', labelAr: 'Warehouse (المستودع)', type: 'string', required: true, aliases: ['warehouse', 'المستودع', 'المخزن', 'whs', 'wh', 'store'] },
      { field: 'systemLocation', labelAr: 'System Location (موقع النظام)', type: 'string', required: false, aliases: ['system location', 'odoo location', 'location', 'موقع النظام', 'الموقع'] },
      { field: 'sku', labelAr: 'Item Code (كود الصنف)', type: 'string', required: true, aliases: ['item code', 'itemcode', 'sku', 'code', 'default_code', 'product code', 'كود الصنف', 'الكود', 'رقم الصنف'] },
      { field: 'barcode', labelAr: 'Barcode (الباركود)', type: 'string', required: false, aliases: ['barcode', 'bar code', 'ean', 'ean13', 'upc', 'الباركود', 'باركود'] },
      { field: 'description', labelAr: 'Description (اسم الصنف)', type: 'string', required: false, aliases: ['description', 'discreption', 'item description', 'product name', 'name', 'اسم الصنف', 'الصنف', 'الوصف'] },
      { field: 'uom', labelAr: 'UOM (وحدة القياس)', type: 'string', required: false, aliases: ['uom', 'unit', 'unit of measure', 'وحدة القياس', 'الوحدة'] },
      { field: 'batch', labelAr: 'Batch / Lot (الدفعة)', type: 'string', required: false, aliases: ['batch', 'lot', 'batch no', 'lot no', 'الدفعة', 'التشغيلة', 'رقم الدفعة'] },
      { field: 'expiry', labelAr: 'Expiry Date (تاريخ الصلاحية)', type: 'string', required: false, aliases: ['expiry date', 'expiry', 'expiration', 'exp', 'تاريخ الصلاحية', 'الصلاحية', 'انتهاء الصلاحية'] },
      // الصفر رصيدٌ مشروع («نفد من هذا المخزن») فلا يُشترط أكبر من صفر.
      { field: 'systemQty', labelAr: 'System Quantity (رصيد النظام)', type: 'number', required: true, nonNegative: true, aliases: ['system quantity', 'system qty', 'odoo quantity', 'odoo qty', 'quantity', 'qty', 'on hand', 'رصيد النظام', 'الرصيد', 'الكمية', 'الكمية الدفترية'] },
      { field: 'unitCost', labelAr: 'Unit Cost (تكلفة الوحدة)', type: 'number', required: false, nonNegative: true, aliases: ['unit cost', 'cost', 'تكلفة الوحدة', 'التكلفة'] },
    ],
    templateFields: [
      'snapshotDate', 'sourceSystem', 'warehouse', 'systemLocation',
      'sku', 'barcode', 'description', 'uom', 'batch', 'expiry', 'systemQty', 'unitCost',
    ],
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
