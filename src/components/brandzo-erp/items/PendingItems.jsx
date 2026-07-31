/**
 * شاشة مراجعة الأصناف المعلّقة (I-د).
 *
 * ما تحلّه: الباركود المجهول الذي يمسحه الموظّف ميدانيًّا كان يعيش في
 * `localStorage` جلسةً واحدة ثم يضيع — لا المدير يعلم أنه مرّ، ولا الماستر
 * يتعلّم منه. الآن يصل هنا: يراه المدير بعدد مرّات مسحه ومن رآه أولًا،
 * فيعتمده صنفًا حقيقيًّا في الماستر أو يرفضه بسببٍ موثَّق.
 *
 * كل الأحكام في `pendingModel.js` الخالص المُختبَر؛ هذا عرضٌ وإدخال.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو (ListView + Badge
 * + o_kpi + o_input + o_alert + Icon + format.int) — **بلا لفّ في `.o_theme`**
 * (اللوحة مضمَّنة في ماستر الأصناف الذي يملك سياق الثيم). المنطق (الاشتراك
 * والاعتماد والرفض) لم يُمسّ؛ غُيّر ما يُرسَم فقط، والأرقام لاتينية (R2).
 */
import { useEffect, useMemo, useState } from 'react';
import { listenPending, approvePending, rejectPending } from '../../../services/items/pendingService.js';
import { PENDING_STATES, pendingSummary } from '../../../services/items/pendingModel.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

/** ربط حالة السجلّ بشارة أودو (عرض فقط). */
const STATE_VARIANT = { pending: 'warn', approved: 'done', rejected: 'danger' };

/** أعمدة قائمة المعلّقة. */
const LIST_COLS = [
  { key: 'barcode', label: 'الباركود' },
  { key: 'name', label: 'الاسم الميداني' },
  { key: 'seen', label: 'مرّات المسح', numeric: true },
  { key: 'firstSeen', label: 'أول من رآه' },
  { key: 'status', label: 'الحالة' },
  { key: 'actions', label: 'إجراء' },
];

/** بطاقة عدّ صغيرة (o_kpi). */
function Tally({ value, label, icon, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      <span className="o_kpi_icon"><Icon name={icon} size={20} /></span>
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
    </div>
  );
}

