/**
 * صاحبُ المرحلة ‹JR-105› — **من ينتظره هذا المستند الآن**. منطقٌ خالص.
 *
 * ═══ الفجوة التي يسدّها ═══
 * طلبُ المالك: «البوّابة تعمل بفكرة المراحل — يعني كلُّ مرحلةٍ مربوطةٌ بشخصٍ
 * ما». والرحلةُ اليوم تعرف **إلى أين** يمضي المستند (`chain.js`) و**أيَّ
 * شاشةٍ** ينفّذه (`fieldRoutes.js`) — ولا تعرف **من صاحبُه**. فالواقفُ أمام
 * مستندٍ «بانتظار الاعتماد» يسأل زميله عمّن يعتمده، والمعرفةُ الشفويّة أوّلُ
 * ما يسقط عند تبديل الورديّة.
 *
 * ═══ ★★★ والخريطةُ تُقرأ ولا تُخترع — وهذا جوهرُ الملفّ ═══
 * المعرفةُ موجودةٌ مبعثرةٌ في مواضعَ قائمة، وهذه الوحدة **تجمعها ولا تكتب
 * قائمةً رابعة**. فلو كتبنا قائمةً خامسةً لصار للمستودع خريطتا أصحابٍ
 * تفترقان بأوّل تعديلٍ في القاعدة — وهو عينُ العطب الذي يحرسه
 * `laborRoles.test.js`: «شاشةٌ تكذب على موظّف».
 *
 *   · `create` · `approve` · `complete` ← `documents/schemas/*.js` في
 *     `schema.roles` — وهي **مرآةُ `approveRoles()` و`completeRoles()` في
 *     `firestore.rules`**، يقيس تطابقَهما حرفًا حارسٌ في الاختبار المجاور.
 *     فمن غيّر القاعدةَ ونسي المخطّط يسقط بناؤه هنا، لا في يد موظّفٍ واقف.
 *   · `execute` ← **مشتقٌّ لا مسرود**: الشاشةُ التي يوجّه إليها
 *     `fieldRoutes.FIELD_ROUTES` هذا النوعَ ⟵ العمليةُ الميدانيّة التي
 *     تمثّلها ⟵ الأدوارُ التي تملكها في `lpn/lpnRoles.js` (`canDo`).
 *     فلو وُجّه نوعٌ سابعٌ إلى شاشةٍ غدًا ظهر له أصحابُه بلا تعديلٍ هنا.
 *   · الأسماءُ العربيّة ← `auth/roles.js` وحدَه. لا اسمَ مكتوبٌ بيدٍ هنا.
 *
 * ═══ ★★★ ولا تحرس شيئًا ولا تمنع أحدًا ═══
 * هذه وحدةُ **إعلام** لا صلاحيّات. الحارسُ الحقيقيُّ هو الخادم
 * (`firestore.rules`)، وهذه تقول للناظر «من صاحبُ هذه المرحلة» فقط. ولذلك
 * لا تُصدِّر دالّةَ منعٍ واحدة، ولا تُسأل «أيجوز لي؟» — تُسأل «من ينتظره؟».
 *
 * وعليه: **المجهولُ يمرّ صامتًا**. نوعٌ لا يعرفه محرّكُ المستندات يُعيد
 * سطرًا فارغًا لا رسالةَ خطأ — وهو نمطُ `uiGate` نفسُه في طبقة الطبالي:
 * «منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم».
 *
 * ═══ ⚠️ ومزلقان مكتوبان ═══
 * **الأوّل: الغيابُ يُعلَن ولا يُسكَت عنه.** مرحلةٌ بلا أصحابٍ تُعيد **سببًا
 * مكتوبًا** لا نصًّا فارغًا (`absence`) — فالفرقُ بين «قرّرنا ألّا ننسبها»
 * و«نسيناها» هو ذلك السطر. وأكثرُ الأنواع بلا `execute` لأنّها لا تُنفَّذ
 * عند الرفّ أصلًا؛ وهذا حكمٌ لا نقص.
 *
 * **والثاني: مرآةُ الشاشاتِ تنحرف صامتة.** `SCREEN_OPS` أدناه تربط مسارَ
 * الشاشة بعمليّتها الميدانيّة **بالنصّ** — فشاشةٌ خامسةٌ تُضاف في
 * `fieldRoutes.js` ولا تُذكر هنا تجعل نوعًا موجَّهًا بلا منفّذين. ولذلك
 * تُحسب `UNMAPPED_ROUTES` عند التحميل ويطالبها الاختبارُ بأن تبقى فارغة —
 * كما يقيس `fieldRoutes.test.js` مرآتَه سلوكيًّا لا نصًّا.
 *
 * ═══ ولماذا يسكن `tasks/` لا `documents/` ═══
 * لنفس علّة `fieldRoutes.js` المكتوبة في رأسه: `documents` نواةٌ محميّةٌ **لا
 * تستورد من `lpn/` أبدًا** (ح-٢)، وهذه الوحدة تستورد `lpnRoles` بالضرورة.
 * فهي جسرٌ يعرف الطرفين، وجسرٌ لا يسكن داخل النواة التي يحرسها الحارس.
 */

