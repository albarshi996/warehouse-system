/**
 * اختبارات تحديد الجداول والنسخ — نقضًا لا تأكيدًا.
 *
 * كلُّ حارسٍ هنا يحرس عطبًا **وقع فعلًا** أو كان سيقع: مجموعةٌ تُعدَّل في
 * موضعها فلا يُعاد الرسم · «تحديد الكلّ» يتجاوز التصفية · تحديدٌ يبقى خلف
 * النظر فيُعتمَد غيابيًّا · خليّةٌ فيها تبويبٌ تمزّق الجدول.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toggleId,
  toggleAll,
  isAllSelected,
  isSomeSelected,
  pruneSelection,
  selectedRows,
  selectedCount,
  clipCell,
  toTsv,
  copyPlan,
  copyMessage,
  writeClipboard,
} from './tableSelection.js';

const ROWS = [
  { id: 'a', number: 'GRN-1', party: 'مخابز الزاوية' },
  { id: 'b', number: 'GRN-2', party: 'شركة طرابلس' },
  { id: 'c', number: 'INV-9', party: 'بقالة النور' },
];
const COLS = [
  { key: 'number', label: 'الرقم' },
  { key: 'party', label: 'الطرف' },
];
const IDS = ROWS.map((r) => r.id);

/* ═══════════════ التحديد ═══════════════ */

test('★★★ القلبُ يُعيد مجموعةً جديدة — فلا خانةٌ تُضغط ولا تتغيّر', () => {
  const before = new Set(['a']);
  const after = toggleId(before, 'b');
  // النقضُ: لو عُدِّلت في موضعها لتطابق المرجعان، ولقالت مقارنةُ React «لا جديد».
  assert.notEqual(after, before, 'عُدِّلت المجموعةُ في موضعها — React لن يُعيد الرسم');
  assert.deepEqual([...before], ['a'], 'القديمةُ تغيّرت — والتاريخُ لا يُمسّ');
  assert.deepEqual([...after].sort(), ['a', 'b']);
});

test('القلبُ يضيف ويحذف', () => {
  let s = new Set();
  s = toggleId(s, 'a');
  assert.deepEqual([...s], ['a']);
  s = toggleId(s, 'a');
  assert.deepEqual([...s], []);
});

test('القلبُ يقبل الفارغَ والمعدوم', () => {
  assert.deepEqual([...toggleId(null, 'a')], ['a']);
  assert.deepEqual([...toggleId(undefined, 'a')], ['a']);
});

test('★★★ «تحديد الكلّ» لا يتجاوز التصفية — ولا يُعتمد ما لا يُرى', () => {
  // المعروضُ صفّان من ثلاثة (كأنّ تصفيةً أخفت الثالث).
  const visible = ['a', 'b'];
  const all = toggleAll(new Set(), visible);
  assert.deepEqual([...all].sort(), ['a', 'b']);
  assert.ok(!all.has('c'), 'حُدِّد صفٌّ خارج المعروض — وهو ما يصنع الكارثة الجماعيّة');
});

test('«تحديد الكلّ» يُفرغ حين يكون الكلُّ محدَّدًا', () => {
  const full = new Set(IDS);
  assert.deepEqual([...toggleAll(full, IDS)], []);
});

test('«تحديد الكلّ» يُكمل حين يكون بعضُه محدَّدًا — لا يُفرغ', () => {
  const partial = new Set(['a']);
  const next = toggleAll(partial, IDS);
  assert.deepEqual([...next].sort(), ['a', 'b', 'c']);
});

test('★ الإفراغُ لا يمسّ محدَّدًا خارج المعروض', () => {
  // 'c' محدَّدٌ ومخفيٌّ بالتصفية؛ إفراغُ المعروض لا يلمسه.
  const sel = new Set(['a', 'b', 'c']);
  const next = toggleAll(sel, ['a', 'b']);
  assert.deepEqual([...next], ['c']);
});

