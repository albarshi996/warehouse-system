/**
 * ‹ترتيب سهل — إصلاح البحث› مرادفاتُ البحث وتطبيعُه العربيّ (طلب المالك 2026-11-12).
 *
 * ★★★ **العطب الذي يُصلحه:** بحثُ `QuickLaunch` كان يطابق **التسميةَ حرفيًّا**،
 *     فمن بحث عن «دخول» أو «خروج» لم يجد «مركز البوابة»، ومن بحث عن «تقرير العهدة»
 *     لم يجد «العهد النقديّة» (بل حتّى «عهدة» ليست سلسلةً فرعيّةً في «العهد»!) — فظنّ
 *     الشاشةَ غيرَ موجودة. والعلاج: (١) تطبيعٌ يُسقط «ال» والتشكيلَ ويوحّد الألفَ
 *     والتاءَ المربوطة، (٢) مرادفاتٌ تصف **ما يكتبه الناسُ طبيعيًّا** لكلّ شاشة.
 *
 * ★★ **ودرسُ المراجعة العدائيّة (قبل الشحن):** التطبيعُ وحدَه كسر الكتابةَ
 *     التدريجيّة — «الع» لم تعد تجد «العهد»، و«دخول وخروج» (واوُ عطفٍ بلا «ال») لم
 *     تجد شيئًا. فالمطابقةُ الآن تجرّب الكلمةَ **بصيغها** (كما كُتبت · بلا «ال» · بلا
 *     واو العطف) على التسمية **بصيغتَيها** (بـ«ال» وبدونها)، وكلمةُ الحشو لا تُسقط إلّا
 *     إن بقي غيرُها — فمن كتب «أو» قاصدًا «أودو» لا يُحرَم نتائجَه.
 *
 * عرضٌ فقط: لا يمسّ صلاحيّةً ولا قاعدة — طبقةُ عثورٍ فوق `navCatalog`.
 */

/**
 * تطبيعٌ عربيٌّ للبحث: يُسقط التشكيلَ والتطويل، ويوحّد الألفَ (أ إ آ ← ا) والتاءَ
 * المربوطة (ة ← ه) والألفَ المقصورة (ى ← ي) والهمزةَ على نبرة/واو (ئ ؤ ← ء)،
 * ويردّ الأرقامَ الهنديّة (١٥٥) لاتينيّةً (155). ويُسقط «ال» التعريف في أوّل الكلمة
 * (ومعها السوابق: وال · بال · فال · كال · لل) ما لم يُطلب إبقاؤها.
 *
 * @param {string} input
 * @param {{keepArticle?: boolean}} [opts] أبقِ «ال» كما هي (لمطابقة الكتابة التدريجيّة).
 */
