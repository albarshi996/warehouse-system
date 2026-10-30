/**
 * ترجمةُ القيود ⟵ SQL — تُقاس نصًّا، فلا تُفاجئنا على جهازٍ أوّلَ مرّة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSelect, buildCount, fieldExpr, encodeParam, DOC_ID } from './sqlQuery.js';
import { makeTimestamp } from './localValues.js';

const w = (field, op, value) => ({ __c: 'where', field, op, value });
const ob = (field, dir) => ({ __c: 'orderBy', field, dir });
const lim = (n) => ({ __c: 'limit', n });
const sa = (...vals) => ({ __c: 'startAfter', vals });

test('تعبيرُ الحقل: المعرّفُ عمودٌ، والحقلُ يتحمّل الطابعَ الزمنيّ', () => {
  assert.equal(fieldExpr(DOC_ID), 'id');
  assert.equal(
    fieldExpr('status'),
    "COALESCE(json_extract(data, '$.status.__ts__'), json_extract(data, '$.status'))"
  );
  assert.throws(() => fieldExpr("x'; DROP"), /غيرُ صالح/, 'يرفض ما ليس حقلًا نظيفًا');
});

test('★ استعلامٌ كامل: شرطٌ + ترتيبٌ + حدّ — بالنصّ الحرفيّ', () => {
  const { sql, params } = buildSelect('documents', [w('status', '==', 'done'), ob('createdAt', 'desc'), lim(5)]);
  assert.equal(
    sql,
    'SELECT id, data FROM kv_docs WHERE collection = ? AND ' +
      "COALESCE(json_extract(data, '$.status.__ts__'), json_extract(data, '$.status')) = ? " +
      "ORDER BY COALESCE(json_extract(data, '$.createdAt.__ts__'), json_extract(data, '$.createdAt')) DESC, id DESC " +
      'LIMIT 5'
  );
  assert.deepEqual(params, ['documents', 'done']);
});

test('المعرّفُ في IN يُقارن بعمود id', () => {
  const { sql, params } = buildSelect('users', [w(DOC_ID, 'in', ['a', 'b', 'c'])]);
  assert.equal(sql, 'SELECT id, data FROM kv_docs WHERE collection = ? AND id IN (?, ?, ?) ORDER BY id ASC');
  assert.deepEqual(params, ['users', 'a', 'b', 'c']);
});

test('array-contains يُولّد EXISTS على json_each', () => {
  const { sql, params } = buildSelect('p', [w('tags', 'array-contains', 'x')]);
  assert.match(sql, /EXISTS \(SELECT 1 FROM json_each\(kv_docs\.data, '\$\.tags'\) AS je WHERE je\.value = \?\)/);
  assert.deepEqual(params, ['p', 'x']);
});

test('null يترجَم بـjson_type فيطابق الصريحَ لا المفقود (#6)', () => {
  assert.match(buildSelect('c', [w('x', '==', null)]).sql, /json_type\(data, '\$\.x'\) = 'null'/);
  assert.match(
    buildSelect('c', [w('x', '!=', null)]).sql,
    /json_type\(data, '\$\.x'\) IS NOT NULL AND json_type\(data, '\$\.x'\) != 'null'/
  );
  assert.match(buildSelect('c', [w(DOC_ID, '==', null)]).sql, /id IS NULL/, 'المعرّفُ عمودٌ لا json');
});

test('المعاملُ الزمنيُّ يُرمَّز ISO كي يُقارن بوسم __ts__', () => {
  const { params } = buildSelect('c', [w('at', '>=', makeTimestamp(1000))]);
  assert.deepEqual(params, ['c', new Date(1000).toISOString()]);
  assert.equal(encodeParam(true), 1, 'المنطقيُّ 0/1 كما يُعيده json_extract');
});

test('★ المؤشّرُ startAfter يضيف مقارنةً على أوّل ترتيب', () => {
  const { sql, params } = buildSelect('c', [ob('n', 'asc'), sa(100), lim(2)]);
  assert.equal(
    sql,
    'SELECT id, data FROM kv_docs WHERE collection = ? AND ' +
      "COALESCE(json_extract(data, '$.n.__ts__'), json_extract(data, '$.n')) > ? " +
      "ORDER BY COALESCE(json_extract(data, '$.n.__ts__'), json_extract(data, '$.n')) ASC, id ASC " +
      'LIMIT 2'
  );
  assert.deepEqual(params, ['c', 100]);
});

test('★★ startAfter بلقطةٍ يبني مؤشّرًا مركّبًا (field, id) فلا يُسقط المتعادلين (#4)', () => {
  const snap = { id: 'b', get: (f) => (f === 'n' ? 2 : undefined) };
  const { sql, params } = buildSelect('c', [ob('n', 'asc'), sa(snap), lim(2)]);
  const nExpr = "COALESCE(json_extract(data, '$.n.__ts__'), json_extract(data, '$.n'))";
  assert.ok(sql.includes(`(${nExpr} > ? OR (${nExpr} = ? AND id > ?))`), sql);
  assert.deepEqual(params, ['c', 2, 2, 'b'], 'قيمةُ الحقل مرّتين ثمّ معرّفُ اللقطة');

  const byId = { id: 'b', get: () => undefined };
  const r = buildSelect('c', [ob(DOC_ID, 'asc'), sa(byId)]);
  assert.ok(r.sql.includes('id > ?'), r.sql);
  assert.deepEqual(r.params, ['c', 'b'], 'ترتيبٌ بالمعرّف ⟵ id > snap.id');
});

test('المؤشّرُ مع ترتيبٍ متعدّدِ الحقول يُرفَض بصوتٍ عالٍ لا يُقارَب (#4)', () => {
  assert.throws(() => buildSelect('c', [ob('a', 'asc'), ob('b', 'asc'), sa(1)]), /متعدّد الحقول/);
});

test('العدُّ يحترم الحدَّ ويُسقط الترتيب (#10)', () => {
  const { sql, params } = buildCount('documents', [w('kind', '==', 'SRI'), ob('x', 'asc'), lim(9)]);
  assert.equal(
    sql,
    'SELECT COUNT(*) AS n FROM (SELECT 1 FROM kv_docs WHERE collection = ? AND ' +
      "COALESCE(json_extract(data, '$.kind.__ts__'), json_extract(data, '$.kind')) = ? LIMIT 9)"
  );
  assert.deepEqual(params, ['documents', 'SRI']);
});

test('العدُّ بلا حدٍّ لا يلفّ بمجموعةٍ فرعيّة', () => {
  const { sql } = buildCount('documents', [w('kind', '==', 'SRI')]);
  assert.equal(
    sql,
    'SELECT COUNT(*) AS n FROM kv_docs WHERE collection = ? AND ' +
      "COALESCE(json_extract(data, '$.kind.__ts__'), json_extract(data, '$.kind')) = ?"
  );
});

test('★★ قائمةٌ فارغةٌ في IN لا تُنتج SQL معطوبًا', () => {
  assert.match(buildSelect('c', [w('x', 'in', [])]).sql, /AND 0 ORDER BY id ASC$/, 'in [] = لا شيء يطابق');
  assert.match(buildSelect('c', [w('x', 'not-in', [])]).sql, /AND 1 ORDER BY id ASC$/, 'not-in [] = الكلّ');
});