test('isAllSelected و isSomeSelected — والفارغُ ليس «كلًّا»', () => {
  assert.equal(isAllSelected(new Set(IDS), IDS), true);
  assert.equal(isAllSelected(new Set(['a']), IDS), false);
  // لا صفوفَ معروضة: الخانةُ لا تُعلَّم على لا شيء.
  assert.equal(isAllSelected(new Set(), []), false);
  assert.equal(isAllSelected(new Set(['a']), []), false);

  assert.equal(isSomeSelected(new Set(['a']), IDS), true);
  assert.equal(isSomeSelected(new Set(IDS), IDS), false, 'الكلُّ ليس «بعضًا»');
  assert.equal(isSomeSelected(new Set(), IDS), false);
});

test('★★★ التصفيةُ تقصّ التحديد — فلا يُعتمَد ثلاثةٌ لا يراها الضاغط', () => {
  const sel = new Set(['a', 'b', 'c']);
  const pruned = pruneSelection(sel, ['a']);
  assert.deepEqual([...pruned], ['a']);
  // والنقض: بلا قصٍّ يبقى 'b' و'c' محدَّدين خلف النظر.
  assert.equal(pruned.size, 1);
});

test('القصُّ يقبل الفارغ', () => {
  assert.deepEqual([...pruneSelection(null, IDS)], []);
  assert.deepEqual([...pruneSelection(new Set(['a']), [])], []);
});

test('الصفوفُ المحدَّدة بترتيب العرض لا بترتيب الضغط', () => {
  // ضُغط 'c' أوّلًا ثمّ 'a' — والخرجُ بترتيب الجدول.
  const sel = new Set(['c', 'a']);
  assert.deepEqual(selectedRows(ROWS, sel).map((r) => r.id), ['a', 'c']);
});

test('selectedCount يعدّ المحدَّدَ من المعروض وحده', () => {
  assert.equal(selectedCount(new Set(['a', 'b', 'c']), ['a', 'b']), 2);
  assert.equal(selectedCount(new Set(), IDS), 0);
  assert.equal(selectedCount(null, IDS), 0);
});

/* ═══════════════ النسخ ═══════════════ */

test('★★ الخليّةُ لا تحمل تبويبًا ولا سطرًا — وإلّا مُزّق الجدول', () => {
  assert.equal(clipCell('أ\tب'), 'أ ب');
  assert.equal(clipCell('سطر\nثانٍ'), 'سطر ثانٍ');
  assert.equal(clipCell('سطر\r\nثانٍ'), 'سطر ثانٍ');
  // والقيمةُ لا تُحذف — تُسوّى مسافتُها فقط.
  assert.match(clipCell('مخابز\tالزاوية'), /مخابز الزاوية/);
  assert.equal(clipCell(null), '');
  assert.equal(clipCell(0), '0', 'الصفرُ قيمةٌ لا فراغ');
});

test('TSV: عناوينُ ثمّ صفوف، تبويبٌ بين الأعمدة و CRLF بين الأسطر', () => {
  const tsv = toTsv(COLS, ROWS);
  const lines = tsv.split('\r\n');
  assert.equal(lines.length, 4, 'عنوانٌ وثلاثةُ صفوف');
  assert.equal(lines[0], 'الرقم\tالطرف');
  assert.equal(lines[1], 'GRN-1\tمخابز الزاوية');
  // ★ CRLF لا LF — إكسل على ويندوز يقرأ الأسطر به.
  assert.ok(tsv.includes('\r\n'));
});

test('TSV بلا عناوين عند الطلب', () => {
  const tsv = toTsv(COLS, ROWS, { headers: false });
  assert.equal(tsv.split('\r\n').length, 3);
  assert.ok(!tsv.startsWith('الرقم'));
});

test('TSV يحترم ترتيب الأعمدة ويُسقط ما لا مفتاحَ له', () => {
  const tsv = toTsv([{ key: 'party', label: 'الطرف' }, { label: 'بلا مفتاح' }, { key: 'number', label: 'الرقم' }], ROWS);
  assert.equal(tsv.split('\r\n')[0], 'الطرف\tالرقم');
});

test('TSV: الحقلُ الغائبُ يُفرَغ ولا يُكتب undefined', () => {
  const tsv = toTsv(COLS, [{ id: 'z', number: 'X-1' }]);
  assert.equal(tsv.split('\r\n')[1], 'X-1\t');
  assert.ok(!tsv.includes('undefined'));
});

