/**
 * اختباراتُ بطاقات حركة مخزن فينسيا — صرفًا وإدخالًا.
 *
 * وأثقلُها ما يحرس **الرصيد**: صرفُ ما لا يُملَك · بندٌ مكرَّرٌ يُحرَّك
 * مرّتين · بطاقةٌ مثبَّتةٌ تُلغى بعد خروج البضاعة · ومسودّةٌ تُحتسب حركةً.
 * كلُّها أخطاءٌ لا تشتكي إن مرّت — يبدو السندُ سليمًا ويخرج الرصيدُ غلطًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CARD_KINDS,
  CARD_STATES,
  canTransitionCard,
  cardEffectText,
  cardKind,
  cardKindLabel,
  cardNoteLine,
  cardStateLabel,
  cardTotals,
  cardVerdict,
  cardsSnapshot,
  filterCards,
  isCardKind,
  lineAssetKey,
  movementByAsset,
  normalizeCardLine,
  oppositeKind,
  qtyAfterCard,
} from './veneciaCards.js';

/** جردٌ مصغَّرٌ مفهرسٌ كما تمرّره الشاشة. */
const INDEX = new Map([
  ['issue-BRZ-0001', { docId: 'issue-BRZ-0001', id: 'BRZ-0001', population: 'issue', assetName: 'خشب باركي', qty: 120 }],
  ['issue-BRZ-0002', { docId: 'issue-BRZ-0002', id: 'BRZ-0002', population: 'issue', assetName: 'رول أرضية', qty: 1 }],
  ['supported-BRZ-0001', { docId: 'supported-BRZ-0001', id: 'BRZ-0001', population: 'supported', assetName: 'ثلاجة تجميد', qty: 3 }],
  ['issue-BRZ-0009', { docId: 'issue-BRZ-0009', id: 'BRZ-0009', population: 'issue', assetName: 'ديكور معرض', qty: 75, archived: true }],
]);

const line = (over = {}) => ({
  population: 'issue',
  assetNo: 'BRZ-0001',
  assetName: 'خشب باركي',
  category: 'اثاث',
  brand: 'دستة',
  qty: 10,
  ...over,
});

const card = (over = {}) => ({
  number: 'VENISS-2026-0001',
  kind: 'issue',
  state: 'draft',
  cardDate: '2026-10-19',
  party: 'سراج',
  destination: 'مشروع الرحبة',
  lines: [line()],
  ...over,
});

const receipt = (over = {}) =>
  card({ kind: 'receipt', number: 'VENRCV-2026-0001', party: 'مورّد الأخشاب', ...over });

// ── الاتّجاهان ───────────────────────────────────────────────────────────

test('اتّجاهان لا غير، والفرقُ بينهما إشارةٌ واحدة', () => {
  assert.deepEqual(CARD_KINDS.map((k) => k.id), ['issue', 'receipt']);
  assert.equal(cardKind('issue').sign, -1);
  assert.equal(cardKind('receipt').sign, +1);
  assert.equal(cardKind('issue').numberType, 'VENISS');
  assert.equal(cardKind('receipt').numberType, 'VENRCV');
  assert.notEqual(cardKind('issue').numberType, cardKind('receipt').numberType, 'لكلّ اتّجاهٍ تسلسلُه');
});

test('والمجهولُ يُقال مجهولًا ولا يُفترض صرفًا', () => {
  assert.ok(isCardKind('issue') && isCardKind('receipt'));
  assert.equal(isCardKind('x'), false);
  assert.equal(cardKind('x'), null);
  assert.equal(cardKindLabel('x'), 'بطاقة غير معروفة');
  assert.equal(oppositeKind('issue'), 'receipt');
  assert.equal(oppositeKind('receipt'), 'issue');
  assert.equal(oppositeKind('x'), null);
});

test('★ والحالةُ تُسمّى بلغة الاتّجاه — «مصروفة» لا «مثبَّتة»', () => {
  assert.deepEqual(CARD_STATES, ['draft', 'posted', 'cancelled']);
  assert.equal(cardStateLabel('draft', 'issue'), 'مسودّة');
  assert.equal(cardStateLabel('posted', 'issue'), 'مصروفة');
  assert.equal(cardStateLabel('posted', 'receipt'), 'مُدخَلة');
  assert.equal(cardStateLabel('cancelled', 'issue'), 'ملغاة');
  assert.equal(cardStateLabel('posted', 'x'), 'مثبَّتة');
});

