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
import { getSchema } from './schemas/index.js';
import { actualDocs, isPreOpeningDoc } from './actualWork.js';

/** هل لهذا النوع مسارُ تنفيذٍ كمّيّ أصلًا؟ ما لا مسار له لا «يُفتح» ولا «يُغلق». */
export function tracksExecution(type) {
  return derivationTargets(type).some((target) => Boolean(derivationQuantityFields(type, target)));
}

/**
 * ‹ODOO-ORD› أمرُ بيعٍ أو شراءٍ من أودو (`sourceOrder` في مخطّطه)؟
 *
 * ★★ وهو مستقلٌّ في `chain.js` (لا يُشتقّ منه شيءٌ هنا) فلا يراه `tracksExecution` — **وعملُه حقيقيٌّ مع ذلك**:
 * يحمل في بنوده المطلوبَ (`qty`) والمسلَّمَ أو المستلَمَ (`qtyDone`) كما يحسبهما أودو. فيُقاس من بنوده هو لا من أبنائه.
 */
export function isSourceOrder(type) {
  return Boolean(getSchema(type)?.sourceOrder);
}

/**
 * ‹ODOO-ORD› يقيس أمرَ أودو من بنوده: المطلوبُ Σqty والمنفَّذُ Σmax(0, qtyDone).
 *
 * ★★ ومفتوحٌ **في حالة «معتمَد» وحدها وبكمّيّةٍ باقية**: الملغى خرج، وما سواهما ليس أمرًا قائمًا.
 * ★★ والباقي **بندًا بندًا** لا من الإجماليّ: بندٌ سُلّم زائدًا لا يُطفئ بندًا لم يُسلَّم — عميلُ الصنف «ب» ينتظره
 *    ولو فاض الصنفُ «أ». فـ`status.open` = Σ max(0, المطلوب − المنفَّذ) لكلّ بند.
 * ⚠️ والسالبُ حقيقةُ أودو (بندٌ سالب · مسلَّمٌ سالبٌ بمرتجع): لا يُحسب مطلوبًا ولا تنفيذًا — فلا يصير المرتجعُ
 *    «مطلوبًا جديدًا» يفتح أمرًا سُلّم كلُّه.
 * ⚠️ و`doneStatus` في الرأس لا يحكم: البنودُ هي ما يحسبه تقريرُ أودو (`ordersReport`)، والصندوقُ يطابقه.
 */
function measureSourceOrder(document) {
  const state = getState(document.state);
  const base = { document, open: false, reason: '', totals: null, status: null };
  if (isTerminal(document.state)) return { ...base, reason: `${state.label} — خرج من العمل.` };
  if (document.state !== 'approved') return { ...base, reason: `${state.label} — ليس أمرًا قائمًا.` };

  const lines = (Array.isArray(document.lines) ? document.lines : []).map((line, index) => {
    const requested = positive(line?.qty);
    const executed = positive(line?.qtyDone);
    return {
      lineId: line?.lineId || `L${index + 1}`,
      lineNumber: index + 1,
      sku: line?.sku || null,
      barcode: line?.barcode || null,
      description: line?.description || null,
      uom: line?.uom || null,
      requested,
      executed,
      open: round(Math.max(0, requested - executed)),
      excess: round(Math.max(0, executed - requested)),
    };
  });
  const sum = (key) => round(lines.reduce((total, line) => total + line[key], 0));
  const totals = { requested: sum('requested'), executed: sum('executed'), open: sum('open'), excess: sum('excess') };
  // المنفَّذُ في مقابل المطلوب (بلا الفائض) — فيخرج `status.open` باقيَ البنود حرفًا.
  const status = executionStatus(document.state, {
    capacity: totals.requested,
    executed: round(totals.requested - totals.open),
  });
  const open = status.open > 0;
  return {
    document,
    open,
    reason: open ? '' : 'اكتمل تنفيذه.',
    totals,
    status,
    lines: lines.filter((line) => line.open > 0),
  };
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
  if (isSourceOrder(document.type)) return measureSourceOrder(document);
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

/**
 * ‹ODOO-ORD› مُزوّدُ سياقٍ من المحمَّل نفسِه — **بلا قراءةٍ واحدةٍ زائدة**.
 *
 * كان الصندوقُ يُبنى بلا سياقٍ أصلًا فكان المنفَّذُ صفرًا أبدًا: كلُّ أمرِ شراءٍ أو استلامٍ معتمَدٍ «مفتوحٌ» إلى الأبد
 * ولو استُلم كلُّه. وهنا يُمرَّر ما قُرئ أبناءً محتمَلين، فيعدّ `legacyLineContributions` كلَّ ابنٍ يحمل
 * `links.<نوع الأب>.id` — كما يعدّه شريطُ السلسلة في صفحة المستند (بلا العلاقات المخزّنة، فالمتبقّي هنا حدٌّ أعلى).
 * ★★ والملغى لا يُعدّ تنفيذًا (كـ`orderStages`): استلامٌ أُلغي لم يستلم شيئًا.
 * ⚠️ والابنُ الذي لا يتتبّع الصندوقُ نوعَه لم يُقرأ فلا يُعدّ — فيبقى «افتح المستند للرقم الدقيق» صادقًا.
 */
export function loadedContext(documents = []) {
  const live = (Array.isArray(documents) ? documents : []).filter((d) => d?.id && d.state !== 'canceled');
  return () => ({ documents: live });
}

/**
 * ‹ODOO-ORD› صندوقُ العمل الفعليّ: ما بعد الافتتاح وحده (`actualDocs`)، بسياقٍ من المحمَّل — **وكم أُخفي**.
 *
 * ★★ و`hidden` عددُ ما **كان سيُعرض مفتوحًا** من تجارب ما قبل الافتتاح لا عددُها كلُّها: الشاشةُ تقول «أُخفي كذا»
 * فيعرف الناظرُ أنّ «معلّقًا منذ 88 يومًا» لم يُفقد بل نُحّي — ورقمٌ صامتٌ أخطرُ من رقمٍ موصوف.
 */
export function buildActualOpenBox(documents = []) {
  const all = (Array.isArray(documents) ? documents : []).filter(Boolean);
  const actual = actualDocs(all);
  const box = buildOpenBox(actual, loadedContext(actual));
  const preOpening = all.filter(isPreOpeningDoc);
  const hidden = preOpening.length ? buildOpenBox(preOpening, loadedContext(all)).count : 0;
  return { ...box, hidden };
}

/**
 * طرفُ الصفّ — الاسمُ كما في الرأس.
 * ★ و`partner` أوّلًا: أمرُ أودو ومستندُه يكتبان العميلَ أو المورّدَ فيه لا في `supplier`/`customer`،
 *   فكان العمودُ «—» لكلّ أمرٍ من أودو.
 */
export function partyOf(document) {
  const header = document?.header || {};
  for (const key of ['partner', 'supplier', 'customer', 'beneficiary']) {
    const value = String(header[key] ?? '').trim();
    if (value) return value;
  }
  return '';
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

/**
 * لحظةُ المستند التي يُقاس منها عمرُه.
 * ★★ وأمرُ أودو من **تاريخ الأمر** (`sourceDoneDate`) لا من `createdAt`: الإنشاءُ هنا يومُ استيراده،
 *    وأمرٌ عمرُه أسبوعان في أودو استُورد أمس لا يُقال عنه «اليوم».
 */
function dateOf(document) {
  const raw =
    (isSourceOrder(document?.type) ? document?.header?.sourceDoneDate || null : null) ??
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

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
