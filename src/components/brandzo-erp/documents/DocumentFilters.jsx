/**
 * لوحةُ تصفيةِ المستندات — التاريخُ والطرفُ والرقم (طلب المالك ١ · 2026-10-02).
 *
 * كلُّ الحكم في `services/documents/docReport.js` الخالص المُختبَر؛ هذا عرضٌ
 * وتفاعلٌ فقط — لا تصفيةَ تُحسب هنا ولا تاريخَ يُقارَن.
 *
 * ★★ والتصفيةُ المتقدّمةُ **مطويّةٌ افتراضًا**: الموظّفُ الذي يبحث برقمٍ
 * يكتبه في المربّع ويمضي، وسبعةُ حقولٍ مفتوحةٍ أمامه كلَّ مرّةٍ ضجيج. ومن
 * احتاجها فتحها — وتبقى مفتوحةً ما دامت فيها قيمة (`hasActiveCriteria`)،
 * فلا تُطوى تصفيةٌ نشطةٌ فيظنّ الباحثُ أنّه يرى الكلّ وهو يرى جزءًا. وهذا
 * آخرُ ما نريد في شاشةِ مستندات.
 */
import { useId } from 'react';
import Icon from '../../ui/Icon.jsx';
import { int } from '../../odoo/format.js';
import { DATE_BASES, hasActiveCriteria, criteriaSummary, EMPTY_CRITERIA } from '../../../services/documents/docReport.js';
import { STATES } from '../../../services/documents/states.js';

/** نطاقاتٌ جاهزة — فمن أراد «اليوم» لا يكتب تاريخين. */
export function quickRanges(nowMs = Date.now()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date(nowMs);
  const today = day(now);
  const shift = (days) => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() - days);
    return day(d);
  };
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { id: 'today', label: 'اليوم', from: today, to: today },
    { id: 'yesterday', label: 'أمس', from: shift(1), to: shift(1) },
    { id: 'week', label: 'آخر 7 أيّام', from: shift(6), to: today },
    { id: 'month', label: 'هذا الشهر', from: monthStart, to: today },
    { id: 'prevMonth', label: 'الشهر الماضي', from: day(prevMonth), to: day(prevMonthEnd) },
  ];
}

export default function DocumentFilters({
  criteria,
  onChange,
  types = [],
  open,
  onToggleOpen,
  resultCount = 0,
  totalCount = 0,
  nowMs,
}) {
  const uid = useId();
  const active = hasActiveCriteria(criteria);
  const set = (patch) => onChange({ ...criteria, ...patch });
  const ranges = quickRanges(nowMs);
  /** هل هذا النطاقُ الجاهزُ مطبَّقٌ الآن؟ (فيُعلَّم زرُّه) */
  const activeRange = ranges.find((r) => r.from === criteria.from && r.to === criteria.to);

  return (
    <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
      {/* ── السطرُ الأوّل: بحثٌ حرٌّ دائمًا ظاهر ── */}
      <div className="o_ds_toolbar" style={{ marginBottom: open ? '14px' : 0 }}>
        <div className="o_searchview">
          <span className="o_searchview_icon" aria-hidden="true">⌕</span>
          <input
            type="text"
            value={criteria.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="ابحث برقم المستند أو نوعه أو منشئه أو اسم المورّد/العميل…"
            aria-label="بحث"
          />
        </div>

        <button
          type="button"
          className={`btn btn-sm ${open || active ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={`${uid}-adv`}
        >
          <Icon name="clipboardList" size={15} /> تصفيةٌ متقدّمة
          {active && <span style={{ marginInlineStart: '6px', fontSize: '11px', background: 'var(--o-gray-200)', color: 'var(--o-gray-700)', borderRadius: '999px', padding: '1px 7px' }}>نشطة</span>}
        </button>

        {active && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...EMPTY_CRITERIA, basis: criteria.basis })}>
            <Icon name="x" size={14} /> مسح التصفية
          </button>
        )}

        <span style={{ marginInlineStart: 'auto', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', whiteSpace: 'nowrap' }}>
          {/* العددان معًا: «12 من 340» تقول إنّ ثمّة ما هو مخفيٌّ خلف التصفية —
              و«12» وحدها تُقرأ كأنّها كلُّ ما في النظام. */}
          {active ? `${int(resultCount)} من ${int(totalCount)}` : `${int(totalCount)} مستندًا`}
        </span>
      </div>

      {/* ── التصفيةُ المتقدّمة ── */}
      {open && (
        <div id={`${uid}-adv`}>
          {/* النطاقاتُ الجاهزة */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
            <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)', minWidth: '72px' }}>
              مدّةٌ سريعة
            </span>
            {ranges.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`btn btn-sm ${activeRange?.id === r.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => set({ from: r.from, to: r.to })}
              >
                {r.label}
              </button>
            ))}
            {(criteria.from || criteria.to) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ from: '', to: '' })}>
                بلا تحديدِ مدّة
              </button>
            )}
          </div>

          {/* الحقول */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            <Field label="أساسُ التاريخ" hint={DATE_BASES.find((b) => b.id === criteria.basis)?.hint}>
              <select className="o_input" value={criteria.basis} onChange={(e) => set({ basis: e.target.value })}>
                {DATE_BASES.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </Field>

            <Field label="من تاريخ">
              <input type="date" className="o_input" value={criteria.from} onChange={(e) => set({ from: e.target.value })} />
            </Field>

            <Field label="إلى تاريخ">
              <input type="date" className="o_input" value={criteria.to} onChange={(e) => set({ to: e.target.value })} />
            </Field>

            <Field label="المورّد أو العميل" hint="الاسمُ أو الرمز — جزءٌ منه يكفي">
              <input
                type="text"
                className="o_input"
                value={criteria.party}
                onChange={(e) => set({ party: e.target.value })}
                placeholder="مثال: الزاوية · SUP-004"
              />
            </Field>

            <Field label="رقمُ المستند" hint="جزءٌ من الرقم يكفي">
              <input
                type="text"
                className="o_input"
                value={criteria.number}
                onChange={(e) => set({ number: e.target.value })}
                placeholder="مثال: 000127"
                style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'start' }}
              />
            </Field>

            <Field label="النوع">
              <select className="o_input" value={criteria.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="">كلّ الأنواع</option>
                {types.map((f) => (
                  <option key={f.type} value={f.type}>{f.titleAr}</option>
                ))}
              </select>
            </Field>

            <Field label="الحالة">
              <select className="o_input" value={criteria.state} onChange={(e) => set({ state: e.target.value })}>
                <option value="">كلّ الحالات</option>
                {Object.values(STATES).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>

            <Field label="المتأخّر">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: 'var(--o-font-size-sm)', cursor: 'pointer', paddingTop: '6px' }}>
                <input type="checkbox" checked={criteria.staleOnly} onChange={(e) => set({ staleOnly: e.target.checked })} />
                المتأخّرَ وحده
              </label>
            </Field>
          </div>

          {/* سطرُ الشرط — نفسُه الذي يُكتب في رأس الملفّ المُصدَّر، فما يُرى هو ما يُصدَّر */}
          {active && (
            <p style={{ marginTop: '12px', marginBottom: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.7 }}>
              <Icon name="fileText" size={12} /> شرطُ التقرير: {criteriaSummary(criteria)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: '10.5px', color: 'var(--o-gray-500)', lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}
