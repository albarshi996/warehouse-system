import React, { useState, useEffect } from 'react';
import { ITEM_TYPE_OPTIONS, typeOf } from '../../../services/items/itemType.js';
import { createItem, updateItem, UNIT_OPTIONS } from '../../../services/itemService.js';

/**
 * Inline create / edit form for a single item.
 *
 * Props:
 *   mode      — "create" | "edit"
 *   item      — the existing item when mode==="edit"; undefined otherwise
 *   onSaved   — callback fired with the saved item's sku on success
 *   onCancel  — callback to dismiss the form
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو (o_ds_card + o_form_grid
 * + o_input + o_alert) — يُرسَم داخل ItemMaster تحت `.o_theme`. **المنطق (الحالة
 * والتأثيرات والتحقّق وإدارة الباركود وcreateItem/updateItem) لم يُمسّ**.
 */
function emptyDraft() {
  return {
    sku: '',
    nameAr: '',
    nameEn: '',
    barcodesText: '',
    category: '',
    unit: 'piece',
    itemType: 'sale', // م٣-أ — الافتراض هو سلوك اليوم
    balance: '0',
    minStock: '0',
    substitutesText: '', // SAP-1 (ف‑٣) — أكواد أصنافٍ بديلة بفواصل
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
        itemType: typeOf(item),
        balance: String(item.balance ?? 0),
        minStock: String(item.minStock ?? 0),
        substitutesText: (item.substitutes || []).join(', '),
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
      // البدائل (ف‑٣) بنفس القاعدة — الخدمة تطبّع وتُسقط الصنف نفسه والتكرار.
      const substitutes = draft.substitutesText.split(/[,،/|;\n]+/).map((s) => s.trim()).filter(Boolean);
      if (isEdit) {
        await updateItem(draft.sku, {
          nameAr: draft.nameAr,
          nameEn: draft.nameEn,
          barcodes,
          category: draft.category,
          unit: draft.unit,
          itemType: draft.itemType,
          balance: draft.balance,
          minStock: draft.minStock,
          substitutes,
        });
        onSaved?.(draft.sku);
      } else {
        const sku = await createItem({ ...draft, barcodes, substitutes });
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
    <form onSubmit={handleSubmit} className="o_ds_card o_ds_pad" dir="rtl">
      <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0 }}>
        {isEdit ? `تعديل الصنف ${draft.sku}` : 'إضافة صنف جديد'}
      </h3>

      {error && <div className="o_alert danger">{error}</div>}

      <div className="o_form_grid">
        <Field label="SKU" required>
          <input
            type="text"
            placeholder="ITM-001"
            className="o_input"
            value={draft.sku}
            onChange={update('sku')}
            disabled={isEdit}
            required
            style={{ direction: 'ltr', textAlign: 'right' }}
          />
        </Field>

        <Field label="الاسم بالعربي" required>
          <input
            type="text"
            className="o_input"
            value={draft.nameAr}
            onChange={update('nameAr')}
            required
          />
        </Field>

        <Field label="Name (English)">
          <input
            type="text"
            className="o_input"
            value={draft.nameEn}
            onChange={update('nameEn')}
          />
        </Field>

        <Field label="الباركود" hint="عدّة باركودات؟ افصلها بفاصلة — الصنف الواحد قد يحمل أكثر من باركود">
          <input
            type="text"
            placeholder="8059692040599, 8059692040605"
            className="o_input"
            style={{ direction: 'ltr', textAlign: 'right' }}
            value={draft.barcodesText}
            onChange={update('barcodesText')}
          />
        </Field>

        <Field label="الفئة">
          <input
            type="text"
            placeholder="إلكترونيات"
            className="o_input"
            value={draft.category}
            onChange={update('category')}
          />
        </Field>

        {/* نوع الصنف (م٣-أ): الخدمة لا تُقيَّد مخزنيًّا، والداخليّ لا يُباع.
            الافتراض «بيع» — أي سلوك اليوم، فالترحيل بلا أثر. */}
        <Field label="نوع الصنف">
          <select className="o_input" value={draft.itemType} onChange={update('itemType')}>
            {ITEM_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.hint}
              </option>
            ))}
          </select>
        </Field>

        <Field label="الوحدة">
          <select className="o_input" value={draft.unit} onChange={update('unit')}>
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
            className="o_input"
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
            className="o_input"
            value={draft.minStock}
            onChange={update('minStock')}
          />
        </Field>

        {/* SAP-1 (ف‑٣): بدائل الصنف — أكوادٌ من الماستر، تُعرض في بطاقة الصنف */}
        <Field label="الأصناف البديلة" hint="أكواد أصنافٍ تصلح بديلًا — افصلها بفاصلة، وتظهر في بطاقة الصنف">
          <input
            type="text"
            placeholder="ITM-002, ITM-003"
            className="o_input"
            style={{ direction: 'ltr', textAlign: 'right' }}
            value={draft.substitutesText}
            onChange={update('substitutesText')}
          />
        </Field>
      </div>

      <div className="o_form_actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الصنف'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required = false, hint, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">
        {label}
        {required && ' *'}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}
