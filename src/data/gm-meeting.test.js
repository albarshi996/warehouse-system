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
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  EXEC_CAPACITY, SLIDE_CAPACITY, agenda, allDecisions, buildExecutiveSlides, buildSlides,
  executiveIndex, executiveSlides, meetingMeta, sections, slideIndex, slides,
} from './gm-meeting.js';
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
  // عشرةُ بنودٍ رئيسة: أُسقط «تأخر طلبات الشراء» وأُضيف «الأمن والنظافة» (أمرُ المالك 2026-10-06)،
  // **والترقيمُ أُعيد فلا فجوةَ فيه** — ولا نصَّ في المحتوى يشير إلى بندٍ برقمه غيرَ الثامن.
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
    // ★ بندٌ بلا طلبات مسموحٌ منذ 2026-10-06: المالك ألغى طلبات البند 4.2 كلَّها،
    //   فصار بندَ عرضٍ لا بندَ طلب. **والمحظورُ أن يخلو العرضُ كلُّه**، لا أن
    //   يخلو بندٌ منه — وذلك ما يحرسه التوكيدُ بعد الحلقة.
    for (const decision of section.decisions || []) {
      assert.ok(decision.ask?.trim(), `طلبٌ بلا نصّ في البند ${section.num}`);
    }
  }
});

test('★ ترقيمُ البنود الرئيسة متّصلٌ بلا فجوة — فحذفُ بندٍ يُعيد الترقيم', () => {
  const tops = sections.filter((section) => section.level === 0).map((section) => Number(section.num));
  assert.deepEqual(tops, tops.map((_value, index) => index + 1), `ترقيمٌ فيه فجوة: ${tops.join(' · ')}`);
});

