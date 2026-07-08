'use client';

import React from 'react';

/**
 * TaskCard Component
 * Single task card with priority stripe, progress bar, and action buttons
 */
export default function TaskCard({
  task,
  onWhatsApp,
  onEmail,
  onPDF,
  onDelete,
}) {
  const prioMap = { high: 'عاجل', med: 'متوسط', low: 'عادي' };
  const prioColors = {
    high: { stripe: '#c41e3a', label: 'عاجل' },
    med: { stripe: '#DAAA3C', label: 'متوسط' },
    low: { stripe: '#3498db', label: 'عادي' },
  };

  const prioColor = prioColors[task.priority] || prioColors.low;

  // Calculate checklist progress
  const totalSteps = task.checklist?.length || 0;
  const completedSteps = task.checklist?.filter((s) => s.done).length || 0;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

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
      className="glass-card p-4 hover:shadow-2xl hover:border-brand-yellow/50 transition-all duration-300 cursor-pointer hover:-translate-x-1"
      style={{
        borderRight: `4px solid ${prioColor.stripe}`,
        '--color-brand-yellow': 'var(--color-brand-yellow)',
      }}
    >
      {/* Card Header: Title + Priority Badge + Sent Badges */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white mb-1">{task.title}</h3>
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

      {/* Checklist Progress Bar */}
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

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
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
          title="تصدير PDF"
        >
          📄
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
