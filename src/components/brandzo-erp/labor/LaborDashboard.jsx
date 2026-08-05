/**
 * لوحة عمالة الشحن والتفريغ — المحور الثاني من خطة تطوير البوابة.
 *
 * توثّق وتقيس كلّ حركة مناولةٍ ميدانيّة: فرق العمل (رقم/وردية/سائق فرك) ·
 * مهام مربوطة بالأوامر التشغيليّة (استلام/نقل/تسليم/حاوية) · تتبّع زمنيّ فعليّ ·
 * إنتاجيّة العمالة وتخطيط الموارد. بنية ٣ طبقات: تدخّل الآن · إجراءات · فهرس.
 *
 * الوصول: مشرف المناولة والمديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenCrews, addCrew, setCrewActive } from '../../../services/labor/crewsService.js';
import {
  listenLaborTasks,
  createTask,
  startTask,
  pauseTask,
  resumeTask,
  finishTask,
  cancelTask,
} from '../../../services/labor/laborTasksService.js';
import {
  LABOR_SHIFTS,
  ORDER_TYPES,
  taskState,
  taskDurationMinutes,
  crewSize,
  summarizeTasks,
  crewsNeeded,
} from '../../../services/labor/laborModel.js';

const LABOR_ROLES = ['admin', 'warehouse_manager', 'labor_supervisor'];
const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';

export default function LaborDashboard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [crews, setCrews] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('board');
  const [crewForm, setCrewForm] = useState(false);
  const [taskForm, setTaskForm] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !LABOR_ROLES.includes(me.role)) return undefined;
    const u1 = listenCrews(setCrews, (e) => setErr(e?.message || 'تعذّر الاتصال'));
    const u2 = listenLaborTasks(setTasks, (e) => setErr(e?.message || 'تعذّر الاتصال'));
    return () => {
      u1();
      u2();
    };
  }, [me]);

  const flash = (text, tone = 'ok') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4000);
  };

  const crewsById = useMemo(() => Object.fromEntries(crews.map((c) => [c.id, c])), [crews]);
  const summary = useMemo(() => summarizeTasks(tasks, crewsById), [tasks, crewsById]);
  const activeCrews = useMemo(() => crews.filter((c) => c.active !== false), [crews]);
  const running = useMemo(() => tasks.filter((t) => t.state === 'in_progress' || t.state === 'paused'), [tasks]);
  const pending = useMemo(() => tasks.filter((t) => t.state === 'pending'), [tasks]);
  const busyCrewIds = useMemo(() => new Set(running.map((t) => t.crewId)), [running]);
  const idleCrews = useMemo(() => activeCrews.filter((c) => !busyCrewIds.has(c.id)), [activeCrews, busyCrewIds]);

  async function act(fn) {
    try {
      await fn();
    } catch (e) {
      flash(e.message || 'تعذّر التنفيذ.', 'err');
    }
  }

  if (!ready) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحقّق…</p>;
  if (!me || !LABOR_ROLES.includes(me.role)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">غير مصرّح</p>
        <p className="text-sm">هذه اللوحة لمشرف المناولة والمديرَين فقط.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      {msg && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm text-center border ${
            msg.tone === 'err' ? 'bg-brand-red/10 border-brand-red/40 text-red-200' : 'bg-accent/15 border-accent/40 text-accent'
          }`}
        >
          {msg.text}
        </div>
      )}
      {err && <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-xl px-4 py-2 text-sm text-center">{err}</div>}

      {/* الطبقة ١ — مؤشّرات */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="فرق نشطة" value={activeCrews.length} />
        <Kpi label="مهام جارية" value={running.length} />
        <Kpi label="بانتظار البدء" value={pending.length} alert={pending.length > 0} />
        <Kpi label="منجزة" value={summary.doneCount} />
        <Kpi label="متوسّط الزمن (د)" value={summary.avgDurationMinutes} />
        <Kpi label="إنتاجيّة (وحدة/عامل·س)" value={summary.avgThroughput} />
      </div>

      {/* الطبقة ٢ — إجراءات سريعة */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setTaskForm((v) => !v); setCrewForm(false); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-brand-navy hover:bg-accent/85">
          ＋ مهمّة مناولة
        </button>
        <button type="button" onClick={() => { setCrewForm((v) => !v); setTaskForm(false); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-chip text-ink border border-line hover:border-accent/50">
          ＋ تشكيل فريق
        </button>
        <div className="flex-1" />
        {['board', 'crews', 'tasks', 'plan'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${tab === k ? 'bg-accent text-brand-navy border-accent' : 'bg-chip text-ink-2 border-line hover:border-accent/50'}`}
          >
            {{ board: 'اللوحة', crews: 'الفرق', tasks: 'المهام', plan: 'تخطيط الموارد' }[k]}
          </button>
        ))}
      </div>

      {taskForm && (
        <TaskForm
          crews={activeCrews}
          onCancel={() => setTaskForm(false)}
          onSave={async (payload) => {
            await act(async () => {
              await createTask(payload, me);
              setTaskForm(false);
              flash('أُنشئت مهمّة المناولة.');
            });
          }}
        />
      )}
      {crewForm && (
        <CrewForm
          onCancel={() => setCrewForm(false)}
          onSave={async (payload) => {
            await act(async () => {
              await addCrew(payload, me);
              setCrewForm(false);
              flash(`أُضيف الفريق ${payload.crewNo}.`);
            });
          }}
        />
      )}

      {/* الطبقة ٣ — المحتوى حسب التبويب */}
      {tab === 'board' && (
        <div className="space-y-5">
          <Section title="تدخّل الآن" hint="مهام بانتظار البدء وفرق بلا عمل">
            {pending.length === 0 && idleCrews.length === 0 ? (
              <Empty>لا شيء يستدعي التدخّل — كل الفرق تعمل.</Empty>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                <MiniList title={`مهام بانتظار البدء (${pending.length})`}>
                  {pending.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-line last:border-0">
                      <span className="text-sm text-ink">{ORDER_TYPES[t.orderType]?.label || t.orderType} · {crewsById[t.crewId]?.crewNo || '—'}{t.docRef?.number ? ` · ${t.docRef.number}` : ''}</span>
                      <button type="button" onClick={() => act(() => startTask(t, me))} className="text-xs font-bold text-green-700 hover:underline whitespace-nowrap">بدء ▶</button>
                    </li>
                  ))}
                </MiniList>
                <MiniList title={`فرق بلا مهمّة (${idleCrews.length})`}>
                  {idleCrews.map((c) => (
                    <li key={c.id} className="text-sm text-ink py-1.5 border-b border-line last:border-0">
                      فريق {c.crewNo} · {c.shift} · {crewSize(c)} أفراد{c.forkliftDriver?.name ? ` · فرك: ${c.forkliftDriver.name}` : ''}
                    </li>
                  ))}
                </MiniList>
              </div>
            )}
          </Section>

          <Section title="مهام جارية" hint="التتبّع الزمنيّ الحيّ">
            {running.length === 0 ? (
              <Empty>لا مهام جارية الآن.</Empty>
            ) : (
              <TaskTable rows={running} crewsById={crewsById} onAct={act} me={me} />
            )}
          </Section>
        </div>
      )}

      {tab === 'crews' && (
        <Section title={`فرق العمل (${crews.length})`}>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead><tr className="bg-chip">{['رقم الفريق', 'الوردية (التوكة)', 'الأفراد', 'سائق الرافعة (الفرك)', 'الحالة', 'إجراء'].map((h) => <th key={h} className="px-3 py-2 text-xs font-bold text-ink-2">{h}</th>)}</tr></thead>
              <tbody>
                {crews.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500">لا فرق بعد — ابدأ بتشكيل فريق.</td></tr>
                ) : crews.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2 font-bold text-ink">{c.crewNo}</td>
                    <td className="px-3 py-2 text-ink-2">{c.shift}</td>
                    <td className="px-3 py-2 text-ink-2">{(c.members || []).join('، ') || '—'}</td>
                    <td className="px-3 py-2 text-ink-2">{c.forkliftDriver?.name ? `${c.forkliftDriver.name}${c.forkliftDriver.licenseNo ? ` (${c.forkliftDriver.licenseNo})` : ''}` : '—'}</td>
                    <td className="px-3 py-2">{c.active !== false ? <span className="text-green-700 text-xs font-bold">نشط</span> : <span className="text-gray-500 text-xs">مؤرشف</span>}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => act(() => setCrewActive(c.id, c.active === false, me))} className="text-xs font-bold text-accent hover:underline">
                        {c.active !== false ? 'أرشفة' : 'تفعيل'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {tab === 'tasks' && (
        <Section title={`كل مهام المناولة (${tasks.length})`}>
          {tasks.length === 0 ? <Empty>لا مهام بعد.</Empty> : <TaskTable rows={tasks} crewsById={crewsById} onAct={act} me={me} showAll />}
        </Section>
      )}

      {tab === 'plan' && <PlanPanel summary={summary} activeCrews={activeCrews} />}
    </div>
  );
}

function TaskTable({ rows, crewsById, onAct, me, showAll }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[820px] text-right text-sm">
        <thead><tr className="bg-chip">{['نوع الأمر', 'المرجع', 'الفريق', 'الحالة', 'الكمية', 'الزمن (د)', 'إجراءات'].map((h) => <th key={h} className="px-3 py-2 text-xs font-bold text-ink-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((t) => {
            const st = taskState(t.state);
            const crew = crewsById[t.crewId];
            const dur = t.state === 'done' ? taskDurationMinutes(t.startedAt, t.finishedAt, t.pausedMs) : '—';
            return (
              <tr key={t.id} className="border-t border-line">
                <td className="px-3 py-2 text-ink">{ORDER_TYPES[t.orderType]?.label || t.orderType}</td>
                <td className="px-3 py-2 text-ink-2">{t.docRef?.number || t.containerRef || '—'}</td>
                <td className="px-3 py-2 text-ink-2">{crew?.crewNo || '—'}{crew?.shift ? ` · ${crew.shift}` : ''}</td>
                <td className="px-3 py-2"><span className="text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap" style={{ color: st.color, borderColor: `${st.color}66`, background: `${st.color}1a` }}>{st.label}</span></td>
                <td className="px-3 py-2 text-ink-2">{t.unitsHandled || '—'}</td>
                <td className="px-3 py-2 text-ink-2">{dur}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {t.state === 'pending' && <button type="button" onClick={() => onAct(() => startTask(t, me))} className="text-xs font-bold text-green-700 hover:underline">بدء</button>}
                    {t.state === 'in_progress' && <button type="button" onClick={() => onAct(() => pauseTask(t, me))} className="text-xs font-bold text-accent hover:underline">إيقاف</button>}
                    {t.state === 'paused' && <button type="button" onClick={() => onAct(() => resumeTask(t, me))} className="text-xs font-bold text-green-700 hover:underline">استئناف</button>}
                    {(t.state === 'in_progress' || t.state === 'paused') && (
                      <button type="button" onClick={() => { const u = window.prompt('الكمية المناوَلة:'); if (u !== null) onAct(() => finishTask(t, u, me)); }} className="text-xs font-bold text-ink-2 hover:text-ink hover:underline">إنهاء</button>
                    )}
                    {t.state === 'pending' && <button type="button" onClick={() => onAct(() => cancelTask(t, me))} className="text-xs text-gray-500 hover:underline">إلغاء</button>}
                    {!showAll && t.state === 'done' && <span className="text-xs text-gray-500">—</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlanPanel({ summary, activeCrews }) {
  const [volume, setVolume] = useState('');
  const [size, setSize] = useState('5');
  const [hours, setHours] = useState('8');
  const need = crewsNeeded(Number(volume), summary.avgThroughput, Number(size), Number(hours));
  return (
    <div className="space-y-5">
      <Section title="تخطيط احتياج العمالة" hint="يستند إلى متوسّط الإنتاجيّة التاريخيّة المقيسة">
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <label className="text-sm text-ink-2">الحجم المتوقّع (وحدة)<input className={input} type="number" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="مثال: 5000" /></label>
          <label className="text-sm text-ink-2">حجم الفريق<input className={input} type="number" value={size} onChange={(e) => setSize(e.target.value)} /></label>
          <label className="text-sm text-ink-2">ساعات الوردية<input className={input} type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        </div>
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
          <p className="text-sm text-ink-2 mb-1">الفرق المطلوبة تقديريًّا</p>
          <p className="text-3xl font-bold text-accent">{need || '—'}</p>
          <p className="text-xs text-gray-500 mt-1">بمتوسّط إنتاجيّة {summary.avgThroughput || 0} وحدة/عامل·ساعة (من {summary.doneCount} مهمّة منجزة)</p>
        </div>
      </Section>
      <Section title="الإنتاجيّة حسب الوردية">
        {Object.keys(summary.byShift || {}).length === 0 ? (
          <Empty>لا بيانات منجزة بعد لاستنباط الإنتاجيّة.</Empty>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {Object.entries(summary.byShift).map(([shift, s]) => (
              <div key={shift} className="bg-chip border border-line rounded-xl p-3">
                <p className="font-bold text-ink">{shift}</p>
                <p className="text-sm text-ink-2">{s.tasks} مهمّة · {s.units} وحدة</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">الفرق النشطة الآن: {activeCrews.length}</p>
      </Section>
    </div>
  );
}

function CrewForm({ onSave, onCancel }) {
  const [crewNo, setCrewNo] = useState('');
  const [shift, setShift] = useState(LABOR_SHIFTS[0]);
  const [members, setMembers] = useState('');
  const [driver, setDriver] = useState('');
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ crewNo, shift, members: members.split(/[،,\n]/).map((s) => s.trim()).filter(Boolean), forkliftDriver: driver ? { name: driver, licenseNo: license } : null });
        setSaving(false);
      }}
      className="bg-chip border border-accent/25 rounded-2xl p-4 sm:p-5 space-y-4"
    >
      <h3 className="text-base font-bold text-accent">＋ تشكيل فريق عمل</h3>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <L label="رقم الفريق" required><input className={input} value={crewNo} onChange={(e) => setCrewNo(e.target.value)} required /></L>
        <L label="الوردية (التوكة)" required>
          <select className={input} value={shift} onChange={(e) => setShift(e.target.value)}>{LABOR_SHIFTS.map((s) => <option key={s} value={s} className="bg-brand-navy">{s}</option>)}</select>
        </L>
        <L label="سائق الرافعة (الفرك)"><input className={input} value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="اختياريّ" /></L>
        <L label="رقم رخصة الفرك"><input className={input} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="اختياريّ" /></L>
      </div>
      <L label="أعضاء الفريق (يفصلهم فاصلة أو سطر)"><textarea className={input} rows={2} value={members} onChange={(e) => setMembers(e.target.value)} /></L>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-brand-navy disabled:opacity-60">{saving ? 'جارٍ الحفظ…' : 'حفظ الفريق'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-ink">إلغاء</button>
      </div>
    </form>
  );
}

function TaskForm({ crews, onSave, onCancel }) {
  const [orderType, setOrderType] = useState('receipt');
  const [refNumber, setRefNumber] = useState('');
  const [containerRef, setContainerRef] = useState('');
  const [crewId, setCrewId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const docType = ORDER_TYPES[orderType]?.docType;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!crewId) return;
        setSaving(true);
        await onSave({
          orderType,
          docRef: refNumber ? { type: docType, number: refNumber.trim() } : null,
          containerRef,
          crewId,
          note,
        });
        setSaving(false);
      }}
      className="bg-chip border border-accent/25 rounded-2xl p-4 sm:p-5 space-y-4"
    >
      <h3 className="text-base font-bold text-accent">＋ مهمّة مناولة جديدة</h3>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <L label="نوع الأمر" required>
          <select className={input} value={orderType} onChange={(e) => setOrderType(e.target.value)}>
            {Object.values(ORDER_TYPES).map((o) => <option key={o.id} value={o.id} className="bg-brand-navy">{o.label}</option>)}
          </select>
        </L>
        <L label={`رقم المستند (${docType})`}><input className={input} value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder={`${docType}-2026-...`} /></L>
        <L label="الفريق المنفِّذ" required>
          <select className={input} value={crewId} onChange={(e) => setCrewId(e.target.value)} required>
            <option value="">— اختر الفريق —</option>
            {crews.map((c) => <option key={c.id} value={c.id} className="bg-brand-navy">فريق {c.crewNo} · {c.shift}</option>)}
          </select>
        </L>
        {orderType === 'container' && <L label="رقم الحاوية"><input className={input} value={containerRef} onChange={(e) => setContainerRef(e.target.value)} /></L>}
      </div>
      <L label="ملاحظة"><input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></L>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !crewId} className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-brand-navy disabled:opacity-60">{saving ? 'جارٍ…' : 'إنشاء المهمّة'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-ink">إلغاء</button>
      </div>
      {crews.length === 0 && <p className="text-xs text-brand-red">لا فرق نشطة — شكّل فريقًا أوّلًا.</p>}
    </form>
  );
}

function Kpi({ label, value, alert }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${alert ? 'bg-brand-red/10 border-brand-red/40' : 'bg-chip border-line'}`}>
      <div className={`text-2xl font-bold ${alert ? 'text-brand-red' : 'text-accent'}`}>{value}</div>
      <div className="text-[11px] text-ink-2 mt-0.5">{label}</div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {hint && <span className="text-xs text-gray-500">— {hint}</span>}
      </div>
      {children}
    </section>
  );
}

function MiniList({ title, children }) {
  return (
    <div className="bg-chip border border-line rounded-xl p-3">
      <p className="text-xs font-bold text-ink-2 mb-1">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

function Empty({ children }) {
  return <div className="text-sm text-gray-500 text-center py-6 bg-chip border border-line rounded-xl">{children}</div>;
}

function L({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-ink-2 mb-1">{label}{required && <span className="text-brand-red"> *</span>}</span>
      {children}
    </label>
  );
}
