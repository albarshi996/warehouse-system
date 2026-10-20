/**
 * يبني **تقرير مخزن فينسيا** ملفَّ إكسل على القرص — بلا متصفّحٍ ولا بوّابة.
 *
 * ═══ لماذا؟ ═══
 * زرُّ «إكسل منسَّق» في الشاشة يُنزّل الملفَّ ببياناتٍ حيّةٍ من السحابة، وهو
 * الطريقُ الأصحّ. ولكنّ المالكَ أراد الملفَّ **على حاسوبه مباشرةً** — لمراجعةٍ
 * بلا فتح البوّابة، ولإرسالِه، ولرؤية شكل الأوراق قبل أن يملأها.
 *
 * ═══ ★★★ ومن أين البيانات؟ ═══
 * **لا يقرأ هذا السكربتُ السحابةَ** — ولا يملك حسابًا عليها أصلًا. فمصدرُه:
 *   · بلا وسيط: بذرةُ `src/data/venecia-assets-seed.json` (١٠٤ أصلًا كما
 *     استُوردت أوّلَ مرّة) — **فالأرقامُ أرقامُ البذرة لا أرقامُ اليوم**،
 *     ولا بطاقاتِ حركةٍ فيها، فورقةُ المصروف تخرج فارغةً وهذا صحيحٌ لا عطب.
 *   · بوسيط: ملفُّ JSON بالشكل `{ "assets": [...], "cards": [...] }` —
 *     كما تُصدّره الشاشةُ أو كما يُستخرج من السحابة. وعندها تخرج الأوراقُ
 *     الخمسُ كلُّها بأرقامٍ حقيقيّة.
 *
 * ★★ **والتقريرُ يُبنى بنفس `buildVeneciaReport` المختبَرة** لا بنسخةٍ ثانيةٍ
 * هنا: ولو بُني مرّتين لَافترق ملفُّ القرص عن ملفّ الشاشة ولم يشتكِ أحد —
 * وهو عينُ ما يحرسه رأسُ `veneciaReport.js`.
 *
 * الاستعمال:
 *   npm run report:venecia                 ← من البذرة، إلى output/
 *   npm run report:venecia -- بيانات.json  ← من ملفٍّ حقيقيّ
 *   npm run report:venecia -- بيانات.json "C:/مسار/الملف.xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as plainXLSX from 'xlsx';

import { buildVeneciaReport } from '../src/services/assets/veneciaReport.js';
import { buildReportWorkbook, reportFileName } from '../src/services/assets/veneciaReportExcel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'src/data/venecia-assets-seed.json');
const STYLED = path.join(ROOT, 'public/lib/xlsx-js-style.bundle.js');

/**
 * ═══ ★★★ المكتبةُ المنسِّقةُ نفسُها التي يستعملها المتصفّح ═══
 *
 * حزمةُ `xlsx` من npm هي **نسخةُ المجتمع، وتتجاهل `cell.s` بصمت**: تُكتب
 * الأنماطُ ولا تُحفظ، فيخرج الملفُّ بلا ترويسةٍ ملوّنةٍ ولا حدود — ولا خطأَ
 * ولا تحذير. (وقع فعلًا: أوّلُ ملفٍّ وُلّد بهذا السكربت خرج بـ
 * `s: {patternType:"none"}` أي أنّ أنماطَه أُسقطت كلُّها.)
 *
 * فتُحمَّل `public/lib/xlsx-js-style.bundle.js` المستضافةُ ذاتيًّا — **وهي
 * بعينها ما تحقنه الشاشة** — فيخرج ملفُّ القرص وملفُّ البوّابة بتنسيقٍ واحد.
 * ★★ وهي حزمةُ متصفّحٍ تعلّق نفسَها على `window`، فيُعطى Node واحدًا.
 */
function loadStyledXLSX() {
  try {
    globalThis.window = globalThis.window ?? globalThis;
    globalThis.self = globalThis.self ?? globalThis;
    createRequire(import.meta.url)(STYLED);
    const lib = globalThis.XLSX ?? globalThis.window?.XLSX;
    if (lib?.utils?.book_new) return { XLSX: lib, styled: true };
  } catch {
    /* يُقال أدناه ولا يُسقط التوليد */
  }
  return { XLSX: plainXLSX, styled: false };
}

const { XLSX, styled } = loadStyledXLSX();

/** يومُ التقويم المحلّيّ — لا `toISOString` فليبيا على +2. */
function todayLocal(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✘ تعذّرت قراءة ${file}: ${e.message}`);
    process.exit(1);
  }
}

const [, , dataArg, outArg] = process.argv;

let assets = [];
let cards = [];
let source = '';

if (dataArg) {
  const data = readJson(path.resolve(dataArg));
  assets = data.assets ?? [];
  cards = data.cards ?? [];
  source = path.basename(dataArg);
} else {
  assets = readJson(SEED).assets ?? [];
  source = 'البذرة (src/data/venecia-assets-seed.json)';
}

const report = buildVeneciaReport(assets, cards, {
  asOf: todayLocal(),
  scope: dataArg ? 'الجرد كاملًا' : 'بذرةُ الجرد الأوّل — لا بياناتٍ حيّة',
});

const wb = buildReportWorkbook(XLSX, report);
const out = outArg
  ? path.resolve(outArg)
  : path.join(ROOT, 'output', reportFileName(`تقرير-مخزن-فينسيا-${todayLocal()}`));

fs.mkdirSync(path.dirname(out), { recursive: true });
// ★★ لا `XLSX.writeFile`: تكتب بغلافِ ملفّاتٍ خاصٍّ بها يسقط على المسارات
// غير اللاتينيّة في ويندوز — ومسارُ هذا المستودع عربيٌّ («العمليات اليومية»)
// فتفشل بـ«cannot save file» بلا سببٍ ظاهر. فتُؤخذ البايتاتُ ويكتبها Node.
fs.writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

const sheets = [report.assetsSheet, report.cardsSheet, report.issuedSheet, report.scrapSheet];
console.info(`\n✔ كُتب التقرير: ${out}`);
console.info(
  styled
    ? '  التنسيق: منسَّقٌ (xlsx-js-style المستضافة ذاتيًّا — نفسُ مكتبة الشاشة)'
    : '  ⚠️ التنسيق: بلا تنسيق — تعذّر تحميل public/lib/xlsx-js-style.bundle.js'
);
console.info(`  المصدر: ${source}`);
console.info(`  الأوراق: الملخّص · ${sheets.map((s) => `${s.name} (${s.rows.length})`).join(' · ')}`);
if (!cards.length) {
  console.info(
    '\n  ⚠️ لا بطاقاتِ حركةٍ في المصدر، فورقةُ «المصروف» فارغة.\n' +
      '     وللأرقام الحيّة: مرّر ملفَّ JSON فيه { "assets": [...], "cards": [...] }\n' +
      '     أو نزّله من زرّ «إكسل منسَّق» في شاشة «جرد مخزن فينسيا».'
  );
}
