/**
 * تخزين العروض الترويجيّة — قراءةً وكتابةً واستهلاكَ ميزانيّة.
 *
 * ⚠️ تلمس Firestore فلا تُختبَر في Node. المنطق كلّه في `promotionModel.js`
 * و`promotionEngine.js` الخالصَين.
 *
 * ═══ لماذا الاستهلاك بـincrement لا بالقراءة ثمّ الكتابة؟ ═══
 * لأنّ مندوبَين قد يبيعان في اللحظة نفسها من عرضٍ ميزانيّته آخر عشر وحدات.
 * القراءةُ ثمّ الكتابة تجعل كليهما يقرأ «صفر مستهلَك» فيمنحان عشرين. و`increment`
 * ذرّيّ على الخادم فلا يضيع أثر أحدهما. السقف قد يُتجاوَز بطلبٍ واحدٍ في أسوأ
 * الحالات (لأنّ الفحص يسبق الكتابة)، وهو انحرافٌ مقبول مقابل ألّا يضيع العدّ
 * أصلًا — ومنعُه التامّ يحتاج معاملةً تقرأ العرض داخلها، وهي كلفةٌ لا تستحقّ.
 */
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { promotionVerdict } from './promotionModel.js';

const PROMOS = 'promotions';

function whoami(profile) {
  return {
    byUid: profile?.uid || null,
    byName: profile?.displayName || profile?.email || 'مستخدم',
    byRole: profile?.role || null,
  };
}

/** استماعٌ لحظيّ لكلّ العروض — الواجهة تُصفّي السارية بـ`isPromoLive`. */
export function listenPromotions(callback, onError) {
  return onSnapshot(
    query(collection(db, PROMOS), orderBy('priority')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err)
  );
}

/** يحفظ عرضًا بعد التحقّق — لا يُحفظ عرضٌ معطوب فينتظره الجميع بلا أثر. */
export async function savePromotion(promo, profile) {
  const verdict = promotionVerdict(promo);
  if (!verdict.ok) throw new Error(verdict.problems.join(' · '));

  const id = String(promo?.id || '').trim() || doc(collection(db, PROMOS)).id;
  const payload = {
    ...promo,
    id,
    code: String(promo.code).trim().toUpperCase(),
    priority: Number(promo.priority) || 10,
    active: promo.active !== false,
    ...whoami(profile),
    updatedAt: serverTimestamp(),
  };
  // الاستهلاك لا يُدهس بالحفظ — يملكه `consumeBudget` وحده.
  delete payload.usage;
  await setDoc(doc(db, PROMOS, id), payload, { merge: true });
  return id;
}

export async function setPromotionActive(id, active, profile) {
  await updateDoc(doc(db, PROMOS, id), {
    active: Boolean(active),
    ...whoami(profile),
    updatedAt: serverTimestamp(),
  });
}

/**
 * يقيّد استهلاك الميزانيّة بعد اعتماد الفاتورة — ذرّيًّا بـ`increment`.
 * يُستدعى بنتيجة `budgetConsumption(result)`.
 */
export async function consumeBudget(consumption) {
  for (const c of consumption || []) {
    if (!c?.promoId) continue;
    await updateDoc(doc(db, PROMOS, c.promoId), {
      'usage.freeUnits': increment(Number(c.freeUnits) || 0),
      'usage.value': increment(Number(c.value) || 0),
      'usage.orders': increment(1),
      updatedAt: serverTimestamp(),
    });
  }
}
