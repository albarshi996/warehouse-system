import React, { useEffect, useMemo, useState } from 'react';
import {
  subscribeItems,
  archiveItem,
  unarchiveItem,
  UNIT_OPTIONS,
} from '../../../services/itemService.js';
import Icon from '../../ui/Icon.jsx';
import ItemForm from './ItemForm.jsx';

/**
 * Items master screen. Real-time list of `Items_Master`, with search,
 * add/edit/archive controls.
 */
export default function ItemMaster() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState(null); // null | { mode, item? }
  const [toast, setToast] = useState(null); // { kind, text }

  useEffect(() => {
    const unsubscribe = subscribeItems(
      (next) => {
        setItems(next);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذر الاتصال بقاعدة البيانات');
        setLoading(false);
      },
      { includeArchived: showArchived }
    );
    return () => unsubscribe();
  }, [showArchived]);

  const flashToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.sku, it.nameAr, it.nameEn, it.category]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [items, search]);

  const handleArchive = async (item) => {
    const ok = window.confirm(`هل تريد بالتأكيد أرشفة الصنف ${item.sku}؟`);
    if (!ok) return;
    try {
      await archiveItem(item.sku);
      flashToast('success', `تمت أرشفة ${item.sku}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الأرشفة');
    }
  };

  const handleUnarchive = async (item) => {
    try {
      await unarchiveItem(item.sku);
      flashToast('success', `تمت استعادة ${item.sku}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الاستعادة');
    }
  };

  return (
    <div className="text-right" dir="rtl">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-navy">إدارة الأصناف (Items)</h2>
          <p className="text-gray-200 mt-1 text-sm sm:text-base">
            إنشاء وتعديل بيانات أصناف Brandzo. كود SKU هو المعرف الفريد لكل صنف.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: 'create' })}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-red text-white px-4 py-2 font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all"
        >
          <Icon name="package" size={18} />
          إضافة صنف
        </button>
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

      {error && !loading && (
        <div className="mb-4 p-3 rounded-lg font-bold text-sm bg-red-100 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {editor && (
        <div className="mb-6">
          <ItemForm
            mode={editor.mode}
            item={editor.item}
            onSaved={(sku) => {
              setEditor(null);
              flashToast(
                'success',
                editor.mode === 'create' ? `تمت إضافة الصنف ${sku}` : `تم حفظ تعديلات ${sku}`
              );
            }}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <input
            type="search"
            placeholder="بحث بالكود أو الاسم أو الفئة..."
            className="flex-1 md:max-w-md border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-brand-red"
            />
            إظهار الأصناف المؤرشفة
          </label>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-bold whitespace-nowrap">SKU</th>
                <th className="px-4 py-3 font-bold">الاسم (AR)</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell">الاسم (EN)</th>
                <th className="px-4 py-3 font-bold hidden sm:table-cell">الفئة</th>
                <th className="px-4 py-3 font-bold hidden sm:table-cell">الوحدة</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">الرصيد</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell whitespace-nowrap">
                  الحد الأدنى
                </th>
                <th className="px-4 py-3 font-bold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-200 italic">
                    جاري جلب البيانات من السحابة...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-200 italic">
                    {items.length === 0
                      ? 'لا توجد أصناف بعد. ابدأ بإضافة صنف جديد.'
                      : 'لا توجد نتائج مطابقة للبحث.'}
                  </td>
                </tr>
              ) : (
                filtered.map((it) => {
                  const lowStock = (it.balance ?? 0) <= (it.minStock ?? 0);
                  return (
                    <tr key={it.sku} className={it.archived ? 'opacity-60' : ''}>
                      <td className="px-4 py-3 font-mono text-brand-red font-bold whitespace-nowrap">
                        {it.sku}
                      </td>
                      <td className="px-4 py-3 font-medium">{it.nameAr || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-200">
                        {it.nameEn || '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">{it.category || '—'}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">{unitLabel(it.unit)}</td>
                      <td
                        className={`px-4 py-3 font-bold whitespace-nowrap ${
                          lowStock ? 'text-brand-yellow' : 'text-gray-900'
                        }`}
                      >
                        {it.balance ?? 0}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">{it.minStock ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditor({ mode: 'edit', item: it })}
                            className="text-xs font-bold text-brand-red border border-brand-red rounded-md px-3 py-1 hover:bg-brand-red hover:text-white transition-colors"
                          >
                            تعديل
                          </button>
                          {it.archived ? (
                            <button
                              type="button"
                              onClick={() => handleUnarchive(it)}
                              className="text-xs font-bold text-green-700 border border-green-700 rounded-md px-3 py-1 hover:bg-green-700 hover:text-white transition-colors"
                            >
                              استعادة
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchive(it)}
                              className="text-xs font-bold text-gray-200 border border-gray-300 rounded-md px-3 py-1 hover:bg-gray-500 hover:text-white transition-colors"
                            >
                              أرشفة
                            </button>
                          )}
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

function unitLabel(value) {
  const opt = UNIT_OPTIONS.find((u) => u.value === value);
  return opt?.labelAr ?? value ?? '—';
}
