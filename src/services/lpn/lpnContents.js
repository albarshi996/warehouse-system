/**
 * محتويات الطبلية — بنودٌ بصنفٍ ودفعةٍ ووحدةٍ وقواعد إضافة. منطق خالص.
 *
 * المشكلة التي يحلّها: «ما على هذه الطبلية؟» سؤالٌ بلا جواب اليوم — الرصيد
 * يعرف كم في المخزن كلّه، ولا يعرف توزيع الكمّيّة على الحمولات. وبلا بنودٍ
 * منضبطة تصير الطبلية كيسًا: قراءتان لنفس الصنف صفّان، ودفعةٌ منتهية تدخل
 * بلا صوت، وكرتونةٌ تُحسب وحدةً.
 *
 * ═══ القاعدة الحاكمة (ح-٢ · docs/خطة-طبقة-الطبالي.md §٢) ═══
 * **الرصيد مصدر الحقيقة الكمّي — والبند يشير إليه ولا ينافسه.** كلّ بندٍ
 * يحمل مرجعه لمفتاح الرصيد القائم عبر `balanceId` نفسه (لا مفتاح موازٍ)،
 * وفاحص الاحتواء يقارن: مجموع ما تحمله الطبالي لمفتاحٍ ≤ كمّيّة رصيده —
 * **يفحص ولا يكتب** (نمط `reconcileBalances` حرفيًّا).
 *
 * الوحدة والمعامل من نواة CAP-102/103 القائمة: البند يخزّن الوحدة ومعاملها
 * والكمّيّة الأساس معًا — فكرتونة الاثني عشر تُحسب اثني عشر يوم القراءة،
 * لا يوم اكتشاف الفرق.
 *
 * التاريخ الحاضر `asOf` يُمرَّر من الخارج — لا ساعة داخل المنطق الخالص.
 */

import { balanceId } from '../balances/balanceKey.js';
import { isValidLpnCode } from './lpnCode.js';

/** سياسة الخلط الافتراضية حتى حسم LPN-O04: مسموحٌ ويُوسم — نصّ خطة ٧. */
export const DEFAULT_MIX_POLICY = Object.freeze({ allowMixedItems: true, allowMixedLots: true });

const up = (v) => String(v ?? '').trim().toUpperCase();