test('TSV يقبل الفارغ', () => {
  assert.equal(toTsv(COLS, []), 'الرقم\tالطرف');
  assert.equal(toTsv(COLS, null), 'الرقم\tالطرف');
  // بلا أعمدةٍ لا محتوى — أسطرٌ خاليةٌ لا أسماءُ حقولٍ مخترعة.
  assert.deepEqual(new Set(toTsv(null, ROWS).split('\r\n')), new Set(['']));
});

test('★★ خطّةُ النسخ تنسخ المحدَّد', () => {
  const plan = copyPlan({ columns: COLS, rows: ROWS, selected: new Set(['b']) });
  assert.equal(plan.count, 1);
  assert.equal(plan.scope, 'selected');
  assert.ok(plan.tsv.includes('GRN-2'));
  assert.ok(!plan.tsv.includes('GRN-1'));
});

test('★ وبلا تحديدٍ تنسخ المعروضَ كلَّه — لا رسالةَ «حدّد أوّلًا»', () => {
  const plan = copyPlan({ columns: COLS, rows: ROWS, selected: new Set() });
  assert.equal(plan.count, 3);
  assert.equal(plan.scope, 'visible');
  const none = copyPlan({ columns: COLS, rows: ROWS });
  assert.equal(none.count, 3);
});

test('رسالةُ النسخ تقول ماذا نُسخ — فالنسخُ لا أثرَ له يُرى', () => {
  assert.match(copyMessage(copyPlan({ columns: COLS, rows: ROWS, selected: new Set(['a']) })), /1/);
  assert.match(copyMessage(copyPlan({ columns: COLS, rows: ROWS, selected: new Set(['a']) })), /المحدَّد/);
  assert.match(copyMessage(copyPlan({ columns: COLS, rows: ROWS })), /المعروض/);
  assert.match(copyMessage(copyPlan({ columns: COLS, rows: [] })), /لا صفوف/);
  assert.match(copyMessage(null), /لا صفوف/);
});

/* ═══════════════ الكتابة إلى الحافظة ═══════════════ */

test('الحافظةُ الحديثة تُستعمل أوّلًا', async () => {
  let got = null;
  const ok = await writeClipboard('نصّ', {
    navigator: { clipboard: { writeText: async (v) => { got = v; } } },
  });
  assert.equal(ok, true);
  assert.equal(got, 'نصّ');
});

test('★★★ ورفضُ الحافظة يتراجع إلى execCommand — لا يُستسلم على أوّل رفض', () => {
  // سياقٌ غيرُ آمن (http داخل شبكة المستودع) يرفض clipboard.writeText.
  let copied = false;
  let appended = 0;
  const fakeEl = { style: {}, setAttribute() {}, focus() {}, select() {}, remove() { appended -= 1; } };
  const env = {
    navigator: { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } },
    document: {
      createElement: () => fakeEl,
      body: { appendChild: () => { appended += 1; } },
      execCommand: (cmd) => { copied = cmd === 'copy'; return true; },
    },
  };
  return writeClipboard('نصّ', env).then((ok) => {
    assert.equal(ok, true, 'لم يتراجع — فالنسخُ يسقط في كلّ بيئةٍ غير آمنة');
    assert.equal(copied, true);
    assert.equal(appended, 0, 'العنصرُ المؤقّت لم يُرفع من الصفحة');
  });
});

test('★★ وبلا بيئةٍ تنسخ يُعاد false — ولا يُدَّعى نجاحٌ لم يقع', async () => {
  assert.equal(await writeClipboard('نصّ', { navigator: {}, document: null }), false);
  // والفارغُ لا يُنسَخ.
  assert.equal(await writeClipboard('', { navigator: { clipboard: { writeText: async () => {} } } }), false);
});

test('سقوطُ execCommand يُعاد false لا استثناءً', async () => {
  const env = {
    navigator: {},
    document: {
      createElement: () => { throw new Error('boom'); },
      body: {},
      execCommand: () => true,
    },
  };
  assert.equal(await writeClipboard('نصّ', env), false);
});
