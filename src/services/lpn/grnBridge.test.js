/**
 * اختبارات جسر GRN — حيث تصير الحمولة رصيدًا، أو لا تصير فيُقال لماذا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { countableDrafts, grnHeaderFrom, grnPreview, grnProblem, receivedByLine } from './grnBridge.js';

const SESSION = {
  order: { type: 'PO', id: 'po-1', number: 'PO-2026-0015' },
  supplier: 'شركة نوفا',
  warehouse: 'MAIN',
  openedBy: 'محمد',
  lines: [
    { lineId: 'L1', sku: 'WNW-001', description: 'ماء نوفا', uom: 'piece', ordered: 100, open: 100, received: 0 },
    { lineId: 'L2', sku: 'WNW-002', description: 'ماء صغير', uom: 'piece', ordered: 50, open: 50, received: 0 },
  ],
  drafts: [
    {
      ref: 'P1', lpn: 'LPN-MAIN-20260827-000001', state: 'APPROVED',
      lines: [
        { lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: 12, qty: 5, baseQty: 60 },
        { lineId: 'L2', sku: 'WNW-002', uom: 'piece', factor: 1, qty: 8, baseQty: 8 },
      ],
    },
    {
      ref: 'P2', lpn: 'LPN-MAIN-20260827-000002', state: 'STORED',
      lines: [{ lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: 12, qty: 2, baseQty: 24 }],
    },
  ],
};

test('★★ المحتسَب: المعتمَدة فما بعدها — والمرفوضةُ والمرجَعةُ لا تدخلان رصيدًا', () => {
  const withNoise = {
    ...SESSION,
    drafts: [
      ...SESSION.drafts,
      { ref: 'P3', lpn: 'LPN-MAIN-20260827-000003', state: 'CANCELLED', lines: [{ lineId: 'L1', baseQty: 999 }] },
      { ref: 'P4', state: 'SCANNING', lines: [{ lineId: 'L1', baseQty: 500 }] },
      { ref: 'P5', state: 'PENDING_GOVERNANCE', lines: [{ lineId: 'L1', baseQty: 400 }] },
    ],
  };
  assert.equal(countableDrafts(withNoise.drafts).length, 2, 'المعتمدة والمخزَّنة وحدهما');
  assert.equal(receivedByLine(withNoise).byLine.L1, 84, 'المرفوضة والمسوّدة والمنتظرة لا تُحتسب');
});

test('★★ الاحتساب بالكمّيّة الأساس لا بعدد المسحات — الكرتونة اثنا عشر', () => {
  const { byLine, total } = receivedByLine(SESSION);
  assert.equal(byLine.L1, 84, '٥ كراتين + ٢ كراتين = ٨٤ وحدة لا ٧ مسحات');
  assert.equal(byLine.L2, 8);
  assert.equal(total, 92);
});

test('★★★ البند مجهول المعامل لا يُحتسب ولا يُصفَّر — يوقف التوليد ويُعلَن', () => {
  const murky = {
    ...SESSION,
    drafts: [{
      ref: 'P1', lpn: 'LPN-MAIN-20260827-000001', state: 'APPROVED',
      lines: [
        { lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: null, qty: 5, baseQty: null },
        { lineId: 'L2', sku: 'WNW-002', uom: 'piece', factor: 1, qty: 8, baseQty: 8 },
      ],
    }],
  };
  const r = receivedByLine(murky);
  assert.equal(r.byLine.L1, undefined, 'لا يدخل بصفر — والصفر كذبٌ في مستندٍ ماليّ');
  assert.equal(r.unknownBase.length, 1);
  assert.equal(r.unknownBase[0].sku, 'WNW-001');

  const p = grnProblem(murky);
  assert.match(p, /معاملِ وحدةٍ مجهول/);
  assert.match(p, /WNW-001/, 'يسمّي الصنف');
  assert.match(p, /عرّف المعامل في ماستر الأصناف/, 'ويقول الصواب');
});

test('لا يُشتقّ استلامٌ من فراغٍ ولا من غير أمر شراء', () => {
  assert.match(grnProblem({ ...SESSION, order: null }), /بلا أمرٍ مصدر/);
  const tr = grnProblem({ ...SESSION, order: { type: 'TR', id: 't1', number: 'TR-1' } });
  assert.match(tr, /من أمر شراء/);
  assert.match(tr, /TRC/, 'ويقول أين يُستلم النقل');
});

test('★ لا رصيدَ ممّا لم يُعتمد — والرسالة تقول أين يُعتمد', () => {
  const noneApproved = { ...SESSION, drafts: [{ ref: 'P1', state: 'PENDING_GOVERNANCE', lines: [{ lineId: 'L1', baseQty: 60 }] }] };
  const p = grnProblem(noneApproved);
  assert.match(p, /لا طبليةً معتمدةً/);
  assert.match(p, /من الحوكمة أوّلًا/);
  assert.match(p, /ما لم يُعتمد لا يصير رصيدًا/);
});

test('الجلسة السليمة تمرّ بلا اعتراض', () => {
  assert.equal(grnProblem(SESSION), '');
});

test('★★ المعاينة تُري ما سيحمله المستند قبل الضغط — لا توقيعَ على مجهول', () => {
  const p = grnPreview(SESSION);
  assert.equal(p.order.number, 'PO-2026-0015');
  assert.equal(p.palletCount, 2);
  assert.deepEqual(p.pallets, ['LPN-MAIN-20260827-000001', 'LPN-MAIN-20260827-000002']);
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[0].received, 84);
  assert.equal(p.lines[0].ordered, 100);
  assert.equal(p.total, 92);
  assert.equal(p.problem, '');
});

test('★ تجاوزُ المفتوح يُعلَن في المعاينة — قبل أن يرفضه قفلُ التخصيص برسالةٍ تقنيّة', () => {
  const tight = { ...SESSION, lines: [{ ...SESSION.lines[0], open: 50 }, SESSION.lines[1]] };
  const p = grnPreview(tight);
  assert.equal(p.lines[0].over, 34, 'المستلَم ٨٤ والمفتوح ٥٠');
});

test('رأسُ GRN يضيف ما لا يعرفه المحرّك — والطبالي إشارةٌ نصّيّة لا علاقةَ تنفيذ', () => {
  const h = grnHeaderFrom(SESSION);
  assert.equal(h.warehouse, 'MAIN');
  assert.equal(h.receivedBy, 'محمد');
  assert.equal(h.totalPallets, 2, 'الحقل الذي كان يُكتب بالقلم صار محسوبًا');
  assert.match(h.palletRefs, /LPN-MAIN-20260827-000001/);
  assert.ok(!('links' in h), 'لا علاقاتِ تنفيذٍ من الجسر — تضخّم المنفَّذ وتكذب الرصيد المفتوح');
});
