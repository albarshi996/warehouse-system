/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  سياسةُ العلامة المائيّة — أيُّ مسارٍ يُقرأ تدريجيًّا، وبأيّ وتيرة، وبكم قراءة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **وحدةٌ خالصة**: بلا استيرادٍ واحد، وبلا Firebase ولا قاعدة. كلُّ قرارٍ
 *     هنا دالّةٌ تأخذ جردًا وتُعيد خطّة — ولذلك يُبرهن عليها في Node العاري.
 *     وهذا مقصود: المزامنةُ التي لا يُبرهن على حسابها **يُستبدل بها عطبٌ بعطب**.
 *
 * ═══ ثلاثةُ دروسٍ قاسها هذا الملفّ، وكلٌّ منها كان سيمرّ صامتًا ═══
 *
 * ★★★ **١ · ختمُ الإنشاء ليس ختمَ تعديل.** ستّةُ مساراتٍ (`operations` ·
 *     `receiving_sessions` · `crews` · `labor_tasks` · `warehouses` ·
 *     `hiring_requests`) تحمل `createdAt` وحدَه بتغطيةٍ كاملة. ولو اتُّخذ
 *     علامةً مائيّةً — وهو ما يغري شكلُه — لصار الحكمُ: «اقرأ ما أُنشئ بعد W».
 *     فمستندٌ أُنشئ أمسِ وعُدّل اليومَ **لا يُقرأ أبدًا**. لا خطأَ يُرفع، ولا
 *     سطرَ يُسجَّل: فرقٌ صامتٌ يكبر كلَّ يوم. ⇒ **المسحُ الكاملُ هو الصواب**،
 *     وثمنُه ثمانيةٌ وعشرون سجلًّا.
 *
 * ★★ **٢ · وختمُ الإنشاء يصلح علامةً — بشرطٍ واحدٍ يُشتقّ لا يُفترض:** أن
 *    تكون المجموعةُ ملحقةً-فقط. وهذا **مُعلَنٌ في `firestore.rules`** بـ
 *    `allow update, delete: if false` — فنشتقُّه اشتقاقًا (`rules-paths.js`)
 *    بدل قائمةٍ مكتوبةٍ باليد تتقادم عند أوّل مجموعةٍ جديدة.
 *
 * ★★★ **٣ · الوتيرةُ الموحّدةُ هي العطبُ نفسُه بثوبٍ جديد.** المجموعاتُ
 *     الفرعيّةُ تُقرأ **أبًا أبًا** (لا `collectionGroup` بلا فهرس)، و
 *     `documents` لها ثلاثُ مجموعاتٍ فرعيّةٍ ومئةٌ وخمسةٌ وسبعون مستندًا ⇒
 *     **٥٢٥ استعلامًا في الدورة الواحدة**. وبوتيرةِ دقيقتين: **٤٥٨٬٦٤٠ قراءةً
 *     يوميًّا** — تسعةُ أضعاف الحصّة المجّانيّة، **وسبعةُ أضعافِ الـ٦١٠٠٠ التي
 *     أوقفت البوّابةَ أصلًا**. والفرقُ أنّ هذه تعمل ليلًا ونهارًا بلا موظّفٍ
 *     يشتكي. ⇒ فالخطّةُ تُقاس قبل أن تُبنى، والميزانيّةُ **شرطُ قبولٍ في
 *     الاختبار** لا ملاحظةٌ في تعليق.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** نمطُ قراءةِ المسار. */
export const MODE = {
  /** يُقرأ ما تغيّر بعد العلامة وحدَه. */
  INCREMENTAL: 'incremental',
  /** يُقرأ كاملًا كلَّ دورة — لا علامةَ يُوثق بها. */
  FULL: 'full',
};

/** الحقولُ التي تُختم عند **كلّ** كتابة ⇒ تصلح علامةً لأيّ مجموعة. */
export const MODIFICATION_MARKS = ['updatedAt'];

/** الحقولُ التي تُختم عند الإنشاء ⇒ تصلح علامةً **للملحقة-فقط وحدَها**. */
export const APPEND_MARKS = ['at', 'createdAt'];

/** الوتيرةُ بالدقائق. */
export const TIER = { HOT: 2, WARM: 15, COLD: 60 };

/** حصّةُ Firestore المجّانيّة — قراءاتٌ في اليوم. */
export const FREE_TIER_READS_PER_DAY = 50000;

/**
 * سقفُ المزامنة. أقلُّ من نصف الحصّة عمدًا: **البوّابةُ تقرأ أيضًا**،
 * والمزامنةُ ضيفٌ على حصّتها لا صاحبُها.
 */
