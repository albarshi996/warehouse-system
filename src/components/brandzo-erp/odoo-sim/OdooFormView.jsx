import React, { useState } from 'react';
import { ODOO } from './odooTheme.js';

/* ── شعارات مبدّل العرض (قائمة / كانبان / نموذج) ─────────────────────────── */
const ICONS = {
  list: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="5.5" y1="4" x2="14" y2="4" /><line x1="5.5" y1="8" x2="14" y2="8" /><line x1="5.5" y1="12" x2="14" y2="12" />
      <circle cx="2.5" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  kanban: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="2" width="4" height="9" rx="1" /><rect x="6" y="2" width="4" height="12" rx="1" /><rect x="11" y="2" width="4" height="6" rx="1" />
    </svg>
  ),
  form: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="2" width="12" height="12" rx="1.5" /><line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="9" x2="9" y2="9" />
    </svg>
  ),
};

function ViewSwitcher() {
  const btn = 'w-7 h-7 flex items-center justify-center rounded transition-colors';
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={`${btn} text-gray-400 hover:bg-gray-100`} title="قائمة">{ICONS.list}</button>
      <button type="button" className={`${btn} text-gray-400 hover:bg-gray-100`} title="كانبان">{ICONS.kanban}</button>
      <button type="button" className={btn} title="نموذج" style={{ background: ODOO.purple, color: '#fff' }}>{ICONS.form}</button>
    </div>
  );
}

/* ── شريط الحالة: تقدّم على هيئة شيفرونات (يسار رأس النموذج، يشير يساراً RTL) ── */
function StatusBar({ stages, current }) {
  const curIdx = Math.max(0, stages.findIndex((s) => s.key === current));
  return (
    <div className="flex items-stretch text-[11px] font-semibold">
      {stages.map((s, i) => {
        const active = i === curIdx;
        const clip =
          i === 0
            ? 'polygon(100% 0, 10px 0, 0 50%, 10px 100%, 100% 100%)'
            : 'polygon(100% 0, 10px 0, 0 50%, 10px 100%, 100% 100%, calc(100% - 10px) 50%)';
        return (
          <div
            key={s.key}
            className="flex items-center whitespace-nowrap py-1.5"
            style={{
              clipPath: clip,
              WebkitClipPath: clip,
              marginRight: i === 0 ? 0 : -6,
              paddingRight: i === 0 ? 12 : 18,
              paddingLeft: 14,
              background: active ? ODOO.purple : '#e7e7e7',
              color: active ? '#fff' : '#8a8a8a',
            }}
          >
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

/* ── الأزرار الذكية: صناديق إحصائية أعلى الورقة ───────────────────────────── */
function SmartButtons({ buttons }) {
  if (!buttons.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2 mb-4">
      {buttons.map((b, i) => (
        <button
          type="button"
          key={i}
          onClick={b.onClick}
          className="flex items-center gap-2 border rounded px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
          style={{ borderColor: ODOO.border }}
        >
          <span className="text-lg leading-none">{b.icon}</span>
          <span className="text-right leading-tight">
            <span className="block text-sm font-bold" style={{ color: ODOO.purple }}>{b.value}</span>
            <span className="block text-[11px] text-gray-500">{b.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── الدفتر: أقسام مبوّبة داخل الورقة ──────────────────────────────────────── */
function Notebook({ tabs }) {
  const [active, setActive] = useState(0);
  if (!tabs.length) return null;
  return (
    <div className="mt-8">
      <div className="flex gap-5 border-b" style={{ borderColor: ODOO.border }}>
        {tabs.map((t, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setActive(i)}
            className="pb-2 -mb-px text-[13px] font-semibold border-b-2 transition-colors"
            style={i === active ? { borderColor: ODOO.purple, color: ODOO.purple } : { borderColor: 'transparent', color: '#8a8a8a' }}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs[active].content}</div>
    </div>
  );
}

/**
 * غلاف «عرض النموذج» العام في Odoo. الخصائص:
 *   statusbar    : { stages:[{key,label}], current }
 *   actions      : [{ label, primary?, onClick }]  → أزرار الرأس
 *   smartButtons : [{ icon, value, label, onClick }]
 *   title        : عنوان السجل (كبير خفيف)
 *   fieldColumns : [[{label,value}], [{label,value}]]  → مجموعتا حقول
 *   notebook     : [{ name, content }]
 */
export default function OdooFormView({
  statusbar,
  actions = [],
  smartButtons = [],
  title,
  banner = null,
  fieldColumns = [],
  notebook = [],
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: ODOO.contentBg }}>
      {/* لوحة التحكّم */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b shrink-0" style={{ borderColor: ODOO.border }}>
        <button type="button" className="text-white text-[13px] font-semibold rounded px-3 py-1" style={{ background: ODOO.purple }}>
          جديد
        </button>
        <div className="flex items-center gap-3 text-gray-500">
          <span className="text-xs tabular-nums">1 / 1</span>
          <ViewSwitcher />
        </div>
      </div>

      {/* رأس النموذج: أزرار الإجراءات (يمين) + شيفرونات الحالة (يسار) */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white border-b flex-wrap shrink-0" style={{ borderColor: ODOO.border }}>
        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((a, i) => (
            <button
              type="button"
              key={i}
              onClick={a.onClick}
              className="text-[13px] font-semibold rounded px-3 py-1.5 border transition-colors"
              style={
                a.primary
                  ? { background: ODOO.purple, color: '#fff', borderColor: ODOO.purple }
                  : { background: '#fff', color: '#4b5563', borderColor: ODOO.border }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
        {statusbar && <StatusBar stages={statusbar.stages} current={statusbar.current} />}
      </div>

      {/* الورقة */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto bg-white border rounded shadow-sm w-full max-w-4xl p-6 sm:p-8" style={{ borderColor: ODOO.border }}>
          <SmartButtons buttons={smartButtons} />
          <h1 className="text-[26px] font-light text-gray-800 leading-tight mb-6">{title}</h1>
          {banner}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
            {fieldColumns.map((col, ci) => (
              <div key={ci} className="space-y-1">
                {col.map((f, fi) => (
                  <div key={fi} className="flex gap-3 py-1 text-[13px]">
                    <span className="w-36 shrink-0" style={{ color: ODOO.muted }}>{f.label}</span>
                    <span className="font-semibold text-gray-800">{f.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <Notebook tabs={notebook} />
        </div>
      </div>
    </div>
  );
}
