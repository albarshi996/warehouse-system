import { useEffect } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { isPathAllowed, landingPathFor } from '../../../services/auth/pageAccess.js';

/**
 * حارس الدخول — يُحقن في DashboardLayout لحماية كل صفحات البوابة.
 * لا يرسم شيئًا؛ يتحكّم في طبقة التغطية `#bz-auth-overlay` الموجودة في التخطيط:
 *   - غير مسجّل → تحويل إلى /login.
 *   - **أي دور** خارج صفحاته المسموحة → تحويل لصفحة هبوطه. الصلاحية تُشتقّ من
 *     كتالوج القائمة (`navCatalog.js`) فتُطابق تمامًا ما يراه في القائمة.
 *   - غير ذلك → إخفاء التغطية وإظهار المحتوى.
 *
 * ⚠️ **قبل تدقيق 23.07.2026** كان هذا الحارس يقيّد دورين فقط، وكل دور آخر
 * يفتح أي صفحة بكتابة رابطها رغم إخفائها من قائمته. الآن يسري على الجميع.
 *
 * ملاحظة: التغطية موجودة في HTML منذ أول رسم (قبل ترطيب React) فلا يظهر
 * المحتوى المحمي للحظة قبل التحقّق. الإلزام الحقيقي يبقى في الباك اند
 * (`firestore.rules`) — هذا يمنع الشاشة، وتلك تمنع البيانات.
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
        window.location.replace(`${base}${landingPathFor(profile?.role)}`);
        return;
      }

      if (overlay) overlay.style.display = 'none';
    });

    return () => unsub();
  }, []);

  return null;
}
