/**
 * نواةُ كلمة المرور المحلّيّة (PBKDF2/WebCrypto) — تُختبَر في Node مباشرةً.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword, validatePassword } from './localCrypto.js';

test('★★★ الهاشُ يُقبل بكلمته ويُرفض بغيرها', async () => {
  const stored = await hashPassword('correct horse 7');
  assert.match(stored, /^pbkdf2\$\d+\$[^$]+\$[^$]+$/, 'تنسيقٌ ذاتيُّ الوصف');
  assert.equal(await verifyPassword('correct horse 7', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
});

test('★★ ملحٌ عشوائيٌّ: نفسُ الكلمة تُنتج هاشين مختلفَين وكلاهما يَقبل', async () => {
  const a = await hashPassword('same-pass-1');
  const b = await hashPassword('same-pass-1');
  assert.notEqual(a, b, 'ملحان مختلفان');
  assert.equal(await verifyPassword('same-pass-1', a), true);
  assert.equal(await verifyPassword('same-pass-1', b), true);
});

test('★★ التشويهُ والتنسيقُ الغريبُ يُرفضان بلا رمي', async () => {
  const stored = await hashPassword('p@ssw0rd-x');
  const tampered = stored.slice(0, -2) + (stored.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(await verifyPassword('p@ssw0rd-x', tampered), false);
  for (const bad of ['', 'x', 'scrypt$1$a$b', 'pbkdf2$a$b$c', null, undefined, 'pbkdf2$0$x$y']) {
    assert.equal(await verifyPassword('p@ssw0rd-x', bad), false, `يُرفض: ${bad}`);
  }
});

test('★ رقمُ التكرار يُقرأ من النصّ — ترقيةٌ لا تكسر القديم', async () => {
  const stored = await hashPassword('iter-test', { iterations: 1000 });
  assert.match(stored, /^pbkdf2\$1000\$/);
  assert.equal(await verifyPassword('iter-test', stored), true);
});

test('★ السياسةُ الدنيا ثمانيةُ أحرف', () => {
  assert.equal(validatePassword('1234567').ok, false);
  assert.equal(validatePassword('12345678').ok, true);
});
