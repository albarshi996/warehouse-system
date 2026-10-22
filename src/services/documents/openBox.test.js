/**
 * صندوق المستندات المفتوحة (SAP-12 · يسدّ ف‑٣٠ وف‑٤٥).
 *
 * حارسٌ لأربعة مبادئ:
 *   1. **«مفتوح» غير «ينتظر توقيعًا»** — صندوقان مختلفان لا صندوقٌ بمرشِّح.
 *   2. **المغلق والملغى يخرجان** — وبلا هذا يمتلئ الصندوق بما انتهى.
 *   3. **الأقدم أوّلًا** — الترتيب بالأحدث يدفن ما تأخّر.
 *   4. **لا رقمَ بلا سبب** — كلّ سطرٍ يقول كم بقي ولماذا هو هنا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tracksExecution,
  measureDocument,
  buildOpenBox,
  ageInDays,
  staleRows,
  isSourceOrder,
  loadedContext,
  buildActualOpenBox,
  partyOf,
} from './openBox.js';
import { fieldRouteFor } from '../tasks/fieldRoutes.js';

const po = (over = {}) => ({
  id: 'po1',
  type: 'PO',
  number: 'PO-1',
  state: 'done',
  header: { supplier: 'الريشة', issueDate: '2026-08-01' },
  lines: [{ lineId: 'L1', sku: 'S1', qty: 100 }],
  ...over,
});

const grnLink = (qty, id = 'g1', sourceId = 'po1') => ({
  id: `r-${id}`,
  linkType: 'TARGET',
  source: { documentId: sourceId, documentType: 'PO', lineId: 'L1' },
  target: { documentId: id, documentType: 'GRN', documentNumber: id.toUpperCase(), lineId: 'x' },
  linkedQuantity: qty,
});

/* ═══════════ 1. أيّ الأنواع تُفتح أصلًا ═══════════ */

test('نوعٌ بلا مسار تنفيذٍ كمّيّ لا يدخل الصندوق', () => {
  assert.equal(tracksExecution('PO'), true);
  assert.equal(tracksExecution('QC'), true);
  assert.equal(tracksExecution('VSR'), false, 'تسوية الرحلة حسابٌ لا كمّيّة');
  const m = measureDocument({ id: 'x', type: 'VSR', state: 'done', lines: [] });
  assert.equal(m.open, false);
  assert.match(m.reason, /بلا مسار تنفيذ/);
});

/* ═══════════ 2. متى يكون المستند «مفتوحًا» ═══════════ */

test('★★ المثال الحاكم: طُلب 100 ووصل 60 ⇒ مفتوحٌ بأربعين', () => {
  const m = measureDocument(po(), [grnLink(60)]);
  assert.equal(m.open, true);
  assert.equal(m.totals.requested, 100);
  assert.equal(m.totals.executed, 60);
  assert.equal(m.status.open, 40);
  assert.equal(m.status.id, 'partial');
  // ولا رقمَ بلا سبب: الأسطر المفتوحة تُعاد لتُشرح.
  assert.equal(m.lines.length, 1);
  assert.equal(m.lines[0].open, 40);
});

test('المكتمل يخرج — ولا يبقى ليُتجاهَل', () => {
  const m = measureDocument(po(), [grnLink(100)]);
  assert.equal(m.open, false);
  assert.match(m.reason, /اكتمل/);
});

test('★★ المغلق والملغى يخرجان ولو بقيت كمّيّة — وهذا ما جعل الصندوق ممكنًا', () => {
  // قبل SAP-4 كان أمرٌ استُلم منه 95 من 100 يبقى مفتوحًا أبدًا.
  for (const state of ['closed', 'canceled']) {
    const m = measureDocument(po({ state }), [grnLink(95)]);
    assert.equal(m.open, false, `${state}: كان يجب أن يخرج`);
    assert.match(m.reason, /خرج من العمل/);
  }
});

test('★★ ما لم يُعتمد بعد ليس «عملًا مفتوحًا» بل عملًا لم يبدأ', () => {
  for (const state of ['draft', 'submitted', 'rejected']) {
    const m = measureDocument(po({ state }), []);
    assert.equal(m.open, false, `${state}: يخصّ صندوق الاعتماد لا صندوق العمل`);
    assert.match(m.reason, /لم يبدأ عمله/);
  }
  // والمعتمَد يدخل: وُقّع ولم يُنفَّذ.
  assert.equal(measureDocument(po({ state: 'approved' }), []).open, true);
});

/* ═══════════ 3. الصندوق ═══════════ */

