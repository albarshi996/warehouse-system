/**
 * Source of truth for the Odoo Training Simulator (وضع التدريب).
 *
 * Every stage, status, form, and golden-rule guard below is mirrored verbatim
 * from the operational reference — "توثيق تشغيلي / مرجع تنفيذي رسمي":
 *   - §04  مصفوفة الـ21 نموذج رسمي            → FORMS
 *   - §03  الدورة المستندية (12 مرحلة)         → STAGES
 *   - §02  القواعد الذهبية التشغيلية الإلزامية → GUARDS (in the console)
 *   - §11  الدورة المالية / 3-Way Match        → match / close stages
 *
 * NOTHING here is invented. Status lifecycles come straight from the per-stage
 * state tables in the reference; anything the reference does not define is not
 * added.
 */

/* ─────────────────────────────────────────────────────────────
   STATUS METADATA — label + tone.
   Tone maps to the reference color code (§ .state-* CSS):
     pending → Gold   |   done → Green   |   reject → Red   |   locked → Gray
   ───────────────────────────────────────────────────────────── */
export const STATUS_META = {
  locked:      { labelAr: 'مقفل',              labelEn: 'Locked',       tone: 'locked' },
  draft:       { labelAr: 'مسودة',             labelEn: 'Draft',        tone: 'pending' },
  to_approve:  { labelAr: 'قيد الموافقة',      labelEn: 'To Approve',   tone: 'pending' },
  approved:    { labelAr: 'معتمد',             labelEn: 'Approved',     tone: 'done' },
  rfq:         { labelAr: 'طلب عرض سعر',       labelEn: 'RFQ',          tone: 'pending' },
  rfq_sent:    { labelAr: 'أُرسل الطلب',        labelEn: 'RFQ Sent',     tone: 'pending' },
  confirmed:   { labelAr: 'أمر شراء مؤكد',     labelEn: 'Confirmed',    tone: 'done' },
  scheduled:   { labelAr: 'مجدول',             labelEn: 'Scheduled',    tone: 'pending' },
  ready:       { labelAr: 'جاهز',              labelEn: 'Ready',        tone: 'pending' },
  in_progress: { labelAr: 'جارٍ التنفيذ',      labelEn: 'In Progress',  tone: 'pending' },
  waiting_qc:  { labelAr: 'بانتظار الجودة',    labelEn: 'Waiting QC',   tone: 'pending' },
  done:        { labelAr: 'مكتمل',             labelEn: 'Done',         tone: 'done' },
  validated:   { labelAr: 'مُصادَق عليه',      labelEn: 'Validated',    tone: 'done' },
  posted:      { labelAr: 'مُرحّلة',            labelEn: 'Posted',       tone: 'done' },
  in_payment:  { labelAr: 'قيد الدفع',         labelEn: 'In Payment',   tone: 'pending' },
  paid:        { labelAr: 'مدفوعة',            labelEn: 'Paid',         tone: 'done' },
  open:        { labelAr: 'فترة مفتوحة',       labelEn: 'Open',         tone: 'pending' },
  closed:      { labelAr: 'مُغلقة',            labelEn: 'Closed',       tone: 'done' },
  // QC outcomes (sub-state of GRN, §04-QC table)
  passed:      { labelAr: 'اجتاز الفحص',       labelEn: 'Passed',       tone: 'done' },
  failed:      { labelAr: 'فشل الفحص',         labelEn: 'Failed',       tone: 'reject' },
};

/* ─────────────────────────────────────────────────────────────
   ODOO MODULES — the four sidebar modules the task requires.
   ───────────────────────────────────────────────────────────── */
export const MODULES = [
  { id: 'Purchase',   labelAr: 'المشتريات',  labelEn: 'Purchase',   icon: 'shoppingCart',  accent: 'red' },
  { id: 'Inventory',  labelAr: 'المستودعات', labelEn: 'Inventory',  icon: 'warehouse',     accent: 'gold' },
  { id: 'Quality',    labelAr: 'الجودة',     labelEn: 'Quality',    icon: 'clipboardList', accent: 'teal' },
  { id: 'Accounting', labelAr: 'المالية',    labelEn: 'Accounting', icon: 'dollarSign',    accent: 'green' },
];

/* ─────────────────────────────────────────────────────────────
   THE 21 OFFICIAL FORMS — §04 master matrix (rows ١..٢١).
   `file` = the printable mock under public/forms/ (null = electronic only).
   `stageId` links the form to the pipeline stage it belongs to
   ('ref' = reference form, not part of the linear flow).
   ───────────────────────────────────────────────────────────── */
