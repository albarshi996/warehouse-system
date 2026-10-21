/**
 * بيّنةُ التوجيه — والأهمُّ فيها **النقض**: ما يجب ألّا يذهب إلى قاعدتنا.
 * فخطأُ التوجيه لا يظهر رسالةَ خطأ؛ يُظهر شاشةً فارغةً أو بياناتٍ قديمة.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeFor, isMirrored, mirroredPaths, REASON, MIRRORED, isQuotaError } from './routing.js';

test('المنسوخُ يُقرأ من قاعدتنا — بجدوله وعمود معرّفه', () => {
  const r = routeFor('Items_Master');
  assert.equal(r.source, 'postgres');
  assert.equal(r.table, 'items');
  assert.equal(r.idColumn, 'firebase_id');

  const d = routeFor('documents/abc123');
  assert.equal(d.source, 'postgres');
  assert.equal(d.table, 'documents');
  assert.equal(d.idColumn, 'id');
});

test('★★★ ومعرّفُ الصنف ليس `sku` — وإلّا أعاد صفًّا خاطئًا بلا شكوى', () => {
  // الفخُّ: مفتاحُ الجدول الأوّليُّ `sku`، ومعرّفُ Firestore في `firebase_id`.
  assert.equal(MIRRORED.Items_Master.idColumn, 'firebase_id');
  assert.notEqual(MIRRORED.Items_Master.idColumn, 'sku');
});

test('★★★ نقض: المجهولُ يذهب إلى Firebase ولا يُخترع له جدول', () => {
  // ٩٣ مجموعةً بلا جدول. عيّنةٌ منها تكفي للحكم.
  for (const p of ['handling_units', 'bin_locations', 'assets', 'portal_visits', 'recipes']) {
    const r = routeFor(p);
    assert.equal(r.source, 'firestore', `${p} يجب أن يبقى على Firebase`);
    assert.equal(r.reason, REASON.NOT_MIRRORED);
  }
});

test('★★★ نقض: العدّاداتُ والمستخدمون والمخازنُ ليست في الجدول — بقرارٍ مكتوب', () => {
  for (const p of ['counters', 'users', 'warehouses']) {
    assert.equal(routeFor(p).source, 'firestore', `${p} خرجت بقرار`);
  }
});

test('★★ نقض: المسارُ المتداخلُ يُردّ — السطورُ داخل jsonb لا في مجموعةٍ فرعيّة', () => {
  const r = routeFor('documents/abc/lines/l1');
  assert.equal(r.source, 'firestore');
  assert.equal(r.reason, REASON.NESTED);
});

test('نقض: المسارُ الفارغ أو المعطوب لا يُمرَّر إلى القاعدة', () => {
  for (const p of ['', '/', null, undefined, 42, {}]) {
    const r = routeFor(p);
    assert.equal(r.source, 'firestore');
    assert.equal(r.reason, REASON.BAD_PATH);
  }
});

test('★★★ نقض: المفتاحُ العامُّ مطفأً يُرجع كلَّ شيءٍ إلى Firebase', () => {
  const r = routeFor('Items_Master', { enabled: false });
  assert.equal(r.source, 'firestore');
  assert.equal(r.reason, REASON.DISABLED);
});

test('★★★ نقض: القاعدةُ غيرُ المبلوغة لا تُسأل — السقوطُ آمنٌ لا صامت', () => {
  const r = routeFor('documents', { healthy: false });
  assert.equal(r.source, 'firestore');
  assert.equal(r.reason, REASON.DOWN);
});

test('★★★ والطزاجةُ بالمسار لا بالمجموع — تعثّرُ مسارٍ لا يُسقط الآخر', () => {
  const fresh = new Set(['documents']); // `Items_Master` تعثّرت
  assert.equal(routeFor('documents', { fresh }).source, 'postgres');

  const stale = routeFor('Items_Master', { fresh });
  assert.equal(stale.source, 'firestore');
  assert.equal(stale.reason, REASON.STALE);
});

test('★★ و«لم تُقَس الطزاجة» ليست «بائتة» — null لا تُسقط المسار', () => {
  assert.equal(routeFor('documents', { fresh: null }).source, 'postgres');
  assert.equal(routeFor('documents', {}).source, 'postgres');
});

test('isMirrored يسأل عن الجدول لا عن الحالة', () => {
  assert.equal(isMirrored('Items_Master'), true);
  assert.equal(isMirrored('Items_Master/x'), true);
  assert.equal(isMirrored('Items_Master/x/history/y'), false);
  assert.equal(isMirrored('assets'), false);
  assert.equal(mirroredPaths().length, 2);
});

/* ═══════════════════ نفادُ الحصّة — «العملُ لا يتوقّف» ═══════════════════ */

test('★★★ يُعرَف نفادُ الحصّة بالرمز وبالنصّ معًا', () => {
  assert.equal(isQuotaError({ code: 'resource-exhausted' }), true);
  assert.equal(isQuotaError({ code: 'RESOURCE-EXHAUSTED' }), true, 'حالةُ الأحرف لا تعني شيئًا');
  assert.equal(isQuotaError({ message: 'Quota exceeded for reads' }), true);
  assert.equal(isQuotaError({ code: 'unknown', message: 'daily quota reached' }), true);
});

test('★★★ نقض: وما سواه يُرمى كما هو ولا يُغطّى ببياناتٍ متأخّرة', () => {
  // ولو عُدَّ كلُّ عطبٍ «نفادَ حصّة» لصار كلُّ خطأٍ عابرٍ سببًا لعرض بياناتٍ
  // قديمةٍ **بدل أن يُصلَح** — وهذا إخفاءُ عطبٍ لا استمرارُ عمل.
  for (const e of [
    { code: 'permission-denied' },
    { code: 'unavailable', message: 'network error' },
    { code: 'not-found' },
    { message: 'TypeError: x is not a function' },
    null,
    undefined,
    'quota',
    42,
  ]) {
    assert.equal(isQuotaError(e), false, `«${JSON.stringify(e)}» ليس نفادَ حصّة`);
  }
});

test('★★ والمنقَذُ يجب أن يكون منسوخًا — وإلّا فلا شيءَ يُقدَّم', () => {
  // يومَ نفاد الحصّة لا يُنقَذ إلّا ما له جدولٌ في الجهاز.
  assert.equal(Boolean(MIRRORED.Items_Master), true);
  assert.equal(Boolean(MIRRORED.documents), true);
  assert.equal(Boolean(MIRRORED.assets), false, 'غيرُ المنسوخ لا يُنقَذ — ويُرمى الخطأ');
});