import { getSchema } from '../documents/schemas/index.js';
import { STATES } from '../documents/states.js';
import { ROLES } from '../auth/roles.js';
import { canDo, PORTAL_TO_FIELD } from '../lpn/lpnRoles.js';
import { FIELD_ROUTES } from './fieldRoutes.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const text = (v) => String(v ?? '').trim();

/* ═══════════════ ① المراحلُ وأسماؤها ═══════════════ */

/**
 * فعلُ كلّ مرحلةٍ كما يُقرأ في سطرٍ واحد: «يعتمده: مدير المستودع».
 *
 * ★ أفعالٌ لا أسماء: «يعتمده» تقول للواقف ما ينتظره، و«الاعتماد» تصف حقلًا
 * في جدول. والسطرُ يُقرأ في شاشةِ موظّفٍ لا في وثيقة.
 */
export const STAGE_LABELS = Object.freeze({
  create: 'يُنشئه',
  approve: 'يعتمده',
  complete: 'يُنجزه',
  execute: 'ينفّذه ميدانيًّا',
});

/**
 * ترتيبُ العرض — **ترتيبُ الرحلة لا ترتيبُ الكائن**.
 *
 * ⚠️ ومزلقٌ صغير: كائنُ `stageOwnersFor` يُعيد المفاتيح بترتيب العقد
 * (`create · approve · complete · execute`)، والرحلةُ الحقيقيّة تضع التنفيذَ
 * الميدانيَّ **قبل** الإنجاز: يُنشأ ثمّ يُعتمد ثمّ يُنفَّذ عند الرفّ ثمّ
 * يُنجَز في النظام. فمن رسم الأربعةَ صفوفًا يقرأ هذا لا `Object.keys`.
 */
export const STAGES = Object.freeze(['create', 'approve', 'execute', 'complete']);

/* ═══════════════ ② التنفيذُ الميدانيّ — مشتقٌّ من جدول الشاشات ═══════════ */

/**
 * مسارُ الشاشة ⟵ العمليةُ الميدانيّة التي تمثّلها (بمفاتيح `FIELD_OPS`).
 *
 * ⚠️ مرآةُ `fieldRoutes.js` — تُحدَّث معها، ويقيسها الاختبارُ بأن يطالب
 * `UNMAPPED_ROUTES` بالبقاء فارغة.
 */
const SCREEN_OPS = Object.freeze({
  '/dashboard/lpn-receiving': 'RECEIVE',
  '/dashboard/lpn-picking': 'PICK',
  '/dashboard/lpn-count': 'COUNT',
  '/dashboard/bin-console': 'PUTAWAY',
});

/**
 * مساراتُ الشاشات الموجَّهٌ إليها مستنداتٌ ولا عمليّةَ لها هنا.
 *
 * تُحسب عند التحميل ولا تُرمى: رميُ خطأٍ في وحدةٍ تستوردها شاشةٌ يُسقط
 * الصفحةَ كلَّها على موظّفٍ لا ذنبَ له. فتُحسب ويسقط بها **الاختبارُ** وحده.
 */
