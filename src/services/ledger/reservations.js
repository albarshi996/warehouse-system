/**
 * التخصيص والحجز — منطق خالص يمنع بيع البضاعة مرّتين.
 *
 * المشكلة التي يحلّها: بائعان يفتحان الشاشة في اللحظة نفسها، يريان «متاح 100»،
 * فيَعِد كلٌّ عميله بمئة. الرصيد لم يكذب — لكنه لم يكن يعرف أن أحدًا وعد به.
 * الوعد التزامٌ على المخزون، وما لم يُسجَّل التزامًا بقي الرصيد رقمًا متفائلًا.
 *
 * الحلّ: رقمان لا رقم واحد.
 *   `qty`         — ما على الرفّ فعلًا (يُحرّكه الدفتر وحده)
 *   `qtyReserved` — ما وُعد به ولم يُسحب بعد
 *   **المتاح = الأول ناقص الثاني** — وهو وحده ما يُعرض للبائع.
 *
 * والحجز يُفكّ في حالتين لا ثالث: أن يُسحب فعلًا (فينتقل الالتزام إلى حركة)،
 * أو أن يسقط أمر البيع. فلا يبقى محجوزٌ بلا صاحب — وذلك أسوأ من لا حجز، لأنه
 * يُخفي بضاعةً موجودة.
 *
 * التخصيص يتبع **FEFO** لا الرصيد الأكبر: نَعِد من أقرب التشغيلات انتهاءً، كي
 * يخرج القديم أوّلًا فلا يبلغ تاريخه وهو في الرفّ. (القاعدة الذهبية الثالثة.)
 */
import { fefoSort, balanceId } from '../balances/balanceKey.js';

/** المتاح للبيع من صفّ رصيد = الموجود ناقص المحجوز. لا يقلّ عن صفر. */
export function availableQty(balance) {
  const qty = Number(balance?.qty) || 0;
  const reserved = Number(balance?.qtyReserved) || 0;
  return Math.max(0, qty - reserved);
}

/** إجمالي المتاح عبر مجموعة صفوف. */
export function totalAvailable(balances) {
  return (balances || []).reduce((sum, b) => sum + availableQty(b), 0);
}

/** إجمالي المحجوز — ما وُعد به العملاء ولم يخرج بعد. */
export function totalReserved(balances) {
  return (balances || []).reduce((sum, b) => sum + (Number(b?.qtyReserved) || 0), 0);
}

/** هل هذا الصفّ يخصّ الصنف المطلوب؟ مقارنة نصّية كما في `chain.js`. */
function matchesItem(balance, { sku, barcode }) {
  const want = String(sku || barcode || '').trim().toUpperCase();
  if (!want) return false;
  const has = String(balance?.sku || '').trim().toUpperCase();
  const hasBar = String(balance?.barcode || '').trim().toUpperCase();
  return has === want || hasBar === want;
}

/**
 * يخصّص كميةً مطلوبة على التشغيلات المتاحة بترتيب FEFO.
 *
 * لا يكتب شيئًا — يُخرج **خطّة** تخصيص تُعرض للموظّف ثم تُنفَّذ إن اعتُمدت.
 * الفصل مقصود: التخصيص قرارٌ يُراجَع، لا أثرٌ جانبيّ لفتح شاشة.
 *
 * @param {{sku?, barcode?, qty:number, warehouse?}} request المطلوب
 * @param {Array} balances صفوف الأرصدة المتاحة
 * @returns {{allocations:Array, allocated:number, shortfall:number, ok:boolean}}
 */
export function allocateFefo(request, balances) {
  const wanted = Number(request?.qty) || 0;
  const wh = String(request?.warehouse || '').trim().toUpperCase();

  const candidates = fefoSort(
    (balances || [])
      .filter((b) => matchesItem(b, request))
      .filter((b) => (wh ? String(b?.warehouse || '').toUpperCase() === wh : true))
      .filter((b) => availableQty(b) > 0)
  );

  const allocations = [];
  let remaining = wanted;

  for (const balance of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, availableQty(balance));
    if (take <= 0) continue;
    allocations.push({
      balanceId:
        balance.id ||
        balanceId({
          sku: balance.sku,
          barcode: balance.barcode,
          warehouse: balance.warehouse,
          batch: balance.batch,
        }),
      sku: balance.sku || '',
      barcode: balance.barcode || '',
      nameAr: balance.nameAr || '',
      warehouse: String(balance.warehouse || '').toUpperCase(),
      batch: balance.batch || '',
      expiry: balance.expiry || '',
      unitCost: Number(balance.unitCost) || 0,
      qty: take,
    });
    remaining -= take;
  }

  const allocated = wanted - remaining;
  return {
    allocations,
    allocated,
    shortfall: Math.max(0, remaining),
    ok: remaining <= 0 && wanted > 0,
  };
}

/**
 * يخصّص بنود مستندٍ كاملًا، ويُخرج ما عجز عنه صراحةً.
 *
 * العجز هنا ليس فشلًا يُخفى — بل هو **مصدر تقرير الأصناف غير المتوفّرة**
 * وتقرير الطلبات المعلّقة. لذلك يُعاد مفصّلًا صنفًا صنفًا لا كرقمٍ مجمَل.
 */
export function allocateDocument(docData, balances) {
  const warehouse = String(docData?.header?.warehouse || '').trim().toUpperCase();
  const lines = docData?.lines || [];

  const results = lines.map((line, index) => {
    const qty = Number(line?.qty ?? line?.qtyRequested ?? line?.qtyOrdered) || 0;
    const request = { sku: line?.sku, barcode: line?.barcode, qty, warehouse };
    const plan = allocateFefo(request, balances);
    return {
      lineIndex: index,
      sku: String(line?.sku || '').trim(),
      barcode: String(line?.barcode || '').trim(),
      nameAr: String(line?.description || '').trim(),
      requested: qty,
      ...plan,
    };
  });

  const shortages = results.filter((r) => r.shortfall > 0);
  return {
    lines: results,
    shortages,
    fullyAllocated: shortages.length === 0 && results.length > 0,
    totalRequested: results.reduce((s, r) => s + r.requested, 0),
    totalAllocated: results.reduce((s, r) => s + r.allocated, 0),
  };
}

/**
 * أثر خطّة التخصيص على حقل `qtyReserved`.
 * `sign = +1` للحجز، و`-1` لفكّه. يجمع المتكرّر على نفس المفتاح.
 */
export function reservationDeltas(allocations, sign = 1) {
  const byKey = new Map();
  (allocations || []).forEach((a) => {
    if (!a?.balanceId) return;
    const prev = byKey.get(a.balanceId);
    if (prev) {
      prev.delta += sign * (Number(a.qty) || 0);
      return;
    }
    byKey.set(a.balanceId, {
      id: a.balanceId,
      sku: a.sku,
      barcode: a.barcode,
      warehouse: a.warehouse,
      batch: a.batch,
      delta: sign * (Number(a.qty) || 0),
    });
  });
  return [...byKey.values()];
}

/**
 * نسبة تلبية الطلب (Fill Rate) — أوّل مؤشّرات الأداء وأصدقها.
 * المقياس بالكمية لا بعدد الأسطر: بندٌ من ألف قطعة لا يساوي بندًا من قطعة.
 */
export function fillRate(allocationResult) {
  const requested = Number(allocationResult?.totalRequested) || 0;
  if (requested <= 0) return null;
  return (Number(allocationResult?.totalAllocated) || 0) / requested;
}
