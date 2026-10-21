/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  جسرُ الرمز — منطقُ التحقّق الخالص
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **ولماذا جسرٌ أصلًا؟ القياسُ فرضه ولم يتركه اختيارًا (2026-09-10):**
 *
 *   ① رمزُ Firebase الحقيقيُّ قِيس: `RS256` · بـ`kid` **متبدّل** · صلاحيّةُ
 *      ساعة · و**بلا أيّ دعوى مخصّصة**.
 *   ② ومرجعُ PostgREST ينصّ: «إن أرسل العميلُ رمزًا **بلا دعوى `role`**
 *      ينتقل إلى الدور المجهول». ⇒ فرمزُ Firebase الخام يجعل كلَّ طلبٍ
 *      يعمل بدور `web_anon` فيرى **صفرَ صفوف — بلا خطأٍ ولا تحذير**.
 *      عطبٌ صامتٌ تامّ: النظامُ «يعمل» ويُرجع لا شيء.
 *   ③ وحقنُ الدور في رمز Firebase يحتاج **مفتاحَ حسابِ خدمة** — وهو ما
 *      تمنعه الخطّة صراحةً (المزامنةُ تمرّ بنفس بوّابة صلاحيّات التطبيق).
 *   ④ وPostgREST **لا يجلب مفاتيحَ Google ولا يجدّدها** — قيمةٌ ثابتةٌ
 *      أو ملفّ. ومفاتيحُ Google تتبدّل، فالثابتُ يتقادم ويُقفل الجميع.
 *
 *   ⇒ **جسرٌ يتحقّق من رمز Google بمفاتيحه الحيّة، ويُصدر رمزًا لنا يحمل
 *     الدور** — يحلّ ② و③ و④ بضربةٍ واحدة، وبلا مفتاحِ خدمة.
 *
 * ★★ **وحدةٌ خالصة**: `node:crypto` وحدَه — **لا تبعيّةَ جديدة** ولا شبكة.
 *    تأخذ المفتاحَ وسيطًا ولا تجلبه، فتُختبَر في Node العاري.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createPublicKey, createVerify, createHmac, timingSafeEqual } from 'node:crypto';

/** أقصى عمرٍ للرمز الذي نُصدره — بالثواني. */
export const MAX_TTL_SECONDS = 30 * 60;

/** الدورُ الذي يتقمّصه المصادَق. */
export const AUTHENTICATED_ROLE = 'web_user';

const b64u = {
  decode: (s) => Buffer.from(s, 'base64url'),
  encode: (buf) => Buffer.from(buf).toString('base64url'),
};

/**
 * يفكّ رمزًا إلى أجزائه بلا تحقّقٍ من التوقيع.
 * @param {string} jwt
 * @returns {{header:object, payload:object, signingInput:string, signature:Buffer}}
 */
export function decodeJwt(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw new Error('رمزٌ مشوّه: لا يتكوّن من ثلاثة أجزاء.');

  let header;
  let payload;
  try {
    header = JSON.parse(b64u.decode(parts[0]));
    payload = JSON.parse(b64u.decode(parts[1]));
  } catch {
    throw new Error('رمزٌ مشوّه: الترويسةُ أو الحمولةُ ليست JSON.');
  }

  return {
    header,
    payload,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: b64u.decode(parts[2]),
  };
}

/**
 * يتحقّق من توقيع RS256 بمفتاحٍ بصيغة JWK.
 *
 * ★ `createPublicKey` يقبل JWK مباشرةً، فلا حاجةَ لمكتبةِ تحويل.
 */
export function verifyRs256(signingInput, signature, jwk) {
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  return createVerify('RSA-SHA256').update(signingInput).end().verify(key, signature);
}

/**
 * يفحص دعاوى رمز Firebase — **كلَّ شرطٍ على حدة، والفشلُ يُسمّى**.
 *
 * ★★ والشروطُ ليست تجميليّة: رمزٌ صالحُ التوقيع من مشروعٍ **آخر** يمرّ لو لم
 *    يُفحص `aud`، فيدخل غريبٌ بهويّةِ نفسه إلى قاعدتنا.
 *
 * @param {object} payload
 * @param {{projectId:string, now?:number, leeway?:number}} opts
 */
