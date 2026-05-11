/**
 * Source of truth for the document-cycle pipeline, mirrored from
 * chapter 3 of public/Brandzo_Operational_Guide.html ("الدورة المستندية").
 *
 * Each stage corresponds to one or more printable forms under
 * public/forms/ — those are linked directly from the visual pipeline so
 * users can jump straight from "what does this stage produce?" to "open
 * the form".
 */
export const DOCUMENT_STAGES = [
  {
    id: 'pr',
    num: '01',
    icon: '🛒',
    titleAr: 'طلب الشراء',
    titleEn: 'Purchase Requisition (PR)',
    phaseAr: 'دورة التعاقد والطلب',
    descAr: 'مستند داخلي يصدر تلقائياً عند وصول الرصيد إلى نقطة إعادة الطلب. يبدأ به دورة الشراء.',
    descEn: 'Auto-generated when stock falls below the reorder point.',
    accent: 'red',
    forms: [{ file: 'form_PurchaseRequisition.html', titleAr: 'نموذج طلب الشراء الداخلي' }],
  },
  {
    id: 'po',
    num: '02',
    icon: '📝',
    titleAr: 'أمر الشراء',
    titleEn: 'Purchase Order (PO)',
    phaseAr: 'دورة التعاقد والطلب',
    descAr:
      'المستند الرسمي القانوني المرسل للمورد. يمثل التزاماً تعاقدياً بشراء كميات وأسعار محددة.',
    descEn: 'Legal commitment issued to the supplier.',
    accent: 'red',
    forms: [{ file: 'form_PO.html', titleAr: 'نموذج أمر الشراء' }],
  },
  {
    id: 'asn',
    num: '03',
    icon: '🚛',
    titleAr: 'إشعار الشحن المسبق',
    titleEn: 'Advanced Shipping Notice (ASN)',
    phaseAr: 'الاستلام والرقابة',
    descAr:
      'إشعار إلكتروني من المورد عند شحن البضاعة من مخازنه؛ يُمكّن المستودع من جدولة الاستلام.',
    descEn: "Supplier's electronic ship notification.",
    accent: 'yellow',
    forms: [],
  },
  {
    id: 'grn',
    num: '04',
    icon: '✅',
    titleAr: 'الاستلام وفحص الجودة',
    titleEn: 'Goods Received Note & QC',
    phaseAr: 'الاستلام والرقابة',
    descAr:
      'الإقرار الرسمي باستلام البضاعة بعد فحص الجودة. أهم مستند في دورة المستودعات؛ يمثل دخول البضاعة في عهدة Brandzo.',
    descEn: "Brandzo's official acknowledgement of receipt + QC outcome.",
    accent: 'red',
    forms: [
      { file: 'form_GRN.html', titleAr: 'نموذج استلام البضاعة (GRN)' },
      { file: 'form_QCReport.html', titleAr: 'تقرير فحص الجودة' },
      { file: 'form_DeliveryNote.html', titleAr: 'مذكرة التسليم من المورد' },
    ],
  },
  {
    id: 'putaway',
    num: '05',
    icon: '🏬',
    titleAr: 'التخزين الموجه',
    titleEn: 'Directed Put-away',
    phaseAr: 'التخزين والتحويل الداخلي',
    descAr: 'توجيه الأصناف من منطقة الاستلام إلى مواقع التخزين المثلى (FEFO، الوزن، طبيعة المنتج).',
    descEn: 'System-directed slotting based on FEFO, weight, and item profile.',
    accent: 'navy',
    forms: [
      { file: 'form_PutawayList.html', titleAr: 'أمر التخزين الموجه' },
      { file: 'form_BinCard.html', titleAr: 'بطاقة الموقع التخزيني' },
    ],
  },
  {
    id: 'picking',
    num: '06',
    icon: '📦',
    titleAr: 'تحضير الطلبات',
    titleEn: 'Order Picking & Packing',
    phaseAr: 'الصرف والتجهيز',
    descAr: 'سحب الأصناف من مواقعها وفق قائمة سحب موجهة، ثم تعبئتها للشحن مع مراجعة الكميات.',
    descEn: 'Pick from bins per the picking list, then pack and verify.',
    accent: 'red',
    forms: [
      { file: 'form_Picking.html', titleAr: 'قائمة السحب (Picking List)' },
      { file: 'form_PackingList.html', titleAr: 'قائمة التعبئة' },
      { file: 'form_Store Requisition.html', titleAr: 'طلب صرف من المخزن' },
    ],
  },
  {
    id: 'dispatch',
    num: '07',
    icon: '🚚',
    titleAr: 'الشحن والتوزيع',
    titleEn: 'Dispatch & Transport',
    phaseAr: 'الصرف والتجهيز',
    descAr: 'إصدار إذن التسليم وتصريح الخروج من البوابة، وتحميل البضاعة على شاحنات الأسطول.',
    descEn: 'Delivery note + gate pass + truck loading.',
    accent: 'yellow',
    forms: [
      { file: 'form_DeliveryNote.html', titleAr: 'إذن التسليم' },
      { file: 'form_GatePass.html', titleAr: 'تصريح خروج البوابة' },
      { file: 'form_Stock Transfer Slip.html', titleAr: 'إذن النقل الداخلي' },
    ],
  },
  {
    id: 'returns',
    num: '08',
    icon: '↩️',
    titleAr: 'المرتجعات والتسويات',
    titleEn: 'Returns & Reconciliation',
    phaseAr: 'الإغلاق والمراجعة',
    descAr:
      'استلام المرتجعات من الفروع، تصنيفها (سليم/تالف/منتهي)، ومعالجة سندات التسوية والإشعارات الدائنة.',
    descEn: 'Receive, categorise, and reconcile branch returns.',
    accent: 'navy',
    forms: [
      { file: 'form_ReturnNote.html', titleAr: 'إشعار الإرجاع' },
      { file: 'form_Credit Note.html', titleAr: 'الإشعار الدائن (Credit Note)' },
      { file: 'form_Damaged Goods Report.html', titleAr: 'تقرير البضاعة التالفة' },
      { file: 'form_Stock Adjustment Voucher.html', titleAr: 'سند تسوية المخزون' },
    ],
  },
];
