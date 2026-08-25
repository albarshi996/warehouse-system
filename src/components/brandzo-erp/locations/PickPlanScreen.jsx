import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { buildGrid } from '../../../services/locations/travelGrid.js';
import { fefoLocationViolations, pickPlan } from '../../../services/locations/pickPlan.js';

/**
 * خطّة السحب — «نرفق الأكواد فيظهر مكانه» (طلب المالك 2026-08-24).
 *
 * ═══ ما تحلّه ═══
 * العامل يُعطى قائمةَ أصنافٍ ولا يُعطى **أين هي**. فيبحث في المستودع، أو
 * يسأل، أو يأخذ من أوّل ما يجد — فيخرج القديمُ بعد الجديد وتنتهي صلاحيّةُ
 * ما في العمق.
 *
 * والمنطق الذي يحلّ هذا **مبنيٌّ ومختبَرٌ منذ خطّة المواقع وبلا مستدعٍ واحد**:
 * يخصّص من المتاح بـFEFO (الأقرب انتهاءً أوّلًا)، ويعطي لكلّ بندٍ مواقعَه
 * وكمّيّاتِه ودفعاتِه، **ويرتّب المسار بالمشي الفعليّ** حين تتوفّر شبكة
 * المسافات — فيمشي العامل الممرّ مرّةً واحدة بدل أن يذهب ويعود.
 *
 * ═══ ومساران للمدخل ═══
 *   · **مستند سحبٍ قائم** — الحالة العاديّة.
 *   · **لصقُ أكواد** — «كود ٥» سطرًا سطرًا، فيُبنى طلبٌ عابرٌ في الذاكرة
 *     ويُخطَّط. لا يُحفظ شيء: هذا مسارُ «أين هذه الأصناف؟» لا مسار مستند.
 *
 * ولا حسابَ هنا: `pickPlan` و`fefoLocationViolations` و`buildGrid` كلّها
 * مبنيّةٌ ومختبَرة — هذه عرضٌ وتفاعل.
 */

const CAN_PICK = new Set(['admin', 'warehouse_manager', 'storekeeper', 'labor_supervisor', 'inventory_auditor']);
const DOCS_CAP = 300;
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);

