/** قرار الاشتقاق الجزئي والمتعدد — منطق خالص بلا Firestore أو DOM. */

import {
  derivationQuantityFields,
  derivationRefField,
  deriveDocument,
  derivationTargets,
} from './chain.js';
import { stableLineId } from './documentRelations.js';
import { legacyLineContributions } from './documentLineProgress.js';

const EXECUTION_LINK_TYPES = new Set(['BASE', 'TARGET']);

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rounded(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;
}

export function flowAllocationId(sourceId, targetType) {
  return `DF1__${encodeURIComponent(String(sourceId || ''))}__${encodeURIComponent(String(targetType || ''))}`;
}

/** قرار القفل داخل المعاملة: الأكبر بين ما رآه الجلب وما حُجز سابقًا يحكم. */
export function flowAllocationDecision(plan, existingAllocated = {}, requestedByLine = null) {
  if (!plan?.supported) return { supported: false, selectedByLine: {}, allocatedByLine: {} };
  const requested = requestedByLine && typeof requestedByLine === 'object' ? requestedByLine : null;
  const selectedByLine = {};
  const allocatedByLine = {};
  for (const line of plan.lines) {
    const already = rounded(Math.max(line.executed, positive(existingAllocated?.[line.lineId])));
    const open = rounded(Math.max(0, line.capacity - already));
    const selected = requested ? positive(requested[line.lineId]) : open;
    if (selected > open) throw new Error(`الكمية المختارة للسطر ${line.lineNumber} تتجاوز المتبقي ${open}.`);
    if (selected > 0) selectedByLine[line.lineId] = selected;
    allocatedByLine[line.lineId] = rounded(already + selected);
  }
  const totalSelected = rounded(Object.values(selectedByLine).reduce((sum, value) => sum + value, 0));
  if (totalSelected <= 0) throw new Error('لا كمية مفتوحة قابلة للاشتقاق إلى هذا المستند.');
  return { supported: true, selectedByLine, allocatedByLine, totalSelected };
}

/** يبني الرصيد المفتوح لنوع هدف بعينه، فلا يخلط فرع PUTAWAY بفرع SRN. */
export function partialDerivationPlan(
  source,
  targetType,
  relations = [],
  relatedDocuments = [],
  requestedByLine = null,
) {
  if (!source?.id || !source?.type) throw new Error('مستند المصدر غير صالح.');
  if (!derivationTargets(source.type).includes(targetType)) {
    throw new Error(`«${targetType}» ليس وجهة اشتقاق صحيحة من «${source.type}».`);
  }
  const quantityFields = derivationQuantityFields(source.type, targetType);
  if (!quantityFields) {
    return { supported: false, source, targetType, lines: [], totalOpen: null, totalSelected: null };
  }

  const targetDocuments = (relatedDocuments || []).filter((document) => document?.type === targetType);
  const direct = (relations || []).filter((relation) => (
    EXECUTION_LINK_TYPES.has(relation?.linkType)
    && relation?.source?.documentId === source.id
    && relation?.source?.documentType === source.type
    && relation?.target?.documentType === targetType
    && relation?.source?.lineId
  ));
  const contributions = [
    ...direct.map((relation) => ({
      sourceLineId: relation.source.lineId,
      quantity: positive(relation.linkedQuantity),
      relationId: relation.id,
      targetDocumentId: relation.target?.documentId || null,
      legacy: Boolean(relation.legacy),
    })),
    ...legacyLineContributions(source, targetDocuments, direct)
      .filter((item) => item.relation?.target?.documentType === targetType)
      .map((item) => ({
        sourceLineId: item.sourceLineId,
        quantity: positive(item.relation.linkedQuantity),
        relationId: item.relation.id,
        targetDocumentId: item.relation.target?.documentId || null,
        legacy: true,
      })),
  ];

  const consumed = new Map();
  for (const item of contributions) {
    consumed.set(item.sourceLineId, rounded((consumed.get(item.sourceLineId) || 0) + item.quantity));
  }

  const request = requestedByLine && typeof requestedByLine === 'object' ? requestedByLine : null;
  const known = new Set();
  const lines = (source.lines || []).map((line, index) => {
    const lineId = stableLineId(line, index);
    known.add(lineId);
    const capacity = positive(line?.[quantityFields.source]);
    const executed = consumed.get(lineId) || 0;
    const open = rounded(Math.max(0, capacity - executed));
    const selected = request ? positive(request[lineId]) : open;
    if (selected > open) throw new Error(`الكمية المختارة للسطر ${index + 1} تتجاوز المتبقي ${open}.`);
    return {
      lineId,
      lineIndex: index,
      lineNumber: index + 1,
      sku: line?.sku || null,
      description: line?.description || null,
      uom: line?.uom || null,
      capacity,
      executed,
      open,
      selected,
      contributions: contributions.filter((item) => item.sourceLineId === lineId),
    };
  });
  if (request) {
    const unknown = Object.keys(request).filter((lineId) => !known.has(lineId) && positive(request[lineId]) > 0);
    if (unknown.length) throw new Error(`سطر مصدر غير معروف: ${unknown[0]}`);
  }
  const totalOpen = rounded(lines.reduce((sum, line) => sum + line.open, 0));
  const totalSelected = rounded(lines.reduce((sum, line) => sum + line.selected, 0));
  if (request && totalSelected <= 0) throw new Error('اختر كمية موجبة واحدة على الأقل.');
  return { supported: true, source, targetType, quantityFields, lines, totalOpen, totalSelected };
}

