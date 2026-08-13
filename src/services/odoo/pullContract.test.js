/**
 * عقد السحب — سجلّ النطاقات والمرآة المالية (SAP-16 · يسدّ ف‑٣٨ وف‑٣٩).
 *
 * حارسٌ للمستقبل لا توثيقٌ للحاضر. ثلاثة أخطارٍ يمنعها:
 *   1. **نطاقٌ يُضاف بلا اتّجاه** — أن يتسرّب حقلُ كتابةٍ إلى سجلّ السحب.
 *   2. **حشوٌ في المرآة** — أودو يعيد `[id, name]` و`false`، فمن رسمها كما هي
 *      كتب «[object Object]» في نظامٍ حاكم (وقع فعلًا 2026-08-13).
 *   3. **تسويةٌ صامتة** — قيدٌ مختلّ يُعرض متوازنًا، فيُخفى عطبٌ محاسبيّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PULL_SCOPES,
  PULL_SCOPE_IDS,
  scopeOf,
  scopesOfFamily,
  financeScopes,
  mirrorCollections,
  mirrorDocId,
  isPullDue,
  lastPullLabel,
  AUTO_PULL_MS,
  MIN_PULL_MS,
} from './pullRegistry.js';
import {
  relId,
  relName,
  num,
  str,
  moveKind,
  moveState,
  accountFromOdoo,
  moveFromOdoo,
  moveLineFromOdoo,
  paymentFromOdoo,
  moveBalance,
  linesByMove,
  partnerOpenBalances,
  accountTree,
} from './financeMapper.js';
import { READ_METHODS } from './directionGuard.js';
import { mockOdooClient } from './mockOdooClient.js';

/* ═══════════════════ 1. سجلّ السحب ═══════════════════ */

test('كلّ نطاقٍ مكتمل الشكل — ولا نطاقَ بلا نموذجٍ أو حقولٍ أو مفتاح', () => {
  assert.ok(PULL_SCOPE_IDS.length >= 5, 'السجلّ يجب أن يغطّي الأصناف والمالية');
  for (const id of PULL_SCOPE_IDS) {
    const s = PULL_SCOPES[id];
    assert.equal(s.id, id, `${id}: معرّفٌ غير مطابق`);
    assert.match(s.odooModel, /^[a-z_]+\.[a-z_.]+$/, `${id}: نموذج أودو غير صالح`);
    assert.ok(Array.isArray(s.fields) && s.fields.length, `${id}: بلا حقول`);
    assert.ok(s.key, `${id}: بلا مفتاح — السحب المتكرّر سيُضاعف`);
    assert.ok(s.labelAr, `${id}: بلا تسمية عربيّة`);
    assert.ok(['master', 'operations', 'finance'].includes(s.family), `${id}: فئة مجهولة`);
  }
});

test('★★ لا نطاقَ يطلب «كلّ الحقول» — الحقول تُسمّى صراحةً', () => {
  // كلّ حقلٍ زائد حمولةٌ على الشبكة وسطحُ تسريبٍ محتمل (§16.20 ‹803›).
  for (const id of PULL_SCOPE_IDS) {
    assert.ok(PULL_SCOPES[id].fields.length > 0, `${id}: قائمة حقولٍ فارغة تعني «الكلّ»`);
  }
});

test('★★ السحب قراءةٌ محضة — لا فعلَ كتابةٍ في السجلّ كلّه', () => {
  // حارس الاتّجاه: من أضاف نطاقًا بفعلٍ يكتب يُسقط الاختبار قبل النشر.
  const serialized = JSON.stringify(PULL_SCOPES);
  for (const forbidden of ['create', 'write', 'unlink', 'copy', 'button_', 'action_']) {
    assert.doesNotMatch(serialized, new RegExp(`"method"\\s*:\\s*"${forbidden}`), `النطاقات تحمل ${forbidden}`);
  }
  // والقراءة وحدها هي ما يعرفه الحارس.
  assert.ok(READ_METHODS.includes('search_read'), 'السحب يعتمد search_read');
});

