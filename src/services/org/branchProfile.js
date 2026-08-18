/**
 * ملفّ الفرع التشغيليّ ‹FNB-201› — `Restaurant Supply Profile` — منطق خالص.
 *
 * ═══ ما العطب الذي يسدّه ═══
 * الفرع في النظام اليوم **رمزٌ واسمٌ وأبٌ** ولا شيء غير ذلك. وخطة القطاع
 * تطلب لكلّ فرعٍ ملفًّا بخمسة عشر حقلًا يُبنى عليه كلّ ما بعده: شدّةُ
 * الافتتاح تُولَّد منه (FNB-204)، والكمّيّة المقترحة تُحسب بأيّامه وسياسته
 * (FNB-301)، والمنيو المعتمد يُفجَّر بوصفاته (FNB-702).
 *
 * ═══ ثلاث قواعد تحكم ما هنا ═══
 *
 * ١. **الملفّ صفةٌ على صفّ الفرع لا مجموعةٌ ثانية.** الفرع كائنٌ واحد في
 *    `org_locations`؛ ومن خزّن ملفَّه في مجموعةٍ مستقلّة صنع للفرع سجلَّين
 *    يفترقان أوّلَ إعادة تسمية.
 *
 * ٢. **ما يُشتقّ لا يُخزَّن.** البراند والقطاع من الشجرة (`dimensionsOf`)،
 *    وأنواع التخزين من سيّد المواقع (`facilityModel`/`locationsModel`) —
 *    فحقلٌ يدويّ بجانب مصدرٍ حيّ يفترق عنه أوّل تعديل.
 *
 * ٣. **الملفّ يُغني ولا يُعطّل.** فرعٌ بلا ملفٍّ يعمل كما يعمل اليوم — نفس
 *    عقد «السيّد اختياريّ» في سيّد المواقع. والنقص يُعلَن ولا يمنع.
 */
import { levelOf } from './orgLocations.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const day = (v) => str(v).slice(0, 10);

/* ═══════════════ ١. المفاهيم التشغيليّة الستّة ═══════════════ */

/**
 * أنواع النشاط كما نصّ عليها المستند حرفيًّا (سطر 22): «المطاعم الراقية وشبه
 * الراقية والمطاعم العادية والـQSR والمقاهي والمخابز **وغيرها**».
 *
 * قائمةٌ محكومة **قابلة للتوسّع بالبيانات لا بالكود**: `other` بابٌ معلَن
 * يحمل وصفًا حرًّا، فلا يُرفض مفهومٌ جديد ولا يُفتح الحقل نصًّا حرًّا فتضيع
 * المقارنة بين الفروع.
 *
 * ⚠️ ليست `outletType` في `vsi.js`: تلك أنواع **زبائن خارجيّين** (بقالة ·
 * سوبرماركت · صيدليّة)، وهذه مفاهيمُ فروعنا. دمجُهما يخلط عميلًا بفرع.
 */
export const CONCEPT_TYPES = Object.freeze({
  fine_dining: { id: 'fine_dining', labelAr: 'مطعم راقٍ', labelEn: 'Fine Dining' },
  casual_dining: { id: 'casual_dining', labelAr: 'مطعم شبه راقٍ', labelEn: 'Casual Dining' },
  standard: { id: 'standard', labelAr: 'مطعم عاديّ', labelEn: 'Standard Restaurant' },
  qsr: { id: 'qsr', labelAr: 'خدمة سريعة (QSR)', labelEn: 'QSR' },
  cafe: { id: 'cafe', labelAr: 'مقهى', labelEn: 'Café' },
  bakery: { id: 'bakery', labelAr: 'مخبز', labelEn: 'Bakery' },
  other: { id: 'other', labelAr: 'مفهومٌ آخر', labelEn: 'Other' },
});

const CONCEPT_ALIASES = {
  fine_dining: ['fine', 'fine dining', 'راقي', 'راقٍ', 'مطعم راقي', 'فاخر'],
  casual_dining: ['casual', 'casual dining', 'شبه راقي', 'شبه راقٍ', 'عائلي'],
  standard: ['standard', 'restaurant', 'عادي', 'عاديّ', 'مطعم', 'مطعم عادي'],
  qsr: ['qsr', 'quick service', 'fast food', 'سريع', 'خدمة سريعة', 'وجبات سريعة'],
  cafe: ['cafe', 'café', 'coffee', 'مقهى', 'كافيه', 'قهوة'],
  bakery: ['bakery', 'مخبز', 'مخبزة', 'أفران', 'حلويات'],
};

/** يحوّل نوع نشاطٍ مكتوبًا بأيّ صيغة إلى معرّفه، أو `''` إن لم يُعرف. */
export function normalizeConcept(raw) {
  const s = str(raw).toLowerCase();
  if (!s) return '';
  if (CONCEPT_TYPES[s]) return s;
  for (const [id, aliases] of Object.entries(CONCEPT_ALIASES)) {
    if (aliases.includes(s)) return id;
  }
  return '';
}

