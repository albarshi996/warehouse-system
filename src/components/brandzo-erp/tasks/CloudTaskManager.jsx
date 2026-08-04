import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  listenAllTasks,
  listenAssignedToMe,
  listenEvents,
  assignableUsers,
  canAssignTasks,
} from '../../../services/tasks/tasksCloudService.js';
import { STATUS_LABELS, PRIORITY_LABELS, TASK_STATUS } from '../../../services/tasks/taskShape.js';
import { isOverdue } from '../../../services/tasks/taskMetrics.js';
import { getRole } from '../../../services/auth/roles.js';
import AssignTaskForm from './AssignTaskForm.jsx';
import TaskThread from './TaskThread.jsx';
import ResponseRateBoard from './ResponseRateBoard.jsx';

const STATUS_STYLE = {
  assigned: 'bg-gray-100 text-gray-700 border-gray-300',
  acknowledged: 'bg-amber-50 text-amber-700 border-amber-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  done: 'bg-green-50 text-green-700 border-green-300',
  canceled: 'bg-red-50 text-red-600 border-red-200',
};

const FILTERS = [
  { key: 'open', label: 'مفتوحة' },
  { key: 'overdue', label: 'متأخّرة' },
  { key: 'done', label: 'منجَزة' },
  { key: 'all', label: 'الكل' },
];

function TaskCard({ task, showAssignee, onOpen, now }) {
  const overdue = isOverdue(task, now);
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="w-full text-right rounded-xl border border-line bg-chip hover:border-brand-yellow/60 transition-colors p-3.5"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_STYLE[task.status]}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
        {task.priority === 'high' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-red-300 bg-red-50 text-brand-red">
            عاجل
          </span>
        )}
        {overdue && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-red-300 bg-red-50 text-brand-red">
            متأخّرة
          </span>
        )}
      </div>
      <div className="font-bold text-ink truncate">{task.title}</div>
      <div className="mt-1 flex items-center gap-3 text-xs text-ink-2 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Icon name="users" size={13} />
          {showAssignee ? task.assigneeName : `أسندها: ${task.createdByName}`}
        </span>
        <span className="inline-flex items-center gap-1" dir="ltr">
          <Icon name="calendar" size={13} />
          {task.dueDate || '—'}
          {task.dueTime ? ` ${task.dueTime}` : ''}
        </span>
        {task.priority !== 'high' && <span>{PRIORITY_LABELS[task.priority] || 'عادي'}</span>}
      </div>
    </button>
  );
}

