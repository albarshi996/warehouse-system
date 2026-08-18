/**
 * حارس تخصيص الإنتاج على الفروع ‹FNB-504›.
 *
 * أخطر ما يحرسه: **لا يُخصَّص أكثر ممّا أُنتج**، و**النقص يُقتسم بالتناسب
 * لا يُلقى على آخر من طلب**، و**المرفوض جودةً لا يُخصَّص**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateProduction, shortfallException, toBranchTransfers } from './productionAllocation.js';
import { EXCEPTION_TYPES } from '../ledger/exceptions.js';
import { getSchema } from '../documents/schemas/index.js';

const BATCH = { sku: 'SAUCE', batch: 'PB-2026-0041', qty: 100, warehouse: 'KITCHEN', qcStatus: 'passed', expiry: '2026-09-17' };

/* ═══════════ ‹FNB-504› التخصيص ═══════════ */

test('يكفي الطلب: كلٌّ يأخذ ما طلب، والفائض يبقى ولا يُوزَّع قسرًا', () => {
  const r = allocateProduction(BATCH, [{ branch: 'BR01', qty: 30 }, { branch: 'BR02', qty: 20 }]);
  assert.equal(r.ok, true);
  assert.equal(r.shortfall, 0);
  assert.deepEqual(r.allocations.map((a) => a.allocated), [30, 20]);
});

test('★★ لا يكفي: النقص يُقتسم بالتناسب — ولا يُخصَّص أكثر ممّا أُنتج', () => {
  // منتَجٌ ١٠٠ وطلبٌ ٢٠٠ ⇒ كلٌّ يأخذ نصف طلبه.
  const r = allocateProduction(BATCH, [
    { branch: 'BR01', qty: 100 },
    { branch: 'BR02', qty: 60 },
    { branch: 'BR03', qty: 40 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.shortfall, 100);
  const total = r.allocations.reduce((s, a) => s + a.allocated, 0);
  assert.equal(total, 100, 'خُصّص أكثر أو أقلّ من المنتَج');
  assert.deepEqual(r.problems, []);
  // ولا فرعَ خرج بلا شيء — النقص مقتسَمٌ لا ملقًى على آخر من طلب.
  assert.ok(r.allocations.every((a) => a.allocated > 0));
  assert.ok(r.allocations.every((a) => a.shortfall > 0));
});

test('★★ المرفوض جودةً لا يُخصَّص — والمعلَّق كذلك', () => {
  const rejected = allocateProduction({ ...BATCH, qcStatus: 'rejected' }, [{ branch: 'BR01', qty: 10 }]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.problems[0], /مرفوضةٌ جودةً/);

  const pending = allocateProduction({ ...BATCH, qcStatus: '' }, [{ branch: 'BR01', qty: 10 }]);
  assert.equal(pending.ok, false);
  assert.match(pending.problems[0], /بلا قرار جودة/);
});

test('★ نقصُ الإنتاج يفتح استثناءً واحدًا للصنف لا لكلّ فرع', () => {
  const r = allocateProduction(BATCH, [{ branch: 'BR01', qty: 100 }, { branch: 'BR02', qty: 100 }]);
  const exc = shortfallException(BATCH, r);
  assert.ok(exc);
  assert.equal(exc.type, 'production_delay');
  assert.ok(EXCEPTION_TYPES.production_delay, 'النوع في السجلّ القائم');
  assert.equal(exc.qty, 100);
  assert.match(exc.reason, /2 فرعًا/);
  // وبلا نقصٍ لا استثناء.
  assert.equal(shortfallException(BATCH, allocateProduction(BATCH, [{ branch: 'BR01', qty: 10 }])), null);
});

test('★ التخصيص يمرّ بسلسلة النقل القائمة — لا مسارَ شحنٍ ثانٍ للمطبخ', () => {
  const r = allocateProduction(BATCH, [{ branch: 'BR01', qty: 60 }, { branch: 'BR02', qty: 60 }]);
  const trs = toBranchTransfers(BATCH, r, { requestDate: '2026-08-18' });
  assert.equal(trs.length, 2);
  assert.ok(getSchema('TR'), 'المستند مبنيٌّ لا مخترَع');
  assert.equal(trs[0].header.toWarehouse, 'BR01');
  assert.equal(trs[0].header.costCenter, 'BR01', 'الصرف على المستفيد (FNB-103)');
  assert.equal(trs[0].lines[0].batch, 'PB-2026-0041', 'الدفعة تسافر مع الكمّيّة');
  assert.match(trs[0].lines[0].notes, /نقصُ إنتاج/);
});
