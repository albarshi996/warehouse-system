/**
 * ‹DS-READS› قراءةُ «التخزين والسحب الموجّه» — كسولةٌ ومقصورة. منطقٌ خالص.
 *
 * ═══ العطبُ الذي وُجد لأجله (كونسول Firebase 2026-10-21) ═══
 * فتحةٌ واحدةٌ للشاشة رفعت القراءات من 0 إلى ~14,380: كانت تشترك **عند التحميل**
 * في ثلاث مجموعاتٍ كاملة — `bin_locations` (8,402 خانةً وُلّدت ليلًا) و`Items_Master`
 * (4,216) و`balances` (1,762). ولا تستعمل منها شيئًا إلّا في عمودٍ واحد: «الوجهة
 * المقترحة» — **وفي معاينة الاستلام وحدها**. فثلاثُ فتحاتٍ تُنفد حصّةَ يومٍ كاملٍ
 * على خطّة Spark (50 ألفًا). وكانت `bin_locations` صفرًا قبل التوليد فلم يُرَ العطب.
 *
 * ═══ والعلاج ═══
 *  ① لا قراءةَ قبل المعاينة: بلا ملفٍّ لا عمودَ يُرسم فلا شيءَ يُقرأ. وأمرُ التسليم
 *     لا عمودَ له أصلًا فلا يقرأ شيئًا قطّ.
 *  ② وبعدها **نطاقُ الورقة وحدَه**:
 *     · خاناتُ مستودعاتها (`warehouse in`) — والمحرّكُ لا يرى غيرَها أصلًا (`pool`).
 *     · وأرصدةُ **تلك الخانات** (مدى البادئة على `bin`) — ★★ لا أرصدةُ أصناف الورقة:
 *       السعةُ وسياسةُ الخلط تُحسبان من **كلّ** ما في الرفّ، فقصرُها على أصناف الورقة
 *       يُري رفًّا ممتلئًا فارغًا ويُجيز خلطًا يمنعه الرفّ.
 *     · وبطاقاتُ أصناف الورقة **وأصنافِ تلك الأرصدة** — فحِملُ الرفّ (`loadIndexOf`)
 *       يُوزن ببطاقات ما فيه لا بما سيدخله.
 *  ③ والكتالوجُ يُقدَّم من ذاكرته إن كان طازجًا (قراءةٌ صفر) — فلا يُقرأ ما قُرئ.
 *  ④ وما قُرئ يُحفظ عشر دقائق: الدورةُ المعتادة «ارفع ← خطأ ← صحّح في إكسل ← ارفع
 *     ثانيةً» لا تُعيد قراءةَ ألفي خانة.
 *
 * ★★★ والحكمُ لا يتغيّر: الاقتراحُ المقصورُ يطابق الكاملَ بندًا بندًا — يحرسه
 *     `directedScope.test.js` بعالمٍ يُحسب فيه الاثنان ويُقارَنان.
 *
 * ═══ مفتاحُ الإطفاء وطريقُ الرجوع ═══
 *  · `localStorage['bz.directedStorage.fullReads'] = '1'` يُعيد السلوكَ القديمَ حرفًا
 *    (ثلاثةُ مستمعين كاملين عند الفتح) في المتصفّح الذي كُتب فيه — بلا نشر.
 *  · و`SCOPED_READS = false` هنا يُعيده للجميع بكوميتٍ واحدٍ من سطرٍ واحد.
 *
 * ⚠️ حدودٌ معلَنة:
 *  · مستندٌ يدويٌّ بلا مستودع كان يُقترح له رفٌّ من **أيّ** مستودع (المحرّكُ لا يحصر
 *    بلا مستودع) — أي قراءةُ الخانات كلِّها لاقتراحٍ خاطئ أصلًا. فصار يقول «حدّد
 *    المستودع».
 *  · والقراءةُ لقطةٌ عند المعاينة لا بثٌّ حيّ: رصيدٌ قيّده زميلٌ بعدها لا يظهر حتى
 *    تُرفع ورقةٌ بعد عشر دقائق. والعمودُ **للاطّلاع لا للتثبيت** (قرار المالك)، والعاملُ
 *    يختار الرفّ عند التنفيذ بحارس المسح الحيّ.
 *  · باركودٌ مخزَّنٌ في الماستر بصيغةٍ قديمةٍ غيرِ مطبَّعة (قبل 2026-07-21) لا يلتقطه
 *    الاستعلامُ المقصور — كحدّ `lookupByBarcode` نفسِه حرفًا. ويلتقطه الكتالوجُ الطازج.
 */
