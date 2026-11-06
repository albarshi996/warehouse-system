/**
 * اختبارات تكوين المستودع من جردٍ معتمد — المنطق الخالص وحده (بلا Firestore).
 *
 * يُثبت الضمانات الحاكمة لمنظومة موقع 155:
 *   ① بناءُ التكوين: الأصنافُ تُرقّى، والأرصدةُ الافتتاحيّةُ تُبنى، والخدمةُ لا
 *      رصيدَ لها، والمفاتيحُ المتكرّرةُ تُجمَّع.
 *   ② ★★★ **مفتاحُ الرصيد الافتتاحيّ = مفتاحُ حركةِ صرفٍ لاحقةٍ** لنفس
 *      الصنف/المخزن — وإلّا انقسم الرصيدُ فرُفض صرفٌ صحيح.
 *   ③ حارسُ البوّابة: مخزنُ 155 غيرُ مكوَّنٍ يُحظر، والمكوَّنُ يمرّ، و**المخزنُ
 *      القديم لا يُبوَّب أبدًا** (نقضُ كسرِ القديم).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFormation, countedQtyOf } from './formation.js';
import { buildMoves, balanceDeltas, formationViolation } from '../ledger/movements.js';

/* ───────────────── ① بناءُ التكوين ───────────────── */

test('buildFormation يرقّي الأصناف ويبني الأرصدة الافتتاحيّة', () => {
  const { itemUpserts, openingBalances } = buildFormation(
    [
      { sku: 'A', description: 'صنف أ', count1: 50, count2: 48, batch: 'B1', unitPrice: 2 },
      { sku: 'B', description: 'صنف ب', count1: 10, unitPrice: 5 },
    ],
    'E1'
  );
  assert.equal(itemUpserts.length, 2);
  assert.deepEqual(
    itemUpserts.map((u) => u.sku).sort(),
    ['A', 'B']
  );
  assert.equal(openingBalances.length, 2);

  const a = openingBalances.find((b) => b.sku === 'A');
  assert.equal(a.qty, 48, 'العدّ المؤكَّد هو الثاني لا الأول');
  assert.equal(a.warehouse, 'E1');
  assert.equal(a.batch, 'B1');
  assert.equal(a.bin, '', 'الرصيد الافتتاحيّ بلا خانة');
  assert.equal(a.stockStatus, 'OK');
  assert.equal(a.unitCost, 2);

  const b = openingBalances.find((b2) => b2.sku === 'B');
  assert.equal(b.qty, 10, 'بلا عدٍّ ثانٍ يؤخذ الأول');
});

test('buildFormation: جردٌ فارغٌ يُعيد مصفوفتَين فارغتَين (مخزنٌ فارغٌ يُكوَّن بلا رصيد)', () => {
  const { itemUpserts, openingBalances } = buildFormation([], 'E2');
  assert.equal(itemUpserts.length, 0);
  assert.equal(openingBalances.length, 0);
});

test('buildFormation: بلا كود مخزنٍ لا تكوين', () => {
  const { itemUpserts, openingBalances } = buildFormation([{ sku: 'A', count1: 5 }], '');
  assert.equal(itemUpserts.length, 0);
  assert.equal(openingBalances.length, 0);
});

test('buildFormation: الخدمةُ تُرقّى في الماستر ولا رصيدَ لها', () => {
  const items = new Map([['SVC', { sku: 'SVC', itemType: 'service', nameAr: 'رسوم' }]]);
  const { itemUpserts, openingBalances } = buildFormation(
    [
      { sku: 'SVC', description: 'رسوم نقل', count1: 3, unitPrice: 100 },
      { sku: 'A', description: 'صنف أ', count1: 7, unitPrice: 1 },
    ],
    'E1',
    { items }
  );
  assert.equal(itemUpserts.length, 2, 'الخدمةُ تُرقّى أيضًا');
  assert.equal(openingBalances.length, 1, 'لكنّ الخدمةَ لا رصيدَ لها');
  assert.equal(openingBalances[0].sku, 'A');
});

test('buildFormation: البنودُ على نفس المفتاح تُجمَّع لا تُدهس', () => {
  const { openingBalances } = buildFormation(
    [
      { sku: 'A', description: 'أ', count1: 10, batch: 'B1', unitPrice: 2 },
      { sku: 'A', description: 'أ', count1: 15, batch: 'B1', unitPrice: 2 },
    ],
    'E1'
  );
  assert.equal(openingBalances.length, 1, 'مفتاحٌ واحدٌ لا صفّان');
  assert.equal(openingBalances[0].qty, 25, 'الكمّيّتان تُجمعان');
});

test('buildFormation: بندٌ بلا هويّةٍ يُتجاهل', () => {
  const { itemUpserts, openingBalances } = buildFormation(
    [{ description: 'بلا كود ولا باركود', count1: 9 }],
    'E1'
  );
  assert.equal(itemUpserts.length, 0);
  assert.equal(openingBalances.length, 0);
});

test('countedQtyOf: الصريحةُ ثمّ الثاني ثمّ الأول', () => {
  assert.equal(countedQtyOf({ qty: 7, count1: 1, count2: 2 }), 7, 'qty الصريحة أوّلًا');
  assert.equal(countedQtyOf({ count1: 3, count2: 5 }), 5, 'الثاني يُقدَّم');
  assert.equal(countedQtyOf({ count1: 3, count2: '' }), 3, 'الثاني الفارغ يسقط للأول');
  assert.equal(countedQtyOf({}), 0, 'لا عدّ ⇒ صفر');
});

/* ──────── ② مفتاحُ الرصيد الافتتاحيّ = مفتاحُ حركة الصرف ──────── */

