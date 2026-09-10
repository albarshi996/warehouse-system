/* eslint-disable no-console -- خدمةُ سطرِ أوامر: سجلُّها هو مخرَجُها. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  جسرُ الرمز — رمزُ Firebase يدخل، ورمزُ القاعدة يخرج
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **ولا تبعيّةَ جديدة**: `node:http` و`node:crypto` و`fetch` المدمج.
 *     والتحقّقُ كلُّه في وحدةٍ خالصةٍ مختبَرة (`verify.js`) — وهذا الملفُّ
 *     شبكةٌ ومهلاتٌ لا منطقُ أمن.
 *
 * ★★ **ومفاتيحُ Google تُجلب وتُخزَّن بمهلتها المعلَنة** (قِيست: `max-age`
 *    نحو خمسِ ساعات). ولا تُجلب في كلّ طلب — وإلّا صار الجسرُ بطيئًا
 *    ومعتمدًا على شبكةِ Google في كلّ نقرة.
 *
 * ★★★ **ومفتاحٌ مجهولٌ يُجدِّد الخزينَ مرّةً — بحدٍّ أدنى بين التجديدين.**
 *     بدونه: مهاجمٌ يرسل رموزًا بـ`kid` عشوائيٍّ فيُجبرنا على استدعاء Google
 *     في كلّ طلب. وبدون التجديد أصلًا: يومَ تُبدّل Google مفاتيحَها **يُقفل
 *     الموظّفون كلُّهم** حتّى نُعيد التشغيل.
 *
 * التشغيل:
 *   PGRST_JWT_SECRET=… FIREBASE_PROJECT_ID=… node db/auth/bridge.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';

import { exchange } from './verify.js';

const PORT = Number(process.env.AUTH_PORT || 3001);
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.PUBLIC_FIREBASE_PROJECT_ID;
const SECRET = process.env.PGRST_JWT_SECRET;

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** العناوينُ المأذونة — البوّابتان على قاعدةٍ واحدة، فكلتاهما تُذكر. */
const ALLOWED_ORIGINS = (
  process.env.AUTH_ALLOWED_ORIGINS ||
  'https://albarshi996.github.io,https://warehouse-art.github.io'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SECRET || SECRET.length < 32) {
  console.error('X  PGRST_JWT_SECRET مطلوبٌ وبطول ٣٢ حرفًا فأكثر.');
  process.exit(1);
}
if (!PROJECT_ID) {
  console.error('X  FIREBASE_PROJECT_ID مطلوب.');
  process.exit(1);
}

/* ═══════════════════ خزينُ المفاتيح ═══════════════════ */

const MIN_REFRESH_MS = 60_000;

const cache = { keys: new Map(), expiresAt: 0, lastFetch: 0 };

async function refreshKeys(force = false) {
  const now = Date.now();
  if (!force && now < cache.expiresAt) return;
  if (now - cache.lastFetch < MIN_REFRESH_MS && cache.keys.size) return;

  cache.lastFetch = now;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`جلبُ مفاتيح Google فشل: ${res.status}`);

  const { keys } = await res.json();
  cache.keys = new Map(keys.map((k) => [k.kid, k]));

  // ★ المهلةُ من Google نفسِها لا من تقديرنا — فهي أدرى بموعد تبديلها.
  const cc = res.headers.get('cache-control') || '';
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1] || 3600);
  cache.expiresAt = now + maxAge * 1000;

  console.log(`-  مفاتيح Google: ${cache.keys.size}، تُجدَّد بعد ${Math.round(maxAge / 60)} دقيقة`);
}

/* ═══════════════════ الخادم ═══════════════════ */

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  cors(req, res);

  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (req.url === '/health') {
    return json(res, 200, {
      ok: true,
      keys: cache.keys.size,
      keysExpireIn: Math.max(0, Math.round((cache.expiresAt - Date.now()) / 1000)),
    });
  }

  if (req.method !== 'POST' || req.url !== '/token') {
    return json(res, 404, { error: 'المسارُ الوحيد: POST /token' });
  }

  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!idToken) return json(res, 401, { error: 'أرسل رمزَ Firebase في ترويسة Authorization.' });

  try {
    await refreshKeys();

    let out;
    try {
      out = exchange(idToken, (kid) => cache.keys.get(kid) || null, {
        projectId: PROJECT_ID,
        secret: SECRET,
      });
    } catch (err) {
      // ★ مفتاحٌ مجهولٌ وحدَه يستحقّ تجديدًا — وهو ما يقع يومَ تبدّل Google.
      if (!/مفتاحٌ غير معروف/.test(err.message)) throw err;
      await refreshKeys(true);
      out = exchange(idToken, (kid) => cache.keys.get(kid) || null, {
        projectId: PROJECT_ID,
        secret: SECRET,
      });
    }

    return json(res, 200, { token: out.token, exp: out.payload.exp, role: out.payload.role });
  } catch (err) {
    // ★★ السببُ يُسجَّل عندنا ولا يُرسَل للعميل: رسالةُ رفضٍ مفصّلةٌ تُعلّم
    //    المهاجمَ أيَّ شرطٍ كسر. والمستخدمُ الحقيقيُّ لا ينفعه التفصيل.
    console.warn(`   رفض: ${err.message}`);
    return json(res, 401, { error: 'رمزُ الدخول غير مقبول.' });
  }
});

server.listen(PORT, () => {
  console.log(`-  جسرُ الرمز على المنفذ ${PORT} · المشروع ${PROJECT_ID}`);
  console.log(`-  العناوينُ المأذونة: ${ALLOWED_ORIGINS.join(' · ')}`);
  refreshKeys().catch((e) => console.error('X  تحميلُ المفاتيح الأوّل فشل:', e.message));
});
