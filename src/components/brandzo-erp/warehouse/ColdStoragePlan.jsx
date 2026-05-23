import React, { useState } from 'react';

const TOTAL_UNITS = 19;
const AREA_PER_UNIT = 63; // m2
const DEFAULT_BAYS_PER_UNIT = 24;
const DEFAULT_SHELVES_PER_BAY = 3;
const CARTONS_PER_SHELF = 4;

const categories = ['العناية بالوجه', 'العناية بالجسم', 'العناية بالشعر', 'الميك أب', 'العطور', 'مختلط'];
const statuses = ['فارغة', 'مشغّلة جزئياً', 'ممتلئة'];

export default function ColdStoragePlan() {
  const initialUnits = Array.from({ length: TOTAL_UNITS }).map((_, i) => ({
    id: i + 1,
    name: `الثلاجة ${i + 1}`,
    category: 'مختلط',
    status: 'فارغة',
    note: '',
  }));

  const [units, setUnits] = useState(initialUnits);
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState('plan'); // 'plan' or 'elevation'
  
  // إعدادات الراك قابلة للتعديل (للوحدة المحددة)
  const [bayConfig, setBayConfig] = useState({
    baysPerSide: 12,        // عدد البايات في كل جانب (المجموع 24)
    sectionsPerSide: 6,     // عدد وحدات الراك المزدوجة في الجانب الواحد
    shelvesPerBay: DEFAULT_SHELVES_PER_BAY,
    cartonsPerShelf: CARTONS_PER_SHELF,
  });

  const totalBaysUnit = bayConfig.baysPerSide * 2; // 24
  const totalShelvesUnit = totalBaysUnit * bayConfig.shelvesPerBay;
  const totalCartonsUnit = totalShelvesUnit * bayConfig.cartonsPerShelf;

  const totalArea = TOTAL_UNITS * AREA_PER_UNIT;
  const totalBaysComplex = TOTAL_UNITS * totalBaysUnit;
  const totalShelvesComplex = totalBaysComplex * bayConfig.shelvesPerBay;
  const totalCartonsComplex = totalShelvesComplex * bayConfig.cartonsPerShelf;

  function updateSelected(changes) {
    setUnits((u) => u.map(item => item.id === selected ? { ...item, ...changes } : item));
  }

  const selUnit = units.find(u => u.id === selected);

  return (
    <div dir="rtl" className="p-6" style={{ fontFamily: 'Cairo, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 className="t-h2 mb-4">مخطط مجمع التبريد — الرحبة (Cosmetics)</h1>

      {/* ملخص عام */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-4">
          <h3 className="t-h3">الملخص التنفيذي</h3>
          <p className="t-body mt-2">مساحة الثلاجة 63 م² (9م × 7م) – العدد 19 ثلاجة</p>
          <ul className="mt-3 space-y-1 t-body">
            <li>إجمالي مساحة المجمع: <strong>{totalArea} م²</strong></li>
            <li>إجمالي البايات (للوحدة): <strong>{totalBaysUnit}</strong></li>
            <li>إجمالي الرفوف: <strong>{totalShelvesUnit}</strong> رف</li>
            <li>سعة الصناديق للوحدة: <strong>{totalCartonsUnit}</strong> صندوق</li>
            <li>سعة المجمع الكلية: <strong>{totalCartonsComplex}</strong> صندوق</li>
          </ul>
        </div>

        <div className="glass-card p-4 lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <h3 className="t-h3">
              {view === 'plan' ? 'المخطط الأرضي (Top View)' : 'المنظر الجانبي (Elevation)'}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setView('plan')}
                className={`px-3 py-1 rounded text-sm ${view === 'plan' ? 'bg-brand-gold text-white' : 'bg-gray-200'}`}
              >
                مخطط أرضي
              </button>
              <button
                onClick={() => setView('elevation')}
                className={`px-3 py-1 rounded text-sm ${view === 'elevation' ? 'bg-brand-gold text-white' : 'bg-gray-200'}`}
              >
                منظر جانبي
              </button>
            </div>
          </div>

          {view === 'plan' ? <TopView bayConfig={bayConfig} /> : <ElevationView bayConfig={bayConfig} />}

          <div className="mt-4 flex flex-wrap gap-4 items-center">
            <div>
              <label className="t-label">بايات في الجانب:</label>
              <input
                type="number"
                min="1"
                max="20"
                value={bayConfig.baysPerSide}
                onChange={(e) => setBayConfig({ ...bayConfig, baysPerSide: +e.target.value })}
                className="ml-2 p-1 w-20 border rounded"
              />
            </div>
            <div>
              <label className="t-label">أقسام مزدوجة/جانب:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={bayConfig.sectionsPerSide}
                onChange={(e) => setBayConfig({ ...bayConfig, sectionsPerSide: +e.target.value })}
                className="ml-2 p-1 w-20 border rounded"
              />
            </div>
            <div>
              <label className="t-label">رفوف/باي:</label>
              <input
                type="number"
                min="1"
                max="6"
                value={bayConfig.shelvesPerBay}
                onChange={(e) => setBayConfig({ ...bayConfig, shelvesPerBay: +e.target.value })}
                className="ml-2 p-1 w-20 border rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* شبكة الوحدات */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-4">
          <h3 className="t-h3">شبكة الوحدات — المجمع ({TOTAL_UNITS})</h3>
          <div className="grid grid-cols-5 gap-2 mt-3">
            {units.map(u => (
              <button
                key={u.id}
                onClick={() => setSelected(u.id)}
                className={`p-3 rounded-lg text-sm border ${selected === u.id ? 'border-brand-gold bg-brand-navy text-white' : 'border-gray-200 bg-white/5 text-gray-200'}`}
              >
                <div>الوحدة {u.id}</div>
                <div className="text-xs t-caption">{u.status}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-4 lg:col-span-2">
          <h3 className="t-h3">تفاصيل الوحدة {selUnit.id}</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="t-label">اسم الوحدة</label>
              <input className="w-full mt-2 p-2 rounded border" value={selUnit.name} onChange={(e) => updateSelected({ name: e.target.value })} />
            </div>
            <div>
              <label className="t-label">فئة المنتج</label>
              <select className="w-full mt-2 p-2 rounded border" value={selUnit.category} onChange={(e) => updateSelected({ category: e.target.value })}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="t-label">الحالة</label>
              <select className="w-full mt-2 p-2 rounded border" value={selUnit.status} onChange={(e) => updateSelected({ status: e.target.value })}>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="t-label">ملاحظة</label>
              <textarea className="w-full mt-2 p-2 rounded border" rows={3} value={selUnit.note} onChange={(e) => updateSelected({ note: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      {/* جدول الطاقة الاستيعابية مع تحديثات */}
      <div className="glass-card p-4 mb-6">
        <h3 className="t-h3">ملخص الطاقة الاستيعابية (قابل للتعديل)</h3>
        <table className="w-full mt-3">
          <thead>
            <tr><th className="text-right">الوصف</th><th className="text-right">القيمة</th></tr>
          </thead>
          <tbody>
            <tr><td className="text-right">إجمالي مساحة المجمع</td><td className="text-right">{totalArea} م²</td></tr>
            <tr><td className="text-right">بايات لكل وحدة</td><td className="text-right">{totalBaysUnit}</td></tr>
            <tr><td className="text-right">رفوف لكل باي</td><td className="text-right">{bayConfig.shelvesPerBay}</td></tr>
            <tr><td className="text-right">إجمالي الرفوف في الوحدة</td><td className="text-right">{totalShelvesUnit}</td></tr>
            <tr><td className="text-right">سعة الصناديق للوحدة</td><td className="text-right">{totalCartonsUnit}</td></tr>
            <tr><td className="text-right">إجمالي بايات المجمع</td><td className="text-right">{totalBaysComplex}</td></tr>
            <tr><td className="text-right">إجمالي رفوف المجمع</td><td className="text-right">{totalShelvesComplex}</td></tr>
            <tr><td className="text-right">السعة الإجمالية للمجمع</td><td className="text-right">{totalCartonsComplex} صندوق</td></tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-red text-white rounded">طباعة / تصدير</button>
        <button onClick={() => alert('تم الحفظ محلياً')} className="px-4 py-2 bg-brand-navy text-white rounded">حفظ</button>
      </div>
    </div>
  );
}

/* المخطط الأرضي (Top View) */
function TopView({ bayConfig }) {
  const { baysPerSide, sectionsPerSide } = bayConfig;
  // كل جانب يحتوي على عدد من الأقسام المزدوجة (كل قسم = بايان متتاليان)
  // سنرسمهم على طول 9م (المحور الأفقي)، والعرض 7م (الرأسي)
  const unitLength = 900;  // px
  const unitWidth = 700;
  const aisleWidth = 120; // يعادل 1.2م

  // مواقع الأرفف: على يسار ويمين الممر
  const rackDepth = (unitWidth - aisleWidth) / 2 - 20; // المسافة من الجدار إلى حافة الممر

  // رسم الأقسام: كل قسم بعرض = (9m / sectionsPerSide) scaled
  const sectionWidth = (unitLength - 40) / sectionsPerSide; // ترك هامش 20px من كل جانب

  return (
    <svg viewBox="0 0 900 700" width="100%" height="400" style={{ background: '#fff', borderRadius: 8 }}>
      {/* الجدران */}
      <rect x="0" y="0" width={unitLength} height={unitWidth} fill="none" stroke="#333" strokeWidth="4" />
      
      {/* الممر المركزي */}
      <rect x={(unitLength - aisleWidth) / 2} y="0" width={aisleWidth} height={unitWidth} fill="#f0f0f0" stroke="#aaa" />

      {/* الأرفف الجانبية - كل قسم يمثل بايان (أمامي وخلفي) */}
      {Array.from({ length: sectionsPerSide }).map((_, i) => {
        const x = 20 + i * sectionWidth;
        // الرف الأيسر (قريب من الجدار الأيسر)
        return (
          <React.Fragment key={i}>
            {/* الجانب الأيسر */}
            <rect
              x={x}
              y={10}
              width={sectionWidth - 6}
              height={rackDepth}
              fill="#1a1a2e"
              rx="4"
              stroke="#e8b830"
            />
            <text x={x + sectionWidth/2 - 3} y={10 + rackDepth/2} fill="white" fontSize="11" textAnchor="middle">
              {`L${i+1}`}
            </text>
            {/* الجانب الأيمن */}
            <rect
              x={x}
              y={unitWidth - rackDepth - 10}
              width={sectionWidth - 6}
              height={rackDepth}
              fill="#1a1a2e"
              rx="4"
              stroke="#e8b830"
            />
            <text x={x + sectionWidth/2 - 3} y={unitWidth - rackDepth/2 - 10} fill="white" fontSize="11" textAnchor="middle">
              {`R${i+1}`}
            </text>
          </React.Fragment>
        );
      })}

      {/* باب على الواجهة القصيرة (أسفل) - يتمركز أفقيًا */}
      <rect x={(unitLength - 80) / 2} y={unitWidth - 10} width="80" height="10" fill="#c0392b" />

      {/* الأبعاد */}
      <line x1="0" y1={unitWidth + 20} x2={unitLength} y2={unitWidth + 20} stroke="#e8b830" strokeWidth="2" />
      <text x={unitLength/2} y={unitWidth + 40} textAnchor="middle" fontSize="14">9 m</text>
      <line x1={unitLength + 20} y1="0" x2={unitLength + 20} y2={unitWidth} stroke="#e8b830" strokeWidth="2" />
      <text x={unitLength + 40} y={unitWidth/2} textAnchor="middle" fontSize="14" transform={`rotate(90, ${unitLength+40}, ${unitWidth/2})`}>7 m</text>

      {/* وسيلة إيضاح */}
      <rect x={10} y={unitWidth - 40} width="12" height="12" fill="#1a1a2e" rx="2" />
      <text x={26} y={unitWidth - 28} fontSize="12">راك مزدوج (2 باي)</text>
    </svg>
  );
}

/* المنظر الجانبي (Elevation) */
function ElevationView({ bayConfig }) {
  const { baysPerSide, shelvesPerBay, cartonsPerShelf } = bayConfig;
  // نعرض صفاً واحداً من البايات على طول الجدار (9م)
  const totalBays = baysPerSide; // اخترنا جانباً واحداً للعرض
  const shelfHeight = 35; // px
  const bayWidth = 80;    // px لكل باي في الرسم

  const svgWidth = totalBays * bayWidth + 40;
  const svgHeight = shelvesPerBay * (shelfHeight + 20) + 80;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="350" style={{ background: '#fafafa', borderRadius: 8 }}>
        {/* قاعدة البايات */}
        {Array.from({ length: totalBays }).map((_, bayIdx) => {
          const x = 20 + bayIdx * bayWidth;
          return (
            <g key={bayIdx}>
              {/* هيكل الباي */}
              <rect x={x} y={30} width={bayWidth - 4} height={shelvesPerBay * (shelfHeight + 10)} fill="none" stroke="#333" strokeWidth="1.5" />
              {/* الرفوف */}
              {Array.from({ length: shelvesPerBay }).map((_, shelfIdx) => {
                const y = 30 + shelfIdx * (shelfHeight + 10);
                return (
                  <g key={shelfIdx}>
                    <rect x={x + 2} y={y} width={bayWidth - 8} height={shelfHeight} fill="#d4e6f1" stroke="#2980b9" />
                    <text x={x + bayWidth/2 - 2} y={y + shelfHeight/2 + 4} fontSize="10" textAnchor="middle">
                      {`رف ${shelfIdx+1} (${cartonsPerShelf} كرتونة)`}
                    </text>
                  </g>
                );
              })}
              <text x={x + bayWidth/2 - 2} y={20} fontSize="10" textAnchor="middle">باي {bayIdx+1}</text>
            </g>
          );
        })}

        {/* أبعاد ارتفاعية توضيحية */}
        <line x1="10" y1="30" x2="10" y2={30 + shelvesPerBay * (shelfHeight + 10)} stroke="#e8b830" strokeWidth="2" />
        <text x="0" y={30 + (shelvesPerBay * (shelfHeight + 10))/2} fontSize="11" transform={`rotate(-90, 0, ${30 + (shelvesPerBay * (shelfHeight + 10))/2})`}>
          {`${shelvesPerBay * 0.5} م (تقديري)`}
        </text>
      </svg>
      <p className="text-sm mt-2 text-gray-600">* المنظر يوضح جانباً واحداً ( {baysPerSide} باي) مع {shelvesPerBay} مستويات لكل باي.</p>
    </div>
  );
}
