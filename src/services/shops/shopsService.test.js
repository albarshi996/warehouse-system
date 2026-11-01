/**
 * سجلُّ المحلّات — الإنشاءُ والتفرّدُ بالمعرّف والسردُ والتفعيل.
 *
 * يُبرهَن مرّتين: (أ) مخزنٌ في الذاكرة، و(ب) SQLite حقيقيّة (`node:sqlite`) تنفّذ
 * نفسَ SQL الذي تولّده خلفيّةُ م١ — فالدلالةُ واحدةٌ على الجهاز كما في الذاكرة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { createShops, SHOPS_COLLECTION, normalizeShopCode } from './shopsService.js';

const NOW = () => 1_760_000_000_000;

/** مخزنٌ في الذاكرة يحقّق واجهةَ `store` التي يتوقّعها `createLocalDb`. */
function memStore() {
  const rows = new Map();
  const k = (c, i) => `${c}\u0000${i}`;
  return {
    async get(col, id) {
      return rows.get(k(col, id)) || null;
    },
    async query(col) {
      return [...rows.values()].filter((r) => r.col === col).map((r) => ({ id: r.id, data: r.data }));
    },
    async count(col) {
      return [...rows.values()].filter((r) => r.col === col).length;
    },
    async write(ops) {
      for (const o of ops) {
        if (o.op === 'delete') rows.delete(k(o.col, o.id));
        else rows.set(k(o.col, o.id), { col: o.col, id: o.id, data: o.data, updated_at: o.updatedAt });
      }
    },
  };
}

const shopsOn = (store) => createShops(createLocalDb({ store, now: NOW }));

test('التطبيعُ: مُشذَّبٌ كبيرُ الأحرف', () => {
  assert.equal(normalizeShopCode('  s1 '), 'S1');
  assert.equal(normalizeShopCode(''), '');
  assert.equal(normalizeShopCode(null), '');
});

test('إنشاءٌ وقراءةٌ وسرد', async () => {
  const S = shopsOn(memStore());
  const r = await S.create({ code: 'brshi', nameAr: 'محلّ البرشي' });
  assert.deepEqual([r.ok, r.id, r.created, r.skipped], [true, 'BRSHI', true, false]);

  const got = await S.get('BRSHI');
  assert.deepEqual(got, { code: 'BRSHI', nameAr: 'محلّ البرشي', active: true });
  // القراءةُ بالرمز غيرِ المطبَّع تصل إلى المعرّف نفسِه.
  assert.equal((await S.get(' brshi ')).code, 'BRSHI');

  await S.create({ code: 'S2', nameAr: 'محلّ ثانٍ' });
  const all = await S.list();
  assert.deepEqual(all.map((s) => s.code), ['BRSHI', 'S2']);
});

test('★★ تفرّدٌ بالمعرّف: الإعادةُ تُتخطّى ولا تدهس', async () => {
  const S = shopsOn(memStore());
  const a = await S.create({ code: 'S1', nameAr: 'الأوّل' });
  assert.equal(a.created, true);
  const b = await S.create({ code: 's1', nameAr: 'اسمٌ آخر' });
  assert.deepEqual([b.ok, b.created, b.skipped], [true, false, true]);
  assert.equal((await S.get('S1')).nameAr, 'الأوّل', 'بقي الاسمُ الأوّل — لا دهس');
  assert.equal((await S.list()).length, 1, 'محلٌّ واحدٌ لا اثنان');
});

test('تنادٍ متزامنٌ على المعرّف نفسِه: واحدٌ يُنشأ والآخرُ يقفز', async () => {
  const S = shopsOn(memStore());
  const [a, b] = await Promise.all([
    S.create({ code: 'X', nameAr: 'أ' }),
    S.create({ code: 'X', nameAr: 'ب' }),
  ]);
  assert.equal([a, b].filter((r) => r.created).length, 1);
  assert.equal([a, b].filter((r) => r.skipped).length, 1);
  assert.equal((await S.list()).length, 1);
});

test('رفضُ الرمز/الاسم الفارغ', async () => {
  const S = shopsOn(memStore());
  assert.equal((await S.create({ code: '', nameAr: 'x' })).reason, 'bad-code');
  assert.equal((await S.create({ code: 'S1', nameAr: '  ' })).reason, 'bad-name');
  assert.equal((await S.list()).length, 0);
});

test('التفعيلُ والتعطيل: المعطَّلُ يخرج من المبدّل', async () => {
  const S = shopsOn(memStore());
  await S.create({ code: 'S1', nameAr: 'أوّل' });
  await S.create({ code: 'S2', nameAr: 'ثانٍ' });
  const off = await S.setActive('S2', false);
  assert.equal(off.ok, true);
  assert.deepEqual((await S.listActive()).map((s) => s.code), ['S1']);
  assert.deepEqual((await S.list()).map((s) => s.code), ['S1', 'S2'], 'يبقى في السرد الكامل');
  assert.equal((await S.setActive('NOPE', true)).reason, 'not-found');
});

test('get لمحلٍّ غائبٍ يُعيد null', async () => {
  const S = shopsOn(memStore());
  assert.equal(await S.get('GHOST'), null);
  assert.equal(await S.get(''), null);
});

/* ═══════════════════ البيّنةُ الحيّة على SQLite حقيقيّة ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  /* إصدارٌ بلا node:sqlite — يُتخطّى (يبقى على CI، Node 22+) */
}

const MIGRATION = new URL('../../../src-tauri/migrations/001-kv-docs.sql', import.meta.url);

function sqliteInvoke() {
  const sq = new DatabaseSync(':memory:');
  sq.exec(readFileSync(MIGRATION, 'utf8'));
  return async (cmd, args) => {
    if (cmd === 'bhome_db_query') return sq.prepare(args.sql).all(...(args.params || []));
    if (cmd === 'bhome_db_exec') return sq.prepare(args.sql).run(...(args.params || [])).changes;
    if (cmd === 'bhome_db_batch') {
      sq.exec('BEGIN');
      try {
        for (const s of args.stmts) sq.prepare(s.sql).run(...(s.params || []));
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
      return undefined;
    }
    throw new Error(`أمرٌ مجهول: ${cmd}`);
  };
}

test('★★★ على SQLite حقيقيّة: إنشاءٌ · تفرّدٌ · سردٌ · تفعيل', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const S = createShops(createLocalDb({ store: createSqlStore(sqliteInvoke()), now: NOW }));
  await S.create({ code: 'RH', nameAr: 'الرحبة' });
  await S.create({ code: 'TR', nameAr: 'طرابلس' });
  assert.equal((await S.create({ code: 'rh', nameAr: 'مكرّر' })).skipped, true);
  assert.equal((await S.get('RH')).nameAr, 'الرحبة');
  assert.deepEqual((await S.list()).map((s) => s.code), ['RH', 'TR']);
  await S.setActive('TR', false);
  assert.deepEqual((await S.listActive()).map((s) => s.code), ['RH']);
  assert.equal(SHOPS_COLLECTION, 'shops');
});