export function normalizeAr(input, { keepArticle = false } = {}) {
  let s = String(input == null ? '' : input)
    .replace(/[ً-ْٰ]/g, '') // تشكيل
    .replace(/ـ/g, '') // تطويل
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ١٥٥ ← 155
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ئؤ]/g, 'ء')
    .toLowerCase();
  if (!keepArticle) s = s.replace(/(^|\s)(?:[وبفك]?ال|لل)(?=\S{2,})/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

// ★ تُكتب **بصيغتها المطبَّعة** (ى←ي): «على»←«علي» و«إلى»←«الي» — وإلّا لم تُطابَق أبدًا.
const STOP_WORDS = new Set(['في', 'من', 'عن', 'علي', 'الي', 'او', 'مع', 'هذا', 'هذه']);

/**
 * كلماتُ عبارة البحث المطبَّعةُ (بـ«ال» كما كُتبت). الحشوُ والحرفُ المفردُ يُسقطان
 * **إن بقي غيرُهما** — فإن كانت العبارةُ كلُّها حشوًا أو حرفًا (كتابةٌ تدريجيّة:
 * «أو» في طريقها إلى «أودو») بقيت كما هي ولم تُفرَّغ القائمة.
 */
export function searchTokens(term) {
  const all = normalizeAr(term, { keepArticle: true }).split(' ').filter(Boolean);
  const meaningful = all.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return meaningful.length ? meaningful : all;
}

/** صيغُ كلمة البحث: كما كُتبت · بلا «ال» وسوابقها · بلا واو العطف («وخروج» ← «خروج»). */
function tokenVariants(token) {
  const out = new Set([token]);
  const bare = token.replace(/^(?:[وبفك]?ال|لل)(?=.)/, '');
  if (bare) out.add(bare);
  if (token.length >= 3 && token.startsWith('و')) out.add(token.slice(1));
  return [...out];
}

/** نصٌّ مهيَّأٌ للمطابقة: بصيغتَيه (بـ«ال» وبدونها) وكلماتُه. */
function haystack(text) {
  const kept = normalizeAr(text, { keepArticle: true });
  const bare = normalizeAr(text);
  return { text: `${kept} ${bare}`, words: [...new Set(`${kept} ${bare}`.split(' ').filter(Boolean))] };
}

/** 2 = كلمةٌ تبدأ بالمطلوب · 1 = ورد داخل كلمة (لصيغةٍ من حرفين فأكثر) · 0 = لا. */
function tokenLevel(hay, token) {
  let level = 0;
  for (const v of tokenVariants(token)) {
    if (hay.words.some((w) => w.startsWith(v))) return 2;
    if (v.length >= 2 && hay.text.includes(v)) level = 1;
  }
  return level;
}

/**
 * مرادفاتُ الشاشات التشغيليّة الأكثر بحثًا — الكلماتُ التي يكتبها الناسُ لا التسميةُ
 * وحدها. المفتاحُ مسارُ الشاشة، والقيمةُ كلماتٌ تُطبَّع عند المطابقة. (ما ليس هنا
 * يبقى مبحوثًا بتسميته المطبَّعة كالمعتاد — فالغيابُ لا يُخفي شاشة.)
 */
export const NAV_SEARCH_ALIASES = Object.freeze({
  '/dashboard/gate-post': 'دخول خروج تصريح إثبات بوابة أمن مركبة شاحنة زيارة حمولة طبالي عائدة حارس',
  '/dashboard/gate-log': 'دخول خروج سجل بوابة مطابقة زيارات حمولة',
  '/dashboard/cash-custody':
    'عهدة عهد تقرير تقارير كشف تسوية نقدية توزيع إقفال صرف مصروف مصروفات مشرف سلفة شركات مستفيدة إثبات',
  '/dashboard/custody': 'عهدة عهد عينية أجهزة معدات أصول',
  '/dashboard/documents': 'مستند تصريح خروج إذن صرف فاتورة سند مذكرة استلام تسليم بوابة',
  '/dashboard/forms': 'نماذج وظيفة ميداني استلام تحضير جرد',
  '/dashboard/expenses': 'مصروف مصاريف فاتورة بند تبويب',
  '/dashboard/site-needs': 'احتياجات موقع 155 أبوهادي طلب',
  '/dashboard/cash-book': 'خزينة نقد يومية صرف قبض',
  '/dashboard/supply-chain': 'أسطول عهد أوامر شغل مركبات',
  '/dashboard/reports': 'تقرير تقارير',
  '/dashboard/data-reports': 'تقرير تقارير بيانات',
  '/dashboard/odoo-reports': 'تقرير تقارير أودو بيع استلام مخزون رصيد',
});

/**
 * درجةُ مطابقة شاشةٍ لعبارة البحث — **أضعفُ كلمةٍ تحكم** (كلُّ الكلمات يجب أن تُطابَق):
 *   4 = كلمةٌ في **التسمية** تبدأ بالمطلوب · 3 = كلمةٌ في **المرادفات** تبدأ به ·
 *   2 = ورد داخل كلمةٍ في التسمية · 1 = داخل كلمةٍ في المرادفات · 0 = لا تطابق.
 * فالمرادفُ الصريح («الأمن» ← مركز البوابة) يتقدّم على ورودٍ عرَضيٍّ وسط كلمة («المز‍امن‍ة»).
 * والمطابقةُ كلمةً كلمة لا سلسلةً واحدة — فـ«تقرير العهدة» و«إثبات دخول وخروج» تُطابَقان
 * مهما كان ترتيبُ الكلمات.
 *
 * @param {{path:string,label:string}} item
 * @param {string} term عبارةُ البحث كما كُتبت
 * @returns {0|1|2|3|4}
 */
export function screenMatchScore(item, term) {
  const tokens = searchTokens(term);
  if (!tokens.length) return 0;
  const label = haystack(item?.label);
  const aliasText = NAV_SEARCH_ALIASES[item?.path];
  const alias = aliasText ? haystack(aliasText) : null;
  let score = 4;
  for (const t of tokens) {
    const inLabel = tokenLevel(label, t);
    const inAlias = alias ? tokenLevel(alias, t) : 0;
    const best = inLabel === 2 ? 4 : inAlias === 2 ? 3 : inLabel === 1 ? 2 : inAlias === 1 ? 1 : 0;
    if (!best) return 0;
    score = Math.min(score, best);
  }
  return score;
}

/** هل تطابق شاشةٌ عبارةَ البحث — بتسميتها أو مرادفاتها؟ */
export function screenMatches(item, term) {
  return screenMatchScore(item, term) > 0;
}
