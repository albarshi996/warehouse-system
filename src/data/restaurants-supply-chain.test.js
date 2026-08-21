/**
 * حارس عرض «سلاسل الإمداد — المطاعم».
 *
 * العرض يقول للقطاع في كل شريحة: «هذه العملية تُنفَّذ في هذه الشاشة، وتُقفل
 * بهذا المستند». فإن حُذفت شاشةٌ أو تغيّر مسارها، أو لم يُبنَ مخطّط مستند،
 * أو أُعيدت تسمية شريحةٍ في عرض القطاع الذي نستدعي منه — انكسر الوعد **أمام
 * القطاع في القاعة** لا في سجلّ أخطاء. هذه الاختبارات تربط العرض بمصادر
 * الحقيقة الثلاثة: كتالوج القائمة، ومخطّطات المحرّك، والسلاسل المعتمَدة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_LABELS,
  cycles,
  decisionPoints,
  documentShortcutGrid,
  glossary,
  masters,
  odooRequest,
  orgLevels,
  portalShortcuts,
  slideIndex,
  sourceSlide,
  unitOptions,
} from './restaurants-supply-chain.js';
import * as MODULE from './restaurants-supply-chain.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import { ALWAYS_ALLOWED } from '../services/auth/pageAccess.js';
import { getSchema } from '../services/documents/schemas/index.js';
import {
  PURCHASE_CHAIN,
  RETURN_CHAIN,
  TRANSFER_CHAIN,
  OUTBOUND_CHAIN,
  VAN_CHAIN,
} from '../services/documents/chain.js';
import { ORG_LEVELS } from '../services/org/orgLocations.js';

const knownPaths = new Set([...internalPaths(), ...ALWAYS_ALLOWED]);

/**
 * وحدات القياس تُقرأ من **نصّ** `itemService.js` لا باستيراده: الملف يستورد
 * تهيئة فايربيز التي تحتاج `import.meta.env` (وهو معدومٌ خارج Vite)، فيسقط
 * الاختبار لسببٍ لا علاقة له بالعرض. القراءة النصّية تُبقي الحارس حيًّا.
 */
function masterUnitLabels() {
  const source = readFileSync(
    fileURLToPath(new URL('../services/items/itemService.js', import.meta.url)),
    'utf8',
  );
  const block = source.match(/export const UNIT_OPTIONS = \[([\s\S]*?)\];/);
  assert.ok(block, 'تعذّر العثور على UNIT_OPTIONS في ماستر الأصناف');
  return [...block[1].matchAll(/labelAr:\s*'([^']+)'/g)].map((match) => match[1]);
}

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

test('الشرائح المستدعاة من عرض القطاع كلّها موجودة بتسمياتها', () => {
  for (const label of SOURCE_LABELS) {
    const slide = sourceSlide(label);
    assert.ok(slide.type?.trim(), `شريحة القطاع «${label}» بلا نوع`);
    assert.ok(slide.title?.trim(), `شريحة القطاع «${label}» بلا عنوان`);
  }
});

test('الدورات الخمس: كل رمزٍ فيها مخطّطٌ حقيقيّ واختصارها قائم', () => {
  assert.equal(cycles.length, 5);
  for (const cycle of cycles) {
    assert.ok(cycle.intro?.trim() && cycle.rule?.trim(), `الدورة «${cycle.title}» ناقصة الشرح`);
    assert.ok(cycle.headline?.trim(), `الدورة «${cycle.title}» بلا عنوان شريحة`);
    for (const [code] of cycle.nodes) {
      assert.ok(getSchema(code), `الدورة «${cycle.title}» تعد بمستند ${code} ولا مخطّط له`);
    }
    for (const key of cycle.shortcuts) {
      assert.ok(portalShortcuts[key], `الدورة «${cycle.title}» تشير إلى اختصارٍ غير معرّف: ${key}`);
    }
  }
});

test('عقد الدورات مطابقةٌ للسلاسل المعتمَدة لا مرتّبةً بالاجتهاد', () => {
  const codesOf = (id) => cycles.find((cycle) => cycle.id === id).nodes.map(([code]) => code);
  // الوارد يُعرض من أمر الشراء (طلب الشراء PR يسبقه في السلسلة ولا يخصّ القطاع).
  assert.deepEqual(codesOf('inbound'), PURCHASE_CHAIN.slice(1));
  assert.deepEqual(codesOf('transfer'), TRANSFER_CHAIN);
  assert.deepEqual(codesOf('returns'), RETURN_CHAIN);
  assert.deepEqual(codesOf('sales'), OUTBOUND_CHAIN);
});

