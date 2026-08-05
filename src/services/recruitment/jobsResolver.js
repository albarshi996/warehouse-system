/**
 * مصدر الأدوار للتوظيف — **الحيّ أوّلًا، ثمّ الكتالوج المولَّد fallback**.
 *
 * القرار (ق‑٣): تُحرَّر الأدوار من صفحة الهيكل سحابيًّا (`org_structure/current`)،
 * فيجب أن يقرأها التوظيف حيّةً كي ينعكس أي تعديلٍ فورًا. وعند غياب النسخة
 * السحابية (أوّل تشغيل · دون اتصال) نسقط للكتالوج `jobsCatalog.js` المولَّد من
 * نفس المصدر — فلا شاشة فارغة ولا ازدواج مصدر.
 *
 * دوالٌّ خالصة (بلا Firestore) كي تُختبَر في Node وتُستدعى بأمان من الواجهة.
 */
import { JOBS } from './jobsCatalog.js';

/** يوحّد بطاقة وظيفة من org_structure لشكل الكتالوج (الحقول التي تستهلكها الواجهة). */
function normalize(j) {
  return {
    ...j,
    id: j.id,
    orgId: j.orgId || '',
    title: j.title || '',
    icon: j.icon || '',
    layer: j.layer || '',
    duties: Array.isArray(j.duties) ? j.duties : [],
    reportingTo: j.reportingTo || '',
    kpis: j.kpis || '',
    occupied: Boolean(j.occupied),
    holder: j.holder || '',
    requirements: j.requirements || null,
  };
}

/**
 * الأدوار الحيّة من وثيقة `org_structure/current`، وإلّا الكتالوج المولَّد.
 * @param {object|null} orgDoc  الوثيقة السحابية (أو null إن لم تُنشأ بعد)
 */
export function resolveJobs(orgDoc) {
  const live = orgDoc?.jobs;
  return Array.isArray(live) && live.length ? live.map(normalize) : JOBS;
}

/** الوظيفة بمعرّفها من قائمة الأدوار المعطاة، أو null. */
export function findJob(jobs, id) {
  return (jobs || []).find((j) => j.id === id) || null;
}

/** الشاغرة أوّلًا — لقائمة الاختيار في نموذج المرشح (لا يُعدّل المدخل). */
export function sortedJobOptions(jobs) {
  return [...(jobs || [])].sort((a, b) => Number(a.occupied) - Number(b.occupied));
}
