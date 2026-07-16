/**
 * كاشف باركود موحّد — يعمل على كل الأجهزة، وأهمّها **آيفون/سفاري**.
 *
 * المشكلة التي يحلّها: شاشة الجرد كانت تعتمد `BarcodeDetector` الأصلي وحده،
 * وهو **غير موجود في سفاري/iOS** — فموظّف بآيفون لم يكن يستطيع المسح إطلاقًا،
 * وكانت الرسالة الوحيدة «استخدم Chrome أو Edge». هذا لا يصلح لعمل ميداني.
 *
 * الحل: واجهة واحدة `detect(video) → [{ rawValue }]` بمسارين:
 *   1. الأصلي `BarcodeDetector` حيث توفّر (أندرويد/كروم) — سريع بلا تحميل.
 *   2. الاحتياطي `html5-qrcode` (ZXID، مكتبة محلية عندنا) — على آيفون وغيره:
 *      نلتقط إطارًا من الفيديو إلى Canvas، ونفكّه صورةً. أبطأ لكنه يعمل.
 *
 * الاستدعاء لا يتغيّر: نفس حلقة requestAnimationFrame القائمة تنادي detect().
 */
(function () {
  // المسار المحلي يُشتقّ من موقع هذا الملف نفسه (public/lib/) — لا من عمق
  // الصفحة المستدعية، فيصحّ سواءٌ نُودي من /dashboard/… أو من /forms/….
  const SELF = document.currentScript && document.currentScript.src;
  const LOCAL = SELF ? SELF.replace(/bz-barcode\.js.*$/, 'html5-qrcode.min.js') : '../lib/html5-qrcode.min.js';
  const CDN = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('load failed: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureHtml5Qrcode() {
    if (window.Html5Qrcode) return;
    try {
      await loadScript(LOCAL);
    } catch {
      await loadScript(CDN); // احتياط لو نقص الملف المحلي
    }
    if (!window.Html5Qrcode) throw new Error('html5-qrcode unavailable');
  }

  /** كاشف أصلي — يغلّف BarcodeDetector في نفس الواجهة. */
  function nativeDetector() {
    const formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf', 'data_matrix', 'pdf417'];
    const det = new window.BarcodeDetector({ formats });
    return {
      engine: 'native',
      detect: (video) => det.detect(video),
      dispose() {},
    };
  }

  /**
   * كاشف احتياطي — يفكّ إطار الفيديو صورةً عبر html5-qrcode.
   * الطبيعة ثقيلة، فنُخمِد المحاولات المتتابعة (لا نبدأ فكًّا وآخر جارٍ)،
   * ونُخمّد المعدّل (كل ~350ملّي) كي لا نُغرِق الجهاز.
   */
  async function fallbackDetector() {
    await ensureHtml5Qrcode();
    const holderId = 'bz-scan-fallback-holder';
    let holder = document.getElementById(holderId);
    if (!holder) {
      holder = document.createElement('div');
      holder.id = holderId;
      holder.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
      document.body.appendChild(holder);
    }
    const h5 = new window.Html5Qrcode(holderId, { verbose: false });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let busy = false;
    let lastAt = 0;

    return {
      engine: 'html5-qrcode',
      async detect(video) {
        const now = Date.now();
        if (busy || now - lastAt < 350) return [];
        if (!video.videoWidth) return [];
        busy = true;
        lastAt = now;
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          if (!blob) return [];
          const file = new File([blob], 'frame.png', { type: 'image/png' });
          const text = await h5.scanFile(file, false); // يرمي إن لم يُفكّ
          return text ? [{ rawValue: String(text) }] : [];
        } catch {
          return []; // لا باركود في هذا الإطار — طبيعي
        } finally {
          busy = false;
        }
      },
      dispose() {
        try {
          h5.clear();
        } catch {
          /* تجاهل */
        }
      },
    };
  }

  /**
   * يبني الكاشف الأنسب للجهاز. يُعيد وعدًا بكائن فيه detect/dispose/engine.
   * لا يفشل على آيفون — يسقط تلقائيًّا على الاحتياطي.
   */
  window.BZBarcode = {
    supportsNative() {
      return 'BarcodeDetector' in window;
    },
    async createDetector() {
      if (this.supportsNative()) {
        try {
          return nativeDetector();
        } catch {
          /* نادر — نُكمل للاحتياطي */
        }
      }
      return fallbackDetector();
    },
  };
})();