export const FORMS = [
  { n: 1,  file: 'form_PurchaseRequisition.html',    titleAr: 'طلب شراء داخلي',        titleEn: 'Purchase Requisition',   module: 'Purchase',   odooPath: 'Purchase > Requisitions',      finalStatus: 'approved',  stageId: 'pr' },
  { n: 2,  file: 'form_PO.html',                      titleAr: 'أمر الشراء',            titleEn: 'Purchase Order (PO)',    module: 'Purchase',   odooPath: 'Purchase > Orders',            finalStatus: 'confirmed', stageId: 'po' },
  { n: 3,  file: null,                                titleAr: 'إشعار الشحن المسبق',    titleEn: 'Advanced Shipping Notice', module: 'Inventory', odooPath: 'Inventory > Receipts',        finalStatus: 'scheduled', stageId: 'asn' },
  { n: 4,  file: 'form_GRN.html',                     titleAr: 'مذكرة استلام بضاعة',    titleEn: 'Goods Received Note',    module: 'Inventory',  odooPath: 'Inventory > Receipts',         finalStatus: 'done',      stageId: 'grn' },
  { n: 5,  file: 'form_QCReport.html',                titleAr: 'تقرير فحص الجودة',      titleEn: 'QC Inspection Report',   module: 'Quality',    odooPath: 'Quality > Quality Controls',   finalStatus: 'passed',    stageId: 'grn' },
  { n: 6,  file: 'form_PutawayList.html',             titleAr: 'أمر تخزين موجّه',       titleEn: 'Putaway List',           module: 'Inventory',  odooPath: 'Inventory > Putaway Rules',    finalStatus: 'done',      stageId: 'putaway' },
  { n: 7,  file: 'form_BinCard.html',                 titleAr: 'بطاقة مراقبة الموقع',   titleEn: 'Bin Card',               module: 'Inventory',  odooPath: 'Inventory > Lots / Moves',     finalStatus: 'ready',     stageId: 'putaway' },
  { n: 8,  file: 'form_Store Requisition.html',       titleAr: 'طلب صرف داخلي',         titleEn: 'Store Requisition',      module: 'Inventory',  odooPath: 'Inventory > Internal Transfers', finalStatus: 'done',    stageId: 'picking' },
  { n: 9,  file: 'form_Picking.html',                 titleAr: 'قائمة السحب',           titleEn: 'Picking List',           module: 'Inventory',  odooPath: 'Inventory > Transfers (Pick)', finalStatus: 'done',      stageId: 'picking' },
  { n: 10, file: 'form_PackingList.html',             titleAr: 'قائمة التعبئة',         titleEn: 'Packing List',           module: 'Inventory',  odooPath: 'Inventory > Transfers (Pack)', finalStatus: 'done',      stageId: 'picking' },
  { n: 11, file: 'form_DeliveryNote.html',            titleAr: 'إذن التسليم',           titleEn: 'Delivery Note',          module: 'Inventory',  odooPath: 'Inventory > Delivery Orders',  finalStatus: 'done',      stageId: 'dispatch' },
  { n: 12, file: 'form_GatePass.html',                titleAr: 'تصريح خروج البوابة',    titleEn: 'Gate Pass',              module: 'Inventory',  odooPath: 'Inventory (Custom Form)',      finalStatus: 'done',      stageId: 'dispatch' },
  { n: 13, file: 'form_Stock Transfer Slip.html',     titleAr: 'إذن نقل داخلي',         titleEn: 'Stock Transfer Slip',    module: 'Inventory',  odooPath: 'Inventory > Internal Transfers', finalStatus: 'done',    stageId: 'dispatch' },
  { n: 14, file: 'form_ReturnNote.html',              titleAr: 'إشعار مرتجع',           titleEn: 'Return Note',            module: 'Inventory',  odooPath: 'Inventory > Return Transfers', finalStatus: 'done',      stageId: 'returns' },
  { n: 15, file: 'form_Damaged Goods Report.html',    titleAr: 'تقرير بضاعة تالفة',     titleEn: 'Damaged Goods Report',   module: 'Quality',    odooPath: 'Inventory (Custom + Quality)', finalStatus: 'approved',  stageId: 'returns' },
  { n: 16, file: 'form_Stock Adjustment Voucher.html',titleAr: 'سند تسوية مخزون',       titleEn: 'Stock Adjustment Voucher', module: 'Inventory', odooPath: 'Inventory > Physical Inventory', finalStatus: 'validated', stageId: 'adjustment' },
  { n: 17, file: 'form_Credit Note.html',             titleAr: 'إشعار دائن',            titleEn: 'Credit Note',            module: 'Accounting', odooPath: 'Accounting > Credit Notes',    finalStatus: 'posted',    stageId: 'returns' },
  { n: 18, file: 'form_CycleCount.html',              titleAr: 'ورقة جرد دوري',         titleEn: 'Cycle Count Sheet',      module: 'Inventory',  odooPath: 'Inventory > Physical Inventory', finalStatus: 'done',    stageId: 'cyclecount' },
  { n: 19, file: 'form_ItemCreation.html',            titleAr: 'بطاقة تعريف الصنف',     titleEn: 'Item Creation Card',     module: 'Inventory',  odooPath: 'Inventory > Products',         finalStatus: 'approved',  stageId: 'ref' },
  { n: 20, file: 'form_DailyHuddle.html',             titleAr: 'سجل الاجتماع اليومي',   titleEn: 'Daily Huddle Log',       module: 'Quality',    odooPath: 'Discuss / Custom Module',      finalStatus: 'done',      stageId: 'ref' },
  { n: 21, file: 'form_WeeklyCheck.html',             titleAr: 'القائمة الأسبوعية',     titleEn: 'Weekly Check / Free Report', module: 'Quality', odooPath: 'Quality > Quality Alerts',    finalStatus: 'done',      stageId: 'ref' },
];

