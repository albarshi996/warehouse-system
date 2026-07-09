import React, { useEffect, useMemo, useRef, useState } from 'react';
// ⚠️ Imports the MOCK client DIRECTLY (not the mode-switched `odoo` export) so
// this training screen is guaranteed offline — it can never touch a real Odoo
// instance or Firestore, regardless of PUBLIC_ODOO_MODE.
import { mockOdooClient } from '../../../services/odoo/mockOdooClient.js';
import { productToItem, itemToProductValues } from '../../../services/odoo/odooMapper.js';
import { importSheet } from '../../../services/excel/excelImport.js';
import { exportItemsMaster, exportTemplate } from '../../../services/excel/excelExport.js';
import Icon from '../../ui/Icon.jsx';

const PRODUCT_FIELDS = [
  'id',
  'default_code',
  'name',
  'x_name_en',
  'categ_id',
  'uom_id',
  'qty_available',
  'x_min_stock',
];

/**
 * Odoo Training Console — a safe sandbox that mirrors the real Odoo data flow
 * (searchRead / create / write / unlink) against fixed mock data. Also demos
 * the Excel import/export gateway. Reload to reset the simulator.
 */
export default function OdooTrainingConsole() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null); // { kind, text }
  const [uid, setUid] = useState(null);
  const [form, setForm] = useState({ sku: '', nameAr: '', nameEn: '', balance: '', minStock: '' });
  const [importReport, setImportReport] = useState(null);
  const fileRef = useRef(null);

  const flash = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const records = await mockOdooClient.searchRead(
        'product.product',
        [],
        PRODUCT_FIELDS,
        { order: 'default_code asc' }
      );
      setItems(records.map(productToItem));
    } catch (err) {
      flash('error', err?.message ?? 'تعذّر جلب البيانات من المحاكي');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.sku, it.nameAr, it.nameEn, it.category]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term))
    );
  }, [items, search]);

  const handleAuth = async () => {
    try {
      const id = await mockOdooClient.authenticate();
      setUid(id);
      flash('success', `تم الاتصال بالمحاكي (uid = ${id})`);
    } catch (err) {
      flash('error', err?.message ?? 'فشل الاتصال');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.nameAr.trim()) {
      flash('error', 'الكود والاسم بالعربي حقلان إلزاميان');
      return;
    }
    try {
      const values = itemToProductValues(
        {
          sku: form.sku,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          balance: form.balance,
          minStock: form.minStock,
        },
        { allowBalance: true }
      );
      await mockOdooClient.create('product.product', values);
      setForm({ sku: '', nameAr: '', nameEn: '', balance: '', minStock: '' });
      flash('success', `تمت إضافة الصنف ${values.default_code} (في المحاكي)`);
      refresh();
    } catch (err) {
      flash('error', err?.message ?? 'فشلت الإضافة');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`حذف ${item.sku} من المحاكي؟`)) return;
    try {
      await mockOdooClient.unlink('product.product', item.odooId);
      flash('success', `تم حذف ${item.sku}`);
      refresh();
    } catch (err) {
      flash('error', err?.message ?? 'فشل الحذف');
    }
  };

  const handleReset = () => {
    mockOdooClient.resetMock();
    setImportReport(null);
    flash('success', 'تمت إعادة ضبط بيانات المحاكي');
    refresh();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const report = await importSheet(file, 'items');
      setImportReport(report);
      // Load the valid rows into the simulator (still offline).
      for (const row of report.rows) {
        await mockOdooClient.create(
          'product.product',
          itemToProductValues(row, { allowBalance: true })
        );
      }
      flash(
        report.ok ? 'success' : 'error',
        `استيراد: ${report.summary.valid} صف صالح، ${report.summary.invalid} خطأ`
      );
      refresh();
    } catch (err) {
      flash('error', err?.message ?? 'فشل الاستيراد');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = () => {
    try {
      const name = exportItemsMaster(items, { fileName: 'Brandzo_training_items' });
      flash('success', `تم تصدير ${items.length} صنف إلى ${name}`);
    } catch (err) {
      flash('error', err?.message ?? 'فشل التصدير');
    }
  };

  return (
    <div className="text-right" dir="rtl">
      {/* Header + training badge */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-navy">وضع التدريب — محاكي Odoo</h2>
          <p className="text-gray-200 mt-1 text-sm sm:text-base">
            بيئة آمنة تحاكي تدفق بيانات Odoo (بحث/إضافة/تعديل/حذف) واستيراد وتصدير Excel — بلا أي
            اتصال حقيقي بـ Odoo أو Firestore. أعد تحميل الصفحة لإعادة الضبط.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 px-3 py-1.5 text-xs font-bold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          TRAINING — بيانات وهمية
        </span>
      </header>

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg font-bold text-sm shadow-sm ${
            toast.kind === 'error'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-green-100 text-green-700 border border-green-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          type="button"
          onClick={handleAuth}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-navy text-white px-4 py-2 font-bold shadow hover:opacity-90 active:scale-95 transition-all"
        >
          <Icon name="grid" size={16} /> اختبار الاتصال
          {uid != null && <span className="text-brand-gold">✓ uid {uid}</span>}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 font-bold shadow hover:bg-green-700 active:scale-95 transition-all"
        >
          <Icon name="fileUp" size={16} /> تصدير Excel
        </button>
        <button
          type="button"
          onClick={() => exportTemplate('items')}
          className="inline-flex items-center gap-2 rounded-lg border border-green-600 text-green-700 px-4 py-2 font-bold hover:bg-green-50 active:scale-95 transition-all"
        >
          <Icon name="arrowDownTray" size={16} /> تنزيل قالب فارغ
        </button>
        <label className="inline-flex items-center gap-2 rounded-lg bg-brand-red text-white px-4 py-2 font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all cursor-pointer">
          <Icon name="arrowDownTray" size={16} /> استيراد Excel
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
        </label>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 text-gray-700 px-4 py-2 font-bold hover:bg-gray-100 active:scale-95 transition-all"
        >
          إعادة ضبط المحاكي
        </button>
      </div>

      {/* Import report */}
      {importReport && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-bold text-brand-navy flex items-center justify-between">
            <span>تقرير الاستيراد</span>
            <span className="text-sm text-gray-500">
              صالح: {importReport.summary.valid} · أخطاء: {importReport.errors.length}
            </span>
          </div>
          {importReport.errors.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 text-sm">
              {importReport.errors.map((err, i) => (
                <li key={i} className="px-4 py-2 flex gap-3">
                  <span className="font-mono text-brand-red whitespace-nowrap">صف {err.row}</span>
                  <span className="text-gray-500 whitespace-nowrap">[{err.column}]</span>
                  <span className="text-gray-700">{err.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-green-700 text-sm font-medium">لا توجد أخطاء — كل الصفوف صالحة ✅</p>
          )}
        </div>
      )}

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm"
      >
        <input
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
          placeholder="الكود SKU *"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
        />
        <input
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
          placeholder="الاسم بالعربي *"
          value={form.nameAr}
          onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
        />
        <input
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
          placeholder="الاسم بالإنجليزي"
          value={form.nameEn}
          onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
        />
        <input
          type="number"
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
          placeholder="الرصيد"
          value={form.balance}
          onChange={(e) => setForm({ ...form, balance: e.target.value })}
        />
        <div className="flex gap-2">
          <input
            type="number"
            className="border border-gray-300 rounded-lg p-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-red"
            placeholder="الحد الأدنى"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-red text-white px-4 font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all whitespace-nowrap"
          >
            إضافة
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <input
            type="search"
            placeholder="بحث بالكود أو الاسم..."
            className="w-full md:max-w-md border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-bold whitespace-nowrap">SKU</th>
                <th className="px-4 py-3 font-bold">الاسم (AR)</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell">الاسم (EN)</th>
                <th className="px-4 py-3 font-bold hidden sm:table-cell">الفئة</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">الرصيد</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell whitespace-nowrap">الحد الأدنى</th>
                <th className="px-4 py-3 font-bold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                    جاري جلب البيانات من المحاكي...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                    لا توجد أصناف. أضف صنفًا أو استورد ملف Excel.
                  </td>
                </tr>
              ) : (
                filtered.map((it) => {
                  const lowStock = (it.balance ?? 0) <= (it.minStock ?? 0);
                  return (
                    <tr key={it.odooId ?? it.sku}>
                      <td className="px-4 py-3 font-mono text-brand-red font-bold whitespace-nowrap">{it.sku}</td>
                      <td className="px-4 py-3 font-medium">{it.nameAr || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500">{it.nameEn || '—'}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">{it.category || '—'}</td>
                      <td className={`px-4 py-3 font-bold whitespace-nowrap ${lowStock ? 'text-brand-yellow' : 'text-gray-900'}`}>
                        {it.balance ?? 0}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">{it.minStock ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(it)}
                            className="text-xs font-bold text-gray-500 border border-gray-300 rounded-md px-3 py-1 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
