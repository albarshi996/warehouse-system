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

// ═══ طبقة الطبالي LPN — مقاطع handling_units وlpn_counters (LPN-108) ═══

const LPN1 = 'LPN-MAIN-20260826-000001';

/** كيان طبليةٍ صالح باسم كاتبه. */
function validUnit(uid, overrides = {}) {
  return {
    code: LPN1,
    state: 'APPROVED',
    flags: [],
    warehouse: 'MAIN',
    bin: '',
    lines: [],
    parentCodes: [],
    createdBy: 'مختبر',
    createdByUid: uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  };
}

test('المشاهد لا يُنشئ طبلية — والفاعل المخزنيّ يُنشئها باسمه ومعرّفها هويّتها', guard(async ({ assertFails, assertSucceeds }) => {
  const viewer = await asUser('lpn-v1', 'viewer');
  await assertFails(viewer.doc(`handling_units/${LPN1}`).set(validUnit('lpn-v1')));

  const keeper = await asUser('lpn-s1', 'storekeeper');
  await assertFails(
    keeper.doc(`handling_units/${LPN1}`).set(validUnit('غيري')),
    'انتحال الكاتب مرفوض'
  );
  await assertFails(
    keeper.doc('handling_units/other-id').set(validUnit('lpn-s1')),
    'المعرّف يجب أن يطابق الهويّة'
  );
  await assertSucceeds(keeper.doc(`handling_units/${LPN1}`).set(validUnit('lpn-s1')));
}));

test('هويّة الطبلية ومنشئها مختومان — والحذف ممنوع ولو للمدير', guard(async ({ assertFails, assertSucceeds }) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`handling_units/${LPN1}`).set(validUnit('lpn-owner'));
  });
  const keeper = await asUser('lpn-s2', 'storekeeper');
  await assertSucceeds(
    keeper.doc(`handling_units/${LPN1}`).update({ state: 'LABEL_PRINTED' }),
    'الحالة تتغيّر بمعاملات الخدمة'
  );
  await assertFails(
    keeper.doc(`handling_units/${LPN1}`).update({ code: 'LPN-MAIN-20260826-000099' }),
    'الهويّة لا تتغيّر'
  );
  await assertFails(
    keeper.doc(`handling_units/${LPN1}`).update({ createdByUid: 'lpn-s2' }),
    'المنشئ لا يُنتحل بعد الإنشاء'
  );
  const admin = await asUser('lpn-a1', 'admin');
  await assertFails(admin.doc(`handling_units/${LPN1}`).delete(), 'لا محو للحمولة — ولو مديرًا');
}));

test('سجلّ أحداث الطبلية ملحق-فقط: إعادة الكتابة الحتمية تمرّ والتحوير يُرفض', guard(async ({ assertFails, assertSucceeds }) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`handling_units/${LPN1}`).set(validUnit('lpn-owner'));
  });
  const keeper = await asUser('lpn-s3', 'storekeeper');
  const event = {
    type: 'MOVED', lpn: LPN1, actor: 'مختبر', at: '2026-08-26T10:00:00Z',
    device: '', doc: null, reason: '', details: null, seq: null, byUid: 'lpn-s3',
    recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  const ref = keeper.doc(`handling_units/${LPN1}/events/PUTAWAY-1__${LPN1}`);
  await assertSucceeds(ref.set(event));
  await assertSucceeds(ref.set(event), 'إعادة المحاولة بنفس الهويّة تكتب فوق نفسها');
  await assertFails(ref.set({ ...event, actor: 'مزوِّر' }), 'تحوير الفاعل مرفوض');
  await assertFails(ref.set({ ...event, at: '2026-08-27T10:00:00Z' }), 'تحوير الوقت مرفوض');
  await assertFails(ref.delete(), 'لا حذف لحدث');
}));

test('عدّاد الطبالي يزيد واحدًا وإلى الأمام فقط — والمشاهد لا يحرقه', guard(async ({ assertFails, assertSucceeds }) => {
  const viewer = await asUser('lpn-v2', 'viewer');
  await assertFails(viewer.doc('lpn_counters/LPN-MAIN-20260826').set({ key: 'LPN-MAIN-20260826', seq: 1 }));

  const keeper = await asUser('lpn-s4', 'storekeeper');
  await assertSucceeds(keeper.doc('lpn_counters/LPN-MAIN-20260826').set({ key: 'LPN-MAIN-20260826', seq: 1, byUid: 'lpn-s4' }));
  await assertFails(
    keeper.doc('lpn_counters/LPN-MAIN-20260826').update({ seq: 5 }),
    'القفز يحرق هويّاتٍ — واحدًا واحدًا'
  );
  await assertSucceeds(keeper.doc('lpn_counters/LPN-MAIN-20260826').update({ seq: 2 }));
  await assertFails(keeper.doc('lpn_counters/LPN-MAIN-20260826').update({ seq: 1 }), 'لا تصفير ولا رجوع');
}));

