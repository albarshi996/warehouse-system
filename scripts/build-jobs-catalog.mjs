/**
 * يولّد كتالوج الوظائف من ملف «تقرير هيكل الوظائف والأدوار» — المصدر الرسمي.
 *
 * نفس فلسفة قالب الأصناف: الكتالوج **يُولَّد من المصدر** لا يُنسخ يدويًّا،
 * فلا ينحرف عمّا اعتمده المالك. عند تحديث ملف الهيكل: أعد تشغيل هذا السكربت.
 *
 * التشغيل: node scripts/build-jobs-catalog.mjs [مسار الملف]
 * المُخرَج: src/services/recruitment/jobsCatalog.js
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SOURCE =
  process.argv[2] ||
  'C:/Users/DELL/Desktop/العمليات اليومية/BrandZo HUB/تقرير-هيكل-الوظائف-والادوار (1).html';

const html = readFileSync(SOURCE, 'utf8');
const start = html.indexOf('const jobs = [');
if (start < 0) throw new Error('لم يُعثر على مصفوفة الوظائف في الملف');

// استخراج المصفوفة بموازنة الأقواس (لا نثق بموضع نهاية سحري).
let i = html.indexOf('[', start);
let depth = 0;
let end = -1;
for (let p = i; p < html.length; p++) {
  if (html[p] === '[') depth++;
  else if (html[p] === ']') {
    depth--;
    if (depth === 0) {
      end = p + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('مصفوفة الوظائف غير متوازنة الأقواس');

const jobs = JSON.parse(html.slice(i, end));

/** المنصب المشغول معلَّم داخل المهام بسطر «📌 الحالة: …مشغول…». */
function extractStatus(duties) {
  const marker = duties.find((d) => d.startsWith('📌'));
  return {
    occupied: Boolean(marker && marker.includes('مشغول')),
    duties: duties.filter((d) => !d.startsWith('📌')),
  };
}

/**
 * التبعية: الوظائف التشغيلية تحمل `reportingTo`، والمساندة تحمل حقلين
 * (`functionalReporting` وظيفيًّا و`operationalReporting` تشغيليًّا) — نركّبهما.
 */
function reportingOf(j) {
  if (j.reportingTo) return j.reportingTo;
  const parts = [];
  if (j.functionalReporting) parts.push(`وظيفيًّا: ${j.functionalReporting}`);
  if (j.operationalReporting) parts.push(`تشغيليًّا: ${j.operationalReporting}`);
  return parts.join(' · ');
}

const catalog = jobs.map((j, n) => {
  const { occupied, duties } = extractStatus(j.duties || []);
  return {
    id: `J${String(n + 1).padStart(2, '0')}`,
    title: j.title,
    icon: j.icon || '',
    layer: j.layer || '',
    odooRole: j.odooRole || '',
    odooLevel: j.odooLevel || '',
    modules: j.modules || '',
    phase1: j.p1 || '',
    phase2: j.p2 || '',
    duties,
    reportingTo: reportingOf(j),
    kpis: j.kpis || '',
    occupied,
  };
});

const out = `/**
 * كتالوج الوظائف الرسمي — مولَّد آليًّا من «تقرير هيكل الوظائف والأدوار».
 *
 * ⚠️ لا تحرّر هذا الملف يدويًّا: التعديل يكون في ملف الهيكل ثم
 * \`node scripts/build-jobs-catalog.mjs\`. (قرار المالك 2026-07-16: الكتالوج
 * ثابت من الملف — مصدر واحد للحقيقة.)
 *
 * اختيار المسمّى في شاشة التوظيف يتعبّأ منه الوصف (المهام) والتبعية
 * والمؤشرات تلقائيًّا. \`occupied\` مستخرَجة من علامة «📌 مشغول» في المصدر.
 */

export const JOBS = ${JSON.stringify(catalog, null, 2)};

/** يُعيد الوظيفة بمعرّفها، أو null. */
export function getJob(id) {
  return JOBS.find((j) => j.id === id) || null;
}

/** الوظائف الشاغرة أولًا — لقائمة الاختيار في شاشة التوظيف. */
export function jobOptions() {
  return [...JOBS].sort((a, b) => Number(a.occupied) - Number(b.occupied));
}
`;

mkdirSync(new URL('../src/services/recruitment/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/services/recruitment/jobsCatalog.js', import.meta.url), out);
console.info(`✅ ${catalog.length} وظيفة → src/services/recruitment/jobsCatalog.js (${catalog.filter((j) => !j.occupied).length} شاغرة)`);
