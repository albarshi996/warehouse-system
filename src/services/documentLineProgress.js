/**
 * تقدم التنفيذ على مستوى سطر المستند — منطق خالص بلا Firestore أو DOM.
 *
 * المطلوب هو كمية السطر التي يجب أن تنتقل إلى الحلقة التالية، لا اسم حقل
 * واحد مفروض على جميع النماذج. التنفيذ يأتي من علاقات BASE/TARGET السطرية،
 * مع fallback قراءة للمستندات القديمة المرتبطة بـ`links` دون إعادة كتابتها.
 */
import { stableLineId } from './documents/documentRelations.js';

const FULFILLMENT_LINK_TYPES = new Set(['BASE', 'TARGET']);

// كمية المصدر التي ينبغي للحلقة التالية استهلاكها.
const SOURCE_QUANTITY_FIELDS = Object.freeze({
  GRN: ['qtyReceived', 'qtyOrdered', 'qty'],
  QC: ['qtyInspected', 'qtyAccepted', 'qty'],
  PICK: ['qtyPicked', 'qtyRequested', 'qty'],
  TRN: ['qtyShipped', 'qty'],
  TRC: ['qtyReceived', 'qtyShipped', 'qty'],
  VRT: ['qty', 'qtyDeclared'],
  CC: ['count2', 'count1', 'bookQty'],
  ADJ: ['actualQty', 'qty'],
});

// الكمية التي حققها المستند الهدف من سطر مصدره.
const TARGET_QUANTITY_FIELDS = Object.freeze({
  GRN: ['qtyReceived', 'qtyOrdered', 'qty'],
  QC: ['qtyInspected', 'qtyAccepted', 'qty'],
  PICK: ['qtyPicked', 'qtyRequested', 'qty'],
  TRN: ['qtyShipped', 'qty'],
  TRC: ['qtyReceived', 'qtyShipped', 'qty'],
  VRT: ['qty', 'qtyDeclared'],
  CC: ['count2', 'count1', 'bookQty'],
  ADJ: ['actualQty', 'qty'],
});

function text(value) {
  return String(value ?? '').trim();
}

function quantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;
}

function firstQuantity(line, fields) {
  for (const field of fields) {
    if (line?.[field] !== null && line?.[field] !== undefined && line?.[field] !== '') {
      return quantity(line[field]);
    }
  }
  return 0;
}

export function sourceLineQuantity(documentType, line) {
  return firstQuantity(line, SOURCE_QUANTITY_FIELDS[documentType] || ['qty']);
}

export function targetLineQuantity(documentType, line) {
  return firstQuantity(line, TARGET_QUANTITY_FIELDS[documentType] || ['qty']);
}

function lineKey(line) {
  return text(line?.sku || line?.barcode || line?.description).toLocaleLowerCase('en');
}

function relatedDocumentMap(relatedDocuments) {
  const map = new Map();
  for (const document of relatedDocuments || []) {
    if (document?.id) map.set(document.id, document);
  }
  return map;
}

function targetLineFor(relation, targetDocument) {
  if (!targetDocument) return null;
  const wantedId = text(relation?.target?.lineId);
  if (wantedId) {
    const byId = (targetDocument.lines || []).find((line, index) => stableLineId(line, index) === wantedId);
    if (byId) return byId;
  }
  const lineNumber = Number(relation?.target?.lineNumber);
  if (Number.isInteger(lineNumber) && lineNumber > 0) return targetDocument.lines?.[lineNumber - 1] || null;
  return null;
}

function classification(sourceType, targetType, targetLine, executed) {
  const hasAccepted = targetLine?.qtyAccepted !== null && targetLine?.qtyAccepted !== undefined
    && targetLine?.qtyAccepted !== '';
  const hasRejected = targetLine?.qtyRejected !== null && targetLine?.qtyRejected !== undefined
    && targetLine?.qtyRejected !== '';
  if (hasAccepted || hasRejected) {
    return {
      classified: true,
      accepted: quantity(targetLine?.qtyAccepted),
      rejected: quantity(targetLine?.qtyRejected),
    };
  }
  // فرعا الجودة يصرّحان بالنتيجة في نوع الطفل حتى لو لم يحمل حقول QC نفسها.
  if (sourceType === 'QC' && targetType === 'PUTAWAY') {
    return { classified: true, accepted: executed, rejected: 0 };
  }
  if (sourceType === 'QC' && targetType === 'SRN') {
    return { classified: true, accepted: 0, rejected: executed };
  }
  return { classified: false, accepted: 0, rejected: 0 };
}

