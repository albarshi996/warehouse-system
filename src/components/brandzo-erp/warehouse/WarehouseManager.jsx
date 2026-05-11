import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../config/firebase.js';

const WarehouseManager = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [formData, setFormData] = useState({ code: '', name: '', manager: '' });
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
      },
      (err) => {
        setStatusMsg({ type: 'error', text: 'خطأ في الاتصال: ' + err.message });
      }
    );
    return () => unsubscribe();
  }, []);

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

  // 2. وظيفة الإضافة
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    try {
      setStatusMsg({ type: 'info', text: 'جاري الحفظ...' });

      await addDoc(collection(db, 'warehouses'), {
        code: formData.code,
        name: formData.name,
        manager: formData.manager,
        status: 'نشط',
        createdAt: serverTimestamp(), // استخدام وقت السيرفر أفضل دقة
      });

      setFormData({ code: '', name: '', manager: '' });
      setStatusMsg({ type: 'success', text: 'تمت إضافة المستودع بنجاح ✅' });
      setHasUnsavedChanges(false);

      // إخفاء رسالة النجاح بعد 3 ثوانٍ
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
    } catch (error) {
      setStatusMsg({ type: 'error', text: 'فشل الحفظ: ' + error.message });
    }
  };

  const handleInputChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
    setHasUnsavedChanges(true);
  };

  return (
    <div className="font-['Cairo'] text-right" dir="rtl">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-brand-navy">
        إدارة المستودعات (Warehouses)
      </h2>

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

      {/* نموذج الإضافة */}
      <form
        onSubmit={handleAdd}
        className="mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 transition-all"
      >
        <h3 className="text-lg font-bold mb-4 text-brand-red">إضافة مستودع جديد</h3>
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
          <button
            type="submit"
            className="bg-brand-red text-white px-4 py-2 rounded font-bold hover:bg-brand-red-dark transition-all shadow-md active:scale-95"
          >
            إضافة مستودع
          </button>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-500 italic">
                    جاري جلب البيانات من السحابة...
                  </td>
                </tr>
              ) : warehouses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-500 font-bold">
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
