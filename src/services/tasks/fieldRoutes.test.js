/**
 * اختبارات المسارات الميدانيّة.
 *
 * ★★ **حارسُ الوصْل أوّلًا وهو سببُ وجود هذا الملفّ.** درسُ المشروع المكتوب
 * «مبنيٌّ ومنشورٌ وبلا مستدعٍ» — و**عكسُه هنا**: زرٌّ يستدعي صفحةً لا وجودَ
 * لها. فكلُّ مسارٍ تعيده `fieldRouteFor` يُطابَق بـ`NAV_GROUPS`، وهو الكتالوجُ
 * الذي ترسم منه البوّابةُ قائمتَها ويشتقّ منه `pageAccess.js` صلاحيّاتِه.
 * فمسارٌ خارجه ليس رابطًا مكسورًا فحسب: هو رابطٌ **بلا حارسِ دخولٍ** أيضًا.
 *
 * وبعده حارسا الاشتقاق: الموجَّهُ إلى الاستلام تقبله بوّابةُ الاستلام فعلًا،
 * والموجَّهُ إلى التحضير تقبله بوّابتُه — **سلوكًا لا نصًّا**، فالمرآةُ التي
 * لا تُقاس تنحرف.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fieldRouteFor, FIELD_ROUTES, OMITTED_TYPES, DOC_PARAM } from './fieldRoutes.js';
import { CHAINS } from '../documents/chain.js';
import { NAV_GROUPS } from '../auth/navCatalog.js';
import { DOC_WORK_TYPE } from './taskFactory.js';
import { PICKABLE_TYPES, taskOpenProblem } from '../lpn/pickingTask.js';
import { sessionOpenProblem } from '../lpn/receivingSession.js';
import { nextOwnerOf } from './stageOwners.js';

/** كلُّ مسارٍ تعرفه البوّابة — من الكتالوج الواحد لا من قائمةٍ ثانية. */
const catalogPaths = new Set(NAV_GROUPS.flatMap((g) => (g.items ?? []).map((i) => i.path)));

/**
 * مستندٌ صالحٌ للتنفيذ — **بالشكل الذي يكتبه الكاتبُ لا بعيّنةٍ مريحة**.
 *
 * ★★★ ولمَ هذا التطويل؟ لأنّ `createDraft` في `documents/documentsService.js`
 * تكتب الوصفَ كلَّه **تحت `header`** وتترك النوعَ والحالةَ في الجذر، والمعرّفُ
 * لا يُكتب في المستند أصلًا: يُلحقه القارئُ من اللقطة (`{ id: d.id, ...d.data() }`).
 * فاختبارٌ يبني `{type, state}` مسطّحًا يخضرّ على بيانةٍ لا وجودَ لها في
 * القاعدة — وهو بعينه ما جعل آلافَ الاختبارات لا تمسك عطبًا واحدًا.
 */
const doc = (type, state = 'approved', extra = {}) => ({
  id: `doc_${type}_7fA3`,
  type,
  stage: null,
  number: `${type}-2026-0007`,
  state,
  header: { supplier: 'مورّد الوسط', warehouse: 'WH001', issueDate: '2026-09-04' },
  lines: [],
  links: {},
  createdByUid: 'u_17',
  createdByName: 'أحمد الشريف',
  createdByRole: 'storekeeper',
  ...extra,
});

/* ═══════════════ جذرُ الشجرة — تُقرأ منه ملفّاتُ الشاشات ═══════════════ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../..');

/** صندوقا المستندات — الشاشتان اللتان يقف الناسُ فيهما أمام المستندات. */
const BOX_FILES = [
  path.join(SRC, 'components/brandzo-erp/documents/DocumentsInbox.jsx'),
  path.join(SRC, 'components/brandzo-erp/documents/OpenDocumentsBox.jsx'),
];

