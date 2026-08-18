/**
 * غرس شجرة القطاع ‹FNB-101› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * سيّد المواقع التنظيميّة (`orgLocations.js`) مبنيٌّ ومحروسٌ منذ م٦-أ بمستوياته
 * الأربعة `sector › brand › branch › cost_center` — **ووعاؤه فارغ**: لا سجلَّ
 * واحدًا لقطاعٍ ولا لبراندٍ ولا لفرع. والشاشة القائمة تُدخل موقعًا **واحدًا**
 * في كلّ مرّة؛ وقطاعٌ يستهدف عشرين إلى ثلاثين مطعمًا ومفهومًا لا يُغرَس صفًّا
 * صفًّا بيد.
 *
 * ═══ العقد الحاكم: لا حفظَ جزئيّ صامت ═══
 * الشجرة **تُقبل كاملةً أو تُرفض كاملةً**. ولهذا سببٌ بنيويّ لا تجميليّ: صحّة
 * الموقع لا تُعرف من الموقع وحده بل من الشجرة — فرعٌ سليمٌ منفردًا يصير فاسدًا
 * إن كان أبوه صفًّا رُفض قبله. ومن كتب النصف ثمّ توقّف ترك شجرةً نصفها أيتام،
 * وحمّل التكلفة على «غير مربوط» وهو يظنّها موصولة.
 *
 * فكلّ صفٍّ يُفحص وحده (شكلًا)، ثمّ **تُفحص الشجرة المدموجة كلّها**
 * (`locationProblems` نفسها التي يستعملها الحفظ المفرد — لا حارسَ ثانٍ يتباعد
 * عن الأوّل)، ولا تُسلَّم صفوفٌ للكتابة إلّا إن سلم الاثنان.
 *
 * ═══ والبذرة تُوسَم ═══
 * حتّى تصل شجرة المالك الحقيقيّة (القرار ق-O01) تُغرَس بذرةٌ تجريبيّة موسومة
 * `seed:true` تُشغّل الدورة كاملةً — ويكشفها حارسٌ حين تختلط ببيانات الإنتاج،
 * فلا تُقرأ أرقامُ تجربةٍ يومًا على أنّها أرقام عمل.
 */
import { ORG_LEVELS, LEVEL_IDS, levelOf, indexLocations, locationProblems } from './orgLocations.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/* ═══════════════ ١. قراءة الصفّ ═══════════════ */

/**
 * مرادفات المستوى — الشيت يكتبه بالعربيّة أو بالإنجليزيّة أو برمزه.
 * مبنيّةٌ من `ORG_LEVELS` نفسها فلا تفترق قائمتان.
 */
export const LEVEL_ALIASES = Object.freeze(
  ORG_LEVELS.reduce(
    (map, l) => {
      map[l.id] = l.id;
      map[l.labelAr] = l.id;
      map[l.id.replace('_', ' ')] = l.id;
      return map;
    },
    {
      'قطاع': 'sector', 'القطاع': 'sector',
      'براند': 'brand', 'البراند': 'brand', 'علامة': 'brand', 'علامة تجارية': 'brand',
      'فرع': 'branch', 'الفرع': 'branch', 'مطعم': 'branch', outlet: 'branch',
      'مركز تكلفة': 'cost_center', 'مركز التكلفة': 'cost_center', costcenter: 'cost_center', 'cost center': 'cost_center',
    }
  )
);

/** مستوًى من نصٍّ حرّ، أو '' إن لم يُعرف. */
export function resolveLevel(raw) {
  const key = str(raw).toLowerCase();
  if (!key) return '';
  const hit = LEVEL_ALIASES[key] || LEVEL_ALIASES[str(raw)];
  return LEVEL_IDS.includes(hit) ? hit : '';
}

/** «معطّل»/«لا»/`false` تُطفئ الموقع؛ وما عداها يبقى نشطًا (الافتراض عملٌ لا تعطيل). */
function resolveActive(raw) {
  if (raw === undefined || raw === null || str(raw) === '') return true;
  const key = str(raw).toLowerCase();
  return !['معطل', 'معطّل', 'غير نشط', 'موقوف', 'لا', 'no', 'false', 'inactive', 'disabled', '0'].includes(key);
}

/**
 * صفٌّ واحد ← موقعًا مُسوّى، أو سببَ رفضٍ مقروءًا.
 * الفحص هنا **شكليّ فقط**؛ وصحّة الأبوّة لا تُعرف إلّا بالشجرة (المرحلة ٢).
 * @returns {{location:object|null, problem:string}}
 */
