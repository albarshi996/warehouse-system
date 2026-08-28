/**
 * نموذجُ بوابة الأمن ‹GATE› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ العطب (ج‑١…ج‑٦) ═══
 * دورةُ الساحة ‹EXE-601/602› تعرف **أنّ** مركبةً دخلت وخرجت ومتى ووقفت عند
 * أيّ باب — ولا تعرف **لماذا** جاءت ولا **ماذا كانت تحمل**. `VISIT_PURPOSE`
 * قيمتان (تنزيل/تحميل) و`docRef` حقلٌ واحد. فالبوّابة سجلُّ مرورٍ لا نقطةُ
 * تحقّق: شاحنةٌ تدخل بخمس عشرة طبليّةً وتخرج بستٍّ ولا أثرَ لأيٍّ من الرقمين.
 *
 * ═══ وهذا توسعةٌ لدورة الساحة لا كيانٌ ثانٍ ═══
 * لا مجموعةَ زياراتٍ جديدة ولا مؤقّتَ ثانٍ ولا نموذجَ بابٍ موازٍ:
 * `yardModel.shapeVisit` يستدعي `shapeInLoad` و`shapeOutLoad` و`purposeOf`
 * من هنا، و`exitVerdict` يستدعي `outLoadProblems`. الاتجاه واحد —
 * `fleet/yardModel.js` يستورد من `gate/`، وهذا الملفّ لا يستورد منه شيئًا
 * فلا حلقة.
 *
 * ═══ ★ القرارات الحاكمة (المالك · 2026-08-28) ═══
 * ق-١ «الطبالي» محجوزةٌ لهويّة LPN — وما هنا **الطبليات العائدة**: خشبٌ
 *     يُعدّ ويُردّ ويُحسب رصيدُه. ولا يُكتب «طبليات» مجرّدةً في نصٍّ جديد.
 * ق-٣ حاجةُ الباب **تُشتقّ من السبب** ولا يُسأل عنها الحارس — والنقلُ
 *     الداخليّ وحده يُشتقّ من حالة الحمولة لأنّه يحتمل الوجهين.
 * ق-٤ الخروجُ **حمولةٌ ثانيةٌ في الزيارة نفسها** لا زيارةٌ ثانية: مؤقّتُ
 *     البقاء يُقاس من الوصول إلى الخروج، وزيارتان تكسرانه وتتركان الأولى
 *     مفتوحةً للأبد.
 * ق-٧ الزائر: اسمٌ وجهةٌ وهاتف — **لا رقمَ هويّةٍ ولا صورة**.
 *
 * ═══ والنقصُ يُعلَن ولا يمنع ═══
 * نمطُ `visitGaps` القائم: شاحنةٌ على الرصيف لا تُردّ لأنّ رقم الأمر لم
 * يُكتب بعد. الملزِمُ واحدٌ فقط عند الخروج — **وصفُ الحمولة إن خرجت
 * محمّلة**، لأنّ خروجًا محمّلًا بلا وصفٍ هو بالضبط ما بُنيت البوّابة لمنعه.
 */

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};

/* ═══════════════ أسبابُ الحركة — ج‑١ ═══════════════ */

/**
 * الأسبابُ التسعة كما أملاها المالك، ولكلٍّ **غرضُه** الذي يشتقّه ق-٣.
 *
 * `purpose`:
 *   'inbound'  ⇐ تحتاج بابًا للتنزيل
 *   'outbound' ⇐ تحتاج بابًا للتحميل
 *   'byLoad'   ⇐ يُحسم من حالة الحمولة (النقلُ الداخليّ وحده)
 *   ''         ⇐ لا بابَ لها أصلًا فلا تدخل طابور الأبواب
 *
 * ★ ولماذا معلَنةٌ هنا لا مكتوبةٌ في الشاشة؟ لأنّ ثلاث شاشاتٍ ستقرؤها
 * (مركز البوابة · السجلّ · المطابقة)، ونسخُها ثلاثًا يعني انحرافًا يومَ
 * يُضاف سببٌ عاشر. (نمط `YARD_LIMITS` و`GATE_REASONS` مصدرٌ واحد.)
 */