export const UNMAPPED_ROUTES = Object.freeze([
  ...new Set(
    Object.values(FIELD_ROUTES)
      .map((r) => r?.path)
      .filter((p) => p && !SCREEN_OPS[p])
  ),
]);

/** العمليةُ الميدانيّة لهذا النوع — أو `''` إن لم يُوجَّه إلى شاشة. */
function fieldOpOf(type) {
  return SCREEN_OPS[FIELD_ROUTES[type]?.path] ?? '';
}

/**
 * منفّذو هذا النوع ميدانيًّا — أدوارُ البوّابة التي تملك عمليّتَه.
 *
 * ★ المصدرُ `canDo` نفسُها التي تحكم زرَّ الشاشة، لا نسخةٌ منها. فلو تغيّرت
 * `PORTAL_TO_FIELD` غدًا تغيّر هذا السطرُ معها في اللحظة نفسِها.
 */
function executeRolesOf(type) {
  const op = fieldOpOf(type);
  if (!op) return [];
  return Object.keys(PORTAL_TO_FIELD).filter((role) => canDo(role, op));
}

/* ═══════════════ ③ الغيابُ معلَنٌ مكتوب — لا صمت ═══════════════ */

const ABSENCE = Object.freeze({
  unknownType: 'نوعٌ لا يعرفه محرّكُ المستندات — ولا يُخترع له أصحاب.',
  noField:
    'لا شاشةَ تنفيذٍ ميدانيّةً لهذا النوع — فمن يُنجزه يُنجزه في النظام لا عند الرفّ.',
  emptyStage: 'مرحلةٌ بلا أصحابٍ في مخطّط النوع — راجع `roles` في مخطّطه.',
});

/* ═══════════════ ④ قارئُ القاعدة — بيّنةُ أنّ الخريطة مقروءةٌ لا مخترَعة ═══ */

/**
 * ★★ يقرأ `approveRoles(docType)` أو `completeRoles(docType)` من **نصّ**
 * `firestore.rules` ويُعيد خريطةَ (نوع ⟵ أدوار).
 *
 * ═══ لماذا يعيش القارئُ هنا لا في الاختبار؟ ═══
 * لأنّه منطقٌ خالصٌ يُختبَر — ولو سكن الاختبارَ لَما اختُبر هو نفسُه، فلا
 * يعرف أحدٌ حين يعمى. وهو نمطُ `readGuardRoles` في `labor/laborRoles.js`
 * حرفًا: الوحدةُ تُصدّر القارئ، والاختبارُ يقرأ الملفَّ من القرص ويقارن.
 *
 * ⚠️ **ولا يأخذ مسارًا ولا يفتح ملفًّا**: النصُّ يُمرَّر إليه. فتبقى الوحدةُ
 * صالحةً للمتصفّح (لا `fs`)، والاختبارُ وحدَه يلمس القرص.
 *
 * ⚠️ **وفشلُ الاستخراج يُعلَن**: خريطةٌ فارغةٌ تُعيد `ok:false` بسببٍ مكتوب،
 * فلا يقارن الحارسُ فارغًا بفارغٍ ويمرّ وهو أعمى.
 *
 * @returns {{ok:boolean, map:Record<string,string[]>, reason:string}}
 */
