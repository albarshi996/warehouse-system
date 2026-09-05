/**
 * لوحةُ الخانة — تُمسح الخانةُ فتُفتح كمستودعٍ داخليّ. منطقٌ خالص.
 *
 * ═══ الفجوة التي تسدّها (طلب المالك 2026-09-01) ═══
 * كلُّ شاشات المخزون تبدأ **بمستند**: افتح أمرًا ثمّ اذهب إلى الرفّ. والعاملُ
 * في الممرّ يبدأ **بالرفّ**: يقف أمام خانةٍ ويريد أن يعرف ما فيها. فلا شاشةَ
 * تجيبه. وهذه هي التي تجيب: امسح الخانة ⟸ تنفتح بما فيها ⟸ امسح الصنف.
 *
 * ═══ ★★★ والقيدُ الحاكم: الرصيدُ لا يتحرّك من هنا ═══
 * لا قيدَ في هذا الملفّ ولا في شاشته. الأوضاعُ الكاتبةُ تبني **مسوّدةَ مستندٍ**
 * تمرّ بمحرّك المستندات القائم — نفس الطريق الذي يمرّ به كلُّ شيء. فلا مسارَ
 * رصيدٍ ثانٍ، ولا حارسَ يُلتفّ عليه.
 *
 * ═══ ولماذا هذه الأنواع بعينها (قياسٌ لا اختيار) ═══
 * قُرئت مخطّطاتُ المستندات، فحُكم بها لا بالظنّ:
 *   · **الجرد ⟶ `CC`** محضر الجرد الدوريّ: إلزامُه `zone` نصًّا — وهو الخانة
 *     نفسُها. وبنودُه تحمل `bin` و`bookQty` و`count1`. وسلسلتُه `CC → ADJ`
 *     قائمة، فالتسويةُ تأتي بعد المحضر لا قبله.
 *   · **السحب ⟶ `PICK`** قائمة السحب: إلزامُه `destination` نصًّا حرًّا.
 *   · **التخزين ⟶ `PUTAWAY`** أمر التخزين: إلزامُه `grnRef` **مرجعًا إلى
 *     مذكّرة استلامٍ قائمة**. فلا يُنشأ من فراغ — والتخزينُ هنا **تنفيذُ أمرٍ
 *     مفتوح** يُختار، لا اختراعُ أمر. ومن بناه بلا مرجعٍ بنى مستندًا يرفضه
 *     مخطّطُه عند الإرسال، فيقف العاملُ أمام رفٍّ بعملٍ لا يُحفظ.
 *     ★★ وطريقُه العمليُّ **الطبليّة** (‹JR-501› · `putawayRouteFor`): مسحُها
 *     في هذه الخانة يُنفَّذ بمحرّك `putawayService` القائم، ونسبُها
 *     (`sourceDoc`) هو الأمرُ المُنفَّذ — فلا مستندَ يُخترع ولا قيدَ يُنقض.
 */

import { classifyScan, expectKind, kindLabel } from '../barcodes/barcodeCode.js';
import { canDeriveFrom, isTerminal } from '../documents/states.js';
import { normalizeBarcode } from '../excel/excelSchema.js';
import { baseUomOf, normalizeUom } from '../items/uomModel.js';
import { itemForLine } from '../items/uomWiring.js';
import { palletsByBin } from '../lpn/palletMap.js';
import { binHeadline, describeBin, warehouseForBin } from './binAnatomy.js';
import { normalizeLocationCode, parseLocationCode } from './locationCode.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const str = (v) => String(v ?? '').trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * أوضاعُ اللوحة. `docType` فارغٌ يعني **لا كتابةَ البتّة**، و`needsOrder`
 * يعني أنّ الوضع ينفّذ أمرًا قائمًا ولا يُنشئ واحدًا.
 */
export const BIN_MODES = Object.freeze([
  { id: 'lookup', labelAr: 'استعلام', docType: '', needsOrder: false, qtyField: '' },
  { id: 'count', labelAr: 'جرد', docType: 'CC', needsOrder: false, qtyField: 'count1' },
  { id: 'pick', labelAr: 'سحب', docType: 'PICK', needsOrder: false, qtyField: 'qtyPicked' },
  { id: 'putaway', labelAr: 'تخزين', docType: 'PUTAWAY', needsOrder: true, qtyField: 'qty' },
]);

