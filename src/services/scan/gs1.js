/**
 * محلّل GS1 — من باركود المورّد إلى صنفٍ ودفعةٍ وصلاحيّة. منطقٌ خالصٌ بلا
 * Firebase وبلا DOM وبلا ساعة.
 *
 * ‹WMS-101› · الفجوة و-١: كان في البوّابة محرّكُ مسحٍ كاملٌ (`scanEngine`) وسجلُّ
 * باركودٍ داخليٌّ كامل (`barcodeCode`) — **وصفرُ قراءةٍ لمعرّفات تطبيق GS1.**
 * فباركودُ المورّد الحاملُ للدفعة والصلاحية في جسمه يُقرأ نصًّا واحدًا أعمى،
 * ويُطلب من العامل أن يكتب بيدِه ما كان مكتوبًا في الملصق أمامه.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★ الفخُّ الحاكمُ لهذا الملفّ كلِّه — ولولاه كان أذًى لا نفعًا
 * ═══════════════════════════════════════════════════════════════════════
 *
 * باركودُ تجزئةٍ عاديٌّ من ثلاثةَ عشرَ رقمًا قد يبدأ بـ`17`:
 *
 *     1712345678901   ← EAN-13 سليمٌ لصنفٍ مسجَّلٍ في الماستر
 *
 * ومحلّلٌ متحمّسٌ يقرأ أوّلَ رقمين «17» فيقول: **تاريخُ صلاحيّةٍ** 2012-34-56 —
 * ثمّ يبتلع الباقيَ حشوًا. فيُقيَّد صنفٌ مجهولٌ بصلاحيّةٍ مخترَعة، **ويفسد
 * المخزونُ صامتًا** وهو أخطر من ألّا يُقرأ شيء.
 *
 * فالقاعدةُ الأولى هنا: **GS1 لا يُفترض، يُعلَن.** ولا يُفسَّر مسحٌ تفسيرًا
 * أجنبيًّا إلّا بإحدى أربع إشاراتٍ صريحة (انظر `gs1SignalOf`)، وما سواها
 * يُعاد كما هو بعلامةِ `isGs1:false` فيسلك مسارَه القديم حرفًا بحرف.
 *
 * ═══ وأربعُ قواعدَ أُخَر ═══
 *
 * ② **لا يُخترع حقل.** معرّفٌ لا نعرفه يُوقف التحليلَ ويُعلَن بموضعه — ولا
 *    يُقدَّر طولُه تخمينًا، لأنّ تقديرًا خاطئًا يُزيح كلَّ ما بعده فيُنتج دفعةً
 *    وصلاحيّةً مزيَّفتين تبدوان سليمتين.
 *
 * ③ **الفاصلُ يُحترم.** الحقولُ المتغيّرةُ الطولِ تنتهي بالفاصل GS (U+001D) أو
 *    بنهاية النصّ. والحقولُ المعلَنةُ الطولِ تُقطع بطولها بلا فاصل — فباركودُ
 *    المورّد الملتصقُ `0109501101530003 10ABC` يُقرأ بلا فاصلٍ أصلًا.
 *
 * ④ **رقمُ التحقّق يُحتسب.** GTIN مشوَّهٌ يُكشف هنا بدل أن يُقيَّد «صنفًا
 *    مجهولًا» فيُفتح بلاغُ عطلٍ على الماسح وهو سليم.
 *
 * ⑤ **لا ساعةَ تُقرأ.** سنةُ الصلاحية رقمان، وتعيينُ قرنها يحتاج «الآن» —
 *    فيُمرَّر `nowMs` وسيطًا. وبلا تمريرٍ يُعتمد قرنٌ **مُعلَن** (الألفيّة
 *    الثانية) لا ساعةُ النظام، وإلّا تقلّب الاختبارُ بتغيّر اليوم.
 */

/** الفاصلُ القياسيّ FNC1 كما تُرسله الماسحاتُ: U+001D. */
export const GS = '\u001d';

/**
 * معرّفاتُ الترميز AIM — تُقدّمها الماسحةُ المُهيَّأةُ جيّدًا، وهي **أقوى
 * إشارةٍ ممكنة** لأنّها شهادةُ الجهاز نفسِه أنّ ما بعدها GS1.
 *
 * `]C1` GS1-128 · `]e0` GS1 DataBar · `]d2` GS1 DataMatrix · `]Q3` GS1 QR
 */
