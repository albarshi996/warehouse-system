/**
 * اختبارات نحو هويّة الطبلية — الهويّة التي سيقوم عليها ملصق الحمولة وتتبّعها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LPN_PREFIX,
  LPN_SEQ_DIGITS,
  formatLpnCode,
  isValidLpnCode,
  lpnCodeProblem,
  lpnCounterKey,
  lpnDateStamp,
  normalizeLpnCode,
  parseLpnCode,
  shortLpnLabel,
} from './lpnCode.js';

const FULL = 'LPN-MAIN-20260826-000001';

test('التطبيع: حروف صغيرة وأرقام عربية ومسافات وفواصل متكرّرة تلتقي في صيغة واحدة', () => {
  assert.equal(normalizeLpnCode('lpn-main-20260826-000001'), FULL);
  assert.equal(normalizeLpnCode('  LPN-MAIN-20260826-000001  '), FULL);
  assert.equal(normalizeLpnCode('LPN MAIN 20260826 000001'), FULL, 'المسافة فاصل لا خطأ — العامل يكتبها');
  assert.equal(normalizeLpnCode('LPN--MAIN--20260826--000001'), FULL);
  assert.equal(normalizeLpnCode('LPN-MAIN-٢٠٢٦٠٨٢٦-٠٠٠٠٠١'), FULL, 'الأرقام العربية-الهندية تُغرَّب فلا تصير الطبلية طبليتين');
  assert.equal(normalizeLpnCode(null), '');
});

test('البناء: من المستودع واليوم والتسلسل — والتسلسل يُحشى أصفارًا', () => {
  assert.equal(formatLpnCode({ warehouse: 'MAIN', date: '2026-08-26', seq: 1 }), FULL);
  assert.equal(formatLpnCode({ warehouse: 'main', date: '20260826', seq: 145 }), 'LPN-MAIN-20260826-000145');
  assert.equal(
    formatLpnCode({ warehouse: 'WH01', date: new Date('2026-08-26T10:00:00Z'), seq: 7 }),
    'LPN-WH01-20260826-000007'
  );
});

test('★★ الهويّة لا تُبنى فاسدة: مستودع فاسد أو تسلسل خارج المدى يعيد null لا هويّة عرجاء', () => {
  assert.equal(formatLpnCode({ warehouse: '', date: '20260826', seq: 1 }), null);
  assert.equal(formatLpnCode({ warehouse: 'MA IN/', date: '20260826', seq: 1 }), null, 'محارف تكسر معرّف Firestore لا تدخل الهويّة');
  assert.equal(formatLpnCode({ warehouse: 'MAIN', date: 'ليس-تاريخًا', seq: 1 }), null);
  assert.equal(formatLpnCode({ warehouse: 'MAIN', date: '20260826', seq: 0 }), null, 'التسلسل يبدأ من واحد');
  assert.equal(formatLpnCode({ warehouse: 'MAIN', date: '20260826', seq: 10 ** LPN_SEQ_DIGITS }), null, 'فوق المليون يفيض عن الخانات');
});

test('الفكّ: أربعة مقاطع بأسمائها والتسلسل عددًا', () => {
  const p = parseLpnCode(FULL);
  assert.deepEqual(p, { code: FULL, warehouse: 'MAIN', date: '20260826', seq: 1 });
  assert.equal(parseLpnCode('ليست-طبلية'), null);
});

test('الرفض يقول الصواب لا كلمة «خطأ»: كلّ علّة برسالة تسمّي المقطع العليل', () => {
  assert.match(lpnCodeProblem(''), /فارغة/);
  assert.match(lpnCodeProblem('GRN-2026-0001'), /ليس ملصق طبلية/, 'مسح مستندٍ مكان طبلية يقال له ما هو');
  assert.match(lpnCodeProblem('LPN-MAIN-20260826'), /أربعة مقاطع/);
  assert.match(lpnCodeProblem('LPN-MAIN-20269999-000001'), /ليس يومًا حقيقيًّا/);
  assert.match(lpnCodeProblem('LPN-MAIN-20260826-01'), /خانات رقمية/);
  assert.match(lpnCodeProblem('LPN-MAIN-20260826-000000'), /صفر لا يُصدر/);
  assert.equal(lpnCodeProblem(FULL), '');
  assert.ok(isValidLpnCode(FULL));
});

test('مفتاح العدّاد اليومي حتميّ: مستودعٌ ويومٌ واحد ⇒ مفتاحٌ واحد يتنازعه الجميع ذرّيًّا', () => {
  assert.equal(lpnCounterKey({ warehouse: 'MAIN', date: '2026-08-26' }), 'LPN-MAIN-20260826');
  assert.equal(lpnCounterKey({ warehouse: 'main', date: '20260826' }), 'LPN-MAIN-20260826', 'التطبيع قبل المفتاح — لا عدّادان لمستودعٍ واحد');
  assert.equal(lpnCounterKey({ warehouse: '', date: '20260826' }), null);
});

test('تاريخ الهويّة من مدخل مرن — وما ليس تاريخًا يعود فارغًا لا مخمَّنًا', () => {
  assert.equal(lpnDateStamp('2026-08-26'), '20260826');
  assert.equal(lpnDateStamp('٢٠٢٦٠٨٢٦'), '20260826');
  assert.equal(lpnDateStamp('غدًا'), '');
});

test('المختصر للعامل: آخر ستّ خانات — والفاسد فارغ لا مقصوص', () => {
  assert.equal(shortLpnLabel('LPN-MAIN-20260826-000145'), '000145');
  assert.equal(shortLpnLabel('ليست-طبلية'), '');
});

test('🔒 LPN ليس رقم Lot ولا موقعًا: البادئة الثابتة تفصل الفضاءات من أوّل محرف', () => {
  // طبليةٌ تُمسح مكان موقعٍ أو تشغيلةٍ يجب أن تُعرف من بادئتها فورًا —
  // الفضاءات الثلاثة (LPN / كود موقع / Lot) لا يجوز أن تتقاطع معرّفاتها.
  assert.equal(FULL.split('-')[0], LPN_PREFIX);
  assert.ok(!isValidLpnCode('MAIN-A01-R01'), 'كود موقعٍ ليس طبلية');
  assert.ok(!isValidLpnCode('B2408'), 'رقم تشغيلةٍ ليس طبلية');
});

// ═══ ما كشفته المراجعة العدائية 2026-08-26 ═══

test('🔒 التاريخ يُفحص يومًا حقيقيًّا لا مدًى: «٣٠ فبراير» ملصقٌ تالف يُردّ', () => {
  assert.match(lpnCodeProblem('LPN-MAIN-20260230-000001'), /ليس يومًا حقيقيًّا/, '٣٠ فبراير لا يوجد');
  assert.match(lpnCodeProblem('LPN-MAIN-20260431-000001'), /ليس يومًا حقيقيًّا/, 'أبريل ثلاثون');
  assert.equal(lpnCodeProblem('LPN-MAIN-20280229-000001'), '', '٢٠٢٨ كبيسة فالتاسع والعشرون قائم');
  assert.match(lpnCodeProblem('LPN-MAIN-20260229-000001'), /ليس يومًا حقيقيًّا/, '٢٠٢٦ ليست كبيسة');
});

test('🔒 ختم اليوم محلّيٌّ لا UTC — الورديّة الليليّة لا تحمل تاريخ أمس', () => {
  // ليبيا +٢: الواحدة صباحًا محلّيًّا هي الحادية عشرة مساءً UTC من أمس.
  // القراءة المحلّيّة تعطي اليوم الصحيح مهما كان فارق المنطقة.
  const local = new Date(2026, 7, 26, 1, 0, 0); // ٢٦ أغسطس ٠١:٠٠ محلّيًّا
  assert.equal(lpnDateStamp(local), '20260826', 'اليوم المحلّيّ هو المكتوب على الملصق');
});
