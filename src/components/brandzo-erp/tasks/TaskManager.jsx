import React, { useEffect, useRef, useState } from 'react';
import TaskForm from './TaskForm.jsx';
import TaskList from './TaskList.jsx';
import StatsBar from './StatsBar.jsx';
import {
  getAllTasks,
  markSent,
  markEmailSent,
  deleteTask as deleteTaskService,
} from './taskService';

const PRIORITY_LABELS = {
  high: 'عاجل',
  med: 'متوسط',
  low: 'عادي',
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

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
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
    showToast('✅ تم حذف المهمة', false);
  };

  const generatePDF = (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      showToast('❌ لم يتم العثور على المهمة', true);
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('❌ مكتبة jsPDF غير متاحة', true);
      return;
    }

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    const headerHeight = 40;
    const stripeWidth = 6;
    const margin = 12;

    // Header bar
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, width, headerHeight, 'F');

    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('Brandzo Hub 2026', width / 2, 18, { align: 'center' });

    doc.setFontSize(8);
    doc.text(`BZ-${task.id}`, width - margin, 12, { align: 'right' });
    doc.text(
      `تاريخ الإنشاء: ${task.createdAt ? new Date(task.createdAt).toLocaleDateString('ar-LY') : '—'}`,
      width - margin,
      20,
      { align: 'right' }
    );

    // Crimson right stripe
    doc.setFillColor(196, 30, 58);
    doc.rect(width - stripeWidth, 0, stripeWidth, height, 'F');

    // Gold separator
    doc.setDrawColor(218, 170, 60);
    doc.setLineWidth(0.8);
    doc.line(margin, headerHeight + 2, width - stripeWidth - margin, headerHeight + 2);

    // Info grid
    const dataStartY = headerHeight + 12;
    const labelColor = [218, 170, 60];
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);

    const lineGap = 7;
    const leftX = margin;
    const rightX = width - stripeWidth - margin;

    const writeRow = (label, value, y) => {
      doc.setTextColor(...labelColor);
      doc.text(label, leftX, y);
      doc.setTextColor(255, 255, 255);
      doc.text(value, rightX, y, { align: 'right', maxWidth: width - stripeWidth - margin * 2 - 30 });
    };

    writeRow('القسم:', task.dept || '—', dataStartY);
    writeRow('المسؤول:', task.owner || '—', dataStartY + lineGap);
    writeRow(
      'الاستحقاق:',
      `${task.dueDate || '—'}${task.dueTime ? ' — ' + task.dueTime : ''}`,
      dataStartY + lineGap * 2
    );
    writeRow('الأولوية:', PRIORITY_LABELS[task.priority] || 'عادي', dataStartY + lineGap * 3);
    writeRow('التصنيفات:', task.tags?.join(' · ') || '—', dataStartY + lineGap * 4);

    // Description box
    const descY = dataStartY + lineGap * 5 + 4;
    const descHeight = 32;
    doc.setFillColor(26, 26, 46);
    doc.roundedRect(leftX, descY, width - stripeWidth - margin * 2, descHeight, 4, 4, 'F');

    doc.setFontSize(9);
    doc.setTextColor(218, 170, 60);
    doc.text('التفاصيل', leftX + 2, descY + 7);
    doc.setTextColor(255, 255, 255);
    doc.text(task.description || '—', leftX + 2, descY + 14, {
      maxWidth: width - stripeWidth - margin * 2 - 6,
    });

    // Checklist
    const checklistStartY = descY + descHeight + 14;
    doc.setFontSize(10);
    doc.setTextColor(218, 170, 60);
    doc.text('قائمة التحقق', leftX, checklistStartY);
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);

    let currentY = checklistStartY + 7;
    const checkboxSize = 4;
    const checklistMaxWidth = width - stripeWidth - margin * 2 - 12;

    (task.checklist || []).forEach((item, index) => {
      if (currentY > height - 30) {
        doc.addPage();
        currentY = margin;
      }
      doc.setDrawColor(255, 255, 255);
      doc.rect(leftX, currentY - 4, checkboxSize, checkboxSize);
      if (item.done) {
        doc.setTextColor(54, 179, 126);
        doc.text('✓', leftX + 1, currentY + 1);
      }
      doc.setTextColor(255, 255, 255);
      doc.text(`${index + 1}. ${item.text}`, leftX + checkboxSize + 4, currentY, {
        maxWidth: checklistMaxWidth,
      });
      currentY += 7;
    });

    // Footer
    doc.setFillColor(26, 26, 46);
    doc.rect(0, height - 20, width - stripeWidth, 20, 'F');
    doc.setFontSize(9);
    doc.setTextColor(218, 170, 60);
    doc.text('Brandzo Franchise Partners — COMMAND CENTER', width / 2, height - 8, {
      align: 'center',
    });

    doc.save(`BZ-Task-${task.id}.pdf`);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <StatsBar tasks={tasks} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
        <TaskForm onTaskAdded={handleTaskAdded} onShowToast={showToast} />
        <TaskList
          tasks={tasks}
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
          onPDF={generatePDF}
          onDelete={handleDelete}
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
