/**
 * اجتماع الإدارة العامة — الأربعاء 2026-10-07 (BFP-SCM-GM-2026-001).
 *
 * عرضٌ يُدار به الاجتماع أمام المدير العام: عشرة بنودٍ على جدول الأعمال،
 * ينتهي كلُّ بندٍ منها بما هو **مطلوبٌ من الإدارة العامة**، وتُجمَّع الثمانيةُ
 * والأربعون طلبًا في شريحة إقفالٍ واحدة. الهويّة هنا هويّة الوثيقة الرسمية
 * (أحمر برند زو) لا الثيم الفاتح للشاشات — كسابقة اجتماع نوفا، لأنّ هذه
 * ورقةُ جلسةٍ تُعرَض على الإدارة لا شاشةَ بياناتٍ تشغيلية.
 *
 * **المحتوى مفصولٌ عن العرض**: كلّ النصوص والأرقام في
 * [`gm-meeting-content.js`](gm-meeting-content.js) — مستخرجةً من مصادرها
 * الحقيقية (تقرير رحلة التأسيس · محاضر جولة ULC · تقرير مطابقة جرد نوفا ·
 * محاضر الاجتماعات الخمسة · التقييم الفني للبوابة · التقارير الهندسية لموقع
 * 155 · المرجع التشغيلي لأودو). وهذا الملف **محرّكُ الشرائح** فقط: يقسّم
 * المحتوى الطويل إلى شرائح 1280×720 بسعةٍ معلومةٍ لكل نوع كتلة، فلا تفيض
 * شريحةٌ ولا يُحذف محتوى.
 *
 * ولماذا التقسيم في البيانات لا في المكوّن؟ لأنّ `gm-meeting.test.js` يفرض
 * أن يكون الفهرس مطابقًا للشرائح المرسومة عددًا وترتيبًا، وأن تكون كلُّ صورةٍ
 * يَعِد بها العرض ملفًّا قائمًا تحت `public/gm-meeting/img/` — فلا يَعِد العرض
 * بصورةٍ غير موجودة ولا بشريحةٍ لا فهرس لها.
 */

import content from './gm-meeting-content.js';

export const meetingMeta = content.meta;
export const sections = content.sections;

/** بنود جدول الأعمال العشرة — الفرعيّان (4.1 و4.2) يظهران تحت بندهما الأب. */
export const agenda = sections
  .filter((section) => section.level === 0)
  .map((section) => ({
    num: section.num,
    key: section.key,
    title: section.navTitle,
    desc: section.navDesc,
    icon: section.navIcon,
    subs: sections.filter((sub) => sub.level === 1 && sub.num.startsWith(`${section.num}.`)),
  }));

/** كل ما يحتاج قرارًا من الإدارة العامة، مرتّبًا بحسب البند. */
export const allDecisions = sections.flatMap((section) =>
  (section.decisions || []).map((decision) => ({
    ...decision,
    sectionNum: section.num,
    sectionTitle: section.navTitle,
  })),
);

/* ═══════════════════════════════════════════════════════════════════
   سعة الشريحة — كم عنصرًا يتّسع له مسرح 1280×720 لكل نوع كتلة
   ═══════════════════════════════════════════════════════════════════
   الأرقام محسوبةٌ على الشبكة الفعلية في `gm-meeting.css`: البطاقات ثلاثٌ في
   الصفّ، والقوائم عمودٌ واحد، والجدول صفًّا صفًّا. تجاوزُها يقصّ النصّ على
   الشاشة — فالتقسيم هنا هو ما يمنع ذلك.
*/
export const SLIDE_CAPACITY = {
  cards: 9,
  list: 8,
  steps: 8,
  timeline: 6,
  bars: 6,
  table: 10,
  gallery: 8,
  kpis: 5,
  decisions: 6,
  /** الملاحظات والاقتباسات قصيرة — تُجمع اثنتان في شريحةٍ واحدة. */
  notes: 2,
};

const NOTE_TYPES = new Set(['callout', 'quote']);

function chunk(items, size) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/**
 * يبني قائمة الشرائح كاملةً بالترتيب الذي تُعرض به.
 * كل شريحة: { kind, key?, title, ... } — و`title` هو اسمها في الفهرس.
 */