export const AIM_PREFIXES = Object.freeze([']C1', ']e0', ']d2', ']Q3', ']C0', ']e1', ']e2']);

/**
 * جدولُ المعرّفات — **المعلَنُ طولُه** (`len`) يُقطع بطوله، والمتغيّرُ (`max`)
 * يُقطع بالفاصل أو بنهاية النصّ.
 *
 * ولماذا جدولٌ صريحٌ لا قاعدةٌ عامّة؟ لأنّ قاعدةَ GS1 العامّة («أوّلُ رقمين
 * يحدّدان الطول») تحتاج جدولَ استثناءاتٍ أطولَ من الجدول نفسِه — والصريحُ
 * يُراجَع بالعين، والمنسيُّ منه يُعلَن معرّفًا مجهولًا لا يُخمَّن (القاعدة ②).
 */
const AI_TABLE = Object.freeze({
  '00': { len: 18, label: 'هويّة الوحدة اللوجستيّة (SSCC)', field: 'sscc', numeric: true },
  '01': { len: 14, label: 'كود الصنف العالميّ (GTIN)', field: 'gtin', numeric: true },
  '02': { len: 14, label: 'كود الصنف المحتوى (GTIN)', field: 'containedGtin', numeric: true },
  '10': { max: 20, label: 'الدفعة', field: 'batch' },
  '11': { len: 6, label: 'تاريخ الإنتاج', field: 'produced', date: true },
  '12': { len: 6, label: 'تاريخ الاستحقاق', field: 'dueDate', date: true },
  '13': { len: 6, label: 'تاريخ التعبئة', field: 'packed', date: true },
  '15': { len: 6, label: 'يُفضَّل قبل', field: 'bestBefore', date: true },
  '16': { len: 6, label: 'يُباع قبل', field: 'sellBy', date: true },
  '17': { len: 6, label: 'تاريخ انتهاء الصلاحية', field: 'expiry', date: true },
  '20': { len: 2, label: 'المتغيّر', field: 'variant', numeric: true },
  '21': { max: 20, label: 'الرقم التسلسليّ', field: 'serial' },
  '22': { max: 20, label: 'متغيّر المنتج', field: 'consumerVariant' },
  '30': { max: 8, label: 'العدد المتغيّر', field: 'qty', numeric: true },
  '37': { max: 8, label: 'عددُ الوحدات في الحمولة', field: 'contentCount', numeric: true },
  240: { max: 30, label: 'معرّف إضافيّ للمنتج', field: 'additionalId' },
  241: { max: 30, label: 'رقم صنف العميل', field: 'customerPart' },
  242: { max: 6, label: 'رقم المتغيّر المصنوع لأمر', field: 'madeToOrder', numeric: true },
  250: { max: 30, label: 'تسلسلٌ ثانويّ', field: 'secondarySerial' },
  251: { max: 30, label: 'مرجعُ المصدر', field: 'sourceRef' },
  253: { max: 30, label: 'معرّف المستند العالميّ', field: 'gdti' },
  254: { max: 20, label: 'امتدادُ موقع GLN', field: 'glnExtension' },
  400: { max: 30, label: 'رقم أمر الشراء', field: 'purchaseOrder' },
  401: { max: 30, label: 'رقم الإرسالية', field: 'consignment' },
  402: { len: 17, label: 'رقم الشحنة', field: 'shipmentNumber', numeric: true },
  403: { max: 30, label: 'رمزُ التوجيه', field: 'routingCode' },
  410: { len: 13, label: 'يُشحَن إلى (GLN)', field: 'shipToGln', numeric: true },
  411: { len: 13, label: 'يُفوتَر إلى (GLN)', field: 'billToGln', numeric: true },
  412: { len: 13, label: 'يُشترى من (GLN)', field: 'purchaseFromGln', numeric: true },
  413: { len: 13, label: 'الوجهة النهائيّة (GLN)', field: 'finalGln', numeric: true },
  414: { len: 13, label: 'موقعٌ ماديّ (GLN)', field: 'physicalGln', numeric: true },
  415: { len: 13, label: 'الفاتورة من (GLN)', field: 'invoicingGln', numeric: true },
  416: { len: 13, label: 'موقعُ الإنتاج (GLN)', field: 'productionGln', numeric: true },
  417: { len: 13, label: 'الطرف (GLN)', field: 'partyGln', numeric: true },
  420: { max: 20, label: 'الرمز البريديّ للوجهة', field: 'shipToPostal' },
  421: { max: 12, label: 'الرمز البريديّ بالدولة', field: 'shipToPostalIso' },
  422: { len: 3, label: 'بلد المنشأ', field: 'originCountry', numeric: true },
  7003: { len: 10, label: 'الصلاحية بالساعة والدقيقة', field: 'expiryDateTime' },
  7030: { max: 30, label: 'جهةُ الموافقة', field: 'approver' },
});

