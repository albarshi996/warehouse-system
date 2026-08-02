/**
 * مخطّط كشف مقارنة العروض (RFQ) — المرحلة 02 من دورة المشتريات الداخلية.
 *
 * بعد اعتماد المدير المالي للطلب، يجمع فريقُ المشتريات عروضَ المورّدين
 * ويرصدها هنا صفًّا لكلّ عرض (المورّد · الإجمالي · مدّة التوريد · الشروط)،
 * ويرشّح الفائز، فيعتمد المدير المالي الترسية. الرقم `RFQ-2026-####`.
 *
 * ملاحظة تصميميّة: جدول هذا المستند هو **العروض** لا الأصناف (المستند يملك
 * مصفوفة بنودٍ واحدة). أصناف الطلب معروفة من الأب المرجعيّ IPR (شريط السلسلة).
 */

/** أقلّ عرضٍ إجماليًّا بين العروض المرصودة (0 إن لا عروض). */
export function lowestOffer(lines) {
  const totals = (lines || [])
    .map((l) => Number(l?.offerTotal) || 0)
    .filter((n) => n > 0);
  return totals.length ? Math.min(...totals) : 0;
}

/** عدد العروض المرصودة فعلًا (لها اسم مورّد). */
export function offersCount(lines) {
  return (lines || []).filter((l) => String(l?.supplierName || '').trim()).length;
}

/**
 * تحذيرات الكشف: بلا عروض · بلا ترسية · الفائز ليس الأقلّ سعرًا (قد يكون
 * مبرَّرًا بالجودة أو مدّة التوريد، لكن يجب أن يُرى ويُوثَّق مبرّرُه).
 */
export function rfqWarnings(doc) {
  const out = [];
  const lines = doc?.lines || [];
  const count = offersCount(lines);
  if (count === 0) {
    out.push('لا عروض مرصودة بعد — أدرِج عرضًا واحدًا على الأقلّ');
    return out;
  }
  if (count < 3) {
    out.push(`عدد العروض ${count.toLocaleString('ar-LY')} — يُفضَّل ثلاثة عروض فأكثر للمقارنة`);
  }
  const winnerRow = lines.find((l) => String(l?.selected || '').trim());
  const selected = String(doc?.header?.selectedSupplier || '').trim();
  if (!winnerRow && !selected) {
    out.push('لم تُرسَّ العروض بعد — علّم العرض الفائز واكتب اسم المورّد في الترسية');
  }
  const min = lowestOffer(lines);
  if (winnerRow && min > 0) {
    const winnerTotal = Number(winnerRow.offerTotal) || 0;
    if (winnerTotal > min) {
      out.push(`الفائز (${winnerTotal.toLocaleString('ar-LY')} د.ل) ليس أقلّ العروض (${min.toLocaleString('ar-LY')} د.ل) — وثّق مبرّر الترسية`);
    }
  }
  return out;
}

const schema = {
  type: 'RFQ',
  stage: 2,
  titleAr: 'كشف مقارنة العروض',
  titleEn: 'Quotations Comparison',
  formCode: 'BFP-RFQ-001',
  orientation: 'landscape',

  /** الإعداد للمشتريات، والترسية يعتمدها المدير المالي — لا يرسّي المشتري وحده. */
  roles: {
    create: ['purchase_officer', 'warehouse_manager'],
    approve: ['finance_manager', 'warehouse_manager'],
    complete: ['purchase_officer', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الكشف — Comparison Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'rfqDate', label: 'تاريخ الكشف (Date)', kind: 'date', required: true },
        {
          key: 'iprRef',
          label: 'رقم طلب المشتريات المرجعي (IPR Ref.)',
          kind: 'docref',
          docType: 'IPR',
          required: true,
          hint: 'اكتب رقم الطلب (IPR-…) فيُتعرَّف عليه ويُربط — أو يُملأ عند الاشتقاق',
        },
        { key: 'department', label: 'الإدارة الطالبة (Requesting Dept.)', kind: 'text' },
        { key: 'beneficiary', label: 'المستفيد (Beneficiary)', kind: 'text' },
        { key: 'selectedSupplier', label: 'المورّد الفائز (Awarded Supplier)', kind: 'text' },
      ],
      extraFields: [
        { key: 'selectionJustification', label: 'مبرّر الترسية (Award Justification)', kind: 'textarea' },
      ],
    },

    {
      key: 'lines',
      title: '🏷️ العروض المرصودة — Received Quotations',
      kind: 'table',
      minRows: 1,
      note: 'صفٌّ لكلّ عرض مورّد. علّم العرض الفائز بـ«الفائز» في عمود الترسية.',
      columns: [
        { key: 'supplierName', label: 'اسم المورّد', kind: 'text', width: '20%' },
        { key: 'supplierPhone', label: 'هاتف المورّد', kind: 'text', ltr: true, width: '13%' },
        { key: 'offerTotal', label: 'إجمالي العرض (د.ل)', kind: 'number', width: '13%' },
        { key: 'deliveryDays', label: 'مدّة التوريد (يوم)', kind: 'number', width: '11%' },
        { key: 'validity', label: 'صلاحية العرض', kind: 'text', width: '11%' },
        { key: 'paymentTerms', label: 'شروط الدفع', kind: 'text', width: '11%' },
        { key: 'selected', label: 'الترسية', kind: 'select', options: ['الفائز'], width: '9%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '12%' },
      ],
    },

    {
      key: 'summary',
      title: '💰 خلاصة المقارنة — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        {
          key: 'offersCount',
          label: 'عدد العروض',
          kind: 'computed',
          compute: (d) => offersCount(d.lines),
        },
        {
          key: 'lowestOffer',
          label: 'أقلّ عرض (د.ل)',
          kind: 'computed',
          compute: (d) => lowestOffer(d.lines),
        },
      ],
    },
  ],

  signatures: [
    { key: 'preparedBy', label: 'أعدّ الكشف (المشتريات)', source: 'creator' },
    { key: 'financeApproval', label: 'اعتماد الترسية (المدير المالي)', source: 'approver' },
    { key: 'committee', label: 'لجنة المشتريات (Procurement Committee)', source: null },
  ],

  warnings: rfqWarnings,
};

export default schema;
