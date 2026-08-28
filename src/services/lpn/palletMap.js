/**
 * الطبالي على خريطة المواقع — «من يقف أين». منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: بعد التخزين تعرف الطبلية رفَّها، **ولا يعرف الرفّ
 * طباليه**. فالسؤال الذي يطرحه العامل كلّ يوم — «ماذا في هذا الرفّ؟» —
 * يحتاج قلبَ العلاقة: من الحمولة إلى الموقع، ومن الموقع إلى حمولاته.
 *
 * ═══ القاعدة الحاكمة ═══
 * **قراءةٌ محضةٌ تُشتقّ ولا تُخزَّن.** فهرسُ «الموقع ← طباليه» يُبنى في
 * الذاكرة من الطبالي نفسها؛ وحقلٌ ثانٍ يُكتب على الموقع كان سيفترق عن
 * الحقيقة أوّلَ نقلةٍ لم تُحدّثه — وهو عين ما يجعل الخرائط تكذب.
 */

import { normalizeLocationCode, parentCodeOf } from '../locations/locationCode.js';
import { isAvailable, LPN_FLAGS, stateLabel } from './lpnLifecycle.js';
import { distinctItems, totalBaseQty } from './lpnContents.js';

/**
 * الحالات التي تعني «الحمولة واقفةٌ في المستودع فعلًا».
 *
 * ★ مصدَّرةٌ لأنّ الشاشة تجلب بها: قائمةٌ ثانيةٌ في المكوّن كانت ستفترق عن هذه
 * أوّلَ حالةٍ تُضاف، فتختفي طبليةٌ من الخريطة ولا يُنبّه أحد.
 */
export const ON_FLOOR_STATES = Object.freeze([
  'PENDING_PUTAWAY', 'LABEL_PRINTED', 'STORED', 'RESERVED', 'PICKING',
]);

/** أهذه الطبلية واقفةٌ في مكانٍ يُعرض على الخريطة؟ */
export function isOnFloor(unit) {
  return ON_FLOOR_STATES.includes(unit?.state) && Boolean(normalizeLocationCode(unit?.bin));
}

/**
 * فهرس «الموقع ← طباليه» — والمفتاح كود الموقع مطبَّعًا بمطبّع الكود القائم
 * (فلا يصير الرفّ رفّين لاختلاف كتابة).
 *
 * @returns {Map<string, Array>}
 */
export function palletsByBin(units) {
  const map = new Map();
  for (const u of units ?? []) {
    if (!isOnFloor(u)) continue;
    const bin = normalizeLocationCode(u.bin);
    if (!map.has(bin)) map.set(bin, []);
    map.get(bin).push(u);
  }
  return map;
}

/**
 * ملخّصُ موقعٍ للعرض على الخريطة — يُبنى من طباليه لا من حقلٍ مخزَّن.
 *
 * @returns {{bin:string, count:number, itemCount:number, totalQty:number,
 *            available:number, blocked:number, mixed:number, pallets:Array}}
 */
export function binSummary(units, code) {
  const bin = normalizeLocationCode(code);
  const here = (palletsByBin(units).get(bin) ?? []);
  return {
    bin,
    count: here.length,
    itemCount: new Set(here.flatMap((u) => distinctItems(u.lines))).size,
    totalQty: here.reduce((s, u) => s + totalBaseQty(u.lines), 0),
    available: here.filter((u) => isAvailable(u)).length,
    // ★ الموسومة تُعدّ منفصلةً: رفٌّ فيه خمسُ طبالٍ إحداها تالفةٌ ليس رفًّا
    // فيه خمسُ طبالٍ صالحة — والفرقُ يُرى قبل أن يُسحب منه.
    blocked: here.filter((u) => (u.flags ?? []).length > 0).length,
    mixed: here.filter((u) => distinctItems(u.lines).length > 1).length,
    pallets: here.map((u) => palletChip(u)),
  };
}

/** بطاقةٌ مختصرة للطبلية على الخريطة — ما يكفي للتعرّف بلا فتح البطاقة. */
export function palletChip(unit) {
  const flags = (unit?.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f));
  return {
    code: unit?.code ?? '',
    state: unit?.state ?? '',
    stateLabel: stateLabel(unit?.state),
    flags,
    flagLabels: flags.map((f) => LPN_FLAGS[f]),
    itemCount: distinctItems(unit?.lines).length,
    totalQty: totalBaseQty(unit?.lines),
    available: isAvailable(unit),
    isMixed: distinctItems(unit?.lines).length > 1,
  };
}