export function modeOf(id) {
  return BIN_MODES.find((m) => m.id === id) || BIN_MODES[0];
}

/**
 * ═══ ★★★ ‹JR-501› شرحُ الأوضاع — نصٌّ في الخدمة لا جملةٌ في JSX ═══
 *
 * لقطةُ المالك 2026-09-02 تُظهر الصفحةَ عند الهبوط: **حقلٌ وزرّان ولا شيءَ
 * غير ذلك**. وأربعةُ أزرارٍ مكتوبٌ عليها «استعلام · جرد · سحب · تخزين» لا
 * تقول لأحدٍ **ماذا يكتب** كلٌّ منها — والفرقُ بين «جرد» و«سحب» هنا فرقُ
 * محضرٍ يُصحّح الرصيد وقائمةٍ تُنقصه. فمن جرّب ليعرف، جرّب على بضاعةٍ حقيقيّة.
 *
 * وثلاثةُ حقولٍ لا واحد: **ما هو** · **متى يُستعمل** · **وماذا يكتب**. والثالثُ
 * أهمُّها — لأنّ سؤال الواقف أمام الرفّ ليس «ما هذا الزرّ» بل «ماذا سيحدث
 * للرصيد إن ضغطتُه».
 */
export const MODE_HELP = Object.freeze({
  lookup: Object.freeze({
    what: 'يقرأ ولا يكتب — يفتح الخانةَ كمستودعٍ داخليّ: أصنافُها ودفعاتُها وطباليها.',
    when: 'حين تقف أمام رفٍّ وتريد أن تعرف ما فيه قبل أن تلمسه.',
    writes: 'لا شيء — ولا مستندَ ولا رصيد.',
  }),
  count: Object.freeze({
    what: 'إثباتُ ما في الخانة فعلًا: تمسح الصنفَ وتكتب ما عددتَه بيدك.',
    when: 'الجردُ الدوريّ، أو حين يخالف الرفُّ ما يقوله النظام.',
    writes: 'كلُّ مسحةٍ تُثبَّت في السحابة لحظتَها، ومحضرُ جردٍ (CC) عند إنهاء الجلسة — والفارقُ يُحسب فيه ولا تُصحَّح أرصدةٌ من هنا.',
  }),
  pick: Object.freeze({
    what: 'إخراجٌ من هذه الخانة إلى وجهةٍ تكتبها — والكمّيّةُ محروسةٌ بما فيها.',
    when: 'حين تجهّز طلبًا أو تنقل بضاعةً إلى ساحة التجهيز.',
    writes: 'قائمةَ سحبٍ (PICK) مسوّدةً — والرصيدُ يتحرّك عند اعتمادها في محرّك المستندات لا هنا.',
  }),
  putaway: Object.freeze({
    what: 'إدخالٌ إلى هذه الخانة — **بمسح طبليّةٍ مُلصَقة** تُنقل إليها بنسبها.',
    when: 'بعد الاستلام وطباعة الملصق: تقف عند الرفّ وتمسح الطبليّةَ التي وضعتَها فيه.',
    writes: 'نقلةَ الطبليّة وحالتَها (مخزَّنة) — ولا يُنشئ أمرَ تخزينٍ من الرفّ، فأمرُ التخزين يلزمه مرجعُ استلامٍ قائم.',
  }),
});

/** شرحُ وضعٍ بعينه — والمجهولُ يعود إلى الاستعلام، أسلمِ الأربعة. */
export function modeHelp(id) {
  return MODE_HELP[modeOf(id).id];
}

