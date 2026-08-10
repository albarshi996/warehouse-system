/**
 * المستهدفات — الشكل والأبعاد والمقاييس والتحقّق.
 *
 * المشكلة: المؤشّرات في هذه البوابة **محسوبة لا مُستهدَفة**. تقول «بيع الشهر
 * ٤٠٠ ألف» ولا تقول «من أصل كم». والرقم بلا مرجعٍ لا يُقرأ: أهو إنجازٌ أم
 * تراجع؟ والمندوب الذي باع ٢٠ ألفًا هل تفوّق أم قصّر؟ لا جواب.
 *
 * ═══ هدفٌ واحد بشكلٍ واحد ═══
 * مواصفة المالك تطلب أهدافًا حسب: مندوب · مدينة · منطقة · سيارة · عميل ·
 * مجموعة عملاء · صنف · علامة · كميّة · قيمة · زيارات. وقد يُبنى لكلٍّ نوعٌ
 * مستقلّ — فيصير أحد عشر نموذجًا تتشعّب صيانتها. والأنظف أنّ الهدف **مرشِّحٌ
 * ومقياسٌ ومدّةٌ ورقم**: البُعد يقول «لمن»، والنطاق يقول «في ماذا»، والمقياس
 * يقول «بأيّ وحدة». فبُعدٌ جديد سطرٌ في جدولٍ لا نموذجٌ جديد.
 *
 * ═══ الإنجاز يُحسب ولا يُخزَّن ═══
 * كما في تسوية الرحلة: ما يُخزَّن ينحرف عن الواقع، وما يُحسب لا ينحرف. فلا
 * حقل `achieved` في المستهدف — يُشتقّ من المستندات المنجَزة والزيارات لحظة
 * القراءة. ولا يستطيع أحدٌ تحسين رقمه بتعديل صفٍّ في قاعدة البيانات.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

/**
 * أبعاد الإسناد — «لمن هذا الهدف؟».
 * `docField` هو حقل رأس المستند الذي يُنسب به، و`visitField` نظيره في الزيارة.
 * الأبعاد التي لا تظهر في الزيارة (صنف/فئة) لا تصلح لمقاييس الزيارات، ويحرس
 * ذلك `targetVerdict`.
 */
export const DIMENSIONS = {
  rep: { id: 'rep', labelAr: 'مندوب', docField: 'createdByUid', visitField: 'repUid', forVisits: true },
  vehicle: { id: 'vehicle', labelAr: 'مركبة', docField: 'vehiclePlate', visitField: null, forVisits: false },
  route: { id: 'route', labelAr: 'خطّ سير', docField: 'route', visitField: 'route', forVisits: true },
  zone: { id: 'zone', labelAr: 'منطقة / مدينة', docField: 'zone', visitField: 'zone', forVisits: true },
  customer: { id: 'customer', labelAr: 'عميل', docField: 'customerCode', visitField: 'customerCode', forVisits: true },
  outletType: { id: 'outletType', labelAr: 'مجموعة عملاء (نوع المنفذ)', docField: 'outletType', visitField: null, forVisits: false },
  item: { id: 'item', labelAr: 'صنف', docField: null, lineField: 'sku', forVisits: false },
  category: { id: 'category', labelAr: 'فئة / علامة', docField: null, lineField: 'category', forVisits: false },
  all: { id: 'all', labelAr: 'الشركة كلّها', docField: null, forVisits: true },
};

/** المقاييس — «بأيّ وحدة يُقاس؟». */
export const METRICS = {
  value: { id: 'value', labelAr: 'قيمة المبيعات', unit: 'قيمة', source: 'documents' },
  qty: { id: 'qty', labelAr: 'الكميّة المباعة', unit: 'وحدة', source: 'documents' },
  outlets: { id: 'outlets', labelAr: 'عدد المتاجر المُباع لها', unit: 'متجر', source: 'documents' },
  visits: { id: 'visits', labelAr: 'عدد الزيارات المنفّذة', unit: 'زيارة', source: 'visits' },
  productive_visits: { id: 'productive_visits', labelAr: 'الزيارات المنتجة', unit: 'زيارة', source: 'visits' },
  strike_rate: { id: 'strike_rate', labelAr: 'نسبة نجاح الزيارة', unit: '%', source: 'visits' },
};

/** دوريّات المستهدف. */
export const PERIODS = {
  daily: { id: 'daily', labelAr: 'يوميّ', days: 1 },
  weekly: { id: 'weekly', labelAr: 'أسبوعيّ', days: 7 },
  monthly: { id: 'monthly', labelAr: 'شهريّ', days: 30 },
  quarterly: { id: 'quarterly', labelAr: 'ربع سنويّ', days: 90 },
  custom: { id: 'custom', labelAr: 'مدّة مخصّصة', days: 0 },
};

/**
 * أنواع المستندات التي تُحتسب مبيعًا.
 *
 * ⚠️ **لا تُضِف `INV` هنا.** الفاتورة مرآةٌ ماليّة لإذن التسليم، فعدُّها مع
 * `POD` يُضاعف المبيعات. القاعدة: **يُحتسب ما حرّك بضاعةً إلى خارج المنشأة**،
 * فالبيع واقعةٌ ماديّة لا مستندٌ ماليّ.
 */