/* ═══════════════ ٢. حالة الفرع ═══════════════ */

/**
 * حالتا الفرع (سطر 112): «بعد افتتاح الفرع يتحوّل من شدّة الافتتاح إلى **نظام
 * إعادة تغذية مستمرّ**» — **انتقالُ حالةٍ لا مستندَين منفصلين**.
 * الانتقال نفسه (بحدثٍ مسجَّل) في FNB-204؛ وهنا تعريفه ومعناه.
 */
export const BRANCH_STATES = Object.freeze({
  planned: { id: 'planned', labelAr: 'قيد التجهيز', replenishes: false, hint: 'قبل الافتتاح — تُجهَّز شدّته' },
  opening: { id: 'opening', labelAr: 'افتتاح', replenishes: false, hint: 'يُخدَم بشدّة الافتتاح لا بالمقترح' },
  operating: { id: 'operating', labelAr: 'تشغيل مستمرّ', replenishes: true, hint: 'إعادة تغذيةٍ بالكمّيّة المقترحة' },
  suspended: { id: 'suspended', labelAr: 'موقوف', replenishes: false, hint: 'لا يُقترح له ولا يُخدَم' },
});

export const DEFAULT_BRANCH_STATE = 'planned';

/** أيُقترح لهذا الفرع تزويدٌ دوريّ؟ — عليه يتوقّف محرّك الاقتراح (FNB-301). */
export function replenishes(state) {
  return Boolean(BRANCH_STATES[state]?.replenishes);
}

/* ═══════════════ ٣. تسوية الملفّ ═══════════════ */

/** أيّام الأسبوع لتقويم التوريد — الأحد أوّلها كما التقويم المحلّيّ. */
export const WEEK_DAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export const WEEK_DAY_LABELS = Object.freeze({
  sun: 'الأحد', mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء',
  thu: 'الخميس', fri: 'الجمعة', sat: 'السبت',
});

/**
 * يُسوّي ملفّ فرعٍ خامًا إلى شكله المخزَّن **على صفّ الفرع**.
 *
 * الحقول الثلاثة الأخيرة من الخمسة عشر (Par Level · الأصناف المعتمَدة ·
 * مسار التوريد) **ليست هنا عمدًا**: هي سياسةُ صنفٍ لا صفةَ فرع — تُبنى في
 * FNB-202 وFNB-203 ويقرؤها الملفّ ولا يخزّنها.
 */
export function shapeBranchProfile(raw) {
  const supplyDays = WEEK_DAYS.filter((d) => Boolean(raw?.supplyDays?.[d] ?? raw?.supplyDays?.includes?.(d)));
  return {
    // ① الهويّة والموقع — الاسم والرمز من صفّ الفرع نفسه، والمدينة صفتُه.
    city: str(raw?.city),
    address: str(raw?.address),
    // ② نوع النشاط — قائمةٌ محكومة، و«آخر» يحمل وصفَه.
    concept: normalizeConcept(raw?.concept) || (str(raw?.concept) ? 'other' : ''),
    conceptNote: normalizeConcept(raw?.concept) ? str(raw?.conceptNote) : str(raw?.conceptNote || raw?.concept),
    // ③ تاريخ الافتتاح وحالة الفرع.
    openingDate: day(raw?.openingDate),
    state: BRANCH_STATES[raw?.state] ? raw.state : DEFAULT_BRANCH_STATE,
    // ④ المنيو المعتمد — أكواد أصناف بيعٍ يحرسها `approvedMenuProblems`.
    menuSkus: [...new Set((Array.isArray(raw?.menuSkus) ? raw.menuSkus : []).map(up).filter(Boolean))],
    // ⑤ الطاقة التشغيليّة وحجم المبيعات المتوقّع — مدخلا القطاع (سطرا 83 و85).
    seats: num(raw?.seats),
    coversPerDay: num(raw?.coversPerDay),
    expectedDailySales: num(raw?.expectedDailySales),
    // ⑥ السعة التخزينيّة — مقاييس سيّد المواقع نفسها، لا مقياسٌ مخترَع.
    storageCapacity: {
      cartons: num(raw?.storageCapacity?.cartons),
      weightKg: num(raw?.storageCapacity?.weightKg),
      volumeM3: num(raw?.storageCapacity?.volumeM3),
    },
    // ⑦ أيّام التوريد — تقويمٌ أسبوعيّ يقرؤه المقترح (FNB-301).
    supplyDays,
    leadDays: num(raw?.leadDays),
    notes: str(raw?.notes),
  };
}

/** أللفرع ملفٌّ أصلًا؟ — الغياب ليس عطبًا، والملفّ يُغني ولا يُعطّل. */
export function hasProfile(location) {
  const p = location?.profile;
  return Boolean(p && (str(p.concept) || str(p.openingDate) || (p.menuSkus || []).length));
}

/* ═══════════════ ٤. الاكتمال والحكم ═══════════════ */

