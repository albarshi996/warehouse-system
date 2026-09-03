/**
 * اختبارات جسر GRN — حيث تصير الحمولة رصيدًا، أو لا تصير فيُقال لماذا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countableDrafts,
  extrasConflicts,
  grnHeaderFrom,
  grnLineExtras,
  grnPreview,
  grnProblem,
  receivedByLine,
  receivedDetailByLine,
} from './grnBridge.js';

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

/* ══════════════ ‹JR-201أ› الصلاحيةُ والدفعةُ تعبران ══════════════ */

/** طبليّتان لبندٍ واحد — تُبنى قيمُ تتبّعهما في الاختبار نفسِه لتُقرأ بنظرة. */
function twoPallets(a, b) {
  return {
    ...SESSION,
    lines: [SESSION.lines[0]],
    drafts: [
      {
        ref: 'P1', lpn: 'LPN-MAIN-20260827-000001', state: 'APPROVED',
        lines: [{ lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: 12, qty: 5, baseQty: 60, ...a }],
      },
      {
        ref: 'P2', lpn: 'LPN-MAIN-20260827-000002', state: 'STORED',
        lines: [{ lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: 12, qty: 2, baseQty: 24, ...b }],
      },
    ],
  };
}

test('★★★ الاتّفاقُ يعبر — البندُ يحمل `batch` و`expiryDate` فتُبصر FEFO', () => {
  const s = twoPallets({ batch: 'LOT-77', expiry: '2027-03-01' }, { batch: 'LOT-77', expiry: '2027-03-01' });
  const extras = grnLineExtras(s);
  assert.deepEqual(extras.L1, { batch: 'LOT-77', expiryDate: '2027-03-01' });
  assert.ok(!('expiry' in extras.L1), '★★★ الاسمُ `expiryDate` — `POSTING_RULES.GRN.expiryField` وLINE_MAP يقرآنه، و«expiry» يُرحَّل فارغًا بلا صوت');
  assert.deepEqual(extrasConflicts(s), [], 'اتّفاقٌ فلا خلافَ يُعلَن');
});

test('★★★ صلاحيّتان مختلفتان ⟶ لا `expiryDate`، والخلافُ يُعلَن — والكمّيّةُ لا تتأثّر', () => {
  const s = twoPallets({ batch: 'LOT-77', expiry: '2027-03-01' }, { batch: 'LOT-77', expiry: '2027-09-09' });

  const extras = grnLineExtras(s);
  assert.equal(extras.L1.expiryDate, undefined, 'اختيارُ إحداهما ينسب لنصف البضاعة تاريخًا لم يكتبه أحد');
  assert.equal(extras.L1.batch, 'LOT-77', 'والمتّفَقُ عليه يعبر — الخلافُ في حقلٍ لا يُسقط أخاه');

  const conflicts = extrasConflicts(s);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].lineId, 'L1');
  assert.equal(conflicts[0].sku, 'WNW-001', 'يسمّي الصنف كما تسمّيه `unknownBase`');
  assert.equal(conflicts[0].field, 'expiryDate', 'باسمه في المستند — فالموظّف يقرأ ما ينقص المذكّرة');
  assert.deepEqual(conflicts[0].values, ['2027-03-01', '2027-09-09'], 'ويسمّي القيمتين معًا');
  assert.deepEqual(conflicts[0].pallets, ['LPN-MAIN-20260827-000001', 'LPN-MAIN-20260827-000002'], 'وأيُّ طبليّةٍ قالت أيًّا — محاذاةً بالفهرس');

  assert.equal(receivedByLine(s).byLine.L1, 84, '⚠️ الخلافُ في الصلاحية لا يمسّ الكمّيّة بذرّة');
  assert.equal(grnProblem(s), '', 'ويُعلَن ولا يمنع — جلسةٌ كانت تُولّد أمس تُولّد اليوم');
});

