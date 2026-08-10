/**
 * حارس نزاهة التاريخ (م٢-ب · يسدّ ف‑٨).
 *
 * ═══ العطب ═══
 * `createdAt` محميّ بختم الخادم، لكنّ تواريخ الرأس مفتوحة **والمؤشّرات تقرأ
 * منها**. فمن يؤخّر «تاريخ الاستلام الفعليّ» يومين يُحسّن تقييم المورّد بلا
 * أثرٍ ظاهر. الرقم بلا مرجعٍ لا يُعرض — وتاريخٌ بلا حارسٍ رقمٌ بلا مرجع.
 *
 * ═══ ثلاث طبقات ═══
 * ① هذا الملفّ (منطق خالص) — القرار: أيمرّ التاريخ أم يحتاج اعتمادًا أم يُرفض؟
 * ② `documentsService` — يمنع الحفظ ويكتب الوسم.
 * ③ `firestore.rules` — **الحكم**: يقارن بـ`request.time` (ساعة الخادم لا
 *    ساعة الجهاز). فمن قدّم ساعة حاسوبه لم يُقدّم شيئًا.
 *
 * ═══ لا يعرف اسم حقلٍ واحد ═══
 * الأصناف من `timeFields.js` (م٢-أ) والسياسة من `settingsModel.js` (م١-ج).
 * فتغيير المدى من ٧ أيّام إلى ١٤ قرارٌ من الشاشة لا نشرةُ إصدار، وإضافةُ حقلٍ
 * زمنيٍّ جديد تمرّ من حارس التصنيف قبل أن تصل إلى هنا.
 *
 * ═══ ما لا يُحرَس ═══
 * السمة (صلاحيّة الدفعة) والمخطّط (موعد السداد) والمنقول — كلّها تقبل
 * المستقبل. حراستها تعني رفض بضاعةٍ صالحة.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { classOf, TIME_CLASSES, timeFieldsOf } from './timeFields.js';
import { backdateVerdict, normalizeSettings } from '../settings/settingsModel.js';

/** يحوّل أيّ قيمة زمنيّة (`date` أو `datetime-local`) إلى `YYYY-MM-DD`. */
export function dayOf(value) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, 10) : '';
}

/**
 * حكمٌ على حقلٍ واحد.
 * @returns {{field:string, cls:string, verdict:'ok'|'future'|'needsApproval', daysBack:number, message:string}}
 */
export function fieldVerdict(docType, fieldKey, value, { settings, today }) {
  const cls = classOf(docType, fieldKey);
  const base = { field: fieldKey, cls, daysBack: 0, message: '' };
  // ما ليس ختمَ واقعةٍ لا يُحرَس — والفارغ لا يُحاكَم.
  if (cls !== 'event' || !dayOf(value)) return { ...base, verdict: 'ok' };
  const v = backdateVerdict(settings, dayOf(value), dayOf(today));
  return { ...base, verdict: v.verdict, daysBack: v.daysBack, message: v.message };
}

/**
 * حكمٌ على رأس المستند كلّه.
 *
 * @param {object} args
 * @param {string} args.docType نوع المستند
 * @param {object} args.header رأس المستند
 * @param {object} args.schema مخطّط المستند (لتسميات الحقول في الرسائل)
 * @param {object} args.settings سياسات التشغيل
 * @param {string} args.today اليوم بختم الخادم `YYYY-MM-DD`
 * @param {string} args.role دور الفاعل
 * @returns {{ok:boolean, blocked:object[], needsApproval:object[], approver:string, requireReason:boolean, fields:object[]}}
 */