export const GATE_REASONS = Object.freeze([
  { id: 'supplier', label: 'مورّد لتسليم بضاعة', purpose: 'inbound' },
  { id: 'loading', label: 'تحميل بضاعة', purpose: 'outbound' },
  { id: 'customerReturn', label: 'استلام مرتجع', purpose: 'inbound' },
  { id: 'companyReturn', label: 'مركبة شركة عائدة من مهمّة', purpose: 'inbound' },
  { id: 'internal', label: 'نقل داخليّ بين المواقع', purpose: 'byLoad' },
  { id: 'service', label: 'صيانة أو خدمة', purpose: '' },
  { id: 'visit', label: 'زيارة', purpose: '' },
  { id: 'staff', label: 'موظّف / إدارة', purpose: '' },
  { id: 'other', label: 'أخرى', purpose: '' },
]);

const REASON_BY_ID = new Map(GATE_REASONS.map((r) => [r.id, r]));

export function gateReason(id) {
  return REASON_BY_ID.get(s(id)) || null;
}

export function isGateReason(id) {
  return REASON_BY_ID.has(s(id));
}

export function reasonLabel(id) {
  return gateReason(id)?.label || '';
}

/* ═══════════════ حالةُ الحمولة — ج‑٢ و ج‑٥ ═══════════════ */

/** حالُ المركبة عند **الدخول**. */
export const LOAD_STATES = Object.freeze([
  { id: 'loaded', label: 'محمّلة' },
  { id: 'partial', label: 'محمّلة جزئيًّا' },
  { id: 'empty', label: 'فارغة' },
]);

/**
 * حالُ المركبة عند **الخروج** — خمسٌ كما أملاها المالك.
 *
 * `carriesGoods` تعني: يلزمها وصفُ حمولة. و`carriesPallets` تعني: يلزمها
 * سطرُ طبلياتٍ عائدة. والفارغةُ لا تلزمها واحدةٌ منهما — تُسجَّل بضغطة.
 */
export const EXIT_STATES = Object.freeze([
  { id: 'empty', label: 'فارغة', carriesGoods: false, carriesPallets: false },
  { id: 'goods', label: 'محمّلة ببضاعة', carriesGoods: true, carriesPallets: false },
  { id: 'returns', label: 'عائدة ببضاعة / مرتجع', carriesGoods: true, carriesPallets: false },
  { id: 'emptyPallets', label: 'محمّلة بطبليات عائدة فارغة فقط', carriesGoods: false, carriesPallets: true },
  { id: 'goodsAndPallets', label: 'محمّلة ببضاعة وطبليات عائدة', carriesGoods: true, carriesPallets: true },
]);

const LOAD_STATE_IDS = new Set(LOAD_STATES.map((x) => x.id));
const EXIT_BY_ID = new Map(EXIT_STATES.map((x) => [x.id, x]));

export function exitState(id) {
  return EXIT_BY_ID.get(s(id)) || null;
}

/* ═══════════════ الطبليات العائدة — ج‑٧ (ق-١) ═══════════════ */

/** نوعُ الطبليّة العائدة. */
export const PALLET_TYPES = Object.freeze([
  { id: 'STD', label: 'قياسيّة (١٢٠×١٠٠)' },
  { id: 'EUR', label: 'يورو (١٢٠×٨٠)' },
  { id: 'PLASTIC', label: 'بلاستيكيّة' },
  { id: 'OTHER', label: 'أخرى' },
]);

/** ملكيّةُ الطبليّة — وهي مدارُ الرصيد كلِّه. */
export const PALLET_OWNERSHIP = Object.freeze([
  { id: 'company', label: 'ملك الشركة' },
  { id: 'supplier', label: 'ملك المورّد' },
  { id: 'customer', label: 'ملك العميل' },
  { id: 'carrier', label: 'ملك الناقل' },
]);

/** حالُ الطبليّة ساعةَ عبورها البوّابة. */
export const PALLET_CONDITIONS = Object.freeze([
  { id: 'sound', label: 'سليمة' },
  { id: 'damaged', label: 'تالفة' },
  { id: 'underReview', label: 'تحت المراجعة' },
]);

const TYPE_IDS = new Set(PALLET_TYPES.map((x) => x.id));
const OWNERSHIP_IDS = new Set(PALLET_OWNERSHIP.map((x) => x.id));
const CONDITION_IDS = new Set(PALLET_CONDITIONS.map((x) => x.id));

export function palletTypeLabel(id) {
  return PALLET_TYPES.find((x) => x.id === up(id))?.label || '';
}

export function palletOwnershipLabel(id) {
  return PALLET_OWNERSHIP.find((x) => x.id === s(id))?.label || '';
}

export function palletConditionLabel(id) {
  return PALLET_CONDITIONS.find((x) => x.id === s(id))?.label || '';
}