/** يشتق مسودة بالكميات المختارة فقط مع إبقاء المصدر بلا تعديل. */
export function derivePartialDocument(source, targetType, plan) {
  if (!plan?.supported) return deriveDocument(source, targetType);
  const quantities = {};
  for (const line of plan.lines) quantities[line.lineIndex] = line.selected;
  return deriveDocument(source, targetType, { lineQuantities: quantities });
}

/** يربط ترتيب خطوط الخطة المختارة بالأسطر التي أُنشئت فعليًا في المسودة. */
export function partialLinePairs(source, draft, plan) {
  if (!plan?.supported) return [];
  const selected = plan.lines.filter((line) => line.selected > 0);
  if (selected.length !== (draft.lines || []).length) throw new Error('تعذّرت مطابقة أسطر الاشتقاق الجزئي.');
  return selected.map((line, targetIndex) => ({
    sourceLine: source.lines[line.lineIndex],
    sourceLineIndex: line.lineIndex,
    sourceLineId: line.lineId,
    targetLine: draft.lines[targetIndex],
    targetLineIndex: targetIndex,
    targetLineId: stableLineId(draft.lines[targetIndex], targetIndex),
    quantity: line.selected,
    uom: line.uom,
  }));
}

/**
 * أزواج الأسطر لمسودةٍ مدموجة: كلّ مصدر يأخذ نصيبه من أسطر الابن **بالترتيب**.
 * لا يصحّ استعمال `partialLinePairs` لكلّ مصدرٍ على حدة، لأنّ هوية سطر الابن
 * تُحسب من موضعه في المسودة النهائية — لا من موضعه في مسودة مصدره وحده.
 */
export function combinedLinePairs(sourcePlans, combinedDraft) {
  const targetLines = combinedDraft?.lines || [];
  const pairs = [];
  let cursor = 0;
  for (const { source, plan } of sourcePlans) {
    if (!plan?.supported) continue;
    for (const line of plan.lines.filter((item) => item.selected > 0)) {
      const targetLine = targetLines[cursor];
      if (!targetLine) throw new Error('تعذّرت مطابقة أسطر الاشتقاق المدموج.');
      pairs.push({
        sourceDocument: source,
        sourceLine: source.lines[line.lineIndex],
        sourceLineIndex: line.lineIndex,
        sourceLineId: line.lineId,
        targetLine,
        targetLineIndex: cursor,
        targetLineId: stableLineId(targetLine, cursor),
        quantity: line.selected,
        uom: line.uom,
      });
      cursor += 1;
    }
  }
  if (pairs.length && cursor !== targetLines.length) {
    throw new Error('تعذّرت مطابقة أسطر الاشتقاق المدموج.');
  }
  return pairs;
}

