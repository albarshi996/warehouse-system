/**
 * ‹155› اختبارات النقل بخطوةٍ واحدة (TRS) ودورةِ الصنف المضاف — منطقُ الحركات.
 *
 * ★★★ هذا الملفُّ يمسُّ الدفترَ المقدّس، فالنقضُ عدائيّ: نثبت أنّ البند المضاف
 * يُنتج **حركتَين ملحَقتَين** لا تحويرَ صفّ، وأنّ صافي المصدر صفرٌ بالضبط، وأنّ
 * الوجهةَ تربح الكمّيّة، وأنّ حارسَي السالب وصفرِ المصدر يمسكان كلَّ انحراف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMoves, balanceDeltas, findNegativeBalance, zeroBeforeKeys } from './movements.js';
import { balanceId } from '../balances/balanceKey.js';
import { SYSTEM_LOCATIONS } from './locations.js';

const ADJ = SYSTEM_LOCATIONS.ADJUSTMENT.code;

function trs(lines) {
  return { id: 'D1', type: 'TRS', number: 'TRS-2026-0001', header: { fromWarehouse: 'E5', toWarehouse: 'E2' }, lines };
}

/* ───────── النقلُ العاديّ: حركةٌ واحدةٌ تخرج وتدخل ───────── */

test('★★ بندٌ موجودٌ في المصدر: حركةُ نقلٍ واحدةٌ (E5 → E2)', () => {
  const { moves, problems } = buildMoves(trs([{ sku: 'ITM-1', qty: 5, unitCost: 10 }]));
  assert.deepEqual(problems, []);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'E5');
  assert.equal(moves[0].to, 'E2');
  assert.equal(moves[0].qty, 5);
  assert.equal(moves[0].reason, 'transfer-direct');

  const { deltas } = balanceDeltas(moves);
  const e5 = deltas.find((d) => d.warehouse === 'E5');
  const e2 = deltas.find((d) => d.warehouse === 'E2');
  assert.equal(e5.delta, -5, 'المصدر يُخصم');
  assert.equal(e2.delta, 5, 'الوجهة تُزاد');
});

/* ───────── ★★★ البندُ المضاف: حركتان ملحَقتان، صافي المصدر صفر ───────── */

test('★★★ بندٌ مضافٌ: حركةُ نقلٍ + حركةُ زيادةِ جرد — صافي المصدر صفر', () => {
  const { moves, problems } = buildMoves(trs([{ sku: 'ITM-9', qty: 3, unitCost: 7, addedFromTransfer: true }]));
  assert.deepEqual(problems, []);
  assert.equal(moves.length, 2, 'حركتان: نقلٌ وزيادةُ جرد');

  const transfer = moves.find((m) => m.reason === 'transfer-direct');
  const adjIn = moves.find((m) => m.reason === 'transfer-add-in');
  assert.ok(transfer && adjIn, 'الحركتان موجودتان');

  // المعرّفان حتميّان ومستقلّان — لا تحويرَ لصفّ.
  assert.equal(transfer.id, 'D1__000');
  assert.equal(adjIn.id, 'D1__add__000');

  // زيادةُ الجرد: المقابلُ الحسابيُّ ← المصدر.
  assert.equal(adjIn.from, ADJ);
  assert.equal(adjIn.to, 'E5');
  assert.equal(adjIn.qty, 3);
  assert.equal(adjIn.addedFromTransfer, true);
  assert.equal(adjIn.zeroBefore, true);
  assert.equal(adjIn.docNumber, 'TRS-2026-0001', 'مربوطةٌ برقم أمر النقل');

  const { deltas } = balanceDeltas(moves);
  const e5 = deltas.find((d) => d.warehouse === 'E5');
  const e2 = deltas.find((d) => d.warehouse === 'E2');
  const adj = deltas.find((d) => d.warehouse === ADJ);
  assert.equal(e5.delta, 0, '★★★ المصدر يرجع صفرًا (زيادةٌ +٣ ثمّ خصمٌ −٣)');
  assert.equal(e2.delta, 3, 'الوجهة تربح الكمّيّة');
  assert.equal(adj.delta, -3, 'المقابلُ الحسابيُّ يحمل الزيادة');
});

