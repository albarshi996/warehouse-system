/**
 * ظلُّ المخزن المحلّيّ — القارئُ يُغلق حلقةَ الكتابة: يُبرهَن أنّ ما كتبته الشريحتان
 * (القيد والخزينة) يُقرأ ويُشكَّل صحيحًا، وأنّه **للقراءة فقط** (لا يكتب حرفًا).
 *
 * مرّتين كأخواتها: (أ) مخزنُ ذاكرةٍ يعمل في كلّ بيئة، و(ب) SQLite حقيقيّة
 * (`node:sqlite`) — فالدلالةُ واحدةٌ على الجهاز. يُتخطّى (ب) بلا `node:sqlite`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLocalDb } from '../_db/localSqlite/localDb.js';
import { createSqlStore } from '../_db/localSqlite/sqlStore.js';
import { createLocalLedger } from './localLedgerStore.js';
import { createLocalTreasury } from './localTreasuryStore.js';
import { localShadowView, localLedgerView, localTreasuryView, balanceTone } from './localShadowView.js';

const NOW = () => 1_760_000_000_000;
const D1 = '2026-10-21';
const D2 = '2026-10-25';

const inv = (id, code, total, date = D1) => ({
  id, type: 'INV', number: `INV-${id}`, state: 'done',
  header: { customerCode: code, customer: 'بقالة النور', invoiceDate: date },
  lines: [{ qty: 1, unitPrice: total }],
});
const rcp = (id, code, amount, date = D2) => ({
  id, type: 'RCP', number: `RCP-${id}`, state: 'done',
  header: { customerCode: code, payer: 'بقالة النور', receiptDate: date },
  lines: [{ invoiceRef: `INV-${id}`, amount }],
});
const grn = (id, code, qty, cost, date = D1) => ({
  id, type: 'GRN', number: `GRN-${id}`, state: 'done',
  header: { supplierCode: code, supplier: 'مورّد عامّ', invoiceDate: date },
  lines: [{ qtyAccepted: qty, unitCost: cost }],
});
const spv = (id, code, amount, date = D2) => ({
  id, type: 'SPV', number: `SPV-${id}`, state: 'done',
  header: { supplierCode: code, paymentDate: date },
  lines: [{ amount }],
});

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

/** يبذر دفترًا وخزينةً على باب، ويُعيده (كاملَ دورةٍ + وردية مُسكَّرة بعجز). */
async function seed(db) {
  const L = createLocalLedger(db);
  const T = createLocalTreasury(db);
  await L.postDocuments([
    inv('10', 'C-1', 5000, D1),
    rcp('10b', 'C-1', 400, D2),
    grn('20', 'S-9', 3, 1000, D1),
    spv('21', 'S-9', 500, D2),
  ]);
  await T.open({ id: 'WS-1', shift: 'صباحيّة', openingBalance: 100000, openedBy: 'أحمد', openedAt: '2026-10-21T08:00' });
  await T.addMovement({ sessionId: 'WS-1', kind: 'customer_receipt', method: 'cash', amount: 50000, at: '2026-10-21T10:00' });
  await T.close('WS-1', { countedCash: 145000, reason: 'صرفٌ لم يُوثَّق', closedBy: 'أحمد' });
}

/* ═══════════════════ العرضُ الفارغ ═══════════════════ */

test('★★ ظلٌّ فارغٌ: لا قيودَ ولا ورديّات، وميزانٌ متوازنٌ صفرًا', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const v = await localShadowView(db);
  assert.equal(v.ledger.entryCount, 0);
  assert.equal(v.ledger.trialBalance.balanced, true, 'الفارغُ متوازن');
  assert.equal(v.ledger.trialBalance.rows.length, 0);
  assert.deepEqual(v.ledger.receivables, []);
  assert.deepEqual(v.ledger.payables, []);
  assert.equal(v.treasury.sessionCount, 0);
  assert.equal(v.treasury.totalVariance, 0);
});

/* ═══════════════════ العرضُ المبذور ═══════════════════ */

test('★★★ الدفترُ يُقرأ من المخزن: ميزانٌ متوازنٌ وأرصدةُ ذممٍ صحيحة', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  await seed(db);
  const { ledger } = await localShadowView(db);

  assert.equal(ledger.entryCount, 4);
  assert.equal(ledger.errorCount, 0, 'لا قيدَ مخزَّنٍ مرفوضٍ عند الرَّوز');
  assert.equal(ledger.trialBalance.balanced, true);

  // الأرصدةُ بالوحدة الكبرى (÷1000). الذمّةُ المدينةُ أصلٌ موجب، والدائنةُ سالبة.
  assert.deepEqual(ledger.receivables, [{ code: 'C-1', balance: 4600 }], 'فاتورة 5000 − قبض 400');
  assert.deepEqual(ledger.payables, [{ code: 'S-9', balance: -2500 }], 'استلام 3000 − سداد 500 نَدينها');
});