/** الحقول التي تُعدّ الملفَّ مكتملًا، بأسمائها المعروضة. */
const REQUIRED_FIELDS = Object.freeze([
  { key: 'concept', labelAr: 'نوع النشاط' },
  { key: 'openingDate', labelAr: 'تاريخ الافتتاح' },
  { key: 'city', labelAr: 'المدينة' },
  { key: 'coversPerDay', labelAr: 'الطاقة التشغيليّة المتوقّعة' },
  { key: 'expectedDailySales', labelAr: 'حجم المبيعات المتوقّع' },
  { key: 'menuSkus', labelAr: 'المنيو المعتمد' },
  { key: 'supplyDays', labelAr: 'أيّام التوريد' },
]);

const filled = (profile, key) => {
  const v = profile?.[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v > 0;
  return Boolean(str(v));
};

/**
 * ما ينقص الملفَّ — **يُعلَن ولا يمنع**. وهذه الرسائل هي ما يمنع شدّة افتتاحٍ
 * صامتة: فرعٌ بلا طاقةٍ ولا منيو لا تُولَّد له شدّةٌ من فراغ (FNB-204).
 */
export function profileGaps(location) {
  const p = location?.profile;
  if (!p) return ['لا ملفّ تشغيليّ لهذا الفرع — تُبنى عليه شدّة الافتتاح والكمّيّة المقترحة.'];
  return REQUIRED_FIELDS.filter((f) => !filled(p, f.key)).map((f) => `ينقص الملفّ: ${f.labelAr}.`);
}

/** نسبة اكتمال الملفّ — للعرض وترتيب ما يحتاج إكمالًا. */
export function profileCompleteness(location) {
  const p = location?.profile;
  if (!p) return 0;
  const done = REQUIRED_FIELDS.filter((f) => filled(p, f.key)).length;
  return Math.round((done / REQUIRED_FIELDS.length) * 100);
}

/**
 * أعطابٌ تمنع الحفظ — قليلةٌ عمدًا: الملفّ يُبنى على مراحل، والمنعُ لما
 * **يكذب** لا لما ينقص.
 */
export function profileProblems(location) {
  const out = [];
  if (location && location.level !== 'branch') {
    out.push(`الملفّ التشغيليّ للفروع وحدها — و«${up(location.code)}» ${levelOf(location.level)?.labelAr || location.level}.`);
  }
  const p = location?.profile;
  if (!p) return out;
  if (str(p.openingDate) && !/^\d{4}-\d{2}-\d{2}$/.test(p.openingDate)) {
    out.push('تاريخ الافتتاح بصيغةٍ غير مقروءة — الصيغة YYYY-MM-DD.');
  }
  if (p.state === 'operating' && !str(p.openingDate)) {
    out.push('فرعٌ في «تشغيل مستمرّ» بلا تاريخ افتتاح — الحالة تسبق واقعَها.');
  }
  for (const [key, value] of Object.entries({ seats: p.seats, coversPerDay: p.coversPerDay, expectedDailySales: p.expectedDailySales })) {
    if (num(value) < 0) out.push(`القيمة «${key}» سالبة — الطاقة والمبيعات موجبتان أو لا تُكتبان.`);
  }
  return out;
}

/**
 * قدرات التخزين المتاحة للفرع **مقروءةً من سيّد المواقع** لا من الملفّ
 * (القاعدة ٢: ما يُشتقّ لا يُخزَّن). تُجيب: أللفرع تبريدٌ وتجميدٌ وجافّ؟
 *
 * @param {string} branchCode رمز الفرع (وهو مستودعه في ترميز المواقع)
 * @param {object[]} locations مواقع التخزين
 * @returns {{chilled:boolean, frozen:boolean, ambient:boolean, zones:number}}
 */
export function storageAbilities(branchCode, locations = []) {
  const wh = up(branchCode);
  const mine = (Array.isArray(locations) ? locations : []).filter(
    (l) => up(l?.warehouse) === wh || up(l?.code).startsWith(`${wh}-`)
  );
  const types = new Set(mine.map((l) => str(l?.storageType) || 'ambient'));
  return {
    chilled: types.has('chilled'),
    frozen: types.has('frozen'),
    ambient: types.has('ambient'),
    zones: mine.length,
  };
}

/**
 * أيُورَّد لهذا الفرع في يومٍ ما؟ — يقرؤه المقترح فلا يُولَّد طلبٌ ليومٍ لا
 * تصله شاحنة. بلا تقويمٍ: **كلّ يومٍ صالح** (سلوك اليوم، لا تعطيل).
 * @param {object} profile ملفّ الفرع
 * @param {string} isoDate تاريخٌ بصيغة YYYY-MM-DD
 */
export function suppliesOn(profile, isoDate) {
  const days = profile?.supplyDays || [];
  if (!days.length) return true;
  const t = Date.parse(`${day(isoDate)}T00:00:00Z`);
  if (!Number.isFinite(t)) return true;
  return days.includes(WEEK_DAYS[new Date(t).getUTCDay()]);
}
