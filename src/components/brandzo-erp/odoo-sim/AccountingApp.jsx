import React from 'react';
import { ODOO, SAMPLE_PO, fmt } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';
import OdooListView from './OdooListView.jsx';
import OdooWizard from './OdooWizard.jsx';

const LINE = SAMPLE_PO.lines[0];
const PO_QTY = LINE.qty;
const BILL_REF = 'BILL/2026/07/0001';

const receivedFromGrn = (grn) => (grn.state === 'done' ? (grn.lot ? grn.lot.qty : PO_QTY) : 0);

/* ── The 3-Way Match dashboard (PO · Receipt · Bill) — the golden gate ────── */
function MatchCell({ label, value, sub, tone }) {
  const color = tone === 'bad' ? '#b02a37' : tone === 'ok' ? '#1e7e34' : '#374151';
  return (
    <div className="rounded-lg border bg-white p-3 text-center" style={{ borderColor: ODOO.border }}>
      <div className="text-[10px] font-mono tracking-wide text-gray-400">{label.toUpperCase()}</div>
      <div className="text-lg font-bold mt-0.5" style={{ color }}>{value}</div>
      <div className="text-[11px] text-gray-500">{sub}</div>
    </div>
  );
}

function ThreeWayMatch({ received, billed, matched, editable, onBilled }) {
  return (
    <div
      className="mb-6 rounded-lg border p-4"
      style={{ borderColor: matched ? '#bfe3c9' : '#f1aeb5', background: matched ? '#f2faf5' : '#fdf2f3' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⚖️</span>
        <h3 className="font-bold text-[14px] text-gray-800">3-Way Match — Purchase Order · Receipt · Bill</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MatchCell label="PO Qty" value={`${PO_QTY}`} sub="Purchase Order" />
        <MatchCell
          label="Received"
          value={`${received}`}
          sub={received ? 'From WH/IN/00001' : 'Not received yet'}
          tone={received === PO_QTY ? 'ok' : 'bad'}
        />
        <div className="rounded-lg border bg-white p-3 text-center" style={{ borderColor: ODOO.border }}>
          <div className="text-[10px] font-mono tracking-wide text-gray-400">BILLED</div>
          {editable ? (
            <input
              type="number"
              value={billed}
              onChange={(e) => onBilled(Number(e.target.value) || 0)}
              className="mt-0.5 w-20 text-center border rounded px-2 py-1 text-lg font-bold text-gray-800 focus:outline-none"
              style={{ borderColor: ODOO.border }}
            />
          ) : (
            <div className="text-lg font-bold mt-0.5 text-gray-800">{billed}</div>
          )}
          <div className="text-[11px] text-gray-500">Billed Quantity</div>
        </div>
      </div>
      <div
        className="mt-3 text-[13px] font-semibold rounded px-3 py-2"
        style={matched ? { background: '#e9f7ef', color: '#1e7e34' } : { background: '#fdecee', color: '#b02a37' }}
      >
        {matched
          ? '✓ 3-Way Match successful — Ready to Post.'
          : `✗ Mismatch — cannot post: Billed ${billed} ≠ Received ${received} (PO ${PO_QTY}). All three quantities must match.`}
      </div>
    </div>
  );
}

function PaymentBanner({ total }) {
  return (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">💳</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>In Payment</div>
        <div className="text-[12px] text-gray-600">
          A bank payment of <b>{fmt(total)}</b> was registered. Awaiting reconciliation to be marked <b>Paid</b>.
        </div>
      </div>
    </div>
  );
}

function InvoiceLines({ billed, untaxed, tax, total }) {
  return (
    <div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
            <th className="py-2 text-left font-medium">Product</th>
            <th className="py-2 text-right font-medium">Quantity</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">Taxes</th>
            <th className="py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
            <td className="py-2 text-gray-800">{LINE.product}</td>
            <td className="py-2 text-right text-gray-700 whitespace-nowrap">{billed} {LINE.uom}</td>
            <td className="py-2 text-right text-gray-700 whitespace-nowrap">{fmt(LINE.price)}</td>
            <td className="py-2 text-right text-gray-700">{LINE.tax}</td>
            <td className="py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(billed * LINE.price)}</td>
          </tr>
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

function OtherInfo({ paymentStatus }) {
  const rows = [
    ['Vendor', 'Gulf Cosmetics Labs'],
    ['Payment Reference', SAMPLE_PO.vendorRef],
    ['Payment Status', paymentStatus],
    ['Recipient Bank', 'Al Rajhi Bank — ****0155'],
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

/* ── Register Payment modal ──────────────────────────────────────────────── */
function PaymentModal({ total, onClose, onConfirm }) {
  const row = (label, value) => (
    <div className="flex flex-col gap-1">
      <span className="text-gray-500">{label}</span>
      <div className="border rounded px-2 py-1.5 bg-gray-50 text-gray-800" style={{ borderColor: ODOO.border }}>{value}</div>
    </div>
  );
  return (
    <OdooWizard
      title="Register Payment"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onConfirm} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.purple }}>
            Create Payment
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-gray-600 rounded px-3 py-1.5 border" style={{ borderColor: ODOO.border }}>
            Cancel
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
        {row('Journal', 'Bank')}
        {row('Payment Method', 'Manual')}
        {row('Payment Date', SAMPLE_PO.receiptDate)}
        {row('Amount', fmt(total))}
      </div>
      <div className="mt-3 text-[13px]">
        <span className="text-gray-500">Memo: </span>
        <b className="text-gray-800">{SAMPLE_PO.name}</b>
      </div>
    </OdooWizard>
  );
}

/* ── Accounting app: Bills list + Vendor Bill form ──────────────────────── */
export default function AccountingApp({ state, dispatch }) {
  const { bill, acctView, grn } = state;
  const received = receivedFromGrn(grn);
  const billed = bill.billedQty;
  const matched = billed === PO_QTY && billed === received;

  const untaxed = billed * LINE.price;
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  if (acctView === 'list') {
    const columns = [
      { key: 'ref', label: 'Number' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'source', label: 'Source Document' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: '_status', label: 'Status', align: 'right' },
    ];
    const rows = bill.created
      ? [{ id: 1, ref: bill.state === 'draft' ? 'Draft' : BILL_REF, vendor: 'Gulf Cosmetics Labs', source: SAMPLE_PO.name, total: fmt(total), state: bill.state === 'in_payment' ? 'done' : bill.state === 'posted' ? 'ready' : 'draft' }]
      : [];
    return (
      <OdooListView
        columns={columns}
        rows={rows}
        onOpenRow={() => dispatch({ type: 'ACCT_OPEN_FORM' })}
        emptyText="No vendor bills yet — open the confirmed Purchase Order and click “Create Bill”."
      />
    );
  }

  /* form view */
  const stages = [
    { key: 'draft', label: 'Draft' },
    { key: 'posted', label: 'Posted' },
    { key: 'in_payment', label: 'In Payment' },
  ];

  let actions = [];
  if (bill.state === 'draft') {
    actions = [
      { label: 'Post', primary: true, onClick: () => dispatch({ type: 'POST_BILL' }) },
      { label: 'Cancel', onClick: () => {} },
    ];
  } else if (bill.state === 'posted') {
    actions = [
      { label: 'Register Payment', primary: true, onClick: () => dispatch({ type: 'OPEN_WIZARD', which: 'payment' }) },
      { label: 'Reset to Draft', onClick: () => {} },
    ];
  } else {
    actions = [{ label: 'Reset to Draft', onClick: () => {} }];
  }

  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'Source Document', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];
  if (bill.state !== 'draft') smartButtons.push({ icon: '📒', value: '1', label: 'Journal Entry', onClick: () => {} });

  const paymentStatus = bill.state === 'in_payment' ? 'In Payment' : bill.state === 'posted' ? 'Not Paid' : 'Draft';

  const banner = (
    <>
      {bill.state === 'in_payment' && <PaymentBanner total={total} />}
      <ThreeWayMatch
        received={received}
        billed={billed}
        matched={matched}
        editable={bill.state === 'draft'}
        onBilled={(q) => dispatch({ type: 'SET_BILLED_QTY', qty: q })}
      />
    </>
  );

  const fieldColumns = [
    [
      { label: 'Vendor', value: 'Gulf Cosmetics Labs' },
      { label: 'Bill Reference', value: SAMPLE_PO.vendorRef },
      { label: 'Source Document', value: SAMPLE_PO.name },
    ],
    [
      { label: 'Bill Date', value: SAMPLE_PO.receiptDate },
      { label: 'Due Date', value: '2026-08-15' },
      { label: 'Payment Status', value: paymentStatus },
    ],
  ];

  const notebook = [
    { name: 'Invoice Lines', content: <InvoiceLines billed={billed} untaxed={untaxed} tax={tax} total={total} /> },
    { name: 'Other Info', content: <OtherInfo paymentStatus={paymentStatus} /> },
  ];

  return (
    <>
      <OdooFormView
        statusbar={{ stages, current: bill.state }}
        actions={actions}
        smartButtons={smartButtons}
        title={bill.state === 'draft' ? 'Draft Bill' : BILL_REF}
        banner={banner}
        fieldColumns={fieldColumns}
        notebook={notebook}
      />
      {state.wizard === 'payment' && (
        <PaymentModal total={total} onClose={() => dispatch({ type: 'CLOSE_WIZARD' })} onConfirm={() => dispatch({ type: 'REGISTER_PAYMENT' })} />
      )}
    </>
  );
}