export const BUDGET_READS_PER_DAY = 20000;

/**
 * تداخلٌ زمنيٌّ يُطرح من العلامة عند كلّ قراءة.
 *
 * ★ لماذا؟ `serverTimestamp()` يُحسم لحظةَ وصولِ الكتابة إلى الخادم، فترتيبُه
 *   ترتيبُ الإيداع. لكنّ القراءةَ لقطةٌ، والحدَّ الحادَّ لا يسامح. وثمنُ إعادةِ
 *   قراءةِ دقيقةٍ **صفرٌ** لأنّ الكتابةَ `ON CONFLICT DO UPDATE`، وثمنُ فقدِ
 *   صفٍّ واحدٍ فرقٌ لا يُكتشف. فالتداخلُ تأمينٌ مجّانيّ.
 */
export const OVERLAP_MS = 60000;

/** المساراتُ التي وتيرتُها لا تتبع حجمَها — وكلُّ استثناءٍ بسببه. */
const TIER_OVERRIDES = {
  // سجلّان اثنان، فحجمُه يقول «بارد». لكنّه **مصدرُ الترقيم**: تأخّرُه ساعةً
  // يعني رقمًا مكرّرًا لحظةَ التحويل. فيبقى دافئًا حتّى تصير القاعدةُ هي الأصل.
  counters: TIER.WARM,
};

/**
 * حقلٌ **بتغطيةٍ كاملة**: موجودٌ في كلّ مستندٍ في المسار.
 * وتغطيةٌ جزئيّةٌ لا تكفي — مستندٌ بلا الحقل لا يظهر في استعلامٍ مرتَّبٍ عليه،
 * فيسقط من المزامنة صامتًا. (وفي القياس: `preparatory_meetings.createdAt`
 * أربعةٌ من خمسة — فلو قُبلت التغطيةُ الجزئيّةُ لضاع اجتماعٌ كاملٌ بلا أثر.)
 */
function covers(entry, field) {
  const n = entry && entry.count;
  return Boolean(n) && entry.fields && entry.fields[field] === n;
}

/**
 * قرارُ نمطِ القراءة لمسارٍ واحد.
 *
 * @param {string} path
 * @param {{count:number, fields:Record<string,number>}} entry  جردُ المسار
 * @param {Set<string>} appendOnly  المجموعاتُ الملحقةُ-فقط (من القواعد)
 * @returns {{mode:string, field:string|null, why:string}}
 */
export function markFor(path, entry, appendOnly) {
  for (const f of MODIFICATION_MARKS) {
    if (covers(entry, f)) {
      return { mode: MODE.INCREMENTAL, field: f, why: 'ختمُ تعديلٍ بتغطيةٍ كاملة: ' + f };
    }
  }

  if (appendOnly.has(path)) {
    for (const f of APPEND_MARKS) {
      if (covers(entry, f)) {
        return { mode: MODE.INCREMENTAL, field: f, why: 'ملحقةٌ-فقط وختمُها كامل: ' + f };
      }
    }
  }

  // ★★★ هنا يُرفض ختمُ الإنشاء للمجموعات المتغيّرة — وهذا هو الدرسُ الأوّل.
  const creation = APPEND_MARKS.find((f) => covers(entry, f));
  if (creation) {
    return {
      mode: MODE.FULL,
      field: null,
      why: creation + ' ختمُ إنشاءٍ والمجموعةُ تُعدَّل ⇒ التعديلاتُ لا تحرّكه',
    };
  }

  return { mode: MODE.FULL, field: null, why: 'لا ختمَ بتغطيةٍ كاملة' };
}

/**
 * الوتيرةُ بالدقائق — تُشتقّ من الحجم المقيس، وتُنقض بجدول الاستثناءات.
 * @param {string} path
 * @param {{count:number}} entry
 */
export function tierFor(path, entry) {
  if (TIER_OVERRIDES[path]) return TIER_OVERRIDES[path];
  if (entry.count >= 100) return TIER.HOT;
  if (entry.count >= 10) return TIER.WARM;
  return TIER.COLD;
}

