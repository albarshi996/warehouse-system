import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenOrgLocations } from '../../../services/org/orgLocationsService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import { createDraft } from '../../../services/documents/documentsService.js';
import { reasonsFor, OTHER } from '../../../services/documents/reasonCodes.js';
import {
  DEVIATION_EXCEPTION_PCT,
  buildBranchOrder,
  deviationVerdict,
  eligibleForReplenishment,
  toTransferRequest,
} from '../../../services/intelligence/branchOrder.js';

/**
 * طلب الفرع ‹FNB-302 · FNB-303› — الشاشة الثانية لقطاع الأغذية.
 *
 * ═══ ما تحلّه ═══
 * كان الفرع يطلب من ذاكرته: يفتح ورقةً فارغة ويكتب ما يظنّ أنّه ينقص. فيطلب
 * ما لديه، وينسى ما نفد، ويكتشف النقص يوم الخدمة. والمنطق الذي يحسب الحاجة
 * **مبنيٌّ ومختبَرٌ منذ خطّة القطاع، وبلا مستدعٍ واحد**: معدّلُ الاستهلاك من
 * حركات الفرع، والرصيدُ الحاضر، والقادمُ في الطريق، وأيّامُ التغطية المتبقّية.
 *
 * فهذه الشاشة **لا تحسب شيئًا** — تعرض ما حسبه `buildBranchOrder` وتجعله
 * قابلًا للتعديل، ثمّ تحوّله إلى **طلب نقلٍ (TR)**: نفس مستند الطلب القائم
 * لا مستندٌ جديدٌ بجانبه.
 *
 * ═══ والانحراف يمرّ ويُسجَّل ═══
 * حين يعدّل الفرع الكمّيّة عن المقترح، يُسأل عن السبب من **قائمةٍ مقيَّدة**
 * (حملة · مناسبة · عطلة · تغيير منيو…) — ولا يُمنع. وهذا نصّ المنطق نفسه:
 * «مطعمٌ ينتظر إذنًا ليطلب ما يحتاجه يتوقّف عن العمل، والمنعُ يُنتج طلباتٍ
 * خارج النظام لا انضباطًا». وما تجاوز العتبة يفتح استثناءً يراه المشرف.
 *
 * والمقترحُ الأصليّ يُختم على كلّ سطرٍ في المستند، فيبقى الانحراف **قابلًا
 * للقياس بعد الحفظ** لا وقت العرض فقط — ومنه تُراجَع مستويات Par لاحقًا.
 */

const CAN_ORDER = new Set(['admin', 'warehouse_manager', 'fnb_manager', 'branch_manager']);
const MOVES_CAP = 600;
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);
const DEV_REASONS = reasonsFor('order_deviation');

