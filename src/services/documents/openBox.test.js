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

import { tracksExecution, measureDocument, buildOpenBox, ageInDays, staleRows } from './openBox.js';

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
