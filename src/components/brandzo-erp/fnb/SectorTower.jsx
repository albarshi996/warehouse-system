import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenOrgLocations } from '../../../services/org/orgLocationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenExceptions } from '../../../services/ledger/exceptionsService.js';
import { createDraft, listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { indexLocations } from '../../../services/org/orgLocations.js';
import { isOpenStatus, SEVERITY_LABELS } from '../../../services/ledger/exceptions.js';
import {
  TOWER_CATEGORIES,
  TOWER_LEVELS,
  categoryCoverage,
  drillInto,
  towerBalance,
  towerView,
} from '../../../services/ledger/sectorTower.js';
import {
  DEMAND_FACETS,
  byChannel,
  consolidate,
  demandBalance,
  demandRows,
  drillDemand,
  netSectorRequirement,
} from '../../../services/intelligence/consolidatedDemand.js';
import {
  rebalanceSuggestions,
  rebalanceVerdict,
  toRebalanceTransfer,
} from '../../../services/intelligence/rebalance.js';
import { closeSummary, missingCloseException, CLOSE_ELEMENTS } from '../../../services/intelligence/dailyClose.js';
import { POS_SOURCES, DECIDED_SOURCE, POS_POLICY, sourceVerdict } from '../../../services/integration/posFeed.js';
import { branchPositions, closeRecords, costOwnership } from '../../../services/ledger/towerReading.js';

/**
 * برج القطاع ‹FNB-801…804 · FNB-703 · FNB-704› — رابعةُ شاشات قطاع الأغذية.
 *
 * ═══ ما تحلّه ═══
 * ستُّ حاسباتٍ مبنيّةٍ مختبَرةٍ **بلا مستدعٍ واحد**: `sectorTower` النزولُ
 * الخماسيّ، و`consolidatedDemand` بأوجهه الستّة، و`rebalance` بقيوده الثلاثة،
 * و`dailyClose` بعناصره العشرة، و`foodCost` بحدّ البوابة، و`posFeed` بسياسته.
 * فالشاشة **لا تحسب شيئًا** — توصلها وتعرض ما تقوله.
 *
 * ═══ والبرج مرشِّحٌ لا تقرير ═══
 * «إظهار الحالات التي تحتاج تدخّلًا فقط». فما لا يحتاج قرارًا لا يُعرض،
 * وإلّا غرق المدير في أرقامٍ سليمةٍ وفاته الخلل.
 *
 * ═══ وحارسان يُعرضان لا يُخفيان ═══
 * ①`towerBalance`: **الرقم في الأعلى = مجموع ما تحته حرفيًّا** — ومن عرض
 *   قطاعًا لا يساوي مجموع برانداته أسقط الثقة باللوحة كلّها.
 * ②`categoryCoverage`: كلّ نوعٍ مبنيٍّ له فئة — واستثناءٌ يُكشف ولا يُعرض
 *   أسوأ من استثناءٍ لا يُكشف.
 *
 * ═══ وما ينقصه مدخلٌ يقول ما ينقصه ═══
 * إعادةُ التوازن تحتاج حدًّا أدنى وPar، والتكلفةُ تحتاج مبيعات نقطة البيع.
 * وحيث لا مدخل **تُعلَن الفجوة باسمها** ولا تُترك الشاشة صامتةً فارغة —
 * فصمتٌ يُظنّ «لا خلل» أسوأ من فجوةٍ مكتوبة.
 */

const CAN_SEE = new Set(['admin', 'warehouse_manager', 'fnb_manager', 'executive_chef']);
const CAP = 300;
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);
const catLabel = (id) => TOWER_CATEGORIES.find((c) => c.id === id)?.labelAr || (id === 'other' ? 'غير مصنَّف' : id);

const TABS = [
  { key: 'tower', label: 'البرج', icon: 'layers' },
  { key: 'demand', label: 'الطلب المجمَّع', icon: 'barChart3' },
  { key: 'rebalance', label: 'إعادة التوازن', icon: 'arrowLeftRight' },
  { key: 'close', label: 'الإغلاق والتكلفة', icon: 'clipboardList' },
];

