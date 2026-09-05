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
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenCrews, addCrew, setCrewActive } from '../../../services/labor/crewsService.js';
import {
  listenLaborTasks,
  createTask,
  startTask,
  pauseTask,
  resumeTask,
  finishTask,
  cancelTask,
  saveTaskLines,
  finishLineTask,
  recordDelayReason,
} from '../../../services/labor/laborTasksService.js';
import {
  LABOR_SHIFTS,
  ORDER_TYPES,
  isLineLevel,
  taskState,
  taskDurationMinutes,
  crewSize,
  summarizeTasks,
  crewsNeeded,
} from '../../../services/labor/laborModel.js';
import WorkerTaskPanel from './WorkerTaskPanel.jsx';
import { workQueue } from '../../../services/tasks/taskShape.js';
import { listenVehicles } from '../../../services/vehicles/vehiclesService.js';
import { RESOURCE_KINDS, RESOURCE_STATE, resolveResources, resourcesSnapshot } from '../../../services/labor/resourcesResolver.js';
import { listenDoors, listenYardVisits } from '../../../services/fleet/yardService.js';
// ‹EXE-702› الأداء بعدل — الحكم من المنطق الخالص، والشاشة تعرض سببه معه.
import { explainStandard, performanceOf, performanceSummary, standardFor } from '../../../services/labor/laborStandard.js';

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
  const [queueIndex, setQueueIndex] = useState(0);
  const [vehicles, setVehicles] = useState([]);
  const [doors, setDoors] = useState([]);
  const [yardVisits, setYardVisits] = useState([]);

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
    // ‹EXE-402› المركبات مصدرٌ ثانٍ للموارد — تُقرأ ولا تُنسخ.
    const u3 = listenVehicles(setVehicles);
    // ‹EXE-601› والأبواب مصدرٌ رابع: أُعلن نوعُها منذ EXE-401 ووصل مصدره الآن.
    // وبلا هذين المستمعين يبقى النوع معرَّفًا وصفُّه فارغًا — إعلانٌ بلا وفاء.
    const u4 = listenDoors(setDoors, () => setDoors([]));
    const u5 = listenYardVisits((list) => setYardVisits(list), () => setYardVisits([]));
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
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
  // ‹LOC-402› مهامّ تُنفَّذ بندًا بندًا (تخزين/سحب) — لها شاشة تنفيذٍ خاصّة.
  const lineTasks = useMemo(
    () => tasks.filter((t) => isLineLevel(t.orderType) && t.state !== 'done' && t.state !== 'cancelled'),
    [tasks]
  );
  // ‹EXE-104› الطابور ورتبته من المنطق الخالص — الشاشة تعرض ولا ترتّب.
  const { queue } = useMemo(() => workQueue(lineTasks), [lineTasks]);
  const current = queue[Math.min(queueIndex, Math.max(0, queue.length - 1))] || null;

  // ‹EXE-402› الموارد تُحلّ من مصادرها — والأبواب رابعُها منذ ‹EXE-601›.
  const resources = useMemo(
    () => resolveResources({ crews, vehicles, laborTasks: tasks, doors, yardVisits, nowMs: Date.now() }),
    [crews, vehicles, tasks, doors, yardVisits]
  );
  const resourceSnap = useMemo(() => resourcesSnapshot(resources), [resources]);

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
        {['board', 'mine', 'resources', 'standard', 'crews', 'tasks', 'plan'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${tab === k ? 'bg-accent text-brand-navy border-accent' : 'bg-chip text-ink-2 border-line hover:border-accent/50'}`}
          >
            {{ board: 'اللوحة', mine: 'مهامي', resources: 'الموارد', standard: 'الأداء والمعياريّ', crews: 'الفرق', tasks: 'المهام', plan: 'تخطيط الموارد' }[k]}
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
                      <button type="button" onClick={() => act(() => startTask(t, me))} className="text-xs font-bold text-green-700 hover:underline whitespace-nowrap">بدء</button>
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

      {/* ‹LOC-402› «مهامي» — تنفيذ التخزين والسحب بندًا بندًا على جهاز العامل.
          تظهر مهامّ line-level وحدها؛ وبقيّة الأنواع تبقى في «المهام» كما هي. */}
      {/* ‹EXE-104› مهمّةٌ واحدة في الصدارة لا قائمةٌ يوازن بينها: عاملٌ يحمل
          طردًا بيدٍ وهاتفًا بالأخرى لا يختار من اثنتي عشرة. والباقي خلف عدّاد،
          وسببُ الصدارة معلَنٌ فوقها. */}
      {tab === 'mine' && (
        <Section title="مهامي" hint="التخزين والسحب — اختر الرفّ وامسح">
          {queue.length === 0 ? (
            <Empty>لا مهامّ تخزينٍ أو سحبٍ مُسندة الآن.</Empty>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-2">المهمّة</span>
                <strong className="text-ink">{queueIndex + 1}</strong>
                <span className="text-ink-2">من {queue.length}</span>
                <button
                  type="button"
                  disabled={queueIndex === 0}
                  onClick={() => setQueueIndex((i) => Math.max(0, i - 1))}
                  className="px-2 py-1 rounded border border-line text-ink-2 disabled:opacity-40"
                >
                  السابقة
                </button>
                <button
                  type="button"
                  disabled={queueIndex >= queue.length - 1}
                  onClick={() => setQueueIndex((i) => Math.min(queue.length - 1, i + 1))}
                  className="px-2 py-1 rounded border border-line text-ink-2 disabled:opacity-40"
                >
                  التالية
                </button>
              </div>

              {current && (
                <div className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <strong className="text-sm text-ink">{ORDER_TYPES[current.task.orderType]?.label}</strong>
                    {current.task.docRef?.number && (
                      <span className="text-xs text-ink-2 font-mono">{current.task.docRef.number}</span>
                    )}
                    <span className="text-xs text-ink-2">فريق {crewsById[current.task.crewId]?.crewNo || '—'}</span>
                    {current.task.state === 'pending' && (
                      <button
                        type="button"
                        onClick={() => act(() => startTask(current.task, me))}
                        className="text-xs font-bold text-green-700 hover:underline"
                      >
                        بدء
                      </button>
                    )}
                  </div>
                  {/* سببُ الصدارة — «الرقم بلا مرجعٍ لا يُعرض» */}
                  <p className="text-xs text-ink-2 mb-2">{current.reason}</p>
                  <WorkerTaskPanel
                    task={current.task}
                    onSaveLines={(lines, entry) => act(() => saveTaskLines(current.task, lines, me, entry))}
                    onFinish={(verdict, lines) => act(() => finishLineTask(current.task, verdict, lines, me))}
                    onDelayReason={(id) => id && act(() => recordDelayReason(current.task, { id }, me))}
                  />
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* ‹EXE-402› الموارد: من متاحٌ الآن ومن متعثّر — بلا سجلٍّ رابع. */}
      {tab === 'resources' && (
        <Section title="الموارد التشغيليّة" hint="محسوبةٌ من الفرق والمركبات وأوامر الشغل — لا سجلّ مستقلّ">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Kpi label="موارد" value={resourceSnap.total} />
            <Kpi label="متاحة الآن" value={resourceSnap.assignable} />
            <Kpi label="مشغولة" value={resourceSnap.byState.busy || 0} />
            <Kpi label="خارج الخدمة" value={(resourceSnap.byState.maintenance || 0) + (resourceSnap.byState.stopped || 0)} alert={(resourceSnap.byState.maintenance || 0) + (resourceSnap.byState.stopped || 0) > 0} />
          </div>

          {resources.length === 0 ? (
            <Empty>لا موارد معرَّفة — أضِف فرقًا أو مركبات.</Empty>
          ) : (
            <div className="space-y-2">
              {resources.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                  <span className="text-xs text-ink-2">{RESOURCE_KINDS[r.kind]?.label}</span>
                  <strong className="text-sm text-ink">{r.label}</strong>
                  <span className={`text-xs ${RESOURCE_STATE[r.state]?.assignable ? 'text-green-700' : r.state === 'maintenance' || r.state === 'stopped' ? 'text-brand-red' : 'text-ink-2'}`}>
                    {RESOURCE_STATE[r.state]?.label || r.state}
                  </span>
                  {/* السبب ومدّته — موردٌ متوقّفٌ بلا سببٍ شكوى لا معلومة. */}
                  {r.reason && <span className="text-xs text-ink-2">— {r.reason}</span>}
                  {r.shift && <span className="text-xs text-muted">وردية {r.shift}</span>}
                  {r.size > 0 && <span className="text-xs text-muted">{r.size} عاملًا</span>}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {tab === 'standard' && <StandardPanel tasks={tasks} nowMs={Date.now()} />}

      {tab === 'plan' && <PlanPanel summary={summary} activeCrews={activeCrews} />}
    </div>
  );
}

/**
 * الأداء بعدل ‹EXE-702› — للمشرف وحده (ت-O05).
 *
 * ★★ **ولا ترتيبَ عمّالٍ تنازليًّا هنا ولا في غيرها.** لوحةٌ ترتّب البشر
 * تُنتج سباقًا يُخفي التعثّر بدل أن يكشفه: من تأخّر لعطلِ جهازٍ يتعلّم ألّا
 * يُبلّغ كي لا ينزل في القائمة — فتفقد الإدارة الإشارةَ التي تحتاجها. فما
 * يُعرض هنا **أين يضيع الوقت** لا **من أضاعه**، والأسباب مرتّبةٌ بأثرها.
 */
function StandardPanel({ tasks, nowMs }) {
  const done = useMemo(() => (tasks || []).filter((t) => t.state === 'done' || t.state === 'paused'), [tasks]);
  const perf = useMemo(() => performanceSummary(done, { nowMs }), [done, nowMs]);
  const sample = useMemo(() => done.slice(0, 12).map((t) => ({ task: t, verdict: performanceOf(t, { nowMs }) })), [done, nowMs]);
  const std = useMemo(() => standardFor({ lines: [{ qtyRequired: 1 }] }, { atMs: nowMs }), [nowMs]);

  return (
    <Section
      title="الأداء مقابل المعياريّ"
      hint="للمشرف — والمعيار أداةُ اكتشافِ مشكلةٍ لا حكمٌ آليّ على موظف"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi label="مقيسة" value={perf.measured} />
        <Kpi label="ضمن المعياريّ" value={perf.ontime} />
        <Kpi label="تجاوزَ بعذر" value={perf.excused} />
        <Kpi label="بلا سببٍ مسجَّل" value={perf.unexplained} alert={perf.unexplained > 0} />
      </div>

      {/* عناصر المعياريّ — يراها المشرف كي يعرف ممّ تكوّن الرقم. */}
      <div className="rounded-xl border border-line p-3 mb-4">
        <p className="text-xs font-bold text-ink-2 mb-2">
          المعياريّ إصدار {std.version} — {std.versionLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {std.elements.map((e) => (
            <span key={e.id} className="text-[11px] px-2 py-1 rounded-lg border border-line text-ink-2" title={e.note || e.hint}>
              {e.label}: {e.unitSeconds || e.count}
              {e.per === 'percent' ? '٪' : ' ث'}
              {e.basis === 'estimated' && e.id !== 'allowance' ? ' · تقديريّ' : ''}
            </span>
          ))}
        </div>
        {std.notes.length > 0 && <p className="text-[11px] text-ink-2 mt-2">{std.notes.join(' · ')}</p>}
      </div>

      {/* أين يضيع الوقت — لا من أضاعه. */}
      {perf.reasons.length > 0 && (
        <div className="rounded-xl border border-line p-3 mb-4">
          <p className="text-xs font-bold text-ink-2 mb-2">أسباب التأخّر — مرتّبةً بأثرها</p>
          {perf.reasons.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs border-t border-line py-1.5 first:border-t-0">
              <span className="text-ink-2">
                {r.label}
                {!r.blames && <span className="text-muted"> · خارج إرادة المنفّذ</span>}
              </span>
              <span className="text-ink font-bold">{r.count} مهمّة · {r.minutes}د</span>
            </div>
          ))}
        </div>
      )}

      {done.length === 0 ? (
        <Empty>لا مهامَّ منتهية بعد — ولا يُقاس ما لم يتمّ.</Empty>
      ) : (
        <div className="space-y-2">
          {sample.map(({ task: t, verdict }) => (
            <div key={t.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <strong className="text-ink">{ORDER_TYPES[t.orderType]?.label || t.orderType}</strong>
                <span className="text-ink-2">{t.docRef?.number || '—'}</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    verdict.countedVariance ? 'border-brand-red/40 text-brand-red' : 'border-line text-ink-2'
                  }`}
                >
                  {verdict.status.label}
                </span>
              </div>
              {/* ★ الفارق مع سببه دائمًا — لا رقمٌ عارٍ. */}
              <p className="text-[11px] text-ink-2 mt-1">{verdict.message}</p>
              <p className="text-[11px] text-muted mt-0.5">{explainStandard(verdict.standard)}</p>
            </div>
          ))}
          {done.length > sample.length && (
            <p className="text-[11px] text-muted text-center">…و{done.length - sample.length} مهمّةً أخرى.</p>
          )}
        </div>
      )}
    </Section>
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

  /**
   * ★★★ ‹JR-801› هذا النموذج ينشئ مهمّةً **حمولتُها بلا `lines`**.
   *
   * ولا بأس بذلك لأنواعٍ ليست على مستوى البنود (استلامٌ · نقلٌ · تسليمٌ ·
   * حاوية): تلك تُقاس بعدّاد وحداتٍ واحد ولا تُفتح بندًا بندًا. أمّا التخزينُ
   * والسحبُ (`isLineLevel`) فيفتحهما العاملُ في «مهامي» فلا يجد إلّا «لا بنود
   * في هذه المهمّة» — مهمّةٌ مُسنَدةٌ لا تُنفَّذ ولا تُقاس، وعاملٌ يظنّ العطبَ
   * في جهازه.
   *
   * والبنودُ لا تُكتب هنا بيد: مصدرُها المستندُ المعتمَد وحده، ومنه تشتقّها
   * `generateTasks` مع الرفوف المقترحة والقسمة على المناطق والنقص المُعلَن.
   *
   * ★★ ويُقال ذلك بصوتٍ عالٍ مع الطريق إليه، **ولا يُحذف الخيارُ من القائمة**:
   * خيارٌ يختفي يجعل المشغّل يظنّ الميزةَ مفقودةً فيلتمس لها طريقًا ملتويًا —
   * وهو أصلُ الازدواج نفسُه.
   */
  const fromDocumentOnly = isLineLevel(orderType);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!crewId || fromDocumentOnly) return;
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
      {fromDocumentOnly && (
        <p className="text-xs text-brand-red">
          «{ORDER_TYPES[orderType].label}» تُطلق من المستند لا من هنا: افتح مستند {docType} المعتمَد
          واضغط «أطلق للميدان» — فتأتي بنودُه ورفوفُه المقترحة وقسمتُه على المناطق معه.{' '}
          <a href={`${getBasePath()}/dashboard/documents`} className="font-bold underline">صندوق المستندات ←</a>
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !crewId || fromDocumentOnly} className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-brand-navy disabled:opacity-60">{saving ? 'جارٍ…' : 'إنشاء المهمّة'}</button>
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
