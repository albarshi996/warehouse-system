import React, { useReducer, useState, useEffect } from 'react';
import { ODOO, APPS, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import { initialState, simReducer } from './simReducer.js';
import OdooNavbar from './OdooNavbar.jsx';
import OdooSidebar from './OdooSidebar.jsx';
import PurchaseApp from './PurchaseApp.jsx';
import InventoryApp from './InventoryApp.jsx';
import AccountingApp from './AccountingApp.jsx';

const ALERT_TONE = {
  error: { borderColor: '#f1aeb5', background: '#fdecee', color: '#b02a37' },
  warn: { borderColor: '#e6d08a', background: '#fdf6e3', color: '#8a6d1b' },
  success: { borderColor: '#bfe3c9', background: '#e9f7ef', color: '#1e7e34' },
};

/* إشعار منبثق — أعلى يسار نافذة المحاكي، بأسلوب Odoo. */
function Toast({ alert, onClose }) {
  const tone = ALERT_TONE[alert.kind] || ALERT_TONE.success;
  return (
    <div
      className="absolute top-3 left-3 z-[70] max-w-sm rounded-lg shadow-lg border px-4 py-3 text-[13px] font-medium flex items-start gap-2"
      style={tone}
    >
      <span className="flex-1 leading-snug">{alert.text}</span>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 leading-none text-base" aria-label="إغلاق">
        ×
      </button>
    </div>
  );
}

/**
 * محاكي Odoo — الجذر. محرّك حالة قائم على reducer يقود المتدرّب عبر الدورة
 * المستندية لِـ Brandzo عبر تطبيقات Odoo المُحاكاة:
 * المشتريات (أمر شراء) → المخزون (استلام + جودة + دفعة/FEFO + تخزين) → المحاسبة.
 * يدعم وضع «ملء الشاشة» لتجربة غامرة 100% كما في Odoo الحقيقي.
 */
export default function OdooSimulator() {
  const [state, dispatch] = useReducer(simReducer, initialState);
  const [isFullscreen, setFullscreen] = useState(false);
  const app = APPS.find((a) => a.id === state.app);

  /* الخروج من ملء الشاشة بمفتاح Escape. */
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const billLabel = state.bill.state === 'draft' ? 'مسودة الفاتورة' : 'BILL/2026/07/0001';
  let breadcrumb = [];
  let sidebarActive = app.activeItem;
  if (state.app === 'purchase') {
    breadcrumb = ['أوامر الشراء', SAMPLE_PO.name];
    sidebarActive = 'po';
  } else if (state.app === 'inventory') {
    if (state.invView === 'receipt') { breadcrumb = ['عمليات الاستلام', RECEIPT_REF]; sidebarActive = 'receipts'; }
    else if (state.invView === 'putaway') { breadcrumb = ['التحويلات الداخلية', 'WH/INT/00001']; sidebarActive = 'internal'; }
    else if (state.invView === 'delivery') { breadcrumb = ['أوامر التسليم', 'WH/OUT/00001']; sidebarActive = 'delivery'; }
    else { breadcrumb = ['عمليات الاستلام']; sidebarActive = 'receipts'; }
  } else if (state.app === 'accounting') {
    breadcrumb = state.acctView === 'form' ? ['فواتير المورّدين', billLabel] : ['فواتير المورّدين'];
    sidebarActive = 'bills';
  }

  const onSelectItem = (key) => {
    if (state.app === 'inventory') {
      if (key === 'receipts') dispatch({ type: 'INV_SHOW_LIST' });
      if (key === 'delivery') dispatch({ type: 'OPEN_DELIVERY' });
      if (key === 'internal') dispatch({ type: 'OPEN_PUTAWAY' });
    }
    if (state.app === 'accounting' && key === 'bills') dispatch({ type: 'ACCT_SHOW_LIST' });
  };

  const shellClass = isFullscreen
    ? 'odoo-sim relative flex flex-col overflow-hidden h-screen w-screen fixed inset-0 z-[100]'
    : 'odoo-sim relative flex flex-col rounded-lg border overflow-hidden shadow-xl h-[calc(100vh-160px)] min-h-[600px]';

  return (
    <div
      dir="rtl"
      className={shellClass}
      style={{
        borderColor: ODOO.border,
        background: ODOO.contentBg,
        fontFamily: "'Cairo','Segoe UI',system-ui,sans-serif",
      }}
    >
      <OdooNavbar
        app={app}
        breadcrumb={breadcrumb}
        onOpenApp={(id) => dispatch({ type: 'OPEN_APP', app: id })}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setFullscreen((v) => !v)}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <OdooSidebar app={app} activeItem={sidebarActive} onSelectItem={onSelectItem} />
        {state.app === 'purchase' && <PurchaseApp state={state} dispatch={dispatch} />}
        {state.app === 'inventory' && <InventoryApp state={state} dispatch={dispatch} />}
        {state.app === 'accounting' && <AccountingApp state={state} dispatch={dispatch} />}
      </div>
      {state.alert && <Toast alert={state.alert} onClose={() => dispatch({ type: 'DISMISS_ALERT' })} />}
    </div>
  );
}
