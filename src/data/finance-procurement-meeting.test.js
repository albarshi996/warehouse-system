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
  POLICY_PRIORITIES,
  POLICY_STATES,
  asks,
  buildAsks,
  closingOutcome,
  coldChain,
  decisionPoints,
  documentScale,
  financialImpact,
  handoffs,
  internalCycle,
  kpiCards,
  masters,
  matchVerdicts,
  ownership,
  policies,
  policyGaps,
  policyPortal,
  policyReports,
  portalShortcuts,
  purchaseStages,
  scenarios,
  sharedReports,
  slideIndex,
  tolerance,
  topPriority,
  transferCycle,
  vendorDimensions,
  vendorTiers,
} from './finance-procurement-meeting.js';
import * as MODULE from './finance-procurement-meeting.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import { ALWAYS_ALLOWED } from '../services/auth/pageAccess.js';
import { getSchema } from '../services/documents/schemas/index.js';
import { CCP1_LIMITS } from '../services/documents/schemas/grn.js';
import {
  CHAINS,
  DEFAULT_TOLERANCE,
  INTERNAL_PROCUREMENT_CHAIN,
  PURCHASE_CHAIN,
  TRANSFER_CHAIN,
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

  // ثمانٍ في الدورة المستنديّة وأربعٌ في السياسات — والعنوان في الشريحة يقول اثنتي عشرة.
  assert.equal(decisionPoints.length, 12);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }

  assert.equal(closingOutcome.length, 4);
});

/* ═══════════════════════════════════════════════════════════════════
   المحور 07 — حرّاس السياسات العشر
   ═══════════════════════════════════════════════════════════════════ */

test('السياسات العشر: لكلٍّ حالةٌ وأولويّةٌ معروفتان وبنودٌ ودليلٌ وشاشة', () => {
  assert.equal(policies.length, 10);
  const codes = new Set();
  for (const policy of policies) {
    assert.ok(!codes.has(policy.code), `رمز السياسة ${policy.code} مكرّر`);
    codes.add(policy.code);
    assert.ok(POLICY_STATES[policy.state], `${policy.code} بحالةٍ غير معروفة: ${policy.state}`);
    assert.ok(POLICY_PRIORITIES[policy.priority], `${policy.code} بأولويّةٍ غير معروفة: ${policy.priority}`);
    assert.ok(policy.title?.trim() && policy.goal?.trim() && policy.scope?.trim(), `${policy.code} ناقص العنوان أو الهدف أو النطاق`);
    assert.ok(policy.clauses?.length >= 3, `${policy.code} بأقلّ من ثلاثة بنود`);
    assert.ok(policy.owns?.trim(), `${policy.code} بلا ملكيّةٍ مذكورة`);
    assert.ok(policy.proof?.trim(), `${policy.code} بلا دليلٍ يشرح حالته في البوابة`);
    assert.ok(portalShortcuts[policy.shortcut], `${policy.code} يشير إلى اختصارٍ غير معرّف: ${policy.shortcut}`);
  }
  // شريحة الإقفال تقول: خمسٌ تعمل وثلاثٌ بعضها واثنتان لم تُبنَ.
  const count = (state) => policies.filter((policy) => policy.state === state).length;
  assert.equal(count('built'), 5, 'عدد السياسات المبنيّة يخالف ما تقوله شريحة الإقفال');
  assert.equal(count('partial'), 3);
  assert.equal(count('gap'), 2);
});

test('الأولوية القصوى: ستّ نقاطٍ بحالاتٍ معروفةٍ وشاشاتٍ مبنيّة', () => {
  assert.equal(topPriority.length, 6);
  for (const point of topPriority) {
    assert.ok(POLICY_STATES[point.state], `النقطة ${point.n} بحالةٍ غير معروفة`);
    assert.ok(point.title?.trim() && point.ask?.trim() && point.why?.trim(), `النقطة ${point.n} ناقصة`);
    assert.ok(portalShortcuts[point.shortcut], `النقطة ${point.n} تشير إلى اختصارٍ غير معرّف`);
  }
});

