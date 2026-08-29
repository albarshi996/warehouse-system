/**
 * 🔒 حارسُ مدخل تصدير PDF — كي يبقى المسارُ الخطِر ميّتًا.
 *
 * ═══ ما الذي يُحرَس، ولماذا هو مهمّ ═══
 * `html2pdf.js` تشحن **DOMPurify 3.3.1 مخبوزةً في بنائها**، وهي في مدى
 * الإصابة (`<= 3.4.12`). ورقّينا `dompurify` إلى `3.4.14` في الشجرة **ولم
 * تبلغ الترقيةُ ما بداخل الحزمة** — و`npm audit` يراها مُصلَحة لأنّه يقرأ
 * شجرةَ التبعيّات لا ما بداخل البناء.
 *
 * ★ **ولا تُستدعى DOMPurify إلّا في مسارٍ واحد:** `.from(نصّ)`. أمّا
 * `.from(عنصر)` فيُرسَم كما هو بلا تنظيف. فالخطرُ عندنا **صفرٌ ما دام لا
 * يُمرَّر نصّ** — وهذه حالٌ لا ضمان: سطرٌ واحدٌ غدًا يُحييه بلا شكوى.
 *
 * فصار المنعُ بنيويًّا: **مدخلٌ واحدٌ يرفض ما ليس عنصرًا**، وحارسٌ يمنع
 * استيرادَ المكتبة من دونه. وبهذين يستحيل أن يُبعث المسارُ الخطِر سهوًا.
 *
 * الخطّة: docs/خطة-تحصين-التبعيات.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertPdfSource } from './pdfExport.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** عنصرٌ زائفٌ بالعقد الذي تقرأه html2pdf نفسُها — بلا حاجةٍ إلى متصفّح. */
const fakeElement = { nodeType: 1, tagName: 'DIV' };

test('★★★ نصُّ HTML مرفوضٌ — وهو الوسيطُ الذي يُحيي DOMPurify المخبوزة', () => {
  assert.throws(
    () => assertPdfSource('<div>تقرير</div>'),
    /DOMPurify/,
    'مُرّر نصٌّ ولم يُرفض — فالمسارُ الخطِر مفتوح',
  );
});

test('★★ وكلُّ ما ليس عنصرًا مرفوض — لا يُخدع بكائنٍ يشبهه', () => {
  for (const bad of [null, undefined, 42, {}, { nodeType: 3 }, { nodeType: '1' }, []]) {
    assert.throws(() => assertPdfSource(bad), TypeError, `قُبل مصدرٌ ليس عنصرًا: ${JSON.stringify(bad)}`);
  }
});

test('★★ والعنصرُ يمرّ — فالحارسُ ليس مانعًا للعمل', () => {
  assert.doesNotThrow(() => assertPdfSource(fakeElement));
});

/**
 * ★★★ وهذا هو الحارسُ الحقيقيّ: **لا مستوردَ للمكتبة خارج المدخل**.
 *
 * فبلا هذا، يبقى `assertPdfSource` رجاءً لا حاجزًا — يكفي أن يستورد أحدُهم
 * `html2pdf.js` مباشرةً ويمرّر نصًّا ليعود كلُّ شيءٍ إلى ما كان.
 */
test('★★★ ولا يُستورد html2pdf إلّا من مدخله الواحد', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((f) => /\.(js|jsx|astro|mjs)$/.test(f));

  const ENTRY = 'src/services/reports/pdfExport.js';
  const offenders = [];
  for (const file of tracked) {
    if (file === ENTRY || file.endsWith('pdfExport.test.js')) continue;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // الاستيرادُ وحدَه لا ذِكرُ الاسم: سجلُّ المستضافات يذكرها بيانًا لا استعمالًا.
    if (/(?:import\s*\(|from)\s*["']html2pdf\.js["']/.test(text)) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    'استيرادٌ مباشرٌ لـhtml2pdf خارج مدخله. مرِّر عنصرًا عبر ' +
      `\`exportElementToPdf\` من ${ENTRY} — فالمدخلُ يرفض النصَّ الذي يُحيي DOMPurify المخبوزة`,
  );
});

/**
 * ★★ والصفحاتُ الثابتة في `public/` لا تستطيع أن تمرّ بالمدخل — تُحمّل المكتبةَ
 * بوسم `script` من `public/lib`. فتُحرَس بالقراءة: **لا `.from(` يستقبل نصًّا**.
 *
 * (وواحدةٌ اليوم: `تقرير-التوظيف-والجدول-الزمني.html` تمرّر `document.body`.)
 */
test('★★ ولا صفحةَ ثابتةٍ تمرّر نصًّا إلى html2pdf', () => {
  const pages = execFileSync('git', ['ls-files', '-z', 'public'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((f) => f.endsWith('.html') && !f.startsWith('public/archive/'));

  const offenders = [];
  for (const page of pages) {
    const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!/html2pdf/.test(text)) continue;
    // `.from("…")` أو `.from(`…`)` — نصٌّ حرفيٌّ يُحيي مسار DOMPurify.
    if (/\.from\(\s*["'`]/.test(text)) offenders.push(page);
  }

  assert.deepEqual(
    offenders,
    [],
    'صفحةٌ ثابتةٌ تمرّر نصَّ HTML إلى html2pdf — وهو المسارُ الذي يستدعي DOMPurify 3.3.1 ' +
      'المخبوزةَ في بنائها. ابنِ عنصرًا ومرّره',
  );
});

test('★★ ومستدعو التصدير يمرّون عبر المدخل فعلًا — لا مبنيٌّ بلا مستعمِل', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

  const users = tracked.filter((f) => {
    if (f.startsWith('src/services/reports/pdfExport')) return false;
    return /exportElementToPdf/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  });

  assert.ok(
    users.length >= 2,
    `المدخلُ بلا مستدعين (${users.length}) — إمّا لم يُوصل، وإمّا عاد أحدُهم يستورد المكتبةَ رأسًا`,
  );
});
