/**
 * طبقة Firestore لعلاقات المستندات الملحقة-فقط.
 *
 * تبقى قواعد الهوية والدلالات في `documentRelations.js` الخالص، بينما تحصر
 * هذه الطبقة القراءة والكتابة الفعلية في مجموعة `document_links`. لا تُحدّث
 * علاقة منشورة ولا تحذفها: إعادة الطلب المطابقة noop، والمختلفة تعارض صريح.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '../../config/firebase.js';
import {
  compatibleRelationshipNeighborhood,
  createDocumentRelation,
  DOCUMENT_RELATIONS_COLLECTION,
  idempotentRelationDecision,
  mergeRelationResults,
  relationStorageRecord,
} from './documentRelations.js';
import { getSchema } from './schemas/index.js';
import { primaryParentType } from './schemaUtils.js';

const DOCUMENTS_COLLECTION = 'documents';

export {
  DOCUMENT_RELATIONS_COLLECTION,
  mergeRelationResults,
  relationStorageRecord,
} from './documentRelations.js';

function text(value) {
  return String(value ?? '').trim();
}

function actorFrom(profile = {}) {
  const uid = text(auth?.currentUser?.uid);
  if (!uid) throw new Error('يجب تسجيل الدخول قبل كتابة علاقة مستند.');
  return {
    uid,
    name: text(profile?.name || auth?.currentUser?.email) || 'غير معروف',
    role: text(profile?.role),
  };
}

/**
 * يضيف علاقة واحدة بطريقة حتمية. لا توجد عملية update مطلقًا على المجموعة.
 */
export async function appendDocumentRelation(input, profile = {}) {
  const proposed = createDocumentRelation(input);
  const actor = actorFrom(profile);
  const ref = doc(db, DOCUMENT_RELATIONS_COLLECTION, proposed.id);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    const decision = idempotentRelationDecision(existing, proposed);
    if (decision.action === 'create') {
      transaction.set(ref, relationStorageRecord(proposed, actor, serverTimestamp()));
    }
    return decision;
  });
}

/**
 * يجلب علاقات المستند في الاتجاهين. الاستعلامان أحاديا الحقل ولا يحتاجان
 * فهرسًا مركبًا؛ التحقق من النوع محلي لأن معرف المستند هو مفتاح البحث.
 */
export async function fetchDocumentRelations(document) {
  const documentId = text(document?.id);
  const documentType = text(document?.type);
  if (!documentId || !documentType) return [];

  const relations = collection(db, DOCUMENT_RELATIONS_COLLECTION);
  const [outgoing, incoming] = await Promise.all([
    getDocs(query(relations, where('source.documentId', '==', documentId))),
    getDocs(query(relations, where('target.documentId', '==', documentId))),
  ]);
  const unpack = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  return mergeRelationResults(unpack(outgoing), unpack(incoming)).filter((relation) => (
    (relation.source?.documentId === documentId && relation.source?.documentType === documentType)
    || (relation.target?.documentId === documentId && relation.target?.documentType === documentType)
  ));
}

/**
 * يجلب جوار الخريطة مع fallback قديم صريح عند عدم نشر قواعد المجموعة بعد.
 * لا تُخفي النتيجة هذا الحدّ: `storedAvailable=false` يتيح للواجهة إبلاغ
 * المستخدم أن المعروض مبني على روابط الرأس القديمة وحدها في هذه الجلسة.
 */
export async function fetchDocumentRelationshipNeighborhood(document, legacyDocuments = []) {
  let storedRelations = [];
  let storedAvailable = true;
  try {
    storedRelations = await fetchDocumentRelations(document);
  } catch {
    storedAvailable = false;
  }

  const baseTypeFor = (type) => primaryParentType(getSchema(type));
  const relations = compatibleRelationshipNeighborhood(
    document,
    storedRelations,
    legacyDocuments,
    { baseTypeFor },
  );

  const documents = new Map(
    [document, ...(legacyDocuments || [])]
      .filter((item) => item?.id)
      .map((item) => [item.id, item]),
  );
  const endpointIds = new Set(relations.flatMap((relation) => [
    relation.source?.documentId,
    relation.target?.documentId,
  ]).filter(Boolean));
  const missingIds = [...endpointIds].filter((id) => !documents.has(id));

  await Promise.all(missingIds.map(async (id) => {
    try {
      const snapshot = await getDoc(doc(db, DOCUMENTS_COLLECTION, id));
      if (snapshot.exists()) documents.set(id, { id: snapshot.id, ...snapshot.data() });
    } catch {
      // بيانات طرف العلاقة المخزنة تكفي لبطاقة قابلة للفتح حتى لو تعذرت قراءة الرأس.
    }
  }));

  return { relations, documents: [...documents.values()], storedAvailable };
}
