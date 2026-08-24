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
 *   6. **مدخلٌ مكرّرٌ بلا دورٍ يبرّره** (تدقيق 24.08.2026): الصفحة تُدرَج في
 *      مجموعتين عمدًا لتصل لدورين لا يريان مجموعةً واحدة — لكنّ نسختين بنفس
 *      `roles` حشوٌ لا يكسبه أحد.
 *   7. **مستندٌ مبنيٌّ لا يستطيع أحدٌ أن يبدأه** (تدقيق 24.08.2026): كان
 *      تصنيف أزرار «بدء مستند جديد» مصفوفةً محلّيّةً داخل `DocumentsInbox.jsx`
 *      لا يقرؤها حارس، فانحرفت وبقيت سبعةُ أنواعٍ بلا زرّ — منها **سلسلة
 *      الإنتاج كاملةً**. نزل التصنيف إلى `startGroups.js` الخالص.
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
import { START_GROUPS, uncoveredReadyTypes, plannedTypes } from '../src/services/documents/startGroups.js';
import { GOVERNED_FORMS } from '../src/services/documents/schemas/index.js';

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

/* ═══════════ 6. أنماط الثيم ═══════════
 *
 * صفحةٌ ترسم مكوّنًا داخل `.o_theme` ولا تستورد `odoo.css` تُعرض **نصًّا
 * مرصوصًا بلا بطاقاتٍ ولا أزرار** — ولا يكشفه اختبارٌ ولا لينت، لأنّ الكود
 * سليمٌ تمامًا. وقع على `directed-storage` (2026-08-17) وبقي حتى رآه المالك.
 */
section(6, 'أنماط الثيم — كلّ صفحةٍ تستعمل o_theme تستورد ملفّيه');
const COMPONENTS_DIR = path.join(ROOT, 'src/components');
const themedComponents = new Set(
  walk(COMPONENTS_DIR, ['.jsx'])
    .filter((f) => /\bo_theme\b/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.basename(f))
);

const missingTheme = [];
for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.astro'))) {
  const src = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
  const used = [...src.matchAll(/import\s+\w+\s+from\s+'[^']*\/([A-Za-z0-9_]+\.jsx)'/g)]
    .map((m) => m[1])
    .filter((c) => themedComponents.has(c));
  if (used.length && !/odoo\.css/.test(src)) missingTheme.push({ file, used });
}
if (missingTheme.length === 0) {
  ok(`كل صفحة تستعمل مكوّنات الثيم (${themedComponents.size} مكوّنًا) تستورد odoo.css`);
} else {
  bad(`${missingTheme.length} صفحة ترسم داخل o_theme بلا استيراد odoo.css — ستُعرض نصًّا مرصوصًا:`);
  missingTheme.forEach((m) => info(`• ${m.file} ← ${m.used.join('، ')}`));
}

/* ═══════════ 7. المنطق داخل الصفحات ═══════════
 *
 * `npm test` يمسح أنماط `*.test.js` تحت `src` — فكلّ سطرٍ داخل وسم `script`
 * في صفحة `.astro` هو **خارج نطاق الاختبار بالبناء**، لا بالإهمال. وحارس
 * النقاء أعلاه (القسم ٥) أعمى عنه تمامًا لأنّه يعدّ الملفّات لا الوسوم، فكان
 * يقول «نظيف» وهو صادقٌ في نطاقه — ونطاقه لا يشمل أكبر بقعةٍ عمياء عندنا.
 *
 * فالميزانيّة سقفٌ ينزل ولا يصعد: كلّ شاشةٍ يهبط منطقها إلى `src/services`
 * تُنقص الرقم، ولا شيء يرفعه. و`INLINE_LOGIC_MAX` يمنع أن **تُولد** صفحةٌ
 * سمينة — والدَّين القائم مسمًّى صفحةً صفحة لا مغفورًا جملةً، كي يُرى وهو
 * ينكمش.
 */
section(7, 'المنطق داخل الصفحات — ما لا يبلغه اختبار');

