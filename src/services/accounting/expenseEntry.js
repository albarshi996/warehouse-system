/**
 * الإدخالُ السريع للمصروف بالفاتورة — **المنطقُ الخالص** (‹EXP-INV› · طلب المالك
 * 2026-11-09): «نظامُ تسجيل مصروفات وفق رقم الفاتورة سهلٌ ويطبع تقريرًا».
 *
 * ★ هذا الملفُّ خالصٌ (بلا Firestore ولا DOM) فيُختبر وحده — والأثرُ الحيّ (إنشاء
 *   المستند وترحيلُه) في `expenseEntryService.js` الذي يستورد بابَ المستندات. نفسُ
 *   فصلِ `cashCustody.js` (خالص) عن `cashCustodyService.js` (قاعدة).
 *
 * ═══ من يملك التسجيلَ بخطوةٍ واحدة؟ ═══
 * من يُتمّ النقلات الثلاث كاملةً (إنشاء + اعتماد + إنجاز) بتقاطع أدوار مخطّط EXP:
 * **المدير العامّ · المدير الماليّ · مدير المستودعات**. الخزينةُ تُنشئ ولا تعتمد،
 * فلا تُتمّ الخطوةَ الواحدة — ولها المستنداتُ بمسارها الكامل.
 */
import { categoryLabel } from './expenseCategories.js';

/** طرائقُ الصرف المقبولة (تطابق مخطّط EXP). */
export const EXPENSE_METHODS = Object.freeze(['نقدًا', 'تحويل مصرفي']);

/** الأدوارُ التي تُتمّ التسجيلَ بخطوةٍ واحدة (تقاطعُ إنشاء+اعتماد+إنجاز EXP). */
export const EXPENSE_RECORD_ROLES = Object.freeze(['admin', 'finance_manager', 'warehouse_manager']);

/** هل يملك هذا الدورُ تسجيلَ مصروفٍ بخطوةٍ واحدة؟ (حارسُ واجهةٍ وخدمة). */
export function canRecordExpense(role) {
  return EXPENSE_RECORD_ROLES.includes(role);
}

const str = (v) => String(v ?? '').trim();

/**
 * عللُ الإدخال — قائمةُ مشكلاتٍ فارغةٌ إن صحّ. رقمُ الفاتورة إلزاميٌّ هنا (النظامُ
 * «وفق رقم الفاتورة») وإن كان اختياريًّا في المخطّط للمستندات القديمة.
 */
export function expenseEntryProblems(input = {}) {
  const out = [];
  if (!str(input.invoiceNo)) out.push('رقمُ الفاتورة إلزاميٌّ — اكتب رقمَ الفاتورة أو السند.');
  // الفئةُ تأتي من قائمةٍ ثابتة (select) فيكفي ألّا تكون فارغة؛ والمجهولُ يُبوَّب
  // «أخرى» بـ`normalizeCategory` عند الصياغة والقيد (قصدًا — فلا يضيع قيد).
  if (!str(input.category)) out.push('الفئةُ غيرُ مختارة — اختَر فئةَ المصروف.');
  if (!(Number(input.amount) > 0)) out.push('قيمةُ المصروف يجب أن تكون أكبر من صفر.');
  if (!EXPENSE_METHODS.includes(str(input.paymentMethod))) out.push('اختَر طريقةَ الصرف (نقدًا أو تحويل مصرفيّ).');
  if (!str(input.expenseDate)) out.push('تاريخُ المصروف إلزاميّ.');
  return out;
}

/**
 * يصوغ رأسَ مستند EXP من مدخلات النموذج — الفئةُ تُخزَّن باسمها العربيّ (كما يكتب
 * المخطّطُ والمسارُ اليدويّ؛ و`normalizeCategory` يردّها إلى مفتاحها عند القيد).
 * لا يختم المحلّ: `createDraft` يسمه بالمحلّ الفعّال، فلا وسمٌ مزدوجٌ ينحرف.
 */
export function shapeExpenseHeader(input = {}) {
  return {
    expenseDate: str(input.expenseDate),
    invoiceNo: str(input.invoiceNo),
    category: categoryLabel(input.category),
    beneficiary: str(input.beneficiary),
    paymentMethod: str(input.paymentMethod),
    amount: Number(input.amount) || 0,
    note: str(input.note),
  };
}