/* ─────────────────────────────────────────────────────────────
   THE 12-STAGE DOCUMENT CYCLE — §03 pipeline.
   `flow`  = the exact status lifecycle from the reference state tables.
             The LAST element is the completion state that unlocks the next stage.
   `guard` = { at, rule } — a hardcoded golden rule that blocks the transition
             INTO `at` unless satisfied (enforced in OdooTrainingConsole).
   ───────────────────────────────────────────────────────────── */
export const STAGES = [
  {
    id: 'pr', num: '01', icon: '🛒',
    titleAr: 'طلب الشراء', titleEn: 'Purchase Requisition (PR)',
    module: 'Purchase', modules: ['Purchase'], phaseAr: 'دورة التعاقد والطلب',
    odooPath: 'Purchase > Requisitions',
    descAr: 'مستند داخلي يبدأ به دورة الشراء — يصدر عند وصول الرصيد لنقطة إعادة الطلب. يمر من مسودة إلى معتمد فيُنشأ RFQ تلقائياً.',
    flow: ['draft', 'to_approve', 'approved'],
  },
  {
    id: 'po', num: '02', icon: '📝',
    titleAr: 'أمر الشراء', titleEn: 'Purchase Order (PO)',
    module: 'Purchase', modules: ['Purchase'], phaseAr: 'دورة التعاقد والطلب',
    odooPath: 'Purchase > Orders',
    descAr: 'العقد القانوني الملزم المرسل للمورد. يُرسل RFQ لثلاثة موردين على الأقل، وبالضغط على Confirm يصبح أمر شراء مؤكداً — وهو المرساة لكل مستندات الدورة التالية.',
    flow: ['rfq', 'rfq_sent', 'confirmed'],
  },
  {
    id: 'asn', num: '03', icon: '🚛',
    titleAr: 'إشعار الشحن المسبق', titleEn: 'Advanced Shipping Notice (ASN)',
    module: 'Inventory', modules: ['Inventory'], phaseAr: 'الاستلام والرقابة',
    odooPath: 'Inventory > Receipts',
    descAr: 'إشعار إلكتروني من المورد فور شحن البضاعة، يُمكّن المستودع من جدولة الاستلام وتجهيز الرصيف. يُنشئ Receipt في حالة Scheduled.',
    flow: ['scheduled'],
  },
  {
    id: 'grn', num: '04', icon: '✅',
    titleAr: 'الاستلام وفحص الجودة', titleEn: 'Goods Received Note & QC',
    module: 'Inventory', modules: ['Inventory', 'Quality'], phaseAr: 'الاستلام والرقابة',
    odooPath: 'Inventory > Receipts  ·  Quality > Quality Controls',
    descAr: 'أهم مستند في الدورة — الإقرار الرسمي بدخول البضاعة عهدة Brandzo. يُمسح الباركود ويُدخل رقم الدفعة (Lot)، ثم بانتظار فحص الجودة. لا تحويل إلى Done قبل اعتماد QC.',
    flow: ['ready', 'in_progress', 'waiting_qc', 'done'],
    guard: { at: 'done', rule: 'qc' },
  },
  {
    id: 'putaway', num: '05', icon: '🏬',
    titleAr: 'التخزين الموجّه', titleEn: 'Directed Put-away',
    module: 'Inventory', modules: ['Inventory'], phaseAr: 'التخزين والتحويل',
    odooPath: 'Inventory > Putaway Rules',
    descAr: 'توجيه الأصناف من منطقة الاستلام إلى الموقع الأمثل آلياً (FEFO، الوزن، طبيعة المنتج)، مع تحديث بطاقة الموقع (Bin Card).',
    flow: ['ready', 'done'],
  },
  {
    id: 'picking', num: '06', icon: '📦',
    titleAr: 'تحضير الطلبات (Pick & Pack)', titleEn: 'Order Picking & Packing',
    module: 'Inventory', modules: ['Inventory'], phaseAr: 'الصرف والتجهيز',
    odooPath: 'Inventory > Transfers (Pick / Pack)',
    descAr: 'سحب الأصناف وفق قائمة سحب موجّهة ثم تعبئتها. مبدأ FEFO إلزامي: يصدر النظام أقرب تاريخ صلاحية تلقائياً في كل سحب.',
    flow: ['ready', 'in_progress', 'done'],
    guard: { at: 'done', rule: 'fefo' },
  },
  {
    id: 'dispatch', num: '07', icon: '🚚',
    titleAr: 'الشحن والتوزيع', titleEn: 'Dispatch & Transport',
    module: 'Inventory', modules: ['Inventory'], phaseAr: 'الصرف والتجهيز',
    odooPath: 'Inventory > Delivery Orders  ·  Fleet',
    descAr: 'إصدار إذن التسليم وتصريح خروج البوابة (Gate Pass) وتحميل الشاحنة. لا تخرج أي مركبة من البوابة دون Gate Pass معتمد مربوط برقم إذن التسليم.',
    flow: ['ready', 'done'],
    guard: { at: 'done', rule: 'gatepass' },
  },
  {
    id: 'returns', num: '08', icon: '↩️',
    titleAr: 'المرتجعات والتالف', titleEn: 'Returns & Damage',
    module: 'Inventory', modules: ['Inventory', 'Quality', 'Accounting'], phaseAr: 'الإغلاق والمراجعة',
    odooPath: 'Inventory > Return Transfers  ·  Accounting > Credit Notes',
    descAr: 'استلام المرتجعات وتصنيفها (سليم / تالف / منتهٍ)، وإصدار إشعار الإرجاع وتقرير البضاعة التالفة والإشعار الدائن (Credit Note).',
    flow: ['draft', 'approved', 'done'],
  },
  {
    id: 'cyclecount', num: '09', icon: '🔢',
    titleAr: 'الجرد الدوري', titleEn: 'Cycle Count',
    module: 'Inventory', modules: ['Inventory'], phaseAr: 'الرقابة على المخزون',
    odooPath: 'Inventory > Physical Inventory',
    descAr: 'محضر جرد دوري تُجمَّد فيه الأرصدة، ويُدخل العدّ الفعلي بالباركود لمقارنته برصيد النظام قبل اعتماد التسويات.',
    flow: ['draft', 'in_progress', 'validated', 'done'],
  },
  {
    id: 'adjustment', num: '10', icon: '⚖️',
    titleAr: 'تسويات المخزون', titleEn: 'Stock Adjustments',
    module: 'Inventory', modules: ['Inventory', 'Accounting'], phaseAr: 'الرقابة على المخزون',
    odooPath: 'Inventory > Physical Inventory',
    descAr: 'سند تسوية المخزون لتصحيح الفروقات الناتجة عن الجرد. أي فارق يُنشئ قيداً محاسبياً تلقائياً ويحتاج اعتماد المدير المالي.',
    flow: ['draft', 'validated'],
  },
  {
    id: 'match', num: '11', icon: '🧾',
    titleAr: 'المطابقة الثلاثية وفاتورة المورد', titleEn: '3-Way Match & Vendor Bill',
    module: 'Accounting', modules: ['Accounting'], phaseAr: 'الدورة المالية',
    odooPath: 'Accounting > Vendor Bills',
    descAr: 'تُنشأ فاتورة المورد عند تحويل GRN إلى Done. يُجري النظام مطابقة ثلاثية بين (PO + GRN + Bill) — أي فارق يوقف الترحيل والدفع تلقائياً ويُنبّه المدير المالي.',
    flow: ['draft', 'posted', 'in_payment', 'paid'],
    guard: { at: 'posted', rule: 'match' },
  },
  {
    id: 'close', num: '12', icon: '🔒',
    titleAr: 'الإغلاق المالي', titleEn: 'Financial Close',
    module: 'Accounting', modules: ['Accounting'], phaseAr: 'الدورة المالية',
    odooPath: 'Accounting > Period Closing',
    descAr: 'الإغلاق المالي الشهري لمستندات المخازن: مراجعة تقييم المخزون وتسويات الجرد وإغلاق الفواتير المفتوحة ومطابقة أرصدة الموردين.',
    flow: ['open', 'closed'],
  },
];

