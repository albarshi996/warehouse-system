/**
 * حارس اجتماع الإدارة العامة — يمنع أن يَعِد العرض بما لا وجود له.
 *
 * عرضٌ يُدار به اجتماعٌ أمام المدير العام، يَعِد في كل بندٍ بصورةٍ ميدانية
 * ومخطّطٍ وجدولٍ وطلبِ قرار. فإن ضاع ملفُ صورةٍ أو انقطع فهرسُ الشرائح عن
 * الشرائح المرسومة، انكسر الوعد **أمام الإدارة** لا في سجلّ أخطاء. وهذه
 * الاختبارات تربط بيانات العرض بمصدرَي الحقيقة: الملفّات على القرص،
 * وكتالوج القائمة.
 *
 * وقاعدتان من دستور المشروع تُفرضان هنا آليًّا لا كتابةً: **لا مبلغَ ولا
 * عملةَ ولا راتب** في أيّ نصّ (الكمّيات فقط)، و**الأرقام لاتينية** لا هندية.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SLIDE_CAPACITY, agenda, allDecisions, buildSlides, meetingMeta, sections, slideIndex, slides } from './gm-meeting.js';
import { internalPaths } from '../services/auth/navCatalog.js';
import usageGuide from './usage-guide.json' with { type: 'json' };

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const PAGE_PATH = '/dashboard/general-manager-meeting';

/** كل مسارات الصور والمخططات التي يَعِد بها العرض. */
function allAssetPaths() {
  const out = [meetingMeta.cover, meetingMeta.sig1, meetingMeta.sig2].filter(Boolean);
  for (const section of sections) {
    if (section.hero) out.push(section.hero);
    if (section.diagram?.file) out.push(section.diagram.file);
    for (const gallery of section.galleries || []) {
      for (const item of gallery.items) if (item.src) out.push(item.src);
    }
  }
  return out;
}

/** كل نصّ معروضٍ على الشاشة — للتفتيش اللغويّ والماليّ. */
function allText() {
  const parts = [meetingMeta.titleAr, meetingMeta.subtitle, meetingMeta.scope];
  for (const section of sections) {
    parts.push(section.navTitle, section.navDesc, section.kicker, section.headline, section.lead);
    for (const kpi of section.kpis || []) parts.push(kpi.value, kpi.label, kpi.note);
    for (const block of section.blocks || []) {
      parts.push(block.title, block.text, block.note, ...(block.head || []));
      for (const row of block.rows || []) parts.push(...row);
      for (const item of block.items || []) parts.push(item.title, item.text, item.tag, item.when, item.label);
    }
    for (const gallery of section.galleries || []) {
      parts.push(gallery.title);
      for (const item of gallery.items) parts.push(item.cap);
    }
    for (const decision of section.decisions || []) parts.push(decision.ask, decision.why);
    parts.push(...(section.speaker || []));
  }
  return parts.filter((value) => typeof value === 'string');
}

test('الشاشة مسجّلةٌ في كتالوج القائمة وفي دليل الاستخدام', () => {
  assert.ok(internalPaths().includes(PAGE_PATH), 'الشاشة غير مسجّلة في navCatalog');
  const entry = usageGuide[PAGE_PATH];
  assert.ok(entry?.what?.trim(), 'لا شرحَ للشاشة في دليل الاستخدام');
  assert.ok(entry.steps?.length >= 1, 'شرحُ الشاشة بلا خطوات');
});

test('جدول الأعمال عشرة بنود، والفرعيّان تحت البند الرابع', () => {
  assert.equal(agenda.length, 10);
  const fourth = agenda.find((item) => item.num === '4');
  assert.ok(fourth, 'البند الرابع مفقود');
  assert.equal(fourth.subs.length, 2, 'البند الرابع يجب أن يحمل فرعَي التقنية والهندسة');
  for (const item of agenda) {
    assert.ok(item.title?.trim() && item.key?.trim(), `البند ${item.num} ناقص`);
  }
});

test('كل بندٍ يحمل عنوانًا وتمهيدًا وما يُطلب من الإدارة', () => {
  assert.equal(sections.length, 12);
  for (const section of sections) {
    assert.ok(section.headline?.trim(), `البند ${section.num} بلا عنوان`);
    assert.ok(section.lead?.trim(), `البند ${section.num} بلا تمهيد`);
    assert.ok((section.blocks || []).length >= 3, `البند ${section.num} أفقر من أن يُعرض`);
    assert.ok((section.decisions || []).length >= 1, `البند ${section.num} لا يطلب شيئًا من الإدارة`);
    for (const decision of section.decisions) {
      assert.ok(decision.ask?.trim(), `طلبٌ بلا نصّ في البند ${section.num}`);
    }
  }
});

