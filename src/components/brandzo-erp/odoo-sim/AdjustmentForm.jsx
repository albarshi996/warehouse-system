import React from 'react';
import { ODOO, SAMPLE_PO, ADJ_REF, CC_REF, CC_LOT, CC_SYSTEM_QTY, fmt } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

/* سند تسوية المخزون (المرحلة 10) — لا تعديل رصيد دون اعتماد المدير المالي. */
export default function AdjustmentForm({ state, dispatch }) {
  const adj = state.adjustment;
  const exists = adj.state !== 'none';
  const validated = adj.state === 'validated';
  const value = Math.abs(adj.qty) * LINE.price;

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'validated', label: 'مُصادَق' },
  ];

  const actions = validated
    ? [{ label: 'طباعة السند', onClick: () => {} }]
    : [{ label: 'تصديق السند', primary: true, onClick: () => dispatch({ type: 'ADJ_VALIDATE_ATTEMPT' }) }];

  const smartButtons = [
    { icon: '🔢', value: CC_REF, label: 'محضر الجرد', onClick: () => dispatch({ type: 'OPEN_CYCLECOUNT' }) },
  ];
  if (validated) smartButtons.push({ icon: '📒', value: '1', label: 'قيد اليومية', onClick: () => {} });

  const banner = !exists ? (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">⚖️</span>
        <h3 className="font-bold text-[14px] text-gray-800">لا يوجد سند تسوية بعد</h3>
      </div>
      <p className="text-[12px] text-gray-600">تُنشأ سندات التسوية آلياً من فروقات الجرد الدوري — أكمل ورقة الجرد أولاً.</p>
    </div>
  ) : validated ? (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">✅</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>صُدّق سند التسوية وأُنشئ القيد المحاسبي</div>
        <div className="text-[12px] text-gray-600">تسوية {adj.qty > 0 ? `+${adj.qty}` : adj.qty} وحدة بقيمة {fmt(value)} — رُحّلت على حساب فروقات الجرد.</div>
      </div>
    </div>
  ) : (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#d9c7d3', background: ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">⚖️</span>
        <h3 className="font-bold text-[14px]" style={{ color: ODOO.purple }}>اعتماد المدير المالي — إلزامي</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        القاعدة: <b>لا يُعدَّل أي رصيد يدوياً دون سند تسوية معتمد من المدير المالي</b>.
        الفارق: <b style={{ color: '#b02a37' }}>{adj.qty > 0 ? `+${adj.qty}` : adj.qty} وحدة</b> بقيمة {fmt(value)}.
      </p>
      <div className="flex flex-wrap gap-2">
        {adj.financeApproved ? (
          <span className="text-[13px] font-semibold rounded px-3 py-1.5" style={{ color: '#1e7e34', background: '#e9f7ef' }}>
            ✓ اعتمده المدير المالي — يمكنك التصديق الآن
          </span>
        ) : (
          <button type="button" onClick={() => dispatch({ type: 'ADJ_FINANCE_APPROVE' })} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.green }}>
            ✓ اعتماد (المدير المالي)
          </button>
        )}
      </div>
    </div>
  );

  const fieldColumns = [
    [
      { label: 'مصدر السند', value: `${CC_REF} — فارق جرد دوري` },
      { label: 'الموقع', value: 'WH/Stock/Rack-A' },
      { label: 'المعتمِد', value: adj.financeApproved || validated ? 'المدير المالي ✓' : 'بانتظار المدير المالي' },
    ],
    [
      { label: 'تاريخ السند', value: '2026-07-20' },
      { label: 'أثر القيد', value: exists ? fmt(value) : '—' },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [
    {
      name: 'بنود التسوية',
      content: (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-start font-medium ps-4">الدفعة</th>
              <th className="py-2 text-end font-medium">النظام</th>
              <th className="py-2 text-end font-medium">الفعلي</th>
              <th className="py-2 text-end font-medium">التسوية</th>
              <th className="py-2 text-end font-medium">القيمة</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{LINE.product}</td>
              <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">{CC_LOT}</td>
              <td className="py-2 text-end text-gray-700">{CC_SYSTEM_QTY}</td>
              <td className="py-2 text-end text-gray-700">{exists ? CC_SYSTEM_QTY + adj.qty : '—'}</td>
              <td className="py-2 text-end font-bold" style={{ color: exists && adj.qty !== 0 ? '#b02a37' : '#1e7e34' }}>
                {exists ? (adj.qty > 0 ? `+${adj.qty}` : adj.qty) : '—'}
              </td>
              <td className="py-2 text-end text-gray-700 whitespace-nowrap">{exists ? fmt(value) : '—'}</td>
            </tr>
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: validated ? 'validated' : 'draft' }}
      actions={exists ? actions : []}
      smartButtons={smartButtons}
      title={ADJ_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
