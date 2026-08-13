/**
 * وصل محرّك الوحدات بالمستندات (SAP-3 · يسدّ ف‑٤٢ وف‑٩ وف‑١٠ وف‑١١).
 *
 * ═══ العطب (اكتشاف الجرد 2026-08-13) ═══
 * المحرّك (`uomModel.js`) مبنيٌّ كاملًا — عائلات وأساسٌ ومعاملات وحارس كسر —
 * **ومعزول**: حقل `uom` نصٌّ حرّ في المخطّطات كلّها، ولا كاتبَ واحدًا
 * لـ`uomFactors` في النظام. فالتحويل في الدفتر يعتمد نصًّا يكتبه إنسان.
 *
 * ═══ الوصل لا الإضافة (سجلّ التكيّف) ═══
 * `uomModel` يُعاد استخدامه حرفيًّا ولا يُستبدل — نموذجنا أدقّ من المقترح
 * (يفصل قاعدة العائلة عن معامل الصنف). هذه الوحدة **أسلاك** فقط:
 *   · محرّر تعريفات الصنف (أساس · معاملات · شراء/بيع · باركود الوحدة)
 *   · قائمة الوحدات لسطر المستند بدل النصّ الحرّ — بتوافقٍ رجعيّ
 *   · ختم المعامل والكمّيّة الأساسيّة على السطر (§10.1 ‹234›)
 *   · معامل الطرف من كتالوج SAP-2 — موردان بتعبئة 24 و20 لا يختلطان
 *   · باركود الوحدة يحدّد الصنف والوحدة والمعامل معًا (§10.1 ‹238›)
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import {
  UOM_MASTER,
  normalizeUom,
  uomLabel,
  baseUomOf,
  factorToBase,
  availableUoms,
  hasUomDefinition,
  factorProblems,
} from './uomModel.js';
import { normalizeItemCode } from './itemIdentity.js';
import { barcodeLookupVariants } from '../excel/excelSchema.js';

/** تقريب ٦ منازل — نفس قاعدة المحرّك. */
const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/* ═══════════════ ١ — محرّر تعريفات الصنف (نصّ ⇄ بنية) ═══════════════ */

/**
 * «carton=24, box=12» ⇒ خريطة معاملات. المفاتيح تُطبَّع بمرادفات المحرّك
 * («كرتون=24» تصحّ)، والفاسد يُقال بالاسم. النصّ الفارغ = لا تعريف (سلوك اليوم).
 * @returns {{ok:boolean, factors:object, problems:string[]}}
 */
export function parseUomFactors(text) {
  const factors = {};
  const problems = [];
  for (const pair of splitPairs(text)) {
    const [rawUom, rawVal] = pair;
    const u = normalizeUom(rawUom);
    if (!u) {
      problems.push(`الوحدة «${rawUom}» غير معروفة في سيّد الوحدات.`);
      continue;
    }
    const n = Number(rawVal);
    if (!Number.isFinite(n) || n <= 0) {
      problems.push(`معامل «${uomLabel(u)}» يجب أن يكون رقمًا موجبًا — وجدت «${rawVal}».`);
      continue;
    }
    factors[u] = n;
  }
  return { ok: problems.length === 0, factors, problems };
}

/** خريطة معاملات ⇒ نصّ المحرّر. */
export function formatUomFactors(factors) {
  return Object.entries(factors || {})
    .map(([u, n]) => `${u}=${n}`)
    .join(', ');
}

/**
 * «8059692040599=carton» ⇒ خريطة باركود⇐وحدة (ف‑١٠).
 * الباركود يُطبَّع بنفس قاعدة الماستر (بلا أصفارٍ بادئة للرقميّ).
 * @returns {{ok:boolean, map:object, problems:string[]}}
 */
export function parseUomBarcodes(text) {
  const map = {};
  const problems = [];
  for (const [rawCode, rawUom] of splitPairs(text)) {
    const u = normalizeUom(rawUom);
    const code = barcodeLookupVariants(rawCode)[0] || '';
    if (!code) {
      problems.push(`باركود فارغ قبل «=${rawUom}».`);
      continue;
    }
    if (!u) {
      problems.push(`وحدة الباركود ${rawCode} «${rawUom}» غير معروفة.`);
      continue;
    }
    map[code] = u;
  }
  return { ok: problems.length === 0, map, problems };
}

