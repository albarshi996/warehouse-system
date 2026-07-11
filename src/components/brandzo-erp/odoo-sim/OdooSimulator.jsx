import React, { useReducer, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ODOO, APPS, SAMPLE_PO, RECEIPT_REF, PR_REF, GP_REF, RET_REF, CN_REF, CC_REF, ADJ_REF } from './odooTheme.js';
import { initialState, simReducer } from './simReducer.js';
import OdooNavbar from './OdooNavbar.jsx';
import OdooSidebar from './OdooSidebar.jsx';
import PurchaseApp from './PurchaseApp.jsx';
import InventoryApp from './InventoryApp.jsx';
import AccountingApp from './AccountingApp.jsx';
import TourBar, { CompletionModal } from './TourBar.jsx';

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
 * المستندية الكاملة (12 مرحلة) بجولة موجَّهة: المشتريات ← المخزون (استلام/جودة/
 * تخزين/FEFO/بوابة/مرتجعات/جرد/تسويات) ← المحاسبة (مطابقة/دفع/إغلاق).
 *
 * ملء الشاشة: يعتمد أولاً على Fullscreen API الأصلي للمتصفح (يغطّي الشاشة
 * كلها فوق أي عنصر في الموقع)؛ وإن رفضه المتصفح، يسقط إلى طبقة portal مثبّتة
 * على <body> — فلا يمكن لأي قائمة جانبية أن تتداخل معه في الحالتين.
 */