export function buildSlides() {
  const slides = [
    { kind: 'cover', title: 'الغلاف' },
    { kind: 'agenda', title: 'جدول الأعمال' },
  ];

  for (const section of sections) {
    const label = `${section.num} · ${section.navTitle}`;
    // المؤشرات تُعرض داخل شريحة الافتتاحية نفسها — لا شريحةً منفصلة لخمسة أرقام.
    slides.push({
      kind: 'section',
      key: section.key,
      section,
      kpis: (section.kpis || []).slice(0, SLIDE_CAPACITY.kpis),
      title: label,
    });

    // الملاحظات والاقتباسات المتتالية تُجمع أولًا، فلا تتفرّق شرائحُ بسطرٍ واحد.
    const units = [];
    (section.blocks || []).forEach((block, blockIndex) => {
      const previous = units[units.length - 1];
      if (NOTE_TYPES.has(block.type) && previous?.kind === 'notes' && previous.blocks.length < SLIDE_CAPACITY.notes) {
        previous.blocks.push(block);
        return;
      }
      units.push(
        NOTE_TYPES.has(block.type)
          ? { kind: 'notes', blocks: [block], blockIndex }
          : { kind: 'block', block, blockIndex },
      );
    });

    units.forEach((unit) => {
      if (unit.kind === 'notes') {
        slides.push({
          kind: 'notes',
          key: section.key,
          section,
          blocks: unit.blocks,
          blockIndex: unit.blockIndex,
          title: `${label} — ${unit.blocks[0].title || 'ملاحظات'}`,
        });
      } else {
        const block = unit.block;
        const type = block.type;
        const source = type === 'table' ? block.rows || [] : block.items || [];
        const groups = chunk(source, SLIDE_CAPACITY[type] || 8);
        groups.forEach((group, index) => {
          const sliced = type === 'table' ? { ...block, rows: group } : { ...block, items: group };
          slides.push({
            kind: 'block',
            key: section.key,
            section,
            block: sliced,
            blockIndex: unit.blockIndex,
            part: index + 1,
            parts: groups.length,
            title:
              groups.length > 1
                ? `${label} — ${block.title || 'تفصيل'} (${index + 1}/${groups.length})`
                : `${label} — ${block.title || 'تفصيل'}`,
          });
        });
      }

      // الرسم التوضيحي يأتي بعد أول وحدةٍ مكتملة — لا قبل أن يُفهم السياق.
      if (section.diagram && unit.blockIndex === 0) {
        slides.push({
          kind: 'diagram',
          key: section.key,
          section,
          diagram: section.diagram,
          title: `${label} — مخطط توضيحي`,
        });
      }
    });

    (section.galleries || []).forEach((gallery, galleryIndex) => {
      chunk(gallery.items, SLIDE_CAPACITY.gallery).forEach((group, index, groups) => {
        slides.push({
          kind: 'gallery',
          key: section.key,
          section,
          gallery: { ...gallery, items: group },
          galleryIndex,
          title:
            groups.length > 1
              ? `${label} — ${gallery.title} (${index + 1}/${groups.length})`
              : `${label} — ${gallery.title}`,
        });
      });
    });

    chunk(section.decisions || [], SLIDE_CAPACITY.decisions).forEach((group, index, groups) => {
      slides.push({
        kind: 'decisions',
        key: section.key,
        section,
        items: group,
        title:
          groups.length > 1
            ? `${label} — المطلوب من الإدارة (${index + 1}/${groups.length})`
            : `${label} — المطلوب من الإدارة`,
      });
    });
  }

  chunk(allDecisions, 10).forEach((group, index, groups) => {
    slides.push({
      kind: 'closing',
      items: group,
      title: groups.length > 1 ? `خلاصة القرارات (${index + 1}/${groups.length})` : 'خلاصة القرارات',
    });
  });

  slides.push({ kind: 'signoff', title: 'الاعتماد والتوقيع' });
  return slides;
}

export const slides = buildSlides();
export const slideIndex = slides.map((slide) => slide.title);