test('دورة التحويل الداخليّ هي سلسلتها المعتمَدة نفسها', () => {
  assert.deepEqual(transferCycle.nodes.map(([code]) => code), TRANSFER_CHAIN);
  for (const [code] of transferCycle.nodes) {
    assert.ok(getSchema(code), `دورة التحويل تعد بمستند ${code} ولا مخطّط له`);
  }
  assert.equal(transferCycle.stages.length, TRANSFER_CHAIN.length);
  for (const key of transferCycle.stages) assert.ok(portalShortcuts[key], `مرحلةٌ تشير إلى اختصارٍ غير معرّف: ${key}`);
  assert.ok(transferCycle.rule?.trim() && transferCycle.points.length >= 3);
  assert.ok(portalShortcuts[transferCycle.shortcut]);
});

test('حدود سلسلة التبريد المعروضة هي حدود المحرّك نفسها لا رقمٌ منقول', () => {
  assert.deepEqual(coldChain, CCP1_LIMITS);
});

test('تقارير إثبات السياسات موجودةٌ في السجلّ وتشير إلى سياساتٍ معروفة', () => {
  const titles = new Set(Object.values(REPORTS).map((report) => report.titleAr));
  const codes = new Set(policies.map((policy) => policy.code));
  assert.equal(policyReports.length, 6);
  for (const [title, code, detail] of policyReports) {
    assert.ok(titles.has(title), `التقرير «${title}» غير موجودٍ في سجلّ التقارير`);
    assert.ok(codes.has(code), `التقرير «${title}» يشير إلى سياسةٍ غير معروفة: ${code}`);
    assert.ok(detail?.trim(), `التقرير «${title}» بلا شرحٍ لما يُثبته`);
  }
});

test('شاشات تنفيذ السياسة الأربع مبنيّةٌ ومعرّفة', () => {
  assert.equal(policyPortal.length, 4);
  for (const [key, role, why] of policyPortal) {
    assert.ok(portalShortcuts[key], `شاشة السياسة «${role}» تشير إلى اختصارٍ غير معرّف: ${key}`);
    assert.ok(role?.trim() && why?.trim());
  }
  // طلب المالك الصريح: النقل الداخليّ والصنف والمورّد والتقارير.
  assert.deepEqual(policyPortal.map(([key]) => key), ['transfers', 'items', 'suppliers', 'reports']);
});

test('الفجوات الأربع: لكلٍّ سياستُها وما ينقصها وما نطلبه — ولكلّ طلبِ بناءٍ فجوته', () => {
  assert.equal(policyGaps.length, 4);
  assert.equal(buildAsks.length, policyGaps.length, 'كلّ فجوةٍ يقابلها طلبُ بناءٍ واحد');
  const codes = new Set(policies.map((policy) => policy.code));
  for (const gap of policyGaps) {
    assert.ok(codes.has(gap.policy), `الفجوة ${gap.n} تشير إلى سياسةٍ غير معروفة: ${gap.policy}`);
    assert.ok(gap.title?.trim() && gap.today?.trim() && gap.missing?.trim() && gap.ask?.trim(), `الفجوة ${gap.n} ناقصة`);
  }
  // كلّ سياسةٍ حالتها «فجوة» لا بدّ أن تُذكر في لوحة الفجوات — فلا فجوةٌ تُخفى.
  for (const policy of policies.filter((item) => item.state === 'gap')) {
    assert.ok(
      policyGaps.some((gap) => gap.policy === policy.code),
      `السياسة ${policy.code} فجوةٌ ولا تظهر في لوحة الفجوات`,
    );
  }
});

