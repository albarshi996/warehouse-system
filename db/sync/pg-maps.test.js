/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ خريطةِ الأعمدة — أوّلُ اختبارٍ لها منذ كُتبت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ صارت الخريطةُ مشتركةً بين المستوردِ (شهريًّا) والمزامنةِ (كلَّ دقيقتين)،
 *   فعطبٌ فيها يُضاعَف. وثلاثةُ أشياءَ تُحرَس هنا لأنّ فشلَها صامت:
 *   الاقتباسُ العربيُّ والمفردُ · وإسقاطُ الكتابةِ الفارغة · و`extra` الذي
 *   يمنع ضياعَ حقلٍ لم نخطّط له.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MAPS, mapForPath, buildUpsert, lit, ts, jsonb, arr } from './pg-maps.js';

test('الاقتباسُ المفردُ يُضاعَف — وإلّا صار كلُّ اسمٍ فيه فاصلةٌ عليا حقنًا', () => {
  assert.equal(lit("O'Brien"), "'O''Brien'");
  assert.equal(lit('صنفٌ عاديّ'), "'صنفٌ عاديّ'");
  // ومحاولةُ إنهاءِ العبارة تُبطَل.
  assert.equal(lit("'; DROP TABLE items; --"), "'''; DROP TABLE items; --'");
});

test('الطابعُ الزمنيّ يقبل شكلَ النسخة وشكلَ النصّ، ويرفض الفراغ', () => {
  assert.equal(
    ts({ __type: 'timestamp', iso: '2026-09-01T10:00:00.000Z' }),
    "'2026-09-01T10:00:00.000Z'::timestamptz"
  );
  assert.equal(ts(''), 'NULL');
  assert.equal(ts(null), 'NULL');
  assert.equal(ts('ليس تاريخًا'), 'NULL');
});

test('المصفوفةُ الفارغةُ تُكتب `{}` لا NULL — العمودُ NOT NULL', () => {
  assert.equal(arr([]), "'{}'::text[]");
  assert.equal(arr(['123', '456']), "ARRAY['123','456']::text[]");
  assert.equal(jsonb(undefined), "'null'::jsonb");
});

test('★★ كلُّ حقلٍ لم يُخطَّط له يذهب إلى `extra` ويُعلَن — لا يُرمى صامتًا', () => {
  const map = mapForPath('documents');
  const built = buildUpsert(map, [
    {
      __id: 'DOC-1',
      type: 'GRN',
      number: 'GRN-2026-0001',
      state: 'posted',
      // ★ حقولُ الحجز — في سبعةِ مستنداتٍ فقط، ولا عمودَ لها.
      soAllocation: { x: 1 },
      soShortfall: 3,
    },
  ]);

  assert.equal(built.count, 1);
  assert.deepEqual(built.extra.sort(), ['soAllocation', 'soShortfall']);
  assert.match(built.sql, /INSERT INTO documents/);
  assert.match(built.sql, /soAllocation/, 'المحتوى المهمَل يجب أن يظهر في extra');
});

test('★★★ `ON CONFLICT DO UPDATE` مشروطٌ بوجود اختلاف — وإلّا دهس ختمَ المرآة', () => {
  const built = buildUpsert(mapForPath('Items_Master'), [{ __id: 'A1', sku: 'A1', nameAr: 'صنف' }]);

  assert.match(built.sql, /ON CONFLICT \(sku\) DO UPDATE SET/);
  assert.match(
    built.sql,
    /WHERE \(items\..+\) IS DISTINCT FROM \(EXCLUDED\..+\);$/s,
    'بلا هذا الشرط تُعاد كتابةُ الصفّ كلَّ دورةٍ فيُطلق مشغّلُ set_updated_at'
  );
  assert.ok(!built.sql.includes('sku = EXCLUDED.sku'), 'مفتاحُ التعارض لا يُحدَّث');
});

test('صفوفٌ صفرٌ ⇒ لا SQL — دورةٌ بلا تغييرٍ لا تلمس القاعدة', () => {
  const built = buildUpsert(mapForPath('users'), []);
  assert.equal(built.sql, '');
  assert.equal(built.count, 0);
});

test('كلُّ خريطةٍ مكتملةُ الشكل، ومفتاحُ تعارضها من أعمدتها', () => {
  for (const map of MAPS) {
    assert.ok(map.table && map.path && map.conflict, `${map.table}: حقلٌ ناقص`);
    for (const key of map.conflict.split(',').map((s) => s.trim())) {
      assert.ok(map.cols[key], `${map.table}: مفتاحُ التعارض «${key}» ليس عمودًا`);
    }
    // ولا عمودَ يُبنى من حقلٍ غيرِ مُعلَنٍ في `consumed` — وإلّا تسرّب إلى extra أيضًا.
    assert.ok(map.consumed.length > 0, `${map.table}: consumed فارغة`);
  }
});

test('المسارُ غيرُ المنمذَجِ يُعيد null — وعليه تتوقّف المزامنةُ عن قراءته', () => {
  assert.equal(mapForPath('portal_visits'), null);
  assert.equal(mapForPath('documents/audit'), null);
  assert.ok(mapForPath('Items_Master'));
});
