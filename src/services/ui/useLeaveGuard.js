/**
 * تحذيرُ المتصفّح قبل مغادرة الصفحة ما دامت كتابةٌ جارية — راجع `leaveGuard.js`.
 *
 * سطرٌ واحد بجانب حالة الكتابة:
 * ```js
 * const [committing, setCommitting] = useState(false);
 * useLeaveGuard(committing);
 * ```
 *
 * التسجيلُ داخل `useEffect` — لا نلمس `window` أثناء التصيير.
 */
import { useEffect } from 'react';

import { guardLeave } from './leaveGuard.js';

/** @param {boolean} active هل كتابةٌ جاريةٌ الآن؟ */
export function useLeaveGuard(active) {
  useEffect(() => (active ? guardLeave(window) : undefined), [active]);
}
