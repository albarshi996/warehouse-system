import React, { useState, useMemo } from 'react';
import Icon from '../../ui/Icon.jsx';

// ═══════════════════════════════════════════════════════════════
//  الخرائط الفنية ومقترح التطوير — موقع 155 بوهادي، بنغازي
//  إعداد: محمد البرشي — رمزي باش  |  إدارة المستودعات
// ═══════════════════════════════════════════════════════════════

const WarehouseMaps = () => {
  const [activeTab, setActiveTab]       = useState('floorplan');
  const [selectedZone, setSelectedZone] = useState(null);
  const [activeFlowStep, setActiveFlowStep] = useState(null);
  const [dimensions, setDimensions]     = useState({
    length: 300, width: 200, clearHeight: 12,
    flooring: 'إيبوكسي FF50',
    rackingSystem: 'Selective Pallet Racking',
    sprinklerClearance: 0.5,
  });

  // ── بيانات الموقع ─────────────────────────────────────────────
  const siteInfo = {
    id: 'موقع رقم 155',
    location: 'بوهادي – بنغازي',
    totalSiteArea: '65,000 م²',
    contractor: 'شركة عبر العالم للمقاولات والاستثمار العقاري',
    coveredArea: '18,500 م²',
    currentHeight: '6.80 م',
    classification: 'Class A (مستهدف)',
    zoneCount: 10,
    nearestPort: 'ابوهادي ',
    preparedBy: 'محمد البرشي — رمزي باش',
    department: 'إدارة المستودعات',
  };

  // ── بيانات المستودعات ─────────────────────────────────────────
  const warehouses = [
    { id: 'E-1',  name: 'استلام + بفر',      area: 2200, dims: '20 × 110 م', function: 'Receiving + Inbound Buffer',         height: 7.5,  color: '#27ae60', standard: 'GS1 Distribution / ISO 9001',  flowRole: 'input',   capacity: 180,  palletCapacity: 420 },
    { id: 'E-2',  name: 'تخزين جاف',          area: 1000, dims: '20 × 50 م',  function: 'Dry Storage',                        height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 280,  palletCapacity: 860 },
    { id: 'E-3',  name: 'تخزين جاف',          area: 1000, dims: '20 × 50 م',  function: 'Dry Storage',                        height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 280,  palletCapacity: 860 },
    { id: 'E-4',  name: 'تخزين + QC',         area: 1000, dims: '20 × 50 م',  function: 'Storage + Quality Control',          height: 7.5,  color: '#8e44ad', standard: 'ISO 9001:2015',               flowRole: 'qc',      capacity: 160,  palletCapacity: 310 },
    { id: 'E-5',  name: 'High-Bay الرئيسي',   area: 3500, dims: '35 × 100 م', function: 'Selective Pallet Racking (High-Bay)',height: 12.0, color: '#1abc9c', standard: 'NFPA 13 / EN 15620',          flowRole: 'storage', capacity: 1200, palletCapacity: 4200, highPriority: true },
    { id: 'E-6',  name: 'تخزين + خروج',       area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Staging',         height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'staging', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-7',  name: 'تخزين جاف',          area: 2200, dims: '20 × 110 م', function: 'Dry Storage',                        height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-8',  name: 'تخزين جاف',          area: 2200, dims: '20 × 110 م', function: 'Dry Storage',                        height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-9',  name: 'تخزين + بفر',        area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Buffer',          height: 9.5,  color: '#2980b9', standard: 'GS1 Distribution',            flowRole: 'staging', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-10', name: 'شحن / Cross-Dock',   area: 1000, dims: '20 × 50 م',  function: 'Outbound Shipping + Cross-Dock',     height: 7.5,  color: '#e67e22', standard: 'ANSI MH30.1',                 flowRole: 'output',  capacity: 180,  palletCapacity: 380 },
  ];

  // ── تدفق العمليات ─────────────────────────────────────────────
  const logisticsFlow = [
    { step:1, title:'وصول الشاحنة',     subtitle:'Truck Arrival',         zone:'بوابة الدخول',         color:'#27ae60', icon:'🚛', details:['تسجيل رقم الشاحنة والمستندات الجمركية','فحص درجة الحرارة وحالة الحمولة','تخصيص رصيف تحميل عبر نظام WMS','إصدار تصريح دخول رقمي للسائق'], standard:'ANSI MH30.1',          kpi:'زمن الانتظار: ≤ 15 دقيقة',         equipment:'بوابة RFID + كاميرات ANPR' },
    { step:2, title:'الاستلام والتفريغ',subtitle:'Receiving & Unloading',  zone:'E-1 — استلام + بفر',  color:'#27ae60', icon:'📦', details:['استخدام رافعات شوكية Counterbalance 3.0م ممر','فحص كمي وكيفي لكل طبلية مستلمة','مسح باركود GS1-128 لكل وحدة','إدخال فوري لبيانات الاستلام في Odoo WMS'], standard:'GS1 Distribution / ISO 9001', kpi:'معدل تفريغ: 30 طبلية/ساعة',       equipment:'Dock Leveler هيدروليكي + ماسح GS1' },
    { step:3, title:'مراقبة الجودة',    subtitle:'Quality Control (QC)',   zone:'E-4 — تخزين + QC',   color:'#8e44ad', icon:'🔍', details:['فحص عينة عشوائية ≥ 10% من كل شحنة','توثيق نتائج الفحص في نظام ISO 9001','عزل البضاعة المعيبة في منطقة مخصصة','إصدار شهادة مطابقة لكل دفعة معتمدة'], standard:'ISO 9001:2015',              kpi:'زمن الفحص: ≤ 2 ساعة',             equipment:'طاولات فحص + ميزان دقيق + كاميرات' },
    { step:4, title:'التخزين الرئيسي', subtitle:'Main Storage',           zone:'E-5 High-Bay + E-2→E-9',color:'#1abc9c',icon:'🏗️',details:['تخصيص موقع تلقائي عبر WMS (Slot Allocation)','رفوف انتقائية 6 مستويات في E-5 (12م ارتفاع)','استخدام Reach Truck في الممرات الضيقة 1.8م','تتبع موقع كل طبلية بالباركود لحظياً'], standard:'EN 15620 / NFPA 13',          kpi:'دقة المواقع: ≥ 99.5%',            equipment:'Reach Truck + VNA + شاحن باركود يدوي' },
    { step:5, title:'تجميع الطلبات',   subtitle:'Order Picking',          zone:'E-6 تخزين + خروج',   color:'#3498db', icon:'📋', details:['استقبال أوامر الالتقاط من نظام Odoo ERP','تقنية Pick-to-Light لتسريع عملية التجميع','التحقق من الوزن والكمية قبل التغليف','إعداد قائمة التعبئة (Packing List) تلقائياً'], standard:'GS1 Distribution',            kpi:'معدل الالتقاط: 50 طبلية/ساعة',   equipment:'عربات تجميع + طابعة ملصقات' },
    { step:6, title:'التجهيز والتدريج',subtitle:'Staging & Dispatch',     zone:'E-9 — بفر الخروج',   color:'#e67e22', icon:'🗂️', details:['تجميع الطلبات حسب الوجهة والمسار','تغليف حراري وتأمين الطبليات بـ Stretch Wrap','طباعة بوليصة الشحن والملصق النهائي','تحضير مستندات الجمارك والتسليم'], standard:'ANSI MH30.1',                kpi:'زمن التدريج: ≤ 30 دقيقة/شحنة',   equipment:'آلة تغليف حراري + طابعة A4' },
    { step:7, title:'الشحن والتسليم',  subtitle:'Outbound Shipping',     zone:'E-10 — شحن / Cross-Dock',color:'#e67e22',icon:'🚚',details:['تحميل الشاحنات عبر Dock Leveler هيدروليكي','مسح نهائي للباركود وتأكيد الشحنة في WMS','إرسال إشعار تلقائي للعميل عبر Odoo','تتبع الشحنة GPS حتى الوصول للعميل'], standard:'GS1 Distribution / ANSI MH30.1',kpi:'دقة الشحن: ≥ 99.9%',             equipment:'Dock Leveler + Dock Shelter + Safety Lights' },
  ];

  // ── المعايير الدولية ──────────────────────────────────────────
  const standards = [
    { name:'ارتفاع منصة التحميل (الدوك)',      ref:'OSHA 29 CFR 1910.178', req:'1.20 م ± 50 ملم',                                 priority:'Critical',status:'Compliant',       zone:'E-1 / E-10' },
    { name:'مستوى الرصيف (لكل باب تحميل)',     ref:'ANSI MH30.1',          req:'Dock Leveler مطلوب عند كل باب تحميل',             priority:'Critical',status:'Upgrade Required',zone:'E-1 / E-10' },
    { name:'حمولة الأرضية',                     ref:'EN 15620 / ACI 360',   req:'≥ 5.0 طن/م² (High-Bay E-5: ≥ 7.5 طن/م²)',         priority:'High',    status:'Compliant',       zone:'جميع الوحدات' },
    { name:'استواء الأرضية (Flatness)',         ref:'TR 34 (Concrete Society)',req:'إيبوكسي صناعي FF50 / FL30 — تشطيب ذاتي التسوية',priority:'High',    status:'Upgrade Required',zone:'E-5 / E-6 / E-7' },
    { name:'آلية المرشات (High-Bay)',           ref:'NFPA 13 (2022)',       req:'ESFR نوع K-25، ضغط ≥ 50 psi، تغطية كاملة',       priority:'Critical',status:'Upgrade Required',zone:'E-5' },
    { name:'الإضاءة — مناطق التخزين',          ref:'EN 12464-1',           req:'≥ 200 لوكس؛ استلام/جودة ≥ 400 لوكس؛ مكاتب ≥ 500', priority:'Medium',  status:'Compliant',       zone:'جميع الوحدات' },
    { name:'منطقة البفر — استلام',             ref:'GS1 Distribution',    req:'≥ 15% من مساحة الاستلام (≥ 330 م²)',               priority:'High',    status:'Compliant',       zone:'E-1' },
    { name:'رصيف مراقبة الجودة (QC Dock)',     ref:'ISO 9001:2015',        req:'منطقة مخصصة ≥ 5% من الاستلام، مجاورة لـ E-1',     priority:'High',    status:'Compliant',       zone:'E-4' },
    { name:'ممر رافعة Counterbalance',         ref:'FEM 9.831',            req:'≥ 3.0 م عرض صافي',                               priority:'Medium',  status:'Compliant',       zone:'E-1 / E-10' },
    { name:'ممر رافعة Reach Truck',            ref:'FEM 9.831',            req:'≥ 1.8 م (ممرات ضيقة داخل الرفوف)',               priority:'Medium',  status:'Compliant',       zone:'E-2 إلى E-9' },
    { name:'أبواب رصيف التحميل (Roll Door)',   ref:'EN 12604',             req:'≥ 2.75 م عرض × ≥ 3.5 م ارتفاع — سرعة ≥ 1م/ثانية',priority:'High',    status:'Compliant',       zone:'E-1 / E-10' },
    { name:'تأريض كهربائي للرفوف (Grounding)', ref:'IEC 60364-7',          req:'كل وحدة هيكلية مؤرضة مع بار تأريض مركزي',        priority:'High',    status:'Upgrade Required',zone:'E-5 / E-2 إلى E-9' },
  ];

  // ── بطاقات المقترح (بدون قيم مالية) ──────────────────────────
  const proposalCards = [
    { title:'ترقية ارتفاع السقف',      subtitle:'Ceiling Height Upgrade',       icon:'arrowUpTray',  priority:'High',     duration:'6 أسابيع',  details:['رفع سقف E-5 إلى 12 متر بدعم إنشائي','رفع مستودعات E-2 إلى E-9 لـ 9.5 متر','تقوية الأعمدة الرئيسية بأقواس فولاذية','إعادة تشطيب الجدران والسقف بطلاء صناعي'] },
    { title:'إنشاء منصات الدوك',       subtitle:'Dock Platform Construction',   icon:'truck',        priority:'Critical', duration:'8 أسابيع',  details:['بناء 12 منصة بارتفاع 1.20 متر','تركيب Dock Levelers هيدروليكية (6 طن)','Dock Shelters عازلة حرارياً وصوتياً','Safety Light Systems (أحمر/أخضر) لكل رصيف'] },
    { title:'هيكل الرفوف الانتقائي',   subtitle:'Selective Pallet Racking',    icon:'grid',         priority:'High',     duration:'10 أسابيع', details:['أعمدة فولاذية زرقاء مجلفنة 6 مستويات','عوارض برتقالية 3.6م × حمولة 5 طن/مستوى','Column Guards عند كل قاعدة عمود','Rack Protectors في ممرات الرافعات'] },
    { title:'تصميم التدفق والبفر',     subtitle:'Buffer Zone & Flow Design',    icon:'workflows',    priority:'Medium',   duration:'4 أسابيع',  details:['بفر استلام 330 م² بخطوط تنظيم الحركة','بفر شحن 280 م² في E-9','مسارات رافعات مرسومة على الأرضية','علامات اتجاهية وإرشادية معتمدة OSHA'] },
    { title:'أنظمة السلامة والحماية', subtitle:'Safety & Fire Protection',     icon:'clipboardList', priority:'Critical', duration:'12 أسبوع', details:['رشاشات ESFR K-25 تغطية كاملة 18,500 م²','خزانات مياه احتياطية 500 م³','إنذار حريق ذكي متعدد المستشعرات','إضاءة طوارئ UPS + لوحات إخلاء'] },
    { title:'التحول الرقمي — WMS',    subtitle:'WMS Integration (Odoo ERP)',   icon:'package',      priority:'Medium',   duration:'16 أسبوع', details:['تكامل كامل Odoo WMS + Inventory','شبكة WiFi صناعية (IEEE 802.11ac) كاملة التغطية','ماسحات باركود GS1-128 في كل منطقة','تتبع حركة المخزون لحظياً + تقارير تلقائية'] },
  ];

  // ── معايير تقييم الموقع ───────────────────────────────────────
  const assessmentCriteria = [
    { name:'الموقع الجغرافي (Location Accessibility)', score:9, weight:20, notes:'قريب من ميناء بنغازي (7 كم) وطريق رئيسي — ميزة لوجستية عالية' },
    { name:'طرق الوصول والمناورة (Access & Maneuvering)', score:8, weight:15, notes:'ساحة خارجية تسمح بمناورة المقطورات الطويلة 22م' },
    { name:'الارتفاع الصافي (Clear Height)', score:7, weight:25, notes:'الارتفاع الحالي 6.80م — يتطلب ترقية لـ Class A' },
    { name:'حمولة الأرضية (Floor Load Capacity)', score:8, weight:20, notes:'الخرسانة الحالية تتحمل 5 طن/م² — كافية مع التشطيب' },
    { name:'أنظمة السلامة (Fire & Safety)', score:6, weight:20, notes:'تحتاج ترقية شاملة للمرشات إلى ESFR K-25' },
  ];

  // ── خطة التحوير: تعديل المستودعات الحالية ────────────────────
  const modificationPlan = {
    title: 'خطة التحوير — تعديل المستودعات الحالية',
    subtitle: 'Modification Plan — Current Warehouse Upgrade',
    description: 'تحوير المستودعات القائمة مع الحفاظ على حدودها الإنشائية وتحسين كفاءتها التشغيلية بالكامل',
    phases: [
      {
        id: 'M-1',
        name: 'E-1 → منطقة استلام ذكية',
        current: 'استلام تقليدي يدوي — 30 طبلية/ساعة',
        proposed: 'بوابة RFID + Dock Levelers + WMS تلقائي',
        color: '#27ae60',
        icon: '📥',
        changes: [
          'تركيب 6 Dock Levelers هيدروليكية (1.20م)',
          'بوابة RFID عند كل مدخل لمسح تلقائي',
          'منطقة بفر مخططة 330 م² بخطوط أرضية',
          'ربط فوري بـ Odoo WMS عند الاستلام',
          'تركيب Dock Shelters حرارية + Safety Lights',
        ],
        kpiOld: '30 طبلية/ساعة',
        kpiNew: '80+ طبلية/ساعة',
        gain: '+167%',
        standard: 'GS1 Distribution / ANSI MH30.1',
        effort: 'متوسط',
        duration: '5 أسابيع',
      },
      {
        id: 'M-2/3',
        name: 'E-2 + E-3 → تخزين رأسي متخصص',
        current: 'رفوف 3 مستويات — ارتفاع 6.80م',
        proposed: 'رفع سقف + رفوف Selective 5 مستويات',
        color: '#2980b9',
        icon: '📦',
        changes: [
          'رفع الارتفاع الصافي إلى 9.5م بأقواس فولاذية',
          'تركيب رفوف Selective Pallet 5 مستويات',
          'ممرات Reach Truck 1.8م خلال كل صف',
          'أرضية إيبوكسي FF50 لكل وحدة',
          'إضاءة LED مثبتة على الرفوف (200+ لوكس)',
        ],
        kpiOld: '860 طبلية (3 مستويات)',
        kpiNew: '1,430 طبلية (5 مستويات)',
        gain: '+66%',
        standard: 'EN 15620 / FEM 9.831',
        effort: 'متوسط',
        duration: '7 أسابيع',
      },
      {
        id: 'M-4',
        name: 'E-4 → مركز جودة متكامل',
        current: 'تخزين جاف مع فحص يدوي جزئي',
        proposed: 'مركز QC معتمد ISO 9001 مع رصيف متخصص',
        color: '#8e44ad',
        icon: '🔍',
        changes: [
          'تقسيم المستودع: 60% QC + 40% حجر صحي',
          'منطقة عزل البضاعة المعيبة بحاجز شبكي',
          'طاولات فحص مضيئة + ميزان دقيق 0.1كغ',
          'نظام التوثيق الرقمي مع Odoo Quality Module',
          'رصيف اتصال مباشر بـ E-1 و E-5',
        ],
        kpiOld: 'فحص 10% — يدوي',
        kpiNew: 'فحص 100% مسح + 10% عينة عشوائية',
        gain: '+300% تغطية',
        standard: 'ISO 9001:2015',
        effort: 'منخفض',
        duration: '3 أسابيع',
      },
      {
        id: 'M-5',
        name: 'E-5 → High-Bay Class A كامل',
        current: 'مستودع واسع — ارتفاع 6.80م، 3 مستويات',
        proposed: 'High-Bay 12م — 6 مستويات، ESFR، VNA System',
        color: '#1abc9c',
        icon: '🏗️',
        changes: [
          'رفع السقف إلى 12م — تدعيم إنشائي شامل',
          'رفوف Selective 6 مستويات + VNA للممرات الضيقة',
          'رشاشات ESFR K-25 — NFPA 13 تغطية 3,500 م²',
          'رافعات VNA (Very Narrow Aisle) 1.6م ممر',
          'أرضية إيبوكسي FF50 ذاتية التسوية',
          'نظام إدارة مواقع تلقائي (Slot Allocation WMS)',
        ],
        kpiOld: '3 مستويات — ~1,400 طبلية',
        kpiNew: '6 مستويات — 4,200+ طبلية',
        gain: '+200%',
        standard: 'NFPA 13 / EN 15620 / Class A',
        effort: 'مرتفع',
        duration: '14 أسبوع',
      },
      {
        id: 'M-6/7/8',
        name: 'E-6 + E-7 + E-8 → تخزين موحد الخروج',
        current: '3 مستودعات منفصلة — تدفق غير منظم',
        proposed: 'نظام تخزين متدرج مع ممرات موحدة وبفر خروج',
        color: '#3498db',
        icon: '🔄',
        changes: [
          'توحيد ممرات التحميل الداخلية بين الوحدات الثلاث',
          'رفوف 4 مستويات في E-7 + E-8 (تخزين دوار FIFO)',
          'E-6 تخصيصها بالكامل لتجميع الطلبات (Picking Zone)',
          'خطوط أرضية لفصل ممرات الحركة عن التخزين',
          'تركيب أبواب Roll-Up سريعة بين الوحدات',
        ],
        kpiOld: 'التقاط 30 طبلية/ساعة',
        kpiNew: 'التقاط 80+ طبلية/ساعة',
        gain: '+167%',
        standard: 'EN 15620 / GS1 Distribution',
        effort: 'متوسط',
        duration: '8 أسابيع',
      },
      {
        id: 'M-9/10',
        name: 'E-9 + E-10 → منطقة الشحن الذكية',
        current: 'بفر خروج + شحن تقليدي منفصل',
        proposed: 'Cross-Dock متكامل مع بوابة RFID خروج',
        color: '#e67e22',
        icon: '🚚',
        changes: [
          'E-9: بفر خروج منظم 280 م² بمناطق وجهة',
          'E-10: تحويل 40% لـ Cross-Dock سريع',
          '6 Dock Levelers هيدروليكية للشحن',
          'بوابة RFID نهائية للتحقق من الشحنات',
          'نظام Safety Light أحمر/أخضر لكل رصيف',
        ],
        kpiOld: 'شحن 20 طبلية/ساعة',
        kpiNew: 'شحن 60+ طبلية/ساعة',
        gain: '+200%',
        standard: 'ANSI MH30.1 / GS1',
        effort: 'متوسط',
        duration: '6 أسابيع',
      },
    ],
  };

  // ── خطة الدمج ────────────────────────────────────────────────
  const mergePlan = {
    title: 'خطة الدمج — إعادة هيكلة وتوحيد المستودعات',
    subtitle: 'Consolidation Plan — Warehouse Merge & Restructure',
    description: 'دمج المستودعات المتجاورة لتكوين وحدات كبرى متخصصة وفق التدفق اللوجستي الأمثل',
    mergedUnits: [
      {
        id: 'M-A',
        name: 'مجمع الاستلام والجودة',
        mergedFrom: ['E-1', 'E-4'],
        newArea: '3,200 م²',
        newDims: '40 × 80 م',
        color: '#27ae60',
        icon: '📥',
        concept: 'دمج منطقة الاستلام مع مركز مراقبة الجودة في وحدة واحدة متكاملة',
        structuralWork: [
          'إزالة الجدار الفاصل بين E-1 وE-4 (جدار غير حامل)',
          'تعزيز الأعمدة الهيكلية للجسر الجديد',
          'تركيب 8 Dock Levelers موحدة على الواجهة الشمالية',
          'تقسيم داخلي: 70% استلام + 30% QC بحاجز شفاف',
        ],
        operationalChanges: [
          'تدفق مباشر من الاستلام إلى QC بدون نقل خارجي',
          'خط فحص متكامل داخل نفس المستودع',
          'توفير 40% من وقت النقل الداخلي',
          'تسجيل موحد في Odoo للاستلام + الجودة',
        ],
        kpiOld: '30 طبلية/ساعة — وحدتان منفصلتان',
        kpiNew: '90+ طبلية/ساعة — وحدة موحدة',
        gain: '+200%',
        standard: 'GS1 / ISO 9001 / ANSI MH30.1',
        effort: 'متوسط',
        duration: '8 أسابيع',
        riskLevel: 'منخفض',
        riskNote: 'الجدار الفاصل غير حامل — الإزالة آمنة',
      },
      {
        id: 'M-B',
        name: 'High-Bay الموسّع',
        mergedFrom: ['E-5', 'E-2', 'E-3'],
        newArea: '5,500 م²',
        newDims: '55 × 100 م',
        color: '#1abc9c',
        icon: '🏗️',
        concept: 'توسعة المستودع الرئيسي High-Bay بدمج E-2 وE-3 المجاورين لتضاعف السعة',
        structuralWork: [
          'إزالة الجدارين الجانبيين الفاصلين (مع دراسة إنشائية)',
          'توحيد السقف برفع كامل إلى 12م لمنطقة الدمج',
          'دعامات فولاذية بين المستودعات المدمجة',
          'أرضية إيبوكسي FF50 موحدة على 5,500 م²',
          'رشاشات ESFR K-25 لتغطية المساحة الموسعة',
        ],
        operationalChanges: [
          'سعة تخزين 7,000+ طبلية في مستودع واحد',
          'نظام VNA موحد في 3 ممرات رئيسية',
          'Slot Allocation ذكي عبر WMS للمساحة الكاملة',
          'رافعتان VNA بدل 3 reach trucks منفصلة',
        ],
        kpiOld: '6,000 طبلية — 3 مستودعات منفصلة',
        kpiNew: '7,200+ طبلية — مستودع واحد موحد',
        gain: '+20% سعة + 35% كفاءة تشغيل',
        standard: 'EN 15620 / NFPA 13 / Class A',
        effort: 'مرتفع',
        duration: '16 أسبوع',
        riskLevel: 'مرتفع',
        riskNote: 'يتطلب دراسة إنشائية مفصلة قبل إزالة الجدران الحاملة',
      },
      {
        id: 'M-C',
        name: 'مجمع التخزين الديناميكي',
        mergedFrom: ['E-6', 'E-7', 'E-8'],
        newArea: '6,600 م²',
        newDims: '20 × 330 م (3 أجنحة موصولة)',
        color: '#3498db',
        icon: '🔄',
        concept: 'ربط الوحدات الثلاث بممرات داخلية مع تخصيص وظيفي واضح لكل جناح',
        structuralWork: [
          'فتح ممرات رابطة (3م × 4م) بين الجدران الفاصلة',
          'أبواب Roll-Up صناعية سريعة في كل ممر',
          'تعزيز أرضية الممرات الرابطة لتحمل الرافعات',
          'توحيد شبكة الإضاءة والكهرباء',
        ],
        operationalChanges: [
          'E-6 (جناح شمالي): تجميع الطلبات فقط (Picking)',
          'E-7 (جناح وسطي): تخزين دوار FIFO للبضاعة السريعة',
          'E-8 (جناح جنوبي): تخزين طويل الأمد — FEFO',
          'حركة داخلية مستمرة بين الأجنحة بدون خروج',
        ],
        kpiOld: '3,840 طبلية — غير منظم وظيفياً',
        kpiNew: '4,800+ طبلية — نظام FIFO/FEFO موحد',
        gain: '+25% سعة + 60% انتظام التدفق',
        standard: 'EN 15620 / GS1 Distribution',
        effort: 'متوسط',
        duration: '10 أسابيع',
        riskLevel: 'منخفض',
        riskNote: 'فتح ممرات جانبية — لا يؤثر على الهيكل الرئيسي',
      },
      {
        id: 'M-D',
        name: 'بوابة الشحن الموحدة',
        mergedFrom: ['E-9', 'E-10'],
        newArea: '3,200 م²',
        newDims: '40 × 80 م',
        color: '#e67e22',
        icon: '🚚',
        concept: 'دمج بفر الخروج مع منطقة الشحن في وحدة Cross-Dock متكاملة',
        structuralWork: [
          'إزالة الجدار الفاصل وتوسعة الفتحة الرابطة',
          '8 Dock Levelers هيدروليكية على الواجهة الجنوبية',
          'شبكة بوابات RFID للفحص النهائي',
          'منطقة آمنة للانتظار الخارجي للشاحنات',
        ],
        operationalChanges: [
          'تدفق مباشر: بفر → Cross-Dock → تحميل',
          'فصل حركة الشحن الكامل عن الاستلام',
          'نظام إدارة الأرصفة (Dock Management System)',
          'تتبع GPS من لحظة مغادرة الرصيف',
        ],
        kpiOld: 'شحن 20 طبلية/ساعة — وحدتان',
        kpiNew: 'شحن 80+ طبلية/ساعة — موحدة',
        gain: '+300%',
        standard: 'ANSI MH30.1 / GS1 Distribution',
        effort: 'متوسط',
        duration: '7 أسابيع',
        riskLevel: 'منخفض',
        riskNote: 'الجدار الفاصل قابل للإزالة بأمان',
      },
    ],
    comparison: [
      { metric: 'عدد الوحدات التشغيلية', before: '10 مستودعات منفصلة', after: '4 مجمعات متخصصة', better: true },
      { metric: 'إجمالي الطبليات المخزنة', before: '10,930 طبلية', after: '19,200+ طبلية', better: true },
      { metric: 'زمن النقل الداخلي', before: '35 دقيقة/شحنة', after: '12 دقيقة/شحنة', better: true },
      { metric: 'عدد الرافعات المطلوبة', before: '8 رافعات', after: '5 رافعات', better: true },
      { metric: 'مساحة الممرات الضائعة', before: '22% من إجمالي المساحة', after: '12% من إجمالي المساحة', better: true },
      { metric: 'دقة تتبع المخزون', before: '85% (يدوي)', after: '99.9% (WMS)', better: true },
      { metric: 'تعقيد التنفيذ', before: '—', after: 'مرتفع (دراسة إنشائية مطلوبة)', better: false },
      { metric: 'مدة التنفيذ الكاملة', before: '—', after: '28 أسبوعاً (موازية)', better: false },
    ],
  };

  // ── الإحصاءات المحسوبة ────────────────────────────────────────
  const stats = useMemo(() => {
    const totalArea  = 18500;
    const rackLevels = Math.floor((dimensions.clearHeight - 1.5) / 1.8);
    const estPallets = Math.floor(totalArea * 0.7 * rackLevels / 1.2);
    const forkliftType = dimensions.clearHeight > 10 ? 'VNA / رافعة High-Bay' : 'رافعة Reach قياسية';
    const utilization  = Math.min(95, Math.round((rackLevels / 6) * 82));
    return { totalArea, rackLevels, estPallets, forkliftType, utilization };
  }, [dimensions]);

  const totalWeightedScore = useMemo(() => {
    return assessmentCriteria.reduce((acc, c) => acc + (c.score * c.weight) / 10, 0) / 10;
  }, []);

  // ── تخطيط SVG ─────────────────────────────────────────────────
  const layout = [
    { id:'E-1',  x:205, y:12,  w:108, h:22 },
    { id:'E-2',  x:205, y:38,  w:52,  h:20 },
    { id:'E-3',  x:261, y:38,  w:52,  h:20 },
    { id:'E-4',  x:205, y:62,  w:52,  h:20 },
    { id:'E-10', x:261, y:62,  w:52,  h:20 },
    { id:'E-5',  x:12,  y:12,  w:100, h:38 },
    { id:'E-6',  x:12,  y:56,  w:108, h:20 },
    { id:'E-7',  x:12,  y:80,  w:108, h:20 },
    { id:'E-8',  x:12,  y:104, w:108, h:20 },
    { id:'E-9',  x:12,  y:128, w:108, h:20 },
  ];

  const getWarehouseColor = (id) => {
    const wh = warehouses.find(w => w.id === id);
    return wh ? wh.color : '#444';
  };

  // ────────────────────────────────────────────────────────────────
  // ── المكوّنات المساعدة ──────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────

  const EffortBadge = ({ level }) => {
    const map = {
      'مرتفع':  'bg-brand-red/20 text-brand-red border-brand-red/30',
      'متوسط':  'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30',
      'منخفض':  'bg-green-500/15 text-green-400 border-green-500/30',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${map[level] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
        {level}
      </span>
    );
  };

  const RiskBadge = ({ level }) => {
    const map = {
      'مرتفع':  'bg-brand-red/20 text-brand-red border-brand-red/30',
      'متوسط':  'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30',
      'منخفض':  'bg-green-500/15 text-green-400 border-green-500/30',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${map[level] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
        خطورة {level}
      </span>
    );
  };

  // ────────────────────────────────────────────────────────────────
  // ── العرض: المخطط الكابوري ──────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderFloorPlan = () => (
    <div className="space-y-6 animate-fade-in">
      {/* إحصاءات سريعة */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'إجمالي المساحة', value:`${stats.totalArea.toLocaleString()} م²`, icon:'grid',          color:'text-brand-yellow' },
          { label:'عدد الوحدات',    value:'10 وحدات',                               icon:'package',       color:'text-brand-red' },
          { label:'سعة الطبليات',   value:stats.estPallets.toLocaleString(),         icon:'clipboardList', color:'text-green-400' },
          { label:'نوع الرافعة',    value:stats.forkliftType,                        icon:'truck',         color:'text-blue-400' },
        ].map((s, i) => (
          <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3">
            <div className={`w-10 h-10 bg-brand-navy rounded-lg flex items-center justify-center ${s.color} shrink-0`}>
              <Icon name={s.icon} size={20} />
            </div>
            <div>
              <div className="text-gray-400 text-[10px] mb-0.5">{s.label}</div>
              <div className="text-sm font-bold text-white leading-tight">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SVG Floor Plan */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-bold text-white text-sm">المخطط الكابوري — موقع 155 (بوهادي)</h4>
          <div className="flex flex-wrap gap-3 text-[10px]">
            {[
              { color:'#27ae60', label:'استلام' },
              { color:'#1abc9c', label:'High-Bay' },
              { color:'#2980b9', label:'تخزين' },
              { color:'#e67e22', label:'شحن' },
              { color:'#8e44ad', label:'QC' },
              { color:'#f1c40f', label:'أرصفة' },
            ].map((l, i) => (
              <span key={i} className="flex items-center gap-1 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }}></span>
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 380 160" className="w-full" style={{ minHeight: 220 }}>
            {/* Grid background */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
              </pattern>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <rect width="380" height="160" fill="url(#grid)" />

            {/* Site boundary */}
            <rect x="5" y="5" width="370" height="150" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" strokeDasharray="4,3" rx="3"/>
            <text x="190" y="158" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="4">موقع 155 — بوهادي، بنغازي | 65,000 م²</text>

            {/* Port access indicator */}
            <g transform="translate(342, 8)">
              <rect x="0" y="0" width="32" height="10" fill="#1a2840" rx="2"/>
              <text x="16" y="7" textAnchor="middle" fill="#e8b830" fontSize="3.5" fontWeight="bold">⚓ ميناء 7كم</text>
            </g>

            {/* Warehouses */}
            {layout.map(cell => {
              const wh = warehouses.find(w => w.id === cell.id);
              if (!wh) return null;
              const isSelected = selectedZone === cell.id;
              return (
                <g key={cell.id} onClick={() => setSelectedZone(isSelected ? null : cell.id)} style={{ cursor:'pointer' }}>
                  <rect
                    x={cell.x} y={cell.y} width={cell.w} height={cell.h}
                    fill={wh.color} fillOpacity={isSelected ? 0.5 : 0.22}
                    stroke={wh.color} strokeWidth={isSelected ? 1.5 : 0.8}
                    rx="2"
                    filter={isSelected ? 'url(#glow)' : undefined}
                  />
                  {wh.highPriority && (
                    <rect x={cell.x+1} y={cell.y+1} width={cell.w-2} height={2} fill={wh.color} fillOpacity="0.7" rx="1"/>
                  )}
                  <text x={cell.x + cell.w/2} y={cell.y + cell.h/2 - 2} textAnchor="middle" fill="white" fontSize="4.5" fontWeight="bold">{cell.id}</text>
                  <text x={cell.x + cell.w/2} y={cell.y + cell.h/2 + 5} textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="3.2">{wh.name}</text>
                </g>
              );
            })}

            {/* Flow arrows */}
            <defs>
              <marker id="arr-flow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <polygon points="0 0, 5 2.5, 0 5" fill="#e8b830" opacity="0.7"/>
              </marker>
            </defs>
            <line x1="205" y1="23" x2="120" y2="23" stroke="#e8b830" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" markerEnd="url(#arr-flow)"/>
            <line x1="62" y1="50" x2="62" y2="56" stroke="#e8b830" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" markerEnd="url(#arr-flow)"/>
            <line x1="62" y1="76" x2="62" y2="80" stroke="#e8b830" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" markerEnd="url(#arr-flow)"/>
            <line x1="62" y1="100" x2="62" y2="104" stroke="#e8b830" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" markerEnd="url(#arr-flow)"/>
            <line x1="62" y1="124" x2="62" y2="128" stroke="#e8b830" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.5" markerEnd="url(#arr-flow)"/>
          </svg>
        </div>

        {/* Zone Detail */}
        {selectedZone && (() => {
          const wh = warehouses.find(w => w.id === selectedZone);
          if (!wh) return null;
          return (
            <div className="mt-4 p-5 rounded-xl border" style={{ backgroundColor:`${wh.color}18`, borderColor:`${wh.color}44` }}>
              <div className="flex flex-wrap justify-between items-start gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: wh.color }}></span>
                    <h5 className="font-bold text-white text-base">{wh.id} — {wh.name}</h5>
                  </div>
                  <p className="text-xs text-gray-400">{wh.function}</p>
                </div>
                <button onClick={() => setSelectedZone(null)} className="text-gray-500 hover:text-white text-xs px-2 py-1 bg-white/5 rounded-lg">✕ إغلاق</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  { l:'المساحة',         v:`${wh.area.toLocaleString()} م²` },
                  { l:'الأبعاد',          v:wh.dims },
                  { l:'الارتفاع الصافي',  v:`${wh.height} م` },
                  { l:'سعة الطبليات',     v:wh.palletCapacity.toLocaleString() },
                  { l:'المعيار',           v:wh.standard },
                  { l:'دور التدفق',       v:wh.flowRole },
                ].map((r, i) => (
                  <div key={i} className="bg-white/5 p-2.5 rounded-lg">
                    <div className="text-gray-500 text-[10px] mb-0.5">{r.l}</div>
                    <div className="text-white font-bold text-[11px]">{r.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {!selectedZone && (
          <div className="mt-3 p-3 bg-white/5 rounded-xl text-center text-[10px] text-gray-500">
            ← اضغط على أي مستودع لعرض تفاصيله
          </div>
        )}
      </div>

      {/* جدول الوحدات */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4 text-sm">جدول الوحدات التشغيلية — 10 مستودعات</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                {['الوحدة','الوظيفة','المساحة','الارتفاع','سعة الطبليات','المعيار','الدور'].map((h, i) => (
                  <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {warehouses.map(wh => (
                <tr key={wh.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedZone(wh.id)}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: wh.color }}></span>
                      <span className="font-bold text-white">{wh.id}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-300">{wh.name}</td>
                  <td className="py-2.5 pr-3 text-gray-400">{wh.area.toLocaleString()} م²</td>
                  <td className="py-2.5 pr-3 text-gray-400">{wh.height} م</td>
                  <td className="py-2.5 pr-3 font-bold" style={{ color: wh.color }}>{wh.palletCapacity.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-[10px] font-mono">{wh.standard.split('/')[0]}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      wh.flowRole === 'input'   ? 'bg-green-500/20 text-green-400' :
                      wh.flowRole === 'output'  ? 'bg-orange-500/20 text-orange-400' :
                      wh.flowRole === 'qc'      ? 'bg-purple-500/20 text-purple-400' :
                      wh.flowRole === 'staging' ? 'bg-blue-500/20 text-blue-400' :
                                                  'bg-gray-500/20 text-gray-400'
                    }`}>{wh.flowRole}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10">
                <td colSpan={4} className="pt-3 pr-3 text-gray-400 font-bold text-[11px]">الإجمالي</td>
                <td className="pt-3 pr-3 font-black text-brand-yellow">
                  {warehouses.reduce((a,w) => a + w.palletCapacity, 0).toLocaleString()} طبلية
                </td>
                <td colSpan={2} className="pt-3 pr-3 text-gray-500 text-[10px]">إجمالي 18,500 م²</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: تدفق العمليات ────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderLogisticsFlow = () => (
    <div className="space-y-6 animate-fade-in">
      {/* خط التدفق المرئي */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-6 text-sm">تدفق العمليات اللوجستية — من وصول الشاحنة إلى التسليم</h4>
        <div className="relative">
          {/* خط التدفق */}
          <div className="hidden md:block absolute top-10 left-8 right-8 h-0.5 bg-gradient-to-l from-orange-500/40 via-blue-500/40 to-green-500/40"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 relative z-10">
            {logisticsFlow.map(step => (
              <div
                key={step.step}
                onClick={() => setActiveFlowStep(activeFlowStep?.step === step.step ? null : step)}
                className="flex flex-col items-center text-center cursor-pointer group"
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-2 transition-all border-2 ${
                    activeFlowStep?.step === step.step
                      ? 'scale-110 shadow-lg'
                      : 'hover:scale-105 border-transparent'
                  }`}
                  style={{
                    backgroundColor: `${step.color}22`,
                    borderColor: activeFlowStep?.step === step.step ? step.color : 'transparent',
                    boxShadow: activeFlowStep?.step === step.step ? `0 0 20px ${step.color}40` : undefined,
                  }}
                >
                  {step.icon}
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white mb-1.5" style={{ backgroundColor: step.color }}>
                  {step.step}
                </div>
                <div className="text-[11px] font-bold text-white leading-tight">{step.title}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{step.subtitle}</div>
              </div>
            ))}
          </div>
        </div>

        {/* تفاصيل الخطوة المختارة */}
        {activeFlowStep && (
          <div className="mt-6 p-5 rounded-2xl border" style={{ backgroundColor:`${activeFlowStep.color}10`, borderColor:`${activeFlowStep.color}33` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{activeFlowStep.icon}</span>
                <div>
                  <h5 className="font-bold text-white text-base">{activeFlowStep.title}</h5>
                  <div className="text-xs text-gray-400">{activeFlowStep.zone}</div>
                </div>
              </div>
              <button onClick={() => setActiveFlowStep(null)} className="text-gray-500 hover:text-white text-xs px-2 py-1 bg-white/5 rounded-lg">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="text-[10px] text-gray-400 mb-2">خطوات التنفيذ</div>
                <div className="space-y-2">
                  {activeFlowStep.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-gray-300">
                      <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold text-white mt-0.5" style={{ backgroundColor: activeFlowStep.color }}>{i + 1}</span>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-gray-400 mb-1">المعيار المعتمد</div>
                  <div className="text-xs text-brand-yellow font-bold">{activeFlowStep.standard}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-gray-400 mb-1">مؤشر الأداء (KPI)</div>
                  <div className="text-xs text-green-400 font-bold">{activeFlowStep.kpi}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="text-[10px] text-gray-400 mb-1">المعدات المطلوبة</div>
                  <div className="text-xs text-white">{activeFlowStep.equipment}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        {!activeFlowStep && (
          <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 text-center text-xs text-gray-400">
            ↑ اضغط على أي خطوة لعرض تفاصيلها الكاملة
          </div>
        )}
      </div>

      {/* جدول ملخص التدفق */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4">ملخص تدفق العمليات — مؤشرات الأداء المستهدفة</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                {['#','المرحلة','المنطقة','المعيار','KPI المستهدف','المعدات'].map((h, i) => (
                  <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logisticsFlow.map(step => (
                <tr key={step.step} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setActiveFlowStep(step)}>
                  <td className="py-3 pr-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: step.color }}>{step.step}</span>
                  </td>
                  <td className="py-3 pr-3 text-white font-medium">{step.title}</td>
                  <td className="py-3 pr-3 text-gray-300 text-[10px]">{step.zone}</td>
                  <td className="py-3 pr-3 text-brand-yellow text-[10px]">{step.standard.split('/')[0]}</td>
                  <td className="py-3 pr-3 text-green-400 font-bold text-[10px]">{step.kpi}</td>
                  <td className="py-3 pr-3 text-gray-300 text-[10px]">{step.equipment.split('+')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: القطاع الرأسي ────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderElevation = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* الوضع الحالي */}
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
          <h4 className="font-bold text-white mb-1 border-b border-white/10 pb-2">الوضع الحالي — Current State</h4>
          <p className="text-xs text-gray-400 mb-4">ارتفاع صافٍ 6.80 م — 3 مستويات تخزين فقط</p>
          <div className="relative h-72 bg-brand-navy/30 rounded-xl overflow-hidden border border-white/5">
            <svg viewBox="0 0 200 150" className="w-full h-full p-3">
              <rect x="10" y="128" width="180" height="5" fill="#2c3e50" />
              <line x1="10" y1="48" x2="190" y2="48" stroke="#c0392b" strokeWidth="1.5" strokeDasharray="4,2" />
              <text x="192" y="45" textAnchor="end" fill="#c0392b" fontSize="5.5">6.80م (الحد الحالي)</text>
              {[30, 80, 130].map(x => (
                <g key={x}>
                  <rect x={x}    y="48" width="2" height="80" fill="#555" />
                  <rect x={x+30} y="48" width="2" height="80" fill="#555" />
                  {[118, 93, 68].map(y => <rect key={y} x={x} y={y} width="32" height="2" fill="#666" />)}
                  <rect x={x} y="28" width="32" height="18" fill="#c0392b" fillOpacity="0.1" />
                  <text x={x+16} y="40" textAnchor="middle" fill="#c0392b" fontSize="3.5" opacity="0.7">مساحة ضائعة</text>
                  <rect x={x-2} y="123" width="6" height="5" fill="#7f8c8d" />
                  <rect x={x+28} y="123" width="6" height="5" fill="#7f8c8d" />
                </g>
              ))}
              <text x="100" y="143" textAnchor="middle" fill="#7f8c8d" fontSize="4.5">3 مستويات فقط — هدر 45% من الحجم العمودي</text>
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {[
              { l:'عدد المستويات',   v:'3 مستويات',      bad:true },
              { l:'السعة التخزينية', v:'منخفضة (~35%)',   bad:true },
              { l:'نوع الرافعة',     v:'رافعة قياسية',   bad:false },
              { l:'الإهدار العمودي', v:'45% مساحة ضائعة',bad:true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                <span className="text-gray-400">{r.l}</span>
                <span className={r.bad ? 'text-brand-red font-bold' : 'text-gray-300 font-bold'}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* الوضع المقترح */}
        <div className="bg-[#141f2e] border rounded-2xl p-6" style={{ borderColor:'#1abc9c44' }}>
          <h4 className="font-bold text-brand-yellow mb-1 border-b border-white/10 pb-2">الوضع المقترح — Class A Standard</h4>
          <p className="text-xs text-gray-400 mb-4">ارتفاع صافٍ 12.0 م — 6 مستويات تخزين (E-5)</p>
          <div className="relative h-72 bg-brand-navy/30 rounded-xl overflow-hidden border border-white/5">
            <svg viewBox="0 0 200 150" className="w-full h-full p-3">
              <rect x="10" y="128" width="180" height="5" fill="#2c3e50" />
              <line x1="10" y1="10" x2="190" y2="10" stroke="#27ae60" strokeWidth="1.5" strokeDasharray="4,2" />
              <text x="192" y="8" textAnchor="end" fill="#27ae60" fontSize="5.5">12.0م (Class A)</text>
              {[30, 80, 130].map(x => (
                <g key={x}>
                  <rect x={x}    y="10" width="2" height="118" fill="#2980b9" />
                  <rect x={x+30} y="10" width="2" height="118" fill="#2980b9" />
                  {[118, 98, 78, 58, 38, 18].map(y => (
                    <g key={y}>
                      <rect x={x}   y={y}   width="32" height="2"  fill="#e67e22" />
                      <rect x={x+3} y={y-9} width="11" height="9"  fill="#f39c12" fillOpacity="0.65" rx="1" />
                      <rect x={x+18} y={y-9} width="11" height="9" fill="#f39c12" fillOpacity="0.65" rx="1" />
                    </g>
                  ))}
                  <rect x={x-2} y="123" width="6" height="5" fill="#e67e22" />
                  <rect x={x+28} y="123" width="6" height="5" fill="#e67e22" />
                </g>
              ))}
              <g transform="translate(167,85) scale(0.35)">
                <rect x="0" y="20" width="35" height="30" fill="#f1c40f" rx="2" />
                <rect x="30" y="-140" width="5" height="190" fill="#2c3e50" />
                <rect x="35" y="-20" width="14" height="5" fill="#2c3e50" />
              </g>
              <text x="100" y="143" textAnchor="middle" fill="#27ae60" fontSize="4.5">6 مستويات — استغلال 95% من الحجم العمودي</text>
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {[
              { l:'عدد المستويات',    v:'6 مستويات (E-5)', good:true },
              { l:'السعة التخزينية',  v:'+140% زيادة',     good:true },
              { l:'نوع الرافعة',      v:'Reach Truck / VNA',good:true },
              { l:'الاستغلال العمودي',v:'95% كفاءة',       good:true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                <span className="text-gray-400">{r.l}</span>
                <span className={r.good ? 'text-green-400 font-bold' : 'text-gray-300 font-bold'}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dock Platform Detail */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">تفصيل منصة الشحن والاستلام — Dock Platform Detail</h4>
        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 420 155" className="w-full" style={{ minHeight:180 }}>
            <rect x="0" y="130" width="420" height="25" fill="#1a1a2a" />
            <rect x="260" y="90" width="160" height="40" fill="#2c3344" />
            <line x1="260" y1="90" x2="420" y2="90" stroke="white" strokeWidth="0.8" />
            <text x="340" y="114" textAnchor="middle" fill="#aaa" fontSize="7">أرضية المستودع (+1.20 م)</text>
            <rect x="248" y="88" width="18" height="2.5" fill="#e67e22" transform="rotate(-6,260,90)" rx="1" />
            <rect x="252" y="60" width="8" height="30" fill="#27ae60" fillOpacity="0.5" />
            <rect x="252" y="60" width="8" height="30" fill="none" stroke="#27ae60" strokeWidth="0.5" />
            <text x="256" y="75" textAnchor="middle" fill="#27ae60" fontSize="3.5" transform="rotate(90,256,75)">Dock Shelter</text>
            <rect x="30" y="60" width="215" height="68" fill="#2980b9" fillOpacity="0.75" rx="3" />
            <rect x="220" y="60" width="25" height="68" fill="#1a1a2e" rx="1" />
            <text x="120" y="98" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">مقطورة شحن ثقيلة — 40 قدم</text>
            <circle cx="70"  cy="130" r="9" fill="#111" /><circle cx="70"  cy="130" r="5" fill="#333" />
            <circle cx="190" cy="130" r="9" fill="#111" /><circle cx="190" cy="130" r="5" fill="#333" />
            <circle cx="270" cy="68" r="4" fill="#c0392b" />
            <text x="270" y="80" textAnchor="middle" fill="#c0392b" fontSize="3.5">STOP</text>
            <line x1="242" y1="130" x2="242" y2="90" stroke="#f1c40f" strokeWidth="0.8" />
            <text x="238" y="112" textAnchor="end" fill="#f1c40f" fontSize="5.5">1.20م</text>
          </svg>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          {[
            { title:'Dock Leveler (هيدروليكي)', desc:'جسر هيدروليكي 6 طن يربط أرضية المستودع بسرير الشاحنة، يعوّض فروق الارتفاع ±200 ملم تلقائياً.' },
            { title:'Dock Shelter (عازل حراري)', desc:'مطاط عازل يحيط بفتحة الشاحنة لمنع دخول الغبار والحرارة وتحسين كفاءة الطاقة بنسبة 40%.' },
            { title:'Safety Light System', desc:'إشارة أحمر/أخضر لتنظيم حركة الشاحنات، تمنع حوادث الدخول المبكر أثناء التحميل.' },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="text-brand-yellow font-bold text-sm mb-2">{item.title}</div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: المعايير الدولية ─────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderStandards = () => {
    const criticalCount  = standards.filter(s => s.priority === 'Critical').length;
    const upgradeCount   = standards.filter(s => s.status === 'Upgrade Required').length;
    const complianceRate = Math.round(((standards.length - upgradeCount) / standards.length) * 100);
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label:'عناصر حرجة',     value:criticalCount,        color:'text-brand-red',    bg:'bg-brand-red/10',    icon:'clipboardList' },
            { label:'تطويرات مطلوبة', value:upgradeCount,         color:'text-brand-yellow', bg:'bg-brand-yellow/10', icon:'arrowUpTray' },
            { label:'نسبة الامتثال',  value:`${complianceRate}%`, color:'text-green-400',    bg:'bg-green-500/10',    icon:'clipboardList' },
          ].map((s, i) => (
            <div key={i} className="bg-[#141f2e] border border-white/10 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-gray-300 text-xs font-bold uppercase mb-1">{s.label}</div>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              </div>
              <div className={`w-12 h-12 ${s.bg} rounded-full flex items-center justify-center ${s.color}`}>
                <Icon name={s.icon} size={22} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {standards.map((s, i) => (
            <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 hover:border-white/30 transition-all group">
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  s.priority === 'Critical' ? 'bg-brand-red/15 text-brand-red border-brand-red/30' :
                  s.priority === 'High'     ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                                              'bg-gray-500/15 text-gray-400 border-gray-500/30'
                }`}>{s.priority}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.status === 'Compliant' ? 'bg-green-500' : 'bg-brand-yellow animate-pulse'}`}></span>
                  <span className={`text-[10px] font-bold ${s.status === 'Compliant' ? 'text-green-400' : 'text-brand-yellow'}`}>
                    {s.status === 'Compliant' ? 'مطابق' : 'تطوير مطلوب'}
                  </span>
                </div>
              </div>
              <h5 className="font-bold text-white text-sm mb-0.5 group-hover:text-brand-yellow transition-colors">{s.name}</h5>
              <div className="text-[10px] text-gray-400 mb-3 font-mono">{s.ref}</div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5 mb-2">
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

  // ────────────────────────────────────────────────────────────────
  // ── العرض: مقترح التحويل ───────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderProposal = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {proposalCards.map((card, i) => (
          <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 hover:border-brand-yellow/30 hover:scale-[1.01] transition-all group shadow-xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${
              card.priority === 'Critical' ? 'bg-brand-red' :
              card.priority === 'High'     ? 'bg-brand-yellow' : 'bg-blue-500'
            }`}></div>
            <div className="flex justify-between items-start mb-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                card.priority === 'Critical' ? 'bg-brand-red/15 text-brand-red' :
                card.priority === 'High'     ? 'bg-brand-yellow/15 text-brand-yellow' :
                                               'bg-blue-500/15 text-blue-400'
              }`}>
                <Icon name={card.icon} size={22} />
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                card.priority === 'Critical' ? 'bg-brand-red/15 text-brand-red border-brand-red/30' :
                card.priority === 'High'     ? 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30' :
                                               'bg-blue-500/15 text-blue-400 border-blue-500/30'
              }`}>{card.priority}</span>
            </div>
            <h4 className="font-bold text-white group-hover:text-brand-yellow transition-colors mb-0.5">{card.title}</h4>
            <p className="text-[10px] text-gray-400 mb-4">{card.subtitle}</p>
            <ul className="space-y-2 mb-5">
              {card.details.map((d, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[11px] text-gray-300">
                  <span className="text-brand-yellow mt-0.5 shrink-0">✓</span>
                  {d}
                </li>
              ))}
            </ul>
            <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[10px]">
              <div>
                <div className="text-gray-500">المدة الزمنية</div>
                <div className="text-white font-bold">{card.duration}</div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold border ${
                card.priority === 'Critical' ? 'bg-brand-red/15 text-brand-red border-brand-red/30' :
                card.priority === 'High'     ? 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30' :
                                               'bg-blue-500/15 text-blue-400 border-blue-500/30'
              }`}>{card.priority}</span>
            </div>
          </div>
        ))}
      </div>

      {/* الجدول الزمني */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-8 border-b border-white/10 pb-4">الجدول الزمني للتنفيذ — Implementation Gantt Overview</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { phase:'المرحلة 1', title:'الهدم والإنشاءات', time:'أسابيع 1 – 8',  color:'#e74c3c', items:['رفع أسقف E-5 إلى 12م','تقوية الأعمدة الإنشائية','صب أرضيات الإيبوكسي FF50'] },
            { phase:'المرحلة 2', title:'البنية التحتية',   time:'أسابيع 6 – 14', color:'#e67e22', items:['تركيب منصات الدوك 1.20م','Dock Levelers هيدروليكية','شبكة مياه الإطفاء'] },
            { phase:'المرحلة 3', title:'التجهيزات الفنية', time:'أسابيع 12 – 22',color:'#2980b9', items:['هيكل رفوف E-5 (6 مستويات)','رشاشات ESFR K-25','إضاءة LED صناعية'] },
            { phase:'المرحلة 4', title:'الرقمنة والتشغيل', time:'أسابيع 20 – 28',color:'#27ae60', items:['تكامل Odoo WMS','تدريب فرق التشغيل','اختبار الأحمال الكاملة'] },
          ].map((step, i) => (
            <div key={i} className="bg-brand-navy/30 border border-white/5 p-5 rounded-xl" style={{ borderTopColor: step.color, borderTopWidth:3 }}>
              <div className="font-bold text-xs mb-1" style={{ color: step.color }}>{step.phase}</div>
              <div className="text-white font-bold text-sm mb-1">{step.title}</div>
              <div className="text-[10px] text-gray-400 mb-4">{step.time}</div>
              <ul className="space-y-1.5">
                {step.items.map((item, idx) => (
                  <li key={idx} className="text-[10px] text-gray-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: step.color }}></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between text-sm">
          <span className="text-gray-300">المدة الإجمالية للمشروع:</span>
          <div className="text-right">
            <span className="text-brand-yellow font-bold text-lg">28 أسبوعاً (7 أشهر)</span>
            <div className="text-xs text-gray-400 mt-0.5">تنفيذ موازي للمراحل مع الحفاظ على التشغيل</div>
          </div>
        </div>
      </div>

      {/* مؤشرات الأداء المتوقعة */}
      <div className="bg-gradient-to-br from-[#1a2840] to-brand-navy border border-white/10 p-8 rounded-2xl">
        <h4 className="font-bold text-white mb-6">نتائج الأداء المتوقعة — Expected KPIs</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label:'زيادة السعة التخزينية',   val:'+140%',       icon:'grid',          color:'text-green-400' },
            { label:'تحسن سرعة الاستلام',      val:'+250%',       icon:'arrowDownTray', color:'text-blue-400' },
            { label:'دقة المخزون الرقمي',      val:'99.9%',       icon:'clipboardList', color:'text-brand-yellow' },
            { label:'تخفيض أخطاء الشحن',      val:'-95%',        icon:'truck',         color:'text-green-400' },
            { label:'تقليص زمن النقل الداخلي', val:'-65%',        icon:'workflows',     color:'text-blue-400' },
            { label:'فترة التعادل (Payback)',  val:'18–24 شهر',   icon:'package',       color:'text-brand-yellow' },
          ].map((kpi, i) => (
            <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
              <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-gray-400">
                <Icon name={kpi.icon} size={18} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-300 mb-0.5">{kpi.label}</div>
                <div className={`text-lg font-bold ${kpi.color}`}>{kpi.val}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: خطة التحوير (جديد) ──────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderModificationPlan = () => (
    <div className="space-y-8 animate-fade-in">
      {/* رأس الخطة */}
      <div className="bg-gradient-to-l from-[#1a2840] to-[#0f1923] border border-brand-yellow/20 rounded-2xl p-8">
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center text-brand-yellow shrink-0">
            <Icon name="arrowUpTray" size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-3 py-1 bg-brand-yellow/15 text-brand-yellow text-xs font-bold rounded-full border border-brand-yellow/30">خطة أولى</span>
              <span className="px-3 py-1 bg-green-500/15 text-green-400 text-xs font-bold rounded-full border border-green-500/25">تحوير داخلي</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{modificationPlan.title}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{modificationPlan.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center shrink-0">
            {[
              { l:'عدد الوحدات', v:'10 وحدة', c:'text-brand-yellow' },
              { l:'مدة التنفيذ', v:'~14 أسبوع', c:'text-green-400' },
              { l:'نوع التدخل',  v:'ترقية وظيفية', c:'text-blue-400' },
            ].map((s, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-gray-400 mb-1">{s.l}</div>
                <div className={`font-bold text-sm ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* بطاقات التحوير */}
      <div className="space-y-5">
        {modificationPlan.phases.map((phase, i) => (
          <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
            {/* رأس البطاقة */}
            <div className="flex flex-wrap items-center gap-4 p-5 border-b border-white/5" style={{ borderRightWidth:4, borderRightColor: phase.color }}>
              <span className="text-2xl">{phase.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor:`${phase.color}22`, color: phase.color }}>{phase.id}</span>
                  <h5 className="font-bold text-white text-base">{phase.name}</h5>
                </div>
                <div className="text-xs text-gray-400">الوضع الحالي: {phase.current}</div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <EffortBadge level={phase.effort} />
                <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-1 rounded-lg">⏱ {phase.duration}</span>
              </div>
            </div>

            {/* محتوى البطاقة */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* المقترح */}
              <div className="md:col-span-2">
                <div className="text-[10px] text-gray-400 mb-3 uppercase font-bold">المقترح: {phase.proposed}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {phase.changes.map((change, ci) => (
                    <div key={ci} className="flex items-start gap-2 text-[11px] text-gray-300 bg-white/3 p-2 rounded-lg">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5" style={{ backgroundColor: phase.color }}>{ci+1}</span>
                      {change}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-gray-500 font-mono">المعيار: <span className="text-brand-yellow">{phase.standard}</span></div>
              </div>

              {/* مؤشرات التحسين */}
              <div className="space-y-3">
                <div className="bg-brand-red/8 border border-brand-red/15 rounded-xl p-3">
                  <div className="text-[10px] text-brand-red mb-1">قبل التحوير</div>
                  <div className="text-xs text-gray-200 font-medium">{phase.kpiOld}</div>
                </div>
                <div className="bg-green-500/8 border border-green-500/15 rounded-xl p-3">
                  <div className="text-[10px] text-green-400 mb-1">بعد التحوير</div>
                  <div className="text-xs text-gray-200 font-medium">{phase.kpiNew}</div>
                </div>
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor:`${phase.color}18`, border:`1px solid ${phase.color}33` }}>
                  <div className="text-[10px] text-gray-400">نسبة التحسين</div>
                  <div className="text-lg font-black" style={{ color: phase.color }}>{phase.gain}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ملخص الخطة */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">ملخص مؤشرات خطة التحوير</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                {['الوحدة','الوضع الحالي','بعد التحوير','التحسين','المدة','الجهد'].map((h, i) => (
                  <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modificationPlan.phases.map((p, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                      <span className="font-bold text-white">{p.id}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-[10px]">{p.kpiOld}</td>
                  <td className="py-3 pr-4 text-green-400 text-[10px] font-medium">{p.kpiNew}</td>
                  <td className="py-3 pr-4">
                    <span className="font-black" style={{ color: p.color }}>{p.gain}</span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-[10px]">{p.duration}</td>
                  <td className="py-3 pr-4"><EffortBadge level={p.effort} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ملاحظات التنفيذ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6">
          <h5 className="font-bold text-green-400 mb-4 flex items-center gap-2">
            <span>✅</span> مزايا هذه الخطة
          </h5>
          <ul className="space-y-2 text-[11px] text-gray-300">
            {[
              'لا تتطلب إغلاق كامل للمستودعات — يمكن التنفيذ مرحلياً',
              'خطر إنشائي منخفض — لا هدم للجدران الحاملة',
              'مدة تنفيذ أقصر مقارنةً بخطة الدمج',
              'الحفاظ على الحدود الإنشائية القائمة',
              'مرونة في تعديل الأولويات حسب الموازنة',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-brand-yellow/5 border border-brand-yellow/20 rounded-2xl p-6">
          <h5 className="font-bold text-brand-yellow mb-4 flex items-center gap-2">
            <span>⚠️</span> نقاط تحتاج اهتمام
          </h5>
          <ul className="space-y-2 text-[11px] text-gray-300">
            {[
              'E-5 تتطلب إغلاق مؤقت لرفع السقف (4–6 أسابيع)',
              'التنسيق بين الوحدات المتجاورة خلال التنفيذ',
              'الحفاظ على تدفق التشغيل اليومي في الوحدات الأخرى',
              'مراجعة إنشائية لـ E-5 قبل بدء رفع السقف',
              'تدريب الكوادر على المعدات والأنظمة الجديدة',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-brand-yellow mt-0.5 shrink-0">!</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: خطة الدمج (جديد) ────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderMergePlan = () => (
    <div className="space-y-8 animate-fade-in">
      {/* رأس الخطة */}
      <div className="bg-gradient-to-l from-[#1a0f2a] to-[#0f1923] border border-purple-500/25 rounded-2xl p-8">
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Icon name="workflows" size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-3 py-1 bg-purple-500/15 text-purple-400 text-xs font-bold rounded-full border border-purple-500/30">خطة ثانية</span>
              <span className="px-3 py-1 bg-brand-red/15 text-brand-red text-xs font-bold rounded-full border border-brand-red/30">إعادة هيكلة</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{mergePlan.title}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{mergePlan.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center shrink-0">
            {[
              { l:'المجمعات الجديدة', v:'4 مجمعات',   c:'text-purple-400' },
              { l:'مدة التنفيذ',     v:'~28 أسبوع',  c:'text-brand-yellow' },
              { l:'زيادة السعة',     v:'+75%',        c:'text-green-400' },
            ].map((s, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-gray-400 mb-1">{s.l}</div>
                <div className={`font-bold text-sm ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* خريطة الدمج المرئية */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4 text-sm">خريطة الدمج — من 10 وحدات إلى 4 مجمعات</h4>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 680 120" className="w-full" style={{ minHeight:130 }}>
            <defs>
              <marker id="merge-arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#e8b830" opacity="0.8"/>
              </marker>
            </defs>

            {/* قبل */}
            <text x="85" y="12" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="bold">الوضع الحالي — 10 وحدات</text>
            {[
              { id:'E-1', x:10, c:'#27ae60' },{ id:'E-4', x:30, c:'#8e44ad' },
              { id:'E-2', x:55, c:'#2980b9' },{ id:'E-3', x:75, c:'#2980b9' },
              { id:'E-5', x:100,c:'#1abc9c' },
              { id:'E-6', x:130,c:'#3498db' },{ id:'E-7', x:150,c:'#3498db' },{ id:'E-8', x:170,c:'#3498db' },
              { id:'E-9', x:200,c:'#e67e22' },{ id:'E-10',x:220,c:'#e67e22' },
            ].map(w => (
              <g key={w.id}>
                <rect x={w.x} y="18" width="18" height="50" fill={w.c} fillOpacity="0.25" stroke={w.c} strokeWidth="0.8" rx="2"/>
                <text x={w.x+9} y="28" textAnchor="middle" fill="white" fontSize="3.5" fontWeight="bold">{w.id}</text>
              </g>
            ))}

            {/* سهام التحويل */}
            <line x1="340" y1="18" x2="340" y2="68" stroke="#e8b830" strokeWidth="0" strokeDasharray="0"/>
            <text x="345" y="45" fill="#e8b830" fontSize="8" fontWeight="bold">⟹</text>
            <text x="355" y="40" fill="#9ca3af" fontSize="6">دمج</text>
            <text x="355" y="50" fill="#9ca3af" fontSize="6">وإعادة</text>
            <text x="355" y="60" fill="#9ca3af" fontSize="6">هيكلة</text>

            {/* بعد */}
            <text x="545" y="12" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="bold">بعد الدمج — 4 مجمعات</text>
            {[
              { id:'M-A', label:'استلام + QC', x:385, w:50, c:'#27ae60', sub:'E-1 + E-4' },
              { id:'M-B', label:'High-Bay الموسع', x:445, w:70, c:'#1abc9c', sub:'E-5+E-2+E-3' },
              { id:'M-C', label:'تخزين ديناميكي', x:525, w:70, c:'#3498db', sub:'E-6+E-7+E-8' },
              { id:'M-D', label:'بوابة الشحن', x:605, w:55, c:'#e67e22', sub:'E-9 + E-10' },
            ].map(m => (
              <g key={m.id}>
                <rect x={m.x} y="18" width={m.w} height="60" fill={m.c} fillOpacity="0.2" stroke={m.c} strokeWidth="1.2" rx="4"/>
                <text x={m.x+m.w/2} y="36" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">{m.id}</text>
                <text x={m.x+m.w/2} y="50" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="3.8">{m.label}</text>
                <text x={m.x+m.w/2} y="62" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="3.2">{m.sub}</text>
              </g>
            ))}

            {/* شرح الألوان */}
            {[
              { c:'#27ae60', l:'استلام/جودة', x:390 },
              { c:'#1abc9c', l:'High-Bay',   x:455 },
              { c:'#3498db', l:'تخزين',      x:530 },
              { c:'#e67e22', l:'شحن',         x:610 },
            ].map((lb,i) => (
              <g key={i}>
                <rect x={lb.x} y="90" width="6" height="6" fill={lb.c} rx="1"/>
                <text x={lb.x+8} y="96" fill="#9ca3af" fontSize="4">{lb.l}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* بطاقات المجمعات الجديدة */}
      <div className="space-y-6">
        {mergePlan.mergedUnits.map((unit, i) => (
          <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
            {/* رأس */}
            <div className="p-5 border-b border-white/5 flex flex-wrap items-center gap-4"
              style={{ background:`linear-gradient(135deg, ${unit.color}18 0%, transparent 50%)` }}>
              <span className="text-3xl">{unit.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-black px-2 py-0.5 rounded" style={{ backgroundColor:`${unit.color}30`, color: unit.color }}>{unit.id}</span>
                  <h5 className="font-bold text-white text-lg">{unit.name}</h5>
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 mb-1">
                  <span>يدمج: <span className="text-white font-bold">{unit.mergedFrom.join(' + ')}</span></span>
                  <span>•</span>
                  <span>المساحة: <span className="text-white font-bold">{unit.newArea}</span></span>
                  <span>•</span>
                  <span>الأبعاد: <span className="text-white font-bold">{unit.newDims}</span></span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{unit.concept}</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <EffortBadge level={unit.effort} />
                <RiskBadge level={unit.riskLevel} />
                <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-1 rounded-lg">⏱ {unit.duration}</span>
              </div>
            </div>

            {/* محتوى */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* الأعمال الإنشائية */}
              <div>
                <div className="text-[10px] text-gray-400 mb-3 font-bold uppercase flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-red"></span>
                  الأعمال الإنشائية المطلوبة
                </div>
                <div className="space-y-2">
                  {unit.structuralWork.map((work, wi) => (
                    <div key={wi} className="flex items-start gap-2 text-[11px] text-gray-300 bg-brand-red/5 p-2 rounded-lg border border-brand-red/10">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-brand-red/60 shrink-0 mt-0.5">{wi+1}</span>
                      {work}
                    </div>
                  ))}
                </div>
              </div>

              {/* التغييرات التشغيلية */}
              <div>
                <div className="text-[10px] text-gray-400 mb-3 font-bold uppercase flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  التغييرات التشغيلية
                </div>
                <div className="space-y-2">
                  {unit.operationalChanges.map((op, oi) => (
                    <div key={oi} className="flex items-start gap-2 text-[11px] text-gray-300 bg-green-500/5 p-2 rounded-lg border border-green-500/10">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                      {op}
                    </div>
                  ))}
                </div>

                {/* نسبة التحسين */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-brand-red/8 border border-brand-red/15 rounded-xl p-3">
                    <div className="text-[10px] text-brand-red mb-1">قبل الدمج</div>
                    <div className="text-[11px] text-gray-200">{unit.kpiOld}</div>
                  </div>
                  <div className="bg-green-500/8 border border-green-500/15 rounded-xl p-3">
                    <div className="text-[10px] text-green-400 mb-1">بعد الدمج</div>
                    <div className="text-[11px] text-gray-200">{unit.kpiNew}</div>
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor:`${unit.color}15`, border:`1px solid ${unit.color}30` }}>
                  <div className="text-[10px] text-gray-400">التحسين الكلي</div>
                  <div className="font-black text-base" style={{ color: unit.color }}>{unit.gain}</div>
                </div>
              </div>
            </div>

            {/* ملاحظة المخاطر */}
            {unit.riskNote && (
              <div className={`px-5 pb-4`}>
                <div className={`p-3 rounded-xl text-[11px] flex items-start gap-2 ${
                  unit.riskLevel === 'مرتفع'  ? 'bg-brand-red/8 border border-brand-red/20 text-brand-red' :
                  unit.riskLevel === 'متوسط'  ? 'bg-brand-yellow/8 border border-brand-yellow/20 text-brand-yellow' :
                                                'bg-green-500/8 border border-green-500/20 text-green-400'
                }`}>
                  <span className="shrink-0 mt-0.5">{unit.riskLevel === 'مرتفع' ? '⚠️' : unit.riskLevel === 'متوسط' ? '⚡' : '✅'}</span>
                  <span><span className="font-bold">ملاحظة المخاطر: </span>{unit.riskNote}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* جدول المقارنة قبل/بعد */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">جدول المقارنة الشاملة — قبل وبعد الدمج</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                {['المعيار','الوضع الحالي','بعد الدمج','الأثر'].map((h, i) => (
                  <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mergePlan.comparison.map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                  <td className="py-3 pr-4 font-medium text-white">{row.metric}</td>
                  <td className="py-3 pr-4 text-gray-400">{row.before}</td>
                  <td className={`py-3 pr-4 font-bold ${row.better ? 'text-green-400' : 'text-brand-yellow'}`}>{row.after}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.better
                        ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                        : 'bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30'
                    }`}>{row.better ? '▲ تحسين' : '⚑ انتبه'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* مقارنة الخطتين */}
      <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6 text-center">خلاصة المقارنة بين الخطتين</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* خطة التحوير */}
          <div className="bg-brand-yellow/5 border border-brand-yellow/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-brand-yellow/15 rounded-xl flex items-center justify-center text-brand-yellow">
                <Icon name="arrowUpTray" size={20} />
              </div>
              <div>
                <div className="text-brand-yellow font-black text-base">خطة التحوير</div>
                <div className="text-[10px] text-gray-400">ترقية داخلية للوحدات القائمة</div>
              </div>
            </div>
            <div className="space-y-2 text-[11px]">
              {[
                { label:'مدة التنفيذ', val:'~14 أسبوع', good:true },
                { label:'الخطر الإنشائي', val:'منخفض', good:true },
                { label:'التعطيل التشغيلي', val:'جزئي ومؤقت', good:true },
                { label:'زيادة الطبليات', val:'+80%', good:true },
                { label:'تعقيد التنسيق', val:'متوسط', good:true },
                { label:'التغيير الهيكلي', val:'لا يوجد', good:false },
              ].map((r, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-gray-400">{r.label}</span>
                  <span className={r.good ? 'text-green-400 font-bold' : 'text-gray-400 font-bold'}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* خطة الدمج */}
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/15 rounded-xl flex items-center justify-center text-purple-400">
                <Icon name="workflows" size={20} />
              </div>
              <div>
                <div className="text-purple-400 font-black text-base">خطة الدمج</div>
                <div className="text-[10px] text-gray-400">إعادة هيكلة وتوحيد المستودعات</div>
              </div>
            </div>
            <div className="space-y-2 text-[11px]">
              {[
                { label:'مدة التنفيذ', val:'~28 أسبوع', good:false },
                { label:'الخطر الإنشائي', val:'متوسط–مرتفع', good:false },
                { label:'التعطيل التشغيلي', val:'قابل للإدارة', good:true },
                { label:'زيادة الطبليات', val:'+75%', good:true },
                { label:'تعقيد التنسيق', val:'مرتفع', good:false },
                { label:'كفاءة التشغيل', val:'+60% طويل المدى', good:true },
              ].map((r, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-gray-400">{r.label}</span>
                  <span className={r.good ? 'text-green-400 font-bold' : 'text-brand-yellow font-bold'}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* التوصية النهائية */}
        <div className="mt-6 p-5 bg-brand-red/8 border border-brand-red/20 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-brand-red/20 rounded-lg flex items-center justify-center text-brand-red shrink-0 mt-0.5">
              <Icon name="clipboardList" size={16} />
            </div>
            <div>
              <div className="font-bold text-white mb-2">التوصية المقترحة للإدارة العامة</div>
              <p className="text-sm text-gray-300 leading-relaxed">
                يُنصح بتبني <span className="text-brand-yellow font-bold">خطة التحوير أولاً (الخطة الأولى)</span> كمرحلة تجريبية لمدة 14 أسبوعاً، مع الإبقاء على خيار تنفيذ <span className="text-purple-400 font-bold">خطة الدمج (الخطة الثانية)</span> كمشروع متوسط المدى بعد تقييم نتائج المرحلة الأولى. يتيح هذا النهج تحقيق تحسين فوري في الكفاءة التشغيلية بأقل قدر من المخاطر الإنشائية والتعطيل، مع فتح الباب أمام التحول الجذري عند استيفاء متطلبات الدراسة الإنشائية.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── العرض: تقييم الموقع ─────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderSiteAssessment = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-brand-navy rounded-xl flex items-center justify-center text-brand-yellow text-2xl border border-white/5">
            <Icon name="mapPin" size={22} className="text-brand-yellow" />
          </div>
          <div>
            <h4 className="font-black text-white text-lg">تقييم الموقع — Site 155 Assessment</h4>
            <p className="text-gray-400 text-xs">مراجعة المعايير التشغيلية لموقع بوهادي، بنغازي وفق معايير Class A اللوجستية</p>
          </div>
        </div>
        <div className="space-y-5">
          {assessmentCriteria.map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:border-brand-yellow/20 transition-all">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-brand-yellow font-black text-base w-7">0{i + 1}</span>
                  <div>
                    <div className="text-white font-bold text-sm">{item.name}</div>
                    <div className="text-gray-400 text-[10px] mt-0.5">{item.notes}</div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-gray-400 text-[10px]">الوزن: {item.weight}%</div>
                  <div className={`font-black text-xl ${item.score >= 8 ? 'text-green-400' : item.score >= 6 ? 'text-brand-yellow' : 'text-brand-red'}`}>
                    {item.score}<span className="text-sm text-gray-400">/10</span>
                  </div>
                </div>
              </div>
              <div className="w-full h-2.5 bg-brand-navy rounded-full overflow-hidden border border-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    item.score >= 8 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                    item.score >= 6 ? 'bg-brand-yellow shadow-[0_0_8px_rgba(232,184,48,0.4)]' :
                                      'bg-brand-red shadow-[0_0_8px_rgba(192,57,43,0.4)]'
                  }`}
                  style={{ width: `${item.score * 10}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-brand-navy/50 rounded-2xl border border-brand-yellow/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="text-4xl">🏅</div>
            <div>
              <div className="text-white font-bold text-base">التقييم الإجمالي للموقع</div>
              <div className="text-gray-400 text-xs">مرجح حسب الأوزان النسبية لكل معيار</div>
              <div className="text-[10px] text-gray-500 mt-1">تصنيف: موقع جيد جداً — يصلح للتحويل إلى Class A بعد التطويرات المقترحة</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black text-brand-yellow">{totalWeightedScore.toFixed(1)}<span className="text-base text-gray-400"> / 10</span></div>
            <div className="text-xs text-green-400 mt-1">✓ مؤهل للتحويل</div>
          </div>
        </div>
      </div>

      {/* توصيات التحسين */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">توصيات التحسين ذات الأولوية</h4>
        <div className="space-y-4">
          {[
            { priority:'فوري',  color:'#e74c3c', title:'رفع الارتفاع الصافي إلى 12م (E-5)',      detail:'أعلى أثر على سعة التخزين — ينقل الموقع مباشرة لـ Class A ويُمكّن من 6 مستويات رفوف.' },
            { priority:'فوري',  color:'#e74c3c', title:'ترقية منظومة الإطفاء إلى ESFR K-25',    detail:'شرط إلزامي لـ NFPA 13 في المستودعات العالية — لا يمكن تشغيل E-5 قانونياً بدونه.' },
            { priority:'قريب',  color:'#e67e22', title:'إنشاء منصات الدوك ودمج Dock Levelers',   detail:'يرفع كفاءة التحميل بنسبة 250% ويلغي الأضرار الناتجة عن التحميل الأرضي.' },
            { priority:'متوسط', color:'#2980b9', title:'تطبيق نظام WMS مع Odoo ERP',              detail:'دقة مخزون 99.9% وإلغاء ورق العمل اليدوي — عائد تشغيلي خلال 12 شهراً.' },
          ].map((r, i) => (
            <div key={i} className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 text-white" style={{ backgroundColor: r.color }}>{r.priority}</span>
              <div>
                <div className="text-white font-bold text-sm mb-1">{r.title}</div>
                <div className="text-gray-400 text-xs leading-relaxed">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  // ── ملخص الطباعة ────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  const renderPrintSummary = () => (
    <div className="hidden print:block space-y-6 mb-8">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
          <h4 className="font-bold text-white mb-4">معلومات الموقع</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries({
              'كود الموقع': siteInfo.id,
              'الموقع': siteInfo.location,
              'المساحة الكلية': siteInfo.totalSiteArea,
              'المساحة المغطاة': siteInfo.coveredArea,
              'المقاول': siteInfo.contractor,
              'الارتفاع الحالي': siteInfo.currentHeight,
              'إعداد': siteInfo.preparedBy,
            }).map(([label, val], i) => (
              <div key={i} className="border-b border-white/5 pb-2">
                <div className="text-[10px] text-gray-400 uppercase">{label}</div>
                <div className="text-white font-medium text-sm">{val}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
          <h4 className="font-bold text-white mb-4">مراجعة الامتثال</h4>
          <div className="space-y-3">
            {[
              { label:'ارتفاع السقف (Class A)', ok: dimensions.clearHeight >= 12, val: `${dimensions.clearHeight}م` },
              { label:'آلية الرشاشات ESFR',    ok: dimensions.clearHeight >= 10, val: dimensions.clearHeight >= 10 ? 'مطلوب' : 'اختياري' },
              { label:'أرضية إيبوكسي صناعي',  ok: dimensions.flooring.includes('إيبوكسي'), val: 'مطابق' },
              { label:'سعة التخزين المستهدفة', ok: stats.estPallets > 15000, val: stats.estPallets.toLocaleString() },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">{item.val}</span>
                  <span className={item.ok ? 'text-green-500' : 'text-brand-red'}>{item.ok ? '✓' : '✗'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── تعريف التبويبات ───────────────────────────────────────────
  const tabs = [
    { id:'floorplan',     label:'المخطط الكابوري',    icon:'grid' },
    { id:'flow',          label:'تدفق العمليات',      icon:'workflows' },
    { id:'elevation',     label:'القطاع الرأسي',      icon:'arrowUpTray' },
    { id:'standards',     label:'المعايير الدولية',   icon:'clipboardList' },
    { id:'proposal',      label:'مقترح التحويل',      icon:'package' },
    { id:'modification',  label:'خطة التحوير',        icon:'arrowUpTray' },
    { id:'merge',         label:'خطة الدمج',          icon:'workflows' },
    { id:'assessment',    label:'تقييم الموقع',       icon:'mapPin' },
  ];

  // ────────────────────────────────────────────────────────────────
  // ── العرض الرئيسي ───────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-right" dir="rtl" id="report-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          html, body { background-color: white !important; color: black !important; margin: 0; padding: 0; }
          .no-print, aside { display: none !important; }
          #report-container { background-color: white !important; color: black !important; padding: 0; width: 100%; direction: rtl; }
          #report-container * { background-color: transparent !important; color: black !important; box-shadow: none !important; border-color: #eee !important; }
          .bg-gradient-to-r, .bg-gradient-to-l { background: white !important; border-bottom: 3px solid #c0392b !important; border-radius: 0 !important; }
          .text-brand-red { color: #c0392b !important; }
          .text-brand-yellow, .text-brand-gold { color: #b08d20 !important; }
          .text-green-400, .text-green-500 { color: #1e7e34 !important; }
          .text-gray-300, .text-gray-400 { color: #555 !important; }
          #report-container .bg-\\[\\#141f2e\\], #report-container .bg-white\\/5 { background-color: #fafafa !important; border: 1px solid #ccc !important; break-inside: avoid; }
          table { border: 1px solid #444 !important; width: 100%; }
          th { background-color: #f0f0f0 !important; border: 1px solid #444 !important; font-weight: bold; padding: 8px; }
          td { border: 1px solid #eee !important; padding: 6px; }
          .print-section-break { break-before: page !important; padding-top: 30px; border-top: 1px solid #eee; }
          h2, h3, h4, h5 { color: #000 !important; border-right: 4px solid #c0392b !important; padding-right: 12px; }
          #report-container svg { background-color: #fff !important; border: 1px solid #eee !important; }
          #report-container svg text { fill: black !important; font-weight: 700; }
        }
        .animate-fade-in { animation: fadeInUp 0.35s ease forwards; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
      `}} />

      {/* ── الرأس ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-l from-brand-navy to-[#1a2840] rounded-2xl p-8 border border-white/10 shadow-2xl print-content">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="px-3 py-1 bg-brand-red/20 text-brand-red text-xs font-bold rounded-full border border-brand-red/30">مقترح فني هندسي</span>
              <span className="px-3 py-1 bg-green-500/15 text-green-400 text-xs font-bold rounded-full border border-green-500/25">Class A Target</span>
              <span className="px-3 py-1 bg-brand-yellow/15 text-brand-yellow text-xs font-bold rounded-full border border-brand-yellow/25">خطتا تحوير ودمج</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">الخرائط الفنية ومقترح التطوير</h2>
            <p className="text-gray-300 text-sm max-w-2xl leading-relaxed">
              تطوير مستودعات موقع 155 (بوهادي، بنغازي) — تحويل المساحات الحالية إلى مستودعات Class A بمعايير دولية مع دراسة شاملة لخطتي التحوير والدمج.
            </p>
            <div className="mt-3 text-[11px] text-gray-400">
              إعداد: <span className="text-brand-yellow font-bold">محمد البرشي — رمزي باش</span>
              <span className="mx-2 text-white/20">|</span>
              إدارة المستودعات
              <span className="mx-2 text-white/20">|</span>
              <span className="text-brand-yellow">⚓ {siteInfo.nearestPort}</span>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="px-6 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-brand-red/20 shrink-0 no-print"
          >
            <Icon name="printer" size={18} /> طباعة التقرير
          </button>
        </div>

        {/* شريط معلومات الموقع */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8 pt-6 border-t border-white/10">
          {[
            { l:'كود الموقع',       v: siteInfo.id },
            { l:'الموقع',           v: siteInfo.location },
            { l:'المساحة الكلية',   v: siteInfo.totalSiteArea },
            { l:'المساحة المغطاة',  v: siteInfo.coveredArea },
            { l:'الارتفاع الحالي',  v: siteInfo.currentHeight },
            { l:'الاستهداف',        v: siteInfo.classification },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-gray-400 text-[10px] uppercase mb-1">{item.l}</div>
              <div className="text-white font-bold text-sm">{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── التخطيط ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* المحتوى الرئيسي */}
        <div className="lg:col-span-3 space-y-6">
          {/* التبويبات */}
          <div className="flex flex-wrap gap-1 border-b border-white/10 pb-0 no-print">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-t-lg font-bold transition-all flex items-center gap-2 text-sm ${
                  activeTab === tab.id
                    ? 'bg-[#1a2840] text-brand-yellow border-t border-x border-white/10 -mb-px'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon name={tab.icon} size={16} />
                {tab.label}
                {(tab.id === 'modification' || tab.id === 'merge') && (
                  <span className="px-1.5 py-0.5 bg-brand-red/30 text-brand-red text-[8px] font-black rounded-full">جديد</span>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {renderPrintSummary()}
            <div className={activeTab === 'floorplan'    ? 'block' : 'hidden print:block'}>{renderFloorPlan()}</div>
            <div className={activeTab === 'flow'         ? 'block' : 'hidden print:block print-section-break'}>{renderLogisticsFlow()}</div>
            <div className={activeTab === 'elevation'    ? 'block' : 'hidden print:block print-section-break'}>{renderElevation()}</div>
            <div className={activeTab === 'standards'    ? 'block' : 'hidden print:block print-section-break'}>{renderStandards()}</div>
            <div className={activeTab === 'proposal'     ? 'block' : 'hidden print:block print-section-break'}>{renderProposal()}</div>
            <div className={activeTab === 'modification' ? 'block' : 'hidden print:block print-section-break'}>{renderModificationPlan()}</div>
            <div className={activeTab === 'merge'        ? 'block' : 'hidden print:block print-section-break'}>{renderMergePlan()}</div>
            <div className={activeTab === 'assessment'   ? 'block' : 'hidden print:block print-section-break'}>{renderSiteAssessment()}</div>
          </div>
        </div>

        {/* ── الشريط الجانبي ──────────────────────────────────────── */}
        <aside className="space-y-5 no-print">
          {/* مراجعة الامتثال */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="clipboardList" size={16} className="text-brand-yellow" /> مراجعة الامتثال
            </h4>
            <div className="space-y-3">
              {[
                { label:'ارتفاع Class A ≥ 12م',  ok: dimensions.clearHeight >= 12,             val:`${dimensions.clearHeight}م` },
                { label:'ESFR رشاشات مطلوبة',     ok: dimensions.clearHeight >= 10,             val: dimensions.clearHeight >= 10 ? 'نعم' : 'اختياري' },
                { label:'أرضية إيبوكسي FF50',     ok: dimensions.flooring.includes('إيبوكسي'), val:'مطابق' },
                { label:'سعة > 15,000 طبلية',     ok: stats.estPallets > 15000,                val: stats.estPallets.toLocaleString() },
                { label:'مستويات الرفوف ≥ 5',     ok: stats.rackLevels >= 5,                   val:`${stats.rackLevels} مستويات` },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-300">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold text-[10px]">{item.val}</span>
                    <span className={`text-base ${item.ok ? 'text-green-500' : 'text-brand-red'}`}>{item.ok ? '✓' : '✗'}</span>
                  </div>
                </div>
              ))}
            </div>
            {dimensions.clearHeight < 12 && (
              <div className="mt-3 p-2 bg-brand-red/10 border border-brand-red/20 rounded text-[10px] text-brand-red">
                ⚠️ الارتفاع الحالي أقل من معيار Class A (12م) لـ E-5
              </div>
            )}
          </div>

          {/* لوحة التحكم الفني */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="grid" size={16} className="text-brand-yellow" /> لوحة التحكم الفني
            </h4>
            <div className="space-y-4">
              {[
                { label:'طول المستودع (م)',   field:'length' },
                { label:'عرض المستودع (م)',   field:'width' },
                { label:'الارتفاع الصافي (م)',field:'clearHeight' },
              ].map((f) => (
                <div key={f.field} className="space-y-1">
                  <label className="text-xs text-gray-300">{f.label}</label>
                  <input
                    type="number"
                    value={dimensions[f.field]}
                    onChange={e => setDimensions({ ...dimensions, [f.field]: +e.target.value })}
                    className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none transition-all"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs text-gray-300">نوع الأرضية</label>
                <select value={dimensions.flooring} onChange={e => setDimensions({ ...dimensions, flooring: e.target.value })} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>إيبوكسي FF50</option>
                  <option>خرسانة صناعية</option>
                  <option>بلاط مقاوم للأحمال</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-300">آلية التخزين</label>
                <select value={dimensions.rackingSystem} onChange={e => setDimensions({ ...dimensions, rackingSystem: e.target.value })} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>Selective Pallet Racking</option>
                  <option>Drive-In Racking</option>
                  <option>VNA System</option>
                </select>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
              {[
                { l:'مستويات الرفوف',   v:`${stats.rackLevels} مستويات`,           c:'text-brand-yellow' },
                { l:'السعة التقديرية',  v:`${stats.estPallets.toLocaleString()} طبلية`, c:'text-brand-yellow' },
                { l:'نوع الرافعة',      v: stats.forkliftType,                      c:'text-green-400' },
                { l:'الاستغلال المتوقع',v:`${stats.utilization}%`,                  c: stats.utilization > 80 ? 'text-green-400' : 'text-brand-yellow' },
              ].map((r, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">{r.l}</span>
                  <span className={`font-bold ${r.c}`}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* معلومات الموقع */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2">
              <Icon name="mapPin" size={16} className="text-brand-red" /> معلومات الموقع
            </h4>
            <div className="space-y-3">
              {[
                { label:'كود الموقع',      val: siteInfo.id },
                { label:'الموقع',          val: siteInfo.location },
                { label:'المساحة الكلية',  val: siteInfo.totalSiteArea },
                { label:'المساحة المغطاة', val: siteInfo.coveredArea },
                { label:'المقاول المنفذ',  val: siteInfo.contractor, small:true },
                { label:'الارتفاع الحالي', val: siteInfo.currentHeight },
                { label:'أقرب ميناء',      val: siteInfo.nearestPort },
                { label:'إعداد',           val: siteInfo.preparedBy, small:true },
              ].map((item, i) => (
                <div key={i} className="flex flex-col border-b border-white/5 pb-2">
                  <span className="text-[10px] text-gray-400 uppercase">{item.label}</span>
                  <span className={`text-white font-medium ${item.small ? 'text-[11px]' : 'text-sm'}`}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ملخص الخطتين */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 border-b border-white/10 pb-3 text-sm">ملخص الخطتين</h4>
            <div className="space-y-3">
              <div
                onClick={() => setActiveTab('modification')}
                className="p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-all border border-brand-yellow/20 bg-brand-yellow/5"
              >
                <div className="text-brand-yellow font-bold text-xs mb-1">خطة التحوير</div>
                <div className="text-[10px] text-gray-400">10 وحدات • ترقية داخلية • ~14 أسبوع</div>
                <div className="text-[10px] text-green-400 mt-1">↑ +80% طبليات</div>
              </div>
              <div
                onClick={() => setActiveTab('merge')}
                className="p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-all border border-purple-500/20 bg-purple-500/5"
              >
                <div className="text-purple-400 font-bold text-xs mb-1">خطة الدمج</div>
                <div className="text-[10px] text-gray-400">4 مجمعات • إعادة هيكلة • ~28 أسبوع</div>
                <div className="text-[10px] text-green-400 mt-1">↑ +75% طبليات +60% كفاءة</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WarehouseMaps;