/**
 * عائلاتُ القياس ذاتِ الكسر — معرّفُها أربعةُ أرقامٍ آخرُها **موضعُ الفاصلة**،
 * وقيمتُها ستّةُ أرقامٍ دائمًا.
 *
 * ★ ولماذا تُفصَل عن الجدول؟ لأنّها ستّون معرّفًا (`3100`…`3695`) لو كُتبت
 * سطرًا سطرًا — وقاعدتُها واحدةٌ تُقرأ بسطرين.
 */
const MEASURE_FAMILIES = Object.freeze({
  310: { label: 'الوزن الصافي (كجم)', field: 'netWeightKg' },
  311: { label: 'الطول (م)', field: 'lengthM' },
  312: { label: 'العرض (م)', field: 'widthM' },
  313: { label: 'الارتفاع (م)', field: 'heightM' },
  314: { label: 'المساحة (م٢)', field: 'areaM2' },
  315: { label: 'الحجم الصافي (لتر)', field: 'netVolumeL' },
  316: { label: 'الحجم الصافي (م٣)', field: 'netVolumeM3' },
  330: { label: 'الوزن القائم (كجم)', field: 'grossWeightKg' },
  350: { label: 'مساحةُ المنتج (م٢)', field: 'productAreaM2' },
  360: { label: 'الحجم الصافي للعبوة (لتر)', field: 'packVolumeL' },
  361: { label: 'الحجم الصافي للعبوة (م٣)', field: 'packVolumeM3' },
});

/**
 * أقلُّ طولٍ يُقبل فيه التحليلُ لنصٍّ رقميٍّ صافٍ بلا فاصلٍ ولا بادئة.
 *
 * ★★★ **وهذا الرقمُ هو الحارسُ الذي يمنع الأذى** (انظر رأس الملفّ):
 * EAN-13 ثلاثةَ عشر · UPC-A اثنا عشر · ITF-14 أربعةَ عشر · EAN-8 ثمانية.
 * فحدُّ **ستّةَ عشرَ** يُخرج باركوداتِ التجزئة كلَّها من دائرة التفسير،
 * وأقصرُ عنصرٍ GS1 صالحٍ يبلغه هو `01`+GTIN(14) = ستّةَ عشرَ بالضبط.
 */
export const BARE_DIGITS_MIN = 16;

const digits = (s) => /^[0-9]+$/.test(s);

/**
 * رقمُ تحقّق GS1 (modulo-10) للسلاسل الرقميّة: أوزانٌ 3 و1 بالتناوب من اليمين.
 * يصلح لـGTIN-8/12/13/14 وSSCC-18 وGLN-13.
 *
 * @returns {boolean} `true` إن طابق آخرُ رقمٍ المحسوبَ.
 */
export function checkDigitOk(value) {
  const s = String(value ?? '');
  if (!digits(s) || s.length < 2) return false;
  const body = s.slice(0, -1);
  const given = Number(s.slice(-1));
  let sum = 0;
  // من اليمين: أوّلُ خانةٍ وزنُها ٣ ثمّ ١ بالتناوب.
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === given;
}

/**
 * يصفّر GTIN إلى أربعةَ عشرَ خانة — فصنفٌ مسجَّلٌ في الماستر بـEAN-13 يُطابَق
 * بباركود GS1 الحاملِ له بصيغة GTIN-14.
 *
 * ★ وهذا ليس تجميلًا: الماسترُ عندنا مكتوبٌ بالباركود المطبوع على العلبة
 * (ثلاثةَ عشر)، وGS1 يكتبه دائمًا بأربعةَ عشر. فبلا هذا التصفير **لا يُطابَق
 * صنفٌ واحدٌ أبدًا** ويبدو المحلّلُ كأنّه لا يعرف شيئًا من المستودع.
 */
export function padGtin14(value) {
  const s = String(value ?? '').trim();
  if (!digits(s) || s.length > 14) return s;
  return s.padStart(14, '0');
}

