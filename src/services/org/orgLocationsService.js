/**
 * تخزين المواقع التنظيميّة (م٦-أ).
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ المنطق في `orgLocations.js` الخالص.
 *
 * **لا حذف:** موقعٌ حُمِّلت عليه تكلفةٌ تاريخيّة لا يُمحى — يُعطَّل بـ`active:false`
 * فتبقى تقارير الأمس مقروءة. ومن حذف موقعًا حوّل تكلفةً حقيقيّةً إلى «غير مربوط».
 */
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { locationProblems } from './orgLocations.js';
import { planOrgImport, sectorSeed } from './orgImport.js';
import { shapeBranchProfile, profileProblems } from './branchProfile.js';

const COL = 'org_locations';

/** استماعٌ لحظيّ لكلّ المواقع. الفشل ⇒ قائمةٌ فارغة ⇒ «غير مربوط» لا تعطيل. */
export function listenOrgLocations(callback, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('code')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      callback([]);
      onError?.(err);
    }
  );
}

/**
 * يحفظ موقعًا بعد التحقّق من الشجرة كاملةً — لا من الموقع وحده.
 * فحلقةُ ملكيّةٍ لا تظهر إلّا بالنظر إلى الشجرة، وموقعٌ سليمٌ منفردًا قد يُفسدها.
 */
export async function saveOrgLocation(location, allLocations = [], profile) {
  const others = (allLocations || []).filter((l) => String(l.code).toUpperCase() !== String(location?.code).toUpperCase());
  const problems = locationProblems([...others, location]);
  if (problems.length) throw new Error(problems.join(' · '));

  const code = String(location?.code || '').trim().toUpperCase();
  await setDoc(
    doc(db, COL, code),
    {
      ...location,
      code,
      active: location.active !== false,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return code;
}

/** تعطيلٌ لا حذف — فتبقى تقارير الأمس مقروءة. */
export function setOrgLocationActive(code, active, profile) {
  return setDoc(
    doc(db, COL, String(code).toUpperCase()),
    {
      active: Boolean(active),
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
}

/**
 * غرس الشجرة بالجملة ‹FNB-101› — يكتب ما أجازته خطّة الاستيراد **كاملًا أو لا شيء**.
 *
 * الحكم كلّه في `planOrgImport` الخالص (يُستدعى هنا مرّةً أخيرة على حال القاعدة
 * الراهنة — فالشاشة قد عاينت شجرةَ قبل ثوانٍ وتغيّرت). والكتابة `writeBatch`
 * ذرّيّة: فلا يقطع انقطاعُ شبكةٍ الشجرةَ نصفين.
 *
 * @returns {{written:number, counts:object}}
 */
export async function importOrgLocations(rows, existing = [], profile) {
  const plan = planOrgImport(rows, existing);
  if (!plan.ok) throw new Error(plan.problems.join(' · ') || 'لا صفوف صالحة للغرس.');

  const batch = writeBatch(db);
  for (const location of plan.toWrite) {
    batch.set(
      doc(db, COL, location.code),
      {
        ...location,
        updatedAt: serverTimestamp(),
        byUid: profile?.uid || null,
        byName: profile?.displayName || profile?.email || 'مستخدم',
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { written: plan.toWrite.length, counts: plan.counts };
}

/**
 * غرس البذرة التجريبيّة (حتّى يصل قرار المالك ق-O01) — تمرّ بنفس بوّابة
 * الاستيراد فلا طريقَ خلفيًّا يتجاوز الحارس.
 */
export function seedOrgLocations(existing = [], profile) {
  return importOrgLocations(sectorSeed(), existing, profile);
}

/**
 * حفظ الملفّ التشغيليّ للفرع ‹FNB-201› — **صفةٌ على صفّ الفرع** في
 * `org_locations`، لا مجموعةٌ ثانية تفترق عنه أوّل إعادة تسمية.
 * التحقّق في `branchProfile.js` الخالص، وهنا الكتابة وحدها.
 */
export async function saveBranchProfile(code, profile, location, currentUserProfile) {
  const branchCode = String(code || '').trim().toUpperCase();
  if (!branchCode) throw new Error('لا رمز فرع.');

  const shaped = shapeBranchProfile(profile);
  const problems = profileProblems({ ...(location || {}), code: branchCode, profile: shaped });
  if (problems.length) throw new Error(problems.join(' · '));

  await setDoc(
    doc(db, COL, branchCode),
    {
      profile: shaped,
      updatedAt: serverTimestamp(),
      byUid: currentUserProfile?.uid || null,
      byName: currentUserProfile?.displayName || currentUserProfile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return branchCode;
}
