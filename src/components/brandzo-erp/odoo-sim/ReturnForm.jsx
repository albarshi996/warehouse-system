import React from 'react';
import { ODOO, SAMPLE_PO, RET_REF, CN_REF, RETURN_QTY } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

const REASONS = [
  { key: 'good', label: 'سليم — يُعاد للمخزون', icon: '✅' },
  { key: 'damaged', label: 'تالف — تقرير تلف + إرجاع للمورّد', icon: '💥' },
  { key: 'expired', label: 'منتهي الصلاحية — إعدام', icon: '⏳' },
];

/* لوحة تصنيف المرتجع — التصنيف يحدّد مسار المعالجة (إلزامي قبل الاعتماد). */
function ClassifyBanner({ ret, dispatch }) {
  if (ret.state === 'done') {
    return (
      <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
        <span className="text-2xl">✅</span>
        <div>
          <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>صُدّق إشعار المرتجع — {RETURN_QTY} وحدة تالفة تُعاد للمورّد</div>
          <div className="text-[12px] text-gray-600">
            أُنشئ تقرير البضاعة التالفة، ومسودة إشعار دائن <b className="font-mono" dir="ltr">{CN_REF}</b> في المحاسبة مربوطة بفاتورة المورّد.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#e0c98a', background: '#fdf6e3' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">↩️</span>
        <h3 className="font-bold text-[14px] text-gray-800">تصنيف المرتجع — {RETURN_QTY} وحدة من العميل</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        أعاد العميل {RETURN_QTY} وحدة (عيب مصنعي). <b>لا اعتماد لمرتجع دون تصنيف</b> — التصنيف يحدّد المسار:
        مخزون / إرجاع للمورّد مع إشعار دائن / إعدام.
      </p>
      <div className="space-y-2">
        {REASONS.map((r) => {
          const sel = ret.reason === r.key;
          return (
            <button
              key={r.key}
              type="button"
              disabled={ret.state !== 'draft'}
              onClick={() => dispatch({ type: 'RETURN_CLASSIFY', reason: r.key })}
              className="w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-right transition-colors bg-white"
              style={sel ? { borderColor: ODOO.purple, boxShadow: `0 0 0 1px ${ODOO.purple} inset` } : { borderColor: ODOO.border }}
            >
              <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: sel ? ODOO.purple : '#c4c4c4' }}>
                {sel && <span className="w-2 h-2 rounded-full" style={{ background: ODOO.purple }} />}
              </span>
              <span className="text-lg leading-none">{r.icon}</span>
              <span className="text-[13px] text-gray-800 font-medium">{r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* إشعار المرتجع (المرحلة 08) — Return Note بمساري الاعتماد والتصديق. */
export default function ReturnForm({ state, dispatch }) {
  const ret = state.returnDoc;

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'approved', label: 'معتمد' },
    { key: 'done', label: 'مكتمل' },
  ];

  let actions = [];
  if (ret.state === 'draft') {
    actions = [
      { label: 'اعتماد المرتجع (مدير المستودع)', primary: true, onClick: () => dispatch({ type: 'RETURN_APPROVE' }) },
      { label: 'تصديق', onClick: () => dispatch({ type: 'RETURN_VALIDATE' }) },
    ];
  } else if (ret.state === 'approved') {
    actions = [{ label: 'تصديق', primary: true, onClick: () => dispatch({ type: 'RETURN_VALIDATE' }) }];
  } else {
    actions = [{ label: 'طباعة إشعار المرتجع', onClick: () => {} }];
  }

  const smartButtons = [
    { icon: '🚛', value: 'WH/OUT/00001', label: 'إذن التسليم المصدر', onClick: () => dispatch({ type: 'OPEN_DELIVERY' }) },
  ];
  if (ret.state === 'done') {
    smartButtons.push({ icon: '🧾', value: CN_REF, label: 'الإشعار الدائن', onClick: () => dispatch({ type: 'OPEN_REFUND' }) });
    smartButtons.push({ icon: '💥', value: 'معتمد', label: 'تقرير بضاعة تالفة', onClick: () => {} });
  }

  const banner = <ClassifyBanner ret={ret} dispatch={dispatch} />;

  const reasonLabel = ret.reason ? (REASONS.find((r) => r.key === ret.reason) || {}).label : '— (مطلوب)';

  const fieldColumns = [
    [
      { label: 'المرتجع من', value: 'براندزو للتجزئة — بنغازي' },
      { label: 'المستند المصدر', value: 'WH/OUT/00001' },
      { label: 'التصنيف', value: reasonLabel },
    ],
    [
      { label: 'تاريخ الاستلام', value: '2026-07-18' },
      { label: 'الوجهة', value: ret.reason === 'good' ? 'WH/Stock' : 'WH/Quarantine → المورّد' },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [
    {
      name: 'العمليات',
      content: (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-end font-medium">الكمية المرتجعة</th>
              <th className="py-2 text-start font-medium ps-4">الدفعة</th>
              <th className="py-2 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{LINE.product}</td>
              <td className="py-2 text-end font-semibold text-gray-800 whitespace-nowrap">{ret.qty} {LINE.uom}</td>
              <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">{state.delivery.pickedLot || 'LOT-2026-A'}</td>
              <td className="py-2 text-gray-700">{ret.reason === 'damaged' ? 'تالف — عيب مصنعي' : ret.reason ? reasonLabel : 'بانتظار التصنيف'}</td>
            </tr>
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: ret.state }}
      actions={actions}
      smartButtons={smartButtons}
      title={RET_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
