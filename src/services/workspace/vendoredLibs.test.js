/**
 * 🔒 حارسُ المكتبات المستضافة ذاتيًّا — كي لا نُرقّي في npm ونشحن القديم.
 *
 * ═══ ولماذا؟ لأنّه حدث حرفيًّا في هذه الجلسة ═══
 * رُقّيت `mermaid` من 11.15.0 إلى 11.17.2 وصارت البوّابةُ خضراء و`npm audit`
 * نظيفًا منها — **وبقي `public/lib/mermaid.min.js` على 11.15.0**، وهو النسخةُ
 * التي يُحمّلها متصفّحُ الموظّف حين يطبع مخطّط دورةٍ من `erp-workflows`
 * (نافذةُ الطباعة سياقٌ منفصل، تُحمّل المكتبةَ من `public/` لا من الحزمة).
 * فترقيةٌ خضراء تمامًا كانت ستترك الثغرةَ في الموضع الوحيد الذي يصل الموظّف.
 *
 * وهذا وجهٌ آخر لدرسٍ سبق: **مبنيٌّ ومنشورٌ وبلا مستدعٍ** — إلّا أنّ هذا
 * **له مستدعٍ**، ولا رابطَ يشدّه إلى ما نُرقّيه. فصار الرابطُ حارسًا.
 *
 * ═══ ولماذا بالبصمة لا بالنسخة؟ ═══
 * لأنّ الملفّ يحمل `version:"0.0.0"` وسطَ نسخته الحقيقيّة، فالتقاطُ رقمٍ منه
 * تخمين. والبصمةُ تقول ما نريده بالضبط: **المستضافُ نسخةٌ حرفيّةٌ ممّا نُرقّيه**.
 *
 * الخطّة: docs/خطة-تحصين-التبعيات.md · المهمّة SEC-201
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** المستضافُ ذاتيًّا ⇐ مصدرُه في `node_modules`. يُوسَّع كلّما استُضيفت مكتبةٌ أخرى. */
const VENDORED = [
  {
    lib: 'mermaid',
    hosted: 'public/lib/mermaid.min.js',
    source: 'node_modules/mermaid/dist/mermaid.min.js',
    why: 'نافذةُ طباعة مخطّطات دورات العمل تُحمّلها من public/ لا من الحزمة',
  },
];

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

for (const { lib, hosted, source, why } of VENDORED) {
  test(`★★★ ${lib} المستضافةُ ذاتيًّا نسخةٌ حرفيّةٌ ممّا نُرقّيه — لا ترقيةَ خضراءُ تشحن القديم`, (t) => {
    const hostedPath = path.join(ROOT, hosted);
    const sourcePath = path.join(ROOT, source);

    assert.ok(fs.existsSync(hostedPath), `${hosted} مفقود — و${why}`);
    assert.ok(fs.existsSync(sourcePath), `${source} مفقود — نصَّبْ الحزم قبل الاختبار`);

    // ★★ و`node_modules` ليست دائمًا صورةَ القفل.
    //
    // ═══ ولماذا هذا التحقّقُ قبل المقارنة؟ ═══
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
      `${hosted} يفترق عن ${source}: رُقّيت الحزمةُ ولم تُحدَّث النسخةُ المستضافة — ` +
        `والمتصفّحُ يُحمّل المستضافة. انسخها: cp ${source} ${hosted}`,
    );
  });
}

test('★ والحارسُ يفشل فعلًا حين تفترق النسختان — نقضٌ لا دعوى', () => {
  const a = crypto.createHash('sha256').update(Buffer.from('mermaid@11.17.2')).digest('hex');
  const b = crypto.createHash('sha256').update(Buffer.from('mermaid@11.15.0')).digest('hex');
  assert.notEqual(a, b, 'البصمةُ لا تفرّق بين نسختين — فالحارسُ زينة');
});

test('★ ولا مكتبةَ تُستضاف بلا سببٍ مكتوبٍ ومصدرٍ يُقارَن به', () => {
  for (const v of VENDORED) {
    assert.ok(v.lib && v.hosted && v.source, 'مدخلٌ ناقصٌ في سجلّ المستضافات');
    assert.ok(v.why && v.why.length > 15, `«${v.lib}» بلا سببٍ مكتوبٍ لاستضافتها`);
  }
});