test('★★★ الخزينةُ تُقرأ من المخزن: وردية مُسكَّرةٌ بفرقٍ وبمجاميعها', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  await seed(db);
  const { treasury } = await localShadowView(db);

  assert.equal(treasury.sessionCount, 1);
  assert.deepEqual([treasury.openCount, treasury.closedCount], [0, 1]);
  assert.equal(treasury.totalVariance, -5, 'عجزُ 5000 (÷1000) على المُسكَّرة وحدَها');

  const r = treasury.rows[0];
  assert.equal(r.id, 'WS-1');
  assert.equal(r.state, 'closed');
  assert.equal(r.openingBalance, 100);
  assert.equal(r.expected, 150, '100 + 50 وارد نقديّ');
  assert.equal(r.counted, 145);
  assert.equal(r.variance, -5);
  assert.equal(r.byMethod.cash, 50);
});

test('★★ الوردية المفتوحةُ: معدودُها وفرقُها null ولا تدخل إجماليَّ الفروق', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  const T = createLocalTreasury(db);
  await T.open({ id: 'WS-2', openingBalance: 200000, openedAt: '2026-10-22T08:00' });
  await T.addMovement({ sessionId: 'WS-2', kind: 'cash_sale', method: 'cash', amount: 30000 });
  const treasury = await localTreasuryView(db); // يُعيد عرضَ الخزينة مباشرةً (لا مغلَّفًا)

  assert.deepEqual([treasury.openCount, treasury.closedCount], [1, 0]);
  assert.equal(treasury.totalVariance, 0, 'المفتوحةُ لا فرقَ لها بعد');
  const r = treasury.rows[0];
  assert.equal(r.state, 'open');
  assert.equal(r.counted, null);
  assert.equal(r.variance, null);
  assert.equal(r.expected, 230, '200 + 30');
});

/* ═══════════════════ للقراءة فقط — صفرُ كتابة ═══════════════════ */

test('★★★ الظلُّ للقراءة فقط: يعمل وإنْ كانت الكتابةُ تَرمي (لا يُستدعى setDoc/runTransaction)', async () => {
  const store = memStore();
  const db = createLocalDb({ store, now: NOW });
  await seed(db); // البذرُ يكتب
  // بعد البذر: أيُّ كتابةٍ ترمي — فإنْ لمس الظلُّ الكتابةَ لسقط.
  store.write = async () => {
    throw new Error('الظلُّ لا يكتب');
  };
  const v = await localShadowView(db);
  assert.equal(v.ledger.entryCount, 4, 'قرأ بلا كتابةٍ واحدة');
  assert.equal(v.treasury.sessionCount, 1);
  assert.equal(v.treasury.totalVariance, -5);
});

test('★ idempotent: قراءتان متتاليتان تُعطيان النتيجةَ نفسَها ولا تغيّران المخزن', async () => {
  const db = createLocalDb({ store: memStore(), now: NOW });
  await seed(db);
  const a = await localLedgerView(db);
  const b = await localLedgerView(db);
  assert.deepEqual(a, b);
  assert.equal(b.entryCount, 4, 'لم يتضاعف شيءٌ بالقراءة');
});

/* ═══════════════════ شارةُ التوازن — لا إنذارَ أحمرَ كاذب ═══════════════════ */

test('★★★ balanceTone يفصل «غيرُ معلوم» عن «مختلّ» — فلا يُظهر أحمرَ عند تعذّر القراءة', () => {
  // تحميلٌ (لم يَجهز) ⇒ غيرُ معلوم، لا أحمر.
  assert.equal(balanceTone(false, null), 'unknown', 'أثناء التحميل');
  // جَهز لكنِ القراءةُ تعذّرت (tb غائب) ⇒ غيرُ معلوم، **لا «مختلّ»** — وهو العطبُ المنقوض.
  assert.equal(balanceTone(true, null), 'unknown', 'تعذّرُ القراءة ليس اختلالًا');
  assert.equal(balanceTone(true, undefined), 'unknown');
  // دفترٌ متوازنٌ (ولو فارغًا) ⇒ أخضر.
  assert.equal(balanceTone(true, { balanced: true }), 'ok');
  // اختلالٌ فعليٌّ وحدَه ⇒ أحمر.
  assert.equal(balanceTone(true, { balanced: false }), 'bad');
});

/* ═══════════════════ البيّنةُ الحيّة على SQLite حقيقيّة ═══════════════════ */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // إصدارٌ بلا node:sqlite — يُتخطّى (يبقى على CI، Node 22+).
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

test('★★★ الظلُّ على SQLite حقيقيّة: دفترٌ متوازنٌ وخزينةٌ مُسكَّرةٌ تُقرآن من القرص', {
  skip: DatabaseSync ? false : 'node:sqlite غير متاح',
}, async () => {
  const db = createLocalDb({ store: createSqlStore(sqliteInvoke()), now: NOW });
  await seed(db);
  const v = await localShadowView(db);

  assert.equal(v.ledger.entryCount, 4);
  assert.equal(v.ledger.trialBalance.balanced, true);
  assert.deepEqual(v.ledger.receivables, [{ code: 'C-1', balance: 4600 }]);
  assert.deepEqual(v.ledger.payables, [{ code: 'S-9', balance: -2500 }]);

  assert.equal(v.treasury.closedCount, 1);
  assert.equal(v.treasury.totalVariance, -5);
  assert.equal(v.treasury.rows[0].expected, 150);
  assert.equal(v.treasury.rows[0].byMethod.cash, 50);
});
