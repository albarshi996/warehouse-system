/**
 * مخطّط تصريح الخروج من البوابة (GP) — المرحلة 07، آخر حلقة في مسار الصرف.
 *
 * الأصل الورقي: `public/forms/form_GatePass.html`.
 *
 * 🏅 **حارس البوابة** — إحدى القواعد الذهبية الستّ: «لا خروج بلا تصريح
 * معتمد». يُفرَض في ثلاث طبقات:
 *   1. **الاشتقاق:** التصريح لا يُنشأ إلا من إذن تسليم **معتمَد** (`chain.js`).
 *   2. **الاعتماد:** الاعتماد لضابط البوابة والمدير — لا لأمين المخزن الذي
 *      أعدّ الشحنة، فلا يُصرّح أحدٌ لبضاعته بنفسه.
 *   3. **قواعد الخادم:** `approveRoles('GP')` في `firestore.rules`.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم تصريح الخروج» كان يُكتب بيد الموظّف ⇒ صار `GP-2026-####`.
 *  · «المستند المرجعي» كان يُنسخ بالقلم ⇒ صار يُشتقّ من إذن التسليم.
 *  · بيانات السائق والمركبة كانت تُعاد كتابتها ⇒ صارت تُورَّث من الإذن.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات التصريح: بلا مستند مرجعي (خروجٌ بلا سند) · بلا هوية سائق
 * (لا يُعرف من خرج) · بندٌ بلا كمية.
 */
export function gateWarnings(doc) {
  const out = [];
  const h = doc?.header || {};

  if (!String(h.refDocument || '').trim() && !String(h.dnRef || '').trim()) {
    out.push('لا مستند مرجعي — التصريح بلا سند لا يُثبت مشروعية الخروج');
  }
  if (!String(h.driverId || '').trim()) {
    out.push('رقم بطاقة السائق غير مُدخل — لا يُعرف من خرج بالبضاعة');
  }

  const lines = (doc?.lines || []).filter((l) => String(l?.description || l?.sku || '').trim());
  const noQty = lines.filter((l) => !(Number(l?.qty) > 0));
  if (noQty.length) out.push(`${noQty.length} بندًا بلا كمية`);

  return out;
}

const schema = {
  type: 'GP',
  stage: 7,
  titleAr: 'تصريح خروج من البوابة',
  titleEn: 'Gate Pass',
  formCode: 'BFP-GP-001',
  orientation: 'portrait',

  /**
   * 🏅 الاعتماد لضابط البوابة والمدير وحدهما — أمين المخزن الذي جهّز
   * الشحنة لا يُصرّح لها. الفصل بين مَن يُعِدّ ومَن يُجيز هو الحارس نفسه.
   */
  roles: {
    create: ['storekeeper', 'warehouse_manager', 'gate_officer'],
    approve: ['gate_officer', 'warehouse_manager'],
    complete: ['gate_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات التصريح — Gate Pass Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issuedAt', label: 'التاريخ والوقت (Date & Time)', kind: 'datetime', required: true },
        {
          key: 'dnRef',
          label: 'المستند المرجعي (إذن التسليم)',
          kind: 'text',
          required: true,
          hint: 'يُملأ تلقائيًّا عند اشتقاق التصريح من إذن تسليم معتمَد',
        },
        { key: 'reason', label: 'سبب الخروج (Reason)', kind: 'select', options: ['تسليم عميل', 'تحويل بين فروع', 'إرجاع لمورّد', 'صيانة', 'أخرى'] },
        { key: 'destination', label: 'الوجهة (Destination)', kind: 'text', required: true },
      ],
    },

    {
      key: 'vehicle',
      title: '🚚 السائق والمركبة — Driver & Vehicle',
      kind: 'fields',
      columns: 4,
      note: 'هوية السائق ولوحة المركبة هما ما يُثبت من خرج وبماذا — لا تصريح بمجهول.',
      fields: [
        { key: 'driverName', label: 'اسم السائق (Driver Name)', kind: 'text', required: true },
        { key: 'driverId', label: 'رقم البطاقة الشخصية (Driver ID)', kind: 'text', required: true },
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'vehicleType', label: 'نوع المركبة (Vehicle Type)', kind: 'text' },
      ],
    },

    {
      key: 'lines',
      title: '📦 البضاعة الخارجة — Outgoing Goods',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '13%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '15%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '32%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '12%' },
        { key: 'refDoc', label: 'المستند المرجعي', kind: 'text', width: '15%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '13%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد البنود', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qty) > 0).length },
        { key: 'totalQty', label: 'إجمالي الكميات الخارجة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qty') },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات (Notes)', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'whOfficer', label: 'مسؤول المستودع (WH Officer)', source: 'creator' },
    { key: 'driver', label: 'السائق (Driver)', source: null },
    { key: 'security', label: 'حارس الأمن — البوابة (Security — Gate)', source: 'approver' },
  ],

  warnings: gateWarnings,
};

export default schema;
