/**
 * خطّة الزيارات الدائمة (PJP — Permanent Journey Plan).
 *
 * المشكلة: بلا خطّةٍ مسبقة يصير خطّ سير المندوب اجتهادًا يوميًّا — يزور القريب
 * ويؤجّل البعيد، ويكثر على من يشتري ويهجر من توقّف. فتنكشف التغطية بعد أشهر:
 * متاجرُ لم تُزَر منذ فصل، وأخرى زُيرت اثنتي عشرة مرّة. والخطّة تُحوّل السؤال
 * من «كم زيارةً نفّذ؟» إلى «كم من المخطّط نفّذ؟» — وهما سؤالان مختلفان تمامًا.
 *
 * التكرار يُحسب من `startDate` لا من «الآن»، فالخطّة تُجيب عن أيّ يومٍ سُئلت
 * عنه: أمسٍ لمراجعة ما فات، وغدٍ لتحضير الحمولة. ولذلك كلّ دالّةٍ هنا تأخذ
 * اليوم **صراحةً** ولا تقرأ الساعة — وهو أيضًا ما يجعلها قابلة للاختبار.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

/** أسبوع العمل الليبيّ: السبت ← الخميس، والجمعة عطلة. أرقام `getUTCDay`. */
export const WEEKDAYS = [
  { id: 6, labelAr: 'السبت' },
  { id: 0, labelAr: 'الأحد' },
  { id: 1, labelAr: 'الإثنين' },
  { id: 2, labelAr: 'الثلاثاء' },
  { id: 3, labelAr: 'الأربعاء' },
  { id: 4, labelAr: 'الخميس' },
  { id: 5, labelAr: 'الجمعة' },
];

/** دوريّات التزويد المتاحة. */
export const FREQUENCIES = {
  daily: { id: 'daily', labelAr: 'يوميًّا', weeks: 0 },
  weekly: { id: 'weekly', labelAr: 'أسبوعيًّا', weeks: 1 },
  biweekly: { id: 'biweekly', labelAr: 'كلّ أسبوعين', weeks: 2 },
  monthly: { id: 'monthly', labelAr: 'شهريًّا (كلّ ٤ أسابيع)', weeks: 4 },
};

const DAY_MS = 86400000;

/**
 * يقرأ `YYYY-MM-DD` كمنتصف ليل UTC. **عمدًا UTC لا محلّيًّا**: `new Date('2026-08-10')`
 * يُفسَّر UTC بينما `new Date(2026,7,10)` محلّيًّا، فيختلف اليوم بينهما في نصف
 * الكرة — وخطّةٌ تتزحزح يومًا بحسب جهاز المندوب ليست خطّة.
 */
export function parseDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** يُعيد `YYYY-MM-DD` من كائن تاريخ UTC. */
export function dayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** رقم يوم الأسبوع لتاريخٍ نصّيّ، أو `null`. */
export function weekdayOf(iso) {
  const d = parseDay(iso);
  return d ? d.getUTCDay() : null;
}

/** عدد الأسابيع الكاملة بين تاريخين نصّيّين (سالبٌ إن سبق الثاني الأوّل). */
export function weeksBetween(fromIso, toIso) {
  const a = parseDay(fromIso);
  const b = parseDay(toIso);
  if (!a || !b) return null;
  return Math.floor((b - a) / (7 * DAY_MS));
}

/**
 * هل هذه الخطّة مستحقّة في هذا اليوم؟
 *
 * ثلاثة شروط متتابعة: الخطّة فعّالة · اليوم من أيّامها · ودورتها حلّت.
 * أمّا الدورة فتُحسب بأسابيع كاملة منذ `startDate`: خطّةٌ كلّ أسبوعين تستحقّ في
 * الأسبوع ٠ و٢ و٤… ولا تستحقّ في ١ و٣ — فيتوزّع الحمل بدل أن يتكدّس.
 */