/** يومُ صلاحيةٍ قابلٌ للمقارنة `YYYY-MM-DD` — والفاسد فارغ لا مخمَّن. */
function expiryDay(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** هويّة دمج البند: (صنف × دفعة × صلاحية × وحدة) — عليها تلتقي القراءات. */
export function lineKey(line) {
  return [up(line?.sku) || up(line?.barcode), up(line?.batch), expiryDay(line?.expiry), up(line?.uom)].join('__');
}

/**
 * سبب رفض قراءةٍ تُضاف — أو '' إن كانت سليمة.
 *
 * الترتيب هو الحارس: هويّة الصنف قبل الكمّيّة، والكمّيّة قبل الصلاحية،
 * والصلاحية قبل سياسة الخلط — فأوّل ما يُصلحه العامل أوّلُ ما يُقال له.
 */
export function readingProblem(lines, reading, { asOf, policy = DEFAULT_MIX_POLICY } = {}) {
  if (!up(reading?.sku) && !up(reading?.barcode)) {
    return 'قراءة بلا هويّة صنف — امسح باركود الصنف أو اكتب كوده.';
  }

  const qty = Number(reading?.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return `الكمّيّة «${reading?.qty ?? ''}» غير صالحة — أكبر من صفر. الحذف والتصحيح قيدُ عكسٍ لا كمّيّة سالبة.`;
  }

  // ★ «LPN ليس رقم Lot» بالاتّجاهين: النحو يمنع تشغيلةً أن تكون هويّة، وهذا
  // يمنع هويّةً أن تكون تشغيلة. والمسدّس واحد يقرأ الملصقين — فمسحُ ملصق
  // الطبلية في خانة الدفعة أقربُ أخطاء الميدان لا أبعدها.
  if (isValidLpnCode(reading?.batch)) {
    return 'هذا ملصق طبلية لا رقم تشغيلة — امسح باركود الدفعة من العبوة نفسها.';
  }

  const exp = expiryDay(reading?.expiry);
  const today = expiryDay(asOf);
  if (exp && today && exp < today) {
    return `الدفعة «${reading?.batch || 'بلا رقم'}» منتهية الصلاحية منذ ${exp} — لا تُضاف لطبليةٍ سليمة؛ سجّلها مرفوضةً بسببها.`;
  }

  const items = new Set(lines.map((l) => up(l?.sku) || up(l?.barcode)));
  const item = up(reading?.sku) || up(reading?.barcode);
  if (!policy.allowMixedItems && items.size > 0 && !items.has(item)) {
    return `سياسة الشركة تمنع خلط الأصناف على طبليةٍ واحدة — هذه تحمل «${[...items][0]}». افتح طبليةً جديدة للصنف «${item}».`;
  }
  if (!policy.allowMixedLots) {
    const lots = new Set(lines.filter((l) => (up(l?.sku) || up(l?.barcode)) === item).map((l) => up(l?.batch)));
    if (lots.size > 0 && !lots.has(up(reading?.batch))) {
      return `سياسة الشركة تمنع خلط دفعات الصنف الواحد — على الطبلية دفعة «${[...lots][0]}» والممسوحة «${reading?.batch || 'بلا رقم'}».`;
    }
  }
  return '';
}

/**
 * إضافة قراءة — تعيد قائمة بنودٍ **جديدة** ولا تعدّل الأصل.
 *
 * القراءة بنفس (صنف×دفعة×صلاحية×وحدة) تُدمج في بندها فترفع كمّيّته — لا
 * صفوف مكرّرة. والكمّيّة الأساس = الكمّيّة × المعامل (المجهول null لا 1 —
 * «null تعني لا أعرف» فلا يُختلق معامل).
 *
 * @returns {{lines:Array}|{problem:string}}
 */
export function addReading(lines, reading, opts = {}) {
  const problem = readingProblem(lines ?? [], reading, opts);
  if (problem) return { problem };

  const qty = Number(reading.qty);
  const factor = Number(reading?.factor);
  const hasFactor = Number.isFinite(factor) && factor > 0;
  const baseQty = hasFactor ? qty * factor : null;

  const key = lineKey(reading);
  const existing = (lines ?? []).find((l) => lineKey(l) === key);
  if (existing) {
    const mergedBase =
      existing.baseQty === null || baseQty === null ? null : Number(existing.baseQty) + baseQty;
    return {
      lines: (lines ?? []).map((l) =>
        lineKey(l) === key ? { ...l, qty: Number(l.qty) + qty, baseQty: mergedBase } : l
      ),
    };
  }

  return {
    lines: [
      ...(lines ?? []),
      {
        sku: up(reading.sku),
        barcode: String(reading?.barcode ?? '').trim(),
        name: String(reading?.name ?? '').trim(),
        batch: up(reading.batch),
        expiry: expiryDay(reading.expiry),
        uom: up(reading.uom),
        factor: hasFactor ? factor : null,
        qty,
        baseQty,
      },
    ],
  };
}

/**
 * سحب كمّيّةٍ من بند — تعيد قائمةً جديدة. البند الفارغ يُحذف من القائمة
 * (هويّة **الطبلية** لا يُعاد استخدامها — أمّا صفّ المحتوى فذاكرة عرضٍ
 * والحقيقة في سجلّ الأحداث).
 *
 * @returns {{lines:Array}|{problem:string}}
 */
export function removeQty(lines, take) {
  const key = lineKey(take);
  const existing = (lines ?? []).find((l) => lineKey(l) === key);
  if (!existing) {
    return { problem: `الصنف «${up(take?.sku) || up(take?.barcode)}» بدفعة «${up(take?.batch) || 'بلا رقم'}» ليس على هذه الطبلية.` };
  }
  const qty = Number(take?.qty);
  if (!Number.isFinite(qty) || qty <= 0) return { problem: `كمّيّة السحب «${take?.qty ?? ''}» غير صالحة — أكبر من صفر.` };
  if (qty > Number(existing.qty)) {
    return { problem: `المطلوب سحب ${qty} وعلى الطبلية ${existing.qty} فقط من «${existing.sku || existing.barcode}» — الرصيد لا يُسالَب.` };
  }
  const remaining = Number(existing.qty) - qty;
  const ratio = remaining / Number(existing.qty);
  return {
    lines: (lines ?? [])
      .map((l) =>
        lineKey(l) === key
          ? { ...l, qty: remaining, baseQty: l.baseQty === null ? null : Number(l.baseQty) * ratio }
          : l
      )
      .filter((l) => Number(l.qty) > 0),
  };
}

/** أمختلطةٌ الطبلية؟ تُشتقّ من البنود ولا تُكتب يدويًّا — عرف «يُشتقّ لا يُكتب». */
export function isMixed(lines) {
  return new Set((lines ?? []).map((l) => up(l?.sku) || up(l?.barcode)).filter(Boolean)).size > 1;
}

/** أفارغةٌ؟ تُشتقّ أيضًا — الطبلية الفارغة تُعلَم ولا تُحذف (LPN-303). */
export function isEmpty(lines) {
  return (lines ?? []).every((l) => !(Number(l?.qty) > 0));
}

/** إجمالي الكمّيّة الأساس — والمجهول المعامل يُستثنى ويُحصى وسمًا لا صفرًا. */
export function totalBaseQty(lines) {
  return (lines ?? []).reduce((s, l) => s + (Number(l?.baseQty) || 0), 0);
}

/** الأصناف المتمايزة على الطبلية. */
export function distinctItems(lines) {
  return [...new Set((lines ?? []).map((l) => up(l?.sku) || up(l?.barcode)).filter(Boolean))];
}

/**
 * مرجع البند إلى **مفتاح الرصيد القائم** — `balanceId` نفسه بحقوله السبعة.
 *
 * المستودع والموقع من الطبلية الحاملة لا من البند: البضاعة حيث حمولتها.
 * (درس LOC-501: البناء الناقص يُنتج مفتاحًا لا يطابق المخزَّن.)
 */
export function lineBalanceRef(unit, line) {
  return balanceId({
    sku: line?.sku,
    barcode: line?.barcode,
    warehouse: unit?.warehouse,
    batch: line?.batch,
    bin: unit?.bin,
    expiry: line?.expiry,
    status: line?.status,
  });
}

/**
 * ★★ فاحص الاحتواء — يفحص ولا يكتب (نمط `reconcileBalances`).
 *
 * لكلّ مفتاح رصيد: مجموع ما تحمله الطبالي منه يجب ألّا يتجاوز كمّيّة الرصيد
 * نفسها. التجاوز لا يُصلَح آليًّا — **يُعلَن ولا يُبتلع**: قائمةُ خرقٍ تذهب
 * لغرفة الحوكمة، فإمّا قراءة مكرّرة وإمّا حركةٌ لم تسجَّل.
 *
 * ⚠️ **البند مجهول المعامل لا يُفحص ولا يُحصى**: كمّيّته بوحدة العبوة
 * (كراتين) والرصيد بالوحدة الأساس — وجمعُ العشرة كراتين مع الوحدات ثمّ
 * مقارنتُها بستّين وحدة **يُخفي خرقًا حقيقيًّا** بدل أن يكشفه. فيخرج في
 * `uncheckable` باسم طبليته: قائمةُ عملٍ لا رقمٌ كاذب. (وهي عقيدة
 * `totalBaseQty` نفسها: المجهول يُستثنى ويُحصى وسمًا لا صفرًا.)
 *
 * @param {Array} units طبالٍ بحقول {code, warehouse, bin, lines}
 * @param {Array} balances صفوف أرصدة بحقل id (أو حقول balanceId) وqty
 * @returns {{problems:Array<{balanceRef:string, carried:number, onBalance:number, units:string[]}>,
 *            uncheckable:Array<{unit:string, sku:string, batch:string, qty:number, uom:string}>}}
 */
export function containmentProblems(units, balances) {
  const onBalance = new Map();
  for (const b of balances ?? []) {
    const ref = b?.id ?? balanceId(b ?? {});
    if (ref) onBalance.set(ref, Number(b?.qty) || 0);
  }

  const carried = new Map();
  const uncheckable = [];
  for (const u of units ?? []) {
    for (const line of u?.lines ?? []) {
      const ref = lineBalanceRef(u, line);
      if (!ref) continue;
      // ⚠️ `Number(null)` صفرٌ لا NaN — فالفحص على الغياب نفسه لا على نتيجة
      // التحويل، وإلّا مرّ المجهول رقمًا صفريًّا وهو أخطر من ألّا يُفحص.
      const base = line?.baseQty == null ? NaN : Number(line.baseQty);
      if (!Number.isFinite(base)) {
        uncheckable.push({
          unit: u?.code ?? '',
          sku: up(line?.sku) || up(line?.barcode),
          batch: up(line?.batch),
          qty: Number(line?.qty) || 0,
          uom: up(line?.uom),
        });
        continue;
      }
      const entry = carried.get(ref) ?? { qty: 0, units: [] };
      entry.qty += base;
      if (!entry.units.includes(u?.code)) entry.units.push(u?.code);
      carried.set(ref, entry);
    }
  }

  const problems = [];
  for (const [ref, entry] of carried) {
    const available = onBalance.get(ref) ?? 0;
    if (entry.qty > available) {
      problems.push({ balanceRef: ref, carried: entry.qty, onBalance: available, units: entry.units });
    }
  }
  return { problems, uncheckable };
}