export function readDocTypeRoles(rulesText, fnName) {
  const fail = (reason) => ({ ok: false, map: {}, reason });
  if (typeof rulesText !== 'string' || !rulesText) return fail('نصُّ القاعدة فارغ.');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(fnName ?? ''))) {
    return fail(`اسمُ دالّةٍ غيرُ صالح: «${fnName}».`);
  }

  // جسدُ الدالّة: من `{` إلى أوّلِ `}` يبدأ سطرًا. وسلسلةُ الشروط الثلاثيّة
  // كلُّها أسطرٌ مفردةٌ بمصفوفاتٍ مغلقةٍ في سطرها، فلا قوسَ معشَّشٌ يخدعها.
  const fn = new RegExp(
    `function\\s+${fnName}\\s*\\(\\s*docType\\s*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`
  ).exec(rulesText);
  if (!fn) return fail(`لم يُعثر على الدالّة «${fnName}(docType)» في firestore.rules.`);

  // ⚠️ التعليقاتُ تُمحى أوّلًا: بين أسطر الخريطة تعليقاتٌ عربيّةٌ طويلة، ولولا
  // محوُها لالتقط أيُّ اقتباسٍ فيها اسمَ نوعٍ أو دورٍ زائف.
  const body = fn[1].replace(/\/\/[^\n]*/g, '');

  const map = {};
  for (const m of body.matchAll(/docType\s*==\s*'([A-Z0-9_]+)'\s*\?\s*\[([^\]]*)\]/g)) {
    const roles = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]).filter(Boolean);
    if (!roles.length) return fail(`«${m[1]}» في «${fnName}» خرجت بلا أدوار — استخراجٌ فاشل.`);
    map[m[1]] = roles;
  }
  if (!Object.keys(map).length) {
    return fail(`لم يُعثر على «docType == '…' ? [...]» داخل «${fnName}» — تغيّر شكلُ القاعدة.`);
  }
  return { ok: true, map, reason: '' };
}

/* ═══════════════ ⑤ الواجهة ═══════════════ */

/**
 * الاسمُ العربيُّ لمعرّف دور — من `roles.js` وحدَه.
 *
 * ⚠️ ومعرّفٌ مجهولٌ يُعرض **كما هو** ولا يُحذف: إخفاؤه يُظهر سطرًا ناقصًا
 * لا يشكّ فيه أحد، وإظهارُه يكشف الخطأ لمن يقرأ. والحارسُ في الاختبار
 * يمنع وصولَه إلى شاشةٍ أصلًا.
 */
export function roleNames(roleIds) {
  return (Array.isArray(roleIds) ? roleIds : []).map((id) => ROLES[id]?.label ?? String(id));
}

/**
 * أصحابُ مراحل هذا النوع الأربع.
 *
 * @param {string} docType نوعُ المستند (`PUTAWAY` · `GRN` …)
 * @returns {{
 *   type: string, known: boolean,
 *   create: string[], approve: string[], complete: string[], execute: string[],
 *   labels: {create:string, approve:string, complete:string, execute:string},
 *   absence: Record<string,string>
 * }}
 */
export function stageOwnersFor(docType) {
  const type = up(docType);
  const schema = getSchema(type);
  const roles = schema?.roles ?? {};

  // نسخٌ لا إحالة: الشاشةُ قد ترتّب أو تُثري ما تعرضه، ولا تُفسد المخطّط.
  const owners = {
    type,
    known: Boolean(schema),
    create: [...(roles.create ?? [])],
    approve: [...(roles.approve ?? [])],
    complete: [...(roles.complete ?? [])],
    execute: schema ? executeRolesOf(type) : [],
    labels: { ...STAGE_LABELS },
    absence: {},
  };

  for (const stage of STAGES) {
    if (owners[stage].length) continue;
    owners.absence[stage] = !schema
      ? ABSENCE.unknownType
      : stage === 'execute'
        ? ABSENCE.noField
        : ABSENCE.emptyStage;
  }
  return owners;
}

/**
 * سطرٌ عربيٌّ جاهزٌ للعرض: «يعتمده: مدير المستودع · مدقّق الجرد».
 *
 * ومرحلةٌ بلا أصحابٍ تُعيد **سببَ غيابها** لا فراغًا — إلّا نوعًا مجهولًا
 * فيمرّ صامتًا: لا نكتب في شاشةِ موظّفٍ رسالةً عن نوعٍ لا نعرفه.
 */
export function stageOwnerLine(docType, stage) {
  const owners = stageOwnersFor(docType);
  if (!owners.known) return '';
  if (!Object.hasOwn(STAGE_LABELS, stage)) return '';
  const ids = owners[stage];
  if (!ids.length) return owners.absence[stage] ?? '';
  return `${STAGE_LABELS[stage]}: ${roleNames(ids).join(' · ')}`;
}

