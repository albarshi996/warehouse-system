/**
 * اختبارات إعادة بناء الأرصدة من الدفتر — أداة الترحيل التي بدونها لا يُقلب مفتاح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateKey,
  compareMoves,
  migrationVerdict,
  moveTime,
  rebuildFromMoves,
  reconcileBalances,
} from './rebuild.js';

/** حركةٌ مختصرة: من → إلى بكميّة، بختمٍ زمنيّ اختياريّ. */
const mv = (id, from, to, qty, extra = {}) => ({
  id,
  sku: 'ITEM-A',
  barcode: '629',
  nameAr: 'صنف ألف',
  batch: 'B1',
  from,
  to,
  qty,
  postedAt: { seconds: Number(id.replace(/\D/g, '')) || 1 },
  ...extra,
});

test('إعادة البناء: الوارد يزيد والصادر ينقص و«خارج المنشأة» لا رصيد له', () => {
  const rows = rebuildFromMoves([
    mv('m1', null, 'RECEIVING', 100), // من المورّد
    mv('m2', 'RECEIVING', 'E5', 100), // تخزين
    mv('m3', 'E5', 'STAGING', 30), // سحب
    mv('m4', 'STAGING', null, 30), // تسليم للعميل
  ]);
  const byWh = Object.fromEntries(rows.map((r) => [r.warehouse, r.qty]));
  assert.equal(byWh.E5, 70);
  assert.equal(byWh.RECEIVING, 0, 'ساحة الاستلام تعود صفرًا — وهو التوازن المحكم');
  assert.equal(byWh.STAGING, 0);
  assert.ok(!Object.hasOwn(byWh, 'null'), 'الخارج ليس موقعًا نملك رصيده');
});

test('إعادة البناء حتميّة: الترتيب بالزمن ثمّ بالمعرّف لا بترتيب الوصول', () => {
  const moves = [mv('m3', 'E5', 'STAGING', 30), mv('m1', null, 'E5', 100)];
  const a = rebuildFromMoves(moves);
  const b = rebuildFromMoves([...moves].reverse());
  assert.deepEqual(a, b, 'تشغيلان على البيانات نفسها يُخرجان النتيجة نفسها');
});

test('ترتيب الحركات: الختم أوّلًا ثمّ المعرّف — والغائب يُدفع للآخر', () => {
  assert.ok(compareMoves({ postedAt: { seconds: 1 } }, { postedAt: { seconds: 2 } }) < 0);
  assert.ok(compareMoves({ id: 'a', postedAt: { seconds: 1 } }, { id: 'b', postedAt: { seconds: 1 } }) < 0);
  assert.ok(compareMoves({ postedAt: null }, { postedAt: { seconds: 9 } }) > 0, 'بلا ختمٍ لا يتقدّم على مختوم');
  assert.equal(moveTime(null), Number.MAX_SAFE_INTEGER);
  assert.equal(moveTime(1700000000000), 1700000000000);
  assert.equal(moveTime({ seconds: 5 }), 5000);
});

test('★★ LOC-108: دفعةٌ واحدة على رفّين = صفّان مستقلّان لا صفٌّ يبتلع الآخر', () => {
  // قبل قلب المفتاح كان الرفّان ينهاران في صفٍّ واحد و«آخر تخزينٍ يكسب»،
  // فلا يُعرف كم في هذا الرفّ. الآن لكلّ رفٍّ رصيده، ومجموعهما هو الإجمالي.
  const rows = rebuildFromMoves([
    mv('m1', null, 'E5', 10, { toBin: 'MAIN-A01-R01', unitCost: 3 }),
    mv('m2', null, 'E5', 10, { toBin: 'MAIN-A01-R09', unitCost: 5 }),
  ]);
  assert.equal(rows.length, 2, 'رفّان ⇒ صفّان');
  assert.deepEqual(rows.map((r) => r.bin).sort(), ['MAIN-A01-R01', 'MAIN-A01-R09']);
  assert.equal(rows.reduce((s, r) => s + r.qty, 0), 20, 'والمجموع محفوظ');
});

test('«آخر واردٍ يكسب» داخل الرفّ الواحد — والترتيب يجعلها حتميّة', () => {
  const rows = rebuildFromMoves([
    mv('m1', null, 'E5', 10, { toBin: 'MAIN-A01-R01', unitCost: 3 }),
    mv('m2', null, 'E5', 10, { toBin: 'MAIN-A01-R01', unitCost: 5 }),
  ]);
  assert.equal(rows.length, 1, 'الرفّ نفسه ⇒ صفٌّ واحد');
  assert.equal(rows[0].qty, 20);
  assert.equal(rows[0].unitCost, 5, 'آخر تكلفةٍ واردة هي المعروضة');
});

