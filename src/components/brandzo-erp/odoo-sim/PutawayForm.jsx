import React from 'react';
import { ODOO, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];
const BINS = [
  { code: 'WH/Stock/Rack-A/A3-12', label: 'رفّ A · طبقة 03 · صندوق 12', suggested: true },
  { code: 'WH/Stock/Rack-B/B1-04', label: 'رفّ B · طبقة 01 · صندوق 04' },
];

/* منتقي الموقع/الصندوق — بأسلوب عمليات Odoo (تأكيد قاعدة التخزين). */
function BinPicker({ selected, done, onPick }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: done ? '#bfe3c9' : '#cdb8c6', background: done ? '#f2faf5' : ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">📥</span>
        <h3 className="font-bold text-[14px] text-gray-800">التخزين — أكّد موقع التخزين</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        تقترح قاعدة التخزين صندوقاً للبضاعة المستلمة. امسح أو أكّد موقع الوجهة، ثم صدّق العملية.
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
              className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-right transition-colors bg-white"
              style={isSel ? { borderColor: ODOO.purple, boxShadow: `0 0 0 1px ${ODOO.purple} inset` } : { borderColor: ODOO.border }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isSel ? ODOO.purple : '#c4c4c4' }}>
                  {isSel && <span className="w-2 h-2 rounded-full" style={{ background: ODOO.purple }} />}
                </span>
                <span className="text-gray-400 text-xs" title="باركود">‖‖‖</span>
                <span className="font-mono text-[13px] text-gray-800" dir="ltr">{b.code}</span>
                <span className="text-[12px] text-gray-500 hidden sm:inline">{b.label}</span>
              </span>
              {b.suggested && (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: ODOO.purple, background: '#fff' }}>مُقترح</span>
              )}
            </button>
          );
        })}
      </div>
      {done && <div className="mt-3 text-[13px] font-semibold" style={{ color: '#1e7e34' }}>✓ تم التخزين في {selected}.</div>}
    </div>
  );
}

function Operations({ bin }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
          <th className="py-2 text-start font-medium">المنتج</th>
          <th className="py-2 text-end font-medium">الكمية</th>
          <th className="py-2 text-start font-medium ps-4">من</th>
          <th className="py-2 text-start font-medium">إلى</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
          <td className="py-2 text-gray-800">{LINE.product}</td>
          <td className="py-2 text-end text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
          <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">WH/Input</td>
          <td className="py-2 text-gray-700 font-mono" dir="ltr">{bin}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* التخزين (المرحلة 05) — تحويل داخلي من منطقة الإدخال إلى صندوق التخزين. */
export default function PutawayForm({ state, dispatch }) {
  const pa = state.putaway;
  const done = pa.state === 'done';

  const stages = [
    { key: 'ready', label: 'جاهز' },
    { key: 'done', label: 'مكتمل' },
  ];
  const actions = done
    ? [{ label: 'تسليم المنتجات', primary: true, onClick: () => dispatch({ type: 'OPEN_DELIVERY' }) }]
    : [{ label: 'تصديق', primary: true, onClick: () => dispatch({ type: 'PUTAWAY_VALIDATE' }) }];
  const smartButtons = [{ icon: '🧾', value: RECEIPT_REF, label: 'إذن الاستلام المصدر', onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) }];

  const banner = <BinPicker selected={pa.bin} done={done} onPick={(code) => dispatch({ type: 'SET_PUTAWAY_BIN', bin: code })} />;

  const fieldColumns = [
    [
      { label: 'نوع العملية', value: 'براندزو هَب: تحويل داخلي' },
      { label: 'موقع المصدر', value: 'WH/Input' },
      { label: 'المستند المصدر', value: RECEIPT_REF },
    ],
    [
      { label: 'التاريخ المجدول', value: SAMPLE_PO.receiptDate },
      { label: 'الوجهة', value: pa.bin },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [{ name: 'العمليات', content: <Operations bin={pa.bin} /> }];

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
