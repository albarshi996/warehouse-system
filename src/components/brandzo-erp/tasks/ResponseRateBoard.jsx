import React from 'react';
import Icon from '../../ui/Icon.jsx';
import { computeResponseMetrics } from '../../../services/tasks/taskMetrics.js';
import { normalizeForMetrics } from '../../../services/tasks/tasksCloudService.js';

const hrs = (v) => (v == null ? '—' : `${v} س`);

/** لون النسبة: أخضر جيّد · كهرمانيّ متوسّط · أحمر ضعيف (الأحمر للحالة الحرجة فقط). */
function rateClass(p) {
  if (p >= 80) return 'text-green-600';
  if (p >= 50) return 'text-amber-600';
  return 'text-brand-red';
}

function SummaryCard({ icon, label, value, sub, valueClass }) {
  return (
    <div className="rounded-xl border border-line bg-chip p-4 text-right">
      <div className="flex items-center justify-between mb-2">
        <span className="p-1.5 rounded-lg bg-brand-yellow/15 text-brand-yellow">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass || 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

/**
 * لوحة معدّل الاستجابة (للمديرين): ملخّص عامّ + جدولٌ لكل مُسنَدٍ إليه —
 * معدّل الاستجابة والإنجاز والالتزام بالموعد ومتوسّطا زمن الاطّلاع والإنجاز.
 */
export default function ResponseRateBoard({ tasks }) {
  const { overall, perUser } = computeResponseMetrics(normalizeForMetrics(tasks));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="gauge" size={20} className="text-brand-yellow" />
        <h2 className="text-lg font-bold text-ink">معدّل الاستجابة والأداء</h2>
      </div>

      {/* ملخّص عامّ */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="clipboardList" label="مهام نشطة" value={overall.active}
          sub={`${overall.done} منجَزة · ${overall.open} مفتوحة`} />
        <SummaryCard icon="activity" label="معدّل الاستجابة" value={`${overall.responseRate}%`}
          valueClass={rateClass(overall.responseRate)} sub={`${overall.responded} استجابت`} />
        <SummaryCard icon="checkCircle" label="معدّل الإنجاز" value={`${overall.completionRate}%`}
          valueClass={rateClass(overall.completionRate)} sub={`${overall.onTimeRate}% في الموعد`} />
        <SummaryCard icon="alertTriangle" label="متأخّرة الآن" value={overall.overdue}
          valueClass={overall.overdue > 0 ? 'text-brand-red' : 'text-ink'} />
      </div>

      {/* جدول لكل مستخدم */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="bg-chip text-ink-2 text-xs">
              <th className="px-3 py-2 font-bold">المستخدم</th>
              <th className="px-3 py-2 font-bold">مُسنَدة</th>
              <th className="px-3 py-2 font-bold">منجَزة</th>
              <th className="px-3 py-2 font-bold">الاستجابة</th>
              <th className="px-3 py-2 font-bold">الإنجاز</th>
              <th className="px-3 py-2 font-bold">في الموعد</th>
              <th className="px-3 py-2 font-bold">م. الاطّلاع</th>
              <th className="px-3 py-2 font-bold">م. الإنجاز</th>
              <th className="px-3 py-2 font-bold">متأخّرة</th>
            </tr>
          </thead>
          <tbody>
            {perUser.map((u) => (
              <tr key={u.assigneeUid} className="border-t border-line">
                <td className="px-3 py-2 font-medium text-ink">{u.assigneeName}</td>
                <td className="px-3 py-2 text-ink-2">{u.active}</td>
                <td className="px-3 py-2 text-ink-2">{u.done}</td>
                <td className={`px-3 py-2 font-bold ${rateClass(u.responseRate)}`}>{u.responseRate}%</td>
                <td className={`px-3 py-2 font-bold ${rateClass(u.completionRate)}`}>{u.completionRate}%</td>
                <td className="px-3 py-2 text-ink-2">{u.onTimeRate}%</td>
                <td className="px-3 py-2 text-ink-2" dir="ltr">{hrs(u.avgAckHours)}</td>
                <td className="px-3 py-2 text-ink-2" dir="ltr">{hrs(u.avgDoneHours)}</td>
                <td className={`px-3 py-2 font-bold ${u.overdue > 0 ? 'text-brand-red' : 'text-ink-2'}`}>{u.overdue}</td>
              </tr>
            ))}
            {perUser.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-ink-2 italic">لا مهام مُسنَدة بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
