/**
 * تحليل المخزون: التقييم والراكد وإعادة الطلب — منطق خالص بلا Firestore وبلا DOM.
 *
 * لماذا وُجد؟ حزمة تقارير §17 كانت تقيس «المعلّق» و«العاجز» فقط؛ والمدير يسأل
 * سؤالين ماليَّين قبلهما: **كم رأس مالٍ راقدٌ لا يتحرّك؟** و**أيّ صنفٍ تحت حدّه
 * الأدنى يوشك أن ينفد؟** — كلاهما يُحسب من بياناتٍ قائمة: أرصدة الماستر وتكاليفه،
 * وتواريخ الخروج في دفتر الحركات. لا بيانات جديدة ولا تغيير قواعد.
 *
 * القاعدة: لا رقم يُلفَّق. التقييم = رصيد الماستر × تكلفته؛ والراكد = صنفٌ برصيدٍ
 * موجبٍ بلا خروجٍ للخارج منذ نافذةٍ معرَّفة؛ وإعادة الطلب = رصيدٌ ≤ حدٍّ أدنى
 * مُعرَّفٍ فعلًا (`minStock`). ما لا حدَّ له يُحصى «فجوة تغطية» لا يُخمَّن له حدّ.
 *
 * خالصٌ عمدًا (نمط `procurementKpis`): يُختبَر في Node ببياناتٍ اصطناعية،
 * و`nowMs` يُمرَّر ولا يُقرأ من الساعة، فالنتيجة حتميّة.
 */

const MS_PER_DAY = 86400000;

const num = (v) => Number(v) || 0;

/**
 * هويّة الصنف القانونيّة لمطابقة الماستر بالدفتر — الكود أولًا فالباركود،
 * منظّفًا كـ`balanceId` (رفع الحالة وإزالة ما يكسر المفاتيح). فارغٌ ⇐ null.
 */
