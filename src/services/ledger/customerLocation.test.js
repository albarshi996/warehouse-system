/**
 * قيد مواقع العملاء — البضاعة المحميّة والأمانة.
 *
 * السؤال الذي تجيب عنه هذه الاختبارات: هل صار للعميل رصيدٌ حقيقيّ في الدفتر،
 * تحكمه الحرّاس نفسها التي تحكم الرفّ؟
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoves, balanceDeltas, findNegativeBalance } from './movements.js';
import { postingRuleFor, isCustomerToken, CUSTOMER, warehouseRequiringTypes } from './postingRules.js';
import {
  customerLocationCode,
  isCustomerLocation,
  customerCodeFromLocation,
  atCustomerBalances,
  isReservedCode,
  locationLabel,
} from './locations.js';

const doc = (type, header, lines) => ({ id: 'D1', type, number: `${type}-1`, header, lines });

test('كود موقع العميل من رمزه موحّد الحالة', () => {
  assert.equal(customerLocationCode('c-01'), 'CUST:C-01');
  assert.equal(customerLocationCode('  '), '');
  assert.equal(isCustomerLocation('CUST:C-01'), true);
  assert.equal(isCustomerLocation('MAIN'), false);
  assert.equal(customerCodeFromLocation('CUST:C-01'), 'C-01');
});

test('بادئة العميل محجوزة فلا يحملها مستودع حقيقيّ', () => {
  assert.equal(isReservedCode('CUST:C-01'), true);
  assert.equal(isReservedCode('MAIN'), false);
  assert.match(locationLabel('CUST:C-01'), /لدى العميل C-01/);
});

test('الرمز @customer يُقرأ من رأس المستند', () => {
  assert.equal(isCustomerToken(CUSTOMER), true);
  assert.equal(isCustomerToken('@vehicle'), false);
  // موقع العميل ليس مستودعًا يُقرأ من حقل مستودع — فلا يدخل هذه القائمة.
  assert.ok(!warehouseRequiringTypes().includes('VCD'));
});

test('★ الإيداع ينقل الرصيد من المركبة إلى موقع العميل — ولا يخرج من الدفتر', () => {
  const { moves, problems } = buildMoves(
    doc('VCD', { vehiclePlate: '12-3456', customerCode: 'c-01' }, [
      { sku: 'A', qty: 10, batch: 'B1', expiry: '2027-01-01', unitCost: 5 },
    ])
  );
  assert.deepEqual(problems, []);
  assert.equal(moves[0].from, 'VAN:12-3456');
  assert.equal(moves[0].to, 'CUST:C-01');
  assert.equal(moves[0].reason, 'consign-out');

  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.length, 2, 'طرفان لهما رصيد — لا شيء يتبخّر');
  assert.equal(deltas.find((d) => d.warehouse === 'CUST:C-01').delta, 10);
  assert.equal(deltas.find((d) => d.warehouse === 'VAN:12-3456').delta, -10);
});

test('★ تحقّق البيع هو اللحظة التي تخرج فيها الملكيّة', () => {
  const { moves } = buildMoves(
    doc('VCS', { customerCode: 'C-01' }, [{ sku: 'A', qty: 4, batch: 'B1', unitPrice: 12 }])
  );
  assert.equal(moves[0].from, 'CUST:C-01');
  assert.equal(moves[0].to, null, 'خارج المنشأة');

  const { deltas } = balanceDeltas(moves);
  assert.equal(deltas.length, 1, 'الخارج لا رصيد له');
  assert.equal(deltas[0].delta, -4);
});

test('الاسترداد يعيد البضاعة إلى المركبة لا إلى المستودع', () => {
  const { moves } = buildMoves(
    doc('VCR', { customerCode: 'C-01', vehiclePlate: '12-3456' }, [{ sku: 'A', qty: 3, batch: 'B1', unitCost: 5 }])
  );
  assert.equal(moves[0].from, 'CUST:C-01');
  assert.equal(moves[0].to, 'VAN:12-3456');
  assert.equal(moves[0].reason, 'consign-return');
});

test('بلا رمز عميل يُرفض القيد بسبب مكتوب', () => {
  for (const type of ['VCD', 'VCS', 'VCR']) {
    const { moves, problems } = buildMoves(doc(type, { vehiclePlate: '12-3456' }, [{ sku: 'A', qty: 1 }]));
    assert.equal(moves.length, 0, `${type} قُيّد بلا عميل`);
    assert.ok(problems.length > 0);
  }
});

test('★ لا يُستردّ ولا يُباع إلّا ما أُودع — حارس الرصيد السالب يخدم الأمانة', () => {
  const { moves } = buildMoves(
    doc('VCS', { customerCode: 'C-01' }, [{ sku: 'A', qty: 10, batch: 'B1', unitPrice: 12 }])
  );
  const { deltas } = balanceDeltas(moves);

  // عند العميل أربعةٌ فقط، وهو يحاول مطابقة عشرة.
  const breach = findNegativeBalance(deltas, { 'A__CUST:C-01__B1': 4 });
  assert.ok(breach, 'يجب أن يُمنع');
  assert.equal(breach.warehouse, 'CUST:C-01');
  assert.equal(breach.current, 4);
  assert.equal(breach.requested, 10);

  // وبرصيدٍ كافٍ يمرّ.
  assert.equal(findNegativeBalance(deltas, { 'A__CUST:C-01__B1': 10 }), null);
});

test('تقرير «ما لدى العملاء الآن» يُخرج غير الصفريّ ويُرفقه برمز العميل', () => {
  const rows = atCustomerBalances([
    { sku: 'A', warehouse: 'CUST:C-01', qty: 6 },
    { sku: 'B', warehouse: 'CUST:C-02', qty: 0 },
    { sku: 'C', warehouse: 'MAIN', qty: 50 },
    { sku: 'D', warehouse: 'VAN:12-3456', qty: 3 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerCode, 'C-01');
  assert.match(rows[0].locationLabel, /لدى العميل/);
});

test('قواعد القيد الثلاث معرّفة باتجاهها الصحيح', () => {
  assert.equal(postingRuleFor('VCD').to, CUSTOMER);
  assert.equal(postingRuleFor('VCS').from, CUSTOMER);
  assert.equal(postingRuleFor('VCS').to, null);
  assert.equal(postingRuleFor('VCR').from, CUSTOMER);
});