export function checkFirebaseClaims(payload, { projectId, now = Math.floor(Date.now() / 1000), leeway = 60 }) {
  const problems = [];

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    problems.push(`المُصدِر غير متوقَّع: ${payload.iss}`);
  }
  if (payload.aud !== projectId) {
    problems.push(`الجمهور غير متوقَّع: ${payload.aud}`);
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    problems.push('لا معرّفَ مستخدمٍ (sub).');
  }
  if (typeof payload.exp !== 'number' || payload.exp + leeway < now) {
    problems.push('الرمزُ منتهي الصلاحية.');
  }
  if (typeof payload.iat === 'number' && payload.iat - leeway > now) {
    problems.push('الرمزُ صادرٌ في المستقبل — ساعةٌ منحرفة.');
  }

  return problems;
}

/**
 * يبني حمولةَ الرمز الذي نُصدره لـPostgREST.
 *
 * ★★★ **ولا يتجاوز عمرُه عمرَ رمز Firebase أبدًا.** ولولا هذا لبقي رمزُ
 *     قاعدةٍ صالحًا بعد أن يُوقف المالكُ الحساب — بابٌ خلفيٌّ يعيش نصفَ
 *     ساعةٍ بعد الإقفال. فالسقفُ **أقلُّ المدّتين**.
 *
 * @param {object} firebasePayload
 * @param {{now?:number, maxTtl?:number}} opts
 */
export function mintPayload(firebasePayload, { now = Math.floor(Date.now() / 1000), maxTtl = MAX_TTL_SECONDS } = {}) {
  const exp = Math.min(firebasePayload.exp, now + maxTtl);
  return {
    // ★ الدورُ — وهو **سببُ وجود الجسر**. بدونه يعمل الطلبُ مجهولًا ويرى صفرًا.
    role: AUTHENTICATED_ROLE,
    sub: firebasePayload.sub,
    email: firebasePayload.email || null,
    iat: now,
    exp,
  };
}

/** يوقّع حمولةً بـHS256 — رمزٌ لنا نتحقّق منه بسرٍّ ثابت. */
export function signHs256(payload, secret) {
  const header = b64u.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u.encode(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(input).digest();
  return `${input}.${b64u.encode(sig)}`;
}

/** يتحقّق من رمزٍ أصدرناه — للاختبار وللفحص الذاتيّ. */
export function verifyHs256(jwt, secret) {
  const { signingInput, signature } = decodeJwt(jwt);
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(expected, signature);
}

/**
 * المسارُ الكامل: رمزُ Firebase ⟶ رمزُ القاعدة.
 * يأخذ **دالّةَ جلبِ المفتاح** فلا يعرف شبكةً — وبها يُختبَر بلا سحابة.
 *
 * @param {string} idToken
 * @param {(kid:string) => object|null} keyForKid
 * @param {{projectId:string, secret:string, now?:number, maxTtl?:number}} opts
 */
export function exchange(idToken, keyForKid, opts) {
  const { header, payload, signingInput, signature } = decodeJwt(idToken);

  if (header.alg !== 'RS256') throw new Error(`خوارزميّةٌ غير مقبولة: ${header.alg}`);
  if (!header.kid) throw new Error('لا معرّفَ مفتاحٍ (kid) في الترويسة.');

  const jwk = keyForKid(header.kid);
  if (!jwk) throw new Error(`مفتاحٌ غير معروف: ${header.kid}`);

  if (!verifyRs256(signingInput, signature, jwk)) throw new Error('توقيعٌ غير صالح.');

  const problems = checkFirebaseClaims(payload, { projectId: opts.projectId, now: opts.now });
  if (problems.length) throw new Error(problems.join(' · '));

  const minted = mintPayload(payload, { now: opts.now, maxTtl: opts.maxTtl });
  return { token: signHs256(minted, opts.secret), payload: minted };
}
