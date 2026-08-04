/**
 * طبقة الرقابة والمطابقة — «أداة المقارنة» المدمجة (قرار المالك 2026-08-04).
 *
 * المطلب المتكرّر في «تحسينات جراحية» (الوارد · الفوترة · النقل · المرتجعات ·
 * التالف): «نفس المنطق التنفيذي في عملية الرقابة» — أي أن يُقارَن **المستند
 * الصادر من النظام** بـ**النسخة الماديّة الموقّعة** المرفقة، ويُوثَّق أن المعنيّ
 * وقّع فعلًا. الفوترة خاصّةً تصير أبرز مكانٍ لهذه الأداة (طلب المالك الصريح).
 *
 * البنية: قيود مطابقة **ملحق-فقط** في `documents/{id}/control` (كالمرفقات
 * والتدقيق). أحدث قيدٍ هو الحالة الحاليّة؛ والتاريخ كلّه يبقى — من طابق ومتى
 * وبأيّ نتيجة. هذا الملف منطقٌ خالص (بلا شبكة) يُختبَر وحده.
 */
import { allFields, fieldValue } from './schemaUtils.js';

/** أحدث قيد مطابقة (القيود مرتّبة تصاعديًّا زمنيًّا)، أو null. */
export function latestReconciliation(records) {
  const list = records || [];
  return list.length ? list[list.length - 1] : null;
}

/**
 * حكم المطابقة: هل يُحقِّق المستند؟ آخر قيدٍ نتيجته `matched` = مُحقَّق.
 * قيد `mismatch` لاحق يُبطل تحقيقًا سابقًا (الأحدث يحكم).
 */
export function reconciliationVerdict(records) {
  const last = latestReconciliation(records);
  if (!last) return { verified: false, result: null };
  return {
    verified: last.result === 'matched',
    result: last.result || null,
    by: last.byName || '',
    at: last.at || null,
    note: last.note || '',
  };
}

/** هل أُرفقت نسخةٌ موقّعة (نسخة المستند أو توقيع)؟ */
export function hasSignedCopy(attachments) {
  return (attachments || []).some((a) => a?.kind === 'signedCopy' || a?.kind === 'signature');
}

/** هل أُرفقت صورةٌ ما (لمحضر التالف مثلًا)؟ */
export function hasPhoto(attachments) {
  return (attachments || []).some((a) => String(a?.mime || '').startsWith('image/'));
}

/** بنود قائمة المطابقة من المخطّط (فارغة = لا رقابة على هذا النوع). */
export function controlChecklist(schema) {
  return schema?.control?.checklist || [];
}

/** هل النوع خاضعٌ لطبقة الرقابة أصلًا؟ */
export function hasControl(schema) {
  return Boolean(schema?.control);
}

/**
 * صفوف المقارنة: قيم المستند الصادر التي يُطابِقها المدقّق بالنسخة الموقّعة.
 * تُقرأ من `schema.control.compareFields` (مفاتيح حقول، محسوبةً كانت أو مكتوبة).
 */
export function controlCompareRows(schema, doc) {
  const byKey = new Map(allFields(schema).map((f) => [f.key, f]));
  return (schema?.control?.compareFields || [])
    .map((k) => {
      const f = byKey.get(k);
      if (!f) return null;
      const value = fieldValue(f, doc);
      return { key: k, label: f.label, value: value === '' || value == null ? '—' : String(value) };
    })
    .filter(Boolean);
}

/** كل بنود قائمة المطابقة مؤشَّرة؟ (شرطُ تسجيل نتيجة «مطابق»). */
export function allChecked(schema, state) {
  const items = controlChecklist(schema);
  if (!items.length) return true;
  return items.every((i) => Boolean(state?.[i.key]));
}

/**
 * تحذيرات الرقابة (تنبّه ولا تمنع — كبقيّة تحذيرات المحرّك): لا نسخة موقّعة ·
 * لا صور حيث تلزم · لم يُطابَق بعد · آخر مطابقة سجّلت اختلافًا.
 */
export function controlWarnings(schema, doc, { attachments = [], records = [] } = {}) {
  const control = schema?.control;
  if (!control) return [];
  const out = [];
  if (control.requireSignedCopy && !hasSignedCopy(attachments)) {
    out.push('لم تُرفق نسخة موقّعة للمطابقة — الرقابة بلا دليل ماديّ');
  }
  if (control.requirePhotos && !hasPhoto(attachments)) {
    out.push('لا صور مرفقة — محضرٌ بلا دليل مصوَّر');
  }
  const v = reconciliationVerdict(records);
  if (!v.result) out.push('لم يُطابَق المستند بالنسخة الموقّعة بعد');
  else if (v.result === 'mismatch') out.push('آخر مطابقة سجّلت اختلافًا عن النسخة الموقّعة — يلزم المراجعة');
  return out;
}