export function readOrgRow(row) {
  const code = up(row?.code);
  if (!code) return { location: null, problem: 'بلا رمز — والرمز هويّةٌ لا وصف.' };
  if (/\s/.test(code)) return { location: null, problem: `الرمز «${code}» فيه فراغ — الرمز يُكتب متّصلًا.` };

  const nameAr = str(row?.nameAr);
  if (!nameAr) return { location: null, problem: `${code}: بلا اسمٍ عربيّ.` };

  const level = resolveLevel(row?.level);
  if (!level) {
    return {
      location: null,
      problem: `${code}: مستوًى غير معروف «${str(row?.level) || '—'}» — المسموح: ${ORG_LEVELS.map((l) => l.labelAr).join(' · ')}.`,
    };
  }

  const expectsParent = Boolean(levelOf(level)?.parentOf);
  const parentCode = up(row?.parentCode);
  if (expectsParent && !parentCode) {
    return { location: null, problem: `${code}: ${levelOf(level).labelAr} بلا أب — وأبوه يجب أن يكون ${levelOf(levelOf(level).parentOf).labelAr}.` };
  }
  if (!expectsParent && parentCode) {
    return { location: null, problem: `${code}: قطاعٌ له أب «${parentCode}» — والقطاع جذر.` };
  }

  const location = {
    code,
    nameAr,
    level,
    parentCode: expectsParent ? parentCode : '',
    active: resolveActive(row?.active),
  };
  // حقولٌ اختياريّة تُحفظ حين تُكتب ولا تُختلق حين تُترك — ومنها المدينة:
  // صفةُ الفرع التي يقرؤها التجميع حسب المدينة (FNB-304)، لا حقلٌ على المستند (ق‑ت٤).
  for (const [key, raw] of [['nameEn', row?.nameEn], ['city', row?.city], ['notes', row?.notes]]) {
    if (str(raw)) location[key] = str(raw);
  }
  if (row?.seed === true) location.seed = true;
  return { location, problem: '' };
}

/* ═══════════════ ٢. خطّة الغرس ═══════════════ */

/**
 * يبني **خطّة استيرادٍ كاملة** من صفوفٍ خام، ويحكم عليها بالقبول أو الرفض.
 *
 * ثلاث مراحل بترتيبها المقصود:
 *   ① كلّ صفٍّ يُقرأ وحده — سببُ رفضٍ لكلّ صفٍّ مرفوض برقم سطره.
 *   ② التكرار **داخل الدفعة** يُكشف قبل الدمج — وإلّا ظهر خطأً غامضًا في الشجرة.
 *   ③ الشجرة المدموجة (القائم + الوارد) تُفحص بـ`locationProblems` نفسها.
 *
 * والمدموجة تُبنى بـ**الاستبدال لا بالإلحاق**: صفٌّ برمزٍ قائم **تحديثٌ** له
 * لا تكرار — وإلّا رفض الحارس كلَّ استيرادٍ ثانٍ لشجرةٍ لم تتغيّر.
 *
 * @param {object[]} rows صفوفٌ خام (من شيتٍ أو بذرة)
 * @param {object[]} existing المواقع القائمة في القاعدة
 * @returns {{ok:boolean, rows:object[], problems:string[], toWrite:object[], counts:object}}
 */
export function planOrgImport(rows = [], existing = []) {
  const read = [];
  const problems = [];

  // ① الصفوف وحدها.
  (Array.isArray(rows) ? rows : []).forEach((raw, i) => {
    const line = i + 1;
    const { location, problem } = readOrgRow(raw);
    if (problem) {
      read.push({ line, code: up(raw?.code), verdict: 'reject', problem });
      problems.push(`سطر ${line}: ${problem}`);
    } else {
      read.push({ line, code: location.code, verdict: '', location });
    }
  });

  // ② التكرار داخل الدفعة.
  const seen = new Map();
  for (const r of read) {
    if (r.verdict === 'reject') continue;
    if (seen.has(r.code)) {
      r.verdict = 'reject';
      r.problem = `الرمز «${r.code}» مكرّرٌ في الدفعة (ورد في السطر ${seen.get(r.code)}) — والرمز هويّةٌ لا تتكرّر.`;
      problems.push(`سطر ${r.line}: ${r.problem}`);
    } else {
      seen.set(r.code, r.line);
    }
  }

  const incoming = read.filter((r) => r.verdict !== 'reject').map((r) => r.location);

  // ③ الشجرة المدموجة — بالاستبدال لا بالإلحاق.
  const incomingCodes = new Set(incoming.map((l) => l.code));
  const kept = (Array.isArray(existing) ? existing : []).filter((l) => !incomingCodes.has(up(l?.code)));
  const merged = [...kept, ...incoming];
  const treeProblems = incoming.length ? locationProblems(merged) : [];
  problems.push(...treeProblems);

  // وسمُ الجديد من المحدَّث — للعرض قبل الكتابة، فيرى المستخدم ما سيقع.
  const existingIndex = indexLocations(existing);
  for (const r of read) {
    if (r.verdict === 'reject') continue;
    r.verdict = existingIndex.has(r.code) ? 'update' : 'new';
  }

  const ok = problems.length === 0 && incoming.length > 0;
  return {
    ok,
    rows: read,
    problems,
    // ★ العقد: لا صفَّ يُسلَّم للكتابة ما لم تسلم الشجرة كلّها.
    toWrite: ok ? incoming : [],
    counts: {
      read: read.length,
      accepted: incoming.length,
      rejected: read.filter((r) => r.verdict === 'reject').length,
      created: read.filter((r) => r.verdict === 'new').length,
      updated: read.filter((r) => r.verdict === 'update').length,
      treeProblems: treeProblems.length,
    },
  };
}

