/**
 * ═══ جهازُ الباركود السلكيّ/البلوتوث — قارئٌ يعمل بلا نقرةٍ في حقل ═══
 *
 * ★ **الشكوى الميدانيّة**: «القراءة تتمّ بالهاتف أو بجهاز الباركود». وجهاز
 * الباركود لوحةُ مفاتيحَ في نظر المتصفّح: يطبع المحارف ثمّ `Enter`. وكلّ
 * شاشاتنا كانت تسمعه **بشرطٍ واحدٍ خفيّ**: أن يكون المؤشّر داخل حقل المسح.
 * فإن ضغط العامل زرًّا أو مرّر الجدول أو أغلق نافذةً — خرج التركيز، فمسح
 * فلم يحدث شيء. وهو لا يرى حقلًا ولا تركيزًا؛ يرى **جهازًا لا يقرأ**.
 *
 * الحلّ هنا: قارئٌ يسمع الضغطات على مستوى الصفحة، ويميّز الجهاز من الإنسان
 * بالسرعة — الجهاز يطبع ستّة محارف في أقلّ من ٥٠ملّي، والإنسان لا يستطيع.
 * فما جاء سريعًا وانتهى بـ`Enter` **قراءةٌ**، وما عداه كتابةٌ تُترك لصاحبها.
 *
 * والمنطق خالصٌ هنا (زمنٌ يُمرَّر لا يُقرأ) كي يُختبَر بلا متصفّح.
 */

import { normalizeScanned } from './scanEngine.js';

/**
 * هل هذا الهدف حقلُ كتابةٍ يملك الضغطة؟
 *
 * ★ الحقلُ المركَّز يتولّى القراءة بنفسه (`Enter` في `onKeyDown`)، فلو التقطها
 * القارئ العامّ أيضًا لسُجّلت **مرّتين** — ومسحةٌ تُسجَّل مرّتين أسوأ من مسحةٍ
 * لا تُسجَّل، لأنّها تفسد العدّ صامتةً.
 */
export function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * قارئُ الجهاز: يُطعَم ضغطةً ضغطةً، ويُعيد `{ code }` عند اكتمال قراءة.
 *
 * `maxGapMs` هو الفاصل الأقصى بين محرفين ليُعدّا من جهاز — أعلاه تُعتبر
 * السلسلة كتابةَ إنسانٍ فتُلغى. و`minLength` يمنع أن يُعدّ ضغطُ `Enter`
 * وحده قراءةً.
 */
export function createWedgeReader({ minLength = 3, maxGapMs = 80 } = {}) {
  let buffer = '';
  let lastAt = -Infinity;

  function reset() {
    buffer = '';
    lastAt = -Infinity;
  }

  return {
    reset,
    /** @returns {{code: string}|null} */
    feed(key, now) {
      const at = Number.isFinite(now) ? now : 0;
      const gap = at - lastAt;

      if (key === 'Enter' || key === 'Tab') {
        const code = normalizeScanned(buffer);
        reset();
        // ★ حتّى `Enter` نفسه يجب أن يصل سريعًا: عاملٌ كتب رقمًا بيده ثمّ ضغط
        //   Enter بعد ثانية ليس جهازًا، وحقلُه أولى بضغطته.
        if (code.length >= minLength && gap <= maxGapMs) return { code };
        return null;
      }

      // محرفٌ واحدٌ مطبوع فقط — التحكّم (Shift/Alt/Arrow…) لا يُبنى منه باركود.
      if (typeof key !== 'string' || key.length !== 1) return null;

      if (gap > maxGapMs) buffer = '';
      buffer += key;
      lastAt = at;
      return null;
    },
  };
}