const INLINE_LOGIC_BUDGET = 4235;
const INLINE_LOGIC_MAX = 40;
/** الدَّين القائم يوم وُضع الحارس (2026-08-21) — يُشطب اسمٌ كلّما هبط منطقه. */
const INLINE_LOGIC_DEBT = new Set([
  'dashboard/retail-hub.astro',
  'dashboard/vehicles-inventory.astro',
  'dashboard/fleet-operations.astro',
  'dashboard/org-structure.astro',
  'dashboard/assets-inventory.astro',
  'dashboard/maintenance-center.astro',
  'dashboard/custody.astro',
  'dashboard/general-manager-operations-briefing.astro',
  'dashboard/supply-chain.astro',
  'dashboard/erp-workflows.astro',
  'dashboard/acceptance-check.astro',
  'dashboard/hse-checklists.astro',
  'dashboard/index.astro',
]);

/**
 * أسطرُ **الكود** داخل وسوم `script` في صفحةٍ واحدة.
 *
 * تُهمَل: الفارغة · **التعليقات** · ووسمٌ بلا جسد (`src=` أو مغلقٌ في سطره)
 * — فاستدعاء مكتبةٍ مستضافةٍ ذاتيًّا ليس منطقًا هاربًا.
 *
 * ولمَ تُستثنى التعليقات؟ لأنّ المقياس يقيس **ما لا يبلغه اختبار**، والتعليق
 * لا يُنفَّذ فلا يحتاج اختبارًا. وعدُّه يقلب الحارس على صاحبه: يصير إصلاحُ
 * عطبٍ مع شرح سببه تجاوزًا للميزانيّة، فيُغري بحذف الشرح لإرضاء العدّاد —
 * وهو أسوأ ما يفعله مقياس. (وقع فعلًا 2026-08-21: إصلاح مخطّطات
 * `erp-workflows` أضاف سطرين كودًا وعشرةً شرحًا، فأسقط التدقيق.)
 */
function inlineLogicLines(source) {
  const openTag = /<script[^>]*>/;
  const closeTag = /<\/script>/;
  let count = 0;
  let inside = false;
  let inBlockComment = false;
  for (const line of source.split('\n')) {
    if (inside) {
      if (closeTag.test(line)) {
        inside = false;
        inBlockComment = false;
        continue;
      }
      const t = line.trim();
      if (inBlockComment) {
        if (t.includes('*/')) inBlockComment = false;
        continue;
      }
      if (!t) continue;
      if (t.startsWith('//')) continue;
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) inBlockComment = true;
        continue;
      }
      count += 1;
      continue;
    }
    const m = openTag.exec(line);
    if (m && !closeTag.test(line.slice(m.index + m[0].length))) inside = true;
  }
  return count;
}

const PAGES_ROOT = path.join(ROOT, 'src/pages');
const inlineLogic = walk(PAGES_ROOT, ['.astro'])
  .map((f) => ({
    page: path.relative(PAGES_ROOT, f).split(path.sep).join('/'),
    lines: inlineLogicLines(fs.readFileSync(f, 'utf8')),
  }))
  .filter((p) => p.lines > 0)
  .sort((a, b) => b.lines - a.lines);

const inlineTotal = inlineLogic.reduce((sum, p) => sum + p.lines, 0);
const bornFat = inlineLogic.filter((p) => p.lines > INLINE_LOGIC_MAX && !INLINE_LOGIC_DEBT.has(p.page));
const paidOff = [...INLINE_LOGIC_DEBT].filter(
  (page) => (inlineLogic.find((p) => p.page === page)?.lines ?? 0) <= INLINE_LOGIC_MAX
);