function contributionFromRelation(relation, sourceDocument, targetDocument) {
  const targetLine = targetLineFor(relation, targetDocument);
  const inferred = targetLineQuantity(relation.target?.documentType, targetLine);
  const executed = quantity(relation.linkedQuantity) || inferred;
  const result = classification(sourceDocument.type, relation.target?.documentType, targetLine, executed);
  const issues = [];
  if (!executed) issues.push('missing-executed-quantity');
  if (result.classified && round(result.accepted + result.rejected) !== round(executed)) {
    issues.push('classification-does-not-equal-executed');
  }
  return {
    relationId: relation.id,
    linkType: relation.linkType,
    legacy: Boolean(relation.legacy),
    target: {
      documentId: relation.target?.documentId || null,
      documentType: relation.target?.documentType || null,
      documentNumber: relation.target?.documentNumber || targetDocument?.number || null,
      lineId: relation.target?.lineId || null,
      lineNumber: relation.target?.lineNumber || null,
    },
    executed,
    accepted: result.accepted,
    rejected: result.rejected,
    classified: result.classified,
    issues,
  };
}

/**
 * يستنتج علاقات سطرية للقراءة فقط من أطفال قدامى يحملون `links.<type>.id`.
 * المطابقة بالمفتاح مع رقم التكرار، كي لا ينهار سطران للـSKU نفسه في سطر واحد.
 */
export function legacyLineContributions(sourceDocument, relatedDocuments, storedRelations = []) {
  if (!sourceDocument?.id || !sourceDocument?.type) return [];
  const sourceGroups = new Map();
  (sourceDocument.lines || []).forEach((line, index) => {
    const key = lineKey(line);
    if (!sourceGroups.has(key)) sourceGroups.set(key, []);
    sourceGroups.get(key).push(index);
  });

  const storedLinePairs = new Set((storedRelations || [])
    .filter((relation) => relation?.source?.lineId && relation?.target?.lineId)
    .map((relation) => [
      relation.source.documentId,
      relation.source.lineId,
      relation.target.documentId,
      relation.target.lineId,
    ].join('|')));

  const contributions = [];
  for (const child of relatedDocuments || []) {
    if (child?.links?.[sourceDocument.type]?.id !== sourceDocument.id) continue;
    const occurrences = new Map();
    (child.lines || []).forEach((targetLine, targetIndex) => {
      const key = lineKey(targetLine);
      const occurrence = occurrences.get(key) || 0;
      occurrences.set(key, occurrence + 1);
      const candidates = sourceGroups.get(key) || [];
      const sourceIndex = candidates[occurrence] ?? (key ? undefined : targetIndex);
      if (!Number.isInteger(sourceIndex) || !sourceDocument.lines?.[sourceIndex]) return;

      const sourceLineId = stableLineId(sourceDocument.lines[sourceIndex], sourceIndex);
      const targetLineId = stableLineId(targetLine, targetIndex);
      const pair = [sourceDocument.id, sourceLineId, child.id, targetLineId].join('|');
      if (storedLinePairs.has(pair)) return;

      const relation = {
        id: `legacy-progress:${sourceDocument.id}:${sourceLineId}:${child.id}:${targetLineId}`,
        linkType: 'BASE',
        legacy: true,
        source: {
          documentId: sourceDocument.id,
          documentType: sourceDocument.type,
          documentNumber: sourceDocument.number || null,
          lineId: sourceLineId,
          lineNumber: sourceIndex + 1,
        },
        target: {
          documentId: child.id,
          documentType: child.type,
          documentNumber: child.number || null,
          lineId: targetLineId,
          lineNumber: targetIndex + 1,
        },
        linkedQuantity: targetLineQuantity(child.type, targetLine),
      };
      contributions.push({ relation, sourceLineId, targetDocument: child });
    });
  }
  return contributions;
}

