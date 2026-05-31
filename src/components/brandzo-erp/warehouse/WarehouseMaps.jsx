import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../ui/Icon.jsx';

const WarehouseMaps = () => {
  const [activeTab, setActiveTab] = useState('floorplan');
  const [dimensions, setDimensions] = useState({
    length: 50,
    width: 30,
    clearHeight: 10,
    sprinklerClearance: 0.5,
    floorType: "إيبوكسي",
    floorLoad: 5000,
    dockDoors: 4,
    dockHeight: 1.2,
    receivingWidth: 10,
    receivingDepth: 10,
    shippingWidth: 10,
    shippingDepth: 10
  });

  const [compliance, setCompliance] = useState({
    height: 'waiting',
    epoxy: 'yes',
    led: 'no',
    esfr: 'waiting',
    fireDoors: 'yes',
    wms: 'no',
    wifi: 'yes',
    cctv: 'yes',
    generator: 'no',
    loadingDocks: 'waiting'
  });

  useEffect(() => {
    const saved = localStorage.getItem('brandzo_warehouse_map_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDimensions(parsed.dimensions || dimensions);
        setCompliance(parsed.compliance || compliance);
      } catch (e) {
        console.error("Failed to load warehouse maps data", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('brandzo_warehouse_map_v1', JSON.stringify({ dimensions, compliance }));
  }, [dimensions, compliance]);

  const stats = useMemo(() => {
    const totalArea = dimensions.length * dimensions.width;
    const netStorageArea = totalArea * 0.7; // Estimate 70% storage
    const utilization = 65; // Static estimate for now
    const maxRackHeight = dimensions.clearHeight - dimensions.sprinklerClearance;
    const volume = totalArea * dimensions.clearHeight;

    return { totalArea, netStorageArea, utilization, maxRackHeight, volume };
  }, [dimensions]);

  const renderDocksTab = () => {
    const dockStandards = [
      { name: "ارتفاع قاعدة الدوك عن الأرض", recommended: 1.2, current: dimensions.dockHeight, unit: "متر" },
      { name: "عرض الباب (للشاحنة الكبيرة)", recommended: 4.0, current: 4.0, unit: "متر" },
      { name: "ارتفاع الباب", recommended: 4.5, current: 4.5, unit: "متر" },
      { name: "عدد أبواب الاستلام", recommended: "2-4", current: dimensions.dockDoors, unit: "باب" }
    ];

    const vehicles = [
      { name: "شاحنة كبيرة (Semi-Truck)", dims: "16-18م | عرض 2.5م", icon: "🚛", req: "Dock Leveler + 1.20m Height" },
      { name: "شاحنة متوسطة (Box Truck)", dims: "7-9م | عرض 2.1م", icon: "🚐", req: "Dock Leveler / Ramp" },
      { name: "سيارة نقل خفيفة (Van)", dims: "4-6م | عرض 1.9م", icon: "🏎️", req: "Ground Level / Yard Ramp" }
    ];

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Dock Standards Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h4 className="font-bold text-brand-yellow mb-6">معايير ضبط الدوك (Dock Standards)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="text-gray-400 border-b border-white/10">
                  <tr>
                    <th className="pb-3 px-2">المعيار</th>
                    <th className="pb-3 px-2">الموصى به</th>
                    <th className="pb-3 px-2">الحالي</th>
                    <th className="pb-3 px-2 text-center">التقييم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-gray-100">
                  {dockStandards.map((std, i) => {
                    const isOk = typeof std.recommended === 'number' ? std.current >= std.recommended : true;
                    return (
                      <tr key={i}>
                        <td className="py-4 px-2">{std.name}</td>
                        <td className="py-4 px-2">{std.recommended} {std.unit}</td>
                        <td className="py-4 px-2">
                          {i === 0 ? (
                            <input type="number" step="0.1" className="w-20 bg-brand-navy border border-white/20 rounded p-1"
                              value={std.current} onChange={e => setDimensions({...dimensions, dockHeight: +e.target.value})} />
                          ) : (std.current + " " + std.unit)}
                        </td>
                        <td className="py-4 px-2 text-center text-lg">{isOk ? "✅" : "⚠️"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vehicle Cards */}
          <div className="space-y-4">
            <h4 className="font-bold text-brand-yellow">توافق المركبات (Vehicle Compatibility)</h4>
            <div className="grid grid-cols-1 gap-4">
              {vehicles.map((v, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-6 hover:bg-white/10 transition-all">
                  <div className="text-5xl">{v.icon}</div>
                  <div>
                    <h5 className="font-bold text-white mb-1">{v.name}</h5>
                    <p className="text-xs text-gray-400 mb-1">{v.dims}</p>
                    <p className="text-xs text-brand-gold font-bold">المتطلبات: {v.req}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dock Equipment & Process */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h4 className="font-bold text-brand-yellow mb-4">معدات منطقة الدوك الموصى بها</h4>
            <div className="grid grid-cols-2 gap-4">
              {["Dock Leveler", "Dock Bumpers", "Dock Seal", "Dock Light", "Wheel Chocks", "Vehicle Restraint"].map(item => (
                <label key={item} className="flex items-center gap-3 text-sm text-gray-200 cursor-pointer p-2 rounded hover:bg-white/5">
                  <input type="checkbox" defaultChecked className="accent-brand-red w-4 h-4" />
                  {item}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h4 className="font-bold text-brand-yellow mb-6">تسلسل عملية الاستلام</h4>
            <div className="flex flex-col gap-2 relative">
               {["وصول المركبة", "التحقق من PO", "ضبط الدوك", "تفريغ البضاعة", "فحص الجودة QC", "إدخال GRN", "تخزين"].map((step, i) => (
                 <div key={i} className="flex items-center gap-4 relative">
                   <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center font-bold text-white z-10">{i+1}</div>
                   <div className="flex-1 bg-white/5 p-2 rounded border border-white/5 text-sm text-white">{step}</div>
                   {i < 6 && <div className="absolute top-8 right-4 w-0.5 h-2 bg-brand-red/30"></div>}
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDevelopmentTab = () => {
    const classAStandards = [
      { id: 'height', label: 'ارتفاع السقف ≥ 10م (Clear Height)', val: compliance.height },
      { id: 'epoxy', label: 'أرضية إيبوكسي FF ≥ 50', val: compliance.epoxy },
      { id: 'led', label: 'إضاءة LED ≥ 200 Lux', val: compliance.led },
      { id: 'esfr', label: 'نظام رشاشات ESFR', val: compliance.esfr },
      { id: 'fireDoors', label: 'بوابات حماية ضد الحرائق', val: compliance.fireDoors },
      { id: 'wms', label: 'نظام إدارة مستودعات WMS', val: compliance.wms },
      { id: 'wifi', label: 'شبكة WiFi صناعية 100%', val: compliance.wifi },
      { id: 'cctv', label: 'نظام CCTV متكامل', val: compliance.cctv },
      { id: 'generator', label: 'طاقة كهربائية احتياطية', val: compliance.generator },
      { id: 'loadingDocks', label: 'منافذ شحن كافية (1/2000م²)', val: compliance.loadingDocks },
    ];

    const getStatusIcon = (val) => {
      if (val === 'yes') return "✅";
      if (val === 'no') return "❌";
      return "⚠️";
    };

    const getStatusText = (val) => {
      if (val === 'yes') return "مطابق";
      if (val === 'no') return "غير مطابق";
      return "قيد التطوير";
    };

    const score = (classAStandards.filter(s => s.val === 'yes').length / classAStandards.length) * 100;

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Class A Checklist */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-brand-yellow">معايير المستودعات العالمية Class A</h4>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-400">{score}%</div>
                <div className="text-[10px] text-gray-400">مستوى الامتثال</div>
              </div>
            </div>

            <div className="space-y-2">
              {classAStandards.map(std => (
                <div key={std.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-all">
                  <span className="text-sm text-gray-200">{std.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{getStatusText(std.val)}</span>
                    <select
                      value={std.val}
                      onChange={e => setCompliance({...compliance, [std.id]: e.target.value})}
                      className="bg-brand-navy border border-white/20 rounded p-1 text-xs"
                    >
                      <option value="yes">مطابق</option>
                      <option value="no">غير مطابق</option>
                      <option value="waiting">قيد التطوير</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Development Plan Form */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-fit">
            <h4 className="font-bold text-brand-yellow mb-6">خطة التطوير المقترحة</h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-200">المعيار المطلوب تحسينه</label>
                <select className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm">
                  {classAStandards.filter(s => s.val !== 'yes').map(s => <option key={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-200">الهدف المنشود</label>
                <textarea className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm h-20" placeholder="وصف الحالة النهائية..."></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-200">التكلفة التقديرية ($)</label>
                  <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm" placeholder="اختياري" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-200">الأولوية</label>
                  <select className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm">
                    <option>عالية</option>
                    <option>متوسطة</option>
                    <option>منخفضة</option>
                  </select>
                </div>
              </div>
              <button className="w-full py-3 bg-brand-yellow text-brand-navy font-bold rounded-xl hover:bg-yellow-500 transition-all active:scale-95 mt-4">
                إضافة للمقترح التطويري
              </button>
            </div>
          </div>
        </div>

        {/* Global vs Local Comparison */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
           <h4 className="font-bold text-white mb-8 text-center">مقارنة: مستودعنا الحالي vs المعيار العالمي</h4>
           <div className="space-y-6 max-w-3xl mx-auto">
             {[
               { label: "ارتفاع السقف", current: dimensions.clearHeight, target: 12, unit: "م" },
               { label: "كفاءة الانتقاء", current: 45, target: 95, unit: "%" },
               { label: "الأتمتة والرقمنة", current: 30, target: 100, unit: "%" }
             ].map((item, i) => {
               const pct = (item.current / item.target) * 100;
               return (
                 <div key={i} className="space-y-2">
                   <div className="flex justify-between text-sm">
                     <span className="text-gray-200">{item.label}</span>
                     <span className="text-gray-400">{item.current} {item.unit} / {item.target} {item.unit}</span>
                   </div>
                   <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                     <div className="h-full bg-brand-red rounded-full transition-all duration-1000" style={{ width: `${pct}%` }}></div>
                   </div>
                 </div>
               );
             })}
           </div>
        </div>
      </div>
    );
  };

  const renderRacksTab = () => {
    const rackLevels = [
      { id: "L1", h: "0 - 1.0م", weight: "2,000 كغ", desc: "بضاعة ثقيلة وسريعة", color: "#c0392b" },
      { id: "L2", h: "1.0 - 2.5م", weight: "1,500 كغ", desc: "متوسط الحركة", color: "#e8b830" },
      { id: "L3", h: "2.5 - 4.5م", weight: "1,200 كغ", desc: "بطيء الحركة", color: "#27ae60" },
      { id: "L4", h: "4.5م+", weight: "800 كغ", desc: "مخزون احتياطي", color: "#2980b9" }
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
        <div className="lg:col-span-2 space-y-8">
          {/* Elevation View SVG */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h4 className="font-bold text-white mb-6">المقطع العلوي (Elevation View)</h4>
            <svg viewBox="0 0 600 400" width="100%" className="rounded-xl bg-brand-navy/30">
              <defs>
                 <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                   <path d="M0,0 L10,5 L0,10 Z" fill="white" />
                 </marker>
              </defs>
              {/* Floor */}
              <rect x="0" y="380" width="600" height="20" fill="#334155" />
              {/* Rack Structure */}
              <rect x="150" y="50" width="15" height="330" fill="#1e293b" />
              <rect x="450" y="50" width="15" height="330" fill="#1e293b" />

              {/* Rack Beams */}
              {[380, 300, 220, 140, 60].map((y, i) => (
                <g key={i}>
                  <rect x="165" y={y-10} width="285" height="10" fill="#e8b830" />
                  {i > 0 && <text x="310" y={y+40} textAnchor="middle" fill="white" fontSize="10" opacity="0.5">LEVEL {5-i}</text>}
                  {/* Pallet Simulation */}
                  {i > 0 && <rect x="200" y={y-35} width="60" height="25" fill="#8b5cf6" fillOpacity="0.6" rx="2" />}
                  {i > 0 && <rect x="340" y={y-35} width="60" height="25" fill="#10b981" fillOpacity="0.6" rx="2" />}
                </g>
              ))}

              {/* Clear Height Line */}
              <line x1="50" y1="40" x2="550" y2="40" stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />
              <text x="50" y="30" fill="#ef4444" fontSize="10" fontWeight="bold">Sprinkler Line (Max Height)</text>

              {/* Dimension Arrows */}
              <line x1="500" y1="380" x2="500" y2="40" stroke="white" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
              <text x="510" y="210" fill="white" fontSize="10" transform="rotate(90, 510, 210)">Clear Height: {dimensions.clearHeight}m</text>
            </svg>
          </div>

          {/* Rack Standards Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h4 className="font-bold text-brand-yellow mb-6">جدول معايير الرفوف الدولية</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10">
                    <th className="pb-3 px-2">المستوى</th>
                    <th className="pb-3 px-2">الارتفاع</th>
                    <th className="pb-3 px-2">الحمولة القصوى</th>
                    <th className="pb-3 px-2">الاستخدام الموصى به</th>
                  </tr>
                </thead>
                <tbody className="text-gray-100 divide-y divide-white/5">
                  {rackLevels.map(lvl => (
                    <tr key={lvl.id}>
                      <td className="py-4 px-2 font-bold" style={{ color: lvl.color }}>{lvl.id}</td>
                      <td className="py-4 px-2">{lvl.h}</td>
                      <td className="py-4 px-2">{lvl.weight}</td>
                      <td className="py-4 px-2 text-xs">{lvl.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Capacity Calculator */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-fit space-y-6">
          <h4 className="font-bold text-brand-yellow flex items-center gap-2">
            <Icon name="grid" size={18} /> حاسبة الطاقة التخزينية
          </h4>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-200">عدد صفوف الرفوف</label>
              <input type="number" defaultValue="10" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-200">عدد بايات في الصف</label>
              <input type="number" defaultValue="8" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-200">عدد المستويات</label>
              <input type="number" defaultValue="4" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white" />
            </div>
          </div>
          <div className="pt-6 border-t border-white/10 bg-brand-navy/50 p-4 rounded-xl text-center">
            <div className="text-3xl font-bold text-brand-yellow mb-1">320</div>
            <div className="text-xs text-gray-400">إجمالي مواضع المنصات (Pallet Positions)</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFloorPlan = () => {
    const scale = 10;
    const padding = 40;
    const svgW = dimensions.length * scale + padding * 2;
    const svgH = dimensions.width * scale + padding * 2;

    const recW = dimensions.receivingWidth * scale;
    const recD = dimensions.receivingDepth * scale;
    const shipW = dimensions.shippingWidth * scale;
    const shipD = dimensions.shippingDepth * scale;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls Sidebar */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 h-fit">
            <h4 className="font-bold text-brand-yellow border-b border-white/10 pb-2 mb-4">لوحة التحكم بالأبعاد</h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-200">الطول الكلي (م)</label>
                <input type="number" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm"
                  value={dimensions.length} onChange={e => setDimensions({...dimensions, length: +e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-200">العرض الكلي (م)</label>
                <input type="number" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm"
                  value={dimensions.width} onChange={e => setDimensions({...dimensions, width: +e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-200">ارتفاع الأرضية النظيفة (م)</label>
                <input type="number" className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm"
                  value={dimensions.clearHeight} onChange={e => setDimensions({...dimensions, clearHeight: +e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-200">نوع الأرضية</label>
                <select className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white text-sm"
                  value={dimensions.floorType} onChange={e => setDimensions({...dimensions, floorType: e.target.value})}>
                  <option>خرسانة مسلحة</option>
                  <option>إيبوكسي</option>
                  <option>بلاط صناعي</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 mt-6 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-200">المساحة الإجمالية:</span>
                <span className="text-brand-yellow font-bold">{stats.totalArea} م²</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-200">ارتفاع الرف الأقصى:</span>
                <span className="text-green-400 font-bold">{stats.maxRackHeight} م</span>
              </div>
            </div>
          </div>

          {/* SVG Canvas */}
          <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-x-auto relative">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-white">المخطط الكابوري التفاعلي (Floor Plan)</h4>
              <div className="flex gap-4 text-[10px]">
                <span className="flex items-center gap-1 text-blue-400"><span className="w-2 h-2 bg-blue-500 rounded-sm"></span> الاستلام</span>
                <span className="flex items-center gap-1 text-green-400"><span className="w-2 h-2 bg-green-500 rounded-sm"></span> التخزين</span>
                <span className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 bg-orange-500 rounded-sm"></span> الشحن</span>
              </div>
            </div>

            <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" className="min-w-[600px] drop-shadow-2xl">
              {/* Outer Walls */}
              <rect x={padding} y={padding} width={dimensions.length * scale} height={dimensions.width * scale}
                fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.3" />

              {/* Receiving Dock (Right side) */}
              <rect x={padding + dimensions.length * scale - recW} y={padding} width={recW} height={recD}
                fill="#2563eb" fillOpacity="0.2" stroke="#2563eb" strokeWidth="2" className="cursor-pointer hover:fill-opacity-40 transition-all" />
              <text x={padding + dimensions.length * scale - recW/2} y={padding + recD/2} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">منطقة الاستلام</text>

              {/* QC Area */}
              <rect x={padding + dimensions.length * scale - recW - 40} y={padding + 5} width="35" height={recD - 10}
                fill="#8b5cf6" fillOpacity="0.2" stroke="#8b5cf6" strokeWidth="1" />
              <text x={padding + dimensions.length * scale - recW - 22} y={padding + recD/2} textAnchor="middle" fill="white" fontSize="8" transform={`rotate(-90, ${padding + dimensions.length * scale - recW - 22}, ${padding + recD/2})`}>QC منطقة الفحص</text>

              {/* Storage Zones (Main area) */}
              <rect x={padding + shipW + 10} y={padding + 5} width={dimensions.length * scale - recW - shipW - 60} height={dimensions.width * scale - 10}
                fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="1" strokeDasharray="4" />

              {/* Aisles simulation */}
              {[...Array(5)].map((_, i) => (
                <line key={i} x1={padding + shipW + 30 + i*60} y1={padding + 10} x2={padding + shipW + 30 + i*60} y2={padding + dimensions.width * scale - 10}
                  stroke="white" strokeOpacity="0.1" strokeWidth="10" />
              ))}

              {/* Shipping Dock (Left side) */}
              <rect x={padding} y={padding + (dimensions.width * scale - shipD)} width={shipW} height={shipD}
                fill="#f97316" fillOpacity="0.2" stroke="#f97316" strokeWidth="2" className="cursor-pointer hover:fill-opacity-40 transition-all" />
              <text x={padding + shipW/2} y={padding + (dimensions.width * scale - shipD/2)} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">منطقة الشحن</text>

              {/* Office/Security */}
              <rect x={padding} y={padding} width="80" height="40" fill="#4b5563" fillOpacity="0.5" />
              <text x={padding + 40} y={padding + 25} textAnchor="middle" fill="white" fontSize="10">مكتب المستودع</text>

              {/* Scale Bar */}
              <line x1={padding} y1={svgH - 20} x2={padding + 10 * scale} y2={svgH - 20} stroke="white" strokeWidth="2" />
              <text x={padding + 5 * scale} y={svgH - 5} textAnchor="middle" fill="white" fontSize="10">10 متر</text>
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-navy to-blue-900 rounded-2xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">خرائط المستودعات الفنية</h2>
            <p className="text-blue-200">تحليل المخططات، معايير الرفوف، وتطوير المستودعات Class A</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => window.print()} className="px-6 py-2 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2">
               <Icon name="printer" size={18} /> طباعة التقرير
             </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-1">
        {[
          { id: 'floorplan', label: 'المخطط الكابوري التفاعلي', icon: 'grid' },
          { id: 'docks', label: 'آلية الاستلام والتسليم', icon: 'package' },
          { id: 'racks', label: 'معايير الرفوف والأرتفاعات', icon: 'arrowUpTray' },
          { id: 'development', label: 'تطوير المستودع', icon: 'workflows' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-t-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-brand-yellow text-brand-navy shadow-lg shadow-brand-yellow/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon name={tab.icon} size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'floorplan' && renderFloorPlan()}
        {activeTab === 'docks' && renderDocksTab()}
        {activeTab === 'racks' && renderRacksTab()}
        {activeTab === 'development' && renderDevelopmentTab()}
      </div>
    </div>
  );
};

export default WarehouseMaps;
