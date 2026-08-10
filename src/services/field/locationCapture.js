/**
 * التقاط موقع الجهاز — الجسر الوحيد بين المتصفّح وطبقة الميدان.
 *
 * ⚠️ يلمس `navigator` فلا يُختبَر في Node. كلّ الحكم على القراءة في `geo.js`
 * الخالص — وهذه الوحدة تجلب الرقم ولا تحكم عليه.
 *
 * ═══ لماذا محاولتان لا واحدة؟ ═══
 * أوّل قراءةٍ يعطيها المتصفّح غالبًا من الشبكة (برج/واي-فاي) ودقّتها مئات
 * الأمتار، ثمّ يلحقها القمر الصناعيّ بقراءةٍ أدقّ بعد ثوانٍ. فطلبٌ واحد سريع
 * يُرجع قراءةً لا تحسم سياجًا نصفُ قطره ١٥٠ مترًا. نراقب حتى تتحسّن الدقّة إلى
 * الحدّ المطلوب أو تنتهي المهلة، فنُعيد **أفضل ما رأينا** لا آخر ما وصل.
 */

/** الدقّة التي نطمح إليها بالمتر قبل التوقّف مبكرًا. */
const TARGET_ACCURACY_M = 50;

/** مهلة الانتظار الكاملة بالملّي ثانية. */
const CAPTURE_TIMEOUT_MS = 12000;

/** هل يدعم هذا المتصفّح تحديد الموقع؟ */
export function geolocationSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/** يحوّل قراءة المتصفّح إلى شكلنا المسطّح القابل للحفظ في Firestore. */
function toReading(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Math.round(pos.coords.accuracy ?? 0),
    // ختم الجهاز — شهادةٌ تُحفظ للمراجعة، والختم المعتمد يضعه الخادم.
    deviceAt: pos.timestamp || null,
  };
}

/**
 * يلتقط أفضل قراءةٍ متاحة خلال المهلة.
 *
 * @returns {Promise<{lat,lng,accuracy,deviceAt}>}
 * @throws {Error} برسالةٍ عربيّة صالحة للعرض مباشرةً
 */
export function captureLocation({
  targetAccuracyM = TARGET_ACCURACY_M,
  timeoutMs = CAPTURE_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) {
      reject(new Error('هذا المتصفّح لا يدعم تحديد الموقع.'));
      return;
    }

    let best = null;
    let watchId = null;
    let timer = null;

    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      watchId = null;
      timer = null;
    };

    const settle = () => {
      stop();
      if (best) resolve(best);
      else reject(new Error('تعذّر تحديد موقعك — تأكّد من تفعيل خدمة الموقع وأعد المحاولة.'));
    };

    timer = setTimeout(settle, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = toReading(pos);
        // نحتفظ بالأدقّ لا بالأحدث — القراءة اللاحقة قد تكون أسوأ.
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (best.accuracy <= targetAccuracyM) settle();
      },
      (err) => {
        stop();
        const messages = {
          1: 'رُفض إذن الموقع — اسمح للموقع من إعدادات المتصفّح ثمّ أعد المحاولة.',
          2: 'خدمة الموقع غير متاحة الآن — تحقّق من تفعيل GPS.',
          3: 'انتهت مهلة تحديد الموقع — جرّب في مكانٍ أوضح للسماء.',
        };
        // لو كنّا التقطنا شيئًا قبل الخطأ فهو خيرٌ من لا شيء.
        if (best) resolve(best);
        else reject(new Error(messages[err?.code] || 'تعذّر تحديد موقعك.'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}

/**
 * حالة إذن الموقع دون طلبه — لعرض تنبيهٍ استباقيّ للمندوب قبل بدء يومه.
 * يُعيد 'granted' | 'denied' | 'prompt' | 'unknown'.
 */
export async function locationPermissionState() {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state || 'unknown';
  } catch {
    return 'unknown';
  }
}
