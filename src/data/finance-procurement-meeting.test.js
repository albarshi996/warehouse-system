/**
 * حارس عرض «الدورة المستندية — السلاسل والمشتريات».
 *
 * هذا العرض يقف أمام **الإدارة المالية** ويقول في كلّ شريحة: «هذا الحكم
 * محسوبٌ لا مكتوب، وهذا الحارس مبنيٌّ لا موعود». فإن تغيّر حدُّ تسامحٍ أو
 * سقط حكمٌ من المطابقة أو أُعيد وزنُ بعدٍ في بطاقة المورّد — انكسر الوعد
 * **في القاعة أمام المالية** لا في سجلّ أخطاء.
 *
 * لذلك لا يقارن هذا الملفّ نصوصًا بنصوص: **يُشغّل `threeWayMatch` نفسها**
 * ويولّد أحكامها من حالاتٍ حقيقيّة، ويقرأ الأوزان من ملفّ بطاقة الأداء،
 * وأسماء المؤشّرات من الدوالّ المصدَّرة، والسلاسل من `chain.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  asks,
  closingOutcome,
  decisionPoints,
  financialImpact,
  handoffs,
  internalCycle,
  kpiCards,
  masters,
  matchVerdicts,
  ownership,
  portalShortcuts,
  purchaseStages,
  scenarios,
  sharedReports,
  slideIndex,
  tolerance,
  vendorDimensions,
  vendorTiers,
} from './finance-procurement-meeting.js';
import * as MODULE from './finance-procurement-meeting.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import { ALWAYS_ALLOWED } from '../services/auth/pageAccess.js';
import { getSchema } from '../services/documents/schemas/index.js';
import {
  DEFAULT_TOLERANCE,
  INTERNAL_PROCUREMENT_CHAIN,
  PURCHASE_CHAIN,
  threeWayMatch,
} from '../services/documents/chain.js';
import * as procurementKpis from '../services/kpi/procurementKpis.js';
import { REPORTS } from '../services/reports/index.js';

const knownPaths = new Set([...internalPaths(), ...ALWAYS_ALLOWED]);

const vendorCard = JSON.parse(
  readFileSync(fileURLToPath(new URL('./vendor-scorecard.json', import.meta.url)), 'utf8'),
);

test('كل اختصار يشير إلى صفحةٍ تعرفها البوابة', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(knownPaths.has(item.path), `الاختصار «${key}» يشير إلى مسارٍ مجهول: ${item.path}`);
  }
});

test('كل اختصار مكتمل: غرضٌ ونقراتٌ ودليل', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(item.label?.trim(), `الاختصار «${key}» بلا اسم شاشة`);
    assert.ok(item.purpose?.trim(), `الاختصار «${key}» بلا غرض`);
    assert.ok(item.clicks?.length >= 3, `الاختصار «${key}» لا يشرح المسار داخل الشاشة`);
    assert.ok(item.evidence?.trim(), `الاختصار «${key}» بلا دليلٍ ناتج`);
  }
});

test('اختصارات شاشة المستند تحمل نوعًا مبنيًّا في المحرّك', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    if (item.path !== '/dashboard/document') continue;
    const type = new URLSearchParams(item.query || '').get('type');
    assert.ok(type, `الاختصار «${key}» يفتح شاشة المستند بلا نوع`);
    assert.ok(getSchema(type), `الاختصار «${key}» يعد بمستند ${type} ولا مخطّط له`);
  }
});

test('مراحل الشراء الخمس هي سلسلة الوارد المعتمَدة نفسها', () => {
  assert.deepEqual(purchaseStages.map((stage) => stage.code), PURCHASE_CHAIN);
  for (const stage of purchaseStages) {
    assert.ok(stage.title?.trim() && stage.owner?.trim(), `المرحلة ${stage.code} بلا عنوانٍ أو مالك`);
    assert.ok(stage.does?.trim() && stage.guard?.trim(), `المرحلة ${stage.code} بلا فعلٍ أو حارس`);
    assert.ok(stage.fields?.length >= 4, `المرحلة ${stage.code} لا تعرض ما يحمله مستندها`);
    assert.ok(portalShortcuts[stage.shortcut], `المرحلة ${stage.code} تشير إلى اختصارٍ غير معرّف`);
  }
});

test('المشتريات الداخلية هي سلسلتها المعتمَدة نفسها', () => {
  assert.deepEqual(internalCycle.nodes.map(([code]) => code), INTERNAL_PROCUREMENT_CHAIN);
  for (const [code] of internalCycle.nodes) {
    assert.ok(getSchema(code), `الدورة الداخلية تعد بمستند ${code} ولا مخطّط له`);
  }
  assert.ok(internalCycle.points.length >= 3 && internalCycle.rule?.trim());
  assert.ok(portalShortcuts[internalCycle.shortcut]);
});

test('حدّ التسامح المعروض هو حدّ المحرّك نفسه لا رقمٌ مكتوب', () => {
  assert.deepEqual(tolerance, DEFAULT_TOLERANCE);
});

/**
 * أقوى حارسٍ هنا: أحكام المطابقة المعروضة تُولَّد بتشغيل `threeWayMatch`
 * على حالاتٍ حقيقيّة. فلو حُذف حكمٌ من المحرّك أو أُضيف حكمٌ جديد، اختلف
 * المولَّد عن المعروض وسقط الاختبار — قبل أن يُعرض على المالية.
 */
