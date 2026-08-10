/**
 * يوم المندوب الميدانيّ — خطّة الزيارات والحضور والانصراف والخريطة.
 *
 * بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 * محسّنة للجوّال: أزرار كبيرة، عمودٌ واحد على الشاشات الصغيرة، وأقلّ ما يمكن
 * من الكتابة — فالمندوب يعمل بيدٍ واحدة واقفًا أمام متجر.
 *
 * الوصول: المندوب ومشرفه والمديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribePartners } from '../../../services/partnerService.js';
import {
  listenRepPlans,
  listenJourneyPlans,
  listenVisitsOfDay,
  seedVisitsForDay,
  checkIn,
  checkOut,
  skipVisit,
  setCustomerLocation,
} from '../../../services/field/fieldService.js';
import { captureLocation, locationPermissionState } from '../../../services/field/locationCapture.js';
import { listUsers } from '../../../services/auth/usersService.js';
import { listenRecentVisits } from '../../../services/field/fieldService.js';
import { visitsDueOn, planCompliance, coverageGaps } from '../../../services/field/journeyPlan.js';
import JourneyPlanner from './JourneyPlanner.jsx';
import {
  visitVerdict,
  summarizeVisits,
  VISIT_OUTCOMES,
  SKIP_REASONS,
  visitDurationMinutes,
} from '../../../services/field/visitModel.js';
import { fenceVerdict, DEFAULT_FENCE_RADIUS_M, centroid } from '../../../services/field/geo.js';

const FIELD_ROLES = ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'];
const SUPERVISOR_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';
const btn = 'rounded-lg px-4 py-2.5 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

/** اليوم بصيغة YYYY-MM-DD بتوقيت UTC — نفس ما تقرؤه `parseDay`. */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function FieldOperations() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState([]);
  const [visits, setVisits] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [day, setDay] = useState(todayKey());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [permission, setPermission] = useState('unknown');
  const [outcomeFor, setOutcomeFor] = useState(null);
  const [reps, setReps] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('day');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    locationPermissionState().then(setPermission);
    return () => unsub();
  }, []);

  const isSupervisor = me && SUPERVISOR_ROLES.includes(me.role);

  useEffect(() => {
    if (!me || !FIELD_ROLES.includes(me.role)) return undefined;
    const fail = (e) => setErr(e?.message || 'تعذّر الاتصال');
    const u1 = isSupervisor ? listenJourneyPlans(setPlans, fail) : listenRepPlans(me.uid, setPlans, fail);
    const u2 = listenVisitsOfDay(day, setVisits, fail, isSupervisor ? {} : { repUid: me.uid });
    const u3 = subscribePartners('customer', setCustomers, fail);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [me, day, isSupervisor]);

  // المشرف وحده يحتاج دليل المندوبين وتاريخ الزيارات — لا نُثقل جهاز المندوب بهما.
  useEffect(() => {
    if (!isSupervisor) return undefined;
    listUsers()
      .then((rows) => setReps(rows.filter((u) => u.role === 'sales_rep' && u.active !== false)))
      .catch(() => setReps([]));
    return listenRecentVisits(setHistory, () => {});
  }, [isSupervisor]);

  const due = useMemo(() => visitsDueOn(plans, day), [plans, day]);
  const summary = useMemo(() => summarizeVisits(visits), [visits]);
  const compliance = useMemo(() => planCompliance(due, visits), [due, visits]);
  const coordsByCode = useMemo(() => {
    const m = new Map();
    for (const c of customers) if (c?.geo) m.set(String(c.code).toUpperCase(), c.geo);
    return m;
  }, [customers]);

  const open = visits.find((v) => v.state === 'checked_in') || null;
  const pending = visits.filter((v) => v.state === 'planned').sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const closed = visits.filter((v) => v.state === 'checked_out' || v.state === 'skipped');
  const noCoords = due.filter((d) => !coordsByCode.get(d.customerCode));

  const run = async (label, fn) => {
    setBusy(label);
    setErr('');
    setMsg('');
    try {
      const r = await fn();
      if (r) setMsg(r);
    } catch (e) {
      setErr(e?.message || 'تعذّرت العملية');
    } finally {
      setBusy('');
    }
  };

  const doSeed = () =>
    run('seed', async () => {
      const rows = due.map((d) => ({ ...d, coords: coordsByCode.get(d.customerCode) || null }));
      const n = await seedVisitsForDay(day, rows, me);
      return n ? `أُضيفت ${n} زيارة إلى يومك.` : 'لا زيارات جديدة — يومك محمَّل بالفعل.';
    });

  const doCheckIn = (visit) =>
    run(`in:${visit.id}`, async () => {
      const pos = await captureLocation();
      const v = fenceVerdict({
        customerCoords: visit.customerCoords || coordsByCode.get(visit.customerCode),
        position: pos,
        radiusM: DEFAULT_FENCE_RADIUS_M,
      });
      await checkIn(visit.id, pos, me);
      if (v.status === 'outside') return `سُجّل الحضور — لكنّك ${v.distanceM}م خارج النطاق، وسيظهر ذلك للمشرف.`;
      if (v.status === 'unverified') return `سُجّل الحضور — الموقع غير مُتحقَّق (${v.reason}).`;
      return `سُجّل الحضور داخل النطاق (${v.distanceM}م).`;
    });

  const doCheckOut = (visit, outcome, notes) =>
    run(`out:${visit.id}`, async () => {
      let pos = null;
      try {
        pos = await captureLocation({ timeoutMs: 8000 });
      } catch {
        pos = null; // الانصراف لا يُمنع بضعف الإشارة — يُسجَّل بلا موقعٍ ويُوسَم
      }
      await checkOut(visit.id, { position: pos, outcome, notes }, me);
      setOutcomeFor(null);
      return 'أُغلقت الزيارة.';
    });

  const doSkip = (visit, reason) => run(`skip:${visit.id}`, async () => {
    await skipVisit(visit.id, reason, me);
    setOutcomeFor(null);
    return 'سُجّلت كغير منفَّذة بسببها.';
  });

  const doPinCustomer = (code) =>
    run(`pin:${code}`, async () => {
      const pos = await captureLocation();
      await setCustomerLocation(code, pos, me);
      return `سُجّل موقع المتجر بدقّة ±${pos.accuracy}م.`;
    });

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!FIELD_ROLES.includes(me.role)) return <Muted>هذه الشاشة لمندوبي المبيعات ومشرفيهم والمديرين.</Muted>;

  return (
    <div className="space-y-5">
      {err ? <Banner tone="bad">{err}</Banner> : null}
      {msg ? <Banner tone="ok">{msg}</Banner> : null}
      {permission === 'denied' ? (
        <Banner tone="bad">إذن الموقع مرفوض في هذا المتصفّح — لن يُسجَّل حضورٌ موثّق حتى تسمح به.</Banner>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="مخطّطة اليوم" value={compliance.plannedCount} />
        <Kpi label="منفّذة" value={summary.done} />
        <Kpi label="الالتزام" value={`${compliance.compliancePct}%`} alert={compliance.compliancePct < 80} />
        <Kpi label="أنتجت بيعًا" value={`${summary.strikeRate}%`} />
        <Kpi label="موسومة للمراجعة" value={summary.flagged} alert={summary.flagged > 0} />
      </div>

      {isSupervisor ? (
        <div className="flex flex-wrap gap-2">
          <Pill active={tab === 'day'} onClick={() => setTab('day')}>يوم الميدان</Pill>
          <Pill active={tab === 'plans'} onClick={() => setTab('plans')}>خطط الزيارات</Pill>
          <Pill active={tab === 'coverage'} onClick={() => setTab('coverage')}>فجوات التغطية</Pill>
        </div>
      ) : null}

      {tab === 'plans' && isSupervisor ? (
        <Section title="خطط الزيارات الدائمة">
          <JourneyPlanner me={me} plans={plans} customers={customers} reps={reps} day={day} />
        </Section>
      ) : null}

      {tab === 'coverage' && isSupervisor ? (
        <Section title="فجوات التغطية — المتاجر المنسيّة">
          <CoverageTable customers={customers} history={history} day={day} />
        </Section>
      ) : null}

      {tab !== 'day' ? null : (
      <>
      <Section title="اليوم">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-2">
            التاريخ
            <input type="date" className={`${input} mt-1`} value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <button type="button" className={btnPrimary} disabled={!due.length || busy === 'seed'} onClick={doSeed}>
            {busy === 'seed' ? 'جارٍ…' : `حمّل خطّة اليوم (${due.length})`}
          </button>
        </div>
        {!plans.length ? (
          <Muted>
            {isSupervisor
              ? 'لا خطط بعد — أنشئها من تبويب «خطط الزيارات».'
              : 'لا خطّة زيارات مسندة إليك بعد — يضعها المشرف.'}
          </Muted>
        ) : null}
      </Section>

      {noCoords.length ? (
        <Section title="تدخّل الآن — متاجر بلا موقع">
          <p className="text-sm text-ink-2 mb-3">
            هذه المتاجر في خطّة اليوم بلا إحداثيّة، فلا يمكن التحقّق من حضورك عندها. سجّل موقع كلٍّ منها وأنت أمامه.
          </p>
          <div className="flex flex-wrap gap-2">
            {noCoords.map((d) => (
              <button
                key={d.customerCode}
                type="button"
                disabled={busy === `pin:${d.customerCode}`}
                onClick={() => doPinCustomer(d.customerCode)}
                className="border border-red-500/40 bg-red-500/5 text-red-600 rounded-lg px-3 py-2 text-sm"
              >
                {busy === `pin:${d.customerCode}` ? 'جارٍ الالتقاط…' : `سجّل موقع ${d.customerName || d.customerCode}`}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {open ? (
        <Section title={`زيارة جارية — ${open.customerName || open.customerCode}`}>
          <OpenVisit
            visit={open}
            busy={busy}
            onClose={(outcome, notes) => doCheckOut(open, outcome, notes)}
            picking={outcomeFor === open.id}
            setPicking={(v) => setOutcomeFor(v ? open.id : null)}
          />
        </Section>
      ) : null}

      <Section title={`زيارات لم تبدأ (${pending.length})`}>
        {!pending.length ? (
          <Muted>لا زيارات معلّقة.</Muted>
        ) : (
          <ul className="space-y-2">
            {pending.map((v) => (
              <li key={v.id} className="border border-line rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-ink">
                      {v.seq ? `${v.seq}. ` : ''}
                      {v.customerName || v.customerCode}
                    </div>
                    <div className="text-xs text-ink-2">
                      {v.customerCode}
                      {v.route ? ` · ${v.route}` : ''}
                      {!v.customerCoords ? ' · بلا موقع مسجّل' : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={Boolean(open) || busy === `in:${v.id}`}
                      onClick={() => doCheckIn(v)}
                      title={open ? 'أغلق الزيارة الجارية أوّلًا' : ''}
                    >
                      {busy === `in:${v.id}` ? 'جارٍ تحديد الموقع…' : 'حضور'}
                    </button>
                    <SkipButton visit={v} busy={busy} onSkip={doSkip} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {closed.length ? (
        <Section title={`منتهية اليوم (${closed.length})`}>
          <ul className="space-y-2">
            {closed.map((v) => {
              const verdict = visitVerdict(v);
              const mins = visitDurationMinutes(v.checkInAt, v.checkOutAt);
              return (
                <li key={v.id} className="border border-line rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-ink">{v.customerName || v.customerCode}</div>
                    <div className="text-xs text-ink-2">
                      {v.state === 'skipped'
                        ? `لم تُنفَّذ — ${v.skipReason || 'بلا سبب'}`
                        : `${outcomeLabel(v.outcome)}${mins !== null ? ` · ${mins} دقيقة` : ''}`}
                    </div>
                  </div>
                  {verdict.flags.length ? (
                    <ul className="mt-2 text-xs text-red-600 list-disc pr-5 space-y-0.5">
                      {verdict.flags.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="خريطة اليوم">
        <FieldMap visits={visits} due={due} coordsByCode={coordsByCode} />
      </Section>
      </>
      )}
    </div>
  );
}

/**
 * فجوات التغطية — التقرير الذي يكشف المتجر المنسيّ. لا يظهر في أيّ عدّ زيارات:
 * مندوبٌ ينفّذ ١٢٠ زيارةً شهريًّا قد يكون كرّرها على ثلاثين متجرًا وهجر عشرين.
 */
function CoverageTable({ customers, history, day }) {
  const rows = useMemo(
    () => coverageGaps(customers, history, { asOf: day, staleDays: 30 }).slice(0, 60),
    [customers, history, day]
  );
  const stale = rows.filter((r) => r.stale).length;

  return (
    <div>
      <p className="text-sm text-ink-2 mb-3">
        {stale} متجرًا لم يُزَر منذ أكثر من ٣٠ يومًا أو لم يُزَر قطّ — من أصل {customers.length}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-2 border-b border-line">
              {['المتجر', 'الرمز', 'آخر زيارة', 'منذ (يوم)'].map((h) => (
                <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-line/50">
                <td className="py-2 px-2">{r.name || '—'}</td>
                <td className="py-2 px-2 text-ink-2">{r.code}</td>
                <td className={`py-2 px-2 ${r.stale ? 'text-red-600' : ''}`}>
                  {r.neverVisited ? 'لم يُزَر قطّ' : r.lastVisit}
                </td>
                <td className={`py-2 px-2 ${r.stale ? 'text-red-600' : ''}`}>
                  {r.daysSince ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <Muted>لا عملاء مسجّلون بعد.</Muted> : null}
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm border ${
        active ? 'border-accent text-ink bg-chip' : 'border-line text-ink-2'
      }`}
    >
      {children}
    </button>
  );
}

/** الزيارة الجارية: عدّاد المكوث وإغلاقٌ بنتيجة مُلزِمة. */
function OpenVisit({ visit, busy, onClose, picking, setPicking }) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const mins = visitDurationMinutes(visit.checkInAt, { seconds: Math.floor(now / 1000) });

  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-2">
        {visit.customerCode}
        {mins !== null ? ` · مضى ${mins} دقيقة` : ''}
      </div>
      {!picking ? (
        <button type="button" className={btnPrimary} onClick={() => setPicking(true)}>
          إنهاء الزيارة
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {VISIT_OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutcome(o.id)}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  outcome === o.id ? 'border-accent bg-chip text-ink' : 'border-line text-ink-2'
                }`}
              >
                {o.labelAr}
              </button>
            ))}
          </div>
          <textarea
            className={input}
            rows={2}
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!outcome || busy === `out:${visit.id}`}
              onClick={() => onClose(outcome, notes)}
            >
              {busy === `out:${visit.id}` ? 'جارٍ الإغلاق…' : 'تأكيد الإنهاء'}
            </button>
            <button type="button" className={btn} onClick={() => setPicking(false)}>
              رجوع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkipButton({ visit, busy, onSkip }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        لم تُنفَّذ
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <select className={`${input} max-w-xs`} value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">— السبب —</option>
        {SKIP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <button
        type="button"
        className={btn}
        disabled={!reason || busy === `skip:${visit.id}`}
        onClick={() => onSkip(visit, reason)}
      >
        تأكيد
      </button>
      <button type="button" className={btn} onClick={() => setOpen(false)}>إلغاء</button>
    </div>
  );
}

/**
 * خريطة اليوم — Leaflet المستضاف محلّيًّا (بلا CDN، قاعدة الأوفلاين).
 * البلاطات من OpenStreetMap: تحتاج شبكة، فإن غابت بقيت العلامات على خلفيّةٍ
 * فارغة ولم تنكسر الصفحة.
 */
function FieldMap({ visits, due, coordsByCode }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [failed, setFailed] = useState(false);

  const points = useMemo(() => {
    const rows = [];
    const byCode = new Map(visits.map((v) => [String(v.customerCode).toUpperCase(), v]));
    const codes = new Set([...byCode.keys(), ...due.map((d) => d.customerCode)]);
    for (const code of codes) {
      const v = byCode.get(code);
      const coords = v?.customerCoords || coordsByCode.get(code);
      if (!coords) continue;
      rows.push({
        code,
        name: v?.customerName || code,
        coords,
        state: v?.state || 'planned',
      });
    }
    return rows;
  }, [visits, due, coordsByCode]);

  // Leaflet يُحمَّل بوسم `<script>` في الـbody، والجزيرة قد ترتطب قبله. فلو
  // حكمنا من أوّل محاولة لعلّمنا الخريطة «فاشلة» إلى الأبد بلا سبب. ننتظره
  // بمهلةٍ محدودة ثمّ نستسلم — ونعرض رسالةً بدل صندوقٍ فارغٍ صامت.
  const [leafletReady, setLeafletReady] = useState(
    typeof window !== 'undefined' && Boolean(window.L)
  );

  useEffect(() => {
    if (leafletReady) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      if (typeof window !== 'undefined' && window.L) {
        clearInterval(t);
        setLeafletReady(true);
      } else if ((tries += 1) > 40) {
        clearInterval(t);
        setFailed(true);
      }
    }, 100);
    return () => clearInterval(t);
  }, [leafletReady]);

  useEffect(() => {
    const L = leafletReady && typeof window !== 'undefined' ? window.L : null;
    if (!L || !ref.current) return undefined;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current).setView([32.1167, 20.0667], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const layer = layerRef.current;
    layer.clearLayers();

    const colors = { planned: '#9ca3af', checked_in: '#0891b2', checked_out: '#16a34a', skipped: '#dc2626' };
    for (const p of points) {
      L.circleMarker([p.coords.lat, p.coords.lng], {
        radius: 8,
        color: colors[p.state] || colors.planned,
        fillColor: colors[p.state] || colors.planned,
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindPopup(`<b>${p.name}</b><br>${p.code}`)
        .addTo(layer);
    }

    const c = centroid(points.map((p) => p.coords));
    if (c) mapRef.current.setView([c.lat, c.lng], points.length > 1 ? 12 : 15);
    return undefined;
  }, [points, leafletReady]);

  if (failed) return <Muted>تعذّر تحميل الخريطة — بقيّة الشاشة تعمل كما هي.</Muted>;
  if (!leafletReady) return <Muted>جارٍ تحميل الخريطة…</Muted>;

  return (
    <div>
      <div ref={ref} className="h-72 rounded-lg border border-line" />
      {!points.length ? (
        <p className="text-sm text-ink-2 mt-2">لا متجر بإحداثيّة مسجّلة بعد — سجّل المواقع لتظهر هنا.</p>
      ) : (
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-2">
          <Legend color="#9ca3af">لم تبدأ</Legend>
          <Legend color="#0891b2">جارية</Legend>
          <Legend color="#16a34a">منتهية</Legend>
          <Legend color="#dc2626">لم تُنفَّذ</Legend>
        </div>
      )}
    </div>
  );
}

function Legend({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function outcomeLabel(id) {
  return VISIT_OUTCOMES.find((o) => o.id === id)?.labelAr || id || '—';
}

function Section({ title, children }) {
  return (
    <section className="border border-line rounded-xl p-4">
      <h2 className="text-base text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, alert }) {
  return (
    <div className={`border rounded-xl p-3 ${alert ? 'border-red-500/40 bg-red-500/5' : 'border-line bg-chip'}`}>
      <div className="text-xs text-ink-2 mb-1">{label}</div>
      <div className={`text-xl ${alert ? 'text-red-600' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function Banner({ tone, children }) {
  const cls = tone === 'bad'
    ? 'border-red-500/40 bg-red-500/5 text-red-600'
    : 'border-line bg-chip text-ink';
  return <div className={`border rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function Muted({ children }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}
