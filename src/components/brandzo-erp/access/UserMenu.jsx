import { useEffect, useState } from 'react';
import {
  subscribeAuth,
  fetchUserProfile,
  signOutUser,
  getBasePath,
} from '../../../services/auth/authService.js';
import { getRole } from '../../../services/auth/roles.js';

/**
 * بطاقة المستخدم في تذييل السايدبار — تعرض الاسم والدور وزرّ الخروج.
 */
export default function UserMenu() {
  const [profile, setProfile] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setProfile(user ? await fetchUserProfile(user) : null);
    });
    return () => unsub();
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOutUser();
    } finally {
      window.location.replace(`${getBasePath()}/login`);
    }
  }

  if (!profile) return null;

  const role = getRole(profile.role);

  return (
    <div className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3 text-right" dir="rtl">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: role.color + '33' }}
          aria-hidden="true"
        >
          {role.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{profile.name}</p>
          <span
            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5"
            style={{ backgroundColor: role.color + '22', color: role.color }}
          >
            {role.emoji} {role.label}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="mt-3 w-full text-xs font-bold text-gray-200 hover:text-white bg-white/5 hover:bg-brand-red/80 border border-white/10 rounded-lg py-2 transition-colors disabled:opacity-60"
      >
        {loggingOut ? 'جارٍ الخروج...' : '↩ تسجيل الخروج'}
      </button>
    </div>
  );
}
