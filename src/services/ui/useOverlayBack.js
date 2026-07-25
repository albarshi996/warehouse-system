/**
 * زرّ الرجوع يُغلق طبقة React، لا يغادر الصفحة.
 *
 * **المشكلة:** طبقات البوابة المكتوبة بـReact — وضع العرض، درج الأرشيف، نافذة
 * النموذج، شاشة المحاكي الكاملة — لا تُفتح بصنف CSS بل بحالةٍ داخلية
 * (`useState` أو `reducer`)، فلا يراها `trackOverlay` الذي يُراقب الوسم. والأثر
 * هو الأثر نفسه: شاشةٌ تملأ العرض، وزرّ رجوعٍ يغادر الصفحة كلّها بدل أن يُغلقها
 * — وهو **الزرّ الوحيد** على الهاتف.
 *
 * **الحلّ:** خطّافٌ يربط قيمة الحالة نفسها بتاريخ المتصفّح: إن صارت `isOpen`
 * صحيحةً سُجّلت طبقةٌ في التاريخ (راجع `overlayHistory.js`)، وإن عادت كاذبةً —
 * أو أُزيل المكوّن — استُهلك مدخلها فلا يبقى في التاريخ ما لا يقابله شيء على
 * الشاشة.
 *
 * سطرٌ واحد بجانب تعريف الحالة، بلا تعديل في العرض ولا في دوالّ الإغلاق القائمة:
 * ```js
 * const [open, setOpen] = useState(false);
 * useOverlayBack(open, () => setOpen(false));
 * ```
 *
 * التسجيل كلّه داخل `useEffect` — لا نلمس `window` أثناء التصيير، فتبقى
 * المكوّنات صالحةً للتصيير على الخادم ثمّ الترطيب.
 */
import { useEffect, useRef } from 'react';

import { openOverlay, closeOverlay } from './overlayHistory.js';

/**
 * @param {boolean} isOpen هل الطبقة ظاهرة الآن؟
 * @param {Function} onClose ما يُخفيها فعليًّا — **يجب أن يكون آمن التكرار**،
 *   فقد يُنادى بعد أن تكون الصفحة أغلقتها بنفسها.
 * @param {string} [name] اسم وصفي يظهر في التاريخ (للتشخيص لا أكثر).
 */
export function useOverlayBack(isOpen, onClose, name = 'react-overlay') {
  /* أحدث دالّة إغلاق في مرجع: النداء عادةً دالّةٌ تُكتب في مكانها
     (`() => setOpen(false)`) فتُخلق من جديد مع كل تصيير — فلو تعلّق بها الأثر
     لأعاد تسجيل الطبقة بلا داعٍ، ولو أغفلناها لأغلق على نسخةٍ قديمة. */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  /** مقبض الطبقة ما دامت مفتوحة، أو null. */
  const tokenRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    tokenRef.current = openOverlay(() => {
      /* جاء النداء من زرّ الرجوع: المدخل استُهلك أصلًا، فلا نستهلكه مرّةً
         أخرى في التنظيف الذي سيتلو تغيّر الحالة. */
      tokenRef.current = null;
      if (closeRef.current) closeRef.current();
    }, name);

    /* أُغلقت من الصفحة (زرّ × أو Escape) أو أُزيل المكوّن: نستهلك المدخل
       بأنفسنا كي لا يبقى في التاريخ مدخلٌ ميّت يبتلع ضغطة رجوعٍ لا أثر لها. */
    return () => {
      const spent = tokenRef.current;
      tokenRef.current = null;
      if (spent) closeOverlay(spent);
    };
    /* الأثر يتعلّق بـ`isOpen` وحدها — الاسم ودالّة الإغلاق يُقرآن وقت الفتح. */
  }, [isOpen]);
}
