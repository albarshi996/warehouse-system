/**
 * حارس الطلب المفتوح (SAP-7 · ف‑١٧) — الاختبار قبل الواجهة (§22 ‹995›).
 *
 * البوّابتان الحاكمتان: §14 ‹356› (المتاح = الموجود − المحجوز + المطلوب
 * بمصدرٍ حقيقيّ) و§21-٧ ‹982› (طلب النقل المفتوح يؤثّر في المحجوز
 * والمطلوب ولا يغيّر الموجود).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  poOrderedEntries,
  transferImpactEntries,
  itemOpenDemand,
  availableEquation,
} from './openDemand.js';

/** صفّ measureDocument مصغّر: مستندٌ وأسطره المفتوحة. */
const row = (header, lines) => ({ document: { header }, lines });

/* ═══════════════ المطلوب من أوامر الشراء ═══════════════ */

test('★★ ف‑١٧: المطلوب من الرصيد المفتوح لأوامر الشراء — المصدر الحقيقيّ لا تقدير', () => {
  const poRows = [
    row({ warehouse: 'E5' }, [
      { sku: 'ITM-1', open: 40 },
      { sku: 'ITM-2', open: 7 },
      { sku: 'ITM-1', open: 0 }, // سطرٌ اكتمل — لا يدخل
    ]),
    row({ warehouse: 'E2' }, [{ sku: 'itm-1', open: 10 }]),
  ];
  const entries = poOrderedEntries(poRows);
  assert.equal(entries.length, 3);
  const demand = itemOpenDemand(['ITM-1'], { poRows });
  assert.equal(demand.ordered, 50); // 40 في E5 + 10 في E2
  assert.equal(itemOpenDemand(['ITM-1'], { poRows, warehouse: 'E5' }).ordered, 40);
});

test('السطر يُطابَق بالكود أو بالباركود — كقاعدة الهويّة', () => {
  const poRows = [row({ warehouse: 'E5' }, [{ sku: '', barcode: '0111', open: 5 }])];
  assert.equal(itemOpenDemand(['111'], { poRows }).ordered, 5);
  assert.equal(itemOpenDemand(['999'], { poRows }).ordered, 0);
});

/* ═══════════════ §21-٧: طلب النقل المفتوح ═══════════════ */

test('★★ §21-٧: نقلٌ مفتوح 40 من E5 إلى E2 ⇒ محجوزٌ في المصدر ومطلوبٌ في الوجهة', () => {
  const trRows = [
    row({ fromWarehouse: 'E5', toWarehouse: 'E2' }, [{ sku: 'ITM-1', open: 40 }]),
  ];
  const impact = transferImpactEntries(trRows);
  assert.deepEqual(impact.committed, [{ keys: ['ITM-1'], warehouse: 'E5', qty: 40 }]);
  assert.deepEqual(impact.ordered, [{ keys: ['ITM-1'], warehouse: 'E2', qty: 40 }]);

  // في المصدر: يرتفع المحجوز لا المطلوب — وفي الوجهة العكس.
  const atSource = itemOpenDemand(['ITM-1'], { trRows, warehouse: 'E5' });
  assert.deepEqual(atSource, { ordered: 0, committedInTransit: 40 });
  const atDest = itemOpenDemand(['ITM-1'], { trRows, warehouse: 'E2' });
  assert.deepEqual(atDest, { ordered: 40, committedInTransit: 0 });
});

test('★★ «لا يغيّر In Stock»: الوحدة لا تُخرج أيّ دلتا موجودٍ بحال — بنيويًّا', () => {
  const trRows = [row({ fromWarehouse: 'E5', toWarehouse: 'E2' }, [{ sku: 'ITM-1', open: 40 }])];
  const impact = transferImpactEntries(trRows);
  // كلّ ما يخرج قيودُ ordered/committed — لا حقلَ inStock ولا delta في أيّ قيد.
  for (const entry of [...impact.ordered, ...impact.committed]) {
    assert.deepEqual(Object.keys(entry).sort(), ['keys', 'qty', 'warehouse']);
  }
});

test('★ على مستوى الصنف الإجماليّ يتوازن النقل: المتاح لا يتغيّر بنقلٍ داخليّ', () => {
  const trRows = [row({ fromWarehouse: 'E5', toWarehouse: 'E2' }, [{ sku: 'ITM-1', open: 40 }])];
  const total = itemOpenDemand(['ITM-1'], { trRows }); // بلا تحديد مستودع
  assert.equal(total.ordered, 40);
  assert.equal(total.committedInTransit, 40);
  const before = availableEquation({ inStock: 100, committed: 0, ordered: 0 });
  const after = availableEquation({
    inStock: 100, // الموجود لم يتحرّك
    committed: total.committedInTransit,
    ordered: total.ordered,
  });
  assert.equal(before, after);
});

/* ═══════════════ المعادلة §14 ‹356› ═══════════════ */

test('★ المعادلة حرفيًّا: المتاح = الموجود − المحجوز + المطلوب — والسالب يُعلَن لا يُقصّ', () => {
  assert.equal(availableEquation({ inStock: 100, committed: 30, ordered: 50 }), 120);
  assert.equal(availableEquation({ inStock: 5, committed: 9, ordered: 0 }), -4);
  assert.equal(availableEquation(), 0);
});

test('مستندٌ بلا مستودعٍ في الرأس: القيد يبقى بمفتاح مستودعٍ فارغ ولا ينهار', () => {
  const poRows = [row({}, [{ sku: 'ITM-1', open: 3 }])];
  assert.equal(itemOpenDemand(['ITM-1'], { poRows }).ordered, 3);
  assert.equal(itemOpenDemand(['ITM-1'], { poRows, warehouse: 'E5' }).ordered, 0);
});
