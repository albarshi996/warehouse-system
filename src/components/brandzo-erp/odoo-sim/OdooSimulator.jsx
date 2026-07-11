import React, { useReducer } from 'react';
import { ODOO, APPS, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import { initialState, simReducer } from './simReducer.js';
import OdooNavbar from './OdooNavbar.jsx';
import OdooSidebar from './OdooSidebar.jsx';
import PurchaseApp from './PurchaseApp.jsx';
import InventoryApp from './InventoryApp.jsx';

const ALERT_TONE = {
  error: { borderColor: '#f1aeb5', background: '#fdecee', color: '#b02a37' },
  warn: { borderColor: '#e6d08a', background: '#fdf6e3', color: '#8a6d1b' },
  success: { borderColor: '#bfe3c9', background: '#e9f7ef', color: '#1e7e34' },
};

/* Notification toast — top-right of the simulator window, Odoo-style. */
function Toast({ alert, onClose }) {
  const tone = ALERT_TONE[alert.kind] || ALERT_TONE.success;
  return (
    <div
      className="absolute top-3 right-3 z-[70] max-w-sm rounded-lg shadow-lg border px-4 py-3 text-[13px] font-medium flex items-start gap-2"
      style={tone}
    >
      <span className="flex-1 leading-snug">{alert.text}</span>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 leading-none text-base" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

/* Placeholder for apps whose screens are built in a later phase. */
function UnderConstruction({ app }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-10" style={{ background: ODOO.contentBg }}>
      <div className="text-5xl mb-4">{app.icon}</div>
      <h2 className="text-xl font-semibold text-gray-700">{app.name}</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed" dir="rtl">
        شاشات تطبيق «{app.name}» (الفواتير والمطابقة الثلاثية والدفع) ستُبنى في المرحلة التالية بنفس دقّة شاشة الاستلام.
        استخدم مبدّل التطبيقات ⊞ في الأعلى للعودة.
      </p>
    </div>
  );
}

/**
 * Odoo Simulator — root. A reducer-driven state engine walks the trainee
 * through the Brandzo document cycle across simulated Odoo apps:
 * Purchase (PO) → Inventory (GRN + QC + Lot/FEFO + Putaway) → Accounting (next).
 */
export default function OdooSimulator() {
  const [state, dispatch] = useReducer(simReducer, initialState);
  const app = APPS.find((a) => a.id === state.app);

  let breadcrumb = [app.activeItem];
  if (state.app === 'purchase') breadcrumb = ['Purchase Orders', SAMPLE_PO.name];
  else if (state.app === 'inventory') breadcrumb = state.invView === 'form' ? ['Receipts', RECEIPT_REF] : ['Receipts'];
  else if (state.app === 'accounting') breadcrumb = ['Bills'];

  const onSelectItem = (item) => {
    if (state.app === 'inventory' && item === 'Receipts') dispatch({ type: 'INV_SHOW_LIST' });
  };

  return (
    <div
      dir="ltr"
      className="odoo-sim relative flex flex-col rounded-lg border overflow-hidden shadow-xl h-[78vh] min-h-[560px]"
      style={{
        borderColor: ODOO.border,
        background: ODOO.contentBg,
        fontFamily: "'Roboto','Segoe UI',system-ui,sans-serif",
      }}
    >
      <OdooNavbar app={app} breadcrumb={breadcrumb} onOpenApp={(id) => dispatch({ type: 'OPEN_APP', app: id })} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <OdooSidebar app={app} activeItem={app.activeItem} onSelectItem={onSelectItem} />
        {state.app === 'purchase' && <PurchaseApp state={state} dispatch={dispatch} />}
        {state.app === 'inventory' && <InventoryApp state={state} dispatch={dispatch} />}
        {state.app === 'accounting' && <UnderConstruction app={app} />}
      </div>
      {state.alert && <Toast alert={state.alert} onClose={() => dispatch({ type: 'DISMISS_ALERT' })} />}
    </div>
  );
}
