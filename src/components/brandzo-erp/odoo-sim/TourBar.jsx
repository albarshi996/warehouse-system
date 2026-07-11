import React, { useState } from 'react';
import { ODOO } from './odooTheme.js';
import { cycleProgress, nextMission } from './simReducer.js';

/**
 * شريط الجولة الموجَّهة — أسفل نافذة المحاكي.
 * يعرض المهمة الحالية خطوة بخطوة (ماذا أفعل الآن؟) + تقدّم المراحل الـ12
 * + عدّاد المخالفات المحجوبة + زر إعادة التشغيل. قابل للطيّ.
 */
export default function TourBar({ state, dispatch }) {
  const [collapsed, setCollapsed] = useState(false);
  const progress = cycleProgress(state);
  const mission = nextMission(state);
  const doneCount = progress.filter((p) => p.done).length;

  return (
    <div className="shrink-0 border-t bg-white select-none" style={{ borderColor: ODOO.border }}>
      {/* السطر الرئيسي */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 shrink-0"
          title={collapsed ? 'إظهار الجولة الموجَّهة' : 'طيّ الشريط'}
          aria-label={collapsed ? 'إظهار الجولة الموجَّهة' : 'طيّ الشريط'}
        >
          {collapsed ? '▴' : '▾'}
        </button>

        {mission ? (
          <>
            <span
              className="text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap shrink-0 text-white"
              style={{ background: ODOO.purple }}
            >
              المرحلة {mission.num} / 12
            </span>
            <span className="text-[12px] font-bold text-gray-800 whitespace-nowrap shrink-0 hidden sm:inline">
              {mission.title}
            </span>
            {!collapsed && (
              <span className="text-[12px] text-gray-600 leading-snug flex-1 min-w-0 truncate" title={mission.text}>
                👉 {mission.text}
              </span>
            )}
          </>
        ) : (
          <span className="text-[12px] font-bold flex-1" style={{ color: ODOO.green }}>
            🏆 اكتملت الدورة المستندية كاملة — أحسنت!
          </span>
        )}

        <div className="flex items-center gap-3 shrink-0 me-auto">
          {/* تقدّم المراحل */}
          <div className="hidden md:flex items-center gap-1" title={`${doneCount} / 12 مرحلة مكتملة`}>
            {progress.map((p) => (
              <span
                key={p.num}
                title={`${p.num} — ${p.title}${p.done ? ' ✓' : ''}`}
                className="w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-[8px] font-bold"
                style={p.done ? { background: '#28a745', color: '#fff' } : { background: '#e7e7e7', color: '#9a9a9a' }}
              >
                {p.done ? '✓' : ''}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">{doneCount}/12</span>
          <span
            className="text-[11px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap"
            style={state.stats.violations ? { color: '#b02a37', background: '#fdecee' } : { color: '#1e7e34', background: '#e9f7ef' }}
            title="محاولات مخالفة القواعد التي حجبها النظام"
          >
            🔒 {state.stats.violations}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET_CYCLE' })}
            className="text-[11px] font-semibold rounded px-2 py-1 border text-gray-600 hover:bg-gray-50"
            style={{ borderColor: ODOO.border }}
            title="إعادة الجولة من البداية"
          >
            ⟳ إعادة
          </button>
        </div>
      </div>
    </div>
  );
}

/** شاشة الإنجاز — تظهر عند إغلاق الفترة المالية (المرحلة 12). */
export function CompletionModal({ state, dispatch }) {
  const progress = cycleProgress(state);
  const doneCount = progress.filter((p) => p.done).length;
  const v = state.stats.violations;
  const score = Math.max(0, 100 - v * 5);
  const grade = score >= 90 ? 'ممتاز 🌟' : score >= 75 ? 'جيد جداً 👍' : score >= 60 ? 'جيد' : 'بحاجة لإعادة التدريب';

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-center">
        <div className="py-6 px-6" style={{ background: ODOO.purpleSoft }}>
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-xl font-bold" style={{ color: ODOO.purple }}>أنجزت الدورة المستندية كاملة!</h2>
          <p className="text-[12px] text-gray-600 mt-1">من طلب الشراء حتى الإغلاق المالي — كما في Odoo تماماً.</p>
        </div>
        <div className="p-6 grid grid-cols-3 gap-3 text-[13px]">
          <div className="rounded-lg border p-3" style={{ borderColor: ODOO.border }}>
            <div className="text-2xl font-bold" style={{ color: ODOO.green }}>{doneCount}/12</div>
            <div className="text-[11px] text-gray-500">مرحلة مكتملة</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: ODOO.border }}>
            <div className="text-2xl font-bold" style={{ color: v ? '#b02a37' : ODOO.green }}>{v}</div>
            <div className="text-[11px] text-gray-500">مخالفة محجوبة</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: ODOO.border }}>
            <div className="text-2xl font-bold" style={{ color: ODOO.purple }}>{score}%</div>
            <div className="text-[11px] text-gray-500">{grade}</div>
          </div>
        </div>
        <div className="px-6 pb-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET_CYCLE' })}
            className="text-white text-[13px] font-semibold rounded px-4 py-2"
            style={{ background: ODOO.purple }}
          >
            ⟳ إعادة الجولة
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_COMPLETION' })}
            className="text-[13px] text-gray-600 rounded px-4 py-2 border"
            style={{ borderColor: ODOO.border }}
          >
            متابعة الاستكشاف
          </button>
        </div>
      </div>
    </div>
  );
}
