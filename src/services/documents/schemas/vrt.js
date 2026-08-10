/**
 * مخطّط إرجاع المتبقّي للمستودع (VRT) — المستند الذي يُصفّر المركبة.
 *
 * ما يقع عند إنجازه: `VAN:‹لوحة› ← المستودع`. وهو أهمّ مستندٍ في الدورة رقابيًّا،
 * لأنّه الوحيد الذي يُنهي العهدة. فما لم يقع، تبقى بضاعةٌ مقيَّدة على مركبةٍ
 * أُقفلت رحلتها — لا المستودع يطالب بها ولا المندوب مسؤول عنها. وهكذا يُولد
 * العجز الذي لا صاحب له.
 *
 * ولذلك **ينجزه المستودع لا المندوب**: من يُقرّ الاستلام غير من يُقرّ التسليم.
 * المندوب ينشئ ما يزعم إرجاعه، وأمين المخزن يُثبت ما استلمه فعلًا — والفرق
 * بينهما يظهر رقمًا في التسوية، لا يُبتلع في توقيعٍ واحد.
 *
 * `qty` هي **الكمية المستلَمة فعلًا** لا المعلَنة: يُقيَّد ما وصل الرفّ، وما نقص
 * يبقى على المركبة رصيدًا ظاهرًا يمنع الإقفال حتى يُفسَّر.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات الإرجاع: فرقٌ بين المعلَن والمستلَم (عجزٌ يلزمه سبب) · تالفٌ يُعاد
 * إلى رفّ البيع (مصيره الإتلاف لا الرفّ) · بلا لوحةٍ أو مستودع.
 */
export function vrtWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  const lines = (doc?.lines || []).filter((l) => Number(l?.qty) > 0 || Number(l?.qtyDeclared) > 0);

  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد من أين يعود الرصيد — لا إرجاع بلا لوحة');
  if (!String(h.warehouse || '').trim()) out.push('المستودع المستلِم يُحدّد إلى أين يعود الرصيد');

  const short = lines.filter((l) => {
    const declared = Number(l?.qtyDeclared) || 0;
    const received = Number(l?.qty) || 0;
    return declared > 0 && Math.abs(declared - received) > 0.0001;
  });
  if (short.length) {
    out.push(`${short.length} بندًا يختلف فيه المعلَن عن المستلَم — الفرق يبقى على المركبة حتى يُفسَّر`);
  }

  const damagedToStock = lines.filter(
    (l) => ['تالف', 'منتهي', 'كسر'].includes(String(l?.condition || '').trim()) && String(l?.disposition || '').trim() === 'إعادة للمخزون'
  );
  if (damagedToStock.length) {
    out.push(`${damagedToStock.length} بندًا تالفًا أو منتهيًا مقترحٌ لرفّ البيع — مصيره سند تالف (DMG) لا الرفّ`);
  }

  return out;
}

const schema = {
  type: 'VRT',
  stage: 9,
  titleAr: 'إرجاع متبقّي المركبة',
  titleEn: 'Van Return to Warehouse',
  formCode: 'BFP-VRT-001',
  orientation: 'portrait',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['warehouse_manager', 'sales_supervisor'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الإرجاع — Return Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'returnDate', label: 'تاريخ الإرجاع (Return Date)', kind: 'date', required: true },
        { key: 'warehouse', label: 'المستودع المستلِم (Receiving Warehouse)', kind: 'text', required: true },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text', required: true },
        {
          key: 'whOfficer',
          label: 'أمين المخزن المستلِم (WH Officer)',
          kind: 'identity',
          source: 'completer',
          hint: 'يُملأ من حساب من أنجز الاستلام — لا من أنشأ المستند',
        },
      ],
    },

    {
      key: 'custody',
      title: '🛵 المركبة المُرجِعة — Returning Vehicle',
      kind: 'fields',
      columns: 3,
      note: 'ما يُقيَّد هنا هو المستلَم فعلًا؛ وما نقص يبقى على المركبة يمنع إقفال الرحلة.',
      fields: [
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'repName', label: 'اسم المندوب (Sales Rep)', kind: 'text', required: true },
        { key: 'odoEnd', label: 'عدّاد الكيلومترات (Odometer)', kind: 'number' },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الإرجاع — Return Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '19%' },
        { key: 'qtyDeclared', label: 'المعلَن من المندوب', kind: 'number', width: '10%' },
        { key: 'qty', label: 'المستلَم فعلًا', kind: 'number', width: '10%' },
        {
          key: 'shortage',
          label: 'الفرق',
          kind: 'computed',
          compute: (line) => (Number(line?.qty) || 0) - (Number(line?.qtyDeclared) || 0),
          width: '7%',
        },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'الصلاحية', kind: 'date', width: '10%' },
        { key: 'condition', label: 'الحالة', kind: 'select', options: ['سليم', 'تالف', 'منتهي', 'كسر'], width: '7%' },
        { key: 'unitCost', label: 'التكلفة', kind: 'number', width: '6%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalDeclared', label: 'إجمالي المعلَن', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyDeclared') },
        { key: 'totalReceived', label: 'إجمالي المستلَم', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
      ],
      extraFields: [{ key: 'shortageReason', label: 'سبب الفرق إن وُجد (Shortage Reason)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب المُرجِع (Sales Rep)', source: null },
    { key: 'whOfficer', label: 'أمين المخزن المستلِم (WH Officer)', source: 'completer' },
  ],

  attachments: [{ key: 'signedCopy', kind: 'signedCopy', label: 'نسخة محضر الإرجاع موقّعة' }],

  warnings: vrtWarnings,
};

export default schema;
