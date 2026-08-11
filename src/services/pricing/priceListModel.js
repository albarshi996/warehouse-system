/**
 * قوائم الأسعار وانحرافها (م٣-ج · يسدّ ف‑٣).
 *
 * ═══ العطب ═══
 * لا قوائم أسعار إطلاقًا: بحثٌ شاملٌ في الكود لا يُخرج نتيجة. فالسعر يُكتب بيدٍ
 * في كلّ فاتورة — وهذا **تسريب أسعار**: يبيع مندوبٌ بسعر التجزئة لعميل جملة،
 * وآخر بسعر الجملة لعابر سبيل، ولا أحد يعرف حتّى يُقفل الشهر بهامشٍ ناقص.
 *
 * ═══ التدرّج الذي يمنع التعطيل ═══
 * القوائم **اختيارية في البداية**. من له قائمة يُملأ له السعر، ومن لا قائمة له
 * تبقى الكتابة اليدوية متاحة بلا وسمٍ ولا تنبيه. ثمّ تُشدَّد القاعدة بعد اكتمال
 * البيانات — بتغيير إعدادٍ لا بنشرة إصدار (`settings.pricing`).
 *
 * ═══ الوسم شرطٌ لا زينة ═══
 * كلّ سعرٍ خالف القائمة يُوسَم، وبالوسم وحده يُبنى تقرير الانحراف. ولولاه لكان
 * السؤال «من باع بغير سعر القائمة؟» يحتاج مقارنةً يدويّةً بأثرٍ رجعيّ لا تُنجَز.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { manualPriceVerdict } from '../settings/settingsModel.js';
import { normalizeUom } from '../items/uomModel.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** شرائح القوائم المعتادة — تسميات لا حصر: قائمةٌ بشريحةٍ خارجها تعمل كذلك. */
export const PRICE_SEGMENTS = [
  { value: 'retail', label: 'تجزئة' },
  { value: 'wholesale', label: 'جملة' },
  { value: 'key', label: 'عميل مفتاح' },
  { value: 'contract', label: 'عقد' },
];

/** مفتاح بندٍ في القائمة: صنف × وحدة. فسعر الصندوق غير سعر القطعة. */
export function lineKey(sku, uom) {
  const u = normalizeUom(uom) || str(uom).toLowerCase();
  return `${up(sku)}__${u}`;
}

/**
 * هل القائمة سارية في هذا اليوم؟
 * الغياب يعني «بلا حدّ» لا «منتهية» — قائمةٌ بلا تاريخٍ تعمل أبدًا.
 */