/**
 * ★ أقوى حرّاس هذا المحور: الفجوة المعروضة لا بدّ أن تبقى فجوةً حقيقيّة.
 * إن بُنيت غدًا ولم يُحدَّث العرض، صار العرض يشكو من نقصٍ سُدّ — فيسقط
 * الاختبار ويُجبِر على تحديث الشريحة قبل أن تُقرأ على المالية.
 */
test('فجوة «غرض التحويل»: سبب النقل ما زال حقلًا حرًّا لا قائمةً مقيَّدة', () => {
  const reason = getSchema('TR').sections
    .flatMap((section) => section.fields || [])
    .find((field) => field.key === 'reason');
  assert.ok(reason, 'حقل سبب النقل اختفى من مخطّط طلب النقل — راجع الشريحة');
  assert.notEqual(reason.kind, 'select', 'صار غرض التحويل قائمةً مقيَّدة — سُدّت الفجوة، فحدّث السياسة P05 ولوحة الفجوات');
});

test('فجوة «تكلفة الرحلة»: مستند النقل لا يحمل حقل كلفةٍ للرحلة بعد', () => {
  // في مقاطع الحقول `columns` عددُ أعمدة التخطيط لا قائمةَ حقول — فيؤخذ المصفوف وحده.
  const list = (value) => (Array.isArray(value) ? value : []);
  const keys = new Set(
    getSchema('TRN').sections
      .flatMap((section) => [...list(section.fields), ...list(section.columns), ...list(section.extraFields)])
      .map((field) => field.key),
  );
  assert.ok(keys.has('unitCost'), 'تكلفة الوحدة أساس القيمة الدفتريّة — اختفاؤها يعني تغيّر المخطّط');
  for (const built of ['freightCost', 'tripCost', 'shippingCost']) {
    assert.ok(!keys.has(built), `صار مستند النقل يحمل «${built}» — سُدّت فجوة تحميل تكلفة النقل، فحدّث السياسة P06`);
  }
});

/**
 * ادّعاء السياسة P01 عن حجم المحرّك كان نصًّا مكتوبًا («تسعةٌ وعشرون نوعًا
 * في عشر سلاسل») فشاخ يوم أُضيفت دورة الإنتاج. فصار محسوبًا — وهذا الحارس
 * يمنع عودته نصًّا: الرقم في الشريحة لا بدّ أن يساوي رقم المحرّك اليوم.
 */
test('حجم المحرّك المعروض محسوبٌ من السلاسل لا مكتوبٌ نصًّا', () => {
  assert.equal(documentScale.chains, CHAINS.length);
  assert.equal(documentScale.types, new Set(CHAINS.flat()).size);

  const p01 = policies.find((policy) => policy.code === 'P01');
  assert.match(p01.proof, new RegExp(`${documentScale.types}\\b`), 'دليل P01 لا يحمل عدد الأنواع الحيّ');
  assert.match(p01.proof, new RegExp(`${documentScale.chains}\\b`), 'دليل P01 لا يحمل عدد السلاسل الحيّ');
});

test('السياسة P02: كلّ مستندٍ ذي أثرٍ ماليّ يمرّ باعتماد المدير المالي', () => {
  const financialDocs = ['PO', 'INV', 'SPV', 'IPR', 'RFQ', 'IPO', 'PV'];
  for (const type of financialDocs) {
    assert.ok(
      getSchema(type).roles?.approve?.includes('finance_manager'),
      `المستند ${type} ذو أثرٍ ماليّ ولا يمرّ باعتماد المدير المالي — والسياسة P02 تعد بذلك`,
    );
  }
  assert.equal(financialDocs.length, 7, 'السياسة P02 تقول سبعة مستنداتٍ ذات أثرٍ ماليّ');
});

test('فهرس الشرائح: بلا تكرار (التسمية مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length);
  // ٩ شرائح تمهيدية + مرحلةٌ لكلّ حلقةٍ من الوارد + ٢٤ شريحة تفصيلٍ وسياساتٍ وإقفال.
  assert.equal(slideIndex.length, 9 + purchaseStages.length + 24);
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