/**
 * سطرُ طبلياتٍ عائدة — عددٌ ونوعٌ وملكيّةٌ وحال.
 *
 * ★ والملكيّةُ لا تُخمَّن: افتراضُها `supplier` كان يعني أنّ كلّ طبليّةٍ
 * دخلت تصير دَينًا على الشركة، وهو خطأٌ يتراكم شهرًا. فالافتراضُ
 * `company` — الأقلُّ ادّعاءً: خشبُنا يتحرّك ولا يُنشئ ذمّة.
 */
export function shapePalletLine(input) {
  return {
    count: n(input?.count),
    type: TYPE_IDS.has(up(input?.type)) ? up(input.type) : 'STD',
    ownership: OWNERSHIP_IDS.has(s(input?.ownership)) ? s(input.ownership) : 'company',
    condition: CONDITION_IDS.has(s(input?.condition)) ? s(input.condition) : 'sound',
  };
}

/** أسطرُ الطبليات مسوّاةً — والصفرُ يسقط: سطرٌ بلا عددٍ ليس حركة. */
export function shapePalletLines(list) {
  return (Array.isArray(list) ? list : []).map(shapePalletLine).filter((l) => l.count > 0);
}

/** مجموعُ الطبليات في أسطرٍ — للعرض وللمطابقة. */
export function palletTotal(list) {
  return shapePalletLines(list).reduce((sum, l) => sum + l.count, 0);
}

/* ═══════════════ الحمولة — ج‑٣ و ج‑٥ ═══════════════ */

/**
 * حمولةُ **الدخول**. كلُّ حقولها اختياريّة عمدًا (النقصُ يُعلَن ولا يمنع)،
 * وما يُملأ منها يُطبَّع هنا مرّةً فلا تُطبّعه ثلاث شاشات.
 */
export function shapeInLoad(input) {
  return {
    state: LOAD_STATE_IDS.has(s(input?.state)) ? s(input.state) : 'empty',
    cargoType: s(input?.cargoType),
    /** المورّد أو الجهة المرسِلة — وهو **مفتاحُ رصيد الطبليات**. */
    party: s(input?.party),
    poRef: up(input?.poRef),
    invoiceRef: up(input?.invoiceRef),
    dnRef: up(input?.dnRef),
    transferRef: up(input?.transferRef),
    containerNo: up(input?.containerNo),
    sealNo: up(input?.sealNo),
    packages: n(input?.packages),
    pallets: shapePalletLines(input?.pallets),
    /** معرّفاتُ مرفقاتٍ في `attachments` — لا صورٌ في متن الزيارة (سقفُ المستند). */
    photoIds: (Array.isArray(input?.photoIds) ? input.photoIds : []).map(s).filter(Boolean),
    notes: s(input?.notes),
  };
}

/**
 * حمولةُ **الخروج** — ق-٤: حركةٌ ثانيةٌ في الزيارة نفسها.
 *
 * ولذلك حقولُها ليست نسخةً من حقول الدخول: الخروج له وجهةٌ ومستلِمٌ ومُسلِّم،
 * وأمرُ تسليمٍ أو تحويلٍ أو صرف — لا أمرُ شراءٍ ولا رقمُ حاوية.
 */
export function shapeOutLoad(input) {
  return {
    state: EXIT_BY_ID.has(s(input?.state)) ? s(input.state) : 'empty',
    reason: s(input?.reason),
    cargoType: s(input?.cargoType),
    destination: s(input?.destination),
    /** الجهةُ المستلِمة — مفتاحُ رصيد الطبليات عند الخروج. */
    party: s(input?.party),
    doRef: up(input?.doRef),
    transferRef: up(input?.transferRef),
    invoiceRef: up(input?.invoiceRef),
    soRef: up(input?.soRef),
    issueRef: up(input?.issueRef),
    packages: n(input?.packages),
    pallets: shapePalletLines(input?.pallets),
    receivedBy: s(input?.receivedBy),
    handedBy: s(input?.handedBy),
    photoIds: (Array.isArray(input?.photoIds) ? input.photoIds : []).map(s).filter(Boolean),
    notes: s(input?.notes),
  };
}

/** الزائر — ق-٧: ثلاثةُ حقولٍ لا أكثر، ولا وثيقةَ شخصيّةٍ تُحفظ. */
export function shapeVisitor(input) {
  return {
    name: s(input?.name),
    phone: s(input?.phone),
    host: s(input?.host),
  };
}

/** الحمولتان معًا — ما يُخزَّن على الزيارة تحت `load`. */
export function shapeGateLoad(input) {
  return {
    in: shapeInLoad(input?.in),
    out: shapeOutLoad(input?.out),
  };
}

