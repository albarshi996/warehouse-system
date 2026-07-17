'use client';

import React, { useMemo, useRef } from 'react';
import TaskCard from './TaskCard';

const PRIORITY_ORDER = { high: 0, med: 1, low: 2 };

// A task is overdue when its due date passed and it is not done yet
const isOverdueTask = (task, today) => !task.done && task.dueDate && task.dueDate < today;

/**
 * TaskList Component
 * Displays filtered list of tasks with filter tabs, search, sort and backup tools
 */
export default function TaskList({
  tasks,
  onWhatsApp,
  onEmail,
  onPDF,
  onDelete,
  onToggleDone,
  onEdit,
  onChecklistToggle,
  onExport,
  onImportFile,
}) {
  const [filter, setFilter] = React.useState('all'); // all, high, med, low, overdue, done, sent
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState('newest'); // newest, due, priority
  const importInputRef = useRef(null);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Filter + search + sort compose together
  const filteredTasks = useMemo(() => {
    let list;
    switch (filter) {
      case 'high':
        list = tasks.filter((t) => t.priority === 'high');
        break;
      case 'med':
        list = tasks.filter((t) => t.priority === 'med');
        break;
      case 'low':
        list = tasks.filter((t) => t.priority === 'low');
        break;
      case 'overdue':
        list = tasks.filter((t) => isOverdueTask(t, today));
        break;
      case 'done':
        list = tasks.filter((t) => t.done);
        break;
      case 'sent':
        list = tasks.filter((t) => t.sent || t.emailSent);
        break;
      default:
        list = tasks;
    }

    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((t) =>
        [t.title, t.description, t.owner, t.dept, ...(t.tags || [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'due':
        sorted.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1; // empty dates last
          if (!b.dueDate) return -1;
          return (
            a.dueDate.localeCompare(b.dueDate) ||
            (a.dueTime || '').localeCompare(b.dueTime || '')
          );
        });
        break;
      case 'priority':
        sorted.sort(
          (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
        );
        break;
      default: // newest
        sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [tasks, filter, search, sortBy, today]);

  // Count tasks by type (for tab labels)
  const counts = {
    all: tasks.length,
    high: tasks.filter((t) => t.priority === 'high').length,
    med: tasks.filter((t) => t.priority === 'med').length,
    low: tasks.filter((t) => t.priority === 'low').length,
    overdue: tasks.filter((t) => isOverdueTask(t, today)).length,
    done: tasks.filter((t) => t.done).length,
    sent: tasks.filter((t) => t.sent || t.emailSent).length,
  };

  const filterTabs = [
    { id: 'all', label: 'الكل', count: counts.all },
    { id: 'high', label: 'عاجل', count: counts.high, color: '#c41e3a' },
    { id: 'med', label: 'متوسط', count: counts.med, color: '#DAAA3C' },
    { id: 'low', label: 'عادي', count: counts.low, color: '#3498db' },
    { id: 'overdue', label: 'متأخرة', count: counts.overdue, color: '#ef4444' },
    { id: 'done', label: 'منجزة', count: counts.done, color: '#16a34a' },
    { id: 'sent', label: 'مُرسل', count: counts.sent, color: '#10b981' },
  ];

  const handleImportChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImportFile?.(String(reader.result));
    reader.readAsText(file);
    event.target.value = ''; // allow re-importing the same file
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs + Search / Sort / Backup */}
      <div className="p-4 glass-card space-y-3">
        <div className="flex flex-wrap gap-2">
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

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث بالعنوان، التفاصيل، المسؤول، القسم أو التصنيف..."
            className="flex-1 min-w-[200px] px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow"
            title="ترتيب المهام"
          >
            <option value="newest">الأحدث</option>
            <option value="due">الاستحقاق الأقرب</option>
            <option value="priority">الأولوية</option>
          </select>
          <button
            onClick={() => onExport?.()}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-100 text-xs font-bold hover:border-brand-yellow/60 hover:text-white transition-colors"
            title="تصدير جميع المهام كملف JSON"
          >
            ⬇ نسخة احتياطية
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-100 text-xs font-bold hover:border-brand-yellow/60 hover:text-white transition-colors"
            title="استيراد مهام من ملف JSON (دمج حسب المعرّف)"
          >
            ⬆ استيراد
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Tasks Grid or Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-gray-100 text-lg font-medium mb-2">
            {search.trim() ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد مهام في هذا التصنيف'}
          </p>
          <p className="text-gray-200 text-sm">
            {search.trim()
              ? 'جرّب كلمات بحث مختلفة أو غيّر التصنيف'
              : filter === 'all'
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
              onToggleDone={onToggleDone}
              onEdit={onEdit}
              onChecklistToggle={onChecklistToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