export function evaluateHeaderDates({ docType, header = {}, schema = null, settings, today, role = '' }) {
  const s = normalizeSettings(settings);
  const labels = new Map((schema ? timeFieldsOf(schema) : []).map((f) => [f.key, f.label]));
  const fields = Object.keys(header)
    .filter((k) => classOf(docType, k) === 'event')
    .map((k) => {
      const v = fieldVerdict(docType, k, header[k], { settings, today });
      return { ...v, label: labels.get(k) || k };
    });

  const blocked = fields.filter((f) => f.verdict === 'future');
  const needsApproval = fields.filter((f) => f.verdict === 'needsApproval');
  // الأدمن وصاحب دور الاعتماد يعتمدان بأنفسهما — ولا يُلغى السبب المكتوب.
  const canApprove = role === 'admin' || role === s.dating.approveRole;

  return {
    ok: blocked.length === 0 && needsApproval.length === 0,
    blocked,
    needsApproval,
    canApprove,
    approver: s.dating.approveRole,
    requireReason: s.dating.requireReason,
    backdateDays: s.dating.backdateDays,
    fields,
  };
}

/**
 * هل يُقبل الحفظ؟ يجمع الحكم مع ما قدّمه المستخدم من سببٍ واعتماد.
 *
 * @param {object} args نفس مدخلات `evaluateHeaderDates` + `reason`
 * @returns {{ok:boolean, reason:string, problems:string[], tag:object|null}}
 */
export function dateSaveVerdict({ reason = '', ...args }) {
  const ev = evaluateHeaderDates(args);
  const problems = [];

  for (const f of ev.blocked) {
    problems.push(`${f.label}: لا واقعة في المستقبل — التاريخ بعد اليوم يُرفض.`);
  }

  if (ev.needsApproval.length) {
    const names = ev.needsApproval.map((f) => f.label).join('، ');
    if (!ev.canApprove) {
      problems.push(
        `${names}: تأريخٌ لما قبل ${ev.backdateDays} يومًا — يعتمده ${ev.approver} وحده.`
      );
    }
    if (ev.requireReason && !String(reason).trim()) {
      problems.push(`${names}: سببٌ مكتوبٌ إلزاميّ مع التأريخ للماضي.`);
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    tag: problems.length === 0 ? backdateTag(ev, reason) : null,
  };
}

/**
 * الوسم الدائم — يرافق المستند في كلّ تقريرٍ يتضمّنه.
 * `null` حين لا تأريخ للماضي، فلا يُوسَم البريء.
 *
 * لا يحمل الوسم اسم المعتمِد ولا وقته: يكتبهما `documentsService` من الهويّة
 * وختم الخادم — فمن يُمرّر الاسم بيده يُمرّر ما شاء.
 */
export function backdateTag(evaluation, reason = '') {
  if (!evaluation?.needsApproval?.length) return null;
  const worst = evaluation.needsApproval.reduce((a, b) => (b.daysBack > a.daysBack ? b : a));
  return {
    backdated: true,
    fields: evaluation.needsApproval.map((f) => f.field),
    daysBack: worst.daysBack,
    reason: String(reason).trim(),
  };
}

/**
 * الحقول التي تُملأ بختم الخادم عند الإنشاء ولا تُحرَّر بعده.
 * تُستعمل في الواجهة (تعطيل الحقل) وفي الخدمة (الملء الافتراضيّ).
 */
export function eventFieldsOf(docType, schema) {
  return (schema ? timeFieldsOf(schema) : [])
    .filter((f) => classOf(docType, f.key) === 'event')
    .map((f) => f.key);
}

/**
 * هل يُقفل هذا الحقل في الواجهة؟
 * يُقفل ختم الواقعة **بعد** ثبوته: المسوّدة الجديدة تُملأ بتاريخ اليوم، ومن
 * أراد تاريخًا سابقًا يمرّ بمسار السبب والاعتماد لا بالكتابة الحرّة.
 */
export function isFieldLocked(docType, fieldKey) {
  const cls = classOf(docType, fieldKey);
  return Boolean(cls && TIME_CLASSES[cls] && !TIME_CLASSES[cls].editable);
}

/** القيمة الافتراضيّة لحقلٍ زمنيّ عند إنشاء مسوّدة — اليوم لختم الواقعة، وفراغ لغيره. */
export function defaultValueFor(docType, fieldKey, today) {
  return classOf(docType, fieldKey) === 'event' ? dayOf(today) : '';
}
