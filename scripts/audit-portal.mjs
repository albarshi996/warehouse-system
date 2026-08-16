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
 *   5. **منطقٌ يهرب إلى طبقة التخزين** (‹EXE-002›، قرار المالك 2026-08-16):
 *      القاعدة مخزنٌ وبوّابةُ مستخدمين لا حاكم. فالحكم يبقى في الكود الخالص،
 *      وما يستورد Firebase يُعلن نفسه باسمه (`*Service.js`).
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

// (ج) روابط pages[] في مصدر الهيكل التنظيمي — كانت خارج كل فحص فبقي فيها
// رابطان ميتان لصفحات محذوفة (warehouse-maps · cold-storage-plan) حتى 01.08.
const ORG_SOURCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/org-structure.json'), 'utf8'));
const orgPages = new Set();
(function collectPages(node) {
  if (Array.isArray(node)) return node.forEach(collectPages);
  if (node && typeof node === 'object') {
    if (Array.isArray(node.pages)) node.pages.forEach((p) => orgPages.add(p));
    Object.values(node).forEach(collectPages);
  }
})(ORG_SOURCE);
const deadOrgPages = [...orgPages].filter((p) => {
  if (p.startsWith('/dashboard')) {
    const rel = p === HOME_PATH ? 'index' : p.replace('/dashboard/', '');
    return !fs.existsSync(path.join(PAGES_DIR, `${rel}.astro`));
  }
  return !fs.existsSync(path.join(PUBLIC_DIR, decodeURIComponent(p).replace(/^\//, '')));
});
if (deadOrgPages.length === 0) ok(`كل صفحات مصدر الهيكل org-structure.json (${orgPages.size}) موجودة`);
else {
  bad(`${deadOrgPages.length} رابط ميت في org-structure.json — صحّح pages[]:`);
  deadOrgPages.forEach((p) => info(`• ${p}`));
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

/* ═══════════ 5. نقاء المنطق ═══════════
 *
 * قرار المالك 2026-08-16: **المنطق في الكود، وقاعدة البيانات مخزنٌ وبوّابةُ
 * مستخدمين لا حاكم.** فبعد إكمال خطة التنفيذ الميدانيّ يُقصَر دور القاعدة على
 * التخزين والمصادقة — ومنطقٌ مبثوثٌ في طبقة الخدمات يجعل تبديل المخزن (سيرفرٌ
 * محلّيّ · Odoo · غيرهما) **إعادةَ بناءٍ لا ترحيلًا**، ويجعل الاختبار مستحيلًا
 * بلا شبكة.
 *
 * والعُرف قائمٌ وممارَس أصلًا (78٪ نقاء يوم كتابة هذا الفحص) — الناقص كان
 * **حارسًا** يمنع الانحدار. فهذا القسم يثبّت السقف ولا يدّعي بلوغه: يفشل عند
 * كلّ خرقٍ جديد، ويحمل خطَّي أساسٍ للقديم يُنقصان ولا يزيدان.
 */
section(5, 'نقاء المنطق — القاعدة مخزنٌ لا حاكم');

/** يستورد Firebase؟ (الاستيراد وحده لا ذكر الاسم في تعليق) */
const IMPORTS_FIREBASE = /^\s*import[\s\S]*?from\s+'[^']*(firebase|config\/firebase)[^']*'/m;

/**
 * ملفّ تخزين: اسمه ينتهي بـService.js. وهذا هو العقد كلّه — من رآه عرف أنّ
 * فيه شبكةً، ومن لم يره عرف أنّ ما بيده يعمل في Node بلا اتّصال.
 */
const isStorageName = (f) => /(Service|service)\.js$/.test(path.basename(f));

/**
 * ⚠️ خطّا أساسٍ للقديم — **يُنقصان ولا يزيدان** (نمط خطّ أساس اللينت المعتمَد).
 * كلّ ما زاد عنهما خرقٌ جديد يُوقف التدقيق.
 */
const IMPURE_NAME_BASELINE = 0; // سُدّ في EXE-002: numbering.js ⇐ numberingService.js
const UNTESTED_PURE_BASELINE = 26;

const logicFiles = walk(SERVICES_DIR, ['.js']).filter((f) => !f.endsWith('.test.js'));
const impure = [];
const pure = [];
for (const f of logicFiles) {
  (IMPORTS_FIREBASE.test(fs.readFileSync(f, 'utf8')) ? impure : pure).push(f);
}

// (أ) منطقٌ اختبأ في طبقة التخزين: يستورد Firebase واسمه لا يقول ذلك.
const misnamed = impure.filter((f) => !isStorageName(f));
if (misnamed.length <= IMPURE_NAME_BASELINE) {
  ok(
    `كلّ ما يستورد Firebase (${impure.length}) ينتهي اسمه بـService — عدا ${misnamed.length} على خطّ الأساس (${IMPURE_NAME_BASELINE})`
  );
  misnamed.forEach((f) => info(`⚠ على خطّ الأساس: ${path.relative(ROOT, f)}`));
} else {
  bad(`${misnamed.length} ملفًّا يستورد Firebase واسمه لا ينتهي بـService (خطّ الأساس ${IMPURE_NAME_BASELINE}):`);
  misnamed.forEach((f) => info(`• ${path.relative(ROOT, f)}`));
}

/*
 * (ب) الوقت يُمرَّر لا يُقرأ: ساعةٌ تُقرأ داخل منطقٍ خالص تجعل نتيجته تتغيّر بين
 *     تشغيلين، فلا يُختبر أصلًا.
 *
 * ⚠️ والوسيط الافتراضيّ `nowMs = Date.now()` **ليس خرقًا بل هو النمط المطلوب**:
 * الاختبار يمرّر وقته فيثبت الحساب، والشاشة تستدعي بلا وسيطٍ فتقرأ ساعتها.
 * حارسٌ لا يميّزهما يعاقب الصواب — فيُسقَط شكل الوسيط الافتراضيّ قبل الفحص.
 */
const DEFAULT_NOW_PARAM = /\b\w*(?:now|Now)\w*\s*=\s*(?:Date\.now\(\)|new Date\(\))/g;
const KNOWN_CLOCK_DEBT = new Set([
  'src/services/documents/schemas/vld.js', // «اليوم» يُقرأ داخل المخطّط
  'src/services/executiveReview/decisionSession.js', // ختم updatedAt داخل نموذجٍ خالص
  'src/services/meetings/groupMeetingsModel.js', // مولّد معرّف — لا قاعدة عمل
]);

const readsClock = pure.filter((f) => {
  const src = stripComments(fs.readFileSync(f, 'utf8')).replace(DEFAULT_NOW_PARAM, '');
  return /\bDate\.now\(\)|\bnew Date\(\)/.test(src);
});
const relOf = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const newClockDebt = readsClock.filter((f) => !KNOWN_CLOCK_DEBT.has(relOf(f)));

if (newClockDebt.length === 0) {
  ok(`لا منطقَ خالصًا يقرأ الساعة — عدا ${readsClock.length} على قائمة الدَّين المعلومة (${pure.length} ملفًّا خالصًا)`);
  readsClock.forEach((f) => info(`⚠ دَينٌ معلوم: ${relOf(f)}`));
} else {
  bad(`${newClockDebt.length} ملفَّ منطقٍ خالص يقرأ الساعة بنفسه — مرّر nowMs بدلها:`);
  newClockDebt.forEach((f) => info(`• ${relOf(f)}`));
}
// قائمةٌ بالأسماء لا بعدد: لا يُستبدَل دَينٌ بدَين.
const settled = [...KNOWN_CLOCK_DEBT].filter((f) => !readsClock.some((x) => relOf(x) === f));
if (settled.length) notes.push(`سُدّ دَين الساعة في: ${settled.join('، ')} — احذفه من KNOWN_CLOCK_DEBT`);

/*
 * (ج) اختبارٌ لكلّ منطق. والعبرة **بالتغطية لا بالتسمية**: `numberFormat.js`
 * مُختبَرٌ في `documents.test.js` المشترك، فقاعدةُ «ملفٌّ مجاور» تُنذر عليه
 * كاذبًا. فالمقياس هنا: اختبارٌ مجاور **أو** ملفُّ اختبارٍ يستورده.
 */
const testedModules = new Set();
for (const t of walk(SERVICES_DIR, ['.js']).filter((f) => f.endsWith('.test.js'))) {
  const dir = path.dirname(t);
  for (const [, spec] of fs.readFileSync(t, 'utf8').matchAll(/from\s+'(\.[^']+\.js)'/g)) {
    testedModules.add(path.resolve(dir, spec));
  }
}
const untested = pure.filter((f) => !fs.existsSync(f.replace(/\.js$/, '.test.js')) && !testedModules.has(path.resolve(f)));
if (untested.length <= UNTESTED_PURE_BASELINE) {
  ok(`المنطق الخالص ${pure.length} ملفًّا · بلا اختبارٍ مجاور ${untested.length} (خطّ الأساس ${UNTESTED_PURE_BASELINE})`);
} else {
  bad(
    `${untested.length} ملفَّ منطقٍ خالص بلا اختبارٍ مجاور — تجاوز خطّ الأساس (${UNTESTED_PURE_BASELINE}) بـ${untested.length - UNTESTED_PURE_BASELINE}`
  );
}
if (untested.length < UNTESTED_PURE_BASELINE) {
  notes.push(`خطّ أساس «بلا اختبار» صار ${untested.length} — أنزِله في audit-portal.mjs كي لا يعود يرتفع`);
}

/* ═══════════ 6. لقطة عامة ═══════════ */
section(6, 'لقطة');
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
