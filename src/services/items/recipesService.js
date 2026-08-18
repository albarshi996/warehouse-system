/**
 * تخزين الوصفات ‹FNB-501›.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. كلّ المنطق في `recipe.js` الخالص.
 *
 * **نسخٌ لا تعديل:** الوصفة لا تُكتب فوق نسخةٍ قائمة — كلّ حفظٍ نسخةٌ جديدة
 * برقمٍ أعلى تشير إلى سابقتها (`supersedes`)، والقديمة تبقى لتفسير استهلاكِ
 * أيّامها. والمعرّف `outputSku@vN` من `recipeId` — لا معرّفَ عشوائيًّا،
 * فالكتابة فوق النسخة نفسها تنكشف رفضَ إنشاءٍ في القاعدة لا دهسًا صامتًا.
 */
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { shapeRecipe, recipeId, recipeProblems, indexRecipes } from './recipe.js';

const COL = 'recipes';

/** استماعٌ لحظيّ لكلّ النسخ — الفهرسة والاختيار في المنطق الخالص. */
export function listenRecipes(callback, onError) {
  return onSnapshot(
    query(collection(db, COL), orderBy('outputSku')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      callback([]);
      onError?.(err);
    }
  );
}

/**
 * يحفظ **نسخةً جديدة**: يتحقّق بالمنطق الخالص، ويرقّم فوق أحدث نسخةٍ قائمة،
 * ويشير إليها. لا يلمس النسخ السابقة.
 *
 * @param {object} recipe الوصفة (بلا رقم نسخة — يُحسب هنا)
 * @param {object[]} allRecipes النسخ القائمة (من `listenRecipes`)
 * @param {Map} itemsBySku فهرس الماستر للتحقّق
 * @param {object} profile كاتب النسخة
 */
export async function saveRecipeVersion(recipe, allRecipes = [], itemsBySku = new Map(), profile) {
  const index = indexRecipes(allRecipes);
  const prior = index.get(shapeRecipe(recipe).outputSku) || [];
  const latest = prior[0] || null;

  const shaped = shapeRecipe({
    ...recipe,
    version: (latest?.version || 0) + 1,
    supersedes: latest ? recipeId(latest) : '',
  });

  const problems = recipeProblems(shaped, itemsBySku);
  if (problems.length) throw new Error(problems.join(' · '));

  const id = recipeId(shaped);
  await setDoc(doc(db, COL, id), {
    ...shaped,
    createdAt: serverTimestamp(),
    byUid: profile?.uid || null,
    byName: profile?.displayName || profile?.email || 'مستخدم',
  });
  return id;
}

/** تعطيل نسخةٍ (لا حذف) — تبقى مقروءةً لتفسير التاريخ ولا تُختار للجديد. */
export function setRecipeActive(id, active, profile) {
  return setDoc(
    doc(db, COL, String(id)),
    {
      active: Boolean(active),
      updatedAt: serverTimestamp(),
      byUid: profile?.uid || null,
      byName: profile?.displayName || profile?.email || 'مستخدم',
    },
    { merge: true }
  );
}
