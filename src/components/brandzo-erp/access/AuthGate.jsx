import { useEffect } from 'react';
import { subscribeAuth, getBasePath } from '../../../services/auth/authService.js';

/**
 * حارس الدخول — يُحقن في DashboardLayout لحماية كل صفحات البوابة.
 * لا يرسم شيئًا؛ يتحكّم في طبقة التغطية `#bz-auth-overlay` الموجودة في التخطيط:
 *   - غير مسجّل → تحويل إلى /login.
 *   - مسجّل → إخفاء التغطية وإظهار المحتوى.
 *
 * ملاحظة: التغطية موجودة في HTML منذ أول رسم (قبل ترطيب React) فلا يظهر
 * المحتوى المحمي للحظة قبل التحقّق. الإلزام الحقيقي يبقى في الباك اند.
 */
export default function AuthGate() {
  useEffect(() => {
    const base = getBasePath();
    const overlay = document.getElementById('bz-auth-overlay');

    const unsub = subscribeAuth((user) => {
      if (!user) {
        window.location.replace(`${base}/login`);
      } else if (overlay) {
        overlay.style.display = 'none';
      }
    });

    return () => unsub();
  }, []);

  return null;
}
