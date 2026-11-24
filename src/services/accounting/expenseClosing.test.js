/**
 * بيّنةُ كشف إقفال المصروفات — المنطقُ الخالص، **على سطورٍ يبنيها `expenseReport` نفسُه**
 * من مستنداتٍ بشكل EXP، لا على سطورٍ مصنوعةٍ باليد (درسُ «العيّنةُ النظيفة تُخفي العطب»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { expenseReport, expenseReportAoa, formatStamp, stampDay, toMs } from './expenseReport.js';
import {
  CLOSING_ROLES,
  CLOSING_MAX_ITEMS,
  SETTLE_OPEN,
  SETTLE_ALL,
  canCloseExpenses,
  closedIndex,
  settlementFilter,
  nextClosingNumber,
  buildClosing,
  closingReport,
  closingDrift,
  closingsForShop,
} from './expenseClosing.js';

/** لحظةٌ محليّةٌ — فالبيّنةُ لا تتبدّل بتبدّل المنطقة الزمنيّة للجهاز. */
const at = (y, m, d, hh = 10, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();
/** طابعٌ بشكل القاعدتين (له `toMillis` و`seconds`). */
const stamp = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: 0 });

function exp(id, over = {}) {
  const { header, ...rest } = over;
  return {
    id,
    type: 'EXP',
    state: 'done',
    number: `EXP-2026-${String(id).padStart(4, '0')}`,
    shop: 'shopA',
    createdAt: stamp(at(2026, 11, 1)),
    header: {
      expenseDate: '2026-11-01',
      invoiceNo: `INV-${id}`,
      category: 'نظافة',
      beneficiary: 'مورّد',
      paymentMethod: 'نقدًا',
      amount: 100,
      ...header,
    },
    ...rest,
  };
}

const DOCS = [
  exp('1', { header: { amount: 100, expenseDate: '2026-10-05' }, createdAt: stamp(at(2026, 10, 5)) }),
  exp('2', { header: { amount: 250.5, expenseDate: '2026-10-20' }, createdAt: stamp(at(2026, 10, 21)) }),
  // فاتورةٌ **قديمةُ التاريخ أُدخلت اليوم** — هي بعينها ما يخلط المُقفَلَ بالجديد.
  exp('3', { header: { amount: 80, expenseDate: '2026-10-10' }, createdAt: stamp(at(2026, 11, 24, 9, 30)) }),
  exp('4', { header: { amount: 40, expenseDate: '2026-11-23' }, createdAt: stamp(at(2026, 11, 24, 14, 5)) }),
];
const LINES = expenseReport(DOCS, {}).lines;

test('الصلاحيّة: المديران والمدير الماليّ يُقفلون، وغيرُهم لا', () => {
  assert.deepEqual([...CLOSING_ROLES], ['admin', 'warehouse_manager', 'finance_manager']);
  for (const r of CLOSING_ROLES) assert.equal(canCloseExpenses(r), true);
  assert.equal(canCloseExpenses('treasury'), false);
  assert.equal(canCloseExpenses(undefined), false);
});

test('‹وقت التسجيل› toMs يقرأ كلَّ الصيغ، والمجهولُ صفر', () => {
  const ms = at(2026, 11, 24, 14, 5);
  assert.equal(toMs(stamp(ms)), ms);
  assert.equal(toMs({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }), Math.floor(ms / 1000) * 1000);
  assert.equal(toMs(ms), ms);
  assert.equal(toMs(new Date(ms)), ms);
  assert.equal(toMs(new Date(ms).toISOString()), ms);
  assert.equal(toMs(null), 0);
  assert.equal(toMs('ليس تاريخًا'), 0);
  assert.equal(stampDay(ms), '2026-11-24');
  assert.equal(formatStamp(ms), '2026-11-24 14:05');
  assert.equal(formatStamp(0), '');
});

