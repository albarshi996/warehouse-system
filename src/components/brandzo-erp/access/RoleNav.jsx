import { useEffect } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { canSeeGroup, canSeeItem } from '../../../services/auth/navAccess.js';
import { canSeeHome } from '../../../services/auth/navAccess.js';

/**
 * تقييد القائمة الجانبية حسب الدور — يُحقن في DashboardLayout.
 * لا يرسم شيئًا؛ يُخفي ما لا يخصّ الدور بعد أن يُعرف المستخدم:
 *   - مجموعة غير مسموحة → تُخفى بالكامل.
 *   - عنصر محصور بأدوار (data-item-roles) → يُخفى لغير أصحابه.
 *   - مجموعة أُفرغت من كل عناصرها → تُخفى أيضًا.
 *
 * يضع `data-role-hidden` على المخفيّات كي يحترمها بحث القائمة فلا يُظهرها.
 * الخريطة الوحيدة للصلاحيات: services/auth/navAccess.js
 */
export default function RoleNav() {
  useEffect(() => {
    const hide = (el) => {
      el.setAttribute('data-role-hidden', '');
      el.style.display = 'none';
    };

    const unsub = subscribeAuth(async (user) => {
      if (!user) return; // الحارس AuthGate يتكفّل بالتحويل
      const profile = await fetchUserProfile(user);
      if (!profile) return;
      const role = profile.role;

      // 0) الدور المركّز (مجموعة واحدة) لا يصل للرئيسية — نُخفي رابطها المثبّت.
      if (!canSeeHome(role)) {
        document.querySelectorAll('[data-pinned-home]').forEach(hide);
      }

      // 1) العناصر المحصورة بأدوار بعينها
      document.querySelectorAll('li[data-item-roles]').forEach((li) => {
        const roles = (li.getAttribute('data-item-roles') || '')
          .split(',')
          .filter(Boolean);
        if (!canSeeItem(role, roles)) hide(li);
      });

      // 2) المجموعات غير المسموحة + المجموعات التي أُفرغت
      document.querySelectorAll('[data-nav-group]').forEach((grp) => {
        const key = grp.getAttribute('data-group-key');
        if (key && !canSeeGroup(role, key)) {
          hide(grp);
          return;
        }
        const items = grp.querySelectorAll('li[data-label]');
        const anyVisible = Array.prototype.some.call(
          items,
          (li) => !li.hasAttribute('data-role-hidden')
        );
        if (!anyVisible) hide(grp);
      });

      // تُعلِم بحث القائمة أن التقييد طُبِّق
      document.body.setAttribute('data-role-nav-ready', role);
    });

    return () => unsub();
  }, []);

  return null;
}
