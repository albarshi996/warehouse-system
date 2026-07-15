/**
 * يولّد القالب القياسي لبيانات الأصناف — **من المخطّط نفسه**.
 *
 * لماذا من المخطّط؟ لئلا ينحرف الملف الذي تملؤه عن الأعمدة التي يقرأها النظام.
 * كل قالب كُتبت أعمدته يدويًّا في هذا المشروع انتهى إلى الانحراف (قالب شاشة
 * الجرد كان يحمل «الباركود» بينما المخطّط «الرسمي» لا يعرف الباركود إطلاقًا).
 *
 * البنية (قرار المالك 2026-07-15): **ملف واحد · ورقتان**
 *   Items    ← تعريف الصنف (يتغيّر نادرًا)
 *   Balances ← الأرصدة لكل مخزن وتشغيلة (تتغيّر يوميًّا)
 * تُرفع أيّهما وحدها دون أن تمسّ الأخرى — فلا يدهس تصحيحُ اسمٍ رصيدًا.
 *
 * التشغيل: node scripts/build-items-template.mjs
 * المُخرَج: public/templates/Brandzo-Items-Template.xlsx
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { DATASETS } from '../src/services/excel/excelSchema.js';

/** شرح كل عمود في ورقة التعليمات. */
const GUIDE = {
  sku: 'اتركه فارغًا الآن — حاوية محجوزة تُملأ من أودو يوم الربط. هوية الصنف لا تعتمد عليه، فلا ينكسر شيء حين يصل.',
  nameAr: 'إلزامي في ورقة Items. اسم الصنف كما يظهر في المستندات المطبوعة.',
  barcode: 'الباركود الرئيسي. اتركه فارغًا فقط إن كان الكود موجودًا.',
  barcodeAlt: 'باركود إضافي لنفس الصنف (عبوة أخرى أو مورّد آخر) — يُضمّ مع الأول لا يستبدله.',
  costPrice: 'سعر الشراء (التكلفة). بالدينار الليبي.',
  sellPrice: 'سعر البيع. لا تخلطه بسعر الشراء.',
  uomGroupCode: 'كود مجموعة الوحدة (مثل PCS).',
  uomGroupName: 'اسم مجموعة الوحدة (قطعة · كرتون · علبة …).',
  department: 'المستوى الأول من التصنيف.',
  section: 'المستوى الثاني.',
  family: 'المستوى الثالث.',
  subFamily: 'المستوى الرابع (الأدقّ).',
  supplier: 'اسم المورّد الرئيسي للصنف.',
  // ── الأرصدة ──
  warehouse: 'إلزامي في ورقة Balances. المخزن: E5 · E2 · E3. الصنف يتكرّر بعدد مخازنه.',
  location: 'الرفّ أو البوكس داخل المخزن (اختياري — لمن انضبط ترقيم أرففه).',
  batch: 'رقم التشغيلة. تشغيلتان لنفس الصنف = صفّان، لكلٍّ صلاحيته.',
  expiry: 'تاريخ الصلاحية (YYYY-MM-DD). ★ عليه يقوم حارس FEFO وتنبيه قرب الانتهاء.',
  qty: 'إلزامي. الكمية. **الصفر رقم مشروع** ويعني «نفد من هذا المخزن» — لا تحذف الصف.',
  countDate: 'تاريخ صحّة هذا الرصيد (يوم الجرد أو تصدير التقرير).',
};

/** صفّ توضيحي واقعي لكل ورقة. */
const EXAMPLES = {
  items: {
    sku: '',
    nameAr: 'مثال — احذف هذا الصف',
    barcode: '8059692040599',
    barcodeAlt: '8059692040605',
    costPrice: 12.5,
    sellPrice: 19.9,
    uomGroupCode: 'PCS',
    uomGroupName: 'قطعة',
    department: 'التجميل',
    section: 'العناية بالبشرة',
    family: 'ماكياج',
    subFamily: 'أساس',
    supplier: 'اسم المورّد',
  },
  balances: {
    barcode: '8059692040599',
    sku: '',
    nameAr: 'مثال — احذف هذا الصف',
    warehouse: 'E5',
    location: 'A-01-3',
    batch: 'LOT-2026-11',
    expiry: '2027-03-31',
    qty: 24,
    countDate: '2026-07-15',
  },
};