test('★★★ قفلُ انحدار: مخرَجُ `receivedByLine` مطابقٌ بايتًا ببايت لما كان قبل ‹JR-201أ›', () => {
  // العيّنةُ ثابتةٌ عمدًا، والقيمةُ المرجعيّة **نُسخت من تشغيل الملفّ قبل
  // العمل** لا من حسابٍ ذهنيّ: فيها كسرٌ عائم (٠٫١×٣) ليقفل التقريب، وبندٌ
  // مجهولُ المعامل، وطبليّتان مستبعدتان. أيُّ حرفٍ يتغيّر هنا يعني أنّ حقلًا
  // تسرّب إلى `requestedByLine` وكذب على قفل التخصيص.
  const FROZEN = {
    order: { type: 'PO', id: 'po-9', number: 'PO-2026-0099' },
    drafts: [
      { ref: 'P1', lpn: 'LPN-MAIN-20260901-000001', state: 'APPROVED', lines: [
        { lineId: 'L1', sku: 'A-1', uom: 'carton', factor: 12, qty: 5, baseQty: 60, batch: 'B7', expiry: '2027-03-01' },
        { lineId: 'L2', sku: 'A-2', uom: 'piece', factor: 0.1, qty: 3, baseQty: 0.30000000000000004, batch: '', expiry: '' },
      ] },
      { ref: 'P2', lpn: 'LPN-MAIN-20260901-000002', state: 'STORED', lines: [
        { lineId: 'L1', sku: 'A-1', uom: 'carton', factor: 12, qty: 2, baseQty: 24, batch: 'B7', expiry: '2027-09-09' },
        { lineId: 'L3', sku: 'A-3', uom: 'box', factor: null, qty: 4, baseQty: null },
      ] },
      { ref: 'P3', lpn: 'LPN-MAIN-20260901-000003', state: 'CANCELLED', lines: [{ lineId: 'L1', sku: 'A-1', baseQty: 999, expiry: '2030-01-01' }] },
      { ref: 'P4', state: 'SCANNING', lines: [{ lineId: 'L1', sku: 'A-1', baseQty: 500 }] },
    ],
  };
  const BEFORE = '{"byLine":{"L1":84,"L2":0.3},"unknownBase":[{"lpn":"LPN-MAIN-20260901-000002","sku":"A-3","uom":"box","qty":4}],"total":84.3}';
  assert.equal(JSON.stringify(receivedByLine(FROZEN)), BEFORE, 'المفاتيحُ وترتيبُها والأرقامُ — لا حرفَ واحدًا');
});

test('★★ الملغاةُ وغيرُ المعدودة لا تلوّث التتبّع — نفسُ مرشِّح `countableDrafts`', () => {
  const noisy = {
    ...SESSION,
    lines: [SESSION.lines[0]],
    drafts: [
      { ref: 'P1', lpn: 'LPN-MAIN-20260827-000001', state: 'APPROVED',
        lines: [{ lineId: 'L1', sku: 'WNW-001', uom: 'piece', factor: 1, qty: 10, baseQty: 10, batch: 'LOT-77', expiry: '2027-03-01' }] },
      { ref: 'P3', lpn: 'LPN-MAIN-20260827-000003', state: 'CANCELLED',
        lines: [{ lineId: 'L1', sku: 'WNW-001', qty: 9, baseQty: 9, batch: 'LOT-99', expiry: '2099-01-01' }] },
      { ref: 'P4', lpn: 'LPN-MAIN-20260827-000004', state: 'PENDING_GOVERNANCE',
        lines: [{ lineId: 'L1', sku: 'WNW-001', qty: 9, baseQty: 9, batch: 'LOT-88', expiry: '2098-01-01' }] },
    ],
  };
  assert.equal(receivedDetailByLine(noisy).L1.length, 1, 'المعتمَدةُ وحدها تُروى');
  assert.deepEqual(grnLineExtras(noisy).L1, { batch: 'LOT-77', expiryDate: '2027-03-01' });
  assert.deepEqual(extrasConflicts(noisy), [], '★★★ ولولا المرشِّحُ لأعلنت الملغاةُ خلافًا وهميًّا يمنع صلاحيّةً صحيحة');
});