/**
 * ملفّاتُ شاشةِ مسارٍ ميدانيّ — **مشتقّةٌ من القرص لا مسرودةٌ بيد**.
 *
 * المسارُ `/dashboard/lpn-picking` صفحتُه `src/pages/dashboard/lpn-picking.astro`
 * حتمًا (توجيهُ Astro بالملفّات)، ومكوّناتُها ما تستورده من `.jsx`. فلو نُقل
 * مكوّنٌ أو أُعيدت تسميتُه لم تكذب هذه القائمةُ صامتةً: تعود فارغةً فيسقط
 * الحارسُ ويقول ما الذي لم يجده.
 */
function screenFilesOf(routePath) {
  const page = path.join(SRC, 'pages', `${routePath.replace(/^\//, '')}.astro`);
  if (!fs.existsSync(page)) return [];
  const src = fs.readFileSync(page, 'utf8');
  return [...src.matchAll(/import\s+\w+\s+from\s+'([^']+\.jsx)'/g)]
    .map((m) => path.resolve(path.dirname(page), m[1]))
    .filter((f) => fs.existsSync(f));
}

/** أثرُ قراءةِ المعامل في نصّ الشاشة — `…searchParams…get('doc')`. */
const readsParamIn = (src) =>
  /URLSearchParams|searchParams/.test(src) &&
  new RegExp(`\\.get\\(\\s*(['"])${DOC_PARAM}\\1\\s*\\)`).test(src);

const routedTypes = Object.keys(FIELD_ROUTES);
const typesWithFieldGate = [...new Set([...Object.keys(DOC_WORK_TYPE), ...PICKABLE_TYPES])];

/* ═══════════════ ★★ حارسُ الوصْل ═══════════════ */

test('★★ كلُّ مسارٍ تعيده الدالّة موجودٌ في كتالوج البوّابة — لا زرَّ إلى صفحةٍ لا وجودَ لها', () => {
  assert.ok(catalogPaths.size > 0, 'الكتالوجُ فارغ — الحارسُ نفسُه معطوب');
  for (const type of routedTypes) {
    const route = fieldRouteFor(doc(type));
    assert.ok(route, `«${type}» في الخريطة ولا تعيد له الدالّةُ شيئًا`);
    assert.ok(
      catalogPaths.has(route.path),
      `«${type}» يوجّه إلى «${route.path}» وهو ليس في NAV_GROUPS — رابطٌ مكسورٌ وبلا حارسِ دخول`
    );
  }
});

test('★★ والجدولُ المجمَّد نفسُه لا يحمل مسارًا خارج الكتالوج — ولو لم تصل إليه الدالّة', () => {
  for (const [type, route] of Object.entries(FIELD_ROUTES)) {
    assert.ok(catalogPaths.has(route.path), `FIELD_ROUTES.${type} → «${route.path}» خارج الكتالوج`);
  }
});

test('كلُّ نوعٍ موجَّهٍ نوعُ مستندٍ حقيقيٌّ في السلاسل — يمنع خطأً مطبعيًّا صامتًا', () => {
  const realTypes = new Set(CHAINS.flat());
  for (const type of routedTypes) {
    assert.ok(realTypes.has(type), `«${type}» ليس نوعَ مستندٍ في chain.js`);
  }
});

/* ═══════════════ حارسا الاشتقاق — سلوكًا لا نصًّا ═══════════════ */

test('★★ الموجَّهُ إلى الاستلام تقبله بوّابةُ جلسة الاستلام فعلًا', () => {
  const receiving = routedTypes.filter((t) => FIELD_ROUTES[t].path === '/dashboard/lpn-receiving');
  assert.ok(receiving.length > 0);
  for (const type of receiving) {
    const problem = sessionOpenProblem(doc(type), { totals: { open: 5 } });
    assert.equal(problem, '', `«${type}» يوجَّه إلى الاستلام وبوّابتُه تردّه: ${problem}`);
  }
});

