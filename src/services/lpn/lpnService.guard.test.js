/**
 * 🔒 حارس خدمة الطبالي — فحصٌ ساكن للنصّ بلا شبكة (نمط حرّاس الشجرة).
 *
 * الخدمة «تنقل ولا تقرّر» — وهذا يُقاس لا يُوعَد: لا حذف، الحكم مستورَدٌ من
 * الوحدات الخالصة، والهويّة والحالة والحدث تمرّ بمعاملاتٍ لا كتاباتٍ عمياء.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'lpnService.js'), 'utf8');

test('🔒 لا دالّة حذفٍ في الخدمة أصلًا — الإلغاء حالةٌ وحدثٌ لا محو', () => {
  assert.doesNotMatch(SRC, /deleteDoc|deleteField|\.delete\(/, 'الحذف ممنوعٌ من المصدر لا من القاعدة وحدها');
});

test('🔒 الحكم مستورَدٌ من الوحدات الخالصة — الخدمة لا تحمل مصفوفة انتقالاتٍ خاصّة', () => {
  assert.match(SRC, /from '\.\/lpnCode\.js'/);
  assert.match(SRC, /from '\.\/lpnLifecycle\.js'/);
  assert.match(SRC, /from '\.\/lpnEvents\.js'/);
  assert.match(SRC, /unitTransitionProblem/, 'الانتقال يُحكم بالمصفوفة المستورَدة');
  assert.match(SRC, /buildEvent/, 'الحدث يُبنى بالمنطق المستورَد لا نثرًا');
});

test('🔒 الكتابات الحسّاسة معاملاتٌ ذرّية: الهويّة والإنشاء والانتقال والوسم والمحتوى', () => {
  const transactions = SRC.match(/runTransaction/g) ?? [];
  assert.ok(transactions.length >= 6, `ستّ معاملاتٍ على الأقلّ — وُجد ${transactions.length}`);
  assert.match(SRC, /snap\.exists\(\)\)\s*throw/, 'الإنشاء يقرأ قبل أن يكتب — الهويّة لا يُعاد استخدامها');
});

test('🔒 المعرّف الحتمي لحدث المستند — إعادة المعالجة لا تضاعف', () => {
  assert.match(SRC, /docEventId\(docRef\.id, lpn\)/, 'حدث الانتقال بمعرّف docId__lpn');
});

test('🔒 هوية الكاتب من Auth مباشرة — شرط قواعد الأمان byUid', () => {
  assert.match(SRC, /auth\?\.currentUser\?\.uid/);
  assert.match(SRC, /byUid: currentUid\(\)/);
});

test('أسماء المجموعات كما في المتتبّع: handling_units وأحداثها وlpn_counters', () => {
  assert.match(SRC, /'handling_units'/);
  assert.match(SRC, /'lpn_counters'/);
  assert.match(SRC, /'events'/);
});

// ═══ ما كشفته المراجعة العدائية 2026-08-26 ═══

test('🔒 حارس فقدان التحديث: تغيير المحتوى يقارن رقم النسخة داخل المعاملة ويزيده', () => {
  assert.match(SRC, /Number\.isInteger\(baseRev\)/, 'النسخة إلزاميّة — بلا مقارنةٍ تُمحى سحبةُ زميل');
  assert.match(SRC, /currentRev !== baseRev/, 'وتُقارن بالحيّة داخل المعاملة');
  assert.match(SRC, /contentRev: currentRev \+ 1/, 'وتتزايد مع كلّ تغيير');
  assert.match(SRC, /contentRev: INITIAL_CONTENT_REV/, 'وتولد مع الكيان');
});

test('🔒 مسّ الحمولة يمرّ بحارس الحالة والأوسمة على البيانات الحيّة لا على نسخة الشاشة', () => {
  assert.match(SRC, /contentChangeProblem\(unit\)/);
});

test('🔒 معرّف الحدث إلزاميٌّ صريح — لا معرّفَ مشتقًّا يبتلع حدثًا بحدث', () => {
  assert.match(SRC, /بلا معرّفٍ صريح/);
  assert.doesNotMatch(SRC, /\$\{built\.event\.type\}__\$\{built\.event\.at\}__\$\{built\.event\.actor\}/, 'المعرّف المشتقّ المتصادم أُزيل');
});

test('🔒 moveUnit حتميٌّ فعلًا: يقرأ حدث المستند أوّلًا فلا يُرجع مستندٌ قديمٌ طبليةً نُقلت', () => {
  assert.match(SRC, /const already = await tx\.get\(eventRef\)/);
  assert.match(SRC, /if \(already\.exists\(\)\) return/);
});

test('🔒 المطبّع الواحد للكتابة والقراءة — استعلام الموقع لا يفترق عن تخزينه', () => {
  const calls = SRC.match(/normalizeLocationCode\(/g) ?? [];
  assert.ok(calls.length >= 3, `الإنشاء والنقل والاستعلام — وُجد ${calls.length}`);
});
