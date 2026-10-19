/**
 * منطق جرد **مخزن فينسيا** الخالص — بلا DOM ولا Firestore.
 *
 * ═══ لماذا ملفٌّ ثانٍ بجوار `assetsModel.js`؟ ═══
 * `assetsModel` يعرف الأصلَ الواحد: يقرؤه من الإكسل، ويُصفّيه، ويُحصيه. وهو
 * مُعاد الاستخدام هنا كما هو (الحالاتُ والشارةُ والترقيمُ وحقولُ البحث). وما
 * يُضيفه هذا الملفّ هو ما لا يعرفه ذاك: أنّ جردَ فينسيا **مجموعتان** لا
 * مجموعةٌ واحدة، وأنّ للأصل حياةً بعد تسجيله (جردٌ دوريّ · ملاحظاتٌ ·
 * تكهينٌ بدل حذف).
 *
 * ═══ ★★★ والمجموعتان ليستا تصنيفًا — هما مفتاحُ الهويّة ═══
 * ملفّا المالك يحملان **نفسَ الأرقام** `BRZ-0001…BRZ-0030` لأصولٍ مختلفة
 * تمامًا: `BRZ-0001` في «بضاعة الصرف» خشبُ باركي، وفي «أصول المدعوم» ثلاجةُ
 * تجميد. فثلاثون رقمًا متصادمًا. ولو كان الرقمُ وحدَه هويّةَ المستند في
 * السحابة لَمحا الاستيرادُ ثلاثين أصلًا بلا صوت — ولظهر الجردُ ٧٤ أصلًا
 * وهو ١٠٤. ولذلك الهويّةُ `<المجموعة>-<الرقم>` دائمًا، و`assetDocId` هو
 * المعبرُ الوحيد إليها.
 *
 * ═══ وعمودُ «السيريال» في بضاعة الصرف ليس سيريالًا ═══
 * قيسَ فوُجد تسعَ قيمٍ متكرّرة (اثاث · بناء · ري · سباكه · سيارات · كهرباء ·
 * مواد نجارة · مواشي · دراجات) — فهو **تصنيفٌ** لا رقمَ تسلسل. وفي «أصول
 * المدعوم» هو مواصفةٌ حقيقيّة («كبيرة ( 3 * 3 )» · «QUALITEC»). فالتصنيفُ
 * **يُشتقّ ولا يُخزَّن** (`assetCategory`): حقلٌ مخزَّنٌ ثانٍ يعني قيمتين
 * لحقيقةٍ واحدة تتفارقان عند أوّل تعديل.
 */
import {
  ASSET_CONDITIONS,
  BAD_CONDITIONS,
  nextAssetId,
  SEARCHABLE_FIELDS,
} from './assetsModel.js';

/** المستودع الذي تخصّه هذه اللوحة — قيمةُ حقل `warehouse` في كلّ سجلّ. */
export const VENECIA_WAREHOUSE = 'فينسيا';

/**
 * مجموعتا الجرد. `assetType` هو النصُّ كما كتبه المالك في ملفّه — يُحفظ كما
 * هو لا كما نحبّ، فالموظّف يبحث بما يعرفه.
 */
export const POPULATIONS = [
  { id: 'issue', label: 'بضاعة الصرف', assetType: 'تخزين لصرف' },
  { id: 'supported', label: 'أصول المدعوم', assetType: 'اصول مستعمله' },
];

const POP_BY_ID = new Map(POPULATIONS.map((p) => [p.id, p]));

/** هل هذا معرّفُ مجموعةٍ معروف؟ */
export const isPopulation = (id) => POP_BY_ID.has(id);

/** اسمُ المجموعة للعرض — والمجهولُ يُقال مجهولًا ولا يُخفى. */
export const populationLabel = (id) => POP_BY_ID.get(id)?.label || 'مجموعة غير معروفة';

/** نوعُ الأصل المرافق للمجموعة (نصُّ المالك). */
export const populationAssetType = (id) => POP_BY_ID.get(id)?.assetType || '';

const ASSET_NO = /^BRZ-\d{4}$/;

/** هل الرقمُ على الصيغة المطبوعة على الأصل؟ */
export const isAssetNo = (v) => ASSET_NO.test(String(v ?? '').trim());

/**
 * هويّةُ المستند في السحابة: `<المجموعة>-<الرقم>`.
 *
 * ويرمي عند المدخل المشوّه ولا يُلفّق معرّفًا: معرّفٌ مُلفَّقٌ يكتب أصلًا في
 * مكانٍ لا أحدَ يقرؤه، وهو أسوأُ من خطأٍ يُرى.
 */
