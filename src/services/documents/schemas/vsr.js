/**
 * مخطّط تسوية نهاية الرحلة (VSR) — محضر إقفال محاسبة خطّ السير.
 *
 * ═══ لماذا لا يُحرّك مخزونًا؟ ═══
 * لأنّ البضاعة تحرّكت فعلًا، وتحرّكت مرّةً واحدة: حُمّلت بـ`VLD`، وبيعت بـ`VSI`،
 * وعاد مرتجعُها بـ`CRN`، ورجع باقيها بـ`VRT`. فلو قيّدت التسوية أثرًا لضاعفت
 * كلّ ذلك. هي **تقرأ ما قيّده غيرها وتحكم عليه** — محضرٌ يُثبت أنّ الميزان
 * استقام، ويحمل اعتماد المشرف على ما لم يستقم.
 *
 * ═══ ما الذي يُقفله فعلًا؟ ═══
 * الحارس في `settlement.js`: **لا تُقفل رحلةٌ ومركبتُها تحمل رصيدًا**. فالبضاعة
 * إمّا بيعت أو عادت — وثالثُهما بضاعةٌ بلا عهدة. والفرق المعدود لا يُمنع
 * تسجيله (منعُه إخفاؤه)، بل يُمنع الإقفالُ به حتى ينسبه المشرف لسببٍ مكتوب.
 *
 * ثلاثة أرقامٍ لا رقمان — والخلط بينها هو أوّل ما يُساء استعماله:
 *   المتوقّع (معادلة الرحلة) · الدفتريّ (رصيد الموقع) · المعدود (اليد).
 *   متوقّع ≠ دفتريّ ⇒ حركةٌ خارج نافذة الرحلة (خطأ نسبةٍ لا خطأ بضاعة).
 *   دفتريّ ≠ معدود ⇒ عجزٌ أو زيادةٌ حقيقيّان.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** فرق النقد: ما بيع نقدًا ناقص ما سُلّم للخزينة. */
function cashVariance(header) {
  return (Number(header?.cashSales) || 0) - (Number(header?.cashDeposited) || 0);
}

/**
 * تحذيرات التسوية: مركبةٌ لم تُصفَّر · فرقٌ مخزنيّ أو نقديّ بلا سبب · رحلةٌ
 * بلا مرجعٍ (فلا تُنسب التسوية إلى ما تُسوّيه).
 */
export function vsrWarnings(doc) {
  const h = doc?.header || {};
  const out = [];
  const lines = doc?.lines || [];

  if (!String(h.tripRef || '').trim()) out.push('رقم الرحلة يربط التسوية بما تُسوّيه — لا إقفال بلا مرجع');
  if (!String(h.vehiclePlate || '').trim()) out.push('لوحة المركبة تُحدّد الموقع الذي يجب أن يصفّر');

  const remaining = sumColumn(lines, 'ledgerQty');
  if (Math.abs(remaining) > 0.0001) {
    out.push(`المركبة ما تزال تحمل ${remaining} وحدة دفتريًّا — أرجِعها بمستند (VRT) قبل الإقفال`);
  }

  const drifted = lines.filter((l) => Math.abs((Number(l?.ledgerQty) || 0) - (Number(l?.expected) || 0)) > 0.0001);
  if (drifted.length) {
    out.push(`${drifted.length} بندًا يختلف فيه الدفتر عن معادلة الرحلة — غالبًا حركةٌ خارج نافذتها`);
  }

  const varied = lines.filter((l) => Math.abs(Number(l?.variance) || 0) > 0.0001);
  if (varied.length && !String(h.varianceReason || '').trim()) {
    out.push(`${varied.length} بندًا بعجزٍ أو زيادة بلا سببٍ مكتوب — الفرق يُنسب ولا يُهمَل`);
  }

  if (Math.abs(cashVariance(h)) > 0.009 && !String(h.cashVarianceReason || '').trim()) {
    out.push(`فرق نقديّ قدره ${cashVariance(h).toFixed(2)} بلا سببٍ مكتوب`);
  }

  return out;
}