/**
 * ═══ ★★★ ‹JR-501› هويّتا الصفحة عند الهبوط (طلبُ المالك ط‑٧) ═══
 *
 * بحروفه: «نحتاج إضافةَ أزرارٍ توضيحيّة، **لأنّها الصفحة التي سيُنشأ منها
 * كودُ الموقع وما يوجد في الموقع**». فهما فعلان لا فعلٌ واحد، وأحدُهما كان
 * **لا يُبلَغ إلّا بالصدفة**: التكويدُ لا يُفتح إلّا لمن مسح باركودًا غيرَ
 * مربوطٍ فأجاب عن سؤال الالتباس. ومن دخل الصفحةَ ليكوّد رفًّا جديدًا لم يجد
 * بابًا يقول اسمَه — فالزرُّ الذي لا يُسمّى فعلَه غيرُ موجود.
 *
 * @returns {Array<{id:string, title:string, body:string, action:string}>}
 */
export function landingPrimer() {
  return [
    {
      id: 'coding',
      title: 'هنا يُنشأ كودُ الموقع',
      body: 'رفٌّ جديدٌ أو ملصقٌ جاهزٌ من التسويق: تختار الممرَّ والجهةَ والرفَّ والخانة، فيُولَّد الكودُ ويُربط به الباركود. ومن هنا فقط يصير الملصقُ عنوانًا يعرفه النظام.',
      action: 'ابدأ بالعنوان — كوّدْ موقعًا',
    },
    {
      id: 'contents',
      title: 'وهنا تُرى محتوياتُه',
      body: 'امسح ملصقَ خانةٍ مكوَّدةٍ فتنفتح كمستودعٍ داخليّ: أصنافُها ودفعاتُها وطباليها. ثمّ تختار وضعَ العمل — جردًا أو سحبًا أو تخزينًا.',
      action: 'امسح ملصق الخانة',
    },
  ];
}

/**
 * وجهةُ المسحة — بالتصنيف لا بترتيب الحقول.
 *
 * ★★ لماذا بالتصنيف؟ لأنّ العاملَ يمسح بأيّ ترتيب: قد يمسح الصنفَ ثمّ يتذكّر
 * الخانة، وقد يمسح خانةً أخرى وهو واقفٌ في الأولى. وشاشةٌ تحكم «الحقلُ الفارغ
 * الأوّل» تضع كودَ خانةٍ في خانة الصنف بلا صوت.
 *
 * ★★★ و**لا يُفترض شكلُ ملصق الموقع** (طلب المالك 2026-09-02): الملصقُ
 * الملصوقُ على الرفّ قد يكون أيَّ باركود — رقمًا صرفًا من لفّةٍ جاهزة. فمن
 * حكم بأنّ «الرقمَ صنفٌ» منع تكويدَ نصفِ المخازن. والحكمُ هنا ثلاثيّ:
 *   · `bound` — مربوطٌ بموقعٍ سلفًا ⟶ موقعٌ مهما كان شكلُه.
 *   · شكلُ كود موقعٍ ⟶ موقعٌ بلا سؤال.
 *   · وإلّا وبلا خانةٍ مفتوحة ⟶ **يُسأل ولا يُفترض**: أملصقُ موقعٍ لم يُكوَّد
 *     بعد، أم صنفٌ مُسح قبل أوانه؟ وكلاهما يقع في المخزن.
 *
 * @returns {{action:'bin'|'item'|'pallet'|'ambiguous'|'reject', code, kind, message}}
 */
export function routeScan(raw, { hasBin = false, bound = false } = {}) {
  if (!str(raw)) return { action: 'reject', code: '', kind: 'UNKNOWN', message: 'امسح باركود الخانة أو اكتب كودها.' };

  const { kind, code, problem } = classifyScan(raw);
  if (bound) return { action: 'bin', code, kind, message: '' };
  if (kind === 'LOCATION') return { action: 'bin', code, kind, message: '' };

  if (!hasBin) {
    // ★ والالتباسُ محصورٌ بما يحتمله شكلُه: رقمٌ صرفٌ أو مجهول. أمّا الطبليّةُ
    //   (بادئة LPN) والمستندُ والمركبةُ فأشكالُها تقطع الشكّ — فتُردّ برسالةٍ
    //   تقول الصواب، ولا يُسأل عمّا لا يحتمل سؤالًا.
    if (kind === 'ITEM' || kind === 'UNKNOWN') {
      return {
        action: 'ambiguous',
        code,
        kind,
        message: `«${code}» غير مربوطٍ بموقع. أهو ملصقُ موقعٍ تريد تكويده؟`,
      };
    }
    return {
      action: 'reject',
      code,
      kind,
      message: expectKind(raw, ['LOCATION']).message || 'امسح الخانة أوّلًا — لا عملَ بلا موقعٍ معلوم.',
    };
  }

  if (kind === 'ITEM') return { action: 'item', code, kind, message: '' };
  if (kind === 'PALLET') return { action: 'pallet', code, kind, message: '' };

  return {
    action: 'reject',
    code,
    kind,
    message: problem || `المطلوب صنفٌ أو طبليّة — والممسوح ${kindLabel(kind)} «${code}».`,
  };
}

