import { useEffect, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listUsers, upsertUser, updateUserRole, setUserActive } from '../../../services/auth/usersService.js';
import { ROLES, getRole, isAdmin } from '../../../services/auth/roles.js';

const ROLE_OPTIONS = Object.values(ROLES);

/**
 * إدارة المستخدمين — للأدمن فقط. تُسند الأدوار عبر Firestore `users/{uid}`.
 * تعتمد إنشاء الحساب في Firebase Console أولًا (نسخ الـ UID) ثم إسناد الدور هنا.
 */
export default function UsersAdmin() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ uid: '', name: '', email: '', role: 'viewer' });

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      const profile = user ? await fetchUserProfile(user) : null;
      setMe(profile);
      setReady(true);
      if (profile && isAdmin(profile.role)) load();
    });
    return () => unsub();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setRows(await listUsers());
    } catch {
      setMsg('تعذّر قراءة المستخدمين. تأكّد من قواعد أمان Firestore.');
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(uid, role) {
    try {
      await updateUserRole(uid, role);
      setRows((r) => r.map((u) => (u.uid === uid ? { ...u, role } : u)));
      flash('تم تحديث الدور.');
    } catch {
      flash('تعذّر تحديث الدور (قواعد الأمان؟).');
    }
  }

  async function toggleActive(uid, active) {
    try {
      await setUserActive(uid, active);
      setRows((r) => r.map((u) => (u.uid === uid ? { ...u, active } : u)));
      flash(active ? 'تم التفعيل.' : 'تم التعطيل.');
    } catch {
      flash('تعذّر تغيير الحالة.');
    }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!form.uid.trim()) return flash('أدخل الـ UID (من Firebase Console).');
    try {
      const data = { name: form.name.trim() || form.email.split('@')[0] || 'مستخدم', role: form.role, active: true };
      if (form.email.trim()) data.email = form.email.trim();
      await upsertUser(form.uid.trim(), data);
      flash('تمت إضافة/تحديث المستخدم.');
      setForm({ uid: '', name: '', email: '', role: 'viewer' });
      load();
    } catch {
      flash('تعذّرت الإضافة (قواعد الأمان؟).');
    }
  }

  function flash(t) {
    setMsg(t);
    setTimeout(() => setMsg(''), 3500);
  }

  if (!ready) {
    return <div className="text-gray-300 text-sm py-8 text-center">جارٍ التحقّق...</div>;
  }

  if (!me || !isAdmin(me.role)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🚫 غير مصرّح</p>
        <p className="text-sm">هذه الصفحة للمدير العام فقط.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      {msg && (
        <div className="bg-brand-gold/15 border border-brand-gold/40 text-brand-gold rounded-xl px-4 py-2 text-sm text-center">
          {msg}
        </div>
      )}

      {/* إضافة مستخدم */}
      <form onSubmit={addUser} className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h2 className="text-white font-bold mb-1">➕ إضافة / تحديث مستخدم</h2>
        <p className="text-gray-400 text-xs mb-4">
          أنشئ الحساب أولًا في Firebase Console ثم انسخ الـ <span className="font-mono">User UID</span> والصقه هنا.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} dir="ltr"
            placeholder="User UID" className="bg-white/5 border border-white/15 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="الاسم" className="bg-white/5 border border-white/15 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr"
            placeholder="البريد (اختياري)" className="bg-white/5 border border-white/15 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="bg-brand-navy border border-white/15 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60">
            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.label}</option>)}
          </select>
        </div>
        <button type="submit" className="mt-4 bg-brand-red hover:bg-brand-red-dark text-white font-bold text-sm rounded-lg px-5 py-2 transition">
          حفظ
        </button>
      </form>

      {/* قائمة المستخدمين */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold">👥 المستخدمون ({rows.length})</h2>
          <button onClick={load} className="text-xs text-gray-300 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition">
            ↻ تحديث
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">جارٍ التحميل...</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            لا مستخدمين بعد. أضف أول مستخدم من النموذج أعلاه (بعد إنشائه في Firebase Console).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-white/10">
                  <th className="text-right font-semibold py-2 px-2">المستخدم</th>
                  <th className="text-right font-semibold py-2 px-2">الدور</th>
                  <th className="text-right font-semibold py-2 px-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const role = getRole(u.role);
                  return (
                    <tr key={u.uid} className="border-b border-white/5">
                      <td className="py-3 px-2">
                        <p className="text-white font-medium">{u.name || u.uid}</p>
                        {u.email && <p className="text-gray-400 text-xs" dir="ltr">{u.email}</p>}
                        <p className="text-gray-500 text-[10px] font-mono" dir="ltr">{u.uid}</p>
                      </td>
                      <td className="py-3 px-2">
                        <select value={role.id} onChange={(e) => changeRole(u.uid, e.target.value)}
                          className="bg-brand-navy border border-white/15 rounded-lg text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-gold/60"
                          style={{ color: role.color }}>
                          {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id} style={{ color: '#fff' }}>{r.emoji} {r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <button onClick={() => toggleActive(u.uid, !(u.active !== false))}
                          className={`text-xs font-bold rounded-full px-3 py-1 transition ${
                            u.active !== false
                              ? 'bg-green-500/15 text-green-300 hover:bg-green-500/25'
                              : 'bg-gray-500/15 text-gray-400 hover:bg-gray-500/25'
                          }`}>
                          {u.active !== false ? '● فعّال' : '○ معطّل'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
