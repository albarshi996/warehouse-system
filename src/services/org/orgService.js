/**
 * الهيكل التنظيمي في السحابة — المصدر الحيّ الذي يعدّله المالك.
 *
 * البنية:
 *   org_structure/current                 ← النسخة العاملة (تُقرأ وتُكتب)
 *   org_structure/current/versions/{n}    ← لقطة كل حفظة، **لا تُعدَّل ولا تُحذف**
 *
 * لماذا الإصدارات؟ لأن هذه الوثيقة ستُعرض على سبع إدارات وتتغيّر في كل
 * اجتماع؛ بلا سجلّ لا أحد يعرف ماذا تغيّر ومتى ولماذا. الإصدار المرقّم
 * يجعل «قبل/بعد» في التقرير النهائي حقيقةً لا ادّعاءً.
 *
 * الأساس (`baseline`) هو ملف `src/data/org-structure.json` المرفق مع البناء:
 * إن لم تُنشأ نسخة سحابية بعد، تعمل الصفحة عليه مباشرة — فلا شاشة فارغة.
 */
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { validateTree } from './orgModel.js';

const COL = 'org_structure';
const CURRENT = 'current';
const VERSIONS = 'versions';

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

const currentRef = () => doc(db, COL, CURRENT);
const versionsRef = () => collection(db, COL, CURRENT, VERSIONS);

/**
 * يستمع للنسخة العاملة. يستدعي `callback(doc | null, pending)` —
 * `null` تعني «لا نسخة سحابية بعد» فتعمل الواجهة على الأساس المرفق.
 */
export function listenOrgStructure(callback) {
  return onSnapshot(currentRef(), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null, snap.metadata.hasPendingWrites);
  });
}

/** قراءة لمرة واحدة (للطباعة والتصدير خارج دورة الاستماع). */
export async function getOrgStructure() {
  const snap = await getDoc(currentRef());
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * حفظ نسخة جديدة: يتحقّق من صحة الشجرة أولًا، ثم يكتب لقطة في
 * `versions/{n}` ويحدّث `current`. اللقطة تُكتب **قبل** النسخة العاملة
 * فلا يضيع تاريخ إن انقطع الاتصال في المنتصف.
 *
 * @param {object} payload  { tree, supportFunctions, jobs, staffing, meta }
 * @param {string} note     سبب التعديل — يظهر في سجلّ الإصدارات
 */
export async function saveOrgStructure(payload, note, profile) {
  const verdict = validateTree(payload?.tree);
  if (!verdict.ok) {
    const err = new Error('الهيكل غير صالح:\n• ' + verdict.problems.join('\n• '));
    err.problems = verdict.problems;
    throw err;
  }

  const who = whoami(profile);
  const prev = await getDoc(currentRef());
  const version = (prev.exists() ? Number(prev.data().version) || 0 : 0) + 1;

  const body = {
    ...payload,
    version,
    note: note || '',
    savedAt: serverTimestamp(),
    ...who,
  };

  await setDoc(doc(versionsRef(), String(version).padStart(4, '0')), body);
  await setDoc(currentRef(), body);
  return version;
}

/** سجلّ الإصدارات (الأحدث أولًا) — لعرض «ماذا تغيّر ومتى». */
export async function listVersions(max = 25) {
  const q = query(versionsRef(), orderBy('version', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** قراءة إصدار بعينه — أساس مقارنة «قبل/بعد» مع أي نقطة في الماضي. */
export async function getVersion(version) {
  const snap = await getDoc(doc(versionsRef(), String(version).padStart(4, '0')));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * اعتماد النسخة الحالية من الإدارة العامة — يحوّل الحالة من مسودة إلى
 * معتمدة ويسجّل من اعتمد ومتى. لا يُغيّر الشجرة إطلاقًا.
 */
export async function approveOrgStructure(profile) {
  const cur = await getDoc(currentRef());
  if (!cur.exists()) throw new Error('لا توجد نسخة محفوظة لاعتمادها');
  const data = cur.data();
  return saveOrgStructure(
    { ...data, meta: { ...(data.meta || {}), status: 'approved', approvedAt: new Date().toISOString().slice(0, 10) } },
    'اعتماد النسخة من الإدارة العامة',
    profile
  );
}
