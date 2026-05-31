import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../config/firebase.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import Icon from '../../ui/Icon.jsx';

const ASSET_TYPES = ["جهاز حاسوب", "هاتف", "مركبة", "مكتب", "طابعة", "شاشة", "جهاز لوحي", "أثاث مكتبي", "معدات مستودع", "أخرى"];
const CONDITIONS = [
  { key: "ممتاز", label: "ممتاز", cls: "bg-green-100 text-green-800" },
  { key: "جيد", label: "جيد", cls: "bg-blue-100 text-blue-800" },
  { key: "يحتاج صيانة", label: "يحتاج صيانة", cls: "bg-orange-100 text-orange-800" },
  { key: "معطّل", label: "معطّل", cls: "bg-red-100 text-red-800" },
  { key: "مستهلك", label: "مستهلك", cls: "bg-gray-100 text-gray-800" }
];

const AssetsInventory = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [formData, setFormData] = useState({
    assetType: ASSET_TYPES[0],
    assetName: "",
    brand: "",
    model: "",
    serialNumber: "",
    quantity: 1,
    condition: "ممتاز",
    assignedTo: "",
    department: "",
    section: "",
    location: "",
    purchaseDate: "",
    notes: ""
  });
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterCond, setFilterCond] = useState("");
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Sync with Firebase & LocalStorage
  useEffect(() => {
    const q = query(collection(db, 'assetsInventory'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAssets(docs);
        localStorage.setItem('brandzo_assets_inventory_v1', JSON.stringify(docs));
        setLoading(false);
        setIsOffline(false);
        window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: true } }));
      },
      (error) => {
        console.error("Firebase error:", error);
        const saved = localStorage.getItem('brandzo_assets_inventory_v1');
        if (saved) {
          setAssets(JSON.parse(saved));
        }
        setLoading(false);
        setIsOffline(true);
        window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: false } }));
      }
    );

    return () => unsubscribe();
  }, []);

  const flashToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const assetRef = doc(db, 'assetsInventory', editingId);
        await updateDoc(assetRef, { ...formData, updatedAt: serverTimestamp() });
        flashToast("تم تحديث الأصل بنجاح");
      } else {
        await addDoc(collection(db, 'assetsInventory'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        flashToast("تم إضافة الأصل بنجاح");
      }
      setFormData({
        assetType: ASSET_TYPES[0],
        assetName: "",
        brand: "",
        model: "",
        serialNumber: "",
        quantity: 1,
        condition: "ممتاز",
        assignedTo: "",
        department: "",
        section: "",
        location: "",
        purchaseDate: "",
        notes: ""
      });
      setEditingId(null);
    } catch (error) {
      console.error("Error saving asset:", error);
      // Fallback for offline saving
      const newAssets = editingId
        ? assets.map(a => a.id === editingId ? { ...a, ...formData } : a)
        : [{ ...formData, id: Date.now().toString(), createdAt: new Date().toISOString() }, ...assets];

      setAssets(newAssets);
      localStorage.setItem('brandzo_assets_inventory_v1', JSON.stringify(newAssets));
      flashToast(editingId ? "تم التحديث محلياً" : "تم الإضافة محلياً", "warning");
      setEditingId(null);
    }
  };

  const handleEdit = (asset) => {
    setFormData({
      assetType: asset.assetType,
      assetName: asset.assetName,
      brand: asset.brand || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      quantity: asset.quantity || 1,
      condition: asset.condition || "ممتاز",
      assignedTo: asset.assignedTo || "",
      department: asset.department || "",
      section: asset.section || "",
      location: asset.location || "",
      purchaseDate: asset.purchaseDate || "",
      notes: asset.notes || ""
    });
    setEditingId(asset.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الأصل؟")) return;
    try {
      await deleteDoc(doc(db, 'assetsInventory', id));
      flashToast("تم حذف الأصل بنجاح");
    } catch (error) {
      const newAssets = assets.filter(a => a.id !== id);
      setAssets(newAssets);
      localStorage.setItem('brandzo_assets_inventory_v1', JSON.stringify(newAssets));
      flashToast("تم الحذف محلياً", "warning");
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      total: assets.length,
      assigned: new Set(assets.map(a => a.assignedTo).filter(Boolean)).size,
      types: new Set(assets.map(a => a.assetType)).size,
      maintenance: assets.filter(a => a.condition === "يحتاج صيانة").length
    };
  }, [assets]);

  // Filtering
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = Object.values(asset).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesType = !filterType || asset.assetType === filterType;
      const matchesDept = !filterDept || asset.department === filterDept;
      const matchesCond = !filterCond || asset.condition === filterCond;
      return matchesSearch && matchesType && matchesDept && matchesCond;
    });
  }, [assets, searchTerm, filterType, filterDept, filterCond]);

  // Pagination
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, currentPage]);

  const totalPages = Math.ceil(filteredAssets.length / pageSize);

  // Export Logic (Placeholder for next step)
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const ws_data = filteredAssets.map((a, i) => ({
      "م": i + 1,
      "النوع": a.assetType,
      "اسم الأصل": a.assetName,
      "الماركة": a.brand,
      "الموديل/السيريال": a.model || a.serialNumber,
      "الكمية": a.quantity,
      "الحالة": a.condition,
      "المسؤول": a.assignedTo,
      "الإدارة": a.department,
      "القسم": a.section,
      "الموقع": a.location,
      "تاريخ الاستلام": a.purchaseDate,
      "ملاحظات": a.notes
    }));

    const ws = XLSX.utils.json_to_sheet(ws_data);

    // Pivot summary sheet
    const summaryData = [];
    const depts = [...new Set(filteredAssets.map(a => a.department))];
    const types = [...new Set(filteredAssets.map(a => a.assetType))];

    depts.forEach(d => {
      types.forEach(t => {
        const count = filteredAssets.filter(a => a.department === d && a.assetType === t).length;
        if (count > 0) {
          summaryData.push({ "الإدارة": d, "النوع": t, "العدد": count });
        }
      });
    });
    const ws_summary = XLSX.utils.json_to_sheet(summaryData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "جرد الأصول");
    XLSX.utils.book_append_sheet(wb, ws_summary, "ملخص إحصائي");

    XLSX.writeFile(wb, `Brandzo_Assets_${new Date().toISOString().split('T')[0]}.xlsx`);
    flashToast("تم تصدير ملف Excel");
  };

  const exportPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.createElement('div');
    element.dir = 'rtl';
    element.style.fontFamily = 'Cairo, sans-serif';
    element.style.padding = '20px';

    const header = `
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #c0392b; padding-bottom: 10px;">
        <h1 style="color: #1a1a2e; margin: 0;">شركة برانزو — كشف جرد الأصول</h1>
        <p style="color: #666; margin: 5px 0;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
      </div>
    `;

    const tableClone = document.getElementById('assets-table-container').cloneNode(true);
    // Remove "Actions" column from PDF
    const actionTh = tableClone.querySelector('th.no-print');
    if (actionTh) actionTh.remove();
    tableClone.querySelectorAll('td.no-print').forEach(td => td.remove());

    element.innerHTML = header + tableClone.innerHTML;

    const opt = {
      margin: 10,
      filename: `Brandzo_Assets_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      flashToast("تم تحميل ملف PDF بنجاح");
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl z-50 animate-bounce font-bold text-white ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'warning' ? 'bg-yellow-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الأصول", value: stats.total, color: "from-brand-navy to-blue-900", icon: "📦" },
          { label: "الموظفين المعيّنين", value: stats.assigned, color: "from-green-700 to-green-900", icon: "👥" },
          { label: "عدد الأنواع", value: stats.types, color: "from-brand-yellow to-yellow-700", icon: "🏷️" },
          { label: "أصول تحتاج صيانة", value: stats.maintenance, color: "from-brand-red to-red-900", icon: "🛠️" }
        ].map((s, i) => (
          <div key={i} className={`bg-gradient-to-br ${s.color} p-6 rounded-2xl border border-white/10 shadow-lg text-white`}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Form Section */}
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 shadow-xl">
        <h3 className="text-xl font-bold text-brand-yellow mb-6 flex items-center gap-2">
          <Icon name="clipboardList" className="text-brand-red" />
          {editingId ? "تعديل أصل" : "إضافة أصل جديد للمنظومة"}
        </h3>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-gray-200">نوع الأصل *</label>
            <select
              required
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.assetType}
              onChange={e => setFormData({...formData, assetType: e.target.value})}
            >
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">اسم/وصف الأصل *</label>
            <input
              required
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.assetName}
              onChange={e => setFormData({...formData, assetName: e.target.value})}
              placeholder="مثلاً: لابتوب ديل 15 بوصة"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الماركة</label>
            <input
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.brand}
              onChange={e => setFormData({...formData, brand: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الموديل / السيريال</label>
            <input
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.model}
              onChange={e => setFormData({...formData, model: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الكمية</label>
            <input
              type="number"
              min="1"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.quantity}
              onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الحالة</label>
            <select
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.condition}
              onChange={e => setFormData({...formData, condition: e.target.value})}
            >
              {CONDITIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">المسؤول / المستلم *</label>
            <input
              required
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.assignedTo}
              onChange={e => setFormData({...formData, assignedTo: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الإدارة *</label>
            <input
              required
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.department}
              onChange={e => setFormData({...formData, department: e.target.value})}
              placeholder="مثلاً: المستودعات"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">القسم</label>
            <input
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.section}
              onChange={e => setFormData({...formData, section: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">الموقع / المبنى</label>
            <input
              type="text"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-200">تاريخ الاستلام</label>
            <input
              type="date"
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow"
              value={formData.purchaseDate}
              onChange={e => setFormData({...formData, purchaseDate: e.target.value})}
            />
          </div>

          <div className="md:col-span-3 lg:col-span-1 space-y-2">
            <label className="text-sm text-gray-200">ملاحظات</label>
            <textarea
              className="w-full bg-brand-navy border border-white/20 rounded-lg p-2 text-white outline-none focus:border-brand-yellow h-10"
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            ></textarea>
          </div>

          <div className="md:col-span-3 lg:col-span-4 flex gap-2 mt-4">
            <button
              type="submit"
              className="px-8 py-2 bg-brand-red text-white font-bold rounded-lg hover:bg-red-700 transition-all active:scale-95"
            >
              {editingId ? "حفظ التعديلات" : "حفظ الأصل"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    assetType: ASSET_TYPES[0],
                    assetName: "", brand: "", model: "", serialNumber: "",
                    quantity: 1, condition: "ممتاز", assignedTo: "",
                    department: "", section: "", location: "",
                    purchaseDate: "", notes: ""
                  });
                }}
                className="px-8 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-all"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Table Section */}
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/10 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 flex-1">
            <input
              type="text"
              placeholder="بحث شامل في كل الحقول..."
              className="bg-brand-navy border border-white/20 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow w-full md:w-64"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select
              className="bg-brand-navy border border-white/20 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">كل الأنواع</option>
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="bg-brand-navy border border-white/20 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow"
              value={filterCond}
              onChange={e => setFilterCond(e.target.value)}
            >
              <option value="">كل الحالات</option>
              {CONDITIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-all text-sm font-bold">
              📊 Excel
            </button>
            <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-all text-sm font-bold">
              📄 PDF
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-brand-navy border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all text-sm font-bold">
              🖨️ طباعة
            </button>
          </div>
        </div>

        <div id="assets-table-container" className="overflow-x-auto w-full">
          <table className="w-full text-right border-collapse min-w-[1000px]">
            <thead className="bg-white/10 text-brand-yellow">
              <tr>
                <th className="p-4 border-b border-white/10">م</th>
                <th className="p-4 border-b border-white/10">النوع</th>
                <th className="p-4 border-b border-white/10">الاسم</th>
                <th className="p-4 border-b border-white/10">الموديل/السيريال</th>
                <th className="p-4 border-b border-white/10">الكمية</th>
                <th className="p-4 border-b border-white/10">الحالة</th>
                <th className="p-4 border-b border-white/10">المسؤول</th>
                <th className="p-4 border-b border-white/10">الإدارة</th>
                <th className="p-4 border-b border-white/10">الموقع</th>
                <th className="p-4 border-b border-white/10 no-print">إجراءات</th>
              </tr>
            </thead>
            <tbody className="text-gray-100">
              {loading ? (
                <tr><td colSpan="10" className="p-10 text-center animate-pulse">جاري تحميل جرد الأصول...</td></tr>
              ) : paginatedAssets.length === 0 ? (
                <tr><td colSpan="10" className="p-10 text-center opacity-50 italic">لا توجد بيانات مطابقة</td></tr>
              ) : paginatedAssets.map((asset, idx) => (
                <tr key={asset.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="p-4">{asset.assetType}</td>
                  <td className="p-4 font-bold">{asset.assetName}</td>
                  <td className="p-4 text-sm opacity-80">{asset.model || asset.serialNumber || "-"}</td>
                  <td className="p-4">{asset.quantity}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${CONDITIONS.find(c => c.key === asset.condition)?.cls || 'bg-gray-100 text-gray-800'}`}>
                      {asset.condition}
                    </span>
                  </td>
                  <td className="p-4">{asset.assignedTo}</td>
                  <td className="p-4">{asset.department}</td>
                  <td className="p-4 text-xs opacity-70">{asset.location || "-"}</td>
                  <td className="p-4 no-print">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(asset)} className="p-2 text-blue-400 hover:bg-blue-400/20 rounded-lg transition-all" title="تعديل">✏️</button>
                      <button onClick={() => handleDelete(asset.id)} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition-all" title="حذف">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-6 border-t border-white/10 flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 rounded-lg font-bold transition-all ${
                  currentPage === page ? 'bg-brand-red text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print, header, footer, aside, button, form, .pagination { display: none !important; }
          body { background: white !important; color: black !important; }
          .bg-white\\/5 { background: white !important; border: 1px solid #eee !important; }
          .text-white, .text-gray-100, .text-gray-200 { color: black !important; }
          .text-brand-yellow { color: #1a1a2e !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #ddd !important; color: black !important; padding: 8px !important; font-size: 10pt !important; }
          .rounded-full { border: 1px solid #ccc !important; padding: 2px 8px !important; }
          #assets-table-container { overflow: visible !important; }
        }
      `}</style>
    </div>
  );
};

export default AssetsInventory;
