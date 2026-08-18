/**
 * الطلب المجمَّع للقطاع ‹FNB-304› — `F&B Consolidated Demand` — منطق خالص.
 *
 * ═══ الشرط الذي يسبق النتيجة ═══
 * «رغم أن كلّ فرع **مستقلّ** في طلبه واستلامه واستهلاكه، تقوم المنظومة
 * تلقائيًّا بتجميعها» (سطر 136). فالاستقلال **شرطٌ في التجميع لا نتيجةٌ له**:
 * التجميع **عرضٌ مشتقّ** يُقرأ فوق مستندات الفروع ولا يبتلعها. ومن دمج
 * طلبات ثلاثين فرعًا في مستندٍ واحد فقد الفرعَ المسؤول عن كلّ كمّيّة، ولم
 * يعد يعرف لمن يُسلّم ولا من ينحرف.
 *
 * ═══ والأوجه الستّة ═══
 * فرع · براند · إجمالي القطاع · صنف · مدينة · تاريخ تسليم (أسطر 142–152).
 * والمدينة **صفةُ الفرع تُشتقّ من الشجرة** لا حقلٌ سادس على المستند (ق‑ت٤):
 * حقلٌ يدويّ بجانب صفّ الفرع يفترق عنه أوّل نقلِ فرعٍ بين المدن.
 */
import { normalizeItemCode } from '../items/itemIdentity.js';
import { ancestryOf } from '../org/orgLocations.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;
const day = (v) => str(v).slice(0, 10);

/**
 * الأوجه الستّة من نصّ المستند — سجلٌّ معلَن لا شروطٌ مبثوثة.
 * و`field` تفصل **اسم الوجه** عن **اسم الحقل** في السطر: وجه «الصنف»
 * يقرأ `sku`. ولولا الفصل لَقرأ حقلًا لا وجود له فجمّع كلَّ شيءٍ تحت
 * «غير محدَّد» بصمت — وهو أسوأ من خطأٍ صريح.
 */
export const DEMAND_FACETS = Object.freeze({
  branch: { id: 'branch', field: 'branch', labelAr: 'حسب الفرع' },
  brand: { id: 'brand', field: 'brand', labelAr: 'حسب البراند' },
  sector: { id: 'sector', field: 'sector', labelAr: 'إجمالي القطاع' },
  item: { id: 'item', field: 'sku', labelAr: 'حسب الصنف' },
  city: { id: 'city', field: 'city', labelAr: 'حسب المدينة' },
  deliveryDate: { id: 'deliveryDate', field: 'deliveryDate', labelAr: 'حسب تاريخ التسليم' },
});

/** حقل السطر الذي يقرؤه وجهٌ ما — والمجهول يُقرأ باسمه (قناةٌ مثلًا). */
function fieldOf(facet) {
  return DEMAND_FACETS[facet]?.field || facet;
}

/**
 * يُسوّي طلبات الفروع إلى سطورٍ قابلة للتجميع — **بلا مسّ المستند الأصليّ**.
 *
 * كلّ سطرٍ يحمل مرجعه إلى مستنده (`docId`/`docNumber`) فيُفتح التجميع إلى
 * مصادره: رقمٌ مجمَّعٌ لا يُفتح رقمٌ مغلق.
 *
 * @param {object[]} orders مستندات طلبٍ (TR أو مسوّدات FNB-302)
 * @param {Map} orgIndex فهرس الشجرة — منه البراند والقطاع والمدينة
 */
export function demandRows(orders = [], orgIndex = null) {
  const rows = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const header = order?.header || order || {};
    const branch = up(header.toWarehouse || header.costCenter || order?.branch);
    if (!branch) continue;

    // الأبعاد تُشتقّ من الشجرة وقت القراءة — والتجميع عرضٌ لا قيد.
    const chain = orgIndex ? ancestryOf(orgIndex, branch) : [];
    const at = (level) => chain.find((l) => l.level === level) || null;
    const branchNode = at('branch');

    for (const line of order?.lines || []) {
      const sku = normalizeItemCode(line?.sku);
      const qty = num(line?.qty);
      if (!sku || qty === 0) continue;
      rows.push({
        branch,
        brand: at('brand')?.code || '',
        sector: at('sector')?.code || '',
        // المدينة صفةُ الفرع من ملفّه — لا حقلٌ على المستند (ق‑ت٤).
        city: str(branchNode?.profile?.city || branchNode?.city),
        sku,
        nameAr: str(line?.description || line?.nameAr),
        qty: round3(qty),
        uom: str(line?.uom),
        suggestedQty: num(line?.suggestedQty),
        deliveryDate: day(header.requiredDate || header.deliveryDate || header.requestDate),
        channel: up(header.channel) || 'RESTAURANTS',
        docId: str(order?.id),
        docNumber: str(order?.number || header.number),
      });
    }
  }
  return rows;
}