/**
 * ★★★ ‹JR-201ب› ترقيعُ بنود المسوّدة بحقولٍ لا يعرفها المصدر — إضافةٌ لا تعديل.
 *
 * العطب الذي يسدّه: `LINE_MAP['PO>GRN']` ينقل الهويّة والكمّيّة **ولا ينقل
 * دفعةً ولا صلاحية** — ومن أين ينقلها؟ أمرُ الشراء لا يعرفهما أصلًا. فمن
 * كتبهما هو موظّف الاستلام على الطبلية، ومسوّدةُ GRN تولد بخانتهما فارغتين،
 * فيبقى `balances.expiry` فارغًا و**FEFO عمياءُ عند التحضير**. وما بعد GRN
 * موصولٌ سلفًا (`GRN>QC` ثمّ `QC>PUTAWAY` يورّثان الحقلين) — فالانقطاع في
 * الحلقة الأولى وحدها، وهذه الدالّة تسدّها.
 *
 * ثلاثةُ أسبابٍ تجعلها آمنة، وكلُّها مُثبَتةٌ في `documentFlow.test.js`:
 *   ① `stableLineId` **موضعيٌّ لا محتوائيّ** (`legacy-line-NNNN`) — فإضافةُ
 *      حقلٍ إلى بندٍ لا تحرّك هويّتَه، ولا تُبطل علاقةً كُتبت عليه.
 *   ② لا تمسّ `draft.lines.length` ولا ترتيبَها — فمؤشّرُ `combinedLinePairs`
 *      وحسابُ `partialLinePairs` بعدها كما كانا حرفًا بحرف.
 *   ③ **غيابُ الوسيط ⟶ دالّةُ هويّة** (المرجعُ نفسُه يُعاد) — فخمسةٌ وعشرون
 *      اشتقاقًا في `LINE_MAP` لا يمرّرها أحدٌ منها تبقى بايتًا ببايت.
 *
 * ⚠️ **ولا يُطمَس محشوٌّ**: الحقل يُملأ إن كان فارغًا في المسوّدة فقط — نفسُ
 * شرط `deriveDocument` (`undefined` أو `''`). فلو ورّث المحرّك يومًا دفعةً من
 * المصدر كانت هي الأصحّ: مصدرُها المستند لا ذاكرةُ الطبلية.
 *
 * ⚠️ **والمشيةُ نسخةٌ من مشية `combinedLinePairs`** (مصدرٌ ثمّ بنودُه المختارة
 * بالترتيب). ومن غيّر إحداهما ولم يغيّر الأخرى ألصق صلاحيةَ بندٍ على بندٍ
 * آخر — عطبٌ صامتٌ لا يرفع خطأً. والحدُّ محروسٌ هنا، وتضاربُ الأطوال يرميه
 * `combinedLinePairs` بعد سطرين على أيّ حال.
 *
 * @param {object} draft مسوّدةُ الابن كما اشتقّها المحرّك.
 * @param {Array<{source:object, plan:object}>} sourcePlans نفسُ ما يُسلَّم `combinedLinePairs`.
 * @param {Object<string, Object<string, object>>|null} extrasBySource
 *   `{ [معرّف المصدر]: { [هوية سطر المصدر]: { حقلٌ: قيمة } } }`.
 * @returns {object} مسوّدةٌ جديدة إن رُقّع شيء، وإلّا المسوّدةُ نفسُها.
 */
export function applyLineExtras(draft, sourcePlans, extrasBySource) {
  const bySource = extrasBySource && typeof extrasBySource === 'object' ? extrasBySource : null;
  const lines = draft?.lines;
  if (!bySource || !Array.isArray(lines) || !lines.length) return draft;

  const nextLines = lines.slice();
  let changed = false;
  let cursor = 0;
  for (const { source, plan } of sourcePlans || []) {
    if (!plan?.supported) continue;
    const extras = bySource[source?.id];
    for (const line of plan.lines.filter((item) => item.selected > 0)) {
      if (cursor >= nextLines.length) return changed ? { ...draft, lines: nextLines } : draft;
      const fields = extras?.[line.lineId];
      if (fields && typeof fields === 'object') {
        const patch = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value === undefined || value === null || value === '') continue;
          const current = nextLines[cursor]?.[key];
          if (current !== undefined && current !== '') continue; // محشوٌّ لا يُطمَس
          patch[key] = value;
        }
        if (Object.keys(patch).length) {
          nextLines[cursor] = { ...nextLines[cursor], ...patch };
          changed = true;
        }
      }
      cursor += 1;
    }
  }
  return changed ? { ...draft, lines: nextLines } : draft;
}

