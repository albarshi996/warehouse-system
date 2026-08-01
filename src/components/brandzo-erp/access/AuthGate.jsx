import { useEffect } from 'react';
import {
  subscribeAuth,
  fetchUserProfile,
  signOutUser,
  getBasePath,
} from '../../../services/auth/authService.js';
import { isPathAllowed, landingPathFor } from '../../../services/auth/pageAccess.js';
import { fetchMatrixOnce } from '../../../services/auth/accessMatrixService.js';

/**
 * حارس الدخول — يُحقن في DashboardLayout لحماية كل صفحات البوابة.
 * لا يرسم شيئًا؛ يتحكّم في طبقة التغطية `#bz-auth-overlay` الموجودة في التخطيط:
 *   - غير مسجّل → تحويل إلى /login.
 *   - **حساب موقوف** (`active: false` في وثيقة المستخدم) → خروج فوري وتحويل
 *     إلى /login?disabled=1 — (المحور ٢-ب: كان العلم يُكتب ولا يُنفَّذ).
 *   - **أي دور** خارج صفحاته المسموحة → تحويل لصفحة هبوطه. الصلاحية تُشتقّ من
 *     كتالوج القائمة + **مصفوفة التجاوزات** المحرَّرة من شاشة الصلاحيات
 *     (`access_control/matrix`) — تعذُّر جلبها = العمل بالكتالوج وحده.
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

      const [profile, matrix] = await Promise.all([fetchUserProfile(user), fetchMatrixOnce()]);

      if (profile?.active === false) {
        try {
          await signOutUser();
        } catch {
          /* الخروج فشل شبكيًّا — التحويل كافٍ لقطع الشاشة */
        }
        window.location.replace(`${base}/login?disabled=1`);
        return;
      }

      const path = window.location.pathname;
      if (!isPathAllowed(profile?.role, path, base, matrix)) {
        window.location.replace(`${base}${landingPathFor(profile?.role, matrix)}`);
        return;
      }

      if (overlay) overlay.style.display = 'none';
    });

    return () => unsub();
  }, []);

  return null;
}