/**
 * يجمع الطلب بوجهٍ واحد — والمفتاح الفارغ يُحصى تحت «غير محدَّد» ولا يُهمَل:
 * فرعٌ خارج الشجرة أو تاريخٌ ناقص يجب أن يُرى لا أن يذوب.
 *
 * @returns {object[]} `{key, label, qty, lines, skus, branches, refs}`
 */
export function consolidate(rows = [], facet = 'branch') {
  const field = fieldOf(facet);
  const groups = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = str(r?.[field]) || '—';
    const at = groups.get(key) || { key, qty: 0, lines: 0, skus: new Set(), branches: new Set(), refs: new Set() };
    at.qty = round3(at.qty + num(r.qty));
    at.lines += 1;
    at.skus.add(r.sku);
    if (r.branch) at.branches.add(r.branch);
    if (r.docNumber || r.docId) at.refs.add(r.docNumber || r.docId);
    groups.set(key, at);
  }
  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      label: g.key === '—' ? 'غير محدَّد' : g.key,
      qty: g.qty,
      lines: g.lines,
      skus: g.skus.size,
      branches: g.branches.size,
      // مراجع المستندات — بها يُفتح الرقم المجمَّع إلى مصادره.
      refs: [...g.refs].sort(),
    }))
    .sort((a, b) => b.qty - a.qty || a.key.localeCompare(b.key));
}

/** الأوجه الستّة دفعةً واحدة — لعرضٍ ينتقل بينها بلا إعادة حساب. */
export function consolidateAll(rows = []) {
  return Object.fromEntries(Object.keys(DEMAND_FACETS).map((facet) => [facet, consolidate(rows, facet)]));
}

/**
 * النزول من خليّةٍ مجمَّعة إلى **سطور الفروع المكوِّنة لها** — تجميعٌ يُفتَح
 * لا رقمٌ مغلق (نفس عقد `drill.js`: قائمةٌ لا تفسّر رقمها تُسقط الثقة).
 */
export function drillDemand(rows = [], facet, key) {
  const field = fieldOf(facet);
  const wanted = str(key) === 'غير محدَّد' ? '' : str(key);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => (str(r?.[field]) || '') === wanted)
    .sort((a, b) => b.qty - a.qty);
}

/**
 * حارس التوازن ‹FNB-304›: **مجموع أيّ وجهٍ = مجموع طلبات الفروع** — بلا
 * ازدواجٍ ولا فقد. ومن جمّع بوجهٍ يزيد أو ينقص أنتج رقمًا لا يُصدَّق.
 * @returns {{ok:boolean, total:number, problems:string[]}}
 */
export function demandBalance(rows = []) {
  const total = round3((Array.isArray(rows) ? rows : []).reduce((s, r) => s + num(r.qty), 0));
  const problems = [];
  for (const facet of Object.keys(DEMAND_FACETS)) {
    const sum = round3(consolidate(rows, facet).reduce((s, g) => s + g.qty, 0));
    if (sum !== total) problems.push(`الوجه «${DEMAND_FACETS[facet].labelAr}» مجموعه ${sum} والإجماليّ ${total}.`);
  }
  return { ok: problems.length === 0, total, problems };
}

/**
 * الاحتياج الصافي لصنفٍ على مستوى القطاع — مدخلُ طلب الشراء (FNB-601):
 * ما تطلبه الفروع مجموعًا، وما هو متاحٌ مركزيًّا، والفرق هو ما يُشترى.
 */
export function netSectorRequirement(rows = [], { centralStockBySku = null } = {}) {
  const byItem = consolidate(rows, 'item');
  return byItem.map((g) => {
    const central = num(centralStockBySku?.get?.(g.key));
    const net = round3(Math.max(0, g.qty - central));
    return {
      sku: g.key,
      demand: g.qty,
      centralStock: central,
      netRequirement: net,
      branches: g.branches,
      covered: net === 0,
    };
  }).filter((r) => r.demand > 0);
}

