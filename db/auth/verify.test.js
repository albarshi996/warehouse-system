/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ جسرِ الرمز — والنقضُ هنا أهمُّ من الإيجاب
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ جسرُ مصادقةٍ يقبل ما لا يجب أن يقبل **لا يُظهر خطأً** — يُظهر مستخدمًا
 *     يعمل. فكلُّ اختبارٍ هنا يسأل: **ماذا يمرّ ولا يجب أن يمرّ؟**
 *
 * ★★ ويُولّد مفتاحَ RSA حقيقيًّا في الذاكرة ويوقّع به — فالتحقّقُ من التوقيع
 *    مُجرَّبٌ فعلًا لا مُتخطًّى. بلا شبكةٍ وبلا سحابة.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

import {
  decodeJwt,
  checkFirebaseClaims,
  mintPayload,
  signHs256,
  verifyHs256,
  exchange,
  MAX_TTL_SECONDS,
  AUTHENTICATED_ROLE,
} from './verify.js';

const PROJECT = 'brandzo-erp-2026';
const SECRET = 'سرٌّ-طويلٌ-بما-يكفي-لاختبارٍ-حقيقيّ-٣٢-حرفًا';
const NOW = 1_800_000_000;

/* مفتاحان: واحدٌ «مفتاحُ Google» وآخرُ مفتاحُ مهاجم. */
const good = generateKeyPairSync('rsa', { modulusLength: 2048 });
const evil = generateKeyPairSync('rsa', { modulusLength: 2048 });

const GOOD_KID = 'kid-good';
const jwks = { [GOOD_KID]: good.publicKey.export({ format: 'jwk' }) };
const keyForKid = (kid) => jwks[kid] || null;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** يصنع رمزًا بشكل Firebase الحقيقيّ — كما قِيس من الحساب الحيّ. */
function makeToken({ key = good.privateKey, kid = GOOD_KID, alg = 'RS256', claims = {} } = {}) {
  const header = b64u({ alg, kid, typ: 'JWT' });
  const payload = b64u({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'uid_28_char_like_firebase_x',
    email: 'someone@example.com',
    iat: NOW - 60,
    exp: NOW + 3600,
    ...claims,
  });
  const input = `${header}.${payload}`;
  const sig = createSign('RSA-SHA256').update(input).end().sign(key).toString('base64url');
  return `${input}.${sig}`;
}

/* ═══════════ ١ · المسارُ السليم ═══════════ */

test('رمزٌ سليمٌ يُبدَّل برمزٍ يحمل الدور', () => {
  const { token, payload } = exchange(makeToken(), keyForKid, {
    projectId: PROJECT, secret: SECRET, now: NOW,
  });

  // ★★★ الدورُ هو سببُ وجود الجسر كلِّه.
  assert.equal(payload.role, AUTHENTICATED_ROLE);
  assert.equal(payload.sub, 'uid_28_char_like_firebase_x');
  assert.equal(payload.email, 'someone@example.com');
  assert.ok(verifyHs256(token, SECRET), 'الرمزُ الصادرُ يجب أن يتحقّق بسرّنا');
});

test('★★★ ولا يعيش الرمزُ الصادرُ أطولَ من رمز Firebase', () => {
  // رمزُ Firebase ينتهي بعد خمس دقائق، والسقفُ ثلاثون.
  const soon = NOW + 300;
  const { payload } = exchange(makeToken({ claims: { exp: soon } }), keyForKid, {
    projectId: PROJECT, secret: SECRET, now: NOW,
  });

  assert.equal(payload.exp, soon, 'يجب أن يأخذ أقلَّ المدّتين');
  assert.ok(
    payload.exp < NOW + MAX_TTL_SECONDS,
    'وإلّا بقي رمزُ قاعدةٍ صالحًا بعد إقفال الحساب — بابٌ خلفيّ'
  );
});

test('والسقفُ يُطبَّق حين يكون رمزُ Firebase أطول', () => {
  const { payload } = exchange(makeToken({ claims: { exp: NOW + 86400 } }), keyForKid, {
    projectId: PROJECT, secret: SECRET, now: NOW,
  });
  assert.equal(payload.exp, NOW + MAX_TTL_SECONDS);
});

/* ═══════════ ٢ · النقض — ما لا يجب أن يمرّ ═══════════ */

test('★★★ رمزٌ موقَّعٌ بمفتاحِ مهاجمٍ يُرفض', () => {
  assert.throws(
    () => exchange(makeToken({ key: evil.privateKey }), keyForKid, {
      projectId: PROJECT, secret: SECRET, now: NOW,
    }),
    /توقيعٌ غير صالح/
  );
});

