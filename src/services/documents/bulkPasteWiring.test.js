/**
 * 🔒🔒 حارسُ وصل اللصق الجماعيّ ‹BULK-102› — المكوّن واحدٌ لـ٤٥ مستندًا.
 *
 * ═══ لماذا حارسٌ يقرأ المصدر ═══
 * `LineItemsTable.jsx` يخدم ٤٥ مخطّطًا، ومسارُ قارئ الباركود يمرّ بالخانة
 * نفسِها التي أُضيف إليها اللصق. فأيّ انحدارٍ هنا يعمّ البوّابة كلَّها —
 * والشرطُ المكتوب في الخطّة: «**باختبارٍ يُثبته لا بالظنّ**».
 *
 * ولا مُصيّرَ DOM في هذه البوّابة (اختباراتٌ خالصةٌ في node)، فالحارسُ
 * شقّان يكمل أحدهما الآخر:
 *   ① **القرار** يُختبر خالصًا: متى يُلتقط اللصقُ ومتى يُترك للمتصفّح.
 *   ② **الوصل** يُفحص في المصدر: أنّ `Enter ⇒ onCommit` ما زال قائمًا،
 *      وأنّ `preventDefault` **مشروطٌ** بالقرار لا مُطلَق.
 * والفحصُ الحيّ في المتصفّح يبقى شرطَ الإقفال (BULK-201) لا بديلَ عنه.
 *
 * ⚠️ وإن سقط هذا الحارس فالعلاجُ إصلاحُ الوصل لا تليينُ الشرط.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pasteDecision, pastedCodes } from './bulkPaste.js';
import { contentLines, emptyDocument } from './schemaUtils.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'LineItemsTable.jsx');
const ENGINE = path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'DocumentEngine.jsx');
const table = fs.readFileSync(TABLE, 'utf8');
const engine = fs.readFileSync(ENGINE, 'utf8');
const print = fs.readFileSync(path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'DocumentPrint.jsx'), 'utf8');
const modal = fs.readFileSync(path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'InlineCreateModal.jsx'), 'utf8');

const ctx = (text) => ({
  text,
  startIndex: 0,
  columnKeys: ['sku', 'description', 'qty'],
  startColumnKey: 'sku',
  lineCount: 1,
});

/* ───────── ① القرار: لا يُلتقط إلّا ما يعجز عنه القديم ───────── */

test('★★ لصقُ كودٍ واحدٍ يُترك للمتصفّح — لا يُغيَّر ما لا يحتاج تغييرًا', () => {
  assert.equal(pasteDecision(ctx('ITM-1')).kind, 'default');
  assert.equal(pasteDecision(ctx('ITM-1\r\n')).kind, 'default'); // كودٌ واحدٌ بذيل إكسل
  assert.equal(pasteDecision(ctx('')).kind, 'default');
  assert.equal(pasteDecision(ctx('   ')).kind, 'default');
  assert.equal(pasteDecision(undefined).kind, 'default');
});

test('لصقةُ الأسطر تُلتقط، وتُعيد خطّةً بصفوفها', () => {
  const d = pasteDecision(ctx('ITM-1\nITM-2\nITM-3'));
  assert.equal(d.kind, 'bulk');
  assert.equal(d.plan.rows.length, 3);
  assert.equal(d.plan.appendCount, 2);
});

test('لصقةٌ في عمودٍ لا يعرفه الجدول تُترك للمتصفّح — لا التقاطَ بلا خطّة', () => {
  const d = pasteDecision({ ...ctx('A\nB'), startColumnKey: 'ghost' });
  assert.equal(d.kind, 'default');
});

test('أكوادُ اللصقة تُقرأ بفهارسها، والفارغُ لا يُسأل عنه الماستر', () => {
  const d = pasteDecision(ctx('ITM-1\n\t9\nITM-3'));
  assert.deepEqual(pastedCodes(d.plan, 'sku'), [
    { index: 0, value: 'ITM-1' },
    { index: 2, value: 'ITM-3' },
  ]);
});

/* ───────── ② الوصل: ما وُعد به موصولٌ فعلًا ───────── */

