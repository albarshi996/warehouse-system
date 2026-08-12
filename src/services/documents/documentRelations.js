/**
 * نموذج علاقات المستندات الخالص.
 *
 * يكمّل خريطة `links` القديمة ولا يستبدلها. المستندات الجديدة تستطيع حفظ
 * علاقات متعددة في مجموعة `document_links`، بينما تُقرأ المستندات القديمة
 * بعلاقات افتراضية مشتقة دون إعادة كتابة مستند مرحّل.
 */

export const DOCUMENT_LINK_TYPES = Object.freeze([
  'BASE',
  'TARGET',
  'REFERENCE',
  'RETURN',
  'REVERSAL',
  'CORRECTION',
]);

const LINK_TYPES = new Set(DOCUMENT_LINK_TYPES);

function text(value) {
  return String(value ?? '').trim();
}

function required(value, label) {
  const out = text(value);
  if (!out) throw new Error(`${label} مطلوب`);
  return out;
}

function positiveNumber(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const out = Number(value);
  if (!Number.isFinite(out) || out <= 0) throw new Error(`${label} يجب أن يكون رقمًا موجبًا`);
  return out;
}

/**
 * هوية قراءة مستقرة لسطر قديم لا يحمل `lineId`.
 *
 * المستند المرحّل لا تتغير أسطره في مواضعها؛ لذلك يكفي فهرس ثابت ومصفّر.
 * الهوية لا تُكتب إلى المستند القديم، ولا تستخدم SKU لأنه قد يتكرر في سطرين.
 */
export function stableLineId(line, index) {
  const explicit = text(line?.lineId || line?._lineId);
  if (explicit) return explicit;
  if (!Number.isInteger(index) || index < 0) throw new Error('فهرس السطر غير صالح');
  return `legacy-line-${String(index + 1).padStart(4, '0')}`;
}

/** يعيد نسخة قراءة بأسطر ذات هوية، ولا يعدّل المستند أو أسطره الأصلية. */
export function withStableLineIds(document) {
  return {
    ...(document || {}),
    lines: (document?.lines || []).map((line, index) => ({
      ...(line || {}),
      lineId: stableLineId(line, index),
    })),
  };
}

/**
 * يوحّد طرف العلاقة. يقبل الشكل المخزّن أو `{ document, line, lineIndex }`
 * كي يبقى النموذج مستقلًا عن مكوّن الواجهة وخدمة Firestore.
 */
export function normalizeRelationEndpoint(endpoint, label = 'طرف العلاقة') {
  const document = endpoint?.document || {};
  const documentId = required(endpoint?.documentId ?? endpoint?.id ?? document.id, `${label}: معرّف المستند`);
  const documentType = required(endpoint?.documentType ?? endpoint?.type ?? document.type, `${label}: نوع المستند`);
  const documentNumber = text(endpoint?.documentNumber ?? endpoint?.number ?? document.number) || null;

  let lineId = text(endpoint?.lineId || endpoint?.line?.lineId || endpoint?.line?._lineId) || null;
  const lineIndex = endpoint?.lineIndex;
  if (!lineId && Number.isInteger(lineIndex)) lineId = stableLineId(endpoint?.line, lineIndex);

  let lineNumber = endpoint?.lineNumber;
  if ((lineNumber === null || lineNumber === undefined || lineNumber === '') && Number.isInteger(lineIndex)) {
    lineNumber = lineIndex + 1;
  }
  if (lineNumber !== null && lineNumber !== undefined && lineNumber !== '') {
    lineNumber = Number(lineNumber);
    if (!Number.isInteger(lineNumber) || lineNumber < 1) throw new Error(`${label}: رقم السطر غير صالح`);
  } else {
    lineNumber = null;
  }

  return { documentId, documentType, documentNumber, lineId, lineNumber };
}

function idPart(value) {
  return encodeURIComponent(value === null || value === undefined || value === '' ? '-' : String(value));
}

/**
 * معرّف حتمي لا يتغير مع وقت الإعادة أو رقم المستند الظاهر.
 *
 * عدم إدخال الكمية في الهوية مقصود: إعادة المحاولة بكمية مختلفة لا تنشئ
 * رابطًا ثانيًا صامتًا، بل تصبح تعارضًا يرفضه `idempotentRelationDecision`.
 */
export function documentRelationId({ source, target, linkType }) {
  const from = normalizeRelationEndpoint(source, 'المصدر');
  const to = normalizeRelationEndpoint(target, 'الهدف');
  const type = required(linkType, 'نوع الرابط').toUpperCase();
  if (!LINK_TYPES.has(type)) throw new Error(`نوع رابط غير مدعوم: ${type}`);
  return [
    'DL1', type,
    from.documentType, from.documentId, from.lineId,
    to.documentType, to.documentId, to.lineId,
  ].map(idPart).join('__');
}