test('النطاقات المالية أربعة، ولكلٍّ مرآةٌ مستقلّة', () => {
  const finance = financeScopes().map((s) => s.id);
  assert.deepEqual(finance, ['accounts', 'moves', 'moveLines', 'payments']);
  const mirrors = mirrorCollections();
  assert.equal(new Set(mirrors).size, mirrors.length, 'مجموعتان تتشاركان مرآةً — تضارب');
  assert.equal(scopeOf('items').mirror, null, 'الأصناف تهبط في نموذجٍ قائم لا مرآة');
});

test('scopeOf يرفض المجهول ولا يخترع نطاقًا', () => {
  assert.equal(scopeOf('لا-وجود-له'), null);
  assert.equal(scopeOf(''), null);
  assert.equal(scopeOf(undefined), null);
  assert.equal(scopesOfFamily('لا-فئة').length, 0);
});

test('★★ معرّف المرآة حتميّ — وإعادة السحب تكتب فوق نفسها ولا تُضاعف', () => {
  const rec = { code: '1101', name: 'الصندوق' };
  assert.equal(mirrorDocId('accounts', rec), mirrorDocId('accounts', rec));
  assert.equal(mirrorDocId('accounts', rec), '1101');
  // أودو يستعمل `/` في أرقام القيود، وFirestore يمنعها في المعرّف.
  assert.equal(mirrorDocId('moves', { name: 'INV/2026/0001' }), 'INV__2026__0001');
  // حقلٌ علاقيّ مفتاحًا: يُؤخذ المعرّف لا الاسم.
  assert.equal(mirrorDocId('moveLines', { id: 42 }), '42');
});

test('★★ سجلٌّ بلا مفتاحٍ صالح يُرفض ولا يُحفظ بمعرّفٍ عشوائيّ', () => {
  // سجلٌّ لا يُعرف أصله في أودو لا يصلح مرآةً، ووجوده يُوهم بتغطيةٍ لا وجود لها.
  for (const bad of [{}, { code: '' }, { code: '   ' }, { code: null }, { code: false }, null, undefined]) {
    assert.equal(mirrorDocId('accounts', bad), null, `«${JSON.stringify(bad)}» كان يجب أن يُرفض`);
  }
  assert.equal(mirrorDocId('نطاق-مجهول', { code: '1' }), null);
});

/* ═══════════════════ 2. الدوريّة ═══════════════════ */

test('السحب التلقائيّ يستحقّ عند أوّل مرّة وبعد الفترة', () => {
  assert.equal(isPullDue(null, 1_000_000), true, 'لم يُسحب قطّ ⇒ يستحقّ');
  assert.equal(isPullDue(1_000_000, 1_000_000 + AUTO_PULL_MS - 1), false);
  assert.equal(isPullDue(1_000_000, 1_000_000 + AUTO_PULL_MS), true);
});

test('★ فترةٌ أقصر من الحدّ تُرفع إليه — حارسٌ ضدّ مؤقّتٍ يُنهك الحصّة', () => {
  const now = 1_000_000;
  assert.equal(isPullDue(now, now + 1000, 100), false, '100ms يجب أن تُرفع إلى الحدّ');
  assert.equal(isPullDue(now, now + MIN_PULL_MS, 100), true);
  assert.equal(isPullDue(now, now + 1000, -5), false);
});

test('«آخر سحب» يقول الحقيقة — و«لم يُسحب بعد» ليست «الآن»', () => {
  const now = 10_000_000;
  assert.equal(lastPullLabel(null, now), 'لم يُسحب بعد');
  assert.equal(lastPullLabel(now, now), 'الآن');
  assert.equal(lastPullLabel(now - 60_000, now), 'قبل دقيقة');
  assert.equal(lastPullLabel(now - 120_000, now), 'قبل دقيقتين');
  assert.equal(lastPullLabel(now - 5 * 60_000, now), 'قبل 5 دقائق');
  assert.equal(lastPullLabel(now - 60 * 60_000, now), 'قبل ساعة');
  assert.equal(lastPullLabel(now - 25 * 3600_000, now), 'قبل يوم');
});

