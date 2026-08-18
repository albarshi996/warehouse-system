/**
 * هويّة المستودع — مصدرٌ واحد يُختَم على كلّ موضعٍ يذكر المكان.
 *
 * **المشكلة:** المستودعان (الشخصيّ ومستودع الشركة) نسختان من نظامٍ واحد،
 * لا يفترقان إلّا في تسعة مواضع: رابط النشر ومساره واسم الحزمة والأصل المسموح
 * لوكيل أودو. وكانت كلّ نقلةٍ بينهما تُعيد فتح هذه المواضع يدويًّا — والنسيان
 * لا يظهر في المراجعة بل بعد النشر: روابط تشير إلى المستودع الآخر، ووكيلٌ يردّ
 * الطلبات لأنّ أصلها لا يطابق المسموح. الدرس المكتوب في `WORKSPACE.md`:
 * **النسخة الحرفيّة تُنشر مكسورة.**
 *
 * **الحلّ:** البطاقة `workspace.json` هي المصدر الوحيد. تُشتقّ منها أربعة رموز
 * (`slug` · `host` · `base` · `name`)، ويقول جدول {@link SPOTS} أيّ رمزٍ يُختَم
 * في أيّ ملفّ. فالختم يُصلح ما أفسدته المزامنة دفعةً واحدة، والفحص يمنع النشر
 * إن تسرّب رمز الشقيق — والفحص نفسه اختبارٌ في `npm test`، وهو حاجز CI الصلب،
 * فلا يمرّ تسرّبٌ إلى الموقع الحيّ.
 *
 * المنطق هنا خالص: نصٌّ يدخل ونصٌّ يخرج، بلا قرصٍ ولا git — ليُختبر وحده.
 * القراءة والكتابة في `scripts/identity.mjs`، والمزامنة في `scripts/sync-sibling.mjs`.
 */

/**
 * الرموز الأربعة مرتّبةً ترتيبَ الختم — والترتيب ليس تجميلًا:
 * `slug` («albarshi996/warehouse-system») يحوي `base` («/warehouse-system») في ذيله،
 * فلو خُتم `base` أوّلًا لتمزّق الـ`slug` نصفين. وللسبب نفسه يأتي `name` أخيرًا.
 */
export const KINDS = ['slug', 'host', 'base', 'name'];

/** شكل كلّ رمزٍ نصًّا كما يظهر في الملفّات. */
const PATTERN = {
  slug: (t) => t.slug,
  host: (t) => t.host,
  base: (t) => t.base,
  // بين علامتَي اقتباس لأنّه لا يُختم إلّا في JSON (`"name": "…"`)، فلا يمسّ نصًّا حرًّا.
  name: (t) => `"${t.name}"`,
};

/**
 * مواضع الهويّة — الجدول الذي يحلّ محلّ الذاكرة.
 *
 * `severity`: `break` يكسر شيئًا حيًّا إن أخطأ · `meta` بياناتُ حزمة · `text` تعليقٌ أو رابط.
 * وما ليس في هذا الجدول لا يُمَسّ: وثائق الأرشيف والتقارير المنشورة تذكر روابطها
 * التاريخيّة عمدًا، وختمُها تزويرُ سجلٍّ لا تصحيحُ إعداد.
 */
export const SPOTS = [
  {
    file: 'astro.config.mjs',
    kinds: ['host', 'base'],
    severity: 'break',
    what: 'رابط النشر ومساره',
  },
  {
    file: 'src-tauri/tauri.conf.json',
    kinds: ['host', 'base'],
    severity: 'break',
    what: 'واجهة تطبيق سطح المكتب',
  },
  {
    file: 'odoo-proxy/firebase-function/index.js',
    kinds: ['host'],
    severity: 'break',
    what: 'الأصل المسموح لوكيل أودو',
  },
  {
    file: 'package.json',
    kinds: ['slug', 'name'],
    severity: 'meta',
    what: 'اسم الحزمة وعناوينها',
  },
  { file: 'package-lock.json', kinds: ['name'], severity: 'meta', what: 'اسم الحزمة' },
  {
    file: 'odoo-proxy/cloudflare-worker/worker.js',
    kinds: ['host'],
    severity: 'text',
    what: 'مثال الأصل في التوثيق',
  },
  {
    file: 'src/components/executive-review/ExecutiveReviewShell.astro',
    kinds: ['base'],
    severity: 'text',
    what: 'تعليق مسار النشر',
  },
  {
    file: 'src/components/executive-review/ReviewSections.astro',
    kinds: ['base'],
    severity: 'text',
    what: 'تعليق مسار النشر',
  },
  {
    file: 'src/pages/dashboard/archive.astro',
    kinds: ['host', 'base'],
    severity: 'text',
    what: 'رابط المقترح في بريد الدعوة',
  },
];

