/**
 * Source of truth for the warehouse org chart, mirrored from chapter 2
 * of public/Brandzo_Operational_Guide.html ("الهيكل التنظيمي").
 *
 * The structure is a 3-tier hierarchy:
 *   Tier 1: Main Operations Manager (root)
 *   Tier 2: Senior Management functions (Executive, IT, QA, Finance)
 *   Tier 3: Operational departments under the Executive Manager
 *           (Receiving, QC, Storage, Picking, Transport, Returns)
 */

export const orgRoot = {
  id: 'main-mgr',
  titleAr: 'مدير المستودع التنفيذي',
  titleEn: 'Warehouse Executive Manager',
  emoji: '👑',
  accent: 'red',
  responsibilities: [
    'الإشراف العام على كافة أنشطة المستودع',
    'وضع الاستراتيجيات التشغيلية قصيرة وطويلة المدى',
    'إدارة الميزانية التشغيلية',
    'التنسيق مع الإدارة المركزية',
    'اعتماد السياسات والإجراءات الرئيسية',
    'إدارة علاقات الموردين الكبار',
  ],
  odooRole: 'Inventory Manager',
  odooAccess: 'كل وحدات المخزون',
};

/**
 * Tier 2 — senior management. The Executive Manager is the only node
 * that fans out into operational departments below it; the other three
 * are sibling C-level functions reporting to the root.
 */
export const orgTier2 = [
  {
    id: 'exec-mgr',
    titleAr: 'مدير المستودع التنفيذي',
    titleEn: 'Executive Warehouse Manager',
    emoji: '🧭',
    accent: 'red',
    fansOut: true,
    responsibilities: [
      'الإشراف اليومي المباشر على جميع الأقسام',
      'حل المشكلات الطارئة والمعقدة',
      'ضمان التزام الإدارات بالإجراءات المعتمدة',
      'التنسيق بين الإدارات المختلفة',
      'إدارة الموارد البشرية بالمستودع',
    ],
    odooRole: 'Hub Administrator',
    odooAccess: 'Settings كاملة',
  },
  {
    id: 'it-mgr',
    titleAr: 'مدير أنظمة المعلومات والتحول الرقمي',
    titleEn: 'IT & Digital Transformation Manager',
    emoji: '💻',
    accent: 'navy',
    responsibilities: [
      'الإشراف على توثيق إدارة المستودعات الإلكتروني',
      'ضمان تكامل الأنظمة مع التوثيق المركزية',
      'قيادة مبادرات الأتمتة والتحول الرقمي',
      'إدارة فريق الدعم الفني',
      'تحليل البيانات الضخمة لتحسين الأداء',
    ],
    odooRole: 'Hub Administrator',
    odooAccess: 'Settings كاملة',
  },
  {
    id: 'qa-mgr',
    titleAr: 'مدير الجودة والسلامة الغذائية',
    titleEn: 'Quality & Food Safety Manager',
    emoji: '🛡️',
    accent: 'yellow',
    responsibilities: [
      'تطبيق معايير سلامة الغذاء العالمية',
      'إدارة فريق فحص الجودة',
      'اعتماد الموردين الجدد فنياً',
      'متابعة شهادات الجودة والصلاحية',
      'إدارة حالات سحب المنتجات',
    ],
    odooRole: 'Quality Administrator',
    odooAccess: 'Quality + Inventory (read)',
  },
  {
    id: 'fin-mgr',
    titleAr: 'مدير المحاسبة والرقابة المالية',
    titleEn: 'Accounting & Financial Control Manager',
    emoji: '📊',
    accent: 'navy',
    responsibilities: [
      'الإشراف على جميع العمليات المالية',
      'دقة المطابقات المالية مع الموردين',
      'إعداد التقارير المالية',
      'الإشراف على أنشطة الجرد المالي',
      'مراقبة تكاليف التشغيل وترشيدها',
    ],
    odooRole: 'Accounting Manager',
    odooAccess: 'Purchase + Accounting',
  },
];

/**
 * Tier 3 — operational departments under the Executive Manager.
 * Headcount ranges are taken directly from chapter 2 of the guide.
 */
export const orgTier3 = [
  {
    id: 'receiving',
    titleAr: 'إدارة الاستلام والرقابة',
    titleEn: 'Receiving & Inbound Control',
    emoji: '📦',
    accent: 'red',
    headcount: '~30 موظف',
    teams: [
      'مدير قسم الاستلام',
      'مشرف الاستلام (الفترة الصباحية)',
      'مشرف الاستلام (الفترة المسائية)',
      'فريق إدخال بيانات الاستلام (4-6)',
      'فريق عمال الرصيف والمناولة (20-30)',
    ],
    odooRole: 'Inventory User',
    odooAccess: 'Inventory + Quality',
  },
  {
    id: 'qc',
    titleAr: 'إدارة فحص ومراقبة الجودة',
    titleEn: 'Quality Control & Inspection',
    emoji: '🔬',
    accent: 'yellow',
    headcount: '~15 مفتش',
    teams: [
      'مدير إدارة الجودة',
      'فريق فحص المنتجات الطازجة',
      'فريق فحص المجمدات',
      'فريق فحص المنتجات الجافة والمعلبة',
      'فريق فحص المنتجات غير الغذائية',
    ],
    odooRole: 'Quality User',
    odooAccess: 'Quality + Inventory (read)',
  },
  {
    id: 'storage',
    titleAr: 'إدارة التخزين وتحديد المواقع',
    titleEn: 'Storage & Slotting',
    emoji: '🏬',
    accent: 'navy',
    headcount: '~70 موظف',
    teams: [
      'مدير عمليات التخزين',
      'مهندس تخطيط المستودع',
      'مشرفي مناطق التخزين المتخصصة',
      'مشغلي الرافعات الشوكية (40-60)',
      'مراقبي المخزون (10-12)',
    ],
    odooRole: 'Inventory User',
    odooAccess: 'Inventory + Barcode',
  },
  {
    id: 'picking',
    titleAr: 'إدارة تحضير الطلبات والتوزيع',
    titleEn: 'Order Fulfillment & Picking',
    emoji: '📋',
    accent: 'red',
    headcount: '~120 عامل',
    teams: [
      'مدير عمليات التوزيع',
      'مخطط الأحمال',
      'مشرفي مناطق الانتقاء',
      'العمال المتنقلين (80-120)',
      'فريق المراجعين والمدققين',
    ],
    odooRole: 'Barcode User',
    odooAccess: 'Barcode فقط',
  },
  {
    id: 'transport',
    titleAr: 'إدارة أسطول النقل والتوزيع',
    titleEn: 'Fleet & Distribution',
    emoji: '🚚',
    accent: 'navy',
    headcount: '~70 سائق',
    teams: [
      'مدير النقل والتوزيع',
      'منسق عمليات التوزيع اليومية',
      'فريق السائقين (50-70)',
      'فريق مساعدي السائقين',
      'مهندس صيانة الأسطول',
    ],
    odooRole: 'Fleet User',
    odooAccess: 'Fleet',
  },
  {
    id: 'returns',
    titleAr: 'إدارة المرتجعات وتصحيح المخزون',
    titleEn: 'Returns & Inventory Reconciliation',
    emoji: '↩️',
    accent: 'yellow',
    headcount: '~12 موظف',
    teams: [
      'مدير إدارة المرتجعات',
      'مشرف استلام المرتجعات',
      'فريق فحص المرتجعات',
      'فريق معالجة المرتجعات',
      'منسق المرتجعات مع الموردين',
    ],
    odooRole: 'Quality User',
    odooAccess: 'Quality + Inventory (read)',
  },
];
