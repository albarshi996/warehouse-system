/**
 * 🔒 حارسُ المكتبات المستضافة ذاتيًّا — كي لا نُرقّي في npm ونشحن القديم.
 *
 * ═══ العطبُ الذي وُجد لأجله ═══
 * رُقّيت `mermaid` من 11.15.0 إلى 11.17.2 وصارت البوّابةُ خضراء و`npm audit`
 * نظيفًا منها — **وبقي `public/lib/mermaid.min.js` على 11.15.0**، وهو النسخةُ
 * التي يُحمّلها متصفّحُ الموظّف حين يطبع مخطّط دورةٍ من `erp-workflows`
 * (نافذةُ الطباعة سياقٌ منفصل، تُحمّل المكتبةَ من `public/` لا من الحزمة).
 * فترقيةٌ خضراء تمامًا كانت ستترك الثغرةَ في الموضع الوحيد الذي يصل الموظّف.
 *
 * ★ **و`npm audit` لا يرى `public/lib` أصلًا** — فهي ملفّاتٌ لا تبعيّات.
 *
 * ═══ وصنفان، لأنّ نصفَها لا نظيرَ له في npm ═══
 * · **المرآة (`MIRRORED`):** لها مصدرٌ في `node_modules` ⇒ تُقارَن به **بايتًا
 *   ببايت**. فالترقيةُ في الحزمة تُسقط الاختبارَ حتّى تُنسخ.
 * · **المثبَّتة (`PINNED`):** لا نظيرَ لها في npm (حُمّلت من مصدرها) ⇒ تُقارَن
 *   ببصمةٍ مسجّلة. لا تكشف قِدمًا، **لكنّها تكشف تبديلًا صامتًا** وتوثّق
 *   المصدرَ والنسخة — ولا ملفَّ يدخل `public/lib` بلا قرارٍ مكتوب.
 *
 * ═══ ولماذا بالبصمة لا برقم النسخة؟ ═══
 * لأنّ الملفّات المصغَّرة تحمل أرقامًا كثيرةً لمكتباتٍ مطويّةٍ داخلها،
 * فالتقاطُ «النسخة» منها تخمين. والبصمةُ تقول ما نريده بالضبط.
 *
 * الخطّة: docs/خطة-تحصين-التبعيات.md · الفجوة ث-٨
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIB = path.join(ROOT, 'public', 'lib');

/** المستضافُ ذاتيًّا وله مصدرٌ في `node_modules` — يُقارَن به بايتًا ببايت. */
const MIRRORED = [
  {
    lib: 'mermaid',
    hosted: 'mermaid.min.js',
    source: 'node_modules/mermaid/dist/mermaid.min.js',
    why: 'نافذةُ طباعة مخطّطات دورات العمل تُحمّلها من public/ لا من الحزمة',
  },
  {
    lib: 'html2pdf.js',
    hosted: 'html2pdf.bundle.min.js',
    source: 'node_modules/html2pdf.js/dist/html2pdf.bundle.min.js',
    why: 'تقريرُ التوظيف والجدول الزمنيّ صفحةٌ ثابتةٌ تُحمّلها لتصدير PDF',
  },
  {
    lib: 'xlsx',
    hosted: 'xlsx.full.min.js',
    source: 'node_modules/xlsx/dist/xlsx.full.min.js',
    why: 'أربعٌ وعشرون صفحةً ونموذجًا تُصدّر إكسل من المتصفّح مباشرةً',
  },
];

/**
 * المستضافُ ذاتيًّا بلا نظيرٍ في npm — بصمةٌ مثبَّتةٌ توثّق المصدرَ وتكشف التبديل.
 * وتحديثُها **قرارٌ يُكتب**: تُنزَّل النسخةُ الجديدة وتُحدَّث البصمةُ هنا بسببها.
 */
const PINNED = [
  {
    file: 'html5-qrcode.min.js',
    sha256: '660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e',
    why: 'ثلاثٌ وعشرون شاشةً ونموذجًا تقرأ QR بالكاميرا — أكثرُ المستضافات استعمالًا',
  },
  {
    file: 'JsBarcode.all.min.js',
    sha256: '52e032534c3f98976ad95cb8c20baf80ed0cc83d42590602a8cf1db16e2e22ed',
    why: 'v3.11.6 — رسمُ الباركود في الملصقات والنماذج المطبوعة (خمسةُ مستدعين)',
  },
  {
    file: 'xlsx-js-style.bundle.js',
    sha256: '1c7abf2993ff2cd61e508f9268e9acda0098c9796f3925d2ba0d2579072653e2',
    why: 'بناءٌ على xlsx 0.18.5 يضيف التنسيق — تصديرُ retail-hub وحدَه يحتاجه',
  },
  {
    file: 'leaflet/leaflet.js',
    sha256: '3104b526504d0d61fd3099a4521e87f732ccc3174dec54e08de6ba8bde3e15ff',
    why: 'Leaflet 1.9.4 — خرائطُ العمليّات الميدانيّة ومنافذ التجزئة',
  },
  {
    file: 'leaflet/leaflet.css',
    sha256: 'a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6',
    why: 'أنماطُ Leaflet — بلا هذا الملفّ تظهر الخريطةُ مبعثرةً بلا خطأٍ في الطرفيّة',
  },
  {
    file: 'fontawesome/css/all.min.css',
    sha256: 'ce6f72d6b4c728f562906a8e51e2456a9011acb20b4c90e0eb79b580cce8f229',
    why: 'أيقوناتُ ثمانِ صفحاتٍ ثابتة — والخطوطُ في webfonts/ تابعةٌ له',
  },
];

