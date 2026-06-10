import React, { useState, useMemo } from 'react';
import Icon from '../../ui/Icon.jsx';

const WarehouseMaps = () => {
  const [activeTab, setActiveTab]           = useState('overview');
  const [selectedZone, setSelectedZone]     = useState(null);
  const [activePlanA, setActivePlanA]       = useState(null);
  const [activePlanB, setActivePlanB]       = useState(null);
  const [activeFlowStep, setActiveFlowStep] = useState(null);
  const [dimensions, setDimensions]         = useState({
    clearHeight: 12,
    flooring: 'إيبوكسي FF50',
    rackingSystem: 'Selective Pallet Racking',
  });

  // ─── Site Data ────────────────────────────────────────────────────────────
  const siteInfo = {
    id: 'موقع رقم 155',
    location: 'بوهادي – بنغازي',
    nearAirport: 'مطار بنينة الدولي (12 كم)',
    totalSiteArea: '65,000 م²',
    coveredArea: '18,500 م²',
    currentHeight: '6.80 م',
    targetClass: 'Class A Logistics',
    preparedBy: 'محمد البرشي — رمزي باش',
    department: 'إدارة المستودعات',
    submittedTo: 'المدير العام',
  };

  const warehouses = [
    { id: 'E-1',  name: 'استلام + بفر',    area: 2200, dims: '20×110م', function: 'Receiving + Inbound Buffer',         height: 7.5,  color: '#27ae60', pallets: 420 },
    { id: 'E-2',  name: 'تخزين جاف',       area: 1000, dims: '20×50م',  function: 'Dry Storage',                       height: 9.5,  color: '#2980b9', pallets: 860 },
    { id: 'E-3',  name: 'تخزين جاف',       area: 1000, dims: '20×50م',  function: 'Dry Storage',                       height: 9.5,  color: '#2980b9', pallets: 860 },
    { id: 'E-4',  name: 'تخزين + QC',      area: 1000, dims: '20×50م',  function: 'Storage + Quality Control',         height: 7.5,  color: '#8e44ad', pallets: 310 },
    { id: 'E-5',  name: 'High-Bay الرئيسي',area: 3500, dims: '35×100م', function: 'Selective Pallet Racking High-Bay', height: 12.0, color: '#1abc9c', pallets: 4200, highPriority: true },
    { id: 'E-6',  name: 'تخزين + خروج',    area: 2200, dims: '20×110م', function: 'Storage + Outbound Staging',        height: 9.5,  color: '#2980b9', pallets: 1280 },
    { id: 'E-7',  name: 'تخزين جاف',       area: 2200, dims: '20×110م', function: 'Dry Storage',                       height: 9.5,  color: '#2980b9', pallets: 1280 },
    { id: 'E-8',  name: 'تخزين جاف',       area: 2200, dims: '20×110م', function: 'Dry Storage',                       height: 9.5,  color: '#2980b9', pallets: 1280 },
    { id: 'E-9',  name: 'تخزين + بفر',     area: 2200, dims: '20×110م', function: 'Storage + Outbound Buffer',         height: 9.5,  color: '#3498db', pallets: 1280 },
    { id: 'E-10', name: 'شحن / Cross-Dock', area: 1000, dims: '20×50م', function: 'Outbound Shipping + Cross-Dock',    height: 7.5,  color: '#e67e22', pallets: 380 },
  ];

  // ─── Plan A: Individual Conversion ───────────────────────────────────────
  const planAItems = [
    {
      id: 'PA-1', zones: ['E-1'],
      title: 'تحويل E-1 إلى منطقة استلام احترافية',
      badge: 'Receiving Hub',
      color: '#27ae60',
      icon: '🚛',
      priority: 'أولى',
      impact: 'عالي جداً',
      summary: 'تحويل الوحدة من تخزين عادي إلى مركز استلام متكامل بمواصفات دولية مع 4 أرصفة دوك هيدروليكية.',
      currentIssues: [
        'لا يوجد رصيف دوك مناسب — التحميل يتم من مستوى الأرض',
        'غياب منطقة بفر منظمة لتجميع البضاعة الواردة',
        'لا توجد مسارات مخصصة لحركة الرافعات الشوكية',
      ],
      proposedChanges: [
        'إنشاء 4 أرصفة Dock بارتفاع 1.20م مع Dock Levelers هيدروليكية',
        'تخصيص 330م² منطقة بفر استلام (Buffer Zone) مع خطوط ترتيب',
        'رسم مسارات حركة معتمدة (OSHA) على الأرضية بألوان مخصصة',
        'تركيب أبواب رول سريعة ≥ 2.75م × 3.5م عند كل رصيف',
        'تركيب شاشات عرض لحالة الأرصفة (Dock Management System)',
      ],
      standards: ['ANSI MH30.1', 'OSHA 29 CFR 1910.178', 'GS1 Distribution'],
      kpi: 'رفع طاقة الاستلام من 8 إلى 30 طبلية/ساعة',
    },
    {
      id: 'PA-2', zones: ['E-4'],
      title: 'تحويل E-4 إلى مركز مراقبة الجودة',
      badge: 'QC Center',
      color: '#8e44ad',
      icon: '🔬',
      priority: 'أولى',
      impact: 'عالي',
      summary: 'تخصيص الوحدة كلياً لعمليات فحص الجودة مع تجهيزات متكاملة وفق ISO 9001:2015.',
      currentIssues: [
        'لا توجد منطقة عزل رسمية للبضائع الخاضعة للفحص',
        'فحص الجودة يتم داخل منطقة التخزين دون فصل واضح',
        'غياب نظام توثيق فحص مرتبط بـ WMS',
      ],
      proposedChanges: [
        'تقسيم الوحدة: 60% منطقة فحص نشطة + 25% عزل + 15% مكتب توثيق',
        'تركيب طاولات فحص صناعية مع إضاءة ≥ 400 لوكس',
        'إنشاء منطقة حجر صحي للبضائع المعيبة مع إشارات تحذيرية',
        'ربط نتائج الفحص مباشرة بنظام Odoo QC Module',
        'تركيب كاميرات توثيق فوق طاولات الفحص',
      ],
      standards: ['ISO 9001:2015', 'EN 12464-1 (≥400 لوكس)'],
      kpi: 'تغطية فحص 100% للشحنات الواردة مع توثيق رقمي فوري',
    },
    {
      id: 'PA-3', zones: ['E-5'],
      title: 'تطوير E-5 إلى High-Bay Class A',
      badge: 'High-Bay ★',
      color: '#1abc9c',
      icon: '🏗️',
      priority: 'أولى',
      impact: 'عالي جداً',
      summary: 'الوحدة الأكبر والأهم — رفع الارتفاع إلى 12م لتشغيل رفوف انتقائية 6 مستويات وفق المعيار الدولي Class A.',
      currentIssues: [
        'الارتفاع الحالي 6.80م لا يسمح إلا بـ 3 مستويات رفوف',
        'هدر 45% من الحجم العمودي المتاح',
        'لا تتوفر رشاشات ESFR المطلوبة للمستودعات العالية',
      ],
      proposedChanges: [
        'رفع ارتفاع السقف الصافي إلى 12.0م مع دعم إنشائي',
        'تركيب رفوف انتقائية 6 مستويات (أعمدة زرقاء + عوارض برتقالية)',
        'Column Guards عند قواعد الأعمدة لحماية الهيكل',
        'تركيب منظومة رشاشات ESFR K-25 (NFPA 13) تغطية كاملة',
        'صب أرضية إيبوكسي صناعي FF50 تتحمل ≥7.5 طن/م²',
        'Reach Truck لممرات 1.8م + VNA لزيادة الكثافة التخزينية',
      ],
      standards: ['EN 15620', 'NFPA 13 (ESFR K-25)', 'TR 34 FF50'],
      kpi: 'من 3 مستويات إلى 6 مستويات — زيادة السعة +140%',
    },
    {
      id: 'PA-4', zones: ['E-9', 'E-10'],
      title: 'تحويل E-9+E-10 إلى مركز شحن متكامل',
      badge: 'Outbound Hub',
      color: '#e67e22',
      icon: '🚚',
      priority: 'ثانية',
      impact: 'عالي',
      summary: 'تحويل الوحدتين المتجاورتين إلى مركز شحن احترافي مع Cross-Dock وأرصفة خروج منظمة.',
      currentIssues: [
        'لا يوجد تمييز واضح بين منطقة التخزين ومنطقة الشحن',
        'غياب أرصفة دوك للخروج بالأعداد الكافية',
        'لا يوجد نظام تتابع لترتيب شحنات الخروج',
      ],
      proposedChanges: [
        'تخصيص E-9 كاملاً لبفر الخروج (280م² Staging Zone)',
        'تحويل E-10 إلى Cross-Dock فعّال مع تدفق مستقيم IN→OUT',
        'إنشاء 3 أرصفة دوك للخروج مع Safety Light أحمر/أخضر',
        'خطوط تصنيف البضاعة حسب الوجهة والمسار على الأرضية',
        'تركيب آلة Stretch Wrap تلقائية لتأمين الطبليات',
      ],
      standards: ['ANSI MH30.1', 'GS1 Distribution'],
      kpi: 'دقة الشحن من 85% إلى ≥99.5%',
    },
    {
      id: 'PA-5', zones: ['E-2', 'E-3', 'E-6', 'E-7', 'E-8'],
      title: 'ترقية وحدات التخزين الجاف',
      badge: 'Dry Storage Upgrade',
      color: '#2980b9',
      icon: '📦',
      priority: 'ثانية',
      impact: 'متوسط-عالي',
      summary: 'ترقية موحدة لوحدات التخزين الجاف بتركيب رفوف انتقائية ورسم مسارات حركة وتحسين الإضاءة.',
      currentIssues: [
        'تخزين عشوائي على الأرضية دون نظام ترتيب واضح',
        'إضاءة غير كافية (أقل من 200 لوكس) في بعض الوحدات',
        'لا توجد مسارات رافعات محددة — خطر تصادم',
      ],
      proposedChanges: [
        'تركيب رفوف انتقائية 4 مستويات في كل وحدة',
        'رسم ممرات رافعات 3.0م (Counterbalance) بخطوط صفراء',
        'ترقية الإضاءة إلى LED صناعي ≥200 لوكس في كل الوحدات',
        'تعليم مواقع التخزين بالترقيم (Aisle-Bay-Level)',
        'تركيب End-of-Aisle Protectors عند نهاية كل ممر',
      ],
      standards: ['EN 15620', 'EN 12464-1', 'FEM 9.831'],
      kpi: 'رفع كفاءة استغلال المساحة من ~35% إلى ≥75%',
    },
  ];

  // ─── Plan B: Warehouse Merging ────────────────────────────────────────────
  const planBItems = [
    {
      id: 'PB-1',
      zones: ['E-1', 'E-4'],
      mergedName: 'مركز الاستلام والجودة الموحد',
      mergedId: 'RC-01',
      color: '#27ae60',
      icon: '🔗',
      totalArea: 3200,
      currentAreas: '2200 + 1000 م²',
      badge: 'Receiving & QC Hub',
      priority: 'أولى',
      rationale: 'تجاور E-1 وE-4 يجعل دمجهما طبيعياً — البضاعة تنتقل مباشرة من الاستلام إلى الفحص دون نقل خارجي.',
      mergedLayout: [
        'المنطقة الشمالية (55% — 1760م²): أرصفة الاستلام وبفر الوارد',
        'المنطقة الوسطى (25% — 800م²): مختبر مراقبة الجودة والفحص',
        'المنطقة الجنوبية (20% — 640م²): عزل البضاعة المعلقة وتوثيق',
      ],
      advantages: [
        'إلغاء حركة البضاعة بين وحدتين منفصلتين — توفير وقت وجهد',
        'إشراف أسهل — مشرف واحد يغطي الاستلام والجودة معاً',
        'توحيد نظام التوثيق في Odoo بدلاً من وحدتين مستقلتين',
        'مساحة إجمالية 3200م² تتيح تدفقاً خطياً أكثر كفاءة',
      ],
      challenges: [
        'يتطلب هدم الجدار الفاصل بين الوحدتين — عمل إنشائي محدود',
        'إعادة تخطيط شبكة الإضاءة والمرشات للمساحة الموحدة',
      ],
      operationalImpact: 'تقليل زمن دورة الاستلام والفحص من 4 ساعات إلى أقل من 90 دقيقة',
    },
    {
      id: 'PB-2',
      zones: ['E-2', 'E-3'],
      mergedName: 'وحدة التخزين الجاف الكبيرة',
      mergedId: 'DS-01',
      color: '#2980b9',
      icon: '🔗',
      totalArea: 2000,
      currentAreas: '1000 + 1000 م²',
      badge: 'Unified Dry Storage',
      priority: 'ثانية',
      rationale: 'وحدتان متطابقتان ومتجاورتان — الدمج يُضاعف المساحة الفعلية ويتيح تخطيطاً داخلياً أكثر مرونة.',
      mergedLayout: [
        'قسم A (50% — 1000م²): تخزين رفوف انتقائية طولية',
        'قسم B (50% — 1000م²): تخزين رفوف انتقائية عرضية',
        'ممر مركزي مشترك 3م عرض يخدم القسمين',
      ],
      advantages: [
        'ممر رافعة مركزي مشترك يُقلل الازدحام الداخلي',
        'تصميم رفوف بالعمق المزدوج (Double-Deep) يرفع الكثافة',
        'إدارة مخزون موحدة بدلاً من تتبع وحدتين منفصلتين',
        'سهولة توسيع نطاق السلع المخزنة حسب الموسم',
      ],
      challenges: [
        'هدم الجدار الفاصل وفحص حمولة القاعدة الفاصلة',
        'إعادة توزيع نقاط إطفاء الحريق',
      ],
      operationalImpact: 'رفع كفاءة استغلال المساحة التخزينية من 60% إلى 88%',
    },
    {
      id: 'PB-3',
      zones: ['E-7', 'E-8', 'E-9'],
      mergedName: 'مركز التخزين الضخم — Mega Storage',
      mergedId: 'MS-01',
      color: '#9b59b6',
      icon: '🔗',
      totalArea: 6600,
      currentAreas: '2200 + 2200 + 2200 م²',
      badge: 'Mega Storage',
      priority: 'ثانية',
      rationale: 'ثلاث وحدات متجاورة على طول ساحة واحدة — الدمج يخلق أكبر مساحة تخزين متكاملة في الموقع.',
      mergedLayout: [
        'الجناح الشمالي (30% — 1980م²): تخزين كثيف Drive-In',
        'الجناح الأوسط (40% — 2640م²): رفوف انتقائية — ممرات عريضة',
        'الجناح الجنوبي (30% — 1980م²): بفر الخروج + Staging',
        'ممران رئيسيان طوليان 3.5م عرض + ممرات فرعية 1.8م',
      ],
      advantages: [
        'أكبر مساحة تخزين متكاملة: 6600م² بإدارة مركزية واحدة',
        'تشغيل نظام رفوف Drive-In يُضاعف كثافة التخزين مقارنة بالانتقائي',
        'إمكانية تخصيص جناح كامل لعميل واحد (3PL Operations)',
        'تدفق خطي مثالي من التخزين إلى بفر الخروج دون انعطافات',
        'تقليل عدد المشرفين المطلوبين من 3 إلى 1 لنفس المساحة',
      ],
      challenges: [
        'يتطلب هدم جدارين فاصلين وفحصاً إنشائياً شاملاً',
        'تصميم جديد كامل لشبكة الإطفاء والإضاءة',
        'توقف تشغيلي مؤقت أثناء التعديل — يستلزم تخطيطاً للطوارئ',
      ],
      operationalImpact: 'زيادة طاقة التخزين الاستيعابية الكلية بنسبة 62% مقارنة بالتشغيل الفردي',
    },
    {
      id: 'PB-4',
      zones: ['E-6', 'E-10'],
      mergedName: 'مركز الشحن والتوزيع الموحد',
      mergedId: 'OB-01',
      color: '#e67e22',
      icon: '🔗',
      totalArea: 3200,
      currentAreas: '2200 + 1000 م²',
      badge: 'Outbound & Cross-Dock',
      priority: 'أولى',
      rationale: 'E-6 (تدريج) وE-10 (شحن) يؤديان وظيفة واحدة متصلة — الدمج يُتيح تدفقاً خطياً مثالياً للشحن.',
      mergedLayout: [
        'المنطقة الخلفية (35% — 1120م²): تدريج الطلبات وتجميعها',
        'المنطقة الأمامية (35% — 1120م²): Cross-Dock — تحميل مباشر',
        'منطقة الأرصفة (30% — 960م²): 5 أرصفة دوك للخروج',
      ],
      advantages: [
        'تدفق خطي: تدريج → تحميل → شحن بدون نقل بين وحدتين',
        '5 أرصفة شحن متصلة تتيح تحميل 5 شاحنات متزامنة',
        'تنفيذ Cross-Dock حقيقي: وارد صباحاً + صادر مساءً',
        'إدارة موحدة لجداول الشحن والاستلام في نفس المنطقة',
      ],
      challenges: [
        'يستلزم تصميم أرضية مُبرمجة لاتجاهات الحركة (Traffic Flow Design)',
        'إدارة الحركة الداخلية تزداد تعقيداً مع وجود شاحنات الوارد والصادر',
      ],
      operationalImpact: 'رفع طاقة الشحن اليومية من 12 إلى 28 طبلية/ساعة',
    },
  ];

  const logisticsFlow = [
    { step: 1, title: 'وصول الشاحنة',      subtitle: 'Truck Arrival',      zone: 'بوابة الدخول', color: '#27ae60', icon: '🚛', details: ['تسجيل رقم الشاحنة والمستندات الجمركية', 'فحص درجة الحرارة وحالة الحمولة', 'تخصيص رصيف تحميل عبر WMS', 'إصدار تصريح دخول رقمي'], standard: 'ANSI MH30.1', kpi: 'زمن الانتظار ≤ 15 دقيقة', equipment: 'بوابة RFID + كاميرات ANPR' },
    { step: 2, title: 'الاستلام والتفريغ', subtitle: 'Receiving',           zone: 'E-1',          color: '#27ae60', icon: '📦', details: ['فحص كمي وكيفي لكل طبلية', 'مسح باركود GS1-128 لكل وحدة', 'إدخال فوري لبيانات الاستلام في Odoo', 'تخصيص موقع تخزين تلقائياً'], standard: 'GS1 Distribution', kpi: 'معدل التفريغ: 30 طبلية/ساعة', equipment: 'Dock Leveler + ماسح GS1' },
    { step: 3, title: 'مراقبة الجودة',     subtitle: 'Quality Control',    zone: 'E-4',          color: '#8e44ad', icon: '🔍', details: ['فحص عينة ≥10% من كل شحنة', 'توثيق نتائج الفحص في ISO 9001', 'عزل البضاعة المعيبة', 'إصدار شهادة مطابقة'], standard: 'ISO 9001:2015', kpi: 'زمن الفحص ≤ 90 دقيقة', equipment: 'طاولات فحص + ميزان دقيق' },
    { step: 4, title: 'التخزين الرئيسي',   subtitle: 'Main Storage',       zone: 'E-5 + E-2→E-9', color: '#1abc9c', icon: '🏗️', details: ['تخصيص موقع تلقائي (Slot Allocation)', 'رفوف انتقائية 6 مستويات في E-5', 'تتبع موقع كل طبلية بالباركود', 'FIFO / LIFO تلقائي عبر WMS'], standard: 'EN 15620', kpi: 'دقة المواقع ≥99.5%', equipment: 'Reach Truck + VNA' },
    { step: 5, title: 'تجميع الطلبات',     subtitle: 'Order Picking',      zone: 'E-6',          color: '#3498db', icon: '📋', details: ['أوامر التقاط من Odoo ERP', 'Pick-to-Light لتسريع التجميع', 'التحقق من الوزن والكمية', 'إعداد Packing List تلقائياً'], standard: 'GS1 Distribution', kpi: 'معدل الالتقاط: 50 طبلية/ساعة', equipment: 'عربات تجميع + طابعة ملصقات' },
    { step: 6, title: 'التدريج والتغليف',  subtitle: 'Staging & Wrap',     zone: 'E-9',          color: '#e67e22', icon: '🗂️', details: ['تجميع الطلبات حسب الوجهة', 'تغليف حراري وتأمين بـ Stretch Wrap', 'طباعة بوليصة الشحن النهائية', 'تحضير مستندات الجمارك'], standard: 'ANSI MH30.1', kpi: 'زمن التدريج ≤ 30 دقيقة/شحنة', equipment: 'آلة تغليف حراري' },
    { step: 7, title: 'الشحن والتسليم',    subtitle: 'Outbound Shipping',  zone: 'E-10',         color: '#e74c3c', icon: '🚚', details: ['تحميل الشاحنات عبر Dock Leveler', 'مسح نهائي وتأكيد الشحنة في WMS', 'إشعار تلقائي للعميل عبر Odoo', 'تتبع GPS حتى الوصول'], standard: 'GS1 / ANSI MH30.1', kpi: 'دقة الشحن ≥99.9%', equipment: 'Dock Leveler + Dock Shelter' },
  ];

  const standards = [
    { name: 'ارتفاع منصة الدوك',               ref: 'OSHA 29 CFR',      req: '1.20م ± 50ملم',                         priority: 'Critical', status: 'Compliant',        zone: 'E-1/E-10' },
    { name: 'Dock Leveler عند كل باب',          ref: 'ANSI MH30.1',      req: 'مطلوب عند كل باب تحميل',                priority: 'Critical', status: 'Upgrade Required', zone: 'E-1/E-10' },
    { name: 'حمولة الأرضية',                    ref: 'EN 15620 / ACI',   req: '≥5.0 طن/م² (E-5: ≥7.5)',               priority: 'High',     status: 'Compliant',        zone: 'الكل' },
    { name: 'استواء الأرضية FF50',              ref: 'TR 34',            req: 'إيبوكسي صناعي FF50/FL30',               priority: 'High',     status: 'Upgrade Required', zone: 'E-5/E-6/E-7' },
    { name: 'رشاشات ESFR (High-Bay)',           ref: 'NFPA 13',          req: 'ESFR K-25، ضغط ≥50 psi',               priority: 'Critical', status: 'Upgrade Required', zone: 'E-5' },
    { name: 'الإضاءة التخزين',                  ref: 'EN 12464-1',       req: '≥200 لوكس / استلام ≥400 لوكس',         priority: 'Medium',   status: 'Compliant',        zone: 'الكل' },
    { name: 'بفر الاستلام ≥15%',               ref: 'GS1 Distribution', req: '≥330م² مجاور لأرصفة الدخول',           priority: 'High',     status: 'Compliant',        zone: 'E-1' },
    { name: 'QC Dock مخصص',                    ref: 'ISO 9001:2015',     req: 'منطقة ≥5% بالقرب من الاستلام',         priority: 'High',     status: 'Compliant',        zone: 'E-4' },
    { name: 'ممر Counterbalance ≥3.0م',        ref: 'FEM 9.831',        req: '≥3.0م عرض صافٍ',                       priority: 'Medium',   status: 'Compliant',        zone: 'E-1/E-10' },
    { name: 'ممر Reach Truck ≥1.8م',           ref: 'FEM 9.831',        req: '≥1.8م ممرات ضيقة داخل الرفوف',        priority: 'Medium',   status: 'Compliant',        zone: 'E-2→E-9' },
    { name: 'أبواب رول ≥2.75×3.5م',           ref: 'EN 12604',         req: '≥2.75م عرض × ≥3.5م ارتفاع',           priority: 'High',     status: 'Compliant',        zone: 'E-1/E-10' },
    { name: 'تأريض هيكل الرفوف',               ref: 'IEC 60364-7',      req: 'كل وحدة مؤرضة + بار تأريض مركزي',     priority: 'High',     status: 'Upgrade Required', zone: 'E-5/E-2→E-9' },
  ];

  const assessmentCriteria = [
    { name: 'الموقع الجغرافي — القرب من مطار بنينة',     score: 9, weight: 20, notes: '12كم من مطار بنينة — ميزة استراتيجية لشحن الجوي والسلع الحساسة' },
    { name: 'طرق الوصول والمناورة',                       score: 8, weight: 15, notes: 'ساحة خارجية تتيح مناورة مقطورات 22م — مناسب للناقلات الثقيلة' },
    { name: 'الارتفاع الصافي الحالي',                     score: 7, weight: 25, notes: 'الارتفاع الحالي 6.80م — يتطلب ترقية لـ 12م في E-5 لتحقيق Class A' },
    { name: 'حمولة الأرضية وجودة البناء',                  score: 8, weight: 20, notes: 'الخرسانة الحالية 5 طن/م² — كافية مع تشطيب إيبوكسي FF50' },
    { name: 'أنظمة الحماية والسلامة',                      score: 6, weight: 20, notes: 'تحتاج ترقية شاملة للمرشات إلى ESFR K-25 في E-5 بالأولوية' },
  ];

  const stats = useMemo(() => {
    const totalArea   = 18500;
    const rackLevels  = Math.floor((dimensions.clearHeight - 1.5) / 1.8);
    const estPallets  = Math.floor(totalArea * 0.7 * rackLevels / 1.2);
    const forkliftType = dimensions.clearHeight > 10 ? 'VNA / Reach Truck High-Bay' : 'رافعة Reach قياسية';
    return { totalArea, rackLevels, estPallets, forkliftType };
  }, [dimensions]);

  const totalScore = useMemo(() =>
    assessmentCriteria.reduce((a, c) => a + (c.score * c.weight) / 100, 0),
  []);

  // ─── SVG Floor Plan Layout ────────────────────────────────────────────────
  const layout = [
    { id: 'E-1',  x: 205, y: 12,  w: 108, h: 22 },
    { id: 'E-2',  x: 205, y: 38,  w: 52,  h: 20 },
    { id: 'E-3',  x: 261, y: 38,  w: 52,  h: 20 },
    { id: 'E-4',  x: 205, y: 62,  w: 52,  h: 20 },
    { id: 'E-10', x: 261, y: 62,  w: 52,  h: 20 },
    { id: 'E-5',  x: 12,  y: 12,  w: 100, h: 38 },
    { id: 'E-6',  x: 12,  y: 56,  w: 108, h: 20 },
    { id: 'E-7',  x: 12,  y: 80,  w: 108, h: 20 },
    { id: 'E-8',  x: 12,  y: 104, w: 108, h: 20 },
    { id: 'E-9',  x: 12,  y: 128, w: 108, h: 20 },
  ];

  const getColor = (id) => (warehouses.find(w => w.id === id)?.color ?? '#444');

  // ─── TAB DEFINITIONS ──────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview',    label: 'نظرة عامة',          icon: 'grid' },
    { id: 'planA',       label: 'خطة أ — التحوير',     icon: 'arrowUpTray' },
    { id: 'planB',       label: 'خطة ب — الدمج',       icon: 'workflows' },
    { id: 'flow',        label: 'تدفق العمليات',        icon: 'package' },
    { id: 'standards',   label: 'المعايير الدولية',    icon: 'clipboardList' },
    { id: 'assessment',  label: 'تقييم الموقع',         icon: 'mapPin' },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Overview + Floor Plan
  // ═══════════════════════════════════════════════════════════════════════════
  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'إجمالي المساحة المغطاة', v: '18,500 م²',                       icon: 'grid',          c: 'text-brand-yellow' },
          { l: 'عدد الوحدات التشغيلية',  v: '10 وحدات',                         icon: 'package',       c: 'text-brand-red' },
          { l: 'سعة الطبليات المستهدفة', v: stats.estPallets.toLocaleString(),   icon: 'clipboardList', c: 'text-green-400' },
          { l: 'نوع الرافعة المقترحة',   v: stats.forkliftType,                  icon: 'truck',         c: 'text-blue-400' },
        ].map((s, i) => (
          <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3">
            <div className={`w-10 h-10 bg-brand-navy rounded-lg flex items-center justify-center ${s.c} shrink-0`}>
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="text-gray-400 text-[10px] mb-0.5">{s.l}</div>
              <div className="text-sm font-bold text-white leading-tight">{s.v}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Floor Plan SVG */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <h4 className="font-bold text-white text-sm">المخطط الكابوري الشامل — موقع 155</h4>
          <div className="flex flex-wrap gap-3 text-[10px]">
            {[{c:'#27ae60',l:'استلام'},{c:'#1abc9c',l:'High-Bay'},{c:'#2980b9',l:'تخزين'},{c:'#e67e22',l:'شحن'},{c:'#8e44ad',l:'QC'},{c:'#f1c40f',l:'أرصفة'}].map((x,i)=>(
              <span key={i} className="flex items-center gap-1 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor:x.c}}></span>{x.l}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 380 165" className="w-full" style={{minHeight:200}}>
            {[40,80,120,160,200,240,280,320,360].map(x=><line key={x} x1={x} y1="0" x2={x} y2="165" stroke="#ffffff06" strokeWidth="0.5"/>)}
            {[40,80,120].map(y=><line key={y} x1="0" y1={y} x2="380" y2={y} stroke="#ffffff06" strokeWidth="0.5"/>)}

            {/* Dock strip */}
            <rect x="318" y="10" width="12" height="74" fill="#f1c40f" fillOpacity="0.1" rx="1"/>
            <rect x="318" y="10" width="2"  height="74" fill="#f1c40f" fillOpacity="0.7"/>
            <text x="331" y="50" fill="#f1c40f" fontSize="4" transform="rotate(90,331,50)" textAnchor="middle" opacity="0.8">أرصفة</text>

            {/* Flow arrows */}
            <path d="M205 23 L125 23" stroke="#27ae60" strokeWidth="1" strokeDasharray="3,2" markerEnd="url(#ag)" opacity="0.5"/>
            <path d="M62 50 L62 56" stroke="#1abc9c" strokeWidth="1" strokeDasharray="3,2" markerEnd="url(#at)" opacity="0.5"/>
            <path d="M62 76 L62 80" stroke="#2980b9" strokeWidth="1" strokeDasharray="3,2" markerEnd="url(#ab)" opacity="0.4"/>
            <path d="M120 138 L261 77" stroke="#e67e22" strokeWidth="1" strokeDasharray="3,2" markerEnd="url(#ao)" opacity="0.4"/>
            <defs>
              <marker id="ag" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><polygon points="0 0,4 2,0 4" fill="#27ae60"/></marker>
              <marker id="at" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><polygon points="0 0,4 2,0 4" fill="#1abc9c"/></marker>
              <marker id="ab" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><polygon points="0 0,4 2,0 4" fill="#2980b9"/></marker>
              <marker id="ao" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><polygon points="0 0,4 2,0 4" fill="#e67e22"/></marker>
            </defs>

            {layout.map(rect=>{
              const wh=warehouses.find(w=>w.id===rect.id);
              const sel=selectedZone?.id===rect.id;
              const col=getColor(rect.id);
              return (
                <g key={rect.id} className="cursor-pointer"
                   onClick={()=>setSelectedZone(sel?null:wh)}
                   onMouseEnter={()=>setSelectedZone(wh)}>
                  <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h}
                        fill={col} fillOpacity={sel?0.45:0.18}
                        stroke={col} strokeWidth={sel?2:0.8} rx="2"/>
                  {!['E-1','E-10','E-4'].includes(rect.id)&&(
                    <g opacity="0.2">
                      {[...Array(Math.floor(rect.h/6))].map((_,i)=>(
                        <line key={i} x1={rect.x+4} y1={rect.y+5+i*6} x2={rect.x+rect.w-4} y2={rect.y+5+i*6} stroke="#e67e22" strokeWidth="0.6"/>
                      ))}
                    </g>
                  )}
                  <text x={rect.x+rect.w/2} y={rect.y+rect.h/2-1} textAnchor="middle" fill="white" fontSize="4.5" fontWeight="bold" className="pointer-events-none">{rect.id}</text>
                  <text x={rect.x+rect.w/2} y={rect.y+rect.h/2+5} textAnchor="middle" fill="white" fontSize="3" opacity="0.6" className="pointer-events-none">{wh?.area.toLocaleString()}م²</text>
                  {wh?.highPriority&&<text x={rect.x+rect.w/2} y={rect.y+6} textAnchor="middle" fill="#f1c40f" fontSize="3.5" fontWeight="bold" className="pointer-events-none">★ HIGH-BAY</text>}
                </g>
              );
            })}

            {/* N arrow */}
            <g transform="translate(357,152)">
              <circle cx="0" cy="0" r="7" fill="#ffffff08" stroke="#ffffff15" strokeWidth="0.5"/>
              <text x="0" y="-1" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="bold">N</text>
              <line x1="0" y1="2" x2="0" y2="5" stroke="white" strokeWidth="0.8"/>
            </g>
            <text x="10" y="162" fill="#ffffff25" fontSize="3.5">موقع 155 — بوهادي، بنغازي — المقياس تقريبي</text>
          </svg>
        </div>

        {selectedZone&&(
          <div className="mt-4 p-5 bg-[#141f2e] border rounded-xl" style={{borderColor:selectedZone.color+'55'}}>
            <div className="flex justify-between items-start">
              <div>
                <h5 className="font-bold text-lg mb-0.5" style={{color:selectedZone.color}}>{selectedZone.id}: {selectedZone.name}</h5>
                <p className="text-sm text-white/80">{selectedZone.function}</p>
              </div>
              <button onClick={()=>setSelectedZone(null)} className="text-gray-400 text-xs px-2 py-1 bg-white/5 rounded hover:bg-white/10">✕</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
              {[{l:'الأبعاد',v:selectedZone.dims},{l:'المساحة',v:`${selectedZone.area.toLocaleString()} م²`},{l:'الارتفاع المطلوب',v:`${selectedZone.height} م`},{l:'سعة الطبليات',v:`${selectedZone.pallets.toLocaleString()} طبلية`}].map((r,i)=>(
                <div key={i}><div className="text-gray-400 text-[10px]">{r.l}</div><div className="text-white font-bold">{r.v}</div></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zones table */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4 flex items-center gap-2">
          <Icon name="grid" size={16} className="text-brand-yellow"/> بيان الوحدات التفصيلي
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/10">
              {['الوحدة','الاسم','المساحة','الأبعاد','الارتفاع','الطبليات','المعيار'].map((h,i)=>(
                <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-3">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {warehouses.map(wh=>(
                <tr key={wh.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={()=>setSelectedZone(wh)}>
                  <td className="py-2.5 pr-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{backgroundColor:wh.color+'55',border:`1px solid ${wh.color}44`}}>{wh.id}</span></td>
                  <td className="py-2.5 pr-3 text-white font-medium">{wh.name}</td>
                  <td className="py-2.5 pr-3 text-gray-300">{wh.area.toLocaleString()} م²</td>
                  <td className="py-2.5 pr-3 text-gray-300">{wh.dims}</td>
                  <td className="py-2.5 pr-3"><span className={`font-bold ${wh.height>=12?'text-green-400':wh.height>=9?'text-brand-yellow':'text-gray-300'}`}>{wh.height} م</span></td>
                  <td className="py-2.5 pr-3 text-white font-bold">{wh.pallets.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-brand-yellow text-[10px]">{wh.id==='E-5'?'NFPA 13 / EN 15620':wh.id==='E-4'?'ISO 9001:2015':wh.id==='E-1'||wh.id==='E-10'?'ANSI MH30.1':'EN 15620'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-white/20">
              <td colSpan={2} className="pt-3 pr-3 text-white font-bold">الإجمالي</td>
              <td className="pt-3 pr-3 text-brand-yellow font-bold">{warehouses.reduce((a,w)=>a+w.area,0).toLocaleString()} م²</td>
              <td colSpan={2}></td>
              <td className="pt-3 pr-3 text-brand-yellow font-bold">{warehouses.reduce((a,w)=>a+w.pallets,0).toLocaleString()}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Plan A — Individual Conversion
  // ═══════════════════════════════════════════════════════════════════════════
  const renderPlanA = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Plan header */}
      <div className="bg-gradient-to-l from-[#1a2840] to-[#0f1923] border border-brand-yellow/20 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-brand-yellow/10 rounded-2xl flex items-center justify-center text-3xl border border-brand-yellow/20">🔧</div>
          <div>
            <div className="text-brand-yellow font-bold text-xs uppercase tracking-widest mb-1">الخطة الأولى</div>
            <h3 className="text-2xl font-black text-white">تحوير المستودعات الفردية</h3>
            <p className="text-gray-400 text-sm mt-1">Individual Warehouse Conversion Plan</p>
          </div>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed mb-5">
          تعتمد هذه الخطة على تطوير كل وحدة مستودع على حدة وفق وظيفتها التشغيلية المحددة — دون أي تعديل في الجدران الفاصلة. كل وحدة تحصل على ترقية متخصصة تناسب دورها في سلسلة اللوجستيات من الاستلام إلى الشحن.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[{l:'التعديلات الإنشائية',v:'محدودة جداً'},{l:'مدة التنفيذ',v:'28 أسبوعاً'},{l:'التعطل التشغيلي',v:'منخفض — مرحلي'},{l:'المخاطر التنفيذية',v:'منخفضة'}].map((r,i)=>(
            <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="text-gray-400">{r.l}</div>
              <div className="text-white font-bold mt-0.5">{r.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {planAItems.map((item) => (
          <div key={item.id}
               className="bg-[#141f2e] border rounded-2xl p-5 cursor-pointer hover:scale-[1.01] transition-all"
               style={{borderColor: activePlanA?.id===item.id ? item.color+'88' : '#ffffff15'}}
               onClick={()=>setActivePlanA(activePlanA?.id===item.id ? null : item)}>
            {/* Card header */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <div className="text-[10px] font-bold" style={{color:item.color}}>{item.badge}</div>
                  <h5 className="text-sm font-bold text-white leading-tight">{item.title}</h5>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.priority==='أولى'?'bg-brand-red/15 text-brand-red border border-brand-red/25':'bg-blue-500/15 text-blue-400 border border-blue-500/25'}`}>{item.priority}</span>
                <span className="text-[10px] text-gray-400">{item.zones.join(' + ')}</span>
              </div>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed mb-3">{item.summary}</p>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">الأثر: <span className="font-bold" style={{color:item.color}}>{item.impact}</span></span>
              <span className="text-brand-yellow">{activePlanA?.id===item.id ? '▲ أخفِ التفاصيل' : '▼ عرض التفاصيل'}</span>
            </div>

            {activePlanA?.id===item.id && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                <div>
                  <div className="text-[10px] text-brand-red font-bold uppercase mb-2">المشكلات الحالية</div>
                  <div className="space-y-1.5">
                    {item.currentIssues.map((iss,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-brand-red mt-0.5 shrink-0">✗</span>{iss}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-green-400 font-bold uppercase mb-2">التعديلات المقترحة</div>
                  <div className="space-y-1.5">
                    {item.proposedChanges.map((ch,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-200">
                        <span className="text-green-400 mt-0.5 shrink-0">✓</span>{ch}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.standards.map((s,i)=>(
                    <span key={i} className="text-[10px] bg-brand-navy px-2 py-0.5 rounded text-brand-yellow border border-brand-yellow/20">{s}</span>
                  ))}
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 mb-0.5">مؤشر الأداء المستهدف (KPI)</div>
                  <div className="text-xs text-green-400 font-bold">{item.kpi}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Plan A Summary */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-5">ملخص الخطة أ — مؤشرات الأداء المتوقعة</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {l:'زيادة سعة التخزين',  v:'+140%', c:'text-green-400'},
            {l:'تحسين معدل الاستلام', v:'+275%', c:'text-blue-400'},
            {l:'دقة المخزون الرقمي',  v:'99.9%', c:'text-brand-yellow'},
            {l:'تقليل أخطاء الشحن',   v:'-95%',  c:'text-green-400'},
          ].map((kpi,i)=>(
            <div key={i} className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
              <div className={`text-2xl font-black ${kpi.c}`}>{kpi.v}</div>
              <div className="text-[10px] text-gray-400 mt-1">{kpi.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Plan B — Merging
  // ═══════════════════════════════════════════════════════════════════════════
  const renderPlanB = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Plan header */}
      <div className="bg-gradient-to-l from-[#1a2840] to-[#0f1923] border border-[#9b59b6]/30 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border" style={{backgroundColor:'#9b59b6'+'15',borderColor:'#9b59b6'+'40'}}>🔗</div>
          <div>
            <div className="font-bold text-xs uppercase tracking-widest mb-1" style={{color:'#9b59b6'}}>الخطة الثانية</div>
            <h3 className="text-2xl font-black text-white">دمج المستودعات</h3>
            <p className="text-gray-400 text-sm mt-1">Warehouse Consolidation & Merging Plan</p>
          </div>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed mb-5">
          تعتمد هذه الخطة على دمج الوحدات المتجاورة ذات الوظائف المترابطة لإنشاء مناطق تشغيلية موحدة وأكبر — مما يُلغي الحواجز الداخلية ويخلق تدفقاً لوجستياً أكثر سلاسة وكفاءة.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[{l:'التعديلات الإنشائية',v:'متوسطة — هدم جدران'},{l:'مدة التنفيذ',v:'36 أسبوعاً'},{l:'التعطل التشغيلي',v:'متوسط — مرحلي'},{l:'المكسب التشغيلي',v:'أعلى على المدى البعيد'}].map((r,i)=>(
            <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="text-gray-400">{r.l}</div>
              <div className="text-white font-bold mt-0.5">{r.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Merged zones visual */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4 text-sm">خريطة الدمج المقترحة — الحالة بعد التنفيذ</h4>
        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 380 165" className="w-full" style={{minHeight:200}}>
            {/* Grid */}
            {[40,80,120,160,200,240,280,320,360].map(x=><line key={x} x1={x} y1="0" x2={x} y2="165" stroke="#ffffff05" strokeWidth="0.5"/>)}

            {/* Dock */}
            <rect x="318" y="10" width="12" height="74" fill="#f1c40f" fillOpacity="0.1" rx="1"/>
            <rect x="318" y="10" width="2"  height="74" fill="#f1c40f" fillOpacity="0.6"/>

            {/* RC-01: E-1 + E-4 merged */}
            <rect x="205" y="12" width="108" height="70" fill="#27ae60" fillOpacity="0.25" stroke="#27ae60" strokeWidth="1.5" rx="3"/>
            <line x1="205" y1="35" x2="313" y2="35" stroke="#27ae60" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>
            <text x="259" y="27" textAnchor="middle" fill="#27ae60" fontSize="5" fontWeight="bold">RC-01</text>
            <text x="259" y="35" textAnchor="middle" fill="#27ae60" fontSize="3.5">استلام + QC موحد</text>
            <text x="259" y="44" textAnchor="middle" fill="white"   fontSize="3" opacity="0.6">3,200 م²</text>

            {/* DS-01: E-2 + E-3 merged (placed in remaining space) */}
            <rect x="205" y="86" width="108" height="22" fill="#2980b9" fillOpacity="0.25" stroke="#2980b9" strokeWidth="1.5" rx="3"/>
            <text x="259" y="98" textAnchor="middle" fill="#2980b9" fontSize="5" fontWeight="bold">DS-01</text>
            <text x="259" y="105" textAnchor="middle" fill="white" fontSize="3" opacity="0.6">2,000 م² — تخزين جاف موحد</text>

            {/* E-5 standalone */}
            <rect x="12" y="12" width="100" height="38" fill="#1abc9c" fillOpacity="0.25" stroke="#1abc9c" strokeWidth="1.5" rx="3"/>
            <text x="62" y="29" textAnchor="middle" fill="#f1c40f" fontSize="4.5" fontWeight="bold">★ E-5</text>
            <text x="62" y="37" textAnchor="middle" fill="#1abc9c" fontSize="3.5">High-Bay — 3,500 م²</text>

            {/* MS-01: E-7+E-8+E-9 merged */}
            <rect x="12" y="80" width="108" height="68" fill="#9b59b6" fillOpacity="0.25" stroke="#9b59b6" strokeWidth="1.5" rx="3"/>
            <line x1="12" y1="100" x2="120" y2="100" stroke="#9b59b6" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>
            <line x1="12" y1="120" x2="120" y2="120" stroke="#9b59b6" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>
            <text x="66" y="96" textAnchor="middle" fill="#9b59b6" fontSize="5" fontWeight="bold">MS-01</text>
            <text x="66" y="103" textAnchor="middle" fill="#9b59b6" fontSize="3.5">Mega Storage</text>
            <text x="66" y="112" textAnchor="middle" fill="white" fontSize="3" opacity="0.6">6,600 م²</text>

            {/* OB-01: E-6+E-10 merged */}
            <rect x="12" y="56" width="108" height="20" fill="#e67e22" fillOpacity="0.25" stroke="#e67e22" strokeWidth="1.5" rx="3"/>
            <text x="66" y="66" textAnchor="middle" fill="#e67e22" fontSize="4.5" fontWeight="bold">OB-01</text>
            <text x="66" y="73" textAnchor="middle" fill="white" fontSize="3" opacity="0.6">شحن + تدريج موحد — 3,200 م²</text>

            {/* Labels */}
            <text x="10" y="162" fill="#ffffff25" fontSize="3.5">خريطة الدمج المقترحة — موقع 155</text>
          </svg>
        </div>
      </div>

      {/* Merge items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {planBItems.map((item) => (
          <div key={item.id}
               className="bg-[#141f2e] border rounded-2xl p-5 cursor-pointer hover:scale-[1.01] transition-all"
               style={{borderColor: activePlanB?.id===item.id ? item.color+'88' : '#ffffff15'}}
               onClick={()=>setActivePlanB(activePlanB?.id===item.id ? null : item)}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-xs" style={{backgroundColor:item.color+'25',border:`1px solid ${item.color}40`}}>
                  {item.mergedId}
                </div>
                <div>
                  <div className="text-[10px]" style={{color:item.color}}>{item.zones.join(' + ')} → {item.badge}</div>
                  <h5 className="text-sm font-bold text-white leading-tight">{item.mergedName}</h5>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.priority==='أولى'?'bg-brand-red/15 text-brand-red border border-brand-red/25':'bg-blue-500/15 text-blue-400 border border-blue-500/25'}`}>{item.priority}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-gray-400">المساحة قبل الدمج</div>
                <div className="text-white font-bold">{item.currentAreas}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2" style={{borderRight:`2px solid ${item.color}`}}>
                <div className="text-gray-400">المساحة بعد الدمج</div>
                <div className="font-bold" style={{color:item.color}}>{item.totalArea.toLocaleString()} م²</div>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-3">{item.rationale}</p>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-green-400 font-bold">↑ {item.operationalImpact.split('من')[0]}</span>
              <span className="text-brand-yellow">{activePlanB?.id===item.id ? '▲ أخفِ التفاصيل' : '▼ عرض التفاصيل'}</span>
            </div>

            {activePlanB?.id===item.id && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                <div>
                  <div className="text-[10px] text-brand-yellow font-bold uppercase mb-2">تخطيط المساحة الموحدة</div>
                  <div className="space-y-1.5">
                    {item.mergedLayout.map((l,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="font-bold mt-0.5 shrink-0" style={{color:item.color}}>▪</span>{l}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-green-400 font-bold uppercase mb-2">مزايا الدمج</div>
                  <div className="space-y-1.5">
                    {item.advantages.map((a,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-200">
                        <span className="text-green-400 mt-0.5 shrink-0">✓</span>{a}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-red font-bold uppercase mb-2">تحديات التنفيذ</div>
                  <div className="space-y-1.5">
                    {item.challenges.map((c,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-brand-red mt-0.5 shrink-0">!</span>{c}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 mb-0.5">الأثر التشغيلي المتوقع</div>
                  <div className="text-xs text-green-400 font-bold">{item.operationalImpact}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Plan B vs Plan A comparison */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-5">مقارنة الخطتين — تمييز لاتخاذ القرار</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/10">
              <th className="text-right text-gray-400 font-bold pb-3 pr-3">المعيار</th>
              <th className="text-center pb-3 text-brand-yellow font-bold">خطة أ — التحوير</th>
              <th className="text-center pb-3 font-bold" style={{color:'#9b59b6'}}>خطة ب — الدمج</th>
            </tr></thead>
            <tbody>
              {[
                {m:'التعديلات الإنشائية',     a:'محدودة (لا هدم جدران)',      b:'متوسطة (هدم جدران فاصلة)'},
                {m:'مدة التنفيذ',             a:'28 أسبوعاً',                 b:'36 أسبوعاً'},
                {m:'التعطل التشغيلي',         a:'منخفض — مرحلي',              b:'متوسط — مرحلي'},
                {m:'المرونة المستقبلية',      a:'عالية — كل وحدة مستقلة',      b:'متوسطة — مناطق كبيرة'},
                {m:'الكفاءة التشغيلية',       a:'جيدة جداً',                  b:'ممتازة — تدفق خطي'},
                {m:'سهولة الإدارة',           a:'متوسطة — 10 وحدات',          b:'عالية — 5 مناطق فقط'},
                {m:'الاستغلال الأمثل للمساحة', a:'75–80%',                   b:'85–92%'},
                {m:'الأنسب لـ',              a:'مرونة وسرعة تنفيذ',          b:'رفع كفاءة طويلة الأمد'},
              ].map((r,i)=>(
                <tr key={i} className="border-b border-white/5">
                  <td className="py-2.5 pr-3 text-gray-300 font-medium">{r.m}</td>
                  <td className="py-2.5 text-center text-brand-yellow">{r.a}</td>
                  <td className="py-2.5 text-center" style={{color:'#9b59b6'}}>{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 p-4 bg-brand-navy/50 rounded-xl border border-brand-yellow/15">
          <div className="text-[10px] text-brand-yellow font-bold mb-1">💡 توصية الإدارة</div>
          <p className="text-xs text-gray-300 leading-relaxed">
            يُقترح البدء بـ <strong className="text-white">خطة أ (التحوير)</strong> كمرحلة أولى لأنها أسرع تنفيذاً وأقل تعطيلاً للعمليات، ثم الانتقال إلى عمليات الدمج الاستراتيجي في <strong className="text-white">خطة ب</strong> بعد تثبيت التشغيل وبناء الكفاءة التشغيلية الأساسية.
          </p>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Logistics Flow
  // ═══════════════════════════════════════════════════════════════════════════
  const renderFlow = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-1">رحلة البضاعة الكاملة — من الدخول إلى الخروج</h4>
        <p className="text-gray-400 text-xs mb-6">تدفق العمليات اللوجستية داخل موقع 155 بعد التحويل إلى Class A</p>

        <div className="flex items-center gap-0 overflow-x-auto pb-4">
          {logisticsFlow.map((step, i) => (
            <React.Fragment key={step.step}>
              <button className="flex flex-col items-center gap-2 cursor-pointer shrink-0 min-w-[80px]"
                      onClick={()=>setActiveFlowStep(activeFlowStep?.step===step.step?null:step)}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border-2 transition-all"
                     style={{backgroundColor:activeFlowStep?.step===step.step?step.color+'40':step.color+'18', borderColor:activeFlowStep?.step===step.step?step.color:step.color+'35', boxShadow:activeFlowStep?.step===step.step?`0 0 16px ${step.color}44`:'none'}}>
                  {step.icon}
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold text-white">{step.title}</div>
                  <div className="text-[9px] text-gray-500">{step.subtitle}</div>
                </div>
              </button>
              {i < logisticsFlow.length-1 && (
                <div className="flex items-center w-8 shrink-0 mb-6">
                  <div className="w-full h-px bg-gray-700 relative">
                    <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t-2 border-r-2 border-gray-500 rotate-45"></div>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {activeFlowStep ? (
          <div className="mt-5 p-5 rounded-2xl border animate-fade-in"
               style={{backgroundColor:activeFlowStep.color+'12',borderColor:activeFlowStep.color+'40'}}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeFlowStep.icon}</span>
                <div>
                  <div className="text-xs font-bold mb-0.5" style={{color:activeFlowStep.color}}>الخطوة {activeFlowStep.step}</div>
                  <h5 className="text-lg font-bold text-white">{activeFlowStep.title}</h5>
                  <p className="text-xs text-gray-300">{activeFlowStep.zone}</p>
                </div>
              </div>
              <button onClick={()=>setActiveFlowStep(null)} className="text-gray-400 text-xs px-2 py-1 bg-white/10 rounded shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 space-y-2">
                <div className="text-[10px] text-gray-400 font-bold uppercase mb-2">إجراءات التشغيل</div>
                {activeFlowStep.details.map((d,i)=>(
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-200">
                    <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold text-white mt-0.5" style={{backgroundColor:activeFlowStep.color}}>{i+1}</span>
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {[{l:'المعيار',v:activeFlowStep.standard,c:'text-brand-yellow'},{l:'KPI المستهدف',v:activeFlowStep.kpi,c:'text-green-400'},{l:'المعدات',v:activeFlowStep.equipment,c:'text-white'}].map((r,i)=>(
                  <div key={i} className="bg-white/5 rounded-xl p-3">
                    <div className="text-[10px] text-gray-400 mb-0.5">{r.l}</div>
                    <div className={`text-xs font-bold ${r.c}`}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-white/5 rounded-xl text-center text-xs text-gray-500 border border-white/5">
            ↑ اضغط على أي خطوة لعرض تفاصيلها الكاملة
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Standards
  // ═══════════════════════════════════════════════════════════════════════════
  const renderStandards = () => {
    const upgradeCount   = standards.filter(s=>s.status==='Upgrade Required').length;
    const complianceRate = Math.round(((standards.length-upgradeCount)/standards.length)*100);
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {l:'عناصر حرجة',     v:standards.filter(s=>s.priority==='Critical').length, c:'text-brand-red',    b:'bg-brand-red/10'},
            {l:'تطويرات مطلوبة', v:upgradeCount,                                         c:'text-brand-yellow', b:'bg-brand-yellow/10'},
            {l:'نسبة الامتثال',  v:`${complianceRate}%`,                                  c:'text-green-400',    b:'bg-green-500/10'},
          ].map((s,i)=>(
            <div key={i} className="bg-[#141f2e] border border-white/10 p-6 rounded-2xl flex items-center justify-between">
              <div><div className="text-gray-400 text-xs font-bold uppercase mb-1">{s.l}</div><div className={`text-3xl font-bold ${s.c}`}>{s.v}</div></div>
              <div className={`w-12 h-12 ${s.b} rounded-full flex items-center justify-center ${s.c}`}><Icon name="clipboardList" size={22}/></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {standards.map((s,i)=>(
            <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 hover:border-white/25 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${s.priority==='Critical'?'bg-brand-red/15 text-brand-red border-brand-red/30':s.priority==='High'?'bg-orange-500/15 text-orange-400 border-orange-500/30':'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>{s.priority}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.status==='Compliant'?'bg-green-500':'bg-brand-yellow animate-pulse'}`}></span>
                  <span className={`text-[10px] font-bold ${s.status==='Compliant'?'text-green-400':'text-brand-yellow'}`}>{s.status==='Compliant'?'مطابق':'تطوير مطلوب'}</span>
                </div>
              </div>
              <h5 className="font-bold text-white text-sm mb-0.5">{s.name}</h5>
              <div className="text-[10px] text-gray-400 mb-3 font-mono">{s.ref}</div>
              <div className="bg-white/5 p-3 rounded-lg mb-2">
                <div className="text-[10px] text-gray-400 mb-0.5">المطلب الفني</div>
                <div className="text-[11px] text-gray-200 leading-relaxed">{s.req}</div>
              </div>
              <div className="text-[10px] text-gray-500">المنطقة: <span className="text-brand-yellow">{s.zone}</span></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Assessment
  // ═══════════════════════════════════════════════════════════════════════════
  const renderAssessment = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Airport advantage banner */}
      <div className="bg-gradient-to-l from-[#1a3a2a] to-[#0f2218] border border-green-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-4xl">✈️</div>
          <div>
            <div className="text-green-400 font-bold text-xs uppercase tracking-wider mb-1">ميزة جغرافية استراتيجية</div>
            <h3 className="text-xl font-black text-white">القرب من مطار بنينة الدولي — 12 كيلومتراً</h3>
          </div>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed mb-5">
          يقع الموقع 155 على بُعد 12 كيلومتراً فقط من مطار بنينة الدولي — وهو موقع نادر في منطقة بنغازي. هذه الميزة تُضاعف من القيمة التشغيلية للمستودعات بعد تطويرها وتفتح آفاقاً لوجستية لا تتوفر في معظم المستودعات المنافسة.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '📦', title: 'البضائع الجوية', desc: 'استقبال شحنات الطيران مباشرة في المستودع خلال أقل من ساعة من وصول الطائرة — ميزة تنافسية حاسمة للبضائع الحساسة للوقت.' },
            { icon: '💊', title: 'الأدوية والسلع الحساسة', desc: 'مستودعات Class A القريبة من المطار هي الخيار الأمثل للشركات الدوائية والمعدات الطبية التي تستلزم سلسلة تبريد متكاملة.' },
            { icon: '🏢', title: 'خدمات الطرف الثالث 3PL', desc: 'القرب من المطار يُمكّن من تقديم خدمات لوجستية للطرف الثالث للشركات التي لا تملك مستودعاتها في المنطقة.' },
          ].map((item,i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-green-500/10">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-white font-bold text-sm mb-1">{item.title}</div>
              <p className="text-gray-400 text-[11px] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Assessment criteria */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand-navy rounded-xl flex items-center justify-center text-xl border border-white/5">📍</div>
          <div>
            <h4 className="font-black text-white">تقييم الموقع — Site Assessment</h4>
            <p className="text-gray-400 text-xs">المراجعة الفنية وفق معايير Class A اللوجستية الدولية</p>
          </div>
        </div>
        <div className="space-y-4">
          {assessmentCriteria.map((item,i)=>(
            <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:border-brand-yellow/15 transition-all">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-brand-yellow font-black text-base w-7 shrink-0">0{i+1}</span>
                  <div>
                    <div className="text-white font-bold text-sm">{item.name}</div>
                    <div className="text-gray-400 text-[10px] mt-0.5">{item.notes}</div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-gray-400 text-[10px]">الوزن: {item.weight}%</div>
                  <div className={`font-black text-xl ${item.score>=8?'text-green-400':item.score>=6?'text-brand-yellow':'text-brand-red'}`}>{item.score}<span className="text-sm text-gray-400">/10</span></div>
                </div>
              </div>
              <div className="w-full h-2.5 bg-brand-navy rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${item.score>=8?'bg-green-500':item.score>=6?'bg-brand-yellow':'bg-brand-red'}`}
                     style={{width:`${item.score*10}%`}}></div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-6 bg-brand-navy/50 rounded-2xl border border-brand-yellow/20 flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🏅</div>
            <div>
              <div className="text-white font-bold text-base">التقييم الإجمالي المرجح</div>
              <div className="text-gray-400 text-xs">بناءً على الأوزان النسبية لكل معيار</div>
              <div className="text-green-400 text-xs mt-1 font-bold">✓ الموقع مؤهل للتحويل الكامل إلى Class A</div>
            </div>
          </div>
          <div className="text-4xl font-black text-brand-yellow">{totalScore.toFixed(1)}<span className="text-base text-gray-400"> / 10</span></div>
        </div>
      </div>

      {/* Priority recommendations */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-5">أولويات التدخل الفوري</h4>
        <div className="space-y-3">
          {[
            {p:'فوري',   c:'#e74c3c', t:'رفع ارتفاع E-5 إلى 12م',                d:'أعلى أثر على سعة التخزين — ينقل الموقع مباشرة لـ Class A ويُمكّن 6 مستويات رفوف.'},
            {p:'فوري',   c:'#e74c3c', t:'ترقية منظومة الإطفاء ESFR K-25 في E-5', d:'شرط قانوني NFPA 13 لا يمكن تشغيل E-5 بالارتفاع العالي بدونه.'},
            {p:'قريب',   c:'#e67e22', t:'إنشاء منصات الدوك في E-1 وE-10',         d:'يرفع طاقة التحميل والتفريغ بنسبة 275% ويُلغي الأضرار الناتجة من التحميل الأرضي.'},
            {p:'متوسط',  c:'#2980b9', t:'تطبيق نظام WMS مع Odoo ERP',             d:'دقة مخزون 99.9% وإلغاء العمل اليدوي — عائد استثماري سريع بعد التفعيل.'},
            {p:'استراتيجي',c:'#27ae60',t:'استثمار الميزة الجغرافية — مطار بنينة', d:'تسويق الموقع كمستودع جوي Class A — يُضاعف قيمة المستودعات تجارياً.'},
          ].map((r,i)=>(
            <div key={i} className="flex items-start gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0 mt-0.5" style={{backgroundColor:r.c}}>{r.p}</span>
              <div>
                <div className="text-white font-bold text-sm mb-0.5">{r.t}</div>
                <div className="text-gray-400 text-xs leading-relaxed">{r.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 text-right" dir="rtl" id="report-container">
      <style dangerouslySetInnerHTML={{__html:`
        @media print {
          @page{size:A4;margin:15mm}
          html,body{background:white!important;color:black!important}
          .no-print,aside{display:none!important}
          #report-container{background:white!important;color:black!important;direction:rtl}
          #report-container *{background:transparent!important;color:black!important;box-shadow:none!important;border-color:#eee!important}
          .text-brand-red{color:#c0392b!important}
          .text-brand-yellow,.text-brand-gold{color:#b08d20!important}
          .text-green-400,.text-green-500{color:#1e7e34!important}
          .text-gray-300,.text-gray-400{color:#555!important}
          .print-section-break{break-before:page!important;padding-top:30px;border-top:1px solid #eee}
          h2,h3,h4,h5{color:#000!important;border-right:4px solid #c0392b!important;padding-right:12px}
        }
      `}}/>

      {/* ─── HEADER ────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-brand-navy to-[#1a2840] rounded-2xl p-8 border border-white/10 shadow-2xl">
        {/* Proposal badge row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="px-3 py-1 bg-brand-red/20 text-brand-red text-xs font-bold rounded-full border border-brand-red/30">مقترح فني هندسي</span>
          <span className="px-3 py-1 bg-green-500/15 text-green-400 text-xs font-bold rounded-full border border-green-500/25">Class A Target</span>
          <span className="px-3 py-1 bg-white/5 text-gray-300 text-xs font-bold rounded-full border border-white/15">للعرض على المدير العام</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">مقترح تطوير مستودعات موقع 155</h2>
            <p className="text-gray-300 text-sm leading-relaxed max-w-2xl">
              دراسة شاملة لتحويل مستودعات شركة Brandzo في موقع بوهادي إلى مستودعات Class A بمعياريين: <strong className="text-white">تحوير الوحدات الفردية</strong> أو <strong className="text-white">دمج الوحدات المتجاورة</strong> — مع استثمار الميزة الجغرافية لقرب مطار بنينة.
            </p>
            {/* Authors */}
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2 border border-white/10">
                <span className="text-gray-400 text-[10px]">إعداد:</span>
                <span className="text-white font-bold text-xs">محمد البرشي — رمزي باش</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2 border border-white/10">
                <span className="text-gray-400 text-[10px]">القسم:</span>
                <span className="text-white font-bold text-xs">إدارة المستودعات</span>
              </div>
              <div className="flex items-center gap-2 bg-brand-yellow/10 rounded-xl px-4 py-2 border border-brand-yellow/20">
                <span className="text-brand-yellow text-[10px]">يُرفع إلى:</span>
                <span className="text-brand-yellow font-bold text-xs">المدير العام</span>
              </div>
            </div>
          </div>
          <button onClick={()=>window.print()} className="px-5 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-brand-red/20 shrink-0 no-print">
            <Icon name="printer" size={18}/> طباعة التقرير
          </button>
        </div>

        {/* Site info strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-5 border-t border-white/10">
          {[
            {l:'كود الموقع',       v:siteInfo.id},
            {l:'الموقع',           v:siteInfo.location},
            {l:'المساحة الكلية',   v:siteInfo.totalSiteArea},
            {l:'المساحة المغطاة',  v:siteInfo.coveredArea},
            {l:'✈️ قرب المطار',   v:siteInfo.nearAirport},
            {l:'الاستهداف',        v:siteInfo.targetClass},
          ].map((item,i)=>(
            <div key={i} className="text-center">
              <div className="text-gray-400 text-[10px] uppercase mb-0.5">{item.l}</div>
              <div className={`font-bold text-sm ${i===4?'text-green-400':i===5?'text-brand-yellow':'text-white'}`}>{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── LAYOUT ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-5">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-white/10 no-print">
            {tabs.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-t-lg font-bold transition-all flex items-center gap-2 text-xs ${
                  activeTab===tab.id
                    ? 'bg-[#1a2840] text-brand-yellow border-t border-x border-white/10 -mb-px'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                } ${(tab.id==='planA'||tab.id==='planB')?'ring-1 ring-inset '+(tab.id==='planA'?'ring-brand-yellow/20':'ring-purple-500/20'):''}`}>
                <Icon name={tab.icon} size={15}/>
                {tab.label}
                {(tab.id==='planA'||tab.id==='planB')&&<span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${tab.id==='planA'?'bg-brand-yellow/20 text-brand-yellow':'bg-purple-500/20 text-purple-400'}`}>{tab.id==='planA'?'أ':'ب'}</span>}
              </button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab==='overview'   && renderOverview()}
            {activeTab==='planA'      && renderPlanA()}
            {activeTab==='planB'      && renderPlanB()}
            {activeTab==='flow'       && renderFlow()}
            {activeTab==='standards'  && renderStandards()}
            {activeTab==='assessment' && renderAssessment()}
          </div>
        </div>

        {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="space-y-5 no-print">
          {/* Compliance */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="clipboardList" size={15} className="text-brand-yellow"/> مراجعة الامتثال
            </h4>
            <div className="space-y-3">
              {[
                {label:'ارتفاع Class A ≥12م',   ok:dimensions.clearHeight>=12,                   val:`${dimensions.clearHeight}م`},
                {label:'رشاشات ESFR مطلوبة',    ok:dimensions.clearHeight>=10,                   val:dimensions.clearHeight>=10?'نعم':'اختياري'},
                {label:'أرضية إيبوكسي FF50',    ok:dimensions.flooring.includes('إيبوكسي'),      val:'مطابق'},
                {label:'سعة >15,000 طبلية',     ok:stats.estPallets>15000,                       val:stats.estPallets.toLocaleString()},
                {label:'مستويات رفوف ≥5',       ok:stats.rackLevels>=5,                          val:`${stats.rackLevels} مستويات`},
              ].map((item,i)=>(
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-300">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold text-[10px]">{item.val}</span>
                    <span className={`text-base ${item.ok?'text-green-500':'text-brand-red'}`}>{item.ok?'✓':'✗'}</span>
                  </div>
                </div>
              ))}
            </div>
            {dimensions.clearHeight<12&&(
              <div className="mt-3 p-2 bg-brand-red/10 border border-brand-red/20 rounded text-[10px] text-brand-red">
                ⚠️ الارتفاع الحالي أقل من معيار Class A (12م) لـ E-5
              </div>
            )}
          </div>

          {/* Tech controls */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="grid" size={15} className="text-brand-yellow"/> لوحة التحكم الفني
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-300 block mb-1">الارتفاع الصافي المقترح (م)</label>
                <input type="number" value={dimensions.clearHeight} onChange={e=>setDimensions({...dimensions,clearHeight:+e.target.value})}
                       className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none"/>
              </div>
              <div>
                <label className="text-xs text-gray-300 block mb-1">نوع الأرضية</label>
                <select value={dimensions.flooring} onChange={e=>setDimensions({...dimensions,flooring:e.target.value})}
                        className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>إيبوكسي FF50</option>
                  <option>خرسانة صناعية</option>
                  <option>بلاط مقاوم للأحمال</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-300 block mb-1">آلية التخزين</label>
                <select value={dimensions.rackingSystem} onChange={e=>setDimensions({...dimensions,rackingSystem:e.target.value})}
                        className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>Selective Pallet Racking</option>
                  <option>Drive-In Racking</option>
                  <option>VNA System</option>
                </select>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2.5">
              {[
                {l:'مستويات الرفوف',      v:`${stats.rackLevels} مستويات`,               c:'text-brand-yellow'},
                {l:'السعة التقديرية',     v:`${stats.estPallets.toLocaleString()} طبلية`, c:'text-brand-yellow'},
                {l:'نوع الرافعة',         v:stats.forkliftType,                           c:'text-green-400'},
              ].map((r,i)=>(
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">{r.l}</span>
                  <span className={`font-bold ${r.c}`}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick nav to plans */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 text-xs flex items-center gap-2">
              <Icon name="workflows" size={14} className="text-brand-yellow"/> الخطتان المقترحتان
            </h4>
            <div className="space-y-2">
              <button onClick={()=>setActiveTab('planA')}
                      className={`w-full text-right p-3 rounded-xl border text-xs font-bold transition-all ${activeTab==='planA'?'bg-brand-yellow/10 border-brand-yellow/30 text-brand-yellow':'bg-white/5 border-white/5 text-gray-300 hover:border-brand-yellow/15 hover:text-white'}`}>
                <div>خطة أ — تحوير الوحدات الفردية</div>
                <div className="text-[10px] font-normal text-gray-500 mt-0.5">{planAItems.length} تعديلات تشغيلية</div>
              </button>
              <button onClick={()=>setActiveTab('planB')}
                      className={`w-full text-right p-3 rounded-xl border text-xs font-bold transition-all ${activeTab==='planB'?'border-purple-500/30 text-purple-400':'bg-white/5 border-white/5 text-gray-300 hover:border-purple-500/15 hover:text-white'}`}
                      style={activeTab==='planB'?{backgroundColor:'#9b59b615'}:{}}>
                <div>خطة ب — دمج المستودعات</div>
                <div className="text-[10px] font-normal text-gray-500 mt-0.5">{planBItems.length} عمليات دمج استراتيجية</div>
              </button>
            </div>
          </div>

          {/* Airport badge */}
          <div className="bg-gradient-to-br from-[#0d2218] to-[#0f1923] border border-green-500/25 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">✈️</span>
              <div>
                <div className="text-green-400 font-bold text-xs">ميزة استراتيجية</div>
                <div className="text-white font-bold text-sm">مطار بنينة</div>
              </div>
            </div>
            <div className="text-[11px] text-gray-300 leading-relaxed">
              بُعد <strong className="text-green-400">12 كيلومتر</strong> فقط عن مطار بنينة الدولي — يُتيح تحويل الموقع إلى مركز لوجستي جوي متكامل.
            </div>
          </div>

          {/* Site info */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2">
              <Icon name="package" size={14} className="text-brand-red"/> معلومات الموقع
            </h4>
            <div className="space-y-2.5">
              {[
                {l:'كود الموقع',      v:siteInfo.id},
                {l:'الموقع',          v:siteInfo.location},
                {l:'المساحة الكلية',  v:siteInfo.totalSiteArea},
                {l:'المساحة المغطاة', v:siteInfo.coveredArea},
                {l:'المقاول المنفذ',  v:siteInfo.contractor,small:true},
                {l:'الارتفاع الحالي', v:siteInfo.currentHeight},
              ].map((item,i)=>(
                <div key={i} className="border-b border-white/5 pb-2">
                  <div className="text-[10px] text-gray-400 uppercase">{item.l}</div>
                  <div className={`text-white font-medium ${item.small?'text-[11px]':'text-sm'}`}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WarehouseMaps;