test('★★★ الاتّفاقُ على الفراغ صمتٌ لا خلاف — والفراغُ المخالطُ للقيمة خلافٌ لا فراغ', () => {
  const bulk = twoPallets({ batch: '', expiry: '' }, { batch: '', expiry: '' });
  assert.equal(grnLineExtras(bulk).L1, undefined, 'بضاعةٌ سائبةٌ بلا دفعة — لا حقلَ يُصدَّر');
  assert.deepEqual(extrasConflicts(bulk), [], 'ولا ضجيجَ يُعلَّم الموظّفُ تجاهلَه فيضيع الخلافُ الحقيقيّ معه');

  const half = twoPallets({ batch: 'LOT-77', expiry: '2027-03-01' }, { batch: 'LOT-77' });
  assert.equal(grnLineExtras(half).L1.expiryDate, undefined, 'نصفُ الكمّيّة كان سيحمل تاريخًا لم يكتبه أحد');
  const c = extrasConflicts(half);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].values, ['2027-03-01', ''], 'والفراغُ يُسمّى قيمةً ليُرى من نسيه');
});

test('★★ التوحيدُ للمقارنة وحدها — صيغتا تاريخٍ ليوم واحد اتّفاقٌ لا خلاف', () => {
  // الدفترُ يوحّدهما أصلًا في `balanceId` — فإعلانُهما خلافًا قلقٌ بلا سبب.
  const s = twoPallets({ expiry: '2027-03-01' }, { expiry: '2027-03-01T00:00:00.000Z' });
  assert.deepEqual(extrasConflicts(s), [], 'يومٌ واحد');
  assert.equal(grnLineExtras(s).L1.expiryDate, '2027-03-01', '★ ويُصدَّر منقولًا كما كتبه أوّلُ من كتبه — لا مُعادَ تفسيرِه');
});

test('★★ التفصيلُ سجلُّ محتوًى لا مصدرَ كمّيّة — والمجهولُ المعاملِ يُروى بـ`null`', () => {
  const s = {
    ...SESSION,
    lines: [SESSION.lines[0]],
    drafts: [{
      ref: 'P1', lpn: 'LPN-MAIN-20260827-000001', state: 'APPROVED',
      lines: [{ lineId: 'L1', sku: 'WNW-001', uom: 'carton', factor: null, qty: 5, baseQty: null, expiry: '2027-03-01' }],
    }],
  };
  const rows = receivedDetailByLine(s).L1;
  assert.equal(rows.length, 1, 'يُروى ولا يُسقَط — صلاحيّتُه تهمّ ولو جُهل معاملُه');
  assert.equal(rows[0].baseQty, null, 'ولا يُصفَّر — عقيدةُ `totalBaseQty` نفسُها');
  assert.equal(rows[0].factor, null);
  assert.equal(rows[0].lpn, 'LPN-MAIN-20260827-000001');
  assert.equal(receivedByLine(s).byLine.L1, undefined, '⚠️ والكمّيّةُ من `receivedByLine` وحدها — من جمع من هنا خالفها');
});

test('★★ المعاينةُ تحمل التتبّعَ وخلافَه — والحكمُ في المنطق لا في شرطٍ داخل JSX', () => {
  const s = twoPallets({ batch: 'LOT-77', expiry: '2027-03-01' }, { batch: 'LOT-77', expiry: '2027-09-09' });
  const p = grnPreview(s);
  assert.deepEqual(p.lines[0].extras, { batch: 'LOT-77' }, 'الصفُّ يحمل ما اتُّفق عليه جاهزًا للعرض');
  assert.equal(p.extrasConflicts.length, 1);
  assert.equal(p.extrasConflicts[0].labelAr, 'تاريخ الصلاحية', 'وباسمٍ عربيٍّ تقرؤه الشاشة ولا تبنيه');
  assert.equal(p.problem, '', 'يُعلَن ولا يمنع');

  // ★★★ إضافةٌ لا تعديل: كلُّ مفتاحٍ كان يقرؤه مستدعٍ قائمٌ باقٍ بقيمته.
  const before = grnPreview(SESSION);
  assert.equal(before.total, 92);
  assert.equal(before.lines[0].received, 84);
  assert.equal(before.palletCount, 2);
  assert.equal(before.problem, '');
});
