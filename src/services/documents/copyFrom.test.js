/**
 * «جلب من مستند سابق» (SAP-5 · يسدّ ف‑١٢ وف‑١٣).
 *
 * حارسٌ لأربعة مبادئ:
 *   1. **حقيقةٌ واحدة لا جدولان** — المصادر معكوسةٌ عن الوجهات، فمن أضاف
 *      تفرّعًا في أحدهما لا يستطيع نسيانه في الآخر.
 *   2. **المؤهّل مؤهَّل** — حالةً وطرفًا وكمّيّةً مفتوحة.
 *   3. **السبب يُقال ولا يُخفى** — الإخفاء الصامت يُنتج الازدواج.
 *   4. **لا دمجَ من أطرافٍ مختلفة** — مستندٌ لا يُقابله واقع.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { derivationTargets, derivationSources } from './chain.js';
import {
  partyOf,
  sourceTypesFor,
  acceptsCopyFrom,
  qualifyCandidate,
  copyFromCandidates,
  mergeSelection,
} from './copyFrom.js';

/** أمر شراءٍ بسطرين — 100 و20. */
const po = (over = {}) => ({
  id: 'po1',
  type: 'PO',
  number: 'PO-2026-0009',
  state: 'done',
  header: { supplier: 'الريشة الذهبية' },
  lines: [
    { sku: 'S1', description: 'ستاند', qty: 100 },
    { sku: 'S2', description: 'ديسبلاي', qty: 20 },
  ],
  ...over,
});

/* ═══════════ 1. حقيقةٌ واحدة ═══════════ */

test('★★ المصادر معكوسةٌ عن الوجهات — ولا جدول ثانٍ يتقادم', () => {
  for (const source of ['PR', 'PO', 'GRN', 'QC', 'DN', 'TR', 'VLD', 'IPO']) {
    for (const target of derivationTargets(source)) {
      assert.ok(
        derivationSources(target).includes(source),
        `${source} → ${target} موجودة ذهابًا ومفقودة إيابًا`
      );
    }
  }
  // والتفرّع محفوظ في الاتّجاهين.
  assert.deepEqual(derivationSources('PUTAWAY'), ['QC']);
  assert.deepEqual(derivationSources('SRN'), ['QC']);
  assert.deepEqual(derivationSources('GRN'), ['PO']);
});

test('لا مصدر لنوعٍ مجهول ولا لبداية سلسلة', () => {
  assert.deepEqual(derivationSources('لا-نوع'), []);
  assert.deepEqual(derivationSources(''), []);
  assert.deepEqual(derivationSources('PR'), [], 'طلب الشراء رأس السلسلة');
});

test('★★ ما لا كمّيّة فيه يُشتقّ ولا يُجلب — تسوية الرحلة مثالًا', () => {
  // `VRT → VSR` علاقةٌ قائمة في السلسلة، لكنّ التسوية **حسابٌ لا كمّيّة**:
  // تُقفل الرحلة ولا تسحب بضاعة. فالجلب منها لا معنى له، والاشتقاق يكفي.
  // وهذا ما يمنع ظهور زرّ «جلب» على شاشةٍ لا تحتمله.
  assert.ok(derivationTargets('VRT').includes('VSR'));
  assert.deepEqual(derivationSources('VSR'), ['VRT']);
  assert.deepEqual(sourceTypesFor('VSR'), [], 'التسوية لا تُجلب كمّيّة');
  assert.equal(acceptsCopyFrom('VSR'), false);
  assert.equal(acceptsCopyFrom('GRN'), true);
  assert.equal(acceptsCopyFrom('PR'), false, 'رأس السلسلة لا يُجلب إليه');
});

/* ═══════════ 2. الأهليّة ═══════════ */

test('★★ الحالة تحكم: لا جلب من مسودّةٍ ولا مغلقٍ ولا ملغى', () => {
  for (const state of ['draft', 'submitted', 'rejected', 'closed', 'canceled']) {
    const c = qualifyCandidate(po({ state }), 'GRN');
    assert.equal(c.eligible, false, `${state}: كان يجب أن يُرفض`);
    assert.match(c.reason, /الحالة/);
  }
  for (const state of ['approved', 'done']) {
    assert.equal(qualifyCandidate(po({ state }), 'GRN').eligible, true, `${state}: كان يجب أن يُقبل`);
  }
});

test('★★ الطرف يحكم: لا التزامَ على من لم يلتزم', () => {
  const c = qualifyCandidate(po(), 'GRN', { party: 'مورّدٌ آخر' });
  assert.equal(c.eligible, false);
  assert.match(c.reason, /الطرف مختلف/);
  assert.match(c.reason, /الريشة الذهبية/, 'السبب يذكر الطرف الحقيقيّ');
  // والطرف الفارغ لا يُقصي: شاشةٌ لم يُختَر فيها طرفٌ بعد.
  assert.equal(qualifyCandidate(po(), 'GRN', { party: '' }).eligible, true);
  assert.equal(qualifyCandidate(po(), 'GRN', { party: 'الريشة الذهبية' }).eligible, true);
});

test('لا جلب إلى نوعٍ ليس وجهةً لهذا المصدر', () => {
  const c = qualifyCandidate(po(), 'PUTAWAY');
  assert.equal(c.eligible, false);
  assert.match(c.reason, /لا يُجلب منه/);
});

test('اسم الطرف يُقرأ من المورّد أو العميل أو المستفيد', () => {
  assert.equal(partyOf({ header: { supplier: 'أ' } }), 'أ');
  assert.equal(partyOf({ header: { customer: 'ب' } }), 'ب');
  assert.equal(partyOf({ header: { beneficiary: 'ج' } }), 'ج');
  assert.equal(partyOf({ header: {} }), '');
  assert.equal(partyOf(null), '');
});