test('★★ والموجَّهُ إلى التحضير تقبله بوّابةُ مهمّة التحضير فعلًا', () => {
  const picking = routedTypes.filter((t) => FIELD_ROUTES[t].path === '/dashboard/lpn-picking');
  assert.ok(picking.length > 0);
  for (const type of picking) {
    assert.ok(PICKABLE_TYPES.includes(type), `«${type}» يوجَّه إلى التحضير وليس في PICKABLE_TYPES`);
    const problem = taskOpenProblem(doc(type), { lines: [{ sku: 'A' }] });
    assert.equal(problem, '', `«${type}» يوجَّه إلى التحضير وبوّابتُه تردّه: ${problem}`);
  }
});

test('التحضيرُ اشتقاقٌ لا سرد: PICK وSO من PICKABLE_TYPES، وTR وحده مصروفٌ إلى الاستلام', () => {
  assert.equal(FIELD_ROUTES.PICK.path, '/dashboard/lpn-picking');
  assert.equal(FIELD_ROUTES.SO.path, '/dashboard/lpn-picking');
  // ⚠️ التداخلُ المكتوب: TR في PICKABLE_TYPES ومع ذلك يُستلَم — قرارٌ لا سهو.
  assert.equal(FIELD_ROUTES.TR.path, '/dashboard/lpn-receiving');
});

test('التخزينُ مقيسٌ من DOC_WORK_TYPE — النوعُ الذي يولّد عملَ تخزينٍ يفتح لوحةَ الخانة', () => {
  for (const [type, work] of Object.entries(DOC_WORK_TYPE)) {
    if (work !== 'putaway') continue;
    assert.equal(FIELD_ROUTES[type]?.path, '/dashboard/bin-console', `«${type}» يولّد تخزينًا ولا يفتح اللوحة`);
  }
});

test('الجردُ يوجَّه إلى جرد الطبالي', () => {
  assert.equal(FIELD_ROUTES.CC.path, '/dashboard/lpn-count');
});

/* ═══════════════ لا صمت: كلُّ نوعٍ إمّا موجَّهٌ وإمّا غيابُه مكتوب ═══════════════ */

test('★★★ كلُّ نوعٍ تعرفه حرّاسُ الميدان إمّا له مسارٌ وإمّا غيابُه مقصودٌ مكتوب', () => {
  for (const type of typesWithFieldGate) {
    const routed = Boolean(FIELD_ROUTES[type]);
    const omitted = String(OMITTED_TYPES[type] ?? '').trim();
    assert.ok(
      routed || omitted,
      `«${type}» لا مسارَ له ولا سببَ غيابٍ مكتوب — أضِفه إلى FIELD_ROUTES أو إلى OMITTED_TYPES`
    );
    assert.ok(!(routed && omitted), `«${type}» موجَّهٌ ومعذورٌ معًا — تناقضٌ يُخفي أيَّهما الصادق`);
  }
});

test('★★ وغيابُ TRN مقيسٌ لا مدّعًى: بوّابتا الاستلام والتحضير تردّانه كلتاهما', () => {
  assert.ok(OMITTED_TYPES.TRN, 'TRN بلا سببِ غيابٍ مكتوب');
  assert.equal(fieldRouteFor(doc('TRN')), null);
  assert.notEqual(sessionOpenProblem(doc('TRN'), { totals: { open: 5 } }), '');
  assert.notEqual(taskOpenProblem(doc('TRN'), { lines: [{ sku: 'A' }] }), '');
});

test('لا سببَ غيابٍ فارغًا — «مقصود» بلا شرحٍ صمتٌ آخر', () => {
  for (const [type, reason] of Object.entries(OMITTED_TYPES)) {
    assert.ok(String(reason).trim().length > 20, `سببُ غياب «${type}» أقصرُ من أن يُفهم`);
  }
});

/* ═══════════════ ① الحالةُ شرطٌ كالنوع ═══════════════ */