/** خريطة باركود⇐وحدة ⇒ نصّ المحرّر. */
export function formatUomBarcodes(map) {
  return Object.entries(map || {})
    .map(([code, u]) => `${code}=${u}`)
    .join(', ');
}

/** «a=1, b=2» ⇒ [['a','1'],['b','2']] — يقبل الفواصل العربيّة والأسطر. */
function splitPairs(text) {
  return String(text ?? '')
    .split(/[,،;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('=');
      return i === -1 ? [s, ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    });
}

/** مشاكل تعريفات صنفٍ قبل الحفظ — يعيد استخدام حارس المحرّك حرفيًّا. */
export function itemUomProblems(draft) {
  return factorProblems(draft);
}

/* ═══════════════ ٢ — قائمة الوحدات لسطر المستند (ف‑٤٢) ═══════════════ */

/**
 * خيارات وحدة السطر بدل النصّ الحرّ:
 *   · صنفٌ عرّف وحداته ⇒ وحداته المتاحة وحدها (أساسه + معاملاته + ثوابت عائلته)
 *   · صنفٌ لم يُعرَّف أو مجهول ⇒ سيّد الوحدات كلّه
 *   · **التوافق الرجعيّ:** قيمة السطر القديمة النصّيّة تبقى خيارًا ظاهرًا
 *     كما كُتبت — لا يُكسر مستندٌ قائم ولا تُمحى قيمته عند الفتح.
 */
export function uomOptionsForLine(line, item) {
  const ids = item && hasUomDefinition(item) ? availableUoms(item) : Object.keys(UOM_MASTER);
  const options = ids.map((id) => ({ value: id, label: uomLabel(id) }));
  const current = String(line?.uom ?? '').trim();
  // القيمة المخزَّنة تبقى خيارًا ما لم تكن معرّفًا قياسيًّا حرفيًّا — حتى لو
  // عُرف تطبيعها («CTN» ⇒ كرتون): الاختيار لا يمحو ما كُتب في مستندٍ قائم.
  if (current && !options.some((o) => o.value === current)) {
    const known = normalizeUom(current);
    options.push({
      value: current,
      label: known ? `${current} = ${uomLabel(known)}` : `${current} (نصّ قديم)`,
    });
  }
  return options;
}

/* ═══════════════ ٣ — وحدة الشراء والبيع (ف‑٩) ═══════════════ */

/** عائلتا المستندات — لاختيار الوحدة الافتراضيّة عند استدعاء الصنف. */
export const PURCHASE_DOC_TYPES = new Set(['PR', 'RFQ', 'PO', 'GRN', 'QC', 'PUTAWAY', 'SRN', 'IPR', 'IPO', 'PV', 'DLV', 'VRT']);
export const SALES_DOC_TYPES = new Set(['SO', 'PICK', 'PACK', 'DN', 'GP', 'INV', 'RET', 'CN', 'VLD', 'VSI', 'VCS', 'VCD', 'CRN']);

/**
 * الوحدة الافتراضيّة لسطرٍ جديد: وحدة الشراء لمستندات الشراء، ووحدة البيع
 * لمستندات البيع — **إن عرّفهما المالك**؛ وإلا وحدة أساس الصنف. والفارغ
 * فارغٌ — لا يُخترع (§10.6).
 */
export function defaultUomFor(item, docType) {
  if (!item) return '';
  const type = String(docType ?? '').trim().toUpperCase();
  const preferred = PURCHASE_DOC_TYPES.has(type)
    ? normalizeUom(item.buyUom)
    : SALES_DOC_TYPES.has(type)
      ? normalizeUom(item.sellUom)
      : '';
  return preferred || baseUomOf(item) || '';
}

/* ═══════════════ ٤ — باركود الوحدة (ف‑١٠ · §10.1 ‹238›) ═══════════════ */

/**
 * مسحُ باركود وحدةٍ يحدّد الوحدة أيضًا: يقرأ `item.uomBarcodes` إن وُجد.
 * @returns {string} معرّف الوحدة، أو '' إن لم يكن الباركود باركود وحدة.
 */
export function unitForBarcode(item, code) {
  const map = item?.uomBarcodes || {};
  for (const variant of barcodeLookupVariants(code)) {
    if (map[variant]) return normalizeUom(map[variant]) || '';
  }
  return '';
}

/* ═══════════════ ٥ — إثراء السطر (ف‑١١ · §10.1 ‹234›) ═══════════════ */

/**
 * فهرسا الأصناف للبنود: بالكود وبالباركود — يُبنيان مرّةً ويُقرآن كثيرًا.
 */
export function buildItemIndexes(items) {
  const bySku = new Map();
  const byBarcode = new Map();
  for (const it of items || []) {
    const sku = normalizeItemCode(it?.sku);
    if (sku) bySku.set(sku, it);
    for (const b of it?.barcodes || []) {
      for (const v of barcodeLookupVariants(b)) {
        if (!byBarcode.has(v)) byBarcode.set(v, it);
      }
    }
  }
  return { bySku, byBarcode };
}

/** صنف السطر من الفهرسين: الكود أوّلًا (الهويّة §9.1) ثمّ الباركود. */
export function itemForLine(line, indexes) {
  if (!indexes) return null;
  const sku = normalizeItemCode(line?.sku);
  if (sku && indexes.bySku.has(sku)) return indexes.bySku.get(sku);
  for (const v of barcodeLookupVariants(line?.barcode)) {
    if (indexes.byBarcode.has(v)) return indexes.byBarcode.get(v);
  }
  return null;
}

/**
 * ختم معامل الطرف من كتالوج SAP-2 على السطر — موردان بتعبئة 24 و20
 * لا يختلط تحويلهما لأنّ معامل كلٍّ مختومٌ من سجلّه هو (§10 ‹256›).
 */
export function stampPartnerUom(line, entry) {
  const next = { ...line };
  const u = normalizeUom(entry?.uom) || String(entry?.uom ?? '').trim();
  if (u) next.uom = u;
  const f = Number(entry?.conversionFactor);
  if (Number.isFinite(f) && f > 0 && u) {
    next.uomFactor = f;
    next.uomFactorFor = normalizeUom(u) || u;
    next.uomFactorSource = 'partner';
  }
  return next;
}

/**
 * إثراء السطر بعد كلّ تعديل: **السطر يحفظ الكمّيّة والوحدة والمعامل
 * والكمّيّة الأساسيّة** (§10.1 ‹234›) — فالدفتر والتقارير يقفان على رقمٍ
 * محفوظٍ لا على إعادة حسابٍ قد تختلف غدًا.
 *
 * ترتيب المعامل:
 *   ① معاملٌ مختومٌ على السطر **لوحدته الحاليّة** (معامل الطرف) — يبقى.
 *   ② معامل الصنف من المحرّك (`factorToBase`).
 *   ③ لا معامل ⇒ تُمحى حقول الاشتقاق ولا يُكتب رقمٌ من جهل.
 * وتغييرُ الوحدة يُسقط المعامل المختوم — فمعامل «كرتون المورّد» لا يلتصق بـ«قطعة».
 */
export function refreshLineBase(line, item) {
  const next = { ...line };
  const uom = String(next.uom ?? '').trim();
  const qty = Number(next.qty);

  let factor = null;
  const stamped = Number(next.uomFactor);
  const stampedFor = String(next.uomFactorFor ?? '').trim();
  if (
    next.uomFactorSource === 'partner'
    && Number.isFinite(stamped) && stamped > 0
    && stampedFor && stampedFor === (normalizeUom(uom) || uom)
  ) {
    factor = stamped;
  } else if (item && uom && hasUomDefinition(item)) {
    factor = factorToBase(item, uom);
    if (factor !== null) {
      next.uomFactor = factor;
      next.uomFactorFor = normalizeUom(uom) || uom;
      next.uomFactorSource = 'item';
    }
  }

  if (factor !== null && Number.isFinite(qty)) {
    next.baseQty = round(qty * factor);
    next.baseUom = item ? baseUomOf(item) : '';
  } else if (factor === null) {
    // لا يُترك رقمٌ قديم يوهم أنّه محسوب.
    delete next.uomFactor;
    delete next.uomFactorFor;
    delete next.uomFactorSource;
    delete next.baseQty;
    delete next.baseUom;
  }
  return next;
}
