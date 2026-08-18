/**
 * مخطّط أمر الإنتاج (PRO) ‹FNB-502› — رأس دورة المطبخ المركزيّ.
 *
 * موقعه في الدورة: بعد تجميع طلبات الفروع (FNB-304) يُصدر الشيف التنفيذيّ
 * أمر إنتاجٍ لكمّيّةٍ من صنفٍ مصنَّع. ومنه يُشتقّ **صرف الموادّ** (محسوبًا
 * من الوصفة لا مكتوبًا بيد) ثمّ **استلام الإنتاج**.
 *
 * ولماذا مستندٌ لا حقلٌ على طلب؟ لأنّ للإنتاج **أثرًا مخزنيًّا حقيقيًّا**
 * باتّجاهين: موادُّ تخرج ومنتَجٌ يدخل، ودفعةٌ تُولَد بتاريخَي إنتاجٍ وصلاحيّة.
 * وحقلٌ على طلبٍ لا يحمل شيئًا من ذلك.
 *
 * ⚠️ الأمر نفسه **لا يقيّد شيئًا** — كالطلب وأمر الشراء: يوثّق ما يُنوى
 * إنتاجه ويُعتمد. والقيد يقع في `MIS` و`PRC`.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/**
 * تحذيرات أمر الإنتاج (تنبّه ولا تمنع).
 * أخطرها **أمرٌ بلا وصفة**: لا يُحسب له صرفُ موادّ، فيُكتب بيدٍ ويسقط الـYield.
 */
export function productionOrderWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qtyPlanned) > 0);
  if (!lines.length) out.push('لا بند بكمّيّة مخطَّطة — أمرٌ فارغ لا يُنتج');

  const noRecipe = lines.filter((l) => !String(l?.recipeRef || '').trim());
  if (noRecipe.length) {
    out.push(`${noRecipe.length} بندًا بلا وصفةٍ مرجعيّة — لن يُحسب له صرف موادّ ولا Yield`);
  }
  if (!String(doc?.header?.productionDate || '').trim()) {
    out.push('بلا تاريخ إنتاجٍ مخطَّط — لا يُجدوَل ولا يُقاس تأخّره');
  }
  return out;
}

const schema = {
  type: 'PRO',
  stage: 5,
  titleAr: 'أمر الإنتاج',
  titleEn: 'Production Order',
  formCode: 'BFP-PRO-001',
  orientation: 'landscape',

  roles: {
    // ‹ق-O05› الوصفة ومعايير الإنتاج للشيف التنفيذيّ (سطر 525)، والمدير
    // معتمِدٌ أعلى. والسلوك المعلَن حتّى يحسم المالك.
    create: ['executive_chef', 'warehouse_manager'],
    approve: ['executive_chef', 'warehouse_manager'],
    complete: ['executive_chef', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات أمر الإنتاج — Production Order Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'orderDate', label: 'تاريخ الأمر (Order Date)', kind: 'date', required: true },
        { key: 'productionDate', label: 'تاريخ الإنتاج المخطَّط (Planned Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'وحدة الإنتاج (Production Unit)',
          kind: 'text',
          required: true,
          hint: 'كود المطبخ المركزيّ — منشأةٌ من نوع «وحدة إنتاج» في سيّد المستودعات.',
        },
        {
          key: 'costCenter',
          label: 'مركز التكلفة (Cost Center)',
          kind: 'text',
          ltr: true,
          hint: 'رمزٌ من سيّد المواقع التنظيميّة — عليه تُحمَّل تكلفة الإنتاج.',
        },
        { key: 'shift', label: 'الوردية (Shift)', kind: 'select', options: ['صباحيّة', 'مسائيّة', 'ليليّة'] },
        {
          key: 'chef',
          label: 'المسؤول (Chef)',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ الأمر',
        },
        { key: 'demandRef', label: 'مرجع الطلب المجمَّع', kind: 'text', hint: 'الطلب المجمَّع الذي بُني عليه الإنتاج (FNB-304) — إن وُجد.' },
      ],
    },

    {
      key: 'lines',
      title: '🍳 المنتَجات المخطَّطة — Planned Outputs',
      kind: 'table',
      note: 'الوصفة هنا هي ما يُحسب منه صرفُ الموادّ ويُقاس به الـYield — بندٌ بلا وصفةٍ يُكتب صرفُه بيد.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز المنتَج', kind: 'text', scannable: true, width: '12%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '12%' },
        { key: 'description', label: 'اسم المنتَج', kind: 'text', width: '22%' },
        { key: 'qtyPlanned', label: 'الكمّيّة المخطَّطة', kind: 'number', width: '11%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '9%' },
        { key: 'recipeRef', label: 'الوصفة (نسختها)', kind: 'text', ltr: true, width: '12%' },
        { key: 'shelfLifeDays', label: 'مدّة الصلاحيّة (أيّام)', kind: 'number', width: '10%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '12%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalLines', label: 'عدد المنتَجات', kind: 'computed', compute: (d) => (d.lines || []).filter((l) => Number(l?.qtyPlanned) > 0).length },
        { key: 'totalPlanned', label: 'إجمالي الكمّيّة المخطَّطة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyPlanned') },
      ],
    },
  ],

  warnings: productionOrderWarnings,
};

export default schema;
