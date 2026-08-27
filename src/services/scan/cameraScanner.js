/**
 * ═══ الكاميرا — محرّكُ قراءةٍ واحدٌ يعمل على كلّ جهاز ═══
 *
 * ★ **المشكلة التي يُنهيها**: الشاشة الوحيدة التي كانت تفتح كاميرا بنت مسارها
 * على `window.BarcodeDetector` وحده. وهذه الواجهة **غير موجودةٍ على آيفون
 * إطلاقًا (سفاري وكروم-iOS معًا)، ولا على كروم ويندوز، ولا فايرفوكس** — فكان
 * الزرّ يُخفى قبل أن يُجرَّب، فيرى العامل شاشةً بلا كاميرا ويقول «لا يقرأ».
 * (تحقّقٌ حيّ 2026-08-27 على كروم ١٤٨/ويندوز: `'BarcodeDetector' in window`
 * = false.)
 *
 * ★ **والقرار**: مسارٌ **واحد** لا مساران. `html5-qrcode` المحلّيّة هي
 * المحرّك، وبداخلها `useBarCodeDetectorIfSupported` — فحيث وُجد الكاشف
 * العتاديّ (أندرويد/كروم) استعملته المكتبة نفسها وكانت سريعة، وحيث غاب
 * (آيفون) فكّت بـZXing. سلوكٌ واحدٌ يُختبَر ويُشخَّص، لا فرعان يختلفان
 * بصمتٍ بين جهازٍ وجهاز.
 *
 * ★ **ومحلّيّة لا CDN**: شبكة المستودع غير مضمونة، والملفّ عندنا في
 * `public/lib/` ويُحفَظ مع العامل الخفيّ — فالمسح يعمل دون اتصال.
 *
 * ★ **والبيئة تُمرَّر لا تُقرأ** (نمط `overlayHistory`): الوحدة تأخذ متصفّحها
 * وساعتها من الخارج، فتُختبَر في Node ببيئةٍ مصغّرة — وحالاتُ العطل التي
 * يراها العامل ميدانيًّا (أذنٌ مرفوض · لا عدسة · اتصالٌ غير آمن) لها حرّاس.
 */

import {
  SCAN_FORMATS,
  createScanGate,
  normalizeScanned,
  scanBox,
} from './scanEngine.js';

/** جذرُ الأصول — يصحّ في البناء (`/warehouse-system/`) وفي التطوير. */
function assetBase() {
  const raw = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return raw.endsWith('/') ? raw : raw + '/';
}

let loading = null;

/** يحمّل المكتبة مرّةً واحدة للصفحة — واستدعاءان متزامنان ينتظران وعدًا واحدًا. */
export function ensureScannerLibrary() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${assetBase()}lib/html5-qrcode.min.js`;
    s.async = true;
    s.onload = () => {
      if (window.Html5Qrcode) resolve(window.Html5Qrcode);
      else reject(new Error('html5-qrcode load failed — الملفّ موجودٌ ولم يُعرَّف الصنف'));
    };
    s.onerror = () => reject(new Error('html5-qrcode load failed: ' + s.src));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null; // فشلٌ لا يُجمَّد: المحاولة التالية تُعيد التحميل
    throw e;
  });
  return loading;
}

/** البيئة الحقيقيّة — المتصفّح كما هو. */
function browserEnv() {
  return {
    isSecure: () => typeof window !== 'undefined' && Boolean(window.isSecureContext),
    hasCamera: () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
    loadLibrary: ensureScannerLibrary,
    formatTable: () => (typeof window !== 'undefined' ? window.Html5QrcodeSupportedFormats : null),
    // ساعةٌ رتيبة لا ساعةَ حائط: نافذةُ منع التكرار مدّةٌ لا لحظة، وضبطُ
    // ساعة الجهاز في منتصف الجرد يجب ألّا يفتح بابًا لقيدٍ مكرّر.
    now: () => globalThis.performance?.now?.() ?? 0,
  };
}

/** يترجم أسماء الصيغ إلى ثوابت المكتبة، ويتجاهل ما لا تعرفه نسختُها. */
export function formatCodes(table) {
  if (!table) return undefined;
  const codes = SCAN_FORMATS.map((name) => table[name]).filter((v) => typeof v === 'number');
  return codes.length ? codes : undefined;
}

/** خطأٌ مسمّى — الاسم هو ما تقرؤه `cameraErrorText` فتُخرج رسالةً ذات مخرج. */
function named(name, message) {
  const err = new Error(message);
  err.name = name;
  return err;
}

/**
 * يفتح الكاميرا داخل العنصر `elementId` ويستدعي `onCode` عند كلّ قراءةٍ جديدة.
 *
 * يُعيد `stop()` — والإيقافُ **آمنٌ مهما تكرّر**، لأنّ الشاشة قد تُغلق
 * بالزرّ وبتفكيك المكوّن معًا، وتركُ مسارِ فيديو مفتوحًا يُبقي ضوء الكاميرا
 * مشتعلًا ويستنزف بطّاريّة الجهاز الميدانيّ.
 */
export async function startCameraScan({ elementId, onCode, onReady, env = browserEnv() }) {
  if (!env.isSecure()) throw named('SecurityError', 'insecure context');
  if (!env.hasCamera()) throw named('NotFoundError', 'no getUserMedia');

  const Html5Qrcode = await env.loadLibrary();
  const gate = createScanGate();
  const scanner = new Html5Qrcode(elementId, {
    verbose: false,
    formatsToSupport: formatCodes(env.formatTable()),
    // الكاشفُ العتاديّ حيث وُجد — من داخل المكتبة، بلا فرعٍ عندنا.
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });

  let stopped = false;
  await scanner.start(
    { facingMode: 'environment' },
    {
      fps: 12,
      qrbox: (w, h) => scanBox(w, h),
      disableFlip: false,
    },
    (decoded) => {
      const code = normalizeScanned(decoded);
      if (gate.accept(code, env.now())) onCode?.(code);
    },
    () => {
      /* إطارٌ بلا باركود — الحالة الطبيعيّة، ولا تُعرض للعامل. */
    }
  );
  onReady?.();

  return async function stop() {
    if (stopped) return;
    stopped = true;
    try {
      await scanner.stop();
    } catch {
      /* أُوقفت من قبل — لا يعني شيئًا */
    }
    try {
      scanner.clear();
    } catch {
      /* العنصر رُفع مع المكوّن */
    }
  };
}
