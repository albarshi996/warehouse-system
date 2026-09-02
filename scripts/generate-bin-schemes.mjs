/**
 * توليد مكتبة قوالب الترقيم وإسناداتها من ملصقات المواقع المطبوعة.
 *
 * ═══ لماذا قوالبُ لا مخطّطاتٌ جامدة (طلب المالك 2026-09-02) ═══
 * مخطّطٌ مكتوبٌ لطرابلس والرحبة يخدم اليوم ولا يخدم المستودع الثالث. والقالبُ
 * وصفٌ **مسمًّى وقابلٌ لإعادة الاستعمال**: يُختار ويُملأ بثلاثة أرقام. فترميزُ
 * مستودعٍ جديدٍ لا يحتاج نشرةَ برنامج ولا وصفَ أربعةَ عشرَ حقلًا بيد.
 *
 * ═══ ولماذا سكربتٌ لا ملفٌّ مكتوبٌ بيد ═══
 * الملصقات مطبوعةٌ ومعلَّقةٌ على الرفوف — فهي **مصدر الحقيقة**. فالسكربت يصف
 * الإسناد مرّةً ثمّ **يقيس**: يفكّ أكواد الـPDF ويقارنها بمخرج المولّد نفسِه
 * الذي تستعمله البانية، ويرفض الكتابة على أيّ فرق. فإن أُعيدت طباعةُ ملصقاتٍ
 * بمدًى مختلف، يسقط التوليدُ بدل أن يُنتج بذرةً تكذب.
 *
 * الاستعمال:
 *   node scripts/generate-bin-schemes.mjs                      # يكتب بلا قياس
 *   node scripts/generate-bin-schemes.mjs "<مجلد ملفّات الـPDF>"  # يقيس ثمّ يكتب
 *
 * القياس يحتاج `pdftotext` (poppler) في المسار — وبدونه يُعلَن التخطّي ولا
 * يُدَّعى قياسٌ لم يقع.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countForTemplate, schemeFromTemplate, templateProblems } from '../src/services/locations/binTemplate.js';
import { expandScheme } from '../src/services/locations/locationScheme.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(repoRoot, 'src', 'data', 'warehouse-schemes.json');

/**
 * ═══ مكتبة القوالب ═══
 *
 * كلُّ قالبٍ يصف **الترميز** ويترك **المقاسات** وسائطَ تُملأ. والتسمياتُ
 * للعرض وحدها؛ الترتيبُ هو المعنى كما في `locationCode.js`.
 */