export const SALES_DOC_TYPES = ['VSI', 'POD', 'VCS'];

/** مستهدفٌ فارغ بحقوله كلّها. */
export function blankTarget() {
  return {
    id: '',
    name: '',
    dimension: 'rep',
    dimensionValue: '',
    dimensionLabel: '',
    metric: 'value',
    amount: 0,
    period: 'monthly',
    from: '',
    to: '',
    scope: { skus: [], categories: [] },
    active: true,
  };
}

const up = (v) => String(v ?? '').trim().toUpperCase();

/** يقرأ `YYYY-MM-DD` منتصفَ ليل UTC — نفس قاعدة بقيّة النظام. */
export function parseDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY_MS = 86400000;

/** عدد الأيّام الشامل بين تاريخين (يومٌ واحد = ١ لا ٠). */
export function inclusiveDays(fromIso, toIso) {
  const a = parseDay(fromIso);
  const b = parseDay(toIso);
  if (!a || !b || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** هل هذا اليوم داخل مدّة المستهدف؟ حدودٌ شاملة. */
export function isWithinPeriod(target, day) {
  const d = String(day || '').slice(0, 10);
  if (!d) return false;
  const from = String(target?.from || '').slice(0, 10);
  const to = String(target?.to || '').slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * حكمٌ على تعريف المستهدف قبل حفظه.
 *
 * أخطر ما يُمسَك هنا: **بُعدٌ لا يصلح لمقياسه**. هدفُ زياراتٍ على «صنف» لا معنى
 * له — الزيارة لا تحمل صنفًا. ولو حُفظ لظهر إنجازه صفرًا أبدًا، فيظنّ المندوب
 * أنّه مقصّر وهو لم يُكلَّف بشيءٍ قابلٍ للقياس.
 */
export function targetVerdict(target) {
  const problems = [];
  const warnings = [];

  if (!String(target?.name || '').trim()) problems.push('اسم المستهدف مطلوب');

  const dim = DIMENSIONS[target?.dimension];
  const metric = METRICS[target?.metric];
  if (!dim) problems.push('بُعد غير معروف');
  if (!metric) problems.push('مقياس غير معروف');

  if (dim && metric && metric.source === 'visits' && !dim.forVisits) {
    problems.push(`مقياس «${metric.labelAr}» لا يصلح لبُعد «${dim.labelAr}» — الزيارة لا تحمل هذا البُعد`);
  }

  if (dim && dim.id !== 'all' && !String(target?.dimensionValue || '').trim()) {
    problems.push(`حدّد قيمة البُعد (${dim.labelAr})`);
  }

  if (!(Number(target?.amount) > 0)) problems.push('الرقم المستهدف يجب أن يكون أكبر من صفر');
  if (metric?.id === 'strike_rate' && Number(target?.amount) > 100) {
    problems.push('نسبة النجاح لا تتجاوز ١٠٠٪');
  }

  const days = inclusiveDays(target?.from, target?.to);
  if (!String(target?.from || '').trim() || !String(target?.to || '').trim()) {
    problems.push('مدّة المستهدف مطلوبة (من ← إلى)');
  } else if (days === null) {
    problems.push('تاريخ الانتهاء يسبق تاريخ البدء');
  } else if (days > 400) {
    warnings.push('مدّةٌ تتجاوز السنة — تأكّد أنّ هذا مقصود');
  }

  const scoped = (target?.scope?.skus || []).length || (target?.scope?.categories || []).length;
  if (scoped && metric?.source === 'visits') {
    warnings.push('النطاق الصنفيّ لا يؤثّر في مقاييس الزيارات — سيُهمَل');
  }

  return { ok: problems.length === 0, problems, warnings };
}

/** هل يشمل نطاق المستهدف هذا البند؟ نطاقٌ فارغ = كلّ الأصناف. */
export function lineInScope(target, line) {
  const skus = (target?.scope?.skus || []).map(up).filter(Boolean);
  const cats = (target?.scope?.categories || []).map(up).filter(Boolean);
  if (!skus.length && !cats.length) return true;
  if (skus.length && skus.includes(up(line?.sku))) return true;
  if (cats.length && cats.includes(up(line?.category))) return true;
  return false;
}

/**
 * هل يُنسب هذا المستند لهذا المستهدف؟
 * بُعد «الشركة كلّها» يشمل كلّ شيء، وأبعاد البنود (صنف/فئة) تُفحص على مستوى
 * البند لا الرأس فتُترك لـ`lineInScope` ونظيرتها في المحرّك.
 */
export function docMatchesDimension(target, doc) {
  const dim = DIMENSIONS[target?.dimension];
  if (!dim) return false;
  if (dim.id === 'all') return true;
  if (!dim.docField) return true; // بُعد بنديّ — يُفحص على البند
  return up(doc?.header?.[dim.docField] ?? doc?.[dim.docField]) === up(target?.dimensionValue);
}

/** هل تُنسب هذه الزيارة لهذا المستهدف؟ */
export function visitMatchesDimension(target, visit) {
  const dim = DIMENSIONS[target?.dimension];
  if (!dim) return false;
  if (dim.id === 'all') return true;
  if (!dim.visitField) return false;
  return up(visit?.[dim.visitField]) === up(target?.dimensionValue);
}
