/**
 * 🔒 حارس عدم التعارض — ح-٢ مُمَكْنَنًا: **الدفتر لا يعرف الطبلية.**
 *
 * تفويض المالك 2026-08-26: «أضِف دون أن تُتلف شيئًا يعمل». والإتلاف الصامت
 * أخطره استيرادٌ عكسيّ: يومَ يستورد الدفترُ أو الأرصدةُ أو محرّكُ المستندات
 * شيئًا من طبقة الطبالي يصير القائمُ معتمِدًا على الجديد — فعطبٌ في الجديد
 * يُسقط القديم، وهو عين ما مُنع.
 *
 * الاتجاه المشروع واحد: `lpn/` يقرأ القائم، والقائم لا يعرف `lpn/` أبدًا.
 * هذا الحارس يمسح الاستيرادات مسحًا آليًّا (نمط حرّاس الشجرة في npm test:
 * حارس o_theme وحارس المحو) — لا مراجعة يدٍ تنسى.
 *
 * لا شبكة ولا Firebase — قراءة ملفّات فقط، فيصلح للـCI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** النوى المحميّة — ما كان يعمل قبل الطبقة ويجب أن يبقى غير عارفٍ بها. */
const PROTECTED = ['ledger', 'balances', 'documents'];

/** كلّ ملفّات js تحت مجلد (بلا اختبارات — الاختبار يستورد ما يشاء ليُثبت). */
function jsFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) out.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** استيرادات الملف — سطور import/require التي تشير إلى مسار. */
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:import\s[^'"]*|from\s*|require\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

test('🔒 النوى المحميّة (ledger · balances · documents) لا تستورد من lpn — الاتجاه واحدٌ للأبد', () => {
  const offenders = [];
  for (const nucleus of PROTECTED) {
    for (const file of jsFilesUnder(path.join(SERVICES, nucleus))) {
      for (const imp of importsOf(file)) {
        if (/(^|\/)lpn\//.test(imp)) {
          offenders.push(`${path.relative(SERVICES, file)} ← ${imp}`);
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `الدفتر لا يعرف الطبلية (ح-٢): استيرادٌ عكسيّ يجعل القائم معتمِدًا على الجديد فيُتلفه عطبُه —\n${offenders.join('\n')}`
  );
});

test('🔒🔒 لا ملفَّ في lpn يقيّد الدفتر بنفسه — القيد للمستند وحده', () => {
  // ★ هذا هو الشرط الجوهريّ ولا استثناء له: `ledgerService` هو الذي يكتب
  // `stock_moves` ويحرّك الأرصدة. وطبقةُ الطبالي **غلافُ تجميعٍ** يركب فوق
  // المستندات؛ فلو قيّدت بنفسها لَتحرّكت البضاعة مرّتين — مرّةً بمستندها
  // ومرّةً بطبليتها — وهي عين علّة استبعاد GP وVSR من جدول القيد.
  const offenders = [];
  for (const file of jsFilesUnder(path.join(SERVICES, 'lpn'))) {
    for (const imp of importsOf(file)) {
      if (/ledger\/ledgerService\.js/.test(imp) || /\bpostDocument\b/.test(imp)) {
        offenders.push(`${path.relative(SERVICES, file)} ← ${imp}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `طبقة الطبالي لا تقيّد دفترًا من داخلها:\n${offenders.join('\n')}`);
});

test('🔒 إنشاء المستندات محصورٌ بجسرٍ واحدٍ مسمّى — لا يتفرّق على الطبقة', () => {
  /*
   * ═══ لماذا ضُيّق هذا الشرط بدل أن يبقى منعًا مطلقًا؟ (2026-08-27 · LPN-213) ═══
   *
   * كان الشرط: «لا تستورد lpn من documentsService إطلاقًا». وأوقف هذا الحارسُ
   * عملًا **نصّت عليه الخطة نفسها**: LPN-213 — «الجلسة تجمع طباليها المعتمدة
   * وتولّد GRN بالبيانات نفسها». فراجعتُ الشرط لا العمل.
   *
   * والتمييز الذي كان غائبًا: **إنشاء مسوّدةِ مستندٍ ليس قيدًا**. المحرّك
   * يقيّد عند «منجَز» بعد اعتماد صاحب الصلاحية — فتوليدُ GRN مسوّدةً يسلّم
   * القرار لصاحبه ولا ينتزعه. أمّا القيدُ المباشر فممنوعٌ بلا استثناء
   * (الاختبار أعلاه).
   *
   * ويبقى الحصر: **ملفٌّ واحدٌ مسمّى** يملك هذا الباب. فمتى تفرّق الإنشاء
   * على الطبقة صار لكلّ شاشةٍ طريقُها إلى المحرّك، وضاع الموضع الذي يُراجَع.
   */
  const ALLOWED = new Set(['receivingService.js']);
  const offenders = [];
  for (const file of jsFilesUnder(path.join(SERVICES, 'lpn'))) {
    if (ALLOWED.has(path.basename(file))) continue;
    for (const imp of importsOf(file)) {
      if (/documents\/documentsService\.js/.test(imp)) {
        offenders.push(`${path.relative(SERVICES, file)} ← ${imp}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `إنشاء المستندات محصورٌ بـ${[...ALLOWED].join(' · ')}:\n${offenders.join('\n')}`
  );
});

test('وحدات المنطق الخالص في lpn لا تستورد Firebase — تُختبر وحدها بلا شبكة', () => {
  const offenders = [];
  for (const file of jsFilesUnder(path.join(SERVICES, 'lpn'))) {
    if (path.basename(file).endsWith('Service.js')) continue; // الخدمة وحدها تعرف الشبكة
    for (const imp of importsOf(file)) {
      if (/firebase/i.test(imp)) offenders.push(`${path.relative(SERVICES, file)} ← ${imp}`);
    }
  }
  assert.deepEqual(offenders, [], `المنطق الخالص لا يعرف الشبكة:\n${offenders.join('\n')}`);
});