/* ═══════════════ اشتقاقُ الغرض — ق-٣ ═══════════════ */

/**
 * غرضُ الزيارة من سببها — والباب يُطابَق به في `assignDoorVerdict`.
 *
 * ★ والقيمةُ الفارغة معناها **لا بابَ لها**: زائرٌ وموظّفٌ وصيانة. وهي ليست
 * نقصًا يُستكمَل — بل جوابٌ نهائيّ يمنعها من طابور الأبواب أصلًا.
 *
 * ⚠️ وسببٌ مجهولٌ (أو زيارةٌ قديمةٌ كُتبت قبل هذه الطبقة بلا `reason`) يعود
 * `null` — فيبقى `purpose` القديم على الزيارة كما هو ولا يُدهَس. وهذا ما
 * يحفظ رجعةَ `doorAccepts`: زيارةٌ من الأمس لا تتغيّر تحت قدمَي مشرف المناولة.
 *
 * @returns {'inbound'|'outbound'|''|null} و`null` تعني «لا رأيَ لي — أبقِ القائم».
 */
export function purposeOf(reason, loadState) {
  const r = gateReason(reason);
  if (!r) return null;
  if (r.purpose !== 'byLoad') return r.purpose;
  // النقلُ الداخليّ يحتمل الوجهين: داخلةٌ محمّلةً ⇐ تنزيل · فارغةٌ لتُحمّل ⇐ تحميل.
  return s(loadState) === 'empty' ? 'outbound' : 'inbound';
}

/** أتحتاج هذه الزيارةُ بابًا أصلًا؟ */
export function needsDoor(reason, loadState) {
  return Boolean(purposeOf(reason, loadState));
}

/* ═══════════════ الإظهارُ المشروط — ج‑٤ ═══════════════ */

/**
 * الحقولُ التي تظهر لهذا السبب وهذه الحالة — **والشاشة تعرض ولا تقرّر**.
 *
 * ═══ لماذا دالّةٌ لا شروطٌ في المكوّن؟ ═══
 * شكوى المالك حرفيًّا: «لا تجعله يرى ٢٠ خانة من البداية». وشروطُ الإظهار
 * إن كُتبت في JSX صارت غير مختبَرةٍ وغير مقروءة، وأوّلُ سببٍ يُضاف ينساه
 * أحدُها. فهنا تُقرَّر مرّةً، ويُختبر كلُّ سببٍ من التسعة.
 *
 * @returns {{visitor:boolean, cargo:boolean, pallets:boolean, fields:string[]}}
 *   `fields` أسماءُ حقول حمولة الدخول بترتيب عرضها.
 */
export function fieldsFor(reason, loadState) {
  const r = gateReason(reason);
  const state = LOAD_STATE_IDS.has(s(loadState)) ? s(loadState) : 'empty';

  // زائرٌ أو موظّف: بياناتُ الزائر وحدها — لا حمولةَ ولا طبليات ولا باب.
  if (r?.id === 'visit' || r?.id === 'staff') {
    return { visitor: true, cargo: false, pallets: false, fields: ['notes'] };
  }
  // صيانةٌ أو خدمة: جهةٌ وملاحظة — المركبة تذهب إلى الورشة لا إلى بابٍ.
  if (r?.id === 'service') {
    return { visitor: false, cargo: false, pallets: false, fields: ['party', 'notes'] };
  }
  // سببٌ مجهولٌ أو «أخرى»: أقلُّ ما يصحّ — ولا يُفترض شيء.
  if (!r || r.id === 'other') {
    return { visitor: false, cargo: false, pallets: false, fields: ['cargoType', 'party', 'notes'] };
  }

  // ما بقي زياراتُ بضاعة: الطبلياتُ العائدة تُسجَّل معها دائمًا — حتّى
  // الفارغةَ الداخلةَ لتُحمَّل قد تُعيد خشبَنا معها.
  const pallets = true;
  const cargo = state !== 'empty';

  const fields = [];
  if (cargo) fields.push('cargoType');
  fields.push('party');

  if (r.id === 'supplier') {
    if (cargo) fields.push('poRef', 'invoiceRef', 'dnRef', 'containerNo', 'sealNo', 'packages');
  } else if (r.id === 'customerReturn') {
    if (cargo) fields.push('dnRef', 'invoiceRef', 'packages');
  } else if (r.id === 'companyReturn') {
    if (cargo) fields.push('dnRef', 'packages');
  } else if (r.id === 'internal') {
    if (cargo) fields.push('transferRef', 'packages');
  }
  // «تحميل بضاعة» عند الدخول: المركبةُ تأتي فارغةً لتُحمَّل — ووصفُ ما
  // ستحمله يُكتب عند **الخروج** لا هنا. فلا حقولَ حمولةٍ تُطلب على الحاجز.

  fields.push('notes');
  return { visitor: false, cargo, pallets, fields };
}

