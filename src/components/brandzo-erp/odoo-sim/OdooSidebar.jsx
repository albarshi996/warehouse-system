import React from 'react';
import { ODOO } from './odooTheme.js';

/**
 * Odoo left Sidebar — module-specific navigation. Renders the active app's
 * grouped menu (Orders / Products / Reporting / Configuration …); the active
 * item is highlighted in Odoo purple. Hidden on mobile (Odoo collapses it too).
 */
export default function OdooSidebar({ app, activeItem, onSelectItem }) {
  const current = activeItem || app.activeItem;
  return (
    <aside
      className="w-[220px] shrink-0 bg-white border-r overflow-y-auto hidden md:block"
      style={{ borderColor: ODOO.border }}
    >
      <div className="py-2">
        {app.menu.map((sec) => (
          <div key={sec.section} className="mb-2">
            <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {sec.section}
            </div>
            <ul>
              {sec.items.map((item) => {
                const active = item === current;
                return (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => onSelectItem && onSelectItem(item)}
                      className="w-full text-left px-4 py-1.5 text-[13px] hover:bg-gray-50 transition-colors"
                      style={
                        active
                          ? { color: ODOO.purple, background: ODOO.purpleSoft, fontWeight: 600 }
                          : { color: '#4b5563' }
                      }
                    >
                      {item}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