export default function PickPlanScreen() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mode, setMode] = useState('doc');
  const [docId, setDocId] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const fail = (what) => (e) => setError(e?.message || `تعذّرت قراءة ${what}.`);
    const a = listenAllDocuments(setDocs, DOCS_CAP);
    const b = listenBalances(setBalances, fail('الأرصدة'));
    const c = listenLocations(setLocations, fail('المواقع'));
    return () => { a?.(); b?.(); c?.(); };
  }, [me]);

  const picks = useMemo(
    () => (docs || []).filter((d) => String(d?.type).toUpperCase() === 'PICK'),
    [docs]
  );

  /** الشبكة تحسّن ولا تُشترط — بلا مواقعَ معرّفة يعود الترتيب إلى الكود. */
  const grid = useMemo(() => (locations.length ? buildGrid(locations) : null), [locations]);

  /** طلبٌ عابرٌ من الأكواد الملصوقة — «كود» أو «كود ٥» في كلّ سطر. */
  const pastedDoc = useMemo(() => {
    const lines = String(pasted || '')
      .split(/\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const parts = raw.split(/[\s,;\t]+/).filter(Boolean);
        const qty = Number(parts[parts.length - 1]);
        const hasQty = parts.length > 1 && Number.isFinite(qty) && qty > 0;
        const code = (hasQty ? parts.slice(0, -1) : parts).join('');
        return { sku: code.toUpperCase(), barcode: code, qty: hasQty ? qty : 1 };
      });
    return { type: 'PICK', header: { warehouse: warehouse.toUpperCase() }, lines };
  }, [pasted, warehouse]);

  const source = useMemo(() => {
    if (mode === 'paste') return pastedDoc.lines.length ? pastedDoc : null;
    return picks.find((d) => d.id === docId) || null;
  }, [mode, pastedDoc, picks, docId]);

  /**
   * ⚠ الخطأ يُعاد **قيمةً** لا يُضبط حالةً هنا: `setState` داخل `useMemo`
   * تحديثٌ أثناء الرندر يرفضه React — فينهار المكوّن وتُفرَّغ الصفحة بلا
   * رسالة. (وقع حيًّا في أوّل تجربةٍ لهذه الشاشة.)
   */
  const { plan, planProblem } = useMemo(() => {
    if (!source) return { plan: null, planProblem: '' };
    try {
      return { plan: pickPlan(source, balances, { grid }), planProblem: '' };
    } catch (err) {
      return { plan: null, planProblem: err?.message || 'تعذّر بناء الخطّة.' };
    }
  }, [source, balances, grid]);

  const fefo = useMemo(
    () => (source && mode === 'doc' ? fefoLocationViolations(source, balances) : []),
    [source, balances, mode]
  );

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_PICK.has(me.role)) return <Notice>خطّة السحب لأمين المخزن والمشرفين.</Notice>;

  const base = getBasePath();

  return (
    <div dir="rtl" className="o_theme space-y-6">
      {/* ═══ الطبقة ١ — من أين نأتي بالطلب ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Tab active={mode === 'doc'} onClick={() => setMode('doc')} label={`مستند سحب (${num(picks.length)})`} />
          <Tab active={mode === 'paste'} onClick={() => setMode('paste')} label="ألصق أكوادًا" />
          <div className="flex-1" />
          <span className="text-[11px] text-muted self-center">
            {grid ? `شبكة المسافات جاهزة (${num(locations.length)} موقعًا)` : 'لا مواقعَ معرّفة — الترتيب بالكود'}
          </span>
        </div>

        {mode === 'doc' ? (
          <select
            className="w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          >
            <option value="">— اختر مستند سحب —</option>
            {picks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number || d.id} · {d.header?.warehouse || '—'} · {num((d.lines || []).length)} بندًا
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-3">
            <input
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value.toUpperCase())}
              placeholder="المستودع (اختياريّ)"
              className="bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono w-44 focus:outline-none focus:border-accent/50"
            />
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={4}
              placeholder={'كودُ الصنف والكمّيّة في كلّ سطر:\nOIL-1L 12\n6291234567890 3'}
              className="flex-1 min-w-[260px] bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 font-mono focus:outline-none focus:border-accent/50"
            />
          </div>
        )}
      </section>

      {(error || planProblem) && (
        <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error || planProblem}</div>
      )}

      {plan && (
        <>
          {/* ═══ الطبقة ٢ — الحصيلة ═══ */}
          <section className="o_ds o_ds_card">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
              <Kpi label="بنود الطلب" value={num(plan.lines.length)} hint={plan.warehouse || 'كلّ المستودعات'} />
              <Kpi label="محطّات المسار" value={num(plan.path.length)} hint="موقعٌ × بند" />
              <Kpi label="نقصٌ عن المطلوب" value={num(plan.shortages.length)} hint="لا يكفي المتاح" tone={plan.shortages.length ? 'red' : ''} />
              {/* ⚠ `route` و`pathBasis` **كائنان** لا رقمٌ ونصّ — عرضُهما كما هما
                  يرمي React #31 ويُفرّغ الشاشة (وقع حيًّا في أوّل تجربة). */}
              <Kpi
                label="مسافة المشي"
                value={plan.route?.stops ? `${num(plan.route.meters)}‏م` : '—'}
                hint={plan.route?.approximate ? 'تقريبٌ — أقربُ تالٍ لا مسارٌ أمثل' : plan.route?.note || ''}
              />
            </div>
          </section>

          {fefo.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <div className="flex items-start gap-2.5">
                <Icon name="alertTriangle" size={16} className="text-brand-red mt-0.5 shrink-0" />
                <div className="min-w-0 text-xs leading-relaxed">
                  <div className="font-bold text-ink mb-1">{num(fefo.length)} مخالفةَ صلاحيّة</div>
                  <ul className="space-y-0.5 list-none p-0 text-ink-2">
                    {fefo.slice(0, 6).map((v, i) => (
                      <li key={i}>
                        • <span className="font-mono">{v.sku}</span>
                        {v.description ? ` — ${v.description}` : ''}: سُحب من{' '}
                        <span className="font-mono">{v.pickedBin || '—'}</span>
                        {v.pickedExpiry ? ` (صلاحية ${v.pickedExpiry})` : ''}، والأقربُ انتهاءً في{' '}
                        <span className="font-mono">{v.earliestBin || '—'}</span>
                        {v.earliestExpiry ? ` (صلاحية ${v.earliestExpiry}` : ''}
                        {v.earliestQty ? ` · متاحٌ ${num(v.earliestQty)})` : v.earliestExpiry ? ')' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ═══ الطبقة ٣ — المسار: هذا ما يمشيه العامل ═══ */}
          <section className="o_ds o_ds_card">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Icon name="mapPin" size={16} className="text-accent" />
              <h3 className="font-bold text-ink text-sm">مسار السحب</h3>
              <span className="text-[11px] text-muted">{plan.pathBasis?.label || ''}</span>
            </div>
            {plan.path.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">لا موقعَ لأيّ بند — راجع الأرصدة والمواقع.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-line">
                      <Th>#</Th><Th>الموقع</Th><Th>الصنف</Th><Th align="left">الكمّيّة</Th><Th>الدفعة</Th><Th>الصلاحية</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.path.map((s, i) => (
                      <tr key={`${s.bin}-${s.sku}-${i}`} className="border-b border-line/60 hover:bg-chip">
                        <Td className="text-muted">{i + 1}</Td>
                        <Td>
                          <span className="font-mono font-bold text-ink">{s.shortLabel || s.bin || '—'}</span>
                          {s.bin && s.shortLabel && s.bin !== s.shortLabel && (
                            <span className="block text-[10px] text-muted font-mono">{s.bin}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="font-bold text-ink-2">{s.description || s.sku || s.barcode}</span>
                          {s.sku && <span className="block text-[10px] text-muted font-mono">{s.sku}</span>}
                        </Td>
                        <Td align="left" className="font-bold">{num(s.qty)}</Td>
                        <Td>{s.batch || '—'}</Td>
                        <Td className={s.expiry ? '' : 'text-muted'}>{s.expiry || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ═══ النواقص — تُعرض ولا تُخفى ═══ */}
          {plan.shortages.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad">
              <div className="font-bold text-ink text-sm mb-2">بنودٌ لا يكفيها المتاح</div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {plan.shortages.map((l) => (
                  <li key={l.index}>
                    • <span className="font-mono">{l.sku || l.barcode}</span> {l.description ? `— ${l.description}` : ''}:
                    طُلب {num(l.requested)} · خُصّص {num(l.allocated)} ·{' '}
                    <span className="text-brand-red font-bold">ينقص {num(l.shortfall)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mode === 'doc' && docId && (
            <div className="text-center">
              <a href={`${base}/dashboard/document?type=PICK&id=${docId}`} className="btn btn-secondary btn-sm">افتح المستند</a>
            </div>
          )}
        </>
      )}

      {!plan && (
        <Notice>
          {mode === 'doc' ? 'اختر مستند سحبٍ لترى مواقعه ومساره.' : 'ألصق أكواد الأصناف لترى أين هي.'}
        </Notice>
      )}

      <p className="text-[11px] text-muted text-center leading-relaxed">
        التخصيص بـFEFO — الأقربُ انتهاءً أوّلًا. والمسار يُرتَّب بالمشي الفعليّ متى توفّرت شبكة المسافات،
        وبالكود حين لا تتوفّر — ويُعلَن أساسُه ولا يُخمَّن.
        {plan?.route?.unknown ? ` · ${num(plan.route.unknown)} مسافةً لم تُحسب (موقعٌ بلا إحداثيّات) فبقيت آخر المسار.` : ''}
      </p>
    </div>
  );
}

function Tab({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border transition-colors ${
        active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-chip border-line text-ink-2 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted truncate">{hint}</div>
    </div>
  );
}

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align, className = '' }) => (
  <td className={`px-3 py-2 align-top ${align === 'left' ? 'text-left font-mono' : 'text-right'} ${className}`}>{children}</td>
);

function Notice({ children }) {
  return (
    <div className="o_theme" dir="rtl">
      <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>
    </div>
  );
}
