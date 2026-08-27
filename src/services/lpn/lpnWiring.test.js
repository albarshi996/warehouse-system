/**
 * 🔒 حارس الوصل — **منطقٌ بلا مستدعٍ لا يُعدّ منجَزًا.**
 *
 * ═══ لماذا وُجد هذا الحارس (2026-08-27 · LPN-211) ═══
 *
 * أُغلقت LPN-211 ببيّنةِ كوميت، وشروطُ قبولها الثلاثةُ كلُّها بصريّة («فتح
 * موقعٍ يعرض طباليه»…). ثمّ تبيّن أنّ `palletMap.js` **لم يستدعِه أحد**: بُني
 * ومُختبِر ولم يصل شاشةً واحدة. والمتتبّعُ قال ٨٨٪ لأنّه يفحص وجود البيّنة لا
 * تحقّق الشرط — فمرّت.
 *
 * والمسحُ بعدها كشف أنّها ليست حالةً واحدة: **سبعةُ ملفّاتٍ** في هذه الطبقة
 * بلا مستدعٍ، وكلُّ مهامّها موسومةٌ «منجَزة».
 *
 * فهذا الحارس يقلب القاعدة: كلّ وحدةِ منطقٍ هنا **إمّا موصولةٌ، وإمّا مذكورةٌ
 * باسمها ودَينها في `PENDING_WIRING` أدناه**. لا صمتَ بينهما. والقائمةُ
 * تنقص ولا تزيد — إضافةُ اسمٍ إليها قرارٌ يُرى في المراجعة، لا سهوٌ يمرّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..');

/**
 * ★ الدَّينُ المعلَن: منطقٌ مبنيٌّ ومُختبَرٌ لم يبلغ شاشةً بعد.
 *
 * لكلٍّ مهمّتُه ليُعرف أين يُوصَل — لا «سنصله لاحقًا» بلا عنوان.
 */
const PENDING_WIRING = new Map([
  ['countPallet.js', 'LPN-501/502 — جردُ الطبلية ينتظر وصلًا بصفحة الجرد القائمة'],
  ['lpnKpis.js', 'LPN-505 — تقاريرُ الأداء تنتظر لوحتَها'],
  ['lpnRoles.js', 'LPN-506 — تقييدُ الأوضاع بالدور ينتظر وصلًا بالشاشات الثلاث'],
  ['lpnSearch.js', 'LPN-504 — البحثُ الموحّد ينتظر مدخلَه في البوابة'],
  ['stagingLoading.js', 'LPN-305/306/307 — مناطقُ التجهيز والتحقّق عند التحميل تنتظر وصلًا'],
  ['transferPallets.js', 'LPN-402/403/404 — النقلُ بالطبالي ينتظر وصلًا بشاشة النقل'],
]);

/** كلّ ملفّات المصدر التي يجوز أن تستدعي — بلا اختبارات (الاختبار يستورد ليُثبت). */
function sourceFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|jsx|astro|mjs)$/.test(e.name) && !/\.test\.(js|mjs)$/.test(e.name)) out.push(f);
    }
  };
  walk(SRC);
  return out;
}

