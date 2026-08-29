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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'LineItemsTable.jsx');
const ENGINE = path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'DocumentEngine.jsx');
const table = fs.readFileSync(TABLE, 'utf8');
const engine = fs.readFileSync(ENGINE, 'utf8');

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
  assert.match(engine, /function handleBulkPaste\(nextLines, codes\)/);
});

test('★ والخانةُ تقرأ الخاصّيّة — لا تُمرَّر إلى فراغ', () => {
  assert.match(table, /function Cell\(\{[^}]*onBulkPaste[^}]*\}\)/);
});