/**
 * محتوى الخانة — «المستودع الداخليّ».
 *
 * الأصنافُ من ورقة الأرصدة، والطبالي من حالات الطبالي الواقفة. والعلاقةُ
 * «خانة ← طبالي» **تُشتقّ ولا تُخزَّن** (عرفُ `palletMap`)، فلا حقلَ ثانٍ
 * يفترق عن الحقيقة.
 *
 * ═══ ★★★ ‹JR-301ج› والصفُّ يحمل وحدتَه ومعاملَه ═══
 * كان الصفُّ يُبنى **بلا مفتاح `uom` إطلاقًا**. وأثرُه لم يكن في العرض بل في
 * الكتابة: `binSession.scanPayload` يقرأ `item.uom` — فكلُّ مسحةٍ خرجت من هذه
 * الشاشة كتبت `uom: ''` في السجلّ، وكلُّ بندٍ خرج من `draftLineFor` خرج بلا
 * وحدة. ومن قرأ «١٢» بعد شهرٍ لم يعرف: اثنتا عشرة قطعةً أم اثنا عشر كرتونًا؟
 *
 * والرصيدُ مخزَّنٌ **بوحدة الأساس** دائمًا (`movements.js` يحوّل قبل أن يقيّد)
 * — فوحدةُ الصفّ هي أساسُ بطاقته، ومعاملُه إلى الأساس ١. وورقةُ الأرصدة نفسُها
 * لا عمودَ وحدةٍ فيها، فتُقرأ الوحدةُ من **بطاقة الصنف** بفهرسٍ يمرَّر
 * (`indexes` من `buildItemIndexes`). وبلا فهرسٍ يبقى الصفُّ كما كان.
 */