/* ═══════════════ ‹FNB-305› قناة الطلب ═══════════════ */

/**
 * قنوات الطلب (سطر 397): «يجب **منذ البداية** تصميم الطلب تحت Demand Channel»
 * — فالقناة تُبنى الآن ولو لم تُستعمل غدًا، لأنّ إضافتها بعد ألف مستندٍ
 * ترحيلٌ لا حقل: ألفُ مستندٍ بلا قناةٍ تعني تجميعًا لا يُصدَّق أو تخمينًا
 * بأثرٍ رجعيّ.
 *
 * `internal` تفرّق ما يبقى داخل الشركة (تزويد الفرع) عمّا يخرج بيعًا —
 * والاثنان يصبّان في **نفس محرّك التخطيط** (سطر 414) ويظلّان مميَّزَين.
 */
export const DEMAND_CHANNELS = Object.freeze({
  RESTAURANTS: { id: 'RESTAURANTS', labelAr: 'المطاعم (تزويد الفروع)', internal: true },
  CATERING: { id: 'CATERING', labelAr: 'الضيافة (Catering)', internal: false },
  CORPORATE: { id: 'CORPORATE', labelAr: 'عقود الشركات (Corporate)', internal: false },
  AGGREGATORS: { id: 'AGGREGATORS', labelAr: 'تطبيقات التوصيل (Aggregators)', internal: false },
});

/** القناة الافتراضيّة — الطلب الداخليّ، فلا يتعطّل ما يعمل اليوم. */
export const DEFAULT_CHANNEL = 'RESTAURANTS';

const CHANNEL_ALIASES = {
  RESTAURANTS: ['restaurants', 'restaurant', 'branch', 'فرع', 'الفروع', 'مطاعم', 'تزويد'],
  CATERING: ['catering', 'ضيافة', 'كيترنج', 'مناسبات'],
  CORPORATE: ['corporate', 'b2b', 'شركات', 'عقود', 'عقود شركات'],
  AGGREGATORS: ['aggregator', 'aggregators', 'delivery', 'تطبيقات', 'توصيل', 'دليفري'],
};

/**
 * يحوّل قناةً مكتوبةً بأيّ صيغة إلى معرّفها، أو `''` إن لم تُعرف.
 * **والقنوات تتوسّع بالبيانات لا بالكود**: «أيّ قناة مستقبليّة» (سطر 411)
 * تُضاف سجلًّا هنا أو تمرّ مجهولةً معلَنة — ولا تُرفض فيضيع طلبٌ واقع.
 */
export function normalizeChannel(raw) {
  const s = str(raw).toLowerCase();
  if (!s) return '';
  const direct = up(raw);
  if (DEMAND_CHANNELS[direct]) return direct;
  for (const [id, aliases] of Object.entries(CHANNEL_ALIASES)) {
    if (aliases.includes(s)) return id;
  }
  return '';
}

/** قناة مستندٍ — والمجهول والفارغ ⇒ الافتراضيّة (تزويد الفروع). */
export function channelOf(doc) {
  return normalizeChannel(doc?.header?.channel ?? doc?.channel) || DEFAULT_CHANNEL;
}

/** أهذه القناة داخليّة (تزويدُ فرعٍ) أم خارجيّة (بيع)؟ */
export function isInternalChannel(channel) {
  return Boolean(DEMAND_CHANNELS[normalizeChannel(channel) || DEFAULT_CHANNEL]?.internal);
}

/**
 * الطلب المجمَّع **حسب القناة** — والقنوات كلّها تصبّ في محرّكٍ واحد
 * وتظلّ مميَّزة (سطر 414). وهو الوجه السابع عمليًّا، وإن لم يذكره
 * المستند ضمن الستّة: القناة بُعدٌ لا وجهُ تجميعٍ للفروع.
 */
export function byChannel(rows = []) {
  return consolidate(rows, 'channel').map((g) => ({
    ...g,
    label: DEMAND_CHANNELS[g.key]?.labelAr || g.label,
    internal: isInternalChannel(g.key),
  }));
}