/**
 * سياسة تعدّد المصادر — **صريحة لا مستنتَجة**. الدمج مسموح حيث يكون الابن حاويةً
 * تشغيليّة واحدة تغطّي أكثر من التزام (شحنةٌ واحدة من المورّد نفسه تغلق أمرَي شراء)،
 * وممنوع حيث يكون الابن مرآةً قانونيّة لمستندٍ واحد (فاتورة · تصريح خروج · إشعار
 * دائن · تأكيد تسليم) — فدمجها يخلط ذممًا وأثرًا ماليًّا لا يقبلان الخلط.
 */
const MULTI_SOURCE_ALLOWED = Object.freeze({
  'PR>PO': true,     // أمر شراء واحد يجمع أكثر من طلب شراء
  'PO>GRN': true,    // شحنةٌ واحدة تغلق أكثر من أمر شراء للمورّد نفسه
  'PICK>PACK': true, // طردٌ واحد يجمع أكثر من قائمة سحب
  'TR>TRN': true,    // شحنة نقلٍ واحدة تجمع أكثر من أمر نقل
});

export function multiSourceAllowed(sourceType, targetType) {
  return MULTI_SOURCE_ALLOWED[`${sourceType}>${targetType}`] === true;
}

/**
 * يدمج أكثر من مصدر في مسودة واحدة حين تسمح السياسة بذلك. العلاقات الجديدة
 * هي المصدر الحقيقي للتعدد؛ `links` القديمة تحتفظ بأول مصدر من كل نوع للتوافق.
 */
export function combinePartialSources(sourcePlans, targetType) {
  if (!Array.isArray(sourcePlans) || !sourcePlans.length) throw new Error('يلزم مصدر واحد على الأقل.');
  const sources = sourcePlans.map(({ source }) => source);
  const sourceType = sources[0]?.type;
  if (sources.some((source) => source?.type !== sourceType)) {
    throw new Error('لا تُدمج مصادر من أنواعٍ مختلفة في مستندٍ واحد.');
  }
  if (sourcePlans.length > 1 && !multiSourceAllowed(sourceType, targetType)) {
    throw new Error(`السياسة لا تسمح بدمج أكثر من «${sourceType}» في «${targetType}» واحد.`);
  }
  if (new Set(sources.map((source) => source?.id)).size !== sources.length) {
    throw new Error('لا يُدمج المصدر نفسه مرّتين.');
  }

  const derived = sourcePlans.map(({ source, plan }) => derivePartialDocument(source, targetType, plan));
  const first = derived[0];

  /**
   * الرأس المدموج: كلّ ما وُرِّث يجب أن يتطابق (المورّد/المستودع/الوجهة) — وإلّا
   * لضاع رأسُ مصدرٍ خلف رأس أوّلِهم صامتًا. ويُستثنى حقل المرجع وحده: أرقام
   * المصادر **تُجمع** ولا يطمس أوّلُها بقيّتها.
   */
  const refField = derivationRefField(targetType);
  const identityOf = (draft) => {
    const { [refField]: _ref, ...rest } = draft.header || {};
    return JSON.stringify(Object.entries(rest).sort());
  };
  if (derived.some((draft) => identityOf(draft) !== identityOf(first))) {
    throw new Error('لا تُدمج مصادر تختلف رؤوسها (المورّد/المستودع/الوجهة) في مستندٍ واحد.');
  }

  const header = { ...first.header };
  if (refField) {
    const refs = [...new Set(sources.map((source) => source?.number).filter(Boolean))];
    if (refs.length) header[refField] = refs.join(' + ');
  }

  const links = {};
  for (const draft of derived) {
    for (const [type, link] of Object.entries(draft.links || {})) {
      if (!links[type]) links[type] = link;
    }
  }
  return {
    ...first,
    header,
    lines: derived.flatMap((draft) => draft.lines || []),
    links,
    sourceCount: sourcePlans.length,
  };
}
