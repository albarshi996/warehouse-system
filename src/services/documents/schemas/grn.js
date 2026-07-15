/**
 * مخطّط مذكرة استلام البضائع وفحص الجودة (GRN) — المرحلة 04 من الدورة.
 *
 * هذا هو **النموذج الرائد**: يُثبت النمط قبل التوسّع لبقيّة النماذج (ROADMAP §11.5 · F1).
 * الأصل الورقي: `public/forms/form_GRN.html` — نُقلت منه العناوين والحقول حرفيًّا،
 * ويبقى موجودًا كما هو (قاعدة صفر حذف).
 *
 * ما صُحِّح أثناء النقل (كان الأصل يُضعف نفسه):
 *  · «رقم GRN» كان حقلًا يكتبه الموظّف بيده ⇒ صار **رقم النظام التسلسلي** لا يُكتب.
 *  · حرارات CCP1 الثلاث كانت `text` بلا أي تحقّق رغم أن الحدّ الحرج مكتوب فوقها ⇒
 *    صارت أرقامًا لها حدود تُفحص فعلًا.
 *  · الإجماليات الثلاثة كان يعيد الموظّف كتابتها بيده ⇒ صارت **محسوبة من البنود**.
 *  · «مشرف الاستلام» و«فاحص الجودة» كانا اسمين يُكتبان ⇒ صارا من **الهوية**:
 *    المُنشئ والمعتمِد. لا يكتب أحد اسم غيره.
 *  · أربعة حقول «مقبول/مرفوض» كانت نصًّا حرًّا ⇒ صارت قوائم اختيار.
 */

/** خيارات القبول/الرفض — كانت نصًّا حرًّا في الورق. */
const ACCEPT_REJECT = ['مقبول', 'مرفوض'];

/** الحدود الحرجة لنقطة التحكّم CCP1 (مكتوبة في الورق، غير مفحوصة فيه). */
export const CCP1_LIMITS = { chilled: 4, frozen: -18 };

/** يجمع عمودًا رقميًّا من البنود. */
function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * هل خُرقت حدود CCP1؟ يُعيد قائمة المخالفات (فارغة = مطابق).
 * منفصلة ومصدَّرة لتُختبر وحدها.
 */
export function ccp1Violations(header) {
  const out = [];
  const chilled = header?.tempChilled;
  const frozen = header?.tempFrozen;
  if (chilled !== '' && chilled != null && Number(chilled) > CCP1_LIMITS.chilled) {
    out.push(`حرارة المبردات ${chilled}°م تتجاوز الحدّ الحرج ${CCP1_LIMITS.chilled}°م`);
  }
  if (frozen !== '' && frozen != null && Number(frozen) > CCP1_LIMITS.frozen) {
    out.push(`حرارة المجمدات ${frozen}°م تتجاوز الحدّ الحرج ${CCP1_LIMITS.frozen}°م`);
  }
  return out;
}

