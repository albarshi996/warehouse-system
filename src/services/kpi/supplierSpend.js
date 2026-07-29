/**
 * تحليل إنفاق المشتريات على الموردين — يجيب سؤالَي ديلويت في محور الموردين:
 * «كم عدد الموردين النشطين؟» و«ما نسبة تركّز الإنفاق على أكبر خمسة؟».
 *
 * يُبنى من **أوامر الشراء الموجودة** (المُصدَرة: معتمَدة أو منجَزة) بلا كيان مورّدٍ
 * ولا استيراد — فالمورّد اليوم حقلٌ على الأمر (اسمٌ ورمز)، وإنفاقُه مجموعُ صافي
 * أوامره. قرار المالك §19#4 (2026-07-29): يكفينا إنفاق المشتريات؛ نسبةُ المخزون
 * لكلّ مورّد مؤجَّلة للأفق الثاني. فحين يُبنى ماستر الموردين (§15.2) يُطابَق هذا
 * التحليل به بالرمز، ويبقى المنطق نفسه.
 *
 * خالصٌ عمدًا: بلا Firestore، والوقت يُمرَّر `nowMs` لا يُقرأ — كي يُختبَر في Node.
 * صافي الأمر من `netTotal` نفسها التي تحسبه في المخطّط (لا حساب موازٍ ينحرف).
 */
import { toMillis } from '../documents/inbox.js';
import { netTotal } from '../documents/schemas/po.js';

const DAY = 86400000;

/** يقصر المستندات على آخر `windowDays` يومًا إن طُلبت (المستند بلا تاريخ يُحتسب). */
function withinWindow(docs, nowMs, windowDays) {
  if (nowMs == null || !(windowDays > 0)) return docs || [];
  const cutoff = nowMs - windowDays * DAY;
  return (docs || []).filter((d) => {
    const t = toMillis(d?.createdAt);
    return t == null || t >= cutoff;
  });
}

/** مفتاح المورّد: الرمز أولًا فالاسم، مطبَّعًا — فمورّدٌ برمزٍ واحد لا يتشظّى. */
function supplierKey(po) {
  const code = String(po?.header?.supplierCode || '').trim().toUpperCase();
  if (code) return code;
  return String(po?.header?.supplier || '').trim().toUpperCase();
}

/**
 * الإنفاق على الموردين وتركّزه، من أوامر الشراء المُصدَرة (معتمَدة/منجَزة —
 * المسودّة والمُرسَل والمرفوض ليست إنفاقًا ملتزَمًا).
 *
 * @returns {{suppliers, activeCount, totalSpend, top5Spend, top5Concentration}}
 *   `suppliers` مرتّبة تنازليًّا بالإنفاق، كلٌّ بحصّته من الإجمالي.
 *   `top5Concentration` = إنفاق أكبر خمسة ÷ الإجمالي (null إن لا إنفاق).
 */
export function supplierSpend(docs, opts = {}) {
  const scoped = withinWindow(docs, opts.nowMs, opts.windowDays);
  const issued = scoped.filter((d) => d?.type === 'PO' && ['approved', 'done'].includes(d.state));

  const bySupplier = new Map();
  for (const po of issued) {
    const key = supplierKey(po);
    if (!key) continue;
    const rec = bySupplier.get(key)
      || { key, name: po.header?.supplier || key, code: po.header?.supplierCode || '', spend: 0, orders: 0 };
    rec.spend += netTotal(po);
    rec.orders += 1;
    if ((!rec.name || rec.name === key) && po.header?.supplier) rec.name = po.header.supplier;
    bySupplier.set(key, rec);
  }

  const ranked = [...bySupplier.values()].sort((a, b) => b.spend - a.spend);
  const totalSpend = ranked.reduce((s, r) => s + r.spend, 0);
  const top5Spend = ranked.slice(0, 5).reduce((s, r) => s + r.spend, 0);
  const suppliers = ranked.map((r) => ({ ...r, share: totalSpend > 0 ? r.spend / totalSpend : null }));

  return {
    suppliers,
    activeCount: ranked.length,
    totalSpend,
    top5Spend,
    top5Concentration: totalSpend > 0 ? top5Spend / totalSpend : null,
  };
}