/* ───────── حارسُ صفرِ المصدر ───────── */

test('★★★ zeroBeforeKeys يُخرج مفتاحَ رصيدِ المصدر للبند المضاف', () => {
  const { moves } = buildMoves(trs([{ sku: 'ITM-9', qty: 3, addedFromTransfer: true }]));
  const keys = zeroBeforeKeys(moves);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].warehouse, 'E5');
  // المفتاحُ نفسُه الذي يصيبه خصمُ النقل — فالحارسُ يقرأ ما سيتغيّر.
  assert.equal(keys[0].id, balanceId({ sku: 'ITM-9', warehouse: 'E5' }));
});

test('بلا بنودٍ مضافة: لا مفاتيحَ صفرٍ (صفرُ كلفةٍ للنقل العاديّ)', () => {
  const { moves } = buildMoves(trs([{ sku: 'ITM-1', qty: 5 }]));
  assert.deepEqual(zeroBeforeKeys(moves), []);
});

/* ───────── حارسُ السالب يمسك الوسمَ الناقص ───────── */

test('★★★ بندٌ ليس في المصدر وبلا وسمٍ: حارسُ السالب يردّه', () => {
  // ITM-9 ليس في المصدر (رصيد صفر)، ولم يُوسَم — فالنقلُ يُنزله تحت الصفر.
  const { moves } = buildMoves(trs([{ sku: 'ITM-9', qty: 3 }]));
  const { deltas } = balanceDeltas(moves);
  const violation = findNegativeBalance(deltas, {}); // لا رصيدَ لأيّ مفتاح
  assert.ok(violation, 'النقلُ من مصدرٍ فارغٍ بلا وسمٍ يُردّ');
  assert.equal(violation.warehouse, 'E5');
});

test('★★ بندٌ مضافٌ ومصدرُه صفر: حارسُ السالب يمرّ (صافي المصدر صفر)', () => {
  const { moves } = buildMoves(trs([{ sku: 'ITM-9', qty: 3, addedFromTransfer: true }]));
  const { deltas } = balanceDeltas(moves);
  // لا رصيدَ لأيّ مفتاح (المصدرُ صفرٌ، والوجهةُ تُزاد، والمقابلُ حسابيّ).
  const violation = findNegativeBalance(deltas, {});
  assert.equal(violation, null, 'صافي المصدر صفرٌ فلا سالب، والمقابلُ الحسابيُّ معفًى');
});

/* ───────── النقضُ: أنواعٌ أخرى لا تتأثّر ───────── */

test('★★★ نوعٌ بلا addSourceAdjust لا يُنتج زيادةً ولو حمل الوسم', () => {
  // ISS صرفٌ عاديّ — وسمُ addedFromTransfer على بنده لا يُغيّر شيئًا.
  const iss = { id: 'D2', type: 'ISS', number: 'ISS-1', header: { warehouse: 'E5' }, lines: [{ sku: 'ITM-1', qty: 2, addedFromTransfer: true }] };
  const { moves } = buildMoves(iss);
  assert.equal(moves.length, 1, 'حركةٌ واحدةٌ — لا توسيعَ خارج TRS');
  assert.equal(moves[0].reason, 'issue-out');
  assert.deepEqual(zeroBeforeKeys(moves), []);
});

test('TRS مختلطٌ: بندٌ موجودٌ وبندٌ مضافٌ معًا', () => {
  const { moves } = buildMoves(trs([
    { sku: 'ITM-1', qty: 5, addedFromTransfer: false },
    { sku: 'ITM-9', qty: 3, addedFromTransfer: true },
  ]));
  assert.equal(moves.length, 3, 'نقلان + زيادةٌ واحدة');
  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.find((d) => d.warehouse === 'E5' && d.sku === 'ITM-1').delta, -5);
  assert.equal(deltas.find((d) => d.warehouse === 'E5' && d.sku === 'ITM-9').delta, 0);
  assert.equal(deltas.find((d) => d.warehouse === 'E2' && d.sku === 'ITM-9').delta, 3);
});
