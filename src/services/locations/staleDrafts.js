/**
 * ‹ODOO-ORD› مسوّداتُ استيراد أودو القديمة — منطقٌ خالص.
 *
 * قبل المسار المُرحِّل (‹SRC-POST›) استوردت البوّابةُ مستندات أودو **مسوّداتِ تخزينٍ وسحب** (PUTAWAY/PICK):
 * 15 استلامًا و84 تسليمًا و7 نقل حتّى 19 أكتوبر. ثمّ اختار المالكُ (الخيار أ) لقطةَ 19 أكتوبر رصيدًا افتتاحيًّا،
 * **فأثرُ هذه المسوّدات داخلٌ فيه** — وإنجازُ أيٍّ منها يضاعفه. فتُلغى بسببٍ مكتوبٍ بمسار الإلغاء الجماعيّ
 * (`runBulk` ⟵ `transitionDocument`، وقيدُ تدقيقٍ على كلّ مستند)، ولا تُحذف.
 *
 * ★★ القاعدةُ ضيّقةٌ عمدًا — النوعُ والحالةُ والمصدرُ ومرجعُه والتاريخُ قبل الافتتاح: فأمرُ تخزينٍ أو سحبٍ أنشأه
 *    عاملٌ في البوّابة، أو استُورد من أودو بعد الافتتاح، لا يُمسّ.
 */
import { OPENING_CUTOFF } from './postedImport.js';

export const STALE_DRAFT_TYPES = Object.freeze(['PUTAWAY', 'PICK']);

/** سقفُ القراءة الواحدة — والبلوغُ يُعلَن فيُعاد البحثُ بعد الإلغاء لما بقي. */
export const STALE_SCAN_LIMIT = 1000;

export const STALE_CANCEL_NOTE = 'أثرُه داخلٌ في الرصيد الافتتاحيّ (لقطة 19 أكتوبر) — إنجازُه يضاعفه. أُلغي بقرار المالك.';

/** تاريخُ المستند في أودو: التخزينُ بتاريخ الاستلام، والسحبُ بتاريخ التسليم. */
export function sourceDayOf(doc) {
  const h = doc?.header || {};
  return String(h.putawayDate || h.orderDate || '').trim().slice(0, 10);
}

/** مسودّةُ تخزينٍ أو سحبٍ من أودو، تاريخُها قبل الافتتاح — أثرُها في اللقطة. */
export function isStaleOdooDraft(doc, { cutoff = OPENING_CUTOFF } = {}) {
  const h = doc?.header || {};
  const day = sourceDayOf(doc);
  return STALE_DRAFT_TYPES.includes(doc?.type)
    && doc?.state === 'draft'
    && String(h.sourceSystem || '').trim().toLowerCase() === 'odoo'
    && Boolean(String(h.sourceRef || '').trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && day < cutoff;
}

/** العددُ كلُّه وبالنوع — لما يُعرض قبل الإلغاء. */
export function summarizeStale(docs) {
  const byType = Object.fromEntries(STALE_DRAFT_TYPES.map((t) => [t, 0]));
  for (const d of docs || []) byType[d.type] = (byType[d.type] || 0) + 1;
  return { total: (docs || []).length, byType };
}
