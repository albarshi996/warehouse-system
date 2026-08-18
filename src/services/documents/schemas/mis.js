/**
 * مخطّط صرف الموادّ للإنتاج (MIS) ‹FNB-502› — الحلقة التي **تُخرج** الموادّ.
 *
 * الموادّ تغادر رفّها إلى موقع النظام `PRODUCTION` (تحت الإنتاج) — لا إلى
 * العدم. ورصيدٌ باقٍ هناك يعني **دفعةً لم تُغلق**: موادُّ صُرفت ولم يُثبَت
 * ما أنتجته. وهو تقرير الإنتاج المعلَّق نفسه (نمط `TRANSIT` حرفيًّا).
 *
 * ═══ والكمّيّة تُحسب من الوصفة لا تُكتب ═══
 * `qtyRequired` يملؤها انفجار الوصفة عند الاشتقاق من أمر الإنتاج،
 * و`qtyIssued` ما صُرف فعلًا. والفرق بينهما هو مادّة الـYield (FNB-503):
 * من كتب المصروف بيده بلا محسوبٍ يقابله فقد المقياس كلّه.
 */

function sumColumn(lines, key) {
  return (lines || []).reduce((total, line) => total + (Number(line?.[key]) || 0), 0);
}

/** تحذيرات صرف الموادّ (تنبّه ولا تمنع). */
export function materialIssueWarnings(doc) {
  const out = [];
  const lines = (doc?.lines || []).filter((l) => Number(l?.qtyIssued) > 0);
  if (!lines.length) out.push('لا بند مصروف — مستندٌ بلا صرفٍ لا يُقيَّد');

  const noBatch = lines.filter((l) => !String(l?.batch || '').trim() && !String(l?.expiry || '').trim());
  if (noBatch.length) {
    out.push(`${noBatch.length} بندًا بلا تشغيلة ولا صلاحيّة — ينقطع التتبّع من المادّة الخام إلى المنتَج`);
  }

  // انحرافٌ عن المحسوب من الوصفة: يُعلَن ليُفسَّر، ولا يُمنع.
  const drift = lines.filter((l) => {
    const req = Number(l?.qtyRequired) || 0;
    return req > 0 && Math.abs((Number(l?.qtyIssued) || 0) - req) / req > 0.1;
  });
  if (drift.length) {
    out.push(`${drift.length} بندًا صُرف بفارقٍ يتجاوز ٪١٠ عن المحسوب من الوصفة — بيّن سببه`);
  }
  return out;
}

const schema = {
  type: 'MIS',
  stage: 6,
  titleAr: 'صرف موادّ للإنتاج',
  titleEn: 'Material Issue',
  formCode: 'BFP-MIS-001',
  orientation: 'landscape',

  roles: {
    create: ['executive_chef', 'storekeeper', 'warehouse_manager'],
    approve: ['executive_chef', 'warehouse_manager'],
    complete: ['storekeeper', 'warehouse_manager'],
  },

  sections: [
    {
      key: 'header',
      title: '📋 بيانات الصرف — Material Issue Header',
      kind: 'fields',
      columns: 3,
      fields: [
        { key: 'issueDate', label: 'تاريخ الصرف (Issue Date)', kind: 'date', required: true },
        {
          key: 'warehouse',
          label: 'المخزن المصدر (From Warehouse)',
          kind: 'text',
          required: true,
          hint: 'المخزن الذي تخرج منه الموادّ فعلًا — عليه يقع القيد.',
        },
        {
          key: 'productionRef',
          label: 'رقم أمر الإنتاج (Production Order Ref.)',
          kind: 'docref',
          docType: 'PRO',
          required: true,
          hint: 'اكتب رقم أمر الإنتاج (PRO-…) فيُربط تلقائيًّا — أو يُملأ عند الاشتقاق',
        },
        { key: 'costCenter', label: 'مركز التكلفة (Cost Center)', kind: 'text', ltr: true },
        {
          key: 'issuedBy',
          label: 'المسؤول عن الصرف',
          kind: 'identity',
          source: 'creator',
        },
      ],
    },

    {
      key: 'lines',
      title: '📦 الموادّ المصروفة — Issued Materials',
      kind: 'table',
      note: 'المطلوب محسوبٌ من الوصفة، والمصروف ما خرج فعلًا — والفرق بينهما هو الـYield.',
      minRows: 1,
      columns: [
        { key: 'sku', label: 'رمز SKU', kind: 'text', scannable: true, width: '10%' },
        { key: 'barcode', label: 'باركود', kind: 'text', scannable: true, ltr: true, lookup: 'item', width: '11%' },
        { key: 'description', label: 'اسم الصنف', kind: 'text', width: '18%' },
        { key: 'qtyRequired', label: 'المطلوب (من الوصفة)', kind: 'number', width: '11%' },
        { key: 'qtyIssued', label: 'المصروف فعلًا', kind: 'number', width: '10%' },
        { key: 'uom', label: 'وحدة القياس', kind: 'text', width: '8%' },
        { key: 'batch', label: 'الدفعة (Batch)', kind: 'text', width: '9%' },
        { key: 'expiry', label: 'تاريخ الصلاحية', kind: 'date', width: '10%' },
        { key: 'bin', label: 'الموقع المصدر (Bin)', kind: 'text', scannable: true, ltr: true, width: '8%' },
        { key: 'notes', label: 'ملاحظات', kind: 'text', width: '5%' },
      ],
    },

    {
      key: 'summary',
      title: '📊 الملخّص — Summary',
      kind: 'fields',
      columns: 2,
      fields: [
        { key: 'totalRequired', label: 'إجمالي المطلوب من الوصفة', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyRequired') },
        { key: 'totalIssued', label: 'إجمالي المصروف فعلًا', kind: 'computed', compute: (d) => sumColumn(d.lines, 'qtyIssued') },
      ],
    },
  ],

  warnings: materialIssueWarnings,
};

export default schema;
