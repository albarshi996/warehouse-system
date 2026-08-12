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
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

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

async function seedDocuments(...documents) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const batch = ctx.firestore().batch();
    for (const document of documents) {
      batch.set(ctx.firestore().doc(`documents/${document.id}`), {
        type: document.type,
        state: document.state || 'approved',
        number: document.number || null,
        createdByUid: document.createdByUid || 'seed',
      });
    }
    await batch.commit();
  });
}

function validDocumentLink(id, uid, overrides = {}) {
  return {
    id,
    version: 1,
    source: {
      documentId: 'po-link-source', documentType: 'PO', documentNumber: 'PO-1',
      lineId: null, lineNumber: null,
    },
    target: {
      documentId: 'grn-link-target', documentType: 'GRN', documentNumber: null,
      lineId: null, lineNumber: null,
    },
    linkType: 'BASE',
    linkedQuantity: null,
    linkedValue: null,
    uom: null,
    operationId: 'derive-1',
    correlationId: 'po-link-source',
    byUid: uid,
    byName: 'مختبر',
    byRole: 'storekeeper',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  };
}

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

test('الفاعل يضيف علاقة صحيحة والسجل يبقى ملحقًا فقط', guard(async ({ assertFails, assertSucceeds }) => {
  await seedDocuments(
    { id: 'po-link-source', type: 'PO' },
    { id: 'grn-link-target', type: 'GRN' },
  );
  const db = await asUser('link-writer', 'storekeeper');
  const ref = db.doc('document_links/link-1');
  await assertSucceeds(ref.set(validDocumentLink('link-1', 'link-writer')));
  await assertFails(ref.update({ correlationId: 'changed' }));
  await assertFails(ref.delete());
}));

test('علاقة المستند ترفض المشاهد وانتحال الكاتب والطرف غير الموجود', guard(async ({ assertFails }) => {
  await seedDocuments(
    { id: 'po-link-source', type: 'PO' },
    { id: 'grn-link-target', type: 'GRN' },
  );
  const viewer = await asUser('link-viewer', 'viewer');
  await assertFails(
    viewer.doc('document_links/viewer-link').set(validDocumentLink('viewer-link', 'link-viewer')),
  );

  const writer = await asUser('link-writer-2', 'storekeeper');
  await assertFails(
    writer.doc('document_links/forged-link').set(validDocumentLink('forged-link', 'another-user')),
  );
  await assertFails(
    writer.doc('document_links/missing-link').set(validDocumentLink('missing-link', 'link-writer-2', {
      target: {
        documentId: 'missing-document', documentType: 'GRN', documentNumber: null,
        lineId: null, lineNumber: null,
      },
    })),
  );
}));

test('إنشاء الطفل وعلاقته وقيدي التدقيق ينجح في دفعة ذرّية واحدة', guard(async ({ assertSucceeds }) => {
  await seedDocuments({ id: 'po-link-source', type: 'PO' });
  const db = await asUser('atomic-writer', 'storekeeper');
  const batch = db.batch();
  batch.set(db.doc('documents/grn-link-target'), {
    type: 'GRN',
    state: 'draft',
    number: null,
    createdByUid: 'atomic-writer',
  });
  batch.set(
    db.doc('document_links/atomic-link'),
    validDocumentLink('atomic-link', 'atomic-writer'),
  );
  batch.set(db.doc('documents/grn-link-target/audit/create-1'), {
    action: 'create', byUid: 'atomic-writer', at: firebase.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(db.doc('documents/po-link-source/audit/derive-1'), {
    action: 'derive', byUid: 'atomic-writer', at: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
}));
