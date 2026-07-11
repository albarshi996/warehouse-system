import React from 'react';
import { ODOO, SAMPLE_PO, CN_REF, RET_REF, fmt } from './odooTheme.js';
import { closeChecklist } from './simReducer.js';
import OdooFormView from './OdooFormView.jsx';
import OdooListView from './OdooListView.jsx';
import OdooWizard from './OdooWizard.jsx';

const LINE = SAMPLE_PO.lines[0];
const PO_QTY = LINE.qty;
const BILL_REF = 'BILL/2026/07/0001';

/* ── الإشعار الدائن (المرحلة 08) — مربوط بفاتورة المورّد والمرتجع ─────────── */
function RefundForm({ state, dispatch }) {
  const { refund, returnDoc } = state;
  const retDone = returnDoc.state === 'done';
  const posted = refund.state === 'posted';
  const untaxed = refund.qty * LINE.price;
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'posted', label: 'مُرحّلة' },
  ];

  const actions = posted
    ? [{ label: 'طباعة الإشعار', onClick: () => {} }]
    : [{ label: 'ترحيل', primary: true, onClick: () => dispatch({ type: 'POST_REFUND' }) }];

  const smartButtons = [
    { icon: '🧾', value: BILL_REF, label: 'الفاتورة الأصلية', onClick: () => dispatch({ type: 'ACCT_OPEN_FORM' }) },
    { icon: '↩️', value: RET_REF, label: 'إشعار المرتجع', onClick: () => dispatch({ type: 'OPEN_RETURN' }) },
  ];

  const banner = !retDone ? (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">↩️</span>
        <h3 className="font-bold text-[14px] text-gray-800">لا إشعار دائن جاهزاً بعد</h3>
      </div>
      <p className="text-[12px] text-gray-600">يُنشأ الإشعار الدائن آلياً بعد تصديق إشعار المرتجع في المخزون — أكمل المرحلة 08 هناك أولاً.</p>
    </div>
  ) : posted ? (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">✅</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>رُحّل الإشعار الدائن — {fmt(total)}</div>
        <div className="text-[12px] text-gray-600">خُصمت قيمة {returnDoc.qty} وحدة تالفة من مستحقات المورّد، مربوطة بـ{BILL_REF} والمرتجع {RET_REF}.</div>
      </div>
    </div>
  ) : (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#d9c7d3', background: ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">⚖️</span>
        <h3 className="font-bold text-[14px]" style={{ color: ODOO.purple }}>تدقيق الربط قبل الترحيل</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        كمية الإشعار الدائن يجب أن تساوي الكمية المرتجعة فعلياً (<b>{returnDoc.qty} وحدة</b>) — جرّب كمية مختلفة لترى الحجب.
      </p>
      <div className="flex items-center gap-3 text-[13px]">
        <span className="text-gray-600">الكمية الدائنة:</span>
        <input
          type="number"
          value={refund.qty}
          onChange={(e) => dispatch({ type: 'SET_REFUND_QTY', qty: Number(e.target.value) || 0 })}
          className="w-24 text-center border rounded px-2 py-1 text-[14px] font-bold text-gray-800 focus:outline-none"
          style={{ borderColor: refund.qty === returnDoc.qty ? '#1e7e34' : '#b02a37' }}
        />
        <span className="font-semibold" style={{ color: refund.qty === returnDoc.qty ? '#1e7e34' : '#b02a37' }}>
          {refund.qty === returnDoc.qty ? '✓ مطابقة للمرتجع' : `✗ المرتجع الفعلي ${returnDoc.qty}`}
        </span>
      </div>
    </div>
  );

  const fieldColumns = [
    [
      { label: 'المورّد', value: SAMPLE_PO.vendor },
      { label: 'الفاتورة الأصلية', value: BILL_REF },
      { label: 'المستند المصدر', value: RET_REF },
    ],
    [
      { label: 'تاريخ الإشعار', value: '2026-07-18' },
      { label: 'السبب', value: 'مرتجع تالف — عيب مصنعي' },
      { label: 'الحالة', value: posted ? 'مُرحّلة' : 'مسودة' },
    ],
  ];

  const notebook = [
    {
      name: 'بنود الإشعار',
      content: (
        <div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
                <th className="py-2 text-start font-medium">المنتج</th>
                <th className="py-2 text-end font-medium">الكمية</th>
                <th className="py-2 text-end font-medium">السعر</th>
                <th className="py-2 text-end font-medium">الضرائب</th>
                <th className="py-2 text-end font-medium">الإجمالي الفرعي</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
                <td className="py-2 text-gray-800">{LINE.product}</td>
                <td className="py-2 text-end text-gray-700 whitespace-nowrap">{refund.qty} {LINE.uom}</td>
                <td className="py-2 text-end text-gray-700 whitespace-nowrap">{fmt(LINE.price)}</td>
                <td className="py-2 text-end text-gray-700">{LINE.tax}</td>
                <td className="py-2 text-end font-semibold text-gray-800 whitespace-nowrap">{fmt(untaxed)}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1 text-[13px]">
              <div className="flex justify-between text-gray-500"><span>المبلغ قبل الضريبة</span><span>{fmt(untaxed)}</span></div>
              <div className="flex justify-between text-gray-500"><span>الضرائب (15%)</span><span>{fmt(tax)}</span></div>
              <div className="flex justify-between text-gray-900 font-bold text-base border-t pt-1" style={{ borderColor: ODOO.border }}>
                <span>إجمالي الخصم</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: refund.state }}
      actions={retDone ? actions : []}
      smartButtons={smartButtons}
      title={CN_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}

/* ── الإغلاق المالي (المرحلة 12) — قائمة تحقّق نهاية الشهر ────────────────── */
function CloseView({ state, dispatch }) {
  const closed = state.close.state === 'closed';
  const checks = closeChecklist(state);
  const allOk = checks.every((c) => c.ok);

  const stages = [
    { key: 'open', label: 'فترة مفتوحة' },
    { key: 'closed', label: 'مُغلقة' },
  ];

  const actions = closed
    ? [{ label: 'طباعة تقرير الإغلاق', onClick: () => {} }]
    : [{ label: 'إغلاق الفترة المالية', primary: true, onClick: () => dispatch({ type: 'CLOSE_ATTEMPT' }) }];

  const banner = closed ? (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">🏁</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>أُغلقت الفترة المالية — يوليو 2026</div>
        <div className="text-[12px] text-gray-600">اكتملت الدورة المستندية الكاملة (12 مرحلة) — راجع شاشة الإنجاز.</div>
      </div>
    </div>
  ) : (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: allOk ? '#bfe3c9' : '#e0c98a', background: allOk ? '#f2faf5' : '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🔒</span>
        <h3 className="font-bold text-[14px] text-gray-800">قائمة تحقّق الإغلاق الشهري لمستندات المخازن</h3>
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-[13px]">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={c.ok ? { background: '#e9f7ef', color: '#1e7e34' } : { background: '#fdecee', color: '#b02a37' }}
            >
              {c.ok ? '✓' : '✗'}
            </span>
            <span className={c.ok ? 'text-gray-700' : 'text-gray-500'}>{c.label}</span>
          </li>
        ))}
      </ul>
      {!allOk && <div className="mt-2 text-[12px] font-semibold" style={{ color: '#8a6d1b' }}>لا يُغلق الشهر وبنود ناقصة — النظام سيحجب المحاولة.</div>}
    </div>
  );

  const fieldColumns = [
    [
      { label: 'الفترة', value: 'يوليو 2026' },
      { label: 'المسؤول', value: 'المدير المالي' },
    ],
    [
      { label: 'النطاق', value: 'مستندات المخازن' },
      { label: 'الحالة', value: closed ? 'مُغلقة' : 'مفتوحة' },
    ],
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: state.close.state }}
      actions={actions}
      smartButtons={[]}
      title="الإغلاق المالي — 2026/07"
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={[]}
    />
  );
}

