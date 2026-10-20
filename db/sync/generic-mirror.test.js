/**
 * بيّنةُ المرآة العامّة — «كلُّ ما يُحفظ في قوقل موجودٌ في سيرفر الجهاز».
 *
 * ★★★ وأهمُّ ما يُحرَس هنا: **لا حقلَ يسقط**. فالجدولُ العامُّ لا يسمّي
 *     أعمدةً، ومعنى ذلك أنّ خطأً في «ما يُستهلَك» لا يُنتج رسالةً بل
 *     **مستندًا ناقصًا في المرآة** — ولا يُكتشف إلّا حين يُقرأ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genericMapFor, buildUpsert, MAPS } from './pg-maps.js';

const rowOf = (over = {}) => ({
  __id: 'A1',
  name: 'طبلية',
  qty: 7,
  nested: { a: [1, 2], b: null },
  updatedAt: '2026-10-19T22:00:00.000Z',
  ...over,
});

test('★★★ لا حقلَ يسقط: كلُّ ما عدا المعرّف يصل `data` كما هو', () => {
  const { sql } = buildUpsert(genericMapFor('assets', 'updatedAt'), [rowOf()]);
  const payload = JSON.parse(sql.match(/'(\{.*?\})'::jsonb/s)[1].replace(/''/g, "'"));

  assert.equal(payload.name, 'طبلية');
  assert.equal(payload.qty, 7);
  assert.deepEqual(payload.nested, { a: [1, 2], b: null });
  // ★ وحقلُ الختم يبقى في المحتوى أيضًا — المرآةُ نسخةٌ لا تلخيص.
  assert.equal(payload.updatedAt, '2026-10-19T22:00:00.000Z');
  assert.equal('__id' in payload, false, 'المعرّفُ مفتاحٌ لا محتوى');
});

test('يكتب في `mirror_docs` بمفتاحٍ مركّبٍ من المسار والمعرّف', () => {
  const { sql, count } = buildUpsert(genericMapFor('recipes', null), [rowOf()]);
  assert.equal(count, 1);
  assert.match(sql, /INSERT INTO mirror_docs \(path, doc_id, updated_at, synced_at, data\)/);
  assert.match(sql, /ON CONFLICT \(path, doc_id\) DO UPDATE SET/);
  assert.match(sql, /'recipes'/);
  assert.match(sql, /'A1'/);
});

test('★★ ختمُ التعديل يُقرأ من حقل المسار نفسِه لا من اسمٍ مفروض', () => {
  // مسارٌ يختم بـ`createdAt` لا بـ`updatedAt`.
  const row = { __id: 'B2', createdAt: '2026-01-02T03:04:05.000Z' };
  const withField = buildUpsert(genericMapFor('portal_visits', 'createdAt'), [row]).sql;
  assert.match(withField, /2026-01-02/, 'الختمُ المعروفُ يُكتب');

  // ومسارٌ بلا ختمٍ معروف ⇒ `NULL` صريحةٌ لا تاريخٌ مخترع.
  const noField = buildUpsert(genericMapFor('portal_visits', null), [row]).sql;
  assert.match(noField, /, NULL, now\(\)/, 'بلا ختمٍ ⇒ NULL لا now()');
});

test('★★★ نقض: اسمُ ختمٍ خاطئٌ لا يخترع وقتًا — يُترك عدمًا', () => {
  const sql = buildUpsert(genericMapFor('assets', 'لا_وجودَ_له'), [rowOf()]).sql;
  assert.match(sql, /, NULL, now\(\)/);
});

test('★★ والاقتباسُ في المحتوى لا يكسر الجملة', () => {
  const sql = buildUpsert(genericMapFor('assets', null), [
    rowOf({ name: "طبلية 'مكسورة' \\ مائلة" }),
  ]).sql;
  // لا اقتباسَ مفردٌ غيرُ مضاعفٍ داخل النصّ المبنيّ.
  const body = sql.slice(sql.indexOf('VALUES'));
  assert.equal(body.includes("''"), true, 'الاقتباسُ مضاعَفٌ لا مهرَّب');
});

test('★★★ والعامّةُ لا تمسّ الجداولَ المفصَّلة — النواةُ تبقى محروسةً بقيودها', () => {
  // `items` و`documents` لهما قيودُ تفرّدٍ أمسكت عطبًا حيًّا؛ فلا تُستبدل.
  const typed = MAPS.map((m) => m.path);
  assert.ok(typed.includes('Items_Master'));
  assert.ok(typed.includes('documents'));
  for (const p of typed) {
    assert.notEqual(genericMapFor(p, null).table, 'items');
    assert.notEqual(genericMapFor(p, null).table, 'documents');
  }
});

test('★★ وعمودُ الفائض الافتراضيُّ `extra` لم يتغيّر للمنمذَجة', () => {
  const items = MAPS.find((m) => m.path === 'Items_Master');
  const { sql } = buildUpsert(items, [{ __id: 'X', sku: 'S1', weird: 1 }]);
  assert.match(sql, /, extra\)/, 'الجداولُ المفصَّلةُ تبقى على `extra`');
  assert.equal(/, data\)/.test(sql), false);
});