test('★★★ المسوّدةُ لا تُنفَّذ — null لا زرًّا معطَّلًا', () => {
  assert.equal(fieldRouteFor(doc('PO', 'draft')), null);
});

test('المُرسَلُ للاعتماد لا يُنفَّذ — الاعتمادُ لم يقع بعد', () => {
  assert.equal(fieldRouteFor(doc('PO', 'submitted')), null);
});

test('المرفوضُ لا يُنفَّذ', () => {
  assert.equal(fieldRouteFor(doc('PO', 'rejected')), null);
});

test('الملغى لا يُنفَّذ — لم يعد عمليّةً صحيحة', () => {
  assert.equal(fieldRouteFor(doc('PO', 'canceled')), null);
});

test('والمغلقُ كذلك — أُوقف تنفيذُه عمدًا', () => {
  assert.equal(fieldRouteFor(doc('PO', 'closed')), null);
});

test('المعتمَدُ والمنجَزُ وحدهما يفتحان الشاشة — نفس عرف canDeriveFrom', () => {
  assert.equal(fieldRouteFor(doc('PO', 'approved'))?.path, '/dashboard/lpn-receiving');
  // المنجَزُ يبقى مصدرًا حتّى يُغلق: استلامٌ جزئيٌّ ثمّ بقيّةٌ تصل.
  assert.equal(fieldRouteFor(doc('PO', 'done'))?.path, '/dashboard/lpn-receiving');
});

test('حالةٌ مجهولةٌ أو غائبةٌ ⟶ null — ولا تُخفَّض «Approved» فتُقبل حالةٌ لا وجودَ لها', () => {
  assert.equal(fieldRouteFor({ type: 'PO' }), null);
  assert.equal(fieldRouteFor(doc('PO', 'Approved')), null);
  assert.equal(fieldRouteFor(doc('PO', 'حالة غريبة')), null);
});

/* ═══════════════ ② المجهولُ null ═══════════════ */

test('نوعٌ مجهولٌ ⟶ null — لا زرَّ ميّت', () => {
  assert.equal(fieldRouteFor(doc('QC')), null);
  assert.equal(fieldRouteFor(doc('INV')), null);
  assert.equal(fieldRouteFor(doc('لا نوع')), null);
});

test('null وundefined والمستندُ الفارغ لا يرمي — الصفُّ يُرسم قبل أن يكتمل', () => {
  assert.equal(fieldRouteFor(null), null);
  assert.equal(fieldRouteFor(undefined), null);
  assert.equal(fieldRouteFor({}), null);
  assert.equal(fieldRouteFor({ type: null, state: null }), null);
});

/* ═══════════════ ③ التسميةُ والسبب ═══════════════ */

test('★ كلُّ مسارٍ يحمل تسميةً وسببًا — والسببُ يُعرض في title فيعرف الواقفُ ما ينتظره', () => {
  for (const type of routedTypes) {
    const route = fieldRouteFor(doc(type));
    assert.ok(route.label.trim().length > 3, `«${type}» بلا تسمية`);
    assert.ok(route.reason.trim().length > 20, `«${type}» بسببٍ أقصرَ من أن يُفهم`);
    assert.deepEqual(Object.keys(route).sort(), ['docId', 'href', 'label', 'param', 'path', 'reason']);
  }
});

test('التسمياتُ الأربعُ كما اتُّفق عليها', () => {
  assert.equal(fieldRouteFor(doc('PO')).label, 'ابدأ الاستلام الميدانيّ');
  assert.equal(fieldRouteFor(doc('PICK')).label, 'ابدأ التحضير الميدانيّ');
  assert.equal(fieldRouteFor(doc('CC')).label, 'ابدأ جرد الطبالي');
  assert.equal(fieldRouteFor(doc('PUTAWAY')).label, 'افتح لوحة الخانة');
});

/* ═══════════════ متانةُ الجدول ═══════════════ */

