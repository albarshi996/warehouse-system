/**
 * Source of truth for the warehouse org chart, restructured for Brandzo Hub 2026.
 * Refined into 3 Operational Pillars and a separate Support Functions band.
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
 * Tier 2 — The Three Operational Pillars.
 * Supply Chain and Governance are marked as occupied.
 */
export const orgPillars = [
  {
    id: 'governance',
    titleAr: 'إدارة الحوكمة',
    titleEn: 'Governance Management',
    emoji: '🛡️',
    accent: 'yellow',
    isOccupied: true,
    responsibilities: [
      'الاستقلالية التامة في تصميم ومراقبة تطبيق الدورة المستندية والسياسات',
      'إصدار وتحديث أدلة السياسات والإجراءات (SOPs)',
      'تصميم مصفوفة الصلاحيات وضوابط الرقابة الداخلية',
      'إدارة المخاطر التنظيمية وضمان الامتثال',
      'التحقق المستقل من نزاهة العمليات',
    ],
    odooRole: 'Governance Auditor',
    odooAccess: 'Quality + Audit Logs',
  },
  {
    id: 'supply-chain',
    titleAr: 'إدارة سلاسل الإمداد',
    titleEn: 'Supply Chain Management',
    emoji: '💻',
    accent: 'navy',
    isOccupied: true,
    responsibilities: [
      'التنسيق الاستراتيجي للتدفقات اللوجستية وتخطيط الموارد',
      'الإشراف على قسم العمليات اللوجستية',
      'تخطيط التوريد وضمان استمرارية السلسلة',
      'تحليل كفاءة العمليات الميدانية',
      'المسؤول عن جاهزية الأسطول والمعدات والقوى العاملة',
    ],
    odooRole: 'Supply Chain Manager',
    odooAccess: 'Purchase + Inventory + Fleet',
  },
  {
    id: 'warehouse-mgmt',
    titleAr: 'إدارة المستودعات',
    titleEn: 'Warehouse Management',
    emoji: '🧭',
    accent: 'red',
    responsibilities: [
      'المالك الرسمي للمخزون والمسؤول عن دقة وسلامة الأرصدة',
      'الإشراف على قسم عمليات المستودع',
      'ضمان الالتزام الصارم بقواعد FEFO والباركود',
      'إدارة المساحات التخزينية وتحسين كفاءة التنفيذ الميداني',
      'مطابقة الجرد الفعلي مع النظام (Stock Accountability)',
    ],
    odooRole: 'Inventory Manager',
    odooAccess: 'Inventory + Barcode',
  },
];

/**
 * Tier 3 — Operational Departments under each Pillar.
 */
export const orgSubDepts = [
  {
    id: 'gov-unit',
    parentId: 'governance',
    titleAr: 'السياسات والامتثال',
    titleEn: 'Policies & Compliance',
    emoji: '⚖️',
    accent: 'yellow',
    teams: [
      'وحدة تتبع الحوكمة (Governance Tracking Unit)',
      'فريق صياغة SOPs',
      'مدققو الامتثال الداخلي',
    ],
    odooRole: 'Quality Administrator',
    odooAccess: 'Quality + Settings (read)',
  },
  {
    id: 'logistics-ops',
    parentId: 'supply-chain',
    titleAr: 'قسم العمليات اللوجستية',
    titleEn: 'Logistics Operations Dept',
    emoji: '⚙️',
    accent: 'navy',
    teams: [
      'مدير العمليات (Operations Manager)',
      'وحدة النقل والحركة (Transport)',
      'وحدة صيانة الأسطول والمعدات (Maintenance)',
      'فريق الأمن الصناعي والسلامة (Security)',
      'وحدة إدارة العمالة الخارجية (Labor Management)',
    ],
    odooRole: 'Operations User',
    odooAccess: 'Fleet + Maintenance',
  },
  {
    id: 'warehouse-ops',
    parentId: 'warehouse-mgmt',
    titleAr: 'قسم عمليات المستودع',
    titleEn: 'Warehouse Operations Dept',
    emoji: '📦',
    accent: 'red',
    teams: [
      'وحدة الاستلام والرقابة (Receiving)',
      'وحدة التخزين وتحديد المواقع (Storage)',
      'وحدة تحضير الطلبات والصرف (Dispatch)',
      'وحدة إدارة المرتجعات (Returns)',
    ],
    odooRole: 'Inventory User',
    odooAccess: 'Inventory + Barcode',
  },
];

/**
 * Support Functions — Horizontal band below the pillars.
 */
export const supportFunctions = [
  {
    id: 'qa-mgr',
    titleAr: 'إدارة الجودة',
    titleEn: 'Quality Management',
    emoji: '🔬',
    accent: 'yellow',
    responsibilities: [
      'تطبيق معايير سلامة الغذاء العالمية',
      'إدارة فريق فحص الجودة الميداني',
      'اعتماد الموردين فنياً والرقابة الصحية',
    ],
    odooRole: 'Quality Administrator',
    odooAccess: 'Quality + Inventory (read)',
  },
  {
    id: 'comm-mgr',
    titleAr: 'الإدارة التجارية',
    titleEn: 'Commercial Management',
    emoji: '💼',
    accent: 'navy',
    responsibilities: [
      'إدارة علاقات الموردين واتفاقيات الشراء',
      'الإشراف على المشتريات وضمان شروط التوريد',
      'تحليل السوق وتطوير الشراكات التجارية',
    ],
    odooRole: 'Commercial Manager',
    odooAccess: 'Purchase + Sales',
  },
  {
    id: 'fin-mgr',
    titleAr: 'إدارة المالية',
    titleEn: 'Finance Management',
    emoji: '💰',
    accent: 'navy',
    responsibilities: [
      'الرقابة المالية على الأصول والمخزون',
      'إدارة الميزانيات والتحليل المالي للتشغيل',
      'المطابقات المالية مع الموردين (3-Way Match)',
    ],
    odooRole: 'Accounting Manager',
    odooAccess: 'Accounting + Invoicing',
  },
  {
    id: 'it-mgr',
    titleAr: 'الإدارة التقنية',
    titleEn: 'IT Management',
    emoji: '💾',
    accent: 'navy',
    responsibilities: [
      'إدارة نظام Odoo ERP والبنية التحتية',
      'ضمان أمن البيانات واستمرارية الأنظمة',
      'الدعم الفني لأجهزة الباركود والشبكات',
    ],
    odooRole: 'System Administrator',
    odooAccess: 'Settings + Technical',
  },
  {
    id: 'hr-mgr',
    titleAr: 'الموارد البشرية',
    titleEn: 'Human Resources',
    emoji: '👥',
    accent: 'navy',
    responsibilities: [
      'تخطيط القوى العاملة والتوظيف والتدريب',
      'إدارة شؤون الموظفين والرواتب والامتثال',
      'تطوير الأداء والثقافة التنظيمية',
    ],
    odooRole: 'HR Manager',
    odooAccess: 'Employees + Payroll',
  },
];