const schema = {
  type: 'VSR',
  stage: 10,
  titleAr: 'تسوية نهاية الرحلة',
  titleEn: 'Van Settlement / Route Accounting',
  formCode: 'BFP-VSR-001',
  orientation: 'landscape',

  roles: {
    create: ['sales_rep', 'sales_supervisor'],
    approve: ['sales_supervisor', 'warehouse_manager'],
    complete: ['sales_supervisor', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الرحلة — Trip Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'settlementDate', label: 'تاريخ التسوية (Settlement Date)', kind: 'date', required: true },
        { key: 'tripRef', label: 'رقم الرحلة (Trip Ref.)', kind: 'text', required: true },
        { key: 'vehiclePlate', label: 'رقم لوحة المركبة (Vehicle Plate)', kind: 'text', required: true },
        { key: 'repName', label: 'اسم المندوب (Sales Rep)', kind: 'text', required: true },
        { key: 'route', label: 'خطّ السير (Route)', kind: 'text' },
        {
          key: 'supervisor',
          label: 'مشرف المبيعات (Supervisor)',
          kind: 'identity',
          source: 'approver',
          hint: 'يُملأ من حساب من اعتمد التسوية — لا من أنشأها',
        },
      ],
    },

    {
      key: 'visits',
      title: '🗺️ ملخّص الميدان — Field Summary',
      kind: 'fields',
      columns: 4,
      fields: [
        { key: 'visitsPlanned', label: 'الزيارات المخطّطة', kind: 'number' },
        { key: 'visitsDone', label: 'الزيارات المنفّذة', kind: 'number' },
        {
          key: 'visitCompliance',
          label: 'نسبة الالتزام %',
          kind: 'computed',
          compute: (d) => {
            const planned = Number(d?.header?.visitsPlanned) || 0;
            if (!planned) return 0;
            return Math.round(((Number(d?.header?.visitsDone) || 0) / planned) * 100);
          },
        },
        { key: 'invoicesIssued', label: 'الفواتير الصادرة', kind: 'number' },
      ],
    },

    {
      key: 'lines',
      title: '📦 ميزان المخزون — Stock Reconciliation',
      kind: 'table',
      minRows: 1,
      note: 'بداية + تحميل + مرتجع − مبيعات − إرجاع = المتوقّع. والمعدود يُقارَن بالدفتريّ لا بالمتوقّع.',
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', width: '9%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '16%' },
        { key: 'batch', label: 'الدفعة', kind: 'text', width: '8%' },
        { key: 'opening', label: 'رصيد البداية', kind: 'number', width: '8%' },
        { key: 'load', label: 'التحميل', kind: 'number', width: '7%' },
        { key: 'returnIn', label: 'مرتجع داخل', kind: 'number', width: '8%' },
        { key: 'sale', label: 'المبيعات', kind: 'number', width: '7%' },
        { key: 'returnOut', label: 'إرجاع للمخزن', kind: 'number', width: '9%' },
        { key: 'expected', label: 'المتوقّع', kind: 'number', width: '7%' },
        { key: 'ledgerQty', label: 'الدفتريّ', kind: 'number', width: '7%' },
        { key: 'counted', label: 'المعدود فعلًا', kind: 'number', width: '8%' },
        {
          key: 'variance',
          label: 'العجز / الزيادة',
          kind: 'computed',
          compute: (line) => (Number(line?.counted) || 0) - (Number(line?.ledgerQty) || 0),
          width: '6%',
        },
      ],
    },

    {
      key: 'cash',
      title: '💵 ميزان النقد — Cash Reconciliation',
      kind: 'fields',
      columns: 4,
      note: 'ما بيع نقدًا يجب أن يُسلَّم للخزينة كاملًا — والفرق يُنسب بسببٍ مكتوب.',
      fields: [
        { key: 'totalSales', label: 'إجمالي المبيعات', kind: 'number' },
        { key: 'cashSales', label: 'المبيعات النقدية', kind: 'number' },
        { key: 'creditSales', label: 'المبيعات الآجلة', kind: 'number' },
        { key: 'cashDeposited', label: 'المسلَّم للخزينة', kind: 'number' },
        {
          key: 'cashVariance',
          label: 'فرق النقد',
          kind: 'computed',
          compute: (d) => cashVariance(d?.header),
        },
        { key: 'chequesCount', label: 'عدد الشيكات', kind: 'number' },
      ],
    },

    {
      key: 'verdict',
      title: '⚖️ الحكم والاعتماد — Verdict',
      kind: 'fields',
      columns: 2,
      fields: [
        {
          key: 'stockVariance',
          label: 'صافي فرق المخزون',
          kind: 'computed',
          compute: (d) => (d.lines || []).reduce((s, l) => s + ((Number(l?.counted) || 0) - (Number(l?.ledgerQty) || 0)), 0),
        },
        {
          key: 'vanCleared',
          label: 'المركبة مصفّرة؟',
          kind: 'computed',
          compute: (d) => (Math.abs(sumColumn(d.lines, 'ledgerQty')) <= 0.0001 ? 'نعم' : 'لا — لا تُقفل'),
        },
      ],
      extraFields: [
        { key: 'varianceReason', label: 'سبب فرق المخزون (Stock Variance Reason)', kind: 'textarea' },
        { key: 'cashVarianceReason', label: 'سبب فرق النقد (Cash Variance Reason)', kind: 'textarea' },
        { key: 'supervisorNote', label: 'ملاحظة المشرف (Supervisor Note)', kind: 'textarea' },
      ],
    },
  ],

  signatures: [
    { key: 'rep', label: 'المندوب (Sales Rep)', source: 'creator' },
    { key: 'supervisor', label: 'مشرف المبيعات (Supervisor)', source: 'approver' },
    { key: 'treasury', label: 'أمين الخزينة (Treasury)', source: null },
  ],

  attachments: [
    { key: 'cashSlip', kind: 'other', label: 'إيصال تسليم النقد للخزينة' },
    { key: 'signedCopy', kind: 'signedCopy', label: 'نسخة محضر التسوية موقّعة' },
  ],

  warnings: vsrWarnings,
};

export default schema;
