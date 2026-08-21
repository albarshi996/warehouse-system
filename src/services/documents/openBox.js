/**
 * صندوق المستندات المفتوحة — عملُ اليوم لا انتظارُ التوقيع (SAP-12 · يسدّ ف‑٣٠ وف‑٤٥).
 *
 * ═══ الفرق عن صندوق الاعتماد ═══
 * الصندوق القائم يعرض **ما ينتظر توقيعك**. وهذا صندوقٌ آخر تمامًا: **ما لم
 * يكتمل بعد**. أمرُ شراءٍ وصل نصفه، وتسليمٌ لم يُؤكَّد، وطلبُ نقلٍ لم يُنفَّذ —
 * كلّها معتمَدةٌ وموقَّعة، ولا تنتظر أحدًا، **وعملُها لم يتمّ**.
 *
 * والمرجع ‹1976› يسمّيه بدقّة: «صندوق أعمال الموظّف اليوميّ».
 *
 * ═══ ولماذا لم يكن ممكنًا قبل اليوم؟ ═══
 * لأنّ «مفتوح» بلا «مغلق» لا معنى له. قبل SAP-4 كان أمرُ شراءٍ استُلم منه
 * ٩٥ من ١٠٠ يبقى مفتوحًا أبدًا — فلو بُني الصندوق حينها لامتلأ بما انتهى
 * فعلًا، ولتعلّم الموظّف تجاهله. **الإغلاق هو ما جعل «المفتوح» صادقًا.**
 *
 * ═══ ولا رقمَ بلا سبب ═══
 * كلّ سطرٍ يحمل **ما المتبقّي فيه ولماذا هو هنا**: كم طُلب وكم نُفِّذ وكم بقي.
 * فصندوقٌ يقول «هذه معلّقة» بلا رقمٍ يشرح لا يُغني عن فتح المستند واحدًا واحدًا.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { documentLineProgress } from './documentLineProgress.js';
import { hasOpenWork, executionStatus, canDeriveFrom, isTerminal, getState } from './states.js';
import { derivationTargets, derivationQuantityFields } from './chain.js';

/** هل لهذا النوع مسارُ تنفيذٍ كمّيّ أصلًا؟ ما لا مسار له لا «يُفتح» ولا «يُغلق». */
export function tracksExecution(type) {
  return derivationTargets(type).some((target) => Boolean(derivationQuantityFields(type, target)));
}

/**
 * يقيس مستندًا واحدًا: هل فيه عملٌ مفتوح، وكم، ولماذا.
 *
 * @returns {{document:object, open:boolean, reason:string, totals:object, status:object}}
 */
export function measureDocument(document, relations = [], relatedDocuments = []) {
  const state = getState(document?.state);
  const base = { document, open: false, reason: '', totals: null, status: null };

  if (!document?.id || !document?.type) return { ...base, reason: 'مستندٌ بلا هويّة.' };
  if (!tracksExecution(document.type)) return { ...base, reason: 'نوعٌ بلا مسار تنفيذٍ كمّيّ.' };
  if (isTerminal(document.state)) return { ...base, reason: `${state.label} — خرج من العمل.` };
  if (!canDeriveFrom(document.state)) return { ...base, reason: `${state.label} — لم يبدأ عمله بعد.` };

  const progress = documentLineProgress(document, relations, relatedDocuments);
  const totals = progress.totals;
  const status = executionStatus(document.state, { capacity: totals.requested, executed: totals.executed });
  const open = hasOpenWork(document.state, { capacity: totals.requested, executed: totals.executed });

  return {
    document,
    open,
    reason: open ? '' : 'اكتمل تنفيذه.',
    totals,
    status,
    lines: progress.lines.filter((line) => line.open > 0),
  };
}

/**
 * يبني الصندوق من مجموعة مستندات.
 *
 * الترتيب: **الأقدم أوّلًا**. لأنّ المعلّق منذ أسبوعين أولى بالنظر من معلّقٍ
 * منذ ساعة — والصندوق الذي يرتّب بالأحدث يدفن ما تأخّر.
 *
 * @param {object[]} documents
 * @param {(doc:object)=>{relations:object[], documents:object[]}} [context] مُزوّد العلاقات لكلّ مستند
 * @returns {{rows:object[], byType:object, totalOpen:number, count:number}}
 */
export function buildOpenBox(documents = [], context = null) {
  const rows = [];
  for (const document of Array.isArray(documents) ? documents : []) {
    const ctx = context?.(document) ?? {};
    const measured = measureDocument(document, ctx.relations ?? [], ctx.documents ?? []);
    if (measured.open) rows.push(measured);
  }

  rows.sort((a, b) => dateOf(a.document) - dateOf(b.document));

  const byType = {};
  let totalOpen = 0;
  for (const row of rows) {
    const type = row.document.type;
    byType[type] = byType[type] || { type, count: 0, open: 0 };
    byType[type].count += 1;
    byType[type].open = round(byType[type].open + (row.status?.open ?? 0));
    totalOpen = round(totalOpen + (row.status?.open ?? 0));
  }

  return { rows, byType, totalOpen, count: rows.length };
}

/** عمرُ المستند بالأيام — «معلّقٌ منذ ١٢ يومًا» أصدق من تاريخٍ يقرؤه المرء ويطرح. */
export function ageInDays(document, nowMs) {
  const ms = dateOf(document);
  if (!ms) return null;
  return Math.max(0, Math.floor((Number(nowMs) - ms) / 86400000));
}

/** أقدم من كذا يومًا — لتمييز المتأخّر عن الطازج بلا حكمٍ مخبوز. */
export function staleRows(rows = [], nowMs, days = 7) {
  return (Array.isArray(rows) ? rows : []).filter((row) => (ageInDays(row.document, nowMs) ?? 0) >= days);
}

function dateOf(document) {
  const raw =
    document?.createdAt?.toMillis?.() ??
    document?.createdAt?.seconds ??
    document?.header?.issueDate ??
    document?.header?.date ??
    null;
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  const parsed = Date.parse(raw ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;
}