/* ═══════════════════ 3. شكل أودو ═══════════════════ */

test('★★ الحقول العلاقيّة تُفكَّك ولا تُطبع حشوًا', () => {
  assert.equal(relId([7, 'المورّد أ']), 7);
  assert.equal(relName([7, 'المورّد أ']), 'المورّد أ');
  assert.equal(relId(false), null);
  assert.equal(relName(false), '');
  for (const bad of [false, null, undefined, [], {}, 0]) {
    assert.doesNotMatch(relName(bad), /\[object/, `«${String(bad)}» أنتج حشوًا`);
  }
});

test('`false` في أودو فراغٌ لا كلمة، و`NaN` صفرٌ لا رقم', () => {
  assert.equal(str(false), '');
  assert.equal(str(null), '');
  assert.equal(str('  x  '), 'x');
  assert.equal(num(false), 0);
  assert.equal(num('لا-رقم'), 0);
  assert.equal(num('12.5'), 12.5);
});

/* ═══════════════════ 4. المطابقات المالية ═══════════════════ */

test('الفاتورة قيدٌ بنوعٍ مختلف — والتصنيف من move_type لا من مجموعةٍ ثانية', () => {
  assert.equal(moveKind('in_invoice').labelAr, 'فاتورة مورّد');
  assert.equal(moveKind('out_refund').labelAr, 'إشعار دائن عميل');
  assert.equal(moveKind('entry').side, 'general');
  assert.equal(moveKind('نوع-مجهول').id, 'entry', 'المجهول يسقط إلى قيدٍ عامّ لا إلى فراغ');
});

test('★★ «مرحَّل» و«ملغى» لا يتساويان — والملغى يبقى', () => {
  assert.equal(moveState('posted').posted, true);
  assert.equal(moveState('cancel').posted, false);
  assert.equal(moveState('cancel').labelAr, 'ملغى');
  assert.notEqual(moveState('cancel').id, moveState('draft').id);
});

test('حسابٌ من أودو — بلا اختراع كودٍ ولا تصنيف', () => {
  const a = accountFromOdoo({
    id: 3, code: '1101', name: 'الصندوق', account_type: 'asset_cash',
    reconcile: false, deprecated: false, company_id: [1, 'براندزو'], currency_id: false,
  });
  assert.equal(a.code, '1101');
  assert.equal(a.company, 'براندزو');
  assert.equal(a.currency, '', 'العملة الفارغة تبقى فارغة لا تُخترع');
  assert.equal(a.deprecated, false);
});

test('★★ قيدٌ كامل — والرصيد المفتوح مستوردٌ لا محسوب', () => {
  const m = moveFromOdoo({
    id: 9, name: 'INV/2026/0001', ref: false, move_type: 'in_invoice', state: 'posted',
    date: '2026-08-13', invoice_date: '2026-08-13', invoice_date_due: '2026-09-12',
    partner_id: [4, 'الريشة الذهبية'], journal_id: [2, 'المشتريات'], currency_id: [1, 'LYD'],
    amount_total: 14000, amount_residual: 4000, reversed_entry_id: false, invoice_origin: 'PO-2026-0009',
  });
  assert.equal(m.kindLabel, 'فاتورة مورّد');
  assert.equal(m.side, 'vendor');
  assert.equal(m.posted, true);
  assert.equal(m.total, 14000);
  assert.equal(m.residual, 4000);
  assert.equal(m.settled, 10000, 'المسدَّد = الإجمالي − المفتوح');
  assert.equal(m.origin, 'PO-2026-0009', 'أصل السلسلة يربط الفاتورة بالمستند التشغيليّ');
  assert.equal(m.reversedOf, '', 'لا قيدَ عكسيّ ⇒ فراغ لا حشو');
});

test('سطر حسابٍ — والرصيد يُشتقّ إن غاب ولا يُترك فارغًا', () => {
  const l = moveLineFromOdoo({
    id: 55, move_id: [9, 'INV/2026/0001'], account_id: [12, 'موردون'],
    partner_id: [4, 'الريشة الذهبية'], name: 'بضاعة', debit: 0, credit: 14000, balance: false,
  });
  assert.equal(l.moveNumber, 'INV/2026/0001');
  assert.equal(l.account, 'موردون');
  assert.equal(l.balance, -14000);
});

test('الدفعة: واردٌ تحصيل وصادرٌ دفع', () => {
  const p = paymentFromOdoo({ id: 3, name: 'PAY/001', payment_type: 'outbound', amount: 5000, partner_id: [4, 'الريشة'] });
  assert.equal(p.directionLabel, 'دفع لمورّد');
  assert.equal(p.amount, 5000);
  assert.equal(paymentFromOdoo({ payment_type: 'inbound' }).directionLabel, 'تحصيل من عميل');
});

/* ═══════════════════ 5. الرقابة ═══════════════════ */

test('★★ التوازن يُعلَن ولا يُسوّى — والفارق يظهر رقمًا', () => {
  const balanced = moveBalance([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }]);
  assert.equal(balanced.balanced, true);
  assert.equal(balanced.diff, 0);

  const broken = moveBalance([{ debit: 100, credit: 0 }, { debit: 0, credit: 97 }]);
  assert.equal(broken.balanced, false, 'قيدٌ مختلّ يجب ألّا يُعرض متوازنًا');
  assert.equal(broken.diff, 3, 'الفارق يظهر رقمًا لا تحذيرًا مبهمًا');

  assert.equal(moveBalance([]).balanced, true);
  assert.equal(moveBalance(null).lines, 0);
});

