/**
 * الزيارة الميدانية — الواقعة التي يُبنى عليها كلّ قياسٍ للتغطية.
 *
 * تتبع نمط `labor_tasks` الذي أثبت نفسه في المناولة: آلة حالاتٍ صريحة، وأختامٌ
 * زمنيّة من الخادم لا من جهاز المستخدم، وسجلّ أحداثٍ ملحق-فقط. الفارق أنّ
 * الزيارة تحمل **بُعدًا مكانيًّا**: أين وقع الحدث، لا متى فقط.
 *
 * ═══ لماذا الختم من الخادم؟ ═══
 * لأنّ ساعة الهاتف يملكها حاملُه. زيارةٌ مدّتها «١٢ دقيقة» محسوبةً من ساعة
 * الجهاز تُصدَّق ما لم يُقدَّم دليلٌ آخر — وتغييرُ الساعة أسهل من قيادة المركبة.
 * فالمدّة تُحسب من ختمَي الخادم، وإحداثيّة الجهاز تبقى شهادةً تُوزَن لا تُصدَّق
 * وحدها (ولذلك تُحفظ دقّتها معها).
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */
import { fenceVerdict, haversineMeters, DEFAULT_FENCE_RADIUS_M } from './geo.js';

/** حالات الزيارة. */
export const VISIT_STATES = {
  planned: { id: 'planned', labelAr: 'مخطّطة' },
  checked_in: { id: 'checked_in', labelAr: 'جارية (حضر)' },
  checked_out: { id: 'checked_out', labelAr: 'منتهية' },
  skipped: { id: 'skipped', labelAr: 'لم تُنفَّذ' },
};

/**
 * الانتقالات المسموحة. لا قفز من «مخطّطة» إلى «منتهية»: الزيارة التي لم يُسجَّل
 * حضورُها لم تقع — وقبولُ إنهائها يعني قبول تقريرٍ بلا واقعة.
 */
export const VISIT_TRANSITIONS = {
  planned: ['checked_in', 'skipped'],
  checked_in: ['checked_out'],
  checked_out: [],
  skipped: [],
};

/** هل يجوز هذا الانتقال؟ */
export function canTransitionVisit(from, to) {
  return (VISIT_TRANSITIONS[from] || []).includes(to);
}

/** نتائج الزيارة — ما خرج بها المندوب. */
export const VISIT_OUTCOMES = [
  { id: 'sale', labelAr: 'بيع', productive: true },
  { id: 'no_order', labelAr: 'زيارة بلا طلب', productive: false },
  { id: 'closed', labelAr: 'المتجر مغلق', productive: false },
  { id: 'refused', labelAr: 'رفض الاستقبال', productive: false },
  { id: 'collection', labelAr: 'تحصيل فقط', productive: true },
];

/** أسباب عدم التنفيذ — تُلزَم عند `skipped` فلا زيارةٌ تسقط بلا سبب. */
export const SKIP_REASONS = [
  'المتجر مغلق',
  'العميل غير موجود',
  'تعذّر الوصول (طريق/أمن)',
  'عطل المركبة',
  'ضيق الوقت',
  'سبب آخر موثّق',
];

/** أقلّ مدّة مكوثٍ تُعدّ زيارةً حقيقيّة (بالدقائق). */
export const MIN_VISIT_MINUTES = 3;

/** يقرأ ختمًا زمنيًّا (Firestore Timestamp أو رقم أو Date) إلى ميلي ثانية. */
export function stampMs(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return null;
}

/** مدّة المكوث بالدقائق من ختمَي الخادم، أو `null` إن لم تكتمل. */
export function visitDurationMinutes(checkInAt, checkOutAt) {
  const a = stampMs(checkInAt);
  const b = stampMs(checkOutAt);
  if (a === null || b === null || b < a) return null;
  return Math.round(((b - a) / 60000) * 10) / 10;
}

/**
 * حكم على زيارةٍ مكتملة — هل تُحتسب في التغطية؟
 *
 * `valid` تعني «تُحتسب»، و`flags` تعني «تُحتسب مع ملاحظة». والفرق مقصود: زيارةٌ
 * قصيرةٌ أو خارج السياج **تُسجَّل ولا تُمحى**، لكنّها تُوسَم فتظهر في مراجعة
 * المشرف. حذفُ ما لا يعجبنا يجعل التقرير جميلًا وكاذبًا.
 */