export default function BranchOrder() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [balances, setBalances] = useState([]);
  const [moves, setMoves] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [branchCode, setBranchCode] = useState('');
  // ⚠ مستودعُ المصدر **يُختار** ولا يُشتقّ: الشجرة التنظيميّة `قطاع›براند›فرع`
  // لا مستودعَ فيها، و`servedBy` ليست مستودعًا بل **نوعَ التزويد** (دوريّ أو
  // افتتاح) — فأخذُها مصدرًا يكتب في الطلب مستودعًا لا وجود له.
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

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
    const a = listenOrgLocations(setLocations, (e) => setError(e?.message || 'تعذّرت قراءة الفروع.'));
    const b = subscribeItems(setItems);
    const c = listenBalances(setBalances);
    const d = listenRecentMoves(setMoves, MOVES_CAP);
    const e = subscribeWarehouses(setWarehouses);
    return () => { a?.(); b?.(); c?.(); d?.(); e?.(); };
  }, [me]);

  /** الفروع المؤهَّلة للمقترح الدوريّ — ومن ليس كذلك يُعلَن سببه لا يُخفى. */
  const branches = useMemo(
    () => (locations || []).filter((l) => l?.level === 'branch' && l?.active !== false),
    [locations]
  );
  const branch = useMemo(
    () => branches.find((b) => String(b.code).toUpperCase() === branchCode) || null,
    [branches, branchCode]
  );

  function build() {
    if (!branch) return;
    setError(''); setCreated(''); setBusy('يبني المقترح…');
    try {
      const built = buildBranchOrder(branch, {
        items, moves, balances, today: today(), dims: { branch: branchCode },
      });
      setOrder(built);
    } catch (err) {
      setError(err?.message || 'تعذّر بناء المقترح.');
    } finally {
      setBusy('');
    }
  }

  function patchLine(i, patch) {
    setOrder((o) => ({ ...o, lines: o.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  }

  /** حكمُ كلّ سطرٍ — من المنطق الخالص لا من شرطٍ هنا. */
  const verdicts = useMemo(
    () => (order?.lines || []).map((l) => deviationVerdict({ ...l, suggestedQty: l.suggestQty })),
    [order]
  );
  const blocking = useMemo(() => verdicts.filter((v) => v.problem).length, [verdicts]);
  const exceptions = useMemo(() => verdicts.filter((v) => v.opensException).length, [verdicts]);
  const asked = useMemo(() => (order?.lines || []).filter((l) => Number(l.qty) > 0).length, [order]);

  async function send() {
    if (!order || blocking > 0 || !asked || !fromWarehouse) return;
    setBusy('ينشئ طلب النقل…'); setError('');
    try {
      const draft = toTransferRequest(order, { fromWarehouse, requestDate: today() });
      const id = await createDraft({ type: 'TR', profile: me, header: draft.header, lines: draft.lines });
      setCreated({ id, lines: draft.lines.length });
      setOrder(null);
    } catch (err) {
      setError(err?.message || 'تعذّر إنشاء الطلب.');
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_ORDER.has(me.role)) return <Notice>طلب الفرع لمديري القطاع والفروع والمستودع.</Notice>;

  const base = getBasePath();

  return (
    <div dir="rtl" className="space-y-6">
      {/* ═══ الطبقة ١ — اختر الفرع ═══ */}
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[200px]">
          <span className="block text-[11px] font-bold text-ink-2 mb-1">الفرع</span>
          <select
            className="w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50"
            value={branchCode}
            onChange={(e) => { setBranchCode(e.target.value); setOrder(null); setCreated(null); }}
          >
            <option value="">— اختر —</option>
            {branches.map((b) => (
              <option key={b.code} value={String(b.code).toUpperCase()}>
                {b.nameAr || b.code} {eligibleForReplenishment(b) ? '' : '(غير مؤهَّل للمقترح الدوريّ)'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" disabled={!branch || !!busy} onClick={build}>
          ابنِ المقترح
        </button>
        <span className="text-[11px] text-muted">
          يُحسب من {num(moves.length)} حركة و{num(balances.length)} رصيدًا و{num(items.length)} صنفًا
        </span>
      </section>

      {branches.length === 0 && (
        <Notice>لا فرعَ مسجّلًا بعد — تُضاف الفروع من «الأبعاد التنظيميّة والتكلفة».</Notice>
      )}
      {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}

      {created && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex flex-wrap items-center gap-3">
          <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
          <span className="flex-1 text-ink-2">أُنشئ طلب نقل بـ{num(created.lines)} بندًا — مسودّةٌ تنتظر الاعتماد.</span>
          <a href={`${base}/dashboard/document?type=TR&id=${created.id}`} className="btn btn-secondary btn-sm">افتح الطلب</a>
        </div>
      )}

      {order && (
        <>
          {/* ═══ الطبقة ٢ — ما يقوله المقترح ═══ */}
          {(order.problems?.length > 0 || order.notes?.length > 0) && (
            <section className={`o_ds o_ds_card o_ds_pad ${order.problems?.length ? 'border border-brand-red/40 bg-brand-red/5' : ''}`}>
              <ul className="text-xs leading-relaxed space-y-1 list-none p-0 m-0">
                {(order.problems || []).map((p, i) => (
                  <li key={`p${i}`} className="text-brand-red font-bold">• {p}</li>
                ))}
                {(order.notes || []).map((n, i) => (
                  <li key={`n${i}`} className="text-ink-2">• {n}</li>
                ))}
              </ul>
            </section>
          )}

          {order.lines.length > 0 && (
            <>
              <section className="o_ds o_ds_card">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
                  <Kpi label="أصناف تحت النقطة" value={num(order.lines.length)} hint="يقترحها المنطق" />
                  <Kpi label="مطلوبٌ فعلًا" value={num(asked)} hint="بعد تعديلك" />
                  <Kpi label="انحرافٌ بلا سبب" value={num(blocking)} hint="يمنع الإرسال" tone={blocking ? 'red' : ''} />
                  <Kpi label="يفتح استثناءً" value={num(exceptions)} hint={`تجاوز ${DEVIATION_EXCEPTION_PCT}٪`} />
                </div>
                <div className="border-t border-line px-4 py-2.5 text-xs text-muted flex flex-wrap items-center gap-3">
                  <span>
                    نوع التزويد:{' '}
                    <b className="text-ink-2">{order.servedBy === 'opening' ? 'تجهيز افتتاح' : 'تزويد دوريّ'}</b>
                  </span>
                  <label className="flex items-center gap-2">
                    <span>يُورَّد من</span>
                    <select
                      className="bg-surface border border-line rounded-lg text-ink text-xs px-2 py-1 focus:outline-none focus:border-accent/50"
                      value={fromWarehouse}
                      onChange={(e) => setFromWarehouse(e.target.value)}
                    >
                      <option value="">— اختر المستودع —</option>
                      {warehouses.map((w) => (
                        <option key={w.code || w.id} value={String(w.code || w.id).toUpperCase()}>
                          {w.nameAr || w.code || w.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex-1" />
                  <button type="button" className="btn btn-primary btn-sm"
                    disabled={!!busy || blocking > 0 || !asked || !fromWarehouse} onClick={send}
                    title={blocking ? 'كلّ انحرافٍ يحتاج سببًا' : !fromWarehouse ? 'اختر المستودع المورِّد' : ''}>
                    أرسل طلب نقل
                  </button>
                </div>
              </section>

              {/* ═══ الطبقة ٣ — السطور ═══ */}
              <section className="o_ds o_ds_card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-line">
                      <Th>الصنف</Th><Th align="left">الرصيد</Th><Th align="left">بالطريق</Th>
                      <Th align="left">الاستهلاك/يوم</Th><Th align="left">يكفي (يومًا)</Th>
                      <Th align="left">المقترح</Th><Th align="left">المطلوب</Th><Th>السبب عند الاختلاف</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l, i) => {
                      const v = verdicts[i];
                      return (
                        <tr key={l.sku} className={`border-b border-line/60 ${v.problem ? 'bg-brand-red/5' : ''}`}>
                          <Td>
                            <span className="font-bold text-ink-2">{l.nameAr || l.sku}</span>
                            <span className="block text-[10px] text-muted font-mono">{l.sku}</span>
                            {l.why && <span className="block text-[10px] text-muted">{l.why}</span>}
                          </Td>
                          <Td align="left">{num(l.onHand)}</Td>
                          <Td align="left">{num(l.inTransit)}</Td>
                          <Td align="left">{num(l.rate)}</Td>
                          <Td align="left">
                            <span className={Number(l.daysLeft) <= 2 ? 'text-brand-red font-bold' : ''}>{num(l.daysLeft)}</span>
                          </Td>
                          <Td align="left" className="text-muted">{num(l.suggestQty)}</Td>
                          <Td align="left">
                            <input
                              type="number" min="0" step="any" value={l.qty}
                              onChange={(e) => patchLine(i, { qty: e.target.value })}
                              className="w-20 bg-surface border border-line rounded-lg text-ink text-xs px-2 py-1 text-left focus:outline-none focus:border-accent/50"
                            />
                            <span className="text-[10px] text-muted mr-1">{l.uom}</span>
                          </Td>
                          <Td>
                            {v.deviated ? (
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <select
                                  value={l.reason || ''}
                                  onChange={(e) => patchLine(i, { reason: e.target.value })}
                                  className={`bg-surface border rounded-lg text-xs px-2 py-1 focus:outline-none ${v.problem ? 'border-brand-red/50 text-brand-red' : 'border-line text-ink'}`}
                                >
                                  <option value="">— اختر السبب —</option>
                                  {DEV_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                                </select>
                                {l.reason === OTHER && (
                                  <input
                                    placeholder="اكتب السبب" value={l.reasonNote || ''}
                                    onChange={(e) => patchLine(i, { reasonNote: e.target.value })}
                                    className="bg-surface border border-line rounded-lg text-ink text-xs px-2 py-1 w-32 focus:outline-none focus:border-accent/50"
                                  />
                                )}
                                <span className="text-[10px] text-muted">
                                  {v.deviation.delta > 0 ? '+' : '−'}{num(Math.abs(v.deviation.pct))}٪
                                </span>
                                {v.opensException && <span className="text-[10px] text-brand-red font-bold">استثناء</span>}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted">—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
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

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align, className = '' }) => (
  <td className={`px-3 py-2 align-top ${align === 'left' ? 'text-left font-mono' : 'text-right'} ${className}`}>{children}</td>
);

function Notice({ children }) {
  return <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>;
}