const receivedFromGrn = (grn) => (grn.state === 'done' ? (grn.lot ? grn.lot.qty : PO_QTY) : 0);

/* ── لوحة المطابقة الثلاثية (الأمر · الاستلام · الفاتورة) — البوابة الذهبية ── */
function MatchCell({ label, value, sub, tone }) {
  const color = tone === 'bad' ? '#b02a37' : tone === 'ok' ? '#1e7e34' : '#374151';
  return (
    <div className="rounded-lg border bg-white p-3 text-center" style={{ borderColor: ODOO.border }}>
      <div className="text-[10px] font-mono tracking-wide text-gray-400">{label}</div>
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
        <h3 className="font-bold text-[14px] text-gray-800">المطابقة الثلاثية — أمر الشراء · الاستلام · الفاتورة</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MatchCell label="كمية الأمر" value={`${PO_QTY}`} sub="أمر الشراء" />
        <MatchCell
          label="المستلَم"
          value={`${received}`}
          sub={received ? 'من WH/IN/00001' : 'لم يُستلم بعد'}
          tone={received === PO_QTY ? 'ok' : 'bad'}
        />
        <div className="rounded-lg border bg-white p-3 text-center" style={{ borderColor: ODOO.border }}>
          <div className="text-[10px] font-mono tracking-wide text-gray-400">المفوتَر</div>
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
          <div className="text-[11px] text-gray-500">الكمية المفوترة</div>
        </div>
      </div>
      <div
        className="mt-3 text-[13px] font-semibold rounded px-3 py-2"
        style={matched ? { background: '#e9f7ef', color: '#1e7e34' } : { background: '#fdecee', color: '#b02a37' }}
      >
        {matched
          ? '✓ نجحت المطابقة الثلاثية — جاهزة للترحيل.'
          : `✗ عدم تطابق — لا يمكن الترحيل: المفوتَر ${billed} ≠ المستلَم ${received} (الأمر ${PO_QTY}). يجب تطابق الكميات الثلاث.`}
      </div>
    </div>
  );
}

