/**
 * تقرير التواريخ المعدّلة (م٢-ج · يكمل سدّ ف‑٨).
 *
 * الشارة على المستند تكشف الحالة؛ وهذه الشاشة تكشف **النمط**: من يؤرّخ للماضي
 * دائمًا، وبأيّ سببٍ مكرّر، وفي أيّ نوعٍ من المستندات. والمسموح المتكرّر يصير
 * عادةً، والعادة تصير بابًا.
 *
 * بنية ٣ طبقات: تدخّل الآن · فلاتر · الفهرس الكامل.
 * الوصول: المديران ومدقّق الجرد — من يُراجَع لا يُراجِع نفسه.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenSettings } from '../../../services/settings/settingsService.js';
import {
  backdateRows,
  filterRows,
  backdateSummary,
  attentionItems,
  BACKDATE_COLUMNS,
} from '../../../services/documents/backdateReport.js';

const VIEWER_ROLES = ['admin', 'warehouse_manager', 'inventory_auditor', 'finance_manager'];

const input = 'bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink';
const card = 'rounded-xl border border-line bg-surface p-4';

const cellOf = (row, key) => (key === 'fields' ? (row.fields || []).join('، ') : String(row[key] ?? ''));

export default function DateIntegrityReport() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [f, setF] = useState({ person: '', type: '', minDays: 0, from: '', to: '' });

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    const unsubDocs = listenAllDocuments(setDocuments, 500);
    const unsubSet = listenSettings(setSettings);
    return () => {
      unsubDocs();
      unsubSet();
    };
  }, [me]);

  const rows = useMemo(() => backdateRows(documents), [documents]);
  const shown = useMemo(() => filterRows(rows, f), [rows, f]);
  const summary = useMemo(() => backdateSummary(shown), [shown]);
  const attention = useMemo(() => attentionItems(rows), [rows]);
  const people = useMemo(() => [...new Set(rows.map((r) => r.byName))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))].sort(), [rows]);

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!VIEWER_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">هذا التقرير محصورٌ بالمديرَين ومدقّق الجرد والمالي.</p>;
  }

  const range = settings?.dating?.backdateDays ?? 7;

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: تدخّل الآن ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">تدخّل الآن</h2>
        <p className="text-xs text-ink-2 mb-3">
          المدى المسموح اليوم: {range} يومًا بلا اعتماد. وما دونه لا يظهر هنا — التقرير للمُبرَّر المتكرّر لا للمسموح.
        </p>
        {attention.length ? (
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.key} className="text-sm text-brand-red">{a.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink">لا نمط يستدعي تدخّلًا — {rows.length} حالةً مبرَّرةً ومتفرّقة.</p>
        )}
      </section>

      {/* ═══ الطبقة ٢: الفلاتر والملخّص ═══ */}
      <section className={card}>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs text-ink-2">
            <span className="block mb-1">الفاعل</span>
            <select className={input} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
              <option value="">الكلّ</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-2">
            <span className="block mb-1">نوع المستند</span>
            <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">الكلّ</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-2">
            <span className="block mb-1">أيّامٌ للماضي على الأقلّ</span>
            <input className={`${input} w-28`} type="number" min="0" value={f.minDays}
              onChange={(e) => setF({ ...f, minDays: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-ink-2">
            <span className="block mb-1">من</span>
            <input className={input} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </label>
          <label className="text-xs text-ink-2">
            <span className="block mb-1">إلى</span>
            <input className={input} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          <button className="rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip"
            onClick={() => setF({ person: '', type: '', minDays: 0, from: '', to: '' })}>
            مسح الفلاتر
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">الحالات المعروضة</div>
            <div className="text-ink text-lg">{summary.total}</div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">متوسّط الأيّام للماضي</div>
            <div className="text-ink text-lg">{summary.avgDaysBack}</div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">بلا سببٍ مكتوب</div>
            <div className={summary.noReason ? 'text-brand-red text-lg' : 'text-ink text-lg'}>{summary.noReason}</div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">أبعد تأريخ</div>
            <div className="text-ink text-lg">{summary.worst ? `${summary.worst.daysBack} يومًا` : '—'}</div>
          </div>
        </div>
      </section>

      {/* ═══ الطبقة ٣: الفهرس الكامل ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">من غيّر · ماذا · متى · لماذا</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-ink-2">لا بيانات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  {BACKDATE_COLUMNS.map((c) => (
                    <th key={c.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line/60">
                    {BACKDATE_COLUMNS.map((c) => (
                      <td key={c.key} className={`py-2 px-2 ${c.key === 'reason' && !r.reason ? 'text-brand-red' : 'text-ink'}`}>
                        {c.key === 'reason' && !r.reason ? 'بلا سبب' : cellOf(r, c.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
