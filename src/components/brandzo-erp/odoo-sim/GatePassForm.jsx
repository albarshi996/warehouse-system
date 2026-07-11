import React from 'react';
import { ODOO, SAMPLE_PO, GP_REF, RETURN_QTY } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

/* لوحة قرار أمن المستودع — القاعدة الذهبية الثالثة. */
function GateBanner({ gp, deliveryDone, dispatch }) {
  if (gp.exited) {
    return (
      <div className="mb-6 rounded-lg border p-4 flex items-center gap-3" style={{ borderColor: '#bfe3c9', background: '#e9f7ef' }}>
        <span className="text-2xl">🚚</span>
        <div>
          <div className="font-bold text-[14px]" style={{ color: ODOO.green }}>خرجت المركبة — سُجّل الخروج بمسح QR</div>
          <div className="text-[12px] text-gray-600">التصريح {GP_REF} مربوط بإذن التسليم WH/OUT/00001. اكتمل الشحن والتوزيع (المرحلة 07).</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-lg border p-4" style={{ borderColor: '#d9c7d3', background: ODOO.purpleSoft }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">🚧</span>
        <h3 className="font-bold text-[14px]" style={{ color: ODOO.purple }}>بوابة المستودع — تصريح الخروج</h3>
      </div>
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed">
        القاعدة الذهبية: <b>لا تخرج أي مركبة من بوابة المستودع دون تصريح خروج معتمد</b> مربوط برقم إذن التسليم.
        {!deliveryDone && <b className="text-red-700"> (إذن التسليم WH/OUT/00001 لم يُصدَّق بعد.)</b>}
      </p>
      <div className="flex flex-wrap gap-2">
        {!gp.approved ? (
          <button type="button" onClick={() => dispatch({ type: 'GP_APPROVE' })} className="text-white text-[13px] font-semibold rounded px-4 py-1.5" style={{ background: ODOO.green }}>
            ✓ اعتماد التصريح (أمن المستودع)
          </button>
        ) : (
          <span className="text-[13px] font-semibold rounded px-3 py-1.5" style={{ color: '#1e7e34', background: '#e9f7ef' }}>
            ✓ التصريح معتمد
          </span>
        )}
        <button type="button" onClick={() => dispatch({ type: 'GP_EXIT_ATTEMPT' })} className="text-[13px] font-semibold rounded px-4 py-1.5 border" style={{ borderColor: ODOO.purple, color: ODOO.purple }}>
          🚚 خروج المركبة من البوابة
        </button>
      </div>
    </div>
  );
}

/* تصريح خروج البوابة (المرحلة 07) — Gate Pass مربوط بإذن التسليم. */
export default function GatePassForm({ state, dispatch }) {
  const gp = state.gatepass;

  const stages = [
    { key: 'draft', label: 'مسودة' },
    { key: 'approved', label: 'معتمد' },
    { key: 'done', label: 'خرجت المركبة' },
  ];
  const current = gp.exited ? 'done' : gp.approved ? 'approved' : 'draft';

  const actions = gp.exited
    ? [{ label: 'طباعة التصريح', onClick: () => {} }]
    : [];

  const smartButtons = [
    { icon: '🚛', value: 'WH/OUT/00001', label: 'إذن التسليم', onClick: () => dispatch({ type: 'OPEN_DELIVERY' }) },
  ];

  const banner = <GateBanner gp={gp} deliveryDone={state.delivery.done} dispatch={dispatch} />;

  const fieldColumns = [
    [
      { label: 'رقم المركبة', value: gp.vehicle },
      { label: 'السائق', value: gp.driver },
      { label: 'إذن التسليم', value: 'WH/OUT/00001' },
    ],
    [
      { label: 'الوجهة', value: 'براندزو للتجزئة — بنغازي' },
      { label: 'إجمالي الكميات', value: `${LINE.qty} ${LINE.uom}` },
      { label: 'المُصدِر', value: 'مشرف الشحن' },
    ],
  ];

  const notebook = [
    {
      name: 'الحمولة',
      content: (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-end font-medium">الكمية</th>
              <th className="py-2 text-start font-medium ps-4">الدفعة</th>
              <th className="py-2 text-start font-medium">المستند</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{LINE.product}</td>
              <td className="py-2 text-end text-gray-700 whitespace-nowrap">{LINE.qty} {LINE.uom}</td>
              <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">{state.delivery.pickedLot || '—'}</td>
              <td className="py-2 text-gray-700 font-mono" dir="ltr">WH/OUT/00001</td>
            </tr>
          </tbody>
        </table>
      ),
    },
    {
      name: 'فحص المركبة اليومي',
      content: (
        <div className="text-[13px] text-gray-700 space-y-1">
          <div>✓ نموذج الفحص اليومي للسائق مُعبّأ في أودو (شرط إصدار التصريح).</div>
          <div>✓ الإطارات والوقود والتبريد: سليمة.</div>
          <div className="text-gray-500 text-[12px]">ملاحظة تدريبية: مرتجع متوقّع من العميل ({RETURN_QTY} وحدة) في رحلة العودة.</div>
        </div>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current }}
      actions={actions}
      smartButtons={smartButtons}
      title={GP_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
