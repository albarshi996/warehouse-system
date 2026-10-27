/**
 * الخزينةُ المحلّيّة على المخزن — عقودُ §7، الكاتبُ الواحد، والبيّنةُ على SQLite.
 *
 * يُبرهَن مرّتين كأختها (دفترُ القيد): (أ) على مخزنٍ في الذاكرة يعمل في كلّ بيئة،
 * و(ب) على SQLite حقيقيّةٍ (`node:sqlite`) تنفّذ نفسَ SQL الذي تولّده خلفيّةُ م١
 * — فنُثبت أنّ الدلالةَ واحدةٌ على الجهاز كما في الذاكرة. يُتخطّى (ب) بلا `node:sqlite`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { createLocalTreasury, CASH_SESSIONS_COLLECTION } from './localTreasuryStore.js';

/* ═══════════════════ تجهيزاتٌ ═══════════════════ */

const NOW = () => 1_760_000_000_000;

const openInput = (over = {}) => ({
  id: 'WS-1',
  shift: 'صباحيّة',
  openingBalance: 100000,
  openedBy: 'أحمد',
  openedAt: '2026-10-21T08:00',
  ...over,
});
const mv = (over = {}) => ({
  sessionId: 'WS-1',
  kind: 'customer_receipt',
  method: 'cash',
  amount: 50000,
  at: '2026-10-21T10:00',
  ...over,
});

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

const treasuryOn = (store) => {
  const db = createLocalDb({ store, now: NOW });
  return { db, T: createLocalTreasury(db) };
};

/* ═══════════════════ الفتحُ idempotent ═══════════════════ */

test('★★ الفتحُ يخزّن ورديةً مفتوحة، والقفزُ لا الرفض على معرّفٍ قائم', async () => {
  const { db, T } = treasuryOn(memStore());

  const a = await T.open(openInput());
  assert.deepEqual([a.ok, a.created], [true, true]);

  // المعرّفُ نفسُه برصيدٍ مختلف: يُتخطّى، ولا يُكتب فوقَ الأوّل.
  const b = await T.open(openInput({ openingBalance: 999000 }));
  assert.deepEqual([b.ok, b.created], [true, false]);

  const snap = await db.getDoc(db.doc(db.db, CASH_SESSIONS_COLLECTION, 'WS-1'));
  assert.equal(snap.data().openingBalance, 100000, 'بقي رصيدُ الفتح الأوّل — لا كتابةَ فوقَه');
  assert.equal(snap.data().state, 'open');
});

test('★ فتحٌ بمعرّفٍ فارغٍ أو رصيدٍ سالبٍ/كسريٍّ يُرفض بسببٍ صريحٍ لا استثناء', async () => {
  const { T } = treasuryOn(memStore());
  assert.deepEqual(
    [(await T.open(openInput({ id: '' }))).ok, (await T.open(openInput({ id: '' }))).reason],
    [false, 'bad-session'],
  );
  assert.equal((await T.open(openInput({ openingBalance: -1 }))).reason, 'bad-session');
  assert.equal((await T.open(openInput({ openingBalance: 10.5 }))).reason, 'bad-session');
});

/* ═══════════════════ الحركاتُ ملحقةٌ-فقط ═══════════════════ */

test('★★★ الحركةُ تُرقَّم متسلسلةً (seq = أقصى + 1) ملحقةً-فقط', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());

  const r0 = await T.addMovement(mv({ kind: 'cash_sale', amount: 30000 }));
  const r1 = await T.addMovement(mv({ kind: 'expense', amount: 20000 }));
  assert.deepEqual([r0.ok, r0.seq, r0.posted], [true, 0, true]);
  assert.deepEqual([r1.ok, r1.seq, r1.posted], [true, 1, true]);

  const moves = await T.listMovements('WS-1');
  assert.equal(moves.length, 2);
  assert.deepEqual(moves.map((m) => m.seq), [0, 1], 'مرتّبةٌ تصاعديًّا بلا تصادم');
});

