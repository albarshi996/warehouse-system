/**
 * ═══════════════════════════════════════════════════════════════════
 *  النسخة الاحتياطيّة على الجهاز — الحبلُ الأخير حين يرفض الخادم
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ ولمَ نسخةٌ ثانيةٌ وFirestore يحفظ على القرص أصلًا؟ ═══
 * لأنّ طابور Firestore يحفظ **ما ينوي إرساله**، لا **ما وقع فعلًا**. وبينهما
 * فرقٌ يظهر في ثلاث حالاتٍ كلُّها واقعة:
 *
 *   ★ **الرفض النهائيّ:** الجلسة أُقفلت والقيد في الطابور — يرتدّ
 *     `permission-denied` فيُسقطه العميل ويُنظّف الطابور. عملُ العادّ يختفي
 *     من الجهاز والسحابة معًا، وكأنّه لم يعدّ شيئًا.
 *   ★ **مسحُ بيانات المتصفّح:** هاتفٌ يُنظَّف أو تطبيقٌ يُعاد تثبيته.
 *   ★ **جهازٌ آخر:** بدّل العادّ هاتفه، فالطابور بقي في الأوّل.
 *
 * فهذه النسخة تُكتب **لحظة الحفظ**، قبل أن يُعرف مصيرُ الإرسال. وهي **ليست
 * مصدر حقيقة** — مصدرُها دفترُ السحابة الملحق-فقط. وإنّما هي ما يُصدَّر إكسل
 * فيُعاد إدخالُه في جلسةٍ جديدة حين يضيع الأصل. ورقةُ نجاةٍ لا سجلٌّ مُنافس.
 *
 * ═══ والتخزين يُحقَن ولا يُستورد ═══
 * الدالّة تأخذ `store` بواجهة `localStorage` (`getItem`/`setItem`/`removeItem`)
 * — فتُختبر في Node بلا متصفّح، ولا تنهار حين يُمنع التخزين (تصفّحٌ خاصّ،
 * أو حصّةٌ ممتلئة). **وكلُّ فشلٍ يُبتلع صامتًا عمدًا:** نسخةٌ احتياطيّة تُسقط
 * عمليّةَ الحفظ الأصليّة عكسُ الغرض منها تمامًا.
 *
 * بلا Firestore وبلا DOM.
 */

const PREFIX = 'bzScanBackup';

/** سقفُ ما يُحفظ لكلّ جلسة — جردٌ حقيقيٌّ لا يبلغ ألفَين، وحصّةُ المتصفّح تبلغ. */
export const MAX_ENTRIES = 2000;

/** مفتاحُ الجلسة في التخزين — مرجعٌ واحدٌ يمنع اختلاف الكاتب عن القارئ. */
export function backupKey(opId) {
  return `${PREFIX}:${String(opId || '').trim()}`;
}

