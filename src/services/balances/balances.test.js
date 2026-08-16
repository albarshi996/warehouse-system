/**
 * اختبارات منطق الأرصدة الخالص — المفتاح المركّب وترتيب FEFO والتقييم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { balanceId, batchExpiryConflicts, fefoSort, expiryStatus, totalQty, stockValue } from './balanceKey.js';

// ── هويّة الرصيد الموسَّعة (LOC-108 · ف‑١٨) ────────────────────────
test('★★ الترحيل صفرُ الأثر: بلا موقعٍ ولا صلاحيةٍ وبحالة OK ⇒ المفتاح القديم حرفيًّا', () => {
  // شرطُ قبولٍ لا ميزة: كلّ رصيدٍ مكتوبٍ اليوم يبقى على معرّفه، فلا يتيتم صفٌّ
  // واحد ولا يحتاج المستودع «يوم ترحيلٍ» يتوقّف فيه العمل.
  const old = 'WNW-001__E5__LOT-1';
  assert.equal(balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' }), old);
  assert.equal(balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1', bin: '', expiry: '' }), old);
  assert.equal(balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1', status: 'OK' }), old);
  assert.equal(balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1', bin: null, expiry: null, status: null }), old);
});

test('★★ صنفٌ واحد بباركودٍ واحد ودفعتين وصلاحيتين ⇒ سجلّان مستقلّان', () => {
  // كانت الثانية تدهس صلاحية الأولى بلا إنذار.
  const a = balanceId({ barcode: '629', warehouse: 'E5', batch: 'B2408', expiry: '2027-06-30' });
  const b = balanceId({ barcode: '629', warehouse: 'E5', batch: 'B2411', expiry: '2027-11-30' });
  assert.notEqual(a, b);
  assert.ok(a.includes('2027-06-30') && b.includes('2027-11-30'));
});

test('★★ دفعةٌ واحدة موزّعة على موقعين تُحسب صحيحةً', () => {
  const r1 = balanceId({ sku: 'A', warehouse: 'E5', batch: 'B1', bin: 'MAIN-A01-R01' });
  const r2 = balanceId({ sku: 'A', warehouse: 'E5', batch: 'B1', bin: 'MAIN-A01-R02' });
  assert.notEqual(r1, r2, 'رفّان ⇒ مفتاحان — وإلّا ابتلع أحدهما الآخر');
  assert.ok(r1.startsWith('A__E5__B1__'), 'والجذر واحد فيسهل تجميعهما');
});

test('المفتاح الموسَّع ثابتٌ لا يتأثّر بصيغة كتابة الصلاحية', () => {
  const a = balanceId({ sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30' });
  const b = balanceId({ sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30T00:00:00Z' });
  assert.equal(a, b, 'الصلاحية يومٌ واحد لا طابعٌ زمنيّ');
  const bad = balanceId({ sku: 'A', warehouse: 'E5', batch: 'B1', expiry: 'غير تاريخ' });
  assert.equal(bad, 'A__E5__B1', 'وتاريخٌ فاسد يُهمَل ولا يُنتج مفتاحًا ثالثًا');
});

test('★★ تعارض الصلاحية يُرفع ولا يُدمَج صامتًا', () => {
  const conflicts = batchExpiryConflicts([
    { sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30', qty: 10 },
    { sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-11-30', qty: 5 },
    { sku: 'A', warehouse: 'E5', batch: 'B2', expiry: '2027-06-30', qty: 7 },
  ]);
  assert.equal(conflicts.length, 1, 'دفعةٌ واحدة بصلاحيتين = تعارضٌ يحتاج إنسانًا');
  assert.equal(conflicts[0].batch, 'B1');
  assert.deepEqual(conflicts[0].expiries, ['2027-06-30', '2027-11-30']);
});

test('★★ التعارض لا يُرفع على ما ليس تعارضًا', () => {
  // حارسٌ يصرخ في وجه ما هو سليم يُطفَأ بعد أسبوع، فتضيع الفائدة كلّها.
  assert.deepEqual(
    batchExpiryConflicts([
      { sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30' },
      { sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30', bin: 'MAIN-A01-R02' },
    ]),
    [],
    'الدفعة نفسها على رفّين بصلاحيةٍ واحدة ليست تعارضًا'
  );
  assert.deepEqual(
    batchExpiryConflicts([
      { sku: 'A', warehouse: 'E5', batch: '', expiry: '2027-06-30' },
      { sku: 'A', warehouse: 'E5', batch: '', expiry: '2028-01-01' },
    ]),
    [],
    'وبلا رقم دفعةٍ لا دفعة — NOBATCH وعاءٌ يجمع ما لا رقم له'
  );
  assert.deepEqual(
    batchExpiryConflicts([
      { sku: 'A', warehouse: 'E5', batch: 'B1', expiry: '2027-06-30' },
      { sku: 'A', warehouse: 'E2', batch: 'B1', expiry: '2028-01-01' },
    ]),
    [],
    'ومخزنان مختلفان ليسا تعارضًا'
  );
});

// ── المفتاح المركّب ────────────────────────────────────────────────
test('المعرّف مركّب: صنف × مخزن × تشغيلة — فإعادة الاستيراد تُحدّث لا تُكرّر', () => {
  const a = balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' });
  const b = balanceId({ sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' });
  assert.equal(a, b, 'نفس المدخلات ⇒ نفس المعرّف (تحديث لا تكرار)');
  assert.equal(a, 'WNW-001__E5__LOT-1');
});

test('اختلاف المخزن أو التشغيلة ⇒ رصيد مستقلّ', () => {
  const base = { sku: 'WNW-001', warehouse: 'E5', batch: 'LOT-1' };
  assert.notEqual(balanceId(base), balanceId({ ...base, warehouse: 'E2' }));
  assert.notEqual(balanceId(base), balanceId({ ...base, batch: 'LOT-2' }));
});

test('الباركود يصلح هوية حين يغيب الكود (حاوية أودو)', () => {
  const id = balanceId({ barcode: '8059692040599', warehouse: 'E5' });
  assert.equal(id, '8059692040599__E5__NOBATCH');
});

test('التشغيلة الفارغة تصير NOBATCH لا «--»', () => {
  assert.ok(balanceId({ sku: 'A', warehouse: 'E5' }).endsWith('__NOBATCH'));
  assert.ok(balanceId({ sku: 'A', warehouse: 'E5', batch: '' }).endsWith('__NOBATCH'));
});

test('بلا مخزن أو بلا هوية ⇒ null (رصيد لا صاحب له)', () => {
  assert.equal(balanceId({ sku: 'A' }), null, 'بلا مخزن');
  assert.equal(balanceId({ warehouse: 'E5' }), null, 'بلا هوية صنف');
});

test('«/» و«.» في التشغيلة لا تكسر معرّف المستند', () => {
  const id = balanceId({ sku: 'A', warehouse: 'E5', batch: 'LOT/2026.11' });
  assert.ok(!id.includes('/') && id.split('__')[2] !== undefined);
});

// ── FEFO ───────────────────────────────────────────────────────────
test('🥉 FEFO: الأقرب انتهاءً أولًا', () => {
  const rows = [
    { batch: 'C', expiry: '2027-06-01' },
    { batch: 'A', expiry: '2026-09-01' },
    { batch: 'B', expiry: '2027-01-01' },
  ];
  assert.deepEqual(fefoSort(rows).map((r) => r.batch), ['A', 'B', 'C']);
});

test('الرصيد بلا صلاحية يُدفع لآخر FEFO (لا نُقدّم مجهولًا)', () => {
  const rows = [
    { batch: 'NoExp', expiry: '' },
    { batch: 'Soon', expiry: '2026-08-01' },
  ];
  assert.deepEqual(fefoSort(rows).map((r) => r.batch), ['Soon', 'NoExp']);
});

test('fefoSort لا يعدّل الأصل', () => {
  const rows = [{ expiry: '2027-01-01' }, { expiry: '2026-01-01' }];
  const copy = [...rows];
  fefoSort(rows);
  assert.deepEqual(rows, copy);
});

// ── حالة الصلاحية ──────────────────────────────────────────────────
test('حالة الصلاحية: منتهٍ · قريب · سليم · غير محدَّد', () => {
  const now = Date.parse('2026-07-17');
  assert.equal(expiryStatus('2026-07-01', now), 'expired');
  assert.equal(expiryStatus('2026-08-01', now), 'near'); // خلال 30 يومًا
  assert.equal(expiryStatus('2027-01-01', now), 'ok');
  assert.equal(expiryStatus('', now), 'unknown');
  assert.equal(expiryStatus('نص غير تاريخ', now), 'unknown');
});

// ── التقييم (أساس S12) ─────────────────────────────────────────────
test('إجمالي الكمية عبر التشغيلات', () => {
  assert.equal(totalQty([{ qty: 10 }, { qty: 5 }, { qty: '3' }]), 18);
  assert.equal(totalQty([]), 0);
});

test('قيمة المخزون = Σ(كمية × تكلفة التشغيلة)', () => {
  const rows = [
    { qty: 10, unitCost: 12.5 },
    { qty: 4, unitCost: 20 },
  ];
  assert.equal(stockValue(rows), 205); // 125 + 80
});

test('التكلفة الغائبة لا تُفسد القيمة (تُحسب صفرًا)', () => {
  assert.equal(stockValue([{ qty: 10 }, { qty: 5, unitCost: 2 }]), 10);
});
