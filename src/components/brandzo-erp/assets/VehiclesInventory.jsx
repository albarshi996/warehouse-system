import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../config/firebase.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import Icon from '../../ui/Icon.jsx';

const VEHICLE_TYPES = ["شاحنة توزيع كبيرة", "شاحنة توزيع متوسطة", "فان توزيع", "بيك آب", "سيارة إدارية", "رافعة شوكية (فوركليفت)", "جرار مستودع", "عربة يدوية كهربائية", "أخرى"];
const FUEL_TYPES = ["بنزين", "ديزل", "كهربائي", "هجين"];
const PURPOSES = ["توزيع", "إدارة", "نقل موظفين", "صيانة", "أخرى"];
const CONDITIONS = ["ممتازة", "جيدة", "تحتاج صيانة بسيطة", "تحتاج صيانة عاجلة", "خارج الخدمة"];

const VehiclesInventory = () => {
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [view, setView] = useState('grid');
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const initialForm = {
    vehicleType: VEHICLE_TYPES[0],
    brand: "", model: "", year: new Date().getFullYear(), color: "#ffffff",
    plateNumber: "", chassisNumber: "", engineNumber: "",
    fuelType: "ديزل", registrationExpiry: "", insuranceExpiry: "",
    assignedTo: "", department: "", purpose: "توزيع", odometerReading: 0,
    handoverDate: "", handoverOfficer: "",
    overallCondition: "ممتازة",
    exteriorChecklist: {
      frontBumper: "سليم", rearBumper: "سليم", hood: "سليم", trunk: "سليم",
      roofPanel: "سليم", leftFront: "سليم", leftRear: "سليم", rightFront: "سليم", rightRear: "سليم",
      windshield: "سليم", rearWindow: "سليم", leftMirror: "سليم", rightMirror: "سليم", allLights: "سليم"
    },
    interiorChecklist: {
      dashboard: "سليم", seats: "سليم", seatbelts: "سليم", steeringWheel: "سليم",
      airConditioning: "سليم", radio: "سليم", windows: "سليم", floorMats: "سليم", trunk_interior: "سليم"
    },
    mechanicalChecklist: {
      engineOil: "ممتاز", brakeFluid: "ممتاز", coolant: "ممتاز", transmission: "ممتاز",
      brakes: "ممتاز", tires: "ممتاز", spare_tire: "ممتاز", battery: "ممتاز", exhaust: "ممتاز"
    },
    damageNotes: "", notes: "", receiverSignature: ""
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    const q = query(collection(db, 'vehiclesInventory'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVehicles(docs);
      localStorage.setItem('brandzo_vehicles_v1', JSON.stringify(docs));
      setLoading(false);
      window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: true } }));
    }, (error) => {
      const saved = localStorage.getItem('brandzo_vehicles_v1');
      if (saved) setVehicles(JSON.parse(saved));
      setLoading(false);
      window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: false } }));
    });
    return () => unsubscribe();
  }, []);

  const flashToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validateStep = (s) => {
    if (s === 1) return formData.plateNumber && formData.chassisNumber;
    if (s === 2) return formData.assignedTo;
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep(step + 1);
    else flashToast("يرجى إكمال الحقول الإلزامية", "error");
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = async () => {
    try {
      if (editingId) {
        await updateDoc(doc(db, 'vehiclesInventory', editingId), { ...formData, updatedAt: serverTimestamp() });
        flashToast("تم تحديث بيانات المركبة");
      } else {
        await addDoc(collection(db, 'vehiclesInventory'), { ...formData, createdAt: serverTimestamp() });
        flashToast("تم إضافة المركبة بنجاح");
      }
      setFormData(initialForm);
      setEditingId(null);
      setStep(1);
    } catch (e) {
      flashToast("حدث خطأ أثناء الحفظ", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه المركبة؟")) return;
    try {
      await deleteDoc(doc(db, 'vehiclesInventory', id));
      flashToast("تم الحذف بنجاح");
    } catch (e) {
      flashToast("حدث خطأ أثناء الحذف", "error");
    }
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const ws_data = filteredVehicles.map((v, i) => ({
      "م": i + 1,
      "اللوحة": v.plateNumber,
      "الشاسيه": v.chassisNumber,
      "النوع": v.vehicleType,
      "الماركة": v.brand,
      "الموديل": v.model,
      "السنة": v.year,
      "المستلم": v.assignedTo,
      "الإدارة": v.department,
      "العداد": v.odometerReading,
      "الحالة": v.overallCondition
    }));
    const ws = XLSX.utils.json_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "جرد المركبات");
    XLSX.writeFile(wb, `Brandzo_Vehicles_${new Date().toISOString().split('T')[0]}.xlsx`);
    flashToast("تم تصدير ملف Excel");
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v =>
      v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.brand.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vehicles, searchTerm]);

  const renderStep1 = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
      <div className="space-y-2">
        <label className="text-sm text-gray-200">نوع المركبة</label>
        <select className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.vehicleType} onChange={e => setFormData({...formData, vehicleType: e.target.value})}>
          {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">الماركة</label>
        <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} placeholder="مثلاً: Toyota" />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">الموديل</label>
        <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} placeholder="مثلاً: Hilux" />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">رقم اللوحة *</label>
        <input required type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white border-brand-yellow/50" value={formData.plateNumber} onChange={e => setFormData({...formData, plateNumber: e.target.value})} placeholder="رقم اللوحة" />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">رقم الشاسيه (VIN) *</label>
        <input required type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white border-brand-yellow/50" value={formData.chassisNumber} onChange={e => setFormData({...formData, chassisNumber: e.target.value})} placeholder="17 حرفاً" />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">سنة الصنع</label>
        <input type="number" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.year} onChange={e => setFormData({...formData, year: +e.target.value})} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">تاريخ انتهاء الترخيص</label>
        <input type="date" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.registrationExpiry} onChange={e => setFormData({...formData, registrationExpiry: e.target.value})} />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
      <div className="space-y-2">
        <label className="text-sm text-gray-200">اسم المستلم / السائق الرئيسي *</label>
        <input required type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white border-brand-yellow/50" value={formData.assignedTo} onChange={e => setFormData({...formData, assignedTo: e.target.value})} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">الإدارة</label>
        <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">غرض الاستخدام</label>
        <select className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})}>
          {PURPOSES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">قراءة العداد (كم)</label>
        <input type="number" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.odometerReading} onChange={e => setFormData({...formData, odometerReading: +e.target.value})} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">تاريخ التسليم</label>
        <input type="date" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.handoverDate} onChange={e => setFormData({...formData, handoverDate: e.target.value})} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-200">مسؤول التسليم</label>
        <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.handoverOfficer} onChange={e => setFormData({...formData, handoverOfficer: e.target.value})} />
      </div>
    </div>
  );

  const renderStep3 = () => {
    const statusColors = { "سليم": "text-green-400", "خدش بسيط": "text-yellow-400", "تلف": "text-orange-500", "مكسور": "text-red-500" };
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
          <h4 className="font-bold text-brand-yellow mb-4">تفتيش الهيكل الخارجي (محاكاة المسقط العلوي)</h4>
          <div className="flex flex-col md:flex-row items-center gap-10">
            <svg viewBox="0 0 200 400" width="150" className="drop-shadow-2xl">
               <rect x="40" y="20" width="120" height="360" rx="20" fill="#1e293b" stroke="white" strokeWidth="2" />
               <rect x="50" y="60" width="100" height="80" rx="5" fill="#334155" />
               <rect x="50" y="280" width="100" height="70" rx="5" fill="#334155" />
               <circle cx="60" cy="40" r="8" fill="white" fillOpacity="0.8" />
               <circle cx="140" cy="40" r="8" fill="white" fillOpacity="0.8" />
               <rect x="50" y="370" width="20" height="5" fill="red" />
               <rect x="130" y="370" width="20" height="5" fill="red" />
               <rect x="25" y="100" width="15" height="30" rx="5" fill="#1e293b" />
               <rect x="160" y="100" width="15" height="30" rx="5" fill="#1e293b" />
            </svg>
            <div className="grid grid-cols-2 gap-4 flex-1">
              {Object.keys(formData.exteriorChecklist).map(key => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] text-gray-400 uppercase">{key}</label>
                  <select className={`w-full bg-brand-navy border border-white/20 rounded-lg p-1 text-xs outline-none ${statusColors[formData.exteriorChecklist[key]]}`} value={formData.exteriorChecklist[key]} onChange={e => setFormData({...formData, exteriorChecklist: {...formData.exteriorChecklist, [key]: e.target.value}})}>
                    {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
            <h4 className="font-bold text-brand-yellow mb-4">تفتيش المقصورة الداخلية</h4>
            <div className="space-y-3">
              {Object.keys(formData.interiorChecklist).map(key => (
                <div key={key} className="flex items-center justify-between">
                   <span className="text-sm text-gray-200">{key}</span>
                   <select className="bg-brand-navy border border-white/20 rounded p-1 text-xs" value={formData.interiorChecklist[key]} onChange={e => setFormData({...formData, interiorChecklist: {...formData.interiorChecklist, [key]: e.target.value}})}>
                     <option>سليم</option><option>يحتاج صيانة</option><option>معطّل</option>
                   </select>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
            <h4 className="font-bold text-brand-yellow mb-4">تفتيش المحرك والميكانيك</h4>
            <div className="space-y-3">
              {Object.keys(formData.mechanicalChecklist).map(key => (
                <div key={key} className="flex items-center justify-between">
                   <span className="text-sm text-gray-200">{key}</span>
                   <select className="bg-brand-navy border border-white/20 rounded p-1 text-xs" value={formData.mechanicalChecklist[key]} onChange={e => setFormData({...formData, mechanicalChecklist: {...formData.mechanicalChecklist, [key]: e.target.value}})}>
                     <option>ممتاز</option><option>مقبول</option><option>يحتاج تدخل</option>
                   </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <label className="text-sm text-gray-200">وصف تفصيلي للأضرار الموجودة</label>
        <textarea className="w-full bg-brand-navy border border-white/20 rounded-xl p-4 text-white h-32" value={formData.damageNotes} onChange={e => setFormData({...formData, damageNotes: e.target.value})} placeholder="اذكر أي ملاحظات إضافية حول حالة الهيكل أو المحرك..."></textarea>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-gray-200">الحالة العامة للمركبة</label>
          <select className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.overallCondition} onChange={e => setFormData({...formData, overallCondition: e.target.value})}>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-200">إقرار المستلم (الاسم الثلاثي)</label>
          <input type="text" className="w-full bg-brand-navy border border-white/20 rounded-xl p-3 text-white" value={formData.receiverSignature} onChange={e => setFormData({...formData, receiverSignature: e.target.value})} placeholder="أقر بصحة البيانات أعلاه..." />
        </div>
      </div>
    </div>
  );

  const renderVehiclesList = () => (
    <div className="space-y-6 animate-fade-in">
       <div className="flex flex-wrap justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 gap-4">
          <div className="flex flex-wrap gap-4 items-center">
             <input type="text" placeholder="بحث باللوحة أو المستلم..." className="bg-brand-navy border border-white/20 rounded-lg px-4 py-2 text-white text-sm w-64" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
             <button onClick={exportExcel} className="px-4 py-2 bg-green-700 text-white rounded-lg text-xs font-bold hover:bg-green-800 transition-all">Excel</button>
             <div className="flex bg-brand-navy rounded-lg p-1 border border-white/10">
                <button onClick={() => setView('grid')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${view === 'grid' ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-white'}`}>الشبكة</button>
                <button onClick={() => setView('table')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${view === 'table' ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-white'}`}>الجدول</button>
             </div>
          </div>
          <button onClick={() => { setEditingId(null); setFormData(initialForm); setStep(1); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="px-6 py-2 bg-brand-red text-white rounded-xl font-bold hover:bg-red-700 transition-all flex items-center gap-2">
             <Icon name="package" size={18} /> إضافة مركبة جديدة
          </button>
       </div>
       {view === 'grid' ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVehicles.map(v => (
              <div key={v.id} className="bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-all relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-4xl">🚛</div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-white">{v.plateNumber}</div>
                    <div className="text-xs text-gray-400">{v.brand} {v.model}</div>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm"><span className="text-gray-400">المستلم:</span><span className="text-white font-bold">{v.assignedTo}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400">الحالة:</span><span className={`font-bold ${v.overallCondition === 'ممتازة' ? 'text-green-400' : 'text-brand-yellow'}`}>{v.overallCondition}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedVehicle(v)} className="flex-1 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20 transition-all">التفاصيل</button>
                  <button onClick={() => { setFormData(v); setEditingId(v.id); setStep(1); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="p-2 bg-blue-600/20 text-blue-400 rounded-xl hover:bg-blue-600/40">✏️</button>
                  <button onClick={() => handleDelete(v.id)} className="p-2 bg-red-600/20 text-red-400 rounded-xl hover:bg-red-600/40">🗑️</button>
                </div>
              </div>
            ))}
         </div>
       ) : (
         <div className="bg-white/5 border border-white/10 rounded-3xl overflow-x-auto"><table className="w-full text-right"><thead className="bg-white/10 text-brand-yellow"><tr><th className="p-4">اللوحة</th><th className="p-4">الماركة</th><th className="p-4">المستلم</th><th className="p-4">الحالة</th><th className="p-4">الإجراءات</th></tr></thead><tbody className="text-white divide-y divide-white/5">{filteredVehicles.map(v => (<tr key={v.id} className="hover:bg-white/5 transition-all"><td className="p-4 font-bold">{v.plateNumber}</td><td className="p-4">{v.brand} {v.model}</td><td className="p-4">{v.assignedTo}</td><td className="p-4">{v.overallCondition}</td><td className="p-4"><div className="flex gap-2"><button onClick={() => setSelectedVehicle(v)} className="text-blue-400 hover:underline text-xs">عرض</button><button onClick={() => { setFormData(v); setEditingId(v.id); setStep(1); }} className="text-green-400 hover:underline text-xs">تعديل</button></div></td></tr>))}</tbody></table></div>
       )}
    </div>
  );

  return (
    <div className="space-y-8 pb-20" dir="rtl">
      {toast && <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl z-50 font-bold text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.message}</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center"><div className="text-3xl mb-2">🚗</div><div className="text-2xl font-bold text-white">{vehicles.length}</div><div className="text-xs text-gray-400">إجمالي المركبات</div></div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center border-green-500/30"><div className="text-3xl mb-2">✅</div><div className="text-2xl font-bold text-green-400">{vehicles.filter(v => v.overallCondition === "ممتازة").length}</div><div className="text-xs text-gray-400">حالة ممتازة</div></div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center border-brand-yellow/30"><div className="text-3xl mb-2">⚠️</div><div className="text-2xl font-bold text-brand-yellow">{vehicles.filter(v => v.overallCondition.includes("صيانة")).length}</div><div className="text-xs text-gray-400">تحتاج صيانة</div></div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center border-red-500/30"><div className="text-3xl mb-2">🔔</div><div className="text-2xl font-bold text-red-400">0</div><div className="text-xs text-gray-400">تراخيص منتهية</div></div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl relative">
        <div className="flex justify-between items-center mb-10"><h3 className="text-2xl font-bold text-white flex items-center gap-3"><div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center text-xl">📋</div>{editingId ? "تحديث بيانات المركبة" : "نموذج جرد وتفتيش مركبة"}</h3><div className="flex gap-2">{[1, 2, 3, 4].map(s => (<div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all ${step >= s ? 'bg-brand-yellow text-brand-navy' : 'bg-white/10 text-gray-500'}`}>{s}</div>))}</div></div>
        <div className="min-h-[300px]">{step === 1 && renderStep1()}{step === 2 && renderStep2()}{step === 3 && renderStep3()}{step === 4 && renderStep4()}</div>
        <div className="mt-10 pt-6 border-t border-white/10 flex justify-between">{step > 1 && <button onClick={prevStep} className="px-8 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20">السابق</button>}<div className="mr-auto flex gap-3">{step < 4 ? (<button onClick={nextStep} className="px-10 py-3 bg-brand-yellow text-brand-navy rounded-xl font-bold hover:bg-yellow-500 shadow-lg shadow-brand-yellow/20 active:scale-95">التالي</button>) : (<button onClick={handleSubmit} className="px-10 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-900/20 active:scale-95">حفظ وإتمام التفتيش</button>)}</div></div>
      </div>
      <div className="mt-12"><h3 className="text-2xl font-bold text-white mb-6 border-r-4 border-brand-red pr-4">قائمة المركبات المرصودة</h3>{renderVehiclesList()}</div>
      {selectedVehicle && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-brand-navy border border-white/10 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8 relative">
              <button onClick={() => setSelectedVehicle(null)} className="absolute top-6 left-6 text-gray-400 hover:text-white text-2xl">✕</button>
              <h2 className="text-3xl font-bold text-white mb-6">تفاصيل المركبة: {selectedVehicle.plateNumber}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-white">
                 <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                       <h4 className="text-brand-yellow font-bold mb-2">البيانات الأساسية</h4>
                       <p className="text-sm opacity-80">النوع: {selectedVehicle.vehicleType}</p>
                       <p className="text-sm opacity-80">الماركة: {selectedVehicle.brand}</p>
                       <p className="text-sm opacity-80">الموديل: {selectedVehicle.model} ({selectedVehicle.year})</p>
                       <p className="text-sm opacity-80">رقم الشاسيه: {selectedVehicle.chassisNumber}</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                       <h4 className="text-brand-yellow font-bold mb-2">بيانات التسليم</h4>
                       <p className="text-sm opacity-80">المستلم: {selectedVehicle.assignedTo}</p>
                       <p className="text-sm opacity-80">تاريخ التسليم: {selectedVehicle.handoverDate}</p>
                       <p className="text-sm opacity-80">الحالة العامة: <span className="font-bold text-green-400">{selectedVehicle.overallCondition}</span></p>
                    </div>
                 </div>
              </div>
              <div className="mt-10 flex gap-4 no-print">
                 <button onClick={() => window.print()} className="px-8 py-3 bg-brand-red text-white rounded-xl font-bold">🖨️ طباعة الاستمارة</button>
                 <button onClick={() => setSelectedVehicle(null)} className="px-8 py-3 bg-white/10 text-white rounded-xl font-bold">إغلاق</button>
              </div>
              <div className="hidden print:block text-black bg-white p-10 mt-10 rounded-xl" dir="rtl">
                 <h1 className="text-2xl font-bold text-center border-b pb-4 mb-4">استمارة تسليم مركبة - شركة برانزو</h1>
                 <div className="grid grid-cols-2 gap-4">
                    <p>المركبة: {selectedVehicle.brand} {selectedVehicle.model}</p>
                    <p>رقم اللوحة: {selectedVehicle.plateNumber}</p>
                    <p>المستلم: {selectedVehicle.assignedTo}</p>
                    <p>تاريخ التسليم: {selectedVehicle.handoverDate}</p>
                 </div>
                 <div className="mt-10 border-t pt-4">
                    <p className="font-bold">ملاحظات الحالة:</p>
                    <p>{selectedVehicle.damageNotes || "لا توجد ملاحظات"}</p>
                 </div>
                 <div className="mt-20 flex justify-between">
                    <div>توقيع المستلم: ..........................</div>
                    <div>توقيع المسؤول: ..........................</div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default VehiclesInventory;