export default function PendingItems({ me, onFlash }) {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(false);
  /** السجلّ المفتوح للاعتماد + مسودّة المدير. */
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const unsub = listenPending(
      (list) => {
        setRecords(list);
        setError('');
      },
      (err) => setError(err?.message || 'تعذّرت قراءة الأصناف المعلّقة')
    );
    return () => unsub();
  }, []);

  const summary = useMemo(() => pendingSummary(records), [records]);
  const shown = useMemo(
    () =>
      records
        .filter((r) => (filter === 'all' ? true : r.state === filter))
        .sort((a, b) => (b.seenCount || 0) - (a.seenCount || 0)),
    [records, filter]
  );

  function openApprove(rec) {
    setEditing({
      rec,
      draft: {
        sku: '',
        // الاسم المكتوب في الميدان بذرةٌ للمدير — إلا إن كان الباركود نفسه.
        nameAr: rec.name && rec.name !== rec.barcode ? rec.name : '',
        nameEn: '',
        category: '',
        unit: 'piece',
        unitPrice: rec.lastPrice || 0,
      },
    });
  }

  async function doApprove() {
    setBusy(true);
    try {
      const { sku } = await approvePending(editing.rec, editing.draft, me);
      onFlash?.('success', `اعتُمد في الماستر بالكود ${sku} — صار يُستدعى بالباركود فورًا`);
      setEditing(null);
    } catch (e) {
      onFlash?.('error', e.message || 'تعذّر الاعتماد');
    } finally {
      setBusy(false);
    }
  }

  async function doReject(rec) {
    const reason = window.prompt('سبب الرفض (إلزامي — الرفض بلا سبب لا يُوثَّق):');
    if (reason === null) return;
    setBusy(true);
    try {
      await rejectPending(rec, reason, me);
      onFlash?.('success', 'رُفض السجلّ — وبقي أثره');
    } catch (e) {
      onFlash?.('error', e.message || 'تعذّر الرفض');
    } finally {
      setBusy(false);
    }
  }

  const listRows = shown.map((r) => {
    const st = PENDING_STATES[r.state] || PENDING_STATES.pending;
    return {
      id: r.id,
      cells: {
        barcode: <span className="decoration-bf" dir="ltr">{r.rawBarcode || r.barcode}</span>,
        name: r.name && r.name !== r.barcode ? r.name : <span style={{ color: 'var(--o-gray-500)' }}>— بلا اسم</span>,
        seen: <span className={(r.seenCount || 0) > 3 ? 'decoration-bf' : ''}>{int(r.seenCount || 1)}</span>,
        firstSeen: r.firstSeenByName || '—',
        status: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
            <Badge variant={STATE_VARIANT[r.state] || 'warn'}>{st.label}</Badge>
            {r.state === 'approved' && r.approvedSku && (
              <span style={{ fontSize: '10px', color: 'var(--o-main-color-muted)', fontFamily: 'monospace' }}>{r.approvedSku}</span>
            )}
            {r.state === 'rejected' && r.rejectReason && (
              <span style={{ fontSize: '10px', color: 'var(--o-main-color-muted)' }}>{r.rejectReason}</span>
            )}
          </div>
        ),
        actions:
          r.state === 'pending' ? (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => openApprove(r)}>اعتماد</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => doReject(r)}>رفض</button>
            </div>
          ) : (
            <span style={{ color: 'var(--o-gray-500)' }}>—</span>
          ),
      },
    };
  });

  return (
    <section className="o_ds_card o_ds_pad" dir="rtl" style={{ marginBottom: '18px' }}>
      <h3 className="o_form_title" style={{ fontSize: '20px', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="clipboardList" size={18} /> الأصناف المعلّقة
      </h3>
      <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: 0, maxWidth: '42rem', lineHeight: 1.6 }}>
        باركودات مُسحت في الميدان ولا يعرفها الماستر. لا توقف العمل ولا تدخل الماستر
        حتى تعتمدها — والمعرّف حتميّ فمسحُ الباركود عشرًا يُنشئ سجلًّا واحدًا بعدّاده.
      </p>

      <div className="o_dashboard_kpis" style={{ margin: '16px 0' }}>
        <Tally value={summary.pending} label="بانتظار المراجعة" icon="clipboardList" />
        <Tally value={summary.approved} label="اعتُمد" icon="checkCircle" />
        <Tally value={summary.rejected} label="مرفوض" icon="alertTriangle" alert />
      </div>

      {error && (
        <div className="o_alert danger">
          {error} — تأكّد من نشر قواعد الأمان المحدَّثة (Items_Pending).
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 14px' }}>
        {[
          ['pending', 'بانتظار المراجعة'],
          ['approved', 'المعتمَدة'],
          ['rejected', 'المرفوضة'],
          ['all', 'الكل'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        filter === 'pending' ? (
          <div className="o_alert success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="checkCircle" size={16} /> لا أصناف معلّقة — كل ما مُسح معروف في الماستر.
          </div>
        ) : (
          <div className="o_dashboard_empty">لا سجلّات في هذا التصنيف.</div>
        )
      ) : (
        <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
      )}

      {/* ── نموذج الاعتماد ── */}
      {editing && (
        <div style={{ marginTop: '18px', borderTop: '1px solid var(--o-border-color)', paddingTop: '18px' }}>
          <h4 className="o_form_title" style={{ fontSize: '16px', margin: '0 0 2px' }}>
            اعتماد الباركود <span className="decoration-bf" dir="ltr" style={{ color: 'var(--o-action)', fontFamily: 'monospace' }}>{editing.rec.rawBarcode || editing.rec.barcode}</span>
          </h4>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
            الباركود يُضاف تلقائيًّا إلى فهرس الاستدعاء، فيُعرَف بمسحه فور الاعتماد.
          </p>
          <div className="o_form_grid">
            {[
              ['sku', 'كود الصنف (SKU) *', 'text'],
              ['nameAr', 'الاسم العربي *', 'text'],
              ['nameEn', 'الاسم الإنجليزي', 'text'],
              ['category', 'التصنيف', 'text'],
              ['unit', 'الوحدة', 'text'],
              ['unitPrice', 'سعر الوحدة (د.ل)', 'number'],
            ].map(([key, label, type]) => (
              <label key={key} className="o_field_block">
                <span className="o_form_label">{label}</span>
                <input
                  type={type}
                  className="o_input"
                  value={editing.draft[key]}
                  onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, [key]: e.target.value } }))}
                />
              </label>
            ))}
          </div>
          <div className="o_form_actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>إلغاء</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={doApprove}>
              {busy ? '…' : 'اعتماد وإضافة للماستر'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
