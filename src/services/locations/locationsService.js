/**
 * سيّد مواقع التخزين — `bin_locations`.
 *
 *   bin_locations/{MAIN-A01-R01-B09-LF-P01}   ← المعرّف **هو** الكود
 *
 * لماذا مجموعةٌ مستقلّة لا توسعةٌ لـ`warehouses`؟ لأنّ `warehouses` ماستر
 * **منشآت** مسطّح (`code · name · manager · status`) بشاشته وقواعده، والمواقع
 * هرميّةٌ **داخله** وأكبر بمراتب: مستودعٌ واحد قد يحمل آلاف المواقع.
 *
 * ولماذا المعرّف هو الكود؟ لأنّ الكود هو الهويّة: يجعل الكتابة المتكرّرة
 * **تحديثًا لا تكرارًا**، ويجعل قراءة موقعٍ بعينه قراءةً واحدة بلا استعلام،
 * ويمنع وجود موقعين بالكود نفسه بحكم البنية لا بحكم فحصٍ قد يُنسى.
 *
 * **قاعدة الهويّة التاريخيّة:** الوصف والسعة والقواعد تُعدَّل؛ والكود **لا
 * يُغيَّر** بعد أوّل حركة — يُؤرشَف الموقع ويُنشأ بديل. ولا حذف إطلاقًا
 * (`delete:false` في القواعد) وإلّا انقطعت سلسلة التدقيق على حركاتٍ ماضية.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { normalizeLocationCode } from './locationCode.js';
import { locationProblems, shapeLocation } from './locationsModel.js';

const COL = 'bin_locations';
const BATCH_LIMIT = 500;

/**
 * ⚠️ هذه القائمة **يجب أن تطابق** `isManager()` في `firestore.rules`.
 * (درسُ ل‑١٨: `BALANCES_ROLES` ادّعى تطابقًا لم يكن، فصارت الشاشة تمنع من
 * تسمح له القاعدة — وتناقضٌ كهذا يُكتشف يوم التشغيل لا يوم الكتابة.)
 */
export const LOCATIONS_ROLES = ['admin', 'warehouse_manager'];

export function canEditLocations(role) {
  return LOCATIONS_ROLES.includes(role);
}

function whoami(profile) {
  return {
    byUid: auth?.currentUser?.uid || null,
    byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
  };
}

/** يستمع لكلّ المواقع لحظيًّا مرتّبةً بالكود. يُعيد دالّة إلغاء الاشتراك. */
export function listenLocations(cb, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('code')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onError?.(e)
  );
}

/** قراءةٌ واحدة لكلّ المواقع — للاقتراح والمطابقة (لحظةٌ لا حلقة). */
export async function fetchLocationsOnce() {
  const s = await getDocs(collection(db, COL));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** موقعٌ بعينه بكوده — قراءةٌ واحدة بلا استعلام (المعرّف هو الكود). */
export async function getLocation(code) {
  const id = normalizeLocationCode(code);
  if (!id) return null;
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * إنشاء موقعٍ أو تحديثه. المعرّف هو الكود، فإعادة الحفظ تحديثٌ لا تكرار.
 * `createdAt` يُكتب مرّةً واحدة عند الإنشاء ولا يُدهس بعدها.
 */
export async function saveLocation(input, profile) {
  const problems = locationProblems(input);
  if (problems.length) throw new Error(problems.join(' · '));

  const shaped = shapeLocation(input);
  const ref = doc(db, COL, shaped.code);
  const existing = await getDoc(ref);

  await setDoc(
    ref,
    {
      ...shaped,
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      ...whoami(profile),
    },
    { merge: true }
  );
  return shaped.code;
}

/**
 * أرشفة موقع — **لا حذف**. الحركات الماضية تشير إليه، ومحوُه يقطع أثرها.
 * وهذا هو البديل المعتمَد عن «تغيير الكود»: يُؤرشَف القديم ويُنشأ الجديد.
 */
export async function archiveLocation(code, profile) {
  const id = normalizeLocationCode(code);
  if (!id) throw new Error('كود الموقع مطلوب.');
  await updateDoc(doc(db, COL, id), {
    status: 'archived',
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}

/** تغيير حالة موقع (فعّال · محجوز · ممتلئ · متوقّف · صيانة). */
export async function setLocationStatus(code, status, profile) {
  const id = normalizeLocationCode(code);
  if (!id) throw new Error('كود الموقع مطلوب.');
  await updateDoc(doc(db, COL, id), {
    status,
    updatedAt: serverTimestamp(),
    ...whoami(profile),
  });
}

/**
 * إنشاء مواقع بالجملة — توليد رفوفٍ ومستوياتٍ دفعةً واحدة.
 * يرفض **الدفعة كلّها** إن كان فيها كودٌ واحد غير صالح: إنشاءٌ جزئيّ صامت
 * يترك المستودع نصفَ معرَّف ولا أحد يعلم أيّ نصف.
 */
export async function saveLocationsBulk(inputs, profile) {
  const shaped = [];
  const rejected = [];
  for (const input of inputs || []) {
    const problems = locationProblems(input);
    if (problems.length) rejected.push({ code: input?.code ?? '', problems });
    else shaped.push(shapeLocation(input));
  }
  if (rejected.length) {
    const head = rejected.slice(0, 3).map((r) => `«${r.code}»: ${r.problems[0]}`).join(' · ');
    throw new Error(`${rejected.length} كودًا غير صالح — لم يُحفظ شيء. ${head}`);
  }

  const seen = new Set();
  const unique = shaped.filter((s) => (seen.has(s.code) ? false : seen.add(s.code)));

  for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const s of unique.slice(i, i + BATCH_LIMIT)) {
      batch.set(
        doc(db, COL, s.code),
        { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...whoami(profile) },
        { merge: true }
      );
    }
    await batch.commit();
  }
  return { saved: unique.length, duplicates: shaped.length - unique.length };
}
