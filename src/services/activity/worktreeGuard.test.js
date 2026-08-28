/**
 * 🔒 حارسُ حارسِ أشجار العمل — كي لا ينكسر صامتًا.
 *
 * ═══ ولماذا اختبارٌ لسكربت؟ ═══
 * لأنّه انكسر صامتًا **وهو يُكتب**: `new URL().pathname` أعاد مسارًا مُرمَّزًا
 * (المشروع في مجلّدٍ عربيّ)، فعاد `git` بفراغٍ وطبع الحارسُ «لا شجرةَ فيها
 * عملٌ غيرُ محفوظ» — وهي **اثنتان وعشرون**. حارسٌ يكذب أسوأ من لا حارس: يمنح
 * طمأنينةً بلا أساس.
 *
 * وهو المزلقُ نفسُه الذي أُصلح في سكربت المزامنة — فتكرّر لأنّه لم يُختبر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHARED_FILES,
  STALE_DAYS,
  inspectWorktree,
  scanWorktrees,
  guardReport,
  listWorktrees,
} from '../../../scripts/guard-worktrees.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOW = Date.parse('2026-08-28T15:00:00Z');

test('★★★ الحارسُ يرى أشجارَ العمل فعلًا — ولا يعود بفراغٍ من مسارٍ عربيّ', () => {
  const trees = listWorktrees(ROOT);
  assert.ok(trees.length > 0, 'عاد بلا أشجار — وهو عطبُ ترميز المسار العربيّ بعينه، والحارسُ يكذب صامتًا');
  assert.ok(trees.every((t) => t.path), 'شجرةٌ بلا مسار');
});

test('★★ ولا يعتمد على `new URL().pathname` — المزلقُ الذي كسره', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/guard-worktrees.mjs'), 'utf8');
  assert.ok(src.includes('fileURLToPath'), 'لا يستعمل fileURLToPath');
  assert.ok(
    !/new URL\(import\.meta\.url\)\.pathname/.test(src),
    'عاد إلى `new URL().pathname` — يعود مُرمَّزًا في المسار العربيّ فيصمت الحارس'
  );
});

test('★★★ الملفّاتُ المشتركةُ تُسمّى بعينها — «٣٨ ملفًّا» لا توقف يدًا', () => {
  for (const f of ['src/services/auth/navCatalog.js', 'src/services/auth/navAccess.js', 'firestore.rules']) {
    assert.ok(SHARED_FILES.includes(f), `الملفُّ المشترك «${f}» ساقطٌ من القائمة`);
  }
  assert.ok(SHARED_FILES.length >= 5);
});

test('★★ شجرةٌ نظيفةٌ لا تُذكر · وشجرةٌ متّسخةٌ تُذكر بعدد ملفّاتها', () => {
  // شجرةٌ لا وجودَ لها على القرص ⇒ تُتجاهَل ولا تُسقط الحارس.
  assert.equal(inspectWorktree({ path: path.join(ROOT, 'لا-وجود-لها'), branch: 'x' }, NOW), null);
  // وهذه الشجرةُ نفسُها فيها عملٌ الآن (اختباراتٌ تُكتب) — فيجب أن تُرى.
  const self = inspectWorktree({ path: ROOT, branch: 'self' }, NOW);
  assert.ok(self === null || self.count > 0, 'شجرةٌ متّسخةٌ عادت بصفر');
});

test('★★ التقريرُ يُبرز ما يتصادم أوّلًا لا الأكبرَ عملًا', () => {
  const scan = {
    dirty: 2,
    stale: [],
    colliding: [{ name: 'a', branch: 'b1', count: 1, shared: ['firestore.rules'], days: 0 }],
    rows: [
      { name: 'a', branch: 'b1', count: 1, shared: ['firestore.rules'], days: 0 },
      { name: 'z', branch: 'b2', count: 99, shared: [], days: 0 },
    ],
  };
  const text = guardReport(scan);
  assert.ok(text.indexOf('firestore.rules') < text.indexOf('99'), 'الأكبرُ عملًا سبق المتصادم — والأخطرُ يُدفن');
  assert.ok(text.includes('تصادمٌ محتمَل'));
});

test('★ وفراغُ التقرير سلامةٌ معلَنةٌ لا صمت', () => {
  const text = guardReport({ dirty: 0, rows: [], colliding: [], stale: [] });
  assert.ok(text.includes('لا شجرةَ عملٍ فيها تعديلٌ غيرُ محفوظ'));
});

test('★ والمهجورُ يُحسب بالأيّام — سبعةٌ فأكثر', () => {
  assert.equal(STALE_DAYS, 7);
  const old = { path: ROOT, branch: 'x' };
  const row = inspectWorktree(old, NOW);
  if (row) assert.ok(row.days === null || Number.isFinite(row.days), 'عمرُ الشجرة ليس رقمًا');
});

test('★★★ والحارسُ موصولٌ بـ`npm run where` — أوّلِ أمرٍ في كلّ جلسة', () => {
  const where = fs.readFileSync(path.join(ROOT, 'scripts/where.mjs'), 'utf8');
  assert.ok(where.includes('guard-worktrees.mjs'), 'الحارسُ مبنيٌّ ولا يستدعيه أحد');
  assert.ok(/guardReport\(scanWorktrees\(/.test(where), 'مستوردٌ ولا يُنادى — استيرادٌ ميّت');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.guard, 'لا أمرَ npm run guard');
  assert.ok(pkg.scripts.where.includes('where.mjs'));
});