/** علامتا كتلة الهويّة في `AGENTS.md` — ما بينهما مولَّد، وما حولهما دستورٌ يُحرَّر يدويًّا. */
export const BLOCK_START = '<!-- identity:start -->';
export const BLOCK_END = '<!-- identity:end -->';

/** ترويسة الملفّ المولَّد — تمنع تحريرًا يدويًّا يضيع في الختم التالي بلا أثر. */
export const GENERATED_NOTE =
  '<!-- مولَّد من workspace.json عبر `npm run identity:apply` — لا تحرّره يدويًّا. -->';

/**
 * يشتقّ رموز الهويّة من بطاقةٍ (البطاقة نفسها أو كتلة `sibling` منها).
 * @param {{repo:string, pages?:string}} card
 * @returns {{slug:string, host:string, base:string, name:string}}
 */
export function tokensOf(card) {
  const repo = String(card?.repo ?? '').trim();
  const parts = repo.split('/');
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name) {
    throw new Error(`بطاقة هويّة بلا عنوان صالح «owner/repo»: ${JSON.stringify(card?.repo)}`);
  }
  // الافتراض صفحةُ مشروعٍ على GitHub Pages، و`pages` يتجاوزه إن اعتُمد نطاقٌ مستقلّ.
  const pages = String(card.pages ?? `https://${owner}.github.io/${name}/`);
  const url = new URL(pages);
  const base = url.pathname.replace(/\/+$/, '');
  if (!base) {
    throw new Error(`رابط نشرٍ بلا مسارٍ فرعيّ (${pages}) — الختم بمسارٍ فارغ يمحو ما لا يقصده.`);
  }
  return { slug: `${owner}/${name}`, host: url.origin, base, name };
}

/**
 * يستبدل رموز `from` برموز `to` في نصّ موضعٍ واحد.
 * عمليّة ساكنة: تشغيلها مرّتين كتشغيلها مرّة، لأنّ الرموز المستبدَلة لم تعد موجودة.
 * @param {string} text نصّ الملفّ
 * @param {object} from رموز الهويّة الغريبة
 * @param {object} to رموز هويّتنا
 * @param {string[]} kinds الرموز المعنيّة بهذا الموضع
 */
export function stamp(text, from, to, kinds) {
  let out = String(text);
  for (const kind of KINDS) {
    if (!kinds.includes(kind)) continue;
    const a = PATTERN[kind](from);
    const b = PATTERN[kind](to);
    if (a !== b) out = out.split(a).join(b);
  }
  return out;
}

/**
 * يبحث عن رموز الشقيق المتسرّبة في نصّ موضع.
 * @returns {string[]} الرموز الموجودة — والفارغُ يعني نظيفًا.
 */
export function leaks(text, sibling, kinds) {
  const found = [];
  for (const kind of KINDS) {
    if (!kinds.includes(kind)) continue;
    const p = PATTERN[kind](sibling);
    if (String(text).includes(p)) found.push(p);
  }
  return found;
}

/** يستبدل ما بين علامتَي الهويّة في `AGENTS.md`، ويُبقي ما حولهما كما هو. */
export function replaceBlock(text, block) {
  const src = String(text);
  const i = src.indexOf(BLOCK_START);
  const j = src.indexOf(BLOCK_END);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`لم أجد علامتَي ${BLOCK_START} … ${BLOCK_END} — أضِفهما حول كتلة الهويّة.`);
  }
  return `${src.slice(0, i) + BLOCK_START}\n${block}\n${src.slice(j)}`;
}

/** كتلة الهويّة في رأس `AGENTS.md` — أوّل ما يقرؤه الوكيل قبل أيّ عمل. */
export function agentsBlock(card) {
  const s = card.sibling;
  return [
    `> ## ● أنت في **${card.name}** — \`${card.repo}\``,
    '>',
    `> ${card.purpose}. **${card.rules}.**`,
    '>',
    `> يقابله **${s.name}** \`${s.repo}\` (${s.purpose}). مستودعان منفصلان، لكلٍّ مجلّدٌ وريموتٌ واحد؛ ولا مزامنة تلقائيّة — بل بأمرٍ صريح: \`npm run sync\`.`,
    '>',
    '> **أوّل أمرٍ في كلّ جلسة: `npm run where`** — التفاصيل في [`WORKSPACE.md`](WORKSPACE.md).',
  ].join('\n');
}

