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

test('★★ البحثُ الموحّد والمؤشّراتُ في لوحة الحوكمة — ‹LPN-509/510›', () => {
  const board = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'GovernanceBoard.jsx'),
    'utf8'
  );
  assert.ok(board.includes('lpn/lpnSearch.js'), 'اللوحة لا تعرف البحث');
  assert.ok(board.includes('lpn/lpnKpis.js'), 'اللوحة لا تعرف المؤشّرات');
  for (const fn of ['classifyQuery', 'searchPallets', 'traceOf', 'palletsByState']) {
    assert.ok(board.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله اللوحة`);
  }
  // ★ وسببُ المطابقة يُعرض — نتيجةٌ بلا سببٍ تُربك (قرارُ lpnSearch المعلن).
  assert.ok(board.includes('{why}'), 'النتائجُ بلا سببِ مطابقة');
});

test('★★★ جردُ الطبالي موصولٌ — و**لا رقمَ للعادّ** (ق-٢/ح-٣) ‹LPN-508›', () => {
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'countService.js'), 'utf8');
  const screen = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'CountFlow.jsx'),
    'utf8'
  );
  assert.ok(svc.includes('./countPallet.js'), 'الخدمة تستدعي المنطق الخالص');
  assert.ok(screen.includes('lpn/countService.js'), 'الشاشة تستدعي الخدمة');
  assert.ok(screen.includes('recordSighting'), 'المشاهدةُ لا تُسجَّل');

  /*
   * ★★★ العقدُ الذي يحرسه هذا الاختبار: **ما يُعرض للعادّ يأتي من
   * `counterView` وحدها** — وهي بلا حقلِ كمّيّةٍ أصلًا. فلو عرضت الشاشةُ
   * `lines` أو `qty` أو `baseQty` من الطبلية لَخرقت CAP-101 «الالتقاط لا
   * يُحاسِب»، وصار العادُّ يرى ما ينبغي أن يعدّه فيؤكّد الدفترَ بدل أن
   * يفحصه — وهو أصلُ الجرد الأعمى كلِّه.
   */
  for (const banned of ['.baseQty', '.qty', 'totalBaseQty', 'view.lines']) {
    assert.ok(!screen.includes(banned), `شاشةُ الجرد تعرض «${banned}» — والعادُّ لا يرى رقمًا`);
  }
  // والصفحةُ مسجَّلةٌ في القائمة — وإلّا كانت يتيمةً لا يصل إليها أحد.
  const nav = fs.readFileSync(path.join(SRC, 'services', 'auth', 'navCatalog.js'), 'utf8');
  assert.ok(nav.includes('/dashboard/lpn-count'), 'الصفحةُ غيرُ مسجّلةٍ في القائمة');
});

test('★★ طبالي النقل موصولةٌ بلوحة النقل القائمة — ‹LPN-407›', () => {
  const board = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'ledger', 'TransferBoard.jsx'),
    'utf8'
  );
  assert.ok(board.includes('lpn/transferPallets.js'), 'اللوحة لا تعرف طبقة النقل');
  for (const fn of ['shipmentManifest', 'transferIdentityDecision']) {
    assert.ok(board.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله اللوحة`);
  }
  /*
   * ★ وقاعدةُ الهويّة **تُعرَض من المنطق لا تُكتب نصًّا في الواجهة**: نصٌّ
   * مكرّرٌ في JSX يفترق عن `transferIdentityDecision` أوّلَ تعديلٍ فيها،
   * فتقول الشاشةُ ما لا يفعله النظام.
   */
  assert.ok(board.includes('identityRule.reason'), 'قاعدةُ الهويّة مكتوبةٌ نصًّا لا مقروءةٌ من المنطق');
  // ★ ولا حدَّ صامت: سقفُ الجلب يُعلَن حين يُبلَغ.
  assert.ok(board.includes('unitsCapped'), 'سقفُ الجلب صامتٌ — فتبدو قائمةٌ ناقصةٌ كاملة');
});

test('★★ معجمُ الميدان موصولٌ بالشاشات الأربع — والعربيّةُ تبقى الأصل ‹LPN-O08›', () => {
  const dir = path.join(SRC, 'components', 'brandzo-erp', 'lpn');
  for (const f of ['ReceivingFlow.jsx', 'PickingFlow.jsx', 'CountFlow.jsx']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(src.includes('useFieldLang'), `${f} لا تعرف لغةَ الميدان`);
    assert.ok(src.includes('<FieldLangSwitch'), `${f} بلا مبدّلِ لغة`);
    // ★ الاتّجاهُ يتبع اللغة — وإلّا ظهرت الإنجليزيّةُ في تخطيطٍ معكوس.
    assert.ok(src.includes('dir={dir}'), `${f} تثبّت الاتّجاه فلا تنقلب مع اللغة`);
  }
  /*
   * ★★★ والقيدُ الحاكم: المعجمُ **محصورٌ بالتطبيق الميدانيّ**. فلو تسرّب
   * إلى البوابة لَصار نصفُها مترجَمًا ونصفُها لا — وهو أسوأ من عربيّةٍ
   * كاملة. والبوّابة ٢٤٩ ملفَّ واجهةٍ لا يمسّها هذا العمل.
   */
  const outside = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(jsx|astro)$/.test(e.name)) continue;
      if (full.includes(path.join('brandzo-erp', 'lpn'))) continue;
      if (fs.readFileSync(full, 'utf8').includes('fieldLexicon')) outside.push(path.relative(SRC, full));
    }
  };
  walk(path.join(SRC, 'components'));
  walk(path.join(SRC, 'pages'));
  assert.deepEqual(outside, [], `معجمُ الميدان تسرّب خارج تطبيقه: ${outside.join(' · ')}`);
});

