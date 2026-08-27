/**
 * مخطّط محضر فرق النقل (TDR) — الفرق يبقى مفتوحًا حتى صدور قرار.
 *
 * ═══ ولماذا مستندٌ جديد وTRC يسجّل الفروق أصلًا؟ ═══
 * TRC يسجّل فرق **الكمّيّة** بندًا بندًا ويُبقي النقص عالقًا في مخزن النقل —
 * وهذا صحيحٌ ويبقى كما هو. لكنّه لا يملك حقلًا لثلاثة أشياء يطلبها نصّ خطة ٧
 * صراحةً (سادسًا):
 *   ①**فرقُ الطبالي** — طبليةٌ ناقصةٌ أو زائدةٌ أو مكسورةُ الختم: فرقٌ لا
 *     يُقاس بالكمّيّة بل بالحمولة، وقد يقع بلا فرقِ كمّيّةٍ أصلًا.
 *   ②**الطرفُ الذي يتحمّل** — المصدر أم الناقل أم الوجهة. وبلا تسميته يبقى
 *     الفرق بلا صاحب، فلا يُطالَب أحدٌ ولا يتحسّن شيء.
 *   ③**الحركةُ التصحيحية المعتمَدة** — ما الذي فُعل بالفرق بعد حسمه.
 *
 * فهذا المستند **يكمّل TRC ولا ينافسه**: ذاك يقول «كم نقص»، وهذا يقول
 * «أيّ حمولةٍ ضاعت، ومن يتحمّلها، وماذا فُعل».
 *
 * ⚖️ ولا يقيّد حركةً مخزنيّة: القيدُ وقع في TRN وTRC، والفرقُ العالق ظاهرٌ
 * في مخزن النقل. وهذا محضرٌ رقابيّ — إدراجه في جدول القيد يحرّك البضاعة
 * مرّتين (نفس علّة استبعاد GP وVSR).
 */

/** أنواع الفروق — مقيَّدةٌ بقائمة، فتقريرُ الأسباب يُجمَع ولا يتبعثر. */
export const DISCREPANCY_KINDS = Object.freeze([
  'طبلية ناقصة',
  'طبلية زائدة',
  'صنف غير مطابق',
  'دفعة مختلفة',
  'كمّيّة ناقصة',
  'كمّيّة زائدة',
  'تلف',
  'كسر في الختم',
  'فتحٌ غير معتمَد للطبلية',
]);

/** الأطراف التي قد تتحمّل الفرق. */
export const LIABLE_PARTIES = Object.freeze(['المستودع المصدر', 'الناقل', 'المستودع الوجهة', 'قيد التحقيق', 'يُشطب بقرار']);

/** عدد الفروق غير المحسومة — عمودٌ محسوب لا يُكتب بالقلم. */
export function openDiscrepancies(lines) {
  return (lines || []).filter((l) => !String(l?.decision || '').trim()).length;
}

/**
 * تحذيرات المحضر — تُعرض ولا تمنع، عدا ما يمنعه حارس الإنجاز أدناه.
 */
export function discrepancyWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];
  if (!lines.length) return ['لا فرقَ مسجَّل — محضرٌ بلا فرقٍ لا معنى له'];

  const open = openDiscrepancies(lines);
  if (open) out.push(`${open} فرقًا بلا قرار — لا يُغلق أمر النقل حتى تُحسم (القاعدة ١٥)`);

  const noLiability = lines.filter((l) => String(l?.decision || '').trim() && !String(l?.liability || '').trim());
  if (noLiability.length) out.push(`${noLiability.length} فرقًا محسومًا بلا تحديد الطرف المتحمِّل — الفرق بلا صاحبٍ لا يُطالَب به أحد`);

  const unknownKind = lines.filter((l) => l?.kind && !DISCREPANCY_KINDS.includes(l.kind));
  if (unknownKind.length) out.push(`${unknownKind.length} فرقًا بنوعٍ خارج القائمة المعتمَدة`);

  return out;
}

/**
 * ★★★ حارسُ الإنجاز: **لا يُنجَز محضرٌ فيه فرقٌ بلا قرار.**
 *
 * وهذا ليس تشدّدًا: محضرُ فروقٍ يُغلق وفيه فرقٌ معلَّق يعني أنّ البضاعة
 * ضاعت وأُغلق ملفّها — وهو ما يجعل السجلّ كلّه غير جدير بالثقة بعد سنة.
 */