test('★★★ مفتاحُ الرصيد الافتتاحيّ يطابق مفتاحَ حركةِ صرفٍ لاحقةٍ لنفس الصنف/المخزن', () => {
  // تكوينٌ: صنف A في E1، تشغيلة B1 — رصيدٌ افتتاحيّ 100.
  const { openingBalances } = buildFormation(
    [{ sku: 'A', description: 'صنف أ', count1: 100, count2: 100, batch: 'B1', unitPrice: 2 }],
    'E1'
  );
  const openingId = openingBalances[0].id;

  // صرفٌ لاحقٌ (ISS) لنفس الصنف من E1، تشغيلة B1، بلا خانة.
  const issue = buildMoves({
    id: 'ISS1',
    type: 'ISS',
    state: 'done',
    header: { warehouse: 'E1' },
    lines: [{ sku: 'A', description: 'صنف أ', qty: 30, unitCost: 2, batch: 'B1' }],
  });
  const issueDelta = balanceDeltas(issue.moves).deltas.find((d) => d.warehouse === 'E1');

  assert.equal(
    openingId,
    issueDelta.id,
    'مفتاحُ الرصيد الافتتاحيّ = مفتاحُ حركة الصرف — فالصرفُ يجد ما كوّنه الجرد'
  );
});

test('★★ ويطابق مفتاحَ حركةِ استلامٍ لاحقةٍ (SRI) أيضًا', () => {
  const { openingBalances } = buildFormation(
    [{ sku: 'C', description: 'صنف ج', count1: 40, unitPrice: 1 }],
    'E1'
  );
  const openingId = openingBalances[0].id; // بلا تشغيلة ⇒ NOBATCH

  const receipt = buildMoves({
    id: 'SRI1',
    type: 'SRI',
    state: 'done',
    header: { warehouse: 'E1' },
    lines: [{ sku: 'C', description: 'صنف ج', qty: 20, unitCost: 1 }],
  });
  const recvDelta = balanceDeltas(receipt.moves).deltas.find((d) => d.warehouse === 'E1');
  assert.equal(openingId, recvDelta.id);
});

/* ───────────────── ③ حارسُ البوّابة ───────────────── */

const WH_MAP = new Map([
  ['E1', { formed: false, requiresFormation: true, site: '155' }], // 155 غير مكوَّن
  ['E2', { formed: true, requiresFormation: true, site: '155' }], // 155 مكوَّن
  ['E7', { formed: false, site: '155' }], // اشتقاقُ site وحدَه (بلا requiresFormation)
  ['WH001', { formed: false, site: '' }], // قديمٌ بلا وسمَين
]);

const putawayTo = (wh) =>
  buildMoves({
    id: 'D',
    type: 'PUTAWAY',
    state: 'done',
    header: { warehouse: wh },
    lines: [{ sku: 'A', description: 'أ', qty: 5, unitPrice: 1 }],
  }).moves;

test('البوّابة: مخزنُ 155 غيرُ مكوَّنٍ ⇒ خرق', () => {
  assert.deepEqual(formationViolation(putawayTo('E1'), WH_MAP), { warehouse: 'E1' });
});

test('البوّابة: مخزنُ 155 مكوَّنٌ ⇒ لا خرق', () => {
  assert.equal(formationViolation(putawayTo('E2'), WH_MAP), null);
});

test('البوّابة: اشتقاقُ site وحدَه يكفي للحظر (بلا requiresFormation)', () => {
  assert.deepEqual(formationViolation(putawayTo('E7'), WH_MAP), { warehouse: 'E7' });
});

test('★★★ البوّابة: المخزنُ القديم (WH001) لا يُبوَّب أبدًا — نقضُ كسرِ القديم', () => {
  assert.equal(formationViolation(putawayTo('WH001'), WH_MAP), null);
});

test('البوّابة: مخزنٌ مجهولٌ (ليس في الخريطة) لا يُبوَّب', () => {
  assert.equal(formationViolation(putawayTo('ZZZ'), WH_MAP), null);
});

test('البوّابة: المواقعُ غيرُ المستودعيّة تُتجاهل (نظامٌ · مركبةٌ · عميلٌ · الخارج)', () => {
  // GRN: من الخارج (null) إلى RECEIVING (نظام) — لا طرفَ مستودعيّ.
  const grn = buildMoves({
    id: 'G',
    type: 'GRN',
    state: 'done',
    header: {},
    lines: [{ sku: 'A', description: 'أ', qtyReceived: 5, unitPrice: 1 }],
  }).moves;
  assert.equal(formationViolation(grn, WH_MAP), null);

  // DN: من STAGING (نظام) إلى VAN (مركبة) — لا طرفَ مستودعيّ.
  const dn = buildMoves({
    id: 'DN',
    type: 'DN',
    state: 'done',
    header: { vehiclePlate: 'LY-123' },
    lines: [{ sku: 'A', description: 'أ', qty: 3, unitPrice: 1 }],
  }).moves;
  assert.equal(formationViolation(dn, WH_MAP), null);
});

test('البوّابة: PUTAWAY طرفُه RECEIVING (نظام) يُتجاهل، وطرفُه E1 (155 غير مكوَّن) يُمسك', () => {
  // يُثبت أنّ الحارسَ يفحص الطرفَين: الداخلُ من RECEIVING يُتجاهل، والوجهةُ E1 تُحظر.
  assert.deepEqual(formationViolation(putawayTo('E1'), WH_MAP), { warehouse: 'E1' });
});

test('البوّابة: خريطةٌ غائبةٌ (لم تُقرأ) ⇒ null — لا يوقف تعذُّرُ القراءة القيدَ', () => {
  assert.equal(formationViolation(putawayTo('E1'), null), null);
  assert.equal(formationViolation(putawayTo('E1'), new Map()), null, 'خريطةٌ فارغةٌ لا تحظر');
});
