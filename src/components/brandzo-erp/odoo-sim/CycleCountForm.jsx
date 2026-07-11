import React from 'react';
import { ODOO, SAMPLE_PO, CC_REF, ADJ_REF, CC_SYSTEM_QTY, CC_LOT } from './odooTheme.js';
import OdooFormView from './OdooFormView.jsx';

const LINE = SAMPLE_PO.lines[0];

/* ورقة الجرد الدوري (المرحلة 09) — تجميد الرصيد، عدّ فعلي، مقارنة بالنظام. */
export default function CycleCountForm({ state, dispatch }) {
  const cc = state.cycleCount;
  const started = cc.state !== 'none';
  const validated = cc.state === 'validated';
  const variance = cc.counted === null || cc.counted === '' ? null : Number(cc.counted) - CC_SYSTEM_QTY;

  const stages = [
    { key: 'none', label: 'مسودة' },
    { key: 'in_progress', label: 'قيد العدّ' },
    { key: 'validated', label: 'مُصادَق' },
  ];

  let actions = [];
  if (!started) {
    actions = [{ label: 'بدء مهمة الجرد (تجميد الرصيد)', primary: true, onClick: () => dispatch({ type: 'CC_START' }) }];
  } else if (!validated) {
    actions = [{ label: 'تصديق ورقة الجرد', primary: true, onClick: () => dispatch({ type: 'CC_VALIDATE' }) }];
  } else {
    actions = [{ label: 'طباعة محضر الجرد', onClick: () => {} }];
  }

  const smartButtons = validated && state.adjustment.state !== 'none' && state.adjustment.qty !== 0
    ? [{ icon: '⚖️', value: ADJ_REF, label: 'سند التسوية', onClick: () => dispatch({ type: 'OPEN_ADJUSTMENT' }) }]
    : [];

  const banner = (
    <div
      className="mb-6 rounded-lg border p-4"
      style={validated
        ? { borderColor: '#bfe3c9', background: '#e9f7ef' }
        : { borderColor: '#cdb8c6', background: ODOO.purpleSoft }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">🔢</span>
        <h3 className="font-bold text-[14px] text-gray-800">
          {validated ? 'اكتمل الجرد الدوري' : 'الجرد الدوري الموجّه — بديل الجرد السنوي المعطّل'}
        </h3>
      </div>
      {!validated ? (
        <p className="text-[12px] text-gray-600 leading-relaxed">
          {started
            ? <>رصيد الدفعة <b className="font-mono" dir="ltr">{CC_LOT}</b> مجمّد مؤقتاً. عُدّ الوحدات بالباركود وأدخل <b>العدّ الفعلي</b> في الجدول أدناه، ثم صدّق.</>
            : <>مهمة جرد دورية للأصناف عالية الدوران (فئة A). عند البدء يُجمَّد رصيد الموقع حتى اعتماد النتيجة.</>}
        </p>
      ) : (
        <p className="text-[12px] text-gray-600 leading-relaxed">
          {variance === 0
            ? <>العدّ الفعلي يطابق النظام — لا فروقات ولا حاجة لسند تسوية.</>
            : <>فارق <b style={{ color: '#b02a37' }}>{variance > 0 ? `+${variance}` : variance} وحدة</b> — أُنشئ سند التسوية <b className="font-mono" dir="ltr">{ADJ_REF}</b> (يلزم اعتماد المدير المالي).</>}
        </p>
      )}
    </div>
  );

  const fieldColumns = [
    [
      { label: 'مدقّق الجرد', value: 'لجنة الجرد — مدقّق A' },
      { label: 'الموقع', value: 'WH/Stock/Rack-A' },
      { label: 'الاستراتيجية', value: 'جرد دوري ABC — فئة A' },
    ],
    [
      { label: 'تاريخ الجرد', value: '2026-07-20' },
      { label: 'حالة الرصيد', value: started ? 'مجمّد للجرد' : 'نشط' },
      { label: 'الشركة', value: 'براندزو هَب' },
    ],
  ];

  const notebook = [
    {
      name: 'بنود العدّ',
      content: (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-gray-500 border-b" style={{ borderColor: ODOO.border }}>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-start font-medium ps-4">الدفعة</th>
              <th className="py-2 text-end font-medium">رصيد النظام</th>
              <th className="py-2 text-end font-medium">العدّ الفعلي</th>
              <th className="py-2 text-end font-medium">الفارق</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: ODOO.borderSoft }}>
              <td className="py-2 text-gray-800">{LINE.product}</td>
              <td className="py-2 ps-4 text-gray-700 font-mono" dir="ltr">{CC_LOT}</td>
              <td className="py-2 text-end text-gray-700 whitespace-nowrap">{CC_SYSTEM_QTY} {LINE.uom}</td>
              <td className="py-2 text-end">
                {validated ? (
                  <span className="font-semibold text-gray-800">{cc.counted} {LINE.uom}</span>
                ) : (
                  <input
                    type="number"
                    disabled={!started}
                    value={cc.counted === null ? '' : cc.counted}
                    onChange={(e) => dispatch({ type: 'CC_SET_COUNT', qty: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder={started ? 'أدخل العدّ' : '—'}
                    className="w-24 text-center border rounded px-2 py-1 text-[13px] font-bold text-gray-800 focus:outline-none disabled:bg-gray-100"
                    style={{ borderColor: ODOO.border }}
                  />
                )}
              </td>
              <td className="py-2 text-end font-bold whitespace-nowrap" style={{ color: variance === null ? '#9ca3af' : variance === 0 ? '#1e7e34' : '#b02a37' }}>
                {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
              </td>
            </tr>
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <OdooFormView
      statusbar={{ stages, current: cc.state }}
      actions={actions}
      smartButtons={smartButtons}
      title={CC_REF}
      banner={banner}
      fieldColumns={fieldColumns}
      notebook={notebook}
    />
  );
}
