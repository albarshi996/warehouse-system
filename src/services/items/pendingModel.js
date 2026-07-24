/**
 * الأصناف المعلّقة (I-د) — منطق خالص، بلا Firestore وبلا DOM.
 *
 * المشكلة: الموظّف يمسح باركودًا لا يعرفه النظام، فيُنشئ صنفًا محليًّا في
 * `localStorage` باسم الباركود نفسه — ثم **يضيع مع الجلسة**. لا المدير يعلم
 * أن صنفًا مجهولًا مرّ، ولا الماستر يتعلّم منه شيئًا.
 *
 * قرار المالك (ROADMAP §12.2 · 2026-07-15): «الباركود المجهول يُسجَّل
 * **معلّقًا للمراجعة** — لا يوقف العمل ولا يلوّث الماستر». وهذا ما يفعله
 * هذا النموذج: طبقةٌ ثالثة بين «معروف» و«ضائع».
 *
 * الحياة: مشاهدة أولى → تتكرّر (يزيد العدّاد) → يراجعها المدير:
 *   يعتمدها فتدخل الماستر صنفًا حقيقيًّا · أو يرفضها بسببٍ فتبقى أثرًا.
 */
import { normalizeBarcode } from '../excel/excelSchema.js';

/** حالات الصنف المعلّق. */
export const PENDING_STATES = {
  pending: { id: 'pending', label: 'بانتظار المراجعة', emoji: '⏳', color: '#f59e0b' },
  approved: { id: 'approved', label: 'اعتُمد في الماستر', emoji: '✅', color: '#059669' },
  rejected: { id: 'rejected', label: 'مرفوض', emoji: '🚫', color: '#ef4444' },
};

/**
 * معرّف المستند: الباركود مطبَّعًا.
 * حتميّ عمدًا — مسح الباركود المجهول عشر مرّات يُحدّث سجلًّا واحدًا ويزيد
 * عدّاده، ولا يُخلّف عشرة سجلّات متطابقة تُغرق شاشة المراجعة.
 */
export function pendingId(barcode) {
  return normalizeBarcode(barcode);
}

/**
 * يبني سجلّ مشاهدة جديدة. يُستهلك في `registerPending` وفي الاختبار.
 * @param {object} input { barcode, name, operationType, warehouse, qty }
 * @param {object} who   { uid, name }
 */
export function newSighting(input, who = {}) {
  const barcode = pendingId(input?.barcode);
  if (!barcode) throw new Error('لا باركود — لا يُسجَّل معلّق بلا معرّف');
  return {
    barcode,
    rawBarcode: String(input?.barcode || '').trim(),
    name: String(input?.name || '').trim(),
    state: 'pending',
    seenCount: 1,
    lastQty: Number(input?.qty) || 0,
    operationType: String(input?.operationType || ''),
    warehouse: String(input?.warehouse || ''),
    firstSeenByUid: who.uid || null,
    firstSeenByName: who.name || 'غير معروف',
    lastSeenByName: who.name || 'غير معروف',
  };
}

/**
 * ما يُكتب عند تكرار المشاهدة — لا يمسّ حقول المشاهدة الأولى.
 * (اسم من رآه أولًا وتاريخه يبقيان: هما أثر التدقيق.)
 */
export function repeatPatch(input, who = {}) {
  const patch = {
    lastQty: Number(input?.qty) || 0,
    lastSeenByName: who.name || 'غير معروف',
  };
  const name = String(input?.name || '').trim();
  // الاسم يُحدَّث فقط إن كتب الموظّف اسمًا حقيقيًّا (لا اسمًا = الباركود نفسه)
  if (name && name !== pendingId(input?.barcode)) patch.name = name;
  const op = String(input?.operationType || '').trim();
  if (op) patch.operationType = op;
  return patch;
}

/** هل يجوز البتّ في هذا السجلّ؟ (المبتوت لا يُعاد البتّ فيه) */
export function canDecide(record) {
  return record?.state === 'pending';
}

/**
 * حكم الاعتماد: لا يدخل الماستر صنفٌ بلا **كود** و**اسم عربي**.
 * الباركود وحده لا يكفي — صنفٌ اسمُه رقمُه يُفسد كل تقرير بعده.
 */
export function approvalVerdict(record, draft) {
  const problems = [];
  if (!canDecide(record)) problems.push('هذا السجلّ بُتّ فيه من قبل');
  if (!String(draft?.sku || '').trim()) problems.push('كود الصنف (SKU) مطلوب — هو معرّفه في الماستر');
  if (!String(draft?.nameAr || '').trim()) problems.push('الاسم العربي مطلوب — لا صنف اسمُه رقمُه');
  return { ok: problems.length === 0, problems };
}

/**
 * يحوّل سجلًّا معلّقًا + مسودّة المدير إلى صنف ماستر جاهز للكتابة.
 * الباركود المعلّق يُضاف إلى `barcodes[]` فيصير الاستدعاء به ممكنًا فورًا.
 */
export function toMasterItem(record, draft) {
  const codes = new Set([record.barcode, ...(draft?.barcodes || []).map((c) => normalizeBarcode(c))]);
  return {
    sku: String(draft.sku).trim().toUpperCase(),
    nameAr: String(draft.nameAr).trim(),
    nameEn: String(draft?.nameEn || '').trim(),
    category: String(draft?.category || '').trim(),
    unit: String(draft?.unit || 'piece').trim(),
    unitPrice: Number(draft?.unitPrice) || 0,
    barcodes: [...codes].filter(Boolean),
  };
}

/** حكم الرفض: بلا سبب لا يُوثَّق (نفس قاعدة رفض المستندات). */
export function rejectionVerdict(record, reason) {
  const problems = [];
  if (!canDecide(record)) problems.push('هذا السجلّ بُتّ فيه من قبل');
  if (!String(reason || '').trim()) problems.push('اكتب سبب الرفض — الرفض بلا سبب لا يُوثَّق');
  return { ok: problems.length === 0, problems };
}

/** لقطة للوحة: كم معلّقًا وكم بُتّ فيه. */
export function pendingSummary(records) {
  const all = records || [];
  return {
    total: all.length,
    pending: all.filter((r) => r.state === 'pending').length,
    approved: all.filter((r) => r.state === 'approved').length,
    rejected: all.filter((r) => r.state === 'rejected').length,
    /** الأكثر تكرارًا أولًا — ما تكرّر عشرًا أولى بالمراجعة ممّا مرّ مرّة. */
    hottest: all
      .filter((r) => r.state === 'pending')
      .sort((a, b) => (b.seenCount || 0) - (a.seenCount || 0))
      .slice(0, 5),
  };
}
