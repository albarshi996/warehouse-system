import React, { useState, useEffect } from 'react';
import { createItem, updateItem, UNIT_OPTIONS } from '../../../services/itemService.js';

/**
 * Inline create / edit form for a single item.
 *
 * Props:
 *   mode      — "create" | "edit"
 *   item      — the existing item when mode==="edit"; undefined otherwise
 *   onSaved   — callback fired with the saved item's sku on success
 *   onCancel  — callback to dismiss the form
 */
function emptyDraft() {
  return {
    sku: '',
    nameAr: '',
    nameEn: '',
    barcodesText: '',
    category: '',
    unit: 'piece',
    balance: '0',
    minStock: '0',
  };
}

export default function ItemForm({ mode, item, onSaved, onCancel }) {
  const isEdit = mode === 'edit';
  const [draft, setDraft] = useState(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (isEdit && item) {
      setDraft({
        sku: item.sku ?? '',
        nameAr: item.nameAr ?? '',
        nameEn: item.nameEn ?? '',
        barcodesText: (item.barcodes || []).join(', '),
        category: item.category ?? '',
        unit: item.unit ?? 'piece',
        balance: String(item.balance ?? 0),
        minStock: String(item.minStock ?? 0),
      });
    } else {
      setDraft(emptyDraft());
    }
    setError('');
    setHasUnsavedChanges(false);
  }, [isEdit, item]);

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

  const update = (key) => (e) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setHasUnsavedChanges(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // «8059…, 8059…» ⇒ ['8059…','8059…'] — الخدمة تطبّعها وتزيل التكرار.
      const barcodes = draft.barcodesText.split(/[,،/|;\n]+/).map((s) => s.trim()).filter(Boolean);
      if (isEdit) {
        await updateItem(draft.sku, {
          nameAr: draft.nameAr,
          nameEn: draft.nameEn,
          barcodes,
          category: draft.category,
          unit: draft.unit,
          balance: draft.balance,
          minStock: draft.minStock,
        });
        onSaved?.(draft.sku);
      } else {
        const sku = await createItem({ ...draft, barcodes });
        onSaved?.(sku);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err?.message ?? 'تعذر حفظ الصنف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200"
    >
      <h3 className="text-lg font-bold mb-4 text-brand-red">
        {isEdit ? `تعديل الصنف ${draft.sku}` : 'إضافة صنف جديد'}
      </h3>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="SKU" required>
          <input
            type="text"
            placeholder="ITM-001"
            className={inputClass}
            value={draft.sku}
            onChange={update('sku')}
            disabled={isEdit}
            required
          />
        </Field>

        <Field label="الاسم بالعربي" required>
          <input
            type="text"
            className={inputClass}
            value={draft.nameAr}
            onChange={update('nameAr')}
            required
          />
        </Field>

        <Field label="Name (English)">
          <input
            type="text"
            className={inputClass}
            value={draft.nameEn}
            onChange={update('nameEn')}
          />
        </Field>

        <Field label="الباركود" hint="عدّة باركودات؟ افصلها بفاصلة — الصنف الواحد قد يحمل أكثر من باركود">
          <input
            type="text"
            placeholder="8059692040599, 8059692040605"
            className={inputClass}
            style={{ direction: 'ltr', textAlign: 'right' }}
            value={draft.barcodesText}
            onChange={update('barcodesText')}
          />
        </Field>

        <Field label="الفئة">
          <input
            type="text"
            placeholder="إلكترونيات"
            className={inputClass}
            value={draft.category}
            onChange={update('category')}
          />
        </Field>

        <Field label="الوحدة">
          <select className={inputClass} value={draft.unit} onChange={update('unit')}>
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.labelAr}
              </option>
            ))}
          </select>
        </Field>

        {/* الوعد القديم «يتحدث تلقائياً عبر سندات الاستلام/الصرف» كان كاذبًا —
            لا كود ينفّذه. الحقيقة المعتمدة: مصدر الرصيد شيت الأرصدة. */}
        <Field
          label="الرصيد الافتتاحي"
          hint={isEdit ? 'مصدره استيراد شيت الأرصدة (Balances) — لا يُعدَّل هنا' : undefined}
        >
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={draft.balance}
            onChange={update('balance')}
            disabled={isEdit}
          />
        </Field>

        <Field label="الحد الأدنى للمخزون">
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={draft.minStock}
            onChange={update('minStock')}
          />
        </Field>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded font-bold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 rounded bg-brand-red text-white font-bold shadow hover:bg-brand-red-dark active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الصنف'}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-brand-red disabled:bg-gray-100 disabled:text-gray-700';

function Field({ label, required = false, hint, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold text-gray-700">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-gray-700">{hint}</span>}
    </label>
  );
}