export function isActiveOn(list, day) {
  if (!list || list.active === false) return false;
  const d = str(day).slice(0, 10);
  if (!d) return true;
  const from = str(list.validFrom).slice(0, 10);
  const to = str(list.validTo).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * قائمة العميل: قائمتُه إن كانت سارية، وإلّا الافتراضيّة، وإلّا `null`.
 * و`null` ليست خطأً بل حالةَ التدرّج: لا قائمة ⇒ كتابةٌ يدويّة بلا وسم.
 */
export function listForCustomer(lists = [], customer = null, day = '') {
  const all = Array.isArray(lists) ? lists.filter((l) => isActiveOn(l, day)) : [];
  const own = str(customer?.priceListId);
  if (own) {
    const found = all.find((l) => str(l.id) === own);
    if (found) return found;
  }
  return all.find((l) => l.isDefault) || null;
}

/**
 * سعر صنفٍ من قائمة، بوحدةٍ بعينها وكمّيّةٍ بعينها.
 *
 * الحدّ الأدنى للكمّيّة يختار **أعلى شريحةٍ يبلغها الطلب**: بندان لنفس الصنف
 * بحدَّين ١ و١٠٠ يعنيان سعرًا للتجزئة وسعرًا للجملة، والطلب ١٥٠ يأخذ الثاني.
 *
 * @returns {{found:boolean, price:number, minQty:number, source:string}}
 */
export function priceFor(list, sku, uom, qty = 1) {
  const key = lineKey(sku, uom);
  const tiers = (list?.lines || [])
    .filter((l) => lineKey(l.sku, l.uom) === key && num(qty) >= num(l.minQty || 0))
    .sort((a, b) => num(b.minQty || 0) - num(a.minQty || 0));
  if (!tiers.length) return { found: false, price: 0, minQty: 0, source: '' };
  return {
    found: true,
    price: money(tiers[0].price),
    minQty: num(tiers[0].minQty || 0),
    source: str(list?.name || list?.id),
  };
}

/**
 * حكمٌ على سعر بندٍ: أهو سعر القائمة أم يدويّ؟ وأمسموحٌ هو؟
 *
 * ثلاث حالات لا رابع لها:
 * ① لا قائمة ⇒ `noList` — يمرّ بلا وسمٍ ولا تنبيه (التدرّج).
 * ② السعر يطابق القائمة ⇒ `listed`.
 * ③ يخالفها ⇒ `manual` — والسياسة تقرّر أيُمنع أم يُوسَم أم يمرّ.
 *
 * @returns {{ok:boolean, status:'noList'|'listed'|'manual'|'unpriced', listPrice:number, entered:number, deltaPct:number, tag:object|null, problem:string, warning:string}}
 */
export function priceVerdict({ list, line, settings = null, role = '', qty = null }) {
  const entered = num(line?.unitPrice);
  const quantity = qty === null ? num(line?.qty) || 1 : num(qty);
  const base = { entered, listPrice: 0, deltaPct: 0, tag: null, problem: '', warning: '' };

  if (!list) return { ...base, ok: true, status: 'noList' };

  const found = priceFor(list, line?.sku, line?.uom, quantity);
  if (!found.found) {
    // صنف بيعٍ بلا سعرٍ في القائمة: **تحذير لا منع** (نصّ الخطة).
    return {
      ...base,
      ok: true,
      status: 'unpriced',
      warning: `${str(line?.sku) || 'البند'}: لا سعر له في قائمة «${str(list.name || list.id)}» — تحقّق قبل البيع.`,
    };
  }

  const listPrice = found.price;
  if (money(entered) === listPrice) {
    return { ...base, ok: true, status: 'listed', listPrice };
  }

  const verdict = manualPriceVerdict(settings, role);
  const deltaPct = listPrice > 0 ? Math.round(((entered - listPrice) / listPrice) * 1000) / 10 : 0;

  if (!verdict.allowed) {
    return {
      ...base,
      ok: false,
      status: 'manual',
      listPrice,
      deltaPct,
      problem: `${str(line?.sku) || 'البند'}: سعر القائمة ${listPrice} والمُدخَل ${entered}. ${verdict.message}`,
    };
  }

  return {
    ...base,
    ok: true,
    status: 'manual',
    listPrice,
    deltaPct,
    // الوسم يحمل ما يُسأل عنه: كم كان وكم صار وبكم انحرف. ولا يحمل الهويّة —
    // يكتبها الخادم من الجلسة، فمن يمرّرها بيده يمرّر ما شاء.
    tag: verdict.mustTag
      ? { manualPrice: true, listPrice, entered: money(entered), deltaPct, listName: found.source }
      : null,
    warning: verdict.mustTag ? `${str(line?.sku) || 'البند'}: سعرٌ يدويّ — يُوسَم ويظهر في تقرير الانحراف.` : '',
  };
}

/**
 * حكمٌ على مستند بيعٍ كامل: يملأ الأسعار الغائبة ويحكم على المكتوبة.
 *
 * @returns {{ok:boolean, problems:string[], warnings:string[], lines:object[]}}
 */
export function priceDocument({ list, lines = [], settings = null, role = '' }) {
  const problems = [];
  const warnings = [];
  const out = (Array.isArray(lines) ? lines : []).map((line) => {
    // البند بلا سعرٍ يُملأ من القائمة — وهذا أصل الميزة: لا يكتب أحدٌ سعرًا بيده.
    if (list && !num(line?.unitPrice)) {
      const found = priceFor(list, line?.sku, line?.uom, num(line?.qty) || 1);
      if (found.found) return { ...line, unitPrice: found.price, priceSource: found.source };
    }
    const v = priceVerdict({ list, line, settings, role });
    if (v.problem) problems.push(v.problem);
    if (v.warning) warnings.push(v.warning);
    return v.tag ? { ...line, pricing: v.tag } : line;
  });
  return { ok: problems.length === 0, problems, warnings, lines: out };
}

/* ═══════════════ تقرير انحراف الأسعار ═══════════════ */

/**
 * صفوف التقرير من مستندات البيع.
 * لا يخترع رقمًا: يقرأ وسم `pricing` الذي كُتب لحظة البيع. ومقارنةُ الأسعار
 * بأثرٍ رجعيّ ضدّ قوائم اليوم كذبٌ — القائمة تتغيّر والوسم لا.
 */
export function deviationRows(documents = []) {
  const rows = [];
  for (const d of Array.isArray(documents) ? documents : []) {
    for (const [i, line] of (d?.lines || []).entries()) {
      const tag = line?.pricing;
      if (!tag?.manualPrice) continue;
      rows.push({
        id: `${str(d.id)}__${i}`,
        docId: str(d.id),
        number: str(d.number) || '(مسوّدة)',
        type: str(d.type),
        sku: up(line.sku),
        description: str(line.description),
        qty: num(line.qty),
        listPrice: num(tag.listPrice),
        entered: num(tag.entered),
        deltaPct: num(tag.deltaPct),
        // أثر الانحراف بالدينار — الرقم الذي يُقرأ قبل النسبة.
        impact: money((num(tag.entered) - num(tag.listPrice)) * num(line.qty)),
        listName: str(tag.listName),
        byName: str(d.createdByName) || 'غير معروف',
        customer: str(d.header?.customer || d.header?.customerCode),
      });
    }
  }
  return rows.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

/** ملخّص الانحراف — ما يُقرأ قبل الجدول. */
export function deviationSummary(rows = []) {
  const byPerson = new Map();
  let below = 0;
  let above = 0;
  let impact = 0;
  for (const r of rows) {
    byPerson.set(r.byName, (byPerson.get(r.byName) || 0) + r.impact);
    if (r.deltaPct < 0) below += 1;
    else above += 1;
    impact += r.impact;
  }
  return {
    total: rows.length,
    below, // بيعٌ بأقلّ من القائمة — تسريب الهامش
    above,
    impact: money(impact),
    people: [...byPerson.entries()]
      .map(([key, value]) => ({ key, impact: money(value) }))
      .sort((a, b) => a.impact - b.impact), // الأكثر خسارةً أوّلًا
  };
}

/** أعمدة التقرير — يرثها محرّك التقارير في م‑٨ بلا إعادة كتابة. */
export const DEVIATION_COLUMNS = [
  { key: 'number', label: 'المستند' },
  { key: 'sku', label: 'الصنف' },
  { key: 'qty', label: 'الكمّيّة' },
  { key: 'listPrice', label: 'سعر القائمة' },
  { key: 'entered', label: 'المُدخَل' },
  { key: 'deltaPct', label: 'الانحراف ٪' },
  { key: 'impact', label: 'الأثر (د.ل)' },
  { key: 'byName', label: 'البائع' },
  { key: 'customer', label: 'العميل' },
];

/** تحقّقٌ من قائمةٍ قبل الحفظ. */
export function listProblems(list) {
  const problems = [];
  if (!str(list?.name)) problems.push('القائمة بلا اسم.');
  const from = str(list?.validFrom).slice(0, 10);
  const to = str(list?.validTo).slice(0, 10);
  if (from && to && to < from) problems.push('نافذة السريان مقلوبة: النهاية قبل البداية.');

  const seen = new Set();
  for (const [i, l] of (list?.lines || []).entries()) {
    if (!str(l.sku)) problems.push(`البند ${i + 1}: بلا صنف.`);
    if (num(l.price) < 0) problems.push(`البند ${i + 1}: سعرٌ سالب.`);
    const k = `${lineKey(l.sku, l.uom)}__${num(l.minQty || 0)}`;
    if (seen.has(k)) {
      problems.push(`البند ${i + 1}: تكرارٌ لنفس الصنف والوحدة والحدّ الأدنى — أيّ السعرين يُعتمد؟`);
    }
    seen.add(k);
  }
  return problems;
}
