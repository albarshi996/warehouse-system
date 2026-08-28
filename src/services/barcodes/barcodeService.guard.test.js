/**
 * 🔒 حارس خدمة سجلّ الباركود — فحصٌ ساكن للنصّ بلا شبكة (نمط `lpnService.guard`).
 *
 * الوعد: «تنفّذ ولا تقرّر». وهذا **يُقاس** لا يُوعَد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, 'barcodeService.js'), 'utf8');
const RULES = fs.readFileSync(path.join(DIR, '..', '..', '..', 'firestore.rules'), 'utf8');

test('🔒 لا دالّة حذفٍ في الخدمة — النصّ اشترط سجلًّا لا يُحذف من الواجهة التشغيليّة', () => {
  assert.doesNotMatch(SRC, /deleteDoc|deleteField|\.delete\(/);
});

test('🔒 الحكم مستورَدٌ من الوحدات الخالصة — لا قاعدةَ عملٍ تُكتب في طبقة التخزين', () => {
  assert.match(SRC, /from '\.\/barcodeCode\.js'/);
  assert.match(SRC, /from '\.\/barcodeKinds\.js'/);
  assert.match(SRC, /from '\.\/barcodeRegistry\.js'/);
  assert.match(SRC, /generateVerdict\(/, 'الصلاحية والسياق يُحكمان بالمستورَد');
  assert.match(SRC, /valueSourceProblem\(/, '«النظام يولّد لا الموظّف» يُفرض قبل الكتابة');
  assert.match(SRC, /applyPrint\(/);
  assert.match(SRC, /applyStatus\(/);
  assert.match(SRC, /reuseProblem\(/);
});

test('🔒 التفرّد يفرضه المعرّف والمعاملة معًا — لا فحصٌ يسبق الكتابة وحده', () => {
  assert.match(SRC, /doc\(db, BARCODES, scan\.code\)/, 'المعرّف هو القيمة نفسها');
  assert.match(SRC, /snap\.exists\(\)\)\s*\{[\s\S]{0,120}throw/, 'والمعاملة تقرأ قبل أن تكتب');
  const transactions = SRC.match(/runTransaction/g) ?? [];
  assert.ok(transactions.length >= 4, `أربع معاملاتٍ على الأقلّ — وُجد ${transactions.length}`);
});

test('🔒 المعرّف الحتمي لقيد الطباعة — انقطاعٌ لا يضاعف نسخةً في السجلّ', () => {
  assert.match(SRC, /`copy-\$\{out\.record\.copy\}`/);
});

test('🔒 هويّة الكاتب من Auth مباشرة — شرط قواعد الأمان', () => {
  assert.match(SRC, /auth\?\.currentUser\?\.uid/);
  assert.match(SRC, /createdByUid: currentUid\(\)/);
});

test('أسماء المجموعات كما في المتتبّع', () => {
  assert.match(SRC, /const BARCODES = 'barcodes'/);
  assert.match(SRC, /const PRINTS = 'prints'/);
  assert.match(SRC, /const COUNTERS = 'barcode_counters'/);
});

test('🔒 القواعد تحرس المجموعات الثلاث — ولا حذفَ في أيٍّ منها', () => {
  assert.match(RULES, /match \/barcodes\/\{value\}/, 'سجلّ الباركود محروسٌ بقاعدةٍ معلنة');
  assert.match(RULES, /match \/prints\/\{printId\}/, 'وسجلّ الطباعات كذلك');
  assert.match(RULES, /match \/barcode_counters\/\{counterKey\}/);

  const block = RULES.slice(RULES.indexOf('match /barcodes/{value}'));
  const scoped = block.slice(0, block.indexOf('match /barcode_counters'));
  const deletes = scoped.match(/allow delete: if ([^;]+);/g) ?? [];
  assert.ok(deletes.length >= 2, 'قاعدةُ حذفٍ لكلٍّ من السجلّ وطباعاته');
  for (const d of deletes) assert.match(d, /if false/, 'ولا حذفَ في أيٍّ منها');
});

test('🔒 العدّاد يزيد واحدًا وإلى الأمام فقط — كعدّاد الطبالي', () => {
  const block = RULES.slice(RULES.indexOf('match /barcode_counters/{counterKey}'));
  assert.match(block.slice(0, 400), /request\.resource\.data\.seq == resource\.data\.seq \+ 1/);
});

test('🔒 التسجيل المتسامح يقول إنّه استدراك — فلا يُقرأ قيدٌ رجعيٌّ إنشاءً', () => {
  assert.match(SRC, /BACKFILL/);
  assert.match(SRC, /استدراكٌ بأثرٍ رجعيّ/);
});
