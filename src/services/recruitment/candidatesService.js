/**
 * خدمة المرشحين — منظومة التوظيف الذكية (المحور 1).
 *
 * البنية:
 *   candidates/{id}            ← بطاقة المرشح (خفيفة — بلا ملف السيرة)
 *      ├── files/cv            ← السيرة مرمّزة base64 (تُجلب عند الطلب فقط)
 *      └── audit/{id}          ← append-only: من فعل ماذا ومتى (نمطنا الدائم)
 *
 * لماذا السيرة في مستند فرعي؟ لأن جدول المرشحين يستمع لحظيًّا — لو كانت
 * السيرة في البطاقة لسحب كلَّ السير مع كل تحديث. الفصل يجعل القائمة خفيفة
 * والسيرة تُفتح عند الحاجة.
 *
 * الصلاحية (قرار المالك 2026-07-16): المدير العام ومدير المستودع فقط —
 * بيانات حسّاسة (أسماء · هواتف · سير · رواتب متوقّعة). العملة: دينار ليبي.
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { validateCv } from './cvFile.js';

const COL = 'candidates';

/** الأدوار المخوَّلة — تُطابق firestore.rules (عدّلهما معًا). */
export const RECRUITMENT_ROLES = ['admin', 'warehouse_manager'];

export function canRecruit(role) {
  return RECRUITMENT_ROLES.includes(role);
}

/** خطّ أنابيب المرشح — رحلة واضحة لا نصّ حرّ. */
export const CANDIDATE_STATES = {
  new: { id: 'new', label: 'جديد', emoji: '📥', color: '#3b82f6' },
  screening: { id: 'screening', label: 'قيد الفرز', emoji: '🔎', color: '#f59e0b' },
  interview: { id: 'interview', label: 'مقابلة', emoji: '🗣️', color: '#8b5cf6' },
  accepted: { id: 'accepted', label: 'مقبول', emoji: '✅', color: '#10b981' },
  rejected: { id: 'rejected', label: 'مرفوض', emoji: '❌', color: '#ef4444' },
  withdrawn: { id: 'withdrawn', label: 'انسحب', emoji: '🚪', color: '#6b7280' },
};

export function candidateState(id) {
  return CANDIDATE_STATES[id] || CANDIDATE_STATES.new;
}

function me(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** قيد تدقيق دائم — لا يُعدَّل ولا يُحذف. */
function appendAudit(candidateId, { action, note = '', profile }) {
  return addDoc(collection(db, COL, candidateId, 'audit'), {
    action,
    note: String(note || ''),
    ...me(profile),
    at: serverTimestamp(),
  });
}

/**
 * يضيف مرشحًا. `job` من الكتالوج (يُخزَّن معرّفه ومسمّاه معًا — فلو تغيّر
 * الكتالوج لاحقًا بقيت بطاقة المرشح تحكي ما قُدِّم إليه فعلًا).
 * `cvFile` اختياري (File من المتصفح) — يُتحقّق منه ويُرمّز ويُحفظ فرعيًّا.
 */
export async function addCandidate({ name, phone, job, expectedSalary, notes, cvFile, profile }) {
  if (!String(name || '').trim()) throw new Error('اسم المرشح إلزامي.');
  if (!job?.id) throw new Error('اختر الوظيفة.');

  let cvMeta = null;
  let cvBase64 = null;
  if (cvFile) {
    const check = validateCv(cvFile);
    if (!check.ok) throw new Error(check.error);
    cvBase64 = await fileToBase64(cvFile);
    cvMeta = { fileName: cvFile.name, kind: check.kind, size: cvFile.size };
  }

  const ref = await addDoc(collection(db, COL), {
    name: String(name).trim(),
    phone: String(phone || '').trim(),
    jobId: job.id,
    jobTitle: job.title,
    expectedSalary: Number(expectedSalary) || 0, // بالدينار الليبي
    notes: String(notes || '').trim(),
    state: 'new',
    hasCv: Boolean(cvMeta),
    cvMeta,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...me(profile),
  });

  if (cvMeta) {
    await setDoc(doc(db, COL, ref.id, 'files', 'cv'), { ...cvMeta, data: cvBase64 });
  }
  await appendAudit(ref.id, { action: 'create', note: `تقدّم لوظيفة ${job.title}`, profile });
  return ref.id;
}

/** ينقل مرشحًا في الخط — الرفض يلزمه سبب (يُوثَّق باسم من رفض). */
export async function setCandidateState(candidateId, state, { note = '', profile } = {}) {
  if (!CANDIDATE_STATES[state]) throw new Error('حالة غير معروفة.');
  if (state === 'rejected' && !String(note).trim()) {
    throw new Error('اكتب سبب الرفض — القرار بلا سبب لا يُوثَّق.');
  }
  await updateDoc(doc(db, COL, candidateId), { state, updatedAt: serverTimestamp() });
  await appendAudit(candidateId, { action: state, note, profile });
}

/** يستمع للمرشحين لحظيًّا (الأحدث أولًا). */
export function listenCandidates(callback, onError) {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** يجلب السيرة عند الطلب ويفتحها في تبويب (لا تُحمَّل مع القائمة أبدًا). */
export async function openCv(candidateId) {
  const snap = await getDoc(doc(db, COL, candidateId, 'files', 'cv'));
  if (!snap.exists()) throw new Error('لا سيرة مرفقة لهذا المرشح.');
  const { data, kind, fileName } = snap.data();
  const mime = kind === 'PDF' ? 'application/pdf' : kind === 'PNG' ? 'image/png' : 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const win = window.open(url, '_blank');
  if (!win) {
    // مانع النوافذ — نلجأ للتنزيل المباشر.
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'cv';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** يستمع لسجلّ تدقيق مرشح (قصّته بالترتيب). */
export function listenCandidateAudit(candidateId, callback) {
  const q = query(collection(db, COL, candidateId, 'audit'), orderBy('at', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف.'));
    r.readAsDataURL(file);
  });
}
