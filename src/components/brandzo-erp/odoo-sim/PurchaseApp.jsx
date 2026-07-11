import React from 'react';
import { ODOO, SAMPLE_PO, fmt } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

function OrderLines({ lines, untaxed, tax, total }) {
  return (
    <div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
            <th className="py-2 text-start font-medium">المنتج</th>
            <th className="py-2 text-end font-medium">الكمية</th>
            <th className="py-2 text-end font-medium">سعر الوحدة</th>
            <th className="py-2 text-end font-medium">الضرائب</th>
            <th className="py-2 text-end font-medium">الإجمالي الفرعي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{l.product}</td>
              <td className="py-2 text-end text-gray-700 whitespace-nowrap">{l.qty.toLocaleString('en-US')} {l.uom}</td>
              <td className="py-2 text-end text-gray-700 whitespace-nowrap">{fmt(l.price)}</td>
              <td className="py-2 text-end text-gray-700">{l.tax}</td>
              <td className="py-2 text-end font-semibold text-gray-800 whitespace-nowrap">{fmt(l.qty * l.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end mt-4">
        <div className="w-64 space-y-1 text-[13px]">
          <div className="flex justify-between text-gray-500"><span>المبلغ قبل الضريبة</span><span>{fmt(untaxed)}</span></div>
          <div className="flex justify-between text-gray-500"><span>الضرائب (15%)</span><span>{fmt(tax)}</span></div>
          <div className="flex justify-between text-gray-900 font-bold text-base border-t pt-1" style={{ borderColor: ODOO.border }}>
            <span>الإجمالي</span><span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OtherInfo({ po }) {
  const rows = [
    ['المشتري', po.buyer],
    ['الشركة', po.company],
    ['شروط الدفع', po.paymentTerms],
    ['تاريخ الاستلام', po.receiptDate],
    ['المستند المصدر', po.vendorRef],
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

/** تطبيق المشتريات — نموذج طلب عرض السعر / أمر الشراء. */
export default function PurchaseApp({ state, dispatch }) {
  const po = SAMPLE_PO;
  const confirmed = state.po.state === 'purchase';
  const untaxed = po.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  const stages = [
    { key: 'draft', label: 'طلب عرض سعر' },
    { key: 'sent', label: 'أُرسل الطلب' },
    { key: 'purchase', label: 'أمر شراء' },
  ];
  const current = confirmed ? 'purchase' : 'draft';

  const actions = confirmed
    ? [
        { label: 'استلام المنتجات', primary: true, onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) },
        { label: 'إنشاء فاتورة', onClick: () => dispatch({ type: 'CREATE_BILL' }) },
        { label: 'إلغاء', onClick: () => dispatch({ type: 'RESET_PO' }) },
      ]
    : [
        { label: 'تأكيد الطلب', primary: true, onClick: () => dispatch({ type: 'CONFIRM_PO' }) },
        { label: 'إرسال بالبريد', onClick: () => {} },
        { label: 'إلغاء', onClick: () => {} },
      ];

  const smartButtons = confirmed
    ? [{ icon: '📦', value: '1', label: 'الاستلام', onClick: () => dispatch({ type: 'OPEN_RECEIPT' }) }]
    : [];

  const fieldColumns = [
    [
      { label: 'المورّد', value: po.vendor },
      { label: 'مرجع المورّد', value: po.vendorRef },
      { label: 'أمر إطاري', value: '—' },
    ],
    [
      { label: 'الموعد النهائي للطلب', value: po.orderDeadline },
      { label: 'الوصول المتوقّع', value: po.receiptDate },
      { label: 'العملة', value: 'دينار ليبي — LYD' },
    ],
  ];

  const notebook = [
    { name: 'بنود الطلب', content: <OrderLines lines={po.lines} untaxed={untaxed} tax={tax} total={total} /> },
    { name: 'معلومات أخرى', content: <OtherInfo po={po} /> },
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