export default function SectorTower() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('tower');
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [docs, setDocs] = useState([]);
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
    const a = listenOrgLocations(setLocations, (e) => setError(e?.message || 'تعذّرت قراءة الشجرة التنظيميّة.'));
    const b = listenBalances(setBalances);
    const c = listenExceptions(setExceptions, (e) => setError(e?.message || 'تعذّرت قراءة الاستثناءات.'));
    const d = listenDocumentsByTypes(['TR', 'TRC', 'RET', 'DMG', 'CC'], setDocs, CAP);
    return () => { a?.(); b?.(); c?.(); d?.(); };
  }, [me]);

  const orgIndex = useMemo(() => indexLocations(locations), [locations]);
  const branches = useMemo(
    () => (locations || []).filter((l) => l?.level === 'branch' && l?.active !== false),
    [locations]
  );
  /** المفتوحةُ وحدها — البرج مرشِّحٌ لا أرشيف. */
  const open = useMemo(() => (exceptions || []).filter((e) => isOpenStatus(e?.status)), [exceptions]);

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_SEE.has(me.role)) return <Notice>برج القطاع لمديري القطاع والمستودع والشيف التنفيذيّ.</Notice>;

  const shared = { me, orgIndex, branches, balances, docs, open, busy, setBusy, setError, setCreated };

  return (
    <div dir="rtl" className="space-y-6">
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setError(''); setCreated(null); }}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Icon name={t.icon} size={14} className="ml-1" />
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          يُقرأ من {num(open.length)} استثناءً مفتوحًا و{num(balances.length)} رصيدًا و{num(docs.length)} مستندًا
          {' '}عبر {num(branches.length)} فرعًا في الشجرة.
        </p>
      </section>

      {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}
      {created && <CreatedBanner created={created} />}

      {tab === 'tower' && <TowerPane {...shared} />}
      {tab === 'demand' && <DemandPane {...shared} />}
      {tab === 'rebalance' && <RebalancePane {...shared} />}
      {tab === 'close' && <ClosePane {...shared} />}
    </div>
  );
}

/* ═══════════════ ① البرج — تجميعٌ يُفتَح لا رقمٌ مغلق ═══════════════ */

