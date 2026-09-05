/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ذاكرةُ كتالوج الأصناف — منطقٌ خالص، بلا Firebase وبلا متصفّح
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ العطبُ الذي وُجد لأجله (قِيس من لوحة Firebase 2026-09-05) ═══
 * `subscribeItems` كان يفتح مستمعًا حيًّا على **١١٧٣ صنفًا** في كلّ استدعاء،
 * ويُستدعى من **١٦ شاشة**. والبوّابةُ صفحاتٌ منفصلة (Astro)، فكلُّ انتقالٍ
 * إعادةُ تحميلٍ كاملة ⇒ إعادةُ قراءةِ الكتالوج كلِّه.
 *
 *   ١١٧٣ قراءةً × ٥٢ فتحةَ شاشةٍ = **٦١٠٠٠** — وهو الرقمُ الذي ظهر في اللوحة.
 *   والحدُّ المجّانيُّ ٥٠٠٠٠ يوميًّا، فنفدت الحصّةُ عند الثالثة عصرًا وتوقّفت
 *   القراءات. وأضافت ترقياتُ الأمس شاشتين تستدعيانها فانفجر ما كان يتأرجح.
 *
 * ★★★ والدليلُ القاطعُ على أنّ العلّة قراءةٌ لا كتابة: **٦١ ألفَ قراءةٍ مقابل
 *     ٣٦ كتابةً**. لا أحدَ يكتب — الجميعُ يقرأ نفسَ الكتالوج مرارًا.
 *
 * ═══ والعلاج ═══
 * الكتالوجُ يتغيّر نادرًا (٣٦ كتابةً في اليوم كلِّه عبر المجموعات جميعًا)،
 * فيُقرأ **مرّةً** ويُحفظ محلّيًّا ويُخدَم منه. والقراءةُ من القرص لا تُحسب.
 *
 * ★★ وهذا الملفّ **لا يعرف Firestore ولا `localStorage`**: يأخذ القيمَ ويحكم
 *    عليها، فيُختبَر في Node بلا سحابةٍ ولا متصفّح. والوصلُ في `itemService.js`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** مفتاحُ الخزن. النسخةُ في الاسم: تغييرُ الشكل يُبطل القديمَ بلا ترحيل. */
export const CACHE_KEY = 'bz.items.v1';

/** نصفُ يوم. الكتالوجُ يتغيّر نادرًا، والكتابةُ تُبطل الذاكرةَ فورًا على أيّة حال. */
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * يغلّف القائمةَ للخزن.
 * @param {object[]} items
 * @param {number} now
 */
export function packCache(items, now) {
  return JSON.stringify({ v: 1, at: now, items: Array.isArray(items) ? items : [] });
}

/**
 * يفكّ ما خُزن، ويرفض كلَّ ما لا يُوثق به.
 *
 * ★ يُعيد `null` عند أيّ شكٍّ — نصٌّ فاسدٌ أو نسخةٌ أخرى أو حقلٌ ناقص. والرجوعُ
 *   إلى الشبكة أرخصُ ألفَ مرّةٍ من خدمة كتالوجٍ نصفِ مقروء: صنفٌ ناقصٌ في
 *   شاشة الجرد يعني مسحةً لا تُعرَف، والعادُّ يظنّ الصنفَ غيرَ مسجَّل.
 *
 * @param {string|null|undefined} raw
 * @returns {{at:number, items:object[]}|null}
 */
export function unpackCache(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.v !== 1) return null;
  if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
  if (!Array.isArray(parsed.items)) return null;
  return { at: parsed.at, items: parsed.items };
}

/**
 * هل الذاكرةُ ما زالت صالحة؟
 *
 * ★ وطابعٌ من المستقبل يُعدّ فاسدًا: ساعةُ الجهاز قد تُضبط للخلف، فتصير ذاكرةٌ
 *   قديمةٌ «طازجةً أبدًا» ولا تتجدّد. والخطأُ في هذا الاتّجاه صامتٌ لا يُرى.
 *
 * @param {{at:number}|null} entry
 * @param {number} now
 * @param {number} [ttl]
 */
export function isFresh(entry, now, ttl = CACHE_TTL_MS) {
  if (!entry || typeof entry.at !== 'number') return false;
  const age = now - entry.at;
  return age >= 0 && age < ttl;
}

/**
 * ترشيحُ المؤرشفة. الذاكرةُ تحفظ **كلَّ** الأصناف، والترشيحُ عند التسليم —
 * فشاشةٌ تطلب المؤرشفةَ وأخرى لا تطلبها تشتركان في قراءةٍ واحدة.
 *
 * @param {object[]} items
 * @param {boolean} includeArchived
 */
export function selectItems(items, includeArchived) {
  const list = Array.isArray(items) ? items : [];
  return includeArchived ? list.slice() : list.filter((it) => !it?.archived);
}
