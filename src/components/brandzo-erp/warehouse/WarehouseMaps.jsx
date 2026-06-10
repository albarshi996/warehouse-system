import React, { useState, useMemo } from 'react';
import Icon from '../../ui/Icon.jsx';

const WarehouseMaps = () => {
  const [activeTab, setActiveTab] = useState('floorplan');
  const [selectedZone, setSelectedZone] = useState(null);
  const [activeFlowStep, setActiveFlowStep] = useState(null);
  const [dimensions, setDimensions] = useState({
    length: 300,
    width: 200,
    clearHeight: 12,
    flooring: 'إيبوكسي FF50',
    rackingSystem: 'Selective Pallet Racking',
    sprinklerClearance: 0.5,
  });

  const siteInfo = {
    id: 'موقع رقم 155',
    location: 'بوهادي – بنغازي',
    totalSiteArea: '65,000 م²',
    contractor: 'شركة عبر العالم للمقاولات والاستثمار العقاري',
    coveredArea: '18,500 م²',
    currentHeight: '6.80 م',
    classification: 'Class A (مستهدف)',
    zoneCount: 10,
  };

  const warehouses = [
    { id: 'E-1',  name: 'استلام + بفر',      area: 2200, dims: '20 × 110 م', function: 'Receiving + Inbound Buffer',              height: 7.5,  color: '#27ae60', standard: 'GS1 Distribution / ISO 9001',  flowRole: 'input',   capacity: 180,  palletCapacity: 420 },
    { id: 'E-2',  name: 'تخزين جاف',          area: 1000, dims: '20 × 50 م',  function: 'Dry Storage',                             height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 280,  palletCapacity: 860 },
    { id: 'E-3',  name: 'تخزين جاف',          area: 1000, dims: '20 × 50 م',  function: 'Dry Storage',                             height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 280,  palletCapacity: 860 },
    { id: 'E-4',  name: 'تخزين + QC',         area: 1000, dims: '20 × 50 م',  function: 'Storage + Quality Control',               height: 7.5,  color: '#8e44ad', standard: 'ISO 9001:2015',               flowRole: 'qc',      capacity: 160,  palletCapacity: 310 },
    { id: 'E-5',  name: 'High-Bay الرئيسي',   area: 3500, dims: '35 × 100 م', function: 'Selective Pallet Racking (High-Bay)',      height: 12.0, color: '#1abc9c', standard: 'NFPA 13 / EN 15620',          flowRole: 'storage', capacity: 1200, palletCapacity: 4200, highPriority: true },
    { id: 'E-6',  name: 'تخزين + خروج',       area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Staging',              height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'staging', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-7',  name: 'تخزين جاف',          area: 2200, dims: '20 × 110 م', function: 'Dry Storage',                             height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-8',  name: 'تخزين جاف',          area: 2200, dims: '20 × 110 م', function: 'Dry Storage',                             height: 9.5,  color: '#2980b9', standard: 'EN 15620',                    flowRole: 'storage', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-9',  name: 'تخزين + بفر',        area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Buffer',               height: 9.5,  color: '#2980b9', standard: 'GS1 Distribution',            flowRole: 'staging', capacity: 420,  palletCapacity: 1280 },
    { id: 'E-10', name: 'شحن / Cross-Dock',   area: 1000, dims: '20 × 50 م',  function: 'Outbound Shipping + Cross-Dock',          height: 7.5,  color: '#e67e22', standard: 'ANSI MH30.1',                 flowRole: 'output',  capacity: 180,  palletCapacity: 380 },
  ];

  const logisticsFlow = [
    {
      step: 1,
      title: 'وصول الشاحنة',
      subtitle: 'Truck Arrival',
      zone: 'بوابة الدخول',
      color: '#27ae60',
      icon: '🚛',
      details: [
        'تسجيل رقم الشاحنة والمستندات الجمركية',
        'فحص درجة الحرارة وحالة الحمولة',
        'تخصيص رصيف تحميل عبر نظام WMS',
        'إصدار تصريح دخول رقمي للسائق',
      ],
      standard: 'ANSI MH30.1',
      kpi: 'زمن الانتظار: ≤ 15 دقيقة',
      equipment: 'بوابة RFID + كاميرات ANPR',
    },
    {
      step: 2,
      title: 'الاستلام والتفريغ',
      subtitle: 'Receiving & Unloading',
      zone: 'E-1 — استلام + بفر',
      color: '#27ae60',
      icon: '📦',
      details: [
        'استخدام رافعات شوكية Counterbalance 3.0م ممر',
        'فحص كمي وكيفي لكل طبلية مستلمة',
        'مسح باركود GS1-128 لكل وحدة',
        'إدخال فوري لبيانات الاستلام في Odoo WMS',
      ],
      standard: 'GS1 Distribution / ISO 9001',
      kpi: 'معدل تفريغ: 30 طبلية/ساعة',
      equipment: 'Dock Leveler هيدروليكي + ماسح GS1',
    },
    {
      step: 3,
      title: 'مراقبة الجودة',
      subtitle: 'Quality Control (QC)',
      zone: 'E-4 — تخزين + QC',
      color: '#8e44ad',
      icon: '🔍',
      details: [
        'فحص عينة عشوائية ≥ 10% من كل شحنة',
        'توثيق نتائج الفحص في نظام ISO 9001',
        'عزل البضاعة المعيبة في منطقة مخصصة',
        'إصدار شهادة مطابقة لكل دفعة معتمدة',
      ],
      standard: 'ISO 9001:2015',
      kpi: 'زمن الفحص: ≤ 2 ساعة',
      equipment: 'طاولات فحص + ميزان دقيق + كاميرات',
    },
    {
      step: 4,
      title: 'التخزين الرئيسي',
      subtitle: 'Main Storage',
      zone: 'E-5 High-Bay + E-2 إلى E-9',
      color: '#1abc9c',
      icon: '🏗️',
      details: [
        'تخصيص موقع تلقائي عبر WMS (Slot Allocation)',
        'رفوف انتقائية 6 مستويات في E-5 (12م ارتفاع)',
        'استخدام Reach Truck في الممرات الضيقة 1.8م',
        'تتبع موقع كل طبلية بالباركود لحظياً',
      ],
      standard: 'EN 15620 / NFPA 13',
      kpi: 'دقة المواقع: ≥ 99.5%',
      equipment: 'Reach Truck + VNA + شاحن باركود يدوي',
    },
    {
      step: 5,
      title: 'تجميع الطلبات',
      subtitle: 'Order Picking',
      zone: 'E-6 تخزين + خروج',
      color: '#3498db',
      icon: '📋',
      details: [
        'استقبال أوامر الالتقاط من نظام Odoo ERP',
        'تقنية Pick-to-Light لتسريع عملية التجميع',
        'التحقق من الوزن والكمية قبل التغليف',
        'إعداد قائمة التعبئة (Packing List) تلقائياً',
      ],
      standard: 'GS1 Distribution',
      kpi: 'معدل الالتقاط: 50 طبلية/ساعة',
      equipment: 'عربات تجميع + طابعة ملصقات',
    },
    {
      step: 6,
      title: 'التجهيز والتدريج',
      subtitle: 'Staging & Dispatch',
      zone: 'E-9 — بفر الخروج',
      color: '#e67e22',
      icon: '🗂️',
      details: [
        'تجميع الطلبات حسب الوجهة والمسار',
        'تغليف حراري وتأمين الطبليات بـ Stretch Wrap',
        'طباعة بوليصة الشحن والملصق النهائي',
        'تحضير مستندات الجمارك والتسليم',
      ],
      standard: 'ANSI MH30.1',
      kpi: 'زمن التدريج: ≤ 30 دقيقة/شحنة',
      equipment: 'آلة تغليف حراري + طابعة A4',
    },
    {
      step: 7,
      title: 'الشحن والتسليم',
      subtitle: 'Outbound Shipping',
      zone: 'E-10 — شحن / Cross-Dock',
      color: '#e67e22',
      icon: '🚚',
      details: [
        'تحميل الشاحنات عبر Dock Leveler هيدروليكي',
        'مسح نهائي للباركود وتأكيد الشحنة في WMS',
        'إرسال إشعار تلقائي للعميل عبر Odoo',
        'تتبع الشحنة GPS حتى الوصول للعميل',
      ],
      standard: 'GS1 Distribution / ANSI MH30.1',
      kpi: 'دقة الشحن: ≥ 99.9%',
      equipment: 'Dock Leveler + Dock Shelter + Safety Lights',
    },
  ];

  const standards = [
    { name: 'ارتفاع منصة التحميل (الدوك)',       ref: 'OSHA 29 CFR 1910.178',    req: '1.20 م ± 50 ملم',                                   priority: 'Critical', status: 'Compliant',        zone: 'E-1 / E-10' },
    { name: 'مستوي الرصيف (لكل باب تحميل)',      ref: 'ANSI MH30.1',             req: 'Dock Leveler مطلوب عند كل باب تحميل',               priority: 'Critical', status: 'Upgrade Required', zone: 'E-1 / E-10' },
    { name: 'حمولة الأرضية',                      ref: 'EN 15620 / ACI 360',      req: '≥ 5.0 طن/م² (High-Bay E-5: ≥ 7.5 طن/م²)',           priority: 'High',     status: 'Compliant',        zone: 'جميع الوحدات' },
    { name: 'استواء الأرضية (Flatness)',          ref: 'TR 34 (Concrete Society)', req: 'إيبوكسي صناعي FF50 / FL30 — تشطيب ذاتي التسوية',   priority: 'High',     status: 'Upgrade Required', zone: 'E-5 / E-6 / E-7' },
    { name: 'آلية المرشات (High-Bay)',            ref: 'NFPA 13 (2022)',           req: 'ESFR نوع K-25، ضغط ≥ 50 psi، تغطية كاملة',         priority: 'Critical', status: 'Upgrade Required', zone: 'E-5' },
    { name: 'الإضاءة — مناطق التخزين',           ref: 'EN 12464-1',              req: '≥ 200 لوكس؛ استلام/جودة ≥ 400 لوكس؛ مكاتب ≥ 500',   priority: 'Medium',   status: 'Compliant',        zone: 'جميع الوحدات' },
    { name: 'منطقة البفر — استلام',              ref: 'GS1 Distribution',        req: '≥ 15% من مساحة الاستلام (≥ 330 م²)',                 priority: 'High',     status: 'Compliant',        zone: 'E-1' },
    { name: 'رصيف مراقبة الجودة (QC Dock)',      ref: 'ISO 9001:2015',           req: 'منطقة مخصصة ≥ 5% من الاستلام، مجاورة لـ E-1',       priority: 'High',     status: 'Compliant',        zone: 'E-4' },
    { name: 'ممر رافعة Counterbalance',          ref: 'FEM 9.831',               req: '≥ 3.0 م عرض صافي',                                  priority: 'Medium',   status: 'Compliant',        zone: 'E-1 / E-10' },
    { name: 'ممر رافعة Reach Truck',             ref: 'FEM 9.831',               req: '≥ 1.8 م (ممرات ضيقة داخل الرفوف)',                  priority: 'Medium',   status: 'Compliant',        zone: 'E-2 إلى E-9' },
    { name: 'أبواب رصيف التحميل (Roll Door)',    ref: 'EN 12604',                req: '≥ 2.75 م عرض × ≥ 3.5 م ارتفاع — سرعة ≥ 1م/ثانية',  priority: 'High',     status: 'Compliant',        zone: 'E-1 / E-10' },
    { name: 'تأريض كهربائي للرفوف (Grounding)',  ref: 'IEC 60364-7',             req: 'كل وحدة هيكلية مؤرضة مع بار تأريض مركزي',          priority: 'High',     status: 'Upgrade Required', zone: 'E-5 / E-2 إلى E-9' },
  ];

  const proposalCards = [
    { title: 'ترقية ارتفاع السقف',     subtitle: 'Ceiling Height Upgrade',        icon: 'arrowUpTray', priority: 'High',     cost: '850,000 د.ل', duration: '6 أسابيع', details: ['رفع سقف E-5 إلى 12 متر بدعم إنشائي', 'رفع مستودعات E-2 إلى E-9 لـ 9.5 متر', 'تقوية الأعمدة الرئيسية بأقواس فولاذية', 'إعادة تشطيب الجدران والسقف بطلاء صناعي'] },
    { title: 'إنشاء منصات الدوك',      subtitle: 'Dock Platform Construction',    icon: 'truck',       priority: 'Critical', cost: '1,200,000 د.ل', duration: '8 أسابيع', details: ['بناء 12 منصة بارتفاع 1.20 متر', 'تركيب Dock Levelers هيدروليكية (6 طن)', 'Dock Shelters عازلة حرارياً وصوتياً', 'Safety Light Systems (أحمر/أخضر) لكل رصيف'] },
    { title: 'هيكل الرفوف الانتقائي',  subtitle: 'Selective Pallet Racking',     icon: 'grid',        priority: 'High',     cost: '2,400,000 د.ل', duration: '10 أسابيع', details: ['أعمدة فولاذية زرقاء مجلفنة 6 مستويات', 'عوارض برتقالية 3.6م × حمولة 5 طن/مستوى', 'Column Guards عند كل قاعدة عمود', 'Rack Protectors في ممرات الرافعات'] },
    { title: 'تصميم التدفق والبفر',    subtitle: 'Buffer Zone & Flow Design',     icon: 'workflows',   priority: 'Medium',   cost: '320,000 د.ل', duration: '4 أسابيع', details: ['بفر استلام 330 م² بخطوط تنظيم الحركة', 'بفر شحن 280 م² في E-9', 'مسارات رافعات مرسومة على الأرضية', 'علامات اتجاهية وإرشادية معتمدة OSHA'] },
    { title: 'أنظمة السلامة والحماية', subtitle: 'Safety & Fire Protection',      icon: 'clipboardList', priority: 'Critical', cost: '1,800,000 د.ل', duration: '12 أسابيع', details: ['رشاشات ESFR K-25 تغطية كاملة 18,500 م²', 'خزانات مياه احتياطية 500 م³', 'إنذار حريق ذكي متعدد المستشعرات', 'إضاءة طوارئ UPS + لوحات إخلاء'] },
    { title: 'التحول الرقمي — WMS',   subtitle: 'WMS Integration (Odoo ERP)',    icon: 'package',     priority: 'Medium',   cost: '680,000 د.ل', duration: '16 أسابيع', details: ['تكامل كامل Odoo WMS + Inventory', 'شبكة WiFi صناعية (IEEE 802.11ac) كاملة التغطية', 'ماسحات باركود GS1-128 في كل منطقة', 'تتبع حركة المخزون لحظياً + تقارير تلقائية'] },
  ];

  const stats = useMemo(() => {
    const totalArea = 18500;
    const rackLevels = Math.floor((dimensions.clearHeight - 1.5) / 1.8);
    const estPallets = Math.floor(totalArea * 0.7 * rackLevels / 1.2);
    const forkliftType = dimensions.clearHeight > 10 ? 'VNA / رافعة High-Bay' : 'رافعة Reach قياسية';
    const utilization = Math.min(95, Math.round((rackLevels / 6) * 82));
    return { totalArea, rackLevels, estPallets, forkliftType, utilization };
  }, [dimensions]);

  const assessmentCriteria = [
    { name: 'الموقع الجغرافي (Location Accessibility)', score: 9, weight: 20, notes: 'قريب من ميناء بنغازي وطريق رئيسي — ميزة لوجستية عالية' },
    { name: 'طرق الوصول والمناورة (Access & Maneuvering)', score: 8, weight: 15, notes: 'ساحة خارجية تسمح بمناورة المقطورات الطويلة 22م' },
    { name: 'الارتفاع الصافي (Clear Height)', score: 7, weight: 25, notes: 'الارتفاع الحالي 6.80م — يتطلب ترقية لـ Class A' },
    { name: 'حمولة الأرضية (Floor Load Capacity)', score: 8, weight: 20, notes: 'الخرسانة الحالية تتحمل 5 طن/م² — كافية مع التشطيب' },
    { name: 'أنظمة السلامة (Fire & Safety)', score: 6, weight: 20, notes: 'تحتاج ترقية شاملة للمرشات إلى ESFR K-25' },
  ];

  const totalWeightedScore = useMemo(() => {
    return assessmentCriteria.reduce((acc, c) => acc + (c.score * c.weight) / 10, 0) / 10;
  }, []);

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

  const getWarehouseColor = (id) => {
    const wh = warehouses.find(w => w.id === id);
    return wh ? wh.color : '#444';
  };

  // ─── Render: Floor Plan ───────────────────────────────────────────────────
  const renderFloorPlan = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المساحة',   value: `${stats.totalArea.toLocaleString()} م²`, icon: 'grid',          color: 'text-brand-yellow' },
          { label: 'عدد الوحدات',      value: '10 وحدات',                               icon: 'package',       color: 'text-brand-red' },
          { label: 'سعة الطبليات',     value: stats.estPallets.toLocaleString(),         icon: 'clipboardList', color: 'text-green-400' },
          { label: 'نوع الرافعة',      value: stats.forkliftType,                        icon: 'truck',         color: 'text-blue-400' },
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
              { color: '#27ae60', label: 'استلام' },
              { color: '#1abc9c', label: 'High-Bay' },
              { color: '#2980b9', label: 'تخزين' },
              { color: '#e67e22', label: 'شحن' },
              { color: '#8e44ad', label: 'QC' },
              { color: '#f1c40f', label: 'أرصفة' },
            ].map((l, i) => (
              <span key={i} className="flex items-center gap-1 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }}></span>
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 380 165" className="w-full" style={{ minHeight: 220 }}>
            {/* Grid lines */}
            {[40, 80, 120, 160, 200, 240, 280, 320, 360].map(x => (
              <line key={x} x1={x} y1="0" x2={x} y2="165" stroke="#ffffff08" strokeWidth="0.5" />
            ))}
            {[40, 80, 120].map(y => (
              <line key={y} x1="0" y1={y} x2="380" y2={y} stroke="#ffffff08" strokeWidth="0.5" />
            ))}

            {/* Dock area (right side) */}
            <rect x="318" y="10" width="12" height="74" fill="#f1c40f" fillOpacity="0.12" rx="1" />
            <rect x="318" y="10" width="2"  height="74" fill="#f1c40f" fillOpacity="0.7" />
            <text x="331" y="50" fill="#f1c40f" fontSize="4.5" transform="rotate(90,331,50)" textAnchor="middle" opacity="0.8">أرصفة التحميل</text>

            {/* Flow arrow: Receiving ➜ E-5 */}
            <path d="M 205 23 L 125 23" stroke="#27ae60" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrowGreen)" opacity="0.6" />
            {/* Flow arrow: E-5 ➜ E-6 */}
            <path d="M 62 50 L 62 56" stroke="#1abc9c" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrowTeal)" opacity="0.6" />
            {/* Flow arrow: E-6 ➜ E-9 */}
            <path d="M 62 76 L 62 80" stroke="#2980b9" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrowBlue)" opacity="0.5" />
            {/* Flow arrow: E-9 ➜ E-10 */}
            <path d="M 120 138 L 261 77" stroke="#e67e22" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrowOrange)" opacity="0.5" />

            <defs>
              <marker id="arrowGreen"  markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0 0, 5 2.5, 0 5" fill="#27ae60" /></marker>
              <marker id="arrowTeal"   markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0 0, 5 2.5, 0 5" fill="#1abc9c" /></marker>
              <marker id="arrowBlue"   markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0 0, 5 2.5, 0 5" fill="#2980b9" /></marker>
              <marker id="arrowOrange" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0 0, 5 2.5, 0 5" fill="#e67e22" /></marker>
            </defs>

            {/* Warehouse rects */}
            {layout.map(rect => {
              const wh = warehouses.find(w => w.id === rect.id);
              const isSelected = selectedZone?.id === rect.id;
              const col = getWarehouseColor(rect.id);
              return (
                <g key={rect.id}
                   className="cursor-pointer"
                   onClick={() => setSelectedZone(isSelected ? null : wh)}
                   onMouseEnter={() => setSelectedZone(wh)}>
                  <rect
                    x={rect.x} y={rect.y} width={rect.w} height={rect.h}
                    fill={col} fillOpacity={isSelected ? 0.45 : 0.18}
                    stroke={col} strokeWidth={isSelected ? 2 : 0.8}
                    rx="2"
                  />
                  {/* Racking rows for storage units */}
                  {!['E-1','E-10','E-4'].includes(rect.id) && (
                    <g opacity="0.25">
                      {[...Array(Math.floor(rect.h / 6))].map((_, i) => (
                        <line key={i} x1={rect.x+4} y1={rect.y+5+i*6} x2={rect.x+rect.w-4} y2={rect.y+5+i*6} stroke="#e67e22" strokeWidth="0.6" />
                      ))}
                    </g>
                  )}
                  <text x={rect.x + rect.w/2} y={rect.y + rect.h/2 - 1} textAnchor="middle" fill="white" fontSize="4.5" fontWeight="bold" className="pointer-events-none">{rect.id}</text>
                  <text x={rect.x + rect.w/2} y={rect.y + rect.h/2 + 5} textAnchor="middle" fill="white" fontSize="3" opacity="0.7" className="pointer-events-none">
                    {wh?.area.toLocaleString()}م²
                  </text>
                  {wh?.highPriority && (
                    <text x={rect.x + rect.w/2} y={rect.y + 6} textAnchor="middle" fill="#f1c40f" fontSize="3.5" fontWeight="bold" className="pointer-events-none">★ HIGH-BAY</text>
                  )}
                </g>
              );
            })}

            {/* Compass / North arrow */}
            <g transform="translate(356, 150)">
              <circle cx="0" cy="0" r="7" fill="#ffffff10" stroke="#ffffff20" strokeWidth="0.5" />
              <text x="0" y="-2" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">N</text>
              <line x1="0" y1="2" x2="0" y2="5" stroke="white" strokeWidth="0.8" />
            </g>

            <text x="10" y="162" fill="#ffffff30" fontSize="3.5">موقع رقم 155 — بوهادي، بنغازي — مخطط توزيع الوحدات (المقياس تقريبي)</text>
          </svg>
        </div>

        {/* Selected zone panel */}
        {selectedZone && (
          <div className="mt-5 p-5 bg-[#141f2e] border rounded-xl animate-fade-in" style={{ borderColor: selectedZone.color + '55' }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h5 className="font-bold text-lg mb-0.5" style={{ color: selectedZone.color }}>{selectedZone.id}: {selectedZone.name}</h5>
                <p className="text-sm text-white/80">{selectedZone.function}</p>
              </div>
              <button onClick={() => setSelectedZone(null)} className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-white/5 rounded">✕ إغلاق</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {[
                { l: 'الأبعاد',        v: selectedZone.dims },
                { l: 'المساحة',        v: `${selectedZone.area.toLocaleString()} م²` },
                { l: 'الارتفاع المطلوب', v: `${selectedZone.height} م` },
                { l: 'سعة الطبليات',   v: `${selectedZone.palletCapacity.toLocaleString()} طبلية` },
              ].map((item, i) => (
                <div key={i}>
                  <div className="text-gray-400 text-[10px]">{item.l}</div>
                  <div className="text-white font-bold">{item.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/5">
              <span className="text-[10px] text-gray-400">المعيار الدولي: </span>
              <span className="text-[10px] text-brand-yellow font-bold">{selectedZone.standard}</span>
            </div>
          </div>
        )}
      </div>

      {/* Zones Table */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-4 flex items-center gap-2">
          <Icon name="grid" size={18} className="text-brand-yellow" />
          بيان الوحدات التفصيلي
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                {['الوحدة','الاسم','المساحة','الأبعاد','الارتفاع','سعة الطبليات','المعيار'].map((h, i) => (
                  <th key={i} className="text-right text-gray-400 font-bold pb-3 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {warehouses.map(wh => (
                <tr key={wh.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedZone(wh)}>
                  <td className="py-3 pr-3">
                    <span className="px-2 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: wh.color + '55', border: `1px solid ${wh.color}44` }}>{wh.id}</span>
                  </td>
                  <td className="py-3 pr-3 text-white font-medium">{wh.name}</td>
                  <td className="py-3 pr-3 text-gray-300">{wh.area.toLocaleString()} م²</td>
                  <td className="py-3 pr-3 text-gray-300">{wh.dims}</td>
                  <td className="py-3 pr-3"><span className={`font-bold ${wh.height >= 12 ? 'text-green-400' : wh.height >= 9 ? 'text-brand-yellow' : 'text-gray-300'}`}>{wh.height} م</span></td>
                  <td className="py-3 pr-3 text-white font-bold">{wh.palletCapacity.toLocaleString()}</td>
                  <td className="py-3 pr-3 text-brand-yellow text-[10px]">{wh.standard}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/20">
                <td colSpan={2} className="pt-3 pr-3 text-white font-bold">الإجمالي</td>
                <td className="pt-3 pr-3 text-brand-yellow font-bold">{warehouses.reduce((a, w) => a + w.area, 0).toLocaleString()} م²</td>
                <td colSpan={2}></td>
                <td className="pt-3 pr-3 text-brand-yellow font-bold">{warehouses.reduce((a, w) => a + w.palletCapacity, 0).toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── Render: Logistics Flow ───────────────────────────────────────────────
  const renderLogisticsFlow = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
        <h4 className="font-bold text-white mb-2">رحلة البضاعة — من الدخول إلى الخروج</h4>
        <p className="text-gray-400 text-xs mb-6">دراسة تدفق العمليات اللوجستية الكاملة داخل موقع 155 وفق معايير Class A</p>

        {/* Flow diagram horizontal */}
        <div className="relative overflow-x-auto pb-4">
          <div className="flex items-center gap-0 min-w-max mx-auto">
            {logisticsFlow.map((step, i) => (
              <React.Fragment key={step.step}>
                <button
                  className="flex flex-col items-center gap-2 group cursor-pointer"
                  onClick={() => setActiveFlowStep(activeFlowStep?.step === step.step ? null : step)}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all duration-200 border-2"
                    style={{
                      backgroundColor: activeFlowStep?.step === step.step ? step.color + '40' : step.color + '20',
                      borderColor: activeFlowStep?.step === step.step ? step.color : step.color + '40',
                      boxShadow: activeFlowStep?.step === step.step ? `0 0 16px ${step.color}55` : 'none',
                    }}
                  >
                    {step.icon}
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-bold text-white">{step.title}</div>
                    <div className="text-[9px] text-gray-400">{step.subtitle}</div>
                  </div>
                </button>
                {i < logisticsFlow.length - 1 && (
                  <div className="flex items-center justify-center w-8 shrink-0 mb-6">
                    <div className="w-full h-px bg-gradient-to-r from-gray-600 to-gray-600 relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-gray-400 rotate-45"></div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step detail panel */}
        {activeFlowStep ? (
          <div className="mt-6 p-6 rounded-2xl border animate-fade-in" style={{ backgroundColor: activeFlowStep.color + '15', borderColor: activeFlowStep.color + '40' }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-4">
                <div className="text-4xl">{activeFlowStep.icon}</div>
                <div>
                  <div className="text-xs font-bold mb-1" style={{ color: activeFlowStep.color }}>الخطوة {activeFlowStep.step} من {logisticsFlow.length}</div>
                  <h5 className="text-xl font-bold text-white">{activeFlowStep.title}</h5>
                  <p className="text-sm text-gray-300">{activeFlowStep.zone}</p>
                </div>
              </div>
              <button onClick={() => setActiveFlowStep(null)} className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-white/10 rounded shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-400 font-bold mb-3 uppercase tracking-wider">إجراءات التشغيل</div>
                <div className="space-y-2">
                  {activeFlowStep.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-200">
                      <span className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold text-white mt-0.5" style={{ backgroundColor: activeFlowStep.color }}>
                        {i + 1}
                      </span>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
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
        ) : (
          <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10 text-center text-xs text-gray-400">
            ↑ اضغط على أي خطوة لعرض تفاصيلها الكاملة
          </div>
        )}
      </div>

      {/* Flow summary table */}
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

  // ─── Render: Elevation ────────────────────────────────────────────────────
  const renderElevation = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Current */}
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
              { l: 'عدد المستويات', v: '3 مستويات', bad: true },
              { l: 'السعة التخزينية', v: 'منخفضة (~35%)', bad: true },
              { l: 'نوع الرافعة',    v: 'رافعة قياسية', bad: false },
              { l: 'الإهدار العمودي', v: '45% مساحة ضائعة', bad: true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                <span className="text-gray-400">{r.l}</span>
                <span className={r.bad ? 'text-brand-red font-bold' : 'text-gray-300 font-bold'}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Proposed */}
        <div className="bg-[#141f2e] border rounded-2xl p-6" style={{ borderColor: '#1abc9c44' }}>
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
              {/* Reach truck */}
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
              { l: 'عدد المستويات', v: '6 مستويات (E-5)', good: true },
              { l: 'السعة التخزينية', v: '+140% زيادة',     good: true },
              { l: 'نوع الرافعة',    v: 'Reach Truck / VNA', good: true },
              { l: 'الاستغلال العمودي', v: '95% كفاءة',     good: true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                <span className="text-gray-400">{r.l}</span>
                <span className={r.good ? 'text-green-400 font-bold' : 'text-gray-300 font-bold'}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dock detail */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">تفصيل منصة الشحن والاستلام — Dock Platform Detail</h4>
        <div className="relative w-full rounded-xl overflow-hidden border border-white/5 bg-[#0a1020]">
          <svg viewBox="0 0 420 155" className="w-full" style={{ minHeight: 180 }}>
            <rect x="0" y="130" width="420" height="25" fill="#1a1a2a" />
            <rect x="260" y="90" width="160" height="40" fill="#2c3344" />
            <line x1="260" y1="90" x2="420" y2="90" stroke="white" strokeWidth="0.8" />
            <text x="340" y="114" textAnchor="middle" fill="#aaa" fontSize="7">أرضية المستودع (+1.20 م)</text>
            {/* Dock Leveler */}
            <rect x="248" y="88" width="18" height="2.5" fill="#e67e22" transform="rotate(-6,260,90)" rx="1" />
            {/* Dock Shelter */}
            <rect x="252" y="60" width="8" height="30" fill="#27ae60" fillOpacity="0.5" />
            <rect x="252" y="60" width="8" height="30" fill="none" stroke="#27ae60" strokeWidth="0.5" />
            <text x="256" y="75" textAnchor="middle" fill="#27ae60" fontSize="3.5" transform="rotate(90,256,75)">Dock Shelter</text>
            {/* Truck */}
            <rect x="30" y="60" width="215" height="68" fill="#2980b9" fillOpacity="0.75" rx="3" />
            <rect x="220" y="60" width="25" height="68" fill="#1a1a2e" rx="1" />
            <text x="120" y="98" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">مقطورة شحن ثقيلة — 40 قدم</text>
            <circle cx="70"  cy="130" r="9" fill="#111" />
            <circle cx="70"  cy="130" r="5" fill="#333" />
            <circle cx="190" cy="130" r="9" fill="#111" />
            <circle cx="190" cy="130" r="5" fill="#333" />
            {/* Safety light */}
            <circle cx="270" cy="68" r="4" fill="#c0392b" />
            <text x="270" y="80" textAnchor="middle" fill="#c0392b" fontSize="3.5">STOP</text>
            {/* Dimension line */}
            <line x1="242" y1="130" x2="242" y2="90" stroke="#f1c40f" strokeWidth="0.8" />
            <text x="238" y="112" textAnchor="end" fill="#f1c40f" fontSize="5.5">1.20م</text>
            <defs>
              <marker id="arr" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
                <polygon points="0 0,5 2.5,0 5" fill="#f1c40f" />
              </marker>
            </defs>
          </svg>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          {[
            { title: 'Dock Leveler (هيدروليكي)', desc: 'جسر هيدروليكي 6 طن يربط أرضية المستودع بسرير الشاحنة، يعوّض فروق الارتفاع ±200 ملم تلقائياً.' },
            { title: 'Dock Shelter (عازل حراري)', desc: 'مطاط عازل يحيط بفتحة الشاحنة لمنع دخول الغبار والحرارة وتحسين كفاءة الطاقة بنسبة 40%.' },
            { title: 'Safety Light System',        desc: 'إشارة أحمر/أخضر لتنظيم حركة الشاحنات، تمنع حوادث الدخول المبكر أثناء التحميل.' },
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

  // ─── Render: Standards ────────────────────────────────────────────────────
  const renderStandards = () => {
    const criticalCount  = standards.filter(s => s.priority === 'Critical').length;
    const upgradeCount   = standards.filter(s => s.status === 'Upgrade Required').length;
    const complianceRate = Math.round(((standards.length - upgradeCount) / standards.length) * 100);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: 'عناصر حرجة',      value: criticalCount,       color: 'text-brand-red',    bg: 'bg-brand-red/10',    icon: 'clipboardList' },
            { label: 'تطويرات مطلوبة',  value: upgradeCount,        color: 'text-brand-yellow', bg: 'bg-brand-yellow/10', icon: 'arrowUpTray' },
            { label: 'نسبة الامتثال',   value: `${complianceRate}%`, color: 'text-green-400',    bg: 'bg-green-500/10',    icon: 'clipboardList' },
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

  // ─── Render: Proposal ─────────────────────────────────────────────────────
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
            <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-gray-500">التكلفة التقديرية</div>
                <div className="text-brand-yellow font-bold">{card.cost}</div>
              </div>
              <div>
                <div className="text-gray-500">المدة الزمنية</div>
                <div className="text-white font-bold">{card.duration}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-8 border-b border-white/10 pb-4">الجدول الزمني للتنفيذ — Implementation Gantt Overview</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { phase: 'المرحلة 1', title: 'الهدم والإنشاءات', time: 'أسابيع 1 – 8',  color: '#e74c3c', items: ['رفع أسقف E-5 إلى 12م', 'تقوية الأعمدة الإنشائية', 'صب أرضيات الإيبوكسي FF50'] },
            { phase: 'المرحلة 2', title: 'البنية التحتية',   time: 'أسابيع 6 – 14', color: '#e67e22', items: ['تركيب منصات الدوك 1.20م', 'Dock Levelers هيدروليكية', 'شبكة مياه الإطفاء'] },
            { phase: 'المرحلة 3', title: 'التجهيزات الفنية', time: 'أسابيع 12 – 22', color: '#2980b9', items: ['هيكل رفوف E-5 (6 مستويات)', 'رشاشات ESFR K-25', 'إضاءة LED صناعية'] },
            { phase: 'المرحلة 4', title: 'الرقمنة والتشغيل', time: 'أسابيع 20 – 28', color: '#27ae60', items: ['تكامل Odoo WMS', 'تدريب فرق التشغيل', 'اختبار الأحمال الكاملة'] },
          ].map((step, i) => (
            <div key={i} className="bg-brand-navy/30 border border-white/5 p-5 rounded-xl relative" style={{ borderTopColor: step.color, borderTopWidth: 3 }}>
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
          <span className="text-gray-300">الإجمالي التقديري للمشروع:</span>
          <div className="text-right">
            <span className="text-brand-yellow font-bold text-lg">7,250,000 دينار ليبي</span>
            <div className="text-xs text-gray-400">مدة التنفيذ الكاملة: 28 أسبوعاً (7 أشهر)</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-[#1a2840] to-brand-navy border border-white/10 p-8 rounded-2xl">
          <h4 className="font-bold text-white mb-6">نتائج الأداء المتوقعة — Expected KPIs</h4>
          <div className="space-y-5">
            {[
              { label: 'زيادة السعة التخزينية',        val: '+140%',      icon: 'grid',          color: 'text-green-400' },
              { label: 'تحسن سرعة الاستلام',           val: '+250%',      icon: 'arrowDownTray', color: 'text-blue-400' },
              { label: 'دقة المخزون الرقمي',           val: '99.9%',      icon: 'clipboardList', color: 'text-brand-yellow' },
              { label: 'تخفيض أخطاء الشحن',           val: '-95%',       icon: 'truck',         color: 'text-green-400' },
              { label: 'فترة استرداد الاستثمار (ROI)', val: '18 – 24 شهر', icon: 'package',      color: 'text-brand-yellow' },
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-4">
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
        <div className="bg-brand-red/5 border border-brand-red/20 p-8 rounded-2xl flex flex-col justify-center text-center">
          <div className="w-16 h-16 bg-brand-red/10 rounded-full flex items-center justify-center text-brand-red mx-auto mb-5">
            <Icon name="package" size={32} />
          </div>
          <h4 className="text-lg font-bold text-white mb-3">اعتماد المقترح الفني</h4>
          <p className="text-sm text-gray-300 mb-6 leading-relaxed">هذا المستند مرجع هندسي وفني لعملية التحول، مصمم وفق معايير مستودعات الفئة أ (Class A) الدولية.</p>
          <div className="space-y-3 mb-6 text-xs text-right">
            {[
              { l: 'الإجمالي التقديري',  v: '7,250,000 د.ل' },
              { l: 'المدة الزمنية',       v: '28 أسبوعاً' },
              { l: 'معيار الاستهداف',     v: 'Class A Warehouse' },
            ].map((r, i) => (
              <div key={i} className="flex justify-between items-center bg-white/5 rounded-lg p-2">
                <span className="text-gray-400">{r.l}</span>
                <span className="text-white font-bold">{r.v}</span>
              </div>
            ))}
          </div>
          <button className="w-full py-3.5 bg-brand-red text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-brand-red/20 active:scale-95 text-sm">
            إرسال للمراجعة والاعتماد
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render: Site Assessment ──────────────────────────────────────────────
  const renderSiteAssessment = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-brand-navy rounded-xl flex items-center justify-center text-brand-yellow text-2xl border border-white/5">📍</div>
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
                  <div className={`font-black text-xl ${item.score >= 8 ? 'text-green-400' : item.score >= 6 ? 'text-brand-yellow' : 'text-brand-red'}`}>{item.score}<span className="text-sm text-gray-400">/10</span></div>
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

      {/* Recommendations */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">توصيات التحسين ذات الأولوية</h4>
        <div className="space-y-4">
          {[
            { priority: 'فوري',    color: '#e74c3c', title: 'رفع الارتفاع الصافي إلى 12م (E-5)', detail: 'أعلى أثر على سعة التخزين — ينقل الموقع مباشرة لـ Class A ويُمكّن من 6 مستويات رفوف.' },
            { priority: 'فوري',    color: '#e74c3c', title: 'ترقية منظومة الإطفاء إلى ESFR K-25',  detail: 'شرط إلزامي لـ NFPA 13 في المستودعات العالية — لا يمكن تشغيل E-5 قانونياً بدونه.' },
            { priority: 'قريب',    color: '#e67e22', title: 'إنشاء منصات الدوك ودمج Dock Levelers',  detail: 'يرفع كفاءة التحميل بنسبة 250% ويلغي الأضرار الناتجة عن التحميل الأرضي.' },
            { priority: 'متوسط',   color: '#2980b9', title: 'تطبيق نظام WMS مع Odoo ERP',           detail: 'دقة مخزون 99.9% وإلغاء ورق العمل اليدوي — عائد استثماري خلال 12 شهراً.' },
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

  // ─── Print Summary (hidden in screen, shown in print) ─────────────────────
  const renderPrintSummary = () => (
    <div className="hidden print:block space-y-6 mb-8">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
          <h4 className="font-bold text-white mb-4">معلومات الموقع</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries({ 'كود الموقع': siteInfo.id, 'الموقع': siteInfo.location, 'المساحة الكلية': siteInfo.totalSiteArea, 'المساحة المغطاة': siteInfo.coveredArea, 'المقاول': siteInfo.contractor, 'الارتفاع الحالي': siteInfo.currentHeight }).map(([label, val], i) => (
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
              { label: 'ارتفاع السقف (Class A)', ok: dimensions.clearHeight >= 12, val: `${dimensions.clearHeight}م` },
              { label: 'آلية الرشاشات ESFR',    ok: dimensions.clearHeight >= 10, val: dimensions.clearHeight >= 10 ? 'مطلوب' : 'اختياري' },
              { label: 'أرضية إيبوكسي صناعي',  ok: dimensions.flooring.includes('إيبوكسي'), val: 'مطابق' },
              { label: 'سعة التخزين المستهدفة', ok: stats.estPallets > 15000, val: stats.estPallets.toLocaleString() },
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

  // ─── Tab definitions ──────────────────────────────────────────────────────
  const tabs = [
    { id: 'floorplan',  label: 'المخطط الكابوري',      icon: 'grid' },
    { id: 'flow',       label: 'تدفق العمليات',         icon: 'workflows' },
    { id: 'elevation',  label: 'القطاع الرأسي',         icon: 'arrowUpTray' },
    { id: 'standards',  label: 'المعايير الدولية',      icon: 'clipboardList' },
    { id: 'proposal',   label: 'مقترح التحويل',         icon: 'package' },
    { id: 'assessment', label: 'تقييم الموقع',          icon: 'mapPin' },
  ];

  // ─── Main Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-right" dir="rtl" id="report-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          html, body { background-color: white !important; color: black !important; margin: 0; padding: 0; }
          .no-print, aside { display: none !important; }
          #report-container { background-color: white !important; color: black !important; padding: 0; width: 100%; direction: rtl; }
          #report-container * { background-color: transparent !important; color: black !important; box-shadow: none !important; border-color: #eee !important; }
          .bg-gradient-to-r { background: white !important; border-bottom: 3px solid #c0392b !important; border-radius: 0 !important; }
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
      `}} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-brand-navy to-[#1a2840] rounded-2xl p-8 border border-white/10 shadow-2xl print-content">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="px-3 py-1 bg-brand-red/20 text-brand-red text-xs font-bold rounded-full border border-brand-red/30">مقترح فني هندسي</span>
              <span className="px-3 py-1 bg-green-500/15 text-green-400 text-xs font-bold rounded-full border border-green-500/25">Class A Target</span>
              <h2 className="text-2xl md:text-3xl font-bold text-white">الخرائط الفنية ومقترح التطوير</h2>
            </div>
            <p className="text-gray-300 text-sm max-w-2xl leading-relaxed">
              تصميم وتطوير مستودعات شركة Brandzo — موقع 155 (بوهادي). تحويل المساحات الحالية إلى مستودعات Class A بمعايير دولية مع دراسة كاملة لتدفق العمليات اللوجستية.
            </p>
          </div>
          <button onClick={() => window.print()} className="px-6 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-brand-red/20 shrink-0">
            <Icon name="printer" size={18} /> طباعة التقرير
          </button>
        </div>

        {/* Site info strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8 pt-6 border-t border-white/10">
          {[
            { l: 'كود الموقع',        v: siteInfo.id },
            { l: 'الموقع',            v: siteInfo.location },
            { l: 'المساحة الكلية',    v: siteInfo.totalSiteArea },
            { l: 'المساحة المغطاة',   v: siteInfo.coveredArea },
            { l: 'الارتفاع الحالي',   v: siteInfo.currentHeight },
            { l: 'الاستهداف',         v: siteInfo.classification },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-gray-400 text-[10px] uppercase mb-1">{item.l}</div>
              <div className="text-white font-bold text-sm">{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Layout ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Tabs */}
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
              </button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {renderPrintSummary()}
            <div className={activeTab === 'floorplan'  ? 'block' : 'hidden print:block'}>{renderFloorPlan()}</div>
            <div className={activeTab === 'flow'       ? 'block' : 'hidden print:block print-section-break'}>{renderLogisticsFlow()}</div>
            <div className={activeTab === 'elevation'  ? 'block' : 'hidden print:block print-section-break'}>{renderElevation()}</div>
            <div className={activeTab === 'standards'  ? 'block' : 'hidden print:block print-section-break'}>{renderStandards()}</div>
            <div className={activeTab === 'proposal'   ? 'block' : 'hidden print:block print-section-break'}>{renderProposal()}</div>
            <div className={activeTab === 'assessment' ? 'block' : 'hidden print:block print-section-break'}>{renderSiteAssessment()}</div>
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="space-y-5 no-print">
          {/* Compliance checklist */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="clipboardList" size={16} className="text-brand-yellow" /> مراجعة الامتثال
            </h4>
            <div className="space-y-3">
              {[
                { label: 'ارتفاع Class A ≥ 12م',    ok: dimensions.clearHeight >= 12,                    val: `${dimensions.clearHeight}م` },
                { label: 'ESFR رشاشات مطلوبة',       ok: dimensions.clearHeight >= 10,                    val: dimensions.clearHeight >= 10 ? 'نعم' : 'اختياري' },
                { label: 'أرضية إيبوكسي FF50',       ok: dimensions.flooring.includes('إيبوكسي'),         val: 'مطابق' },
                { label: 'سعة > 15,000 طبلية',       ok: stats.estPallets > 15000,                       val: stats.estPallets.toLocaleString() },
                { label: 'مستويات الرفوف ≥ 5',       ok: stats.rackLevels >= 5,                          val: `${stats.rackLevels} مستويات` },
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

          {/* Technical controls */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="grid" size={16} className="text-brand-yellow" /> لوحة التحكم الفني
            </h4>
            <div className="space-y-4">
              {[
                { label: 'طول المستودع (م)', field: 'length' },
                { label: 'عرض المستودع (م)', field: 'width' },
                { label: 'الارتفاع الصافي (م)', field: 'clearHeight' },
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
                { l: 'مستويات الرفوف',      v: `${stats.rackLevels} مستويات`,           c: 'text-brand-yellow' },
                { l: 'السعة التقديرية',     v: `${stats.estPallets.toLocaleString()} طبلية`, c: 'text-brand-yellow' },
                { l: 'نوع الرافعة',         v: stats.forkliftType,                       c: 'text-green-400' },
                { l: 'الاستغلال المتوقع',   v: `${stats.utilization}%`,                  c: stats.utilization > 80 ? 'text-green-400' : 'text-brand-yellow' },
              ].map((r, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">{r.l}</span>
                  <span className={`font-bold ${r.c}`}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Site info card */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-5 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2">
              <Icon name="package" size={16} className="text-brand-red" /> معلومات الموقع
            </h4>
            <div className="space-y-3">
              {[
                { label: 'كود الموقع',      val: siteInfo.id },
                { label: 'الموقع',          val: siteInfo.location },
                { label: 'المساحة الكلية',  val: siteInfo.totalSiteArea },
                { label: 'المساحة المغطاة', val: siteInfo.coveredArea },
                { label: 'المقاول المنفذ',  val: siteInfo.contractor, small: true },
                { label: 'الارتفاع الحالي', val: siteInfo.currentHeight },
              ].map((item, i) => (
                <div key={i} className="flex flex-col border-b border-white/5 pb-2">
                  <span className="text-[10px] text-gray-400 uppercase">{item.label}</span>
                  <span className={`text-white font-medium ${item.small ? 'text-[11px]' : 'text-sm'}`}>{item.val}</span>
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
