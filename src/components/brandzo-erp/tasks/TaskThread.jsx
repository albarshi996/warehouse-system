import React, { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { useOverlayBack } from '../../../services/ui/useOverlayBack.js';
import {
  setStatus,
  addReply,
  updateChecklist,
  reassignTask,
  canAssignTasks,
} from '../../../services/tasks/tasksCloudService.js';
import {
  TASK_STATUS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  EVENT_TYPE,
  assigneeNextActions,
  toMillis,
} from '../../../services/tasks/taskShape.js';

const STATUS_STYLE = {
  assigned: 'bg-gray-100 text-gray-700 border-gray-300',
  acknowledged: 'bg-amber-50 text-amber-700 border-amber-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  done: 'bg-green-50 text-green-700 border-green-300',
  canceled: 'bg-red-50 text-red-600 border-red-200',
};

const ACTION_LABEL = {
  acknowledged: 'اطّلعتُ',
  in_progress: 'بدء التنفيذ',
  done: 'إنجاز',
};

const fmtTime = (v) => {
  const ms = toMillis(v);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-LY', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function buildWhatsAppText(task) {
  const steps = task.checklist?.length
    ? '\n\nخطوات التنفيذ:\n' + task.checklist.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
    : '';
  return (
    `Brandzo Hub — مهمّة مُسنَدة\n` +
    `العنوان: ${task.title}\n` +
    `الأولويّة: ${PRIORITY_LABELS[task.priority] || 'عادي'}\n` +
    `الاستحقاق: ${task.dueDate || '—'}${task.dueTime ? ' — ' + task.dueTime : ''}\n` +
    (task.description ? `\nالتفاصيل:\n${task.description}` : '') +
    steps
  );
}

/**
 * خيط المهمّة: التوثيق (سجلّ الأحداث) + الردّ + التنفيذ (نقل الحالة) + قائمة
 * التحقّق + إشعار واتساب. طبقةٌ ملء الشاشة يُغلقها زرّ الرجوع (overlayHistory).
 */
export default function TaskThread({ task, events, profile, users, onClose, onToast, onError }) {
  const [reply, setReply] = useState('');
  const [reassignUid, setReassignUid] = useState('');
  const [busy, setBusy] = useState(false);

  useOverlayBack(true, onClose, 'task-thread');

  const isManager = canAssignTasks(profile.role);
  const isAssignee = profile.uid === task.assigneeUid;
  const canExecute = isAssignee || isManager;
  const terminal = task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.CANCELED;

  const guard = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      onError?.(err?.message || 'تعذّرت العمليّة');
    } finally {
      setBusy(false);
    }
  };

  const move = (to) =>
    guard(async () => {
      await setStatus(task.id, task.status, to, profile);
      onToast?.(`الحالة: ${STATUS_LABELS[to]}`);
    });

  const sendReply = () =>
    guard(async () => {
      await addReply(task.id, reply, profile);
      setReply('');
      onToast?.('أُرسل الردّ');
    });

  const toggleStep = (index) =>
    guard(async () => {
      const next = task.checklist.map((s, i) => (i === index ? { ...s, done: !s.done } : s));
      await updateChecklist(task.id, next);
    });

  const doReassign = () =>
    guard(async () => {
      const u = users.find((x) => x.uid === reassignUid);
      if (!u) return;
      await reassignTask(task.id, u, profile);
      setReassignUid('');
      onToast?.(`أُعيد الإسناد إلى ${u.name}`);
    });

  const notifyWhatsApp = () => {
    const phone = String(task.assigneePhone || '').replace(/\s+/g, '').replace(/^0+/, '');
    if (!phone) {
      onError?.('لا يوجد رقم واتساب في ملفّ المُسنَد إليه');
      return;
    }
    window.open(`https://wa.me/218${phone}?text=${encodeURIComponent(buildWhatsAppText(task))}`, '_blank');
    onToast?.('فُتح واتساب');
  };

  const nextActions = isAssignee && !isManager ? assigneeNextActions(task.status) : [];
  const doneCount = task.checklist?.filter((s) => s.done).length || 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-xl h-full overflow-y-auto bg-surface border-r border-line shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-surface border-b border-line">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABELS[task.status] || task.status}
              </span>
              {task.priority === 'high' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-red-300 bg-red-50 text-brand-red">
                  عاجل
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-bold text-ink truncate">{task.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-ink-2 hover:bg-chip" title="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* معلومات */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="المُسنَد إليه" value={task.assigneeName} icon="users" />
            <Info label="أسندها" value={task.createdByName} icon="userPlus" />
            <Info label="القسم" value={task.dept || '—'} icon="building" />
            <Info label="الاستحقاق" value={`${task.dueDate || '—'}${task.dueTime ? ' — ' + task.dueTime : ''}`} icon="calendar" />
          </div>

          {task.description && (
            <div className="bg-chip border border-line rounded-lg p-3 text-sm text-ink whitespace-pre-wrap">
              {task.description}
            </div>
          )}

          {/* قائمة التحقّق */}
          {task.checklist?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm font-bold text-ink">
                <Icon name="checkSquare" size={16} className="text-brand-yellow" />
                قائمة التحقّق ({doneCount}/{task.checklist.length})
              </div>
              <ul className="space-y-1.5">
                {task.checklist.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 bg-chip border border-line rounded-lg px-3 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!s.done}
                      disabled={!canExecute || terminal || busy}
                      onChange={() => toggleStep(i)}
                      className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className={s.done ? 'line-through text-ink-2' : 'text-ink'}>{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* آلية التنفيذ — نقل الحالة */}
          {canExecute && !terminal && (
            <div className="flex flex-wrap gap-2">
              {(isManager ? assigneeNextActions(task.status) : nextActions).map((to) => (
                <button
                  key={to}
                  onClick={() => move(to)}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg font-bold text-sm text-white bg-brand-red hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  style={{ backgroundColor: to === 'done' ? '#16a34a' : 'var(--color-brand-red)' }}
                >
                  <Icon name={to === 'done' ? 'checkCircle' : 'activity'} size={16} />
                  {ACTION_LABEL[to] || STATUS_LABELS[to]}
                </button>
              ))}
              {task.assigneePhone && (
                <button
                  onClick={notifyWhatsApp}
                  className="px-4 py-2 rounded-lg font-bold text-sm bg-chip border border-line text-ink hover:border-green-400"
                >
                  إشعار واتساب
                </button>
              )}
            </div>
          )}

          {/* أدوات المدير: إعادة فتح · إلغاء · إعادة إسناد */}
          {isManager && (
            <div className="border border-line rounded-lg p-3 space-y-3 bg-chip/50">
              <div className="text-xs font-bold text-ink-2">أدوات المدير</div>
              <div className="flex flex-wrap gap-2">
                {task.status === TASK_STATUS.DONE && (
                  <button onClick={() => move(TASK_STATUS.IN_PROGRESS)} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-chip border border-line text-ink hover:border-blue-400">
                    إعادة فتح
                  </button>
                )}
                {!terminal && (
                  <button onClick={() => move(TASK_STATUS.CANCELED)} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-chip border border-line text-brand-red hover:border-red-400">
                    إلغاء المهمّة
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select value={reassignUid} onChange={(e) => setReassignUid(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-chip border border-line rounded-lg text-ink text-sm">
                  <option value="">— إعادة الإسناد إلى… —</option>
                  {users.filter((u) => u.uid !== task.assigneeUid).map((u) => (
                    <option key={u.uid} value={u.uid}>{u.name}</option>
                  ))}
                </select>
                <button onClick={doReassign} disabled={busy || !reassignUid}
                  className="px-3 rounded-lg text-sm font-bold bg-chip border border-line text-ink hover:border-brand-yellow/60 disabled:opacity-50">
                  إعادة إسناد
                </button>
              </div>
            </div>
          )}

          {/* التوثيق + الردّ */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-bold text-ink">
              <Icon name="activity" size={16} className="text-brand-yellow" />
              سجلّ المهمّة والردود
            </div>
            <ul className="space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 text-sm">
                  <span className="mt-1 w-2 h-2 rounded-full flex-none bg-brand-yellow" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink">{ev.byName}</span>
                      <span className="text-xs text-ink-2" dir="ltr">{fmtTime(ev.at)}</span>
                    </div>
                    <div className={`text-ink-2 ${ev.type === EVENT_TYPE.REPLY ? 'text-ink' : ''}`}>
                      {ev.text || STATUS_LABELS[ev.toStatus] || ev.type}
                    </div>
                  </div>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-ink-2 italic">لا سجلّ بعد.</li>}
            </ul>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (reply.trim()) sendReply();
                  }
                }}
                placeholder="اكتب ردًّا أو تحديثًا…"
                className="flex-1 px-3 py-2 bg-chip border border-line rounded-lg text-ink placeholder-gray-400 focus:outline-none focus:border-brand-yellow"
              />
              <button onClick={sendReply} disabled={busy || !reply.trim()}
                className="px-4 rounded-lg font-bold text-sm text-white bg-brand-red hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-brand-red)' }}>
                إرسال
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, icon }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} size={15} className="mt-0.5 text-ink-2 flex-none" />
      <div className="min-w-0">
        <div className="text-xs text-ink-2">{label}</div>
        <div className="font-medium text-ink truncate">{value}</div>
      </div>
    </div>
  );
}
