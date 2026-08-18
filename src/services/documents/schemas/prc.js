/**
 * مخطّط استلام الإنتاج (PRC) ‹FNB-502› — الحلقة التي **تُدخل** المنتَج.
 *
 * المنتَج يخرج من موقع `PRODUCTION` (تحت الإنتاج) إلى رفّه في وحدة الإنتاج —
 * فيُقفل ما فتحه صرفُ الموادّ، ويعود الموقع الوسيط إلى الصفر كما يشترط
 * `mustZero`. ورصيدٌ باقٍ هناك بعده = دفعةٌ صُرفت موادُّها ولم يُثبَت منتَجها.
 *
 * ═══ وهنا تُولَد الدفعة ═══
 * `Production Batch` برقمٍ من مولّد الترقيم القائم، وتاريخا `MFG`/`EXP`
 * على المنتَج — فيدخل المصنَّع داخليًّا حارسَ FEFO كما يدخله المشترى، بلا
 * استثناء. والـYield يُحسب هنا (FNB-503) من المنتَج الفعليّ إلى النظريّ.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** تحذيرات استلام الإنتاج (تنبّه ولا تمنع). */
export function productionReceiptWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qtyProduced) > 0);
  if (!lines.length) out.push('لا بند منتَج — مستندٌ بلا إنتاجٍ لا يُقيَّد');

  const noExpiry = lines.filter((l) => !String(l?.expiry || '').trim());
  if (noExpiry.length) {
    out.push(`${noExpiry.length} بندًا بلا تاريخ صلاحيّة — يُعطّل FEFO عند صرفه للفروع`);
  }
  const noBatch = lines.filter((l) => !String(l?.batch || '').trim());
  if (noBatch.length) {
    out.push(`${noBatch.length} بندًا بلا دفعة إنتاج — ينقطع التتبّع إلى الموادّ الخام`);
  }
  if (!String(doc?.header?.qcRef || '').trim()) {
    out.push('بلا مرجع فحصٍ للدفعة — الجودة قبل التعبئة (سطر 161)');
  }
  return out;
}

const schema = {
  type: 'PRC',
  stage: 7,
  titleAr: 'استلام إنتاج',
  titleEn: 'Production Receipt',
  formCode: 'BFP-PRC-001',
  orientation: 'landscape',

  roles: {
    create: ['executive_chef', 'storekeeper', 'warehouse_manager'],
    approve: ['executive_chef', 'warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات استلام الإنتاج — Production Receipt Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'receivedAt', label: 'تاريخ الاستلام (Received At)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن المستلِم (To Warehouse)',
          kind: 'text',
          required: true,
          hint: 'مخزن وحدة الإنتاج الذي يدخله المنتَج التامّ — عليه يقع القيد.',
        },
        {
          key: 'productionRef',
          label: 'رقم أمر الإنتاج (Production Order Ref.)',
          kind: 'docref',
          docType: 'PRO',
          required: true,
          hint: 'اكتب رقم أمر الإنتاج (PRO-…) فيُربط تلقائيًّا — أو يُملأ عند الاشتقاق',
        },
        { key: 'qcRef', label: 'مرجع فحص الدفعة (QC Ref.)', kind: 'text', ltr: true, hint: 'الجودة على الدفعة المنتَجة قبل التعبئة والتخصيص.' },
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true },
        { key: 'receivedBy', label: 'المستلِم', kind: 'identity', source: 'creator' },
      ],
    },

    {
      key: 'lines',
      title: '🍽️ المنتَج التامّ — Finished Goods',
      kind: 'table',
      note: 'الدفعة وتاريخا الإنتاج والصلاحيّة هنا هي ما يعتمد عليه FEFO عند صرف المنتَج للفروع.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز المنتَج', kind: 'text', scannable: true, width: '11%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم المنتَج', kind: 'text', width: '18%' },
        { key: 'qtyPlanned', label: 'المخطَّط', kind: 'number', width: '8%' },
        { key: 'qtyProduced', label: 'المنتَج فعلًا', kind: 'number', width: '9%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '8%' },
        { key: 'batch', label: 'دفعة الإنتاج (Batch)', kind: 'text', ltr: true, width: '10%' },
        { key: 'mfgDate', label: 'تاريخ الإنتاج (MFG)', kind: 'date', width: '9%' },
        { key: 'expiry', label: 'تاريخ الصلاحية (EXP)', kind: 'date', width: '9%' },
        { key: 'bin', label: 'الموقع المستهدف (Bin)', kind: 'text', scannable: true, ltr: true, width: '7%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'totalPlanned', label: 'إجمالي المخطَّط', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyPlanned') },
        { key: 'totalProduced', label: 'إجمالي المنتَج فعلًا', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyProduced') },
        {
          key: 'yieldPct',
          label: 'نسبة الـYield (٪)',
          kind: 'computed',
          compute: (d) => {
            const planned = sumColumn(d.lines, 'qtyPlanned');
            return planned > 0 ? Math.round((sumColumn(d.lines, 'qtyProduced') / planned) * 1000) / 10 : 0;
          },
        },
      ],
    },
  ],

  warnings: productionReceiptWarnings,
};

export default schema;