export function assetDocId(population, assetNo) {
  const pop = String(population ?? '').trim();
  const no = String(assetNo ?? '').trim();
  if (!isPopulation(pop)) throw new Error(`مجموعةٌ غير معروفة: «${pop}»`);
  if (!isAssetNo(no)) throw new Error(`رقمُ أصلٍ مشوّه: «${no}» — الصيغة BRZ-0001`);
  return `${pop}-${no}`;
}

/** يفكّ المعرّف إلى مجموعةٍ ورقم، أو `null` إن لم يكن معرّفًا لنا. */
export function parseAssetDocId(docId) {
  const m = String(docId ?? '').match(/^([a-z]+)-(BRZ-\d{4})$/);
  if (!m || !isPopulation(m[1])) return null;
  return { population: m[1], assetNo: m[2] };
}

/** تصنيفٌ غيرُ مذكورٍ في السجلّ — يُسمّى ولا يُترك فراغًا يختفي في التصفية. */
export const UNCLASSIFIED = 'غير مصنّف';

/**
 * تصنيفُ الأصل — مُشتقٌّ لا مخزَّن (انظر رأسَ الملفّ).
 * في «بضاعة الصرف» هو عمودُ السيريال، وفي «أصول المدعوم» المجموعةُ نفسُها.
 */
export function assetCategory(asset) {
  if (asset?.population === 'supported') return populationLabel('supported');
  const raw = String(asset?.serial ?? '').trim();
  return raw || UNCLASSIFIED;
}

