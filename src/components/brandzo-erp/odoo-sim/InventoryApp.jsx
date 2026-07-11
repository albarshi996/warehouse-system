import React, { useState } from 'react';
import { ODOO, SAMPLE_PO, RECEIPT_REF } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';
import OdooListView from './OdooListView.jsx';
import OdooWizard from './OdooWizard.jsx';
import PutawayForm from './PutawayForm.jsx';
import DeliveryForm from './DeliveryForm.jsx';

const GRN_STAGES = [
  { key: 'draft', label: 'مسودة' },
  { key: 'ready', label: 'جاهز' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'waiting_qc', label: 'بانتظار الجودة' },
  { key: 'done', label: 'مكتمل' },
];

const LINE = SAMPLE_PO.lines[0];

/* ── معالج رقم الدفعة/التسلسل + الانتهاء (فرض التتبّع) ────────────────────── */
function LotWizard({ onClose, onSave }) {
  const [done, setDone] = useState(String(LINE.qty));
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!Number(done) || Number(done) <= 0) return setErr('أدخل الكمية المُنجَزة.');
    if (!lot.trim()) return setErr('رقم الدفعة/التسلسل مطلوب.');
    if (!expiry) return setErr('تاريخ الانتهاء مطلوب — عليه تُبنى قاعدة FEFO عند السحب.');
    return onSave({ number: lot.trim(), expiry, qty: Number(done) });
  };

  const input = 'border rounded px-2 py-1.5 text-gray-800 focus:outline-none';
  return (
    <OdooWizard
      title={`العمليات التفصيلية — ${RECEIPT_REF}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={submit} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.purple }}>
            حفظ
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-gray-600 rounded px-3 py-1.5 border" style={{ borderColor: ODOO.border }}>
            تجاهل
          </button>
        </>
      }
    >
      <p className="text-[13px] text-gray-600 mb-3 leading-relaxed">
        سجّل رقم الدفعة وتاريخ الانتهاء للبضاعة المستلمة. يفرض Odoo ذلك للمنتجات المتتبَّعة — فهو يُهيّئ
        <b> قاعدة FEFO</b> (الأقرب انتهاءً يخرج أولاً) عند السحب.
      </p>
      <div className="text-[13px] mb-3">
        <span className="text-gray-500">المنتج: </span>
        <b className="text-gray-800">{LINE.product}</b>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">المُنجَز</span>
          <input type="number" value={done} onChange={(e) => setDone(e.target.value)} className={input} style={{ borderColor: ODOO.border }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">رقم الدفعة/التسلسل</span>
          <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="مثال: LOT-2026-A" className={`${input} font-mono`} style={{ borderColor: ODOO.border }} dir="ltr" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">تاريخ الانتهاء</span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} style={{ borderColor: ODOO.border }} />
        </label>
      </div>
      {err && <div className="mt-3 text-[12px] font-semibold" style={{ color: '#b02a37' }}>{err}</div>}
    </OdooWizard>
  );
}

/* ── تبويب العمليات (بنود الحركة + تنبيه التتبّع) ─────────────────────────── */
function OperationsTab({ grn, dispatch }) {
  const lot = grn.lot;
  const needLot = grn.state === 'in_progress' && !lot;
  return (
    <div>
      {needLot && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
          <span className="text-[12px] font-semibold" style={{ color: '#8a6d1b' }}>
            ⚠ التتبّع مطلوب — سجّل رقم الدفعة/التسلسل وتاريخ الانتهاء.
          </span>
          <button type="button" onClick={() => dispatch({ type: 'OPEN_WIZARD', which: 'lots' })} className="text-white text-[12px] font-semibold rounded px-3 py-1" style={{ background: ODOO.purple }}>
            العمليات التفصيلية
          </button>
        </div>
      )}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
            <th className="py-2 text-start font-medium">المنتج</th>
            <th className="py-2 text-end font-medium">المطلوب</th>
            <th className="py-2 text-end font-medium">المُنجَز</th>
            <th className="py-2 text-start font-medium ps-4">الدفعة/التسلسل</th>
            <th className="py-2 text-start font-medium">الانتهاء</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
            <td className="py-2 text-gray-800">{LINE.product}</td>
            <td className="py-2 text-end text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
            <td className="py-2 text-end font-semibold whitespace-nowrap" style={{ color: lot ? ODOO.green : '#9ca3af' }}>
              {lot ? lot.qty : 0} {LINE.uom}
            </td>
            <td className="py-2 ps-4 text-gray-700 font-mono">{lot ? lot.number : '—'}</td>
            <td className="py-2 text-gray-700">{lot ? lot.expiry : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AdditionalInfo() {
  const rows = [
    ['المسؤول', 'محمد البرشي'],
    ['مجموعة التوريد', SAMPLE_PO.name],
    ['نوع العملية', 'براندزو هَب: عمليات الاستلام'],
    ['الأولوية', 'عادية'],
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

/* ── لوحة مفتّش الجودة (بانتظار الجودة) — البوابة الذهبية ──────────────────── */
function QCPanel({ grn, dispatch }) {
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#d9c7d3', background: ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">🔬</span>
        <h3 className="font-bold text-[14px]" style={{ color: ODOO.purple }}>مراقبة الجودة — قرار المفتّش</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        القاعدة الذهبية: لا يُعتمد هذا الاستلام (مكتمل) حتى يوافق مفتّش الجودة على البضاعة.
        قيد المراجعة الدفعة <b className="font-mono">{grn.lot ? grn.lot.number : '—'}</b> (انتهاء {grn.lot ? grn.lot.expiry : '—'}).
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => dispatch({ type: 'QC_APPROVE' })} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.green }}>
          ✓ اعتماد — اجتياز الفحص
        </button>
        <button type="button" onClick={() => dispatch({ type: 'QC_REJECT' })} className="text-[13px] font-semibold rounded px-4 py-1.5 border" style={{ borderColor: '#d33', color: '#d33' }}>
          ✗ رفض — فشل (حجر صحي)
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
        <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>تم اعتماد الاستلام (مكتمل)</div>
        <div className="text-[12px] text-gray-600">
          اجتازت الجودة. التالي: <b>التخزين (المرحلة 05)</b> — استخدم زر «التخزين» الذكي أعلاه.
        </div>
      </div>
    </div>
  );
}

/* ── تطبيق المخزون: قائمة عمليات الاستلام + نموذج الاستلام (GRN) ───────────── */
export default function InventoryApp({ state, dispatch }) {
  const { grn, invView } = state;

  if (invView === 'list') {
    const columns = [
      { key: 'ref', label: 'المرجع' },
      { key: 'source', label: 'المستند المصدر' },
      { key: 'contact', label: 'الاستلام من' },
      { key: 'date', label: 'التاريخ المجدول' },
      { key: '_status', label: 'الحالة', align: 'right' },
    ];
    const rows = grn.created
      ? [{ id: 1, ref: RECEIPT_REF, source: SAMPLE_PO.name, contact: 'مختبرات الخليج للتجميل', date: SAMPLE_PO.receiptDate, state: grn.state }]
      : [];
    return (
      <OdooListView
        columns={columns}
        rows={rows}
        onOpenRow={() => dispatch({ type: 'INV_OPEN_FORM' })}
        emptyText="لا توجد عمليات استلام بعد — أكّد أمر الشراء أولاً (تطبيق المشتريات)."
      />
    );
  }

  if (invView === 'putaway') return <PutawayForm state={state} dispatch={dispatch} />;
  if (invView === 'delivery') return <DeliveryForm state={state} dispatch={dispatch} />;

  /* عرض نموذج الاستلام (GRN) */
  const lotDone = !!grn.lot;

  let actions = [];
  if (grn.state === 'draft') {
    actions = [
      { label: 'تحديد كـ«للتنفيذ»', primary: true, onClick: () => dispatch({ type: 'GRN_MARK_TODO' }) },
      { label: 'تصديق', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'ready') {
    actions = [
      { label: 'بدء', primary: true, onClick: () => dispatch({ type: 'GRN_START' }) },
      { label: 'تصديق', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'in_progress') {
    actions = [
      lotDone
        ? { label: 'إرسال لمراقبة الجودة', primary: true, onClick: () => dispatch({ type: 'GRN_SEND_QC' }) }
        : { label: 'العمليات التفصيلية', primary: true, onClick: () => dispatch({ type: 'OPEN_WIZARD', which: 'lots' }) },
      { label: 'تصديق', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) },
    ];
  } else if (grn.state === 'waiting_qc') {
    actions = [{ label: 'تصديق', onClick: () => dispatch({ type: 'GRN_VALIDATE_ATTEMPT' }) }];
  } else if (grn.state === 'done') {
    actions = [
      { label: 'إرجاع', onClick: () => {} },
      { label: 'طباعة الملصقات', onClick: () => {} },
    ];
  }

  const smartButtons = [{ icon: '🧾', value: SAMPLE_PO.name, label: 'المستند المصدر', onClick: () => dispatch({ type: 'OPEN_APP', app: 'purchase' }) }];
  if (grn.qc) {
    smartButtons.push({ icon: grn.qc === 'passed' ? '✅' : '⛔', value: grn.qc === 'passed' ? 'ناجح' : 'فاشل', label: 'فحص الجودة', onClick: () => {} });
  }
  if (grn.state === 'done') {
    smartButtons.push({ icon: '📥', value: '1', label: 'التخزين', onClick: () => dispatch({ type: 'OPEN_PUTAWAY' }) });
  }

  let banner = null;
  if (grn.state === 'waiting_qc') banner = <QCPanel grn={grn} dispatch={dispatch} />;
  else if (grn.state === 'done') banner = <DoneBanner />;

  const fieldColumns = [
    [
      { label: 'الاستلام من', value: 'مختبرات الخليج للتجميل' },
      { label: 'المستند المصدر', value: SAMPLE_PO.name },
      { label: 'نوع العملية', value: 'براندزو هَب: عمليات الاستلام' },
    ],
    [
      { label: 'التاريخ المجدول', value: SAMPLE_PO.receiptDate },
      { label: 'الوجهة', value: 'WH/Stock' },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [
    { name: 'العمليات', content: <OperationsTab grn={grn} dispatch={dispatch} /> },
    { name: 'معلومات إضافية', content: <AdditionalInfo /> },
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