/**
 * صِيَغُ مطابقةِ GTIN — تُجرَّب على الماستر بالترتيب.
 * أربعةَ عشرَ · ثلاثةَ عشرَ (بإسقاط الصفر البادئ) · اثنا عشرَ (UPC) · ثمانية.
 */
export function gtinVariants(value) {
  const g14 = padGtin14(value);
  if (!digits(g14)) return [String(value ?? '')];
  const out = new Set([g14]);
  for (const n of [13, 12, 8]) {
    if (g14.length >= n) {
      const tail = g14.slice(g14.length - n);
      // لا يُسقط إلّا الأصفارُ البادئة — وإلّا قُطع رقمٌ ذو معنى.
      if (g14.slice(0, g14.length - n) === '0'.repeat(g14.length - n)) out.add(tail);
    }
  }
  return [...out];
}

/**
 * قرنُ سنةٍ من رقمين — بقاعدة GS1: نافذةُ مئةِ سنةٍ حولَ «الآن» (٤٩ ماضيةً
 * و٥٠ مقبلة).
 *
 * وبلا `nowMs` **لا تُقرأ الساعة**: يُعتمد قرنٌ معلَنٌ (٢٠xx) — وهو الصحيحُ
 * عملًا، فصلاحيّاتُ مستودعٍ يعمل اليوم لا تقع في القرن الماضي.
 */
function centuryOf(yy, nowMs) {
  if (!Number.isFinite(nowMs)) return 2000 + yy;
  const nowYear = new Date(nowMs).getUTCFullYear();
  const base = Math.floor(nowYear / 100) * 100;
  for (const candidate of [base + yy, base + yy - 100, base + yy + 100]) {
    const diff = candidate - nowYear;
    if (diff >= -49 && diff <= 50) return candidate;
  }
  return base + yy;
}

/**
 * YYMMDD ⟶ `YYYY-MM-DD` (الصيغةُ التي يقرؤها `expiryStatus` بـ`Date.parse`).
 *
 * و`DD = 00` معناه في GS1 **آخرُ يومٍ في الشهر** — لا يومٌ صفر. ومن تجاهلها
 * أنتج `2027-03-00` فتصير `Date.parse` منها NaN، فتُقرأ الصلاحيّةُ «مجهولة»
 * **وتمرّ بضاعةٌ منتهيةٌ بلا حارس**.
 *
 * @returns {{ok:boolean, date:string, problem:string}}
 */
export function parseGs1Date(raw, nowMs) {
  const s = String(raw ?? '').trim();
  if (!/^[0-9]{6}$/.test(s)) return { ok: false, date: '', problem: `تاريخٌ غيرُ سليم «${s}» — المنتظَر ستّةُ أرقام YYMMDD.` };
  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12) return { ok: false, date: '', problem: `شهرٌ غيرُ سليم «${s.slice(2, 4)}» في التاريخ.` };
  const year = centuryOf(yy, nowMs);
  // آخرُ الشهر: اليومُ صفرٌ في المعيار.
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd > lastDay) return { ok: false, date: '', problem: `يومٌ غيرُ سليم «${s.slice(4, 6)}» لشهرٍ طولُه ${lastDay}.` };
  const day = dd === 0 ? lastDay : dd;
  const p2 = (n) => String(n).padStart(2, '0');
  return { ok: true, date: `${year}-${p2(mm)}-${p2(day)}`, problem: '' };
}

/**
 * بادئةُ عنصرٍ معلَنِ الطول: `01`/`02` ومعهما أربعةَ عشرَ رقمًا، أو `00` ومعه
 * ثمانيةَ عشرَ — **ويلزم أن يتبعها شيء**، وإلّا فهي الحالةُ الرقميّةُ الصافية.
 */
const FIXED_HEAD = /^(?:0[12][0-9]{14}|00[0-9]{18})(?=.)/;