/* ─────────────────────────────────────────────────────────────
   THE THREE GOLDEN RULES — §02, shown to the trainee as a reference strip.
   ───────────────────────────────────────────────────────────── */
export const GOLDEN_RULES = [
  { rule: 'qc',       icon: '🔬', titleAr: 'لا Done قبل الجودة', textAr: 'لا يُعتمد الاستلام (GRN) إلا بعد توقيع مفتش الجودة (QC = Passed).' },
  { rule: 'fefo',     icon: '⏳', titleAr: 'FEFO إلزامي',       textAr: 'أقرب تاريخ صلاحية يخرج أولاً — يفرضه النظام في كل عملية سحب.' },
  { rule: 'gatepass', icon: '🚧', titleAr: 'لا خروج بلا تصريح',  textAr: 'لا تخرج مركبة من البوابة دون Gate Pass معتمد مربوط بإذن التسليم.' },
  { rule: 'match',    icon: '⚖️', titleAr: 'مطابقة ثلاثية',      textAr: 'PO + GRN + Bill يجب أن تتطابق قبل أي دفع — وإلا يتوقف تلقائياً.' },
];

/** The earliest-expiry lot — the only correct FEFO pick. */
export function earliestExpiryLot(lots) {
  return [...lots].sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
}

/* ─────────────────────────────────────────────────────────────
   INITIAL STATE — one sample product moving through the whole cycle.
   Sample = a chilled COSMETICS item (matches the كوزميتك cold-storage domain);
   cosmetics carry expiry dates, so FEFO stays meaningful.
   ───────────────────────────────────────────────────────────── */