if (inlineTotal <= INLINE_LOGIC_BUDGET) {
  ok(`منطقٌ داخل الصفحات ${inlineTotal} سطرًا في ${inlineLogic.length} صفحة (الميزانيّة ${INLINE_LOGIC_BUDGET})`);
} else {
  bad(
    `منطقُ الصفحات ${inlineTotal} سطرًا — تجاوز الميزانيّة (${INLINE_LOGIC_BUDGET}) بـ${inlineTotal - INLINE_LOGIC_BUDGET}. المنطق ينزل إلى src/services باختبارٍ مجاور، ولا يصعد إلى الوسم.`
  );
}
if (bornFat.length) {
  bad(`${bornFat.length} صفحةً وُلدت سمينة — فوق ${INLINE_LOGIC_MAX} سطرًا وليست على قائمة الدَّين:`);
  bornFat.forEach((p) => info(`• ${p.page} — ${p.lines} سطرًا`));
}
if (inlineTotal < INLINE_LOGIC_BUDGET) {
  notes.push(`ميزانيّة منطق الصفحات صارت ${inlineTotal} — أنزِلها في audit-portal.mjs كي لا تعود ترتفع`);
}
paidOff.forEach((page) => notes.push(`«${page}» هبط منطقها — اشطبها من INLINE_LOGIC_DEBT`));
if (inlineLogic.length) {
  info(`أثقلها: ${inlineLogic.slice(0, 3).map((p) => `${p.page} (${p.lines})`).join(' · ')}`);
}

/* ═══════════ 8. تكرار المداخل ═══════════ */
section(8, 'تكرار المداخل — الصفحة الواحدة بمدخلٍ واحد لكل مستخدم');

/**
 * الصفحة قد تُدرَج في مجموعتين **عمدًا** لتصل لدورين لا يريان مجموعةً واحدة
 * (`tasks` لمستخدم الإدارة · `partner-ledger` للخزينة وللمندوب) — فهذا تصميمٌ
 * لا عطب، وحذفُه يكسر أصحابه. لكنّ نسختين بنفس `roles` تمامًا حشوٌ خالص:
 * لا دورَ يكسبه أحدهما دون الآخر. وهذا وحده ما يُفشِل.
 *
 * والتكرار المقصود يُعدّ ويُعلَن كي لا ينمو بلا انتباه — ويبقى الأدمن (يرى
 * كلّ شيء) محميًّا بـ`duplicateIndexes` في `RoleNav`.
 */
const DUP_PLACEMENT_BASELINE = 4;
const placements = new Map();
for (const g of NAV_GROUPS) {
  for (const it of g.items) {
    if (!placements.has(it.path)) placements.set(it.path, []);
    placements.get(it.path).push({ group: g.group, label: it.label, roles: it.roles });
  }
}
const multi = [...placements.entries()].filter(([, list]) => list.length > 1);
const roleKey = (r) => (Array.isArray(r) ? [...r].sort().join(',') : '');
const redundant = multi.filter(([, list]) => new Set(list.map((x) => roleKey(x.roles))).size < list.length);

if (redundant.length === 0) {
  ok(`لا مدخلَ مكرّرًا بلا فائدة — التكرار المقصود ${multi.length} صفحةً بأدوارٍ متمايزة`);
} else {
  bad(`${redundant.length} صفحةً مُدرجةً مرّتين بنفس الأدوار — حشوٌ لا يكسبه دور:`);
  redundant.forEach(([p, list]) => info(`• ${p} → ${list.map((x) => `«${x.label}» في ${x.group}`).join(' | ')}`));
}
multi.forEach(([p, list]) => {
  const labels = new Set(list.map((x) => x.label));
  if (labels.size > 1) info(`• ${p} بعنوانين: ${[...labels].map((l) => `«${l}»`).join(' · ')} — لكلٍّ دورُه`);
});
if (multi.length > DUP_PLACEMENT_BASELINE) {
  bad(`التكرار المقصود ارتفع إلى ${multi.length} (خطّ الأساس ${DUP_PLACEMENT_BASELINE}) — كلُّ إدراجٍ ثانٍ يحتاج دورًا يبرّره`);
} else if (multi.length < DUP_PLACEMENT_BASELINE) {
  notes.push(`التكرار المقصود صار ${multi.length} — أنزِل DUP_PLACEMENT_BASELINE في audit-portal.mjs`);
}

/* ═══════════ 9. مستندٌ مبنيٌّ ولا مدخلَ له ═══════════ */
section(9, 'مداخل المستندات — كل نوعٍ جاهزٍ يستطيع أحدٌ أن يبدأه');

/**
 * كُشف في تدقيق 24.08.2026: كان تصنيف أزرار «بدء مستند جديد» مصفوفةً محلّيّةً
 * داخل `DocumentsInbox.jsx`، فلم يقرأها حارس — **فانحرفت**: سبعةُ أنواعٍ
 * مبنيّةٍ في المحرّك بلا زرٍّ يبدأها، منها **سلسلة الإنتاج كاملةً**. نزل
 * التصنيف إلى `startGroups.js` الخالص، وهذا يمنع عودته.
 */
