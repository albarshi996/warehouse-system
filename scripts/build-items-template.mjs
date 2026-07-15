/**
 * يولّد القالب القياسي لشيت الأصناف — **من المخطّط نفسه**.
 *
 * لماذا من المخطّط؟ لئلا ينحرف الملف الذي تملؤه عن الأعمدة التي يقرأها النظام.
 * كل قالب كُتبت أعمدته يدويًّا في هذا المشروع انتهى إلى الانحراف (قالب شاشة
 * الجرد كان يحمل «الباركود» بينما المخطّط «الرسمي» لا يعرف الباركود إطلاقًا).
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
  nameAr: 'إلزامي. اسم الصنف كما يظهر في المستندات المطبوعة.',
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
};

const ds = DATASETS.items;
const cols = ds.templateFields.map((f) => ds.columns.find((c) => c.field === f));

/** صفّ توضيحي واقعي — بأرقام من كتالوج مواد التجميل. */
const EXAMPLE = {
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
};

const header = cols.map((c) => c.labelAr);
const example = cols.map((c) => EXAMPLE[c.field] ?? '');
const sheet = XLSX.utils.aoa_to_sheet([header, example]);
sheet['!cols'] = cols.map((c) => ({ wch: c.field === 'nameAr' ? 34 : 18 }));

// الباركود نصّ لا رقم — وإلا حوّله إكسيل إلى 8.05969E+12 وأفسده.
for (const idx of [cols.findIndex((c) => c.field === 'barcode'), cols.findIndex((c) => c.field === 'barcodeAlt')]) {
  if (idx < 0) continue;
  const addr = XLSX.utils.encode_cell({ r: 1, c: idx });
  if (sheet[addr]) {
    sheet[addr].t = 's';
    sheet[addr].v = String(sheet[addr].v);
    sheet[addr].z = '@';
  }
}

/** ورقة تعليمات — القواعد التي تمنع أشيع أخطاء الاستيراد. */
const guide = XLSX.utils.aoa_to_sheet([
  ['قالب أصناف برند زو — تعليمات التعبئة'],
  [],
  ['العمود', 'إلزامي؟', 'الشرح'],
  ...cols.map((c) => [
    c.labelAr,
    c.required ? 'نعم' : 'لا',
    GUIDE[c.field] || '',
  ]),
  [],
  ['قواعد عامة:'],
  ['١', 'لا تحذف صفّ العناوين ولا تغيّر أسماء الأعمدة — النظام يتعرّف عليها.'],
  ['٢', 'الصفّ الذي لا يحمل كودًا ولا باركودًا يُرفض: لا سبيل للتعرّف عليه.'],
  ['٣', 'الصنف ذو الباركودات المتعدّدة: كرّر صفّه، أو افصل الباركودات بفاصلة في الخانة نفسها.'],
  ['٤', 'اجعل خانات الباركود **نصًّا** (Format → Text) قبل اللصق، وإلا حوّلها إكسيل إلى 8.05969E+12 وأفسدها.'],
  ['٥', 'إعادة الرفع تُحدّث ولا تُكرّر، والباركودات تُضمّ ولا تُمحى. والأعمدة الغائبة لا تُفرِّغ بيانات قائمة.'],
  ['٦', 'الاستيراد يعرض لك معاينة بما سيتغيّر قبل الحفظ — راجعها.'],
]);
guide['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 78 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, 'Items');
XLSX.utils.book_append_sheet(wb, guide, 'تعليمات');

mkdirSync(new URL('../public/templates/', import.meta.url), { recursive: true });
const out = new URL('../public/templates/Brandzo-Items-Template.xlsx', import.meta.url);
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.info(`✅ ${cols.length} عمودًا → public/templates/Brandzo-Items-Template.xlsx`);
