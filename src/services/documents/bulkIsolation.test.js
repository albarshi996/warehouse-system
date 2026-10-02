/**
 * 🔒 حارسُ عزلِ الإجراء الجماعيّ — **الجماعيُّ حلقةٌ على الفرديّ لا طريقٌ
 * ثانٍ إليه** (مُمَكْنَنًا لا مكتوبًا).
 *
 * ═══ العطبُ المحروس ═══
 * الإجراءُ الجماعيُّ أقربُ شيءٍ في هذا النظام إلى بابٍ خلفيّ. ومن أراد
 * تسريعه غدًا سيجد `writeBatch` في Firestore يكتب خمسين حالةً في طلبٍ
 * واحدٍ ذرّيٍّ — وسيبدو تحسينًا نظيفًا، والاختباراتُ كلُّها ستبقى خضراء.
 * وفي الطريق يسقط:
 *   · حارسُ الأثر المخزنيّ — فيصير مستندٌ «منجَزًا» بلا حركةٍ في الدفتر.
 *   · حارسُ FEFO بالموقع — فيُسحب الجديدُ ويبقى القديم حتى يُتلف.
 *   · حارسُ السلسلة — فيُنجَز ابنٌ قبل اعتماد أبيه.
 *   · وسجلُّ التدقيق **لكلِّ مستندٍ باسم فاعله**.
 *
 * ولأنّ كلَّ ذلك في `transitionDocument` وحدها، فالشرطُ: مُنفِّذُ الجماعيّ
 * **لا يلمس Firestore**. هذا الحارسُ يمسح الاستيرادَ مسحًا آليًّا — لا
 * مراجعةَ يدٍ تنسى، ولا تعليقًا يُقرأ ثمّ يُخالَف.
 *
 * ولا شبكةَ ولا Firebase هنا — قراءةُ ملفّاتٍ فقط، فيصلح للـCI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** الملفّات التي يُحرَس عزلُها — طبقةُ الجماعيّ كلُّها. */
const BULK_FILES = ['bulkActions.js', 'bulkActionsService.js'];

/** مسارُ الملفّ أو `null` إن لم يوجد (فيسقط الحارسُ باسمه لا بغموض). */
function srcOf(name) {
  const full = path.join(HERE, name);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

/** استيرادات الملفّ — نفسُ محلّل حرّاس الشجرة القائمة. */
function importsOf(src) {
  const out = [];
  const re = /(?:import\s[^'"]*|from\s*|require\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

test('🔒 طبقةُ الجماعيّ لا تستورد Firestore ولا تهيئةَ Firebase', () => {
  const offenders = [];
  for (const name of BULK_FILES) {
    const src = srcOf(name);
    assert.ok(src, `${name} مفقود — الحارسُ يحرس ما لا وجودَ له`);
    for (const imp of importsOf(src)) {
      if (/firebase\/firestore|config\/firebase/.test(imp)) offenders.push(`${name} ← ${imp}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'الجماعيُّ لمس Firestore مباشرةً — فتجاوز حرّاس الأثر المخزنيّ وFEFO والسلسلة وسجلَّ التدقيق:\n' +
      offenders.join('\n')
  );
});

test('🔒🔒 ولا كتابةً جماعيّةً ذرّيّة: لا writeBatch ولا runTransaction ولا updateDoc', () => {
  // ★★★ الحارسُ على **النصّ** لا على الاستيراد وحده: من أعاد تصدير
  // `writeBatch` من وحدةٍ وسيطةٍ باسمٍ آخر يجتاز حارسَ الاستيراد أعلاه.
  const banned = ['writeBatch', 'runTransaction', 'updateDoc', 'setDoc', 'deleteDoc', 'addDoc'];
  const offenders = [];
  for (const name of BULK_FILES) {
    const src = srcOf(name);
    // التعليقاتُ تُنزَع أوّلًا: هذا الملفُّ يشرح الخطرَ بأسمائه، وشرحُ الخطر
    // ليس ارتكابَه. (وبلا هذا النزع يسقط الحارسُ على وثائقه نفسِها.)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const fn of banned) {
      if (new RegExp(`\\b${fn}\\s*\\(`).test(code)) offenders.push(`${name} → ${fn}()`);
    }
  }
  assert.deepEqual(offenders, [], `كتابةٌ مباشرةٌ في طبقة الجماعيّ:\n${offenders.join('\n')}`);
});

test('★★★ ومُنفِّذُ الجماعيّ يستدعي transitionDocument فعلًا — لا حارسًا على بابٍ لا أحدَ يدخله', () => {
  // النقضُ المضادّ: الحارسان أعلاه يبقيان خضراوين لو كان الملفُّ **فارغًا**
  // أو لو نسخ منطقَ النقلة بنفسه. فيُثبَت هنا أنّ المسارَ المشروع مستعملٌ.
  const src = srcOf('bulkActionsService.js');
  assert.ok(
    importsOf(src).some((i) => /documentsService\.js$/.test(i)),
    'المنفّذُ لا يستورد documentsService — فمن أين يأتي الحارسُ الفرديّ؟'
  );
  assert.match(src, /\btransitionDocument\s*\(/, 'المنفّذُ لا يستدعي transitionDocument — وحدةٌ بلا مستدعٍ للمسار الصحيح');
});

test('★★ ولا يُجمَع التنفيذُ بـPromise.all — التوازي يتصادم على عدّاد الترقيم', () => {
  const src = srcOf('bulkActionsService.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const pattern of ['Promise.all', 'Promise.allSettled']) {
    assert.ok(
      !src.includes(pattern),
      `${pattern} في المنفّذ: خمسون معاملةَ ترقيمٍ متزامنةً تتصادم على العدّاد نفسه — إهدارُ حصّةٍ وفشلٌ متقطّع`
    );
  }
  // والحلقةُ موجودةٌ فعلًا (نقضٌ مضادّ: ملفٌّ بلا حلقةٍ يجتاز ما فوق).
  assert.match(src, /for\s*\(/, 'لا حلقةَ في المنفّذ — فكيف يمرّ على المستندات؟');
});

test('★★ والسقوطُ يُعزل: الحلقةُ تلتقط الخطأَ ولا تُعيد رميَه', () => {
  const src = srcOf('bulkActionsService.js');
  assert.match(src, /catch\s*\(/, 'لا التقاطَ للخطأ — مستندٌ واحدٌ فاسدٌ يُسقط الدفعةَ كلَّها');
  // ولا `throw` داخل الحلقة: البحثُ عن رميٍ بعد أوّل `for`.
  const loopAt = src.indexOf('for (');
  const afterLoop = loopAt === -1 ? '' : src.slice(loopAt);
  const codeAfter = afterLoop
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(
    !/\bthrow\b/.test(codeAfter),
    'رميٌ داخل الحلقة أو بعدها — السقوطُ الواحد يُسقط ما بقي، وهو درسُ المرآة بعينه'
  );
});