/* ═══════════════ ٣. البذرة التجريبيّة ═══════════════ */

/**
 * شجرةٌ صغيرة تُشغّل الدورة كاملةً حتّى تصل شجرة المالك (ق-O01):
 * قطاعٌ واحد جذرًا، وبراندان تحته، وثلاثة فروع — بمدنٍ حقيقيّة فيعمل
 * التجميع حسب المدينة (FNB-304) على بياناتٍ لها معنى.
 *
 * الرموز مسبوقةٌ بـ`DEMO-` وموسومةٌ `seed:true` معًا: البادئة تُرى بالعين في
 * كلّ تقرير، والوسم يُقرأ بالكود. ومن اكتفى بأحدهما فقد الآخر.
 */
export const SEED_PREFIX = 'DEMO-';

export function sectorSeed() {
  const seed = (code, nameAr, level, parentCode, extra = {}) => ({
    code: `${SEED_PREFIX}${code}`,
    nameAr,
    level,
    parentCode: parentCode ? `${SEED_PREFIX}${parentCode}` : '',
    active: true,
    seed: true,
    ...extra,
  });
  return [
    seed('FNB', 'قطاع الأغذية والمشروبات (بذرة تجريبيّة)', 'sector', '', { nameEn: 'F&B' }),
    seed('BRD1', 'براند تجريبيّ ١ — مطاعم', 'brand', 'FNB'),
    seed('BRD2', 'براند تجريبيّ ٢ — مقاهٍ', 'brand', 'FNB'),
    seed('BR01', 'فرع تجريبيّ ٠١', 'branch', 'BRD1', { city: 'بنغازي' }),
    seed('BR02', 'فرع تجريبيّ ٠٢', 'branch', 'BRD1', { city: 'طرابلس' }),
    seed('BR03', 'فرع تجريبيّ ٠٣', 'branch', 'BRD2', { city: 'بنغازي' }),
  ];
}

/** أبذرةٌ هذا الموقع؟ الوسم أوّلًا، والبادئة شاهدًا ثانيًا. */
export function isSeedLocation(location) {
  return location?.seed === true || up(location?.code).startsWith(SEED_PREFIX);
}

/**
 * حارس الاختلاط — **الغرض الحقيقيّ من الوسم**.
 *
 * بذرةٌ وحدها لا بأس بها (تجربة)، وبيانات إنتاجٍ وحدها هي المقصد. أمّا
 * اختلاطهما فيجعل «كم استهلك القطاع؟» جوابًا نصفه تجربة — ولا يُعلَن ذلك
 * لأحد. فيُنبَّه، ولا يُمنع: البذرة تُطفأ على مهلٍ بعد وصول شجرة المالك.
 */
export function seedWarnings(locations = []) {
  const live = (Array.isArray(locations) ? locations : []).filter((l) => l?.active !== false);
  const seeds = live.filter(isSeedLocation);
  const real = live.filter((l) => !isSeedLocation(l));
  if (!seeds.length || !real.length) return [];
  return [
    `الشجرة تخلط ${seeds.length} موقعَ بذرةٍ تجريبيّة بـ${real.length} موقعَ إنتاج — ` +
      'أطفئ البذرة (تعطيلٌ لا حذف) قبل قراءة أيّ رقمٍ مجمَّع على القطاع.',
  ];
}

/* ═══════════════ ٤. قالب التعبئة ═══════════════ */