/* ═══════════════════════════════════════════════════════════════════
   العرض التنفيذيّ — ما يُدار به الاجتماع فعلًا
   ═══════════════════════════════════════════════════════════════════
   ★★★ **قرار المالك 2026-10-06:** العرضُ الكامل (140 شريحةً و27,571 كلمة)
   تقريرٌ لُصق على شرائح لا عرضًا — شريحةٌ متوسّطها 197 كلمة لا تُقرأ على جهاز
   عرضٍ في قاعة، وساعتان وعشرون دقيقة لا تليق باجتماع إدارةٍ عامّة.

   فصار العرضُ طبقتين: **تنفيذيٌّ يُعرض** (ما دون) **وملحقٌ مرجعيّ يُفتح عند
   السؤال** (`buildSlides` أعلاه، بحاله لا يُنقص منه حرف).

   والتنفيذيُّ **لا يؤلّف نصًّا جديدًا**: كلُّ كلمةٍ فيه مأخوذةٌ كما هي من
   `kicker` و`headline` و`kpis` و`decisions.ask` في المحتوى نفسه. فما يُعرض
   في القاعة هو ما في الملحق، مختصرًا لا معادًا كتابته — ولو أُلّف هنا نصٌّ
   لانفصل العرضُ عن مصادره وصار الملحقُ يكذّبه.
*/

/** سعة الشريحة التنفيذيّة — أضيق من سعة الملحق عمدًا. */
export const EXEC_CAPACITY = {
  /** مؤشّرات البند الواحد على شريحته. */
  kpis: 4,
  /** طلبات القرار في شريحةٍ واحدة — بنصّ الطلب وحده بلا «لماذا». */
  asks: 8,
  /** أرقامٌ على لوحة «الصورة في أرقام» — رقمٌ واحدٌ عن كلّ بندٍ رئيس. */
  numbers: 10,
};

/**
 * يبني العرض التنفيذيّ: غلافٌ وجدولُ أعمالٍ ولوحةُ أرقام، ثمّ **شريحةٌ واحدة
 * لكلّ بند** (عنوانُه ومؤشّراتُه وعددُ ما يطلبه)، ثمّ طلباتُ القرار مجموعةً،
 * ثمّ الاعتماد. اثنتان وعشرون شريحة — زمنُ عرضٍ 35–45 دقيقة.
 */
export function buildExecutiveSlides() {
  const out = [
    { kind: 'cover', title: 'الغلاف' },
    { kind: 'agenda', title: 'جدول الأعمال' },
  ];

  // لوحة الأرقام: **رقمٌ واحدٌ عن كلّ بندٍ رئيس** لا رقمان عن بعضها — فتكون
  // الشريحةُ خريطةَ بنود الاجتماع في شاشةٍ واحدة، لا عيّنةً من أوّلها.
  const numbers = sections
    .filter((section) => section.level === 0)
    .map((section) => {
      const kpi = (section.kpis || [])[0];
      return kpi ? { ...kpi, sectionNum: section.num } : null;
    })
    .filter(Boolean)
    .slice(0, EXEC_CAPACITY.numbers);
  if (numbers.length > 0) out.push({ kind: 'numbers', items: numbers, title: 'الصورة في أرقام' });

  for (const section of sections) {
    out.push({
      kind: 'brief',
      key: section.key,
      section,
      kpis: (section.kpis || []).slice(0, EXEC_CAPACITY.kpis),
      asks: (section.decisions || []).length,
      title: `${section.num} · ${section.navTitle}`,
    });
  }

  // ★ الطلبُ وحده بلا «لماذا»: الشريحةُ تحمل ما تعرضه فقط، فيقيس الحارسُ
  //   كثافتَها على ما يُقرأ في القاعة لا على ما في المصدر. والتعليلُ في الملحق.
  const asks = allDecisions.map(({ ask, sectionNum, sectionTitle }) => ({ ask, sectionNum, sectionTitle }));
  chunk(asks, EXEC_CAPACITY.asks).forEach((group, index, groups) => {
    out.push({
      kind: 'asks',
      items: group,
      from: index * EXEC_CAPACITY.asks,
      title:
        groups.length > 1
          ? `المطلوب من الإدارة العامة (${index + 1}/${groups.length})`
          : 'المطلوب من الإدارة العامة',
    });
  });

  out.push({ kind: 'signoff', title: 'الاعتماد والتوقيع' });
  return out;
}

export const executiveSlides = buildExecutiveSlides();
export const executiveIndex = executiveSlides.map((slide) => slide.title);