export function canonKey(x) {
  const safe = (p) => String(p ?? '').trim().replace(/[/.#$[\]]/g, '-').replace(/\s+/g, '_').toUpperCase();
  return safe(x?.sku) || safe(x?.barcode) || null;
}

/** هل هذه الحركة خروجٌ للخارج؟ (غادرت المنشأة: مصدرٌ موجودٌ ووجهةٌ خالية) */
function isOutflowToExternal(move) {
  const from = String(move?.from ?? '').trim();
  const to = String(move?.to ?? '').trim();
  return num(move?.qty) > 0 && from !== '' && to === '';
}

/**
 * آخر خروجٍ للخارج لكل صنف (ثوانٍ). مفتاحٌ ⇐ أحدث `postedAt.seconds` لحركة خروج.
 * الأصناف الغائبة عن الخريطة لم تُصرَف قطّ ضمن الحركات المتاحة.
 */
export function lastOutflowByItem(moves) {
  const out = new Map();
  for (const m of moves || []) {
    if (!isOutflowToExternal(m)) continue;
    const key = canonKey(m);
    if (!key) continue;
    const sec = num(m?.postedAt?.seconds);
    if (sec > (out.get(key) || 0)) out.set(key, sec);
  }
  return out;
}

/** إجمالي الخروج للخارج لكل صنف منذ لحظةٍ (ثوانٍ) — لحساب معدّل الصرف والتغطية. */
export function outflowQtySince(moves, sinceSec) {
  const out = new Map();
  for (const m of moves || []) {
    if (!isOutflowToExternal(m)) continue;
    if (num(m?.postedAt?.seconds) < sinceSec) continue;
    const key = canonKey(m);
    if (!key) continue;
    out.set(key, (out.get(key) || 0) + num(m.qty));
  }
  return out;
}

/**
 * تقرير إعادة الطلب: الأصناف التي رصيدها ≤ حدّها الأدنى المعرَّف (`minStock`>0)،
 * مرتّبةً بالنقص تنازليًّا. `withoutMin` = أصنافٌ برصيدٍ بلا حدٍّ أدنى (فجوة تغطية،
 * لا تُخمَّن). كلّ صنفٍ يحمل النقص وقيمة أمر التجديد المقترح (النقص × التكلفة).
 */
export function reorderReport(items) {
  const rows = [];
  let withoutMin = 0;
  for (const it of items || []) {
    const key = canonKey(it);
    if (!key) continue;
    const balance = num(it.balance);
    const min = num(it.minStock);
    if (min <= 0) {
      if (balance >= 0) withoutMin += 1;
      continue;
    }
    if (balance <= min) {
      const shortfall = Math.max(0, min - balance);
      rows.push({
        key,
        sku: it.sku || '',
        nameAr: it.nameAr || it.nameEn || key,
        unit: it.unit || '',
        category: it.category || it.family || '',
        balance,
        minStock: min,
        shortfall,
        costPrice: num(it.costPrice || it.unitPrice),
        orderValue: shortfall * num(it.costPrice || it.unitPrice),
      });
    }
  }
  rows.sort((a, b) => b.shortfall - a.shortfall);
  return { rows, count: rows.length, withoutMin };
}

/**
 * تقرير الراكد: أصنافٌ برصيدٍ موجبٍ بلا خروجٍ للخارج منذ `stagnantDays`
 * (أو لم تُصرَف قطّ)، مرتّبةً بالقيمة الراقدة تنازليًّا. `daysIdle=null` تعني
 * «لم يُصرف قطّ ضمن الحركات المتاحة».
 */
export function stagnantReport(items, moves, nowMs, { stagnantDays = 90 } = {}) {
  const lastOut = lastOutflowByItem(moves);
  const cutoffSec = (nowMs - stagnantDays * MS_PER_DAY) / 1000;
  const rows = [];
  for (const it of items || []) {
    const key = canonKey(it);
    if (!key) continue;
    const balance = num(it.balance);
    const cost = num(it.costPrice || it.unitPrice);
    if (balance <= 0 || cost <= 0) continue; // «رأس مالٌ راقد» يفترض رصيدًا وقيمةً؛ غير المسعَّر يخصّه تقرير التقييم
    const outSec = lastOut.get(key);
    const idle = outSec === undefined || outSec < cutoffSec;
    if (!idle) continue;
    rows.push({
      key,
      sku: it.sku || '',
      nameAr: it.nameAr || it.nameEn || key,
      unit: it.unit || '',
      category: it.category || it.family || '',
      balance,
      costPrice: cost,
      value: balance * cost,
      lastOutflowMs: outSec === undefined ? null : outSec * 1000,
      daysIdle: outSec === undefined ? null : Math.floor((nowMs - outSec * 1000) / MS_PER_DAY),
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return { rows, count: rows.length, value: rows.reduce((s, r) => s + r.value, 0) };
}

/**
 * تقرير التقييم: قيمة المخزون الكلّية (Σ رصيد × تكلفة) موزّعةً على الفئات
 * (تنازليًّا)، مع إحصاء المسعَّر وغير المسعَّر (تكلفة ≤ 0) — فالتقييم يصدق بقدر
 * اكتمال التكاليف.
 */
export function valuationReport(items) {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  const byCat = new Map();
  for (const it of items || []) {
    if (!canonKey(it)) continue;
    const balance = num(it.balance);
    const cost = num(it.costPrice || it.unitPrice);
    if (cost > 0) priced += 1; else unpriced += 1;
    const value = balance * cost;
    total += value;
    const cat = it.category || it.family || 'بلا فئة';
    const prev = byCat.get(cat) || { category: cat, value: 0, count: 0 };
    prev.value += value;
    prev.count += 1;
    byCat.set(cat, prev);
  }
  const categories = [...byCat.values()].sort((a, b) => b.value - a.value);
  return { total, categories, itemsPriced: priced, itemsUnpriced: unpriced };
}

/** أرقام الملخّص التنفيذيّ — تُشتقّ دفعةً واحدة لبطاقات الترويسة. */
export function inventorySummary(items, moves, nowMs, opts = {}) {
  const valuation = valuationReport(items);
  const reorder = reorderReport(items);
  const stagnant = stagnantReport(items, moves, nowMs, opts);
  const itemsTotal = (items || []).filter((it) => canonKey(it)).length;
  return {
    itemsTotal,
    totalValue: valuation.total,
    itemsUnpriced: valuation.itemsUnpriced,
    reorderCount: reorder.count,
    reorderWithoutMin: reorder.withoutMin,
    stagnantCount: stagnant.count,
    stagnantValue: stagnant.value,
    stagnantShare: valuation.total > 0 ? stagnant.value / valuation.total : null,
  };
}
