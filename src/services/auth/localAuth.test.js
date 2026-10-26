/**
 * اختبارُ نواةِ الدخول المحليّ (§8) — التجزئةُ والتحقّقُ والسياسةُ وبذرةُ المالك.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';

import {
  hashPassword,
  verifyPassword,
  validatePassword,
  bootstrapRole,
  prepareLocalUser,
  MIN_PASSWORD_LENGTH,
} from './localAuth.js';

const FIXED_SALT = Buffer.from('0123456789abcdef').toString('base64'); // 16 بايت ثابتة للحتميّة

/* ═══════════ التجزئة والتحقّق ═══════════ */

test('★★ دورةٌ كاملة: الصحيحةُ تُقبل والخاطئةُ تُرفض', () => {
  const stored = hashPassword('correct horse battery');
  assert.equal(verifyPassword('correct horse battery', stored), true);
  assert.equal(verifyPassword('wrong password here', stored), false);
});

test('★★ ملحٌ ثابتٌ ⇒ هشٌّ حتميّ؛ وبلا ملحٍ ⇒ مختلفٌ كلَّ مرّة (ملحٌ عشوائيّ)', () => {
  assert.equal(hashPassword('same-pass-123', { salt: FIXED_SALT }), hashPassword('same-pass-123', { salt: FIXED_SALT }));
  assert.notEqual(hashPassword('same-pass-123'), hashPassword('same-pass-123'));
});

test('★★★ التحقّقُ لا يرمي ويُعيد false لكلّ مدخلٍ معطوب', () => {
  const stored = hashPassword('abcdefgh', { salt: FIXED_SALT });
  assert.equal(verifyPassword('abcdefgh', 'ليس-بصيغة-هش'), false);
  assert.equal(verifyPassword('abcdefgh', 'scrypt$16384$8$1$بلا$هش'), false);
  assert.equal(verifyPassword('abcdefgh', ''), false);
  // عبثٌ بحرفِ بياناتٍ داخلَ الهش (لا حرفَ حشوٍ يُهمله فكُّ base64).
  const i = stored.length - 20;
  const tampered = stored.slice(0, i) + (stored[i] === 'A' ? 'B' : 'A') + stored.slice(i + 1);
  assert.equal(verifyPassword('abcdefgh', tampered), false, 'هشٌّ معبوثٌ به');
  assert.equal(verifyPassword(null, stored), false);
  assert.equal(verifyPassword('abcdefgh', null), false);
});

test('★★★ التحقّقُ يقرأ N/r/p من المخزَّن فعلًا — لا من ثوابتَ مثبّتة', () => {
  // هشٌّ بمعاملاتٍ **غيرِ الافتراض** (N=1024): لو أهمل verifyPassword المعاملاتِ
  // واستعمل SCRYPT.N الثابت (16384) لَفشل. فنجاحُه يُثبت أنّه يقرؤها من السلسلة.
  const salt = Buffer.from('0123456789abcdef');
  const dk = scryptSync(Buffer.from('portable-pass', 'utf8'), salt, 64, { N: 1024, r: 8, p: 1 });
  const stored1024 = `scrypt$1024$8$1$${salt.toString('base64')}$${dk.toString('base64')}`;
  assert.equal(verifyPassword('portable-pass', stored1024), true, 'يقرأ N=1024 من المخزَّن');

  // وتبديلُ N في السلسلة إلى 16384 (بلا إعادةِ تجزئة) يُفشل التحقّق — فالمعاملُ يُقرأ.
  const wrongN = stored1024.replace('$1024$', '$16384$');
  assert.equal(verifyPassword('portable-pass', wrongN), false, 'N مختلفٌ ⇒ هشٌّ مختلفٌ ⇒ يُرفض');
});

test('★★★ معاملاتٌ معطوبةٌ في المخزَّن تُعيد false بلا رمي (الحارسُ والملتقط)', () => {
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const hash = Buffer.alloc(64, 7).toString('base64');
  const mk = (n) => `scrypt$${n}$8$1$${salt}$${hash}`;
  // N=0 والنصّيُّ يسقطان عند حارس «الأعداد الصحيحة الموجبة»؛ N=3 والضخمُ يرميهما
  // scryptSync فيلتقطهما الملتقط — والأربعةُ تُعيد false ولا ترمي.
  for (const n of ['0', 'abc', '3', '1073741824']) {
    assert.equal(verifyPassword('whatever-pass', mk(n)), false, `N=${n} يُرفض بلا رمي`);
  }
});

test('★ تجزئةُ كلمةٍ فارغةٍ تُرفض عند المصدر', () => {
  assert.throws(() => hashPassword(''), /فارغة/);
  assert.throws(() => hashPassword(null), /فارغة/);
});

/* ═══════════ السياسة ═══════════ */

test('★★ السياسة: الطولُ الأدنى، والفراغُ مرفوض', () => {
  assert.equal(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH)).ok, true);
  assert.equal(validatePassword('short').ok, false);
  assert.equal(validatePassword('').ok, false);
  assert.equal(validatePassword(null).ok, false);
});

/* ═══════════ بذرةُ المالك — بلا بريدٍ مبرمج ═══════════ */

test('★★★ أوّلُ حسابٍ مالكٌ، وما بعده لا يُمنح دورًا هنا', () => {
  assert.equal(bootstrapRole(0), 'admin');
  assert.equal(bootstrapRole(1), null);
  assert.equal(bootstrapRole(99), null);
});

test('★★★ فشلٌ مغلق: مدخلٌ معطوبٌ لا يمنح المالكَ (لا تصعيدَ صلاحيّة)', () => {
  // لو فشل استعلامُ العدِّ وأعاد null/undefined/NaN، أو مُرِّر نصٌّ — لا admin.
  for (const bad of [undefined, null, NaN, '', 'x', -1, 1.5, '0']) {
    assert.equal(bootstrapRole(bad), null, `bootstrapRole(${JSON.stringify(bad)}) ليس admin`);
  }
});

test('★★★ prepareLocalUser: الأوّلُ admin والثاني viewer، والكلمةُ تُتحقَّق', () => {
  const owner = prepareLocalUser({ username: 'Owner', password: 'owner-pass-1', name: 'المالك' }, { existingUserCount: 0 });
  assert.equal(owner.ok, true);
  assert.equal(owner.user.role, 'admin');
  assert.equal(owner.user.username, 'owner', 'يُخفَّض ويُقلَّم');
  assert.equal(verifyPassword('owner-pass-1', owner.user.passwordHash), true);
  assert.equal(owner.user.passwordHash.includes('owner-pass-1'), false, 'لا كلمةَ مرورٍ صريحةٌ في المخزَّن');

  const staff = prepareLocalUser({ username: 'Staff', password: 'staff-pass-1' }, { existingUserCount: 1 });
  assert.equal(staff.user.role, 'viewer');
});

test('★ prepareLocalUser يرفض الاسمَ الفارغ والكلمةَ الضعيفة', () => {
  assert.equal(prepareLocalUser({ username: '  ', password: 'long-enough-1' }, { existingUserCount: 0 }).ok, false);
  assert.equal(prepareLocalUser({ username: 'u', password: 'short' }, { existingUserCount: 0 }).ok, false);
});