/**
 * أيُّ إشارةٍ تجعل هذا النصَّ GS1؟ — **البوّابةُ الحاكمة** (رأس الملفّ).
 *
 * ═══ وفرقُ «القويّة» عن «الظنّيّة» ليس تصنيفًا بل سلوكًا ═══
 *
 * ① و② و③ **شهاداتٌ**: الجهازُ أعلن الترميز، أو وُجد فاصلٌ لا يوجد إلّا في
 *    GS1، أو إنسانٌ كتب الأقواس بيده. فإن انكسر التحليلُ بعدها **يُعلَن
 *    العطبُ بسببه** — صاحبُ الشهادة يستحقّ تشخيصًا لا صمتًا.
 *
 * ④ **ظنٌّ بنيويّ**: نصٌّ شكلُه شكلُ عنصرِ GS1. فإن انكسر التحليلُ بعده
 *    **يُسحَب الظنُّ** ويُعاد النصُّ كما هو إلى مساره القديم — لأنّ الأرجحَ
 *    حينها أنّه باركودٌ داخليٌّ تشابه شكلُه، لا GS1 معطوب. وإعلانُ «GS1
 *    معطوب» على كودٍ داخليٍّ يعمل **يوقف عملًا قائمًا** — وهو أسوأ من
 *    تفويت ميزة.
 *
 * @returns {{gs1:boolean, strong:boolean, signal:string, body:string}}
 */
export function gs1SignalOf(raw) {
  const s = String(raw ?? '');
  // ① شهادةُ الجهاز نفسِه.
  for (const p of AIM_PREFIXES) {
    if (s.startsWith(p)) return { gs1: true, strong: true, signal: 'معرّف ترميز AIM', body: s.slice(p.length) };
  }
  // ② الفاصلُ FNC1 لا يوجد إلّا في عناصر GS1.
  if (s.includes(GS)) return { gs1: true, strong: true, signal: 'فاصل FNC1', body: s };
  // ③ الصيغةُ المقروءةُ بالأقواس — تُكتب تحت الباركود وتُنسخ يدويًّا.
  if (/^\((\d{2,4})\)/.test(s)) return { gs1: true, strong: true, signal: 'صيغةُ الأقواس المقروءة', body: s };

  // ④ الظنُّ البنيويّ — ويُقاس على النصّ بلا فراغاتٍ، فبعضُ الماسحات تُبدل
  //    الفاصلَ فراغًا. والباركودُ الداخليُّ عندنا بلا فراغاتٍ أصلًا.
  const t = s.replace(/\s+/g, '');
  if (!t) return { gs1: false, strong: false, signal: '', body: s };
  // ④-أ رقميٌّ صافٍ طويلٌ يبدأ بمعرّفٍ قاطع — والحدُّ هو الحارس.
  if (digits(t) && t.length >= BARE_DIGITS_MIN && (t.startsWith('01') || t.startsWith('00') || t.startsWith('02'))) {
    return { gs1: true, strong: false, signal: 'عنصرٌ رقميٌّ طويلٌ بمعرّفٍ قاطع', body: t };
  }
  // ④-ب بادئةُ عنصرٍ معلَنِ الطولِ ثمّ محتوًى — حالُ ماسحٍ لم يُهيَّأ لإرسال
  //      الفاصل، وهو أشيعُ ما يُقابَل ميدانيًّا.
  if (FIXED_HEAD.test(t)) {
    return { gs1: true, strong: false, signal: 'بادئةُ عنصرٍ معلَنِ الطول', body: t };
  }
  return { gs1: false, strong: false, signal: '', body: s };
}

/** يحوّل صيغةَ الأقواس `(01)123(10)ABC` إلى عنصرٍ بفواصل FNC1. */
function fromParenNotation(s) {
  if (!/^\(\d{2,4}\)/.test(s)) return s;
  let out = '';
  let rest = s;
  let first = true;
  while (rest.length) {
    const m = /^\((\d{2,4})\)/.exec(rest);
    if (!m) { out += rest; break; }
    const ai = m[1];
    rest = rest.slice(m[0].length);
    const next = rest.search(/\(\d{2,4}\)/);
    const value = next === -1 ? rest : rest.slice(0, next);
    rest = next === -1 ? '' : rest.slice(next);
    // الفاصلُ يُوضع قبل كلّ معرّفٍ بعد الأوّل: فيُقرأ المتغيّرُ الطولِ بأمان.
    out += (first ? '' : GS) + ai + value;
    first = false;
  }
  return out;
}

/** تعريفُ معرّفٍ — بالجدول ثمّ بعائلات القياس. */
function defOf(ai) {
  if (AI_TABLE[ai]) return AI_TABLE[ai];
  if (ai.length === 4) {
    const fam = MEASURE_FAMILIES[ai.slice(0, 3)];
    if (fam) return { len: 6, label: fam.label, field: fam.field, decimals: Number(ai[3]), numeric: true };
  }
  return null;
}

