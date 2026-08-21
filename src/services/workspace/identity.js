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
  {
    file: 'odoo-proxy/cloudflare-worker/wrangler.toml.example',
    kinds: ['host'],
    severity: 'break',
    what: 'الأصل المسموح في القالب الذي يُنسخ عند النشر',
  },
  { file: 'README.md', kinds: ['slug', 'host', 'base'], severity: 'text', what: 'واجهة المستودع' },
  {
    file: 'DEVELOPER_GUIDE.md',
    kinds: ['slug', 'host', 'base'],
    severity: 'text',
    what: 'جدول الروابط ومسار التطوير',
  },
  { file: 'ROADMAP.md', kinds: ['slug', 'host', 'base'], severity: 'text', what: 'بطاقة المستودع' },
  {
    file: 'brandzo-addons/brandzo_warehouse/README.md',
    kinds: ['slug', 'host', 'base'],
    severity: 'text',
    what: 'روابط وحدة أودو',
  },
  {
    file: 'brandzo-addons/brandzo_warehouse/__manifest__.py',
    kinds: ['slug'],
    severity: 'text',
    what: 'موقع الوحدة في بيان أودو',
  },
  {
    file: 'docs/ODOO_INTEGRATION_HANDOFF.md',
    kinds: ['host'],
    severity: 'text',
    what: 'الأصل الذي يضبطه الناشر',
  },
  {
    file: 'docs/عقد-التكامل-مع-أودو.md',
    kinds: ['host'],
    severity: 'text',
    what: 'الأصل المقيَّد في عقد التكامل',
  },
  {
    file: 'public/تقرير-النظام-التفصيلي.html',
    kinds: ['slug', 'host', 'base'],
    severity: 'text',
    what: 'بطاقة الموقع الحيّ في التقرير المنشور',
  },
  {
    file: 'public/nova-meeting/plan.html',
    kinds: ['host', 'base'],
    severity: 'text',
    what: 'روابط البوابة في وثيقة اجتماع نوفا الحاكمة',
  },
  {
    file: 'src/components/pwa/PwaHead.astro',
    kinds: ['base'],
    severity: 'text',
    what: 'تعليقات مسار النشر',
  },
  {
    file: 'src/services/auth/authService.js',
    kinds: ['base'],
    severity: 'text',
    what: 'تعليق المسار الأساسيّ',
  },
];

/**
 * ما يُعفى من المسح الشامل — وهو **قرارٌ مكتوب لا صمت**.
 *
 * المسح في `identity.test.js` يجوب كلّ ملفٍّ متعقَّبٍ بحثًا عن رمز الشقيق، فيلزمه
 * إعفاءٌ لصنفَين لا ثالث لهما:
 * - **سجلٌّ تاريخيّ**: أرشيفٌ ومحاضرُ وتقاريرُ صدرت بروابطها يومها؛ ختمُها تزويرٌ.
 * - **ما يذكر المستودعَين بطبعه**: البطاقة والدستور وآلة الهويّة نفسها، وثوابتُ الاختبارات.
 *
 * وكلّ ملفٍّ جديدٍ يذكر الشقيق يسقط خارج هذه القائمة، فيُسقط الاختبار ويُجبر على
 * قرار: إمّا موضعُ هويّةٍ يُختم، وإمّا إعفاءٌ يُكتب هنا بسببه.
 */
export const SWEEP_EXEMPT = [
  // البطاقة والدستور وآلة الهويّة — تذكر الشقيق عمدًا.
  'workspace.json',
  'WORKSPACE.md',
  'AGENTS.md',
  'src/services/workspace/identity.js',
  'src/services/workspace/identity.test.js',
  // سجلٌّ تاريخيّ لا يُعاد كتابته.
  'SESSION_HANDOFF.md',
  'docs/archive/',
  'docs/إحاطة-كوديكس.md',
  'public/archive/',
  // رابطٌ بائتٌ لمستودعٍ ثالثٍ لم يعد قائمًا في المستودعَين معًا.
  '.agents/skills/testing-brandzo/SKILL.md',
];

/** الاختبارات تستعمل مسار النشر ثابتًا صريحًا لا إعدادًا مقروءًا، فلا يُختم. */
const TEST_FILE = /\.test\.(js|mjs)$/;

/** هل هذا المسار معفًى من المسح الشامل؟ (تطابقٌ تامّ أو بادئةُ مجلّد). */
export function isSweepExempt(path) {
  const p = String(path).replace(/\\/g, '/');
  if (TEST_FILE.test(p)) return true;
  return SWEEP_EXEMPT.some((e) => (e.endsWith('/') ? p.startsWith(e) : p === e));
}

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

