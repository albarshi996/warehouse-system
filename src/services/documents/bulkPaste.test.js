/**
 * قارئُ اللصق الجماعيّ (BULK-101).
 *
 * حارسٌ لأربعة:
 *   1. **`CRLF` لا يصل الماستر** — محرفُ `\r` الزائد يجعل الكود كودًا آخر
 *      لا يُستبان أبدًا، وهذا أكثرُ ما يقع لأنّ إكسل ينسخ به.
 *   2. **لصقُ الخليّة الواحدة ليس لصقًا جماعيًّا** — فلا يُغيَّر ما يعمل.
 *   3. **ما خارج المدى لا يُمسّ** — واللصقُ لا يُعيد بناء الجدول.
 *   4. **الفارغ لا يدهس المكتوب** — لا في خليّةٍ ولا في عمود.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePastedGrid, isBulkPaste, planPaste, applyPastePlan } from './bulkPaste.js';

const COLS = ['sku', 'description', 'qty', 'uom'];
const plan = (text, over = {}) =>
  planPaste({ text, startIndex: 0, columnKeys: COLS, startColumnKey: 'sku', lineCount: 1, ...over });

/* ───────────── ① التفكيك ───────────── */

test('عمودٌ واحدٌ بأسطر: صنفٌ لكلّ سطر', () => {
  assert.deepEqual(parsePastedGrid('ITM-1\nITM-2\nITM-3'), [['ITM-1'], ['ITM-2'], ['ITM-3']]);
});

test('★ نهاياتُ CRLF تُقلَّم — إكسلُ ويندوز لا يُنتج كودًا بمحرفٍ زائد', () => {
  assert.deepEqual(parsePastedGrid('ITM-1\r\nITM-2\r\n'), [['ITM-1'], ['ITM-2']]);
  // ولو تسرّب \r داخل خليّة، فالتقليمُ يبتلعه
  assert.deepEqual(parsePastedGrid('ITM-1\r'), [['ITM-1']]);
  assert.deepEqual(parsePastedGrid('ITM-1\rITM-2'), [['ITM-1'], ['ITM-2']]);
});

test('التبويبُ يفصل الأعمدة، والفراغُ حول الخلايا يُقلَّم', () => {
  assert.deepEqual(parsePastedGrid(' ITM-1 \t 12 \nITM-2\t5'), [['ITM-1', '12'], ['ITM-2', '5']]);
});

test('الأسطرُ الفارغةُ تُسقط، والتبويبُ المتأخّر لا يعني عمودًا', () => {
  assert.deepEqual(parsePastedGrid('ITM-1\n\n\nITM-2\n   \n'), [['ITM-1'], ['ITM-2']]);
  assert.deepEqual(parsePastedGrid('ITM-1\t\t'), [['ITM-1']]);
  assert.deepEqual(parsePastedGrid(''), []);
  assert.deepEqual(parsePastedGrid(null), []);
});

/* ───────────── ② متى تبدأ الجملة ───────────── */

test('★ خليّةٌ واحدةٌ في سطرٍ واحد ليست لصقًا جماعيًّا — السلوكُ القديم يبقى', () => {
  assert.equal(isBulkPaste('ITM-1'), false);
  assert.equal(isBulkPaste('ITM-1\r\n'), false); // سطرٌ واحدٌ بذيلٍ من إكسل
  assert.equal(isBulkPaste('  '), false);
  assert.equal(isBulkPaste(''), false);
  assert.equal(isBulkPaste('ITM-1\nITM-2'), true);
  assert.equal(isBulkPaste('ITM-1\t12'), true); // صفٌّ واحدٌ بعمودين: جملةٌ أيضًا
});

/* ───────────── ③ خطّةُ الصفوف ───────────── */

