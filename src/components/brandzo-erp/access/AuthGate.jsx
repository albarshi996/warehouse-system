import { useEffect } from 'react';
import {
  subscribeAuth,
  fetchUserProfile,
  signOutUser,
  getBasePath,
  AUTH_BACKEND,
} from '../../../services/auth/authService.js';
import { isPathAllowed, landingPathFor, toCatalogPath } from '../../../services/auth/pageAccess.js';
import { recordVisit } from '../../../services/activity/visitService.js';
import { fetchMatrixOnce } from '../../../services/auth/accessMatrixService.js';
import { loginUrlFor } from '../../../services/auth/returnTo.js';

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

    // ★★★ الوضعُ المحلّيّ (بناءُ سطح المكتب، المحوَّل `local`): البياناتُ ما زالت
    //     Firebase بلا جلسةٍ سحابيّة، فقراءةُ مصفوفة التجاوزات محكومٌ عليها بالفشل.
    //     فلا نعلّق الطبقةَ عليها (نكتفي بالكتالوج — الرجوعُ الآمنُ المعلَن)، ونُعلن
    //     «وضع محلي» بصدقٍ بدل ادّعاء اتّصالٍ سحابيٍّ لا وجودَ له. الويبُ لا يُمسّ.
    const isLocal = AUTH_BACKEND === 'local';

    // ‹ODOO-ORD› حين يضعف الاتّصال كانت الطبقةُ تدور صامتةً دقائق (2026-10-22). لا نتجاوز التحقّق — الشاشةُ لا تُفتح لمن
    // لم يُعرف — بل نقول ما يجري ونعطي زرَّ إعادة المحاولة.
    const slow = setTimeout(() => {
      if (!overlay || overlay.style.display === 'none') return;
      const note = document.createElement('div');
      note.style.cssText = 'text-align:center;font-size:13px;opacity:.85;line-height:1.8;max-width:320px';
      note.textContent = 'الاتّصالُ بقاعدة البيانات بطيءٌ الآن — ما زلنا نحاول.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'أعد التحميل';
      retry.style.cssText = 'margin-top:8px;padding:6px 16px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer';
      retry.onclick = () => window.location.reload();
      note.appendChild(document.createElement('br'));
      note.appendChild(retry);
      overlay.appendChild(note);
    }, 8000);

    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        // يحمل الوجهة معه: عضو اللجنة يفتح رابط دعوةٍ وهو خارج الحساب، فكان
        // يُرمى إلى شاشة الدخول ويضيع `?op=` — فيدخل ويجد لوحةً عامّة لا الجلسة.
        window.location.replace(loginUrlFor(base, window.location.pathname, window.location.search));
        return;
      }

      const [profile, matrix] = await Promise.all([
        fetchUserProfile(user),
        isLocal ? Promise.resolve(null) : fetchMatrixOnce(),
      ]);

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

      clearTimeout(slow);
      if (overlay) overlay.style.display = 'none';
      // ‹ODOO-ORD› علامةُ «جاري الاتصال بقاعدة البيانات...» في التخطيط لا يُحدّثها إلّا هذا الحدث — وكان لا يُطلقه إلّا
      // شاشةُ المستودعات، فبقيت العلامةُ «تتّصل» أبدًا في كلّ صفحةٍ أخرى. قراءةُ الملفّ نجحت ⟵ القاعدةُ متّصلة.
      window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: !isLocal } }));

      // ‹VIS-202› سجلُّ الزيارة — **بعد** أن يُعرف المستخدمُ ويُسمح له بالصفحة،
      // فلا يُسجَّل موقوفٌ ولا محوَّلٌ عن صفحةٍ لا يملكها.
      //
      // ★★★ ض-٢: **بلا `await`** — الرسمُ لا ينتظر السجلّ، وفشلُه مبتلَعٌ في
      // `visitService` فلا يرى الموظّفُ خطأً ولا تتعطّل البوّابة. السجلُّ خدمةٌ
      // ثانويّة، ومن يجعلها شرطًا لعمل الشاشة يُسقط الشاشةَ يومَ تسقط هي.
      recordVisit({ kind: 'VIEW', path: toCatalogPath(path, base), profile });
    });

    return () => {
      clearTimeout(slow);
      unsub();
    };
  }, []);

  return null;
}