const uncoveredDocs = uncoveredReadyTypes();
if (uncoveredDocs.length === 0) {
  ok(`كل الأنواع الجاهزة (${GOVERNED_FORMS.filter((f) => f.ready).length}) لها مدخلُ بدءٍ في ${START_GROUPS.length} مجموعات`);
} else {
  bad(`${uncoveredDocs.length} نوعَ مستندٍ مبنيٌّ ولا زرَّ يبدأه: ${uncoveredDocs.join('، ')} — أضِفها إلى START_GROUPS`);
}
const planned = plannedTypes();
if (planned.length) info(`مصنَّفٌ ولمّا يُبنَ بعد (لا يُرسم زرُّه): ${planned.join('، ')}`);

/* ═══════════ 10. بطاقات الرئيسية مقابل الكتالوج ═══════════ */
section(10, 'بطاقات الرئيسية — لا رابطَ خارج الكتالوج ولا تسميةَ تنحرف');

/**
 * لوحة التحكم الرئيسية تكتب بطاقاتها **يدويًّا** (تصميمٌ مقصود: البطاقة تشرح
 * وتوسّع، والقائمة تختصر). لكنّ اليدويّ ينحرف: كُشف في تدقيق 24.08.2026 أنّ
 * بطاقة «لوحات القيادة» تحمل أسماءً عامّةً قديمة و**تُسقط قمرة اللوجستيات**
 * رغم أنّها إحدى اللوحات الأربع.
 *
 * فالحارس لا يفرض تطابقًا حرفيًّا — التوسيع مقصود («التوظيف الذكي» مقابل
 * «التوظيف») — بل يمنع اثنين: **رابطًا لا وجود له في الكتالوج**، و**نموَّ
 * الانحراف** فوق خطّ أساسه المعلوم.
 */
const HOME_LABEL_DRIFT_BASELINE = 7;
const HOME_PAGE = path.join(PAGES_DIR, 'index.astro');
const catalogLabels = new Map();
for (const g of NAV_GROUPS) {
  for (const it of g.items) if (!catalogLabels.has(it.path)) catalogLabels.set(it.path, it.label);
}
const homeLinks = [
  ...fs.readFileSync(HOME_PAGE, 'utf8').matchAll(/path: '(\/dashboard[^']*)'[^}]*?label: '([^']+)'/g),
];
const ghosts = homeLinks.filter(([, p]) => !catalogLabels.has(p));
const reworded = homeLinks.filter(([, p, l]) => catalogLabels.has(p) && catalogLabels.get(p) !== l);

if (ghosts.length === 0) {
  ok(`كل روابط الرئيسية (${homeLinks.length}) مسجّلةٌ في الكتالوج`);
} else {
  bad(`${ghosts.length} رابطًا في الرئيسية خارج الكتالوج — لا يحرسه أحد:`);
  ghosts.forEach(([, p, l]) => info(`• ${p} («${l}»)`));
}
if (reworded.length > HOME_LABEL_DRIFT_BASELINE) {
  bad(`تسميات الرئيسية المنحرفة ${reworded.length} (خطّ الأساس ${HOME_LABEL_DRIFT_BASELINE}) — البطاقة توسّع، ولا تسمّي شيئًا آخر`);
  reworded.forEach(([, p, l]) => info(`• ${p} — الرئيسية «${l}» · الكتالوج «${catalogLabels.get(p)}»`));
} else {
  ok(`تسمياتٌ موسَّعةٌ عمدًا في البطاقات: ${reworded.length} (السقف ${HOME_LABEL_DRIFT_BASELINE})`);
  if (reworded.length < HOME_LABEL_DRIFT_BASELINE) {
    notes.push(`انحراف تسميات الرئيسية صار ${reworded.length} — أنزِل HOME_LABEL_DRIFT_BASELINE`);
  }
}

/* ═══════════ 11. لقطة عامة ═══════════ */
section(11, 'لقطة');
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