test('شبكة إنشاء المستندات: كل زرٍّ يفتح نوعًا مبنيًّا بلا تكرار', () => {
  const seen = new Set();
  for (const group of documentShortcutGrid) {
    for (const [type, label] of group.types) {
      assert.ok(getSchema(type), `زرّ ${type} في «${group.group}» بلا مخطّط`);
      assert.ok(label?.trim(), `زرّ ${type} بلا تسمية عربية`);
      assert.ok(!seen.has(type), `الرمز ${type} مكرّر في الشبكة`);
      seen.add(type);
    }
  }
  // دورة البيع من المركبة معروضةٌ كاملةً في شبكة الإنشاء.
  for (const type of VAN_CHAIN) assert.ok(seen.has(type), `دورة المركبة تنقص الرمز ${type}`);
});

test('وحدات القياس المعروضة هي وحدات الماستر نفسها', () => {
  assert.deepEqual(unitOptions, masterUnitLabels());
});

test('شجرة الأبعاد المعروضة هي مستويات سيّد المواقع نفسها', () => {
  assert.deepEqual(
    orgLevels.map(([id, labelAr]) => [id, labelAr]),
    ORG_LEVELS.map((level) => [level.id, level.labelAr]),
  );
  for (const [id, , title, why] of orgLevels) assert.ok(title?.trim() && why?.trim(), `المستوى «${id}» بلا عنوانٍ أو شرح`);
});

test('البيانات المرجعية الأربع موصولةٌ باختصاراتها', () => {
  assert.equal(masters.length, 4);
  for (const [title, , key, why] of masters) {
    assert.ok(portalShortcuts[key], `الماستر «${title}» يشير إلى اختصارٍ غير معرّف: ${key}`);
    assert.ok(why?.trim(), `الماستر «${title}» بلا سببٍ يشرح لماذا يهمّ`);
  }
});

test('توحيد المفاهيم: اثنا عشر مصطلحًا بثلاثة أعمدة مكتملة', () => {
  assert.equal(glossary.length, 12);
  for (const row of glossary) {
    assert.equal(row.length, 3);
    for (const cell of row) assert.ok(String(cell).trim(), `خانةٌ فارغة في المصطلح «${row[0]}»`);
  }
});

test('الطلب الموحَّد لأودو: كل بندٍ بعمودَيه — المبنيّ والمطلوب', () => {
  assert.ok(odooRequest.length >= 10, 'الطلب الموحَّد أقصر من أن يُسلَّم لشركة تنفيذ');
  for (const [item, built, wanted] of odooRequest) {
    assert.ok(item?.trim() && built?.trim() && wanted?.trim(), `بند الطلب «${item}» ناقص عمودًا`);
  }
});

test('نقاط القرار الثماني مكتملةٌ للحسم الحيّ', () => {
  assert.equal(decisionPoints.length, 8);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }
});

test('فهرس الشرائح: بلا تكرار (التسمية مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length);
  // ١٢ شريحة تمهيدية + شريحةٌ لكل دورة + ١٨ شريحة تفصيلٍ وإقفال.
  assert.equal(slideIndex.length, 12 + cycles.length + 18);
  for (const cycle of cycles) {
    assert.ok(slideIndex.includes(`دورة ${cycle.title}`), `الدورة «${cycle.title}» بلا شريحةٍ في الفهرس`);
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

/* ═══════════ ‹FNB-805› العرض يُحدَّث بالمبنيّ ولا يَعِد بما لم يُبنَ ═══════════ */

test('★★ كلّ قدرةٍ معروضةٍ تشير إلى وحدةٍ **موجودةٍ على القرص**', () => {
  const root = fileURLToPath(new URL('../services/', import.meta.url));
  for (const [name, , modulePath] of MODULE.fnbCapabilities) {
    const full = root + modulePath;
    assert.doesNotThrow(
      () => readFileSync(full, 'utf8'),
      `القدرة «${name}» تَعِد بوحدة «${modulePath}» غير موجودة — وعدٌ ينكسر أمام القطاع في القاعة`
    );
  }
});

test('★★ وكلّ شاشةٍ مذكورةٍ في كتالوج التنقّل — أو معلَنةٌ «بلا شاشة بعد»', () => {
  const paths = new Set([...internalPaths(), ...ALWAYS_ALLOWED]);
  for (const [name, , , ui] of MODULE.fnbCapabilities) {
    if (ui === 'منطقٌ بلا شاشة بعد') continue;
    assert.ok(paths.has(ui), `القدرة «${name}» تشير إلى شاشة «${ui}» غير مسجّلة في الكتالوج`);
  }
});

test('★ وما لم يُبنَ **يُعلَن بقراره** لا يُوعَد به', () => {
  assert.ok(MODULE.fnbPending.length > 0);
  for (const [name, , decision] of MODULE.fnbPending) {
    assert.match(decision, /^ق-O\d+$/, `المعلَّق «${name}» بلا قرارِ مالكٍ مرجعيّ`);
  }
  // والمعلَّق لا يظهر في القدرات — فلا يُعرض شيءٌ مرّتين بحالتين.
  const built = new Set(MODULE.fnbCapabilities.map((c) => c[0]));
  for (const [name] of MODULE.fnbPending) {
    assert.ok(!built.has(name), `«${name}» معروضٌ مبنيًّا ومعلَّقًا معًا`);
  }
});
