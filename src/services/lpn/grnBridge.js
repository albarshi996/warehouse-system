/**
 * جسرُ الجلسة إلى GRN — حيث تصير الحمولة **رصيدًا**. منطق خالص.
 *
 * المشكلة التي يحلّه: بعد الاعتماد تصير للحمولة هويّةٌ وموقعٌ وسجلّ… **ولا
 * يتحرّك الرصيد**. فالطبلية تقول «أنا هنا» والدفتر يقول «لم يدخل شيء» —
 * رقمان يتناقضان، وهو عين ما بُنيت الطبقة لتمنعه.
 *
 * والوصل ليس اختراعًا: محرّك المستندات يعرف كيف يشتقّ GRN من PO بأقفال
 * تخصيصه ومطابقته الثلاثيّة، ويعرف كيف يقيّد عند «منجَز». فالجسر **يُجهّز
 * مدخلاته ولا يبني محرّكًا ثانيًا**.
 *
 * ═══ القاعدة الحاكمة (ح-٢) ═══
 * **الطبلية لا تقيّد حركة — المستند يقيّدها.** فالجسر يحسب «كم استُلم لكلّ
 * سطرٍ من الأمر» من الطبالي المعتمدة، ويسلّمه لـ`createNextInChain` بصيغة
 * `requestedByLine` التي يفهمها المحرّك أصلًا. ثمّ تمضي السلسلة المالية
 * (GRN←QC←المطابقة الثلاثيّة) كما كانت **بلا أن تعرف الطبالي**.
 *
 * ولماذا بالكمّيّة الأساس؟ لأنّ سطر الأمر بوحدته، والقراءة قد تكون كرتونةً.
 * فما يُسلَّم للمحرّك هو الأساس المحسوب يوم القراءة — لا عددُ المسحات.
 */

/**
 * الطبالي التي تُحتسب في GRN: **المعتمَدة وحدها**.
 *
 * المرجوضةُ لم تدخل، والمرجَعةُ للتصحيح لم تُعتمد بعد، والموسومةُ بالفحص
 * أو الحجز **دخلت فعلًا** فتُحتسب — الوسم يمنع صرفها لا وجودها.
 */
