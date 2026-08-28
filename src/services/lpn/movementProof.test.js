/**
 * اختبارات بيّنة الحركة — القاعدة التي ختم بها نصّ الطلب:
 * «لا تتغيّر حالةٌ بضغط زرّ؛ بل بمسح باركود الأصل وباركود الوجهة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROOF_METHODS,
  PROOF_ROLES,
  buildProof,
  findProof,
  isScanned,
  movementProblem,
  proofCode,
  proofLine,
  proofProblem,
  proofSummary,
  withProof,
} from './movementProof.js';

const AT = '2026-08-27T10:00:00.000Z';
const scan = (role, value, expect = []) => buildProof({ role, value, expect, actor: 'u-1', actorName: 'علي', at: AT }).proof;

test('البيّنة تُبنى مجمَّدةً بفاعلٍ ووقتٍ وطريقةٍ معلنة', () => {
  const p = scan('SOURCE', 'LPN-MAIN-20260827-000001');
  assert.equal(p.kind, 'PALLET');
  assert.equal(p.method, PROOF_METHODS.SCAN.id);
  assert.equal(p.actor, 'u-1');
  assert.equal(p.at, AT);
  assert.equal(Object.isFrozen(p), true);
  assert.equal(isScanned(p), true);
});

test('★ البيّنة بلا فاعلٍ أو وقتٍ لا تُسجَّل', () => {
  assert.match(proofProblem({ role: 'SOURCE', value: 'W01-A01', at: AT }), /بلا فاعل/);
  assert.match(proofProblem({ role: 'SOURCE', value: 'W01-A01', actor: 'u' }), /بلا وقت/);
  assert.match(proofProblem({ role: 'X', value: 'W01-A01', actor: 'u', at: AT }), /طرفٌ غير معروف/);
  assert.match(proofProblem({ role: 'SOURCE', value: '', actor: 'u', at: AT }), /امسح الباركود/);
});

test('★★ النوع المتوقَّع يُحرس — والرسالة تسمّي المطلوب والممسوح', () => {
  const out = proofProblem({ role: 'DESTINATION', value: 'W01-DOCK-IN-01', expect: ['DOCK_OUT'], actor: 'u', at: AT });
  assert.match(out, /الوجهة المطلوب باب تحميل/);
  assert.match(out, /والممسوح باب استلام/);
  assert.equal(proofProblem({ role: 'DESTINATION', value: 'W01-DOCK-OUT-01', expect: ['DOCK_OUT'], actor: 'u', at: AT }), '');
});

test('★★ الاختيار اليدويّ جائزٌ بسببٍ مكتوب — لا ممنوعٌ منعًا يوقف مستودعًا', () => {
  const noReason = proofProblem({ role: 'SOURCE', value: 'W01-A01', actor: 'u', at: AT, manual: true });
  assert.match(noReason, /سببًا مكتوبًا/);

  const manual = buildProof({
    role: 'SOURCE',
    value: 'W01-A01',
    actor: 'u',
    at: AT,
    manual: true,
    reason: 'الملصق تالف',
  }).proof;
  assert.equal(manual.method, PROOF_METHODS.MANUAL.id);
  assert.equal(isScanned(manual), false);
  assert.equal(manual.reason, 'الملصق تالف');
});

test('★★ ينقص مسحٌ ⇒ لا تُثبَّت الحركة — والرسالة تسمّي الناقص', () => {
  const required = [
    { role: 'DESTINATION', kinds: ['DOCK_OUT'], labelAr: 'باب التحميل' },
    { role: 'DESTINATION', kinds: ['VEHICLE'], labelAr: 'المركبة' },
    { role: 'SOURCE', kinds: ['PALLET', 'PARCEL'], labelAr: 'الطبلية أو الطرد' },
  ];
  const out = movementProblem({ required, proofs: [scan('DESTINATION', 'W01-DOCK-OUT-01')] });
  assert.equal(out.ok, false);
  assert.match(out.message, /لا تُثبَّت الحركة بضغط زرّ/);
  assert.deepEqual(out.missing, ['المركبة', 'الطبلية أو الطرد']);
});

test('اكتملت البيّنات ⇒ تمرّ — والنوع البديل يُقبل', () => {
  const required = [
    { role: 'DESTINATION', kinds: ['DOCK_OUT'], labelAr: 'باب التحميل' },
    { role: 'SOURCE', kinds: ['PALLET', 'PARCEL'], labelAr: 'الطبلية أو الطرد' },
  ];
  const proofs = [scan('DESTINATION', 'W01-DOCK-OUT-01'), scan('SOURCE', 'SHP-RH-20260827-000125-01')];
  assert.equal(movementProblem({ required, proofs }).ok, true, 'الطرد يقوم مقام الطبلية حيث يقبلهما الميدان');
});

test('★ حركةٌ لا تقبل يدويًّا أصلًا تُردّ وتسمّي ما أُدخل بلا مسح', () => {
  const required = [{ role: 'DESTINATION', kinds: ['GATE_OUT'], labelAr: 'بوّابة الخروج' }];
  const manual = buildProof({
    role: 'DESTINATION',
    value: 'GATE-OUT-01',
    actor: 'u',
    at: AT,
    manual: true,
    reason: 'الملصق تالف',
  }).proof;
  const out = movementProblem({ required, proofs: [manual], allowManual: false });
  assert.equal(out.ok, false);
  assert.match(out.message, /لا تقبل اختيارًا يدويًّا/);
  assert.match(out.message, /بوّابة خروج/);
});

test('الخلاصة تقيس الثقة وتعدّ اليدويّ بأسبابه', () => {
  const manual = buildProof({ role: 'SOURCE', value: 'W01-A01', actor: 'u', at: AT, manual: true, reason: 'تالف' }).proof;
  const sum = proofSummary([scan('DESTINATION', 'W01-DOCK-OUT-01'), manual]);
  assert.equal(sum.total, 2);
  assert.equal(sum.scanned, 1);
  assert.equal(sum.trust, 50);
  assert.deepEqual(sum.reasons, [{ code: 'W01-A01', kind: 'موقع تخزين', reason: 'تالف' }]);
  assert.equal(proofSummary([]).trust, 0);
});

test('★ السطر يُقرأ بعد سنةٍ فيُعرف كيف وقعت الحركة', () => {
  const line = proofLine([scan('SOURCE', 'LPN-MAIN-20260827-000001'), scan('DESTINATION', 'W01-A01-R01')]);
  assert.match(line, /من LPN-MAIN-20260827-000001 إلى W01-A01-R01/);
  assert.match(line, /2 مسحًا/);
  assert.equal(proofLine([]), 'بلا بيّنة');
});

test('إعادةُ مسح الطرف نفسه تستبدل بيّنته ولا تضاعفها', () => {
  let proofs = [];
  proofs = withProof(proofs, scan('DESTINATION', 'W01-DOCK-OUT-01'));
  proofs = withProof(proofs, scan('DESTINATION', 'W01-DOCK-OUT-02'));
  assert.equal(proofs.length, 1, 'العامل يمسح البابَ ثانيةً لأنّه أخطأ — لا بيّنتان');
  assert.equal(proofCode(proofs, 'DESTINATION', 'DOCK_OUT'), 'W01-DOCK-OUT-02');

  proofs = withProof(proofs, scan('DESTINATION', 'VEH-RH-TRK-001'));
  assert.equal(proofs.length, 2, 'ونوعٌ آخر بيّنةٌ أخرى');
  assert.equal(findProof(proofs, 'SOURCE', 'PALLET'), null);
  assert.equal(proofCode(proofs, 'SOURCE', 'PALLET'), '');
});

test('الطرفان معلنان بأسمائهما', () => {
  assert.equal(PROOF_ROLES.SOURCE.labelAr, 'الأصل');
  assert.equal(PROOF_ROLES.DESTINATION.labelAr, 'الوجهة');
});
