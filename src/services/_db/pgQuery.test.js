/**
 * بيّنةُ الترجمة.
 *
 * ★★★ ونصفُها نقضٌ عمدًا: **ما يجب ألّا يُترجَم**. لأنّ ترجمةً ناقصةً
 *     تُعيد صفوفًا زائدةً بلا شكوى — وهذا أخطرُ من الفشل الصريح.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, DOC_ID } from './pgQuery.js';

/** مُحوِّلُ وقتٍ مثلُ `Timestamp` دون استيراد Firebase. */
const deps = { isoOf: (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : null) };
const ts = (iso) => ({ toDate: () => new Date(iso) });

const q = (constraints, head = 'documents') => translate(head, constraints, deps);

test('المساواةُ تُترجَم، والأعمدةُ تُسمّى صراحةً لا `*`', () => {
  const r = q([{ kind: 'where', field: 'state', op: '==', value: 'draft' }]);
  assert.equal(r.ok, true);
  assert.match(r.search, /select=.*created_by_uid/);
  assert.match(r.search, /(^|&)state=eq\.draft(&|$)/);
});

test('المعاملاتُ الستّةُ تُترجَم بمقابلاتها', () => {
  const pairs = [['!=', 'neq'], ['<', 'lt'], ['<=', 'lte'], ['>', 'gt'], ['>=', 'gte']];
  for (const [fs, pg] of pairs) {
    const r = q([{ kind: 'where', field: 'stage', op: fs, value: 3 }]);
    assert.equal(r.ok, true);
    assert.match(r.search, new RegExp(`stage=${pg.replace('.', '\\.')}\\.3`));
  }
});

test('`in` و`not-in` قائمتان', () => {
  const a = q([{ kind: 'where', field: 'state', op: 'in', value: ['draft', 'posted'] }]);
  assert.match(a.search, /state=in\.\(%22draft%22,%22posted%22\)/);

  const b = q([{ kind: 'where', field: 'state', op: 'not-in', value: ['draft'] }]);
  assert.match(b.search, /state=not\.in\.\(%22draft%22\)/);
});

test('★★ الاحتواءُ على عمودِ مصفوفةٍ وحدَه', () => {
  const ok = translate(
    'Items_Master',
    [{ kind: 'where', field: 'barcodes', op: 'array-contains', value: '656272773236' }],
    deps
  );
  assert.equal(ok.ok, true);
  assert.match(ok.search, /barcodes=cs\.\{%22656272773236%22\}/);

  // ★★★ نقض: الاحتواءُ على نصٍّ لا معنى له — ولا يُترجَم بالتقريب.
  const bad = translate(
    'Items_Master',
    [{ kind: 'where', field: 'category', op: 'array-contains', value: 'x' }],
    deps
  );
  assert.equal(bad.ok, false);
});

test('★★★ الوقتُ يُرسَل ISO لا «[object Object]»', () => {
  const r = q([{ kind: 'where', field: 'updatedAt', op: '>=', value: ts('2026-10-19T22:00:00.000Z') }]);
  assert.equal(r.ok, true);
  assert.match(r.search, /updated_at=gte\.2026-10-19T22%3A00%3A00\.000Z/);
});

test('★★★ نقض: كائنٌ لا يُعرف تحويلُه يُبطل الترجمة ولا يُقارَن به', () => {
  const r = q([{ kind: 'where', field: 'header', op: '==', value: { a: 1 } }]);
  assert.equal(r.ok, false);
});

test('العدمُ له صيغتُه، ولا يُقارَن بـeq', () => {
  const a = q([{ kind: 'where', field: 'approvedAt', op: '==', value: null }]);
  assert.match(a.search, /approved_at=is\.null/);

  const b = q([{ kind: 'where', field: 'approvedAt', op: '!=', value: null }]);
  assert.match(b.search, /approved_at=not\.is\.null/);

  const c = q([{ kind: 'where', field: 'approvedAt', op: '>', value: null }]);
  assert.equal(c.ok, false, 'مقارنةُ ترتيبٍ بالعدم لا تُترجَم');
});

test('`documentId()` يصير عمودَ المعرّف — وهو يختلف بين المجموعتين', () => {
  const d = q([{ kind: 'where', field: DOC_ID, op: '==', value: 'D1' }]);
  assert.match(d.search, /(^|&)id=eq\.D1/);

  const i = translate('Items_Master', [{ kind: 'where', field: DOC_ID, op: '==', value: 'FB1' }], deps);
  assert.match(i.search, /firebase_id=eq\.FB1/);
});