test('★★★ والمثبَّتةُ نهائيّةٌ — تُصحَّح ببطاقةٍ مضادّةٍ لا بإلغاء', () => {
  assert.ok(canTransitionCard('draft', 'posted'));
  assert.ok(canTransitionCard('draft', 'cancelled'));
  assert.equal(canTransitionCard('posted', 'cancelled'), false);
  assert.equal(canTransitionCard('posted', 'draft'), false);
  assert.equal(canTransitionCard('cancelled', 'posted'), false);
});

// ── البنود ───────────────────────────────────────────────────────────────

test('البندُ يُطبَّع، والكمّيّةُ رقمٌ لا نصّ', () => {
  const l = normalizeCardLine({ population: ' issue ', assetNo: ' BRZ-0001 ', qty: '7' });
  assert.equal(l.population, 'issue');
  assert.equal(l.assetNo, 'BRZ-0001');
  assert.equal(l.qty, 7);
  assert.equal(l.createNew, false, 'و«أصلٌ جديد» لا يُفترض');
});

test('★ وهويّةُ البند مركَّبةٌ — فـBRZ-0001 في المجموعتين أصلان لا أصل', () => {
  assert.equal(lineAssetKey(line()), 'issue-BRZ-0001');
  assert.equal(lineAssetKey(line({ population: 'supported' })), 'supported-BRZ-0001');
  assert.equal(lineAssetKey(line({ assetNo: 'BRZ-1' })), null);
});

test('المجاميع: كم بندًا وكم وحدة', () => {
  assert.deepEqual(cardTotals(card({ lines: [line({ qty: 10 }), line({ assetNo: 'BRZ-0002', qty: 1 })] })), {
    lines: 2,
    units: 11,
  });
  assert.deepEqual(cardTotals({}), { lines: 0, units: 0 });
});

// ── الحكم ────────────────────────────────────────────────────────────────

test('بطاقتا الصرف والإدخال السليمتان تمرّان', () => {
  assert.deepEqual(cardVerdict(card(), INDEX, { forPost: true }), { ok: true, problems: [] });
  assert.deepEqual(cardVerdict(receipt(), INDEX, { forPost: true }), { ok: true, problems: [] });
});

test('والناقصُ يُقال كلُّه مرّةً واحدة، واسمُ الطرف بلغة الاتّجاه', () => {
  const v = cardVerdict({ kind: 'issue', party: '  ', cardDate: '', lines: [] }, INDEX);
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 3);
  assert.ok(v.problems.some((p) => p.includes('المستلِم')));
  const r = cardVerdict({ kind: 'receipt', party: '', cardDate: '2026-10-19', lines: [line()] }, INDEX);
  assert.ok(r.problems.some((p) => p.includes('المورِّد')));
});

test('وبطاقةٌ بلا اتّجاهٍ تُرفض ولا تُعامَل صرفًا', () => {
  const v = cardVerdict({ party: 'سراج', cardDate: '2026-10-19', lines: [line()] }, INDEX, { forPost: true });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes('اتّجاهُ البطاقة')));
});

test('★★★ ولا يُصرَف ما لا يُملَك — والرسالةُ تقول المتاحَ والمطلوب', () => {
  const v = cardVerdict(card({ lines: [line({ qty: 999 })] }), INDEX, { forPost: true });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /المتاحُ 120 والمطلوبُ 999/);
});

test('★★★ والإدخالُ لا يُفحَص توفّرُه — الزيادةُ لا سقفَ لها', () => {
  assert.equal(cardVerdict(receipt({ lines: [line({ qty: 99999 })] }), INDEX, { forPost: true }).ok, true);
});

test('★ والتوفّرُ لا يُفحَص في المسودّة — تُحضَّر البطاقةُ ثمّ يُقطع الرصيد', () => {
  assert.equal(cardVerdict(card({ lines: [line({ qty: 999 })] }), INDEX).ok, true);
  assert.equal(cardVerdict(card({ lines: [line({ qty: 999 })] }), INDEX, { forPost: true }).ok, false);
});

test('★★★ وبندٌ مكرَّرٌ يُرفض — وإلّا حُرّك الأصلُ مرّتين وفحصُ التوفّر يمرّ', () => {
  const v = cardVerdict(card({ lines: [line({ qty: 1 }), line({ qty: 1 })] }), INDEX, { forPost: true });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /مكرَّر/);
});

test('وأصلٌ مكهَّنٌ يُرفض في الاتّجاهين', () => {
  for (const c of [card({ lines: [line({ assetNo: 'BRZ-0009', qty: 1 })] }), receipt({ lines: [line({ assetNo: 'BRZ-0009', qty: 1 })] })]) {
    assert.match(cardVerdict(c, INDEX, { forPost: true }).problems[0], /مكهَّن/);
  }
});

