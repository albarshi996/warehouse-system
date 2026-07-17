'use client';

import React from 'react';
import Icon from '../../ui/Icon.jsx';

function KpiCard({ icon, emoji, badgeClass, valueClass, labelEn, labelAr, value, sub, neonColor }) {
  const neonStyles = {
    red: 'hover:shadow-[0_0_20px_rgba(196, 30, 58,0.3)] border-brand-red/20',
    gold: 'hover:shadow-[0_0_20px_rgba(218, 170, 60,0.3)] border-brand-gold/20',
    blue: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] border-blue-200',
    green: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] border-green-200',
  };

  return (
    <div
      className={[
        'rounded-xl border p-6 text-right transition-all backdrop-blur-md bg-white/10',
        neonStyles[neonColor] || 'border-gray-200 shadow-sm',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${badgeClass}`}>
          {emoji ? (
            <span className="block text-xl leading-none font-bold" aria-hidden="true">
              {emoji}
            </span>
          ) : (
            <Icon name={icon} />
          )}
        </div>
        <span className="text-xs font-bold text-gray-100">{labelEn}</span>
      </div>
      <div className="text-sm font-medium text-gray-200">{labelAr}</div>
      <div className={`mt-2 text-3xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-200">{sub}</div>}
    </div>
  );
}

export default function StatsBar({ tasks }) {
  const totalTasks = tasks.length;
  const urgentCount = tasks.filter((task) => task.priority === 'high').length;
  const sentCount = tasks.filter((task) => task.sent || task.emailSent).length;
  const doneCount = tasks.filter((task) => task.done).length;
  const todayKey = new Date().toISOString().split('T')[0];
  const todayCount = tasks.filter((task) => task.dueDate === todayKey).length;
  const overdueCount = tasks.filter(
    (task) => !task.done && task.dueDate && task.dueDate < todayKey
  ).length;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        icon="clipboardList"
        badgeClass="bg-brand-yellow/20 text-brand-yellow"
        valueClass="text-brand-yellow"
        labelEn="Total Tasks"
        labelAr="إجمالي المهام"
        value={totalTasks}
        sub={`منها ${sentCount} مُرسلة`}
        neonColor="gold"
      />
      <KpiCard
        icon="alertTriangle"
        badgeClass="bg-brand-red/20 text-brand-red"
        valueClass="text-brand-red"
        labelEn="Urgent"
        labelAr="عاجلة"
        value={urgentCount}
        neonColor="red"
      />
      <KpiCard
        icon="package"
        badgeClass="bg-blue-200 text-blue-700"
        valueClass="text-blue-500"
        labelEn="Today Due"
        labelAr="مستحقة اليوم"
        value={todayCount}
        neonColor="blue"
      />
      <KpiCard
        emoji="⏰"
        badgeClass="bg-red-200 text-red-700"
        valueClass="text-red-400"
        labelEn="Overdue"
        labelAr="متأخرة"
        value={overdueCount}
        neonColor="red"
      />
      <KpiCard
        emoji="✓"
        badgeClass="bg-green-200 text-green-700"
        valueClass="text-green-500"
        labelEn="Done"
        labelAr="منجزة"
        value={doneCount}
        neonColor="green"
      />
    </div>
  );
}
