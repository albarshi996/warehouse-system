/**
 * لوحة «احتياجات الموقع» — شاشةٌ تفاعليّةٌ مستقلّةٌ بمجموعة Firestore خاصّة
 * (`site_needs`)، لا نوعَ مستندٍ على المحرّك.
 *
 * بنيةُ اللوحة ثلاثُ طبقات (نمط البوّابة):
 *   ① تدخّلٌ الآن   — ما ينتظر فعلَك أنت (اعتمادٌ · بدءُ تنفيذٍ · إنهاء).
 *   ② إجراءٌ سريع   — تسجيلُ احتياجٍ جديد.
 *   ③ الفهرس الكامل — كلُّ الاحتياجات بحالاتها وأزرارِ تحوّلها (بتقييدٍ بالدور).
 *
 * الكساءُ أودو داخل `.o_theme` (وإلّا عُرضت الشاشةُ عاريةً)، والأرقام لاتينيّة
 * عبر `int`، وأيقوناتٌ خطّيّةٌ لا إيموجي، والأحمرُ للرفض/الحرج وحدهما.
 * ثوابتُ الأولويّة مُعادةُ الاستخدام من `requisitionContext.js` بلا تكرار.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  subscribeSiteNeeds,
  createSiteNeed,
  transitionSiteNeed,
  DEFAULT_SITE,
} from '../../../services/needs/siteNeedsService.js';
import {
  NEED_STATES,
  NEED_CATEGORIES,
  availableTransitions,
  canCreateNeed,
  getNeedState,
  isTerminal,
} from '../../../services/needs/needStates.js';
import { PR_PRIORITY } from '../../../services/intelligence/requisitionContext.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** الأولويّة ← شارةُ أودو (الحرج أحمر = تحذير؛ البقيّة محايدة/أمبر). */
const PRIORITY_VARIANT = { CRITICAL: 'danger', URGENT: 'warn', NORMAL: 'progress', PLANNED: 'draft' };

