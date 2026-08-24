import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { importSheet } from '../../../services/excel/excelImport.js';
import { fetchBalancesOnce } from '../../../services/balances/balancesService.js';
import { fetchLocationsOnce } from '../../../services/locations/locationsService.js';
import { createDraft } from '../../../services/documents/documentsService.js';
import {
  STATUS_LABELS,
  locationMismatch,
  reconcile,
  referenceCoverage,
  toCountDraft,
  variances,
} from '../../../services/locations/reconcile.js';

/**
 * شاشة المطابقة ‹CAP-501› — توصل محرّك `reconcile` المهجور.
 *
 * ═══ لماذا كانت مهجورة؟ ═══
 * لم يكن المحرّك ناقصًا: `reconcile` مبنيٌّ ومختبَرٌ منذ خطّة المواقع، ومعه
 * `toCountDraft` الذي يحوّل الفروقات إلى محضر جرد `CC`، وحارس `adjustmentVerdict`
 * الذي يشترط محضرًا معتمَدًا قبل أيّ تسوية. الناقصُ **شاشةٌ تجمع القطع**:
 * لقطةُ النظام من الشيت + أرصدةُ البوابة ⟵ المحرّك ⟵ الكشف.
 *
 * ═══ ولماذا شاشةٌ مستقلّة لا تبويبٌ في صفحة الجرد؟ ═══
 * قرار المالك ‹ق-٦›: **«صفحة الجرد للجرد»** — الالتقاط يسجّل ما على الرفّ ولا
 * يعرف رصيدًا ولا فرقًا. فالمطابقة تقف هنا، والعدّ هناك، ولا يختلطان.
 *
 * ═══ وأمانةُ الوصل ═══
 * أُجّلت المطابقة حتى **تجهز الأرصدة** (كانت ٧٤ سطرًا مقابل ١٠٤١ في الشيت).
 * فهذه الشاشة تُعلن التغطية رقمًا قبل أيّ فرق: حين يعرف الطرفان أقلَّ من نصف
 * الأصناف، تُصدَّر الملاحظة أوّلَ ما تُرى، **ويُقفل زرُّ المحضر** — فلا يُعتمد
 * «عجزٌ» هو في حقيقته غيابُ تسجيل. والقفلُ يُرفع من تلقائه حين تجهز الأرصدة.
 *
 * البوابة لا تكتب في أيّ نظامٍ خارجيّ: الفرق يصير `CC` ثمّ `ADJ` بالاعتماد.
 */

const CAN_RECONCILE = new Set(['admin', 'warehouse_manager', 'inventory_auditor']);
const STATUS_ORDER = ['shortage', 'surplus', 'missing-in-portal', 'missing-in-system', 'match'];
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);

