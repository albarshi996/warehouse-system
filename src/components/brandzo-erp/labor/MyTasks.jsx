import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenCrews } from '../../../services/labor/crewsService.js';
import {
  finishLineTask,
  listenLaborTasks,
  recordDelayReason,
  saveTaskLines,
} from '../../../services/labor/laborTasksService.js';
import { isLineLevel } from '../../../services/labor/laborModel.js';
import { workQueue } from '../../../services/tasks/taskShape.js';
import WorkerTaskPanel from './WorkerTaskPanel.jsx';

/**
 * «مهامي» — شاشة العامل، قائمةً بنفسها ‹LOC-402›.
 *
 * ═══ لماذا وُجدت ═══
 * `WorkerTaskPanel` مبنيٌّ منذ خطّة المواقع، ومكتوبٌ في رأسه: «التصميم للهاتف
 * أوّلًا: بندٌ واحدٌ أمام العين، وأربع خانات مسحٍ كبيرة، وزرٌّ واحد — عاملٌ
 * يحمل طردًا بيدٍ وهاتفًا بالأخرى لا يتصفّح جداول».
 *
 * وكان **مدفونًا داخل لوحة عمالة الشحن والتفريغ**: يفتح العامل البوابة، ثمّ
 * «إدارة الحركة»، ثمّ اللوحة الإداريّة، ثمّ ينزل حتّى يجد لوحَه. أربعُ نقراتٍ
 * في شاشةٍ مليئةٍ بأرقامٍ ليست له — ليصل إلى ما صُمّم لأن يكون أوّلَ ما يراه.
 *
 * ═══ ولماذا يختار طاقمه ═══
 * المهمّة تُسنَد إلى **طاقمٍ** (`crewId`) لا إلى مستخدمٍ بعينه، وأعضاءُ الطاقم
 * أسماءٌ نصّيّة لا حساباتٌ مربوطة. فبدل بناء ربطٍ جديدٍ في البيانات، يختار
 * العامل طاقمه مرّةً ويُحفظ في جهازه — وهو الأقربُ للواقع: العامل يعرف طاقمه.
 *
 * والبوّابة **قابلةٌ للتثبيت** (PWA)، فهذه الصفحة تصير تطبيقًا على شاشته.
 */

const CREW_KEY = 'bz.myCrew';
const CAN_WORK = new Set(['admin', 'warehouse_manager', 'labor_supervisor', 'storekeeper', 'gate_officer']);