const schema = {
  type: 'GRN',
  stage: 4,
  titleAr: 'مذكرة استلام البضائع وفحص الجودة',
  titleEn: 'GRN & QC Report',
  formCode: 'BFP-GRN-002',
  orientation: 'landscape',

  /**
   * من يفعل ماذا (ROADMAP §8 ركيزة 1).
   * 🥇 حارس الجودة: الاعتماد لمفتّش الجودة وحده — لا لأمين المخزن مهما احتاج.
   */
  roles: {
    create: ['storekeeper', 'warehouse_manager', 'purchase_officer'],
    approve: ['qc_inspector', 'warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات سند الاستلام — GRN Header',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'receivedAt',
          label: 'تاريخ ووقت الاستلام (Date & Time)',
          kind: 'datetime',
          required: true,
        },
        { key: 'poRef', label: 'رقم أمر الشراء المرجعي (PO Ref.)', kind: 'text', required: true },
        { key: 'supplier', label: 'اسم المورد (Supplier)', kind: 'text', required: true },
        { key: 'truckPlate', label: 'رقم اللوحة / الشاحنة (Truck Plate)', kind: 'text' },
        { key: 'dockNo', label: 'رقم الرصيف (Dock No.)', kind: 'text' },
        { key: 'asnNo', label: 'رقم إشعار الشحن ASN (ASN No.)', kind: 'text' },
        {
          key: 'receiver',
          label: 'اسم مشرف الاستلام (Receiver)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المستند',
        },
        {
          key: 'qcInspector',
          label: 'اسم فاحص الجودة (QC Inspector)',
          kind: 'identity',
          source: 'approver',
          hint: 'يُملأ تلقائيًّا عند الاعتماد',
        },
      ],
    },

    {
      key: 'temperature',
      title: '🌡️ فحص درجة الحرارة (CCP 1) — Temperature Check',
      kind: 'fields',
      columns: 4,
      note: '⚠️ حد حرج CCP1: المبردات ≤ 4°م | المجمدات ≤ -18°م — أي تجاوز = رفض كامل الشحنة',
      fields: [
        { key: 'tempTruck', label: 'درجة حرارة شاحنة التبريد (°م)', kind: 'number', step: 0.1 },
        {
          key: 'tempChilled',
          label: 'درجة حرارة المنتجات المبردة (°م)',
          kind: 'number',
          step: 0.1,
          max: CCP1_LIMITS.chilled,
        },
        {
          key: 'tempFrozen',
          label: 'درجة حرارة المجمدات (°م)',
          kind: 'number',
          step: 0.1,
          max: CCP1_LIMITS.frozen,
        },
        {
          key: 'tempResult',
          label: 'النتيجة (مقبول / مرفوض)',
          kind: 'select',
          options: ACCEPT_REJECT,
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 بنود الاستلام وفحص الجودة — Line Items & QC',
      kind: 'table',
      note: '(يتم تعبئة الجدول في حالة عدم وجود مرفق. لو يوجد، فعّل «يوجد مرفق مدبس مع النموذج» أدناه.)',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '9%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, width: '11%' },
        { key: 'description', label: 'الوصف', kind: 'text', width: '18%' },
        { key: 'qtyOrdered', label: 'الكمية المطلوبة', kind: 'number', width: '8%' },
        { key: 'qtyReceived', label: 'الكمية المستلمة', kind: 'number', width: '8%' },
        { key: 'qtyRejected', label: 'الكمية المرفوضة', kind: 'number', width: '8%' },
        { key: 'rejectReason', label: 'سبب الرفض', kind: 'text', width: '12%' },
        { key: 'expiryDate', label: 'تاريخ الصلاحية', kind: 'date', width: '10%' },
        { key: 'shelfLifePct', label: '% العمر المتبقي', kind: 'number', width: '8%' },
        {
          key: 'status',
          label: 'الحالة',
          kind: 'select',
          options: ['مقبول', 'مرفوض', 'جزئي'],
          width: '8%',
        },
      ],
    },

    {
      key: 'qc',
      title: '🔍 فحص التعبئة والتغليف — Packaging Inspection',
      kind: 'checklist',
      items: [
        { key: 'ok-pack', label: 'التعبئة سليمة ولا توجد أضرار ظاهرة' },
        { key: 'labels-ar', label: 'الملصقات واضحة وباللغة العربية' },
        { key: 'clean', label: 'العبوات نظيفة وخالية من التلوث' },
        { key: 'weight-ok', label: 'وزن العبوة مطابق للمواصفات' },
        { key: 'barcode-ok', label: 'باركود مقروء وصحيح' },
        { key: 'no-leak', label: 'لا توجد علامات تلف أو تسريب' },
        { key: 'shelf-75', label: 'العمر الافتراضي المتبقي ≥ 75%' },
        { key: 'no-pests', label: 'لا توجد آفات أو مؤشرات تلوث' },
        { key: 'qty-asn', label: 'مطابقة الكمية لبيانات ASN / PO' },
        { key: 'storage-ok', label: 'شروط التخزين محققة' },
      ],
    },

    {
      key: 'summary',
      title: '📊 ملخص الاستلام — Receipt Summary',
      kind: 'fields',
      columns: 4,
      fields: [
        {
          key: 'totalOrdered',
          label: 'إجمالي الكميات المطلوبة',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyOrdered'),
        },
        {
          key: 'totalReceived',
          label: 'إجمالي الكميات المستلمة',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyReceived'),
        },
        {
          key: 'totalRejected',
          label: 'إجمالي الكميات المرفوضة',
          kind: 'computed',
          compute: (d) => sumColumn(d.lines, 'qtyRejected'),
        },
        {
          key: 'decision',
          label: 'قرار القسم الفاحص (مقبول/مرفوض/جزئي)',
          kind: 'select',
          options: ['مقبول', 'مرفوض', 'جزئي'],
        },
      ],
      extraFields: [
        { key: 'rejectReasonSummary', label: 'سبب الرفض (إن وجد)', kind: 'textarea' },
        { key: 'rejectAction', label: 'الإجراء المتخذ للكميات المرفوضة', kind: 'textarea' },
        {
          key: 'hasAttachment',
          label: 'يوجد مرفق مدبس مع النموذج',
          kind: 'boolean',
          hint: 'الورق كان يطلب هذه العلامة ولا يوفّرها',
        },
      ],
    },
  ],

  /** خانات التوقيع المطبوعة. الاسمان الأوّلان يأتيان من الهوية لا من القلم. */
  signatures: [
    { key: 'supplierRep', label: 'مندوب المورد (Supplier Rep.)', source: null },
    { key: 'receiver', label: 'مشرف الاستلام (Receiving Supervisor)', source: 'creator' },
    { key: 'qcInspector', label: 'فاحص الجودة (QC Inspector)', source: 'approver' },
  ],

  /** تحذيرات تُعرض قبل الإرسال (لا تمنعه — الحجب الحقيقي في الحرّاس). */
  warnings: (d) => ccp1Violations(d.header),
};

export default schema;
