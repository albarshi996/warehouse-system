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
  ['lpnSearch.js', 'LPN-504 — البحثُ الموحّد ينتظر مدخلَه في البوابة'],
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
  /*
   * ★★ ومسحُ الرفّ **مسحٌ لا كتابةٌ باليد** (2026-08-27، بعد rebase على main).
   *
   * دفعةُ `1846b45` أصلحت «الماسحُ لا يقرأ» بمحرّكٍ موحّد: كاميرا + جهازُ
   * باركودٍ مسموعٌ في الشاشة كلّها. ودمجُ طور التخزين فوقها **مرّ نظيفًا
   * نصًّا وترك فجوةً معنويّة**: الجهازُ كان مقيّدًا بـ`draft.state`
   * والكاميرا في نموذج الاستلام وحده — فيقف العامل عند الرفّ ويكتب الكود
   * بيده. وهو عين ما بُنيت تلك الدفعة لتمنعه.
   */
  assert.ok(
    screen.includes(`mode === 'putaway'`) && screen.includes('setBinCode(normalizeScanned('),
    'القراءةُ تتبع الطور — وفي التخزين تذهب إلى حقل الرفّ لا إلى بحث الأصناف'
  );
  const putawayForm = screen.slice(screen.indexOf('onSubmit={finishPutaway}'));
  assert.ok(
    putawayForm.slice(0, 1400).includes('ScanCameraButton'),
    'حقلُ الرفّ بلا كاميرا — والعاملُ عند الرفّ لا لوحةَ مفاتيح معه'
  );

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

test('★★ التجهيزُ موصولٌ بشاشة التحضير — ‹LPN-309›', () => {
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'stagingService.js'), 'utf8');
  const screen = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'PickingFlow.jsx'),
    'utf8'
  );
  assert.ok(svc.includes('./stagingLoading.js'), 'الخدمة تستدعي المنطق الخالص');
  assert.ok(screen.includes('lpn/stagingService.js'), 'الشاشة تستدعي الخدمة');
  for (const fn of ['listStagingQueue', 'previewStaging', 'assignToStaging']) {
    assert.ok(screen.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله الشاشة`);
  }
  // ★ والقراءةُ تتبع الطور هنا أيضًا — الممسوحُ في التجهيز كودُ منطقةٍ لا بندُ سحب.
  assert.ok(
    screen.includes(`mode === 'staging'`) && screen.includes('setStageBin(normalizeScanned('),
    'مسحُ المنطقة يذهب إلى حقلها لا إلى بحث الأصناف'
  );
});

test('★★★ الوجهةُ تُحمل من المهمّة إلى طبلية الصرف — وإلّا فحارسُ منع الخلط لا يُطلق', () => {
  /*
   * كُشف 2026-08-27 مع LPN-309: `route` كان يعيش على مهمّة التحضير وينتهي
   * عندها، فتولد طبليةُ الصرف بلا وجهة، ويسقط شرطُ `wanted && given` في
   * `stagingAssignVerdict` — **فيمرّ كلُّ خلطٍ صامتًا**. وهذا الحارس يمنع
   * انقطاعَ السلسلة ثانيةً في أيّ حلقةٍ من حلقاتها الثلاث.
   */
  const scan = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'pickingScan.js'), 'utf8');
  const store = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'lpnService.js'), 'utf8');
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'pickingService.js'), 'utf8');
  assert.ok(scan.includes('route: up(route)'), 'buildIssuePallet يحمل الوجهة على الحمولة');
  assert.ok(store.includes('route: String(route'), 'createHandlingUnit يُثبت الوجهة في المستند');
  assert.ok(svc.includes('route: task.route'), 'الإقفال يمرّر وجهة المهمّة إلى الحمولة');
});

test('★★★ الأدوارُ موصولةٌ بالشاشات الثلاث — و**لا تحجب من لا تُعرَف** ‹LPN-511›', () => {
  const screens = ['ReceivingFlow.jsx', 'GovernanceBoard.jsx', 'PickingFlow.jsx'];
  for (const f of screens) {
    const src = fs.readFileSync(path.join(SRC, 'components', 'brandzo-erp', 'lpn', f), 'utf8');
    assert.ok(src.includes('lpn/lpnRoles.js'), `${f} لا تعرف الأدوار`);
    assert.ok(src.includes('uiGate('), `${f} لا تستدعي البوّابة`);
    assert.ok(src.includes('<RoleGate'), `${f} تمنع بلا أن تقول لماذا`);
  }
  /*
   * ★★★ والشرطُ الجوهريّ: البوّابة تُستدعى بـ`uiGate` **لا بـ`canDo`**.
   * `canDo` تُعيد `false` لكلّ دورٍ مجهول — ودورٌ مجهولٌ يقع فعلًا حين تفشل
   * قراءةُ الملفّ الشخصيّ فيرتدّ إلى `viewer` (تحذيرٌ مكتوبٌ في
   * `fetchUserProfile` عن عطبٍ منع المديرَ العام صامتًا). فاستعمالُها هنا
   * يحوّل عطبَ قراءةٍ إلى حجبٍ كامل — وهو ضررٌ في بوابةٍ تعمل.
   */
  for (const f of screens) {
    const src = fs.readFileSync(path.join(SRC, 'components', 'brandzo-erp', 'lpn', f), 'utf8');
    assert.ok(!src.includes('canDo('), `${f} تستعمل canDo — والمجهولُ يُحجب بها`);
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
