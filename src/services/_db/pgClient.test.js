/**
 * بيّنةُ عميل القاعدة — بشبكةٍ محقونةٍ، بلا سحابةٍ ولا حساب.
 *
 * ★★★ وأهمُّ ما يُثبَت هنا ليس النجاح بل **شكلُ الفشل**: حاسوبُ المالك
 *     خادمٌ يُطفأ وينام. فإن لم يكن السقوطُ مُبرهَنًا، صارت البوّابةُ أهشَّ
 *     ممّا كانت قبل الهجين.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from './pgClient.js';

/** شبكةٌ مزيّفةٌ تسجّل ما طُلب منها وتردّ بما يُملى عليها. */
function net(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const step = typeof script === 'function' ? script(url, calls.length) : script;
    if (step === 'throw') throw new Error('شبكةٌ مقطوعة');
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.body,
    };
  };
  return { calls, fetchImpl };
}

function build(script, opts, clock) {
  const { calls, fetchImpl } = net(script);
  const client = createClient({
    apiUrl: 'https://api.test/',
    authUrl: 'https://auth.test/',
    getIdToken: async () => 'FIREBASE_ID',
    fetch: fetchImpl,
    now: clock || (() => 1_000_000),
    options: opts,
  });
  return { client, calls };
}

test('يبدّل الرمزَ مرّةً ثمّ يُعيد استعماله', async () => {
  const { client, calls } = build((url) =>
    url.includes('/token')
      ? { status: 200, body: { token: 'PG', exp: 2_000 } }
      : { status: 200, body: [{ id: 'D1' }] }
  );

  const a = await client.select('documents', 'select=id');
  const b = await client.select('documents', 'select=id');

  assert.equal(a.ok, true);
  assert.deepEqual(a.rows, [{ id: 'D1' }]);
  assert.equal(b.ok, true);
  assert.equal(calls.filter((c) => c.url.includes('/token')).length, 1, 'رمزٌ واحدٌ لا رمزان');
  assert.match(calls[1].url, /^https:\/\/api\.test\/documents\?select=id$/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer PG');
});

test('★★★ نقض: انقطاعُ الشبكة يُسكت القاعدةَ — ولا يرمي إلى الشاشة', async () => {
  let t = 1_000_000;
  const { client, calls } = build('throw', { cooldownMs: 30000 }, () => t);

  const first = await client.select('documents', 'select=id');
  assert.equal(first.ok, false);
  assert.equal(client.healthy(), false, 'صارت مُسكَتة');

  const n = calls.length;
  const second = await client.select('documents', 'select=id');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'muted');
  assert.equal(calls.length, n, '★ ولا طلبَ ثانٍ — فلا مهلةَ انتظارٍ لكلّ قراءة');

  // وتعود بعد المدّة.
  t += 30001;
  assert.equal(client.healthy(), true);
});

test('★★ رفضُ الصلاحيّة يُبطل الرمزَ ولا يُسكت القاعدة', async () => {
  let phase = 401;
  const { client } = build((url) =>
    url.includes('/token') ? { status: 200, body: { token: 'PG', exp: 2_000 } } : { status: phase }
  );

  const r = await client.select('documents', 'select=id');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'http-401');
  assert.equal(client.healthy(), true, '★ ٤٠١ حكمُ صلاحيّةٍ لا عطبُ خادم');

  phase = 200;
  // ويُجدَّد الرمزُ من تلقائه في الطلب التالي.
  const again = await client.select('documents', 'select=id');
  assert.equal(again.ok, false, 'الجسمُ ليس مصفوفةً هنا');
});

