/**
 * ‹EXP-CLS› خدمةُ كشوف إقفال المصروفات — مجموعةٌ خاصّةٌ `expense_closings`.
 *
 * المبادئ (نمطُ `cashCustodyService`):
 *   - كلُّ وصولٍ إلى القاعدة من البابِ الواحد `_db/index.js`.
 *   - الكشوفُ **تُضاف ولا تُعدَّل ولا تُحذف** (الإلزامُ في `firestore.rules`)؛ كشفٌ خاطئٌ
 *     لا يُمحى — فالتسويةُ مع الماليّة أثرٌ لا يُعاد كتابتُه.
 *   - لا تُكتب حرفًا على مستندات المصاريف: العضويّةُ تُشتقّ من الكشوف (`closedIndex`).
 *   - الحكمُ كلُّه في `expenseClosing.js` الخالص؛ هذه تكتب ما بناه وتقرأ.
 */
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot, query, serverTimestamp, db } from '../_db/index.js';
import { auth } from '../../config/firebase.js';
import { canCloseExpenses, closedIndex, nextClosingNumber } from './expenseClosing.js';

const COL = 'expense_closings';
/** محاولاتُ حجز رقمٍ فريد — «قفزٌ لا رفض» عند التصادم، بسقفٍ فلا يتعلّق المولّد. */
const MAX_TRIES = 8;
const isTaken = (e) => {
  const s = String(e?.code || e?.message || '');
  return s.includes('permission-denied') || s.includes('already-exists');
};

/** يستمع لكلّ الكشوف — الأحدثُ أوّلًا (ترتيبٌ محليّ، بلا فهرسٍ مركّب). */
export function subscribeExpenseClosings(callback, onError) {
  return onSnapshot(
    query(collection(db, COL)),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (Number(b.closedAtMs) || 0) - (Number(a.closedAtMs) || 0));
      callback(rows);
    },
    (err) => onError?.(err)
  );
}

/**
 * يحفظ كشفَ إقفالٍ بناه `buildClosing`. يتحقّق من الهويّة والدور، ويختم الكاتب.
 * @param {object} closing ناتجُ `buildClosing().closing`.
 * @param {object} profile ملفُّ المستخدم (role · name).
 * @returns {Promise<{id:string, number:string}>} معرّفُ الكشف = رقمُه **الفعليّ**.
 *
 * ★★★ **الرقمُ هو المعرّف — التفرّدُ تفرضه القاعدةُ لا مقارنةٌ** (نمطُ المستودع
 *     `reference-firestore-uniqueness-by-id`): الكشفُ يُكتب بـ`setDoc(doc(COL, number))`،
 *     فكتابةُ كاتبٍ ثانٍ بالرقم نفسِه تصير «تحديثًا» تردّه قاعدةُ `allow update: if false`
 *     ذرّيًّا على الويب — فلا يوجد إلّا كشفٌ واحدٌ بكلّ رقمٍ أبدًا. وعلى المحلّيّ (كاتبٌ
 *     واحد) حارسُ `getDoc` يسبق الكتابة. **والتصادمُ قفزٌ لا رفض:** يُعاد حسابُ الرقم
 *     على قراءةٍ طازجةٍ ويُعاد المحاولةُ بسقفٍ، فلا يتعلّق المولّد ولا يُحرق رقم.
 *
 * ★★ **حدٌّ معروف (مكتوبٌ لا مخفيّ):** عضويّةُ مصروفٍ في كشفين لا تُمنع ذرّيًّا على الويب
 *    (لا معاملةَ مجموعةٍ تكشف الإدراجَ الشبحيّ)؛ فالقراءةُ الطازجةُ تُغلق نافذةَ تأخّر
 *    الاشتراك، و`closedIndex` «الأقدمُ يفوز» يُبقي «غير المُقفَل» سليمًا، و`closingDrift`
 *    يكشف للماليّة أيَّ تداخلٍ قبل الصرف. (المحلّيُّ كاتبٌ واحد فمحصَّن.)
 */
export async function addExpenseClosing(closing, profile) {
  const uid = auth?.currentUser?.uid || null;
  if (!uid) throw new Error('يجب تسجيل الدخول.');
  if (!canCloseExpenses(profile?.role)) throw new Error('ليست لك صلاحيّة إقفال المصروفات مع الماليّة.');
  if (!closing?.number || !Array.isArray(closing?.expenseIds) || closing.expenseIds.length === 0) {
    throw new Error('كشفُ إقفالٍ ناقص — لا يُحفظ.');
  }
  const year = new Date(Number(closing.closedAtMs) || Date.now()).getFullYear();

  let lastErr = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const snap = await getDocs(query(collection(db, COL)));
    const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // لا مصروفَ يُقفَل مرّتين (قراءةٌ طازجةٌ تغلق نافذةَ تأخّر الاشتراك).
    const index = closedIndex(fresh);
    const dup = closing.expenseIds.map(String).find((id) => index.has(id));
    if (dup) {
      throw new Error(
        `مصروفٌ من المحدَّد أُقفل للتوّ في الكشف ⁨${index.get(dup).number || '—'}⁩ — أعِد التحديد ممّا بقي مفتوحًا.`
      );
    }

    const number = nextClosingNumber(fresh, year);
    const ref = doc(db, COL, number);
    // حارسُ المحليّ (لا قاعدةَ أمنٍ هناك تردّ التحديث): إن وُجد الرقمُ فاقفز عنه.
    const existing = await getDoc(ref);
    if (existing?.exists?.()) {
      lastErr = new Error('رقمُ الكشف محجوز — يُعاد حسابُه.');
      continue;
    }

    try {
      await setDoc(ref, {
        number,
        shop: closing.shop || '',
        expenseIds: closing.expenseIds,
        items: closing.items,
        count: closing.count,
        total: closing.total,
        note: closing.note || '',
        closedAtMs: closing.closedAtMs,
        createdByUid: uid,
        createdByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
        createdByRole: profile?.role || '',
        createdAt: serverTimestamp(),
      });
      return { id: number, number };
    } catch (e) {
      // كاتبٌ آخر سبقنا إلى الرقم ⟵ القاعدةُ ردّت التحديثَ: اقفز وأعِد المحاولة.
      if (isTaken(e) && attempt < MAX_TRIES - 1) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('تعذّر حجزُ رقم كشفٍ فريد — أعِد المحاولة.');
}