test('★★★ الفاتورةُ القديمةُ التاريخ المُدخلةُ اليوم تُلتقط بيوم تسجيلها لا بتاريخها', () => {
  // بتاريخ الفاتورة (أكتوبر) تضيع بين القديم؛ وبيوم التسجيل (24 نوفمبر) تظهر مع الجديد.
  const byCreated = expenseReport(DOCS, { createdFrom: '2026-11-24', createdTo: '2026-11-24' });
  assert.deepEqual(byCreated.lines.map((l) => l.id).sort(), ['3', '4']);
  const line3 = byCreated.lines.find((l) => l.id === '3');
  assert.equal(line3.date, '2026-10-10');
  assert.equal(line3.createdDay, '2026-11-24');
  // الحدّان شاملان، وما قبل المدى خارجه.
  assert.deepEqual(expenseReport(DOCS, { createdTo: '2026-10-21' }).lines.map((l) => l.id).sort(), ['1', '2']);
});

test('مصروفٌ بلا طابعِ تسجيلٍ يظهر بلا مدًى، ولا يُدَّعى له يومٌ متى حُدّد مدًى', () => {
  const docs = [exp('old', { createdAt: undefined })];
  assert.equal(expenseReport(docs, {}).count, 1);
  assert.equal(expenseReport(docs, { createdFrom: '2020-01-01' }).count, 0);
  assert.equal(expenseReport(docs, {}).lines[0].createdAtMs, 0);
});

test('★★★ بناءُ الكشف من التحديد اليدويّ: لقطةٌ وعددٌ وإجماليٌّ ورقم', () => {
  const now = at(2026, 11, 24, 16, 0);
  const res = buildClosing({ selectedIds: ['2', '1'], lines: LINES, closings: [], nowMs: now, note: ' سُوّي مع الماليّة ' });
  assert.equal(res.problem, undefined);
  const c = res.closing;
  assert.equal(c.number, 'CLS-2026-0001');
  assert.deepEqual(c.expenseIds, ['1', '2']); // مرتّبةٌ بتاريخ الفاتورة
  assert.equal(c.count, 2);
  assert.equal(c.total, 350.5);
  assert.equal(c.note, 'سُوّي مع الماليّة');
  assert.equal(c.closedAtMs, now);
  assert.equal(c.shop, 'shopA');
  assert.equal(c.items[1].invoiceNo, 'INV-2');
  assert.equal(c.items[1].amount, 250.5);
  assert.equal(c.items[1].createdAtMs, at(2026, 10, 21));
});

test('★★★ لا يُقفَل مصروفٌ مرّتين — والرفضُ يسمّي الفاتورةَ وكشفَها', () => {
  const first = { id: 'c1', ...buildClosing({ selectedIds: ['1'], lines: LINES, closings: [], nowMs: at(2026, 11, 1) }).closing };
  const again = buildClosing({ selectedIds: ['1', '3'], lines: LINES, closings: [first], nowMs: at(2026, 11, 24) });
  assert.ok(again.problem, 'مصروفٌ أُقفل مرّتين — تسويةٌ مزدوجةٌ مع الماليّة');
  assert.match(again.problem, /INV-1/);
  assert.match(again.problem, /CLS-2026-0001/);
  assert.equal(again.closing, undefined);
});

test('والتحديدُ الفارغُ أو الغريبُ أو المتضخّمُ يُرفض بسببه', () => {
  assert.match(buildClosing({ selectedIds: [], lines: LINES, closings: [], nowMs: 1 }).problem, /لم تُحدِّد/);
  assert.match(buildClosing({ selectedIds: ['ghost'], lines: LINES, closings: [], nowMs: 1 }).problem, /ليس مصروفًا منجَزًا/);
  assert.match(buildClosing({ selectedIds: ['1'], lines: LINES, closings: [], nowMs: 0 }).problem, /لحظةُ الإقفال/);
  const many = Array.from({ length: CLOSING_MAX_ITEMS + 1 }, (_, i) => `x${i}`);
  assert.match(buildClosing({ selectedIds: many, lines: LINES, closings: [], nowMs: 1 }).problem, /على كشفين/);
  // المكرَّرُ في التحديد يُحسب مرّة.
  assert.equal(buildClosing({ selectedIds: ['1', '1'], lines: LINES, closings: [], nowMs: 5 }).closing.count, 1);
});

