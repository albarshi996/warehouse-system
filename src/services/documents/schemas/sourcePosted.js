/**
 * مستنداتُ المصدر المُنجَزة ‹SRC-POST› — ما أُنجز في نظامٍ آخر (أودو) يُرحَّل كما وقع.
 *
 * ═══ لماذا أنواعٌ جديدة لا السلسلةُ القائمة؟ ═══
 * مستنداتُ البوّابة سلسلةٌ ميدانيّة: التسليمُ فيها PICK (رفّ ⟵ تجهيز) ثمّ DN (تجهيز ⟵
 * مركبة) ثمّ POD (مركبة ⟵ خارج). وأودو يُنجز التسليمَ **خطوةً واحدة**: من المستودع إلى
 * العميل. فلو رحّلناه بالسلسلة لاختلقنا مركبةً لم تحمل شيئًا ومنطقةَ تجهيزٍ لم يقف فيها
 * شيء، ولو أنهينا PICK وحدها لبقيت البضاعةُ «في التجهيز» داخل المستودع.
 * فهذه الأنواع تقول ما وقع حرفًا: **أُنجز في المصدر، ومن هنا إلى هناك**.
 *
 * ═══ والقرارُ الحاكم (المالك 2026-10-20 — الخيار أ) ═══
 * أرصدةُ لقطة 19 أكتوبر هي الرصيدُ الافتتاحيّ، وكلُّ مستندٍ بعدها يُرحَّل ويحرّك المخزون.
 * ولا تُرفع لقطةُ أرصدةٍ بعدها أبدًا — وإلّا تضاعف كلُّ نقص.
 *
 * ═══ ولا تُنشأ باليد ═══
 * مسجَّلةٌ في `SCHEMAS` (فتظهر في السجلّ وتُرحَّل) **وليست في `GOVERNED_FORMS`**
 * (فلا تظهر في «بدء مستندٍ جديد»). مصدرُها الاستيرادُ وحده — مستندٌ أُنجز في نظامٍ آخر لا
 * يُكتب من الصفر هنا. وأدوارُها لمدير المستودع وحده، والمديرُ العامّ فوق ذلك بحكم `canDo`.
 */

const LINE_COLUMNS = [
  { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '12%' },
  { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '13%' },
  { key: 'description', label: 'اسم الصنف', kind: 'text', width: '27%' },
  { key: 'uom', label: 'الوحدة', kind: 'text', width: '8%' },
  { key: 'qty', label: 'الكمية', kind: 'number', width: '9%' },
  { key: 'batch', label: 'الدفعة', kind: 'text', width: '10%' },
  { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '10%' },
  { key: 'unitCost', label: 'تكلفة الوحدة (د.ل)', kind: 'number', width: '11%' },
];

/** حقولُ الهويّة المشتركة: من أين جاء المستند، ومتى أُنجز هناك، ومن إلى أين. */
function identityFields(warehouseFields) {
  return [
    {
      key: 'sourceRef',
      label: 'مرجع المستند في المصدر (Source Ref)',
      kind: 'text',
      required: true,
      ltr: true,
      hint: 'رقم المستند كما في أودو — به يُعرف ويُمنع تكراره.',
    },
    { key: 'sourceSystem', label: 'النظام المصدر', kind: 'text', hint: 'أودو.' },
    {
      key: 'sourceDoneDate',
      label: 'تاريخ الإنجاز في المصدر',
      kind: 'date',
      required: true,
      hint: 'اليوم الذي أُنجز فيه المستند في أودو — لا يومُ استيراده.',
    },
    ...warehouseFields,
    { key: 'sourceFrom', label: 'من (موقع المصدر)', kind: 'text', ltr: true, hint: 'كما في أودو، مثل WHNBE/Stock.' },
    { key: 'sourceTo', label: 'إلى (موقع الوجهة)', kind: 'text', ltr: true, hint: 'كما في أودو، مثل Customers.' },
    { key: 'partner', label: 'الطرف (مورّد / عميل)', kind: 'text' },
    { key: 'partnerCode', label: 'رمز الطرف', kind: 'text', ltr: true },
    { key: 'orderRef', label: 'مرجع الطلب (أمر بيع / شراء)', kind: 'text', ltr: true },
    { key: 'notes', label: 'ملاحظات', kind: 'text' },
  ];
}

const WAREHOUSE_FIELD = (label, hint) => ({ key: 'warehouse', label, kind: 'text', required: true, hint });
const FROM_FIELD = (required) => ({
  key: 'fromWarehouse',
  label: 'المستودع المرسِل (From)',
  kind: 'text',
  required,
  hint: 'كود البوّابة (WH001 بنغازي · WH002 طرابلس) لا كود أودو.',
});
const TO_FIELD = (required) => ({
  key: 'toWarehouse',
  label: 'المستودع المستلِم (To)',
  kind: 'text',
  required,
  hint: 'كود البوّابة (WH001 بنغازي · WH002 طرابلس) لا كود أودو.',
});

