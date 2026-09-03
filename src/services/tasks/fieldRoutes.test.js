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

import { fieldRouteFor, FIELD_ROUTES, OMITTED_TYPES } from './fieldRoutes.js';
import { CHAINS } from '../documents/chain.js';
import { NAV_GROUPS } from '../auth/navCatalog.js';
import { DOC_WORK_TYPE } from './taskFactory.js';
import { PICKABLE_TYPES, taskOpenProblem } from '../lpn/pickingTask.js';
import { sessionOpenProblem } from '../lpn/receivingSession.js';

/** كلُّ مسارٍ تعرفه البوّابة — من الكتالوج الواحد لا من قائمةٍ ثانية. */
const catalogPaths = new Set(NAV_GROUPS.flatMap((g) => (g.items ?? []).map((i) => i.path)));

/** مستندٌ صالحٌ للتنفيذ — النوعُ متغيّرٌ وما عداه ثابت. */
const doc = (type, state = 'approved') => ({ id: 'd1', number: `${type}-1023`, type, state });

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
    assert.deepEqual(Object.keys(route).sort(), ['label', 'path', 'reason']);
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
  for (const path of ['/dashboard/lpn-receiving', '/dashboard/lpn-picking', '/dashboard/lpn-count', '/dashboard/bin-console']) {
    assert.ok(used.has(path), `«${path}» وجهةٌ بلا نوعٍ يصل إليها`);
  }
});
