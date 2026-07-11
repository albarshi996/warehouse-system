import React from 'react';
import { ODOO, SAMPLE_PO, fmt } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

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

/** Purchase app — the RFQ / Purchase Order form. */
export default function PurchaseApp({ state, dispatch }) {
  const po = SAMPLE_PO;
  const confirmed = state.po.state === 'purchase';
  const untaxed = po.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  const stages = [
    { key: 'draft', label: 'RFQ' },
    { key: 'sent', label: 'RFQ Sent' },
    { key: 'purchase', label: 'Purchase Order' },
  ];
  const current = confirmed ? 'purchase' : 'draft';

  const actions = confirmed
    ? [
        { label: 'Receive Products', primary: true, onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) },
        { label: 'Create Bill', onClick: () => dispatch({ type: 'CREATE_BILL' }) },
        { label: 'Cancel', onClick: () => dispatch({ type: 'RESET_PO' }) },
      ]
    : [
        { label: 'Confirm Order', primary: true, onClick: () => dispatch({ type: 'CONFIRM_PO' }) },
        { label: 'Send by Email', onClick: () => {} },
        { label: 'Cancel', onClick: () => {} },
      ];

  const smartButtons = confirmed
    ? [{ icon: '📦', value: '1', label: 'Receipt', onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) }]
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

  return (
    <OdooFormView
      statusbar={{ stages, current }}
      actions={actions}
      smartButtons={smartButtons}
      title={po.name}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