const ROLES = Object.freeze({
  create: ['warehouse_manager'],
  approve: ['warehouse_manager'],
  complete: ['warehouse_manager'],
});

/**
 * تحذيراتٌ تُقرأ قبل الإرسال: بندٌ بلا هويّة لا يُنسب إلى صنف، وكمّيّةٌ صفرٌ لا أثرَ لها،
 * ومرجعٌ مفقودٌ يُسقط منعَ التكرار. والحكمُ النهائيّ لمحرّك القيد لا لهذه.
 */
export function sourcePostedWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];
  const noId = lines.filter((l) => !String(l?.sku || '').trim() && !String(l?.barcode || '').trim());
  if (noId.length) out.push(`${noId.length} بندًا بلا كودٍ ولا باركود — لا يُنسب إلى صنف`);
  const zero = lines.filter((l) => !(Number(l?.qty) > 0));
  if (zero.length) out.push(`${zero.length} بندًا كمّيّتُه صفر — لا أثرَ له`);
  if (!String(doc?.header?.sourceRef || '').trim()) out.push('بلا مرجعٍ في المصدر — يسقط منعُ التكرار');
  return out;
}

function makeSchema({ type, titleAr, titleEn, formCode, headerTitle, warehouseFields }) {
  return {
    type,
    stage: 9,
    titleAr,
    titleEn,
    formCode,
    orientation: 'landscape',
    /** مستندٌ أُنجز في المصدر — يُستورد ولا يُنشأ باليد (انظر رأس الملفّ). */
    sourcePosted: true,
    roles: ROLES,
    sections: [
      {
        key: 'header',
        title: headerTitle,
        kind: 'fields',
        columns: 3,
        fields: identityFields(warehouseFields),
      },
      {
        key: 'lines',
        title: 'البنود — Lines',
        kind: 'table',
        minRows: 1,
        columns: LINE_COLUMNS,
      },
    ],
    signatures: [
      { key: 'importer', label: 'المستورِد (Imported by)', source: 'creator' },
      { key: 'approver', label: 'المعتمِد (Approved by)', source: 'approver' },
      { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
    ],
    warnings: sourcePostedWarnings,
  };
}

/** استلامٌ أُنجز في المصدر: من المورّد (أو العميل في المرتجع) إلى المستودع. */
export const sri = makeSchema({
  type: 'SRI',
  titleAr: 'استلامٌ منجَزٌ في المصدر',
  titleEn: 'Source Receipt (posted)',
  formCode: 'BFP-SRI-001',
  headerTitle: 'بيانات الاستلام المنجَز في المصدر',
  warehouseFields: [WAREHOUSE_FIELD('المستودع المستلِم (To)', 'كود البوّابة الذي دخلت إليه البضاعة.')],
});

/** تسليمٌ أُنجز في المصدر: من المستودع إلى العميل. */
export const sro = makeSchema({
  type: 'SRO',
  titleAr: 'تسليمٌ منجَزٌ في المصدر',
  titleEn: 'Source Delivery (posted)',
  formCode: 'BFP-SRO-001',
  headerTitle: 'بيانات التسليم المنجَز في المصدر',
  warehouseFields: [WAREHOUSE_FIELD('المستودع المُسلِّم (From)', 'كود البوّابة الذي خرجت منه البضاعة.')],
});

/** إرساليّةُ نقلٍ أُنجزت في المصدر: من المستودع المرسِل إلى الطريق. */
export const sxo = makeSchema({
  type: 'SXO',
  titleAr: 'إرساليّةُ نقلٍ منجَزةٌ في المصدر',
  titleEn: 'Source Transfer Dispatch (posted)',
  formCode: 'BFP-SXO-001',
  headerTitle: 'بيانات إرساليّة النقل المنجَزة في المصدر',
  warehouseFields: [FROM_FIELD(true), TO_FIELD(false)],
});

/** استلامُ نقلٍ أُنجز في المصدر: من الطريق إلى المستودع المستلِم. */
export const sxi = makeSchema({
  type: 'SXI',
  titleAr: 'استلامُ نقلٍ منجَزٌ في المصدر',
  titleEn: 'Source Transfer Receipt (posted)',
  formCode: 'BFP-SXI-001',
  headerTitle: 'بيانات استلام النقل المنجَز في المصدر',
  warehouseFields: [FROM_FIELD(false), TO_FIELD(true)],
});

/** الأنواعُ الأربعة — مفتاحُ كلٍّ نوعُه. */
export const SOURCE_POSTED_SCHEMAS = Object.freeze({ SRI: sri, SRO: sro, SXO: sxo, SXI: sxi });

/** هل هذا النوع مستندُ مصدرٍ مُنجَز (يُستورد ولا يُنشأ باليد)؟ */
export function isSourcePostedType(type) {
  return Object.hasOwn(SOURCE_POSTED_SCHEMAS, String(type || '').toUpperCase());
}
