import React, { useEffect, useRef, useState } from 'react';
import TaskForm from './TaskForm.jsx';
import TaskList from './TaskList.jsx';
import StatsBar from './StatsBar.jsx';
import {
  getAllTasks,
  updateTask,
  markSent,
  markEmailSent,
  markDone,
  markUndone,
  exportTasks,
  importTasks,
  deleteTask as deleteTaskService,
} from './taskService';

const PRIORITY_LABELS = {
  high: 'عاجل',
  med: 'متوسط',
  low: 'عادي',
};

const PRIORITY_COLORS = {
  high: '#c41e3a',
  med: '#DAAA3C',
  low: '#3498db',
};

function buildMessage(task) {
  const steps = task.checklist?.length
    ? '\n\nخطوات التنفيذ:\n\n' + task.checklist.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
    : '';

  return (
    `🏭 *Brandzo Hub — مهمة تشغيلية*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *${task.title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🚨 *الأولوية:* ${PRIORITY_LABELS[task.priority] || 'عادي'}\n` +
    `🏢 *القسم:* ${task.dept || '—'}\n` +
    `👤 *المسؤول:* ${task.owner || '—'}\n` +
    `📅 *الاستحقاق:* ${task.dueDate || '—'}${task.dueTime ? ' — ' + task.dueTime : ''}\n` +
    `🏷️ *التصنيف:* ${task.tags?.join(' · ') || '—'}\n\n` +
    `📝 *التفاصيل:*\n${task.description || '—'}` +
    steps +
    `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
    `*Brandzo Franchise Partners — COMMAND CENTER*`
  );
}

function buildEmailBody(task) {
  const steps = task.checklist?.length
    ? '\n\nخطوات التنفيذ:\n' + task.checklist.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
    : '';

  return (
    `Brandzo Hub 2026 — مهمة تشغيلية\n` +
    `${'═'.repeat(40)}\n` +
    `العنوان: ${task.title}\n` +
    `الأولوية: ${PRIORITY_LABELS[task.priority] || 'عادي'}\n` +
    `القسم: ${task.dept || '—'}\n` +
    `المسؤول: ${task.owner || '—'}\n` +
    `الاستحقاق: ${task.dueDate || '—'}${task.dueTime ? ' — ' + task.dueTime : ''}\n` +
    `التصنيف: ${task.tags?.join(' · ') || '—'}\n` +
    (task.description ? `\nالتفاصيل:\n${task.description}` : '') +
    steps +
    `\n\n${'═'.repeat(40)}\n` +
    `Brandzo Franchise Partners — COMMAND CENTER`
  );
}

function formatPhone(phone = '') {
  return phone.replace(/\s+/g, '').replace(/^0+/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a standalone RTL Arabic HTML document (Brandzo identity) for a task,
 * ready to be opened in a print window and saved as PDF by the user.
 */
function buildPrintDocument(task) {
  const prioLabel = PRIORITY_LABELS[task.priority] || 'عادي';
  const prioColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.low;
  const createdAt = task.createdAt ? new Date(task.createdAt).toLocaleDateString('ar-LY') : '—';
  const todayKey = new Date().toISOString().split('T')[0];
  const isOverdue = !task.done && task.dueDate && task.dueDate < todayKey;

  const totalSteps = task.checklist?.length || 0;
  const doneSteps = task.checklist?.filter((s) => s.done).length || 0;
  const checklistHtml = (task.checklist || [])
    .map(
      (item, i) => `
        <li class="check-item${item.done ? ' done' : ''}">
          <span class="check-mark">${item.done ? '✓' : '☐'}</span>
          <span class="check-text">${i + 1}. ${escapeHtml(item.text)}</span>
        </li>`
    )
    .join('');

  const tagsHtml = task.tags?.length
    ? task.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')
    : '—';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>BZ-${escapeHtml(task.id)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 10mm; }
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      background: #ffffff;
      color: #1a1a2e;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .header {
      background: #1a1a2e;
      color: #ffffff;
      padding: 22px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-radius: 10px 10px 0 0;
    }
    .header .brand { font-size: 20px; font-weight: 900; }
    .header .brand small { display: block; font-size: 11px; font-weight: 600; color: #DAAA3C; margin-top: 2px; }
    .header .meta { text-align: left; font-size: 11px; line-height: 1.8; color: rgba(255, 255, 255, 0.85); }
    .accent-stripe { height: 6px; background: #c41e3a; }
    .content { flex: 1; padding: 24px 28px; }
    h1.task-title { font-size: 22px; font-weight: 900; margin-bottom: 10px; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .badge {
      display: inline-block;
      padding: 3px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #ffffff;
    }
    .badge-done { background: #10b981; }
    .badge-overdue { background: #dc2626; }
    .gold-sep { border: 0; border-top: 2px solid #DAAA3C; margin: 14px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 13px; }
    .info-grid .label { color: #a37c1f; font-weight: 700; margin-left: 6px; }
    .info-full { grid-column: 1 / -1; }
    .tag {
      display: inline-block;
      background: rgba(218, 170, 60, 0.15);
      color: #8a6914;
      border: 1px solid rgba(218, 170, 60, 0.5);
      border-radius: 999px;
      padding: 1px 10px;
      font-size: 11px;
      font-weight: 700;
      margin: 0 0 2px 4px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 900;
      color: #1a1a2e;
      margin-bottom: 8px;
      border-right: 4px solid #c41e3a;
      padding-right: 8px;
    }
    .desc-box {
      background: #f8f5ed;
      border: 1px solid #e5d9b8;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.9;
      white-space: pre-wrap;
    }
    .check-list { list-style: none; margin-top: 4px; }
    .check-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 6px 0;
      border-bottom: 1px dashed #e2e2e2;
      font-size: 13px;
    }
    .check-item .check-mark { font-weight: 900; color: #9ca3af; }
    .check-item.done .check-mark { color: #10b981; }
    .check-item.done .check-text { text-decoration: line-through; color: #6b7280; }
    .footer {
      background: #1a1a2e;
      color: #DAAA3C;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      padding: 12px;
      border-radius: 0 0 10px 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">🏭 Brandzo Hub 2026<small>مهمة تشغيلية — Operational Task</small></div>
    <div class="meta">BZ-${escapeHtml(task.id)}<br />تاريخ الإنشاء: ${escapeHtml(createdAt)}</div>
  </div>
  <div class="accent-stripe"></div>
  <div class="content">
    <h1 class="task-title">${escapeHtml(task.title)}</h1>
    <div class="badges">
      <span class="badge" style="background:${prioColor}">الأولوية: ${prioLabel}</span>
      ${task.done ? '<span class="badge badge-done">✔ منجزة</span>' : ''}
      ${isOverdue ? '<span class="badge badge-overdue">⏰ متأخرة</span>' : ''}
    </div>
    <hr class="gold-sep" />
    <div class="info-grid">
      <div><span class="label">القسم:</span>${escapeHtml(task.dept || '—')}</div>
      <div><span class="label">المسؤول:</span>${escapeHtml(task.owner || '—')}</div>
      <div><span class="label">تاريخ الاستحقاق:</span>${escapeHtml(task.dueDate || '—')}</div>
      <div><span class="label">الوقت:</span>${escapeHtml(task.dueTime || '—')}</div>
      <div class="info-full"><span class="label">التصنيفات:</span>${tagsHtml}</div>
    </div>
    <hr class="gold-sep" />
    <div class="section-title">التفاصيل</div>
    <div class="desc-box">${escapeHtml(task.description || '—')}</div>
    ${
      totalSteps > 0
        ? `<hr class="gold-sep" />
    <div class="section-title">قائمة التحقق (${doneSteps}/${totalSteps})</div>
    <ul class="check-list">${checklistHtml}</ul>`
        : ''
    }
  </div>
  <div class="footer">Brandzo Franchise Partners — COMMAND CENTER</div>
  <script>
    window.addEventListener('load', function () {
      var go = function () { setTimeout(function () { window.print(); }, 200); };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go);
      } else {
        go();
      }
    });
  ${'</'}script>
</body>
</html>`;
}

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [toast, setToast] = useState({ message: '', visible: false, isRed: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    setTasks(getAllTasks());
    return () => {
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const refreshTasks = () => {
    setTasks(getAllTasks());
  };

  const showToast = (message, isRed = false) => {
    setToast({ message, visible: true, isRed });
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2800);
  };

  const handleTaskAdded = (task) => {
    setTasks((prev) => [task, ...prev]);
  };

  const handleTaskUpdated = () => {
    refreshTasks();
    setEditingTask(null);
  };

  const handleEdit = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }
    setEditingTask(task);
  };

  const handleToggleDone = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }
    try {
      if (task.done) {
        markUndone(id);
        showToast('↩️ تمت إعادة فتح المهمة', false);
      } else {
        markDone(id);
        showToast('✅ تم إنجاز المهمة — أحسنت!', false);
      }
      refreshTasks();
    } catch (err) {
      console.error(err);
      showToast('❌ تعذر تحديث حالة المهمة', true);
    }
  };

  const handleChecklistToggle = (id, index) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || !Array.isArray(task.checklist) || !task.checklist[index]) {
      return;
    }
    const checklist = task.checklist.map((step, i) =>
      i === index ? { ...step, done: !step.done } : step
    );
    try {
      updateTask(id, { checklist });
      refreshTasks();
    } catch (err) {
      console.error(err);
      showToast('❌ تعذر تحديث قائمة التحقق', true);
    }
  };

  const handleWhatsApp = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }
    if (!task.phone?.trim()) {
      showToast('❌ لا يوجد رقم واتساب للمهمة', true);
      return;
    }

    const formattedPhone = formatPhone(task.phone);
    if (!formattedPhone) {
      showToast('❌ رقم واتساب غير صالح', true);
      return;
    }

    const message = buildMessage(task);
    window.open(`https://wa.me/218${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    try {
      markSent(id);
      refreshTasks();
    } catch (err) {
      console.error(err);
    }
    showToast('✅ تم فتح واتساب بنجاح', false);
  };

  const handleEmail = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }
    if (!task.email?.trim()) {
      showToast('❌ لا يوجد بريد إلكتروني للمهمة', true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(task.email.trim())) {
      showToast('❌ عنوان البريد الإلكتروني غير صحيح', true);
      return;
    }

    try {
      markEmailSent(id);
      refreshTasks();
    } catch (err) {
      console.error(err);
    }

    const subject = encodeURIComponent(`[Brandzo Task] ${task.title} — ${PRIORITY_LABELS[task.priority] || 'عادي'}`);
    const body = encodeURIComponent(buildEmailBody(task));
    window.location.href = `mailto:${task.email.trim()}?subject=${subject}&body=${body}`;
    showToast('📧 تم فتح البريد الإلكتروني', false);
  };

  const handleDelete = (id) => {
    const removed = deleteTaskService(id);
    if (!removed) {
      showToast('❌ لم يتم حذف المهمة', true);
      return;
    }
    setTasks((prev) => prev.filter((task) => task.id !== id));
    if (editingTask?.id === id) {
      setEditingTask(null);
    }
    showToast('✅ تم حذف المهمة', false);
  };

  const generatePDF = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('❌ حظر المتصفح النافذة المنبثقة — اسمح بالنوافذ المنبثقة ثم أعد المحاولة', true);
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintDocument(task));
    printWindow.document.close();
    printWindow.focus();
    showToast('📄 تم تجهيز المستند — اختر «حفظ كـ PDF» من نافذة الطباعة', false);
  };

  const handleExport = () => {
    const all = exportTasks();
    if (!all.length) {
      showToast('❌ لا توجد مهام للتصدير', true);
      return;
    }
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Brandzo-Tasks-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`⬇ تم تصدير ${all.length} مهمة كنسخة احتياطية`, false);
  };

  const handleImportFile = (text) => {
    try {
      const parsed = JSON.parse(text);
      const result = importTasks(parsed);
      refreshTasks();
      showToast(`✅ تم الاستيراد: ${result.added} جديدة · ${result.updated} محدّثة`, false);
    } catch (err) {
      console.error(err);
      showToast('❌ ملف غير صالح — تأكد من أنه نسخة احتياطية JSON للمهام', true);
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <StatsBar tasks={tasks} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
        <TaskForm
          onTaskAdded={handleTaskAdded}
          onShowToast={showToast}
          editingTask={editingTask}
          onTaskUpdated={handleTaskUpdated}
          onCancelEdit={() => setEditingTask(null)}
        />
        <TaskList
          tasks={tasks}
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
          onPDF={generatePDF}
          onDelete={handleDelete}
          onToggleDone={handleToggleDone}
          onEdit={handleEdit}
          onChecklistToggle={handleChecklistToggle}
          onExport={handleExport}
          onImportFile={handleImportFile}
        />
      </div>

      <div
        className="fixed left-1/2 z-50 rounded-full px-5 py-3 text-sm font-bold shadow-2xl transition-all duration-300"
        style={{
          transform: toast.visible ? 'translate(-50%, 0)' : 'translate(-50%, 120%)',
          opacity: toast.visible ? 1 : 0,
          backgroundColor: toast.isRed ? 'rgba(196, 30, 58, 0.95)' : 'rgba(26, 26, 46, 0.95)',
          color: 'white',
          border: toast.isRed ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(218, 170, 60,0.25)',
          minWidth: '220px',
          textAlign: 'center',
        }}
      >
        {toast.message}
      </div>
    </div>
  );
}
