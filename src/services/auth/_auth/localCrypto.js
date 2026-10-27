/**
 * نواةُ كلمة المرور المحلّيّة — PBKDF2 عبر WebCrypto.
 *
 * ★★★ لماذا ليست `localAuth.js` القائمة؟ تلك تستعمل `node:crypto` (scrypt) ولا
 *     تعمل في محرّك عرض سطح المكتب (WebView2 متصفّحٌ بلا Node). وWebCrypto
 *     (`crypto.subtle`) متوفّرٌ في المتصفّح **وفي Node 20+**، فهذه النواةُ تعمل
 *     حيث يعمل الدخولُ فعلًا، وتُختبَر في Node بلا حيلة.
 *
 * التنسيقُ المخزَّن ذاتيُّ الوصف: `pbkdf2$<iterations>$<saltB64>$<hashB64>` —
 * فالتحقّقُ يقرأ معاملاتِه من النصّ، ويُرقّى العددُ مستقبلًا بلا كسر القديم.
 * منطق خالص (لا شبكة ولا قاعدة).
 */

const ITERATIONS = 210000; // PBKDF2-HMAC-SHA256، حدُّ OWASP 2023
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('WebCrypto غير متوفّر في هذه البيئة');
  return c.subtle;
};

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(String(s)), (ch) => ch.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

/** يُنتج هاشًا مخزَّنًا ذاتيَّ الوصف بملحٍ عشوائيٍّ لكلّ كلمة. */
export async function hashPassword(password, { iterations = ITERATIONS } = {}) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`;
}

/**
 * يتحقّق بزمنٍ ثابتٍ ولا يرمي: أيُّ تشويهٍ أو تنسيقٍ غريبٍ يُعيد false.
 * (نفسُ فلسفة `localAuth.verifyPassword`.)
 */
export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1) return false;
    const salt = unb64(parts[2]);
    const expected = unb64(parts[3]);
    const got = await derive(password, salt, iterations);
    if (got.length !== expected.length || got.length === 0) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** سياسةٌ دنيا لكلمة المرور (نظيرُ `localAuth.validatePassword`). */
export function validatePassword(password) {
  const p = String(password ?? '');
  if (p.length < 8) return { ok: false, reason: 'كلمة المرور ثمانية أحرفٍ فأكثر' };
  return { ok: true };
}
