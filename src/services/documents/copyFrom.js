/**
 * «جلب من مستند سابق» — النصف المفقود من الاشتقاق (SAP-5 · يسدّ ف‑١٢ وف‑١٣).
 *
 * ═══ المسار الآخر لنفس الحقيقة ═══
 * «إنشاء مستند لاحق» يبدأ من المصدر: أفتح أمر الشراء وأقول «أنشئ استلامًا».
 * و«جلب من مستند سابق» يبدأ من الهدف: أفتح استلامًا فارغًا وأقول «اجلب من
 * أمر شراء». والنتيجة **واحدة**: علاقة مصدر↔هدف على مستوى السطر.
 *
 * ولذلك لا يبني هذا الملفّ مسار بياناتٍ ثانيًا. يستدعي `partialDerivationPlan`
 * نفسه الذي يستدعيه المسار الأوّل، ويعكس خريطة `chain.js` نفسها. اثنان في
 * الواجهة، وواحدٌ في الحقيقة.
 *
 * ═══ ما يعنيه «مؤهَّل» ═══
 * ثلاثة شروطٍ مجتمعة، وكلٌّ منها له سببٌ يُعرض للموظّف حين يسقط:
 *   1. **الحالة**: معتمَدٌ أو منجَز. المسودّة لم تُقرّ بعد، والمغلق أُوقف
 *      عمدًا، والملغى لم يعد صحيحًا (SAP-4 · `canDeriveFrom`).
 *   2. **الطرف**: مورّدُ الاستلام هو مورّد أمر الشراء. وخلطُ الأطراف يُنشئ
 *      التزامًا على من لم يلتزم.
 *   3. **الكمّيّة المفتوحة**: ما استُنفد لا يُجلب منه.
 *
 * والسبب يُقال ولا يُخفى: قائمةٌ تُخفي غير المؤهّل بلا بيانٍ تجعل الموظّف
 * يظنّ المستند مفقودًا فيُنشئه من جديد — وهذا أصل الازدواج.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { derivationSources, derivationQuantityFields } from './chain.js';
import { canDeriveFrom, getState } from './states.js';
import { partialDerivationPlan } from '../documentFlow.js';

/**
 * حقول الطرف في رأس المستند، بترتيب الأولويّة.
 * المورّد للشراء، والعميل للبيع، والمستفيد للمشتريات الداخليّة.
 */
const PARTY_FIELDS = ['supplier', 'customer', 'beneficiary'];

