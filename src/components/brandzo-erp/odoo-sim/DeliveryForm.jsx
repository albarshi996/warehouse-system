import React from 'react';
import { ODOO, SAMPLE_PO } from './odooTheme.js';
import { deliveryLots } from './simReducer.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

/* منتقي الدفعة وفق FEFO — على المتدرّب اختيار الدفعة الأقرب انتهاءً. */
function FefoPicker({ lots, picked, onPick }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">⏳</span>
        <h3 className="font-bold text-[14px] text-gray-800">اختر الدفعة للتسليم — FEFO (الأقرب انتهاءً يخرج أولاً)</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        امسح أو اختر الدفعة ذات <b>تاريخ الانتهاء الأقرب</b>. يحجب النظام أي دفعة أحدث حتى لا تنتهي صلاحية المخزون على الرفّ.
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
              className="w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-right transition-colors bg-white"
              style={sel ? { borderColor: '#1e7e34', boxShadow: '0 0 0 1px #1e7e34 inset' } : { borderColor: ODOO.border }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: sel ? '#1e7e34' : '#c4c4c4' }}>
                  {sel && <span className="w-2 h-2 rounded-full" style={{ background: '#1e7e34' }} />}
                </span>
                <span className="text-gray-400 text-xs" title="باركود الدفعة/التسلسل">‖‖‖</span>
                <span className="font-mono text-[13px] text-gray-800" dir="ltr">{lot.number}</span>
                <span className="text-[12px] text-gray-500 hidden sm:inline">انتهاء {lot.expiry} · كمية {lot.qty} · {lot.source}</span>
              </span>
              {isEarliest ? (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: '#1e7e34', background: '#e9f7ef' }}>FEFO ✓ الأقرب</span>
              ) : (
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0" style={{ color: '#b02a37', background: '#fdecee' }}>أحدث</span>
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
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>تم اعتماد التسليم — شُحنت {lot}</div>
        <div className="text-[12px] text-gray-600">تحقّقت قاعدة FEFO. التالي: <b>تصريح خروج البوابة (Gate Pass)</b> قبل تحرّك الشاحنة — المرحلة 07.</div>
      </div>
    </div>
  );
}

function Operations({ picked }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
          <th className="py-2 text-start font-medium">المنتج</th>
          <th className="py-2 text-end font-medium">المطلوب</th>
          <th className="py-2 text-end font-medium">المُنجَز</th>
          <th className="py-2 text-start font-medium ps-4">الدفعة/التسلسل</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
          <td className="py-2 text-gray-800">{LINE.product}</td>
          <td className="py-2 text-end text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
          <td className="py-2 text-end font-semibold whitespace-nowrap" style={{ color: picked ? ODOO.green : '#9ca3af' }}>
            {picked ? LINE.qty : 0} {LINE.uom}
          </td>
          <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">{picked || '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}

/* أمر التسليم / السحب (المرحلة 06) — اختيار الدفعة بفرض قاعدة FEFO. */
export default function DeliveryForm({ state, dispatch }) {
  const dv = state.delivery;
  const lots = deliveryLots(state.grn);

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'ready', label: 'جاهز' },
    { key: 'done', label: 'مكتمل' },
  ];
  const actions = dv.done
    ? [
        { label: 'تصريح خروج البوابة', primary: true, onClick: () => dispatch({ type: 'OPEN_GATEPASS' }) },
        { label: 'طباعة إذن التسليم', onClick: () => {} },
      ]
    : [{ label: 'تصديق', primary: true, onClick: () => dispatch({ type: 'DELIVERY_VALIDATE' }) }];
  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'المستند المصدر', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];
  if (dv.done) smartButtons.push({ icon: '🚧', value: 'GP/2026/0001', label: 'تصريح البوابة', onClick: () => dispatch({ type: 'OPEN_GATEPASS' }) });

  const banner = dv.done ? (
    <DoneBanner lot={dv.pickedLot} />
  ) : (
    <FefoPicker lots={lots} picked={dv.pickedLot} onPick={(n) => dispatch({ type: 'PICK_LOT', lotNumber: n })} />
  );

  const fieldColumns = [
    [
      { label: 'عنوان التسليم', value: 'براندزو للتجزئة — بنغازي' },
      { label: 'نوع العملية', value: 'براندزو هَب: أوامر التسليم' },
      { label: 'المستند المصدر', value: SAMPLE_PO.name },
    ],
    [
      { label: 'التاريخ المجدول', value: SAMPLE_PO.receiptDate },
      { label: 'موقع المصدر', value: 'WH/Stock' },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [{ name: 'العمليات', content: <Operations picked={dv.pickedLot} /> }];

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