test('تجميع الأسطر بقيدها — لعرض الأثر المالي لمستندٍ واحد', () => {
  const map = linesByMove([
    { moveNumber: 'A', debit: 1, credit: 0 },
    { moveNumber: 'A', debit: 0, credit: 1 },
    { moveNumber: 'B', debit: 2, credit: 0 },
    { moveNumber: '', debit: 9, credit: 0 },
  ]);
  assert.equal(map.get('A').length, 2);
  assert.equal(map.get('B').length, 1);
  assert.equal(map.has(''), false, 'سطرٌ بلا قيدٍ لا يُنسب لأحد');
});

test('★★ أرصدة الأطراف: المرحَّل وحده يُحتسب — والمسوّدة لا تُنشئ التزامًا', () => {
  const rows = partnerOpenBalances([
    { posted: true, partner: 'الريشة', side: 'vendor', residual: 4000 },
    { posted: true, partner: 'الريشة', side: 'vendor', residual: 1000 },
    { posted: false, partner: 'الريشة', side: 'vendor', residual: 9999 }, // مسوّدة
    { posted: true, partner: 'فينسيا', side: 'customer', residual: 2000 },
    { posted: true, partner: '', side: 'vendor', residual: 500 }, // بلا طرف
  ]);
  const golden = rows.find((r) => r.partner === 'الريشة');
  assert.equal(golden.open, 5000, 'المسوّدة يجب ألّا تُحتسب');
  assert.equal(golden.vendor, 5000);
  assert.equal(golden.count, 2);
  assert.equal(rows.length, 2, 'قيدٌ بلا طرفٍ لا يُنشئ صفًّا');
  assert.equal(rows[0].partner, 'الريشة', 'الأكبر انكشافًا أوّلًا');
});