/**
 * أطولُ معرّفٍ مطابقٍ عند هذا الموضع — أربعةٌ ثمّ ثلاثةٌ ثمّ اثنان.
 *
 * ★ والترتيبُ من الأطول حتمًا: `310` عائلةُ وزنٍ معرّفُها أربعةُ أرقام، و`31`
 * ليس معرّفًا. فالبحثُ من الأقصر يُنتج معرّفًا وهميًّا ويُزيح كلَّ ما بعده.
 */
function matchAi(body, at) {
  for (const n of [4, 3, 2]) {
    const ai = body.slice(at, at + n);
    if (ai.length === n && digits(ai) && defOf(ai)) return ai;
  }
  return '';
}

/**
 * يُفكّك عنصرَ GS1 كاملًا.
 *
 * @param {string} raw المسحُ كما ورد
 * @param {{nowMs?:number}} [opts] `nowMs` لتعيين قرن سنةِ الصلاحية (القاعدة ⑤)
 * @returns {{
 *   isGs1:boolean, ok:boolean, signal:string, raw:string, problem:string, unparsed:string,
 *   value:string, kind:''|'ITEM'|'SSCC', elements:Array,
 *   gtin:string, gtinVariants:string[], sscc:string, batch:string, serial:string,
 *   expiry:string, produced:string, bestBefore:string, qty:number|null,
 *   netWeightKg:number|null, purchaseOrder:string, fields:object, warnings:string[]
 * }}
 */