export default function OdooSimulator() {
  const [state, dispatch] = useReducer(simReducer, initialState);
  const [fsMode, setFsMode] = useState(null); // null | 'native' | 'overlay'
  const shellRef = useRef(null);
  const app = APPS.find((a) => a.id === state.app);

  /* مزامنة حالة ملء الشاشة الأصلي (زر المتصفح أو Escape يخرجان تلقائياً). */
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFsMode((m) => (m === 'native' ? null : m));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  /* الخروج من وضع الطبقة البديلة بمفتاح Escape. */
  useEffect(() => {
    if (fsMode !== 'overlay') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFsMode(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fsMode]);

  const toggleFullscreen = () => {
    if (fsMode === 'native') {
      if (document.fullscreenElement) document.exitFullscreen();
      setFsMode(null);
      return;
    }
    if (fsMode === 'overlay') {
      setFsMode(null);
      return;
    }
    const el = shellRef.current;
    if (el && el.requestFullscreen) {
      el.requestFullscreen().then(() => setFsMode('native')).catch(() => setFsMode('overlay'));
    } else {
      setFsMode('overlay');
    }
  };

  /* مسار التنقّل + العنصر النشط في القائمة الجانبية لكل شاشة. */
  const billLabel = state.bill.state === 'draft' ? 'مسودة الفاتورة' : 'BILL/2026/07/0001';
  let breadcrumb = [];
  let sidebarActive = app.activeItem;
  if (state.app === 'purchase') {
    if (state.purchView === 'pr') { breadcrumb = ['طلبات الشراء الداخلية', PR_REF]; sidebarActive = 'requisitions'; }
    else { breadcrumb = ['أوامر الشراء', SAMPLE_PO.name]; sidebarActive = 'po'; }
  } else if (state.app === 'inventory') {
    if (state.invView === 'receipt') { breadcrumb = ['عمليات الاستلام', RECEIPT_REF]; sidebarActive = 'receipts'; }
    else if (state.invView === 'putaway') { breadcrumb = ['التحويلات الداخلية', 'WH/INT/00001']; sidebarActive = 'internal'; }
    else if (state.invView === 'delivery') { breadcrumb = ['أوامر التسليم', 'WH/OUT/00001']; sidebarActive = 'delivery'; }
    else if (state.invView === 'gatepass') { breadcrumb = ['تصاريح البوابة', GP_REF]; sidebarActive = 'gatepass'; }
    else if (state.invView === 'return') { breadcrumb = ['المرتجعات', RET_REF]; sidebarActive = 'returns'; }
    else if (state.invView === 'cyclecount') { breadcrumb = ['الجرد الدوري', CC_REF]; sidebarActive = 'physical'; }
    else if (state.invView === 'adjustment') { breadcrumb = ['تسويات المخزون', ADJ_REF]; sidebarActive = 'adjust'; }
    else { breadcrumb = ['عمليات الاستلام']; sidebarActive = 'receipts'; }
  } else if (state.app === 'accounting') {
    if (state.acctView === 'form') { breadcrumb = ['فواتير المورّدين', billLabel]; sidebarActive = 'bills'; }
    else if (state.acctView === 'refund') { breadcrumb = ['الإشعارات الدائنة', CN_REF]; sidebarActive = 'refunds'; }
    else if (state.acctView === 'close') { breadcrumb = ['الإغلاق المالي', 'يوليو 2026']; sidebarActive = 'close'; }
    else { breadcrumb = ['فواتير المورّدين']; sidebarActive = 'bills'; }
  }

  const onSelectItem = (key) => {
    if (state.app === 'purchase') {
      if (key === 'requisitions') dispatch({ type: 'PURCH_VIEW', view: 'pr' });
      if (key === 'po' || key === 'rfq') dispatch({ type: 'PURCH_VIEW', view: 'po' });
    }
    if (state.app === 'inventory') {
      if (key === 'receipts') dispatch({ type: 'INV_SHOW_LIST' });
      if (key === 'delivery') dispatch({ type: 'OPEN_DELIVERY' });
      if (key === 'internal') dispatch({ type: 'OPEN_PUTAWAY' });
      if (key === 'gatepass') dispatch({ type: 'OPEN_GATEPASS' });
      if (key === 'returns') dispatch({ type: 'OPEN_RETURN' });
      if (key === 'physical') dispatch({ type: 'OPEN_CYCLECOUNT' });
      if (key === 'adjust') dispatch({ type: 'OPEN_ADJUSTMENT' });
    }
    if (state.app === 'accounting') {
      if (key === 'bills') dispatch({ type: 'ACCT_SHOW_LIST' });
      if (key === 'refunds') dispatch({ type: 'OPEN_REFUND' });
      if (key === 'close') dispatch({ type: 'OPEN_CLOSE' });
    }
  };

  const isFs = fsMode !== null;
  const shellClass = isFs
    ? 'odoo-sim relative flex flex-col overflow-hidden h-full w-full bg-white'
    : 'odoo-sim relative flex flex-col rounded-lg border overflow-hidden shadow-xl h-[calc(100vh-150px)] min-h-[600px]';

  const showCompletion = state.close.state === 'closed' && !state.completionDismissed;

  const shell = (
    <div
      dir="rtl"
      ref={shellRef}
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
        isFullscreen={isFs}
        onToggleFullscreen={toggleFullscreen}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <OdooSidebar app={app} activeItem={sidebarActive} onSelectItem={onSelectItem} />
        {state.app === 'purchase' && <PurchaseApp state={state} dispatch={dispatch} />}
        {state.app === 'inventory' && <InventoryApp state={state} dispatch={dispatch} />}
        {state.app === 'accounting' && <AccountingApp state={state} dispatch={dispatch} />}
      </div>
      <TourBar state={state} dispatch={dispatch} />
      {state.alert && <Toast alert={state.alert} onClose={() => dispatch({ type: 'DISMISS_ALERT' })} />}
      {showCompletion && <CompletionModal state={state} dispatch={dispatch} />}
    </div>
  );

  /* وضع الطبقة البديلة: تثبيت فوق كامل الصفحة عبر portal على <body>. */
  if (fsMode === 'overlay') {
    return createPortal(
      <div className="fixed inset-0 z-[9999]" style={{ background: '#000' }}>
        {shell}
      </div>,
      document.body
    );
  }
  return shell;
}
