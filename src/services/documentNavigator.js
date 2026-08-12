/**
 * متصفح موحّد داخل نوع المستند الواحد — منطق خالص بلا Firestore أو DOM.
 *
 * هذا ليس خريطة علاقات: السابق/التالي جاران في فهرس النوع، ولو لم تربطهما
 * أي علاقة تشغيلية. الخريطة لها خدمة ومكوّن مستقلان كي لا تختلط الدلالتان.
 */

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function text(value) {
  return String(value ?? '').trim();
}

function comparableText(value) {
  return text(value).toLocaleLowerCase('ar');
}

export function documentTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value?.toMillis === 'function') {
    const millis = Number(value.toMillis());
    return Number.isFinite(millis) ? millis : 0;
  }
  if (Number.isFinite(Number(value?.seconds))) {
    const seconds = Number(value.seconds);
    const nanoseconds = Number(value.nanoseconds) || 0;
    return (seconds * 1000) + (nanoseconds / 1e6);
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortDocuments(a, b) {
  const time = documentTimestamp(a.createdAt) - documentTimestamp(b.createdAt);
  if (time) return time;
  const number = COLLATOR.compare(text(a.number), text(b.number));
  if (number) return number;
  return COLLATOR.compare(text(a.id), text(b.id));
}

function canReadDocument(document, canRead) {
  if (typeof canRead !== 'function') return true;
  try {
    return canRead(document) === true;
  } catch {
    return false;
  }
}

function searchableValues(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return [];
  if (['string', 'number', 'boolean'].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => searchableValues(item, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => searchableValues(item, depth + 1));
  }
  return [];
}

export function documentSearchText(document) {
  return comparableText([
    document?.number,
    document?.id,
    document?.type,
    document?.state,
    ...searchableValues(document?.header),
  ].filter((value) => value !== null && value !== undefined).join(' '));
}

/** فهرس النوع بعد حارس الصلاحية، مرتب من الأقدم إلى الأحدث ترتيبًا حتميًا. */
export function documentsOfType(documents, type, { canRead } = {}) {
  const wantedType = text(type);
  if (!wantedType) return [];
  const unique = new Map();
  for (const document of documents || []) {
    if (!document?.id || document.type !== wantedType || !canReadDocument(document, canRead)) continue;
    const current = unique.get(document.id);
    if (!current || documentTimestamp(document.updatedAt) >= documentTimestamp(current.updatedAt)) {
      unique.set(document.id, document);
    }
  }
  return [...unique.values()].sort(sortDocuments);
}

/**
 * يبني حالة الأزرار والبحث. الحدود تعيد null ولا تلتفّ من الأخير إلى الأول؛
 * فالتفاف صامت قد يفتح مستندًا بعيدًا عند تكرار الضغط.
 */
export function documentNavigator(documents, {
  type,
  currentId = null,
  query = '',
  canRead,
} = {}) {
  const ordered = documentsOfType(documents, type, { canRead });
  const wantedId = text(currentId);
  const index = wantedId ? ordered.findIndex((document) => document.id === wantedId) : -1;
  const normalizedQuery = comparableText(query);
  const searchResults = normalizedQuery
    ? ordered.filter((document) => documentSearchText(document).includes(normalizedQuery))
    : ordered;

  return {
    type: text(type) || null,
    currentId: wantedId || null,
    total: ordered.length,
    position: index >= 0 ? index + 1 : 0,
    first: ordered[0] || null,
    previous: index > 0 ? ordered[index - 1] : null,
    current: index >= 0 ? ordered[index] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
    last: ordered[ordered.length - 1] || null,
    searchResults,
    ordered,
  };
}

/** رابط شاشة المستند القائم أو الجديد مع إبقاء URL الرسمي نفسه. */
export function documentScreenUrl({ type, id = null, base = '/dashboard/document' } = {}) {
  const cleanType = text(type);
  if (!cleanType) return null;
  const params = new URLSearchParams({ type: cleanType });
  const cleanId = text(id);
  if (cleanId) params.set('id', cleanId);
  return `${base}?${params.toString()}`;
}