/** يحذف بادئة البروتوكول ليُعرض الرابط في جدولٍ مختصرًا. */
function bare(host) {
  return host.replace(/^https?:\/\//, '');
}

/** بطاقة المكان كاملةً — `WORKSPACE.md` مولَّدًا، فلا تتناقض النسختان أبدًا. */
export function workspaceDoc(card) {
  const s = card.sibling;
  const me = tokensOf(card);
  const you = tokensOf(s);
  const breaks = SPOTS.filter((x) => x.severity === 'break');
  const rest = SPOTS.filter((x) => x.severity !== 'break');
  return [
    GENERATED_NOTE,
    '',
    `# أنت في **${card.name}**`,
    '',
    `\`${card.repo}\` — ${card.purpose}.`,
    '',
    '```bash',
    'npm run where',
    '```',
    '',
    'يطبع هويّة المستودع الحاليّ، ويتوقّف بخطأ إن خالفت البطاقةُ ريموتَ git الفعليّ.',
    '',
    '---',
    '',
    '## المستودعان',
    '',
    `| | **${card.name}** (أنت هنا) | **${s.name}** |`,
    '|---|---|---|',
    `| العنوان | \`${card.repo}\` | \`${s.repo}\` |`,
    `| المجلّد المحلّيّ | \`${card.folder}\` | \`${s.folder}\` |`,
    `| الغرض | ${card.purpose} | ${s.purpose} |`,
    `| القواعد الحاكمة | ${card.rules} | ${s.rules} |`,
    `| النشر | ${bare(me.host)}${me.base}/ | ${bare(you.host)}${you.base}/ |`,
    '',
    '**لكلّ مجلّدٍ ريموتٌ واحدٌ فقط.** لا يوجد هنا أيّ ريموتٍ يشير إلى الشقيق، ولا العكس — فالدفع الخاطئ عرَضًا غير ممكن. والمزامنة تجلب بالعنوان مرّةً واحدة بلا ربطٍ دائم.',
    '',
    '## المزامنة من الشقيق',
    '',
    'المستودعان نسختان من نظامٍ واحد. ما يُبنى في أحدهما يُنقل إلى الآخر بأمرٍ واحد:',
    '',
    '```bash',
    'npm run sync',
    '```',
    '',
    `يجلب \`main\` من ${s.name}، ويدمجه مُرجِّحًا ما عنده عند التعارض، ثمّ **يُعيد ختم الهويّة** ويُولّد الخريطة، ثمّ يفحص ويعرض النتيجة — ولا يدفع. الدفع بأمرك وحدك.`,
    '',
    '> **حارس:** إن وجد هنا كوميتاتٍ تمسّ ملفّاتٍ خارج جدول الهويّة وليست عند الشقيق، توقّف وعرَضها — لأنّ ترجيح الشقيق يمحوها. عندئذٍ انقلها إليه أوّلًا، أو أكمل بـ`--force` وأنت تعلم.',
    '',
    'ولنقل تصليحٍ مفردٍ بلا مزامنةٍ كاملة، الانتقاء ما زال قائمًا:',
    '',
    '```bash',
    `git fetch ${s.remote} main`,
    'git cherry-pick <sha>',
    '```',
    '',
    '## مواضع الهويّة',
    '',
    'هذه المواضع مختلفة بين المستودعين عمدًا، وتُشتقّ من [`workspace.json`](workspace.json) — لا تُحرَّر يدويًّا ولا تُنقل بالانتقاء:',
    '',
    '| الموضع | ماذا فيه |',
    '|---|---|',
    ...breaks.map((x) => `| \`${x.file}\` | **${x.what}** — يكسر شيئًا حيًّا إن أخطأ |`),
    ...rest.map((x) => `| \`${x.file}\` | ${x.what} |`),
    '| `AGENTS.md` · `WORKSPACE.md` | كتلة الهويّة والبطاقة — مولَّدتان |',
    '',
    '```bash',
    'npm run identity        # فحص: هل تسرّب رمز الشقيق إلى موضع؟',
    'npm run identity:apply  # ختم: أعِد كتابة المواضع من البطاقة',
    '```',
    '',
    'والفحص نفسه اختبارٌ داخل `npm test`، و`npm test` حاجزٌ صلب في خطّ النشر — فلا يصل تسرّبٌ إلى الموقع الحيّ.',
    '',
    '## الأصل المشترك',
    '',
    'المستودعان يشتركان في التاريخ نفسه حتّى الكوميت `70a09aa` (٣٩٧ كوميت، 2026-08-15). ما بعده يتقاربان بالمزامنة، ويفترقان في الهويّة وحدها.',
    '',
    '## قبل أيّ كومِت هنا',
    '',
    'البوابة الخضراء في [`AGENTS.md`](AGENTS.md) سارية كما هي.',
    '',
  ].join('\n');
}