test('★★ الترتيبُ على عمودٍ يقبل العدمَ يستبعد الغائب — كدلالة Firestore', () => {
  const r = q([{ kind: 'orderBy', field: 'approvedAt', dir: 'desc' }]);
  assert.match(r.search, /order=approved_at\.desc\.nullslast/);
  assert.match(r.search, /approved_at=not\.is\.null/);

  // والنصُّ `NOT NULL` فلا شرطَ زائد.
  const s = q([{ kind: 'orderBy', field: 'state', dir: 'asc' }]);
  assert.match(s.search, /order=state\.asc\.nullsfirst/);
  assert.equal(/state=not\.is\.null/.test(s.search), false);
});

test('الحدُّ يُترجَم، والمعطوبُ يُبطل', () => {
  assert.match(q([{ kind: 'limit', n: 50 }]).search, /(^|&)limit=50(&|$)/);
  assert.equal(q([{ kind: 'limit', n: 0 }]).ok, false);
  assert.equal(q([{ kind: 'limit', n: -3 }]).ok, false);
  assert.equal(q([{ kind: 'limit', n: 2.5 }]).ok, false);
});

test('★★★ نقض: مؤشّرُ الصفحة يُعلن العجزَ ولا يُقرَّب بـoffset', () => {
  const r = q([{ kind: 'startAfter', snap: {} }]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /مؤشّر/);
});

test('★★★ نقض: حقلٌ يعيش في `extra` لا عمودَ له — فتُردّ الترجمةُ كلُّها', () => {
  const r = q([
    { kind: 'where', field: 'state', op: '==', value: 'draft' },
    { kind: 'where', field: 'soAllocation', op: '==', value: 'X' },
  ]);
  assert.equal(r.ok, false, 'قيدٌ واحدٌ عاجزٌ يُبطل الاستعلامَ بأكمله');
});

test('★★★ نقض: الحقلُ المتشعّب لا يُترجَم', () => {
  assert.equal(q([{ kind: 'where', field: 'header.supplier', op: '==', value: 'A' }]).ok, false);
});

test('نقض: قيدٌ مجهولُ النوع يُبطل — ولا يُتخطّى بصمت', () => {
  assert.equal(q([{ kind: 'somethingNew', x: 1 }]).ok, false);
  assert.equal(q([null]).ok, false);
  assert.equal(translate('assets', [], deps).ok, false);
});

test('★★ والترميزُ يمنع حقنَ معاملٍ عبر القيمة', () => {
  const r = q([{ kind: 'where', field: 'number', op: '==', value: 'PO,1")&posted=eq.true' }]);
  assert.equal(r.ok, true);
  const after = r.search.split('number=eq.')[1];
  // لا `&` خامٌ يُولَد من القيمة، فلا معاملَ جديدٌ يُحقن.
  assert.equal(after.includes('&'), false);
  assert.match(after, /%26/);
});

test('★★★ درسُ 2026-10-20: المفردُ لا يُقتبَس — والاقتباسُ يُعيد صفرَ صفٍّ بلا خطأ', () => {
  // قِيس على PostgREST v12.2.3 بالبيانات الحيّة: `eq."approved"` ⟵ ٠ صفّ،
  // و`eq.approved` ⟵ ٤٢ صفًّا. فلا علامةَ اقتباسٍ تُولَد في معاملٍ مفرد.
  const r = q([{ kind: 'where', field: 'state', op: '==', value: 'approved' }]);
  const scalar = r.search.split('state=eq.')[1].split('&')[0];
  assert.equal(scalar, 'approved');
  assert.equal(scalar.includes('%22'), false, 'لا اقتباسَ في المفرد');

  // والعربيُّ يُرمَّز ويُفكّ عند الخادم — قِيس: ٣١٨ صفًّا.
  const ar = q([{ kind: 'where', field: 'createdByName', op: '==', value: 'محمد' }]);
  assert.match(ar.search, /created_by_name=eq\.%D9%85/);
});

test('★★★ نقض: نصٌّ هو حرفيًّا «null» لا يُعبَّر عنه — فيُعلَن العجز', () => {
  // العاري يعني العدمَ عند الخادم، والمقتبَسُ لا يُنزع. فلا صيغةَ صحيحة.
  for (const v of ['null', 'true', 'FALSE']) {
    assert.equal(q([{ kind: 'where', field: 'state', op: '==', value: v }]).ok, false);
  }
  // وفي عمودٍ منطقيٍّ المنطقُ قيمةٌ لا نصّ — فيمرّ.
  assert.equal(q([{ kind: 'where', field: 'posted', op: '==', value: true }]).ok, true);
});
