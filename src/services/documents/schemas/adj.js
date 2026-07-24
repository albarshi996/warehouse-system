/**
 * مخطّط سند تسوية المخزون (ADJ) — المرحلة 10.
 *
 * الأصل الورقي: `public/forms/form_Stock Adjustment Voucher.html`.
 *
 * 🔒 **حارس التسوية** (إحدى القواعد الذهبية): لا يُصحَّح رقمٌ في النظام إلا
 * بسندٍ مشتقٍّ من **محضر جردٍ مصادَق**، وبسببٍ موثَّق لكل بند. التسوية بلا
 * جردٍ تعني تغيير الأرقام بالنيّة — وهي أخطر ما يُفسد ثقة المخزون. التحقّق
 * نفسه في `chain.js` (`adjustmentVerdict`) لأنه يحتاج المحضر المرتبط.
 *
 * ما صُحِّح أثناء النقل:
 *  · «رقم سند التسوية» كان يُكتب ⇒ صار `ADJ-2026-####`.
 *  · «مرجع الجرد» كان يُنسخ بالقلم ⇒ صار رابطًا يُملأ عند الاشتقاق من CC.
 *  · «الفرق» و«قيمة الفرق» والإجماليات والأثر الصافي صارت محسوبة.
 *  · «اعتماد المدير المالي» — التسوية أثرٌ ماليّ، فاعتمادها يشمل المالية.
 */

/** فرق البند = الرصيد الفعلي − الدفتري. سالبٌ = عجز، موجبٌ = فائض. */
export function adjVariance(line) {
  return (Number(line?.actualQty) || 0) - (Number(line?.bookQty) || 0);
}

/** قيمة الفرق = الفرق × سعر الوحدة (بإشارته). */
export function adjValue(line) {
  return adjVariance(line) * (Number(line?.unitPrice) || 0);
}

/** إجمالي قيمة الزيادة (الفوائض وحدها). */
export function totalIncrease(lines) {
  return (lines || []).reduce((t, l) => t + Math.max(0, adjValue(l)), 0);
}

/** إجمالي قيمة النقصان (العجوزات وحدها، كقيمة موجبة). */
export function totalDecrease(lines) {
  return (lines || []).reduce((t, l) => t + Math.max(0, -adjValue(l)), 0);
}

/** الأثر المالي الصافي = زيادة − نقصان (قد يكون سالبًا). */
export function netImpact(lines) {
  return Math.round((totalIncrease(lines) - totalDecrease(lines)) * 100) / 100;
}

/**
 * تحذيرات التسوية: بندٌ بفرقٍ بلا سبب · بندٌ بلا فرق أصلًا (لا معنى
 * لتسويته) · سندٌ بلا مرجع جرد (الحجب الحقيقي في `adjustmentVerdict`).
 */
export function adjustmentWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];

  const varNoReason = lines.filter((l) => adjVariance(l) !== 0 && !String(l?.notes || '').trim());
  if (varNoReason.length) out.push(`${varNoReason.length} بندًا بفرقٍ بلا سبب — التسوية بلا تعليل لا تُعتمد`);

  const zeroVar = lines.filter((l) => String(l?.sku || l?.description || '').trim() && adjVariance(l) === 0);
  if (zeroVar.length) out.push(`${zeroVar.length} بندًا بلا فرق — لا شيء يُسوّى فيه`);

  if (!String(doc?.header?.cycleCountRef || '').trim()) {
    out.push('لا مرجع جرد — التسوية تُبنى على محضر جردٍ مصادَق لا على تقدير');
  }
  return out;
}

const schema = {
  type: 'ADJ',
  stage: 10,
  titleAr: 'سند تسوية مخزون',
  titleEn: 'Stock Adjustment Voucher',
  formCode: 'BFP-ADJ-001',
  orientation: 'landscape',

  /**
   * 🔒 الاعتماد للمدير المالي والمدير — التسوية أثرٌ ماليّ على قيمة المخزون،
   * فلا يعتمدها من أدخلها. الفصل بين مَن يُدخل ومَن يعتمد هو الحارس نفسه.
   */
  roles: {
    create: ['inventory_auditor', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['warehouse_manager', 'finance_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات سند التسوية — Adjustment Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'adjustmentDate', label: 'تاريخ التسوية (Adjustment Date)', kind: 'date', required: true },
        {
          key: 'cycleCountRef',
          label: 'مرجع الجرد (Cycle Count Ref.)',
          kind: 'text',
          required: true,
          hint: 'يُملأ تلقائيًّا عند اشتقاق السند من محضر جرد',
        },
        { key: 'zone', label: 'المنطقة / الموقع (Zone/Location)', kind: 'text' },
        {
          key: 'reason',
          label: 'سبب التسوية (Reason)',
          kind: 'select',
          options: ['فرق جرد', 'تلف', 'انتهاء صلاحية', 'خطأ إدخال سابق', 'فقد', 'أخرى'],
        },
      ],
      extraFields: [{ key: 'details', label: 'تفاصيل إضافية (Details)', kind: 'textarea' }],
    },

    {
      key: 'lines',
      title: '📦 بنود التسوية — Adjustment Lines',
      kind: 'table',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '22%' },
        { key: 'bookQty', label: 'الرصيد الدفتري', kind: 'number', width: '10%' },
        { key: 'actualQty', label: 'الرصيد الفعلي', kind: 'number', width: '10%' },
        { key: 'variance', label: 'الفرق (+/-)', kind: 'computed', compute: adjVariance, width: '8%' },
        { key: 'unitPrice', label: 'سعر الوحدة (د.ل)', kind: 'number', width: '9%' },
        { key: 'varValue', label: 'قيمة الفرق (د.ل)', kind: 'computed', compute: adjValue, width: '9%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '10%' },
      ],
    },

    {
      key: 'summary',
      title: '💰 الأثر المالي — Financial Impact',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalIncrease', label: 'إجمالي قيمة الزيادة (د.ل)', kind: 'computed', compute: (d) => Math.round(totalIncrease(d.lines) * 100) / 100 },
        { key: 'totalDecrease', label: 'إجمالي قيمة النقصان (د.ل)', kind: 'computed', compute: (d) => Math.round(totalDecrease(d.lines) * 100) / 100 },
        { key: 'netImpact', label: 'الأثر المالي الصافي (د.ل)', kind: 'computed', compute: (d) => netImpact(d.lines) },
      ],
      extraFields: [{ key: 'financeNotes', label: 'ملاحظات الاعتماد المالي', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'inventoryController', label: 'مراقب المخزون (Inventory Controller)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد المدير المالي (Finance Approval)', source: 'approver' },
    { key: 'whManager', label: 'مدير المستودع (WH Manager)', source: null },
  ],

  warnings: adjustmentWarnings,
};

export default schema;