function progressStatus(requested, executed) {
  if (requested <= 0) return executed > 0 ? 'over' : 'empty';
  if (executed <= 0) return 'not_started';
  if (executed < requested) return 'partial';
  if (executed === requested) return 'complete';
  return 'over';
}

/**
 * النتيجة تحمل `contributions` داخل كل سطر: وهي drilldown حرفي للمستندات
 * والأسطر التي كوّنت الإجمال، لا رقمًا مقطوع الصلة بمصدره.
 */
export function documentLineProgress(document, relations = [], relatedDocuments = []) {
  if (!document?.id || !document?.type) {
    return {
      documentId: document?.id || null,
      documentType: document?.type || null,
      lines: [],
      totals: {
        requested: 0, executed: 0, accepted: 0, rejected: 0,
        open: 0, unaccepted: 0, excess: 0, status: 'empty',
      },
      issues: [],
    };
  }

  const documents = relatedDocumentMap(relatedDocuments);
  const lines = (document.lines || []).map((line, index) => ({
    lineId: stableLineId(line, index),
    lineNumber: index + 1,
    sku: line?.sku || null,
    barcode: line?.barcode || null,
    description: line?.description || null,
    uom: line?.uom || null,
    requested: sourceLineQuantity(document.type, line),
    contributions: [],
    issues: [],
  }));
  const byLineId = new Map();
  for (const line of lines) {
    if (byLineId.has(line.lineId)) line.issues.push('duplicate-line-id');
    else byLineId.set(line.lineId, line);
  }

  const directRelations = (relations || []).filter((relation) => (
    FULFILLMENT_LINK_TYPES.has(relation?.linkType)
    && relation?.source?.documentId === document.id
    && relation?.source?.documentType === document.type
    && relation?.source?.lineId
  ));
  const contributions = directRelations.map((relation) => ({
    relation,
    sourceLineId: relation.source.lineId,
    targetDocument: documents.get(relation.target?.documentId),
  }));
  contributions.push(...legacyLineContributions(document, relatedDocuments, directRelations));

  const seen = new Set();
  for (const item of contributions) {
    if (!item.relation?.id || seen.has(item.relation.id)) continue;
    seen.add(item.relation.id);
    const sourceLine = byLineId.get(item.sourceLineId);
    if (!sourceLine) continue;
    sourceLine.contributions.push(contributionFromRelation(
      item.relation,
      document,
      item.targetDocument,
    ));
  }

  for (const line of lines) {
    line.executed = round(line.contributions.reduce((sum, item) => sum + item.executed, 0));
    line.accepted = round(line.contributions.reduce((sum, item) => sum + item.accepted, 0));
    line.rejected = round(line.contributions.reduce((sum, item) => sum + item.rejected, 0));
    line.classified = line.contributions.some((item) => item.classified);
    line.open = round(Math.max(0, line.requested - line.executed));
    line.excess = round(Math.max(0, line.executed - line.requested));
    line.unaccepted = line.classified
      ? round(Math.max(0, line.requested - line.accepted))
      : null;
    line.status = progressStatus(line.requested, line.executed);
    if (line.excess > 0) line.issues.push('executed-exceeds-requested');
    for (const contribution of line.contributions) line.issues.push(...contribution.issues);
  }

  const totals = {
    requested: round(lines.reduce((sum, line) => sum + line.requested, 0)),
    executed: round(lines.reduce((sum, line) => sum + line.executed, 0)),
    accepted: round(lines.reduce((sum, line) => sum + line.accepted, 0)),
    rejected: round(lines.reduce((sum, line) => sum + line.rejected, 0)),
    open: round(lines.reduce((sum, line) => sum + line.open, 0)),
    excess: round(lines.reduce((sum, line) => sum + line.excess, 0)),
  };
  const classifiedLines = lines.filter((line) => line.classified);
  totals.unaccepted = classifiedLines.length
    ? round(classifiedLines.reduce((sum, line) => sum + (line.unaccepted || 0), 0))
    : null;
  totals.status = progressStatus(totals.requested, totals.executed);

  return {
    documentId: document.id,
    documentType: document.type,
    lines,
    totals,
    issues: [...new Set(lines.flatMap((line) => line.issues))],
  };
}

