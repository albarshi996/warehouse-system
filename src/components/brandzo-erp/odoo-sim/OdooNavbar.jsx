import React, { useState } from 'react';
import { APPS, ODOO } from './odooTheme.js';

/* شعار شبكة التطبيقات 3×3 (أيقونة «مبدّل التطبيقات» في Odoo). */
function AppsGrid() {
  return (
    <span className="grid grid-cols-3 gap-[3px]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="w-[3px] h-[3px] rounded-[1px]" style={{ background: '#8f8f8f' }} />
      ))}
    </span>
  );
}

/* أيقونتا الدخول/الخروج من وضع ملء الشاشة. */
const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
  </svg>
);
const CompressIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6h4V2M14 6h-4V2M2 10h4v4M14 10h-4v4" />
  </svg>
);

/**
 * شريط تطبيقات Odoo العلوي (RTL): مبدّل التطبيقات + اسم التطبيق + مسار التنقّل
 * (يمين)، وأيقونات النظام + قائمة المستخدم + زر ملء الشاشة (يسار). شريط أبيض
 * بارتفاع ~46px وحدّ سفلي.
 */
export default function OdooNavbar({ app, breadcrumb = [], onOpenApp, isFullscreen, onToggleFullscreen }) {
  const [showApps, setShowApps] = useState(false);

  return (
    <div
      className="relative flex items-center justify-between h-[46px] px-3 bg-white border-b select-none shrink-0"
      style={{ borderColor: ODOO.border }}
    >
      {/* يمين: مبدّل التطبيقات + اسم التطبيق + مسار التنقّل */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => setShowApps((v) => !v)}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100"
          aria-label="التطبيقات"
        >
          <AppsGrid />
        </button>
        <span className="font-semibold text-[15px] whitespace-nowrap" style={{ color: ODOO.purple }}>
          {app.name}
        </span>
        <nav className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              <span className="text-gray-300">‹</span>
              <span className={`truncate ${i === breadcrumb.length - 1 ? 'text-gray-800 font-medium' : ''}`}>{b}</span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* يسار: أيقونات النظام + المستخدم + ملء الشاشة */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-gray-400 text-sm hidden sm:inline" title="الأنشطة">🔔</span>
        <span className="text-gray-400 text-sm hidden sm:inline" title="الرسائل">💬</span>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: ODOO.purple }}
          >
            م ب
          </span>
          <span className="text-sm text-gray-700 hidden md:inline">محمد</span>
          <span className="text-gray-400 text-xs">▾</span>
        </div>
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center justify-center w-8 h-8 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
            aria-label={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
          >
            {isFullscreen ? <CompressIcon /> : <ExpandIcon />}
          </button>
        )}
      </div>

      {/* قائمة مبدّل التطبيقات المنسدلة */}
      {showApps && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowApps(false)} />
          <div
            className="absolute z-50 top-[48px] right-3 bg-white border rounded-lg shadow-xl p-3 grid grid-cols-3 gap-2 w-[300px]"
            style={{ borderColor: ODOO.border }}
          >
            {APPS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onOpenApp(a.id);
                  setShowApps(false);
                }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded transition-colors ${
                  a.id === app.id ? '' : 'hover:bg-gray-50'
                }`}
                style={a.id === app.id ? { background: ODOO.purpleSoft } : {}}
              >
                <span className="text-2xl leading-none">{a.icon}</span>
                <span className="text-xs font-medium text-gray-700">{a.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