export function completionProblems(doc) {
  const out = [];
  const lines = doc?.lines || [];
  if (!lines.length) out.push('لا فرقَ مسجَّل — لا شيء يُحسم');
  const open = openDiscrepancies(lines);
  if (open) out.push(`${open} فرقًا بلا قرار — احسمها قبل الإنجاز (القاعدة ١٥: أيّ فرقٍ يبقى مفتوحًا حتى صدور قرار)`);
  const noLiability = lines.filter((l) => !String(l?.liability || '').trim());
  if (noLiability.length) out.push(`${noLiability.length} فرقًا بلا طرفٍ متحمِّل — سمِّه ولو «قيد التحقيق»`);
  return out;
}

const schema = {
  type: 'TDR',
  stage: 8,
  titleAr: 'محضر فرق النقل',
  titleEn: 'Transfer Discrepancy Report',
  formCode: 'BFP-TDR-001',
  orientation: 'landscape',

  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      titleAr: 'بيانات المحضر',
      cols: 3,
      fields: [
        { key: 'reportDate', label: 'تاريخ المحضر (Report Date)', kind: 'date', required: true },
        {
          key: 'transferReceiptRef',
          label: 'رقم استلام النقل المرجعي (TRC Ref.)',
          kind: 'docref',
          docType: 'TRC',
          required: true,
          hint: 'المحضر يُحرَّر على استلامٍ وقع — لا فرقَ بلا استلام',
        },
        { key: 'transferOrderRef', label: 'رقم أمر النقل (TR Ref.)', kind: 'docref', docType: 'TR' },
        { key: 'fromWarehouse', label: 'مستودع المصدر (From Warehouse)', kind: 'text', required: true },
        { key: 'toWarehouse', label: 'مستودع الوجهة (To Warehouse)', kind: 'text', required: true },
        { key: 'arrivedAt', label: 'وقت الوصول (Arrived At)', kind: 'datetime' },
        { key: 'vehiclePlate', label: 'لوحة المركبة (Vehicle Plate)', kind: 'text', ltr: true },
        { key: 'driverName', label: 'اسم السائق (Driver)', kind: 'text' },
        { key: 'sealNo', label: 'رقم الختم (Seal No.)', kind: 'text', ltr: true },
        { key: 'receivedBy', label: 'المستلِم (Received By)', kind: 'identity', source: 'creator' },
      ],
    },
    {
      key: 'lines',
      titleAr: 'الفروق',
      kind: 'table',
      columns: [
        { key: 'kind', label: 'نوع الفرق', kind: 'select', options: DISCREPANCY_KINDS, required: true, width: '13%' },
        { key: 'lpn', label: 'رقم الطبلية (LPN)', kind: 'text', scannable: true, ltr: true, width: '15%' },
        { key: 'sku', label: 'رمز الصنف', kind: 'text', width: '9%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'qtySent', label: 'المرسَل', kind: 'number', width: '7%' },
        { key: 'qtyReceived', label: 'المستلَم', kind: 'number', width: '7%' },
        { key: 'decision', label: 'قرار الحوكمة', kind: 'text', width: '17%' },
        { key: 'liability', label: 'الطرف المتحمِّل', kind: 'select', options: LIABLE_PARTIES, width: '12%' },
        { key: 'correction', label: 'الحركة التصحيحية', kind: 'text', width: '12%' },
      ],
    },
    {
      key: 'evidence',
      titleAr: 'الإثبات والقرار',
      cols: 2,
      fields: [
        { key: 'photos', label: 'صور الإثبات', kind: 'attachments' },
        { key: 'investigationNote', label: 'ملاحظات التحقيق', kind: 'textarea' },
        { key: 'decidedBy', label: 'معتمِد القرار (Decided By)', kind: 'identity', source: 'approver' },
      ],
    },
  ],

  signatures: [
    { key: 'receivedBy', label: 'المستلِم (Received By)', source: 'creator' },
    { key: 'decidedBy', label: 'معتمِد القرار (Decided By)', source: 'approver' },
    { key: 'carrierRep', label: 'ممثّل الناقل (Carrier Rep.)', source: null },
  ],

  warnings: discrepancyWarnings,
  completionProblems,
};

export default schema;
