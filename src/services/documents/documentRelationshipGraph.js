/** نموذج عرض خالص لخريطة علاقات المستند؛ بلا Firestore أو React أو DOM. */

import { documentScreenUrl, documentTimestamp } from '../documentNavigator.js';

export const RELATION_PRESENTATION = Object.freeze({
  BASE: { label: 'أساس مباشر', color: 'var(--o-brand-primary)', lineStyle: 'solid' },
  TARGET: { label: 'نتيجة مباشرة', color: 'var(--o-action)', lineStyle: 'solid' },
  REFERENCE: { label: 'مرجع', color: 'var(--o-text-info)', lineStyle: 'dashed' },
  RETURN: { label: 'مرتجع', color: 'var(--o-text-warning)', lineStyle: 'dashed' },
  REVERSAL: { label: 'عكس أثر', color: 'var(--o-gray-700)', lineStyle: 'dotted' },
  CORRECTION: { label: 'تصحيح', color: 'var(--o-community-primary)', lineStyle: 'dotted' },
});

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nodeKey(endpoint) {
  const type = text(endpoint?.documentType || endpoint?.type);
  const id = text(endpoint?.documentId || endpoint?.id);
  return type && id ? `${type}:${id}` : null;
}

function endpointDocument(endpoint, documentsById) {
  return documentsById.get(endpoint?.documentId) || {};
}

function graphNode(endpoint, documentsById, currentKey, basePath) {
  const document = endpointDocument(endpoint, documentsById);
  const type = text(endpoint?.documentType || document.type);
  const id = text(endpoint?.documentId || document.id);
  const key = nodeKey({ documentType: type, documentId: id });
  return {
    key,
    id,
    type,
    number: text(document.number || endpoint?.documentNumber) || null,
    state: text(document.state) || null,
    date: document.updatedAt || document.createdAt || null,
    byName: text(document.createdByName || document.byName) || null,
    current: key === currentKey,
    href: key === currentKey ? null : documentScreenUrl({ type, id, base: basePath }),
  };
}

function relationGroupKey(relation) {
  return [
    text(relation?.linkType).toUpperCase(),
    nodeKey(relation?.source),
    nodeKey(relation?.target),
  ].join('|');
}

function groupRelations(relations) {
  const groups = new Map();
  for (const relation of relations || []) {
    const linkType = text(relation?.linkType).toUpperCase();
    if (!RELATION_PRESENTATION[linkType]) continue;
    const key = relationGroupKey(relation);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        linkType,
        source: relation.source,
        target: relation.target,
        relations: [],
        linkedQuantity: 0,
        linkedValue: 0,
        uoms: new Set(),
        byNames: new Set(),
        createdAt: null,
        legacy: true,
      });
    }
    const group = groups.get(key);
    group.relations.push(relation);
    group.linkedQuantity += number(relation.linkedQuantity);
    group.linkedValue += number(relation.linkedValue);
    if (text(relation.uom)) group.uoms.add(text(relation.uom));
    if (text(relation.byName || relation.createdBy)) {
      group.byNames.add(text(relation.byName || relation.createdBy));
    }
    if (documentTimestamp(relation.createdAt) >= documentTimestamp(group.createdAt)) {
      group.createdAt = relation.createdAt || group.createdAt;
    }
    if (!relation.legacy) group.legacy = false;
  }
  return [...groups.values()];
}

function finalizeEdge(group, direction, documentsById, currentKey, basePath) {
  const otherEndpoint = direction === 'incoming' ? group.source : group.target;
  const presentation = RELATION_PRESENTATION[group.linkType];
  return {
    key: group.key,
    direction,
    linkType: group.linkType,
    label: presentation.label,
    color: presentation.color,
    lineStyle: presentation.lineStyle,
    node: graphNode(otherEndpoint, documentsById, currentKey, basePath),
    relationCount: group.relations.length,
    linkedQuantity: group.linkedQuantity || null,
    linkedValue: group.linkedValue || null,
    uom: group.uoms.size === 1 ? [...group.uoms][0] : null,
    mixedUom: group.uoms.size > 1,
    byNames: [...group.byNames],
    createdAt: group.createdAt,
    legacy: group.legacy,
    lineCount: group.relations.filter((relation) => (
      relation.source?.lineId || relation.target?.lineId
    )).length,
    relations: group.relations,
  };
}

function compareEdges(a, b) {
  const type = a.linkType.localeCompare(b.linkType, 'en');
  if (type) return type;
  const numberOrder = String(a.node.number || '').localeCompare(String(b.node.number || ''), 'en', { numeric: true });
  if (numberOrder) return numberOrder;
  return a.node.key.localeCompare(b.node.key, 'en');
}

/** يجمع عدة روابط سطرية بين المستندين في حافة واحدة مع حفظ drilldown. */
export function buildDocumentRelationshipGraph({
  current,
  relations = [],
  documents = [],
  basePath = '/dashboard/document',
} = {}) {
  const currentEndpoint = {
    documentId: current?.id,
    documentType: current?.type,
    documentNumber: current?.number,
  };
  const currentKey = nodeKey(currentEndpoint);
  const documentsById = new Map(
    [current, ...(documents || [])]
      .filter((document) => document?.id)
      .map((document) => [document.id, document]),
  );
  if (!currentKey) {
    return { current: null, incoming: [], outgoing: [], relationCount: 0, nodeCount: 0 };
  }

  const incoming = [];
  const outgoing = [];
  for (const group of groupRelations(relations)) {
    const sourceKey = nodeKey(group.source);
    const targetKey = nodeKey(group.target);
    if (targetKey === currentKey) {
      incoming.push(finalizeEdge(group, 'incoming', documentsById, currentKey, basePath));
    } else if (sourceKey === currentKey) {
      outgoing.push(finalizeEdge(group, 'outgoing', documentsById, currentKey, basePath));
    }
  }
  incoming.sort(compareEdges);
  outgoing.sort(compareEdges);

  return {
    current: graphNode(currentEndpoint, documentsById, currentKey, basePath),
    incoming,
    outgoing,
    relationCount: [...incoming, ...outgoing].reduce((sum, edge) => sum + edge.relationCount, 0),
    nodeCount: new Set([
      currentKey,
      ...incoming.map((edge) => edge.node.key),
      ...outgoing.map((edge) => edge.node.key),
    ]).size,
  };
}

export function relationshipMetric(edge) {
  const parts = [];
  if (edge?.linkedQuantity) {
    parts.push(`${edge.linkedQuantity}${edge.mixedUom ? ' بوحدات متعددة' : edge.uom ? ` ${edge.uom}` : ''}`);
  }
  if (edge?.linkedValue) parts.push(`${edge.linkedValue} د.ل`);
  if (edge?.lineCount) parts.push(`${edge.lineCount} سطر`);
  return parts.join(' · ') || 'على مستوى المستند';
}