test('شجرة الحسابات تُبنى من هرميّة الكود لا من أبٍ مخترَع', () => {
  const tree = accountTree([
    { code: '1', name: 'الأصول' },
    { code: '11', name: 'النقد' },
    { code: '1101', name: 'الصندوق' },
    { code: '2', name: 'الالتزامات' },
    { code: '', name: 'بلا كود' },
  ]);
  const box = tree.find((a) => a.code === '1101');
  assert.equal(box.parentCode, '11', 'الأب الأطول بادئةً هو الأقرب');
  assert.equal(tree.find((a) => a.code === '1').parentCode, null);
  assert.equal(tree.find((a) => a.code === '2').parentCode, null);
  assert.equal(tree.length, 4, 'حسابٌ بلا كود يسقط — لا هويّة له');
});

/* ═══════════════════ 6. تكامل حقيقيّ مع المحاكي ═══════════════════ */

test('★★ كلّ نطاقٍ ماليّ يجد نموذجه في المحاكي ويُهضَم بلا حشو', async () => {
  // ليس اختبار شكلٍ بل رحلةٌ كاملة: النطاق → نموذج أودو → السحب → المطابق.
  // ما ينكسر بين السجلّ والمحاكي يظهر هنا لا في المتصفّح.
  const MAP = { accounts: accountFromOdoo, moves: moveFromOdoo, moveLines: moveLineFromOdoo, payments: paymentFromOdoo };
  for (const scope of financeScopes()) {
    const rows = await mockOdooClient.searchRead(scope.odooModel, scope.domain ?? [], scope.fields);
    assert.ok(Array.isArray(rows) && rows.length > 0, `${scope.labelAr}: المحاكي لا يعطي شيئًا من ${scope.odooModel}`);
    for (const rec of rows) {
      assert.ok(mirrorDocId(scope.id, rec), `${scope.labelAr}: سجلٌّ بلا مفتاحٍ صالح`);
      const mapped = MAP[scope.id](rec);
      for (const [key, value] of Object.entries(mapped)) {
        if (typeof value === 'string') {
          assert.doesNotMatch(value, /\[object|undefined|NaN/, `${scope.labelAr}.${key} يحمل حشوًا`);
        }
        if (typeof value === 'number') {
          assert.ok(Number.isFinite(value), `${scope.labelAr}.${key} ليس رقمًا محدودًا`);
        }
      }
    }
  }
});

test('★★ قيود المحاكي متوازنة — والمرآة تُظهر الرصيد المفتوح كما هو', async () => {
  const lineRows = await mockOdooClient.searchRead('account.move.line', [], PULL_SCOPES.moveLines.fields);
  const lines = lineRows.map(moveLineFromOdoo);
  for (const [number, group] of linesByMove(lines)) {
    const b = moveBalance(group);
    assert.equal(b.balanced, true, `القيد ${number} غير متوازن بفارق ${b.diff}`);
  }

  const moveRows = await mockOdooClient.searchRead('account.move', [], PULL_SCOPES.moves.fields);
  const moves = moveRows.map(moveFromOdoo);
  const bill = moves.find((m) => m.number === 'BILL/2026/0001');
  assert.equal(bill.side, 'vendor');
  assert.equal(bill.residual, 4000, 'الرصيد المفتوح مستوردٌ لا محسوب');
  assert.equal(bill.origin, 'PO-2026-0009', 'أصل السلسلة يربط الفاتورة بأمر الشراء');

  // المسوّدة لا تُنشئ التزامًا على الطرف.
  const balances = partnerOpenBalances(moves);
  const golden = balances.find((r) => r.partner === 'شركة الريشة الذهبية');
  assert.equal(golden.open, 4000, 'إشعار الدائن المسوّدة يجب ألّا يُحتسب');
});

test('★ شجرة حسابات المحاكي تتشجّر بكودها', async () => {
  const rows = await mockOdooClient.searchRead('account.account', [], PULL_SCOPES.accounts.fields);
  const tree = accountTree(rows.map(accountFromOdoo));
  assert.ok(tree.length >= 10);
  assert.ok(tree.every((a) => a.code), 'كلّ حسابٍ بكود');
  assert.ok(tree.some((a) => a.accountType === 'liability_payable'), 'الموردون موجودون');
});