export default function CloudTaskManager() {
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=signed-out
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('board'); // board | metrics
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ msg: '', red: false, show: false });
  const toastTimer = useRef(null);
  const now = Date.now();

  const showToast = (msg, red = false) => {
    setToast({ msg, red, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((p) => ({ ...p, show: false })), 2800);
  };

  // الملفّ الشخصيّ للمستخدم الحاليّ (الدور + الاسم + المعرّف).
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        setProfile(null);
        return;
      }
      try {
        setProfile(await fetchUserProfile(user));
      } catch {
        setProfile(null);
      }
    });
    return () => {
      unsub();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const isManager = profile ? canAssignTasks(profile.role) : false;

  // مستمع المهام الحيّ — كل المهام للمدير، والمُسنَدة إليّ لغيره.
  useEffect(() => {
    if (!profile) return undefined;
    setError('');
    const onErr = (e) => {
      console.error(e);
      setError('تعذّر تحميل المهام — تأكّد من نشر قواعد Firestore الجديدة.');
    };
    const unsub = isManager
      ? listenAllTasks(setTasks, onErr)
      : listenAssignedToMe(profile.uid, setTasks, onErr);
    return () => unsub && unsub();
  }, [profile, isManager]);

  // دليل المستخدمين للإسناد (المدير فقط — القراءة محصورة به في القواعد).
  useEffect(() => {
    if (!isManager) return;
    let alive = true;
    assignableUsers()
      .then((list) => {
        if (alive)
          setUsers(list.map((u) => ({ ...u, roleLabel: getRole(u.role)?.label || u.role })));
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [isManager]);

  // سجلّ توثيق المهمّة المفتوحة (اشتراك كسول عند الفتح فقط).
  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return undefined;
    }
    const unsub = listenEvents(selectedId, setEvents, (e) => console.error(e));
    return () => unsub && unsub();
  }, [selectedId]);

  if (profile === undefined) {
    return <div className="py-16 text-center text-ink-2">جارٍ التحميل…</div>;
  }
  if (profile === null) {
    return <div className="py-16 text-center text-ink-2">يجب تسجيل الدخول لعرض المهام.</div>;
  }

  const visibleTasks = tasks.filter((t) => {
    if (filter === 'open') return t.status !== TASK_STATUS.DONE && t.status !== TASK_STATUS.CANCELED;
    if (filter === 'done') return t.status === TASK_STATUS.DONE;
    if (filter === 'overdue') return isOverdue(t, now);
    return true;
  });
  const selected = tasks.find((t) => t.id === selectedId) || null;

  const taskListColumn = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
              filter === f.key
                ? 'bg-brand-yellow/15 border-brand-yellow text-ink'
                : 'bg-chip border-line text-ink-2 hover:border-brand-yellow/40'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-ink-2 ms-auto">{visibleTasks.length} مهمّة</span>
      </div>
      <div className="space-y-2.5">
        {visibleTasks.map((t) => (
          <TaskCard key={t.id} task={t} showAssignee={isManager} onOpen={setSelectedId} now={now} />
        ))}
        {visibleTasks.length === 0 && (
          <div className="py-10 text-center text-ink-2 italic border border-dashed border-line rounded-xl">
            {isManager ? 'لا مهام في هذا التصنيف — أسنِد مهمّةً جديدة.' : 'لا مهام مُسنَدة إليك في هذا التصنيف.'}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 text-right" dir="rtl">
      {/* رأس */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="clipboardList" size={22} className="text-brand-yellow" />
          <h1 className="text-xl font-bold text-ink">
            {isManager ? 'المهام التشغيلية — إسناد ومتابعة' : 'المهام المُسنَدة إليّ'}
          </h1>
        </div>
        {isManager && (
          <div className="flex items-center gap-1 bg-chip border border-line rounded-lg p-1">
            <button
              onClick={() => setTab('board')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold ${tab === 'board' ? 'bg-brand-yellow/20 text-ink' : 'text-ink-2'}`}
            >
              لوحة المهام
            </button>
            <button
              onClick={() => setTab('metrics')}
              className={`px-3 py-1.5 rounded-md text-sm font-bold ${tab === 'metrics' ? 'bg-brand-yellow/20 text-ink' : 'text-ink-2'}`}
            >
              معدّل الاستجابة
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-brand-red text-sm">
          <Icon name="alertTriangle" size={16} />
          {error}
        </div>
      )}

      {/* المحتوى */}
      {isManager ? (
        tab === 'board' ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
            <AssignTaskForm profile={profile} users={users} onCreated={(m) => showToast(m)} onError={(m) => showToast(m, true)} />
            {taskListColumn}
          </div>
        ) : (
          <ResponseRateBoard tasks={tasks} />
        )
      ) : (
        taskListColumn
      )}

      {/* خيط المهمّة */}
      {selected && (
        <TaskThread
          task={selected}
          events={events}
          profile={profile}
          users={users}
          onClose={() => setSelectedId(null)}
          onToast={(m) => showToast(m)}
          onError={(m) => showToast(m, true)}
        />
      )}

      {/* توست */}
      <div
        className="fixed left-1/2 bottom-6 z-[100] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-2xl transition-all"
        style={{
          transform: `translate(-50%, ${toast.show ? '0' : '160%'})`,
          opacity: toast.show ? 1 : 0,
          backgroundColor: toast.red ? '#c41e3a' : '#1a1a2e',
        }}
      >
        {toast.msg}
      </div>
    </div>
  );
}