test('★★ مسارُ قارئ الباركود قائمٌ: Enter ⇒ onCommit، ولم يُمسّ', () => {
  assert.match(table, /قارئ الباركود «يكتب» ثم يرسل Enter/);
  assert.match(table, /if \(e\.key === 'Enter'\) \{\s*e\.preventDefault\(\);\s*onCommit\?\.\(e\.currentTarget\.value\);/);
  // ومغادرةُ الحقل تستدعي أيضًا — الطريقان الأصليّان كلاهما حيّ
  assert.match(table, /onBlur=\{\(e\) => onCommit\?\.\(e\.target\.value\)\}/);
});

test('★★ منعُ السلوك الافتراضيّ **مشروطٌ** بالالتقاط لا مُطلَق', () => {
  // preventDefault داخل شرطِ ما يُعيده الملتقِط — ولو صار مطلقًا لَما لُصق كودٌ مفرد أبدًا
  assert.match(table, /if \(onBulkPaste\?\.\(e\.clipboardData\?\.getData\('text'\) \?\? ''\)\) e\.preventDefault\(\);/);
  assert.equal(/onPaste=\{\(e\) => \{\s*e\.preventDefault\(\);/.test(table), false);
});

test('الملتقِطُ يُمرَّر للخانات المرجعيّة وحدَها — لا لكلّ عمود', () => {
  assert.match(table, /onBulkPaste=\{lookupKind\(c\) \? \(text\) => handleBulkPaste\(c, i, text\) : null\}/);
});

test('★ ولا مُلتقِطَ بلا مستدعٍ: المحرّك يمرّر `onBulkPaste` للجدول فعلًا', () => {
  assert.match(engine, /onBulkPaste=\{handleBulkPaste\}/);
  assert.match(engine, /async function handleBulkPaste\(nextLines, codes, columnKey\)/);
});

/* ───────── ③ الجملة موصولةٌ فعلًا (BULK-103) ───────── */

test('★★ الحلُّ الجماعيّ موصول: الجملةُ تُسأل والنتائجُ تُكتب دفعةً واحدة', () => {
  assert.match(engine, /await resolveItemCodes\(/);
  // ولا `setDoc` داخل حلقةٍ — التحديثُ لا يتضاعف بعدد الأصناف
  assert.equal(/for \([^)]*\) \{[\s\S]{0,400}?setDoc\(/.test(engine), false);
});

test('★ والرسالةُ واحدةٌ تلخّص الثلاثة — لا عشرون تومض', () => {
  assert.match(engine, /batch\.ok/);
  assert.match(engine, /batch\.unknown/);
  assert.match(engine, /batch\.failed/);
  assert.match(engine, /dups\.size/);
  assert.match(engine, /duplicateGroups\(codes\)/);
});

test('★ والخانةُ تقرأ الخاصّيّة — لا تُمرَّر إلى فراغ', () => {
  assert.match(table, /function Cell\(\{[^}]*onBulkPaste[^}]*\}\)/);
});

/* ───────── ④ الحكمُ موصولٌ ولا يُحفظ (BULK-104) ───────── */

test('★★ العلامةُ حالةُ شاشةٍ خارج `doc` — لا تسكن البندَ فلا تُحفظ', () => {
  assert.match(engine, /const \[pasteMarks, setPasteMarks\] = useState\(null\)/);
  // ولا تُكتب في البنود: لا مفتاحَ علامةٍ يُضاف إلى سطرٍ في أيّ موضع
  assert.equal(/lines?\[[^\]]*\]\.(verdict|note|unknown|mark)\s*=/.test(engine), false);
  assert.equal(/_(unknown|verdict|note)\s*:/.test(engine), false);
});

test('★ والحكمُ يصل الجدول خاصّيّةً، والجدولُ يقرؤه للكود وحدَه', () => {
  assert.match(engine, /skuVerdict=\{\(value\) =>/);
  assert.match(engine, /skuCellVerdict\(value, \{ statuses: pasteMarks\?\.statuses, duplicates: pasteDuplicates \}\)/);
  assert.match(table, /if \(column\.key === 'sku' && skuVerdict\) return skuVerdict\(line\[column\.key\]\)/);
  assert.match(table, /verdict=\{cellVerdict\(c, line\)\}/);
});

test('★★ والدمجُ زرٌّ لا قاعدة: يُستدعى من onClick لا من مسار اللصق', () => {
  assert.match(engine, /onClick=\{\(\) => mergeDuplicate\(code\)\}/);
  assert.match(engine, /function mergeDuplicate\(code\)/);
  // لا دمجَ تلقائيّ: `mergeDuplicateLines` لا تُستدعى داخل `handleBulkPaste`
  const bulk = engine.slice(engine.indexOf('async function handleBulkPaste'), engine.indexOf('function mergeDuplicate'));
  assert.equal(bulk.includes('mergeDuplicateLines'), false);
});

test('★ والمكرّرُ يُقاس على البنود الآن — فيذهب التنبيهُ بالدمج بلا أثرٍ عالق', () => {
  assert.match(engine, /const pasteDuplicates = useMemo\(/);
  assert.match(engine, /duplicateGroups\(\(doc\?\.lines \|\| \[\]\)\.map\(/);
});

/* ───────── ⑤ القصُّ قبل الصفوف (BULK-105) ───────── */

test('★★ قصُّ الفارغ يقرؤه الحفظُ والطباعةُ معًا — لا موضعَ يُنسى', () => {
  // الحفظ
  assert.match(engine, /const lines = contentLines\(doc\.lines\)/);
  assert.equal(engine.includes('.filter((l) => !isEmptyLine(l))'), false); // لا نسخةَ ثانية
  // الطباعة
  assert.match(print, /contentLines\(doc\?\.lines\)\.map\(/);
  assert.equal(/\{\(doc\?\.lines \|\| \[\]\)\.map\(\(line, i\)/.test(print), false);
});

test('★★ وعشرةُ صفوفٍ للإدخال لا تعني عشرةَ بنودٍ في المستند', () => {
  const COLUMNS = ['sku', 'description', 'qty'];
  const blank = () => Object.fromEntries(COLUMNS.map((k) => [k, '']));
  const lines = [{ ...blank(), sku: 'ITM-1' }, blank(), blank(), blank(), blank(), blank(),
                 blank(), blank(), blank(), blank()];
  assert.equal(contentLines(lines).length, 1);
  assert.equal(contentLines([]).length, 0);
  assert.equal(contentLines(null).length, 0);
  // وما لا فارغَ فيه يعود كما هو
  const full = [{ sku: 'A' }, { sku: 'B' }];
  assert.deepEqual(contentLines(full), full);
});

test('★ والمستندُ الجديد يبدأ بصفوفٍ للإدخال — والقديمُ لا يُمسّ', () => {
  const schema = { sections: [{ kind: 'table', columns: [{ key: 'sku' }, { key: 'qty' }] }] };
  assert.equal(emptyDocument(schema).lines.length, 1); // الافتراضُ لم يتغيّر لمن لم يطلب
  assert.equal(emptyDocument(schema, { rows: 10 }).lines.length, 10);
  assert.deepEqual(emptyDocument(schema, { rows: 3 }).lines[2], { sku: '', qty: '' });
  // والصفوفُ مستقلّةٌ لا مرجعٌ واحدٌ مكرّر — وإلّا لَغيّر بندٌ إخوتَه
  const doc = emptyDocument(schema, { rows: 3 });
  doc.lines[0].sku = 'X';
  assert.equal(doc.lines[1].sku, '');
});

test('★★ وصفوفُ الإدخال للمحرّك وحدَه — لا للمعالج المصغّر ولا لغيره', () => {
  assert.match(engine, /emptyDocument\(schema, \{ rows: NEW_DOCUMENT_ROWS \}\)/);
  assert.match(engine, /const NEW_DOCUMENT_ROWS = 10/);
  assert.match(modal, /emptyDocument\(schema\)\)/); // المعالجُ كما كان: بندٌ واحد
});