test('النوعُ يُطبَّع: حروفٌ صغيرةٌ أو مسافاتٌ زائدةٌ لا تُسقط الزرّ', () => {
  assert.equal(fieldRouteFor({ type: 'po', state: 'approved' })?.path, '/dashboard/lpn-receiving');
  assert.equal(fieldRouteFor({ type: ' Pick ', state: 'approved' })?.path, '/dashboard/lpn-picking');
});

test('المُعاد نسخةٌ لا الجدولَ نفسَه — شاشةٌ تُعدّل ما تعرضه لا تُفسد الخريطة', () => {
  const route = fieldRouteFor(doc('PO'));
  route.label = 'مبدَّل';
  assert.equal(FIELD_ROUTES.PO.label, 'ابدأ الاستلام الميدانيّ');
  assert.equal(fieldRouteFor(doc('PO')).label, 'ابدأ الاستلام الميدانيّ');
});

test('الجدولان مجمَّدان — خريطةٌ تُعدَّل في زمن التشغيل تنحرف عن حارسها', () => {
  assert.ok(Object.isFrozen(FIELD_ROUTES));
  assert.ok(Object.isFrozen(OMITTED_TYPES));
});

test('كلُّ وجهةٍ مستعملةٌ مرّةً على الأقلّ — لا مسارَ مكتوبٌ ولا يصل إليه نوع', () => {
  const used = new Set(routedTypes.map((t) => FIELD_ROUTES[t].path));
  for (const p of ['/dashboard/lpn-receiving', '/dashboard/lpn-picking', '/dashboard/lpn-count', '/dashboard/bin-console']) {
    assert.ok(used.has(p), `«${p}» وجهةٌ بلا نوعٍ يصل إليها`);
  }
});

/* ═════════ ④ الرابطُ يحمل معرّفَ المستند — والوعدُ لا يُقطع إلّا لمن يفي ═════ */

test('★★★ رابطُ التحضير يحمل معرّفَ المستند — لا قائمةٌ يبحث فيها من جاء بأمره', () => {
  const d = doc('PICK');
  const route = fieldRouteFor(d);
  assert.equal(route.param, DOC_PARAM, 'المعاملُ حقلٌ صريحٌ يُقرأ — لا يُستخرج من نصّ الرابط');
  assert.equal(route.docId, d.id, '★ والقيمةُ معرّفُ المستند لا رقمُه: المهمّةُ تولد على المعرّف');
  assert.equal(route.href, `/dashboard/lpn-picking?${DOC_PARAM}=${d.id}`);
  assert.equal(route.path, '/dashboard/lpn-picking', 'والمسارُ يبقى عاريًا — الشاشاتُ تحتاج الاثنين');
});

test('★★★ ولا يُوعَد بمعاملٍ لشاشةٍ لا تقرؤه — الوعدُ الذي لا يقع أسوأُ من غيابه', () => {
  const silent = Object.entries(FIELD_ROUTES).filter(([, r]) => !r.readsDoc);
  assert.ok(silent.length > 0, 'كلُّ الشاشات تقرأ المعامل — فحُذف هذا الحارس أو انحرفت الخريطة');
  for (const [type, r] of silent) {
    const route = fieldRouteFor(doc(type));
    assert.equal(route.param, '', `«${type}» ⟵ «${r.path}» لا تقرأ المعامل وتعده به`);
    assert.equal(route.docId, '');
    assert.equal(route.href, route.path, 'والرابطُ عارٍ حتّى تقرأه شاشتُه');
  }
});

