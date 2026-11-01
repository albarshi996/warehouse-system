/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  مخزنُ المحلّ الفعّال — بُعدُ الوسم الذي تُرشَّح به البوّابةُ كلُّها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * المرحلة ص: المحلُّ بُعدُ وسمٍ يُرشَّح ويُبدَّل (قرار المالك 2026-10-31)، وكلُّ
 * محلٍّ مستقلٌّ تمامًا. هذا المخزنُ يحمل «المحلَّ الفعّال» الذي يختاره المستخدمُ
 * الواحدُ من المبدّل، فتُنطَق به كلُّ العمليّات وتُرشَّح به كلُّ التقارير والأرصدة
 * والخزينة. القيمةُ `null` = **كلُّ المحلّات** (نظرةُ المالك الشاملة).
 *
 * ★★ عبرَ الجزر (MPA): البوّابةُ صفحاتٌ منفصلةٌ لا سياقَ React واحدًا يجمعها، فالحالةُ
 *    تعيش في `localStorage` (تبقى عبر تنقّل الصفحات) وتُبثّ بين الجزر في الصفحة
 *    الواحدة بحدث `window` مخصّص. وكلُّ لمسِ تخزينٍ محروسٌ بـtry/catch (النافذةُ
 *    الخاصّةُ قد ترمي) مع احتياطيٍّ في الذاكرة — فلا تنكسر الواجهةُ ولا الاختبار.
 *
 * منطقٌ محايدُ البيئة: يعمل في المتصفّح (window + localStorage) وفي Node العاري
 * (مستمعون في الذاكرة) — فيُبرهَن بلا متصفّح.
 */

/** مفتاحُ التخزين المحلّيّ للمحلّ الفعّال. */
export const ACTIVE_SHOP_KEY = 'bz.activeShop';

/** اسمُ حدثِ البثّ بين الجزر في الصفحة الواحدة. */
export const ACTIVE_SHOP_EVENT = 'brandzo:active-shop';

/** احتياطيٌّ في الذاكرة حين يغيب `localStorage` أو يرمي (نافذةٌ خاصّة/Node). */
let memoryValue = null;

/** مستمعون في الذاكرة — المسارُ المستعمَل في Node حيث لا `window`. */
const listeners = new Set();

/** هل نحن في متصفّحٍ فيه `window`؟ */
function win() {
  return typeof window !== 'undefined' && window ? window : null;
}

/** رمزُ محلٍّ مُطبَّعٌ أو `null` (الفارغُ = كلُّ المحلّات). */
function normalize(code) {
  if (code === null || code === undefined) return null;
  const s = String(code).trim();
  return s === '' ? null : s;
}

function readStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const v = localStorage.getItem(ACTIVE_SHOP_KEY);
      return v === null || v === '' ? null : v;
    }
  } catch {
    /* نافذةٌ خاصّةٌ أو تخزينٌ محظور — نسقط إلى الذاكرة */
  }
  return memoryValue;
}

function writeStorage(code) {
  memoryValue = code;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      if (code === null) localStorage.removeItem(ACTIVE_SHOP_KEY);
      else localStorage.setItem(ACTIVE_SHOP_KEY, code);
    }
  } catch {
    /* يبقى الاحتياطيُّ في الذاكرة */
  }
}

/** المحلُّ الفعّال الآن (`null` = كلُّ المحلّات). */
export function getActiveShop() {
  return readStorage();
}

/**
 * يضبط المحلَّ الفعّال ويبثّه. `null`/فارغ = كلُّ المحلّات.
 * في المتصفّح يُبثّ بحدثِ `window` (يبلغ كلَّ الجزر)؛ في Node يُنادى المستمعون.
 * @returns {string|null} القيمةُ المُطبَّعة بعد الضبط.
 */
export function setActiveShop(code) {
  const next = normalize(code);
  writeStorage(next);
  const w = win();
  if (w && typeof w.dispatchEvent === 'function') {
    try {
      w.dispatchEvent(new CustomEvent(ACTIVE_SHOP_EVENT, { detail: next }));
    } catch {
      /* بيئةٌ بلا CustomEvent — نتجاهل البثّ */
    }
  } else {
    for (const cb of [...listeners]) {
      try {
        cb(next);
      } catch {
        /* مستمعٌ رمى — لا يُسقط البقيّة */
      }
    }
  }
  return next;
}

/**
 * يشترك في تغيّرات المحلّ الفعّال. يُعيد دالّةَ إلغاءِ الاشتراك.
 * المتصفّح: يسمع حدثَ البثّ وحدثَ `storage` (تبويبٌ آخر). Node: مستمعٌ في الذاكرة.
 * @param {(shop:string|null)=>void} cb
 * @returns {()=>void}
 */
export function subscribeActiveShop(cb) {
  if (typeof cb !== 'function') return () => {};
  const w = win();
  if (!w || typeof w.addEventListener !== 'function') {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
  const onEvent = (e) => {
    const detail = e && 'detail' in e ? e.detail : undefined;
    try {
      cb(detail === undefined ? getActiveShop() : detail);
    } catch {
      /* لا يُسقط */
    }
  };
  const onStorage = (e) => {
    if (!e || e.key === ACTIVE_SHOP_KEY) {
      try {
        cb(getActiveShop());
      } catch {
        /* لا يُسقط */
      }
    }
  };
  w.addEventListener(ACTIVE_SHOP_EVENT, onEvent);
  w.addEventListener('storage', onStorage);
  return () => {
    w.removeEventListener(ACTIVE_SHOP_EVENT, onEvent);
    w.removeEventListener('storage', onStorage);
  };
}
