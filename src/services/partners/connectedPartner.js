/**
 * الربط المتبادل بين بطاقتَي المورد والعميل للكيان الواحد
 * (SAP-2 · يسدّ ف‑٧ · SR-46 ‹2964-2989› · §21-٥ ‹980›).
 *
 * الكيان الواحد قد يكون مورّدًا وعميلًا معًا — والفصل بين البطاقتين محقَّقٌ
 * أصلًا (مجموعتان). المطلوب بنصّ المرجع: «حقلٌ واحد اختياريّ في كلٍّ من
 * البطاقتين يشير إلى الآخر»، مع بقاء مستندات الشراء على بطاقة المورد
 * ومستندات البيع على بطاقة العميل — الربط للتقارير لا لخلط الدورين.
 *
 * هذه الوحدة تُخرج **خطّة كتاباتٍ** لا كتابات: من يربط بطاقةً ببطاقة يجب
 * أن تُكتب المرآتان معًا، ومن يفكّ الربط يجب أن يُمحى الطرفان معًا — وإلا
 * بقيت بطاقةٌ تشير إلى من لا يشير إليها.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

/** الحقل الواحد في البطاقتين: في المورد رمزُ العميل، وفي العميل رمزُ المورد. */
export const CONNECTED_FIELD = 'connectedPartnerCode';

const OTHER_KIND = Object.freeze({ supplier: 'customer', customer: 'supplier' });

const norm = (v) => String(v ?? '').trim().toUpperCase();

/**
 * خطّة الربط/الفكّ المتبادل.
 *
 * @param {'supplier'|'customer'} kind بطاقة صاحب التعديل
 * @param {string} code رمزه
 * @param {string} prevOther الرمز المرتبط سابقًا (فارغ إن لم يكن)
 * @param {string} nextOther الرمز المرتبط الجديد (فارغ للفكّ)
 * @returns {{writes: Array<{kind:string, code:string, value:string}>}}
 *   كلّ كتابة: ضع `CONNECTED_FIELD = value` على بطاقة (kind، code).
 */
export function connectedPartnerPlan(kind, code, prevOther, nextOther) {
  const other = OTHER_KIND[kind];
  if (!other) throw new Error(`نوع شريك غير معروف: «${kind}»`);
  const self = norm(code);
  if (!self) throw new Error('رمز البطاقة مطلوب لخطّة الربط');

  const prev = norm(prevOther);
  const next = norm(nextOther);
  const writes = [];
  if (prev === next) return { writes }; // لا تغيير — لا كتابة.

  // بطاقة صاحب التعديل تأخذ القيمة الجديدة (أو تُمحى عند الفكّ).
  writes.push({ kind, code: self, value: next });
  // المرآة الجديدة تشير إليه.
  if (next) writes.push({ kind: other, code: next, value: self });
  // المرآة القديمة تُمحى — فلا تبقى بطاقةٌ تشير لمن هجرها.
  if (prev) writes.push({ kind: other, code: prev, value: '' });

  return { writes };
}
