/**
 * الجغرافيا الميدانية — المسافة والسياج والحكم على القراءة.
 *
 * المشكلة التي تحلّها: «زرتُ العميل» جملةٌ لا يمكن تكذيبها ولا تصديقها. النظام
 * الورقيّ يقبلها كما هي، فيصير تقرير التغطية سردًا لا قياسًا. وحين نطلب إحداثيّة
 * تتحوّل الجملة إلى واقعةٍ قابلة للفحص: هل كان المندوب هناك فعلًا؟
 *
 * ═══ الدقّة شرطٌ لا زينة ═══
 * أخطر ما في السياج الجغرافيّ أن يُبنى على قراءةٍ رديئة. جهازٌ يقول «أنا هنا
 * ±٥٠٠ متر» لا يُثبت شيئًا عن سياجٍ نصفُ قطره ١٠٠ متر — قد يكون داخله وقد يكون
 * في الشارع المجاور. ولذلك **لا نحكم بقراءةٍ دقّتها أسوأ من نصف القطر**: نقول
 * «غير محسوم» لا «داخل». الادّعاء الكاذب بالانضباط أسوأ من الاعتراف بالجهل،
 * لأنّ الأوّل يُبنى عليه قرارٌ والثاني يُطلب له تحقّق.
 *
 * منطق خالص: بلا Firestore وبلا DOM وبلا `navigator` — يُختبَر في Node.
 */

/** نصف قطر الأرض بالمتر (المتوسّط الكرويّ) — كافٍ لمسافات المدينة. */
const EARTH_RADIUS_M = 6371008.8;

/** نصف قطر السياج الافتراضيّ حول المتجر بالمتر. */
export const DEFAULT_FENCE_RADIUS_M = 150;

/**
 * أسوأ دقّةٍ نقبل الحكم بها، نسبةً إلى نصف القطر. قراءةٌ دقّتها تتجاوز نصف
 * القطر تجعل السؤال «داخل أم خارج؟» بلا جواب.
 */
export const ACCURACY_TOLERANCE_RATIO = 1;

/** هل هذه إحداثيّة صالحة؟ الصفر المزدوج مرفوض — إنّه «لا موقع» متنكّرًا. */
export function isValidCoords(p) {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false; // «جزيرة الصفر» — قراءةٌ فاشلة لا موقعٌ في المحيط
  return true;
}

/** يُطبّع إحداثيّة إلى `{lat,lng}` رقميّة، أو `null` إن كانت غير صالحة. */
export function normalizeCoords(p) {
  if (!isValidCoords(p)) return null;
  return { lat: Number(p.lat), lng: Number(p.lng) };
}

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * المسافة بين نقطتين بالمتر (هافرساين). يُعيد `null` إن كانت إحداهما غير صالحة
 * — لا صفرًا: الصفر يعني «متطابقتان» وهو ادّعاءٌ خطير حين لا نعلم.
 */
export function haversineMeters(a, b) {
  const p1 = normalizeCoords(a);
  const p2 = normalizeCoords(b);
  if (!p1 || !p2) return null;

  const dLat = rad(p2.lat - p1.lat);
  const dLng = rad(p2.lng - p1.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s))));
}

/** هل النقطة داخل السياج؟ `null` حين لا يمكن الحساب. */
export function withinFence(center, point, radiusM = DEFAULT_FENCE_RADIUS_M) {
  const d = haversineMeters(center, point);
  if (d === null) return null;
  return d <= (Number(radiusM) || DEFAULT_FENCE_RADIUS_M);
}

/**
 * حكم السياج الجغرافيّ — الحارس الذي يُستدعى قبل تسجيل زيارةٍ أو إصدار فاتورة.
 *
 * ثلاث نتائج لا اثنتان:
 *   `inside`      — داخل السياج بقراءةٍ موثوقة.
 *   `outside`     — خارجه بقراءةٍ موثوقة.
 *   `unverified`  — لا موقع للعميل، أو لا قراءة، أو قراءةٌ أضعف من أن تحسم.
 *
 * و`unverified` **ليست `outside`**: الأولى تعني «لا نعلم» فتُوثَّق وتُراجَع،
 * والثانية تعني «نعلم أنّه لم يكن هناك» فتُمنع. الخلط بينهما إمّا يشلّ العمل
 * حين يضعف الإرسال، أو يفتح الباب لتسجيل زيارةٍ لم تقع.
 *
 * @returns {{status:'inside'|'outside'|'unverified', distanceM:number|null,
 *            radiusM:number, reason:string, blocking:boolean}}
 */
export function fenceVerdict({ customerCoords, position, radiusM = DEFAULT_FENCE_RADIUS_M, enforce = true } = {}) {
  const radius = Number(radiusM) > 0 ? Number(radiusM) : DEFAULT_FENCE_RADIUS_M;
  const base = { radiusM: radius, distanceM: null, blocking: false };

  const center = normalizeCoords(customerCoords);
  if (!center) {
    return { ...base, status: 'unverified', reason: 'لا إحداثيّة مسجّلة لهذا العميل — سجّل موقعه أوّلًا.' };
  }

  const point = normalizeCoords(position);
  if (!point) {
    return { ...base, status: 'unverified', reason: 'تعذّر تحديد موقعك — فعّل خدمة الموقع وأعد المحاولة.' };
  }

  const accuracy = Number(position?.accuracy);
  if (Number.isFinite(accuracy) && accuracy > radius * ACCURACY_TOLERANCE_RATIO) {
    return {
      ...base,
      status: 'unverified',
      distanceM: haversineMeters(center, point),
      reason: `دقّة القراءة ±${Math.round(accuracy)}م أوسع من السياج (${radius}م) — لا تحسم الموقع.`,
    };
  }

  const distanceM = haversineMeters(center, point);
  if (distanceM <= radius) {
    return { ...base, status: 'inside', distanceM, reason: `داخل نطاق المتجر (${distanceM}م).` };
  }

  return {
    ...base,
    status: 'outside',
    distanceM,
    blocking: Boolean(enforce),
    reason: `تبعد ${distanceM}م عن المتجر — خارج النطاق المسموح (${radius}م).`,
  };
}

/** مسافة خطّ سيرٍ من نقاطه بالمتر. النقاط غير الصالحة تُتخطّى بلا كسر الحساب. */
export function routeDistanceMeters(points) {
  const valid = (points || []).map(normalizeCoords).filter(Boolean);
  let total = 0;
  for (let i = 1; i < valid.length; i += 1) {
    total += haversineMeters(valid[i - 1], valid[i]) || 0;
  }
  return total;
}

/** المسافة بالكيلومتر بخانتين — للعرض لا للحساب. */
export function toKm(meters) {
  return Math.round(((Number(meters) || 0) / 1000) * 100) / 100;
}

/**
 * مركز مجموعة نقاط — لضبط الخريطة على ما يُعرض. `null` إن لم تصلح أيّ نقطة.
 */
export function centroid(points) {
  const valid = (points || []).map(normalizeCoords).filter(Boolean);
  if (!valid.length) return null;
  const lat = valid.reduce((s, p) => s + p.lat, 0) / valid.length;
  const lng = valid.reduce((s, p) => s + p.lng, 0) / valid.length;
  return { lat, lng };
}