test('★★ حركةٌ مجهولةُ النوع/الوسيلة أو غيرُ موجبةٍ تُرفض — ولا تُخزَّن', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());
  assert.equal((await T.addMovement(mv({ kind: 'لا نوع' }))).reason, 'bad-movement');
  assert.equal((await T.addMovement(mv({ method: 'crypto' }))).reason, 'bad-movement');
  assert.equal((await T.addMovement(mv({ amount: 10.5 }))).reason, 'bad-movement');
  assert.equal((await T.addMovement(mv({ amount: -5 }))).reason, 'bad-movement');
  assert.equal((await T.listMovements('WS-1')).length, 0, 'لم تُخزَّن حركةٌ معطوبة');
});

test('★★ لا حركةَ على وردية غيرِ موجودةٍ أو مُسكَّرة', async () => {
  const { T } = treasuryOn(memStore());
  assert.equal((await T.addMovement(mv({ sessionId: 'لا شيء' }))).reason, 'not-found');

  await T.open(openInput());
  await T.close('WS-1', { countedCash: 100000 }); // تسكيرٌ مطابقٌ بلا حركات
  const r = await T.addMovement(mv());
  assert.equal(r.reason, 'not-open', 'الوردية المُسكَّرةُ لا تقبل حركةً');
});

/* ═══════════════════ التسكير ═══════════════════ */

test('★★ المتوقَّع = البداية + واردٌ نقديّ − صادرٌ نقديّ؛ والبطاقةُ/البنكُ خارجَ الدرج', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());
  await T.addMovement(mv({ kind: 'customer_receipt', method: 'cash', amount: 40000 }));
  await T.addMovement(mv({ kind: 'customer_receipt', method: 'card', amount: 25000 }));
  await T.addMovement(mv({ kind: 'customer_receipt', method: 'bank', amount: 15000 }));
  await T.addMovement(mv({ kind: 'expense', method: 'cash', amount: 10000 }));

  const sum = await T.summary('WS-1');
  assert.equal(sum.expectedCash, 130000, '100000 + 40000 − 10000 (البطاقة والبنك خارج الدرج)');
  assert.equal(sum.byMethod.card, 25000);
  assert.equal(sum.byMethod.bank, 15000);
});

test('★★★ الفرقُ يحتاج سببًا — ولا يتحوّل تلقائيًّا دَينًا على الموظّف', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());
  await T.addMovement(mv({ kind: 'customer_receipt', method: 'cash', amount: 50000 })); // متوقَّع 150000

  // عجزٌ 5000 بلا سبب → يُرفض.
  const bad = await T.close('WS-1', { countedCash: 145000 });
  assert.deepEqual([bad.ok, bad.reason], [false, 'bad-close']);
  // ولم يُغلَق: ما زالت مفتوحة.
  assert.equal((await T.getSession('WS-1')).state, 'open', 'الرفضُ لم يُغلق الورديةَ');

  // بسببٍ مكتوب → يُقبل، والفرقُ يُسجَّل لا يُحوَّل دَينًا.
  const ok = await T.close('WS-1', { countedCash: 145000, reason: 'صرفٌ لم يُوثَّق', closedBy: 'أحمد' });
  assert.deepEqual([ok.ok, ok.variance], [true, -5000], 'سالبٌ عجز');
  const closed = await T.getSession('WS-1');
  assert.equal(closed.state, 'closed');
  assert.equal(closed.closeReason, 'صرفٌ لم يُوثَّق');
  assert.equal(closed.variance, -5000);
});

test('★★★ الوردية المُسكَّرةُ نهائيّةٌ — لا إغلاقَ ثانٍ', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());
  const first = await T.close('WS-1', { countedCash: 100000 });
  assert.equal(first.ok, true);

  const second = await T.close('WS-1', { countedCash: 100000 });
  assert.deepEqual([second.ok, second.reason], [false, 'bad-close'], 'المحرّكُ يرفض تسكيرَ غيرِ المفتوحة');
});