export function visitVerdict(visit, { radiusM = DEFAULT_FENCE_RADIUS_M, minMinutes = MIN_VISIT_MINUTES } = {}) {
  const flags = [];
  const state = visit?.state;

  if (state === 'skipped') {
    if (!String(visit?.skipReason || '').trim()) flags.push('لم تُنفَّذ بلا سببٍ مكتوب');
    return { valid: false, counted: false, flags, durationMinutes: null, distanceM: null };
  }

  if (state !== 'checked_out') {
    return { valid: false, counted: false, flags: ['الزيارة لم تُغلَق بعد'], durationMinutes: null, distanceM: null };
  }

  const durationMinutes = visitDurationMinutes(visit?.checkInAt, visit?.checkOutAt);
  if (durationMinutes === null) flags.push('لا ختم دخولٍ أو خروجٍ صالح — المدّة غير محسوبة');
  else if (durationMinutes < minMinutes) flags.push(`مدّة المكوث ${durationMinutes} دقيقة — أقلّ من الحدّ (${minMinutes})`);

  const verdict = fenceVerdict({
    customerCoords: visit?.customerCoords,
    position: visit?.checkInPosition,
    radiusM,
    enforce: false,
  });
  if (verdict.status === 'outside') flags.push(verdict.reason);
  else if (verdict.status === 'unverified') flags.push(`موقع غير مُتحقَّق — ${verdict.reason}`);

  if (!String(visit?.outcome || '').trim()) flags.push('بلا نتيجةٍ مسجّلة');

  // المسافة بين الحضور والانصراف: قفزةٌ كبيرة تعني أنّ الانصراف سُجّل من مكانٍ آخر.
  const drift = haversineMeters(visit?.checkInPosition, visit?.checkOutPosition);
  if (drift !== null && drift > radiusM * 2) {
    flags.push(`الانصراف سُجّل على بعد ${drift}م من الحضور — راجِع الزيارة`);
  }

  return {
    valid: flags.length === 0,
    counted: true, // تُحتسب دائمًا حين تُغلَق — والملاحظات تُعرض معها
    flags,
    durationMinutes,
    distanceM: verdict.distanceM,
    fenceStatus: verdict.status,
  };
}

/**
 * ملخّص يومٍ ميدانيّ. `productive` = الزيارات التي أنتجت بيعًا أو تحصيلًا —
 * وهي المؤشّر الذي يفرّق بين مندوبٍ يمرّ ومندوبٍ يبيع.
 */
export function summarizeVisits(visits, opts = {}) {
  const rows = visits || [];
  const closed = rows.filter((v) => v?.state === 'checked_out');
  const productiveIds = new Set(VISIT_OUTCOMES.filter((o) => o.productive).map((o) => o.id));

  const durations = closed
    .map((v) => visitDurationMinutes(v?.checkInAt, v?.checkOutAt))
    .filter((d) => d !== null);

  const flagged = closed.filter((v) => visitVerdict(v, opts).flags.length > 0);

  return {
    total: rows.length,
    planned: rows.filter((v) => v?.state === 'planned').length,
    inProgress: rows.filter((v) => v?.state === 'checked_in').length,
    done: closed.length,
    skipped: rows.filter((v) => v?.state === 'skipped').length,
    productive: closed.filter((v) => productiveIds.has(v?.outcome)).length,
    flagged: flagged.length,
    avgMinutes: durations.length
      ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10
      : 0,
    strikeRate: closed.length
      ? Math.round((closed.filter((v) => productiveIds.has(v?.outcome)).length / closed.length) * 100)
      : 0,
  };
}

/**
 * حارس إصدار الفاتورة من الزيارة — يُستدعى قبل إنشاء `VSI`.
 *
 * قرار المالك: **لا فاتورة من خارج نطاق المتجر**. لكنّ «غير مُتحقَّق» لا يمنع
 * — وإلّا توقّف البيع كلّما ضعف الإرسال في منطقةٍ صناعيّة أو قبوٍ، وهو ما يدفع
 * المندوب إلى البيع خارج النظام. المنع للمؤكَّد خارجًا، والتوثيق لما لا يُحسم.
 */
export function invoiceGuard({ visit, position, radiusM = DEFAULT_FENCE_RADIUS_M, enforce = true } = {}) {
  if (!visit || visit.state !== 'checked_in') {
    return { ok: false, blocking: true, reason: 'لا فاتورة بلا زيارةٍ مفتوحة — سجّل الحضور أوّلًا.' };
  }
  const verdict = fenceVerdict({
    customerCoords: visit.customerCoords,
    position: position || visit.checkInPosition,
    radiusM,
    enforce,
  });
  return {
    ok: verdict.status === 'inside' || (verdict.status === 'unverified' && !verdict.blocking),
    blocking: verdict.blocking,
    status: verdict.status,
    distanceM: verdict.distanceM,
    reason: verdict.reason,
  };
}
