#!/usr/bin/env node
/**
 * تدقيق البوابة — `npm run audit`
 *
 * حارسٌ دائم ضدّ الفجوات التي كشفها تدقيق 23.07.2026 يدويًّا، كي لا تتكرّر:
 *   1. **صفحة يتيمة:** ملفٌ في `src/pages/dashboard/` لا تصل إليه القائمة
 *      ولا استثناء صريح — كانت `تقرير-الدورة-المستندية-الكامل` كذلك.
 *   2. **رابط مكسور:** عنصرٌ في القائمة بلا صفحة أو بلا ملف في `public/`.
 *   3. **مجموعة Firestore بلا قاعدة أمان:** كتابةٌ سترتدّ `permission-denied`
 *      في وجه الموظّف بلا سبب ظاهر.
 *   4. **صفحة حسّاسة يفتحها من لا يخصّه:** بوّابة تراجُع لو عاد أحدهم
 *      لقائمة صلاحيات يدوية موازية للكتالوج.
 *
 * لا يعتمد على شبكة ولا على Firebase — يقرأ الملفات فقط، فيصلح للـCI.
 * يُنهي بـ0 عند السلامة، وبـ1 عند أي فشل.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAV_GROUPS, internalPaths, externalPaths, flatItems } from '../src/services/auth/navCatalog.js';
import { ALWAYS_ALLOWED, HOME_PATH, canOpenPath } from '../src/services/auth/pageAccess.js';
import { ROLES } from '../src/services/auth/roles.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIR = path.join(ROOT, 'src/pages/dashboard');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SERVICES_DIR = path.join(ROOT, 'src/services');
const RULES_FILE = path.join(ROOT, 'firestore.rules');

const failures = [];
const notes = [];

const ok = (m) => console.info(`  [32m✔[0m ${m}`);
const bad = (m) => {
  console.info(`  [31m✘[0m ${m}`);
  failures.push(m);
};
const info = (m) => console.info(`    ${m}`);
const section = (n, t) => console.info(`\n[1m${n}. ${t}[0m`);

/** كل الملفات تحت مجلد، بامتدادات محدّدة. */
function walk(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, exts);
    return exts.some((x) => e.name.endsWith(x)) ? [full] : [];
  });
}

console.info('[1m═══ تدقيق بوابة Brandzo Hub ═══[0m');

/* ═══════════ 1. الصفحات اليتيمة ═══════════ */
section(1, 'الصفحات اليتيمة (مبنيّة ولا تصل إليها القائمة)');
const pagesOnDisk = fs
  .readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith('.astro'))
  .map((f) => (f === 'index.astro' ? HOME_PATH : `/dashboard/${f.replace(/\.astro$/, '')}`));

const known = new Set([HOME_PATH, ...ALWAYS_ALLOWED, ...internalPaths()]);
const orphans = pagesOnDisk.filter((p) => !known.has(p));
if (orphans.length === 0) {
  ok(`كل الصفحات الـ${pagesOnDisk.length} مربوطة`);
} else {
  bad(`${orphans.length} صفحة يتيمة — أضِفها إلى navCatalog.js أو ALWAYS_ALLOWED:`);
  orphans.forEach((p) => info(`• ${p}`));
}

/* ═══════════ 2. الروابط المكسورة ═══════════ */
section(2, 'الروابط المكسورة');
const missingPages = internalPaths().filter(
  (p) => !fs.existsSync(path.join(PAGES_DIR, `${p.replace('/dashboard/', '')}.astro`))
);
if (missingPages.length === 0) ok(`كل روابط القائمة الداخلية (${internalPaths().length}) لها صفحات`);
else {
  bad(`${missingPages.length} رابط قائمة بلا صفحة:`);
  missingPages.forEach((p) => info(`• ${p}`));
}

const missingFiles = externalPaths().filter((p) => !fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, ''))));
if (missingFiles.length === 0) ok(`كل ملفات public المشار إليها (${externalPaths().length}) موجودة`);
else {
  bad(`${missingFiles.length} ملف public مفقود:`);
  missingFiles.forEach((p) => info(`• ${p}`));
}

/* ═══════════ 3. قواعد Firestore ═══════════ */
section(3, 'مجموعات Firestore مقابل قواعد الأمان');
const serviceFiles = walk(SERVICES_DIR, ['.js']).filter((f) => !f.endsWith('.test.js'));
const used = new Set();

