import React, { useState } from 'react';
import { ODOO, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';
import OdooListView from './OdooListView.jsx';
import OdooWizard from './OdooWizard.jsx';

const GRN_STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'waiting_qc', label: 'Waiting QC' },
  { key: 'done', label: 'Done' },
];

const LINE = SAMPLE_PO.lines[0];

/* ── Lot/Serial + Expiry wizard (traceability enforcement) ──────────────── */
function LotWizard({ onClose, onSave }) {
  const [done, setDone] = useState(String(LINE.qty));
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!Number(done) || Number(done) <= 0) return setErr('Enter the Done quantity.');
    if (!lot.trim()) return setErr('Lot/Serial Number is required.');
    if (!expiry) return setErr('Expiry Date is required — it drives FEFO at picking.');
    return onSave({ number: lot.trim(), expiry, qty: Number(done) });
  };

  const input = 'border rounded px-2 py-1.5 text-gray-800 focus:outline-none';
  return (
    <OdooWizard
      title={`Detailed Operations — ${RECEIPT_REF}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={submit} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.purple }}>
            Save
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-gray-600 rounded px-3 py-1.5 border" style={{ borderColor: ODOO.border }}>
            Discard
          </button>
        </>
      }
    >
      <p className="text-[13px] text-gray-600 mb-3 leading-relaxed">
        Record the lot and expiry for the received goods. Odoo requires this for tracked products — it sets up
        <b> FEFO</b> (first-expiry-first-out) enforcement at picking.
      </p>
      <div className="text-[13px] mb-3">
        <span className="text-gray-500">Product: </span>
        <b className="text-gray-800">{LINE.product}</b>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">Done</span>
          <input type="number" value={done} onChange={(e) => setDone(e.target.value)} className={input} style={{ borderColor: ODOO.border }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">Lot/Serial Number</span>
          <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. LOT-2026-A" className={`${input} font-mono`} style={{ borderColor: ODOO.border }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">Expiry Date</span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} style={{ borderColor: ODOO.border }} />
        </label>
      </div>
      {err && <div className="mt-3 text-[12px] font-semibold" style={{ color: '#b02a37' }}>{err}</div>}
    </OdooWizard>
  );
}

/* ── Operations notebook tab (move lines + traceability prompt) ──────────── */
function OperationsTab({ grn, dispatch }) {
  const lot = grn.lot;
  const needLot = grn.state === 'in_progress' && !lot;
  return (
    <div>
      {needLot && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
          <span className="text-[12px] font-semibold" style={{ color: '#8a6d1b' }}>
            ⚠ Traceability required — record a Lot/Serial Number and Expiry Date.
          </span>
          <button type="button" onClick={() => dispatch({ type: 'OPEN_WIZARD', which: 'lots' })} className="text-white text-[12px] font-semibold rounded px-3 py-1" style={{ background: ODOO.purple }}>
            Detailed Operations
          </button>
        </div>
      )}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
            <th className="py-2 text-left font-medium">Product</th>
            <th className="py-2 text-right font-medium">Demand</th>
            <th className="py-2 text-right font-medium">Done</th>
            <th className="py-2 text-left font-medium pl-4">Lot/Serial</th>
            <th className="py-2 text-left font-medium">Expiry</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
            <td className="py-2 text-gray-800">{LINE.product}</td>
            <td className="py-2 text-right text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
            <td className="py-2 text-right font-semibold whitespace-nowrap" style={{ color: lot ? ODOO.green : '#9ca3af' }}>
              {lot ? lot.qty : 0} {LINE.uom}
            </td>
            <td className="py-2 pl-4 text-gray-700 font-mono">{lot ? lot.number : '—'}</td>
            <td className="py-2 text-gray-700">{lot ? lot.expiry : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AdditionalInfo() {
  const rows = [
    ['Responsible', 'Mohammed Al-Barshi'],
    ['Procurement Group', SAMPLE_PO.name],
    ['Operation Type', 'Brandzo Hub: Receipts'],
    ['Priority', 'Normal'],
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

/* ── Quality Inspector panel (waiting_qc) — the golden gate ──────────────── */
function QCPanel({ grn, dispatch }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#d9c7d3', background: ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">🔬</span>
        <h3 className="font-bold text-[14px]" style={{ color: ODOO.purple }}>Quality Control — Inspector Decision</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        Golden rule: this receipt cannot be validated (Done) until a Quality Inspector approves the goods.
        Reviewing lot <b className="font-mono">{grn.lot ? grn.lot.number : '—'}</b> (Exp {grn.lot ? grn.lot.expiry : '—'}).
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => dispatch({ type: 'QC_APPROVE' })} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.green }}>
          ✓ Approve — Pass QC
        </button>
        <button type="button" onClick={() => dispatch({ type: 'QC_REJECT' })} className="text-[13px] font-semibold rounded px-4 py-1.5 border" style={{ borderColor: '#d33', color: '#d33' }}>
          ✗ Reject — Fail (Quarantine)
        </button>
      </div>
    </div>
  );
}

function DoneBanner() {
  return (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">✅</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>Receipt validated (Done)</div>
        <div className="text-[12px] text-gray-600">
          Quality passed. Next: <b>Putaway (Stage 05)</b> — use the Putaway smart button above.
        </div>
      </div>
    </div>
  );
}

/* ── Inventory app: Receipts list + GRN form ────────────────────────────── */
export default function InventoryApp({ state, dispatch }) {
  const { grn, invView } = state;

  if (invView === 'list') {
    const columns = [
      { key: 'ref', label: 'Reference' },
      { key: 'source', label: 'Source Document' },
      { key: 'contact', label: 'Receive From' },
      { key: 'date', label: 'Scheduled Date' },
      { key: '_status', label: 'Status', align: 'right' },
    ];
    const rows = grn.created
      ? [{ id: 1, ref: RECEIPT_REF, source: SAMPLE_PO.name, contact: 'Gulf Cosmetics Labs', date: SAMPLE_PO.receiptDate, state: grn.state }]
      : [];
    return (
      <OdooListView
        columns={columns}
        rows={rows}
        onOpenRow={() => dispatch({ type: 'INV_OPEN_FORM' })}
        emptyText="No receipts yet — confirm the Purchase Order first (Purchase app)."
      />
    );
  }

  /* form view */
  const lotDone = !!grn.lot;

  let actions = [];
  if (grn.state === 'draft') {
    actions = [
      { label: 'Mark as Todo', primary: true, onClick: () => dispatch({ type: 'GRN_MARK_TODO' }) },
      { label: 'Validate', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'ready') {
    actions = [
      { label: 'Start', primary: true, onClick: () => dispatch({ type: 'GRN_START' }) },
      { label: 'Validate', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'in_progress') {
    actions = [
      lotDone
        ? { label: 'Send to Quality Control', primary: true, onClick: () => dispatch({ type: 'GRN_SEND_QC' }) }
        : { label: 'Detailed Operations', primary: true, onClick: () => dispatch({ type: 'OPEN_WIZARD', which: 'lots' }) },
      { label: 'Validate', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'waiting_qc') {
    actions = [{ label: 'Validate', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) }];
  } else if (grn.state === 'done') {
    actions = [
      { label: 'Return', onClick: () => {} },
      { label: 'Print Labels', onClick: () => {} },
    ];
  }

  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'Source Document', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];
  if (grn.qc) {
    smartButtons.push({ icon: grn.qc === 'passed' ? '✅' : '⛔', value: grn.qc === 'passed' ? 'Passed' : 'Failed', label: 'Quality Check', onClick: () => {} });
  }
  if (grn.state === 'done') {
    smartButtons.push({ icon: '📥', value: '1', label: 'Putaway', onClick: () => dispatch({ type: 'PUTAWAY_INFO' }) });
  }

  let banner = null;
  if (grn.state === 'waiting_qc') banner = <QCPanel grn={grn} dispatch={dispatch} />;
  else if (grn.state === 'done') banner = <DoneBanner />;

  const fieldColumns = [
    [
      { label: 'Receive From', value: 'Gulf Cosmetics Labs' },
      { label: 'Source Document', value: SAMPLE_PO.name },
      { label: 'Operation Type', value: 'Brandzo Hub: Receipts' },
    ],
    [
      { label: 'Scheduled Date', value: SAMPLE_PO.receiptDate },
      { label: 'Destination', value: 'WH/Stock' },
      { label: 'Company', value: 'Brandzo Hub' },
    ],
  ];

  const notebook = [
    { name: 'Operations', content: <OperationsTab grn={grn} dispatch={dispatch} /> },
    { name: 'Additional Info', content: <AdditionalInfo /> },
  ];

  return (
    <>
      <OdooFormView
        statusbar={{ stages: GRN_STAGES, current: grn.state }}
        actions={actions}
        smartButtons={smartButtons}
        title={RECEIPT_REF}
        banner={banner}
        fieldColumns={fieldColumns}
        notebook={notebook}
      />
      {state.wizard === 'lots' && (
        <LotWizard onClose={() => dispatch({ type: 'CLOSE_WIZARD' })} onSave={(lot) => dispatch({ type: 'SAVE_LOT', lot })} />
      )}
    </>
  );
}