/**
 * الحالةُ ⟵ المرحلةُ التي ينتظرها المستند فيها.
 *
 * `rejected` مع `draft`: القاعدةُ على الخادم تُخرج الاثنتين إلى `submitted`
 * بيد المُنشئ وحدَه — فالمردودُ ينتظر صاحبَه كالمسوّدة سواء.
 *
 * و`approved` تنتظر **المنفّذين الميدانيّين** لا المُنجزين: هناك يقع العمل.
 * فإن لم تكن للنوع شاشةٌ ميدانيّةٌ سقط الجوابُ إلى `complete` — وهو ما
 * تفعله القاعدةُ نفسُها (`approved → done` بيد `completeRoles`).
 *
 * و`closed` و`canceled` لا تنتظران أحدًا: هما الحالتان المنتهيتان
 * (`TERMINAL_STATES`) — ومستندٌ يقول «ينتظر فلانًا» وهو مغلقٌ يكذب.
 */
const STATE_STAGE = Object.freeze({
  draft: 'create',
  rejected: 'create',
  submitted: 'approve',
  approved: 'execute',
  done: 'complete',
  closed: '',
  canceled: '',
});

/** صدرُ السطر لكلّ حالة — يقول **الفعلَ المنتظَر** لا اسمَ المرحلة. */
const WAITING_PREFIX = Object.freeze({
  draft: 'ينتظر إرساله للاعتماد من',
  rejected: 'رُدَّ إلى صاحبه',
  submitted: 'ينتظر اعتماد',
  approved: 'ينتظر تنفيذه ميدانيًّا',
  done: 'ينتظر إغلاقه',
});

/** وصدرٌ بديلٌ للمعتمَد الذي لا شاشةَ ميدانيّةَ له: ينتظر إنجازَه في النظام. */
const APPROVED_NO_FIELD_PREFIX = 'ينتظر إنجازه';

/**
 * ★★★ **من ينتظره هذا المستند الآن** — وهذا أنفعُ ما تُخرجه الوحدة.
 *
 * @param {{type?:string, state?:string, createdByName?:string}|null|undefined} doc
 * @returns {{
 *   type:string, state:string, known:boolean, waiting:boolean,
 *   stage:string, roles:string[], names:string[], person:string, line:string
 * }}
 */
export function nextOwnerOf(doc) {
  const type = up(doc?.type);
  const state = text(doc?.state);
  const owners = stageOwnersFor(type);
  const blank = {
    type,
    state,
    known: false,
    waiting: false,
    stage: '',
    roles: [],
    names: [],
    person: '',
    line: '',
  };

  // نوعٌ أو حالةٌ لا نعرفها: نمرّ صامتين. ولا نقول «لا ينتظر أحدًا» — فذلك
  // خبرٌ نجهله، والجهلُ يُسكَت عنه ولا يُقال خبرًا.
  if (!owners.known) return blank;
  if (!Object.hasOwn(STATE_STAGE, state)) return blank;

  const terminal = STATE_STAGE[state] === '';
  if (terminal) {
    // ★ واسمُ الحالة من `states.js` لا مكتوبًا هنا — فلو تغيّر تغيّر معه.
    return { ...blank, known: true, line: `${STATES[state]?.label ?? state} — لا ينتظر أحدًا.` };
  }

  // المعتمَدُ بلا شاشةٍ ميدانيّة يسقط إلى مرحلة الإنجاز — بنصّ القاعدة.
  let stage = STATE_STAGE[state];
  let prefix = WAITING_PREFIX[state];
  if (stage === 'execute' && !owners.execute.length) {
    stage = 'complete';
    prefix = APPROVED_NO_FIELD_PREFIX;
  }

  // المسوّدةُ تنتظر **شخصًا بعينه** إن عرفناه: من كتبها. ولا نسمّي غيرَه
  // في مرحلةٍ صاحبُها واحد — سردُ أدواره يوهم أنّ أيَّهم يُرسلها، والقاعدة
  // تقصرها على `isCreator()` وحدَه.
  const person = stage === 'create' ? text(doc?.createdByName) : '';
  const roles = owners[stage];
  const names = roleNames(roles);
  const who = person || names.join(' · ');

  return {
    type,
    state,
    known: true,
    waiting: Boolean(who),
    stage,
    roles: [...roles],
    names,
    person,
    line: who ? `${prefix}: ${who}` : (owners.absence[stage] ?? ''),
  };
}