test('مسودّةٌ أو مستندٌ غيرُ منجَزٍ لا يدخل كشفًا — فسطورُه ليست بين المنجَز', () => {
  const lines = expenseReport([...DOCS, exp('draft', { state: 'submitted' })], {}).lines;
  assert.match(buildClosing({ selectedIds: ['draft'], lines, closings: [], nowMs: 5 }).problem, /ليس مصروفًا منجَزًا/);
});

test('الترقيم: أكبرُ الموجود + ١ لكلّ سنة، والثغرةُ لا تكرّر رقمًا', () => {
  assert.equal(nextClosingNumber([], 2026), 'CLS-2026-0001');
  const some = [{ number: 'CLS-2026-0001' }, { number: 'CLS-2026-0004' }, { number: 'CLS-2025-0009' }, { number: 'خطأ' }];
  assert.equal(nextClosingNumber(some, 2026), 'CLS-2026-0005');
  assert.equal(nextClosingNumber(some, 2027), 'CLS-2027-0001');
});

test('★★★ «غير المُقفَل» يُسقط ما في الكشوف وحدَه — و«الكلّ» لا يُسقط شيئًا', () => {
  const c1 = { id: 'c1', ...buildClosing({ selectedIds: ['1', '2'], lines: LINES, closings: [], nowMs: at(2026, 11, 1) }).closing };
  const index = closedIndex([c1]);
  assert.equal(index.get('1').number, 'CLS-2026-0001');
  assert.equal(index.has('3'), false);

  const open = expenseReport(DOCS, { include: settlementFilter(SETTLE_OPEN, index) });
  assert.deepEqual(open.lines.map((l) => l.id).sort(), ['3', '4']);
  assert.equal(open.grandTotal, 120);

  assert.equal(settlementFilter(SETTLE_ALL, index), null);
  assert.equal(expenseReport(DOCS, { include: settlementFilter(SETTLE_ALL, index) }).count, 4);
  // ولا إفساد: بلا كشوفٍ قطّ «غير المُقفَل» هو الكلُّ كما كان التقرير.
  assert.equal(expenseReport(DOCS, { include: settlementFilter(SETTLE_OPEN, closedIndex([])) }).count, 4);
});

test('★ «الكلّ» وحدَه يُعيد null — ومعرّفُ كشفٍ يتيمٌ (بعد تبديل المحلّ) يُطبّق مرشّحَ «غير المُقفَل»', () => {
  // لو تسرّب معرّفُ كشفٍ لإطارٍ واحدٍ (activeClosing=null والوضعُ ما زال معرّفَه)،
  // فالمرشّحُ يُسقط المُقفَلَ كـ«غير المُقفَل» بدل null الذي يجمع المُقفَلَ والمفتوح متضخّمًا.
  const c1 = { id: 'c1', ...buildClosing({ selectedIds: ['1', '2'], lines: LINES, closings: [], nowMs: at(2026, 11, 1) }).closing };
  const index = closedIndex([c1]);
  const orphan = settlementFilter('c1', index);
  assert.equal(typeof orphan, 'function');
  assert.deepEqual(expenseReport(DOCS, { include: orphan }).lines.map((l) => l.id).sort(), ['3', '4']);
  // «الكلّ» وحدَه null.
  assert.equal(settlementFilter(SETTLE_ALL, index), null);
});

test('الفهرس: مصروفٌ ورد في كشفين ينتمي للأقدم، وكشفٌ بلا expenseIds يُقرأ من لقطته', () => {
  const older = { id: 'a', number: 'CLS-2026-0001', closedAtMs: 10, expenseIds: ['1'] };
  const newer = { id: 'b', number: 'CLS-2026-0002', closedAtMs: 20, items: [{ id: '1' }, { id: '2' }] };
  const index = closedIndex([newer, older]);
  assert.equal(index.get('1').closingId, 'a');
  assert.equal(index.get('2').closingId, 'b');
  assert.equal(closedIndex(null).size, 0);
});