import { normalizeBarcode, barcodeLookupVariants } from '../excel/excelSchema.js';
import { normalizeLocationCode } from './locationCode.js';


/** مفتاحُ الإطفاء للجميع — `false` يُعيد المستمعين الكاملين في كلّ متصفّح. */
export const SCOPED_READS = true;

/** مفتاحُ الإطفاء لمتصفّحٍ واحد — `'1'` يُعيد السلوكَ القديم فيه وحده. */
export const FULL_READS_KEY = 'bz.directedStorage.fullReads';

/** عمرُ ما قُرئ — دورةُ «صحّح وارفع ثانيةً» تقع داخله. */
export const REFERENCE_TTL_MS = 10 * 60 * 1000;

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * أمُطفأةٌ القراءةُ المقصورة؟ — ولا يرمي أبدًا: تخزينٌ محظورٌ (تصفّحٌ خاصّ) يعني
 * «لا مفتاح»، فيبقى السلوكُ الجديد.
 *
 * @param {{getItem:(k:string)=>string|null}|null} storage
 */
export function fullReadsForced(storage) {
  if (!SCOPED_READS) return true;
  try {
    return storage?.getItem?.(FULL_READS_KEY) === '1';
  } catch {
    return false;
  }
}

/** مستودعُ الخانة التي يقع فيها الرصيد — أوّلُ مقطعٍ من كودها القياسيّ. */
export function balanceWarehouseOf(balance) {
  const code = normalizeLocationCode(balance?.bin || balance?.location || '');
  return code ? code.split('-')[0] : '';
}

const EMPTY_SCOPE = Object.freeze({ warehouses: [], skus: [], lines: [] });

/**
 * نطاقُ الورقة — ما يحتاجه عمودُ «الوجهة المقترحة» لا أكثر.
 *
 * ★ أمرُ التسليم لا عمودَ له ⇒ نطاقٌ فارغ ⇒ لا قراءة. ومستندٌ بلا مستودع لا يُقترح
 *   له شيء ⇒ لا تُقرأ أصنافُه.
 *
 * @returns {{warehouses:string[], skus:string[], lines:Array<{sku:string, barcode:string}>}}
 */
export function scopeOfPreview(preview) {
  if (!preview || preview.type !== 'receipt') return EMPTY_SCOPE;
  const warehouses = new Set();
  const skus = new Set();
  const lines = new Map();
  for (const doc of preview.documents || []) {
    const wh = up(doc?.warehouse);
    if (!wh) continue;
    warehouses.add(wh);
    for (const line of doc?.lines || []) {
      const sku = up(line?.sku);
      const barcode = String(line?.barcode ?? '').trim();
      if (sku) skus.add(sku);
      if (!sku && !barcode) continue;
      const key = `${sku}\u0000${normalizeBarcode(barcode)}`;
      if (!lines.has(key)) lines.set(key, { sku, barcode });
    }
  }
  if (!warehouses.size) return EMPTY_SCOPE;
  return {
    warehouses: [...warehouses].sort(),
    skus: [...skus].sort(),
    lines: [...lines.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v),
  };
}

/** مفتاحُ النطاق — يتغيّر بتغيّر ما يُقرأ لا بتغيّر الكمّيّة والملاحظة. */
export function scopeKey(scope) {
  return JSON.stringify([scope?.warehouses || [], scope?.skus || [], (scope?.lines || []).map((l) => [l.sku, l.barcode])]);
}

export function isEmptyScope(scope) {
  return !(scope?.warehouses || []).length;
}

/** ذاكرةُ ما قُرئ — تعيش بعمر الشاشة. */
export function newReferenceMemo() {
  return { warehouses: new Map(), skus: new Map(), barcodes: new Map() };
}

