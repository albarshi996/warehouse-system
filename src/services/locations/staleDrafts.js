/**
 * ‹ODOO-ORD› تنظيفُ ما قبل الافتتاح — منطقٌ خالص.
 *
 * الرصيدُ الافتتاحيُّ لقطةُ 19 أكتوبر (الخيار أ)، وكلُّ ما قبلها في البوّابة إمّا مسجَّلٌ فيها أو تجربة:
 *
 * ١. **مسوّداتُ أودو القديمة** — قبل المسار المُرحِّل (‹SRC-POST›) استُوردت مستنداتُ أودو مسوّداتِ تخزينٍ وسحب
 *    (PUTAWAY/PICK): 15 استلامًا و84 تسليمًا و7 نقل. **أثرُها داخلٌ في الافتتاحيّ** — وإنجازُ أيٍّ منها يضاعفه.
 * ٢. **مستنداتُ البوّابة التجريبيّة المفتوحة** — قيس 2026-10-22: كلُّ مستندٍ أنشئ في البوّابة (240) أُنشئ بين يوليو
 *    و14 أكتوبر، ولا واحدَ بعد الافتتاح — فما بقي منها مفتوحًا (52) تجربةٌ لا عمل، يملأ الشاشات «معلّقًا منذ 88 يومًا».
 *
 * كلاهما يُلغى بسببٍ مكتوبٍ بمسار الإلغاء الجماعيّ (`runBulk` ⟵ `transitionDocument`، وقيدُ تدقيقٍ على كلّ مستند)،
 * **ولا يُحذف**. والمنجَزُ والمغلَقُ لا يُلغيان — يُخفيهما من الشاشات التشغيليّة حدُّ الافتتاح لا الإلغاء.
 *
 * ★★ القاعدةُ ضيّقةٌ عمدًا: أمرُ أودو المستورَد (OSO/OPO) سجلٌّ يبقى، وما أُنشئ في البوّابة بعد الافتتاح عملٌ حقيقيّ لا يُمسّ.
 */
import { OPENING_CUTOFF } from './postedImport.js';
import { libyaDayOfStamp } from '../documents/actualWork.js';

export const STALE_DRAFT_TYPES = Object.freeze(['PUTAWAY', 'PICK']);

/** الحالاتُ التي يقع عليها الإلغاء (جدولُ `bulkActions` لإجراء cancel) — والمنجَزُ لا يُلغى. */
export const CANCELABLE_STATES = Object.freeze(['draft', 'rejected', 'approved']);

/** سقفُ القراءة الواحدة — والبلوغُ يُعلَن فيُعاد البحثُ بعد الإلغاء لما بقي. */
export const STALE_SCAN_LIMIT = 1000;

export const STALE_CANCEL_NOTE = 'من بيانات ما قبل الافتتاح (لقطة 19 أكتوبر) — ليس عملًا فعليًّا، وإنجازُه يُفسد الرصيد. أُلغي بقرار المالك.';

export const STALE_GROUP_LABELS = Object.freeze({
  odooDraft: 'مسوّداتُ أودو القديمة',
  portalTrial: 'مستنداتُ البوّابة التجريبيّة',
});

const isOdoo = (doc) => String(doc?.header?.sourceSystem || '').trim().toLowerCase() === 'odoo';

/** تاريخُ المستند في أودو: التخزينُ بتاريخ الاستلام، والسحبُ بتاريخ التسليم. */
export function sourceDayOf(doc) {
  const h = doc?.header || {};
  return String(h.putawayDate || h.orderDate || '').trim().slice(0, 10);
}

/** يومُ الإنشاء بتوقيت ليبيا (UTC+2) — من طابع Firestore أو نصّ ISO أو رقم. والقاعدةُ في `actualWork.js`. */
export function createdDayOf(doc) {
  return libyaDayOfStamp(doc?.createdAt);
}

/** مسودّةُ تخزينٍ أو سحبٍ من أودو، تاريخُها قبل الافتتاح — أثرُها في اللقطة. */
export function isStaleOdooDraft(doc, { cutoff = OPENING_CUTOFF } = {}) {
  const day = sourceDayOf(doc);
  return STALE_DRAFT_TYPES.includes(doc?.type)
    && doc?.state === 'draft'
    && isOdoo(doc)
    && Boolean(String(doc?.header?.sourceRef || '').trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && day < cutoff;
}

/** مستندٌ أُنشئ في البوّابة قبل الافتتاح وما زال مفتوحًا — تجربةٌ لا عمل. */
export function isPreOpeningPortalDoc(doc, { cutoff = OPENING_CUTOFF } = {}) {
  const day = createdDayOf(doc);
  return !isOdoo(doc)
    && CANCELABLE_STATES.includes(doc?.state)
    && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && day < cutoff;
}

/** إلى أيّ مجموعةٍ ينتمي — أو `null` إن لم يكن ممّا يُنظَّف. */
export function staleGroupOf(doc, opts) {
  if (isStaleOdooDraft(doc, opts)) return 'odooDraft';
  if (isPreOpeningPortalDoc(doc, opts)) return 'portalTrial';
  return null;
}

/** العددُ كلُّه، وبالمجموعة، وبالنوع — لما يُعرض قبل الإلغاء. */
export function summarizeStale(docs) {
  const byGroup = { odooDraft: 0, portalTrial: 0 };
  const byType = {};
  for (const d of docs || []) {
    const g = staleGroupOf(d);
    if (g) byGroup[g] += 1;
    byType[d.type] = (byType[d.type] || 0) + 1;
  }
  return { total: (docs || []).length, byGroup, byType };
}
