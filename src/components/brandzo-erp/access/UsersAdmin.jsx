import { useEffect, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listUsers, upsertUser, updateUserRole, setUserActive } from '../../../services/auth/usersService.js';
import { ROLES, getRole, isAdmin } from '../../../services/auth/roles.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import { int } from '../../odoo/format.js';

const ROLE_OPTIONS = Object.values(ROLES);

const LIST_COLS = [
  { key: 'user', label: 'المستخدم' },
  { key: 'role', label: 'الدور' },
  { key: 'status', label: 'الحالة' },
];

/**
 * إدارة المستخدمين — للأدمن فقط. تُسند الأدوار عبر Firestore `users/{uid}`.
 * تعتمد إنشاء الحساب في Firebase Console أولًا (نسخ الـ UID) ثم إسناد الدور هنا.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + o_ds_card + o_form_grid + ListView + o_badge للدور) —
 * **المنطق (الاشتراك والقراءة وخدمات الكتابة) لم يُمسّ**، غُيّر ما يُرسَم فقط.
 * الأرقام لاتينية (R2) عبر format، والإيموجي استُبدلت بمكوّن Icon (R1).
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
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_dashboard_empty">جارٍ التحقّق...</div>
        </div>
      </div>
    );
  }

  if (!me || !isAdmin(me.role)) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> غير مصرّح</div>
            <p style={{ margin: 0 }}>هذه الصفحة للمدير العام فقط.</p>
          </div>
        </div>
      </div>
    );
  }

  const listRows = rows.map((u) => {
    const role = getRole(u.role);
    const active = u.active !== false;
    return {
      id: u.uid,
      decoration: active ? undefined : 'muted',
      cells: {
        user: (
          <div>
            <p style={{ margin: 0, fontWeight: 'var(--o-font-weight-medium)' }}>{u.name || u.uid}</p>
            {u.email && (
              <p style={{ margin: '2px 0 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', direction: 'ltr', textAlign: 'right' }}>{u.email}</p>
            )}
            <p style={{ margin: '2px 0 0', fontSize: '10px', fontFamily: 'monospace', color: 'var(--o-gray-500)', direction: 'ltr', textAlign: 'right' }}>{u.uid}</p>
          </div>
        ),
        role: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
            <span className="o_badge" style={{ backgroundColor: `${role.color}1f`, color: role.color }}>{role.label}</span>
            <select
              className="o_input"
              value={role.id}
              onChange={(e) => changeRole(u.uid, e.target.value)}
              style={{ padding: '3px 8px', fontSize: 'var(--o-font-size-xs)' }}
            >
              {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        ),
        status: (
          <button
            type="button"
            onClick={() => toggleActive(u.uid, !active)}
            className="btn btn-secondary btn-sm"
            style={{ color: active ? 'var(--o-success)' : 'var(--o-main-color-muted)', gap: '6px' }}
          >
            <Icon name={active ? 'checkCircle' : 'close'} size={14} /> {active ? 'فعّال' : 'معطّل'}
          </button>
        ),
      },
    };
  });

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">إدارة المستخدمين</span></nav>
        </div>
        <div className="o_cp_end">
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>تحديث</button>
        </div>
      </div>

      <div className="o_ds">
        {msg && <div className="o_alert success">{msg}</div>}

        {/* إضافة مستخدم */}
        <form onSubmit={addUser} className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="userPlus" size={18} /> إضافة / تحديث مستخدم
          </h3>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '2px 0 14px', lineHeight: 1.6 }}>
            أنشئ الحساب أولًا في Firebase Console ثم انسخ الـ <span style={{ fontFamily: 'monospace' }}>User UID</span> والصقه هنا.
          </p>
          <div className="o_form_grid">
            <label className="o_field_block">
              <span className="o_form_label">User UID</span>
              <input className="o_input" value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} dir="ltr" placeholder="User UID" style={{ textAlign: 'right' }} />
            </label>
            <label className="o_field_block">
              <span className="o_form_label">الاسم</span>
              <input className="o_input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم" />
            </label>
            <label className="o_field_block">
              <span className="o_form_label">البريد (اختياري)</span>
              <input className="o_input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" placeholder="البريد (اختياري)" style={{ textAlign: 'right' }} />
            </label>
            <label className="o_field_block">
              <span className="o_form_label">الدور</span>
              <select className="o_input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <div className="o_form_actions">
            <button type="submit" className="btn btn-primary">حفظ</button>
          </div>
        </form>

        {/* قائمة المستخدمين */}
        <div className="o_ds_card">
          <div className="o_ds_toolbar">
            <span style={{ fontWeight: 'var(--o-font-weight-bold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="users" size={16} /> المستخدمون ({int(rows.length)})
            </span>
          </div>

          {loading ? (
            <div className="o_dashboard_empty">جارٍ التحميل...</div>
          ) : rows.length === 0 ? (
            <div className="o_dashboard_empty">
              لا مستخدمين بعد. أضف أول مستخدم من النموذج أعلاه (بعد إنشائه في Firebase Console).
            </div>
          ) : (
            <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
          )}
        </div>
      </div>
    </div>
  );
}