/**
 * عددُ الاستعلامات التي يكلّفها مسارٌ في الدورة الواحدة.
 *
 * ★★★ **هنا يسكن العطب.** المجموعةُ الفرعيّةُ بلا `collectionGroup` تُقرأ
 *     أبًا أبًا، فكلفتُها عددُ آبائها لا واحدًا. و`documents/audit` وحدَها
 *     مئةٌ وخمسةٌ وسبعون استعلامًا. ⇒ وبلا فهرسٍ تُجبَر الفرعيّاتُ كلُّها على
 *     «بارد»، وإلّا خرقت الميزانيّةَ بمفردها.
 *
 * وقراءةٌ واحدةٌ تُحتسب لكلّ استعلامٍ ولو عاد فارغًا — قاعدةُ تسعير Firestore.
 */
export function queriesPerCycle(path, inventory, collectionGroup) {
  if (!path.includes('/')) return 1;
  if (collectionGroup) return 1;
  const parent = path.split('/').slice(0, -1).join('/');
  const p = inventory[parent];
  return p ? p.count : 0;
}

/**
 * الخطّةُ الكاملة: لكلّ مسارٍ نمطُه وحقلُه ووتيرتُه وكلفتُه.
 *
 * @param {Record<string, {count:number, fields?:Record<string,number>}>} inventory
 * @param {{appendOnly:Set<string>, collectionGroup?:boolean}} opts
 */
export function planFor(inventory, opts) {
  const appendOnly = opts.appendOnly;
  const collectionGroup = Boolean(opts.collectionGroup);
  // ★★★ قائمةُ المسارات مرجعُها **القواعدُ** لا الجرد. ولو اشتُقّت من الجرد
  //     وحدَه، لصارت مجموعةٌ أُضيفت بعد آخر قياسٍ **غيرَ مرئيّةٍ للمزامنة
  //     أصلًا** — لا تُقرأ ولا يُشتكى منها. والمجهولُ يأخذ أضعفَ افتراض:
  //     مسحٌ كاملٌ بوتيرةٍ باردة، فيُقرأ ولو لم يُقَس بعد.
  const paths = opts.paths || Object.keys(inventory);
  const plan = {};

  for (const path of paths) {
    const entry = inventory[path] || { count: 0, fields: {} };
    const mark = markFor(path, entry, appendOnly);
    const sub = path.includes('/');
    // بلا فهرسِ مجموعةٍ، الفرعيّةُ باردةٌ مهما كان حجمُها — الكلفةُ لا الحاجة.
    const tier = sub && !collectionGroup ? TIER.COLD : tierFor(path, entry);
    plan[path] = {
      mode: mark.mode,
      field: mark.field,
      why: mark.why,
      tier,
      queries: queriesPerCycle(path, inventory, collectionGroup),
    };
  }
  return plan;
}

/**
 * أرضيّةُ القراءات اليوميّة: ما تكلّفه المزامنةُ **ولو لم يتغيّر شيء**.
 * وهذا هو الرقمُ الذي يُقارن بالحصّة — لا متوسّطُ يومٍ نشط.
 */
export function idleReadsPerDay(plan) {
  let total = 0;
  for (const p of Object.values(plan)) {
    total += p.queries * Math.floor(1440 / p.tier);
  }
  return total;
}

/**
 * العلامةُ التاليةُ بعد دفعة.
 *
 * ★ تتقدّم **بأقصى ما رأته فعلًا** لا بساعة الجهاز: ساعةُ الحاوية المنحرفةُ
 *   دقيقةً إلى الأمام تقفز فوق صفوفٍ لم تُقرأ قطّ. والقيمةُ المقروءةُ من
 *   الخادم لا تكذب.
 *
 * @param {string|null} previous  ISO أو null
 * @param {Array<Record<string, unknown>>} rows
 * @param {string|null} field
 * @returns {string|null}
 */
export function advanceWatermark(previous, rows, field) {
  if (!field) return null;
  let best = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const raw = row ? row[field] : null;
    const iso = raw && typeof raw === 'object' && raw.__type === 'timestamp' ? raw.iso : raw;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > best) best = t;
  }

  if (best === Number.NEGATIVE_INFINITY) return previous || null;
  return new Date(best).toISOString();
}

/** بدايةُ نافذة القراءة: العلامةُ ناقصَ التداخل. و`null` تعني «من الأوّل». */
export function windowStart(watermark, overlapMs) {
  if (!watermark) return null;
  const lag = overlapMs === undefined ? OVERLAP_MS : overlapMs;
  const t = Date.parse(watermark);
  return Number.isNaN(t) ? null : new Date(t - lag).toISOString();
}

/** هل حان دورُ هذا المسار في هذه الدقيقة من التشغيل؟ */
export function isDue(plan, path, minutesElapsed) {
  const entry = plan[path];
  return Boolean(entry) && minutesElapsed % entry.tier === 0;
}
