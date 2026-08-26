/**
 * اختبارات ملصق الطبلية — الوجه المادّيّ للهويّة، وما يُقرأ في الممرّ بعد شهر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LABEL_SIZE,
  buildLabel,
  buildPrintJob,
  nextCopyNumber,
  printJobProblem,
  reprintSummary,
  stickConfirmVerdict,
} from './labelModel.js';

const CODE = 'LPN-MAIN-20260826-000145';
const UNIT = {
  code: CODE,
  state: 'APPROVED',
  flags: [],
  warehouse: 'MAIN',
  bin: '',
  lines: [
    { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', factor: 12, qty: 5, baseQty: 60 },
    { sku: 'WNW-002', batch: 'B2409', expiry: '', uom: 'piece', factor: 1, qty: 8, baseQty: 8 },
  ],
  sourceDoc: { type: 'GRN', number: 'GRN-2026-0032' },
  createdBy: 'محمد',
  createdAt: '2026-08-26T09:00:00Z',
};
const SESSION = { order: { number: 'PO-2026-0015' }, supplier: 'شركة نوفا' };

test('★★ الملصق كلُّه مشتقٌّ من البطاقة — لا حقلَ يُملى عليه بيد', () => {
  const label = buildLabel(UNIT, { session: SESSION });
  assert.equal(label.lpn, CODE);
  assert.equal(label.shortLabel, '000145', 'المختصر للعامل في الممرّ');
  assert.equal(label.barcodeValue, CODE);
  assert.equal(label.qrValue, CODE, 'الباركود والرمز هويّةٌ واحدة لا نصّان يفترقان');
  assert.equal(label.warehouse, 'MAIN');
  assert.equal(label.orderNumber, 'GRN-2026-0032');
  assert.equal(label.supplier, 'شركة نوفا');
  assert.equal(label.receivedBy, 'محمد');
  assert.equal(label.itemCount, 2);
  assert.equal(label.totalQty, 68);
  assert.equal(label.lots.length, 2);
  assert.equal(label.state, 'معتمدة');
  assert.deepEqual(label.size, DEFAULT_LABEL_SIZE);
});

test('★★ «Mixed Pallet» تُشتقّ من البنود ولا تُكتب — نصّ خطة ٧ حرفيًّا', () => {
  assert.ok(buildLabel(UNIT, { session: SESSION }).isMixed);
  assert.match(buildLabel(UNIT, { session: SESSION }).mixedNotice, /Mixed Pallet/);

  const single = { ...UNIT, lines: [UNIT.lines[0]] };
  assert.ok(!buildLabel(single).isMixed);
  assert.equal(buildLabel(single).mixedNotice, '', 'وطبليةٌ بصنفٍ واحد لا تُوسم كذبًا');
});

test('🔒 لا ملصق قبل الاعتماد — الطبلية بلا هويّةٍ صالحة لا نموذج لها', () => {
  assert.equal(buildLabel({ code: 'SESS-1/P1', lines: [] }), null, 'المعرّف المؤقّت لا يُطبع');
  assert.equal(buildLabel({ code: '', lines: [] }), null);
});

test('★★ النسخة الثانية تُعلن نفسها — فلا يُخلط ملصقٌ معادٌ بأصله', () => {
  assert.equal(buildLabel(UNIT, { copy: 1 }).reprintNotice, '');
  assert.match(buildLabel(UNIT, { copy: 3 }).reprintNotice, /نسخة معاد طباعتها \(3\)/);
});

test('★★★ إعادة الطباعة تحتاج سببًا دائمًا — وأوّل طباعةٍ لا تحتاج', () => {
  assert.equal(printJobProblem({ lpn: CODE, copy: 1, actor: 'محمد' }), '', 'الأولى حقٌّ بلا تفسير');
  const p = printJobProblem({ lpn: CODE, copy: 2, actor: 'محمد' });
  assert.match(p, /سببًا مكتوبًا/);
  assert.match(p, /أسوأ ما يقع في مستودع/, 'وتقول لماذا التشدّد');
  assert.equal(printJobProblem({ lpn: CODE, copy: 2, reason: 'تمزّق الملصق', actor: 'محمد' }), '');
});

test('مهمّة الطباعة ترفض: بلا طبلية أو نسخةٍ فاسدة أو فاعل', () => {
  assert.match(printJobProblem({ copy: 1, actor: 'م' }), /بلا طبلية/);
  assert.match(printJobProblem({ lpn: CODE, copy: 0, actor: 'م' }), /يبدأ من واحد/);
  assert.match(printJobProblem({ lpn: CODE, copy: 1.5, actor: 'م' }), /غير صالح/);
  assert.match(printJobProblem({ lpn: CODE, copy: 1 }), /بلا فاعل/);
});

test('المهمّة تُبنى بحالتها وطابعتها — وPDF افتراضًا (ق-٣: لا تشغيلَ يقف على عتاد)', () => {
  const r = buildPrintJob({ lpn: CODE, actor: 'محمد', at: '2026-08-26T10:00:00Z' });
  assert.equal(r.problem, undefined);
  assert.equal(r.job.state, 'QUEUED');
  assert.equal(r.job.printer, 'PDF');
  assert.ok(!r.job.isReprint);

  const re = buildPrintJob({ lpn: CODE, copy: 2, reason: 'سقط الملصق', actor: 'محمد' });
  assert.ok(re.job.isReprint);
  assert.equal(re.job.reason, 'سقط الملصق');
});

test('★ رقم النسخة من السجلّ لا من عدّاد — والملغاة لا تُحسب', () => {
  const jobs = [
    { lpn: CODE, copy: 1, state: 'PRINTED' },
    { lpn: CODE, copy: 2, state: 'CANCELLED' },
    { lpn: 'LPN-MAIN-20260826-000999', copy: 5, state: 'PRINTED' },
  ];
  assert.equal(nextCopyNumber(jobs, CODE), 2, 'الملغاة لا تحرق رقمًا');
  assert.equal(nextCopyNumber([], CODE), 1);
});

test('خلاصةُ إعادة الطباعة للرقابة: من أكثرُ إعادةً ولماذا', () => {
  const s = reprintSummary([
    { lpn: CODE, copy: 1, isReprint: false, state: 'PRINTED' },
    { lpn: CODE, copy: 2, isReprint: true, reason: 'تمزّق', state: 'PRINTED' },
    { lpn: CODE, copy: 3, isReprint: true, reason: 'سقط', state: 'PRINTED' },
    { lpn: 'LPN-MAIN-20260826-000900', copy: 2, isReprint: true, reason: 'تمزّق', state: 'PRINTED' },
  ]);
  assert.equal(s[0].lpn, CODE);
  assert.equal(s[0].copies, 2);
  assert.deepEqual(s[0].reasons, ['تمزّق', 'سقط'], 'الأسباب مجموعةً بلا تكرار');
});

test('★★★ تأكيد اللصق: ملصقٌ على طبليةٍ خطأ يُردّ ولا يُكمل', () => {
  assert.ok(stickConfirmVerdict(CODE, CODE).ok);
  assert.ok(stickConfirmVerdict(CODE, 'lpn-main-20260826-000145').ok, 'التطبيع قبل المقارنة');

  const wrong = stickConfirmVerdict(CODE, 'LPN-MAIN-20260826-000146');
  assert.ok(!wrong.ok);
  assert.match(wrong.message, /000146/, 'تسمّي الممسوح');
  assert.match(wrong.message, /000145/, 'وتسمّي المنتظر');
  assert.match(wrong.message, /انزع الملصق/, 'وتقول الصواب');

  assert.match(stickConfirmVerdict(CODE, '').message, /امسح الملصق بعد لصقه/);
});
