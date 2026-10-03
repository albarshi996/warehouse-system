/**
 * تخزينُ تهيئة الأوزان — `settings/weights`. ‹WMS-601›
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلُّ القرار في `rulesProfile.js`
 * الخالصِ المُختبَر — وهذه كتابةٌ وقراءةٌ وحدَهما (نفسُ فصلِ
 * `settingsService` ↔ `settingsModel` حرفًا).
 *
 * ★★★ **ولا مجموعةَ جديدةً ولا قاعدةَ أمنٍ تُنشَر.** الوثيقةُ في مجموعة
 * `settings` القائمة، وقاعدتُها `match /settings/{docId}` تغطّي **أيَّ وثيقةٍ
 * فيها**: قراءةٌ لكلّ مُصادَق، وكتابةٌ للأدمن وحده. فلا ينتظر هذا العملُ
 * المالكَ لينشر `firestore.rules` — ولو احتاج مجموعةً جديدةً لَبقي معطَّلًا
 * حتّى يُنشَر، و«مبنيٌّ ومنشورٌ وبلا مستدعٍ» دَرسٌ مكتوبٌ بثمنه.
 *
 * ★★ والصلاحيّةُ هنا **للأدمن وحده بحكم القاعدة**: وزنٌ يعدّله من تُقيّده
 * نتائجُه ليس وزنًا. ومديرُ المستودع يقرأ ولا يكتب — كشأن سياسات التشغيل.
 *
 * ═══ والفشلُ لا يُسكت النظام ═══
 * أيُّ تعذّرٍ في القراءة يُنادي `callback` بملفٍّ فارغ — **وملفٌّ فارغٌ يعني
 * الثوابتَ المعلنةَ حرفًا** (`resolveWeights`). فشبكةٌ منقطعةٌ لا تعني
 * محرّكًا بلا أوزان.
 */
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { SETTINGS_COLLECTION } from './settingsModel.js';
import { applyChange, resetScope } from './rulesProfile.js';

/** وثيقةُ الأوزان — في مجموعة الإعدادات نفسِها (انظر رأس الملفّ). */
export const WEIGHTS_DOC = 'weights';

const ref = () => doc(db, SETTINGS_COLLECTION, WEIGHTS_DOC);

/** الملفُّ الفارغ — وهو **الثوابتُ المعلنة** عند `resolveWeights`. */
const EMPTY = Object.freeze({ sets: {} });

/** يُسقط الحمولةَ إلى شكلٍ آمن: `sets` كائنٌ دائمًا. */
function shape(raw) {
  if (!raw || typeof raw !== 'object') return { sets: {} };
  return { sets: raw.sets && typeof raw.sets === 'object' ? raw.sets : {} };
}

/**
 * اشتراكٌ حيٌّ بتهيئة الأوزان.
 *
 * @param {(profile:object, meta:{exists:boolean})=>void} callback
 * @param {(err:Error)=>void} [onError]
 * @returns {()=>void}
 */
export function listenRulesProfile(callback, onError) {
  return onSnapshot(
    ref(),
    (snap) => callback(shape(snap.exists() ? snap.data() : null), { exists: snap.exists() }),
    (err) => {
      callback({ ...EMPTY }, { exists: false });
      onError?.(err);
    }
  );
}

/** قراءةٌ لمرّةٍ واحدة — وأيُّ تعذّرٍ يعود بالفارغ أي بالثوابت. */
export async function getRulesProfile() {
  try {
    const snap = await getDoc(ref());
    return shape(snap.exists() ? snap.data() : null);
  } catch {
    return { ...EMPTY };
  }
}

/**
 * يُطبّق تعديلًا ويكتبه — **والحكمُ كلُّه في `applyChange` الخالص**.
 *
 * ★ ولا يُكتب شيءٌ إن رُدّ الحكم: فرقعةٌ فاسدةٌ لا تلمس القاعدة.
 *
 * @returns {Promise<{ok:boolean, problem:string, problems:string[], entry:object|null}>}
 */
export async function saveWeightChange(current, change, profile) {
  const verdict = applyChange(current, {
    ...change,
    actor: profile?.uid || change?.actor || '',
    actorName: profile?.displayName || profile?.email || change?.actorName || '',
    at: Date.now(),
  });
  if (!verdict.ok) return { ok: false, problem: verdict.problem, problems: verdict.problems, entry: null };

  await setDoc(
    ref(),
    {
      sets: verdict.profile.sets,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
  return { ok: true, problem: '', problems: [], entry: verdict.entry };
}

/** يُعيد نطاقًا إلى ثوابته — حذفُ تجاوزٍ لا كتابةُ أصفار. */
export async function resetWeightScope(current, change, profile) {
  const verdict = resetScope(current, {
    ...change,
    actor: profile?.uid || change?.actor || '',
    actorName: profile?.displayName || profile?.email || change?.actorName || '',
    at: Date.now(),
  });
  if (!verdict.ok) return { ok: false, problem: verdict.problem, entry: null };

  // ★★ `setDoc` بـ`merge` **لا يحذف مفتاحًا** — فتُكتب `sets` كاملةً كما
  // أخرجها المنطقُ الخالص. ولو دُمجت لبقي تجاوزُ المستودع المحذوفُ في القاعدة
  // ورجع بعد إعادة التحميل، فيظنّ المالكُ الإعادةَ فشلت وهي نُفِّذت.
  await setDoc(
    ref(),
    {
      sets: verdict.profile.sets,
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: false }
  );
  return { ok: true, problem: '', entry: verdict.entry };
}