/**
 * ★ السؤال المعكوس: **أين يقف هذا الصنف؟** — كلّ المواقع التي تحمله عبر طبالٍ.
 *
 * (خطة ٧ أولًا: «البحث بالموقع لمعرفة محتوياته، أو بالصنف لمعرفة جميع
 * المواقع الموجود فيها».)
 *
 * @returns {Array<{bin:string, qty:number, pallets:string[]}>} مرتّبةً بالأكبر.
 */
export function binsOfItem(units, sku) {
  const key = String(sku ?? '').trim().toUpperCase();
  if (!key) return [];
  const map = new Map();

  for (const u of units ?? []) {
    if (!isOnFloor(u)) continue;
    const bin = normalizeLocationCode(u.bin);
    for (const line of u.lines ?? []) {
      const item = String(line?.sku ?? '').trim().toUpperCase() || String(line?.barcode ?? '').trim().toUpperCase();
      if (item !== key) continue;
      const e = map.get(bin) ?? { bin, qty: 0, pallets: [] };
      e.qty += Number(line?.baseQty) || 0;
      if (!e.pallets.includes(u.code)) e.pallets.push(u.code);
      map.set(bin, e);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

/**
 * تجميعُ الأعداد صعودًا في شجرة المواقع — فالمنطقة تعرف مجموع رفوفها.
 *
 * تُبنى بالصعود من كلّ موقعٍ إلى آبائه (`parentCodeOf` القائمة)، فيُحصى
 * الرفّ في خانته ومستواه ومنطقته ومستودعه معًا.
 *
 * @returns {Map<string, number>} كودُ العقدة ← عدد الطبالي تحتها.
 */
export function palletCountByNode(units) {
  const counts = new Map();
  for (const [bin, here] of palletsByBin(units)) {
    let node = bin;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      counts.set(node, (counts.get(node) ?? 0) + here.length);
      node = parentCodeOf(node);
    }
    // ★ المستودع جذرٌ لا يُبلَغ بالصعود: مقطعٌ واحدٌ ليس موقعًا في النحو
    // (`MIN_SEGMENTS = 2`)، فـ`parentCodeOf('MAIN-A01')` فراغ. ويُحصى هنا
    // صراحةً لأنّ «كم طبليةً في مستودع MAIN؟» سؤالٌ حقيقيّ للخريطة.
    const warehouse = bin.split('-')[0];
    if (warehouse && !seen.has(warehouse)) {
      counts.set(warehouse, (counts.get(warehouse) ?? 0) + here.length);
    }
  }
  return counts;
}

/**
 * ★ الطبالي في مواقع غير متوقّعة — عدّادُ لوحة الحوكمة (خطة ٧ الثاني عشر).
 *
 * «غير متوقّع» هنا **مقاسٌ لا مظنون**: موقعٌ ليس في سيّد المواقع أصلًا، أو
 * موقعٌ لا يقبل التخزين (موقوف/مؤرشف) وفيه حمولةٌ واقفة. وكلاهما يحتاج
 * إنسانًا: الأولى تعني رفًّا لا يعرفه النظام، والثانية حمولةً في رفٍّ أُخرج
 * من الخدمة ونُسيت فيه.
 */
export function unexpectedPlacements(units, locations) {
  const known = new Map(
    (locations ?? []).map((l) => [normalizeLocationCode(l?.code), l])
  );
  const out = [];
  for (const [bin, here] of palletsByBin(units)) {
    const loc = known.get(bin);
    if (!loc) {
      out.push({ bin, reason: `«${bin}» غير مسجَّل في سيّد المواقع`, pallets: here.map((u) => u.code) });
      continue;
    }
    if (['stopped', 'archived', 'maintenance'].includes(loc.status)) {
      out.push({ bin, reason: `«${bin}» ${loc.status === 'archived' ? 'مؤرشَف' : loc.status === 'stopped' ? 'موقوف' : 'تحت الصيانة'} وفيه حمولة`, pallets: here.map((u) => u.code) });
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
 * طبقةُ العرض على شبكة المواقع — ‹LPN-211›
 *
 * الشبكة واحدةٌ وما يُلوَّن به يتبدّل (نمط `WORK_LEGEND` في `mapGrid.js`،
 * قرار المالك LOC-O04: لا خريطةٌ ثانية ولا رابطٌ جديد). ويسكن الوصفُ هنا لا
 * هناك لأنّ الاتجاه المشروع واحد: `lpn/` يقرأ القائم، والقائم لا يعرف
 * `lpn/` أبدًا (ح-٢، وحارسُه `lpnIsolation.test.js`).
 * ═══════════════════════════════════════════════════════════════════════ */

/** حالاتُ الخانة في طبقة الطبالي — لكلٍّ رمزٌ ونمطٌ ونصّ إلى جانب اللون. */
export const PALLET_CELL_STATES = Object.freeze({
  none: {
    id: 'none', labelAr: 'بلا طبالي', symbol: '·', pattern: 'none', tone: 'muted', warn: false,
    hint: 'لا حمولةَ واقفةٌ في هذا الموقع — وقد يحمل رصيدًا بلا طبلية.',
  },
  stored: {
    id: 'stored', labelAr: 'مخزَّنة ومتاحة', symbol: '▪', pattern: 'solid', tone: 'ok', warn: false,
    hint: 'طبالٍ متاحةٌ بصنفٍ واحدٍ لكلٍّ — تُسحب بلا سؤال.',
  },
  busy: {
    id: 'busy', labelAr: 'محجوزة أو تُسحب', symbol: '◐', pattern: 'diagonal', tone: 'neutral', warn: false,
    hint: 'فيه طبليةٌ محجوزةٌ لأمرٍ أو جارٍ سحبُها — قائمةٌ ولا تُتاح لغيره.',
  },
  mixed: {
    id: 'mixed', labelAr: 'مخلوطة', symbol: '◈', pattern: 'cross', tone: 'warn', warn: false,
    hint: 'فيه طبليةٌ تحمل أكثر من صنف — تُعدّ بندًا بندًا لا طبليةً واحدة.',
  },
  held: {
    id: 'held', labelAr: 'موسومة بحاجب', symbol: '⚑', pattern: 'dense', tone: 'danger', warn: true,
    hint: 'فيه طبليةٌ موسومةٌ (تالفة أو محجورة أو غيرها) — لا تُصرف قبل رفع الوسم.',
  },
});

export const PALLET_CELL_ORDER = Object.freeze(['none', 'stored', 'busy', 'mixed', 'held']);

export const PALLET_LEGEND = PALLET_CELL_ORDER.map((id) => PALLET_CELL_STATES[id]);

/**
 * حالُ الخانة من ملخّص طباليها — **بأسوأ ما فيها لا بأغلبه**.
 *
 * رفٌّ فيه عشرُ طبالٍ إحداها موسومةٌ يُعرض موسومًا: الخريطة تُقرأ لتُقرَّر
 * منها حركة، والمتوسّطُ يخفي الاستثناء الذي يوقف الحركة. وترتيبُ الأولويّة
 * حاجبٌ ← مخلوطٌ ← مشغولٌ ← مخزَّن.
 *
 * @param {{count:number, available:number, blocked:number, mixed:number}} summary
 * @returns {{state:string, symbol:string, labelAr:string, warn:boolean, countText:string, summaryText:string}}
 */
export function palletCellOf(summary) {
  const count = Number(summary?.count) || 0;
  const blocked = Number(summary?.blocked) || 0;
  const mixed = Number(summary?.mixed) || 0;
  const available = Number(summary?.available) || 0;

  const id = count === 0 ? 'none'
    : blocked > 0 ? 'held'
      : mixed > 0 ? 'mixed'
        : available < count ? 'busy'
          : 'stored';

  const s = PALLET_CELL_STATES[id];
  const parts = [`${count} طبليةً`];
  if (blocked > 0) parts.push(`${blocked} موسومة`);
  if (mixed > 0) parts.push(`${mixed} مخلوطة`);
  if (count > 0 && available < count) parts.push(`${count - available} غير متاحة`);
  if (Number(summary?.itemCount) > 0) parts.push(`${summary.itemCount} صنفًا`);

  return {
    state: id,
    symbol: s.symbol,
    labelAr: s.labelAr,
    warn: s.warn,
    countText: count === 0 ? '—' : String(count),
    summaryText: count === 0 ? s.labelAr : parts.join(' · '),
  };
}
