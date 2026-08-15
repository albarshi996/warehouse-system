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
  portalShortcuts,
  slideIndex,
} from './nova-meeting.js';
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
  // ٩ شرائح تمهيدية + خطوةٌ لكل خطوةٍ تنفيذية + ١١ شريحة إقفال ومراجع.
  assert.equal(slideIndex.length, 9 + executionSteps.length + 11);
  for (const step of executionSteps) {
    assert.ok(slideIndex.includes(`خطوة ${step.n} — ${step.title}`), `الخطوة ${step.n} بلا شريحةٍ في الفهرس`);
  }
});

test('نقاط القرار العشر مكتملةٌ للحسم الحيّ', () => {
  assert.equal(decisionPoints.length, 10);
  for (const point of decisionPoints) {
    assert.ok(point.title?.trim() && point.ask?.trim() && point.owner?.trim());
  }
});