test('★★★ التحميلُ موصولٌ — والجلسةُ تُشتقّ فلا تضيع ‹LPN-310›', () => {
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'loadingService.js'), 'utf8');
  const screen = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'PickingFlow.jsx'),
    'utf8'
  );
  assert.ok(svc.includes('./stagingLoading.js'), 'الخدمة تستدعي المنطق الخالص');
  assert.ok(screen.includes('lpn/loadingService.js'), 'الشاشة تستدعي الخدمة');
  for (const fn of ['buildSession', 'scanLoad', 'closeLoad', 'loadingCounters', 'loadingCloseProblem']) {
    assert.ok(screen.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله الشاشة`);
  }
  /*
   * ★★★ والقيدُ الذي يجعل الجلسةَ لا تضيع: **تُبنى من الحالة الحيّة**.
   * فلو خُزّنت في مجموعةٍ لَاحتاجت قاعدةً تنتظر النشر (درس LPN-O06/O07)،
   * ولو عاشت في ذاكرة المتصفّح وحدها لَضاع عدُّ شاحنةٍ بإغلاق هاتف.
   * والاشتقاقُ يجعل عاملًا آخرَ على جهازٍ آخر يستأنف بلا نقلِ شيء.
   */
  assert.ok(!svc.includes('loading_sessions'), 'التحميل يفتح مجموعةً تنتظر نشرَ قاعدة');
  for (const imp of importsOf(path.join(SRC, 'services', 'lpn', 'loadingService.js'))) {
    assert.ok(!/firebase/i.test(imp), `خدمةُ التحميل تستورد «${imp}» — والكتابةُ تمرّ بـlpnService`);
  }
  // ★ والقراءةُ تتبع الطور — الممسوحُ في التحميل هويّةُ طبليةٍ لا بندُ سحب.
  assert.ok(screen.includes(`mode === 'loading'`), 'القراءةُ لا تتبع طورَ التحميل');
});

test('★★★ استلامُ الوجهة موصولٌ — والفرقُ يبقى مفتوحًا حتى يُحسم ‹LPN-408›', () => {
  const svc = fs.readFileSync(path.join(SRC, 'services', 'lpn', 'inboundService.js'), 'utf8');
  const screen = fs.readFileSync(
    path.join(SRC, 'components', 'brandzo-erp', 'lpn', 'PickingFlow.jsx'),
    'utf8'
  );
  assert.ok(svc.includes('./transferPallets.js'), 'الخدمة تستدعي المنطق الخالص');
  assert.ok(screen.includes('lpn/inboundService.js'), 'الشاشة تستدعي الخدمة');
  for (const fn of ['buildInboundSession', 'scanInbound', 'buildDiscrepancies', 'receiveCloseProblem']) {
    assert.ok(screen.includes(fn), `«${fn}» مبنيٌّ ولا تستعمله الشاشة`);
  }
  /*
   * ★★★ القاعدة ١٥: **الفرقُ يبقى مفتوحًا حتى صدور قرار** — ولا استثناءَ
   * بسببٍ عابرٍ هنا، بخلاف إغلاق التحميل. فالفرقُ يعني بضاعةً ضاعت أو
   * زادت، وإغلاقُه «ليمشي الحال» يقتل الثقة بالسجلّ كلّه. فالشاشةُ تعرض
   * الفروقَ ولا تحمل زرَّ إغلاقٍ يتجاوزها.
   */
  const start = screen.indexOf("if (mode === 'inbound') {");
  const end = screen.indexOf("if (mode === 'loading') {", start);
  assert.ok(start > 0 && end > start, 'كتلةُ عرض الاستلام غير موجودة');
  const view = screen.slice(start, end);
  assert.ok(!/override|closeNote/i.test(view), 'شاشةُ الاستلام تحمل تجاوزًا — والفرقُ لا يُتجاوَز');
  assert.ok(view.includes('discrepancy_rule'), 'الشاشةُ لا تقول للعامل لماذا لا يُغلق');
  assert.ok(!svc.includes('inbound_sessions'), 'الاستلام يفتح مجموعةً تنتظر نشرَ قاعدة');
  for (const imp of importsOf(path.join(SRC, 'services', 'lpn', 'inboundService.js'))) {
    assert.ok(!/firebase/i.test(imp), `خدمةُ الاستلام تستورد «${imp}» — والكتابةُ تمرّ بـlpnService`);
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