/** يستبدل كتلة الهويّة بعلامةٍ محايدة، ليُقارَن ما حولها — أي الدستور — وحده. */
export function withoutBlock(text) {
  const src = String(text);
  const i = src.indexOf(BLOCK_START);
  const j = src.indexOf(BLOCK_END);
  if (i === -1 || j === -1 || j < i) return src;
  return `${src.slice(0, i)}«هويّة»${src.slice(j + BLOCK_END.length)}`;
}

/**
 * يوحّد نهايات الأسطر قبل المقارنة — المستودع يُطوَّر على ويندوز ويُبنى على لينكس.
 *
 * **ولا تُقارَن هنا وثيقةٌ مولَّدةٌ بنسختها على القرص إلّا عبره.** فالمولّد يكتب
 * بـ`\n`، وgit يستخرج بـ`\r\n` حين `core.autocrlf=true` — فيصير نصٌّ واحدٌ
 * نصَّين في نظر `===`. وثمنُ نسيانه ليس أحمرَ صريحًا بل **أحمرَ كاذب**: كان
 * `npm run identity` يُعلن «تسرّبت هويّة الشقيق إلى موضعين» ولا تسرّب البتّة،
 * و`npm test` يسقط أبدًا على ويندوز. وحارسٌ يصيح بلا ذئبٍ يُهجَر فلا يُسمَع
 * يوم يصيح بحقّ.
 *
 * و`.gitattributes` يُثبّت صيغة LF للمولَّدات فيمنع العطب من أصله؛ وهذا يُبقيه
 * ممتنعًا حتّى على استنساخٍ بإعدادٍ آخر أو أداةٍ تكتب بـCRLF.
 */
export function lf(text) {
  return String(text).replace(/\r\n/g, '\n');
}

/**
 * **هل يفسّر الختمُ وحدَه اختلافَ نسختَي ملفّ؟**
 *
 * هذا حارس المزامنة الحقيقيّ. الدمج يرجّح الشقيق، فكلّ ما هنا وليس عنده يُمحى.
 * والاكتفاء بقائمة أسماءٍ مسموحٍ لها أن تختلف خطأٌ خفيّ: `package.json` مثلًا في
 * جدول الهويّة، فلو أضافت إدارة تقنية المعلومات سكربتًا فيه لمُحي صامتًا ومرّ
 * الحارس مطمئنًّا. ولهذا نسأل عن المضمون لا عن الاسم: نختم نسخة الشقيق بهويّتنا،
 * فإن طابقت نسختَنا حرفًا بحرف فالفرق هويّةٌ خالصة ولا شيء يُفقد. وإلّا فهنا عملٌ
 * ليس عنده — يُعرض ويُوقف.
 *
 * @param {{file:string, ours:string, theirs:string, me:object, you:object}} args
 * @returns {boolean}
 */
export function identityOnly({ file, ours, theirs, me, you }) {
  if (ours == null || theirs == null) return false;
  // الدستور: كتلته مولَّدة، وما حولها يجب أن يكون واحدًا في المستودعَين.
  if (file === 'AGENTS.md') return lf(withoutBlock(ours)) === lf(withoutBlock(theirs));
  const spot = SPOTS.find((s) => s.file === file);
  if (!spot) return false;
  return lf(stamp(theirs, you, me, spot.kinds)) === lf(ours);
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
    card.autoSync
      ? `**وهنا تجري وحدها:** ورك-فلو [\`sync-from-sibling\`](.github/workflows/sync-from-sibling.yml) يستيقظ **كلّ ساعة**، فيفعل ما سبق ثمّ يُشغّل البوّابة الخضراء كاملةً (اختبارات · تدقيق · بناء) — **ولا يدفع إلّا إن مرّ كلّ شيء**، ثمّ يُطلق النشر. وأيّ خلل — تعارضٌ لا يُحلّ، أو عملٌ محلّيٌّ سيُمحى، أو اختبارٌ ساقط — يوقفه ويصلك إشعارُ فشلٍ من GitHub، ولا يُنشر شيء. ويُشغَّل يدويًّا متى شئت من تبويب Actions.`
      : `**ولا يلزمك تشغيله في الاتّجاه الآخر:** ${s.name} يسحب من هنا **تلقائيًّا كلّ ساعة** بالورك-فلو نفسه — الملفّ واحدٌ في المستودعَين، ولا يعمل إلّا حيث تأذن بطاقتُه (\`autoSync\`)، فيستحيل أن يتقاذفا المزامنة. فما تدفعه إلى \`main\` هنا يبلغه خلال ساعة، بعد بوّابةٍ خضراء.`,
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