/** قراءةٌ آمنة: أيُّ عطبٍ في التخزين أو في الـJSON يُعيد قائمةً فارغة. */
function safeRead(store, key) {
  try {
    const raw = store?.getItem?.(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * قيودُ الجلسة المحفوظة محليًّا — الأقدمُ أوّلًا كما كُتبت.
 * @returns {object[]}
 */
export function readBackup(store, opId) {
  if (!opId) return [];
  return safeRead(store, backupKey(opId));
}

/**
 * يُلحق قيدًا بالنسخة المحلّيّة — **ولا يرمي أبدًا**.
 *
 * والتجاوزُ يُسقط الأقدم لا الأحدث: حين تمتلئ الحصّة، آخرُ ما عُدّ أولى
 * بالبقاء ممّا عُدّ قبل ساعتين ووصل السحابةَ على الأرجح.
 *
 * @param {Storage} store
 * @param {string} opId
 * @param {object} entry القيد كما حُفظ (باركود · اسم · كمّيّة · وحدة · أساس)
 * @param {{max?:number, now?:number, byName?:string, opCode?:string}} [meta]
 * @returns {object[]} القائمة بعد الإلحاق (أو ما أمكن قراءته عند الفشل)
 */
export function appendBackup(store, opId, entry, meta = {}) {
  if (!opId || !entry) return readBackup(store, opId);
  const max = Number(meta.max) > 0 ? Number(meta.max) : MAX_ENTRIES;
  const list = readBackup(store, opId);
  list.push({
    ...entry,
    byName: meta.byName ?? entry.byName ?? '',
    opCode: meta.opCode ?? '',
    savedAt: Number.isFinite(Number(meta.now)) ? Number(meta.now) : null,
  });
  const trimmed = list.length > max ? list.slice(list.length - max) : list;
  try {
    store?.setItem?.(backupKey(opId), JSON.stringify(trimmed));
  } catch {
    // حصّةٌ ممتلئة أو تخزينٌ ممنوع — النسخة تسقط والحفظ الأصليّ يمضي.
  }
  return trimmed;
}

/** يمحو نسخة الجلسة — تُستدعى بعد إقفالٍ ناجحٍ وطابورٍ خالٍ لا قبله. */
export function clearBackup(store, opId) {
  try {
    store?.removeItem?.(backupKey(opId));
  } catch {
    /* لا شيء يُفعل — ولا يُسقط شيئًا */
  }
}

/**
 * جلساتٌ لها نسخةٌ محلّيّةٌ على هذا الجهاز — لبطاقة «استأنف جلستك».
 *
 * ويُمسح المفتاحُ الفارغُ في المرور: بقايا جلسةٍ حُفظت ثمّ فرغت لا تُعرض
 * سطرًا كاذبًا يقول «عندك عملٌ محفوظ» وليس فيه شيء.
 *
 * @param {Storage} store
 * @returns {{opId:string, count:number}[]}
 */
export function listBackups(store) {
  const out = [];
  let n = 0;
  try {
    n = Number(store?.length) || 0;
  } catch {
    return out;
  }
  const keys = [];
  for (let i = 0; i < n; i++) {
    try {
      const k = store.key?.(i);
      if (typeof k === 'string' && k.startsWith(`${PREFIX}:`)) keys.push(k);
    } catch {
      /* مفتاحٌ تعذّرت قراءته — يُتجاوز */
    }
  }
  for (const k of keys) {
    const opId = k.slice(PREFIX.length + 1);
    const count = safeRead(store, k).length;
    if (count > 0) out.push({ opId, count });
  }
  return out;
}

/**
 * صفوفُ التصدير — أعمدةٌ عربيّةٌ تفتح في إكسل كما هي.
 *
 * والوحدةُ عمودٌ مستقلّ (CAP-103): «٥» وحدَها رقمٌ بلا معنى، و«٥ كرتون» بيان.
 * والوقتُ ساعةُ الجهاز لا الخادم — فالقيد لم يبلغ الخادم أصلًا، ويُسمّى
 * العمودُ بذلك صراحةً كي لا يُقرأ وقتًا معتمَدًا.
 *
 * دالّةٌ خالصة: تُختبر وحدها، والزرُّ في الشاشة يستدعيها ولا يُعيد بناءها.
 */
export function backupExportRows(entries, { formatTime } = {}) {
  const fmt = typeof formatTime === 'function' ? formatTime : (v) => (v ? new Date(v).toISOString() : '—');
  return (Array.isArray(entries) ? entries : []).map((e) => ({
    'الباركود': String(e?.barcode ?? ''),
    'كود الصنف': String(e?.sku ?? ''),
    'الصنف': String(e?.name ?? ''),
    'الكمّيّة': Number(e?.qty) || 0,
    'الوحدة': String(e?.uom ?? ''),
    'الكمّيّة بوحدة الأساس': e?.baseQty == null ? '—' : Number(e.baseQty),
    'العادّ': String(e?.byName ?? ''),
    'رمز الجلسة': String(e?.opCode ?? ''),
    'وقت الجهاز': fmt(e?.savedAt),
  }));
}