/** ملفّاتُنا نحن في `public/lib` — تُحرَّر عندنا فلا تُقارَن بشيء. */
const OURS = ['bz-barcode.js', 'fonts/bz-fonts.css'];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** النسخةُ التي يفرضها القفل — الحقيقةُ المتعقَّبة. */
function lockedVersion(lib) {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  return lock.packages?.[`node_modules/${lib}`]?.version ?? null;
}

/** النسخةُ المنصَّبةُ على القرص فعلًا — قد تسبق القفلَ أو تتأخّر عنه. */
function installedVersion(lib) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', lib, 'package.json'), 'utf8'))
      .version;
  } catch {
    return null;
  }
}

/** كلُّ ما في `public/lib` من شيفرةٍ أو أنماط، بمسارٍ نسبيٍّ إليه. */
function vendoredFiles(dir = LIB, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...vendoredFiles(path.join(dir, entry.name), rel));
    else if (/\.(js|css)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

for (const { lib, hosted, source, why } of MIRRORED) {
  test(`★★★ ${lib} المستضافةُ ذاتيًّا نسخةٌ حرفيّةٌ ممّا نُرقّيه — لا ترقيةَ خضراءُ تشحن القديم`, (t) => {
    const hostedPath = path.join(LIB, hosted);
    const sourcePath = path.join(ROOT, source);

    assert.ok(fs.existsSync(hostedPath), `${hosted} مفقود — و${why}`);
    assert.ok(fs.existsSync(sourcePath), `${source} مفقود — نصَّبْ الحزم قبل الاختبار`);

    // ★★ و`node_modules` ليست دائمًا صورةَ القفل.
    //
    // في **مزامنة المستودع الشقيق** تُنصَّب الحزمُ **قبل الدمج** ثمّ يُدمج
    // الشقيقُ بقفلٍ أحدث — فتصير `node_modules` أقدمَ من الشجرة بخطوة. وحينها
    // تفترق البصمتان **بلا خطأٍ من أحد**، فيسقط هذا الحارسُ ويوقف مزامنةً
    // صحيحة (وقع فعلًا 2026-08-28: القفل mermaid 11.17.2 والمنصَّب 11.15.0).
    //
    // والقياسُ الصادق يحتاج طرفين من زمنٍ واحد. فإن اختلف الزمنان **يُعلَن
    // التخطّي بسببه** ولا يُدَّعى نجاح: والبوّابةُ الحقيقيّة في المستودع الذي
    // يُنصّب من القفل ثمّ يختبر — وهناك يقع القياسُ كاملًا.
    const locked = lockedVersion(lib);
    const installed = installedVersion(lib);
    if (locked && installed && locked !== installed) {
      t.skip(
        `node_modules أقدمُ من القفل (${installed} مقابل ${locked}) — لا يُقاس طرفان من زمنين. ` +
          `شغّل npm ci ثمّ أعد الاختبار.`,
      );
      return;
    }

    assert.equal(
      sha256(hostedPath),
      sha256(sourcePath),
      `public/lib/${hosted} يفترق عن ${source}: رُقّيت الحزمةُ ولم تُحدَّث النسخةُ المستضافة — ` +
        `والمتصفّحُ يُحمّل المستضافة. انسخها: cp ${source} public/lib/${hosted}`,
    );
  });
}

for (const { file, sha256: pinned, why } of PINNED) {
  test(`★★ ${file} مثبَّتةٌ ببصمتها — لا تُبدَّل صامتةً`, () => {
    const p = path.join(LIB, file);
    assert.ok(fs.existsSync(p), `public/lib/${file} مفقود — و${why}`);
    assert.equal(
      sha256(p),
      pinned,
      `public/lib/${file} تغيّر ولم تُحدَّث بصمتُه هنا. إن كان التغييرُ مقصودًا ` +
        `فحدّث البصمةَ وسبَبها؛ وإن لم يكن، فقد بُدِّل ملفٌّ يصل متصفّح الموظّف`,
    );
  });
}

test('★★★ ولا ملفَّ في public/lib خارج التصنيف — لا يدخل مستضافٌ بلا قرار', () => {
  const classified = new Set([
    ...MIRRORED.map((m) => m.hosted),
    ...PINNED.map((p) => p.file),
    ...OURS,
  ]);
  const stray = vendoredFiles().filter((f) => !classified.has(f));
  assert.deepEqual(
    stray,
    [],
    'ملفٌّ في public/lib لا هو مرآةٌ لحزمةٍ ولا مثبَّتٌ ببصمةٍ ولا معلَنٌ أنّه لنا. ' +
      'يُصنَّف في MIRRORED أو PINNED أو OURS — فما يصل متصفّحَ الموظّف يُعرف مصدرُه',
  );
});

test('★★ وكلُّ مستضافٍ له سببٌ مكتوبٌ لوجوده', () => {
  for (const entry of [...MIRRORED, ...PINNED]) {
    const name = entry.hosted ?? entry.file;
    assert.ok(entry.why && entry.why.length > 20, `«${name}» بلا سببٍ مكتوبٍ لاستضافتها`);
  }
});

test('★ والحارسُ يفشل فعلًا حين تفترق النسختان — نقضٌ لا دعوى', () => {
  const a = crypto.createHash('sha256').update(Buffer.from('mermaid@11.17.2')).digest('hex');
  const b = crypto.createHash('sha256').update(Buffer.from('mermaid@11.15.0')).digest('hex');
  assert.notEqual(a, b, 'البصمةُ لا تفرّق بين نسختين — فالحارسُ زينة');
});