test('★★ كشفُ الإقفال يُطبع من لقطته — مجموعُه وتجميعُه كما أُقفل', () => {
  const c = buildClosing({ selectedIds: ['1', '2'], lines: LINES, closings: [], nowMs: at(2026, 11, 1) }).closing;
  const rep = closingReport(c);
  assert.equal(rep.count, 2);
  assert.equal(rep.grandTotal, 350.5);
  assert.equal(rep.byCategory.length, 1);
  assert.equal(rep.byCategory[0].total, 350.5);
  assert.deepEqual(rep.lines.map((l) => l.invoiceNo), ['INV-1', 'INV-2']);
  assert.deepEqual(closingReport(null), { lines: [], byCategory: [], grandTotal: 0, count: 0 });
});

test('★★ ما تغيّر بعد الإقفال يُنبَّه إليه — والكشفُ يبقى شاهدًا على ما سُوّي', () => {
  const c = buildClosing({ selectedIds: ['1', '2'], lines: LINES, closings: [], nowMs: at(2026, 11, 1) }).closing;
  assert.deepEqual(closingDrift(c, LINES), { ok: true, missing: [], changed: [] });

  // عُدِّل مبلغُ مصروفٍ بعد إقفاله، وأُلغي إنجازُ آخر.
  const later = expenseReport(
    [exp('1', { header: { amount: 130, expenseDate: '2026-10-05' } }), exp('2', { state: 'closed' })],
    {}
  ).lines;
  const drift = closingDrift(c, later);
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.changed, [{ id: '1', invoiceNo: 'INV-1', was: 100, now: 130 }]);
  assert.equal(drift.missing[0].id, '2');
  // واللقطةُ لم تتبدّل.
  assert.equal(closingReport(c).grandTotal, 350.5);
});

test('كشوفُ المحلّ: كشوفُه وما عبر المحلّات، الأحدثُ أوّلًا', () => {
  const all = [
    { id: 'a', shop: 'shopA', closedAtMs: 10 },
    { id: 'b', shop: 'shopB', closedAtMs: 20 },
    { id: 'x', shop: '', closedAtMs: 30 },
  ];
  assert.deepEqual(closingsForShop(all, 'shopA').map((c) => c.id), ['x', 'a']);
  assert.deepEqual(closingsForShop(all, '').map((c) => c.id), ['x', 'b', 'a']);
  assert.deepEqual(closingsForShop(null, 'shopA'), []);
});

test('كشفٌ يعبر محلَّين محلُّه فارغ', () => {
  const lines = expenseReport([exp('1'), exp('9', { shop: 'shopB' })], {}).lines;
  assert.equal(buildClosing({ selectedIds: ['1', '9'], lines, closings: [], nowMs: 5 }).closing.shop, '');
});

test('إكسل: «سُجّل في» في الآخر دائمًا، و«الإقفال» حين يُمرَّر مُسمّيه — والأعمدةُ الأولى كما كانت', () => {
  const rep = expenseReport(DOCS, {});
  const plain = expenseReportAoa(rep);
  assert.equal(plain[0].length, 9);
  assert.equal(plain[0][8], 'سُجّل في');
  assert.equal(plain[0][5], 'المبلغ (د.ل)'); // لم ينزح
  assert.equal(plain[plain.length - 1].length, 9);

  const labeled = expenseReportAoa(rep, { settlementLabel: (l) => (l.id === '1' ? 'CLS-2026-0001' : 'مفتوح') });
  assert.equal(labeled[0][9], 'الإقفال');
  const row1 = labeled.find((r) => r[1] === 'INV-1');
  assert.equal(row1[9], 'CLS-2026-0001');
  assert.equal(row1[8], formatStamp(at(2026, 10, 5)));
  assert.equal(labeled[labeled.length - 1].length, 10);
});