/**
 * يُسقط التعليقات قبل المسح. ضروريّ: تعليقات JSDoc عندنا تقتبس أسماء الكود
 * بعلامات ` فيلتقطها مسحُ المسارات القالبية ويظنّها مجموعات (80 إنذارًا كاذبًا).
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** محتوى الأقواس المتوازنة بدءًا من موضع القوس المفتوح. */
function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

for (const f of serviceFiles) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));

  // (أ) ثوابت المجموعات: const COL = 'balances'
  for (const m of src.matchAll(/\b(?:COL|COLL|COLLECTION)[A-Z_]*\s*=\s*'([^']+)'/g)) used.add(m[1]);

  // (ب) وسائط نداءات collection()/doc() وحدها — لا نصّ الملف كلّه.
  for (const m of src.matchAll(/\b(?:collection|doc)\s*\(/g)) {
    const args = balanced(src, m.index + m[0].length - 1);
    for (const lit of args.matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) used.add(lit[1]);
    // مسار قالبيّ داخل النداء: `vehicles/${id}/inspections`
    for (const tpl of args.matchAll(/`([^`]*)`/g)) {
      tpl[1]
        .split('/')
        .filter((seg) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg))
        .forEach((seg) => used.add(seg));
    }
  }
}

/**
 * معرّفات مستندات ثابتة داخل مجموعات مغطّاة — ليست مجموعات بذاتها
 * (مثل `files/cv` و`org_structure/current`)، فلا تحتاج قاعدة مستقلّة.
 */
const DOC_IDS = new Set(['cv', 'current']);

const rules = fs.readFileSync(RULES_FILE, 'utf8');
const covered = new Set([...rules.matchAll(/match\s+\/([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]));

const uncovered = [...used].filter((c) => !DOC_IDS.has(c) && !covered.has(c));
if (uncovered.length === 0) {
  ok(`كل مجموعة يستخدمها الكود لها قاعدة (${covered.size} قاعدة في firestore.rules)`);
} else {
  bad(`${uncovered.length} مجموعة بلا قاعدة أمان — الكتابة سترتدّ permission-denied:`);
  uncovered.forEach((c) => info(`• ${c}`));
}

/* ═══════════ 4. الصفحات الحسّاسة ═══════════ */
section(4, 'حصر الصفحات الحسّاسة بأصحابها');
const sensitive = flatItems().filter((it) => !it.external && Array.isArray(it.roles) && it.roles.length > 0);
let leaks = 0;
for (const item of sensitive) {
  const owners = new Set([...item.roles, 'admin']);
  for (const role of Object.keys(ROLES)) {
    if (owners.has(role)) continue;
    // موضع آخر للصفحة نفسها قد يسمح لهذا الدور عن حقّ (المهام مثلًا).
    if (canOpenPath(role, item.path)) {
      const alsoOpenElsewhere = flatItems().some(
        (o) => o.path === item.path && o !== item && (!o.roles || o.roles.includes(role))
      );
      if (!alsoOpenElsewhere) {
        bad(`الدور «${role}» يفتح ${item.path} (${item.label}) وهو محصور بـ${item.roles.join('، ')}`);
        leaks++;
      }
    }
  }
}
if (leaks === 0) ok(`الصفحات الحسّاسة الـ${sensitive.length} محصورة بأصحابها عبر الأدوار الـ${Object.keys(ROLES).length}`);

/* ═══════════ 5. لقطة عامة ═══════════ */
section(5, 'لقطة');
info(`مجموعات القائمة: ${NAV_GROUPS.length} · روابط داخلية: ${internalPaths().length} · ملفات public: ${externalPaths().length}`);
info(`صفحات لوحة التحكم على القرص: ${pagesOnDisk.length} · أدوار: ${Object.keys(ROLES).length}`);
const noAccess = Object.keys(ROLES).filter((r) => internalPaths().every((p) => !canOpenPath(r, p)));
if (noAccess.length) notes.push(`أدوار بلا أي صفحة: ${noAccess.join('، ')}`);
notes.forEach((n) => info(`⚠ ${n}`));

/* ═══════════ الخلاصة ═══════════ */
console.info('');
if (failures.length === 0) {
  console.info('[32m[1m✔ التدقيق نظيف — لا صفحة يتيمة ولا رابط مكسور ولا مجموعة بلا قاعدة ولا تسريب صلاحية.[0m');
  process.exit(0);
}
console.info(`[31m[1m✘ التدقيق فشل: ${failures.length} مشكلة.[0m`);
process.exit(1);