export default function StockReconcile() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importErrors, setImportErrors] = useState([]);
  const [locWarning, setLocWarning] = useState('');
  const [filter, setFilter] = useState('all');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  const coverage = useMemo(() => (report ? referenceCoverage(report) : null), [report]);
  const diffs = useMemo(() => (report ? variances(report) : []), [report]);
  const shown = useMemo(() => {
    if (!report) return [];
    return filter === 'all' ? report.rows : report.rows.filter((r) => r.status === filter);
  }, [report, filter]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setCreated(null); setReport(null); setImportErrors([]); setLocWarning('');
    setBusy('يقرأ لقطة النظام…');
    try {
      const result = await importSheet(file, 'stockSnapshot');
      setFileName(file.name);
      setImportErrors(result.errors || []);
      if (!result.rows?.length) {
        setError('لا صفوف صالحة في الملف — راجع الأخطاء أدناه أو نزّل القالب.');
        return;
      }
      setBusy('يقرأ أرصدة البوابة…');
      const [balances, locations] = await Promise.all([fetchBalancesOnce(), fetchLocationsOnce()]);
      const rep = reconcile(result.rows, balances);
      setReport(rep);
      setLocWarning(locationMismatch(rep, (locations || []).map((l) => l.code)));
    } catch (err) {
      setError(err?.message || 'تعذّرت قراءة الملف.');
    } finally {
      setBusy('');
      e.target.value = '';
    }
  }

  async function makeCountDraft() {
    if (!report || !coverage?.ready) return;
    setBusy('ينشئ محضر الجرد…'); setError('');
    try {
      const draft = toCountDraft(report);
      const id = await createDraft({ type: 'CC', profile: me, header: draft.header, lines: draft.lines });
      setCreated({ id, lines: draft.lines.length });
    } catch (err) {
      setError(err?.message || 'تعذّر إنشاء المحضر.');
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_RECONCILE.has(me.role)) {
    return <Notice>المطابقة للمدير العام ومدير المستودع ومدقّق الجرد.</Notice>;
  }

  const base = getBasePath();
  const s = report?.summary;

  return (
    <div dir="rtl" className="space-y-6">
      {/* ═══ الطبقة ١ — ارفع لقطة النظام ═══ */}
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
            <Icon name="fileUp" size={18} />
          </span>
          <div className="flex-1 min-w-[220px]">
            <div className="font-bold text-ink">لقطة مخزون النظام</div>
            <div className="text-xs text-muted">
              ورقة <span className="font-mono">StockSnapshot</span> — الصنف والمستودع ورصيد النظام. الموقع والدفعة اختياريّان،
              ووجودهما يرفع مستوى المقارنة تلقائيًّا.
            </div>
          </div>
          <label className="btn btn-primary btn-sm cursor-pointer">
            اختر ملفًّا
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" disabled={!!busy} />
          </label>
          <a href={`${base}/dashboard/data-reports`} className="btn btn-secondary btn-sm">القوالب</a>
        </div>
        {fileName && <div className="text-xs text-muted mt-2">آخر ملف: {fileName}</div>}
        {busy && <div className="text-xs text-accent font-bold mt-2">{busy}</div>}
        {error && (
          <div className="mt-3 rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs p-2.5">{error}</div>
        )}
        {importErrors.length > 0 && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-2 font-bold">{importErrors.length} صفًّا مرفوضًا عند القراءة</summary>
            <ul className="mt-2 space-y-1 text-muted list-none p-0">
              {importErrors.slice(0, 12).map((x, i) => (
                <li key={i}>صف {x.row} · {x.column} — {x.message}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {report && (
        <>
          {/* ═══ الطبقة ٢ — تغطية المرجع: تُقرأ قبل أيّ رقمِ فرق ═══ */}
          <section
            className={`o_ds o_ds_card o_ds_pad border ${coverage.ready ? 'border-line' : 'border-brand-red/40 bg-brand-red/5'}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                name={coverage.ready ? 'checkCircle' : 'alertTriangle'}
                size={16}
                className={`mt-0.5 shrink-0 ${coverage.ready ? 'text-accent' : 'text-brand-red'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-ink text-sm mb-1">
                  تغطية المرجع: {num(coverage.both)} من {num(coverage.lines)} ({coverage.pct}٪)
                </div>
                <div className="text-xs leading-relaxed text-ink-2">
                  {coverage.note || 'الطرفان يعرفان أكثر الأصناف — الفروقات أدناه فروقُ بضاعةٍ لا غيابَ تسجيل.'}
                </div>
              </div>
            </div>
          </section>

          {locWarning && (
            <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs leading-relaxed p-3 flex items-start gap-2">
              <Icon name="alertTriangle" size={14} className="mt-0.5 shrink-0" />
              <span>{locWarning}</span>
            </div>
          )}

          {/* ═══ الطبقة ٣ — الحصيلة ═══ */}
          <section className="o_ds o_ds_card">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-x-reverse divide-line">
              <Kpi label="سطور المقارنة" value={num(s.lines)} hint={levelLabel(report.level)} />
              <Kpi label="مطابق" value={num(s.matched)} hint="بلا فرق" />
              <Kpi label="عجز عندنا" value={num(s.shortage)} hint="الفعليّ أقلّ" tone="red" />
              <Kpi label="زيادة عندنا" value={num(s.surplus)} hint="الفعليّ أكثر" />
              <Kpi label="لا رصيد عندنا" value={num(s.missingInPortal)} hint="يعرفه النظام" />
              <Kpi label="لا يعرفه النظام" value={num(s.missingInSystem)} hint="عندنا فقط" />
            </div>
            <div className="border-t border-line px-4 py-2.5 text-xs text-muted flex flex-wrap gap-x-5 gap-y-1">
              <span>رصيد النظام: <b className="text-ink-2">{num(s.systemQty)}</b></span>
              <span>الفعليّ عندنا: <b className="text-ink-2">{num(s.physicalQty)}</b></span>
              <span>صافي الفرق: <b className={s.netVariance < 0 ? 'text-brand-red' : 'text-ink-2'}>{num(s.netVariance)}</b></span>
              {report.snapshotDate && <span>تاريخ اللقطة: <b className="text-ink-2">{report.snapshotDate}</b></span>}
            </div>
          </section>

          {/* ═══ الطبقة ٤ — الفروقات إلى محضر جرد ═══ */}
          <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="font-bold text-ink text-sm">{num(diffs.length)} فرقًا يحتاج معالجة</div>
              <div className="text-xs text-muted leading-relaxed">
                الفرق لا يُصلَح هنا: يصير محضر جرد <span className="font-mono">CC</span> يُعتمد، ثمّ تسوية{' '}
                <span className="font-mono">ADJ</span> بحارسها. والبوابة لا تكتب في نظامٍ خارجيّ.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!!busy || !diffs.length || !coverage.ready}
              onClick={makeCountDraft}
              title={coverage.ready ? '' : 'مقفلٌ حتى تجهز الأرصدة — قرار المالك ق-٦'}
            >
              حوّل الفروقات إلى محضر جرد
            </button>
          </section>

          {created && (
            <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex flex-wrap items-center gap-3">
              <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
              <span className="flex-1 text-ink-2">أُنشئ محضر جرد بـ{num(created.lines)} بندًا — مسودّةٌ تنتظر اعتمادك.</span>
              <a href={`${base}/dashboard/document?type=CC&id=${created.id}`} className="btn btn-secondary btn-sm">افتح المحضر</a>
            </div>
          )}

          {/* ═══ الطبقة ٥ — الكشف ═══ */}
          <section className="o_ds o_ds_card">
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-line">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')} label={`الكل (${num(s.lines)})`} />
              {STATUS_ORDER.map((st) => {
                const n = report.rows.filter((r) => r.status === st).length;
                return n ? (
                  <Chip key={st} active={filter === st} onClick={() => setFilter(st)} label={`${STATUS_LABELS[st]} (${num(n)})`} />
                ) : null;
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-line">
                    <Th>الصنف</Th><Th>المستودع</Th><Th>الموقع</Th><Th>الدفعة</Th>
                    <Th align="left">النظام</Th><Th align="left">الفعليّ</Th><Th align="left">الفرق</Th><Th>الحالة</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 300).map((r) => (
                    <tr key={r.key} className="border-b border-line/60 hover:bg-chip">
                      <Td>
                        <span className="font-bold text-ink-2">{r.sku || r.barcode}</span>
                        {r.description && <span className="block text-[10px] text-muted truncate max-w-[220px]">{r.description}</span>}
                      </Td>
                      <Td>{r.warehouse}</Td>
                      <Td>
                        {r.portalLocation || '—'}
                        {r.systemLocation && r.systemLocation !== r.portalLocation && (
                          <span className="block text-[10px] text-muted">النظام: {r.systemLocation}</span>
                        )}
                      </Td>
                      <Td>{r.batch || '—'}</Td>
                      <Td align="left">{num(r.systemQty)}</Td>
                      <Td align="left">{num(r.physicalQty)}</Td>
                      <Td align="left">
                        <span className={r.variance < 0 ? 'text-brand-red font-bold' : r.variance > 0 ? 'font-bold text-ink' : 'text-muted'}>
                          {r.variance > 0 ? '+' : ''}{num(r.variance)}
                        </span>
                      </Td>
                      <Td><span className="text-[10px] text-ink-2">{STATUS_LABELS[r.status]}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > 300 && (
              <div className="p-3 text-xs text-muted border-t border-line">
                يُعرض 300 من {num(shown.length)} — صفِّ بالحالة لتضييق الكشف.
              </div>
            )}
            {shown.length === 0 && <div className="p-6 text-center text-muted text-sm">لا صفوف في هذه الحالة.</div>}
          </section>
        </>
      )}
    </div>
  );
}

function levelLabel(level) {
  const parts = ['الصنف', 'المستودع'];
  if (level?.byLocation) parts.push('موقع النظام');
  if (level?.byBatch) parts.push('الدفعة');
  return `عند ${parts.join(' × ')}`;
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function Chip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition-colors ${
        active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-chip border-line text-ink-2 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align }) => (
  <td className={`px-3 py-2 align-top ${align === 'left' ? 'text-left font-mono' : 'text-right'}`}>{children}</td>
);

function Notice({ children }) {
  return <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>;
}