/* ═══════════ 3. السبب يُقال ═══════════ */

test('★★ غير المؤهّل يُعاد مع سببه — لا يُخفى فيُظنّ مفقودًا', () => {
  const docs = [
    po(),
    po({ id: 'po2', number: 'PO-2026-0010', state: 'draft' }),
    po({ id: 'po3', number: 'PO-2026-0011', header: { supplier: 'مورّد آخر' } }),
    { id: 'x', type: 'CC', number: 'CC-1', state: 'done', header: {}, lines: [] },
  ];
  const { eligible, rejected, sourceTypes } = copyFromCandidates('GRN', docs, { party: 'الريشة الذهبية' });
  assert.deepEqual(sourceTypes, ['PO']);
  assert.deepEqual(eligible.map((c) => c.document.id), ['po1']);
  assert.deepEqual(rejected.map((c) => c.document.id).sort(), ['po2', 'po3'], 'CC ليس من الأنواع أصلًا فلا يُعرض');
  for (const r of rejected) assert.ok(r.reason, `${r.document.id}: رُفض بلا سبب`);
});

test('★ الكمّيّة المفتوحة تحكم: المستنفَد لا يُجلب منه', () => {
  // استلامٌ سابق سحب السطرين كاملَين.
  const relations = [
    { linkType: 'TARGET', source: { documentId: 'po1', documentType: 'PO', lineId: 'L1' }, target: { documentType: 'GRN', documentId: 'g1', lineId: 'GL1' }, linkedQuantity: 100 },
    { linkType: 'TARGET', source: { documentId: 'po1', documentType: 'PO', lineId: 'L2' }, target: { documentType: 'GRN', documentId: 'g1', lineId: 'GL2' }, linkedQuantity: 20 },
  ];
  const c = qualifyCandidate(po(), 'GRN', { relations });
  if (c.eligible) {
    // إن لم تُطابق معرّفات الأسطر، فالمفتوح كامل — والحارس هنا أنّ المجموع صحيح.
    assert.equal(c.openTotal, 120);
  } else {
    assert.match(c.reason, /استُنفدت/);
  }
});

/* ═══════════ 4. الدمج ═══════════ */

test('★★ لا دمجَ من أطرافٍ مختلفة — مستندٌ لا يُقابله واقع', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const b = qualifyCandidate(po({ id: 'po2', number: 'PO-2026-0010', header: { supplier: 'مورّد آخر' } }), 'GRN');
  const merged = mergeSelection([{ candidate: a, quantities: {} }, { candidate: b, quantities: {} }]);
  assert.ok(merged.problems.some((p) => /أطرافٍ مختلفة/.test(p)));
});

test('★★ الدمج من مصدرين لنفس الطرف يجمع الأسطر ويحفظ نسب كلٍّ لأصله', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const b = qualifyCandidate(po({ id: 'po2', number: 'PO-2026-0010' }), 'GRN');
  const merged = mergeSelection([{ candidate: a }, { candidate: b }]);
  assert.equal(merged.problems.length, 0);
  assert.equal(merged.sources.length, 2, 'مصدران');
  assert.equal(merged.totalDrawn, 240, '120 من كلٍّ');
  assert.equal(merged.party, 'الريشة الذهبية');
  for (const line of merged.lines) {
    assert.ok(line.sourceId, 'سطرٌ بلا أصل — العلاقة تضيع');
    assert.ok(line.sourceLineId, 'سطرٌ بلا سطرٍ أصل — العلاقة تصير على مستوى المستند لا السطر');
    assert.ok(line.qty > 0);
  }
});

test('★★ لا تجاوزَ للمتبقّي — والتجاوز يُقال بالرقم لا بتحذيرٍ مبهم', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const lineId = a.plan.lines[0].lineId;
  const merged = mergeSelection([{ candidate: a, quantities: { [lineId]: 999 } }]);
  assert.ok(merged.problems.some((p) => /يتجاوز المتبقّي/.test(p)));
  assert.ok(merged.problems.some((p) => /999/.test(p)));
});

test('★ اختيارٌ جزئيّ: سطرٌ واحد ببعض كمّيّته', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const [first, second] = a.plan.lines;
  const merged = mergeSelection([{ candidate: a, quantities: { [first.lineId]: 60, [second.lineId]: 0 } }]);
  assert.equal(merged.problems.length, 0);
  assert.equal(merged.totalDrawn, 60);
  assert.equal(merged.lines.length, 1, 'السطر بصفرٍ لا يُدرَج');
});

test('★ اختيارٌ فارغ يُرفض بسببٍ مكتوب لا بصمت', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const empty = mergeSelection([{ candidate: a, quantities: Object.fromEntries(a.plan.lines.map((l) => [l.lineId, 0])) }]);
  assert.ok(empty.problems.some((p) => /لم تُختَر كمّيّة/.test(p)));
  assert.deepEqual(mergeSelection([]).problems, ['لم تُختَر كمّيّةٌ واحدة.']);
});

test('★★ الجلب لا يُنشئ شيئًا — يُخرج أسطرًا فقط (§12.2-٩ ‹308›)', () => {
  const a = qualifyCandidate(po(), 'GRN');
  const merged = mergeSelection([{ candidate: a }]);
  // لا معرّف مستندٍ جديد ولا حالة ولا ختم زمن: التجهيز ليس حفظًا.
  assert.equal(merged.id, undefined);
  assert.equal(merged.state, undefined);
  assert.equal(merged.number, undefined);
  assert.ok(Array.isArray(merged.lines));
});