/** تصنيفاتُ جردٍ ما، مرتّبةً بعددِ أصولها نازلًا ثمّ بالاسم. */
export function categoriesOf(assets) {
  const counts = new Map();
  for (const a of assets ?? []) {
    const c = assetCategory(a);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ar'));
}

/** كمّيّةٌ كما كُتبت — بلا «وقوعٍ على واحد»، فصفرٌ حقيقيٌّ يجب أن يُرى. */
export function rawQty(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * حكمٌ على سجلٍّ قبل كتابته — على نمط `custodyVerdict`.
 * يُعيد `{ ok, problems }` ولا يرمي: الشاشةُ تعرض المشاكلَ كلَّها مرّةً
 * واحدة، فلا يُصلح الموظّفُ حقلًا ليُفاجأ بالثاني.
 */
export function assetVerdict(record) {
  const r = record ?? {};
  const problems = [];
  if (!isPopulation(r.population)) {
    problems.push('المجموعة غير محدّدة (بضاعة الصرف أو أصول المدعوم).');
  }
  if (!isAssetNo(r.id)) problems.push('رقمُ الأصل على صيغة BRZ-0001.');
  if (!String(r.assetName ?? '').trim()) problems.push('اسمُ الأصل مطلوب.');
  const q = Number(r.qty);
  if (!Number.isFinite(q)) problems.push('الكمّيّة رقم.');
  else if (q < 0) problems.push('الكمّيّة لا تكون سالبة.');
  if (r.condition && !ASSET_CONDITIONS.includes(r.condition)) {
    problems.push(`الحالة من: ${ASSET_CONDITIONS.join(' · ')}.`);
  }
  return { ok: problems.length === 0, problems };
}

/** فرقُ الجرد: المعدودُ ناقصَ المسجَّل، و`null` إن لم يُعدّ بعد. */
export function countVariance(asset) {
  const c = asset?.countedQty;
  if (c === null || c === undefined || c === '') return null;
  const n = Number(c);
  return Number.isFinite(n) ? n - rawQty(asset?.qty) : null;
}

/** هل جُرِد هذا الأصل (عُدَّ فعليًّا) ولو مرّة؟ */
export const isCounted = (asset) => countVariance(asset) !== null;

/** أرقامُ الجرد: كم أصلًا عُدَّ، وكم فرقًا ظهر. */
export function countProgress(assets) {
  const live = (assets ?? []).filter((a) => !a.archived);
  const counted = live.filter(isCounted);
  return {
    total: live.length,
    counted: counted.length,
    pending: live.length - counted.length,
    variances: counted.filter((a) => countVariance(a) !== 0).length,
    netVariance: counted.reduce((s, a) => s + (countVariance(a) ?? 0), 0),
  };
}

/**
 * لقطةُ الطبقة الثانية — أرقامٌ لكلّ مجموعةٍ وللحالات.
 * المكهَّنُ (`archived`) **خارجَ كلّ رقم**: أصلٌ أُخرج من الجرد لا يُحتسب
 * فيه، وإلّا كبِرت الأرقامُ بما لم يبقَ في المخزن.
 */
export function veneciaSnapshot(assets) {
  const all = assets ?? [];
  const live = all.filter((a) => !a.archived);
  const byCondition = new Map(ASSET_CONDITIONS.map((c) => [c, 0]));
  for (const a of live) {
    if (byCondition.has(a.condition)) {
      byCondition.set(a.condition, byCondition.get(a.condition) + 1);
    }
  }
  const perPopulation = POPULATIONS.map((p) => {
    const rows = live.filter((a) => a.population === p.id);
    return {
      id: p.id,
      label: p.label,
      assets: rows.length,
      units: rows.reduce((s, a) => s + rawQty(a.qty), 0),
    };
  });
  return {
    assets: live.length,
    units: live.reduce((s, a) => s + rawQty(a.qty), 0),
    archived: all.length - live.length,
    needsAttention: live.filter((a) => BAD_CONDITIONS.includes(a.condition)).length,
    byCondition: [...byCondition.entries()],
    perPopulation,
    categories: categoriesOf(live),
    count: countProgress(all),
  };
}

/** عددُ أيّامٍ بين يومين `YYYY-MM-DD` — و`null` إن غاب أحدهما أو تشوّه. */
export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00`);
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** نصُّ سببِ «لم يُجرَد» — مذكورٌ مرّةً واحدةً ليُقارَن به لا ليُكرَّر. */
export const NEVER_COUNTED = 'لم يُجرَد قطّ';

/**
 * رقمٌ بإشارته، **معزولًا** بعلامتَي LRM.
 *
 * ★★★ وبلا العزل يُكتب «-2» ويُقرأ **«2-»**: إشارةُ الناقص محرفٌ محايدٌ
 * اتّجاهيًّا، فتهاجر إلى آخر الرقم في فقرةٍ عربيّة. وأمسكَته التجربةُ الحيّة
 * لا الاختبار — فالسلسلةُ في الذاكرة صحيحةٌ تمامًا، والعطبُ في العرض وحدَه.
 * (وهي بيّنةُ تقارير الوورد نفسُها: العلاماتُ المحايدة تُعزل أو تنقلب.)
 */
export const signedText = (n) => `‎${n > 0 ? '+' : ''}${n}‎`;

/**
 * ① طبقةُ «تدخّلٌ الآن» — وكلُّ سببٍ **يُقال نصًّا** بجوار الأصل. ولوحةٌ
 * تقول «١٢ أصلًا يحتاج تدخّلًا» ولا تقول لماذا تُنتج بحثًا لا عملًا.
 *
 * ═══ ★★★ ودرجتان لا درجةٌ واحدة ═══
 * أوّلَ تشغيلٍ حيٍّ قالت الطبقةُ «**١٠٤ أصلًا** تحتاج تدخّلًا» — وهي كلُّ
 * الجرد، لأنّ كلَّ أصلٍ مستوردٍ «لم يُجرَد قطّ». وطبقةُ تدخّلٍ تضمّ كلَّ
 * شيءٍ لا تدلّ على شيء. فـ`tier`:
 *   · `now` — عطبٌ قائم: حالةٌ معطلة · كمّيّةٌ صفر · فرقُ جردٍ لم يُسوَّ ·
 *     جردٌ قديم. هذه تُعرض في الطبقة الأولى.
 *   · `backlog` — «لم يُجرَد قطّ» وحدَه: حالةُ يومٍ أوّلَ لا عطب، وعلاجُها
 *     أن تبدأ الجرد لا أن تُنذَر بها مئةَ مرّة.
 *
 * و`asOf` يُمرَّر ولا يُقرأ من `Date.now()`: دالّةٌ تقرأ الساعةَ لا تُختبر،
 * وحارسٌ لا يُختبر لا يُؤتمن (درسُ «حارسٌ يقرأ حالةَ البيئة»).
 */
export function attentionRows(assets, { asOf = '', staleDays = 90 } = {}) {
  const out = [];
  for (const a of (assets ?? []).filter((x) => !x.archived)) {
    const reasons = [];
    if (BAD_CONDITIONS.includes(a.condition)) reasons.push(`الحالة «${a.condition}»`);
    if (rawQty(a.qty) <= 0) reasons.push('كمّيّةٌ صفر');
    const v = countVariance(a);
    if (v !== null && v !== 0) reasons.push(`فرقُ جردٍ ${signedText(v)}`);
    if (!isCounted(a)) reasons.push(NEVER_COUNTED);
    else {
      const age = daysBetween(a.countedAt, asOf);
      if (age !== null && age > staleDays) reasons.push(`آخرُ جردٍ قبل ${age} يومًا`);
    }
    if (!reasons.length) continue;
    const tier = reasons.some((r) => r !== NEVER_COUNTED) ? 'now' : 'backlog';
    out.push({ ...a, reasons, tier });
  }
  // الأثقلُ أوّلًا: الدرجةُ ثمّ حالةٌ معطلة ← فرقُ جردٍ ← كمّيّةٌ صفر.
  const weight = (r) =>
    (r.tier === 'now' ? 0 : 16) +
    (BAD_CONDITIONS.includes(r.condition) ? 0 : 8) +
    (countVariance(r) ? 0 : 4) +
    (rawQty(r.qty) <= 0 ? 0 : 2);
  return out.sort((x, y) => weight(x) - weight(y));
}

/**
 * تصفيةُ الفهرس الكامل. والمكهَّنُ **مُستثنًى افتراضًا** ويُطلب صريحًا —
 * فمن أخرج أصلًا من الجرد لا يريده في كلّ شاشةٍ بعدها.
 */
export function filterVenecia(
  assets,
  {
    q = '',
    population = '',
    category = '',
    condition = '',
    includeArchived = false,
    uncountedOnly = false,
  } = {}
) {
  const term = String(q ?? '').trim().toLowerCase();
  return (assets ?? []).filter((a) => {
    if (!includeArchived && a.archived) return false;
    if (uncountedOnly && isCounted(a)) return false;
    if (population && a.population !== population) return false;
    if (condition && a.condition !== condition) return false;
    if (category && assetCategory(a) !== category) return false;
    if (!term) return true;
    return (
      SEARCHABLE_FIELDS.some((f) => String(a[f] ?? '').toLowerCase().includes(term)) ||
      assetCategory(a).toLowerCase().includes(term) ||
      populationLabel(a.population).toLowerCase().includes(term)
    );
  });
}

/**
 * الرقمُ التالي **داخل المجموعة** — فتسلسلُ «الصرف» لا يدفع تسلسلَ
 * «المدعوم» ولا العكس. ويُقرأ من السجلّات كما يفعل `nextAssetId`، فأصلٌ
 * أُضيف برقمٍ أعلى لا يُنتج تصادمًا بعده. والمكهَّنُ **يُحتسب**: رقمُه
 * محجوزٌ إلى الأبد لأنّه مطبوعٌ على شيءٍ كان في المخزن.
 */
export function nextAssetNoIn(assets, population) {
  const rows = (assets ?? []).filter((a) => a.population === population);
  return nextAssetId(rows).id;
}

/**
 * أعمدةُ التصدير — **بنفس عناوين ملفّات المالك** وبترتيبها، وتحتها ما
 * أضافته البوّابة (المجموعة · التصنيف · الجرد · التكهين).
 *
 * والرحلةُ ذهابًا وإيابًا مقصودة: ملفٌّ يُصدَّر من هنا يُقرأ بخريطة
 * `assetsModel` نفسِها — فالعناوينُ السبعةُ الأولى هي هي.
 */
export const VENECIA_EXPORT_COLUMNS = [
  'رقم الأصل',
  'نوع الأصل',
  'اسم الأصل',
  'الماركة',
  'السيريال',
  'الكمية',
  'الحالة',
  'المسؤول',
  'القسم',
  'الموقع',
  'تاريخ الاستلام',
  'ملاحظات',
  'المجموعة',
  'التصنيف',
  'الكمية المعدودة',
  'فرق الجرد',
  'تاريخ الجرد',
  'من جرد',
  'مكهَّن',
  'سبب التكهين',
];

/**
 * صفوفُ التصدير — دالّةٌ خالصةٌ تُختبر وحدَها، والزرُّ في الشاشة يستدعيها
 * ولا يُعيد بناءها. وفرقُ الجرد **محسوبٌ في الملفّ** فلا يُحسب في الإكسل
 * بيدٍ تُخطئ.
 */
export function veneciaExportRows(assets) {
  return (assets ?? []).map((a) => {
    const v = countVariance(a);
    return {
      'رقم الأصل': a.id ?? '',
      'نوع الأصل': a.assetType ?? '',
      'اسم الأصل': a.assetName ?? '',
      الماركة: a.brand ?? '',
      السيريال: a.serial ?? '',
      الكمية: rawQty(a.qty),
      الحالة: a.condition ?? '',
      المسؤول: a.responsible ?? '',
      القسم: a.department ?? '',
      الموقع: a.location ?? '',
      'تاريخ الاستلام': a.receivedDate ?? '',
      ملاحظات: a.notes ?? '',
      المجموعة: populationLabel(a.population),
      التصنيف: assetCategory(a),
      'الكمية المعدودة': isCounted(a) ? Number(a.countedQty) : '',
      'فرق الجرد': v === null ? '' : v,
      'تاريخ الجرد': a.countedAt ?? '',
      'من جرد': a.countedBy ?? '',
      'مكهَّن': a.archived ? 'نعم' : '',
      'سبب التكهين': a.archiveReason ?? '',
    };
  });
}
