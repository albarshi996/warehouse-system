import React from 'react';
import { ODOO, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];
const BINS = [
  { code: 'WH/Stock/Rack-A/A3-12', label: 'Rack A · Shelf 03 · Bin 12', suggested: true },
  { code: 'WH/Stock/Rack-B/B1-04', label: 'Rack B · Shelf 01 · Bin 04' },
];

/* Bin/location picker — Odoo operations style (confirm the putaway rule). */
function BinPicker({ selected, done, onPick }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: done ? '#bfe3c9' : '#cdb8c6', background: done ? '#f2faf5' : ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">📥</span>
        <h3 className="font-bold text-[14px] text-gray-800">Putaway — confirm the storage location</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        The putaway rule suggests a bin for the received goods. Scan or confirm the destination location, then validate.
      </p>
      <div className="space-y-2">
        {BINS.map((b) => {
          const isSel = selected === b.code;
          return (
            <button
              key={b.code}
              type="button"
              disabled={done}
              onClick={() => onPick(b.code)}
              className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors bg-white"
              style={isSel ? { borderColor: ODOO.purple, boxShadow: `0 0 0 1px ${ODOO.purple} inset` } : { borderColor: ODOO.border }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isSel ? ODOO.purple : '#c4c4c4' }}>
                  {isSel && <span className="w-2 h-2 rounded-full" style={{ background: ODOO.purple }} />}
                </span>
                <span className="text-gray-400 text-xs" title="Barcode">‖‖‖</span>
                <span className="font-mono text-[13px] text-gray-800">{b.code}</span>
                <span className="text-[12px] text-gray-500 hidden sm:inline">{b.label}</span>
              </span>
              {b.suggested && (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: ODOO.purple, background: '#fff' }}>Suggested</span>
              )}
            </button>
          );
        })}
      </div>
      {done && <div className="mt-3 text-[13px] font-semibold" style={{ color: '#1e7e34' }}>✓ Stored at {selected}.</div>}
    </div>
  );
}

function Operations({ bin }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
          <th className="py-2 text-left font-medium">Product</th>
          <th className="py-2 text-right font-medium">Quantity</th>
          <th className="py-2 text-left font-medium pl-4">From</th>
          <th className="py-2 text-left font-medium">To</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
          <td className="py-2 text-gray-800">{LINE.product}</td>
          <td className="py-2 text-right text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
          <td className="py-2 pl-4 text-gray-700 font-mono">WH/Input</td>
          <td className="py-2 text-gray-700 font-mono">{bin}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* Putaway (Stage 05) — internal transfer from Input to the stock bin. */
export default function PutawayForm({ state, dispatch }) {
  const pa = state.putaway;
  const done = pa.state === 'done';

  const stages = [
    { key: 'ready', label: 'Ready' },
    { key: 'done', label: 'Done' },
  ];
  const actions = done
    ? [{ label: 'Deliver Products', primary: true, onClick: () => dispatch({ type: 'OPEN_DELIVERY' }) }]
    : [{ label: 'Validate', primary: true, onClick: () => dispatch({ type: 'PUTAWAY_VALIDATE' }) }];
  const smartButtons = [{ icon: '🧾', value: RECEIPT_REF, label: 'Source Receipt', onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) }];

  const banner = <BinPicker selected={pa.bin} done={done} onPick={(code) => dispatch({ type: 'SET_PUTAWAY_BIN', bin: code })} />;

  const fieldColumns = [
    [
      { label: 'Operation Type', value: 'Brandzo Hub: Internal Transfer' },
      { label: 'Source Location', value: 'WH/Input' },
      { label: 'Source Document', value: RECEIPT_REF },
    ],
    [
      { label: 'Scheduled Date', value: SAMPLE_PO.receiptDate },
      { label: 'Destination', value: pa.bin },
      { label: 'Company', value: 'Brandzo Hub' },
    ],
  ];

  const notebook = [{ name: 'Operations', content: <Operations bin={pa.bin} /> }];

  return (
    <OdooFormView
      statusbar={{ stages, current: done ? 'done' : 'ready' }}
      actions={actions}
      smartButtons={smartButtons}
      title="WH/INT/00001"
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