/** بادئة الرمز المقترحة لكلّ مستوى — الشاشة تولّدها، والقالب يقولها فيتوافقان. */
const TEMPLATE_CODE_HINT = Object.freeze({ sector: 'SEC01', brand: 'BRD01', branch: 'BR01', cost_center: 'CC01' });

/**
 * قالب استيراد الشجرة ‹FNB-101› — **ورقةٌ تُملأ وورقةٌ تشرح**.
 *
 * الشيت كان يُطلب من المستخدم بلا أن يُعطى شكله: خمسة أعمدةٍ مذكورةٍ في سطرٍ
 * تحت الزرّ، فيبنيه كلٌّ على فهمه ثمّ يُرفض كاملًا (والشجرة تُقبل كاملةً أو
 * تُرفض كاملةً) — فيظنّ العطب في النظام وهو في العنوان.
 *
 * والمحتوى هنا **مشتقٌّ من `ORG_LEVELS` نفسها** لا مكتوبًا بيد: أسماءُ
 * المستويات المسموحة وقاعدةُ الأبوّة تُبنيان من النموذج، فلو زيد مستوًى تبعه
 * القالب بلا أن يتذكّره أحد. والمثال يمرّ بـ`planOrgImport` في الاختبار —
 * فلا نُسلّم مثالًا يرفضه حارسنا.
 *
 * @returns {{title:string, rules:[string,string][], exampleTitle:string, example:object[]}}
 */
export function orgTemplateGuide() {
  const levelNames = ORG_LEVELS.map((l) => l.labelAr).join(' · ');
  const parentRule = ORG_LEVELS.filter((l) => l.parentOf)
    .map((l) => `${l.labelAr}ٌ أبوه ${levelOf(l.parentOf).labelAr}`)
    .join('، و');
  const prefixHint = ORG_LEVELS.map((l) => `${TEMPLATE_CODE_HINT[l.id]} لـ${l.labelAr}`).join(' · ');

  return {
    title: 'قالب استيراد الشجرة التنظيميّة — املأ الورقة الأولى «الشجرة» ثمّ ارفعها من الشاشة.',
    rules: [
      ['العمودان الإلزاميّان', 'الرمز والاسم العربيّ والمستوى. وما عداها اختياريّ: يُحفظ إن كُتب ولا يُختلق إن تُرك.'],
      ['المستوى', `اكتب واحدةً من: ${levelNames}. (الإنجليزيّة مقبولة كذلك: sector · brand · branch · cost center.)`],
      ['رمز الأب', `${ORG_LEVELS[0].labelAr}ٌ جذرٌ يُترك أبوه فارغًا. و${parentRule}.`],
      ['الترتيب', 'لا يلزم ترتيب الصفوف؛ لكنّ رمز الأب يجب أن يكون في هذا الملفّ نفسه أو محفوظًا في النظام من قبل.'],
      ['الرمز', `هويّةٌ لا وصف: لا يتكرّر، ولا فراغ داخله، ولا يُغيَّر بعد أوّل حركة. والمقترَح أن يوافق ما تولّده الشاشة — ${prefixHint}.`],
      ['الحالة', 'اتركها فارغةً فالافتراض «نشط»؛ واكتب «معطّل» لموقعٍ قائمٍ يُراد إيقافه (ولا حذفَ في النظام).'],
      ['المدينة', 'صفةُ الفرع التي يقرؤها التجميع حسب المدينة — تُكتب على الفروع وحدها.'],
      ['القبول', 'الشجرة تُقبل كاملةً أو تُرفض كاملةً. والشاشة تعرض معاينةً قبل الكتابة: كم جديدًا وكم تحديثًا وكم مرفوضًا، وسببَ كلّ رفضٍ برقم سطره.'],
    ],
    exampleTitle: 'مثالٌ عاملٌ — انسخه إلى ورقة «الشجرة» بعد أن تُبدّل أسماءه ورموزه:',
    example: [
      { code: 'SEC01', nameAr: 'قطاع الأغذية والمشروبات', level: 'قطاع', parentCode: '', nameEn: 'F&B' },
      { code: 'BRD01', nameAr: 'براند الواحة', level: 'براند', parentCode: 'SEC01' },
      { code: 'BR01', nameAr: 'فرع بنغازي — دبي ستريت', level: 'فرع', parentCode: 'BRD01', city: 'بنغازي' },
      { code: 'BR02', nameAr: 'فرع طرابلس — قرقارش', level: 'فرع', parentCode: 'BRD01', city: 'طرابلس' },
      { code: 'CC01', nameAr: 'صيانة فرع بنغازي', level: 'مركز تكلفة', parentCode: 'BR01' },
    ],
  };
}

