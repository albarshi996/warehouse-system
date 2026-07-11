import React from 'react';
import { ODOO } from './odooTheme.js';

/**
 * Generic Odoo modal / wizard dialog — scoped to the simulator window
 * (absolute over the .odoo-sim root, which is position:relative).
 */
export default function OdooWizard({ title, onClose, children, footer }) {
  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden"
        style={{ border: `1px solid ${ODOO.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: ODOO.border }}>
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && (
          <div className="flex items-center gap-2 px-4 py-3 border-t bg-gray-50" style={{ borderColor: ODOO.border }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
