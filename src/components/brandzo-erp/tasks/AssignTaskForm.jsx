import React, { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { createTask } from '../../../services/tasks/tasksCloudService.js';

const DEPARTMENTS = [
  'الاستلام والرقابة',
  'فحص الجودة (QC)',
  'التخزين الموجه',
  'تحضير الطلبات',
  'الشحن والتوزيع',
  'المرتجعات والتسويات',
  'إدارة المخزون',
  'الصيانة والسلامة',
];

const PRIORITIES = [
  { key: 'low', label: 'عادي', on: 'border-blue-400 bg-blue-50 text-blue-700' },
  { key: 'med', label: 'متوسط', on: 'border-amber-400 bg-amber-50 text-amber-700' },
  { key: 'high', label: 'عاجل', on: 'border-red-400 bg-red-50 text-red-700' },
];

const inputCls =
  'w-full px-3 py-2 bg-chip border border-line rounded-lg text-ink placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow';

const todayKey = () => new Date().toISOString().split('T')[0];

/**
 * نموذج إسناد مهمّة (للمديرين). يختار المُسنَد إليه من مستخدمي المنظومة
 * الفعليّين، فتُكتب المهمّة في السحابة وتظهر فورًا عند ذلك المستخدم.
 */
export default function AssignTaskForm({ profile, users, onCreated, onError }) {
  const [assigneeUid, setAssigneeUid] = useState('');
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('');
  const [dueDate, setDueDate] = useState(todayKey());
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState('low');
  const [description, setDescription] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [stepInput, setStepInput] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setAssigneeUid('');
    setTitle('');
    setDept('');
    setDueDate(todayKey());
    setDueTime('09:00');
    setPriority('low');
    setDescription('');
    setChecklist([]);
    setStepInput('');
  };

  const addStep = () => {
    const text = stepInput.trim();
    if (text) {
      setChecklist((prev) => [...prev, { text, done: false }]);
      setStepInput('');
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!assigneeUid) {
      onError?.('اختر المُسنَد إليه أولًا');
      return;
    }
    if (!title.trim()) {
      onError?.('أدخل عنوان المهمّة');
      return;
    }
    const assignee = users.find((u) => u.uid === assigneeUid);
    if (!assignee) {
      onError?.('المستخدم المختار غير موجود');
      return;
    }

    setBusy(true);
    try {
      await createTask(
        { title, dept, dueDate, dueTime, priority, description, checklist, assignee },
        profile
      );
      onCreated?.(`أُسندت المهمّة إلى ${assignee.name}`);
      reset();
    } catch (err) {
      console.error(err);
      onError?.(err?.message || 'تعذّر إسناد المهمّة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="userPlus" size={20} className="text-brand-yellow" />
        <h2 className="text-lg font-bold text-ink">إسناد مهمّة لمستخدم</h2>
      </div>

      {/* المُسنَد إليه */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          المُسنَد إليه <span className="text-brand-red">*</span>
        </label>
        <select
          value={assigneeUid}
          onChange={(e) => setAssigneeUid(e.target.value)}
          className={inputCls}
        >
          <option value="">— اختر مستخدمًا —</option>
          {users.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.name}
              {u.roleLabel ? ` — ${u.roleLabel}` : ''}
            </option>
          ))}
        </select>
        {users.length === 0 && (
          <p className="mt-1 text-xs text-ink-2">لا يوجد مستخدمون مفعَّلون بعد.</p>
        )}
      </div>

      {/* العنوان */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          عنوان المهمّة <span className="text-brand-red">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثال: جرد رفوف التبريد A1–A6"
          className={inputCls}
        />
      </div>

      {/* القسم */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">القسم</label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls}>
          <option value="">— بلا قسم —</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* الاستحقاق */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">تاريخ الاستحقاق</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">الوقت</label>
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* الأولويّة */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">الأولويّة</label>
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPriority(p.key)}
              className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-colors ${
                priority === p.key ? p.on : 'bg-chip border-line text-ink-2 hover:border-brand-yellow/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* التفاصيل */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">التفاصيل</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="اكتب تفاصيل المهمّة وما هو مطلوب…"
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* قائمة التحقّق */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">خطوات التنفيذ (قائمة تحقّق)</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={stepInput}
            onChange={(e) => setStepInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addStep();
              }
            }}
            placeholder="أضف خطوة…"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addStep}
            className="px-4 rounded-lg font-bold text-sm bg-chip border border-line text-ink hover:border-brand-yellow/60"
          >
            إضافة
          </button>
        </div>
        {checklist.length > 0 && (
          <ul className="space-y-1.5">
            {checklist.map((s, i) => (
              <li key={i} className="flex items-center gap-2 bg-chip border border-line rounded-lg px-3 py-1.5 text-sm text-ink">
                <span className="text-ink-2">{i + 1}.</span>
                <span className="flex-1">{s.text}</span>
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => prev.filter((_, j) => j !== i))}
                  className="text-ink-2 hover:text-brand-red"
                  title="حذف الخطوة"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full py-2.5 rounded-lg font-bold text-white bg-brand-red hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--color-brand-red)' }}
      >
        <Icon name="userPlus" size={18} />
        {busy ? 'جارٍ الإسناد…' : 'إسناد المهمّة'}
      </button>
    </div>
  );
}
