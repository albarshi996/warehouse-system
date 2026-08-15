/**
 * حارس اجتماع نوفا — يمنع أن يَعِد العرض بما لا وجود له.
 *
 * عرضٌ يُدار به اجتماعٌ مع عميل يقول لكل خطوة: «تُنفَّذ في هذه الشاشة»
 * و«تُقفل بهذا المستند». فإن حُذفت شاشةٌ أو تغيّر مسارها أو لم يُبنَ مخطّط
 * مستندٍ، انكسر الوعد أمام العميل — لا في سجلّ أخطاء. هذه الاختبارات
 * تربط بيانات العرض بمصدرَي الحقيقة: كتالوج القائمة، ومخطّطات المحرّك.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decisionPoints,
  documentCycles,
  documentShortcutGrid,
  executionSteps,
  masterData,
  operationDoors,
  portalShortcuts,
  reportFamilies,
  slideIndex,
  unificationLayers,
} from './nova-meeting.js';
import { REPORTS as DETAILED_REPORTS } from '../services/reports/index.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import { ALWAYS_ALLOWED } from '../services/auth/pageAccess.js';
import { getSchema } from '../services/documents/schemas/index.js';

const knownPaths = new Set([...internalPaths(), ...ALWAYS_ALLOWED]);

test('كل اختصار يشير إلى صفحةٍ تعرفها البوابة', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(knownPaths.has(item.path), `الاختصار «${key}» يشير إلى مسارٍ مجهول: ${item.path}`);
  }
});

test('كل اختصار مكتمل: غرضٌ ونقراتٌ ودليل', () => {
  for (const [key, item] of Object.entries(portalShortcuts)) {
    assert.ok(item.label?.trim(), `الاختصار «${key}» بلا اسم شاشة`);
    assert.ok(item.purpose?.trim(), `الاختصار «${key}» بلا غرض`);
    assert.ok(item.clicks?.length >= 2, `الاختصار «${key}» لا يشرح المسار داخل الشاشة`);
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

test('كل خطوةٍ من السبع موصولةٌ باختصارٍ قائم', () => {
  assert.equal(executionSteps.length, 7);
  for (const step of executionSteps) {
    assert.ok(step.shortcuts.length > 0, `الخطوة ${step.n} بلا اختصار`);
    for (const key of step.shortcuts) {
      assert.ok(portalShortcuts[key], `الخطوة ${step.n} تشير إلى اختصارٍ غير معرّف: ${key}`);
    }
    assert.ok(step.does.length >= 2 && step.guard?.trim(), `الخطوة ${step.n} ناقصة المحتوى`);
  }
});

test('رموز الدورات المستندية كلها مخطّطاتٌ حقيقيّة', () => {
  const codes = documentCycles.flatMap((cycle) => cycle.nodes.map(([code]) => code));
  for (const code of codes) {
    // «CRN / VRT» عقدةٌ واحدة برمزين — يُتحقّق من كلٍّ منهما.
    for (const type of code.split('/').map((part) => part.trim())) {
      assert.ok(getSchema(type), `الدورة تعد بمستند ${type} ولا مخطّط له`);
    }
  }
  for (const cycle of documentCycles) {
    for (const key of cycle.shortcuts) {
      assert.ok(portalShortcuts[key], `الدورة «${cycle.title}» تشير إلى اختصارٍ غير معرّف: ${key}`);
    }
  }
});

test('شبكة إنشاء المستندات: كل زرٍّ يفتح نوعًا مبنيًّا', () => {
  const seen = new Set();
  for (const group of documentShortcutGrid) {
    for (const [type, label] of group.types) {
      assert.ok(getSchema(type), `زرّ ${type} في «${group.group}» بلا مخطّط`);
      assert.ok(label?.trim(), `زرّ ${type} بلا تسمية عربية`);
      assert.ok(!seen.has(type), `الرمز ${type} مكرّر في الشبكة`);
      seen.add(type);
    }
  }
});

test('فهرس الشرائح: بلا تكرار (التسمية مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length);
  // الفصل الأول: ٩ تمهيدية + خطوةٌ لكل خطوةٍ تنفيذية + ١٠ إقفالٍ ومراجع.
  // الفصل الثاني: ١٣ شريحة (فاصل + غرض + طبقات + ٩ شاشات + الطلب). ثم الإقفال.
  assert.equal(slideIndex.length, 9 + executionSteps.length + 10 + 13 + 1);
  for (const step of executionSteps) {
    assert.ok(slideIndex.includes(`خطوة ${step.n} — ${step.title}`), `الخطوة ${step.n} بلا شريحةٍ في الفهرس`);
  }
  // الفاصل يسبق شرائح الفصل الثاني ويلي الوثيقة المصدر — وإلا انقلب المعنى.
  const divider = slideIndex.indexOf('الفصل الثاني — توحيد المفاهيم');
  assert.ok(divider > slideIndex.indexOf('الوثيقة المصدر كاملةً'));
  assert.ok(divider < slideIndex.indexOf('الطلب الموثّق لمنفّذ أودو'));
  assert.equal(slideIndex.at(-1), 'إقفال الاجتماع');
});

test('الفصل الثاني: مرجعيّاته موصولةٌ باختصاراتٍ قائمة، وطبقاته أربع', () => {
  assert.equal(unificationLayers.length, 4);
  for (const item of masterData) {
    assert.ok(portalShortcuts[item.key], `المرجعيّة «${item.title}» تشير إلى اختصارٍ غير معرّف: ${item.key}`);
    assert.ok(item.body?.trim(), `المرجعيّة «${item.title}» بلا شرح`);
  }
  // شاشات الفصل الثاني التي يَعِد بها العرض — كلّها في كتالوج القائمة.
  for (const key of ['warehouses', 'suppliers', 'customers', 'orderControl', 'analytics', 'fieldOps', 'vanOps', 'ledger', 'reports', 'documents', 'transfers', 'items']) {
    assert.ok(portalShortcuts[key], `اختصار الفصل الثاني «${key}» غير معرّف`);
    assert.ok(knownPaths.has(portalShortcuts[key].path), `اختصار «${key}» يشير إلى مسارٍ مجهول`);
  }
});

test('أبواب العمليات الخمسة: كل رمزٍ في سلسلتها مخطّطٌ مبنيّ', () => {
  assert.equal(operationDoors.length, 5);
  for (const door of operationDoors) {
    const codes = door.chain.split('→').map((part) => part.trim()).filter(Boolean);
    assert.ok(codes.length >= 1, `الباب «${door.title}» بلا سلسلة`);
    for (const code of codes) {
      assert.ok(getSchema(code), `الباب «${door.title}» يعد بمستند ${code} ولا مخطّط له`);
    }
  }
});

test('عائلات التقارير تطابق سجلّ التقارير الحقيقيّ عددًا وعنوانًا', () => {
  const live = Object.values(DETAILED_REPORTS);
  assert.equal(reportFamilies.reduce((sum, family) => sum + family.count, 0), live.length);

  for (const family of reportFamilies) {
    const titles = live.filter((report) => report.group === family.group).map((report) => report.titleAr);
    assert.equal(titles.length, family.count, `عدد تقارير «${family.group}» انحرف عن السجلّ`);
    assert.equal(family.items.length, family.count, `قائمة «${family.group}» لا تطابق عدّها المعلن`);
    for (const item of family.items) {
      // العنوان المعروض إمّا حرفيّ أو مختصرٌ يبدأ به عنوان السجلّ (المورّدون 360°).
      assert.ok(titles.some((title) => title === item || title.startsWith(item)), `«${item}» ليس تقريرًا في مجموعة ${family.group}`);
    }
  }
});

test('نقاط القرار العشر مكتملةٌ للحسم الحيّ', () => {
  assert.equal(decisionPoints.length, 10);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }
});