test('العرضُ كلُّه لا يخلو من ملاحظاتٍ وطلبات', () => {
  assert.ok(allDecisions.length >= 20, `العرضُ يحمل ${allDecisions.length} ملاحظةً وطلبًا فقط`);
  const withAsks = sections.filter((section) => (section.decisions || []).length > 0).length;
  assert.ok(withAsks >= sections.length - 2, 'أكثرُ من بندين بلا ملاحظاتٍ ولا طلبات — هل حُذفت سهوًا؟');
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
  assert.ok(allDecisions.length >= 20, 'عددُ الملاحظات والطلبات أقلّ من المتوقَّع');
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

/* ═══════════════════════════════════════════════════════════════════
   العرض التنفيذيّ — حرّاسُ الطول والكثافة
   ═══════════════════════════════════════════════════════════════════
   ★★★ **قرار المالك 2026-10-06:** العرضُ الأوّل بلغ 140 شريحةً و27,571 كلمة
   (متوسّطُ الشريحة 197 كلمة، وأثقلُها 715) — تقريرٌ لُصق على شرائح لا يُقرأ
   على جهاز عرضٍ ولا يُدار به اجتماع. فهذه الحرّاسُ تمنع عودتَه: **الطولُ
   والكثافةُ شرطا قبولٍ مقيسان لا ذوقٌ يُستحسن**، ويسقط البناءُ إن تجاوزهما.

   والحدودُ ليست اعتباطًا: 24 شريحةً هي زمنُ عرضٍ 35–45 دقيقة، و110 كلمةً
   للشريحة هي ما يُقرأ من آخر القاعة على مسرح 1280×720 بخطوط هذا الملفّ.
*/

/** كلُّ ما تعرضه الشريحة التنفيذيّة من نصّ — ما يُقرأ في القاعة لا ما في المصدر. */
function execWords(slide) {
  const parts = [];
  if (slide.kind === 'brief') parts.push(slide.section.kicker, slide.section.headline);
  for (const kpi of slide.kpis || []) parts.push(kpi.value, kpi.label);
  for (const item of slide.items || []) parts.push(item.ask, item.value, item.label);
  return parts
    .filter((value) => typeof value === 'string')
    .reduce((total, text) => total + text.trim().split(/\s+/).filter(Boolean).length, 0);
}

test('العرض التنفيذيّ لا يتجاوز 24 شريحة — زمنُ اجتماعٍ لا زمنُ تقرير', () => {
  assert.ok(executiveSlides.length <= 24, `العرض التنفيذيّ بلغ ${executiveSlides.length} شريحة`);
  assert.ok(executiveSlides.length >= 18, 'العرض التنفيذيّ أقصر من أن يغطّي عشرة بنود');
  assert.equal(executiveSlides.length, slides.length > executiveSlides.length ? executiveSlides.length : -1,
    'العرض التنفيذيّ يجب أن يكون أقصرَ من الملحق المرجعيّ');
});

test('★★★ لا شريحةَ تنفيذيّةٍ تتجاوز 110 كلمة — وإلّا عاد التقريرُ المُلصق', () => {
  // شرائحُ النظرة (البطاقة ولوحة الأرقام) تُقرأ لمحةً فتُحكم بالكلمات.
  for (const slide of executiveSlides) {
    if (slide.kind !== 'brief' && slide.kind !== 'numbers') continue;
    const count = execWords(slide);
    assert.ok(count <= 110, `شريحة «${slide.title}» تحمل ${count} كلمة والحدّ 110`);
  }
});

/*
  ★★ **ولماذا تُحكم شرائحُ الطلبات بمقياسٍ آخر؟** أمسك الحارسُ أعلاه شريحةَ
  طلباتٍ بـ207 كلمة، والحدُّ 110 — والخطأُ كان في الحدّ لا فيها. فشريحةُ
  الطلبات **ورقةُ قرارٍ تُقرأ سطرًا سطرًا** لا شريحةَ نظرةٍ تُلمح: المديرُ يقف
  عندها بندًا بندًا. فالذي يُحكم فيها **طولُ الطلب الواحد** وعددُ الطلبات، لا
  مجموعُ كلماتها. ولو خُفّض الحدُّ وحده لتفتّتت الطلباتُ على اثنتي عشرة شريحة
  — فعاد الطولُ من حيث طُرد.
*/
test('★★ طلبٌ واحدٌ لا يتجاوز 40 كلمة — فالسطرُ الطويل لا يُقرأ في قاعة', () => {
  const asks = executiveSlides.filter((slide) => slide.kind === 'asks').flatMap((slide) => slide.items);
  assert.ok(asks.length > 0, 'لا شريحةَ طلباتٍ في العرض التنفيذيّ');
  for (const item of asks) {
    const count = item.ask.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(count <= 40, `طلبٌ بـ${count} كلمة والحدّ 40: ${item.ask.slice(0, 70)}`);
  }
});

test('سعةُ الشريحة التنفيذيّة محترمة: مؤشّراتٌ وطلباتٌ وأرقام', () => {
  for (const slide of executiveSlides) {
    if (slide.kind === 'brief') {
      assert.ok(slide.kpis.length <= EXEC_CAPACITY.kpis, `بطاقة «${slide.title}» تجاوزت سعة المؤشّرات`);
    }
    if (slide.kind === 'asks') {
      assert.ok(slide.items.length <= EXEC_CAPACITY.asks, `شريحة طلبات «${slide.title}» تجاوزت السعة`);
    }
    if (slide.kind === 'numbers') {
      assert.ok(slide.items.length <= EXEC_CAPACITY.numbers, 'لوحة الأرقام تجاوزت السعة');
    }
  }
});

test('بطاقةٌ واحدةٌ لكلّ بند — لا بندَ يسقط من العرض التنفيذيّ ولا يتكرّر', () => {
  const briefs = executiveSlides.filter((slide) => slide.kind === 'brief');
  assert.equal(briefs.length, sections.length);
  assert.equal(new Set(briefs.map((slide) => slide.key)).size, sections.length);
  for (const brief of briefs) {
    assert.ok(brief.section.headline?.trim(), `بطاقة البند ${brief.section.num} بلا عنوان`);
  }
});

test('كلُّ طلبٍ من الإدارة يصل إلى شرائح الطلبات — لا يسقط طلبٌ في الاختصار', () => {
  const shown = executiveSlides.filter((slide) => slide.kind === 'asks').flatMap((slide) => slide.items);
  assert.equal(shown.length, allDecisions.length, 'عددُ الطلبات المعروضة يفارق المصدر');
  assert.deepEqual(shown.map((item) => item.ask), allDecisions.map((item) => item.ask), 'نصُّ طلبٍ تغيّر أو تبدّل ترتيبه');
  for (const item of shown) {
    assert.ok(item.sectionNum?.trim(), 'طلبٌ بلا رقم بند');
    assert.equal(item.why, undefined, 'الشريحة التنفيذيّة تحمل «لماذا» — والتعليلُ في الملحق لا هنا');
  }
});

test('★★★ العرض التنفيذيّ لا يؤلّف نصًّا: كلُّ كلمةٍ فيه من المحتوى نفسه', () => {
  const sourceHeadlines = new Set(sections.map((section) => section.headline));
  const sourceKickers = new Set(sections.map((section) => section.kicker).filter(Boolean));
  const sourceAsks = new Set(allDecisions.map((decision) => decision.ask));
  for (const slide of executiveSlides) {
    if (slide.kind === 'brief') {
      assert.ok(sourceHeadlines.has(slide.section.headline), 'عنوانُ بطاقةٍ ليس من المحتوى');
      if (slide.section.kicker) assert.ok(sourceKickers.has(slide.section.kicker), 'كيكرٌ ليس من المحتوى');
    }
    if (slide.kind === 'asks') {
      for (const item of slide.items) assert.ok(sourceAsks.has(item.ask), `طلبٌ أُعيدت صياغته: ${item.ask.slice(0, 60)}`);
    }
  }
});

test('فهرس العرض التنفيذيّ: بلا تكرارٍ وبعدد شرائحه، ويبدأ بالغلاف وينتهي بالتوقيع', () => {
  assert.equal(new Set(executiveIndex).size, executiveIndex.length, 'عنوانُ شريحةٍ مكرّر');
  assert.equal(executiveIndex.length, executiveSlides.length);
  assert.equal(buildExecutiveSlides().length, executiveSlides.length, 'بناءُ الشرائح التنفيذيّة غير مستقرّ');
  assert.equal(executiveSlides[0].kind, 'cover');
  assert.equal(executiveSlides[1].kind, 'agenda');
  assert.equal(executiveSlides.at(-1).kind, 'signoff');
});

test('الملحق المرجعيّ باقٍ بحاله — الاختصارُ لا يحذف شيئًا', () => {
  assert.ok(slides.length >= 100, 'الملحق المرجعيّ نقص — التفصيل يُطوى لا يُحذف');
  const annexDecisions = slides.filter((slide) => slide.kind === 'decisions').flatMap((slide) => slide.items);
  assert.equal(annexDecisions.length, allDecisions.length);
  for (const decision of annexDecisions) {
    assert.ok(decision.why?.trim(), 'طلبٌ في الملحق بلا تعليل — والتعليلُ هو سببُ وجود الملحق');
  }
});

/*
  ★★★ **حارسُ الصفّ المنزلق** — وُضع بعد عطبٍ حيٍّ (المالك 2026-10-06): وضعُ
  العرض شاشةٌ بيضاء. اللوحةُ شبكةٌ بثلاثة صفوف، ووضعُ العرض يُخفي الشريطَ
  العلويَّ بـ`display: none` — **وهو يُسقط العنصرَ من الشبكة لا يُفرغه** —
  فينزلق المسرحُ إلى صفّ `auto` (ارتفاعٌ صفر) والشريطُ السفليُّ إلى صفّ `1fr`
  (فيبتلع الشاشة). قِيس: مسرحٌ 0، وشريطٌ 1034، ولوحةُ رسمٍ عند y = −469.

  والعطبُ من صنفٍ لا يمسكه اختبارُ منطق: لا بيانةَ فيه ولا دالّة — قاعدتان
  في CSS تفترقان. فيُحرس بقراءة الملفّ نفسِه: **من أخفى صفًّا فليُصلح القالب**.
*/
test('★★★ إخفاءُ الشريط العلويّ في وضع العرض يُقابله قالبُ صفوفٍ مُصحَّح', async () => {
  const css = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/gm-meeting.css'), 'utf8');
  const hides = /\.gm-meeting-deck\.is-presenting\s+\.gm-toolbar\s*\{[^}]*display:\s*none/.test(css);
  assert.ok(hides, 'توقّعنا أن يُخفي وضعُ العرض الشريطَ العلويّ');
  const retemplates = /\.gm-meeting-deck\.is-presenting\s*\{[^}]*grid-template-rows:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s+auto/.test(css);
  assert.ok(retemplates, 'الشريطُ العلويُّ مخفيٌّ ولم يُصحَّح `grid-template-rows` لصفّين — المسرحُ سينكمش إلى صفر');
});

test('★★ المسرحُ على صفٍّ مرنٍ يقبل الانكماش — `minmax(0, 1fr)` لا `1fr`', async () => {
  const css = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/gm-meeting.css'), 'utf8');
  const base = css.match(/\.gm-meeting-deck\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.match(base, /grid-template-rows:\s*auto\s+minmax\(\s*0\s*,\s*1fr\s*\)\s+auto/, 'الصفُّ المرن بلا `minmax(0, …)` يرفض أن يصغر دون محتواه فيفيض');
  assert.match(base, /height:\s*calc\(100dvh\s*-\s*var\(--gm-top/, 'ارتفاعُ اللوحة يجب أن يطرح إزاحةَ رأسها — `100dvh` من رأسٍ مُزاحٍ تتجاوز الشاشة');
});

/*
  ★★★ **حارسُ القصّ بين الطبقتين** — وُضع بعد انهيارٍ حيٍّ 2026-10-06: الرجوعُ
  من الملحق (145 شريحة) إلى العرض التنفيذيّ (23) أبقى الموضعَ 134، فقرأ
  المكوّن `deck[134]` من طبقةٍ فيها 23 فجاءت `undefined` وانفجر على
  `slide.kind` — واختفت اللوحةُ كلُّها من الشاشة.

  ولا يمسكه اختبارُ بيانات: العطبُ في قراءةِ حالةٍ أثناء تبديل طبقة. فيُحرس
  بقراءة المكوّن نفسِه — كما حُرس الصفُّ المنزلق بقراءة CSS.
*/
test('★★★ موضعُ الشريحة يُقصّ على طول الطبقة قبل القراءة', async () => {
  const jsx = await readFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/gm-meeting/GmMeetingDeck.jsx'),
    'utf8',
  );
  assert.match(jsx, /const\s+active\s*=\s*Math\.min\(\s*rawActive\s*,/, 'الموضعُ يُقرأ بلا قصٍّ — شريحةٌ خارج الطبقة تُسقط اللوحة كلَّها');
  assert.match(jsx, /const\s+current\s*=\s*deck\[active\]/, 'الشريحةُ الحاليّة يجب أن تُقرأ بالموضع المقصوص');
});

test('★★ كلُّ بندٍ له نقطةُ هبوطٍ في الطبقتين — فزرُّ التفاصيل لا يضلّ', () => {
  const execKeys = new Set(executiveSlides.filter((s) => s.kind === 'brief').map((s) => s.key));
  const annexKeys = new Set(slides.filter((s) => s.kind === 'section').map((s) => s.key));
  for (const section of sections) {
    assert.ok(execKeys.has(section.key), `البند ${section.num} بلا بطاقةٍ في العرض التنفيذيّ`);
    assert.ok(annexKeys.has(section.key), `البند ${section.num} بلا افتتاحيّةٍ في الملحق — زرُّ التفاصيل سيقفز إلى الغلاف`);
  }
});