test('عشرون كودًا في جدولٍ ببندٍ واحد: يُملأ القائمُ ويُضاف تسعةَ عشر', () => {
  const codes = Array.from({ length: 20 }, (_, i) => `ITM-${i + 1}`).join('\n');
  const p = plan(codes);
  assert.equal(p.rows.length, 20);
  assert.equal(p.appendCount, 19);
  assert.deepEqual(p.rows[0], { index: 0, patch: { sku: 'ITM-1' } });
  assert.deepEqual(p.rows[19], { index: 19, patch: { sku: 'ITM-20' } });
});

test('★ اللصقُ من بندٍ في الوسط: ما قبله لا يُمسّ وما بعده يُحسب', () => {
  const p = plan('A\nB\nC', { startIndex: 3, lineCount: 5 });
  assert.deepEqual(p.rows.map((r) => r.index), [3, 4, 5]);
  assert.equal(p.appendCount, 1); // البنودُ ٥، واللصقةُ تصل إلى ٦
});

test('لصقةٌ أقصرُ من الجدول لا تُضيف ولا تحذف', () => {
  const p = plan('A\nB', { lineCount: 9 });
  assert.equal(p.appendCount, 0);
  assert.deepEqual(p.rows.map((r) => r.index), [0, 1]);
});

test('★ العمودُ الثاني وما بعده يُملأ بالترتيب من عمود البداية (BULK-O02)', () => {
  const p = plan('ITM-1\t12\nITM-2\t5');
  assert.deepEqual(p.rows[0].patch, { sku: 'ITM-1', description: '12' });
});

test('البدءُ من عمودٍ أوسط يملأ ما بعده لا ما قبله', () => {
  const p = plan('7\tكرتون\n3\tقطعة', { startColumnKey: 'qty' });
  assert.deepEqual(p.rows[0].patch, { qty: '7', uom: 'كرتون' });
  assert.deepEqual(p.rows[1].patch, { qty: '3', uom: 'قطعة' });
});

test('أعمدةٌ أكثرُ ممّا يتّسع تُسقط ويُصرَّح بعددها — لا تُبتلع صامتة', () => {
  const p = plan('a\tb\tc\td\te\tf', { startColumnKey: 'qty' }); // متاحان: qty · uom
  assert.deepEqual(p.rows[0].patch, { qty: 'a', uom: 'b' });
  assert.equal(p.cellsDropped, 4);
});

test('عمودٌ لا يعرفه الجدول ⇒ لا خطّة — ولا تخمينَ لعمودٍ لم يُطلب', () => {
  const p = plan('A\nB', { startColumnKey: 'nope' });
  assert.deepEqual(p, { rows: [], appendCount: 0, cellsDropped: 0 });
});

test('★ خليّةٌ فارغةٌ وسط اللصقة لا تُبيّض ما كُتب', () => {
  const p = plan('ITM-1\t\t9');
  assert.deepEqual(p.rows[0].patch, { sku: 'ITM-1', qty: '9' });
  assert.equal('description' in p.rows[0].patch, false);
});

/* ───────────── ④ التطبيق ───────────── */

test('التطبيق: يضيف الصفوفَ ثمّ يكتب الخلايا، وما خارج المدى كما هو', () => {
  const lines = [{ sku: 'قديم', qty: '4' }];
  const p = plan('A\nB\nC');
  const out = applyPastePlan(lines, p, () => ({ sku: '', description: '', qty: '', uom: '' }));
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { sku: 'A', qty: '4' }); // الكمّيّةُ القديمةُ بقيت
  assert.equal(out[1].sku, 'B');
  assert.equal(out[2].sku, 'C');
  assert.deepEqual(lines, [{ sku: 'قديم', qty: '4' }]); // ولا يُمسّ الأصل
});

test('التطبيق لا يُنشئ فجوةً حين يعجز عن الوصول لفهرس', () => {
  const out = applyPastePlan([{ sku: '' }], { rows: [{ index: 7, patch: { sku: 'X' } }], appendCount: 0 }, () => ({}));
  assert.equal(out.length, 1);
  assert.equal(out[0].sku, '');
});
