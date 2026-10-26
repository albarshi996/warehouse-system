/**
 * الدخولُ المحليّ — نواةٌ خالصةٌ للمصادقة بلا Firebase (§8 من خطّة الدفتر المحليّ).
 *
 * ★★★ **ليست مصادقةً حيّة بعد.** البوّابةُ اليومَ تدخل عبر Firebase. هذه النواةُ
 *     للوضع desktop-local: تجزئةُ كلمة المرور والتحقّقُ منها وبذرةُ المالك الأوّل
 *     — لتستعملها الخدمةُ المحلّيّة حين يُفعَّل الدخولُ المحليّ. لا تمسّ Firebase.
 *
 * قرارات §8:
 *   • **لا بريدَ مبرمجٌ كأدمن**: أوّلُ حسابٍ على الجهاز هو المالك، لا عنوانٌ مثبّت.
 *   • **كلماتُ المرور بهشٍّ معتمد**: scrypt (مُبطِّئٌ متعمَّدٌ ضدّ التخمين) بملحٍ
 *     عشوائيٍّ لكلّ كلمة، والمقارنةُ **ثابتةُ الزمن** ضدّ هجمات التوقيت.
 *
 * ملاحظة: يستعمل `node:crypto` — وحدةٌ خادميّةٌ (الخدمة المحلّيّة) لا تُستورَد في
 * المتصفّح. والاختباراتُ تمرّر ملحًا ثابتًا حين تحتاج حتميّةً.
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** معاملاتُ scrypt — كلفةٌ متعمَّدةٌ تُبطّئ التخمين بلا أن تُثقل دخولًا واحدًا. */
export const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 });

/** أدنى طولٍ لكلمة المرور. */
export const MIN_PASSWORD_LENGTH = 8;

const str = (v) => String(v ?? '');

/**
 * يُجزّئ كلمةَ مرورٍ إلى سلسلةٍ مخزَّنةٍ مكتفيةٍ بذاتها:
 *   `scrypt$N$r$p$<ملح b64>$<هش b64>`
 * فيُحمل الملحُ والمعاملاتُ مع الهش، ويُتحقَّق لاحقًا ولو تغيّرت المعاملاتُ.
 */
export function hashPassword(password, { salt } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('لا تُجزَّأ كلمةُ مرورٍ فارغة.');
  }
  const s = salt ? Buffer.from(salt, 'base64') : randomBytes(16);
  if (s.length === 0) throw new Error('الملحُ فارغ.');
  const dk = scryptSync(Buffer.from(password, 'utf8'), s, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${s.toString('base64')}$${dk.toString('base64')}`;
}

/**
 * يتحقّق من كلمةٍ أمام سلسلةٍ مخزَّنة. **ثابتُ الزمن** في المقارنة، و**لا يرمي**:
 * كلُّ مدخلٍ معطوبٍ يُعيد false (لا فرقَ بين «كلمةٌ خطأ» و«هشٌّ معطوب» للمهاجم).
 */
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let dk;
  try {
    dk = scryptSync(Buffer.from(password, 'utf8'), salt, expected.length, { N, r, p, maxmem: SCRYPT.maxmem });
  } catch {
    return false; // معاملاتٌ خارجَ الحدّ أو طولٌ غيرُ صالح
  }
  if (dk.length !== expected.length) return false;
  return timingSafeEqual(dk, expected);
}

/** سياسةُ كلمة المرور — رسائلُ عربيّةٌ واضحة. */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, reason: 'كلمةُ المرور مطلوبة.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `كلمةُ المرور ${MIN_PASSWORD_LENGTH} أحرفٍ فأكثر.` };
  }
  return { ok: true };
}

/**
 * ★★★ بذرةُ المالك — بلا بريدٍ مبرمج: **أوّلُ حسابٍ على الجهاز** (العدد صفر) هو
 * المالك (`admin`). ما بعده لا يُمنح دورًا هنا؛ يُسنده المالكُ لاحقًا.
 */
export function bootstrapRole(existingUserCount) {
  // ★★★ فشلٌ **مغلق**: المالكُ لعددٍ صحيحٍ هو صفرٌ بالضبط. والمدخلُ المعطوب
  //     (null · undefined · NaN · '' · نصٌّ) لا يُقوَّم إلى صفرٍ فيمنح صلاحيّةً —
  //     لو فشل استعلامُ عدِّ المستخدمين وأعاد null لَمُنح حسابٌ ليس الأوّلَ دورَ
  //     المالك. فالمجهولُ «لستُ الأوّل»، لا «أنا المالك».
  return Number.isInteger(existingUserCount) && existingUserCount === 0 ? 'admin' : null;
}

/**
 * يُجهّز حسابًا محلّيًّا للتخزين: يتحقّق من الاسم والكلمة، ويُجزّئ، ويُسند الدور.
 * أوّلُ حسابٍ مالكٌ؛ وما بعده `viewer` حتّى يرفعه المالك (يُضاف ولا يُنتزع).
 */
export function prepareLocalUser({ username, password, name = '' } = {}, { existingUserCount = 0 } = {}) {
  const u = str(username).trim().toLowerCase();
  if (!u) return { ok: false, reason: 'اسمُ المستخدم مطلوب.' };

  const pv = validatePassword(password);
  if (!pv.ok) return pv;

  const role = bootstrapRole(existingUserCount) || 'viewer';
  return {
    ok: true,
    user: {
      username: u,
      name: str(name).trim() || u,
      role,
      passwordHash: hashPassword(password),
    },
  };
}