test('وكمّيّةٌ صفرٌ أو سالبةٌ أو نصٌّ تُرفض', () => {
  for (const qty of [0, -3, 'كثير', null]) {
    const v = cardVerdict(card({ lines: [line({ qty })] }), INDEX, { forPost: true });
    assert.equal(v.ok, false, `قُبلت كمّيّة ${JSON.stringify(qty)}`);
    assert.match(v.problems[0], /أكبرُ من صفر/);
  }
});

test('★ ومجموعتان مختلفتان بنفس الرقم بندان مستقلّان', () => {
  const v = cardVerdict(
    card({ lines: [line({ qty: 1 }), line({ population: 'supported', assetName: 'ثلاجة', qty: 1 })] }),
    INDEX,
    { forPost: true }
  );
  assert.deepEqual(v, { ok: true, problems: [] });
});

// ── الأصلُ الجديد في الإدخال ─────────────────────────────────────────────

test('★★★ الإدخالُ وحدَه يُنشئ أصلًا جديدًا — والصرفُ لا يصرف ما لا وجودَ له', () => {
  const l = line({ assetNo: 'BRZ-0075', assetName: 'عربة يدوية', createNew: true });
  assert.equal(cardVerdict(receipt({ lines: [l] }), INDEX, { forPost: true }).ok, true);
  const issue = cardVerdict(card({ lines: [l] }), INDEX, { forPost: true });
  assert.equal(issue.ok, false);
  assert.match(issue.problems[0], /غيرُ موجودٍ في الجرد/);
});

test('وأصلٌ جديدٌ بلا اسمٍ يُرفض', () => {
  const v = cardVerdict(
    receipt({ lines: [line({ assetNo: 'BRZ-0075', assetName: '', createNew: true })] }),
    INDEX,
    { forPost: true }
  );
  assert.match(v.problems[0], /اسمُه مطلوب/);
});

test('★★★ و«أصلٌ جديد» على رقمٍ مسجَّلٍ يُرفض — وإلّا دُهس أصلٌ قائمٌ بكمّيّةٍ جديدة', () => {
  const v = cardVerdict(receipt({ lines: [line({ createNew: true })] }), INDEX, { forPost: true });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /مسجَّلٌ سلفًا/);
});

test('ورقمٌ غيرُ موجودٍ بلا تأشيرٍ يُقترح عليه الإنشاء في الإدخال وحدَه', () => {
  const miss = line({ assetNo: 'BRZ-0075', assetName: 'عربة' });
  assert.match(cardVerdict(receipt({ lines: [miss] }), INDEX, { forPost: true }).problems[0], /أشّر «أصلٌ جديد»/);
  assert.doesNotMatch(cardVerdict(card({ lines: [miss] }), INDEX, { forPost: true }).problems[0], /أشّر/);
});

// ── الرصيد ───────────────────────────────────────────────────────────────

test('الكمّيّةُ بعد التثبيت تُحسب بإشارة الاتّجاه', () => {
  assert.equal(qtyAfterCard({ qty: 120 }, 20, 'issue'), 100);
  assert.equal(qtyAfterCard({ qty: 120 }, 20, 'receipt'), 140);
  assert.equal(qtyAfterCard({ qty: 3 }, 3, 'issue'), 0);
  assert.equal(qtyAfterCard({ qty: 0 }, 5, 'receipt'), 5, 'والإدخالُ يُحيي أصلًا نفد');
});

test('★★★ ولا تُقصّ الكمّيّةُ على صفرٍ صامتة', () => {
  assert.throws(() => qtyAfterCard({ qty: 1 }, 2, 'issue'), /لا يُصرَف ما لا يُملَك/);
  assert.throws(() => qtyAfterCard({ qty: 5 }, 0, 'issue'), /أكبرُ من صفر/);
  assert.throws(() => qtyAfterCard({ qty: 5 }, 1, 'x'), /غير معروف/);
});

test('سطرُ السجلّ يحمل البطاقةَ والطرفَ، وحرفَ الجرّ بحسب الاتّجاه', () => {
  assert.equal(
    cardNoteLine(card(), line({ qty: 10 })),
    'صُرف 10 بالبطاقة VENISS-2026-0001 إلى سراج · مشروع الرحبة'
  );
  assert.equal(
    cardNoteLine(receipt({ destination: '' }), line({ qty: 4 })),
    'أُدخل 4 بالبطاقة VENRCV-2026-0001 من مورّد الأخشاب'
  );
});