test('★★★ نقض: بدّل المستخدمُ حسابَه ⇒ لا يُعاد استعمالُ رمزِ سابقه', async () => {
  let who = 'USER_A';
  const { calls, fetchImpl } = net((url) =>
    url.includes('/token')
      ? { status: 200, body: { token: `PG_${who}`, exp: 9_999_999 } }
      : { status: 200, body: [] }
  );
  const client = createClient({
    apiUrl: 'https://api.test',
    authUrl: 'https://auth.test',
    getIdToken: async () => who,
    fetch: fetchImpl,
    now: () => 1_000_000,
  });

  await client.select('documents', 'select=id');
  who = 'USER_B';
  await client.select('documents', 'select=id');

  const tokens = calls.filter((c) => c.url.includes('/token'));
  assert.equal(tokens.length, 2, 'هويّةٌ جديدةٌ ⇒ تبديلٌ جديد');
  const last = calls[calls.length - 1];
  assert.equal(last.init.headers.Authorization, 'Bearer PG_USER_B');
});

test('نقض: جسمٌ ليس مصفوفةً لا يُقرأ صفوفًا', async () => {
  const { client } = build((url) =>
    url.includes('/token')
      ? { status: 200, body: { token: 'PG', exp: 9_999_999 } }
      : { status: 200, body: { message: 'خطأ' } }
  );
  const r = await client.select('documents', 'select=id');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-body');
});

test('نقض: بلا رمزِ Firebase لا يُسأل الخادمُ أصلًا', async () => {
  const { calls, fetchImpl } = net({ status: 200, body: [] });
  const client = createClient({
    apiUrl: 'https://api.test',
    authUrl: 'https://auth.test',
    getIdToken: async () => null,
    fetch: fetchImpl,
    now: () => 1,
  });
  const r = await client.select('documents', 'select=id');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-token');
  assert.equal(calls.length, 0);
});

test('★★★ الطزاجة: البائتُ يسقط من المجموعة والطازجُ يبقى', async () => {
  const { client } = build(
    (url) =>
      url.includes('/token')
        ? { status: 200, body: { token: 'PG', exp: 9_999_999 } }
        : {
            status: 200,
            body: [
              { path: 'documents', age_seconds: 110 },
              { path: 'Items_Master', age_seconds: 4000 },
              { path: 'warehouses', age_seconds: null },
            ],
          },
    { staleSeconds: 900 }
  );

  const fresh = await client.freshPaths();
  assert.equal(fresh.has('documents'), true);
  assert.equal(fresh.has('Items_Master'), false, '★ بَاتت ⇒ تُقرأ من Firebase');
  assert.equal(fresh.has('warehouses'), false, 'عمرٌ مجهولٌ ليس طزاجة');
});

test('★★ وإجابةُ الطزاجة تُخبَّأ فلا تُسأل مع كلّ قراءة', async () => {
  let t = 1_000_000;
  const { client, calls } = build(
    (url) =>
      url.includes('/token')
        ? { status: 200, body: { token: 'PG', exp: 9_999_999 } }
        : { status: 200, body: [{ path: 'documents', age_seconds: 1 }] },
    { freshnessTtlMs: 30000 },
    () => t
  );

  await client.freshPaths();
  const n = calls.length;
  await client.freshPaths();
  assert.equal(calls.length, n, 'لا سؤالَ ثانٍ داخل المهلة');

  t += 30001;
  await client.freshPaths();
  assert.ok(calls.length > n, 'ويُسأل بعدها');
});

test('★★★ نقض: تعذّرُ قياس الطزاجة يُعيد null لا مجموعةً فارغة', async () => {
  // الفرقُ حاسم: الفارغةُ تعني «كلُّها بائتة» فتُعطّل الهجينَ كلَّه؛
  // و`null` تعني «لم أقس» فيمضي القرارُ على ما سواه.
  const { client } = build((url) =>
    url.includes('/token') ? { status: 200, body: { token: 'PG', exp: 9_999_999 } } : 'throw'
  );
  const fresh = await client.freshPaths();
  assert.equal(fresh, null);
});

test('نقض: عميلٌ بلا عنوانٍ غيرُ مهيَّأ ولا يُسأل', async () => {
  const client = createClient({ apiUrl: '', authUrl: '', getIdToken: async () => 'X' });
  assert.equal(client.configured, false);
  assert.equal(client.healthy(), false);
  assert.equal((await client.select('documents', 'select=id')).ok, false);
  assert.equal(await client.freshPaths(), null);
});