const TEMPLATES = [
  {
    id: 'double-sided-racks',
    nameAr: 'رفوفٌ مزدوجةُ الجهة',
    descriptionAr:
      'ممرٌّ بحرف، وجهتان يمينٌ ويسار، ورفوفٌ مرقّمة، وخاناتٌ على كلّ رفّ — وهو ترميزُ ملصقات طرابلس والرحبة.',
    sampleCode: 'RH-A-R-01-01',
    segmentLabels: { zone: 'الممرّ', rack: 'الجهة', bay: 'الرفّ', level: 'الخانة' },
    valueLabels: { rack: { L: 'يسار', R: 'يمين' } },
    params: [
      { key: 'aisles', labelAr: 'عدد الممرّات', hintAr: 'تُرقَّم بالحروف A فما فوق', min: 1, max: 26, default: 10 },
      { key: 'racks', labelAr: 'عدد الرفوف في الجهة', min: 1, max: 99, default: 5 },
      { key: 'bins', labelAr: 'عدد الخانات في الرفّ', min: 1, max: 99, default: 10 },
    ],
    levels: [
      { key: 'zone', kind: 'letters', count: 'aisles' },
      { key: 'rack', kind: 'list', values: ['L', 'R'] },
      { key: 'bay', kind: 'range', from: 1, to: 'racks', pad: 2 },
      { key: 'level', kind: 'range', from: 1, to: 'bins', pad: 2 },
      { key: 'position', enabled: false },
    ],
  },
  {
    id: 'zoned-aisles',
    nameAr: 'مناطقُ ثمّ ممرّاتٌ ورفوفٌ ومستويات',
    descriptionAr:
      'مستودعٌ مقسَّمٌ مناطقَ مسمّاة (تجهيز · كتلة · مبرَّد)، وفي كلّ منطقةٍ ممرّاتٌ مرقّمةٌ ورفوفٌ ومستويات — للمستودعات التي تفصل بالوظيفة لا بالجهة.',
    sampleCode: 'MAIN-PIK-A01-R01-L01',
    segmentLabels: { zone: 'المنطقة', rack: 'الممرّ', bay: 'الرفّ', level: 'المستوى' },
    valueLabels: {},
    params: [
      { key: 'aisles', labelAr: 'عدد الممرّات في المنطقة', min: 1, max: 99, default: 10 },
      { key: 'racks', labelAr: 'عدد الرفوف في الممرّ', min: 1, max: 99, default: 5 },
      { key: 'levels', labelAr: 'عدد المستويات في الرفّ', min: 1, max: 99, default: 4 },
    ],
    levels: [
      { key: 'zone', kind: 'list', values: ['PIK', 'BLK', 'CLD'] },
      { key: 'rack', kind: 'range', prefix: 'A', from: 1, to: 'aisles', pad: 2 },
      { key: 'bay', kind: 'range', prefix: 'R', from: 1, to: 'racks', pad: 2 },
      { key: 'level', kind: 'range', prefix: 'L', from: 1, to: 'levels', pad: 2 },
      { key: 'position', enabled: false },
    ],
  },
];

/**
 * ═══ الإسنادُ المعتمد (قرار المالك 2026-09-02) ═══
 *
 * ⚠️ **`binPrefix` ليس `warehouseCode`**: البوّابة سجّلت المستودعين `WH001`
 * و`WH002` قبل طباعة الملصقات، والملصقاتُ تحمل `RH`/`TR`. فالكودُ يُبنى
 * بالبادئة المطبوعة (لا يُعاد طبعُ ٣٦٠٠ ملصق)، والوثيقةُ تحمل الربط (لا
 * يُغيَّر كودُ مستودعٍ قد تشير إليه حركات).
 */
const ASSIGNMENTS = [
  {
    warehouseCode: 'WH002',
    binPrefix: 'TR',
    nameAr: 'طرابلس',
    templateId: 'double-sided-racks',
    params: { aisles: 10, racks: 5, bins: 10 },
    labelFile: 'ملصقات ترميز مواقع التخزين – مخزن طرابلس.pdf',
  },
  {
    warehouseCode: 'WH001',
    binPrefix: 'RH',
    nameAr: 'الرحبة',
    templateId: 'double-sided-racks',
    params: { aisles: 26, racks: 5, bins: 10 },
    labelFile: 'ملصقات ترميز مواقع التخزين – مخزن الرحبة.pdf',
  },
];

/** أكواد الملصقات كما طُبعت — `null` إن تعذّر القياس. */
function codesFromPdf(pdfPath) {
  try {
    const out = join(mkdtempSync(join(tmpdir(), 'bins-')), 'labels.txt');
    execFileSync('pdftotext', ['-layout', pdfPath, out], { stdio: 'pipe' });
    const text = readFileSync(out, 'utf8');
    return [...new Set(text.match(/[A-Z]{2,3}-[A-Z0-9]+-[A-Z0-9]+-\d+-\d+/g) || [])];
  } catch {
    return null;
  }
}

const labelsDir = process.argv[2] || '';
const assignments = [];
let measured = 0;