test('★ تسكيرُ ورديةٍ غيرِ موجودةٍ يُعيد not-found بلا استثناء', async () => {
  const { T } = treasuryOn(memStore());
  assert.equal((await T.close('لا شيء', { countedCash: 0 })).reason, 'not-found');
});

/* ═══════════════════ الكاتبُ الواحد — التنادي المتزامن ═══════════════════ */

test('★★★ تنادٍ متزامنٌ على الإضافة: ترقيمٌ بلا تصادم (تسلسلُ الباب)', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());

  // بلا تسلسلٍ كان كلاهما يقرأ «أقصى = −1» فيكتبان seq 0 معًا (دهس)؛ بالتسلسل: 0 ثمّ 1.
  const [a, b, c] = await Promise.all([
    T.addMovement(mv({ amount: 1000 })),
    T.addMovement(mv({ amount: 2000 })),
    T.addMovement(mv({ amount: 3000 })),
  ]);
  assert.ok(a.ok && b.ok && c.ok);
  const seqs = [a.seq, b.seq, c.seq].sort((x, y) => x - y);
  assert.deepEqual(seqs, [0, 1, 2], 'تسلسلٌ فريدٌ بلا تصادم');

  const moves = await T.listMovements('WS-1');
  assert.equal(moves.length, 3, 'ثلاثُ حركاتٍ محفوظةٌ — لا دهسَ لإحداها');
  assert.deepEqual(moves.map((m) => m.amount).sort((x, y) => x - y), [1000, 2000, 3000]);
});