test('★★★ رمزٌ من مشروعِ Firebase آخرَ يُرفض — ولو كان توقيعُه سليمًا', () => {
  // مشروعٌ آخرُ على نفس منصّة Google: التوقيعُ صحيحٌ بمفتاحٍ نعرفه، والهويّةُ غريبة.
  assert.throws(
    () => exchange(
      makeToken({ claims: { aud: 'مشروعٌ-آخر', iss: 'https://securetoken.google.com/مشروعٌ-آخر' } }),
      keyForKid,
      { projectId: PROJECT, secret: SECRET, now: NOW }
    ),
    /الجمهور غير متوقَّع|المُصدِر غير متوقَّع/
  );
});

test('★★ رمزٌ بخوارزميّة `none` يُرفض قبل أن يُنظر في توقيعه', () => {
  assert.throws(
    () => exchange(makeToken({ alg: 'none' }), keyForKid, {
      projectId: PROJECT, secret: SECRET, now: NOW,
    }),
    /خوارزميّةٌ غير مقبولة/
  );
});

test('رمزٌ بمفتاحٍ لا نعرفه يُرفض — ولا يُقبل بحجّة التبديل', () => {
  assert.throws(
    () => exchange(makeToken({ kid: 'kid-مجهول' }), keyForKid, {
      projectId: PROJECT, secret: SECRET, now: NOW,
    }),
    /مفتاحٌ غير معروف/
  );
});

test('رمزٌ منتهي الصلاحية يُرفض', () => {
  assert.throws(
    () => exchange(makeToken({ claims: { exp: NOW - 3600 } }), keyForKid, {
      projectId: PROJECT, secret: SECRET, now: NOW,
    }),
    /منتهي الصلاحية/
  );
});

test('ورمزٌ مشوّهٌ لا يُسقط الجسر', () => {
  for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', 'ليس.رمزًا.إطلاقًا']) {
    assert.throws(() => decodeJwt(bad), /رمزٌ مشوّه/);
  }
});

/* ═══════════ ٣ · فحصُ الدعاوى وحدَه ═══════════ */

test('فحصُ الدعاوى يسمّي كلَّ عيبٍ على حدة', () => {
  // ★ `exp` يتجاوز الهامشَ بوضوح — فقبل ثانيةٍ واحدةٍ يقع **داخل** هامش
  //   الستّين ولا يُعدّ انتهاءً. (أوّلُ صياغةٍ لهذا الاختبار وقعت فيها.)
  const problems = checkFirebaseClaims(
    { iss: 'خطأ', aud: 'خطأ', exp: NOW - 600 },
    { projectId: PROJECT, now: NOW }
  );
  assert.equal(problems.length, 4, 'أربعةُ عيوب: مُصدِر · جمهور · sub · انتهاء');
  assert.ok(problems.some((p) => /sub/.test(p)));
});

test('انحرافُ ساعةٍ يسيرٌ يُتسامح معه، والكبيرُ لا', () => {
  // منتهٍ قبل ثلاثين ثانية ⇒ يُقبل بهامش الستّين.
  assert.equal(
    checkFirebaseClaims(
      { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'u', exp: NOW - 30 },
      { projectId: PROJECT, now: NOW }
    ).length,
    0
  );
  // وصادرٌ بعد ساعةٍ في المستقبل ⇒ يُرفض.
  assert.ok(
    checkFirebaseClaims(
      { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'u', exp: NOW + 7200, iat: NOW + 3600 },
      { projectId: PROJECT, now: NOW }
    ).some((p) => /المستقبل/.test(p))
  );
});

/* ═══════════ ٤ · التوقيعُ المتماثل ═══════════ */

test('رمزٌ أصدرناه لا يتحقّق بسرٍّ آخر', () => {
  const t = signHs256(mintPayload({ sub: 'u', exp: NOW + 60 }, { now: NOW }), SECRET);
  assert.ok(verifyHs256(t, SECRET));
  assert.ok(!verifyHs256(t, 'سرٌّ-مختلفٌ-تمامًا'));
});

test('وتغييرُ حرفٍ في الحمولة يُبطل التوقيع', () => {
  const t = signHs256({ role: AUTHENTICATED_ROLE, sub: 'u', exp: NOW + 60 }, SECRET);
  const [h, p, s] = t.split('.');
  const tampered = JSON.parse(Buffer.from(p, 'base64url'));
  tampered.role = 'postgres'; // محاولةُ ترقيةِ الدور
  const forged = `${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s}`;
  assert.ok(!verifyHs256(forged, SECRET), 'ترقيةُ الدور بالتزوير يجب أن تُرفض');
});
