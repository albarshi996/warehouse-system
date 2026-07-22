/**
 * يولّد كل مشتقّات الهيكل التنظيمي من المصدر الواحد `src/data/org-structure.json`.
 *
 * ═══ لماذا هذا السكربت موجود ═══
 * كان الهيكل مكتوبًا يدويًّا في أربعة أماكن (تقريران منشوران + كتالوج
 * الوظائف + جدول الكادر) — **وقد انحرفت عن بعضها فعلًا** (التقريران كانا
 * يعرضان «قسم العمليات اللوجستية» بخمس وحدات مقابل «مدير العمليات
 * اللوجستية» بأربع). الآن يُحرَّر الهيكل في مكان واحد، ويُشغَّل هذا:
 *
 *     node scripts/build-org.mjs
 *
 * المخرَجات (كلها مولَّدة — لا تُحرَّر يدويًّا):
 *   • public/تقرير-هيكل-الوظائف-والادوار.html  → الشجرة · المساندة · jobs · orgTable
 *   • public/المرجع-التشغيلي-الرسمي.html        → الشجرة · المساندة · جدول الكادر
 *   • src/services/recruitment/jobsCatalog.js   → كتالوج التوظيف
 *
 * الإدراج يعتمد **علامات HTML** تُزرع في أول تشغيل، فيصير كل تشغيل تالٍ
 * حتميًّا (نفس المصدر ⇒ نفس المخرَج بايتًا-ببايت).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chartHtml, supportBandHtml, esc } from '../src/services/org/orgView.js';
import { validateTree, countByType, proposedCount } from '../src/services/org/orgModel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = JSON.parse(readFileSync(resolve(ROOT, 'src/data/org-structure.json'), 'utf8'));

const verdict = validateTree(SOURCE.tree);
if (!verdict.ok) {
  console.error('❌ الهيكل المصدر غير صالح:\n• ' + verdict.problems.join('\n• '));
  process.exit(1);
}

/* ═══════════════ أدوات الإدراج ═══════════════ */

/** الملفان يستعملان CRLF — أي إدراج بـLF يخلط النهايات في الملف. */
function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}
function toEol(content, eol) {
  return content.replace(/\r?\n/g, eol);
}

/**
 * يستبدل منطقةً في ملف. أول مرة: يجدها بين مرساتين ويزرع العلامات.
 * بعدها: يستبدل ما بين العلامتين مباشرة (حتميّ وقابل للتكرار).
 * المراسي **من سطر واحد دائمًا** — المرساة متعددة الأسطر تفشل على CRLF.
 */
function replaceRegion(text, tag, startAnchor, endAnchor, content) {
  const eol = eolOf(text);
  const open = `<!-- ORG:${tag}:START — مولَّد من src/data/org-structure.json — لا تحرّره يدويًّا -->`;
  const close = `<!-- ORG:${tag}:END -->`;
  const body = toEol(content, eol);

  const oi = text.indexOf(open);
  if (oi >= 0) {
    const ci = text.indexOf(close, oi);
    if (ci < 0) throw new Error(`علامة ${tag} مفتوحة بلا إغلاق`);
    return text.slice(0, oi) + open + eol + body + eol + text.slice(ci);
  }

  const si = text.indexOf(startAnchor);
  if (si < 0) throw new Error(`لم تُوجد مرساة البداية لـ${tag}: ${startAnchor.slice(0, 60)}`);
  const ei = text.indexOf(endAnchor, si);
  if (ei < 0) throw new Error(`لم تُوجد مرساة النهاية لـ${tag}: ${endAnchor.slice(0, 60)}`);
  return text.slice(0, si) + open + eol + body + eol + close + eol + eol + '  ' + text.slice(ei);
}

/** يستبدل مصفوفة/كائن JS بموازنة الأقواس — لا موضع نهاية سحري. */
function replaceJsLiteral(text, decl, open, close, literal) {
  const start = text.indexOf(decl);
  if (start < 0) throw new Error(`لم يُعثر على ${decl}`);
  const i = text.indexOf(open, start);
  let depth = 0;
  for (let p = i; p < text.length; p++) {
    if (text[p] === open) depth++;
    else if (text[p] === close) {
      depth--;
      if (depth === 0) return text.slice(0, i) + literal + text.slice(p + 1);
    }
  }
  throw new Error(`${decl} غير متوازن الأقواس`);
}

/* ═══════════════ 1) التقرير التفاعلي ═══════════════ */

const c = countByType(SOURCE.tree);
const treeReport = `  <div class="org-tree">
${chartHtml(SOURCE.tree, { skin: 'report' })
  .split('\n')
  .map((l) => '    ' + l)
  .join('\n')}
  </div>`;

const suppBandReport = `  <div class="support-band" style="margin-top: 60px; display: flex; justify-content: center; gap: 20px; position: relative; border-top: 2px dashed var(--gold); padding-top: 20px; flex-wrap: wrap;">
    <div style="position: absolute; top: -60px; left: 50%; border-left: 2px dashed var(--gold); height: 60px;"></div>
${(SOURCE.supportFunctions || [])
  .map(
    (s) =>
      `    <div class="org-node unit" style="border-style: dashed; background: rgba(200,157,59,0.05);">${esc(s.icon || '')} ${esc(s.title)}<br>${esc(s.note || s.titleEn || '')}</div>`
  )
  .join('\n')}
  </div>`;

/**
 * بطاقات الوصف بصيغة التقرير (p1/p2 · سطر 📌 · وسوم التبعية الثلاثة).
 * الحقل الفارغ **يُحذف** لا يُكتب `""`: البطاقات الأصلية لا تحمله أصلًا،
 * وكتابته تُحدث فرقًا وهميًّا يخفي الفروق الحقيقية عند المراجعة.
 */