/**
 * حقولُ الخروج التي تظهر لهذه الحالة — نظيرةُ `fieldsFor` للحمولة الثانية.
 *
 * @returns {{goods:boolean, pallets:boolean, fields:string[]}}
 */
export function exitFieldsFor(state) {
  const st = exitState(state) || EXIT_STATES[0];
  const fields = [];
  if (st.carriesGoods) {
    fields.push('cargoType', 'destination', 'party', 'doRef', 'transferRef', 'invoiceRef', 'soRef', 'issueRef', 'packages');
  } else if (st.carriesPallets) {
    fields.push('destination', 'party');
  }
  if (st.carriesGoods || st.carriesPallets) fields.push('receivedBy', 'handedBy');
  fields.push('notes');
  return { goods: st.carriesGoods, pallets: st.carriesPallets, fields };
}

/* ═══════════════ ما ينقص — يُعلَن ولا يمنع ═══════════════ */

/**
 * نواقصُ حمولة الدخول — نصوصٌ جاهزةٌ للعرض، وفراغُها اكتمالٌ.
 *
 * ★ ولا تُذكر إلّا نواقصُ حقولٍ **تظهر أصلًا** لهذا السبب: قولُ «لا رقم PO»
 * لزيارةِ ضيفٍ إزعاجٌ يُعلَّم الحارسُ تجاهلَه، ثمّ يتجاهل ما يهمّ.
 */
export function loadGaps(reason, load) {
  const shown = fieldsFor(reason, load?.state);
  const l = shapeInLoad(load);
  const out = [];
  const has = (k) => shown.fields.includes(k);

  if (has('party') && !l.party) out.push('الجهةُ المرسِلة غير مُدخلة — وبلا جهةٍ لا يُحسب رصيدُ طبلياتٍ لأحد.');
  if (has('poRef') && !l.poRef) out.push('لا رقمَ أمر شراء — سُجّلت باللوحة ويبقى ربطُها بالاستلام ناقصًا.');
  if (has('invoiceRef') && !l.invoiceRef) out.push('لا رقمَ فاتورة.');
  if (has('packages') && !l.packages) out.push('عددُ الطرود غير مُدخل — والمطابقةُ مع الاستلام تحتاجه.');
  if (shown.pallets && l.pallets.length === 0) {
    out.push('لم تُسجَّل طبلياتٌ عائدة — إن لم تكن معها طبلياتٌ فاتركها صفرًا واعلم أنّك تركتها.');
  }
  if (shown.visitor) out.push('بياناتُ الزائر تُملأ في قسمها.');
  return out;
}

/** نواقصُ بيانات الزائر — ق-٧: الاسمُ والجهةُ لا غنى عنهما، والهاتفُ يُستحسن. */
export function visitorGaps(visitor) {
  const v = shapeVisitor(visitor);
  const out = [];
  if (!v.name) out.push('اسمُ الزائر غير مُدخل — ولا يُعرف من دخل.');
  if (!v.host) out.push('جهةُ المقابلة غير مُدخلة — ولا يُعرف إلى من دخل.');
  if (!v.phone) out.push('رقمُ هاتف الزائر غير مُدخل.');
  return out;
}

/* ═══════════════ ★★ حارسُ الخروج المحمّل ═══════════════ */

/**
 * ★★ **لا تخرج مركبةٌ محمّلةٌ بلا وصفِ حمولة** — يُستدعى من `exitVerdict`.
 *
 * ولماذا يمنع هذا وحده بينما الباقي يُعلَن؟ لأنّ ما قبل الخروج قابلٌ
 * للاستكمال ومركبتُه واقفةٌ عندنا، وما بعده خرج. وخروجٌ محمّلٌ بلا وصفٍ هو
 * **بالضبط** الثغرةُ التي بُنيت البوّابة لسدّها: بضاعةٌ غادرت ولا أحد يعرف
 * ما هي ولا إلى أين ولا من استلمها.
 *
 * ⚠️ ولا يُطلَق على زيارةٍ لم تُوصَف حمولةُ خروجها بعد **إن كانت فارغة** —
 * والفارغةُ هي الحالة الافتراضيّة، فالحارسُ لا يعطّل ما كان يمرّ.
 *
 * @returns {string[]} أسبابُ المنع — وفراغُها إذن.
 */
