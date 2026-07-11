import React from 'react';
import { ODOO } from './odooTheme.js';

/**
 * القائمة الجانبية اليمنى في Odoo (RTL) — تنقّل خاص بالتطبيق النشط. تعرض قائمة
 * التطبيق مُجمّعة (الطلبات / المنتجات / التقارير / الإعدادات …)، والعنصر النشط
 * مُميّز ببنفسجي Odoo. تُخفى على الجوال (كما يطويها Odoo نفسه).
 *
 * كل عنصر { key, label }: المفتاح هوية التنقّل، و label النص العربي المعروض.
 */
export default function OdooSidebar({ app, activeItem, onSelectItem }) {
  const current = activeItem || app.activeItem;
  return (
    <aside
      className="w-[220px] shrink-0 bg-white border-l overflow-y-auto hidden md:block"
      style={{ borderColor: ODOO.border }}
    >
      <div className="py-2">
        {app.menu.map((sec) => (
          <div key={sec.section} className="mb-2">
            <div className="px-4 py-1.5 text-[11px] font-bold tracking-wide text-gray-400">
              {sec.section}
            </div>
            <ul>
              {sec.items.map((item) => {
                const active = item.key === current;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onSelectItem && onSelectItem(item.key)}
                      className="w-full text-right px-4 py-1.5 text-[13px] hover:bg-gray-50 transition-colors"
                      style={
                        active
                          ? { color: ODOO.purple, background: ODOO.purpleSoft, fontWeight: 600 }
                          : { color: '#4b5563' }
                      }
                    >
                      {item.label}
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