test('★ وأثرُ البطاقة على الرصيد معزولُ الإشارة — فلا يُقرأ «10-» في العربيّة', () => {
  assert.equal(cardEffectText(card({ lines: [line({ qty: 10 })] })), '‎-10‎');
  assert.equal(cardEffectText(receipt({ lines: [line({ qty: 4 })] })), '‎+4‎');
  assert.equal(cardEffectText({ kind: 'x' }), '—');
});

// ── اللقطة والتصفية ──────────────────────────────────────────────────────

test('اللقطةُ تفرز الاتّجاهين والمسودّاتِ، والملغاةُ خارجَ الأرقام', () => {
  const cards = [
    card({ state: 'posted', lines: [line({ qty: 10 })] }),
    card({ state: 'posted', lines: [line({ qty: 5 }), line({ assetNo: 'BRZ-0002', qty: 1 })] }),
    receipt({ state: 'posted', lines: [line({ qty: 4 })] }),
    card({ state: 'draft', lines: [line({ qty: 99 })] }),
    card({ state: 'cancelled', lines: [line({ qty: 50 })] }),
  ];
  assert.deepEqual(cardsSnapshot(cards), {
    total: 5,
    drafts: 1,
    posted: 3,
    cancelled: 1,
    issued: { cards: 2, units: 16 },
    received: { cards: 1, units: 4 },
    net: -12,
  });
});

test('★★★ والمسودّةُ لا تُحتسب حركةً — وإلّا أعلنت اللوحةُ صرفًا لم يقع', () => {
  const snap = cardsSnapshot([card({ state: 'draft', lines: [line({ qty: 1000 })] })]);
  assert.equal(snap.issued.units, 0);
  assert.equal(snap.drafts, 1);
});

test('التصفية: بحثٌ حرٌّ واتّجاهٌ وحالةٌ ومدى تاريخ', () => {
  const cards = [
    card({ number: 'VENISS-2026-0001', state: 'posted', cardDate: '2026-10-01', party: 'سراج' }),
    receipt({ number: 'VENRCV-2026-0001', state: 'draft', cardDate: '2026-10-19', party: 'خالد' }),
  ];
  assert.equal(filterCards(cards, {}).length, 2);
  assert.equal(filterCards(cards, { kind: 'receipt' }).length, 1);
  assert.equal(filterCards(cards, { state: 'posted' }).length, 1);
  assert.equal(filterCards(cards, { q: 'خالد' }).length, 1);
  assert.equal(filterCards(cards, { q: 'VENRCV' }).length, 1);
  assert.equal(filterCards(cards, { q: 'خشب' }).length, 2, 'والبحثُ يبلغ أسماءَ البنود');
  assert.equal(filterCards(cards, { from: '2026-10-10' }).length, 1);
  assert.equal(filterCards(cards, { to: '2026-10-10' }).length, 1);
});

// ── مرساةُ الاستدعاء ─────────────────────────────────────────────────────

test('★★★ والخدمةُ تحسب الكمّيّة بـ`qtyAfterCard` لا بيدها — مرساةٌ على «منطقٌ بلا مستدعٍ»', () => {
  const src = readFileSync(new URL('./veneciaCardsService.js', import.meta.url), 'utf8');
  assert.ok(/qtyAfterCard\s*\(/.test(src), 'الخدمةُ لا تستدعي الحارسَ — ستُهزّ الدالّةُ من الحزمة');
  // وحسابٌ يدويٌّ بالإشارة يعني أنّ الحارسَ التُفَّ عليه ولو بقي مستدعًى.
  assert.ok(
    !/qty:\s*rawQty\([^)]*\)\s*\+\s*kind\.sign/.test(src),
    'عاد الحسابُ اليدويُّ `rawQty(...) + kind.sign * n` — وهو يتجاوز رفضَ الرصيد السالب'
  );
});

test('وحركةُ كلّ أصلٍ تُجمَع من المثبَّت وحدَه، صرفًا وإدخالًا', () => {
  const cards = [
    card({ state: 'posted', lines: [line({ qty: 10 })] }),
    receipt({ state: 'posted', lines: [line({ qty: 4 }), line({ population: 'supported', qty: 1 })] }),
    card({ state: 'draft', lines: [line({ qty: 500 })] }),
  ];
  const by = movementByAsset(cards);
  assert.deepEqual(by.get('issue-BRZ-0001'), { issued: 10, received: 4, cards: 2 });
  assert.deepEqual(by.get('supported-BRZ-0001'), { issued: 0, received: 1, cards: 1 });
  assert.equal(by.has('issue-BRZ-9999'), false);
});