/** يبني سجل علاقة صالحًا للكتابة في `document_links`. */
export function createDocumentRelation(input) {
  const source = normalizeRelationEndpoint(input?.source, 'المصدر');
  const target = normalizeRelationEndpoint(input?.target, 'الهدف');
  const linkType = required(input?.linkType, 'نوع الرابط').toUpperCase();
  if (!LINK_TYPES.has(linkType)) throw new Error(`نوع رابط غير مدعوم: ${linkType}`);
  if (source.documentId === target.documentId && source.documentType === target.documentType) {
    throw new Error('لا يجوز ربط المستند بنفسه');
  }

  const linkedQuantity = positiveNumber(input?.linkedQuantity, 'الكمية المرتبطة');
  const linkedValue = positiveNumber(input?.linkedValue, 'القيمة المرتبطة');
  if (linkedQuantity !== null && (!source.lineId || !target.lineId)) {
    throw new Error('الكمية المرتبطة تحتاج سطر مصدر وسطر هدف');
  }
  const uom = text(input?.uom) || null;
  const operationId = text(input?.operationId) || null;
  const correlationId = text(input?.correlationId) || null;
  const createdBy = text(input?.createdBy) || null;
  const createdAt = input?.createdAt ?? null;
  const id = documentRelationId({ source, target, linkType });

  return {
    id,
    version: 1,
    source,
    target,
    linkType,
    linkedQuantity,
    linkedValue,
    uom,
    operationId,
    correlationId,
    createdBy,
    createdAt,
  };
}

function semanticFacts(relation) {
  const normalized = createDocumentRelation(relation);
  return {
    id: normalized.id,
    source: {
      documentId: normalized.source.documentId,
      documentType: normalized.source.documentType,
      lineId: normalized.source.lineId,
    },
    target: {
      documentId: normalized.target.documentId,
      documentType: normalized.target.documentType,
      lineId: normalized.target.lineId,
    },
    linkType: normalized.linkType,
    linkedQuantity: normalized.linkedQuantity,
    linkedValue: normalized.linkedValue,
    uom: normalized.uom,
  };
}

/**
 * قرار الكتابة الحتمية: إنشاء جديد، أو replay آمن، أو تعارض صريح.
 * لا يدمج كمية مختلفة تحت المعرّف نفسه ولا يسمح بتأثير مكرر صامت.
 */
export function idempotentRelationDecision(existing, proposed) {
  const next = createDocumentRelation(proposed);
  if (!existing) return { action: 'create', relation: next };

  const currentFacts = semanticFacts(existing);
  const nextFacts = semanticFacts(next);
  if (currentFacts.id !== nextFacts.id) return { action: 'create', relation: next };
  if (JSON.stringify(currentFacts) !== JSON.stringify(nextFacts)) {
    throw new Error(`تعارض إعادة العلاقة ${next.id}`);
  }

  return {
    action: 'noop',
    relation: {
      ...next,
      ...existing,
      id: next.id,
      source: { ...next.source, ...existing.source },
      target: { ...next.target, ...existing.target },
    },
  };
}

/**
 * يحوّل `links` القديمة إلى علاقات قراءة فقط.
 *
 * الرابط المطابق لـ`baseType` أساس مباشر؛ وبقية الروابط الموروثة مراجع، حتى
 * لا ندّعي أن كل جد في `links` أب مباشر. عند غياب `baseType` نبقى محافظين
 * ونصنّفها كلها مراجع.
 */
export function legacyRelationsFromDocument(document, { baseType = null } = {}) {
  if (!document?.id || !document?.type) return [];
  const target = {
    documentId: document.id,
    documentType: document.type,
    documentNumber: document.number || null,
  };

  return Object.entries(document.links || {})
    .filter(([, link]) => link?.id)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([documentType, link]) => {
      const linkType = documentType === baseType ? 'BASE' : 'REFERENCE';
      return {
        ...createDocumentRelation({
          source: {
            documentId: link.id,
            documentType,
            documentNumber: link.number || null,
          },
          target,
          linkType,
        }),
        legacy: true,
        legacyField: `links.${documentType}`,
      };
    });
}

/**
 * يضم العلاقات المخزنة مع fallback القديم. الجديد يفوز عند تطابق الهوية،
 * فلا تظهر حافتان لنفس المصدر والهدف بعد بدء الكتابة في المجموعة الجديدة.
 */
export function compatibleDocumentRelations(document, storedRelations = [], options = {}) {
  const byId = new Map();
  for (const relation of storedRelations || []) {
    const normalized = createDocumentRelation(relation);
    byId.set(normalized.id, { ...relation, ...normalized });
  }
  for (const legacy of legacyRelationsFromDocument(document, options)) {
    if (!byId.has(legacy.id)) byId.set(legacy.id, legacy);
  }
  return [...byId.values()];
}

/** علاقات مستند بعينه في الاتجاهين، دون افتراض نوع طفل واحد. */
export function relationsTouchingDocument(relations, document) {
  const id = text(document?.id);
  const type = text(document?.type);
  if (!id || !type) return [];
  return (relations || []).filter((relation) => {
    const source = relation?.source || {};
    const target = relation?.target || {};
    return (source.documentId === id && source.documentType === type)
      || (target.documentId === id && target.documentType === type);
  });
}
