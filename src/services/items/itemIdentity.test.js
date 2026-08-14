/**
 * حارس هويّة الصنف (SAP-1) — الكود هو الهويّة، والباركود وسيلة بحث (§9.1 ‹182›).
 *
 * الاختبار قبل الواجهة (§22 ‹995›): كلّ بوّابة قبول §9 ‹220-222› الممكنة
 * منطقًا خالصًا تُثبَت هنا — ولا سيّما أنّ تغيير الاسم لا يقطع تاريخ الصنف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeItemCode,
  assertNewItemIdentity,
  identityOf,
  itemSearchKeys,
  balancesForItem,
  canonicalLineSku,
  lineMatchesItem,
  orderedForItem,
  itemQuantities,
  normalizeSubstitutes,
  resolveSubstitutes,
} from './itemIdentity.js';
import { balanceId } from '../balances/balanceKey.js';

test('★★ حارس ف‑١: يرفض صنفًا جديدًا بلا كود برسالةٍ تشرح القاعدة', () => {
  assert.throws(() => assertNewItemIdentity({}), /لا يُنشأ صنفٌ جديد بلا كود/);
  assert.throws(() => assertNewItemIdentity({ sku: '   ' }), /وسيلة بحثٍ لا هويّة/);
});

test('★★ الباركود وحده لا يكفي هويّةً لصنفٍ جديد', () => {
  assert.throws(() => assertNewItemIdentity({ sku: '', barcode: '8059692040599' }));
});

test('الحارس يقبل الكود ويعيده بصيغته القانونيّة', () => {
  assert.equal(assertNewItemIdentity({ sku: ' itm-001 ' }), 'ITM-001');
});

test('هويّة السجلّ القائم: الكود يتقدّم على الباركود دائمًا', () => {
  assert.deepEqual(identityOf({ sku: 'ITM-9', barcode: '123' }), { key: 'ITM-9', via: 'sku' });
});

test('★ التوافق الرجعيّ: سجلّ قديم بباركودٍ فقط يعمل — موسومًا موروثًا لا شرعيًّا', () => {
  assert.deepEqual(identityOf({ barcode: '8059692040599' }), {
    key: '8059692040599',
    via: 'barcode-legacy',
  });
});

test('بلا كودٍ ولا باركود: لا هويّة', () => {
  assert.deepEqual(identityOf({}), { key: null, via: null });
});

test('★★ §9 ‹220›: تغيير الاسم لا يمسّ الهويّة إطلاقًا', () => {
  const before = identityOf({ sku: 'ITM-1', nameAr: 'كريم يدين' });
  const after = identityOf({ sku: 'ITM-1', nameAr: 'كريم اليدين المحسَّن' });
  assert.deepEqual(before, after);
});

test('★★ مفتاح الرصيد نفسه قبل تغيير الاسم وبعده — التاريخ متّصل ولا اسم في المفتاح', () => {
  const key1 = balanceId({ sku: 'ITM-1', warehouse: 'E5', batch: 'B1' });
  const key2 = balanceId({ sku: 'ITM-1', warehouse: 'E5', batch: 'B1' });
  assert.equal(key1, key2);
  assert.ok(!key1.includes('كريم'));
});

test('مفاتيح البحث = الكود + كلّ الباركودات، مطبَّعةً', () => {
  assert.deepEqual(itemSearchKeys({ sku: 'ITM-1', barcodes: ['8059692040599', '111'] }), [
    'ITM-1',
    '8059692040599',
    '111',
  ]);
  assert.deepEqual(itemSearchKeys({}), []);
});

test('أرصدة الصنف: يلتقط الكود والباركود الموروث معًا بلا تكرار صفّ', () => {
  const item = { sku: 'ITM-1', barcodes: ['8059692040599'] };
  const balances = [
    { id: 'a', sku: 'ITM-1', qty: 10 },
    { id: 'b', sku: '', barcode: '8059692040599', qty: 5 },
    { id: 'c', sku: 'OTHER', qty: 99 },
    { id: 'a', sku: 'ITM-1', qty: 10 },
  ];
  assert.deepEqual(balancesForItem(item, balances).map((b) => b.id), ['a', 'b']);
});

test('★ ف‑٤٣: سطرٌ فارغ الكود يأخذ كود الماستر', () => {
  assert.equal(canonicalLineSku({ sku: '' }, { sku: 'ITM-001' }), 'ITM-001');
});

test('★ ف‑٤٣: نفس الهويّة بصيغةٍ أخرى تُثبَّت على صيغة الماستر القانونيّة', () => {
  assert.equal(canonicalLineSku({ sku: ' itm-001 ' }, { sku: 'ITM-001' }), 'ITM-001');
});

test('★★ ف‑٤٣: كودٌ مختلف كتبه الموظّف لا يُدهس', () => {
  assert.equal(canonicalLineSku({ sku: 'ITM-999' }, { sku: 'ITM-001' }), 'ITM-999');
});

test('بلا ماستر يبقى المكتوب كما هو', () => {
  assert.equal(canonicalLineSku({ sku: 'x-1' }, null), 'x-1');
});

test('★ ف‑٢: «المطلوب» يجمع المفتوح من أسطر أوامر الشراء التي تخصّ الصنف بالكود أو بالباركود', () => {
  const item = { sku: 'ITM-1', barcodes: ['555'] };
  const rows = [
    { lines: [{ sku: 'ITM-1', open: 30 }, { sku: 'OTHER', open: 7 }] },
    { lines: [{ sku: '', barcode: '555', open: 12.5 }] },
  ];
  assert.equal(orderedForItem(item, rows), 42.5);
});

test('ف‑٢: بلا أوامر مفتوحة صفرٌ — لا رقم مخترع', () => {
  assert.equal(orderedForItem({ sku: 'ITM-1' }, []), 0);
  assert.equal(orderedForItem({}, [{ lines: [{ sku: 'ITM-1', open: 9 }] }]), 0);
});

test('lineMatchesItem يقبل Set أو مصفوفة', () => {
  assert.equal(lineMatchesItem({ sku: 'itm-1' }, ['ITM-1']), true);
  assert.equal(lineMatchesItem({ barcode: '555' }, new Set(['555'])), true);
  assert.equal(lineMatchesItem({ sku: 'x' }, ['ITM-1']), false);
});

test('★★ §14 ‹356› (اكتملت في SAP-7): المتاح = الموجود − المحجوز + المطلوب', () => {
  const balances = [
    { qty: 100, qtyReserved: 30 },
    { qty: 20, qtyReserved: 0 },
  ];
  assert.deepEqual(itemQuantities({ balances, ordered: 50 }), {
    inStock: 120,
    committed: 30,
    ordered: 50,
    available: 140,
  });
});

test('★ §14 ‹368›: نصيب النقل المفتوح يدخل المحجوز — وعلى مستوى الصنف يتوازن مع مطلوبه', () => {
  const balances = [{ qty: 100, qtyReserved: 10 }];
  const q = itemQuantities({ balances, ordered: 40, committedInTransit: 40 });
  assert.equal(q.committed, 50);
  assert.equal(q.ordered, 40);
  assert.equal(q.available, 90); // كما لو لا نقلَ — النقل الداخليّ لا يخلق بضاعة
});

test('المتاح السالب يُعلَن لا يُقصّ — إنذارُ التزامٍ فوق الطاقة', () => {
  const q = itemQuantities({ balances: [{ qty: 5, qtyReserved: 9 }] });
  assert.equal(q.available, -4);
  assert.equal(q.committed, 9);
});

test('بلا مدخلات: أصفار لا NaN', () => {
  assert.deepEqual(itemQuantities(), { inStock: 0, committed: 0, ordered: 0, available: 0 });
});

test('★ ف‑٣: البدائل تُطبَّع — بلا تكرار وبلا الصنف نفسه وبلا فراغ', () => {
  assert.deepEqual(normalizeSubstitutes([' itm-2 ', 'ITM-2', 'itm-1', '', null], 'ITM-1'), ['ITM-2']);
});

test('ف‑٣: يقبل قيمةً مفردة لا مصفوفة', () => {
  assert.deepEqual(normalizeSubstitutes('itm-3', 'ITM-1'), ['ITM-3']);
});

test('ف‑٣: يستبين الموجود من الماستر ويُصرّح بالمفقود لا يُخفيه', () => {
  const bySku = new Map([['ITM-2', { sku: 'ITM-2', nameAr: 'بديل' }]]);
  assert.deepEqual(resolveSubstitutes(['ITM-2', 'ITM-404'], bySku), [
    { sku: 'ITM-2', item: { sku: 'ITM-2', nameAr: 'بديل' } },
    { sku: 'ITM-404', item: null },
  ]);
});

test('normalizeItemCode: قصّ وترفيع — ولا شيء غيرهما', () => {
  assert.equal(normalizeItemCode(' itm-1 '), 'ITM-1');
  assert.equal(normalizeItemCode(null), '');
});