export default function MyTasks() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [crews, setCrews] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [crewId, setCrewId] = useState('');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try { setCrewId(localStorage.getItem(CREW_KEY) || ''); } catch { /* جهازٌ يمنع التخزين */ }
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = listenCrews(setCrews, (e) => setError(e?.message || 'تعذّرت قراءة الطواقم.'));
    const b = listenLaborTasks(setTasks, (e) => setError(e?.message || 'تعذّرت قراءة المهامّ.'));
    return () => { a?.(); b?.(); };
  }, [me]);

  const crew = useMemo(() => crews.find((c) => c.id === crewId) || null, [crews, crewId]);

  /** مهامّ الطاقم التي تُنفَّذ بندًا بندًا — الطابور ورتبتُه من المنطق الخالص. */
  const { queue } = useMemo(() => {
    const mine = (tasks || []).filter(
      (t) => t?.crewId === crewId && isLineLevel(t.orderType) && t.state !== 'done' && t.state !== 'cancelled'
    );
    return workQueue(mine);
  }, [tasks, crewId]);

  const current = queue[Math.min(index, Math.max(0, queue.length - 1))] || null;

  function chooseCrew(id) {
    setCrewId(id);
    setIndex(0);
    try { localStorage.setItem(CREW_KEY, id); } catch { /* لا بأس */ }
  }

  async function act(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err?.message || 'تعذّر التنفيذ.'); } finally { setBusy(false); }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_WORK.has(me.role)) return <Notice>هذه شاشة تنفيذ المهامّ — لعمّال المناولة والمخزن.</Notice>;

  /* ── لا طاقمَ بعد: اختيارٌ واحدٌ يُحفظ ── */
  if (!crewId || !crew) {
    return (
      <div dir="rtl" className="o_theme space-y-4 max-w-md mx-auto">
        <section className="o_ds o_ds_card o_ds_pad text-center space-y-3">
          <Icon name="users" size={28} className="text-accent mx-auto" />
          <h2 className="font-bold text-ink">أيُّ طاقمٍ أنت؟</h2>
          <p className="text-xs text-muted leading-relaxed">
            يُحفظ في هذا الجهاز مرّةً واحدة — ثمّ تفتح الصفحة فترى مهامّك مباشرةً.
          </p>
          <div className="space-y-2 pt-1">
            {crews.filter((c) => c.active !== false).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => chooseCrew(c.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-line bg-surface hover:border-accent/50 px-4 py-3 text-right transition-colors"
              >
                <Icon name="users" size={18} className="text-accent shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-ink">طاقم {c.crewNo || c.id}</span>
                  <span className="block text-[11px] text-muted truncate">
                    {(c.members || []).join(' · ') || 'بلا أعضاء مسجّلين'}
                    {c.shift ? ` — ${c.shift}` : ''}
                  </span>
                </span>
                <span className="text-muted">←</span>
              </button>
            ))}
            {crews.length === 0 && <div className="text-sm text-muted py-4">لا طاقمَ مسجّلًا بعد.</div>}
          </div>
        </section>
        {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}
      </div>
    );
  }

  return (
    <div dir="rtl" className="o_theme space-y-4 max-w-2xl mx-auto">
      {/* ═══ ترويسةٌ رفيعة — من أنا وكم بقي ═══ */}
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-3">
        <Icon name="users" size={18} className="text-accent shrink-0" />
        <span className="font-bold text-ink text-sm">طاقم {crew.crewNo || crew.id}</span>
        <span className="text-[11px] text-muted">
          {queue.length ? `${queue.length} مهمّةً مفتوحة` : 'لا مهمّة الآن'}
        </span>
        <div className="flex-1" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => chooseCrew('')}>غيّر الطاقم</button>
      </section>

      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}

      {!current ? (
        <section className="o_ds o_ds_card o_ds_pad text-center py-10 space-y-2">
          <Icon name="checkCircle" size={32} className="text-accent mx-auto" />
          <div className="font-bold text-ink">لا مهمّةَ الآن</div>
          <div className="text-xs text-muted">حين تُسنَد مهمّةٌ لطاقمك تظهر هنا مباشرةً.</div>
        </section>
      ) : (
        <>
          {/* ═══ التنقّل بين المهامّ — سطرٌ واحد لا جدول ═══ */}
          {queue.length > 1 && (
            <div className="flex items-center gap-2 justify-center">
              <button type="button" className="btn btn-secondary btn-sm" disabled={index <= 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}>السابقة</button>
              <span className="text-xs text-muted font-bold">{index + 1} / {queue.length}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={index >= queue.length - 1}
                onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))}>التالية</button>
            </div>
          )}

          {/* سببُ الصدارة — «الرقم بلا مرجعٍ لا يُعرض» */}
          {current.reason && <p className="text-xs text-ink-2 text-center">{current.reason}</p>}

          <WorkerTaskPanel
            task={current.task}
            onSaveLines={(lines, entry) => act(() => saveTaskLines(current.task, lines, me, entry))}
            onFinish={(verdict, lines) => act(() => finishLineTask(current.task, verdict, lines, me))}
            onDelayReason={(id) => id && act(() => recordDelayReason(current.task, { id }, me))}
          />

          {busy && <div className="text-xs text-accent font-bold text-center">يحفظ…</div>}
        </>
      )}
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="o_theme" dir="rtl">
      <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm max-w-md mx-auto">{children}</div>
    </div>
  );
}
