/**
 * اختبارات منطق العُهد العينية الخالص:
 *   - السند الناقص لا يصدر (اسم/وصف/حالة).
 *   - العهدة المغلقة لا تُفتح، والنشطة تُغلق بثلاث نهايات.
 *   - الملخص يحسب القيمة تحت المخاطرة وقيمة الخصومات.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTODY_STATES,
  CUSTODY_TRANSITIONS,
  canTransitionCustody,
  custodyVerdict,
  custodySummary,
  byEmployee,
} from './custodyModel.js';

test('سند مكتمل يصدر، والناقص يُرفض بمشاكله', () => {
  const ok = custodyVerdict({ employeeName: 'أحمد', itemDesc: 'PDA زيبرا', condition: 'جيد', value: '450' });
  assert.deepEqual(ok, { ok: true, problems: [] });

  const bad = custodyVerdict({ employeeName: '', itemDesc: '', condition: '', value: '-5' });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 4);
});

test('القيمة اختيارية لكن إن كُتبت فرقم موجب', () => {
  assert.equal(custodyVerdict({ employeeName: 'أ', itemDesc: 'ب', condition: 'جيد', value: '' }).ok, true);
  assert.equal(custodyVerdict({ employeeName: 'أ', itemDesc: 'ب', condition: 'جيد', value: 'xx' }).ok, false);
});

test('النشطة تُغلق بإرجاع/فقد/إتلاف — والمغلق نهائي', () => {
  assert.ok(canTransitionCustody('active', 'returned'));
  assert.ok(canTransitionCustody('active', 'lost'));
  assert.ok(canTransitionCustody('active', 'damaged'));
  assert.equal(canTransitionCustody('returned', 'active'), false);
  assert.equal(canTransitionCustody('lost', 'returned'), false);
  for (const [from, tos] of Object.entries(CUSTODY_TRANSITIONS)) {
    assert.ok(CUSTODY_STATES[from]);
    for (const to of tos) assert.ok(CUSTODY_STATES[to]);
  }
});

test('الملخص: القيمة تحت المخاطرة للنشطة، والخصم للمفقود/المتلف', () => {
  const sum = custodySummary([
    { state: 'active', value: 450 },
    { state: 'active', value: 300 },
    { state: 'returned', value: 200 },
    { state: 'lost', value: 500 },              // بلا خصم صريح ⇒ القيمة نفسها
    { state: 'damaged', value: 400, deduction: 150 }, // خصم جزئي صريح
  ]);
  assert.equal(sum.total, 5);
  assert.equal(sum.active, 2);
  assert.equal(sum.valueAtRisk, 750);
  assert.equal(sum.lossValue, 650);
});

test('byEmployee: يجمع النشطة فقط ويرتّب بالأكثر عهدًا', () => {
  const rows = byEmployee([
    { state: 'active', employeeName: 'سالم', value: 100 },
    { state: 'active', employeeName: 'خالد', value: 50 },
    { state: 'active', employeeName: 'سالم', value: 200 },
    { state: 'returned', employeeName: 'سالم', value: 999 },
  ]);
  assert.equal(rows[0].employeeName, 'سالم');
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].value, 300);
  assert.equal(rows.length, 2);
});
