/**
 * مستند سيارات النقل (VEH) — سجلُّ دخولِ وخروجِ مركبةٍ موثَّقٌ (طلب المالك · موقع 155).
 *
 * يسجّل رقمَ اللوحة والسائقَ والجهةَ الناقلة واتّجاهَ المركبة (دخول/خروج) والتوقيتَ
 * ورقمَ الختم والمستندَ المرتبط. نمطُ TAXI/LABOR/CLEAN: واقعةٌ مفردةٌ لا تدخل سلسلةً.
 *
 * ★ توثيقيٌّ بحتٌ: **بلا أثرٍ مخزنيٍّ ولا ماليّ** — هو مستندٌ يُطبع ويُؤرشَف لكلّ
 * رحلةٍ بعينها. والمتابعةُ الحيّةُ لدورةِ الساحة (دخولٌ ← انتظارٌ ← تحميلٌ ← خروج)
 * تبقى في «بوّابة الأمن» (`yard_visits`) — فهذا وثيقةٌ، وتلك لوحةٌ لحظيّة.
 *
 * ★ يُطبع **بلا هويّة شركة** (`plainPrint:true`) — شرطُ مستندات موقع 155.
 */

export function vehicleWarnings(doc) {
  const out = [];
  const h = doc?.header || {};
  if (!String(h.plate || '').trim()) out.push('رقمُ اللوحة غيرُ مُدخَل — هو مفتاحُ توثيق المركبة.');
  if (!String(h.direction || '').trim()) out.push('الاتّجاه (دخول/خروج) غيرُ محدَّد.');
  return out;
}

const schema = {
  type: 'VEH',
  stage: 7,
  titleAr: 'مستند سيارات النقل',
  titleEn: 'Transport Vehicle',
  formCode: '155-VEH-001',
  orientation: 'portrait',
  // يُطبع بلا اسمٍ/شعارٍ/صفةِ شركة — مستندات موقع 155.
  plainPrint: true,

  /** يُنشئه أمين المخزن/البوّابة، ويعتمده مدير المستودع. */
  roles: {
    create: ['storekeeper', 'warehouse_manager'],
    approve: ['warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: 'بيانات المركبة — Vehicle',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'logDate', label: 'التاريخ (Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن / الموقع (Warehouse)',
          kind: 'text',
          hint: 'كود المخزن أو الموقع المعنيّ بالحركة (مثل E1).',
        },
        { key: 'plate', label: 'رقم اللوحة (Plate)', kind: 'text', required: true, ltr: true },
        { key: 'driver', label: 'السائق (Driver)', kind: 'text', required: true },
        { key: 'carrier', label: 'الجهة الناقلة (Carrier)', kind: 'text', hint: 'الشركةُ أو المالكُ الناقل.' },
        {
          key: 'direction',
          label: 'الاتّجاه (Direction)',
          kind: 'select',
          options: ['دخول', 'خروج'],
          required: true,
        },
        { key: 'entryTime', label: 'التوقيت', kind: 'text', hint: 'وقتُ الدخول أو الخروج، مثل: 09:15' },
        { key: 'seal', label: 'رقم الختم (Seal)', kind: 'text', ltr: true, hint: 'رقمُ ختمِ الحمولة إن وُجد.' },
        {
          key: 'relatedDoc',
          label: 'المستند المرتبط',
          kind: 'text',
          ltr: true,
          hint: 'رقمُ مستندِ الاستلام/الصرف/النقل المرتبط بحركة المركبة (إن وُجد).',
        },
        {
          key: 'recordedBy',
          label: 'مُسجِّل الحركة',
          kind: 'identity',
          source: 'creator',
          hint: 'يُملأ تلقائيًّا من حساب من أنشأ المستند',
        },
      ],
      extraFields: [{ key: 'notes', label: 'ملاحظات', kind: 'textarea' }],
    },
  ],

  signatures: [
    { key: 'recordedBy', label: 'مُسجِّل الحركة (Recorded By)', source: 'creator' },
    { key: 'approver', label: 'المعتمِد (Approved By)', source: 'approver' },
    { key: 'driverSign', label: 'توقيع السائق (Driver)', source: null },
  ],

  warnings: vehicleWarnings,
};

export default schema;