test('كل صورةٍ ومخطّطٍ يَعِد بهما العرض ملفٌّ قائمٌ على القرص', () => {
  const assets = allAssetPaths();
  assert.ok(assets.length >= 40, 'عدد الأصول أقلّ من المتوقَّع — هل فُقد مجلّد؟');
  for (const asset of assets) {
    assert.ok(!asset.startsWith('/'), `المسار يجب أن يكون نسبيًّا لا مطلقًا: ${asset}`);
    assert.ok(existsSync(path.join(PUBLIC_DIR, asset)), `ملفٌّ مفقود تحت public/: ${asset}`);
  }
});

test('فهرس الشرائح: بلا تكرار (العنوان مفتاح React) وبعدد الشرائح المرسومة', () => {
  assert.equal(new Set(slideIndex).size, slideIndex.length, 'عنوانُ شريحةٍ مكرّر');
  assert.equal(slideIndex.length, slides.length);
  assert.equal(buildSlides().length, slides.length, 'بناءُ الشرائح غير مستقرّ');
  assert.equal(slides[0].kind, 'cover');
  assert.equal(slides[1].kind, 'agenda');
  assert.equal(slides.at(-1).kind, 'signoff');
  for (const slide of slides) {
    assert.ok(slide.title?.trim(), 'شريحةٌ بلا عنوانٍ في الفهرس');
  }
});

test('لكل بندٍ شريحةُ افتتاحيةٍ واحدة — نقطةُ القفز من جدول الأعمال', () => {
  const openers = slides.filter((slide) => slide.kind === 'section');
  assert.equal(openers.length, sections.length);
  assert.equal(new Set(openers.map((slide) => slide.key)).size, sections.length);
});

test('لا شريحةَ تتجاوز سعة مسرح 1280×720', () => {
  for (const slide of slides) {
    if (slide.kind === 'block') {
      const block = slide.block;
      const count = block.type === 'table' ? (block.rows || []).length : (block.items || []).length;
      const cap = SLIDE_CAPACITY[block.type] || 8;
      assert.ok(count <= cap, `شريحة «${slide.title}» تحمل ${count} عنصرًا والسعة ${cap}`);
    }
    if (slide.kind === 'gallery') {
      assert.ok(slide.gallery.items.length <= SLIDE_CAPACITY.gallery, `معرض «${slide.title}» تجاوز السعة`);
    }
    if (slide.kind === 'decisions') {
      assert.ok(slide.items.length <= SLIDE_CAPACITY.decisions, `شريحة قرارات «${slide.title}» تجاوزت السعة`);
    }
  }
});

test('كل طلبٍ من الإدارة يصل إلى شرائح الإقفال — لا يسقط طلب', () => {
  const closing = slides.filter((slide) => slide.kind === 'closing').flatMap((slide) => slide.items);
  assert.equal(closing.length, allDecisions.length);
  assert.ok(allDecisions.length >= 20, 'عددُ الطلبات أقلّ من المتوقَّع');
  for (const decision of closing) {
    assert.ok(decision.sectionNum?.trim(), 'طلبٌ في الإقفال بلا رقم بند');
  }
});

test('لا مبلغَ ولا عملةَ ولا راتبَ في أيّ نصّ معروض', () => {
  const banned = /(دينار|د\.ل|LYD|يورو|دولار|USD|EUR|ر\.س|درهم)/;
  for (const text of allText()) {
    assert.ok(!banned.test(text), `نصٌّ يحمل قيمةً ماليّة: ${text.slice(0, 90)}`);
  }
});

test('الأرقام لاتينية لا هنديّة', () => {
  const indic = /[٠-٩۰-۹]/;
  for (const text of allText()) {
    assert.ok(!indic.test(text), `نصٌّ يحمل أرقامًا هنديّة: ${text.slice(0, 90)}`);
  }
});

test('بيانات الاجتماع مكتملة ومُسنَدة', () => {
  assert.equal(meetingMeta.docNumber, 'BFP-SCM-GM-2026-001');
  assert.equal(meetingMeta.date, '2026-10-07');
  for (const key of ['titleAr', 'subtitle', 'preparedBy', 'preparedRole', 'scope', 'cover']) {
    assert.ok(meetingMeta[key]?.trim(), `بيانات الاجتماع ناقصة: ${key}`);
  }
});