export function isDueOn(plan, iso) {
  if (!plan || plan.active === false) return false;
  const day = parseDay(iso);
  if (!day) return false;

  const start = parseDay(plan.startDate);
  if (start && day < start) return false;

  const days = Array.isArray(plan.weekdays) ? plan.weekdays.map(Number) : [];
  if (!days.includes(day.getUTCDay())) return false;

  const freq = FREQUENCIES[plan.frequency] || FREQUENCIES.weekly;
  if (freq.weeks <= 1) return true; // يوميّ أو أسبوعيّ: يكفي أن يكون اليوم من أيّامها
  if (!start) return true; // بلا مرجعٍ للدورة لا نمنع — نعتبرها مستحقّة ونُنبّه في الواجهة

  const weeks = weeksBetween(plan.startDate, iso);
  return weeks !== null && weeks >= 0 && weeks % freq.weeks === 0;
}

/**
 * زيارات يومٍ بعينه من كلّ الخطط — مسطّحةً ومرتّبة بتسلسل خطّ السير.
 * العميل المكرّر في خطّتين يظهر مرّةً واحدة (الخطّة الأولى تفوز) — فزيارتان
 * لمتجرٍ واحدٍ في يومٍ واحد خطأ تخطيطٍ لا مطلبٌ تشغيليّ.
 */
export function visitsDueOn(plans, iso) {
  const seen = new Set();
  const out = [];
  for (const plan of plans || []) {
    if (!isDueOn(plan, iso)) continue;
    for (const c of plan.customers || []) {
      const code = String(c?.code || '').trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({
        customerCode: code,
        customerName: c?.name || '',
        coords: c?.coords || null,
        seq: Number(c?.seq) || out.length + 1,
        planId: plan.id || '',
        planName: plan.name || plan.route || '',
        repUid: plan.repUid || '',
        repName: plan.repName || '',
        route: plan.route || '',
      });
    }
  }
  return out.sort((a, b) => a.seq - b.seq || a.customerCode.localeCompare(b.customerCode));
}

/**
 * التزام الخطّة: المخطّط مقابل المنفَّذ.
 *
 * `extra` ليست خطأً بل معلومة: زياراتٌ خارج الخطّة قد تكون فرصةً اقتنصها
 * المندوب، وقد تكون هروبًا من خطّ سيرٍ متعب. الرقم يُعرض ولا يُحكَم عليه هنا.
 */
export function planCompliance(planned, visits) {
  const plannedCodes = new Set((planned || []).map((p) => String(p.customerCode || '').toUpperCase()));
  const doneCodes = new Set(
    (visits || [])
      .filter((v) => v?.state === 'checked_out')
      .map((v) => String(v.customerCode || '').toUpperCase())
  );

  const done = [...plannedCodes].filter((c) => doneCodes.has(c));
  const missed = [...plannedCodes].filter((c) => !doneCodes.has(c));
  const extra = [...doneCodes].filter((c) => !plannedCodes.has(c));

  return {
    plannedCount: plannedCodes.size,
    doneCount: done.length,
    missedCount: missed.length,
    extraCount: extra.length,
    missed,
    extra,
    compliancePct: plannedCodes.size ? Math.round((done.length / plannedCodes.size) * 100) : 0,
  };
}

/**
 * تغطية العملاء عبر نافذةٍ زمنيّة: من زُير ومن أُهمل ومنذ متى.
 * هذا هو التقرير الذي يكشف المتجر المنسيّ — والذي لا يظهر في أيّ عدّ زيارات.
 */
export function coverageGaps(customers, visits, { asOf, staleDays = 30 } = {}) {
  const lastByCode = new Map();
  for (const v of visits || []) {
    if (v?.state !== 'checked_out') continue;
    const code = String(v.customerCode || '').toUpperCase();
    const day = String(v.day || '').slice(0, 10);
    if (!code || !day) continue;
    if (!lastByCode.has(code) || day > lastByCode.get(code)) lastByCode.set(code, day);
  }

  const today = parseDay(asOf);
  return (customers || [])
    .map((c) => {
      const code = String(c?.code || '').toUpperCase();
      const last = lastByCode.get(code) || null;
      const lastDate = parseDay(last);
      const daysSince = today && lastDate ? Math.floor((today - lastDate) / DAY_MS) : null;
      return {
        code,
        name: c?.nameAr || c?.name || '',
        lastVisit: last,
        daysSince,
        neverVisited: !last,
        stale: !last || (daysSince !== null && daysSince > staleDays),
      };
    })
    .sort((a, b) => Number(b.stale) - Number(a.stale) || (b.daysSince ?? 9999) - (a.daysSince ?? 9999));
}
