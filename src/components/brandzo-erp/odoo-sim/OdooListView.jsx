import React from 'react';
import { ODOO, STATE_BADGE } from './odooTheme.js';

function Badge({ state }) {
  const b = STATE_BADGE[state] || STATE_BADGE.draft;
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: b.color, background: b.bg }}>
      {b.label}
    </span>
  );
}

/**
 * عرض «قائمة» عام في Odoo (شجرة). الأعمدة: [{ key, label, align? }]؛ العمود
 * ذو المفتاح '_status' يعرض شارة الحالة من row.state. الصفوف قابلة للنقر.
 * المحاذاة منطقية (start/end) لتحترم اتجاه RTL.
 */
export default function OdooListView({ columns, rows, onOpenRow, emptyText }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: ODOO.contentBg }}>
      {/* لوحة التحكّم */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b shrink-0" style={{ borderColor: ODOO.border }}>
        <button type="button" className="text-white text-[13px] font-semibold rounded px-3 py-1" style={{ background: ODOO.purple }}>
          جديد
        </button>
        <span className="text-xs text-gray-500 tabular-nums">{rows.length} سجلّ</span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white border rounded shadow-sm overflow-hidden" style={{ borderColor: ODOO.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50" style={{ borderColor: ODOO.border }}>
                {columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-end' : 'text-start'}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">
                    {emptyText || 'لا توجد سجلّات'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpenRow && onOpenRow(r)}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    style={{ borderColor: ODOO.borderSoft }}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-end' : 'text-start'} text-gray-700`}>
                        {c.key === '_status' ? <Badge state={r.state} /> : r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
