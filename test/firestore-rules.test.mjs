/**
 * اختبارات قواعد Firestore — «العملية الجراحية» المحور ٤.
 *
 * أوّل اختبارات آلية للقواعد في تاريخ المشروع. تُغطّي الخوارق التي شُدّدت:
 *   · المشاهد لا يكتب مستندًا ولا يحرق عدّادًا.
 *   · الموقوف (active:false) لا يكتب شيئًا حسّاسًا ولو كان دوره مديرًا.
 *   · لا تصعيد ذاتي للدور (مستخدم يرقّي نفسه admin).
 *   · دليل المستخدمين غير مقروء لغير صاحبه/المدير.
 *   · السجلّات الملحقة (scans/audit/versions) لا تُحدَّث ولا تُحذف.
 *
 * ── كيف تُشغَّل (تحتاج إيميولاتور Firestore + Java) ──
 *   npm i -D @firebase/rules-unit-testing firebase-tools
 *   npm run test:rules
 * بدون الإيميولاتور تُتخطّى كل الاختبارات بأمان (لا تكسر `npm test`)،
 * ولذلك تعيش خارج `src/**` فلا يلتقطها مُشغّل الاختبارات الافتراضي.
 */
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;

let testEnv = null;
let rulesLib = null;

before(async () => {
  if (!HOST) return; // لا إيميولاتور → نتخطّى
  try {
    rulesLib = await import('@firebase/rules-unit-testing');
  } catch {
    console.warn('⚠️ @firebase/rules-unit-testing غير مثبّتة — تُتخطّى اختبارات القواعد.');
    return;
  }
  const [host, port] = HOST.split(':');
  testEnv = await rulesLib.initializeTestEnvironment({
    projectId: 'brandzo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

/** يهيّئ وثيقة مستخدم بدور وحالة، ثم يعيد سياق ذلك المستخدم. */
async function asUser(uid, role, active = true, email = `${uid}@bz.test`) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({ role, active, email });
  });
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

const guard = (fn) => async (t) => {
  if (!testEnv) return t.skip('لا إيميولاتور Firestore — FIRESTORE_EMULATOR_HOST غير مضبوط');
  const { assertFails, assertSucceeds } = rulesLib;
  await testEnv.clearFirestore();
  await fn({ assertFails, assertSucceeds });
};

test('المشاهد لا يُنشئ مستندًا', guard(async ({ assertFails }) => {
  const db = await asUser('v1', 'viewer');
  await assertFails(
    db.doc('documents/d1').set({
      type: 'GRN', createdByUid: 'v1', state: 'draft', number: null,
    })
  );
}));

test('الفاعل المخزنيّ يُنشئ مسودّة مستند', guard(async ({ assertSucceeds }) => {
  const db = await asUser('s1', 'storekeeper');
  await assertSucceeds(
    db.doc('documents/d2').set({
      type: 'GRN', createdByUid: 's1', state: 'draft', number: null,
    })
  );
}));

test('المشاهد لا يحرق عدّاد الترقيم', guard(async ({ assertFails }) => {
  const db = await asUser('v2', 'viewer');
  await assertFails(db.doc('counters/GRN-2026').set({ type: 'GRN', year: 2026, seq: 1 }));
}));

test('الموقوف (مدير active:false) لا يكتب ماستر الأصناف', guard(async ({ assertFails }) => {
  const db = await asUser('m1', 'warehouse_manager', false);
  await assertFails(db.doc('Items_Master/i1').set({ sku: 'X', name: 'Y' }));
}));

test('المدير المفعَّل يكتب ماستر الأصناف', guard(async ({ assertSucceeds }) => {
  const db = await asUser('m2', 'warehouse_manager', true);
  await assertSucceeds(db.doc('Items_Master/i2').set({ sku: 'X', name: 'Y' }));
}));

test('لا تصعيد ذاتي للدور (مستخدم يرقّي نفسه admin)', guard(async ({ assertFails }) => {
  const db = await asUser('u1', 'storekeeper');
  await assertFails(db.doc('users/u1').set({ role: 'admin', active: true }, { merge: true }));
}));

test('المستخدم يقرأ ملفّه لا ملفّ غيره', guard(async ({ assertFails, assertSucceeds }) => {
  const db = await asUser('u2', 'storekeeper');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('users/other').set({ role: 'viewer', active: true });
  });
  await assertSucceeds(db.doc('users/u2').get());
  await assertFails(db.doc('users/other').get());
}));

test('المدير يقرأ دليل المستخدمين كاملًا', guard(async ({ assertSucceeds }) => {
  const db = await asUser('m3', 'warehouse_manager');
  await assertSucceeds(db.collection('users').get());
}));

test('سجلّ المسح لا يُحدَّث بعد كتابته (ملحق-فقط)', guard(async ({ assertFails }) => {
  const db = await asUser('s2', 'storekeeper');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('operations/op1/scans/sc1').set({ byUid: 's2', code: 'A' });
  });
  await assertFails(db.doc('operations/op1/scans/sc1').update({ code: 'B' }));
}));

test('العدّاد لا يقفز أكثر من واحد', guard(async ({ assertFails, assertSucceeds }) => {
  const db = await asUser('s3', 'storekeeper');
  await assertSucceeds(db.doc('counters/PO-2026').set({ type: 'PO', year: 2026, seq: 1 }));
  await assertFails(db.doc('counters/PO-2026').set({ type: 'PO', year: 2026, seq: 5 }));
  await assertSucceeds(db.doc('counters/PO-2026').set({ type: 'PO', year: 2026, seq: 2 }));
}));
