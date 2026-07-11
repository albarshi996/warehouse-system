import React from 'react';
import { ODOO, SAMPLE_PO } from './odooTheme.js';
import { deliveryLots } from './simReducer.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

/* FEFO lot picker — the trainee MUST pick the earliest-expiry lot. */
function FefoPicker({ lots, picked, onPick }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">⏳</span>
        <h3 className="font-bold text-[14px] text-gray-800">Select Lot to Deliver — FEFO (First-Expiry-First-Out)</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        Scan or pick the lot with the <b>earliest expiry</b>. The system blocks any newer lot so stock never expires on the shelf.
      </p>
      <div className="space-y-2">
        {lots.map((lot, i) => {
          const isEarliest = i === 0;
          const sel = picked === lot.number;
          return (
            <button
              key={lot.number}
              type="button"
              onClick={() => onPick(lot.number)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors bg-white"
              style={sel ? { borderColor: '#1e7e34', boxShadow: '0 0 0 1px #1e7e34 inset' } : { borderColor: ODOO.border }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: sel ? '#1e7e34' : '#c4c4c4' }}>
                  {sel && <span className="w-2 h-2 rounded-full" style={{ background: '#1e7e34' }} />}
                </span>
                <span className="text-gray-400 text-xs" title="Lot / Serial barcode">‖‖‖</span>
                <span className="font-mono text-[13px] text-gray-800">{lot.number}</span>
                <span className="text-[12px] text-gray-500 hidden sm:inline">Exp {lot.expiry} · Qty {lot.qty} · {lot.source}</span>
              </span>
              {isEarliest ? (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: '#1e7e34', background: '#e9f7ef' }}>FEFO ✓ earliest</span>
              ) : (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: '#b02a37', background: '#fdecee' }}>newer</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DoneBanner({ lot }) {
  return (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">✅</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>Delivery validated — {lot} shipped</div>
        <div className="text-[12px] text-gray-600">FEFO respected. The full inventory cycle is complete: Receipt → QC → Putaway → Delivery.</div>
      </div>
    </div>
  );
}

function Operations({ picked }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
          <th className="py-2 text-left font-medium">Product</th>
          <th className="py-2 text-right font-medium">Demand</th>
          <th className="py-2 text-right font-medium">Done</th>
          <th className="py-2 text-left font-medium pl-4">Lot/Serial</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
          <td className="py-2 text-gray-800">{LINE.product}</td>
          <td className="py-2 text-right text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
          <td className="py-2 text-right font-semibold whitespace-nowrap" style={{ color: picked ? ODOO.green : '#9ca3af' }}>
            {picked ? LINE.qty : 0} {LINE.uom}
          </td>
          <td className="py-2 pl-4 text-gray-700 font-mono">{picked || '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* Delivery Order / Picking (Stage 06) — FEFO-enforced lot selection. */
export default function DeliveryForm({ state, dispatch }) {
  const dv = state.delivery;
  const lots = deliveryLots(state.grn);

  const stages = [
    { key: 'draft', label: 'Draft' },
    { key: 'ready', label: 'Ready' },
    { key: 'done', label: 'Done' },
  ];
  const actions = dv.done
    ? [{ label: 'Print Delivery Slip', onClick: () => {} }]
    : [{ label: 'Validate', primary: true, onClick: () => dispatch({ type: 'DELIVERY_VALIDATE' }) }];
  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'Source Document', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];

  const banner = dv.done ? (
    <DoneBanner lot={dv.pickedLot} />
  ) : (
    <FefoPicker lots={lots} picked={dv.pickedLot} onPick={(n) => dispatch({ type: 'PICK_LOT', lotNumber: n })} />
  );

  const fieldColumns = [
    [
      { label: 'Delivery Address', value: 'Brandzo Retail — Benghazi' },
      { label: 'Operation Type', value: 'Brandzo Hub: Delivery Orders' },
      { label: 'Source Document', value: SAMPLE_PO.name },
    ],
    [
      { label: 'Scheduled Date', value: SAMPLE_PO.receiptDate },
      { label: 'Source Location', value: 'WH/Stock' },
      { label: 'Company', value: 'Brandzo Hub' },
    ],
  ];

  const notebook = [{ name: 'Operations', content: <Operations picked={dv.pickedLot} /> }];

  return (
    <OdooFormView
      statusbar={{ stages, current: dv.done ? 'done' : 'ready' }}
      actions={actions}
      smartButtons={smartButtons}
      title="WH/OUT/00001"
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
