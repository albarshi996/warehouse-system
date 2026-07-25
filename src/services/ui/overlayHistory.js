/**
 * زر الرجوع يُغلق الطبقة، لا يغادر الصفحة.
 *
 * **المشكلة:** كل «طبقة» في البوابة (وضع العرض · نافذة تحرير · معاينة مستند)
 * تُفتح بتغيير صنف CSS فقط، فلا يعلم بها المتصفّح. فإذا ضغط المستخدم زرّ
 * الرجوع — وهو ردّ الفعل الطبيعي أمام شاشة تملأ العرض، وهو **الزرّ الوحيد**
 * على الهاتف — غادرت الصفحة كلّها وضاع ما لم يُحفظ.
 *
 * **الحلّ:** عند فتح الطبقة نُسجّل مدخلًا في تاريخ المتصفّح بالعنوان نفسه
 * (`pushState` بلا رابط، فلا تنقّل ولا إعادة تحميل). فيصير الرجوع إغلاقًا
 * للطبقة. وعند الإغلاق بالزرّ نستهلك ذلك المدخل بـ`history.go` كي لا يتراكم
 * في التاريخ ما لا يقابله شيء على الشاشة.
 *
 * الطبقات تتراكم: عرضٌ فوقه نافذة تحرير — فالرجوع يُغلق الأعلى وحدها.
 *
 * تُبنى الوحدة على بيئة مُمرَّرة (`createOverlayHistory`) كي تُختبر في Node
 * بلا متصفّح، ثم تُصدَّر نسخةٌ جاهزة مربوطة بنافذة المتصفّح.
 */

/** المفتاح الذي نضعه في `history.state` لتمييز مداخلنا عن مداخل غيرنا. */
export const OVERLAY_KEY = '__brandzoOverlay';

/**
 * يُنشئ مديرَ طبقاتٍ فوق بيئةٍ بعينها.
 * @param {object} env `{ history, addEventListener }` — نافذة المتصفّح أو بديلها في الاختبار.
 */
export function createOverlayHistory(env) {
  const { history, addEventListener } = env;
  /** @type {{key:string, onClose:Function}[]} الطبقات المفتوحة، الأعلى آخرًا. */
  const stack = [];
  let seq = 0;
  let bound = false;

  /** مفتاح الطبقة التي يقف عندها التاريخ الآن (أو null إن كنّا تحت طبقاتنا). */
  function keyOf(state) {
    return state && typeof state === 'object' ? state[OVERLAY_KEY] || null : null;
  }

  /**
   * رجع المستخدم: نُغلق كل طبقةٍ فوق الموضع الذي وصلنا إليه.
   * الإغلاق من الأعلى إلى الأسفل — كما فُتحت تمامًا بالعكس.
   */
  function onPop(event) {
    const key = keyOf(event?.state);
    const at = key ? stack.findIndex((o) => o.key === key) : -1;
    const closing = stack.splice(at + 1);
    for (const layer of closing.reverse()) {
      try {
        layer.onClose();
      } catch {
        /* طبقةٌ تعثّرت في إغلاقها لا تمنع إغلاق ما تحتها */
      }
    }
  }

  return {
    /**
     * يفتح طبقة: يُسجّلها في التاريخ ويحفظ كيفية إغلاقها.
     * @param {Function} onClose ما يُخفي الطبقة فعليًّا — **يجب أن يكون آمن التكرار**.
     * @param {string} [name] اسم وصفي يظهر في التاريخ (للتشخيص لا أكثر).
     * @returns {string} مقبض يُمرَّر لاحقًا لـ`close`.
     */
    open(onClose, name = 'overlay') {
      if (!bound) {
        addEventListener('popstate', onPop);
        bound = true;
      }
      const key = `${name}#${++seq}`;
      const base = history.state && typeof history.state === 'object' ? history.state : {};
      history.pushState({ ...base, [OVERLAY_KEY]: key }, '');
      stack.push({ key, onClose });
      return key;
    },

    /**
     * يُغلق طبقةً بمقبضها عبر الرجوع في التاريخ — فيُستدعى `onClose` من
     * `popstate` ولا يبقى في التاريخ مدخلٌ ميّت.
     * @returns {boolean} false إن لم تكن الطبقة مفتوحة — فعلى النداء أن يُخفيها بنفسه.
     */
    close(key) {
      const at = stack.findIndex((o) => o.key === key);
      if (at === -1) return false;
      history.go(-(stack.length - at));
      return true;
    },

    /** أعلى طبقة مفتوحة، أو null. للاختبار وللتشخيص. */
    top() {
      return stack.length ? stack[stack.length - 1].key : null;
    },

    /** عدد الطبقات المفتوحة. */
    size() {
      return stack.length;
    },
  };
}