test('🔒 القاعدة تفرض «النظام يولّد الهويّة»: هويّةٌ مسكوكةٌ بيدٍ أو حالةُ ميلادٍ خاطئة تُردّان', guard(async ({ assertFails, assertSucceeds }) => {
  const keeper = await asUser('lpn-s5', 'storekeeper');
  await assertFails(
    keeper.doc('handling_units/PALLET-1').set(validUnit('lpn-s5', { code: 'PALLET-1' })),
    'هويّة لا تتبع نحو LPN مرفوضة من القاعدة لا من العميل وحده'
  );
  await assertFails(
    keeper.doc('handling_units/LPN-MAIN-20260826-000050').set(
      validUnit('lpn-s5', { code: 'LPN-MAIN-20260826-000050', state: 'STORED' })
    ),
    'الميلاد من حالتَي التجسيد وحدهما'
  );
  await assertSucceeds(
    keeper.doc('handling_units/LPN-MAIN-20260826-000051').set(
      validUnit('lpn-s5', { code: 'LPN-MAIN-20260826-000051' })
    )
  );
}));

test('🔒 النسب والمصدر والميلاد مختومة — ومصروفةٌ لا تُحيا بحمولةٍ جديدة', guard(async ({ assertFails }) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('handling_units/LPN-MAIN-20260826-000060').set(
      validUnit('lpn-owner', { code: 'LPN-MAIN-20260826-000060', parentCodes: ['LPN-MAIN-20260826-000001'] })
    );
    await ctx.firestore().doc('handling_units/LPN-MAIN-20260826-000061').set(
      validUnit('lpn-owner', { code: 'LPN-MAIN-20260826-000061', state: 'ISSUED' })
    );
  });
  const keeper = await asUser('lpn-s6', 'storekeeper');
  await assertFails(
    keeper.doc('handling_units/LPN-MAIN-20260826-000060').update({ parentCodes: [] }),
    'النسب لا تُمحى'
  );
  await assertFails(
    keeper.doc('handling_units/LPN-MAIN-20260826-000060').update({ sourceDoc: { type: 'GRN', number: 'مزوَّر' } }),
    'مستند المصدر مختوم'
  );
  await assertFails(
    keeper.doc('handling_units/LPN-MAIN-20260826-000061').update({ state: 'APPROVED', lines: [] }),
    'المصروفة لا تُحيا — إعادةُ استخدامٍ للهويّة فعلًا'
  );
}));

test('🔒 حمولة الحدث مختومة: details وdoc لا يُستبدلان بعد التسجيل', guard(async ({ assertFails, assertSucceeds }) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`handling_units/${LPN1}`).set(validUnit('lpn-owner'));
  });
  const keeper = await asUser('lpn-s7', 'storekeeper');
  const event = {
    type: 'READING_ADDED', lpn: LPN1, actor: 'مختبر', at: '2026-08-26T10:00:00Z',
    device: 'DEV-01', doc: null, reason: '', seq: 1, byUid: 'lpn-s7',
    details: { sku: 'WNW-001', qty: 12 },
    recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  const ref = keeper.doc(`handling_units/${LPN1}/events/${LPN1}__DEV-01__000001`);
  await assertSucceeds(ref.set(event));
  await assertSucceeds(ref.set(event), 'إعادة المحاولة المتطابقة تمرّ');
  await assertFails(ref.set({ ...event, details: { sku: 'WNW-001', qty: 120 } }), 'تحوير الكمّيّة المسجّلة مرفوض');
  await assertFails(ref.set({ ...event, doc: { type: 'GRN', id: 'x', number: 'GRN-9' } }), 'تحوير مستند الحدث مرفوض');
}));

test('🔒 حدثٌ تحت طبلية يحمل رمز طبلية أخرى مرفوض من القاعدة', guard(async ({ assertFails }) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`handling_units/${LPN1}`).set(validUnit('lpn-owner'));
  });
  const keeper = await asUser('lpn-s8', 'storekeeper');
  await assertFails(
    keeper.doc(`handling_units/${LPN1}/events/foreign`).set({
      type: 'MOVED', lpn: 'LPN-MAIN-20260826-000099', actor: 'مختبر',
      at: '2026-08-26T10:00:00Z', device: '', doc: null, reason: '', details: null, seq: null,
      byUid: 'lpn-s8', recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
  );
}));
