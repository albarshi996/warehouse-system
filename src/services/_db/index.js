/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  البابُ الواحد — كلُّ وصولٍ إلى قاعدة البيانات يمرّ من هنا
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ الفجوة التي يسدّها (قِيست من الشيفرة 2026-09-02) ═══
 * ٦٢ خدمةً كانت تستورد `firebase/firestore` مباشرةً. فأيُّ تغييرٍ في القاعدة
 * يعني لمسَ ٦٢ ملفًّا، وأيُّ نسيانٍ لواحدٍ منها يعني **بابًا خلفيًّا صامتًا**
 * يظلّ يكتب في القاعدة القديمة بعد التحويل ولا يعلم أحد.
 *
 * والآن: مستوردٌ واحدٌ لـFirestore في المشروع كلِّه — و**حارسٌ مُمَكْنَنٌ**
 * (`seam.test.js`) يُسقط `npm test` إن عاد أحدٌ يستورده من خارج هذا المجلّد.
 * فالحدُّ يُمكنَن أو لا يوجد.
 *
 * ═══ التقسيم ═══
 *   `backend.js`     القرارُ — منطقٌ خالصٌ يُختبَر في Node بلا سحابة
 *   `firestore.js`   المحوَّلُ القائم — إعادةُ تصديرٍ حرفيّةٌ بلا طبقة
 *   `index.js`       هذا الملفّ: يصل الاثنين ولا يقرّر شيئًا بنفسه
 *   `postgres.js`    ← يُضاف هنا، ويُقاس بالعقد نفسِه (`REQUIRED_SYMBOLS`)
 *
 * الاستعمال في الخدمات:
 *   import { db, doc, setDoc, serverTimestamp } from '../_db/index.js';
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { backendNameFrom, pickBackend } from './backend.js';
import * as firestore from './firestore.js';

/**
 * بيئةُ البناء. يملؤها Astro وقتَ البناء ولا وجودَ لها في Node العاري —
 * فالقراءةُ محروسةٌ كي لا تنكسر أدواتُ السطر.
 */
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** المحوّلاتُ المتاحة. يُضاف `postgres` هنا حين يجهز — سطرٌ واحد. */
const BACKENDS = { firestore };

/** اسمُ المحوَّل العامل — يُقرأ في التشخيص. */
export const BACKEND = backendNameFrom(ENV);

const impl = pickBackend(BACKEND, BACKENDS);

/* ═══════════════════ المراجع ═══════════════════ */
export const doc = impl.doc;
export const collection = impl.collection;

/* ═══════════════════ الاستعلام ═══════════════════ */
export const query = impl.query;
export const where = impl.where;
export const orderBy = impl.orderBy;
export const limit = impl.limit;
export const startAfter = impl.startAfter;
export const documentId = impl.documentId;

/* ═══════════════════ القراءة ═══════════════════ */
export const getDoc = impl.getDoc;
export const getDocs = impl.getDocs;
export const getDocFromServer = impl.getDocFromServer;
export const onSnapshot = impl.onSnapshot;

/* ═══════════════════ الكتابة ═══════════════════ */
export const setDoc = impl.setDoc;
export const updateDoc = impl.updateDoc;
export const addDoc = impl.addDoc;
export const deleteDoc = impl.deleteDoc;
export const writeBatch = impl.writeBatch;
export const runTransaction = impl.runTransaction;

/* ═══════════════════ القيم الخادميّة ═══════════════════ */
export const serverTimestamp = impl.serverTimestamp;
export const increment = impl.increment;
export const arrayUnion = impl.arrayUnion;
export const arrayRemove = impl.arrayRemove;

/* ═══════════════════ الأنواع والمثيل ═══════════════════ */
export const Timestamp = impl.Timestamp;
export const db = impl.db;