export function binContents(code, { balances = [], units = [], indexes = null } = {}) {
  const bin = normalizeLocationCode(code);
  if (!bin) return { bin: '', lines: [], pallets: [], totalQty: 0, skuCount: 0 };

  const lines = (balances || [])
    .filter((b) => normalizeLocationCode(b?.bin ?? b?.location) === bin)
    .map((b) => ({
      sku: up(b?.sku),
      barcode: str(b?.barcode),
      nameAr: str(b?.nameAr),
      batch: str(b?.batch),
      expiry: str(b?.expiry),
      qty: num(b?.qty),
      unitCost: num(b?.unitCost),
      warehouse: up(b?.warehouse),
      // ★ الهويّةُ بالكود أوّلًا ثمّ الباركود — عينُ ترتيب `itemForLine`، فلا
      //   قاعدةَ هويّةٍ ثانيةٌ تفترق عن قاعدة المستندات يومًا.
      uom: baseUomOf(itemForLine(b, indexes)) || str(b?.uom),
      // معاملُ وحدة الصفّ إلى الأساس — وهي الأساسُ نفسُه، فمعاملُها ١ أبدًا.
      uomFactor: 1,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.batch.localeCompare(b.batch));

  const pallets = palletsByBin(units).get(bin) || [];

  return {
    bin,
    lines,
    pallets,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    skuCount: new Set(lines.map((l) => l.sku)).size,
  };
}

/**
 * حالةُ الخانة الممسوحة — ثلاثٌ لا اثنتان (عرفُ `binAssignment`).
 *
 * `known` فارغةً تعني **أنّ البانية لم تُشغَّل بعد**، فلا يُحكم على أحد:
 * حكمٌ بالجهل على أداةٍ لم تُستعمل يوقف عملًا صحيحًا.
 */
export function binProblem(code, knownCodes = []) {
  const bin = normalizeLocationCode(code);
  if (!bin) return 'كود الخانة مطلوب.';
  const known = new Set([...(knownCodes || [])].map(up).filter(Boolean));
  if (known.size && !known.has(bin)) {
    return `الخانة «${bin}» غير معرَّفةٍ في سيّد المواقع — ملصقُ فرعٍ آخر أو كودٌ لم يُولَّد بعد.`;
  }
  return '';
}

/** أيطابق ما مُسح هذا الصفَّ؟ يقبل الكود أو الباركود — الملصقُ قد يحمل أيًّا منهما. */
export function matchesLine(line, scanned) {
  const raw = str(scanned);
  if (!raw) return false;
  if (up(raw) === up(line?.sku)) return true;
  const code = normalizeBarcode(raw);
  return Boolean(code) && code === normalizeBarcode(line?.barcode);
}

/** صفوفُ الخانة التي يطابقها المسحُ — قد تكون أكثر من صفٍّ (دفعاتٌ شتّى). */
export function linesForScan(contents, scanned) {
  return (contents?.lines || []).filter((l) => matchesLine(l, scanned));
}

/**
 * ═══ ★★★ ‹JR-301ج› كمّيّةُ القيد ووحدتُها — المساران يلتقيان هنا ═══
 *
 * **القاعدةُ الحاكمة: كمّيّةُ البند مقروءةٌ بوحدة البند.** ومن كسرها كسر
 * الدفترَ صامتًا، لأنّ `movements.js` نحو ‹١٦٤› **لا يحوّل إلّا لصنفٍ
 * `hasUomDefinition`**: فبندٌ يقول «٣ صناديق» لصنفٍ بلا تعريفٍ يُقيَّد **٣
 * قطع** — وفارقُه ١١٠٠٪، ولا رسالةَ تُقال.
 *
 * فمساران ومخرَجٌ واحد (وهما مسارا `packEntry.js` نفسُهما):
 *   · **وحدةٌ معرَّفة** ⇒ الكمّيّةُ كما كتبها العاملُ والوحدةُ كما اختارها،
 *     والمحرّكُ يحوّل بمعامل بطاقتها. ولا نضرب نحن — ضربٌ مزدوج.
 *   · **وعاءٌ مُعلَن** (`packEntryVerdict().entry`) ⇒ الصنفُ بلا تعريفٍ أصلًا
 *     فلا محرّكَ يحوّل، فيُسطَّح المجموعُ إلى الأساس **هنا**، وتبقى وحدةُ البند
 *     وحدةَ الصفّ (أساسًا) لا اسمَ الوعاء — وإلّا قرأه قارئٌ «٣٦ صندوقًا».
 *
 * ⚠️ والإعلانُ يُحفظ بأسماءٍ **لا يقرؤها محرّكُ القيد** (`packUom`/`packFactor`/
 * `packQty`): لو كُتب `uomFactorSource:'declared'` ووُسِّع المحرّكُ يومًا ليُفضّل
 * المختوم، لَضرب في ١٢ كمّيّةً مضروبةً سلفًا — ٣٦ تصير ٤٣٢ بلا صوت.
 *
 * @returns {{qty:number, uom:string, factor:number, pack:object|null}}
 */
export function entryQuantity({ row = null, qty, uom = '', pack = null } = {}) {
  const rowUom = str(row?.uom);
  const rowFactor = num(row?.uomFactor) || 1;

  if (pack && num(pack.baseQty) > 0) {
    return {
      qty: num(pack.baseQty),
      uom: rowUom,
      factor: rowUom ? rowFactor : 0,
      pack: { uom: str(pack.uom), factor: num(pack.factor), qty: num(pack.qty) },
    };
  }

  // ★ ومعاملُ الوحدة المختارة يعرفه محرّكُ الوحدات لا نحن — فلا يُكتب معاملٌ
  //   إلّا حين تكون الوحدةُ وحدةَ الصفّ نفسَها (وهي الأساس، ومعاملُها ١).
  //   ومعاملٌ مظنونٌ أسوأُ من لا معامل: الأوّلُ يُضرب به، والثاني يُسأل عنه.
  const chosen = str(uom) || rowUom;
  return { qty: num(qty), uom: chosen, factor: chosen && chosen === rowUom ? rowFactor : 0, pack: null };
}

/**
 * بندُ مسوّدةٍ من مسحةٍ واحدة — بأسماء أعمدة المستند لا بأسمائنا.
 *
 * ⚠️ الأسماء هنا **ليست اختيارًا**: `movements.js` يقرأ `bin` و`sku` و
 * `description`، والقاعدةُ تقرأ حقلَ الكمّيّة باسمه في `postingRules`. واسمٌ
 * مخالفٌ يُنتج بندًا يبدو سليمًا ويقيّد صفرًا.
 *
 * ★ والوحدةُ تُكتب **حين تُعرف وحدها**: بندٌ لصفٍّ بلا وحدةٍ يخرج كما كان
 *   حرفًا بحرف، فلا يتغيّر مخرَجُ مستدعٍ قائمٍ لم يمرّر الجديد.
 */
export function draftLineFor(mode, { bin, item = {}, qty, bookQty = 0, uom = '', pack = null } = {}) {
  const m = modeOf(mode);
  if (!m.docType) return null;

  const q = entryQuantity({ row: item, qty, uom, pack });

  const base = {
    sku: up(item.sku),
    barcode: str(item.barcode),
    description: str(item.nameAr || item.description),
    bin: normalizeLocationCode(bin),
    batch: str(item.batch),
    expiry: str(item.expiry),
    unitPrice: num(item.unitCost ?? item.unitPrice),
  };

  if (q.uom) {
    base.uom = q.uom;
    if (q.factor > 0) {
      base.uomFactor = q.factor;
      // المعرّفُ القياسيُّ للمقارنة — عينُ ما يقارنه `movements.js`
      // (`stampedFor === (normalizeUom(entryUom) || entryUom)`).
      base.uomFactorFor = normalizeUom(q.uom) || q.uom;
      base.uomFactorSource = 'item';
    }
  }
  if (q.pack) {
    base.packUom = q.pack.uom;
    base.packFactor = q.pack.factor;
    base.packQty = q.pack.qty;
  }

  if (m.id === 'count') {
    // الفارقُ لا يُكتب بل يُحسب — نفسُ قاعدة `ADJ` في `postingRules`.
    return { ...base, bookQty: num(bookQty), count1: q.qty, count2: '' };
  }
  return { ...base, [m.qtyField]: q.qty };
}

/**
 * أعطابُ البند قبل إضافته — كلٌّ جملةٌ تقول الصواب.
 *
 * والسحبُ وحدَه يُحرَس بالرصيد: من يسحب أكثر ممّا في الخانة يُنتج قيدًا
 * سالبًا يرفضه حارسُ الرصيد **بعد** أن يكون العاملُ قد حمل البضاعة.
 */
export function entryProblems(mode, { line, contents, scanned } = {}) {
  const m = modeOf(mode);
  if (!m.docType) return ['وضعُ الاستعلام لا يكتب شيئًا — بدّل الوضع أوّلًا.'];

  const problems = [];
  if (!line?.bin) problems.push('لا خانةَ مفتوحة — امسح ملصقَ الخانة أوّلًا.');
  if (!line?.sku && !line?.barcode) {
    problems.push('لم يُعرَف الصنفُ الممسوح — امسح ملصقًا سليمًا أو اخترْ من محتوى الخانة.');
  }

  const qty = m.id === 'count' ? num(line?.count1) : num(line?.[m.qtyField]);
  if (!(qty > 0)) problems.push('الكمّيّة يجب أن تكون أكبر من صفر.');

  if (m.id === 'pick' && qty > 0) {
    const key = str(scanned) || str(line?.sku) || str(line?.barcode);
    const available = linesForScan(contents, key).reduce((s, l) => s + l.qty, 0);
    if (qty > available) {
      problems.push(`الكمّيّة ${qty} تتجاوز ما في الخانة (${available}) — اسحب الموجودَ أو صحّح الجرد أوّلًا.`);
    }
  }
  return problems;
}

/**
 * مسوّدةُ المستند كاملةً — ترويسةٌ وبنود، جاهزةً لـ`createDraft`.
 *
 * تُعيد `null` لوضعٍ لا يكتب، أو لوضعٍ ينفّذ أمرًا قائمًا (`needsOrder`) —
 * فذاك يُفتح لا يُنشأ، ودالّةٌ تُنشئه تخترع مستندًا يرفضه مخطّطُه.
 */
export function buildDocDraft(mode, { bin, warehouse, lines = [], destination = '', today = '' } = {}) {
  const m = modeOf(mode);
  if (!m.docType || m.needsOrder) return null;
  if (!lines.length) return null;

  const code = normalizeLocationCode(bin);
  const wh = up(warehouse);

  if (m.id === 'count') {
    return {
      type: 'CC',
      header: {
        countDate: str(today),
        countType: 'جرد خانة',
        // ★ `zone` هي الخانة نفسُها — فمحضرُ الجرد يقول أين وقع، ومن قرأه
        //   بعد شهرٍ يعرف الرفَّ لا «المستودع» وحده.
        zone: code,
        warehouse: wh,
      },
      lines,
    };
  }

  return {
    type: 'PICK',
    header: { orderDate: str(today), warehouse: wh, destination: str(destination), sourceBin: code },
    lines,
  };
}

/**
 * لماذا لا يُنشأ مستندُ هذا الوضع — نصٌّ يُعرض للعامل بدل زرٍّ معطَّلٍ صامت.
 */
export function orderRequirementOf(mode) {
  const m = modeOf(mode);
  if (!m.needsOrder) return '';
  return 'أمرُ التخزين يلزمه مرجعُ مذكّرة استلام (GRN)، فلا يُنشأ من الرفّ — اخترْ أمر تخزينٍ مفتوحًا ونفّذه في هذه الخانة.';
}

/**
 * ═══ ★★★ ‹JR-501› وضعُ التخزين يكفّ عن كونه طريقًا مسدودًا ═══
 *
 * كان الوضعُ يعرض جملةً واحدةً: «اخترْ أمرَ تخزينٍ مفتوحًا» — **والشاشةُ لا
 * تعرض ولا واحدًا**، وخانةُ الكمّيّة وزرُّ الإضافة مخفيّان. جملةٌ تأمر بما لا
 * تستطيعه، وأسوأُ من الصمت.
 *
 * والمخرجُ كان موجودًا ومهمَلًا: `routeScan` يُعيد `action:'pallet'` منذ أوّل
 * يوم، والشاشةُ ترميه برسالةٍ إخباريّة. و`putawayService.executePutaway`
 * مبنيّةٌ وتعمل في شاشة الاستلام، تكتب في `handling_units` وحدَها (وقواعدُها
 * منشورة)، **ولا تحتاج مستندَ PUTAWAY** لأنّ الطبليّة تحمل `sourceDoc` —
 * فالقيدُ الحاكم «التخزينُ تنفيذُ أمرٍ لا اختراعُه» محفوظٌ **عبر نسب الطبليّة**
 * لا عبر مستندٍ يُخترع من الرفّ.
 *
 * فالوجهتان تُحكمان هنا، والشاشةُ تعرض ولا تقرّر:
 *   · `'pallet-execute'` — طبليّةٌ مُسحت وأنت في وضع التخزين ⟶ تُنفَّذ.
 *   · `'needs-order'`    — لا طبليّة ⟶ يُشرح الطريقُ وتُعرض الأوامرُ المفتوحة.
 *   · `''`               — ليس وضعَ تخزينٍ أصلًا.
 *
 * @returns {'pallet-execute'|'needs-order'|''}
 */
export function putawayRouteFor(mode, scanAction = '') {
  const m = modeOf(mode);
  if (!m.needsOrder) return '';
  return str(scanAction) === 'pallet' ? 'pallet-execute' : 'needs-order';
}

/**
 * أوامرُ التخزين المفتوحة — تُعرض برابطها بدل جملةٍ تأمر بما لا يُرى.
 *
 * ★ و«مفتوح» حكمُ `states.js` لا قائمةٌ تُكتب هنا: منتهٍ لا يُعرض، وما لم
 *   يُعتمد بعد لا يُنفَّذ. ومن نسخ قائمةَ الحالات هنا خلّف نسختين تفترقان.
 * ★★ والمستودعُ يُرشِّح حين يُعرف: أمرُ تخزينٍ في مستودعٍ آخر لا يُنفَّذ في
 *   هذه الخانة (القاعدة ٣) — فعرضُه إغراءٌ برفضٍ مؤجّل.
 */
export function openPutawayOrders(docs = [], { warehouse = '', max = 8 } = {}) {
  const wh = up(warehouse);
  return (docs || [])
    .filter((d) => up(d?.type) === 'PUTAWAY' && !isTerminal(d?.state) && canDeriveFrom(d?.state))
    .filter((d) => {
      const docWh = up(d?.header?.warehouse);
      return !wh || !docWh || docWh === wh;
    })
    .slice(0, Math.max(0, num(max)))
    .map((d) => ({
      id: str(d?.id),
      number: str(d?.number) || str(d?.id),
      warehouse: up(d?.header?.warehouse),
      grnRef: str(d?.header?.grnRef),
      lineCount: (d?.lines || []).length,
    }));
}

/**
 * ═══ المرحلة الأولى: اقرأ · عرّف · ثمّ تُحدَّد (طلب المالك 2026-09-02) ═══
 *
 * ★★★ لماذا خطوةُ تعريفٍ قبل العمل؟
 * المسحُ فِعلٌ أعمى: العاملُ يوجّه العدسةَ فيُقرأ **شيءٌ ما**. وشاشةٌ تفتح
 * الخانةَ فورًا تجعله يعمل في رفٍّ لم يتأكّد أنّه رفُّه — ولا يكتشف الخطأ
 * إلّا بعد أن يُثبت كمّيّاتٍ في المكان الغلط. فالتعريفُ يقول له **بالعربيّة**
 * ما الذي مسحه: أيَّ مستودعٍ وأيَّ ممرٍّ وأيَّ جهةٍ ورفٍّ وخانة — ومعه ملخّصٌ
 * سريع: أفارغةٌ هي أم فيها بضاعة. ثمّ **هو** من يضغط «حدّد».
 *
 * @returns {{code, valid, warehouse, segments, headline, known, problem, summary}}
 */
export function identifyBin(code, { warehouses = [], knownCodes = [], balances = [], units = [] } = {}) {
  const bin = normalizeLocationCode(code);
  const parsed = parseLocationCode(bin);
  const warehouse = warehouseForBin(bin, warehouses);
  const contents = binContents(bin, { balances, units });
  const known = new Set([...(knownCodes || [])].map(up).filter(Boolean));

  // ★★★ مانعٌ ومنبِّهٌ لا شيءٌ واحد. المانعُ يوقف العمل: كودٌ معطوب، أو خانةٌ
  // لا وجودَ لها في سيّد المواقع. والمنبِّهُ يُقال ولا يوقف: مستودعٌ لم يُربط
  // بالبادئة بعد — وهو نقصُ إعدادٍ لا خطأُ عامل، ومن أوقفه عليه أوقف عملًا
  // صحيحًا بحجّة أنّ الإدارة لم تُكمل صفحةً.
  const problem = parsed
    ? binProblem(bin, knownCodes)
    : `«${bin || code}» ليس كودَ موقعٍ صالح — امسح ملصقَ خانةٍ سليمًا.`;
  const warning =
    parsed && !warehouse
      ? `البادئة «${parsed.warehouse}» لم تُربط بمستودعٍ في البوّابة — يُعرض العنوانُ بالتسميات الافتراضيّة.`
      : '';

  return {
    code: bin,
    valid: Boolean(parsed),
    warehouse,
    segments: describeBin(bin, warehouse),
    headline: binHeadline(bin, warehouse),
    known: known.size ? known.has(bin) : true,
    problem,
    warning,
    summary: {
      skuCount: contents.skuCount,
      totalQty: contents.totalQty,
      palletCount: contents.pallets.length,
      empty: contents.lines.length === 0 && contents.pallets.length === 0,
    },
  };
}