function PaymentBanner({ total }) {
  return (
    <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
      <span className="text-2xl">💳</span>
      <div>
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>قيد الدفع</div>
        <div className="text-[12px] text-gray-600">
          سُجّلت دفعة بنكية بقيمة <b>{fmt(total)}</b>. بانتظار التسوية لتُعلَّم كـ<b>مدفوعة</b>.
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
            <th className="py-2 text-start font-medium">المنتج</th>
            <th className="py-2 text-end font-medium">الكمية</th>
            <th className="py-2 text-end font-medium">السعر</th>
            <th className="py-2 text-end font-medium">الضرائب</th>
            <th className="py-2 text-end font-medium">الإجمالي الفرعي</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
            <td className="py-2 text-gray-800">{LINE.product}</td>
            <td className="py-2 text-end text-gray-700 whitespace-nowrap">{billed} {LINE.uom}</td>
            <td className="py-2 text-end text-gray-700 whitespace-nowrap">{fmt(LINE.price)}</td>
            <td className="py-2 text-end text-gray-700">{LINE.tax}</td>
            <td className="py-2 text-end font-semibold text-gray-800 whitespace-nowrap">{fmt(billed * LINE.price)}</td>
          </tr>
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

function OtherInfo({ paymentStatus }) {
  const rows = [
    ['المورّد', 'مختبرات الخليج للتجميل'],
    ['مرجع الدفع', SAMPLE_PO.vendorRef],
    ['حالة الدفع', paymentStatus],
    ['بنك المستفيد', 'مصرف الجمهورية — ****0155'],
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

/* ── نافذة تسجيل الدفعة ───────────────────────────────────────────────────── */
function PaymentModal({ total, onClose, onConfirm }) {
  const row = (label, value) => (
    <div className="flex flex-col gap-1">
      <span className="text-gray-500">{label}</span>
      <div className="border rounded px-2 py-1.5 bg-gray-50 text-gray-800" style={{ borderColor: ODOO.border }}>{value}</div>
    </div>
  );
  return (
    <OdooWizard
      title="تسجيل الدفعة"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onConfirm} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.purple }}>
            إنشاء الدفعة
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-gray-600 rounded px-3 py-1.5 border" style={{ borderColor: ODOO.border }}>
            إلغاء
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
        {row('اليومية', 'المصرف')}
        {row('طريقة الدفع', 'يدوي')}
        {row('تاريخ الدفع', SAMPLE_PO.receiptDate)}
        {row('المبلغ', fmt(total))}
      </div>
      <div className="mt-3 text-[13px]">
        <span className="text-gray-500">ملاحظة: </span>
        <b className="text-gray-800">{SAMPLE_PO.name}</b>
      </div>
    </OdooWizard>
  );
}

/* ── تطبيق المحاسبة: الفواتير + الإشعار الدائن + الإغلاق المالي ───────────── */
export default function AccountingApp({ state, dispatch }) {
  const { bill, acctView, grn } = state;
  if (acctView === 'refund') return <RefundForm state={state} dispatch={dispatch} />;
  if (acctView === 'close') return <CloseView state={state} dispatch={dispatch} />;
  const received = receivedFromGrn(grn);
  const billed = bill.billedQty;
  const matched = billed === PO_QTY && billed === received;

  const untaxed = billed * LINE.price;
  const tax = untaxed * 0.15;
  const total = untaxed + tax;

  if (acctView === 'list') {
    const columns = [
      { key: 'ref', label: 'الرقم' },
      { key: 'vendor', label: 'المورّد' },
      { key: 'source', label: 'المستند المصدر' },
      { key: 'total', label: 'الإجمالي', align: 'right' },
      { key: '_status', label: 'الحالة', align: 'right' },
    ];
    const rows = bill.created
      ? [{ id: 1, ref: bill.state === 'draft' ? 'مسودة' : BILL_REF, vendor: 'مختبرات الخليج للتجميل', source: SAMPLE_PO.name, total: fmt(total), state: bill.state === 'in_payment' ? 'done' : bill.state === 'posted' ? 'ready' : 'draft' }]
      : [];
    return (
      <OdooListView
        columns={columns}
        rows={rows}
        onOpenRow={() => dispatch({ type: 'ACCT_OPEN_FORM' })}
        emptyText="لا توجد فواتير مورّدين بعد — افتح أمر الشراء المؤكّد واضغط «إنشاء فاتورة»."
      />
    );
  }

  /* عرض النموذج */
  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'posted', label: 'مُرحّلة' },
    { key: 'in_payment', label: 'قيد الدفع' },
  ];

  let actions = [];
  if (bill.state === 'draft') {
    actions = [
      { label: 'ترحيل', primary: true, onClick: () => dispatch({ type: 'POST_BILL' }) },
      { label: 'إلغاء', onClick: () => {} },
    ];
  } else if (bill.state === 'posted') {
    actions = [
      { label: 'تسجيل الدفعة', primary: true, onClick: () => dispatch({ type: 'OPEN_WIZARD', which: 'payment' }) },
      { label: 'إعادة إلى مسودة', onClick: () => {} },
    ];
  } else {
    actions = [{ label: 'إعادة إلى مسودة', onClick: () => {} }];
  }

  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'المستند المصدر', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];
  if (bill.state !== 'draft') smartButtons.push({ icon: '📒', value: '1', label: 'قيد اليومية', onClick: () => {} });
  if (state.returnDoc.state === 'done') smartButtons.push({ icon: '↩️', value: CN_REF, label: 'إشعار دائن', onClick: () => dispatch({ type: 'OPEN_REFUND' }) });

  const paymentStatus = bill.state === 'in_payment' ? 'قيد الدفع' : bill.state === 'posted' ? 'غير مدفوعة' : 'مسودة';

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
      { label: 'المورّد', value: 'مختبرات الخليج للتجميل' },
      { label: 'مرجع الفاتورة', value: SAMPLE_PO.vendorRef },
      { label: 'المستند المصدر', value: SAMPLE_PO.name },
    ],
    [
      { label: 'تاريخ الفاتورة', value: SAMPLE_PO.receiptDate },
      { label: 'تاريخ الاستحقاق', value: '2026-08-15' },
      { label: 'حالة الدفع', value: paymentStatus },
    ],
  ];

  const notebook = [
    { name: 'بنود الفاتورة', content: <InvoiceLines billed={billed} untaxed={untaxed} tax={tax} total={total} /> },
    { name: 'معلومات أخرى', content: <OtherInfo paymentStatus={paymentStatus} /> },
  ];

  return (
    <>
      <OdooFormView
        statusbar={{ stages, current: bill.state }}
        actions={actions}
        smartButtons={smartButtons}
        title={bill.state === 'draft' ? 'مسودة الفاتورة' : BILL_REF}
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
