/**
 * ═══ جهازُ الباركود يُسمَع في كلّ الشاشة لا في الحقل وحده ═══
 *
 * ★ **الشكوى**: «القراءة تتمّ بالهاتف أو بجهاز الباركود» — والجهاز كان لا
 * يُسمع إلّا والمؤشّر داخل حقل المسح. وأيّ نقرةِ زرٍّ أو تمريرِ جدولٍ تُخرج
 * التركيز، فيمسح العامل ولا يحدث شيء وهو لا يرى سببًا. هذا الخطّاف يجعل
 * الشاشة كلّها تسمع الجهاز.
 *
 * والتمييز بالسرعة لا بالإعداد: الجهاز يطبع ستّة محارف في أقلّ من ٥٠ملّي
 * والإنسان لا يستطيع — والحكم في `services/scan/wedgeScanner.js` مُختبَرًا.
 */
import { useEffect, useRef } from 'react';
import { createWedgeReader, isTypingTarget } from '../../../services/scan/wedgeScanner.js';

/**
 * @param {(code: string) => void} onCode
 * @param {{ enabled?: boolean }} [opts] — يُعطَّل حين لا تكون الشاشة جاهزةً
 *   للقراءة (لا وضعَ مختار · لا جلسةَ مفتوحة)، فلا تُبتلع ضغطاتٌ بلا مصير.
 */
export function useWedgeScanner(onCode, { enabled = true } = {}) {
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const reader = createWedgeReader();
    const handler = (e) => {
      // اختصاراتُ النظام ليست قراءةً.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // الحقلُ المركَّز يملك ضغطته — والتقاطُها هنا أيضًا يُسجّل المسحة مرّتين.
      if (isTypingTarget(e.target)) {
        reader.reset();
        return;
      }
      const hit = reader.feed(e.key, e.timeStamp);
      if (!hit) return;
      e.preventDefault();
      onCodeRef.current?.(hit.code);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled]);
}
