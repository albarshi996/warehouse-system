/**
 * ═══ حكمُ القراءة — منطقٌ خالصٌ لا يعرف متصفّحًا ولا كاميرا ═══
 *
 * ★ **لماذا وُجد هذا الملف؟** لأنّ الماسح كان لا يقرأ. والسببُ واحدٌ في كلّ
 * الشاشات: الشاشةُ الوحيدة التي فتحت كاميرا اشترطت `BarcodeDetector` الأصليّ،
 * وهو **غائبٌ عن آيفون كلّه، وعن كروم ويندوز، وعن فايرفوكس وسفاري** — فالزرّ
 * لا يظهر أصلًا (`supportsCamera` كان false)، فيقول العامل «لا يقرأ» وهو محقّ.
 * وباقي شاشات المسح (الطبالي · السحب · التخزين الموجّه · لوحة العامل) لم تكن
 * فيها كاميرا إطلاقًا.
 *
 * والقاعدة الحاكمة: **النواة تكبر ولا يُبنى بجانبها** — فمحرّكُ قراءةٍ واحدٌ
 * لكلّ البوابة، وحكمُه هنا خالصًا مُختبَرًا، والمتصفّحُ في `cameraScanner.js`
 * والواجهةُ في `useBarcodeCamera.js`. لا شرطَ يُكتب في شاشة.
 */

/**
 * الصيغ المطلوبة ميدانيًّا، بأسماء `Html5QrcodeSupportedFormats`.
 *
 * ★ التقييد مقصود: كلّ صيغةٍ زائدةٍ تُكلّف المحرّك محاولةَ فكٍّ على كلّ إطار،
 * فتبطؤ القراءة على هاتفٍ متوسّط. وهذه العشرة تغطّي بضاعة المستودع:
 * `EAN/UPC` للمنتج المعبّأ، و`CODE_128/39` و`ITF` للملصق الداخليّ والكرتونة،
 * و`QR/DATA_MATRIX` لهويّة الطبلية والموقع.
 */
export const SCAN_FORMATS = [
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'UPC_EAN_EXTENSION',
  'CODE_128',
  'CODE_39',
  'ITF',
  'CODABAR',
  'QR_CODE',
  'DATA_MATRIX',
];

/** الصيغ نفسها بأسماء `BarcodeDetector` الأصليّ (حين يُستعمل مباشرةً). */
export const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
];

/**
 * تنظيف ما تُخرجه القراءة قبل أن يراه المنطق.
 *
 * ★ جهازُ الباركود السلكيّ (wedge) يُلحق بالقيمة `Enter` وأحيانًا `Tab` أو
 * `CR`، وبعض الطُّرُز تُقدّم بادئةً غير مطبوعة. وباركودٌ فيه محرفٌ خفيّ
 * **لا يطابق الماستر** فيظهر الصنف «مجهولًا» بلا سبب — وهذا عطلٌ يُشخَّص
 * خطأً على أنّه «الماسح لا يقرأ».
 */
export function normalizeScanned(raw) {
  if (raw == null) return '';
  return String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\u200f|\u200e/g, '')
    .trim();
}

/**
 * بوّابةُ التكرار: الكاميرا تُبلّغ الباركود نفسه عشراتِ المرّات في الثانية
 * ما دام أمام العدسة. بلا هذه البوّابة يُسجَّل الصنف عشر مرّاتٍ بمسحةٍ واحدة
 * — وهذا **أخطر من ألّا يقرأ**، لأنّه يفسد الجرد صامتًا.
 *
 * `windowMs` هي المهلة التي يُتجاهل فيها تكرارُ نفس القيمة. قيمةٌ مختلفة
 * تمرّ فورًا: العادّ الذي يمسح صنفين متتاليين لا ينتظر.
 */
export function createScanGate({ windowMs = 1500 } = {}) {
  let lastCode = '';
  let lastAt = -Infinity;
  return {
    /** يُعيد true إن كانت القراءة جديرةً بالتمرير. */
    accept(code, now) {
      const clean = normalizeScanned(code);
      if (!clean) return false;
      const at = Number.isFinite(now) ? now : 0;
      if (clean === lastCode && at - lastAt < windowMs) return false;
      lastCode = clean;
      lastAt = at;
      return true;
    },
    reset() {
      lastCode = '';
      lastAt = -Infinity;
    },
  };
}

/**
 * رسالةُ تعذّرِ الكاميرا بلسانٍ يفهمه العامل ويعرف منه ماذا يفعل.
 *
 * ★ **لا رسالةَ بلا مخرج**: كلّ حالةٍ تنتهي بجملة «اكتب الباركود» أو
 * «استعمل جهاز الباركود» — فالعمل لا يقف على عطل عدسة.
 */
export function cameraErrorText(err, { secure = true } = {}) {
  if (!secure) {
    return 'الكاميرا لا تُفتح إلّا على اتصالٍ آمن (https) — افتح الرابط الرسميّ، أو اكتب الباركود.';
  }
  const name = String(err?.name || err?.code || '');
  const msg = String(err?.message || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'أذن الكاميرا مرفوض — افتحه من إعدادات المتصفّح لهذا الموقع، أو استعمل جهاز الباركود أو اكتبه.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'لا كاميرا في هذا الجهاز — استعمل جهاز الباركود أو اكتبه.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'الكاميرا مشغولةٌ بتطبيقٍ آخر — أغلقه ثمّ أعد المحاولة، أو اكتب الباركود.';
  }
  if (/html5-qrcode|library|load failed/i.test(msg)) {
    return 'تعذّر تحميل محرّك القراءة — أعد تحميل الصفحة، أو اكتب الباركود.';
  }
  return 'تعذّر فتح الكاميرا — استعمل جهاز الباركود أو اكتبه.';
}

/**
 * صندوقُ التصويب: مستطيلٌ عريضٌ منخفض لا مربّع.
 *
 * ★ لأنّ بضاعة المستودع باركودُها **خطّيّ** (EAN/CODE_128) وشكلُه شريطٌ
 * عريض؛ والمربّع الافتراضيّ (المصمَّم لـQR) يقتطع طرفَي الشريط فلا يُفكّ —
 * وهذا سببٌ شائعٌ لِـ«الكاميرا مفتوحة ولا تقرأ».
 */
export function scanBox(viewWidth, viewHeight) {
  const w = Math.max(0, Math.floor(Number(viewWidth) || 0));
  const h = Math.max(0, Math.floor(Number(viewHeight) || 0));
  if (!w || !h) return { width: 250, height: 150 };
  const width = Math.max(160, Math.round(Math.min(w, h * 2) * 0.86));
  const height = Math.max(90, Math.round(Math.min(h * 0.55, width * 0.55)));
  return { width: Math.min(width, w), height: Math.min(height, h) };
}
