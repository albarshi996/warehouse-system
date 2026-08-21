/**
 * سلسلة النزول من التنبيه إلى الإجراء ‹EXE-501› — منطق خالص.
 *
 * ═══ العطب ═══
 * التنبيه يعطي `href: '/dashboard/transfers'` — **صفحةً** فيها مئة سطر. فيقرأ
 * المشرف «٣ فروق نقلٍ غير مسوّاة»، ثمّ يفتح الصفحة، ثمّ يبحث عن أيّها، ثمّ
 * يبحث عن مهمّتها، ثمّ يبحث عن من ينفّذها. وأربع خطواتٍ بين المعرفة والفعل
 * تكفي ليُترك التنبيه.
 *
 * ═══ والسلسلة أربع حلقات ═══
 *   التنبيه ← **المستند** ← **المهمّة** ← **أثر المسح** ← **الإجراء**
 *
 * ★ والحلقة المفقودة **تُعلَن ولا تُختلق**: استثناءٌ بلا مهمّةٍ يقول «لا مهمّة
 * مولَّدة بعد» ويعرض ما يفعله بدلها. ورابطٌ يقود إلى صفحةٍ فارغة أسوأ من
 * غيابه — لأنّه يُنفق وقتًا ويُنهي بلا شيء.
 */

import { documentScreenUrl } from '../documents/documentNavigator.js';
import { exceptionType } from './exceptions.js';

const s = (v) => String(v ?? '').trim();

/** حالات الحلقة — والمفقودة تُعلَن بسببها. */
export const LINK_STATE = Object.freeze({
  ready: 'ready',
  missing: 'missing',
});

function link(id, label, href, hint) {
  return { id, label, href, state: LINK_STATE.ready, hint: hint || '' };
}
function gap(id, label, why) {
  return { id, label, href: '', state: LINK_STATE.missing, hint: why };
}

/**
 * يبني السلسلة لاستثناءٍ بعينه.
 *
 * @param {object} exception  الاستثناء (مسجَّلًا أو مكشوفًا)
 * @param {object} ctx `{ tasks, laborTasks, base }` — ما يُبحث فيه عن الحلقات
 * @returns {{chain:Array, actionable:boolean, firstGap:string}}
 */
export function drillChain(exception, ctx = {}) {
  const { tasks = [], laborTasks = [], base = '' } = ctx;
  const chain = [];

  // ① التنبيه نفسه — رأس السلسلة، وسببه معه.
  chain.push(link('exception', exception?.number ? `الاستثناء ${exception.number}` : 'استثناءٌ غير مسجَّل', '', s(exception?.reason)));

  // ② المستند المرجعيّ.
  const docRef = exception?.docRef || {};
  if (s(docRef.number) || s(docRef.id)) {
    chain.push(
      link(
        'document',
        `المستند ${s(docRef.number) || s(docRef.type)}`,
        `${base}${documentScreenUrl({ type: s(docRef.type), id: s(docRef.id) || null })}`,
        s(docRef.type)
      )
    );
  } else {
    chain.push(gap('document', 'المستند', 'هذا الاستثناء يخصّ رصيدًا أو موقعًا لا مستندًا بعينه.'));
  }

  // ③ المهمّة المولَّدة عن هذا المستند.
  const docNumber = s(docRef.number).toUpperCase();
  const task =
    tasks.find((t) => s(t?.docRef?.number).toUpperCase() === docNumber && docNumber) ||
    laborTasks.find((t) => s(t?.docRef?.number).toUpperCase() === docNumber && docNumber);

  if (task) {
    chain.push(link('task', s(task.title) || `مهمّة ${s(task.id)}`, `${base}/dashboard/labor-operations`, s(task.state || task.status)));
  } else {
    chain.push(gap('task', 'المهمّة', 'لا مهمّة مولَّدة عن هذا المستند بعد — أطلِقها من لوحة المناولة.'));
  }

  // ④ أثر المسح — بنودٌ نُفّذت فعلًا.
  const executed = (task?.lines || []).filter((l) => Number(l?.qtyDone) > 0).length;
  if (task && executed > 0) {
    chain.push(link('scans', `أثر التنفيذ — ${executed} بندًا مُنفَّذًا`, `${base}/dashboard/stock-ledger`, ''));
  } else if (task) {
    chain.push(gap('scans', 'أثر التنفيذ', 'لم يُمسح بندٌ بعد — المهمّة أُسندت ولم تبدأ.'));
  } else {
    chain.push(gap('scans', 'أثر التنفيذ', 'لا أثرَ قبل مهمّة.'));
  }

  // ⑤ الإجراء — من تعريف النوع لا من الشاشة.
  const type = exceptionType(exception?.type);
  chain.push(
    type
      ? link('action', type.action, '', `المسؤول: ${type.owner}`)
      : gap('action', 'الإجراء', 'نوعٌ غير معرَّف — لا إجراء مقترح.')
  );

  const firstGap = chain.find((c) => c.state === LINK_STATE.missing);
  return {
    chain,
    /** أيمكن الفعل الآن؟ السلسلة صالحةٌ ما دام الإجراء معروفًا. */
    actionable: chain[chain.length - 1].state === LINK_STATE.ready,
    firstGap: firstGap ? firstGap.hint : '',
  };
}

/** عدد الحلقات الجاهزة من أصلها — قياسٌ لاكتمال الأثر. */
export function chainCompleteness(result) {
  const chain = result?.chain || [];
  const ready = chain.filter((c) => c.state === LINK_STATE.ready).length;
  return { ready, total: chain.length, pct: chain.length ? Math.round((ready / chain.length) * 100) : 0 };
}
