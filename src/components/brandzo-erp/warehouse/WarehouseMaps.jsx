import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../ui/Icon.jsx';

const WarehouseMaps = () => {
  const [activeTab, setActiveTab] = useState('floorplan');
  const [selectedZone, setSelectedZone] = useState(null);
  const [dimensions, setDimensions] = useState({
    length: 300, // Total block length estimate
    width: 200,  // Total block width estimate
    clearHeight: 12,
    flooring: "إيبوكسي FF50",
    rackingSystem: "Selective Pallet Racking",
    sprinklerClearance: 0.5
  });

  const siteInfo = {
    id: "موقع رقم 155",
    location: "بوهادي – بنغازي",
    totalSiteArea: "65,000 م²",
    contractor: "شركة عبر العالم للمقاولات والاستثمار العقاري",
    coveredArea: "18,500 م²",
    currentHeight: "6.80 م"
  };

  const warehouses = [
    { id: 'E-1', name: 'استلام + بفر', area: 2200, dims: '20 × 110 م', function: 'Receiving + Inbound Buffer', height: 7.5, color: '#27ae60', standard: 'GS1 Distribution / ISO 9001' },
    { id: 'E-2', name: 'تخزين جاف', area: 1000, dims: '20 × 50 م', function: 'Dry Storage', height: 9.5, color: '#2980b9', standard: 'EN 15620' },
    { id: 'E-3', name: 'تخزين جاف', area: 1000, dims: '20 × 50 م', function: 'Dry Storage', height: 9.5, color: '#2980b9', standard: 'EN 15620' },
    { id: 'E-4', name: 'تخزين + QC', area: 1000, dims: '20 × 50 م', function: 'Storage + Quality Control', height: 7.5, color: '#8e44ad', standard: 'ISO 9001:2015' },
    { id: 'E-5', name: 'High-Bay الرئيسي', area: 3500, dims: '35 × 100 م', function: 'Selective Pallet Racking (High-Bay)', height: 12.0, color: '#2980b9', standard: 'NFPA 13 / EN 15620', highPriority: true },
    { id: 'E-6', name: 'تخزين + خروج', area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Staging', height: 9.5, color: '#2980b9', standard: 'EN 15620' },
    { id: 'E-7', name: 'تخزين جاف', area: 2200, dims: '20 × 110 م', function: 'Dry Storage', height: 9.5, color: '#2980b9', standard: 'EN 15620' },
    { id: 'E-8', name: 'تخزين جاف', area: 2200, dims: '20 × 110 م', function: 'Dry Storage', height: 9.5, color: '#2980b9', standard: 'EN 15620' },
    { id: 'E-9', name: 'تخزين + بفر', area: 2200, dims: '20 × 110 م', function: 'Storage + Outbound Buffer', height: 9.5, color: '#2980b9', standard: 'GS1 Distribution' },
    { id: 'E-10', name: 'شحن', area: 1000, dims: '20 × 50 م', function: 'Outbound Shipping + Cross-Dock', height: 7.5, color: '#e67e22', standard: 'ANSI MH30.1' },
  ];

  const standards = [
    { name: "ارتفاع منصة التحميل (الدوك)", ref: "OSHA 29 CFR", req: "1.20 م ± 50 ملم", priority: "Critical", status: "Compliant" },
    { name: "مستوي الرصيف (لكل باب)", ref: "ANSI MH30.1", req: "مطلوب عند كل باب تحميل", priority: "Critical", status: "Upgrade Required" },
    { name: "حمولة الأرضية", ref: "EN 15620 / ACI", req: "≥ 5.0 طن/م² (High-Bay: ≥ 7.5 طن/م²)", priority: "High", status: "Compliant" },
    { name: "استواء الأرضية", ref: "TR 34 (Concrete)", req: "تشطيب إيبوكسي صناعي FF50 / FL30", priority: "High", status: "Upgrade Required" },
    { name: "نظام المرشات (الارتفاع العالي)", ref: "NFPA 13", req: "نوع ESFR، بحد أدنى K-25", priority: "Critical", status: "Upgrade Required" },
    { name: "الإضاءة - مناطق التخزين", ref: "EN 12464-1", req: "≥ 200 لوكس؛ الاستلام/الجودة ≥ 400 لوكس", priority: "Medium", status: "Compliant" },
    { name: "منطقة المخزن المؤقت للاستلام", ref: "GS1 Distribution", req: "≥ 15% من مساحة الاستلام", priority: "High", status: "Compliant" },
    { name: "رصيف مراقبة الجودة", ref: "ISO 9001:2015", req: "منطقة مخصصة ≥ 5% بالقرب من الاستلام", priority: "High", status: "Compliant" },
    { name: "ممر الرافعة الشوكية (Counterbalance)", ref: "FEM 9.831", req: "≥ 3.0 م", priority: "Medium", status: "Compliant" },
    { name: "ممر الرافعة الشوكية (Reach Truck)", ref: "FEM 9.831", req: "≥ 1.8 م (ممرات ضيقة)", priority: "Medium", status: "Compliant" },
    { name: "أبواب رصيف التحميل (رول)", ref: "EN 12604", req: "≥ 2.75 م عرض × ≥ 3.5 م ارتفاع", priority: "High", status: "Compliant" },
  ];

  const proposalCards = [
    { title: "ترقية ارتفاع السقف", subtitle: "Ceiling Height Upgrade", icon: "arrowUpTray", priority: "High", details: ["رفع سقف E-5 إلى 12 متر", "رفع سقف مستودعات التخزين إلى 9.5 متر", "دعم إنشائي للأسقف المرفوعة"] },
    { title: "إنشاء منصات الدوك", subtitle: "Dock Platform Construction", icon: "truck", priority: "Critical", details: ["بناء منصات بارتفاع 1.20 متر", "تركيب Dock Levelers هيدروليكية", "تركيب أبواب رول سريعة"] },
    { title: "تركيب نظام الرفوف الانتقائي", subtitle: "Selective Pallet Racking", icon: "grid", priority: "High", details: ["أعمدة فولاذية زرقاء وقوائم برتقالية", "حواجز حماية القواعد (Column Guards)", "سعة حمولة تصل إلى 5 طن لكل مستوى"] },
    { title: "تصميم التدفق والمساحات", subtitle: "Buffer Zone & Flow Design", icon: "workflows", priority: "Medium", details: ["تخصيص مناطق بفر للاستلام والشحن", "مسارات حركة مخصصة للرافعات", "تحسين سعة الاستيعاب اللوجستي"] },
    { title: "أنظمة السلامة والأمان", subtitle: "Safety Systems", icon: "clipboardList", priority: "Critical", details: ["تركيب رشاشات ESFR متطورة", "نظام إنذار حريق ذكي", "إضاءة طوارئ ولوحات إرشادية"] },
    { title: "التحول الرقمي WMS", subtitle: "WMS Integration (Odoo)", icon: "package", priority: "Medium", details: ["ربط كامل مع نظام Odoo ERP", "تتبع الباركود لكل موقع تخزين", "إدارة حركة المخزون لحظياً"] },
  ];

  const stats = useMemo(() => {
    const totalArea = 18500;
    const rackLevels = Math.floor((dimensions.clearHeight - 1.5) / 1.8);
    const estPallets = Math.floor(totalArea * 0.7 * rackLevels / 1.2);
    const forkliftType = dimensions.clearHeight > 10 ? "VNA / رافعة عالية" : "رافعة Reach قياسية";

    return { totalArea, rackLevels, estPallets, forkliftType };
  }, [dimensions]);

  const renderFloorPlan = () => {
    // Proportional layout for Site 155
    // Total block area approx 300x200 for SVG coordinate space
    const layout = [
      { id: 'E-1', x: 200, y: 10, w: 110, h: 20 },
      { id: 'E-2', x: 200, y: 35, w: 50, h: 20 },
      { id: 'E-3', x: 260, y: 35, w: 50, h: 20 },
      { id: 'E-4', x: 200, y: 60, w: 50, h: 20 },
      { id: 'E-10', x: 260, y: 60, w: 50, h: 20 },
      { id: 'E-5', x: 10, y: 10, w: 100, h: 35 },
      { id: 'E-6', x: 10, y: 55, w: 110, h: 20 },
      { id: 'E-7', x: 10, y: 80, w: 110, h: 20 },
      { id: 'E-8', x: 10, y: 105, w: 110, h: 20 },
      { id: 'E-9', x: 10, y: 130, w: 110, h: 20 },
    ];

    const getWarehouseColor = (id) => {
      const wh = warehouses.find(w => w.id === id);
      return wh ? wh.color : '#444';
    };

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <div className="text-gray-300 text-[10px] mb-1">إجمالي المساحة المغطاة</div>
            <div className="text-xl font-bold text-white">18,500 م²</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <div className="text-gray-300 text-[10px] mb-1">عدد المستودعات</div>
            <div className="text-xl font-bold text-brand-yellow">10 وحدات</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <div className="text-gray-300 text-[10px] mb-1">الارتفاع الحالي</div>
            <div className="text-xl font-bold text-brand-red">6.80 م</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <div className="text-gray-300 text-[10px] mb-1">الارتفاع المقترح الأقصى</div>
            <div className="text-xl font-bold text-green-400">12.0 م</div>
          </div>
        </div>

        <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-white">المخطط الكابوري الشامل - موقع 155</h4>
            <div className="flex flex-wrap gap-3 text-[10px] justify-end">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#27ae60]"></span> استلام</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#2980b9]"></span> تخزين</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#e67e22]"></span> شحن</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#8e44ad]"></span> فحص QC</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#f1c40f]"></span> أرصفة</span>
            </div>
          </div>

          <div className="relative aspect-[16/9] w-full bg-brand-navy/20 rounded-xl overflow-hidden border border-white/5">
            <svg viewBox="0 0 380 180" className="w-full h-full p-4">
              {/* Dock Platforms (Yellow area) */}
              <rect x="315" y="10" width="10" height="70" fill="#f1c40f" fillOpacity="0.3" />
              <rect x="315" y="10" width="2" height="70" fill="#f1c40f" />

              {layout.map(rect => {
                const wh = warehouses.find(w => w.id === rect.id);
                const isSelected = selectedZone?.id === rect.id;

                return (
                  <g key={rect.id}
                     className="cursor-pointer transition-all duration-300"
                     onClick={() => setSelectedZone(wh)}
                     onMouseEnter={() => setSelectedZone(wh)}>
                    <rect
                      x={rect.x} y={rect.y} width={rect.w} height={rect.h}
                      fill={getWarehouseColor(rect.id)}
                      fillOpacity={isSelected ? 0.4 : 0.2}
                      stroke={getWarehouseColor(rect.id)}
                      strokeWidth={isSelected ? 2 : 1}
                      className="transition-all"
                    />
                    {/* Racking rows visualization for storage */}
                    {(rect.id !== 'E-1' && rect.id !== 'E-10' && rect.id !== 'E-4') && (
                      <g opacity="0.3">
                        {[...Array(Math.floor(rect.h / 5))].map((_, i) => (
                          <line key={i} x1={rect.x + 5} y1={rect.y + 5 + i*5} x2={rect.x + rect.w - 5} y2={rect.y + 5 + i*5} stroke="orange" strokeWidth="0.5" />
                        ))}
                      </g>
                    )}
                    <text x={rect.x + rect.w/2} y={rect.y + rect.h/2 + 2} textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" className="pointer-events-none">
                      {rect.id}
                    </text>
                  </g>
                );
              })}

              {/* Legend & Labels */}
              <text x="10" y="170" fill="gray" fontSize="4">موقع رقم 155 - مخطط توزيع الوحدات الفني</text>
            </svg>
          </div>

          {selectedZone && (
            <div className="mt-6 p-5 bg-[#141f2e] border border-brand-yellow/30 rounded-xl animate-fade-in shadow-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="font-bold text-brand-yellow text-lg mb-1">{selectedZone.id}: {selectedZone.name}</h5>
                  <p className="text-sm text-white font-medium mb-2">{selectedZone.function}</p>
                </div>
                <div className="text-left">
                  <span className="bg-brand-red text-white text-[10px] font-bold px-2 py-1 rounded">الارتفاع المطلوب: {selectedZone.height}م</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-gray-300">الأبعاد</div>
                  <div className="text-xs text-white">{selectedZone.dims}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-300">المساحة</div>
                  <div className="text-xs text-white">{selectedZone.area.toLocaleString()} م²</div>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="text-[10px] text-gray-300">المعيار الدولي</div>
                  <div className="text-xs text-brand-gold">{selectedZone.standard}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStandards = () => {
    const criticalCount = standards.filter(s => s.priority === 'Critical').length;
    const upgradeCount = standards.filter(s => s.status === 'Upgrade Required').length;
    const complianceRate = Math.round(((standards.length - upgradeCount) / standards.length) * 100);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#141f2e] border border-white/10 p-6 rounded-2xl flex items-center justify-between shadow-lg">
            <div>
              <div className="text-gray-300 text-xs uppercase font-bold mb-1">عناصر حرجة</div>
              <div className="text-3xl font-bold text-brand-red">{criticalCount}</div>
            </div>
            <div className="w-12 h-12 bg-brand-red/10 rounded-full flex items-center justify-center text-brand-red">
              <Icon name="clipboardList" size={24} />
            </div>
          </div>
          <div className="bg-[#141f2e] border border-white/10 p-6 rounded-2xl flex items-center justify-between shadow-lg">
            <div>
              <div className="text-gray-300 text-xs uppercase font-bold mb-1">تطويرات مطلوبة</div>
              <div className="text-3xl font-bold text-brand-yellow">{upgradeCount}</div>
            </div>
            <div className="w-12 h-12 bg-brand-yellow/10 rounded-full flex items-center justify-center text-brand-yellow">
              <Icon name="arrowUpTray" size={24} />
            </div>
          </div>
          <div className="bg-[#141f2e] border border-white/10 p-6 rounded-2xl flex items-center justify-between shadow-lg">
            <div>
              <div className="text-gray-300 text-xs uppercase font-bold mb-1">نسبة الامتثال</div>
              <div className="text-3xl font-bold text-green-400">{complianceRate}%</div>
            </div>
            <div className="relative w-16 h-16">
               <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                 <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#222" strokeWidth="3" />
                 <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#27ae60" strokeWidth="3" strokeDasharray={`${complianceRate}, 100`} />
               </svg>
            </div>
          </div>
        </div>

        <div className="bg-[#141f2e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="py-4 px-6 text-gray-300 font-bold">المعيار (Standard)</th>
                  <th className="py-4 px-6 text-gray-300 font-bold">المرجع</th>
                  <th className="py-4 px-6 text-gray-300 font-bold">القيمة المطلوبة</th>
                  <th className="py-4 px-6 text-gray-300 font-bold">الأولوية</th>
                  <th className="py-4 px-6 text-gray-300 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {standards.map((s, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td className="py-4 px-6 text-white font-medium group-hover:text-brand-yellow transition-colors">{s.name}</td>
                    <td className="py-4 px-6 text-gray-300 text-xs">{s.ref}</td>
                    <td className="py-4 px-6 text-gray-200">{s.req}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        s.priority === 'Critical' ? 'bg-brand-red/20 text-brand-red border border-brand-red/30' :
                        s.priority === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {s.priority}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        {s.status === 'Compliant' ? (
                          <><span className="w-2 h-2 rounded-full bg-green-500"></span> <span className="text-green-400 text-[11px]">مطابق</span></>
                        ) : (
                          <><span className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse"></span> <span className="text-brand-yellow text-[11px]">تطوير مطلوب</span></>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderProposal = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {proposalCards.map((card, i) => (
          <div key={i} className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 hover:border-brand-yellow/30 transition-all group shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                card.priority === 'Critical' ? 'bg-brand-red/10 text-brand-red' :
                card.priority === 'High' ? 'bg-brand-yellow/10 text-brand-yellow' :
                'bg-blue-500/10 text-blue-400'
              }`}>
                <Icon name={card.icon} size={24} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                card.priority === 'Critical' ? 'bg-brand-red/20 text-brand-red' :
                card.priority === 'High' ? 'bg-brand-yellow/20 text-brand-yellow' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {card.priority === 'Critical' ? 'أولوية قصوى' : card.priority === 'High' ? 'أولوية عالية' : 'أولوية متوسطة'}
              </span>
            </div>
            <h4 className="font-bold text-white group-hover:text-brand-yellow transition-colors">{card.title}</h4>
            <p className="text-[10px] text-gray-300 mb-4">{card.subtitle}</p>
            <ul className="space-y-2">
              {card.details.map((detail, idx) => (
                <li key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-yellow/50"></span>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h4 className="font-bold text-white mb-8 border-b border-white/10 pb-4">الجدول الزمني للتنفيذ (Implementation Timeline)</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {[
            { phase: "المرحلة الأولى", title: "الهدم والإنشاءات", time: "شهر 1", items: ["رفع الأسقف", "تدعيم القواعد"] },
            { phase: "المرحلة الثانية", title: "البنية التحتية", time: "شهر 2", items: ["تركيب الأرصفة", "صب الأرضيات"] },
            { phase: "المرحلة الثالثة", title: "الأنظمة الفنية", time: "شهر 3", items: ["أنظمة الحرائق", "نظام الرفوف"] },
            { phase: "المرحلة الرابعة", title: "التشغيل والرقمنة", time: "شهر 4", items: ["تكامل Odoo", "التدريب الميداني"] },
          ].map((step, i) => (
            <div key={i} className="relative z-10 bg-brand-navy/30 border border-white/5 p-5 rounded-xl">
              <div className="text-brand-yellow font-bold text-xs mb-1">{step.phase}</div>
              <div className="text-white font-bold text-sm mb-2">{step.title}</div>
              <div className="text-[10px] text-brand-red font-bold mb-4">{step.time}</div>
              <ul className="space-y-1">
                {step.items.map((item, idx) => (
                  <li key={idx} className="text-[10px] text-gray-300 flex items-center gap-1">
                    <span className="text-brand-yellow">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-brand-yellow/10 -z-10"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-[#1a2840] to-brand-navy border border-white/10 p-8 rounded-2xl">
          <h4 className="font-bold text-white mb-6">نتائج الأداء المتوقعة (Expected KPIs)</h4>
          <div className="space-y-6">
            {[
              { label: "زيادة السعة التخزينية", val: "+140%", icon: "grid" },
              { label: "سرعة عمليات الاستلام", val: "250% تحسن", icon: "arrowDownTray" },
              { label: "دقة المخزون الرقمي", val: "99.9%", icon: "clipboardList" },
              { label: "فترة استرداد الاستثمار (ROI)", val: "18 - 24 شهر", icon: "dollarSign" },
            ].map((kpi, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-brand-yellow/10 rounded-lg flex items-center justify-center text-brand-yellow">
                  <Icon name={kpi.icon} size={20} />
                </div>
                <div>
                  <div className="text-xs text-gray-300">{kpi.label}</div>
                  <div className="text-lg font-bold text-white">{kpi.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-brand-red/5 border border-brand-red/20 p-8 rounded-2xl flex flex-col justify-center text-center">
          <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center text-brand-red mx-auto mb-6 shadow-2xl">
            <Icon name="package" size={40} />
          </div>
          <h4 className="text-xl font-bold text-white mb-4">اعتماد المقترح الفني</h4>
          <p className="text-sm text-gray-300 mb-8">هذا المستند يعتبر مرجعاً هندسياً وفنياً لعملية التحول، مصمم ليتوافق مع متطلبات مستودعات الفئة أ (Class A).</p>
          <button className="w-full py-4 bg-brand-red text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-brand-red/20 active:scale-95">
            إرسال للمراجعة والاعتماد
          </button>
        </div>
      </div>
    </div>
  );

  const renderElevation = () => (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Current State */}
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6">
          <h4 className="font-bold text-white mb-4 border-b border-white/10 pb-2">الوضع الحالي (Current State)</h4>
          <div className="relative h-80 bg-brand-navy/30 rounded-xl overflow-hidden">
             <svg viewBox="0 0 200 150" className="w-full h-full p-4">
                {/* Floor */}
                <rect x="10" y="130" width="180" height="5" fill="#333" />
                {/* Roof line */}
                <line x1="10" y1="50" x2="190" y2="50" stroke="#c0392b" strokeWidth="2" strokeDasharray="4" />
                <text x="190" y="45" textAnchor="end" fill="#c0392b" fontSize="6">6.80m (Current Limit)</text>

                {/* Racks - Limited to 3 levels */}
                {[30, 80, 130].map(x => (
                  <g key={x}>
                    <rect x={x} y="55" width="2" height="75" fill="#555" />
                    <rect x={x+30} y="55" width="2" height="75" fill="#555" />
                    {[120, 95, 70].map(y => (
                      <rect key={y} x={x} y={y} width="32" height="2" fill="#777" />
                    ))}
                    {/* Wasted space */}
                    <rect x={x} y="30" width="32" height="20" fill="#c0392b" fillOpacity="0.1" />
                    <text x={x+16} y="42" textAnchor="middle" fill="#c0392b" fontSize="4" opacity="0.5">مساحة ضائعة</text>
                  </g>
                ))}

                {/* Forklift Silhouette (Simplified) */}
                <g transform="translate(140, 110) scale(0.4)">
                   <rect x="0" y="20" width="40" height="30" fill="gray" />
                   <rect x="35" y="0" width="5" height="50" fill="black" />
                   <rect x="40" y="20" width="15" height="5" fill="black" />
                </g>

                <text x="100" y="145" textAnchor="middle" fill="gray" fontSize="5">محدودية الارتفاع وسعة تخزين منخفضة</text>
             </svg>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span className="w-2 h-2 rounded-full bg-brand-red"></span>
              أقصى عدد مستويات: 3 رفوف
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span className="w-2 h-2 rounded-full bg-brand-red"></span>
              فقدان 45% من السعة العمودية
            </div>
          </div>
        </div>

        {/* Proposed State */}
        <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 border-brand-gold/30">
          <h4 className="font-bold text-brand-yellow mb-4 border-b border-white/10 pb-2">الوضع المقترح (Proposed Class A)</h4>
          <div className="relative h-80 bg-brand-navy/30 rounded-xl overflow-hidden">
             <svg viewBox="0 0 200 150" className="w-full h-full p-4">
                {/* Floor */}
                <rect x="10" y="130" width="180" height="5" fill="#333" />
                {/* Roof line */}
                <line x1="10" y1="10" x2="190" y2="10" stroke="#27ae60" strokeWidth="2" strokeDasharray="4" />
                <text x="190" y="8" textAnchor="end" fill="#27ae60" fontSize="6">12.0m (Class A Standard)</text>

                {/* Racks - 6 levels */}
                {[30, 80, 130].map(x => (
                  <g key={x}>
                    {/* Blue Uprights */}
                    <rect x={x} y="10" width="2" height="120" fill="#2980b9" />
                    <rect x={x+30} y="10" width="2" height="120" fill="#2980b9" />

                    {/* Orange Beams */}
                    {[120, 100, 80, 60, 40, 20].map(y => (
                      <g key={y}>
                        <rect x={x} y={y} width="32" height="2" fill="#e67e22" />
                        {/* Pallet boxes */}
                        <rect x={x+4} y={y-8} width="10" height="8" fill="#f39c12" fillOpacity="0.6" rx="1" />
                        <rect x={x+18} y={y-8} width="10" height="8" fill="#f39c12" fillOpacity="0.6" rx="1" />
                      </g>
                    ))}

                    {/* Column Guards (Orange rectangles at base) */}
                    <rect x={x-2} y="125" width="6" height="5" fill="#e67e22" />
                    <rect x={x+28} y="125" width="6" height="5" fill="#e67e22" />
                  </g>
                ))}

                {/* High Reach Forklift */}
                <g transform="translate(140, 110) scale(0.4)">
                   <rect x="0" y="20" width="40" height="30" fill="#f1c40f" />
                   <rect x="35" y="-120" width="5" height="170" fill="black" />
                   <rect x="40" y="-30" width="15" height="5" fill="black" />
                </g>
             </svg>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              أقصى عدد مستويات: 6 رفوف (E-5)
            </div>
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              زيادة 100% في سعة التخزين العمودي
            </div>
          </div>
        </div>
      </div>

      {/* Dock Detail SVG */}
      <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-8">
        <h4 className="font-bold text-white mb-6">تفصيل منصة الشحن (Dock Platform Detail)</h4>
        <div className="relative aspect-[21/9] w-full bg-brand-navy/20 rounded-xl border border-white/5 overflow-hidden">
          <svg viewBox="0 0 400 150" className="w-full h-full">
            {/* Ground */}
            <rect x="0" y="130" width="400" height="20" fill="#222" />

            {/* Warehouse Platform (1.20m height) */}
            <rect x="250" y="90" width="150" height="40" fill="#333" />
            <line x1="250" y1="90" x2="400" y2="90" stroke="white" strokeWidth="1" />
            <text x="325" y="115" textAnchor="middle" fill="white" fontSize="8">أرضية المستودع (+1.20 م)</text>

            {/* Dock Leveler */}
            <rect x="240" y="90" width="20" height="2" fill="#e67e22" transform="rotate(-5, 250, 90)" />

            {/* Truck */}
            <g transform="translate(20, 60)">
              <rect x="0" y="0" width="220" height="70" fill="#2980b9" fillOpacity="0.8" rx="2" />
              <rect x="200" y="0" width="20" height="70" fill="#1a1a2e" />
              <text x="110" y="40" textAnchor="middle" fill="white" fontSize="10">مقطورة شحن ثقيلة</text>
              {/* Wheels */}
              <circle cx="40" cy="70" r="8" fill="black" />
              <circle cx="180" cy="70" r="8" fill="black" />
            </g>

            {/* Dimension Line */}
            <line x1="230" y1="130" x2="230" y2="90" stroke="#f1c40f" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
            <text x="225" y="115" textAnchor="end" fill="#f1c40f" fontSize="6">1.20 m</text>

            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#f1c40f" />
              </marker>
            </defs>
          </svg>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="text-brand-yellow font-bold text-sm mb-2">Dock Leveler</div>
            <p className="text-[10px] text-gray-300">جسر هيدروليكي يربط بين أرضية المستودع وسرير الشاحنة لتعويض فرق الارتفاع.</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="text-brand-yellow font-bold text-sm mb-2">Dock Shelters</div>
            <p className="text-[10px] text-gray-300">نظام عزل حراري يحيط بفتحة الشاحنة للحفاظ على حرارة المستودع ومنع دخول الغبار.</p>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="text-brand-yellow font-bold text-sm mb-2">Safety Lights</div>
            <p className="text-[10px] text-gray-300">نظام إضاءة إشاري (أحمر/أخضر) لتنظيم حركة دخول وخروج الشاحنات بأمان.</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 text-right" dir="rtl" id="report-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          html, body {
            background-color: #0f1923 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print, .dashboard-sidebar, .nav-header, .tab-buttons, aside {
            display: none !important;
          }

          #report-container {
            background-color: #0f1923 !important;
            color: #e5e7eb !important;
            padding: 20px !important;
            width: 100% !important;
            min-height: 100vh !important;
            display: block !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Force background preservation for elements, overriding global aggressive resets */
          #report-container * {
            background-color: transparent !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
            color: inherit !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Restore major background colors with high specificity */
          #report-container div.bg-brand-navy,
          #report-container div.bg-gradient-to-r,
          #report-container div.bg-gradient-to-br {
            background-color: #1a1a2e !important;
          }

          #report-container div.bg-\[\#141f2e\],
          #report-container section.bg-\[\#141f2e\] {
            background-color: #141f2e !important;
          }

          #report-container div.bg-\[\#0f1923\] {
            background-color: #0f1923 !important;
          }

          #report-container div.bg-white\/5 {
            background-color: rgba(255, 255, 255, 0.05) !important;
          }

          #report-container .bg-brand-red { background-color: #c0392b !important; }
          #report-container .bg-brand-yellow { background-color: #e8b830 !important; }

          /* Text colors with high specificity */
          #report-container .text-white { color: #ffffff !important; }
          #report-container .text-brand-yellow,
          #report-container .text-brand-gold { color: #e8b830 !important; }
          #report-container .text-brand-red { color: #c0392b !important; }
          #report-container .text-gray-300 { color: #d1d5db !important; }
          #report-container .text-green-400 { color: #4ade80 !important; }

          /* SVG specific preservation */
          #report-container svg rect { fill-opacity: 1 !important; stroke-opacity: 1 !important; }
          #report-container svg text { fill: white !important; fill-opacity: 1 !important; }

          .card, section, div { break-inside: avoid; }

          /* Ensure main content is visible and fills page */
          main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}} />
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-navy to-[#1a2840] rounded-2xl p-8 border border-white/10 shadow-2xl print-content">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-brand-red/20 text-brand-red text-xs font-bold rounded-full border border-brand-red/30">مقترح فني هندسي</span>
              <h2 className="text-3xl font-bold text-white">الخرائط الفنية ومقترح التطوير</h2>
            </div>
            <p className="text-gray-300 max-w-2xl">تصميم وتطوير مستودعات شركة Brandzo - موقع 155 (بوهادي). تحويل المساحات الحالية إلى مستودعات Class A بمعايير دولية.</p>
          </div>
          <button onClick={() => window.print()} className="px-6 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-brand-red/20">
            <Icon name="printer" size={20} /> طباعة التقرير الفني
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print-content">
        {/* Main Content Areas */}
        <div className="lg:col-span-3 space-y-6">
          {/* Tabs Navigation */}
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-1 no-print">
            {[
              { id: 'floorplan', label: 'المخطط الكابوري', icon: 'grid' },
              { id: 'elevation', label: 'القطاع الرأسي', icon: 'arrowUpTray' },
              { id: 'standards', label: 'المعايير الدولية', icon: 'clipboardList' },
              { id: 'proposal', label: 'مقترح التحويل', icon: 'workflows' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-t-xl font-bold transition-all flex items-center gap-2 ${
                  activeTab === tab.id ? 'bg-[#1a2840] text-brand-yellow border-t border-x border-white/10' : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon name={tab.icon} size={18} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab === 'floorplan' && renderFloorPlan()}
            {activeTab === 'elevation' && renderElevation()}
            {activeTab === 'standards' && renderStandards()}
            {activeTab === 'proposal' && renderProposal()}
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="space-y-6 no-print">
          {/* Compliance Checklist */}
          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="clipboardList" size={18} className="text-brand-yellow" /> مراجعة الامتثال اللحظية
            </h4>
            <div className="space-y-3">
              {[
                { label: "ارتفاع السقف (Class A)", ok: dimensions.clearHeight >= 12, val: `${dimensions.clearHeight}م` },
                { label: "نظام الرشاشات ESFR", ok: dimensions.clearHeight >= 10, val: dimensions.clearHeight >= 10 ? "مطلوب" : "اختياري" },
                { label: "أرضية إيبوكسي صناعي", ok: dimensions.flooring.includes("إيبوكسي"), val: "مطابق" },
                { label: "سعة التخزين المستهدفة", ok: stats.estPallets > 15000, val: `${stats.estPallets.toLocaleString()}` },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-300">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{item.val}</span>
                    {item.ok ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-brand-red">✗</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dimensions.clearHeight < 12 && (
              <div className="mt-4 p-2 bg-brand-red/10 border border-brand-red/20 rounded text-[10px] text-brand-red">
                ⚠️ الارتفاع الحالي أقل من معيار Class A (12م) لـ E-5.
              </div>
            )}
          </div>

          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 shadow-xl">
            <h4 className="font-bold text-white mb-6 flex items-center gap-2 border-b border-white/10 pb-3">
              <Icon name="grid" size={18} className="text-brand-yellow" /> لوحة التحكم الفنية
            </h4>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-300">طول المستودع (م)</label>
                <input type="number" value={dimensions.length} onChange={e => setDimensions({...dimensions, length: +e.target.value})} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-300">عرض المستودع (م)</label>
                <input type="number" value={dimensions.width} onChange={e => setDimensions({...dimensions, width: +e.target.value})} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-300">الارتفاع الصافي المقترح (م)</label>
                <input type="number" value={dimensions.clearHeight} onChange={e => setDimensions({...dimensions, clearHeight: +e.target.value})} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-300">نوع الأرضية</label>
                <select value={dimensions.flooring} onChange={e => setDimensions({...dimensions, flooring: e.target.value})} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>إيبوكسي FF50</option>
                  <option>خرسانة صناعية</option>
                  <option>بلاط مقاوم للأحمال</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-300">نظام التخزين</label>
                <select value={dimensions.rackingSystem} onChange={e => setDimensions({...dimensions, rackingSystem: e.target.value})} className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm focus:border-brand-yellow outline-none">
                  <option>Selective Pallet Racking</option>
                  <option>Drive-In Racking</option>
                  <option>VNA System</option>
                </select>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">مستويات الرفوف:</span>
                <span className="text-brand-yellow font-bold">{stats.rackLevels} مستويات</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">السعة التقديرية:</span>
                <span className="text-brand-yellow font-bold">{stats.estPallets.toLocaleString()} طبلية</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">نوع الرافعة المطلوبة:</span>
                <span className="text-green-400 font-bold text-[10px]">{stats.forkliftType}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141f2e] border border-white/10 rounded-2xl p-6 shadow-xl">
            <h4 className="font-bold text-white mb-4 flex items-center gap-2">
              <Icon name="package" size={18} className="text-brand-red" /> معلومات الموقع
            </h4>
            <div className="space-y-3">
              {[
                { label: "كود الموقع", val: siteInfo.id },
                { label: "الموقع", val: siteInfo.location },
                { label: "المساحة الكلية", val: siteInfo.totalSiteArea },
                { label: "المقاول المنفذ", val: siteInfo.contractor, small: true },
                { label: "الارتفاع الحالي", val: siteInfo.currentHeight },
              ].map((item, i) => (
                <div key={i} className="flex flex-col border-b border-white/5 pb-2">
                  <span className="text-[10px] text-gray-300 uppercase">{item.label}</span>
                  <span className={`text-white font-medium ${item.small ? 'text-xs' : 'text-sm'}`}>{item.val}</span>
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