/** الأعمدة التي يجب أن تبقى نصًّا (وإلا أفسدها إكسيل). */
const TEXT_FIELDS = new Set(['barcode', 'barcodeAlt', 'sku', 'batch']);

/** يبني ورقة من مخطّط مجموعة بيانات. */
function buildSheet(datasetKey) {
  const ds = DATASETS[datasetKey];
  const cols = ds.templateFields.map((f) => ds.columns.find((c) => c.field === f));
  const example = EXAMPLES[datasetKey];

  const sheet = XLSX.utils.aoa_to_sheet([
    cols.map((c) => c.labelAr),
    cols.map((c) => example[c.field] ?? ''),
  ]);
  sheet['!cols'] = cols.map((c) => ({ wch: c.field === 'nameAr' ? 34 : 18 }));

  // الباركود نصّ لا رقم — وإلا حوّله إكسيل إلى 8.05969E+12 وأفسده صامتًا.
  cols.forEach((c, i) => {
    if (!TEXT_FIELDS.has(c.field)) return;
    const addr = XLSX.utils.encode_cell({ r: 1, c: i });
    if (!sheet[addr]) return;
    sheet[addr].t = 's';
    sheet[addr].v = String(sheet[addr].v);
    sheet[addr].z = '@';
  });

  return { sheet, cols };
}

const items = buildSheet('items');
const balances = buildSheet('balances');

/** ورقة تعليمات — القواعد التي تمنع أشيع أخطاء الاستيراد. */
const guide = XLSX.utils.aoa_to_sheet([
  ['قالب أصناف برند زو — تعليمات التعبئة'],
  [],
  ['الملف ورقتان: «Items» تعريف الأصناف (يتغيّر نادرًا) · «Balances» الأرصدة (تتغيّر يوميًّا).'],
  ['ارفع أيّهما وحدها — رفع التعريفات لا يمسّ الأرصدة أبدًا، والعكس.'],
  [],
  ['── ورقة Items ──', 'إلزامي؟', 'الشرح'],
  ...items.cols.map((c) => [c.labelAr, c.required ? 'نعم' : 'لا', GUIDE[c.field] || '']),
  [],
  ['── ورقة Balances ──', 'إلزامي؟', 'الشرح'],
  ...balances.cols.map((c) => [c.labelAr, c.required ? 'نعم' : 'لا', GUIDE[c.field] || '']),
  [],
  ['قواعد عامة:'],
  ['١', 'لا تحذف صفّ العناوين ولا تغيّر أسماء الأعمدة — النظام يتعرّف عليها.'],
  ['٢', 'صفٌّ بلا كود وبلا باركود يُرفض: لا سبيل للتعرّف عليه.'],
  ['٣', 'الصنف ذو الباركودات المتعدّدة: كرّر صفّه، أو افصل الباركودات بفاصلة في الخانة نفسها.'],
  ['٤', 'اجعل خانات الباركود **نصًّا** (Format → Text) قبل اللصق، وإلا حوّلها إكسيل إلى 8.05969E+12 وأفسدها.'],
  ['٥', 'في Balances: الصنف يتكرّر بعدد (المخزن × التشغيلة) — هذا مقصود لا خطأ.'],
  ['٦', 'إعادة الرفع تُحدّث ولا تُكرّر، والباركودات تُضمّ ولا تُمحى. والأعمدة الغائبة لا تُفرِّغ بيانات قائمة.'],
  ['٧', 'الاستيراد يعرض معاينة بما سيتغيّر قبل الحفظ — راجعها.'],
]);
guide['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 82 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, items.sheet, 'Items');
XLSX.utils.book_append_sheet(wb, balances.sheet, 'Balances');
XLSX.utils.book_append_sheet(wb, guide, 'تعليمات');

mkdirSync(new URL('../public/templates/', import.meta.url), { recursive: true });
const out = new URL('../public/templates/Brandzo-Items-Template.xlsx', import.meta.url);
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.info(`✅ Items: ${items.cols.length} عمودًا · Balances: ${balances.cols.length} عمودًا → public/templates/Brandzo-Items-Template.xlsx`);
