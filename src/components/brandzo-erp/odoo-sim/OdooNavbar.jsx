import React, { useState } from 'react';
import { APPS, ODOO } from './odooTheme.js';

/* 3×3 apps-grid glyph (the Odoo "app switcher" icon). */
function AppsGrid() {
  return (
    <span className="grid grid-cols-3 gap-[3px]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="w-[3px] h-[3px] rounded-[1px]" style={{ background: '#8f8f8f' }} />
      ))}
    </span>
  );
}

/**
 * Odoo top App Navbar: app switcher + current app name + breadcrumb (left),
 * systray icons + user menu (right). White bar, ~46px, bottom border.
 */
export default function OdooNavbar({ app, breadcrumb = [], onOpenApp }) {
  const [showApps, setShowApps] = useState(false);

  return (
    <div
      className="relative flex items-center justify-between h-[46px] px-3 bg-white border-b select-none shrink-0"
      style={{ borderColor: ODOO.border }}
    >
      {/* left: apps + app name + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => setShowApps((v) => !v)}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100"
          aria-label="Apps"
        >
          <AppsGrid />
        </button>
        <span className="font-semibold text-[15px] whitespace-nowrap" style={{ color: ODOO.purple }}>
          {app.name}
        </span>
        <nav className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              <span className="text-gray-300">›</span>
              <span className={`truncate ${i === breadcrumb.length - 1 ? 'text-gray-800 font-medium' : ''}`}>{b}</span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* right: systray + user */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-gray-400 text-sm hidden sm:inline" title="Activities">🔔</span>
        <span className="text-gray-400 text-sm hidden sm:inline" title="Messages">💬</span>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: ODOO.purple }}
          >
            MB
          </span>
          <span className="text-sm text-gray-700 hidden md:inline">Mohammed</span>
          <span className="text-gray-400 text-xs">▾</span>
        </div>
      </div>

      {/* app switcher dropdown */}
      {showApps && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowApps(false)} />
          <div
            className="absolute z-50 top-[48px] left-3 bg-white border rounded-lg shadow-xl p-3 grid grid-cols-3 gap-2 w-[300px]"
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