export function outLoadProblems(out) {
  const l = shapeOutLoad(out);
  const st = exitState(l.state);
  const problems = [];
  if (!st || l.state === 'empty') return problems;

  if (st.carriesGoods) {
    if (!l.cargoType) problems.push('لا خروجَ محمّلًا بلا نوعِ بضاعة — اكتب ماذا تحمل.');
    if (!l.destination) problems.push('لا خروجَ محمّلًا بلا وجهة — إلى أين تذهب؟');
    const refs = [l.doRef, l.transferRef, l.invoiceRef, l.soRef, l.issueRef].filter(Boolean);
    if (refs.length === 0) {
      problems.push('لا خروجَ محمّلًا بلا مستندٍ مرجعيّ — أمرُ تسليمٍ أو تحويلٍ أو فاتورةٌ أو أمرُ بيعٍ أو طلبُ صرف.');
    }
    if (!l.receivedBy) problems.push('لا خروجَ محمّلًا بلا اسمِ المستلِم أو الجهة المستلِمة.');
  }
  if (st.carriesPallets && palletTotal(l.pallets) === 0) {
    problems.push('أُعلن خروجُ طبلياتٍ عائدة وعددُها صفر — سجّل العدد أو غيّر حالة الخروج.');
  }
  return problems;
}

/* ═══════════════ القراءة — ج‑٦ على الشاشة ═══════════════ */

/**
 * ملخّصُ الحمولتين نصًّا — «دخلت بـ١٥ · خرجت بـ٦».
 *
 * ★ وهو **الجواب المباشر** على ما طلبه المالك: «النظام يجب ألّا يفترض أنّ
 * خروج المركبة يعني أنّها أصبحت فارغة». فالرقمان يُعرضان معًا ولا يُطرح
 * أحدهما من الآخر: حمولةُ الدخول بضاعةُ مورّدٍ وحمولةُ الخروج مرتجَعٌ إليه،
 * وطرحُهما يُنتج رقمًا لا معنى له.
 *
 * @returns {{in:object, out:object, differs:boolean, text:string}}
 */
export function loadSummary(load) {
  const l = shapeGateLoad(load);
  const inPallets = palletTotal(l.in.pallets);
  const outPallets = palletTotal(l.out.pallets);
  const stIn = LOAD_STATES.find((x) => x.id === l.in.state);
  const stOut = exitState(l.out.state);

  const inText = `${stIn?.label || '—'}${inPallets ? ` · ${inPallets} طبليّةً عائدة` : ''}${l.in.packages ? ` · ${l.in.packages} طردًا` : ''}`;
  const outText = `${stOut?.label || '—'}${outPallets ? ` · ${outPallets} طبليّةً عائدة` : ''}${l.out.packages ? ` · ${l.out.packages} طردًا` : ''}`;

  // «تختلف» تعني: ما خرج ليس صورةَ ما دخل — فيُنبَّه القارئ ليقرأ السطرين.
  const differs =
    l.in.state !== 'empty' || l.out.state !== 'empty'
      ? inPallets !== outPallets || l.in.packages !== l.out.packages || Boolean(l.out.cargoType && l.out.cargoType !== l.in.cargoType)
      : false;

  return {
    in: { state: l.in.state, label: stIn?.label || '', pallets: inPallets, packages: l.in.packages, text: inText },
    out: { state: l.out.state, label: stOut?.label || '', pallets: outPallets, packages: l.out.packages, text: outText },
    differs,
    text: `دخلت: ${inText} — خرجت: ${outText}`,
  };
}

/* ═══════════════ اللوحة ═══════════════ */

/**
 * تطبيعُ رقم اللوحة — ق-٦: تُكتب باليد، فتُطبَّع مرّةً في مكانٍ واحد.
 *
 * ★ ولا تُنزع الشرطةُ ولا تُحذف الحروف: لوحاتُ المملكة «٢٧-١٢٣٤٥٦» وحروفُها
 * جزءٌ من الهويّة، ونزعُها يجعل لوحتين مختلفتين لوحةً واحدة. المطبَّعُ هو
 * الفراغُ المكرّر وحالةُ الأحرف لا أكثر.
 */
export function normalizePlate(plate) {
  return up(plate).replace(/\s+/g, ' ');
}