export function parseGs1(raw, { nowMs } = {}) {
  const empty = {
    isGs1: false,
    ok: false,
    signal: '',
    raw: String(raw ?? ''),
    problem: '',
    unparsed: '',
    value: String(raw ?? '').trim(),
    kind: '',
    elements: [],
    gtin: '',
    gtinVariants: [],
    sscc: '',
    batch: '',
    serial: '',
    expiry: '',
    produced: '',
    bestBefore: '',
    qty: null,
    netWeightKg: null,
    purchaseOrder: '',
    fields: {},
    warnings: [],
  };

  const signal = gs1SignalOf(raw);
  if (!signal.gs1) return empty;

  const body = fromParenNotation(signal.body).replace(/\s+/g, '');
  const elements = [];
  const fields = {};
  const warnings = [];
  let at = 0;
  let problem = '';
  let unparsed = '';

  while (at < body.length) {
    // فاصلٌ معلَّقٌ بين عنصرين — يُتخطّى.
    if (body[at] === GS) { at += 1; continue; }

    const ai = matchAi(body, at);
    // ② معرّفٌ مجهولٌ يُوقف ولا يُخمَّن.
    if (!ai) {
      unparsed = body.slice(at);
      problem = `معرّفُ تطبيقٍ مجهولٌ عند الخانة ${at + 1}: «${unparsed.slice(0, 6)}…» — لم يُحلَّل الباقي كي لا تُزاح الحقول.`;
      break;
    }
    at += ai.length;
    const def = defOf(ai);

    let value;
    if (def.len) {
      // ③ المعلَنُ طولُه يُقطع بطوله — ولو لم يُرسل الماسحُ فاصلًا.
      value = body.slice(at, at + def.len);
      if (value.length < def.len) {
        problem = `المعرّف «${ai}» (${def.label}) يحتاج ${def.len} خانةً ووجد ${value.length} — عنصرٌ مقطوع.`;
        unparsed = value;
        break;
      }
      at += def.len;
      // فاصلٌ زائدٌ بعد حقلٍ معلَنِ الطولِ يُتخطّى بلا شكوى (ماسحاتٌ تُرسله).
      if (body[at] === GS) at += 1;
    } else {
      // المتغيّرُ يمتدّ إلى الفاصل أو نهاية النصّ.
      const end = body.indexOf(GS, at);
      value = end === -1 ? body.slice(at) : body.slice(at, end);
      at = end === -1 ? body.length : end + 1;
      if (!value.length) {
        problem = `المعرّف «${ai}» (${def.label}) جاء فارغًا.`;
        break;
      }
      if (def.max && value.length > def.max) {
        warnings.push(`قيمةُ «${def.label}» أطولُ من حدّها (${value.length} > ${def.max}) — قُرئت كما وردت.`);
      }
    }

    if (def.numeric && !digits(value)) {
      problem = `المعرّف «${ai}» (${def.label}) يقبل أرقامًا فقط ووجد «${value}».`;
      break;
    }

    const element = { ai, label: def.label, field: def.field, raw: value, value };

    if (def.date) {
      const d = parseGs1Date(value, nowMs);
      if (!d.ok) { problem = `${def.label}: ${d.problem}`; break; }
      element.value = d.date;
    } else if (Number.isFinite(def.decimals)) {
      element.value = def.decimals ? Number(value) / 10 ** def.decimals : Number(value);
    } else if (def.numeric && (def.field === 'qty' || def.field === 'contentCount')) {
      element.value = Number(value);
    }

    // ④ رقمُ التحقّق — يُحتسب ولا يُسقِط العنصر، فيُقال ويُقرَّر عليه.
    if ((ai === '01' || ai === '02' || ai === '00') && !checkDigitOk(value)) {
      warnings.push(`رقمُ التحقّق لا يطابق في «${def.label}» (${value}) — مسحٌ مشوَّهٌ أو ملصقٌ مطبوعٌ خطأً.`);
      element.checkDigitOk = false;
    }

    elements.push(element);
    if (fields[def.field] === undefined) fields[def.field] = element.value;
  }

  const gtin = String(fields.gtin ?? '');
  const sscc = String(fields.sscc ?? '');

  // ولا يُعدّ العنصرُ مقروءًا إن لم يُفهم منه معرّفٌ واحدٌ على الأقلّ.
  if (!elements.length && !problem) problem = 'لم يُقرأ أيُّ معرّفِ تطبيقٍ من هذا الباركود.';

  // ★★★ سحبُ الظنّ (انظر `gs1SignalOf` ④): إشارةٌ بنيويّةٌ انكسر تحليلُها
  // ليست GS1 معطوبًا — الأرجحُ أنّها كودٌ داخليٌّ تشابه شكلُه. فيُعاد النصُّ
  // كما هو إلى مساره القديم، ولا يُوقَف عملٌ قائمٌ بتشخيصٍ مظنون.
  if (!signal.strong && problem) return { ...empty, warnings: [] };

  return {
    isGs1: true,
    ok: !problem && elements.length > 0,
    signal: signal.signal,
    raw: String(raw ?? ''),
    problem,
    unparsed,
    value: gtin ? padGtin14(gtin) : sscc || String(raw ?? '').trim(),
    kind: gtin ? 'ITEM' : sscc ? 'SSCC' : '',
    elements,
    gtin: gtin ? padGtin14(gtin) : '',
    gtinVariants: gtin ? gtinVariants(gtin) : [],
    sscc,
    batch: String(fields.batch ?? ''),
    serial: String(fields.serial ?? ''),
    expiry: String(fields.expiry ?? ''),
    produced: String(fields.produced ?? ''),
    bestBefore: String(fields.bestBefore ?? ''),
    qty: Number.isFinite(fields.qty) ? fields.qty : null,
    netWeightKg: Number.isFinite(fields.netWeightKg) ? fields.netWeightKg : null,
    purchaseOrder: String(fields.purchaseOrder ?? ''),
    fields,
    warnings,
  };
}

/**
 * سطرٌ يُقرأ على الشاشة بجانب المسحة — ما فُهم منها حرفيًّا.
 * وبلا GS1 يُعاد فراغٌ: لا يُقال للعامل شيءٌ عن مسحةٍ عاديّة.
 */
export function gs1Summary(parsed) {
  if (!parsed?.isGs1) return '';
  if (parsed.problem) return `باركود GS1 لم يُقرأ كاملًا — ${parsed.problem}`;
  const parts = [];
  if (parsed.sscc) parts.push(`طبليّة ${parsed.sscc}`);
  if (parsed.gtin) parts.push(`صنف ${parsed.gtin}`);
  if (parsed.batch) parts.push(`دفعة ${parsed.batch}`);
  if (parsed.expiry) parts.push(`صلاحية ${parsed.expiry}`);
  if (parsed.produced) parts.push(`إنتاج ${parsed.produced}`);
  if (parsed.qty !== null) parts.push(`عدد ${parsed.qty}`);
  if (parsed.netWeightKg !== null) parts.push(`وزن ${parsed.netWeightKg} كجم`);
  if (parsed.serial) parts.push(`تسلسل ${parsed.serial}`);
  return parts.join(' · ');
}
