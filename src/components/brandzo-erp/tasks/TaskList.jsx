'use client';

import React, { useMemo } from 'react';
import TaskCard from './TaskCard';

/**
 * TaskList Component
 * Displays filtered list of tasks with filter tabs
 */
export default function TaskList({
  tasks,
  onWhatsApp,
  onEmail,
  onPDF,
  onDelete,
}) {
  const [filter, setFilter] = React.useState('all'); // all, high, med, low, sent

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Filter tasks based on current filter
  const filteredTasks = useMemo(() => {
    switch (filter) {
      case 'high':
        return tasks.filter((t) => t.priority === 'high');
      case 'med':
        return tasks.filter((t) => t.priority === 'med');
      case 'low':
        return tasks.filter((t) => t.priority === 'low');
      case 'sent':
        return tasks.filter((t) => t.sent || t.emailSent);
      default:
        return tasks;
    }
  }, [tasks, filter]);

  // Count tasks by type (for tab labels)
  const counts = {
    all: tasks.length,
    high: tasks.filter((t) => t.priority === 'high').length,
    med: tasks.filter((t) => t.priority === 'med').length,
    low: tasks.filter((t) => t.priority === 'low').length,
    sent: tasks.filter((t) => t.sent || t.emailSent).length,
  };

  const filterTabs = [
    { id: 'all', label: 'الكل', count: counts.all },
    { id: 'high', label: 'عاجل', count: counts.high, color: '#c0392b' },
    { id: 'med', label: 'متوسط', count: counts.med, color: '#e8b830' },
    { id: 'low', label: 'عادي', count: counts.low, color: '#3498db' },
    { id: 'sent', label: 'مُرسل', count: counts.sent, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 p-4 glass-card">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${
              filter === tab.id
                ? 'shadow-lg'
                : 'opacity-60 hover:opacity-80'
            }`}
            style={
              filter === tab.id
                ? {
                    backgroundColor: tab.color || 'var(--color-brand-yellow)',
                    color: tab.id === 'all' ? '#1a1a2e' : 'white',
                    boxShadow: `0 0 16px ${tab.color || 'var(--color-brand-yellow)'}40`,
                  }
                : {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: 'white',
                    border: `1px solid rgba(255, 255, 255, 0.1)`,
                  }
            }
          >
            {tab.label}{' '}
            <span
              className="text-xs opacity-75"
              style={
                filter === tab.id ? { opacity: 0.9 } : {}
              }
            >
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Tasks Grid or Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-gray-100 text-lg font-medium mb-2">
            لا توجد مهام في هذا التصنيف
          </p>
          <p className="text-gray-200 text-sm">
            {filter === 'all'
              ? 'ابدأ بإنشاء مهمة جديدة'
              : `لا توجد مهام ${filterTabs.find((t) => t.id === filter)?.label}`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onWhatsApp={onWhatsApp}
              onEmail={onEmail}
              onPDF={onPDF}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