test('★★★ وكلُّ مسارٍ يعلن أنّه يقرأ — تقرؤه شاشتُه فعلًا (بقراءة ملفّها من القرص)', () => {
  const declared = [...new Set(Object.values(FIELD_ROUTES).filter((r) => r.readsDoc).map((r) => r.path))];
  assert.ok(declared.length > 0, 'لا مسارَ يعلن القراءة — إمّا الحقلُ لم يُضف وإمّا لم تُوصل شاشةٌ واحدة');
  for (const p of declared) {
    const files = screenFilesOf(p);
    assert.ok(files.length > 0, `«${p}» يعلن القراءةَ ولا صفحةَ له على القرص ولا مكوّنَ تستورده`);
    assert.ok(
      files.some((f) => readsParamIn(fs.readFileSync(f, 'utf8'))),
      `«${p}» يعلن أنّه يقرأ «?${DOC_PARAM}=» ولا شيءَ في شاشته يقرؤه — وعدٌ لموظّفٍ لا يقع: ` +
        files.map((f) => path.basename(f)).join(' · ')
    );
  }
});

test('⚠️ والمستندُ بلا معرّفٍ لا يُصنع له وعدٌ فارغ — `?doc=undefined` كذبةٌ صريحة', () => {
  const route = fieldRouteFor({ type: 'PICK', state: 'approved' });
  assert.equal(route.param, '');
  assert.equal(route.docId, '');
  assert.equal(route.href, route.path);
});

/* ═════════ ⑤ حرّاسُ المستدعي الحقيقيّ — لا منطقٌ بلا من يستدعيه ═════════ */

/*
 * ⚠️ ولمَ `assert.ok(re.test(src))` لا `assert.match(src, re)`؟ لأنّ الثانيةَ
 * تطبع **ملفَّ الشاشة كلَّه** في تقرير السقوط، فتغرق الرسالةُ التي تقول ما
 * العطب في ألفِ سطرٍ لا يقرؤها أحد. والحارسُ الذي لا تُقرأ رسالتُه نصفُ حارس.
 */
test('★★★ صندوقا المستندات يبنيان الرابطَ من `href` لا من `path` — وإلّا سقط المعرّفُ عند العرض', () => {
  for (const file of BOX_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(
      /route\.href/.test(src),
      `${path.basename(file)}: الرابطُ لا يُبنى من \`href\` فالمعرّفُ لا يصل`
    );
    assert.ok(
      !/route\.path/.test(src),
      `${path.basename(file)}: ما زال يستعمل \`route.path\` في الرابط — المسارُ عارٍ والموظّفُ يبحث بيده`
    );
  }
});

test('★★★ وصندوقا المستندات يقولان من ينتظر كلَّ مستند — وهما موقفُ الناس أمام المستندات', () => {
  for (const file of BOX_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(
      /import\s+\{[^}]*\bnextOwnerOf\b[^}]*\}\s+from\s+'[^']*stageOwners\.js'/.test(src),
      `${path.basename(file)}: لا يستورد \`nextOwnerOf\` — الصفُّ يقول كلَّ شيءٍ إلّا من ينتظره`
    );
    assert.ok(/nextOwnerOf\(/.test(src), `${path.basename(file)}: يستوردها ولا يستدعيها — منطقٌ بلا مستدعٍ`);
  }
});

test('★★ والسطرُ المعروضُ ليس فارغًا لبيانةٍ كما يكتبها المُنشئ — لا لعيّنةٍ مسطّحة', () => {
  // بانتظار الاعتماد: يقول من يعتمده بالاسم العربيّ من `roles.js`.
  assert.match(nextOwnerOf(doc('PO', 'submitted')).line, /^ينتظر اعتماد: .{3,}/);
  // ومعتمَدٌ له شاشةٌ ميدانيّة: ينتظر تنفيذَه لا إنجازَه.
  assert.match(nextOwnerOf(doc('PO', 'approved')).line, /^ينتظر تنفيذه ميدانيًّا: .{3,}/);
  // والمسوّدةُ تنتظر كاتبَها بعينه — والاسمُ يأتي من جذر المستند لا من `header`.
  assert.equal(nextOwnerOf(doc('PO', 'draft')).line, 'ينتظر إرساله للاعتماد من: أحمد الشريف');
});