test('★★ الأقدم أوّلًا — والترتيب بالأحدث يدفن ما تأخّر', () => {
  const docs = [
    po({ id: 'new', number: 'PO-3', header: { issueDate: '2026-08-12' } }),
    po({ id: 'old', number: 'PO-1', header: { issueDate: '2026-08-01' } }),
    po({ id: 'mid', number: 'PO-2', header: { issueDate: '2026-08-06' } }),
  ];
  const box = buildOpenBox(docs);
  assert.deepEqual(box.rows.map((r) => r.document.id), ['old', 'mid', 'new']);
  assert.equal(box.count, 3);
});

test('التجميع بالنوع يعطي عددًا ومتبقّيًا لكلّ نوع', () => {
  const docs = [
    po({ id: 'a' }),
    po({ id: 'b' }),
    { id: 'c', type: 'TR', state: 'done', header: { issueDate: '2026-08-02' }, lines: [{ lineId: 'x', sku: 'S', qty: 30 }] },
  ];
  const box = buildOpenBox(docs);
  assert.equal(box.byType.PO.count, 2);
  assert.equal(box.byType.PO.open, 200, 'مئةٌ لكلٍّ بلا تنفيذ');
  assert.equal(box.byType.TR.count, 1);
  assert.equal(box.totalOpen, 230);
});

test('★ مُزوّد العلاقات يُستدعى لكلّ مستند — فالمفتوح يُحسب لا يُقدَّر', () => {
  const asked = [];
  const box = buildOpenBox([po({ id: 'a' }), po({ id: 'b' })], (d) => {
    asked.push(d.id);
    return d.id === 'a' ? { relations: [grnLink(100, 'g1', 'a')], documents: [] } : {};
  });
  assert.deepEqual(asked.sort(), ['a', 'b']);
  assert.deepEqual(box.rows.map((r) => r.document.id), ['b'], 'المستند «أ» اكتمل فخرج');
});

test('★ مدخلٌ فاسد لا يُسقط الصندوق', () => {
  const box = buildOpenBox([null, undefined, {}, { id: 'x' }, po()]);
  assert.equal(box.count, 1);
  assert.deepEqual(buildOpenBox(null).rows, []);
  assert.equal(buildOpenBox([]).totalOpen, 0);
});

/* ═══════════ 4. العمر ═══════════ */

test('★★ «معلّقٌ منذ ١٢ يومًا» أصدق من تاريخٍ يقرؤه المرء ويطرح', () => {
  const now = Date.parse('2026-08-13T00:00:00Z');
  assert.equal(ageInDays(po({ header: { issueDate: '2026-08-01' } }), now), 12);
  assert.equal(ageInDays(po({ header: { issueDate: '2026-08-13' } }), now), 0);
  assert.equal(ageInDays({ id: 'x', type: 'PO' }, now), null, 'بلا تاريخ ⇒ لا عمر مخترَع');
});

test('★ المتأخّر يُميَّز عن الطازج بحدٍّ ظاهر لا مخبوز', () => {
  const now = Date.parse('2026-08-13T00:00:00Z');
  const rows = buildOpenBox([
    po({ id: 'old', header: { issueDate: '2026-08-01' } }),
    po({ id: 'fresh', header: { issueDate: '2026-08-12' } }),
  ]).rows;
  assert.deepEqual(staleRows(rows, now, 7).map((r) => r.document.id), ['old']);
  assert.deepEqual(staleRows(rows, now, 30).map((r) => r.document.id), []);
  assert.deepEqual(staleRows(null, now), []);
});

/* ═══════════ 5. ‹ODOO-ORD› أوامرُ أودو تُقاس من بنودها ═══════════ */

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });

/** أمرُ بيعٍ من أودو كما يكتبه `orderImport`: معتمَدٌ، والطرفُ في `partner`، وتاريخُ الأمر في `sourceDoneDate`. */
const oso = (lines, over = {}) => ({
  id: 'oso1',
  type: 'OSO',
  number: 'OSO-2026-0001',
  state: 'approved',
  createdAt: ts('2026-10-22T09:00:00Z'),
  header: { sourceSystem: 'Odoo', sourceRef: 'S00042', partner: 'صيدلية الوسط', sourceDoneDate: '2026-10-10', doneStatus: 'pending' },
  lines,
  ...over,
});

test('★★ أمرُ أودو مستقلٌّ في السلسلة فلا يراه tracksExecution — ويراه الصندوقُ بمخطّطه', () => {
  assert.equal(tracksExecution('OSO'), false, 'لا يُشتقّ منه شيءٌ هنا');
  assert.equal(tracksExecution('OPO'), false);
  assert.equal(isSourceOrder('OSO'), true);
  assert.equal(isSourceOrder('OPO'), true);
  assert.equal(isSourceOrder('PO'), false, 'أمرُ الشراء المحلّيُّ يُقاس بأبنائه كما كان');
  assert.equal(isSourceOrder('SRO'), false, 'المستندُ المنجَزُ في المصدر ليس أمرًا قائمًا');
  assert.equal(isSourceOrder(undefined), false);
});