/** اسم الطرف في مستند — أو نصٌّ فارغ إن لم يكن للنوع طرف. */
export function partyOf(document) {
  const header = document?.header ?? {};
  for (const field of PARTY_FIELDS) {
    const value = String(header[field] ?? '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * الأنواع التي يجوز الجلب منها إلى هدفٍ ما — **ومعها كمّيّةٌ قابلة للسحب**.
 *
 * نوعٌ في خريطة الاشتقاق بلا حقول كمّيّة (مثل `DN → GP`: تصريح خروجٍ لا
 * يحمل كمّيّات) يُستبعد هنا: الجلب معناه سحب كمّيّة، فما لا كمّيّة فيه
 * يُنشأ اشتقاقًا لا جلبًا.
 */
export function sourceTypesFor(targetType) {
  return derivationSources(targetType).filter((source) => Boolean(derivationQuantityFields(source, targetType)));
}

/** هل النوع الهدف يقبل الجلب أصلًا؟ */
export function acceptsCopyFrom(targetType) {
  return sourceTypesFor(targetType).length > 0;
}

/**
 * يفحص مستندًا واحدًا كمرشَّحٍ للجلب.
 *
 * @returns {{document:object, eligible:boolean, reason:string, openTotal:number|null, plan:object|null}}
 */
export function qualifyCandidate(sourceDoc, targetType, { party = '', relations = [], relatedDocuments = [] } = {}) {
  const reject = (reason) => ({ document: sourceDoc, eligible: false, reason, openTotal: null, plan: null });

  if (!sourceDoc?.id || !sourceDoc?.type) return reject('مستندٌ بلا هويّة.');
  if (!sourceTypesFor(targetType).includes(sourceDoc.type)) {
    return reject(`«${sourceDoc.type}» لا يُجلب منه إلى «${targetType}».`);
  }
  if (!canDeriveFrom(sourceDoc.state)) {
    return reject(`الحالة «${getState(sourceDoc.state).label}» لا تسمح بالجلب.`);
  }

  const wanted = String(party ?? '').trim();
  const has = partyOf(sourceDoc);
  if (wanted && has && wanted !== has) return reject(`الطرف مختلف: «${has}».`);

  let plan;
  try {
    plan = partialDerivationPlan(sourceDoc, targetType, relations, relatedDocuments);
  } catch (error) {
    return reject(String(error?.message ?? error));
  }
  if (!plan?.supported) return reject('لا كمّيّة قابلة للسحب في هذا المسار.');

  const openTotal = plan.lines.reduce((sum, line) => sum + Math.max(0, line.capacity - line.executed), 0);
  if (openTotal <= 0) return reject('استُنفدت كمّيّته — لا مفتوح فيه.');

  return { document: sourceDoc, eligible: true, reason: '', openTotal: Math.round(openTotal * 1e9) / 1e9, plan };
}

/**
 * يبني قائمة المرشَّحين لشاشة الجلب.
 *
 * **يُعيد غير المؤهّل أيضًا** ومعه سببه — لأنّ الإخفاء الصامت يجعل الموظّف
 * يظنّ المستند مفقودًا فيُنشئه من جديد. والواجهة تعرضه معطّلًا بسببه.
 *
 * @returns {{eligible:object[], rejected:object[], sourceTypes:string[]}}
 */
export function copyFromCandidates(targetType, documents = [], options = {}) {
  const sourceTypes = sourceTypesFor(targetType);
  const pool = (Array.isArray(documents) ? documents : []).filter((d) => sourceTypes.includes(d?.type));
  const judged = pool.map((d) => qualifyCandidate(d, targetType, { ...options, relations: options.relationsOf?.(d) ?? options.relations ?? [] }));
  return {
    sourceTypes,
    eligible: judged.filter((c) => c.eligible).sort(byNumberDesc),
    rejected: judged.filter((c) => !c.eligible).sort(byNumberDesc),
  };
}

function byNumberDesc(a, b) {
  return String(b.document?.number ?? '').localeCompare(String(a.document?.number ?? ''), 'ar', { numeric: true });
}

/**
 * يدمج اختيارًا من **عدّة مستنداتٍ مصدر** في مسوّدة هدفٍ واحدة.
 *
 * §12.2-٣ ‹302› يسمح بأكثر من مصدر. والقيد الحاكم: **طرفٌ واحد** — فدمجُ
 * مورّدَين في استلامٍ واحد يُنشئ مستندًا لا يُقابله واقع.
 *
 * لا يُنشئ شيئًا ولا يكتب: يُخرج أسطرًا ومصادرَ فقط. والعلاقة تُكتب عند
 * الحفظ لا عند التجهيز (§12.2-٩ ‹308›: لا أثر لنموذجٍ غير محفوظ).
 *
 * @param {Array<{candidate:object, quantities:object}>} selections
 * @returns {{lines:object[], sources:object[], party:string, totalDrawn:number, problems:string[]}}
 */
export function mergeSelection(selections = []) {
  const rows = Array.isArray(selections) ? selections.filter((s) => s?.candidate?.eligible) : [];
  const problems = [];
  const parties = [...new Set(rows.map((s) => partyOf(s.candidate.document)).filter(Boolean))];
  if (parties.length > 1) problems.push(`لا يجوز الدمج من أطرافٍ مختلفة: ${parties.join(' · ')}.`);

  const lines = [];
  const sources = [];
  let totalDrawn = 0;

  for (const { candidate, quantities } of rows) {
    const doc = candidate.document;
    const picked = [];
    for (const line of candidate.plan.lines) {
      const open = Math.max(0, line.capacity - line.executed);
      const requested = quantities?.[line.lineId];
      const qty = requested === undefined ? open : Math.max(0, Number(requested) || 0);
      if (qty <= 0) continue;
      if (qty > open) {
        problems.push(`«${doc.number ?? doc.id}» السطر ${line.lineNumber}: ${qty} يتجاوز المتبقّي ${open}.`);
        continue;
      }
      picked.push({ lineId: line.lineId, lineNumber: line.lineNumber, qty, open, capacity: line.capacity });
      lines.push({ ...(line.source ?? {}), qty, sourceType: doc.type, sourceId: doc.id, sourceNumber: doc.number ?? null, sourceLineId: line.lineId });
      totalDrawn += qty;
    }
    if (picked.length) sources.push({ type: doc.type, id: doc.id, number: doc.number ?? null, lines: picked });
  }

  if (!lines.length && !problems.length) problems.push('لم تُختَر كمّيّةٌ واحدة.');

  return {
    lines,
    sources,
    party: parties[0] ?? '',
    totalDrawn: Math.round(totalDrawn * 1e9) / 1e9,
    problems,
  };
}
