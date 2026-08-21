/**
 * تعديلات خريطة التجزئة في السحابة — `retail_hub_overrides`.
 *
 * **لماذا هاجرت؟** كانت بيانات أحياء بنغازي كلّها تُحفظ في `localStorage`
 * تحت `benghazi_hub_v3`: عملُ مندوبٍ يعيش في متصفّحه وحده، يضيع بمسح
 * البيانات أو بتغيير الجهاز، ولا يراه زميلٌ ولا مدير. قرار المالك 2026-08-21:
 * تنتقل إلى السحابة.
 *
 * **البنية:** `retail_hub_overrides/{hoodId}` — معرّف الوثيقة هو معرّف الحيّ
 * نفسه. فلكلّ حيٍّ تعديلٌ واحدٌ يُكتب فوقه، لا سلسلةُ نسخٍ تتراكم؛ والكتابة
 * ساكنة: تكرارُ الحفظ لا يُنشئ سجلًّا ثانيًا.
 *
 * **والبذرة تبقى في الكود** (`src/data/benghazi-hub.js`): ما هنا تصحيحٌ فوقها
 * لا بديلٌ عنها. فلو خلت المجموعة أو تعذّرت قراءتها ظهرت الخريطة كاملةً من
 * البذرة — لا شاشةٌ فارغة.
 *
 * ⚠️ **قواعد `retail_hub_overrides` تحتاج نشرًا من المالك** (Firebase Console).
 * وقبله ترتدّ الكتابةُ بـ`permission-denied`، والقراءةُ تسقط إلى البذرة —
 * فالشاشة تعمل، والحفظ وحده ينتظر النشر ويقول ذلك صراحةً.
 */
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { sanitizeOverride } from './hubModel.js';

const OVERRIDES = 'retail_hub_overrides';

/** الأدوار التي تكتب — والباقي يقرأ. تُطابق `firestore.rules`. */
export const HUB_WRITER_ROLES = ['admin', 'warehouse_manager'];

/** هل لهذا الدور أن يعدّل؟ */
export const canEditHub = (role) => HUB_WRITER_ROLES.includes(role);

/**
 * يستمع لتعديلات الأحياء.
 *
 * @param {(overrides:object[]) => void} onChange يُستدعى بكلّ التعديلات عند كلّ تغيّر
 * @param {(error:Error) => void} [onError] يُستدعى عند تعذّر القراءة — والمتّصل
 *        يعرض البذرة عندئذٍ بدل أن يُفرِّغ الشاشة
 * @returns {() => void} دالّة إلغاء الاشتراك
 */
export function listenHubOverrides(onChange, onError) {
  return onSnapshot(
    collection(db, OVERRIDES),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    (error) => {
      if (onError) onError(error);
    }
  );
}

/**
 * يحفظ تعديل حيٍّ واحد.
 *
 * يمرّ بـ`sanitizeOverride` أوّلًا: المعرّف والحقول المسموحة لا غير — فلا
 * يُكتب `lat` ولا `lng` مهما أُرسلا، ولا يُنقل حيٌّ إلى البحر من نموذج.
 *
 * @throws إن كان التعديل بلا معرّفٍ صالح، أو ردّت القاعدة الكتابة
 */
export async function saveHubOverride(patch, profile) {
  const clean = sanitizeOverride(patch);
  if (!clean) throw new Error('تعديلٌ بلا معرّف حيٍّ صالح');
  await setDoc(
    doc(db, OVERRIDES, String(clean.id)),
    {
      ...clean,
      updatedAt: new Date().toISOString(),
      byUid: auth?.currentUser?.uid || null,
      byName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    },
    { merge: true }
  );
  return clean;
}

/**
 * يمحو كلّ التعديلات فتعود الخريطة إلى بذرتها.
 *
 * **وهذا معنًى تغيّر بالهجرة، فليُقَل صراحةً:** كان الزرّ يمسح تعديلات
 * *متصفّحي أنا*، وصار يمسح تعديلات *الجميع*. فالمتّصل يُلزَم بتأكيدٍ يذكر
 * ذلك قبل الاستدعاء — والبذرة نفسها في الكود فلا تُمسّ.
 *
 * @returns {Promise<number>} عدد التعديلات الممحوّة
 */
export async function clearHubOverrides() {
  const snap = await getDocs(collection(db, OVERRIDES));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
