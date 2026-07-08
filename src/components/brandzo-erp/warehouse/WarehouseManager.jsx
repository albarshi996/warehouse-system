import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../config/firebase.js';

const STORAGE_KEY = 'brandzo_warehouses_local';

const WarehouseManager = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [formData, setFormData] = useState({ code: '', name: '', manager: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [offlineMode, setOfflineMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dispatch connection status
  const dispatchStatus = (isOnline) => {
    window.dispatchEvent(new CustomEvent('brandzo:db-status', { detail: { online: isOnline } }));
  };

  // 1. جلب البيانات في الوقت الحقيقي
  useEffect(() => {
    const q = query(collection(db, 'warehouses'), orderBy('code'));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const docs = [];
        querySnapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        setWarehouses(docs);
        setLoading(false);
        setOfflineMode(false);
        dispatchStatus(true);
      },
      (err) => {
        console.error("Firestore error:", err);
        setOfflineMode(true);
        dispatchStatus(false);
        // Load from localStorage
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
          setWarehouses(JSON.parse(localData));
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync localStorage when in offline mode
  useEffect(() => {
    if (offlineMode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(warehouses));
    }
  }, [warehouses, offlineMode]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'لديك تغييرات غير محفوظة. هل أنت متأكد من أنك تريد المغادرة؟';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 2. وظيفة الإضافة أو التعديل
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    try {
      setStatusMsg({ type: 'info', text: editingId ? 'جاري التعديل...' : 'جاري الحفظ...' });

      if (offlineMode) {
        if (editingId) {
          setWarehouses(warehouses.map(wh => wh.id === editingId ? { ...wh, ...formData } : wh));
        } else {
          const newWh = {
            id: crypto.randomUUID(),
            ...formData,
            status: 'نشط',
            createdAt: new Date().toISOString()
          };
          setWarehouses([...warehouses, newWh]);
        }
      } else {
        const whData = {
          code: formData.code,
          name: formData.name,
          manager: formData.manager,
          status: 'نشط',
          createdAt: serverTimestamp(),
        };

        if (editingId) {
          await updateDoc(doc(db, 'warehouses', editingId), whData);
        } else {
          await addDoc(collection(db, 'warehouses'), whData);
        }
      }

      setFormData({ code: '', name: '', manager: '' });
      setEditingId(null);
      setStatusMsg({ type: 'success', text: editingId ? 'تم تعديل المستودع بنجاح ✅' : 'تمت إضافة المستودع بنجاح ✅' });
      setHasUnsavedChanges(false);
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'فشل العملية: ' + error.message });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستودع؟')) return;

    try {
      if (offlineMode) {
        setWarehouses(warehouses.filter(wh => wh.id !== id));
      } else {
        await deleteDoc(doc(db, 'warehouses', id));
      }
      setStatusMsg({ type: 'success', text: 'تم حذف المستودع بنجاح' });
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'فشل الحذف: ' + error.message });
    }
  };

  const startEdit = (wh) => {
    setEditingId(wh.id);
    setFormData({ code: wh.code, name: wh.name, manager: wh.manager || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(warehouses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brandzo-warehouses-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (!Array.isArray(imported)) throw new Error('البيانات ليست مصفوفة');
          if (!imported.every(wh => wh.code)) throw new Error('بيانات غير صالحة: كود المستودع مطلوب');

          if (offlineMode) {
            setWarehouses(imported);
          } else {
            const batch = writeBatch(db);
            imported.forEach(wh => {
              const newDocRef = doc(collection(db, 'warehouses'));
              batch.set(newDocRef, {
                code: wh.code,
                name: wh.name || '',
                manager: wh.manager || '',
                status: wh.status || 'نشط',
                createdAt: serverTimestamp()
              });
            });
            await batch.commit();
          }
          setStatusMsg({ type: 'success', text: `تم استيراد ${imported.length} مستودع بنجاح` });
        } catch (err) {
          setStatusMsg({ type: 'error', text: 'فشل الاستيراد: ' + err.message });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleInputChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
    setHasUnsavedChanges(true);
  };

  return (
    <div className="font-['Cairo'] text-right" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-brand-navy">
          إدارة المستودعات (Warehouses)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg border border-gray-300 transition-all flex items-center gap-1"
          >
            📤 تصدير JSON
          </button>
          <button
            onClick={handleImport}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg border border-gray-300 transition-all flex items-center gap-1"
          >
            📥 استيراد JSON
          </button>
        </div>
      </div>

      {/* وضع العمل المحلي */}
      {offlineMode && (
        <div className="mb-4 p-4 bg-yellow-50 border-r-4 border-yellow-400 text-yellow-800 rounded-lg shadow-sm font-bold flex items-center gap-2">
          <span>⚠️ وضع عمل محلي — البيانات محفوظة على هذا الجهاز فقط</span>
        </div>
      )}

      {/* منطقة التنبيهات */}
      {statusMsg.text && (
        <div
          className={`mb-4 p-4 rounded-lg font-bold shadow-sm ${
            statusMsg.type === 'error'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : statusMsg.type === 'success'
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* نموذج الإضافة / التعديل */}
      <form
        onSubmit={handleSubmit}
        className="mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 transition-all"
      >
        <h3 className="text-lg font-bold mb-4 text-brand-red">
          {editingId ? 'تعديل بيانات المستودع' : 'إضافة مستودع جديد'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="كود المستودع (WH001)"
            className="border p-2 rounded focus:outline-none focus:ring-2 focus:ring-brand-red"
            value={formData.code}
            onChange={handleInputChange('code')}
            required
          />
          <input
            type="text"
            placeholder="اسم المستودع"
            className="border p-2 rounded focus:outline-none focus:ring-2 focus:ring-brand-red"
            value={formData.name}
            onChange={handleInputChange('name')}
            required
          />
          <input
            type="text"
            placeholder="المدير المسئول"
            className="border p-2 rounded focus:outline-none focus:ring-2 focus:ring-brand-red"
            value={formData.manager}
            onChange={handleInputChange('manager')}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-brand-red text-white px-4 py-2 rounded font-bold hover:bg-brand-red-dark transition-all shadow-md active:scale-95"
            >
              {editingId ? 'حفظ التعديلات' : 'إضافة مستودع'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setFormData({ code: '', name: '', manager: '' }); }}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded font-bold hover:bg-gray-300"
              >
                إلغاء
              </button>
            )}
          </div>
        </div>
      </form>

      {/* قائمة المستودعات */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-right text-sm border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 sm:p-4 font-bold text-gray-700 whitespace-nowrap">الكود</th>
                <th className="p-3 sm:p-4 font-bold text-gray-700">الاسم</th>
                <th className="p-3 sm:p-4 font-bold text-gray-700 hidden sm:table-cell">المدير</th>
                <th className="p-3 sm:p-4 font-bold text-gray-700">الحالة</th>
                <th className="p-3 sm:p-4 font-bold text-gray-700 w-24 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-200 italic">
                    جاري جلب البيانات من السحابة...
                  </td>
                </tr>
              ) : warehouses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-200 font-bold">
                    لا توجد مستودعات مسجلة حالياً
                  </td>
                </tr>
              ) : (
                warehouses.map((wh) => (
                  <tr key={wh.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3 sm:p-4 font-mono text-brand-red font-bold whitespace-nowrap">
                      {wh.code}
                    </td>
                    <td className="p-3 sm:p-4 font-semibold">{wh.name}</td>
                    <td className="p-3 sm:p-4 hidden sm:table-cell">{wh.manager || '—'}</td>
                    <td className="p-3 sm:p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                          wh.status === 'نشط'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {wh.status || 'نشط'}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => startEdit(wh)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="تعديل"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(wh.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="حذف"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WarehouseManager;