test('أحكام المطابقة الستّة هي ما تُخرجه threeWayMatch فعلًا', () => {
  const line = (sku, qty, extra = {}) => ({ sku, description: sku, qty, ...extra });
  const emitted = new Set();

  // مطابق تمامًا
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 10)] },
    grn: { lines: [line('A', 10, { qtyReceived: 10 })] },
    qc: { lines: [line('A', 10, { qtyAccepted: 10, qtyRejected: 0 })] },
  }).rows[0].status);

  // نقص وزيادة (خارج حدّ التسامح)
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 100)] },
    grn: { lines: [line('A', 100, { qtyReceived: 80 })] },
  }).rows[0].status);
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 100)] },
    grn: { lines: [line('A', 100, { qtyReceived: 130 })] },
  }).rows[0].status);

  // وصل ولم يُفحص
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 10)] },
    grn: { lines: [line('A', 10, { qtyReceived: 10 })] },
  }).rows[0].status);

  // رُفض جزءٌ من المستلَم
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 10)] },
    grn: { lines: [line('A', 10, { qtyReceived: 10 })] },
    qc: { lines: [line('A', 10, { qtyAccepted: 6, qtyRejected: 4 })] },
  }).rows[0].status);

  // صنفٌ مستلَمٌ لا وجود له في الأمر
  emitted.add(threeWayMatch({
    po: { lines: [line('A', 10)] },
    grn: { lines: [line('A', 10, { qtyReceived: 10 }), line('B', 0, { qtyReceived: 5 })] },
    qc: { lines: [line('A', 10, { qtyAccepted: 10, qtyRejected: 0 })] },
  }).rows.find((row) => row.key.includes('B')).status);

  assert.deepEqual(
    new Set(matchVerdicts.map(([status]) => status)),
    emitted,
    'الأحكام المعروضة تخالف ما يُخرجه المحرّك',
  );
  for (const [status, label, tone, meaning] of matchVerdicts) {
    assert.ok(label?.trim() && meaning?.trim(), `الحكم «${status}» ناقص الشرح`);
    assert.ok(['ok', 'warn', 'wait', 'bad'].includes(tone), `الحكم «${status}» بنبرةٍ غير معروفة: ${tone}`);
  }
});

test('المؤشّرات الأربعة أسماؤها دوالٌّ مصدَّرةٌ في محرّك المؤشّرات', () => {
  assert.equal(kpiCards.length, 4);
  for (const [fn, title, formula, why] of kpiCards) {
    assert.equal(typeof procurementKpis[fn], 'function', `المؤشّر «${title}» يشير إلى دالّةٍ غير موجودة: ${fn}`);
    assert.ok(title?.trim() && formula?.trim() && why?.trim(), `المؤشّر «${fn}» ناقص الوصف`);
  }
});

test('أبعاد بطاقة المورّد وأوزانها وتصنيفاتها هي ملفّ البطاقة نفسه', () => {
  assert.deepEqual(
    vendorDimensions.map(([id, nameAr, weight]) => ({ id, nameAr, weight })),
    vendorCard.dimensions.map((dim) => ({ id: dim.id, nameAr: dim.nameAr, weight: dim.weight })),
  );
  assert.equal(vendorDimensions.reduce((sum, [, , weight]) => sum + weight, 0), 100);
  assert.deepEqual(
    vendorTiers.map(([tier, labelAr]) => ({ tier, labelAr })),
    vendorCard.tierLegend.map((tier) => ({ tier: tier.tier, labelAr: tier.labelAr })),
  );
});

