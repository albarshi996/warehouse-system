import React from 'react';
import { ODOO, SAMPLE_PO, PR_REF, fmt } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

/* ── 01: نموذج طلب الشراء الداخلي (حوكمة الشراء) ─────────────────────────── */
function PRForm({ state, dispatch }) {
  const pr = state.pr;
  const line = SAMPLE_PO.lines[0];

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'to_approve', label: 'قيد الموافقة' },
    { key: 'approved', label: 'معتمد' },
  ];

  let actions = [];
  if (pr.state === 'draft') {
    actions = [{ label: 'إرسال للموافقة', primary: true, onClick: () => dispatch({ type: 'PR_SUBMIT' }) }];
  } else if (pr.state === 'to_approve') {
    actions = [{ label: 'اعتماد (مدير المشتريات)', primary: true, onClick: () => dispatch({ type: 'PR_APPROVE' }) }];
  } else {
    actions = [{ label: 'فتح طلب عرض السعر', primary: true, onClick: () => dispatch({ type: 'PURCH_VIEW', view: 'po' }) }];
  }

  const smartButtons = pr.state === 'approved'
    ? [{ icon: '📝', value: SAMPLE_PO.name, label: 'طلب عرض السعر', onClick: () => dispatch({ type: 'PURCH_VIEW', view: 'po' }) }]
    : [];

  const banner = pr.state === 'approved' ? (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">✅</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>اعتُمد طلب الشراء</div>
        <div className="text-[12px] text-gray-600">أُنشئ طلب عرض السعر <b>{SAMPLE_PO.name}</b> تلقائياً — تابع من «أوامر الشراء».</div>
      </div>
    </div>
  ) : (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🛒</span>
        <h3 className="font-bold text-[14px] text-gray-800">بداية الدورة المستندية — نقطة إعادة الطلب</h3>
      </div>
      <p className="text-[12px] text-gray-600 leading-relaxed">
        وصل رصيد الصنف إلى نقطة إعادة الطلب، فأصدر النظام طلب شراء داخلياً. القاعدة:
        <b> لا يُنشأ أمر شراء دون طلب شراء معتمد</b> من مدير المشتريات.
      </p>
    </div>
  );

  const fieldColumns = [
    [
      { label: 'مقدّم الطلب', value: 'أمين المستودع' },
      { label: 'القسم', value: 'المستودعات — براندزو هَب' },
      { label: 'سبب الطلب', value: 'بلوغ نقطة إعادة الطلب' },
    ],
    [
      { label: 'تاريخ الطلب', value: '2026-07-10' },
      { label: 'الأولوية', value: 'عادية' },
      { label: 'المورّد المقترح', value: SAMPLE_PO.vendor },
    ],
  ];

  const notebook = [
    {
      name: 'الأصناف المطلوبة',
      content: (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-end font-medium">الكمية المطلوبة</th>
              <th className="py-2 text-end font-medium">الرصيد الحالي</th>
              <th className="py-2 text-end font-medium">نقطة إعادة الطلب</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{line.product}</td>
              <td className="py-2 text-end font-semibold text-gray-800">{line.qty} {line.uom}</td>
              <td className="py-2 text-end text-gray-700">14 {line.uom}</td>
              <td className="py-2 text-end text-gray-700">25 {line.uom}</td>
            </tr>
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: pr.state }}
      actions={actions}
      smartButtons={smartButtons}
      title={PR_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}

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

/** تطبيق المشتريات — طلب الشراء الداخلي (01) ثم طلب عرض السعر / أمر الشراء (02). */
export default function PurchaseApp({ state, dispatch }) {
  if (state.purchView === 'pr') return <PRForm state={state} dispatch={dispatch} />;
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