export function createInitialState() {
  const orderedQty = 380;
  const unitPrice = 65;
  const lots = [
    // Two lots, DIFFERENT expiry → FEFO must force the earliest (LOT-2409).
    { lot: 'LOT-2411', qty: 180, expiry: '2026-11-30' },
    { lot: 'LOT-2409', qty: 200, expiry: '2026-09-30' },
  ];

  const stages = {};
  for (const s of STAGES) {
    stages[s.id] = {
      id: s.id,
      status: s.id === 'pr' ? s.flow[0] : 'locked', // only the first stage starts open
      done: false,
    };
  }

  return {
    currentStage: 'pr',
    stages,
    order: {
      prNumber: 'PR-2026-0155',
      poNumber: 'PO-2026-0155',
      supplier: 'مختبرات الخليج للتجميل',
      product: {
        sku: 'BZ-VCS-30',
        nameAr: 'سيروم فيتامين C — 30مل',
        nameEn: 'Vitamin C Serum 30ml',
        uom: 'كرتون',
        category: 'مستحضرات تجميل (تخزين مبرّد)',
        requiresExpiry: true,
      },
      orderedQty,
      unitPrice,
      poTotal: orderedQty * unitPrice, // 24,700 SAR — the 3-Way Match anchor
      lots,
      fefoLot: earliestExpiryLot(lots).lot, // 'LOT-2409'

      // ── filled as the product advances (null = stage not reached) ──
      receivedQty: null,       // Stage 04 (GRN → Done)
      qcResult: null,          // 'passed' | 'failed'  → gates GRN Done
      pickedLot: null,         // Stage 06 — must equal fefoLot
      deliveryNoteNo: null,    // Stage 07 (set when dispatch unlocks)
      gatePassApproved: false, // Stage 07 gate
      gatePassNo: null,
      systemQty: orderedQty,   // Stage 09 book stock
      countedQty: null,        // Stage 09 physical count
      adjustmentQty: null,     // Stage 10 (counted − system)
      billAmount: null,        // Stage 11 — must equal poTotal
      billMatched: false,      // 3-Way Match result
      periodClosed: false,     // Stage 12
    },
    activeModule: 'Purchase',
    alert: null,               // { kind:'error'|'warn'|'success', text }
    log: [],                   // completed-action audit trail
  };
}
