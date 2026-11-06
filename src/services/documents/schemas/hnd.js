/**
 * مستند مناولة (HND) — توثيقُ عمليّة مناولةٍ في المستودع (طلب المالك · موقع 155).
 *
 * يسجّل عمليّةَ تحميلٍ أو تنزيلٍ أو ترتيب: المخزن، ونوع العمليّة، وعددَ العمّال،
 * والمعدّات، والوقت، والمستندَ المرتبط (استلامٌ/صرفٌ/نقل). نمطُ TAXI/LABOR/CLEAN:
 * واقعةٌ تشغيليّةٌ مفردةٌ، لا تدخل سلسلةً ولا تُشتقّ منها.
 *
 * ★ توثيقيٌّ بحتٌ: **بلا أثرٍ مخزنيٍّ ولا ماليّ** (`financial:false, stockEffect:false`،
 * ولا قاعدةَ ترحيلٍ ولا قيدَ دفتر). التكلفةُ النقديّةُ للمناولة تُقيَّد في «العهد»
 * (إعاشة/نظافة/مناولة)، وأجرةُ العمالة في مستند LABOR — فلا يُقيَّد هنا شيءٌ مرّتين.
 *
 * ★ يُطبع **بلا هويّة شركة** (`plainPrint:true`) — شرطُ مستندات موقع 155.
 */

export function handlingWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!(Number(h.workers) > 0)) {
    out.push('عدد العمّال صفرٌ أو غيرُ مُدخَل — المناولةُ عملٌ بأيدٍ، فسجّل عددَ من ناوَل.');
  }
  const hasTime =
    String(h.startTime || '').trim() || String(h.endTime || '').trim() || Number(h.durationHours) > 0;
  if (!hasTime) {
    out.push('لا وقتَ مُدخَل (بداية/نهاية أو مدّة) — زمنُ المناولة جزءٌ من توثيقها.');
  }
  return out;
}

const schema = {
  type: 'HND',
  stage: 7,
  titleAr: 'مستند مناولة',
  titleEn: 'Handling',
  formCode: '155-HND-001',
  orientation: 'portrait',
  // يُطبع بلا اسمٍ/شعارٍ/صفةِ شركة — مستندات موقع 155.
  plainPrint: true,

  /** يُنشئه أمين المخزن، ويعتمده مدير المستودع (توثيقٌ تشغيليّ لا صرفٌ ماليّ). */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات المناولة — Handling',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'handlingDate', label: 'تاريخ المناولة (Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن / الموقع (Warehouse)',
          kind: 'text',
          required: true,
          hint: 'كود المخزن الذي تجري فيه المناولة (مثل E1).',
        },
        {
          key: 'operationType',
          label: 'نوع العمليّة (Operation)',
          kind: 'select',
          options: ['تحميل', 'تنزيل', 'ترتيب'],
          required: true,
        },
        { key: 'workers', label: 'عدد العمّال', kind: 'number', required: true },
        { key: 'equipment', label: 'المعدّات المستخدمة', kind: 'text', hint: 'رافعةٌ/ونشٌ/عرباتٌ... أدواتُ المناولة.' },
        { key: 'startTime', label: 'وقت البدء', kind: 'text', hint: 'مثل: 08:30' },
        { key: 'endTime', label: 'وقت الانتهاء', kind: 'text', hint: 'مثل: 11:00' },
        { key: 'durationHours', label: 'المدّة (ساعات)', kind: 'number' },
        {
          key: 'relatedDoc',
          label: 'المستند المرتبط',
          kind: 'text',
          ltr: true,
          hint: 'رقمُ مستندِ الاستلام/الصرف/النقل الذي تخدمه هذه المناولة (إن وُجد).',
        },
        { key: 'party', label: 'الجهة / الشركة', kind: 'text' },
        {
          key: 'supervisor',
          label: 'المشرف على المناولة',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المستند',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'supervisor', label: 'المشرف (Supervisor)', source: 'creator' },
    { key: 'approver', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'receiver', label: 'المستلِم (Received By)', source: null },
  ],

  warnings: handlingWarnings,
};

export default schema;