/* النسخة المربوطة بالمتصفّح — هي ما تستعمله الصفحات. */
const browser =
  typeof window !== 'undefined' && window.history
    ? createOverlayHistory({
        history: window.history,
        addEventListener: window.addEventListener.bind(window),
      })
    : null;

/** يفتح طبقة ويجعل زرّ الرجوع يُغلقها. راجع `createOverlayHistory`. */
export function openOverlay(onClose, name) {
  return browser ? browser.open(onClose, name) : null;
}

/** يُغلق طبقةً بمقبضها. يُعيد false إن لم تكن مسجَّلة فأغلِقها يدويًّا. */
export function closeOverlay(key) {
  return browser ? browser.close(key) : false;
}

/** عدد الطبقات المفتوحة الآن. */
export function overlayDepth() {
  return browser ? browser.size() : 0;
}

/**
 * يربط طبقةً قائمةً بزرّ الرجوع **دون تعديل منطق فتحها وإغلاقها**.
 *
 * البوابة فيها عشرات الطبقات كُتبت قبل هذه الوحدة، كلٌّ بدالّة فتحٍ وإغلاق
 * خاصّة بها. فبدل إعادة كتابتها جميعًا نُراقب الوسم نفسه: إذا ظهرت الطبقة
 * سُجّلت في التاريخ، وإذا أخفتها الصفحة بنفسها استُهلك مدخلها فلا يتراكم.
 * فلا يبقى على الصفحة إلّا سطر تسجيلٍ واحد لكل طبقة.
 *
 * @param {string|Element} target الوسم الذي يظهر ويختفي (أو مُحدِّده).
 * @param {object} opts
 *   `isOpen(el)` كيف نعرف أنها ظاهرة — الافتراضي وجود صنف `active`.
 *   `close(el)` كيف تُغلَق عند الرجوع — الافتراضي إزالة ذلك الصنف.
 *   `name` اسم وصفي للتشخيص.
 * @returns {Function} دالّة فكّ الارتباط.
 */
export function trackOverlay(target, opts = {}) {
  if (typeof document === 'undefined') return () => {};
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return () => {};

  const cls = opts.className || 'active';
  const isOpen = opts.isOpen || ((n) => n.classList.contains(cls));
  const close = opts.close || ((n) => n.classList.remove(cls));
  const name = opts.name || el.id || 'overlay';

  let token = null;

  function sync() {
    const open = isOpen(el);
    if (open && !token) {
      token = openOverlay(() => {
        token = null;
        // الرجوع يُغلق فعلًا؛ أمّا إن كانت الصفحة أغلقتها قبلنا فلا نُكرّر
        // النداء — بعض دوالّ الإغلاق تُوقف كاميرا أو تُفرغ نموذجًا.
        if (isOpen(el)) close(el);
      }, name);
    } else if (!open && token) {
      const spent = token;
      token = null;
      closeOverlay(spent);
    }
  }

  const observer = new MutationObserver(sync);
  observer.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
  sync();

  return () => {
    observer.disconnect();
    if (token) {
      const spent = token;
      token = null;
      closeOverlay(spent);
    }
  };
}

/** يربط عدّة طبقاتٍ تتشارك النمط نفسه — سطرٌ واحد للصفحة كلّها. */
export function trackOverlays(targets, opts = {}) {
  return targets.map((t) => trackOverlay(t, opts));
}
