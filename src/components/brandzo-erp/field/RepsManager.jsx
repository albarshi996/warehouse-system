/**
 * إدارة المندوبين (SAP-21 · طلب المالك 2026-08-14) — الماستر الذي تنبثق
 * منه قوائم SAP-20: قائمةٌ حيّة + إضافة/تعديل/أرشفة، بنمط شاشات
 * الماسترات القائمة (الأصناف · الشركاء) حرفيًّا.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeReps, createRep, updateRep, archiveRep, unarchiveRep } from '../../../services/field/repsService.js';
import { canManageReps } from '../../../services/field/repModel.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenVehicles } from '../../../services/vehicles/vehiclesService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';

const LIST_COLS = [
  { key: 'name', label: 'الاسم' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'vehiclePlate', label: 'المركبة المعتادة' },
  { key: 'state', label: 'الحالة' },
  { key: 'actions', label: '' },
];

export default function RepsManager() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState(null); // null | { mode, rep? }
  const [toast, setToast] = useState(null);
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => setMe(user ? await fetchUserProfile(user) : null));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeReps(
      (rows) => {
        setReps(rows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذّر الاتصال — هل نُشرت قاعدة sales_reps؟');
        setLoading(false);
      },
      { includeArchived: showArchived }
    );
    return () => unsub();
  }, [showArchived]);

  useEffect(() => listenVehicles(setVehicles), []);

  const canManage = canManageReps(me?.role);
  const flash = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  };

  const namesExcept = useMemo(
    () => (excludeId) => reps.filter((r) => r.id !== excludeId).map((r) => r.name),
    [reps]
  );

  const rows = reps.map((r) => ({
    id: r.id,
    decoration: r.archived ? 'muted' : undefined,
    cells: {
      name: <span className="decoration-bf">{r.name}</span>,
      phone: <span style={{ direction: 'ltr', display: 'inline-block' }}>{r.phone || '—'}</span>,
      vehiclePlate: <span style={{ fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{r.vehiclePlate || '—'}</span>,
      state: r.archived ? 'مؤرشف' : r.active === false ? 'موقوف' : 'نشط',
      actions: canManage ? (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor({ mode: 'edit', rep: r })}>تعديل</button>
          {r.archived ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => unarchiveRep(r.id).then(() => flash('ok', `استُعيد ${r.name}`))}>استعادة</button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm(`أرشفة المندوب «${r.name}»؟ (لا حذف — يبقى أثره في رحلاته)`)) {
                  archiveRep(r.id).then(() => flash('ok', `أُرشف ${r.name}`));
                }
              }}
            >
              أرشفة
            </button>
          )}
        </div>
      ) : null,
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">إدارة المندوبين</span></nav>
        </div>
        <div className="o_cp_end">
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setEditor({ mode: 'create' })}>
              <Icon name="userPlus" size={15} /> إضافة مندوب
            </button>
          )}
        </div>
      </div>

      <div className="o_ds">
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          الماستر الذي تنبثق منه قوائم «المندوب» في المستندات كلّها — الاسم هو الهويّة، ولا حذف: أرشفةٌ فقط.
        </p>

        {toast && <div className={`o_alert ${toast.kind === 'err' ? 'danger' : 'success'}`}>{toast.text}</div>}
        {error && !loading && <div className="o_alert danger">{error}</div>}

        {editor && (
          <RepForm
            mode={editor.mode}
            rep={editor.rep}
            vehicles={vehicles}
            existingNames={namesExcept(editor.rep?.id)}
            onSaved={(name) => {
              setEditor(null);
              flash('ok', editor.mode === 'create' ? `أُضيف المندوب ${name}` : `حُفظت تعديلات ${name}`);
            }}
            onCancel={() => setEditor(null)}
          />
        )}

        <div className="o_ds_card">
          <div className="o_ds_toolbar">
            <label className="o_toggle">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              إظهار المؤرشفين
            </label>
          </div>
          {loading ? (
            <div className="o_dashboard_empty">جارٍ جلب البيانات…</div>
          ) : rows.length === 0 ? (
            <div className="o_dashboard_empty">لا مندوبين بعد — ابدأ بإضافة أوّل مندوب.</div>
          ) : (
            <ListView selectable={false} columns={LIST_COLS} rows={rows} />
          )}
        </div>
      </div>
    </div>
  );
}

function RepForm({ mode, rep, vehicles, existingNames, onSaved, onCancel }) {
  const [draft, setDraft] = useState({
    name: rep?.name || '',
    phone: rep?.phone || '',
    vehiclePlate: rep?.vehiclePlate || '',
    notes: rep?.notes || '',
    active: rep?.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'create') await createRep(draft, existingNames);
      else await updateRep(rep.id, draft, existingNames);
      onSaved?.(draft.name.trim());
    } catch (e2) {
      setErr(e2?.message ?? 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }} dir="rtl">
      <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0 }}>
        {mode === 'create' ? 'إضافة مندوب' : `تعديل المندوب ${rep?.name}`}
      </h3>
      {err && <div className="o_alert danger" style={{ whiteSpace: 'pre-line' }}>{err}</div>}
      <div className="o_form_grid">
        <label className="o_field_block">
          <span className="o_form_label">الاسم *</span>
          <input className="o_input" value={draft.name} onChange={set('name')} required />
        </label>
        <label className="o_field_block">
          <span className="o_form_label">الهاتف</span>
          <input className="o_input" value={draft.phone} onChange={set('phone')} style={{ direction: 'ltr', textAlign: 'right' }} placeholder="0912345678" />
        </label>
        <label className="o_field_block">
          <span className="o_form_label">المركبة المعتادة</span>
          <select className="o_input" value={draft.vehiclePlate} onChange={set('vehiclePlate')}>
            <option value="">— بلا مركبة ثابتة —</option>
            {vehicles.filter((v) => !v.archived).map((v) => (
              <option key={v.id} value={v.plate || v.plateNo || v.id}>
                {(v.plate || v.plateNo || v.id)}{v.model ? ` — ${v.model}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="o_field_block">
          <span className="o_form_label">ملاحظات</span>
          <input className="o_input" value={draft.notes} onChange={set('notes')} />
        </label>
        <label className="o_toggle" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={draft.active} onChange={set('active')} />
          نشط (يظهر في قوائم المستندات)
        </label>
      </div>
      <div className="o_form_actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>إلغاء</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : mode === 'create' ? 'إضافة' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}