for (const a of ASSIGNMENTS) {
  const template = TEMPLATES.find((t) => t.id === a.templateId);
  if (!template) {
    console.error(`❌ ${a.binPrefix}: القالب «${a.templateId}» غير موجودٍ في المكتبة`);
    process.exit(1);
  }

  const problems = templateProblems(template, { binPrefix: a.binPrefix, params: a.params });
  if (problems.length) {
    console.error(`❌ إسنادُ ${a.binPrefix} معطوب: ${problems.join(' · ')}`);
    process.exit(1);
  }

  const { codes } = expandScheme(schemeFromTemplate(template, { binPrefix: a.binPrefix, params: a.params }));
  let evidence = { measuredAgainstLabels: false, labelCount: null, missing: null, extra: null };

  if (labelsDir) {
    const found = readdirSync(labelsDir).find((f) => f === a.labelFile);
    const printed = found ? codesFromPdf(join(labelsDir, found)) : null;
    if (!printed) {
      console.warn(`⚠️ ${a.binPrefix}: تعذّر قياسُ «${a.labelFile}» (مفقودٌ أو pdftotext غير مثبَّت) — لا يُدَّعى قياس.`);
    } else {
      const gen = new Set(codes);
      const missing = printed.filter((c) => !gen.has(c));
      const extra = codes.filter((c) => !printed.includes(c));
      if (missing.length || extra.length) {
        console.error(
          `❌ ${a.binPrefix}: القالب لا يطابق الملصقات — ناقص ${missing.length} · زائد ${extra.length}` +
            `\n   أمثلة ناقص: ${missing.slice(0, 3).join(' , ') || '—'}` +
            `\n   أمثلة زائد: ${extra.slice(0, 3).join(' , ') || '—'}`
        );
        process.exit(1);
      }
      evidence = { measuredAgainstLabels: true, labelCount: printed.length, missing: 0, extra: 0 };
      measured += 1;
    }
  }

  assignments.push({
    warehouseCode: a.warehouseCode,
    binPrefix: a.binPrefix,
    nameAr: a.nameAr,
    templateId: a.templateId,
    params: a.params,
    expectedCount: codes.length,
    firstCode: codes[0],
    lastCode: codes[codes.length - 1],
    evidence,
  });
}

writeFileSync(
  outPath,
  JSON.stringify(
    {
      note: 'ملفٌّ مولَّد آليًّا — لا يُحرَّر بيد. يُعاد توليده بـ`node scripts/generate-bin-schemes.mjs "<مجلد الـPDF>"`.',
      decision: 'قرار المالك 2026-09-02 — LOC-O01 (صيغة الكود) و LOC-O03 (البذرة) و«قالبٌ وتوليدٌ أوتوماتيكيّ».',
      anatomy: 'القالبُ يصف الترميز، والوسائطُ تصف المقاس، والإسنادُ يربط مستودعًا بقالبٍ ووسائط.',
      templates: TEMPLATES,
      assignments,
    },
    null,
    2
  ) + '\n',
  'utf8'
);

console.info(`✅ ${TEMPLATES.length} قالبًا · ${assignments.length} إسنادًا → ${outPath}`);
for (const t of TEMPLATES) {
  console.info(`  قالب «${t.nameAr}» (${t.id}) · مثال ${t.sampleCode} · افتراضيًّا ${countForTemplate(t)} كود`);
}
for (const a of assignments) {
  const proof = a.evidence.measuredAgainstLabels
    ? `مقيسٌ بالملصقات (${a.evidence.labelCount}) — ٠ ناقص · ٠ زائد`
    : 'غيرُ مقيسٍ بالملصقات';
  console.info(`  ${a.binPrefix} → ${a.warehouseCode} ${a.nameAr} | ${a.expectedCount} خانة | ${a.firstCode} … ${a.lastCode} | ${proof}`);
}
if (labelsDir && measured < ASSIGNMENTS.length) {
  console.info('\n⚠️ لم تُقَس كلُّ المستودعات — البذرةُ كُتبت، والادّعاءُ محدودٌ بما قيس.');
}
