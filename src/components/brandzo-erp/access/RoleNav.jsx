import { useEffect } from 'react';
import {
  subscribeAuth,
  fetchUserProfile,
  getBasePath,
} from '../../../services/auth/authService.js';
import { canSeeGroup, canSeeItem, duplicateIndexes } from '../../../services/auth/navAccess.js';
import { canSeeHome } from '../../../services/auth/navAccess.js';
import { toCatalogPath } from '../../../services/auth/pageAccess.js';
import { fetchMatrixOnce } from '../../../services/auth/accessMatrixService.js';

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

      // 3) مصفوفة التجاوزات (شاشة الصلاحيات) — تُطبَّق بعد قواعد الدور كي
      // تغلبها: الحجب يُخفي الرابط، والسماح الإضافي يُظهره (وعنصرَ مجموعته)
      // ولو أخفته القواعد الافتراضية. تعذُّر الجلب ⇒ null ⇒ الكتالوج وحده.
      const matrix = await fetchMatrixOnce();
      const o = matrix?.overrides?.[role];
      if (o && (o.allow?.length || o.deny?.length)) {
        const base = getBasePath();
        document.querySelectorAll('li[data-label]').forEach((li) => {
          const a = li.querySelector('a[href]');
          if (!a) return;
          const p = toCatalogPath(a.getAttribute('href') || '', base);
          if (o.deny?.includes(p)) {
            hide(li);
          } else if (o.allow?.includes(p)) {
            li.removeAttribute('data-role-hidden');
            li.style.display = '';
            const grp = li.closest('[data-nav-group]');
            if (grp) {
              grp.removeAttribute('data-role-hidden');
              grp.style.display = '';
            }
          }
        });
        // مجموعة أفرغها الحجب بالكامل → تُخفى ترويستها أيضًا
        document.querySelectorAll('[data-nav-group]').forEach((grp) => {
          if (grp.hasAttribute('data-role-hidden')) return;
          const items = grp.querySelectorAll('li[data-label]');
          const anyVisible = Array.prototype.some.call(
            items,
            (li) => !li.hasAttribute('data-role-hidden')
          );
          if (items.length && !anyVisible) hide(grp);
        });
      }

      // 4) مدخلٌ واحدٌ لكل صفحة **في الشريط الجانبيّ**. الصفحة تُدرَج في
      // مجموعتين عمدًا لتصل لدورين، والتصميم سليمٌ لكلٍّ منهما — لكنّ الأدمن
      // يرى النسختين معًا فتظهر له «دفتر الذمم» ثلاث مرّات بعنوانين. نُبقي
      // الأولى ونُخفي ما بعدها عند العرض، بلا حذفٍ من الكتالوج يكسر أصحابها.
      //
      // ⚠ **الحصر في `#brandzo-sidebar` شرطُ الصحّة لا تحسينُ أداء.** صفحاتٌ
      // أخرى تُعيد سرد المقاصد نفسها ببطاقاتٍ تحمل `li[data-label]` — «عمليات
      // البوابة» و«لوحة التحكم». فمسحُ المستند كلّه يجعل كلّ بطاقةٍ «تكرارًا»
      // لرابطها في الشريط، فتُخفى: جُرّب حيًّا فاختفت 87 بطاقةً من 92 وبقيت
      // الروابط الخارجيّة وحدها (لا مسار كتالوجيّ لها). التكرار المقصود لا
      // يقع إلا هنا — فهنا وحده يُعالَج.
      const basePath = getBasePath();
      const sidebar = document.getElementById('brandzo-sidebar');
      const liveItems = sidebar
        ? Array.prototype.filter.call(
            sidebar.querySelectorAll('li[data-label]'),
            (li) => !li.hasAttribute('data-role-hidden')
          )
        : [];
      const livePaths = liveItems.map((li) => {
        const a = li.querySelector('a[href]');
        return a && !a.target ? toCatalogPath(a.getAttribute('href') || '', basePath) : '';
      });
      duplicateIndexes(livePaths).forEach((i) => hide(liveItems[i]));

      // تُعلِم بحث القائمة أن التقييد طُبِّق
      document.body.setAttribute('data-role-nav-ready', role);
    });

    return () => unsub();
  }, []);

  return null;
}
