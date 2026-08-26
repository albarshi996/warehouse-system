/**
 * اختبارات حوكمة الطبالي — البوّابة بين «قرأتُ» و«صار مخزونًا».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOVERNANCE_DECISIONS,
  decisionOf,
  decisionProblem,
  governanceCounters,
  planDecision,
  reviewCard,
} from './governanceQueue.js';

const PALLET = {
  tempRef: 'SESS-1/P1',
  state: 'PENDING_GOVERNANCE',
  flags: [],
  warehouse: 'MAIN',
  closedAt: '2026-08-26T09:30:00Z',
  lines: [
    { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', factor: 12, qty: 5, baseQty: 60, over: 0 },
    { sku: 'WNW-002', batch: 'B2409', expiry: '', uom: 'piece', factor: 1, qty: 8, baseQty: 8, over: 0 },
  ],
};
const SESSION = {
  order: { type: 'PO', id: 'po-1', number: 'PO-2026-0015' },
  supplier: 'شركة نوفا',
  warehouse: 'MAIN',
  openedBy: 'محمد',
  openedAt: '2026-08-26T08:00:00Z',
};
const CTX = { actor: 'لجنة الحوكمة', at: '2026-08-26T10:00:00Z' };

test('★★ القرارات السبعة كما نصّت خطة ٧ — لا أكثر ولا أقلّ', () => {
  assert.equal(Object.keys(GOVERNANCE_DECISIONS).length, 7);
  for (const id of ['APPROVE', 'APPROVE_WITH_NOTE', 'RETURN', 'INSPECT', 'HOLD', 'REJECT', 'PRINT']) {
    assert.ok(decisionOf(id), `«${id}» موجود`);
  }
  assert.equal(decisionOf('DELETE'), null, 'ولا قرارَ حذف — أصلًا');
});

test('★★★ الهويّة تولد عند الاعتماد وحده — والمرفوضة لا تحرق رقمًا ولا تُطبع', () => {
  const approved = planDecision(PALLET, 'APPROVE', CTX);
  assert.ok(approved.plan.generatesIdentity, 'الاعتماد يولّد الهويّة');
  assert.ok(approved.plan.queuesPrint, 'ويدفعها لقائمة الطباعة تلقائيًّا');
  assert.equal(approved.plan.nextState, 'APPROVED');

  const rejected = planDecision(PALLET, 'REJECT', { ...CTX, reason: 'الحمولة كلّها مبلولة' });
  assert.ok(!rejected.plan.generatesIdentity, 'المرفوضة لا تدخل المخزن فلا هويّة لها');
  assert.ok(!rejected.plan.queuesPrint);
  assert.equal(rejected.plan.nextState, 'CANCELLED', 'وتُغلق إلغاءً لا صرفًا');

  const returned = planDecision(PALLET, 'RETURN', { ...CTX, reason: 'الكمّيّات لا تطابق البيان' });
  assert.ok(!returned.plan.generatesIdentity, 'المرجَعة للتصحيح لم تُعتمد بعد');
  assert.equal(returned.plan.nextState, 'SCANNING', 'وتعود لصاحبها قيد القراءة');
});

test('★ «تحت الفحص» و«محجوزة» تولّدان الهويّة — الحمولة دخلت والوسمُ يمنع الصرف لا الوجود', () => {
  for (const id of ['INSPECT', 'HOLD']) {
    const p = planDecision(PALLET, id, { ...CTX, reason: 'اشتباه تلفٍ في الغلاف' }).plan;
    assert.equal(p.nextState, 'APPROVED', 'الحمولة في المخزن');
    assert.ok(p.generatesIdentity, 'فلها ملصقٌ يُعرَف به مكانها');
    assert.ok(p.flag, 'والوسم يمنع صرفها');
    assert.ok(p.flagLabel, 'وله عنوانٌ عربيّ للعرض');
  }
});

test('القرار الذي يحتاج سببًا لا يمرّ بلا سبب — والفاعل إلزاميّ دائمًا', () => {
  for (const id of ['APPROVE_WITH_NOTE', 'RETURN', 'INSPECT', 'HOLD', 'REJECT']) {
    assert.match(decisionProblem(PALLET, id, { actor: 'أ' }), /سببًا مكتوبًا/, `«${id}» يحتاج سببًا`);
  }
  assert.equal(decisionProblem(PALLET, 'APPROVE', { actor: 'أ' }), '', 'والاعتماد الصريح لا يحتاج');
  assert.match(decisionProblem(PALLET, 'APPROVE', {}), /بلا فاعل/);
});

test('🔒 لا يُحكم على ما لم يُرفع للحوكمة بعد', () => {
  const scanning = { ...PALLET, state: 'SCANNING' };
  assert.match(decisionProblem(scanning, 'APPROVE', { actor: 'أ' }), /ليست بانتظار الحوكمة/);
  // الطباعة وحدها تجوز على المعتمدة لاحقًا — إعادة طباعةٍ لا اعتماد.
  assert.equal(decisionProblem({ ...PALLET, state: 'STORED' }, 'PRINT', { actor: 'أ' }), '');
});

test('القرار المجهول يُردّ ويُسمّى المسموح', () => {
  const p = decisionProblem(PALLET, 'BURN', { actor: 'أ' });
  assert.match(p, /غير معروف/);
  assert.match(p, /اعتماد الطبلية/, 'تسمّي القرارات المتاحة');
});

test('★★ بطاقة المراجعة تعرض الصورة كاملة — ومن يقرّر على نصفها يوقّع على ما لا يعرف', () => {
  const card = reviewCard(PALLET, SESSION);
  assert.equal(card.order.number, 'PO-2026-0015');
  assert.equal(card.supplier, 'شركة نوفا');
  assert.equal(card.receivedBy, 'محمد');
  assert.equal(card.startedAt, '2026-08-26T08:00:00Z');
  assert.equal(card.closedAt, '2026-08-26T09:30:00Z');
  assert.equal(card.itemCount, 2);
  assert.equal(card.totalQty, 13);
  assert.equal(card.lots.length, 2, 'الدفعات وصلاحياتها');
  assert.ok(!card.needsAttention, 'حمولةٌ نظيفةٌ لا ترفع علمًا');
});

test('★★ ما يستدعي قرارًا يُرفع للأعلى: الزائد والمرفوض والاستثناء والمعامل المجهول', () => {
  const messy = {
    ...PALLET,
    lines: [
      { sku: 'WNW-001', batch: 'B2408', uom: 'carton', qty: 6, baseQty: 72, over: 12 },
      { sku: 'ODD-1', batch: '', uom: 'box', qty: 3, baseQty: null, baseUnknown: true, over: 0 },
    ],
  };
  const card = reviewCard(messy, SESSION, {
    rejections: [{ reason: 'DAMAGED', qty: 3 }, { reason: 'DAMAGED', qty: 2 }, { reason: 'SHORT', qty: 1 }],
    exceptions: [{ type: 'UNKNOWN_BARCODE', barcode: '9999' }],
  });
  assert.equal(card.overs.length, 1, 'الزائد يُفرَز');
  assert.equal(card.unknownBase.length, 1, 'والمجهول المعامل كذلك');
  assert.equal(card.exceptions.length, 1);
  assert.deepEqual(card.rejectionSummary[0], { reason: 'DAMAGED', label: 'تلف', qty: 5, count: 2 }, 'والمرفوض مجموعٌ بسببه');
  assert.ok(card.needsAttention, 'فترفع البطاقة علمًا — ولا تمنع الاعتماد');
});

test('عدّادات اللوحة تُشتقّ لحظيًّا — ولا عدّادَ يُكتب بيد', () => {
  const c = governanceCounters([
    { state: 'PENDING_GOVERNANCE', flags: [] },
    { state: 'PENDING_GOVERNANCE', flags: [] },
    { state: 'APPROVED', flags: [] },
    { state: 'APPROVED', flags: ['INSPECTION'] },
    { state: 'STORED', flags: ['GOVERNANCE_HOLD'] },
  ]);
  assert.equal(c.pendingApproval, 2);
  assert.equal(c.pendingPrint, 2);
  assert.equal(c.underInspection, 1);
  assert.equal(c.held, 1);
  assert.equal(c.stored, 1);
});