const isFresh = (entry, now, ttl) => Boolean(entry) && now - entry.at >= 0 && now - entry.at < ttl;
const bySkuOrder = (a, b) => {
  const x = up(a?.sku);
  const y = up(b?.sku);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * ★★ فهرسُ البطاقات — بالكود وبالباركود، مبنيًّا **مرّةً** لا صفًّا صفًّا.
 *
 * وبمطبّعَي الكاتب نفسِهما (`normalizeSku` · `normalizeBarcode`): شيتٌ يكتب
 * `8059-692-040599` وماستر يخزّن `8059692040599` لا يلتقيان بلا تطبيق، فتعود
 * البطاقةُ فارغةً ويبقى المحرّك بلا معاملات — عطبٌ صامتٌ لا يُرى في الشاشة.
 */
export function itemIndexOf(items) {
  const bySku = new Map();
  const byBarcode = new Map();
  for (const it of items || []) {
    const sku = up(it?.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, it);
    for (const bc of it?.barcodes || []) {
      const key = normalizeBarcode(bc);
      // ★ الأوّل يفوز: باركودٌ مكرّرٌ بين صنفين خللٌ في الماستر، وتغليبُ
      // الأخير يجعل الاقتراح يتبدّل بين فتحةٍ وأخرى بلا سبب ظاهر.
      if (key && !byBarcode.has(key)) byBarcode.set(key, it);
    }
  }
  return { bySku, byBarcode };
}

/** بطاقةُ بندٍ — بكوده أوّلًا (هو الهويّة) ثمّ بباركوده. و`null` تعني «لا بطاقة». */
export function itemOfIndex(index, line) {
  return index.bySku.get(up(line?.sku)) || index.byBarcode.get(normalizeBarcode(line?.barcode)) || null;
}

/**
 * يقرأ نطاقَ الورقة — **ما لم يُقرأ بعدُ وحدَه**.
 *
 * والقارئ يُحقن (`reader`) فيُختبر الحكمُ في Node بلا سحابة، ويُعدّ ما قُرئ:
 *   locationsIn(warehouses) · balancesInBinsOf(prefixes) · itemsBySkus(skus) ·
 *   itemsByBarcodes(values) · cachedItems() ← الكتالوجُ الطازجُ أو `null`.
 *
 * @returns {Promise<{locations:object[], balances:object[], items:object[], catalog:boolean}>}
 */
export async function loadReference(scope, reader, memo, { now = Date.now(), ttl = REFERENCE_TTL_MS } = {}) {
  if (isEmptyScope(scope)) return { locations: [], balances: [], items: [], catalog: false };

  // ① خاناتُ المستودعات وأرصدةُ تلك الخانات — لكلّ مستودعٍ لم يُقرأ أو بَرُد.
  const stale = scope.warehouses.filter((w) => !isFresh(memo.warehouses.get(w), now, ttl));
  if (stale.length) {
    const [locs, bals] = await Promise.all([reader.locationsIn(stale), reader.balancesInBinsOf(stale)]);
    for (const w of stale) memo.warehouses.set(w, { at: now, locations: [], balances: [] });
    for (const l of locs || []) memo.warehouses.get(up(l?.warehouse))?.locations.push(l);
    for (const b of bals || []) memo.warehouses.get(balanceWarehouseOf(b))?.balances.push(b);
  }
  const seenLoc = new Set();
  const seenBal = new Set();
  const locations = [];
  const balances = [];
  for (const w of scope.warehouses) {
    const entry = memo.warehouses.get(w);
    for (const l of entry?.locations || []) {
      const id = l?.id ?? l?.code;
      if (seenLoc.has(id)) continue;
      seenLoc.add(id);
      locations.push(l);
    }
    for (const b of entry?.balances || []) {
      if (seenBal.has(b?.id)) continue;
      seenBal.add(b?.id);
      balances.push(b);
    }
  }
  // ترتيبُ المستمع القديم (`orderBy('code')`) — به تُحسم المتعادلاتُ في الترتيب.
  locations.sort((a, b) => {
    const x = String(a?.code ?? '');
    const y = String(b?.code ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  });

  // ② الكتالوجُ الطازجُ في الذاكرة يكفي كلَّ شيءٍ بلا قراءة.
  const catalog = reader.cachedItems?.();
  if (Array.isArray(catalog)) return { locations, balances, items: catalog, catalog: true };

  // ③ بطاقاتُ أصناف الورقة وأصنافِ أرصدة الخانات — بالكود.
  //    و`loadIndexOf` يجرّب باركودَ الرصيد كودًا أيضًا (`get(b.barcode)`)، فيُطلب معه.
  const want = new Set(scope.skus);
  for (const b of balances) {
    if (up(b?.sku)) want.add(up(b.sku));
    if (up(b?.barcode)) want.add(up(b.barcode));
  }
  const missingSkus = [...want].filter((s) => !isFresh(memo.skus.get(s), now, ttl)).sort();
  if (missingSkus.length) {
    const found = await reader.itemsBySkus(missingSkus);
    for (const s of missingSkus) memo.skus.set(s, { at: now, item: null });
    for (const it of found || []) {
      const s = up(it?.sku);
      if (memo.skus.has(s)) memo.skus.set(s, { at: now, item: it });
    }
  }
  const live = (it) => it && !it.archived;

  // ④ وبندٌ لم يُعرف بكوده يُطلب بباركوده — بصيغتَي `lookupByBarcode` نفسِهما.
  const variants = new Set();
  for (const line of scope.lines) {
    if (line.sku && live(memo.skus.get(line.sku)?.item)) continue;
    for (const v of barcodeLookupVariants(line.barcode)) variants.add(v);
  }
  const missingBarcodes = [...variants].filter((v) => !isFresh(memo.barcodes.get(v), now, ttl)).sort();
  if (missingBarcodes.length) {
    const found = await reader.itemsByBarcodes(missingBarcodes);
    for (const v of missingBarcodes) memo.barcodes.set(v, { at: now, items: [] });
    for (const it of found || []) {
      for (const v of missingBarcodes) if ((it?.barcodes || []).includes(v)) memo.barcodes.get(v).items.push(it);
    }
  }

  const bySku = new Map();
  const take = (it) => {
    if (live(it) && !bySku.has(up(it.sku))) bySku.set(up(it.sku), it);
  };
  for (const s of want) take(memo.skus.get(s)?.item);
  for (const v of variants) for (const it of memo.barcodes.get(v)?.items || []) take(it);
  // ترتيبُ الكتالوج (`orderBy('sku')`) — به يُحسم «الأوّلُ يفوز» في الباركود المكرّر.
  const items = [...bySku.values()].sort(bySkuOrder);

  return { locations, balances, items, catalog: false };
}

/**
 * ما يُقال قبل المحرّك في القراءة المقصورة — أو `null` فيُسأل المحرّكُ كما كان.
 *
 * ★ فيها لا يُعرف أفارغٌ سيّدُ المواقع كلُّه أم مستودعُ الورقة وحدَه — فيُقال ما
 *   يُعرف: «لا مواقع للمستودع» كما يقوله المحرّكُ نفسُه حين يخلو مستودعٌ بعينه.
 *   وبلا مستودعٍ لا قراءة، فيُطلب المستودع (كان يُقترح من أيّ مستودع).
 * ★★ ونداءُ `suggestLocations` يبقى في الشاشة نفسِها لا هنا: عليه حرّاسُ وصلٍ
 *   (`mapGrid.test.js` · `putawaySuggest.test.js`) يقرؤون ما يُمرَّر إليه هناك.
 */
export function scopedSuggestionGap({ scoped, warehouse, locations }) {
  if (!scoped) return null;
  const wh = up(warehouse);
  if (!wh) return { candidates: [], rejected: [], problem: 'حدّد مستودعَ المستند ليُقترح له موقع.' };
  if (!(locations || []).some((l) => up(l?.warehouse) === wh)) {
    return { candidates: [], rejected: [], problem: `لا مواقع معرَّفة للمستودع «${wh}».` };
  }
  return null;
}
