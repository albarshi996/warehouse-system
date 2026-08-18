/**
 * تخصيص المنتَج على الفروع ‹FNB-504› — منطق خالص.
 *
 * ═══ الحلقة الوحيدة المكتملة قبل اليوم ═══
 * التجهيز والشحن واستلام الفروع مبنيّةٌ وكاملة (TR→TRN→TRC عبر TRANSIT).
 * فالمطلوب هنا **وصلُ الإنتاج بها** لا بناؤها: من الدفعة المنتَجة إلى
 * طلبات الفروع المجمَّعة، بنسبةٍ عادلةٍ حين لا يكفي المنتَج.
 *
 * ═══ ولماذا التناسب لا «الأوّل فالأوّل» ═══
 * إنتاجٌ ناقصٌ يُوزَّع بالأسبقيّة يُشبع فرعَين ويُجوّع ثالثًا. والتناسب
 * يجعل كلّ فرعٍ يأخذ نسبةً من طلبه — فالنقص يُقتسم لا يُلقى على آخر
 * من طلب. والكسور تُجبر بالتدوير مع **ضمان ألّا يتجاوز المجموعُ المنتَج**.
 *
 * ═══ والمرفوض جودةً لا يدخل التخصيص أصلًا ═══
 * الحكم في `productionBatch.allocationVerdict` — يُستدعى هنا ولا يُكرَّر.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { allocationVerdict } from '../items/productionBatch.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;

/**
 * يوزّع كمّيّةً منتَجة على طلبات الفروع **بالتناسب**.
 *
 * @param {{sku, batch, qty, warehouse, qcStatus}} produced الدفعة المنتَجة
 * @param {object[]} demands طلبات الفروع `{branch, qty}` للصنف نفسه
 * @returns {{ok, allocations, shortfall, problems}}
 *   `allocations`: `{branch, requested, allocated, shortfall}`
 */
export function allocateProduction(produced, demands = []) {
  const problems = [];
  const sku = normalizeItemCode(produced?.sku);
  const available = round3(num(produced?.qty));

  // ★ المرفوض جودةً لا يُخصَّص — الحكم من مصدره لا يُكرَّر هنا.
  const qc = allocationVerdict(produced);
  if (!qc.ok) return { ok: false, allocations: [], shortfall: 0, problems: [qc.problem] };

  const rows = (Array.isArray(demands) ? demands : [])
    .map((d) => ({ branch: up(d?.branch), requested: round3(num(d?.qty)) }))
    .filter((d) => d.branch && d.requested > 0);

  if (!rows.length) return { ok: false, allocations: [], shortfall: 0, problems: ['لا طلبَ لفرعٍ على هذا الصنف — لا شيء يُخصَّص.'] };
  if (available <= 0) return { ok: false, allocations: [], shortfall: 0, problems: [`«${sku}»: لا كمّيّة منتَجة تُخصَّص.`] };

  const totalDemand = round3(rows.reduce((s, r) => s + r.requested, 0));

  // يكفي الطلب: كلٌّ يأخذ ما طلب، والفائض يبقى في المخزن لا يُوزَّع قسرًا.
  if (available >= totalDemand) {
    return {
      ok: true,
      shortfall: 0,
      allocations: rows.map((r) => ({ ...r, allocated: r.requested, shortfall: 0 })),
      problems,
    };
  }

  // لا يكفي: تناسبٌ، ثمّ توزيعُ ما تبقّى من التدوير على الأكبر طلبًا.
  const ratio = available / totalDemand;
  const allocations = rows.map((r) => ({ ...r, allocated: Math.floor(r.requested * ratio * 1000) / 1000 }));
  let assigned = round3(allocations.reduce((s, a) => s + a.allocated, 0));
  let remainder = round3(available - assigned);

  const bySize = [...allocations].sort((a, b) => b.requested - a.requested);
  for (const row of bySize) {
    if (remainder <= 0) break;
    const gap = round3(row.requested - row.allocated);
    if (gap <= 0) continue;
    const give = Math.min(gap, remainder);
    row.allocated = round3(row.allocated + give);
    remainder = round3(remainder - give);
  }

  const final = allocations.map((a) => ({ ...a, shortfall: round3(a.requested - a.allocated) }));
  assigned = round3(final.reduce((s, a) => s + a.allocated, 0));
  // ★ الحارس الحاكم: لا يُخصَّص أكثر ممّا أُنتج وقُبل جودةً.
  if (assigned > available) problems.push(`خطأ توزيع: خُصّص ${assigned} والمتاح ${available}.`);

  return { ok: true, shortfall: round3(totalDemand - available), allocations: final, problems };
}

/**
 * استثناء «تأخّر إنتاج» ‹FNB-504› — نقصُ الإنتاج عن الطلب يُلاحَق بمالكه.
 * ويُفتح مرّةً للصنف لا لكلّ فرعٍ متأثّر: الحادثة واحدة والمتأثّرون كثر.
 */
export function shortfallException(produced, result, { branchCount = 0 } = {}) {
  if (!result?.ok || num(result.shortfall) <= 0) return null;
  const affected = branchCount || (result.allocations || []).filter((a) => num(a.shortfall) > 0).length;
  return {
    type: 'production_delay',
    sku: up(produced?.sku),
    qty: round3(num(result.shortfall)),
    location: up(produced?.warehouse),
    reason: `الإنتاج أقلّ من طلب الفروع بـ${round3(num(result.shortfall))} — ${affected} فرعًا لن يستلم كامل طلبه.`,
  };
}

/**
 * يحوّل التخصيص إلى **طلبات نقلٍ للفروع** — بسلسلة النقل القائمة
 * (TR→TRN→TRC) لا بمسار شحنٍ ثانٍ للمطبخ.
 */
export function toBranchTransfers(produced, result, { fromWarehouse = '', requestDate = '' } = {}) {
  return (result?.allocations || [])
    .filter((a) => num(a.allocated) > 0)
    .map((a) => ({
      type: 'TR',
      header: {
        requestDate: str(requestDate),
        fromWarehouse: up(fromWarehouse || produced?.warehouse),
        toWarehouse: a.branch,
        costCenter: a.branch,
        purpose: 'تخصيص إنتاج',
      },
      lines: [{
        sku: normalizeItemCode(produced?.sku),
        qty: a.allocated,
        batch: up(produced?.batch),
        expiry: str(produced?.expiry),
        notes: a.shortfall > 0 ? `طُلب ${a.requested} وخُصّص ${a.allocated} — نقصُ إنتاج` : '',
      }],
    }));
}
