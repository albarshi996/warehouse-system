/**
 * تشكيل حقول شريك الأعمال (مورّد/عميل) القادمة من الاستيراد — منطق خالص بلا
 * Firebase. توأم `itemShape.js`، لكنه يشتقّ الحقول من مخطّط الشيت نفسه
 * (`DATASETS.suppliers.columns`) فلا مصدرَ ثانٍ ينحرف عنه.
 *
 * الحقول الثلاثة `code`/`nameAr`/`status` تُعالَج صراحةً في `partnerService`
 * (الأوّلان هوية واسم، والثالث يُترجَم إلى `archived`)، فلا يشكّلها هذا الملف.
 */
import { DATASETS } from '../excel/excelSchema.js';

const str = (v) => String(v).trim();
const num = (v) => Number(v) || 0;

/** الحقول المُعالَجة صراحةً في الخدمة — لا يشكّلها هذا الملف. */
const HANDLED_ELSEWHERE = new Set(['code', 'nameAr', 'status']);

/** أعمدة الشريك القابلة للتشكيل (الموردون والعملاء توأمان فتكفي واحدة). */
const SHAPE_COLUMNS = DATASETS.suppliers.columns.filter((c) => !HANDLED_ELSEWHERE.has(c.field));

/** الحقول التي يشكّلها هذا الملف — للاختبار وللوضوح. */
export const SHAPED_PARTNER_FIELDS = SHAPE_COLUMNS.map((c) => c.field);

/**
 * يبني حقول الكتابة الاختيارية من صفّ مستورد.
 * الحقل الغائب أو الفارغ لا يُكتب — فلا يمحو عمودٌ ناقص بياناتٍ قائمة.
 * الأرقام تُقسَر رقمًا، والنصوص تُشذَّب.
 */
export function shapeImportedPartner(raw) {
  const out = {};
  for (const col of SHAPE_COLUMNS) {
    const v = raw?.[col.field];
    if (v === undefined || v === '') continue;
    out[col.field] = col.type === 'number' ? num(v) : str(v);
  }
  return out;
}
