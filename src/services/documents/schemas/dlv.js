/**
 * مخطّط محضر التسليم للمستفيد (DLV) — المرحلة 05 (الأخيرة) من دورة المشتريات
 * الداخلية.
 *
 * بعد الصرف والشراء، يسلّم فريقُ المشتريات المشترياتِ للمستفيد، فيوقّع
 * المستفيد بالاستلام. الرقم `DLV-2026-####`. بهذا تُغلَق الدورة.
 *
 * مرجعه الإلزاميّ سندُ الصرف (`pvRef`) — فلا تسليمَ قبل صرفٍ معتمَد. اعتماده
 * حقُّ المستفيد (الإدارة الطالبة): توقيعه هو إقرارُ الاستلام.
 */

/** عدد البنود المسلّمة (لها وصف وكمية). */
export function deliveredCount(lines) {
  return (lines || []).filter(
    (l) => String(l?.description || '').trim() && Number(l?.qty) > 0
  ).length;
}

/** تحذيرات المحضر: بلا بنود، أو بندٌ سُجّلت حالته «تالف جزئي» دون ملاحظة. */
export function dlvWarnings(doc) {
  const out = [];
  if (deliveredCount(doc?.lines) === 0) {
    out.push('لا بنود مسلّمة — أدرِج ما سُلّم فعلًا للمستفيد');
  }
  const damaged = (doc?.lines || []).filter((l) => String(l?.condition || '').includes('تالف'));
  if (damaged.some((l) => !String(l?.notes || '').trim())) {
    out.push('بندٌ بحالة «تالف جزئي» بلا ملاحظة — وثّق نوع الخلل');
  }
  return out;
}

const schema = {
  type: 'DLV',
  stage: 5,
  titleAr: 'محضر تسليم للمستفيد',
  titleEn: 'Beneficiary Delivery Note',
  formCode: 'BFP-DLV-001',
  orientation: 'portrait',

  /** التسليم يعدّه المشتريات، ويقرّ باستلامه المستفيد (الإدارة الطالبة). */
  roles: {
    create: ['purchase_officer', 'warehouse_manager'],
    approve: ['department_user', 'warehouse_manager'],
    complete: ['purchase_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات التسليم — Delivery Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'deliveryDate', label: 'تاريخ التسليم (Delivery Date)', kind: 'date', required: true },
        {
          key: 'pvRef',
          label: 'رقم سند الصرف المرجعي (PV Ref.)',
          kind: 'docref',
          docType: 'PV',
          required: true,
          hint: 'اكتب رقم سند الصرف (PV-…) — لا تسليمَ قبل صرفٍ معتمَد',
        },
        {
          key: 'ipoRef',
          label: 'رقم أمر الشراء (IPO Ref.)',
          kind: 'docref',
          docType: 'IPO',
          hint: 'يُملأ من سلسلة الروابط — مرجع أمر الشراء',
        },
        { key: 'department', label: 'الإدارة المستلِمة (Receiving Dept.)', kind: 'text', required: true },
        { key: 'beneficiary', label: 'اسم المستفيد (Beneficiary)', kind: 'text', required: true },
        {
          key: 'handedBy',
          label: 'سلّمه (Handed By)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أعدّ المحضر',
        },
      ],
      extraFields: [
        { key: 'notes', label: 'ملاحظات التسليم (Delivery Notes)', kind: 'textarea' },
      ],
    },

    {
      key: 'lines',
      title: '📦 الأصناف المسلّمة — Delivered Items',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'description', label: 'الصنف المسلّم (Description)', kind: 'text', width: '38%' },
        { key: 'qty', label: 'الكمية', kind: 'number', width: '13%' },
        { key: 'uom', label: 'الوحدة', kind: 'text', width: '12%' },
        {
          key: 'condition',
          label: 'الحالة',
          kind: 'select',
          options: ['سليم', 'تالف جزئي'],
          width: '15%',
        },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '22%' },
      ],
    },
  ],

  signatures: [
    { key: 'handedBy', label: 'سلّمه (فريق المشتريات)', source: 'creator' },
    { key: 'receivedBy', label: 'استلمه المستفيد (Received By)', source: 'approver' },
    { key: 'witness', label: 'شاهد (Witness)', source: null },
  ],

  warnings: dlvWarnings,
};

export default schema;