function TowerPane({ orgIndex, open }) {
  /** مسارُ النزول: كلّ خطوةٍ `{level, key}` — وهو أيضًا فتاتُ الرجوع. */
  const [trail, setTrail] = useState([]);
  const at = trail.length ? trail[trail.length - 1] : null;

  // ★ المسارُ كلُّه يُمرَّر لا آخرُ خطوةٍ وحدها: صنفٌ داخل فرعٍ يجب أن يعرض
  //   مستنداتِ ذلك الفرع لا مستنداتِ الصنف في القطاع كلّه.
  const view = useMemo(
    () => (at ? drillInto(open, orgIndex, { ...at, path: trail.slice(0, -1) }) : towerView(open, orgIndex, { level: 'sector' })),
    [open, orgIndex, at, trail]
  );
  const balance = useMemo(() => towerBalance(open, orgIndex), [open, orgIndex]);
  const coverage = useMemo(() => categoryCoverage(), []);
  const levelLabel = (id) => TOWER_LEVELS.find((l) => l.id === id)?.labelAr || id;

  return (
    <>
      <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
        <Kpi label="استثناءاتٌ مفتوحة" value={num(balance.total)} hint="ما يحتاج تدخّلًا فقط" tone={balance.total ? 'red' : ''} />
        <Kpi label="المستوى المعروض" value={levelLabel(view.level)} hint={view.canDrillTo ? `يُفتح إلى ${levelLabel(view.canDrillTo)}` : 'نهاية الطريق'} />
        <Kpi label="بلا ربطٍ بالشجرة" value={num((view.rows || []).find((r) => r.key === '—')?.count || 0)} hint="موقعٌ خارج قطاع›براند›فرع" />
        <Kpi label="بلا تصنيف" value={num(view.uncategorized || 0)} hint="نوعٌ لا فئةَ له في البرج" tone={view.uncategorized ? 'red' : ''} />
      </section>

      {!balance.ok && (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
          <div className="text-brand-red text-sm font-bold">حارسُ التوازن: الرقم في الأعلى لا يساوي مجموع ما تحته.</div>
          <ul className="text-xs mt-1 space-y-1 list-none p-0 m-0">
            {balance.problems.map((p, i) => <li key={i} className="text-brand-red">• {p}</li>)}
          </ul>
        </section>
      )}

      {(coverage.promisedButMissing.length > 0 || coverage.builtButUncategorized.length > 0) && (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5 text-xs leading-relaxed">
          {coverage.builtButUncategorized.length > 0 && (
            <div className="text-brand-red font-bold">
              أنواعٌ مبنيّةٌ بلا فئةٍ في البرج ({coverage.builtButUncategorized.length}): {coverage.builtButUncategorized.join(' · ')}
              {' '}— تُكشف ولا تُعرض، وذاك أسوأ من ألّا تُكشف.
            </div>
          )}
          {coverage.promisedButMissing.length > 0 && (
            <div className="text-brand-red font-bold mt-1">
              فئاتٌ تَعِد بأنواعٍ لم تُبنَ ({coverage.promisedButMissing.length}): {coverage.promisedButMissing.join(' · ')}
            </div>
          )}
        </section>
      )}

      {/* فتاتُ النزول — الرجوعُ خطوةً خطوة */}
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTrail([])} disabled={!trail.length}>
          القطاع
        </button>
        {trail.map((step, i) => (
          <span key={`${step.level}:${step.key}`} className="flex items-center gap-2">
            <Icon name="chevronLeft" size={12} className="text-muted" />
            <button
              type="button"
              className={`btn btn-sm ${i === trail.length - 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTrail(trail.slice(0, i + 1))}
            >
              {levelLabel(step.level)}: {step.key}
            </button>
          </span>
        ))}
      </section>

      {view.leaf ? (
        <section className="o_ds o_ds_card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-surface-2 text-ink-2 border-b border-line">
              <tr><Th>الرقم</Th><Th>النوع</Th><Th>الصنف</Th><Th>الخطورة</Th><Th>السبب</Th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(view.items || []).map((e, i) => (
                <tr key={e.id || i}>
                  <Td align="left">{e.number || '—'}</Td>
                  <Td>{catLabel(e.type)}</Td>
                  <Td align="left">{e.sku || '—'}</Td>
                  <Td>{SEVERITY_LABELS[e.severity] || '—'}</Td>
                  <Td className="max-w-[24rem]">{e.reason || '—'}</Td>
                </tr>
              ))}
              {!(view.items || []).length && <tr><Td className="text-center text-muted py-6">لا مستندَ تحت هذا المفتاح.</Td></tr>}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="o_ds o_ds_card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-surface-2 text-ink-2 border-b border-line">
              <tr><Th>{levelLabel(view.level)}</Th><Th>العدد</Th><Th>بالفئة</Th><Th>عيّنة</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(view.rows || []).map((r) => (
                <tr key={r.key}>
                  <Td className="font-bold">{r.label}</Td>
                  <Td align="left" className="font-black">{num(r.count)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.byCategory).map(([cat, n]) => (
                        <span key={cat} className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px]">
                          {catLabel(cat)} {num(n)}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-muted max-w-[22rem]">
                    {(r.samples || []).map((s, i) => (
                      <div key={i} className="text-[10px]">{s.sku ? `${s.sku} — ` : ''}{s.reason}</div>
                    ))}
                  </Td>
                  <Td align="left">
                    {view.canDrillTo && r.key !== '—' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setTrail([...trail, { level: view.level, key: r.key }])}
                      >
                        افتح
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
              {!(view.rows || []).length && (
                <tr><Td className="text-center text-muted py-6">لا استثناءَ مفتوحًا هنا — والبرج يعرض ما يحتاج تدخّلًا فقط.</Td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ═══════════════ ② الطلب المجمَّع — ستّةُ أوجهٍ لرقمٍ واحد ═══════════════ */

function DemandPane({ orgIndex, docs, balances }) {
  const [facet, setFacet] = useState('branch');
  const [openKey, setOpenKey] = useState('');

  const rows = useMemo(() => demandRows((docs || []).filter((d) => d?.type === 'TR'), orgIndex), [docs, orgIndex]);
  const groups = useMemo(() => consolidate(rows, facet), [rows, facet]);
  const balance = useMemo(() => demandBalance(rows), [rows]);
  const channels = useMemo(() => byChannel(rows), [rows]);

  /** المتاح مركزيًّا — كلّ رصيدٍ لا فرعَ له في الشجرة يُعدّ مركزيًّا. */
  const centralStockBySku = useMemo(() => {
    const map = new Map();
    for (const b of balances || []) {
      const code = String(b?.warehouse || '').trim().toUpperCase();
      if (!code) continue;
      const isBranch = orgIndex.get(code)?.level === 'branch';
      if (isBranch) continue;
      const sku = String(b?.sku || '').trim().toUpperCase();
      if (sku) map.set(sku, (map.get(sku) || 0) + (Number(b?.qty) || 0));
    }
    return map;
  }, [balances, orgIndex]);

  const net = useMemo(() => netSectorRequirement(rows, { centralStockBySku }), [rows, centralStockBySku]);
  const drill = useMemo(() => (openKey ? drillDemand(rows, facet, openKey) : []), [rows, facet, openKey]);

  return (
    <>
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap gap-2">
        {Object.values(DEMAND_FACETS).map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn-sm ${facet === f.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFacet(f.id); setOpenKey(''); }}
          >
            {f.labelAr}
          </button>
        ))}
      </section>

      {rows.length === 0 && (
        <Notice>لا طلبَ نقلٍ مفتوحًا — الطلب المجمَّع يُبنى من مستندات TR التي ترفعها الفروع.</Notice>
      )}

      {rows.length > 0 && (
        <>
          <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
            <Kpi label="إجماليّ الطلب" value={num(balance.total)} hint={`${num(rows.length)} سطرًا`} />
            <Kpi label="أصنافٌ مطلوبة" value={num(net.length)} hint="على مستوى القطاع" />
            <Kpi label="يحتاج شراءً" value={num(net.filter((r) => !r.covered).length)} hint="بعد طرح المتاح مركزيًّا" tone={net.some((r) => !r.covered) ? 'red' : ''} />
            {/* ⚠ `byChannel` يُعيد **مصفوفةَ مجموعاتٍ** لا كائنًا مفاتيحُه القنوات —
                وقراءتها بـ`Object.keys` تُخرج «0» فهرسًا وتعرضه اسمَ قناة. */}
            <Kpi label="القنوات" value={num(channels.length)} hint={channels.map((c) => c.label).join(' · ') || '—'} />
          </section>

          {!balance.ok && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <div className="text-brand-red text-sm font-bold">حارسُ التوازن: وجهٌ لا يساوي الإجماليّ.</div>
              <ul className="text-xs mt-1 space-y-1 list-none p-0 m-0">
                {balance.problems.map((p, i) => <li key={i} className="text-brand-red">• {p}</li>)}
              </ul>
            </section>
          )}

          <section className="o_ds o_ds_card overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 text-ink-2 border-b border-line">
                <tr><Th>{DEMAND_FACETS[facet]?.labelAr}</Th><Th>الكمّيّة</Th><Th>سطور</Th><Th>أصناف</Th><Th>فروع</Th><Th>مستندات</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {groups.map((g) => (
                  <tr key={g.key} className={openKey === g.key ? 'bg-surface-2' : ''}>
                    <Td className="font-bold">{g.label}</Td>
                    <Td align="left" className="font-black">{num(g.qty)}</Td>
                    <Td align="left">{num(g.lines)}</Td>
                    <Td align="left">{num(g.skus)}</Td>
                    <Td align="left">{num(g.branches)}</Td>
                    <Td align="left" className="text-[10px] text-muted">{g.refs.join(' · ') || '—'}</Td>
                    <Td align="left">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenKey(openKey === g.key ? '' : g.key)}>
                        {openKey === g.key ? 'أغلق' : 'افتح'}
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {openKey && (
            <section className="o_ds o_ds_card overflow-x-auto">
              <h3 className="text-sm font-black text-ink px-4 pt-4 pb-2">سطورُ «{openKey}» — الرقمُ المجمَّع يُفتح إلى مصادره</h3>
              <table className="w-full text-xs border-collapse">
                <thead className="bg-surface-2 text-ink-2 border-b border-line">
                  <tr><Th>الفرع</Th><Th>الصنف</Th><Th>الاسم</Th><Th>الكمّيّة</Th><Th>التسليم</Th><Th>المستند</Th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {drill.map((r, i) => (
                    <tr key={`${r.docId}:${r.sku}:${i}`}>
                      <Td align="left">{r.branch}</Td>
                      <Td align="left">{r.sku}</Td>
                      <Td>{r.nameAr || '—'}</Td>
                      <Td align="left" className="font-bold">{num(r.qty)}</Td>
                      <Td align="left">{r.deliveryDate || '—'}</Td>
                      <Td align="left" className="text-muted">{r.docNumber || r.docId}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="o_ds o_ds_card overflow-x-auto">
            <h3 className="text-sm font-black text-ink px-4 pt-4 pb-2">الاحتياج الصافي — مدخلُ طلب الشراء</h3>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 text-ink-2 border-b border-line">
                <tr><Th>الصنف</Th><Th>طلب الفروع</Th><Th>المتاح مركزيًّا</Th><Th>يُشترى</Th><Th>فروع</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {net.map((r) => (
                  <tr key={r.sku} className={r.covered ? '' : 'bg-brand-red/5'}>
                    <Td align="left">{r.sku}</Td>
                    <Td align="left">{num(r.demand)}</Td>
                    <Td align="left">{num(r.centralStock)}</Td>
                    <Td align="left" className={r.covered ? 'text-muted' : 'text-brand-red font-black'}>
                      {r.covered ? 'مغطًّى' : num(r.netRequirement)}
                    </Td>
                    <Td align="left">{num(r.branches)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

/* ═══════════════ ③ إعادة التوازن — علاجُ نقصٍ بخلق نقصٍ ليس علاجًا ═══════════════ */

function RebalancePane({ me, orgIndex, balances, busy, setBusy, setError, setCreated }) {
  const built = useMemo(() => branchPositions(balances, { orgIndex }), [balances, orgIndex]);
  const suggestions = useMemo(
    () => rebalanceSuggestions(built.positions, { today: today() }),
    [built]
  );
  const verdicts = useMemo(
    () => suggestions.map((s) => rebalanceVerdict(s, built.positions, { today: today() })),
    [suggestions, built]
  );

  async function send(i) {
    const s = suggestions[i];
    if (!s || !verdicts[i]?.ok) return;
    setBusy('ينشئ طلب النقل…'); setError('');
    try {
      const draft = toRebalanceTransfer(s, { requestDate: today() });
      const id = await createDraft({ type: 'TR', profile: me, header: draft.header, lines: draft.lines });
      setCreated({ type: 'TR', id, label: 'طلب نقل', hint: `${num(s.qty)} من «${s.sku}» من ${s.from} إلى ${s.to}` });
    } catch (err) {
      setError(err?.message || 'تعذّر إنشاء طلب النقل.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
        <Kpi label="مواضعُ الفروع" value={num(built.positions.length)} hint={`${num(built.branches)} فرعًا`} />
        <Kpi label="بلا سياسة" value={num(built.unpolicied)} hint="بلا حدٍّ أدنى ولا Par" tone={built.unpolicied ? 'red' : ''} />
        <Kpi label="أرصدةٌ خارج الشجرة" value={num(built.unlinked)} hint="مركزيّةٌ لا فرعيّة — لا تدخل التوازن" />
        <Kpi label="نقلٌ مقترَح" value={num(suggestions.length)} hint="بعد قيوده الثلاثة" />
      </section>

      {built.unpolicied > 0 && (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5 text-xs leading-relaxed">
          <div className="text-brand-red font-bold">
            {num(built.unpolicied)} موضعًا بلا سياسة مخزون — وبلا حدٍّ أدنى ولا Par <strong>لا يُعرف ناقصٌ من فائض</strong>.
          </div>
          <p className="text-ink-2 mt-1">
            هذه فجوةُ مدخلٍ لا عطبُ منطق: `stockPolicy` مبنيٌّ بوراثته الثلاثيّة (فرع ← براند ← قطاع)
            {' '}ولا شاشةَ تضبطه بعد. وحتّى تُضبط، لا يُفترض للموضع حدٌّ من عندنا — ورقمٌ مخترَعٌ يُنتج نقلًا خاطئًا.
          </p>
        </section>
      )}

      {suggestions.length === 0 ? (
        <Notice>
          لا نقلَ مقترَحًا. القيودُ الثلاثة تسري: لا يُفرَّغ مصدرٌ تحت حدّه · الأقربُ صلاحيّةً يُنقل أوّلًا ·
          {' '}وما لا يكفي مدّة الطريق لا يُنقل.
        </Notice>
      ) : (
        <section className="o_ds o_ds_card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-surface-2 text-ink-2 border-b border-line">
              <tr><Th>الصنف</Th><Th>من</Th><Th>إلى</Th><Th>الكمّيّة</Th><Th>الصلاحيّة</Th><Th>لماذا</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {suggestions.map((s, i) => (
                <tr key={`${s.sku}:${s.from}:${s.to}:${i}`} className={verdicts[i]?.ok ? '' : 'bg-brand-red/5'}>
                  <Td align="left">{s.sku}</Td>
                  <Td align="left">{s.from}</Td>
                  <Td align="left">{s.to}</Td>
                  <Td align="left" className="font-black">{num(s.qty)}</Td>
                  <Td align="left">{s.expiry || '—'}</Td>
                  <Td className="max-w-[24rem]">
                    <div className="text-ink-2">{s.why}</div>
                    {!verdicts[i]?.ok && (
                      <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
                        {(verdicts[i]?.problems || []).map((p, j) => (
                          <li key={j} className="text-brand-red font-bold text-[10px]">• {p}</li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td align="left">
                    <button type="button" className="btn btn-primary btn-sm" disabled={!verdicts[i]?.ok || !!busy} onClick={() => send(i)}>
                      اطلب النقل
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ═══════════════ ④ الإغلاق والتكلفة — وحدُّ البوابة عند المال ═══════════════ */

function ClosePane({ branches, docs, open }) {
  const [date, setDate] = useState(today());

  const records = useMemo(
    () => closeRecords(branches, { documents: docs, exceptions: open, date }),
    [branches, docs, open, date]
  );
  const summary = useMemo(() => closeSummary(records), [records]);
  const late = useMemo(
    () => summary
      .filter((s) => !s.closed)
      .map((s) => missingCloseException(s.branch, s.date, { today: today() }))
      .filter(Boolean),
    [summary]
  );
  const ownership = useMemo(() => costOwnership(), []);
  const posVerdict = useMemo(() => sourceVerdict(DECIDED_SOURCE), []);
  const nameOf = useMemo(
    () => new Map((branches || []).map((b) => [String(b.code).toUpperCase(), b.nameAr || b.code])),
    [branches]
  );

  return (
    <>
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-end gap-3">
        <Field label="يوم الإغلاق">
          <input type="date" className={SELECT} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <span className="text-[11px] text-muted">
          عشرةُ عناصرَ لكلّ فرع — ما تحسبه البوابة من مستنداتها، وما يأتي إشارةً من أودو.
        </span>
      </section>

      {branches.length === 0 ? (
        <Notice>لا فرعَ مسجّلًا بعد — تُضاف الفروع من «الأبعاد التنظيميّة والتكلفة».</Notice>
      ) : (
        <>
          <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
            <Kpi label="فروعٌ لم تُغلق" value={num(summary.filter((s) => !s.closed).length)} hint={`من ${num(summary.length)}`} tone={summary.some((s) => !s.closed) ? 'red' : ''} />
            <Kpi label="تجاوزت المهلة" value={num(late.length)} hint="سجلٌّ يُنسى لا يُقرأ" tone={late.length ? 'red' : ''} />
            <Kpi label="فرقُ جردٍ مفتوح" value={num(summary.filter((s) => s.variance !== 0).length)} hint="لا يُغلق يومٌ وله فرقٌ بلا سبب" tone={summary.some((s) => s.variance !== 0) ? 'red' : ''} />
            <Kpi label="مصدرُ المبيعات" value={POS_SOURCES[DECIDED_SOURCE]?.labelAr || '—'} hint={posVerdict.ok ? POS_POLICY.why : posVerdict.problem} />
          </section>

          <section className="o_ds o_ds_card overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 text-ink-2 border-b border-line">
                <tr><Th>الفرع</Th><Th>الحالة</Th><Th>عناصرُ ناقصة</Th><Th>فرقُ الجرد</Th><Th>استثناءاتٌ مفتوحة</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.map((s) => (
                  <tr key={s.branch} className={s.closed ? '' : 'bg-brand-red/5'}>
                    <Td>
                      <div className="font-bold">{nameOf.get(s.branch) || s.branch}</div>
                      <div className="text-[10px] text-muted font-mono">{s.branch}</div>
                    </Td>
                    <Td className={s.closed ? '' : 'text-brand-red font-bold'}>{s.closed ? 'مُغلق' : 'لم يُغلق'}</Td>
                    <Td align="left">{num(s.missing)} من {num(CLOSE_ELEMENTS.length)}</Td>
                    <Td align="left" className={s.variance !== 0 ? 'text-brand-red font-bold' : 'text-muted'}>{s.variance !== 0 ? num(s.variance) : '—'}</Td>
                    <Td align="left">{num(s.openExceptions)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {late.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <ul className="text-xs leading-relaxed space-y-1 list-none p-0 m-0">
                {late.map((e, i) => <li key={i} className="text-brand-red font-bold">• {e.location}: {e.reason}</li>)}
              </ul>
            </section>
          )}

          <section className="o_ds o_ds_card o_ds_pad">
            <h3 className="text-sm font-black text-ink mb-2">حدُّ البوابة عند المال</h3>
            <p className="text-[11px] text-muted leading-relaxed mb-3">
              ما تحسبه البوابة تحسبه من مستنداتها، وما يملكه {'‏'}أودو{'‏'} يُقرأ مرآةً ولا يُحسب هنا —
              {' '}ومن حسب ربحيّة فرعٍ في البوابة فتح للمال دفترًا ثانيًا.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ownership.map((r) => (
                <div key={r.metric} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="font-mono text-[11px]" dir="ltr">{r.metric}</span>
                  <span className={`text-[11px] font-bold ${r.owner === 'portal' ? 'text-accent' : 'text-ink-2'}`}>{r.labelAr}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              وتكلفةُ الغذاء المثاليّة تحتاج <strong>استهلاكًا نظريًّا من مبيعات نقطة البيع</strong> —
              {' '}والمصدر المعتمَد «{POS_SOURCES[DECIDED_SOURCE]?.labelAr}» ({POS_SOURCES[DECIDED_SOURCE]?.note}).
              {' '}وحتّى تُرفع المبيعات، لا يُعرض رقمُ تكلفةٍ مخترَع.
            </p>
          </section>
        </>
      )}
    </>
  );
}

/* ═══════════════ قطعٌ مشتركة ═══════════════ */

const SELECT = 'w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50';

function CreatedBanner({ created }) {
  const base = getBasePath();
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex flex-wrap items-center gap-3">
      <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
      <span className="flex-1 text-ink-2">أُنشئ {created.label} — {created.hint}. مسودّةٌ تنتظر الاعتماد.</span>
      <a href={`${base}/dashboard/document?type=${created.type}&id=${created.id}`} className="btn btn-secondary btn-sm">افتحه</a>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
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
