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

test('🔒 طبقة lpn لا تستورد إلّا للقراءة المشروعة — لا استيراد لخدمة قيد الدفتر ولا كتابةِ مستندات', () => {
  // الطبقة تقرأ المنطق الخالص القائم (balanceKey · locationCode · reasonCodes…)
  // ولا تستورد ledgerService (القيد) ولا documentsService (الكتابة) — حركتها
  // تتبع قيدًا وقع، ولا تُنشئ قيدًا ولا مستندًا من داخلها (القاعدة: البوابة
  // تقيّد بمستنداتها، والطبلية غلافٌ يركب فوقها).
  const forbidden = [/ledger\/ledgerService\.js/, /documents\/documentsService\.js/];
  const offenders = [];
  for (const file of jsFilesUnder(path.join(SERVICES, 'lpn'))) {
    for (const imp of importsOf(file)) {
      if (forbidden.some((re) => re.test(imp))) offenders.push(`${path.relative(SERVICES, file)} ← ${imp}`);
    }
  }
  assert.deepEqual(offenders, [], `طبقة الطبالي لا تكتب دفترًا ولا مستندًا من داخلها:\n${offenders.join('\n')}`);
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
