/**
 * تشكيل حقول الصنف القادمة من الاستيراد — منطق خالص بلا Firebase.
 *
 * لماذا وحدة مستقلّة؟ لأن هذا الملف يسدّ خللًا صامتًا وقع فعلًا (2026-07-15):
 * ترقّى مخطّط الشيت إلى أعمدة العمل الحقيقية (أسعار الشراء/البيع · التسلسل
 * الرباعي · المورّد · مجموعة الوحدة) بينما بقيت دالة الكتابة تعرف الأسماء
 * القديمة فقط — فكانت الأعمدة الجديدة **تُقرأ من الشيت ثم تُرمى بلا رسالة**.
 * الاختبار المرافق يقارن هذا الملف بمخطّط الشيت عمودًا عمودًا فيمنع عودة
 * الانحراف (نفس فلسفة اختبار «أدوار المخطّط تطابق قواعد الأمان»).
 */

/** مرادفات الوحدات كما تُكتب فعلًا في الشيتات العربية. */
const UNIT_ALIASES = {
  piece: ['piece', 'pcs', 'pc', 'unit', 'each', 'ea', 'قطعة', 'قطع', 'حبة', 'حبات', 'وحدة'],
  box: ['box', 'carton', 'ctn', 'كرتون', 'كرتونة', 'صندوق', 'كارتون'],
  pack: ['pack', 'pk', 'packet', 'علبة', 'عبوة', 'باكيت', 'طقم'],
  kg: ['kg', 'kgs', 'kilo', 'kilogram', 'كيلو', 'كجم', 'كيلوجرام', 'كيلوغرام'],
  litre: ['litre', 'liter', 'l', 'ltr', 'لتر', 'لتره'],
  metre: ['metre', 'meter', 'm', 'mtr', 'متر', 'أمتار'],
};

/** يحوّل وحدةً مكتوبة بأي صيغة إلى القيمة القياسية. ما لا يُعرف يبقى كما هو. */
export function normalizeUnit(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'piece';
  for (const [value, aliases] of Object.entries(UNIT_ALIASES)) {
    if (value === s || aliases.includes(s)) return value;
  }
  return String(raw).trim();
}

const str = (v) => String(v).trim();
const num = (v) => Number(v) || 0;

/**
 * كيف يُخزَّن كل حقل اختياري قادم من الشيت.
 * `also` = مرايا توافُق خلفي: الشاشات القائمة (الأصناف · الجرد) تقرأ
 * `category/subcategory/unit/unitPrice`، فتُملأ من الحقول الجديدة تلقائيًّا
 * حتى لا تنكسر أي شاشة ولا يلزم ترحيل.
 */
const FIELD_CASTS = {
  nameEn: { cast: str },
  shade: { cast: str },
  notes: { cast: str },
  supplier: { cast: str },
  balance: { cast: num },
  minStock: { cast: num },
  costPrice: { cast: num, also: { unitPrice: num } },
  sellPrice: { cast: num },
  uomGroupCode: { cast: str },
  uomGroupName: { cast: str, also: { unit: (v) => normalizeUnit(v) } },
  department: { cast: str },
  section: { cast: str },
  family: { cast: str, also: { category: str } },
  subFamily: { cast: str, also: { subcategory: str } },
  // القنوات القديمة تبقى مقبولة (نموذج الصنف اليدوي وأي مستدعٍ قديم):
  category: { cast: str },
  subcategory: { cast: str },
  unit: { cast: (v) => normalizeUnit(v) },
  unitPrice: { cast: num },
};

/** الحقول التي يعالجها التشكيل — للاختبار المضادّ للانحراف. */
export const SHAPED_FIELDS = Object.keys(FIELD_CASTS);

/**
 * يبني حقول الكتابة الاختيارية من صفّ مستورد.
 * الحقل الغائب أو الفارغ لا يُكتب — فلا يمحو عمودٌ ناقص بياناتٍ قائمة.
 */
export function shapeImportedItem(raw) {
  const out = {};
  for (const [key, { cast, also }] of Object.entries(FIELD_CASTS)) {
    const v = raw?.[key];
    if (v === undefined || v === '') continue;
    out[key] = cast(v);
    for (const [mirror, mcast] of Object.entries(also || {})) {
      // المرآة لا تدهس قيمة صريحة قادمة من الشيت نفسه.
      if (raw?.[mirror] === undefined || raw?.[mirror] === '') out[mirror] = mcast(v);
    }
  }
  return out;
}