test('★★★ تنادٍ متزامنٌ على التسكير: إغلاقٌ واحدٌ فقط ينجح', async () => {
  const { T } = treasuryOn(memStore());
  await T.open(openInput());

  const [a, b] = await Promise.all([
    T.close('WS-1', { countedCash: 100000 }),
    T.close('WS-1', { countedCash: 100000 }),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1, 'إغلاقٌ واحدٌ ينجح — لا إغلاقان');
  assert.equal([a, b].filter((r) => !r.ok).length, 1, 'والآخرُ يُرفض');
});

// عقدُ «لا يرمي أبدًا» مفروضٌ على العمليّات المغيّرة الثلاث، ولكلّ مسارِ قراءةٍ
// (store.get في فحص الوردية، store.query في جمع الحركات): كلُّها تُعيد سببًا صريحًا.
const BUSY = () => {
  throw new Error('SQLITE_BUSY: database is locked');
};

test('★★ addMovement لا يرمي عند فشل store.get — يُعيد {ok:false,reason:store}', async () => {
  const store = memStore();
  const { T } = treasuryOn(store);
  await T.open(openInput());
  store.get = async () => BUSY();
  const r = await T.addMovement(mv());
  assert.deepEqual([r.ok, r.reason], [false, 'store'], 'الفشلُ سببٌ صريحٌ لا استثناءٌ إلى الشاشة');
});

test('★★ addMovement لا يرمي عند فشل store.query (جمعُ الحركات) — يُعيد store', async () => {
  const store = memStore();
  const { T } = treasuryOn(store);
  await T.open(openInput()); // يقرأ store.get بنجاح، ثمّ يفشل جمعُ الحركات
  store.query = async () => BUSY();
  const r = await T.addMovement(mv());
  assert.deepEqual([r.ok, r.reason], [false, 'store'], 'فشلُ القراءة الجماعيّة سببٌ صريحٌ لا استثناء');
});

test('★★ open لا يرمي عند فشل المخزن — يُعيد {ok:false,reason:store}', async () => {
  const store = memStore();
  const { T } = treasuryOn(store);
  store.get = async () => BUSY(); // tx.get داخلَ المعاملة يرمي
  const r = await T.open(openInput());
  assert.deepEqual([r.ok, r.reason], [false, 'store'], 'فشلُ الفتح سببٌ صريحٌ لا استثناء');
});

test('★★ close لا يرمي عند فشل قراءة المخزن — يُعيد {ok:false,reason:store}', async () => {
  const store = memStore();
  const { T } = treasuryOn(store);
  await T.open(openInput());
  store.get = async () => BUSY();
  const r = await T.close('WS-1', { countedCash: 100000 });
  assert.deepEqual([r.ok, r.reason], [false, 'store'], 'فشلُ التسكير سببٌ صريحٌ لا استثناء');
});

/* ═══════════════════ البيّنةُ الحيّة على SQLite حقيقيّة ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // إصدارٌ بلا node:sqlite — يُتخطّى (يبقى على CI، Node 22+).
}

const MIGRATION = new URL('../../../src-tauri/migrations/001-kv-docs.sql', import.meta.url);

/** جسرُ Tauri مزيّفٌ على SQLite حقيقيّةٍ في الذاكرة — نفسُ أوامر `db.rs`. */
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

test('★★★ دورةٌ كاملةٌ على SQLite حقيقيّة: فتحٌ · حركاتٌ · تسكيرٌ بفرقٍ · قفزُ الفتح', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const { T } = treasuryOn(createSqlStore(sqliteInvoke()));

  assert.equal((await T.open(openInput())).created, true);
  // قفزُ الفتح على إعادة التشغيل (المعرّفُ قائم).
  assert.equal((await T.open(openInput({ openingBalance: 7 }))).created, false);

  await T.addMovement(mv({ kind: 'customer_receipt', method: 'cash', amount: 50000 }));
  await T.addMovement(mv({ kind: 'cash_sale', method: 'cash', amount: 30000 }));
  await T.addMovement(mv({ kind: 'expense', method: 'cash', amount: 20000 }));
  await T.addMovement(mv({ kind: 'customer_receipt', method: 'card', amount: 25000 })); // خارجَ الدرج

  const sum = await T.summary('WS-1');
  assert.equal(sum.expectedCash, 160000, '100000 + 80000 − 20000');
  assert.equal(sum.byMethod.card, 25000);

  // تسكيرٌ بعجزٍ 10000 بسبب — يُخزَّن على القرص.
  const close = await T.close('WS-1', { countedCash: 150000, reason: 'نقصٌ مُعلَّل', closedBy: 'المدير' });
  assert.deepEqual([close.ok, close.variance], [true, -10000]);

  const saved = await T.getSession('WS-1');
  assert.equal(saved.state, 'closed');
  assert.equal(saved.variance, -10000);
  assert.equal(saved.countedCash, 150000);
  assert.equal((await T.listMovements('WS-1')).length, 4, 'أربعُ حركاتٍ على القرص، ملحقةٌ-فقط');

  // بعد التسكير: لا حركةَ ولا إغلاقَ ثانٍ.
  assert.equal((await T.addMovement(mv())).reason, 'not-open');
  assert.equal((await T.close('WS-1', { countedCash: 150000 })).reason, 'bad-close');
});

test('★★ عزلُ الورديّات على SQLite: حركاتُ كلِّ ورديةٍ لها وحدَها', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const { T } = treasuryOn(createSqlStore(sqliteInvoke()));
  await T.open(openInput({ id: 'WS-1' }));
  await T.open(openInput({ id: 'WS-2' }));
  await T.addMovement(mv({ sessionId: 'WS-1', amount: 11000 }));
  await T.addMovement(mv({ sessionId: 'WS-2', amount: 22000 }));
  await T.addMovement(mv({ sessionId: 'WS-2', amount: 33000 }));

  assert.equal((await T.listMovements('WS-1')).length, 1, 'ترشيحُ الوردية يصحّ على where الحقيقيّ');
  assert.equal((await T.listMovements('WS-2')).length, 2);
  assert.deepEqual((await T.listMovements('WS-2')).map((m) => m.seq), [0, 1], 'ترقيمٌ مستقلٌّ لكلّ وردية');

  assert.equal((await T.listSessions({ state: 'open' })).length, 2);
});
