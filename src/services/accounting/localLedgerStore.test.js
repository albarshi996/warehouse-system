/**
 * دفترُ القيد المحليّ — العقودُ الأربعةُ، الكاتبُ الواحد، والبيّنةُ على SQLite.
 *
 * يُبرهَن مرّتين: (أ) على مخزنٍ في الذاكرة يعمل في كلّ بيئة، و(ب) على SQLite
 * حقيقيّةٍ (`node:sqlite`) تنفّذ نفسَ SQL الذي تولّده خلفيّةُ م١ — فنُثبت أنّ
 * الدلالةَ واحدةٌ على الجهاز كما في الذاكرة. يُتخطّى (ب) على Node بلا `node:sqlite`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { createLocalLedger, JOURNAL_COLLECTION } from './localLedgerStore.js';
import { LEDGER_T0 } from './journal.js';

/* ═══════════════════ تجهيزاتٌ ═══════════════════ */

const NOW = () => 1_760_000_000_000;
const D1 = '2026-10-21';
const D2 = '2026-10-25';
const PRE = '2026-10-05'; // قبل T0

const inv = (id, code, total, date, state = 'done') => ({
  id, type: 'INV', number: `INV-${id}`, state,
  header: { customerCode: code, customer: 'بقالة النور', invoiceDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount, date, state = 'done') => ({
  id, type: 'RCP', number: `RCP-${id}`, state,
  header: { customerCode: code, payer: 'بقالة النور', receiptDate: date },
  lines: [{ invoiceRef: `INV-${id}`, amount }],
});
const grn = (id, code, qty, cost, date, state = 'done') => ({
  id, type: 'GRN', number: `GRN-${id}`, state,
  header: { supplierCode: code, supplier: 'مورّد عامّ', invoiceDate: date },
  lines: [{ qtyAccepted: qty, unitCost: cost }],
});
const spv = (id, code, amount, date, state = 'done') => ({
  id, type: 'SPV', number: `SPV-${id}`, state,
  header: { supplierCode: code, paymentDate: date },
  lines: [{ amount }],
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

const ledgerOn = (store) => {
  const db = createLocalDb({ store, now: NOW });
  return { db, L: createLocalLedger(db) };
};

/* ═══════════════════ العقدُ والدورة ═══════════════════ */

test('★★★ الدورةُ الكاملةُ تُخزَّن وتُقرأ، والأرصدةُ تطابق دفترَ الذمم', async () => {
  const { L } = ledgerOn(memStore());
  const sum = await L.postDocuments([
    inv('10', 'C-1', 5000, D1),
    rcp('10b', 'C-1', 400, D2), // معرّفٌ مستقلٌّ كي لا يصطدم مفتاحُه بالفاتورة
    grn('20', 'S-9', 3, 1000, D1),
    spv('21', 'S-9', 500, D2),
  ]);
  assert.equal(sum.posted, 4);
  assert.equal(sum.failed, 0);

  const Lg = await L.buildLedger();
  assert.equal(Lg.errors.length, 0, JSON.stringify(Lg.errors));
  assert.equal(Lg.balanceOf('AR:C-1'), 4600000, 'فاتورة 5000 − قبض 400 = 4600 (×1000)، وذمّةُ العميل أصلٌ مدين');
  // AP التزامٌ طبيعتُه دائنة، و`balanceOf` = مدين − دائن، فالرصيدُ سالبٌ بقيمة ما نَدينه.
  assert.equal(Lg.balanceOf('AP:S-9'), -2500000, 'استلام 3000 − سداد 500 = 2500 نَدينها (رصيدٌ دائن)');
  // ميزانُ المراجعة يُطبق إلى الصفر (مجموعُ كلّ الأرصدة صفر).
  const all = [...Lg.entries.flatMap((e) => e.lines)].reduce((s, l) => s + l.debit - l.credit, 0);
  assert.equal(all, 0, 'الدفترُ متوازن');
});

test('★★ ② مفتاحٌ فريد: الإلحاقُ ذرّيٌّ والقفزُ لا الرفض ولا الكتابةُ فوقَه', async () => {
  const { db, L } = ledgerOn(memStore());

  const first = await L.postJournal({
    key: 'K-1', date: D1, memo: 'أوّل',
    lines: [{ account: 'CASH', debit: 1000 }, { account: 'AR', party: 'C-1', credit: 1000 }],
  });
  assert.deepEqual([first.ok, first.posted, first.skipped], [true, true, false]);

  // المفتاحُ نفسُه بمبلغٍ مختلفٍ: يُتخطّى، ولا يُكتب فوقَ الأوّل.
  const again = await L.postJournal({
    key: 'K-1', date: D1, memo: 'ثانٍ مختلف',
    lines: [{ account: 'CASH', debit: 9999 }, { account: 'AR', party: 'C-1', credit: 9999 }],
  });
  assert.deepEqual([again.ok, again.posted, again.skipped], [true, false, true]);

  const snap = await db.getDoc(db.doc(db.db, JOURNAL_COLLECTION, 'K-1'));
  assert.equal(snap.data().amount, 1000, 'بقي القيدُ الأوّل — ملحقٌ-فقط لا كتابةَ فوقَه');
  assert.equal((await L.readEntries()).length, 1, 'قيدٌ واحدٌ لا قيدان');
});

test('★★ الإدخالُ مرّتين (idempotent): postDocuments على الدفعة نفسها لا يُضاعف', async () => {
  const { L } = ledgerOn(memStore());
  const docs = [inv('10', 'C-1', 5000, D1), grn('20', 'S-9', 3, 1000, D1)];
  const a = await L.postDocuments(docs);
  const b = await L.postDocuments(docs);
  assert.equal(a.posted, 2);
  assert.equal(b.posted, 0);
  assert.equal(b.skipped, 2);
  assert.equal((await L.readEntries()).length, 2);
});

test('★★★ ④ فترةٌ مقفلة: ما قبل T0 لا يُخزَّن (مُغذًّى ومباشرًا)', async () => {
  const { L } = ledgerOn(memStore());
  // عبر المُغذّي: مستندٌ قبل T0 يُسقط بهدوء.
  const sum = await L.postDocuments([inv('99', 'C-9', 800, PRE), inv('10', 'C-1', 5000, D1)]);
  assert.equal(sum.posted, 1, 'المستندُ ما بعد T0 وحده');

  // مباشرةً: قيدٌ قبل T0 يُرفض بسببٍ صريحٍ ولا يُخزَّن.
  const r = await L.postJournal({
    key: 'OLD', date: PRE,
    lines: [{ account: 'CASH', debit: 500 }, { account: 'AR', party: 'C-1', credit: 500 }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-entry');
  assert.match(r.message, new RegExp(LEDGER_T0));
  assert.equal((await L.readEntries()).length, 1, 'لم يُخزَّن قيدُ ما قبل T0');
});

test('★★ ① غيرُ المتوازن يُرفض بلا تخزين', async () => {
  const { L } = ledgerOn(memStore());
  const r = await L.postJournal({
    key: 'BAD', date: D1,
    lines: [{ account: 'CASH', debit: 1000 }, { account: 'AR', party: 'C-1', credit: 900 }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-entry');
  assert.equal((await L.readEntries()).length, 0);
});

test('★★★ ③ تصحيحٌ بعكسٍ لا حذف: الأصلُ يبقى، والأثرُ يصير صفرًا', async () => {
  const { L } = ledgerOn(memStore());
  await L.postDocuments([inv('10', 'C-1', 5000, D1)]);
  assert.equal((await L.buildLedger()).balanceOf('AR:C-1'), 5000000);

  // المفتاحُ حتميٌّ من المستند (`TYPE__id`)، فالعكسُ يكون بمفتاح القيد لا بمعرّف المستند.
  const rev = await L.reverse('INV__10', { reason: 'إلغاءُ فاتورةٍ خاطئة' });
  assert.equal(rev.ok, true);

  const entries = await L.readEntries();
  assert.equal(entries.length, 2, 'الأصلُ + العكس — لا حذف');
  assert.ok(entries.some((e) => e.key === 'INV__10') && entries.some((e) => e.key === 'INV__10~REV'));
  assert.equal((await L.buildLedger()).balanceOf('AR:C-1'), 0, 'العكسُ ألغى الأثر');

  // إعادةُ العكس تُتخطّى (مفتاحٌ قائم)، وعكسُ مجهولٍ يُعيد not-found.
  assert.equal((await L.reverse('INV__10', {})).skipped, true);
  assert.equal((await L.reverse('NOPE', {})).reason, 'not-found');
});

test('★★★ الكاتبُ الواحد يرحّل النهائيَّ وحدَه — لا «معتمَد» المتقلّب', async () => {
  const { L } = ledgerOn(memStore());
  // معتمَدٌ/مُرسَلٌ/مسوّدة: لا يُرحَّل أيٌّ منها (درسُ ledgerSync).
  const none = await L.postDocuments([
    inv('a', 'C-1', 5000, D1, 'approved'),
    inv('b', 'C-1', 5000, D1, 'submitted'),
    rcp('c', 'C-1', 400, D2, 'draft'),
  ]);
  assert.equal(none.posted, 0, 'لا ترحيلَ من حالةٍ متقلّبة');

  // منجَزٌ/مغلق: يُرحَّلان.
  const fin = await L.postDocuments([inv('a', 'C-1', 5000, D1, 'done'), spv('d', 'S-9', 500, D2, 'closed')]);
  assert.equal(fin.posted, 2);
});

test('★★★ تنادٍ متزامنٌ على المفتاح نفسِه: الأوّلُ لا يُدهَس (تسلسلُ الباب)', async () => {
  const { L } = ledgerOn(memStore());
  const mk = (amt) => ({
    key: 'INV__X', date: D1,
    lines: [{ account: 'CASH', debit: amt }, { account: 'AR', party: 'C-1', credit: amt }],
  });
  // بلا تسلسلٍ كان كلاهما يقرأ «غيرُ موجود» فيدهس الثاني الأوّل؛ بالتسلسل: واحدٌ يُرحَّل والآخرُ يقفز.
  const [a, b] = await Promise.all([L.postJournal(mk(5000)), L.postJournal(mk(9999))]);
  assert.equal([a, b].filter((r) => r.posted).length, 1, 'واحدٌ رُحّل');
  assert.equal([a, b].filter((r) => r.skipped).length, 1, 'والآخرُ قفز — لا دهس');
  const entries = await L.readEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 5000, 'بقي الأوّلُ لا الثاني');
});

test('★★ reverse لا يرمي عند فشل قراءة المخزن — يُعيد {ok:false,reason:store}', async () => {
  const store = memStore();
  const { L } = ledgerOn(store);
  await L.postDocuments([inv('10', 'C-1', 5000, D1)]);
  store.get = async () => {
    throw new Error('SQLITE_BUSY: database is locked');
  };
  const r = await L.reverse('INV__10', {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'store', 'الفشلُ سببٌ صريحٌ لا استثناءٌ إلى الشاشة');
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

test('★★★ دورةٌ كاملةٌ على SQLite حقيقيّة: ترحيل · قفز · عكس · أرصدة', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const { L } = ledgerOn(createSqlStore(sqliteInvoke()));

  const a = await L.postDocuments([
    inv('10', 'C-1', 5000, D1),
    rcp('10b', 'C-1', 400, D2),
    grn('20', 'S-9', 3, 1000, D1),
    spv('21', 'S-9', 500, D2),
    inv('99', 'C-9', 800, PRE), // قبل T0 — يُسقط
  ]);
  assert.equal(a.posted, 4);

  // القفزُ على إعادة التشغيل (المفاتيحُ حتميّةٌ من المستند).
  const b = await L.postDocuments([inv('10', 'C-1', 5000, D1)]);
  assert.equal(b.skipped, 1);

  // الأرصدةُ من SQLite نفسِها (AP رصيدٌ دائنٌ فسالب).
  const Lg = await L.buildLedger();
  assert.equal(Lg.balanceOf('AR:C-1'), 4600000);
  assert.equal(Lg.balanceOf('AP:S-9'), -2500000);

  // عكسٌ ملحقٌ للاستلام، والأصلُ باقٍ على القرص؛ يبقى أثرُ السداد وحدَه (+500k مدين).
  await L.reverse('GRN__20', { reason: 'رفضُ استلام' });
  assert.equal((await L.readEntries()).length, 5, 'أربعةٌ + عكسٌ واحد');
  assert.equal((await L.buildLedger()).balanceOf('AP:S-9'), 500000, 'زال أثرُ الاستلام، بقي السداد');
});