test('★★ لم يُسلَّم منه شيء ⇒ مفتوحٌ بكلّ مطلوبه', () => {
  const m = measureDocument(oso([{ sku: 'A', qty: 10, qtyDone: 0 }, { sku: 'B', qty: 5 }]));
  assert.equal(m.open, true);
  assert.equal(m.totals.requested, 15);
  assert.equal(m.totals.executed, 0);
  assert.equal(m.status.open, 15);
  assert.equal(m.status.id, 'open');
  assert.equal(m.lines.length, 2, 'ولا رقمَ بلا سبب: البنودُ الباقية تُعاد');
});

test('★★ الجزئيّ مفتوحٌ بباقيه — والمكتملُ يخرج', () => {
  const partial = measureDocument(oso([{ sku: 'A', qty: 10, qtyDone: 4 }, { sku: 'B', qty: 5, qtyDone: 5 }]));
  assert.equal(partial.open, true);
  assert.equal(partial.totals.requested, 15);
  assert.equal(partial.totals.executed, 9);
  assert.equal(partial.status.open, 6);
  assert.equal(partial.status.id, 'partial');
  assert.deepEqual(partial.lines.map((l) => l.sku), ['A']);

  const full = measureDocument(oso([{ sku: 'A', qty: 10, qtyDone: 10 }, { sku: 'B', qty: 5, qtyDone: 5 }]));
  assert.equal(full.open, false);
  assert.match(full.reason, /اكتمل/);
});

test('★★ الملغى والمسودّةُ لا يُفتحان ولو بقي كلُّ شيء — «معتمَد» وحده أمرٌ قائم', () => {
  const lines = [{ sku: 'A', qty: 10, qtyDone: 0 }];
  const canceled = measureDocument(oso(lines, { state: 'canceled' }));
  assert.equal(canceled.open, false);
  assert.match(canceled.reason, /خرج من العمل/);
  for (const state of ['draft', 'submitted', 'rejected', 'done']) {
    const m = measureDocument(oso(lines, { state }));
    assert.equal(m.open, false, `${state}: ليس أمرًا قائمًا`);
  }
});

test('★★ الباقي بندًا بندًا: فائضُ صنفٍ لا يُطفئ صنفًا لم يُسلَّم', () => {
  const m = measureDocument(oso([{ sku: 'A', qty: 5, qtyDone: 8 }, { sku: 'B', qty: 5, qtyDone: 2 }]));
  assert.equal(m.open, true, 'عميلُ «ب» ما زال ينتظر ثلاثة');
  assert.equal(m.status.open, 3);
  assert.equal(m.totals.executed, 10, 'المنفَّذُ كما يحسبه أودو');
  assert.equal(m.totals.excess, 3);
});

test('★ السالبُ حقيقةُ أودو ولا يُحسب: لا بندٌ سالبٌ مطلوبًا ولا مرتجعٌ تنفيذًا سالبًا', () => {
  const m = measureDocument(oso([
    { sku: 'A', qty: 4, qtyDone: -2 }, // مرتجعٌ فاق المسلَّم
    { sku: 'B', qty: -1, qtyDone: -1 }, // بندٌ سالب
    { sku: 'C', qty: 0, qtyDone: 0 }, // بندٌ صفريّ
  ]));
  assert.equal(m.totals.requested, 4);
  assert.equal(m.totals.executed, 0);
  assert.equal(m.status.open, 4);
  assert.equal(measureDocument(oso([{ sku: 'C', qty: 0 }])).open, false, 'أمرٌ بلا مطلوبٍ لا عملَ فيه');
});

test('★★ أمرُ الشراء من أودو يُقاس كذلك — المستلَمُ في qtyDone', () => {
  const opo = oso([{ sku: 'P', qty: 100, qtyDone: 40 }], { id: 'opo1', type: 'OPO', header: { sourceSystem: 'Odoo', partner: 'مورّد الشرق', sourceDoneDate: '2026-10-05' } });
  const m = measureDocument(opo);
  assert.equal(m.open, true);
  assert.equal(m.status.open, 60);
});

