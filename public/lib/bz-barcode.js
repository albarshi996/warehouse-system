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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('load failed: ' + src));
      document.head.appendChild(s);
    });
  }

  // الأصل المحلي فقط — لا رجوع لأي CDN (قاعدة الأوفلاين 100%: شبكة المستودع
  // غير مضمونة، والاعتماد الصامت على الإنترنت يُخفي نقص ملفٍّ يجب إصلاحه).
  async function ensureHtml5Qrcode() {
    if (window.Html5Qrcode) return;
    await loadScript(LOCAL);
    if (!window.Html5Qrcode) throw new Error('html5-qrcode unavailable — تحقق من وجود public/lib/html5-qrcode.min.js');
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
        if (busy || now - lastAt < 250) return [];
        if (!video.videoWidth) return [];
        busy = true;
        lastAt = now;
        try {
          /* كانت التجربة على آيفون «سيئة جدًا» لسببين قتلناهما هنا:
             ١) الإطار كان يُرمَّز كاملًا بدقته الخام و**PNG** (أبطأ ترميز) —
                صار قصًّا للمنطقة المركزية (80%×60% حيث يوجّه الموظف الباركود
                طبيعيًّا) بسقف عرض 1000px و**JPEG** — أسرع بمرات وأدقّ فكًّا
                لباركود 1D لأن الضجيج المحيطي خرج من الصورة.
             ٢) الخمود نزل 350→250ملّي لأن كلفة المحاولة انخفضت. */
          const vw = video.videoWidth, vh = video.videoHeight;
          const cw = Math.round(vw * 0.8), ch = Math.round(vh * 0.6);
          const cx = Math.round((vw - cw) / 2), cy = Math.round((vh - ch) / 2);
          const scale = Math.min(1, 1000 / cw);
          canvas.width = Math.round(cw * scale);
          canvas.height = Math.round(ch * scale);
          ctx.drawImage(video, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.72));
          if (!blob) return [];
          const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
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
