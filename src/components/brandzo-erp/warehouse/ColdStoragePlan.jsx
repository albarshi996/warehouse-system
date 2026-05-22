import React, { useState } from 'react';

const TOTAL_UNITS = 19;
const AREA_PER_UNIT = 63; // m2
const BAYS_PER_UNIT = 24;
const SHELVES_PER_BAY = 3;
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

  const totalArea = TOTAL_UNITS * AREA_PER_UNIT; // 1197
  const totalBays = TOTAL_UNITS * BAYS_PER_UNIT; // 456
  const totalShelves = totalBays * SHELVES_PER_BAY; // 1368
  const totalCartons = totalShelves * CARTONS_PER_SHELF; // 5472

  function updateSelected(changes) {
    setUnits((u) => u.map(item => item.id === selected ? { ...item, ...changes } : item));
  }

  const selUnit = units.find(u => u.id === selected);

  return (
    <div dir="rtl" className="p-6" style={{fontFamily:'Cairo'}}>
      <h1 className="t-h2 mb-4">مخطط مجمع التبريد — الرحبة (Cosmetics)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-4">
          <h3 className="t-h3">الملخص التنفيذي</h3>
          <p className="t-body mt-2">الثلاجة الواحدة مساحتها 63 متر ونحن لدينا 19 ثلاجة في المجمع</p>
          <ul className="mt-3 space-y-1 t-body">
            <li>إجمالي مساحة المجمع: <strong>{totalArea} م²</strong></li>
            <li>إجمالي حاملات الرفوف: <strong>{totalBays} حامل</strong></li>
            <li>إجمالي مواقع الرفوف: <strong>{totalShelves} رف</strong></li>
            <li>سعة الصناديق المقدرة: <strong>{totalCartons} صندوق</strong></li>
          </ul>
        </div>

        <div className="glass-card p-4 lg:col-span-2">
          <h3 className="t-h3">مخطط ثلاجة مفردة (9m × 7m)</h3>
          <div className="mt-3 flex flex-col lg:flex-row gap-4 items-start">
            <div style={{flex:'1 1 480px'}}>
              <svg viewBox="0 0 900 700" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floorplan">
                <defs>
                  <style>{`.rack{fill:#1a1a2e}.aisle{fill:#f1f3f5}.door{fill:#c0392b}.dim{fill:none;stroke:#e8b830;stroke-width:2}.label{font-family:Cairo;font-size:14px;fill:#111}`}</style>
                </defs>
                {/* outer rect = 9m x 7m scaled to 900x700 */}
                <rect x="10" y="10" width="880" height="680" fill="#fff" stroke="#ddd" />

                {/* main central aisle 1.2m wide along 9m length => scaled width = (1.2/7)*700 ≈ 120 */}
                <rect x="390" y="10" width="120" height="680" className="aisle" />

                {/* left and right zones racks: 6 rows each, perpendicular to aisle */}
                {Array.from({length:6}).map((_,i)=>{
                  const rowHeight = 100; // visual spacing
                  const gap = 10;
                  const y = 20 + i*( ( ( (680-40) - 5*gap) /6) );
                  return (
                    <rect key={`l${i}`} x={60} y={12 + i*105} width={240} height={80} className="rack" rx={6} />
                  )
                })}

                {Array.from({length:6}).map((_,i)=> (
                  <rect key={`r${i}`} x={600} y={12 + i*105} width={240} height={80} className="rack" rx={6} />
                ))}

                {/* door centered on short wall (7m wall) 1.2m wide -> scaled to ~120 px */}
                <rect x="390" y="690" width="120" height="20" className="door" />

                {/* dimension labels */}
                <line x1="10" y1="705" x2="890" y2="705" className="dim" />
                <text x="450" y="723" className="label" textAnchor="middle">9m</text>

                <line x1="895" y1="10" x2="895" y2="690" className="dim" />
                <text x="907" y="360" className="label" transform="rotate(90 907,360)">7m</text>

                <text x="450" y="40" className="label" textAnchor="middle">الممر المركزي 1.2m</text>
              </svg>
            </div>
            <div style={{minWidth:260}}>
              <div className="t-label">مواصفات الحامل</div>
              <ul className="mt-2 t-body">
                <li>عدد الحوامل لكل ثلاجة: <strong>{BAYS_PER_UNIT}</strong></li>
                <li>مستويات الرف لكل حامل: <strong>{SHELVES_PER_BAY}</strong></li>
                <li>السعة الصندوقية لكل رف: <strong>{CARTONS_PER_SHELF}</strong></li>
                <li>إجمالي الحوامل (المجمع): <strong>{totalBays}</strong></li>
                <li>إجمالي الرفوف (المجمع): <strong>{totalShelves}</strong></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-4">
          <h3 className="t-h3">شبكة الوحدات — المجمع ({TOTAL_UNITS})</h3>
          <div className="grid grid-cols-5 gap-2 mt-3">
            {units.map(u => (
              <button key={u.id} onClick={() => setSelected(u.id)} className={`p-3 rounded-lg text-sm border ${selected===u.id? 'border-brand-gold bg-brand-navy text-white':'border-gray-200 bg-white/5 text-gray-200'}`}>
                <div>الوحدة {u.id}</div>
                <div className="text-xs t-caption">{u.status}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-4 lg:col-span-2">
          <h3 className="t-h3">تفاصيل الوحدة المحددة — الوحدة {selUnit.id}</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="t-label">اسم الوحدة</label>
              <input className="w-full mt-2 p-2 rounded border" value={selUnit.name} onChange={(e)=> updateSelected({name:e.target.value})} />
            </div>
            <div>
              <label className="t-label">فئة المنتج</label>
              <select className="w-full mt-2 p-2 rounded border" value={selUnit.category} onChange={(e)=> updateSelected({category:e.target.value})}>
                {categories.map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="t-label">الحالة</label>
              <select className="w-full mt-2 p-2 rounded border" value={selUnit.status} onChange={(e)=> updateSelected({status:e.target.value})}>
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="t-label">ملاحظة</label>
              <textarea className="w-full mt-2 p-2 rounded border" rows={3} value={selUnit.note} onChange={(e)=> updateSelected({note:e.target.value})} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 mb-6">
        <h3 className="t-h3">ملخص الطاقة الاستيعابية</h3>
        <table className="w-full mt-3">
          <thead>
            <tr><th className="text-right">وصف</th><th className="text-right">القيمة</th></tr>
          </thead>
          <tbody>
            <tr><td className="text-right">إجمالي مساحة المجمع</td><td className="text-right">{totalArea} م²</td></tr>
            <tr><td className="text-right">إجمالي حاملات الرف</td><td className="text-right">{totalBays}</td></tr>
            <tr><td className="text-right">إجمالي مواقع الرف</td><td className="text-right">{totalShelves}</td></tr>
            <tr><td className="text-right">سعة الصناديق المقدرة</td><td className="text-right">{totalCartons}</td></tr>
            <tr><td className="text-right">نسبة الاستخدام (مثال)</td><td className="text-right">0%</td></tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={()=> window.print()} className="px-4 py-2 bg-brand-red text-white rounded">طباعة / تصدير</button>
        <button onClick={()=> alert('تم الحفظ محلياً')} className="px-4 py-2 bg-brand-navy text-white rounded">حفظ</button>
      </div>
    </div>
  );
}