test('التقارير المشتركة كلّها موجودةٌ بعناوينها في سجلّ التقارير', () => {
  // السجلّ خريطةٌ بالمعرّف لا مصفوفة — والعنوان العربيّ هو ما يُعرض في القاعة،
  // فبه تُطابَق: تسميةٌ تُغيَّر في السجلّ تكسر العرض هنا لا أمام المالية.
  const titles = new Set(Object.values(REPORTS).map((report) => report.titleAr));
  assert.ok(titles.size >= 19, `سجلّ التقارير أصغر من المتوقّع: ${titles.size}`);
  for (const [title] of sharedReports) {
    assert.ok(titles.has(title), `التقرير «${title}» غير موجودٍ في سجلّ التقارير`);
  }
});

test('السيناريوهات الاثنا عشر: لكلٍّ أثرٌ وحارسٌ وشاشةٌ تُثبته', () => {
  assert.equal(scenarios.length, 12);
  const ids = new Set();
  for (const scenario of scenarios) {
    assert.ok(!ids.has(scenario.id), `الرمز ${scenario.id} مكرّر`);
    ids.add(scenario.id);
    assert.ok(['high', 'med'].includes(scenario.severity), `${scenario.id} بخطورةٍ غير معروفة`);
    assert.ok(scenario.title?.trim() && scenario.where?.trim(), `${scenario.id} بلا عنوانٍ أو موضع`);
    assert.ok(scenario.impact?.trim() && scenario.guard?.trim(), `${scenario.id} بلا أثرٍ أو حارس`);
    assert.ok(portalShortcuts[scenario.shortcut], `${scenario.id} يشير إلى اختصارٍ غير معرّف: ${scenario.shortcut}`);
  }
  // العرض يعتمد شريحتين: عاليةٌ ومتوسّطة — فلا تبقى فئةٌ فارغة.
  assert.ok(scenarios.some((s) => s.severity === 'high') && scenarios.some((s) => s.severity === 'med'));
});

test('الحدّ بين الإدارتين مكتمل: ملكيّةٌ ونقاط تسليمٍ وماستراتٌ موصولة', () => {
  assert.ok(ownership.length >= 8);
  for (const row of ownership) {
    assert.equal(row.length, 4);
    for (const cell of row) assert.ok(String(cell).trim(), `خانةٌ فارغة في «${row[0]}»`);
  }

  assert.equal(handoffs.length, 4);
  for (const point of handoffs) {
    assert.ok(point.from?.trim() && point.to?.trim() && point.doc?.trim());
    assert.ok(point.what?.trim() && point.risk?.trim(), `نقطة التسليم ${point.n} بلا مخاطرةٍ مشروحة`);
  }

  assert.equal(masters.length, 3);
  for (const [title, , key, why] of masters) {
    assert.ok(portalShortcuts[key], `الماستر «${title}» يشير إلى اختصارٍ غير معرّف: ${key}`);
    assert.ok(why?.trim(), `الماستر «${title}» بلا سببٍ يشرح لماذا يهمّ`);
  }

  for (const [, , , key] of financialImpact) {
    assert.ok(portalShortcuts[key], `بند الأثر المالي يشير إلى اختصارٍ غير معرّف: ${key}`);
  }
});

test('المطالب والقرارات ومخرج الجلسة مكتملة', () => {
  assert.equal(asks.length, 8);
  for (const [title, detail] of asks) assert.ok(title?.trim() && detail?.trim());

  assert.equal(decisionPoints.length, 8);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }

  assert.equal(closingOutcome.length, 4);
});

test('فهرس الشرائح: بلا تكرار (التسمية مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length);
  // ٨ شرائح تمهيدية + مرحلةٌ لكلّ حلقةٍ من الوارد + ١٦ شريحة تفصيلٍ وإقفال.
  assert.equal(slideIndex.length, 8 + purchaseStages.length + 16);
  for (const stage of purchaseStages) {
    assert.ok(
      slideIndex.includes(`المرحلة ${stage.code} — ${stage.title}`),
      `المرحلة ${stage.code} بلا شريحةٍ في الفهرس`,
    );
  }
});

/**
 * حارسٌ صغيرٌ ثمنه غالٍ: النصوص هنا تُعرَض **كما هي** في JSX، فعلامات
 * التوكيد بنجمتين تظهر نجمتين على الشاشة أمام الحضور لا خطًّا عريضًا.
 * (وقع فعلًا وأُصلح — والحارس يمنع عودته مع أوّل نصٍّ جديد.)
 */
test('لا نصَّ معروضًا يحمل علامات ترميزٍ نصّيّ (**)', () => {
  const seen = new Set();
  const walk = (value, path) => {
    if (typeof value === 'string') {
      assert.ok(!value.includes('**'), `نصٌّ يحمل نجمتين ويُعرض كما هو: ${path} — «${value.slice(0, 60)}»`);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  walk(MODULE, 'module');
});