function StateBadge({ stateId }) {
  const s = getNeedState(stateId);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function PriorityBadge({ priority }) {
  const p = PR_PRIORITY[priority];
  if (!p) return <span style={{ color: 'var(--o-gray-500)' }}>—</span>;
  return <Badge variant={PRIORITY_VARIANT[p.id] || 'draft'}>{p.labelAr}</Badge>;
}

export default function SiteNeedsBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(null); // { needId, to, label }
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    return subscribeSiteNeeds(
      (list, hasPending) => { setRows(list); setPending(hasPending); },
      (e) => setErr(e?.message || 'تعذّر الاتصال بالسحابة.')
    );
  }, [me]);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };
  const role = me?.role;
  const isRequester = canCreateNeed(role);

  /** الطبقة ①: ما ينتظر فعلَ هذا المستخدم. */
  const actionable = useMemo(
    () => rows.filter((r) => availableTransitions(r.state, role).length > 0),
    [rows, role]
  );

  const visibleRows = useMemo(() => {
    if (filter === 'open') return rows.filter((r) => !isTerminal(r.state));
    if (filter === 'all') return rows;
    return rows.filter((r) => r.state === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const s of Object.keys(NEED_STATES)) c[s] = 0;
    for (const r of rows) if (c[r.state] !== undefined) c[r.state] += 1;
    return c;
  }, [rows]);

  async function run(needId, t) {
    if (t.needsNote && (!asking || asking.needId !== needId || asking.to !== t.to)) {
      setAsking({ needId, to: t.to, label: t.label });
      setNote('');
      return;
    }
    try {
      await transitionSiteNeed(needId, t.to, { note }, me);
      flash(`تمّ: ${t.label}.`);
      setAsking(null);
      setNote('');
    } catch (e) {
      setErr(e?.message || 'تعذّر تنفيذ الإجراء.');
    }
  }

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_ds_card"><div className="o_dashboard_empty">جارٍ التحقّق…</div></div></div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> غير مصرّح</div>
            سجّل الدخول لعرض احتياجات الموقع.
          </div>
        </div>
      </div>
    );
  }

  const cols = [
    { key: 'description', label: 'الاحتياج' },
    { key: 'category', label: 'الفئة' },
    { key: 'quantity', label: 'الكمّيّة', numeric: true },
    { key: 'priority', label: 'الأولويّة' },
    { key: 'requiredDate', label: 'التاريخ المطلوب' },
    { key: 'site', label: 'الموقع' },
    { key: 'requester', label: 'الطالب' },
    { key: 'status', label: 'الحالة' },
    { key: 'actions', label: 'الإجراء' },
  ];

  const listRows = visibleRows.map((r) => {
    const overdue = r.requiredDate && r.requiredDate < todayIso() && !isTerminal(r.state);
    const trans = availableTransitions(r.state, role);
    return {
      id: r.id,
      cells: {
        description: (
          <div>
            <span className="decoration-bf">{r.description || '—'}</span>
            {r.notes ? (
              <div style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>{r.notes}</div>
            ) : null}
          </div>
        ),
        category: NEED_CATEGORIES[r.category]?.label || '—',
        quantity: r.quantity ? `${int(r.quantity)}${r.unit ? ` ${r.unit}` : ''}` : '—',
        priority: <PriorityBadge priority={r.priority} />,
        requiredDate: r.requiredDate ? (
          <span style={overdue ? { color: 'var(--o-text-danger)', fontWeight: 700 } : undefined}>
            {r.requiredDate}{overdue ? ' (متأخّر)' : ''}
          </span>
        ) : '—',
        site: r.site || '—',
        requester: r.requester || r.createdByName || '—',
        status: <StateBadge stateId={r.state} />,
        actions: trans.length ? (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {trans.map((t) => (
              <button
                key={t.to}
                type="button"
                className={`btn btn-sm ${t.to === 'rejected' ? 'btn-secondary' : 'btn-primary'}`}
                style={t.to === 'rejected' ? { color: 'var(--o-text-danger)', borderColor: 'var(--o-text-danger)' } : undefined}
                onClick={() => run(r.id, t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--o-gray-500)' }}>—</span>
        ),
      },
    };
  });

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">احتياجات الموقع</span></nav>
        </div>
        <div className="o_cp_end">
          <span className="o_badge o_badge-draft" title="حالة المزامنة مع السحابة">
            <Icon name="globe" size={13} /> {pending ? 'بانتظار المزامنة…' : 'متزامن'}
          </span>
        </div>
      </div>

      <div className="o_ds">
        {msg && <div className="o_alert success">{msg}</div>}
        {err && <div className="o_alert danger">{err}</div>}

        {/* سبب الرفض — إلزاميّ ويُحفظ في سجلّ التدقيق */}
        {asking && (
          <div className="o_alert danger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="o_form_label">سبب «{asking.label}» — إلزاميّ (يُحفظ في سجلّ التدقيق باسمك)</label>
            <textarea
              className="o_input"
              autoFocus
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: الصنف متوفّرٌ في مخزنٍ آخر — لا حاجة للطلب."
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!note.trim()}
                onClick={() => run(asking.needId, { to: asking.to, label: asking.label })}
              >
                تأكيد {asking.label}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAsking(null); setNote(''); }}>
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* ① تدخّلٌ الآن */}
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ fontSize: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="activity" size={16} /> تدخّلٌ الآن
          </h3>
          {actionable.length === 0 ? (
            <div className="o_dashboard_empty">لا شيء ينتظر إجراءك الآن.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {actionable.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '12px', flexWrap: 'wrap', border: '1px solid var(--o-border-color)',
                    borderRadius: '8px', padding: '10px 14px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="decoration-bf">{r.description}</span>
                    <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
                      {NEED_CATEGORIES[r.category]?.label || '—'} · الموقع {r.site || DEFAULT_SITE}
                      {r.requiredDate ? ` · مطلوب ${r.requiredDate}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <PriorityBadge priority={r.priority} />
                    <StateBadge stateId={r.state} />
                    {availableTransitions(r.state, role).map((t) => (
                      <button
                        key={t.to}
                        type="button"
                        className={`btn btn-sm ${t.to === 'rejected' ? 'btn-secondary' : 'btn-primary'}`}
                        style={t.to === 'rejected' ? { color: 'var(--o-text-danger)', borderColor: 'var(--o-text-danger)' } : undefined}
                        onClick={() => run(r.id, t)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ② إجراءٌ سريع — تسجيل احتياج */}
        {isRequester && (
          <div style={{ marginBottom: '18px' }}>
            <NeedForm
              profile={me}
              onSaved={() => flash('سُجّل الاحتياج بنجاح وحُفظ في السحابة.')}
              onError={(t) => setErr(t)}
            />
          </div>
        )}

        {/* ③ الفهرس الكامل */}
        <div className="o_ds_card">
          <div className="o_ds_pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--o-border-color)' }}>
            <h3 className="o_form_title" style={{ fontSize: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="clipboardList" size={16} /> فهرس الاحتياجات
              <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', fontWeight: 400 }}>
                ({int(rows.length)} إجمالًا · جديد {int(counts.new)} · قيد التنفيذ {int(counts.in_progress)})
              </span>
            </h3>
            <label className="o_field_block" style={{ margin: 0 }}>
              <select className="o_input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="تصفية الحالة">
                <option value="open">المفتوحة</option>
                <option value="all">الكلّ</option>
                <option value="new">جديد</option>
                <option value="approved">معتمَد</option>
                <option value="in_progress">قيد التنفيذ</option>
                <option value="done">منجَز</option>
                <option value="rejected">مرفوض</option>
              </select>
            </label>
          </div>
          {visibleRows.length === 0 ? (
            <div className="o_dashboard_empty">لا احتياجات بهذا التصفية.</div>
          ) : (
            <ListView selectable={false} columns={cols} rows={listRows} />
          )}
        </div>
      </div>
    </div>
  );
}

function NeedForm({ profile, onSaved, onError }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('spare_parts');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [requiredDate, setRequiredDate] = useState('');
  const [site, setSite] = useState(DEFAULT_SITE);
  const [requester, setRequester] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createSiteNeed(
        { description, category, quantity, unit, priority, requiredDate, site, requester, notes },
        profile
      );
      setDescription(''); setQuantity(''); setUnit(''); setPriority('NORMAL');
      setRequiredDate(''); setRequester(''); setNotes(''); setCategory('spare_parts');
      onSaved();
    } catch (ex) {
      onError(ex?.message || 'تعذّر تسجيل الاحتياج.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="o_ds_card o_ds_pad" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 className="o_form_title" style={{ fontSize: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="plus" size={16} /> تسجيل احتياجٍ جديد
      </h3>

      <L label="وصف الاحتياج" required>
        <input className="o_input" value={description} onChange={(e) => setDescription(e.target.value)} required autoFocus placeholder="مثال: فلتر زيت للرافعة الشوكية" />
      </L>

      <div className="o_form_grid">
        <L label="الفئة" required>
          <select className="o_input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.values(NEED_CATEGORIES).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </L>
        <L label="الأولويّة">
          <select className="o_input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.values(PR_PRIORITY).map((p) => (
              <option key={p.id} value={p.id}>{p.labelAr}</option>
            ))}
          </select>
        </L>
        <L label="الكمّيّة">
          <input className="o_input" type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </L>
        <L label="الوحدة">
          <input className="o_input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="قطعة / كجم / كرتون" />
        </L>
        <L label="التاريخ المطلوب">
          <input className="o_input" type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
        </L>
        <L label="الموقع / المخزن">
          <input className="o_input" value={site} onChange={(e) => setSite(e.target.value)} />
        </L>
        <L label="طالب الاحتياج">
          <input className="o_input" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="اسم الطالب أو القسم" />
        </L>
      </div>

      <L label="ملاحظات">
        <textarea className="o_input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي تفاصيل تساعد على التنفيذ…" />
      </L>

      <div className="o_form_actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'جارٍ الحفظ…' : 'تسجيل الاحتياج'}
        </button>
      </div>
    </form>
  );
}

function L({ label, required, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}
