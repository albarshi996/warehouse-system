'use client';

import React, { useState } from 'react';

/**
 * TaskCard Component
 * Single task card with priority stripe, interactive checklist, progress bar,
 * completion toggle, and action buttons
 */
export default function TaskCard({
  task,
  onWhatsApp,
  onEmail,
  onPDF,
  onDelete,
  onToggleDone,
  onEdit,
  onChecklistToggle,
}) {
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  const prioColors = {
    high: { stripe: '#c41e3a', label: 'عاجل' },
    med: { stripe: '#DAAA3C', label: 'متوسط' },
    low: { stripe: '#3498db', label: 'عادي' },
  };

  const prioColor = prioColors[task.priority] || prioColors.low;

  // Completion / overdue state (old tasks may not carry the `done` field)
  const isDone = !!task.done;
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = !isDone && task.dueDate && task.dueDate < today;

  // Calculate checklist progress
  const checklist = task.checklist || [];
  const totalSteps = checklist.length;
  const completedSteps = checklist.filter((s) => s.done).length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const visibleSteps = checklistExpanded ? checklist : checklist.slice(0, 3);

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ar-LY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className={`glass-card p-4 hover:shadow-2xl hover:border-brand-yellow/50 transition-all duration-300 cursor-pointer hover:-translate-x-1 ${
        isDone ? 'opacity-70' : ''
      }`}
      style={{
        borderRight: `4px solid ${isDone ? '#10b981' : prioColor.stripe}`,
        '--color-brand-yellow': 'var(--color-brand-yellow)',
      }}
    >
      {/* Card Header: Title + Priority Badge + Status Badges */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3
            className={`text-lg font-bold text-white mb-1 ${
              isDone ? 'line-through decoration-emerald-400/70' : ''
            }`}
          >
            {task.title}
          </h3>
          <div className="flex gap-2 flex-wrap">
            {/* Priority Badge */}
            <span
              className="text-xs font-bold px-2 py-1 rounded text-white"
              style={{
                backgroundColor: prioColor.stripe,
              }}
            >
              {prioColor.label}
            </span>

            {/* Done Badge */}
            {isDone && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-emerald-600/60 text-emerald-200">
                ✔ منجزة
              </span>
            )}

            {/* Overdue Badge */}
            {isOverdue && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-red-600/70 text-red-100">
                ⏰ متأخرة
              </span>
            )}

            {/* Sent Badge */}
            {task.sent && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-green-600/60 text-green-200">
                ✓ مرسل
              </span>
            )}

            {/* Email Sent Badge */}
            {task.emailSent && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-blue-600/60 text-blue-200">
                📧 بريد مرسل
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Info Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-100 mb-3 pb-3 border-b border-white/10">
        {task.dept && (
          <div>
            <span className="text-gray-200">القسم:</span> {task.dept}
          </div>
        )}
        {task.owner && (
          <div>
            <span className="text-gray-200">المسؤول:</span> {task.owner}
          </div>
        )}
        {task.dueDate && (
          <div>
            <span className="text-gray-200">الاستحقاق:</span> {formatDate(task.dueDate)}
          </div>
        )}
        {task.dueTime && (
          <div>
            <span className="text-gray-200">الوقت:</span> {task.dueTime}
          </div>
        )}
      </div>

      {/* Description Preview */}
      {task.description && (
        <p className="text-sm text-gray-100 mb-3 line-clamp-2">{task.description}</p>
      )}

      {/* Checklist: progress bar + interactive items */}
      {totalSteps > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-200 mb-1">
            <span>قائمة التحقق</span>
            <span>
              {completedSteps}/{totalSteps}
            </span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                backgroundImage: `linear-gradient(90deg, #c41e3a, #DAAA3C)`,
              }}
            />
          </div>

          <ul className="mt-2 space-y-1">
            {visibleSteps.map((step, idx) => (
              <li key={idx}>
                <button
                  onClick={() => onChecklistToggle?.(task.id, idx)}
                  className="w-full flex items-start gap-2 text-right text-xs rounded px-2 py-1 hover:bg-white/10 transition-colors"
                  title={step.done ? 'إلغاء إتمام الخطوة' : 'إتمام الخطوة'}
                >
                  <span
                    className={`font-bold ${step.done ? 'text-emerald-400' : 'text-gray-300'}`}
                  >
                    {step.done ? '✓' : '☐'}
                  </span>
                  <span
                    className={`flex-1 ${
                      step.done ? 'line-through text-gray-300' : 'text-gray-100'
                    }`}
                  >
                    {step.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {totalSteps > 3 && (
            <button
              onClick={() => setChecklistExpanded((prev) => !prev)}
              className="mt-1 text-xs font-bold px-2 py-1 rounded text-brand-yellow hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-brand-yellow)' }}
            >
              {checklistExpanded ? '▲ إخفاء' : `▼ عرض الكل (${totalSteps})`}
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded bg-brand-yellow/20 text-brand-yellow"
              style={{
                backgroundColor: 'rgba(218, 170, 60, 0.2)',
                color: 'var(--color-brand-yellow)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Done Toggle */}
      <button
        onClick={() => onToggleDone?.(task.id)}
        className={`w-full mb-2 py-2 rounded text-xs font-bold border transition-colors ${
          isDone
            ? 'bg-white/5 border-white/10 text-gray-200 hover:border-amber-400/60 hover:text-amber-300'
            : 'bg-emerald-600/30 border-emerald-600/50 text-emerald-300 hover:bg-emerald-600/50'
        }`}
        title={isDone ? 'إعادة فتح المهمة' : 'وضع علامة منجزة'}
      >
        {isDone ? '↩ إعادة فتح' : '✓ إنجاز'}
      </button>

      {/* Action Buttons */}
      <div className="grid grid-cols-5 gap-2">
        <button
          onClick={() => onWhatsApp(task.id)}
          className="px-2 py-2 bg-green-600/30 hover:bg-green-600/50 border border-green-600/50 text-green-300 rounded text-xs font-bold transition-colors"
          title="إرسال واتساب"
        >
          💬
        </button>
        <button
          onClick={() => onEmail(task.id)}
          className="px-2 py-2 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-600/50 text-blue-300 rounded text-xs font-bold transition-colors"
          title="إرسال بريد"
        >
          📧
        </button>
        <button
          onClick={() => onPDF(task.id)}
          className="px-2 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/50 text-amber-300 rounded text-xs font-bold transition-colors"
          title="تصدير PDF (طباعة)"
        >
          📄
        </button>
        <button
          onClick={() => onEdit?.(task.id)}
          className="px-2 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-600/50 text-purple-300 rounded text-xs font-bold transition-colors"
          title="تعديل المهمة"
        >
          ✏️
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="px-2 py-2 bg-red-600/30 hover:bg-red-600/50 border border-red-600/50 text-red-300 rounded text-xs font-bold transition-colors"
          title="حذف"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
