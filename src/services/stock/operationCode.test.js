/**
 * حرّاس رمز العملية — مفتاح دخول لجان الجرد.
 *
 * الرمز يُملى صوتًا في رحبةٍ صاخبة ويُكتب على هاتفٍ بيدٍ واحدة. فما يُختبر هنا
 * ليس «هل يولّد نصًّا» بل **هل يصمد أمام إنسانٍ يكتب**: حروفًا صغيرة، وشرطاتٍ
 * زائدة، وأرقامًا عربيّة-هنديّة، و`O` يقصد بها صفرًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  normalizeOperationCode,
  isValidOperationCode,
  formatOperationCode,
  generateOperationCode,
  resolveOperationByCode,
} from './operationCode.js';

// ═══ الأبجديّة ════════════════════════════════════════════════════════════

test('الأبجديّة خاليةٌ من المحارف التي تُقرأ خطأً', () => {
  for (const bad of ['I', 'L', 'O', 'U']) {
    assert.ok(!CODE_ALPHABET.includes(bad), `${bad} ما زالت في الأبجديّة`);
  }
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(new Set(CODE_ALPHABET).size, 32, 'محرفٌ مكرّر في الأبجديّة');
});

// ═══ التطبيع — قلبُ الأمر ═════════════════════════════════════════════════

test('يقبل الحروف الصغيرة والشرطات والمسافات', () => {
  assert.equal(normalizeOperationCode('h4k-9tm'), 'H4K9TM');
  assert.equal(normalizeOperationCode('H4K 9TM'), 'H4K9TM');
  assert.equal(normalizeOperationCode('  h4k9tm  '), 'H4K9TM');
});

test('★ الأرقام العربيّة-الهنديّة تُقرأ أرقامًا — واللوحة العربيّة هي الأصل هنا', () => {
  assert.equal(normalizeOperationCode('H٤K-٩TM'), 'H4K9TM');
  assert.equal(normalizeOperationCode('٠١٢٣٤٥'), '012345');
  assert.equal(normalizeOperationCode('۰۱۲۳۴۵'), '012345', 'والفارسيّة كذلك');
});

test('★ المحارف المُشتبَهة تُحوَّل إلى ما يقصده الكاتب لا تُرفض', () => {
  assert.equal(normalizeOperationCode('OI L'), '011', 'O صفرًا · I و L واحدًا');
  assert.equal(normalizeOperationCode('oil'), '011');
  assert.equal(normalizeOperationCode('U'), 'V');
});

test('ما لا يُفهم يُهمَل ولا يُسقط السطر — فلاصقُ رمزٍ من رسالةٍ يجرّ معه محارف', () => {
  assert.equal(normalizeOperationCode('رمز: H4K-9TM ✅'), 'H4K9TM');
  assert.equal(normalizeOperationCode('‏H4K9TM‎'), 'H4K9TM', 'محارف الاتّجاه غير المرئيّة');
  assert.equal(normalizeOperationCode(''), '');
  assert.equal(normalizeOperationCode(null), '');
});

test('الصلاحيّة تُقاس بعد التطبيع لا قبله', () => {
  assert.equal(isValidOperationCode('h4k-9tm'), true);
  assert.equal(isValidOperationCode('H٤K٩TM'), true);
  assert.equal(isValidOperationCode('H4K9T'), false, 'خمسة محارف');
  assert.equal(isValidOperationCode('H4K9TMX'), false, 'سبعة');
  assert.equal(isValidOperationCode('k3Jd9sLpQm2xY7vB1nRt'), false, 'معرّف Firestore ليس رمزًا');
});

test('العرض يُجزّئ نصفين، والناقص يُعرض كما هو بلا شرطةٍ كاذبة', () => {
  assert.equal(formatOperationCode('h4k9tm'), 'H4K-9TM');
  assert.equal(formatOperationCode('H4K'), 'H4K');
  assert.equal(formatOperationCode(''), '');
});

// ═══ التوليد ══════════════════════════════════════════════════════════════

test('المولَّد بالطول الصحيح ومن الأبجديّة وحدها', () => {
  for (let i = 0; i < 200; i += 1) {
    const c = generateOperationCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), `محرفٌ غريب: ${ch}`);
  }
});

test('★ لا يُعيد رمزًا مستعمَلًا — ولو كُتب المستعمَل بصيغةٍ أخرى', () => {
  // عشوائيّةٌ مقيّدة: أوّل محاولةٍ تُنتج 000000 دائمًا، ثمّ 111111.
  let call = 0;
  const rigged = () => {
    const round = Math.floor(call / CODE_LENGTH);
    call += 1;
    return round === 0 ? 0 : 1 / CODE_ALPHABET.length;
  };
  const code = generateOperationCode(rigged, { taken: ['0-000 00'] });
  assert.notEqual(code, '000000', 'أعاد رمزًا مستعمَلًا كُتب بشرطاتٍ ومسافات');
  assert.equal(code, '111111');
});

test('يتوقّف برميٍ بدل أن يُسلّم رمزًا مكرّرًا بصمت', () => {
  const always = () => 0; // يُنتج 000000 أبدًا
  assert.throws(() => generateOperationCode(always, { taken: ['000000'], attempts: 5 }), /تعذّر توليد/);
});

// ═══ الحسم بين المرشّحات — موضع الخطأ الحقيقيّ ════════════════════════════

const op = (id, status, code = 'H4K9TM') => ({ id, status, code });

test('رمزٌ لعمليّةٍ مفتوحةٍ واحدة يفتحها', () => {
  const r = resolveOperationByCode([op('a', 'open')]);
  assert.equal(r.ok, true);
  assert.equal(r.operation.id, 'a');
});

test('★★ المفتوحة تسبق المُقفلة — فرمزٌ أُعيد استعماله يفتح الجارية لا التاريخ', () => {
  const r = resolveOperationByCode([op('قديمة', 'closed'), op('جارية', 'open')]);
  assert.equal(r.ok, true);
  assert.equal(r.operation.id, 'جارية');
});

test('★★ مفتوحتان بالرمز نفسه = توقّفٌ لا اختيارٌ عشوائيّ', () => {
  const r = resolveOperationByCode([op('أ', 'open'), op('ب', 'open')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ambiguous');
  assert.equal(r.operations.length, 2, 'وتُعرَض الاثنتان ليُحسم الأمر بعلم');
});

test('المُقفلة وحدها تُميَّز عن المعدومة — فالعامل يعرف أنّ رمزه صحيح', () => {
  assert.equal(resolveOperationByCode([op('a', 'closed')]).reason, 'closed');
  assert.equal(resolveOperationByCode([]).reason, 'none');
  assert.equal(resolveOperationByCode(null).reason, 'none');
});