test('المطابقة: تطابقٌ تامّ يُخرج ok وفرقًا صفرًا', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [{ id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 100 }];
  const rep = reconcileBalances(moves, stored);
  assert.equal(rep.ok, true);
  assert.equal(rep.aggregatesOk, true);
  assert.equal(rep.totals.diff, 0);
  assert.deepEqual(rep.drift, []);
});

test('المطابقة تكشف الانحراف بالمعرّف وتُرتّبه بالأثر', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [{ id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 70 }];
  const rep = reconcileBalances(moves, stored);
  assert.equal(rep.ok, false);
  assert.equal(rep.drift.length, 1);
  assert.equal(rep.drift[0].ledgerQty, 100);
  assert.equal(rep.drift[0].storedQty, 70);
  assert.equal(rep.drift[0].diff, 30);
});

test('المطابقة تفرز الناقص عن اليتيم — ولا تعدّ الصفر عطبًا', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [
    { id: 'OTHER__E5__B9', sku: 'OTHER', warehouse: 'E5', batch: 'B9', qty: 40 },
    { id: 'ZERO__E5__B0', sku: 'ZERO', warehouse: 'E5', batch: 'B0', qty: 0 },
  ];
  const rep = reconcileBalances(moves, stored);
  assert.equal(rep.missing.length, 1, 'يقوله الدفتر ولا رصيد له');
  assert.equal(rep.missing[0].sku, 'ITEM-A');
  assert.equal(rep.orphan.length, 1, 'رصيدٌ لا يسنده الدفتر');
  assert.equal(rep.orphan[0].sku, 'OTHER');
  assert.ok(!rep.orphan.some((o) => o.sku === 'ZERO'), 'صفٌّ صفريّ لا يدّعي شيئًا فلا يُعدّ يتيمًا');
});

test('★★ الطبقة الثابتة: تقسيمٌ أدقّ للرصيد لا يغيّر مجموعه', () => {
  // هذا جوهر بوّابة الترحيل: يوم يُقلب المفتاح تتغيّر كلّ المعرّفات، فتبدو
  // الأرصدة منحرفةً وهي سليمة. المجموع بالصنف والمستودع هو ما يجب أن يثبت.
  const moves = [
    mv('m1', null, 'E5', 60, { bin: 'MAIN-A01-R01' }),
    mv('m2', null, 'E5', 40, { bin: 'MAIN-A01-R09' }),
  ];
  const storedOldKey = [{ id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 100 }];
  const rep = reconcileBalances(moves, storedOldKey);
  assert.equal(rep.aggregatesOk, true, 'المجموع 100 = 60 + 40 مهما اختلف تقسيم المفتاح');
  assert.equal(aggregateKey({ sku: 'ITEM-A', warehouse: 'e5', batch: 'X' }), 'ITEM-A__E5');
});

test('بوّابة الترحيل تمنع القلب عند اختلاف المجموع', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [{ id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 70 }];
  const verdict = migrationVerdict(reconcileBalances(moves, stored));
  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join(' '), /مجموعه في الدفتر يخالف المخزَّن/);
});

test('بوّابة الترحيل تمنع القلب على رصيدٍ يتيم — وإلّا فُقد بلا أثر', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [
    { id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 100 },
    { id: 'OPENING__E5__B0', sku: 'OPENING', warehouse: 'E5', batch: 'B0', qty: 5 },
  ];
  const verdict = migrationVerdict(reconcileBalances(moves, stored));
  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join(' '), /لا يسنده الدفتر/);
});

test('بوّابة الترحيل تسمح حين يتطابق المجموع ولا يتيم', () => {
  const moves = [mv('m1', null, 'E5', 100)];
  const stored = [{ id: 'ITEM-A__E5__B1', sku: 'ITEM-A', warehouse: 'E5', batch: 'B1', qty: 100 }];
  assert.deepEqual(migrationVerdict(reconcileBalances(moves, stored)), { ok: true, blockers: [] });
});

test('بلا تقرير لا قلب — لا يُقامر بمستودعٍ على غير بيّنة', () => {
  assert.equal(migrationVerdict(null).ok, false);
});
