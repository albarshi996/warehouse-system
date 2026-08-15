import { DECISION_STATES } from '../executiveReview/decisionSession.js';

/**
 * محضر قرارات اجتماع نوفا نصًّا — دالّة خالصة.
 *
 * لماذا خارج المكوّن؟ لأنّ زرّ «نسخ محضر القرارات» يُضغط مرّةً واحدة في نهاية
 * اجتماعٍ مع عميل: إن خرج النصّ ناقصًا فلا فرصة ثانية. والنسخ نفسه قد يمنعه
 * المتصفّح (سياق غير مركَّز أو بلا صلاحية)، فيُختبر التوليد هنا مستقلًّا عن
 * الحافظة — ويبقى فشل النسخ **معلنًا** في الواجهة لا صامتًا.
 *
 * البند غير المحسوم يبقى في المحضر بحالته «لم يُحسم»: المحضر يوثّق ما لم
 * يُقرَّر أيضًا، وهو نصّ الخطة (البنود المفتوحة شرط بدء).
 */
export function buildDecisionMinutes({ heading, points = [], session }) {
  const decisions = session?.decisions ?? [];
  // حالةٌ مجهولة = «لم يُحسم» — في السطر وفي العدّ معًا. لو اختلف العدّ عن
  // السطر لأعلن المحضر حسمًا لا أثر له في بنوده.
  const statusAt = (index) => {
    const value = decisions[index]?.status;
    return Object.hasOwn(DECISION_STATES, value) ? value : 'pending';
  };

  const lines = points.map((point, index) => {
    const result = decisions[index] ?? {};
    const parts = [`${index + 1}. ${point.title} — ${DECISION_STATES[statusAt(index)]}`];
    if (result.owner?.trim()) parts.push(`المسؤول: ${result.owner.trim()}`);
    if (result.due?.trim()) parts.push(`الموعد: ${result.due.trim()}`);
    if (result.note?.trim()) parts.push(`ملاحظة: ${result.note.trim()}`);
    return parts.join(' · ');
  });

  const resolved = points.filter((_, index) => statusAt(index) !== 'pending').length;
  const footer = `المحسوم: ${resolved} من ${points.length}`;

  return [heading, '', ...lines, '', footer].join('\n');
}
