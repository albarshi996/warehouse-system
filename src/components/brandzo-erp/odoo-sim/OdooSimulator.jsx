import React, { useState } from 'react';
import { ODOO, APPS, SAMPLE_PO } from './odooTheme.js';
import OdooNavbar from './OdooNavbar.jsx';
import OdooSidebar from './OdooSidebar.jsx';
import OdooFormView from './OdooFormView.jsx';

const fmt = (n) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;

/* Placeholder for apps whose screens are built in the next phase. */
function UnderConstruction({ app }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-10" style={{ background: ODOO.contentBg }}>
      <div className="text-5xl mb-4">{app.icon}</div>
      <h2 className="text-xl font-semibold text-gray-700">{app.name}</h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed" dir="rtl">
        شاشات تطبيق «{app.name}» (القوائم والاستلامات والفواتير) ستُبنى في المرحلة التالية بنفس دقّة شاشة أمر الشراء.
        استخدم مبدّل التطبيقات ⊞ في الأعلى للعودة إلى Purchase.
      </p>
    </div>
  );
}

/* Order-lines tree (inside the notebook's first tab). */
function OrderLines({ lines, untaxed, tax, total }) {
  return (
    <div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
            <th className="py-2 text-left font-medium">Product</th>
            <th className="py-2 text-right font-medium">Quantity</th>
            <th className="py-2 text-right font-medium">Unit Price</th>
            <th className="py-2 text-right font-medium">Taxes</th>
            <th className="py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{l.product}</td>
              <td className="py-2 text-right text-gray-700 whitespace-nowrap">{l.qty.toLocaleString('en-US')} {l.uom}</td>
              <td className="py-2 text-right text-gray-700 whitespace-nowrap">{fmt(l.price)}</td>
              <td className="py-2 text-right text-gray-700">{l.tax}</td>
              <td className="py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(l.qty * l.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end mt-4">
        <div className="w-64 space-y-1 text-[13px]">
          <div className="flex justify-between text-gray-500"><span>Untaxed Amount</span><span>{fmt(untaxed)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Taxes (15%)</span><span>{fmt(tax)}</span></div>
          <div className="flex justify-between text-gray-900 font-bold text-base border-t pt-1" style={{ borderColor: ODOO.border }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OtherInfo({ po }) {
  const rows = [
    ['Buyer', po.buyer],
    ['Company', po.company],
    ['Payment Terms', po.paymentTerms],
    ['Receipt Date', po.receiptDate],
    ['Source Document', po.vendorRef],
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3 py-1 text-[13px]">
          <span className="w-36 shrink-0" style={{ color: ODOO.muted }}>{k}</span>
          <span className="font-semibold text-gray-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Odoo Simulator — root. Holds the active-app and the Purchase-Order state.
 * Confirming the RFQ dynamically advances the status bar and reveals the
 * "Receipt" smart button, exactly like the real ERP — the first slice of the
 * Brandzo document-cycle state machine.
 */
export default function OdooSimulator() {
  const [activeAppId, setActiveAppId] = useState('purchase');
  const [poState, setPoState] = useState('draft'); // 'draft' (RFQ) | 'purchase' (confirmed)
  const app = APPS.find((a) => a.id === activeAppId);

  const po = SAMPLE_PO;
  const untaxed = po.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  const stages = [
    { key: 'draft', label: 'RFQ' },
    { key: 'sent', label: 'RFQ Sent' },
    { key: 'purchase', label: 'Purchase Order' },
  ];
  const current = poState === 'draft' ? 'draft' : 'purchase';

  const actions =
    poState === 'draft'
      ? [
          { label: 'Confirm Order', primary: true, onClick: () => setPoState('purchase') },
          { label: 'Send by Email', onClick: () => {} },
          { label: 'Cancel', onClick: () => {} },
        ]
      : [
          { label: 'Receive Products', primary: true, onClick: () => setActiveAppId('inventory') },
          { label: 'Create Bill', onClick: () => setActiveAppId('accounting') },
          { label: 'Cancel', onClick: () => setPoState('draft') },
        ];

  const smartButtons =
    poState === 'purchase'
      ? [{ icon: '📦', value: '1', label: 'Receipt', onClick: () => setActiveAppId('inventory') }]
      : [];

  const fieldColumns = [
    [
      { label: 'Vendor', value: po.vendor },
      { label: 'Vendor Reference', value: po.vendorRef },
      { label: 'Blanket Order', value: '—' },
    ],
    [
      { label: 'Order Deadline', value: po.orderDeadline },
      { label: 'Expected Arrival', value: po.receiptDate },
      { label: 'Currency', value: po.currency },
    ],
  ];

  const notebook = [
    { name: 'Order Lines', content: <OrderLines lines={po.lines} untaxed={untaxed} tax={tax} total={total} /> },
    { name: 'Other Info', content: <OtherInfo po={po} /> },
  ];

  const breadcrumb = activeAppId === 'purchase' ? [app.activeItem, po.name] : [app.activeItem];

  return (
    <div
      dir="ltr"
      className="odoo-sim flex flex-col rounded-lg border overflow-hidden shadow-xl h-[78vh] min-h-[560px]"
      style={{
        borderColor: ODOO.border,
        background: ODOO.contentBg,
        fontFamily: "'Roboto','Segoe UI',system-ui,sans-serif",
      }}
    >
      <OdooNavbar app={app} breadcrumb={breadcrumb} onOpenApp={setActiveAppId} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <OdooSidebar app={app} />
        {activeAppId === 'purchase' ? (
          <OdooFormView
            statusbar={{ stages, current }}
            actions={actions}
            smartButtons={smartButtons}
            title={po.name}
            fieldColumns={fieldColumns}
            notebook={notebook}
          />
        ) : (
          <UnderConstruction app={app} />
        )}
      </div>
    </div>
  );
}