test('★★ الطرفُ partner والعمرُ من تاريخ الأمر لا من يوم الاستيراد — ولا مسارَ ميدانيّ', () => {
  const order = oso([{ sku: 'A', qty: 1 }]);
  assert.equal(partyOf(order), 'صيدلية الوسط');
  assert.equal(partyOf(po()), 'الريشة', 'المحلّيُّ كما كان');
  assert.equal(partyOf({ header: { beneficiary: 'قسم الصيانة' } }), 'قسم الصيانة');
  assert.equal(partyOf({}), '');

  const now = Date.parse('2026-10-22T10:00:00Z');
  assert.equal(ageInDays(order, now), 12, 'من 10 أكتوبر — لا «اليوم» لأنّه استُورد اليوم');
  assert.equal(ageInDays(oso([], { header: { sourceSystem: 'Odoo' } }), now), 0, 'بلا تاريخ أمرٍ يقع على الإنشاء');

  const box = buildOpenBox([
    oso([{ sku: 'A', qty: 1 }], { id: 'late', header: { ...order.header, sourceDoneDate: '2026-10-15' } }),
    oso([{ sku: 'A', qty: 1 }], { id: 'early', header: { ...order.header, sourceDoneDate: '2026-10-01' } }),
  ]);
  assert.deepEqual(box.rows.map((r) => r.document.id), ['early', 'late'], 'الأقدم بتاريخ الأمر أوّلًا');
  assert.equal(box.byType.OSO.open, 2);

  assert.equal(fieldRouteFor(order), null, 'أمرُ أودو يُنفَّذ في أودو — لا شاشةَ ميدانيّةَ له هنا');
  assert.equal(fieldRouteFor({ ...order, type: 'OPO' }), null);
});

/* ═══════════ 6. ‹ODOO-ORD› السياقُ من المحمَّل والعملُ الفعليّ ═══════════ */

const grnChild = (id, qty, state = 'approved') => ({
  id,
  type: 'GRN',
  state,
  links: { PO: { id: 'po1' } },
  lines: [{ sku: 'S1', qtyReceived: qty }],
});

test('★★ بلا سياقٍ كان كلُّ معتمَدٍ مفتوحًا أبدًا — والسياقُ من المحمَّل يعدّ أبناءه', () => {
  const parent = po({ state: 'approved' });
  const child = grnChild('g1', 100);
  assert.equal(buildOpenBox([parent, child]).rows.some((r) => r.document.id === 'po1'), true, 'العطبُ القديم: استُلم كلُّه وبقي مفتوحًا');
  const box = buildOpenBox([parent, child], loadedContext([parent, child]));
  assert.equal(box.rows.some((r) => r.document.id === 'po1'), false, 'استُلم كلُّه فخرج');

  const half = buildOpenBox([parent, grnChild('g2', 40)], loadedContext([parent, grnChild('g2', 40)]));
  assert.equal(half.rows.find((r) => r.document.id === 'po1').status.open, 60);
});

test('★★ الابنُ الملغى لا يُعدّ تنفيذًا', () => {
  const parent = po({ state: 'approved' });
  const docs = [parent, grnChild('g1', 100, 'canceled')];
  const row = buildOpenBox(docs, loadedContext(docs)).rows.find((r) => r.document.id === 'po1');
  assert.ok(row, 'استلامٌ أُلغي لم يستلم شيئًا');
  assert.equal(row.status.open, 100);
  assert.deepEqual(loadedContext(null)(), { documents: [] });
});

test('★★ العملُ الفعليّ وحده: تجربةُ ما قبل الافتتاح تُخفى وتُعدّ — وأودو يُعرض أيًّا كان تاريخُ إنشائه', () => {
  const trial = po({ id: 'trial', state: 'approved', createdAt: ts('2026-07-20T10:00:00Z') });
  const trialDone = po({ id: 'trialDone', state: 'done', createdAt: ts('2026-08-01T10:00:00Z'), lines: [{ lineId: 'L1', sku: 'S1', qty: 5 }] });
  const fresh = po({ id: 'fresh', state: 'approved', createdAt: ts('2026-10-21T10:00:00Z') });
  const order = oso([{ sku: 'A', qty: 3 }], { createdAt: ts('2026-10-19T10:00:00Z') });
  const box = buildActualOpenBox([trial, trialDone, fresh, order, null]);
  assert.deepEqual(box.rows.map((r) => r.document.id).sort(), ['fresh', 'oso1']);
  assert.equal(box.hidden, 2, 'ما كان سيُعرض مفتوحًا من التجارب — يُقال لا يُسكت عنه');
  assert.equal(box.count, 2);

  // والمخفيُّ يُعدّ بسياقه: تجربةٌ استُلمت كلُّها ليست «مفتوحةً مخفيّة».
  const received = { ...grnChild('g1', 100), createdAt: ts('2026-07-21T10:00:00Z') };
  const trialPo = po({ state: 'approved', createdAt: ts('2026-07-20T10:00:00Z') });
  assert.equal(
    buildActualOpenBox([trialPo, received]).hidden,
    buildActualOpenBox([received]).hidden,
    'أمرُ التجربة المستلَمُ كلُّه لا يزيد المخفيَّ شيئًا'
  );
  assert.deepEqual(buildActualOpenBox(null).rows, []);
});
