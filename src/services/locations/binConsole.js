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
 */

import { classifyScan, expectKind, kindLabel } from '../barcodes/barcodeCode.js';
import { normalizeBarcode } from '../excel/excelSchema.js';
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
 */
export function binContents(code, { balances = [], units = [] } = {}) {
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
 * بندُ مسوّدةٍ من مسحةٍ واحدة — بأسماء أعمدة المستند لا بأسمائنا.
 *
 * ⚠️ الأسماء هنا **ليست اختيارًا**: `movements.js` يقرأ `bin` و`sku` و
 * `description`، والقاعدةُ تقرأ حقلَ الكمّيّة باسمه في `postingRules`. واسمٌ
 * مخالفٌ يُنتج بندًا يبدو سليمًا ويقيّد صفرًا.
 */
export function draftLineFor(mode, { bin, item = {}, qty, bookQty = 0 } = {}) {
  const m = modeOf(mode);
  if (!m.docType) return null;

  const base = {
    sku: up(item.sku),
    barcode: str(item.barcode),
    description: str(item.nameAr || item.description),
    bin: normalizeLocationCode(bin),
    batch: str(item.batch),
    expiry: str(item.expiry),
    unitPrice: num(item.unitCost ?? item.unitPrice),
  };

  if (m.id === 'count') {
    // الفارقُ لا يُكتب بل يُحسب — نفسُ قاعدة `ADJ` في `postingRules`.
    return { ...base, bookQty: num(bookQty), count1: num(qty), count2: '' };
  }
  return { ...base, [m.qtyField]: num(qty) };
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