export function countableDrafts(drafts) {
  return (drafts ?? []).filter((d) => d?.lpn && ['APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED'].includes(d?.state));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ★★ مُنقذُ الطبالي القديمة — هويّةٌ تُستردّ ولا تُخترع
 * ═══════════════════════════════════════════════════════════════════════════
 * `lpnContents.addReading` كانت تكتب البند بلا `lineId` (أُصلحت)، فبقيت في
 * السحابة طبالٍ معتمدةٌ **بنودُها يتيمة**. وإصلاحُ الكاتب وحده لا يُنقذها:
 * تظلّ متخطّاةً هنا إلى الأبد، فيقرأ الموظّف «الطبالي المعتمدة فارغة» وهي
 * ممتلئة، ولا يُولَّد استلامُها أبدًا.
 *
 * فالبندُ اليتيم يُنسب إلى سطر الأمر **حين يكون السطرُ يقينًا لا ظنًّا**:
 * صنفٌ يطابق سطرًا واحدًا لا غير. وأمّا اللبس فيُعلَن في `orphanLines`.
 *
 * ⚠️ **ولا يُنقذ اللبسُ بالباركود**: باركودُ البند هو **الممسوح** (باركود
 * الكرتونة مثلًا) وباركودُ سطر الأمر باركودُ الصنف — فليسا حقلًا واحدًا،
 * والاتّفاقُ بينهما صدفةٌ لا دليل. والأهمُّ: أيُّ سطرٍ من سطرَي الصنف الواحد
 * يستهلكه هذا الاستلام **قرارُ عملٍ** لا يحسمه رقمُ عبوة.
 */

/** سببُ بقاء البند يتيمًا — نصٌّ يقرؤه الموظّف لا رمزٌ يفكّه. */
const ORPHAN_AMBIGUOUS = 'يطابق سطرين أو أكثر من الأمر — الهويّة تُحسم يدويًّا';
const ORPHAN_NO_MATCH = 'لا سطرَ في الأمر يطابق صنفَه — طبليّةٌ من أمرٍ آخر أو صنفٌ حُذف';

/**
 * فهرسُ سطور الأمر بالصنف وبالباركود — والمتكرّرُ `null` أي **لبسٌ معلن**.
 *
 * `null` هنا عقيدةُ `baseQty` نفسُها: «لا أعرف» تُخزَّن ولا تُصفَّر، فتُميَّز
 * عن «لا وجود» (`undefined`) — واللبسُ يقول سببَه غيرَ سببِ الغياب.
 */
function lineIdIndex(session) {
  const bySku = new Map();
  const byBarcode = new Map();
  const put = (map, key, lineId) => {
    if (!key) return;
    map.set(key, map.has(key) ? null : lineId);
  };
  for (const l of session?.lines ?? []) {
    if (!l?.lineId) continue;
    put(bySku, up(l.sku), l.lineId);
    put(byBarcode, String(l.barcode ?? '').trim(), l.lineId);
  }
  return { bySku, byBarcode };
}

/**
 * هويّةُ سطر الأمر لبندِ طبليّة — المكتوبةُ أوّلًا، والمستردّةُ عند غيابها.
 *
 * @returns {{lineId:string, because:string}} و`because` فارغٌ عند النجاح.
 */
function resolveLineId(line, index) {
  const own = String(line?.lineId ?? '').trim();
  if (own) return { lineId: own, because: '' };

  const sku = up(line?.sku);
  if (sku && index.bySku.has(sku)) {
    const hit = index.bySku.get(sku);
    return hit ? { lineId: hit, because: '' } : { lineId: '', because: ORPHAN_AMBIGUOUS };
  }
  const bar = String(line?.barcode ?? '').trim();
  if (bar && index.byBarcode.has(bar)) {
    const hit = index.byBarcode.get(bar);
    return hit ? { lineId: hit, because: '' } : { lineId: '', because: ORPHAN_AMBIGUOUS };
  }
  return { lineId: '', because: ORPHAN_NO_MATCH };
}

/**
 * ★★ البنودُ التي لم تصل سطرًا — تُعلَن كما يُعلَن `unknownBase`.
 *
 * قبل هذا كانت تُبتلع في `continue` صامتٍ: كمّيّةٌ محفوظةٌ على طبليّةٍ معتمدة
 * تختفي من المذكّرة بلا سطرٍ ولا رسالة — وهو العطبُ الصامتُ عينُه الذي
 * تُبنى هذه الطبقةُ لمنعه.
 *
 * @returns {Array<{lpn:string, sku:string, barcode:string, qty:number,
 *   baseQty:number|null, because:string}>}
 */
export function orphanLines(session) {
  const index = lineIdIndex(session);
  const out = [];
  for (const draft of countableDrafts(session?.drafts)) {
    for (const line of draft.lines ?? []) {
      const { lineId, because } = resolveLineId(line, index);
      if (lineId) continue;
      const base = line?.baseQty == null ? NaN : Number(line.baseQty);
      out.push({
        lpn: draft.lpn,
        sku: String(line?.sku ?? '').trim(),
        barcode: String(line?.barcode ?? '').trim(),
        qty: Number(line?.qty) || 0,
        baseQty: Number.isFinite(base) ? round9(base) : null,
        because,
      });
    }
  }
  return out;
}

/**
 * ما استُلم فعلًا لكلّ سطرٍ من الأمر — بالكمّيّة الأساس.
 *
 * @returns {{byLine:Object<string,number>, unknownBase:Array, total:number}}
 *   و`unknownBase` بنودٌ بمعاملٍ مجهول: **لا تُحتسب ولا تُصفَّر** — تُعلَن
 *   ليحسمها إنسان، فرقمٌ مخمَّنٌ في مستندٍ ماليّ أسوأ من رقمٍ ناقصٍ معلوم.
 */
export function receivedByLine(session) {
  const byLine = {};
  const unknownBase = [];
  let total = 0;

  const index = lineIdIndex(session);
  for (const draft of countableDrafts(session?.drafts)) {
    for (const line of draft.lines ?? []) {
      const lineId = resolveLineId(line, index).lineId;
      if (!lineId) continue;
      const base = line?.baseQty == null ? NaN : Number(line.baseQty);
      if (!Number.isFinite(base) || base <= 0) {
        unknownBase.push({ lpn: draft.lpn, sku: line?.sku ?? '', uom: line?.uom ?? '', qty: Number(line?.qty) || 0 });
        continue;
      }
      byLine[lineId] = (byLine[lineId] ?? 0) + base;
      total += base;
    }
  }
  // تقريبٌ يمنع ذيول الفاصلة العائمة من إيقاف قفل التخصيص بفرقٍ لا يُرى.
  for (const k of Object.keys(byLine)) byLine[k] = Math.round((byLine[k] + Number.EPSILON) * 1e9) / 1e9;
  return { byLine, unknownBase, total: Math.round((total + Number.EPSILON) * 1e9) / 1e9 };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ★★★ ‹JR-201أ› الصلاحيةُ والدفعةُ تعبران — دوالُّ **أخوات** لا تعديل
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * العطب: موظّف الاستلام يكتب تاريخ الصلاحية عند كلّ مسحة فيُحفظ على الطبلية
 * (`lpnContents.addReading` · `receivingScan`)، ثمّ `receivedByLine` أعلاه
 * **تُسقط كلّ شيءٍ إلّا الكمّيّة**. فمذكّرة الاستلام تُولَد بخانة صلاحيةٍ
 * فارغة، و`balances.expiry` يبقى فارغًا، و**قاعدة FEFO عمياءُ عند التحضير**
 * (`locations/pickPlan.sellableStock` تصفّي على `b.expiry` — الحقل الذي لا
 * يصله شيء). فيُخرج المحضّر الجديد ويترك القديم حتّى يتلف.
 *
 * ⚠️ **ولا تُمسّ `receivedByLine` بحرف.** إسقاطُها لغير الكمّيّة **مقصودٌ
 * وحامل**: مخرجُها يُسلَّم `requestedByLine` لقفل التخصيص في محرّك المستندات،
 * وأيُّ حقلٍ زائدٍ فيه يكذب على المحرّك. فالجديد يجاورها ولا يدخلها.
 *
 * ═══ قرار المالك (ق‑ج): **تُعلَن ولا تُخترع** ═══
 * الحقل يُصدَّر **فقط حين تتّفق عليه كلُّ الطبالي المعدودة** لذلك السطر.
 * اختلافُ طبليّتين ⟶ لا يُصدَر ذلك الحقلُ لذلك البند، ويخرج في
 * `extrasConflicts` ليحسمه إنسان — لأنّ اختيار إحدى الصلاحيتين لكمّيّة
 * السطر كلّها ينسب إلى نصف البضاعة تاريخًا لم يكتبه أحد.
 *
 * ⚠️ **والاختلافُ يُعلَن ولا يمنع**: `grnProblem` لم تتغيّر. منعُ التوليد
 * بسببه يقلب سلوكًا قائمًا (جلسةٌ كانت تُولّد أمس تتوقّف اليوم)، وصلاحيةٌ
 * ناقصةٌ معلومة أهونُ من استلامٍ لا يُولَد.
 */

/**
 * حقول التتبّع التي تعبر مع البند: مصدرُها على الطبلية واسمُها في المستند.
 *
 * ★★★ **`expiry` ⟶ `expiryDate` وليس `expiry`.** لأنّ
 * `POSTING_RULES.GRN.expiryField === 'expiryDate'` (نواة الدفتر)، ولأنّ
 * `LINE_MAP['GRN>QC']` في محرّك السلسلة يقرأ `expiryDate` ليورّثه للفحص ثمّ
 * للتخزين. **ومن أخطأ في هذا الحرف رأى بندًا صحيحًا يُرحَّل بصلاحيةٍ فارغة**
 * — لا رسالةَ خطأٍ ولا حمرة: عطبٌ صامتٌ تمامًا، وهو عين ما نُصلحه هنا.
 *
 * و`kind` مفتاحُ **المقارنة** لا القيمة المخرَجة: التواريخ تُقارَن يومًا
 * (نسخة `safeExpiry` في مفتاح الرصيد) كي لا تُعلَن `2027-03-01` مخالفةً
 * لـ`2027-03-01T00:00:00Z` — والدفترُ يوحّدهما أصلًا فالخلافُ وهمٌ يُقلق.
 */
const EXTRA_FIELDS = Object.freeze([
  Object.freeze({ from: 'batch', to: 'batch', kind: 'code', labelAr: 'رقم التشغيلة' }),
  Object.freeze({ from: 'expiry', to: 'expiryDate', kind: 'date', labelAr: 'تاريخ الصلاحية' }),
  Object.freeze({ from: 'supplierBatch', to: 'supplierBatch', kind: 'code', labelAr: 'دفعة المورّد' }),
  Object.freeze({ from: 'mfgDate', to: 'mfgDate', kind: 'date', labelAr: 'تاريخ الإنتاج' }),
]);

const up = (v) => String(v ?? '').trim().toUpperCase();

/** يومٌ قابلٌ للمقارنة `YYYY-MM-DD` — والفاسد فارغ لا مخمَّن (نسخة `safeExpiry`). */
function expiryDay(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** التقريب نفسه الذي تستعمله `receivedByLine` — يمنع ذيول الفاصلة العائمة. */
const round9 = (n) => Math.round((n + Number.EPSILON) * 1e9) / 1e9;

/** مفتاح تطابقٍ لا قيمةٌ تُخرَج: التواريخ يومًا والأكواد بحروفٍ كبيرة مشذّبة. */
const sameness = (kind, raw) => (kind === 'date' ? expiryDay(raw) : up(raw));

/**
 * ما قالته الطبالي في حقلٍ واحدٍ لسطرٍ واحد — **قيمًا متمايزة بترتيب ظهورها**.
 *
 * القيمة المُعادة هي ما كتبه الإنسان (مشذّبًا) لا مفتاحَ المقارنة: نُقارن
 * موحَّدًا ونُخرج منقولًا. و`pallets` **مُحاذاةٌ بالفهرس** لـ`values`: أوّلُ
 * طبليّةٍ قالت كلَّ قيمة — فيقول العرض «هذه تقول كذا وتلك تقول كذا».
 */
function fieldAgreement(entries, field) {
  const seen = new Map();
  for (const e of entries ?? []) {
    const key = sameness(field.kind, e?.[field.from]);
    if (seen.has(key)) continue;
    seen.set(key, { value: String(e?.[field.from] ?? '').trim(), pallet: e?.lpn ?? '' });
  }
  return {
    keys: [...seen.keys()],
    values: [...seen.values()].map((v) => v.value),
    pallets: [...seen.values()].map((v) => v.pallet),
  };
}

/**
 * ★★ تفصيلُ ما استُلم لكلّ سطر — صفٌّ لكلّ (طبليّة × بند) بحقول تتبّعه.
 *
 * نفسُ مرشِّح `countableDrafts` ونفسُ تقريب `receivedByLine` — **وبلا إعادة
 * تفسير**: الصلاحية تخرج كما كُتبت على الطبلية، فالتوحيدُ للمقارنة وحدها.
 *
 * ⚠️ **ليست مصدرَ كمّيّة.** البند مجهولُ المعامل يخرج هنا بـ`baseQty: null`
 * (لا يُصفَّر — عقيدةُ `totalBaseQty` نفسُها) لأنّ صلاحيّته تهمّ ولو جُهل
 * معاملُه؛ فمن جمع `baseQty` من هنا خالف مجموعَ `receivedByLine`. الكمّيّةُ
 * من هناك وحدها، وهذه سجلُّ محتوى.
 *
 * @returns {Object<string, Array<{batch:string, expiry:string, supplierBatch:string,
 *   mfgDate:string, uom:string, factor:number|null, baseQty:number|null,
 *   lpn:string, sku:string, barcode:string}>>}
 */
export function receivedDetailByLine(session) {
  const byLine = {};
  const index = lineIdIndex(session);
  for (const draft of countableDrafts(session?.drafts)) {
    for (const line of draft.lines ?? []) {
      // نفسُ مُنقذ `receivedByLine` — وإلّا عبرت الكمّيّةُ وتخلّفت صلاحيّتُها.
      const lineId = resolveLineId(line, index).lineId;
      if (!lineId) continue;
      // ⚠️ `Number(null)` صفرٌ لا NaN — فالفحص على الغياب نفسه، وإلّا مرّ
      // المجهول رقمًا صفريًّا. (نفس شرط `receivedByLine` حرفًا بحرف.)
      const base = line?.baseQty == null ? NaN : Number(line.baseQty);
      const factor = line?.factor == null ? NaN : Number(line.factor);
      (byLine[lineId] ??= []).push({
        batch: String(line?.batch ?? '').trim(),
        expiry: String(line?.expiry ?? '').trim(),
        supplierBatch: String(line?.supplierBatch ?? '').trim(),
        mfgDate: String(line?.mfgDate ?? '').trim(),
        uom: String(line?.uom ?? '').trim(),
        factor: Number.isFinite(factor) && factor > 0 ? factor : null,
        baseQty: Number.isFinite(base) && base > 0 ? round9(base) : null,
        lpn: draft.lpn,
        sku: String(line?.sku ?? '').trim(),
        barcode: String(line?.barcode ?? '').trim(),
      });
    }
  }
  return byLine;
}

/**
 * ★★★ حقولُ التتبّع الجاهزة للاندماج في بنود GRN — المتّفَقُ عليها وحدَه.
 *
 * تُدمج على ما يبنيه المحرّك لبند السطر، فيصل `expiryDate` إلى الدفتر
 * ومنه إلى `balances.expiry` — وتُبصر FEFO بعد عمى.
 *
 * ثلاثُ حالاتٍ لكلّ حقل، وثالثتُها هي التي تُنسى:
 *   ① اتّفاقٌ على قيمة        ⟶ تُصدَّر.
 *   ② اختلافٌ بين طبليّتين     ⟶ لا يُصدَر، ويخرج في `extrasConflicts`.
 *   ③ اتّفاقٌ على **الفراغ**   ⟶ لا يُصدَر **ولا يُعلَن خلافًا**: بضاعةٌ بلا
 *      دفعةٍ حالةٌ مشروعة (السائب والمعبّأ محلّيًّا)، وإعلانُها خلافًا يُغرق
 *      الشاشة بضجيجٍ يُعلَّم الموظّف تجاهلَه — فيضيع الخلافُ الحقيقيّ معه.
 *
 * ⚠️ والفراغُ المخالطُ للقيمة **خلافٌ لا فراغ**: طبليّةٌ بصلاحيةٍ وأخرى بلا
 * صلاحيةٍ لا تُصدَّران بصلاحية الأولى — فنصفُ الكمّيّة يحمل حينها تاريخًا لم
 * يكتبه أحد، وهو الاختراعُ عينُه الذي يمنعه ق‑ج.
 *
 * @returns {Object<string, {batch?:string, expiryDate?:string, supplierBatch?:string, mfgDate?:string}>}
 */
export function grnLineExtras(session) {
  const out = {};
  for (const [lineId, entries] of Object.entries(receivedDetailByLine(session))) {
    const fields = {};
    for (const field of EXTRA_FIELDS) {
      const { keys, values } = fieldAgreement(entries, field);
      if (keys.length !== 1) continue; // ② خلافٌ — يُعلَن هناك لا يُصدَر هنا
      if (!keys[0]) continue; // ③ اتّفاقٌ على الفراغ — صمتٌ لا خلاف
      fields[field.to] = values[0];
    }
    if (Object.keys(fields).length > 0) out[lineId] = fields;
  }
  return out;
}

/**
 * اختلافُ الطبالي على حقلِ تتبّع — ليُحسَم **قبل** زرّ التوليد لا بعده.
 *
 * يُعلَن كما يُعلَن `unknownBase`: قائمةُ عملٍ بأسماءٍ وقيمٍ، لا رقمٌ مخمَّن.
 * و`field` يحمل اسمَ الحقل **كما سيغيب عن المستند** (`expiryDate`) لا اسمَه
 * على الطبلية — فالموظّف يقرأ ما ينقص المذكّرة لا ما في قاعدة البيانات.
 *
 * @returns {Array<{lineId:string, sku:string, field:string, labelAr:string,
 *   values:string[], pallets:string[]}>} و`pallets` محاذيةٌ لـ`values` بالفهرس.
 */
export function extrasConflicts(session) {
  const out = [];
  for (const [lineId, entries] of Object.entries(receivedDetailByLine(session))) {
    const sku = entries.map((e) => e.sku || e.barcode).find(Boolean) ?? '';
    for (const field of EXTRA_FIELDS) {
      const { keys, values, pallets } = fieldAgreement(entries, field);
      if (keys.length < 2) continue;
      out.push({ lineId, sku, field: field.to, labelAr: field.labelAr, values, pallets });
    }
  }
  return out;
}

/**
 * سبب رفض توليد GRN من الجلسة — أو '' إن جاز.
 *
 * الترتيب هو الحارس: وجودُ مصدرٍ، ثمّ وجودُ حمولةٍ معتمدة، ثمّ ألّا يبقى
 * بندٌ مجهولُ المعامل يُخفي كمّيّةً عن مستندٍ ماليّ.
 */
export function grnProblem(session) {
  if (!session?.order?.id) return 'الجلسة بلا أمرٍ مصدر — لا يُشتقّ استلامٌ من فراغ.';
  if (session.order.type !== 'PO') {
    return `الاستلام يُشتقّ من أمر شراء — ومصدر هذه الجلسة «${session.order.type}». (النقل يُستلم بـTRC.)`;
  }
  const counted = countableDrafts(session.drafts);
  if (counted.length === 0) {
    return 'لا طبليةً معتمدةً في هذه الجلسة — اعتمد من الحوكمة أوّلًا، فما لم يُعتمد لا يصير رصيدًا.';
  }
  const { byLine, unknownBase } = receivedByLine(session);
  if (unknownBase.length > 0) {
    const names = [...new Set(unknownBase.map((u) => u.sku))].slice(0, 3).join(' · ');
    return `${unknownBase.length} بندًا بمعاملِ وحدةٍ مجهول (${names}) — عرّف المعامل في ماستر الأصناف أوّلًا. رقمٌ مخمَّنٌ في مستندٍ ماليّ أسوأ من انتظار.`;
  }
  if (Object.keys(byLine).length === 0) {
    // ⚠️ «فارغة» كذبةٌ حين تكون ممتلئةً بيتامى: الطبليّةُ تحمل والبنودُ لا
    // تعرف سطرَها. والرسالةُ تقول **الصوابَ الذي يُصلحه الموظّف** لا وصفًا
    // يُحيّره — عرفُ `receivingScan` نفسُه.
    const orphans = orphanLines(session);
    if (orphans.length > 0) {
      const names = [...new Set(orphans.map((o) => o.sku || o.barcode).filter(Boolean))].slice(0, 3).join(' · ');
      return `${orphans.length} بندًا على طبالٍ معتمدةٍ لا يعرف سطرَه من الأمر (${names}) — ${orphans[0].because}.`;
    }
    return 'لا كمّيّةً محتسَبة — الطبالي المعتمدة فارغة.';
  }
  return '';
}

/**
 * خلاصةٌ للعرض قبل التوليد: ماذا سيحمل GRN، ومن أيّ طبالٍ جاء.
 *
 * تُعرض للموظّف **قبل** الضغط: مستندٌ ماليٌّ يُنشأ بلا أن يُرى محتواه هو
 * توقيعٌ على المجهول.
 */
export function grnPreview(session) {
  const { byLine, unknownBase, total } = receivedByLine(session);
  const counted = countableDrafts(session?.drafts);
  // ‹JR-201أ› حقولُ التتبّع تُحسب هنا مرّةً ليعرضها الجدول: الحكمُ في المنطق
  // والشاشةُ تعرضه — لا تُعيد بناءه بشرطٍ في JSX.
  const extras = grnLineExtras(session);
  const lines = (session?.lines ?? [])
    .filter((l) => byLine[l.lineId] > 0)
    .map((l) => ({
      lineId: l.lineId,
      sku: l.sku,
      description: l.description ?? '',
      uom: l.uom,
      ordered: l.ordered,
      open: l.open,
      received: byLine[l.lineId],
      // تجاوزُ المفتوح يُعلَن هنا أيضًا: المحرّك سيرفضه بقفل التخصيص،
      // فيُقال قبل الضغط لا بعده برسالةٍ تقنيّة.
      over: Math.max(0, byLine[l.lineId] - (Number(l.open) || 0)),
      // المتّفَقُ عليه من دفعةٍ وصلاحية — والخالي منها يعني خلافًا أو صمتًا،
      // وتفصيلُه في `extrasConflicts` أدناه.
      extras: extras[l.lineId] ?? {},
    }));

  return {
    order: session?.order ?? null,
    supplier: session?.supplier ?? '',
    warehouse: session?.warehouse ?? '',
    palletCount: counted.length,
    pallets: counted.map((d) => d.lpn),
    lines,
    total,
    unknownBase,
    // ★★ يُعلَن كما يُعلَن `unknownBase` — **ولا يمنع**: `problem` لم يتغيّر،
    // فجلسةٌ كانت تُولّد أمس تُولّد اليوم بايتًا ببايت.
    extras,
    extrasConflicts: extrasConflicts(session),
    // ★★ بنودٌ محفوظةٌ لم تصل سطرًا — تُعرض ولا تُبتلع، وشأنُها شأنُ الخلاف:
    // تُعلَن ولا تمنع (`problem` لم يتغيّر).
    orphanLines: orphanLines(session),
    problem: grnProblem(session),
  };
}

/**
 * حقول رأس GRN المشتقّ من الجلسة — تُدمج على ما يبنيه المحرّك.
 *
 * لا تُعاد كتابة ما يعرفه المحرّك (المورد والأمر يأتيان من الاشتقاق) —
 * وإنّما يُضاف ما لا يعرفه: **مستودعُ الاستلام وطباليه**.
 */
export function grnHeaderFrom(session) {
  return {
    warehouse: session?.warehouse ?? '',
    receivedBy: session?.openedBy ?? '',
    // أثرُ الطبالي على المستند **نصًّا لا علاقةً**: علاقات التنفيذ
    // (BASE/TARGET) للمحرّك وحده، وإقحامُ الطبالي فيها يضخّم المنفَّذ
    // ويكذب الرصيد المفتوح. فالإشارة هنا للقارئ لا للحساب.
    palletRefs: countableDrafts(session?.drafts).map((d) => d.lpn).join(' · '),
    totalPallets: countableDrafts(session?.drafts).length,
  };
}
