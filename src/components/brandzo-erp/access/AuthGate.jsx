import { useEffect } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { isPathAllowed, restrictedAllowedPaths } from '../../../services/auth/pageAccess.js';

/**
 * حارس الدخول — يُحقن في DashboardLayout لحماية كل صفحات البوابة.
 * لا يرسم شيئًا؛ يتحكّم في طبقة التغطية `#bz-auth-overlay` الموجودة في التخطيط:
 *   - غير مسجّل → تحويل إلى /login.
 *   - دور مقيّد بصفحات معيّنة (pageAccess.js) خارج صفحته المسموحة → تحويل
 *     لأول صفحة مسموحة له (لا يكفي إخفاء الرابط من القائمة الجانبية —
 *     كتابة الرابط مباشرة كانت تتجاوزها قبل هذا الحارس).
 *   - غير ذلك → إخفاء التغطية وإظهار المحتوى.
 *
 * ملاحظة: التغطية موجودة في HTML منذ أول رسم (قبل ترطيب React) فلا يظهر
 * المحتوى المحمي للحظة قبل التحقّق. الإلزام الحقيقي يبقى في الباك اند.
 */
export default function AuthGate() {
  useEffect(() => {
    const base = getBasePath();
    const overlay = document.getElementById('bz-auth-overlay');

    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        window.location.replace(`${base}/login`);
        return;
      }

      const profile = await fetchUserProfile(user);
      const path = window.location.pathname;
      if (!isPathAllowed(profile?.role, path, base)) {
        window.location.replace(`${base}${restrictedAllowedPaths(profile?.role)[0]}`);
        return;
      }

      if (overlay) overlay.style.display = 'none';
    });

    return () => unsub();
  }, []);

  return null;
}