const jobsForReport = SOURCE.jobs.map((j) => {
  const out = {};
  const put = (k, v) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  };
  put('icon', j.icon);
  put('title', j.title);
  put('holder', j.holder);
  put('layer', j.layer);
  put('odooRole', j.odooRole);
  put('odooLevel', j.odooLevel);
  put('modules', j.modules);
  put('p1', j.phase1);
  put('p2', j.phase2);
  out.duties = j.occupied ? [...j.duties, '📌 الحالة: هذا المنصب مشغول حالياً'] : [...j.duties];
  if (j.directReporting) put('reportingTo', j.reportingTo);
  put('operationalReporting', j.operationalReporting);
  put('functionalReporting', j.functionalReporting);
  put('kpis', j.kpis);
  return out;
});

const orgTableForReport = (SOURCE.staffing || []).map((r) => ({
  dept: r.unit,
  p1: r.phase1,
  p2: r.phase2,
  role: r.role,
}));

const P1 = resolve(ROOT, 'public/تقرير-هيكل-الوظائف-والادوار.html');
let r1 = readFileSync(P1, 'utf8');
r1 = replaceRegion(r1, 'TREE', '  <div class="org-tree">', '  <!-- Support Functions Band -->', treeReport);
r1 = replaceRegion(
  r1,
  'SUPPORT',
  '  <div class="support-band"',
  '  <p style="font-size:12px;color:var(--gray);margin-top:40px;',
  suppBandReport
);
r1 = replaceJsLiteral(r1, 'const jobs = [', '[', ']', JSON.stringify(jobsForReport, null, 2));
r1 = replaceJsLiteral(r1, 'const orgTable = [', '[', ']', JSON.stringify(orgTableForReport, null, 2));
writeFileSync(P1, r1, 'utf8');

/* ═══════════════ 2) المرجع التشغيلي الرسمي ═══════════════ */

const suppBandRef = `  <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:28px;padding-top:20px;border-top:2px dashed var(--gold);">
${supportBandHtml(SOURCE.supportFunctions, { cls: 'org-node supp' })
  .split('</div>')
  .filter(Boolean)
  .map((s) => '    ' + s + '</div>')
  .join('\n')}
  </div>`;

const staffRowsRef = (SOURCE.staffing || [])
  .map((r, i, all) => {
    const last = i === all.length - 1;
    const b = (v) => (last ? `<strong>${esc(v)}</strong>` : esc(v));
    const c1 = last ? 'td-hot' : 'td-blue';
    const c2 = last ? 'td-hot' : 'td-warn';
    return `        <tr><td>${b(r.unit)}</td><td class="${c1}">${b(r.phase1)}</td><td class="${c2}">${b(r.phase2)}</td><td>${esc(r.role)}</td></tr>`;
  })
  .join('\n');

const P2 = resolve(ROOT, 'public/المرجع-التشغيلي-الرسمي.html');
let r2 = readFileSync(P2, 'utf8');
r2 = replaceRegion(
  r2,
  'TREE',
  '  <div class="org-tree">',
  '  <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:28px;',
  treeReport
);
r2 = replaceRegion(
  r2,
  'SUPPORT',
  '  <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:28px;',
  '  <p style="font-size:11px;color:#888;margin-top:12px;',
  suppBandRef
);
r2 = replaceRegion(
  r2,
  'STAFFING',
  '        <tr><td>🛡️ إدارة التوثيق والاعتماد</td>',
  '      </tbody>',
  staffRowsRef
);
writeFileSync(P2, r2, 'utf8');

/* ═══════════════ 3) كتالوج الوظائف ═══════════════ */

const catalog = SOURCE.jobs.map((j) => ({
  id: j.id,
  orgId: j.orgId,
  title: j.title,
  icon: j.icon || '',
  layer: j.layer || '',
  odooRole: j.odooRole || '',
  odooLevel: j.odooLevel || '',
  modules: j.modules || '',
  phase1: j.phase1 || '',
  phase2: j.phase2 || '',
  duties: j.duties,
  reportingTo: j.reportingTo || '',
  kpis: j.kpis || '',
  occupied: Boolean(j.occupied),
}));

const catalogFile = `/**
 * كتالوج الوظائف الرسمي — **مولَّد آليًّا** من \`src/data/org-structure.json\`.
 *
 * ⚠️ لا تحرّر هذا الملف يدويًّا: التعديل يكون في ملف الهيكل (أو في الصفحة
 * التفاعلية \`/dashboard/org-structure\` ثم تصدير JSON) ثم:
 *     node scripts/build-org.mjs
 *
 * \`orgId\` يربط كل بطاقة بعقدتها في شجرة الهيكل — فتظهر بطاقات الوصف
 * تلقائيًّا عند اختيار الصندوق في الصفحة التفاعلية.
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
writeFileSync(resolve(ROOT, 'src/services/recruitment/jobsCatalog.js'), catalogFile, 'utf8');

console.info(
  `✅ الهيكل مولَّد من المصدر الواحد:\n` +
    `   • ${c.management} إدارة · ${c.section} قسم · ${c.unit} وحدة · ${c.subunit} فريق (${proposedCount(SOURCE.tree)} مقترح)\n` +
    `   • تقرير هيكل الوظائف والأدوار — الشجرة والمساندة و${jobsForReport.length} بطاقة و${orgTableForReport.length} صف كادر\n` +
    `   • المرجع التشغيلي الرسمي — الشجرة والمساندة وجدول الكادر\n` +
    `   • jobsCatalog.js — ${catalog.length} وظيفة (${catalog.filter((j) => !j.occupied).length} شاغرة)`
);