/** استيراداتُ ملفّ — سطورُ import/require التي تشير إلى مسار. */
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:import\s[^'"]*|from\s*|require\s*\()\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/** وحداتُ المنطق في الطبقة — بلا الخدمات (الخدمةُ بابُ شبكةٍ لا منطق). */
function lpnModules() {
  return fs
    .readdirSync(path.join(SRC, 'services', 'lpn'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
}

/** أيستدعي أحدٌ هذه الوحدة؟ من خارج الطبقة أو من داخلها — كلاهما وصل. */
function hasCaller(mod, files) {
  const inLayer = path.join('services', 'lpn');
  const spec = [`'./${mod}'`, `"./${mod}"`];
  return files.some((f) => {
    if (path.basename(f) === mod) return false;
    const src = fs.readFileSync(f, 'utf8');
    return f.includes(inLayer) ? spec.some((x) => src.includes(x)) : src.includes(`lpn/${mod}`);
  });
}

test('🔒 كلّ وحدةِ منطقٍ في طبقة الطبالي موصولةٌ — أو مذكورةٌ باسمها في دَينٍ معلَن', () => {
  const files = sourceFiles();
  const silent = lpnModules().filter((m) => !hasCaller(m, files) && !PENDING_WIRING.has(m));
  assert.deepEqual(
    silent,
    [],
    'وحدةُ منطقٍ بلا مستدعٍ ولا ذِكر — بُنيت واختُبرت ولن تبلغ شاشةً، ' +
      'وستُعدّ «منجَزة» كما عُدّت LPN-211:\n' +
      silent.map((m) => `  · ${m}`).join('\n')
  );
});

test('★ القائمةُ تنقص ولا تكذب — اسمٌ وُصل يخرج منها فورًا', () => {
  const files = sourceFiles();
  const wired = [...PENDING_WIRING.keys()].filter((m) => hasCaller(m, files));
  assert.deepEqual(
    wired,
    [],
    'هذه وُصلت فعلًا ولمّا تُشطب من الدَّين — ودَينٌ لا يُشطب يصير ضجيجًا يُتجاهَل:\n' +
      wired.map((m) => `  · ${m} — ${PENDING_WIRING.get(m)}`).join('\n')
  );
});

test('★ لا اسمَ ميّتٌ في الدَّين — كلّ مذكورٍ ملفٌّ قائم', () => {
  const mods = new Set(lpnModules());
  const ghosts = [...PENDING_WIRING.keys()].filter((m) => !mods.has(m));
  assert.deepEqual(ghosts, [], `ملفّاتٌ في الدَّين لا وجود لها:\n${ghosts.join('\n')}`);
});

test('★★ `putawayTask` موصولٌ بشاشة الاستلام الميدانيّ عبر خدمته — ‹LPN-214›', () => {
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'putawayService.js'), 'utf8');
  const screen = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'ReceivingFlow.jsx'),
    'utf8'
  );
  assert.ok(svc.includes('./putawayTask.js'), 'الخدمة تستدعي المنطق الخالص');
  assert.ok(screen.includes('lpn/putawayService.js'), 'الشاشة تستدعي الخدمة');
  for (const fn of ['listPutawayQueue', 'openTask', 'previewBin', 'executePutaway']) {
    assert.ok(screen.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله الشاشة`);
  }
  // ★ لا مجموعةَ جديدة: قاعدةٌ غير منشورةٍ تعني permission-denied عند أوّل
  // فتحة، ولا يكشفه بناءٌ ولا اختبار (درس LPN-O06/O07). والفحصُ على
  // **الاستيراد لا على ذِكر الاسم**: خدمةٌ لا تعرف Firestore أصلًا لا تفتح
  // مجموعةً — وتُسلّم الكتابة كلَّها لـ`lpnService` وقواعدُه منشورة.
  for (const imp of importsOf(path.join(SRC, 'services', 'lpn', 'putawayService.js'))) {
    assert.ok(
      !/firebase/i.test(imp),
      `خدمةُ التخزين تستورد «${imp}» — والكتابةُ كلُّها تمرّ بـlpnService بلا مجموعةٍ جديدة`
    );
  }
});

test('★★ `palletMap` موصولٌ بخريطة المواقع — الحالةُ التي وُلد منها الحارس', () => {
  const map = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'warehouse', 'LocationMap.jsx'),
    'utf8'
  );
  assert.ok(map.includes('lpn/palletMap.js'), 'الخريطة تستورد طبقة الطبالي');
  for (const fn of ['binSummary', 'binsOfItem', 'palletCellOf', 'unexpectedPlacements']) {
    assert.ok(map.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله الخريطة`);
  }
});
