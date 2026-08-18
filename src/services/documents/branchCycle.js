/**
 * دورة طلب الفرع التسع ‹FNB-401› — منطق خالص بلا Firebase وبلا DOM.
 *
 * ═══ الدورة كما نصّ عليها المستند (أسطر 626–644) ═══
 * طلب فرع → مراجعة → اعتماد → حجز مخزون → سحب → **فحص** → **تعبئة** →
 * **شحن** → استلام الفرع → إغلاق.
 *
 * ═══ ما كان ناقصًا ═══
 * سبعٌ من التسع مبنيّةٌ ومتّصلة. والناقص اثنتان:
 *   ① **الفحص بين السحب والتعبئة** — كان `derivationTargets('QC')` وجهتاه
 *      التخزينُ وإشعارُ الرفض فقط، فلا سبيل من الجودة إلى التعبئة. سُدَّ في
 *      `chain.js` بتفرّع السحب (تعبئةٌ مباشرة أو فحصٌ قبلها) وبوجهةٍ ثالثة
 *      للجودة، مع `derivationTargetsFor` كي لا يُخلط فحصُ الوارد بالصادر.
 *   ② **الإغلاق حالةً ختاميّة** — الدورة كانت تنتهي عند الاستلام، فيبقى
 *      الطلب مفتوحًا إلى الأبد ويبقى معه **الحجز**. وهنا حكم الإغلاق.
 *
 * ═══ القاعدة الحاكمة في الإغلاق ═══
 * **لا يُغلق طلبٌ وله فرقٌ غير مسوّى.** إغلاقٌ فوق فرقٍ يُخفي نقصًا حقيقيًّا
 * في مخزون الفرع، ويجعل الرصيد يقول ما ليس في الرفّ. والفرق يُسوَّى بمستندٍ
 * (تسوية · إرجاع · تالف) أو يُبرَّر بسببٍ مقيَّد — ثمّ يُغلق.
 */
import { REASON_CONTEXTS } from './reasonCodes.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n) => Math.round((Number(n) || 0) * 1e3) / 1e3;

/**
 * المراحل التسع بمستنداتها **المبنيّة فعلًا**.
 * `docType: null` تعني مرحلةً حالتُها على المستند لا مستندًا مستقلًّا —
 * فلا يُخترع مستندٌ لكلّ خطوةٍ في نصٍّ إداريّ.
 */
export const BRANCH_CYCLE_STAGES = Object.freeze([
  { id: 'request', label: 'طلب الفرع', docType: 'TR', state: 'draft', share: 5 },
  { id: 'review', label: 'مراجعة', docType: 'TR', state: 'submitted', share: 5 },
  { id: 'approve', label: 'اعتماد', docType: 'TR', state: 'approved', share: 10 },
  { id: 'reserve', label: 'حجز مخزون', docType: null, share: 10, note: 'الحجز أثرٌ لا مستند — `ledger/reservations.js`' },
  { id: 'pick', label: 'سحب', docType: 'PICK', state: 'done', share: 25 },
  { id: 'inspect', label: 'فحص', docType: 'QC', state: 'done', share: 10, optional: true },
  { id: 'pack', label: 'تعبئة', docType: 'PACK', state: 'done', share: 10 },
  { id: 'ship', label: 'شحن', docType: 'TRN', state: 'done', share: 15 },
  { id: 'receive', label: 'استلام الفرع', docType: 'TRC', state: 'done', share: 10 },
]);

/** حالة الإغلاق — ختامٌ لا مرحلةَ عملٍ، فليست في المراحل التسع. */
export const CYCLE_CLOSED = 'closed';

/** مرحلةٌ بمعرّفها. */
export function stageOf(id) {
  return BRANCH_CYCLE_STAGES.find((s) => s.id === id) || null;
}

/**
 * موضع الدورة من مستنداتها ‹FNB-401›.
 *
 * @param {object[]} docs مستندات الدورة (TR وأحفاده)
 * @param {{closed?:boolean}} [opts]
 * @returns {{stage, label, pct, reached:string[], missing:string[], closed:boolean}}
 */
export function cycleProgress(docs = [], { closed = false } = {}) {
  const byType = new Map();
  for (const d of Array.isArray(docs) ? docs : []) {
    const t = up(d?.type);
    if (!t) continue;
    const list = byType.get(t) || [];
    list.push(d);
    byType.set(t, list);
  }

  const reached = [];
  for (const stage of BRANCH_CYCLE_STAGES) {
    if (!stage.docType) continue; // الحجز يُقاس من أثره لا من مستند.
    const hit = (byType.get(stage.docType) || []).some((d) =>
      stage.state === 'draft' ? true : reachedState(d?.state, stage.state)
    );
    if (hit) reached.push(stage.id);
  }
  // الحجز يُستنتج: ما دام اعتُمد الطلب فالحجز واقعٌ (عقد `reservationDeltas`).
  if (reached.includes('approve')) reached.push('reserve');

  const ordered = BRANCH_CYCLE_STAGES.filter((s) => reached.includes(s.id));
  const last = ordered[ordered.length - 1] || null;
  // النسبة بحصص المراحل المبلوغة — والاختياريّ لا يُنقص نصيبَ غيره.
  const pct = Math.min(100, ordered.reduce((s, st) => s + num(st.share), 0));

  return {
    stage: closed ? CYCLE_CLOSED : last?.id || '',
    label: closed ? 'مُغلق' : last?.label || 'لم يبدأ',
    pct: closed ? 100 : pct,
    reached,
    missing: BRANCH_CYCLE_STAGES.filter((s) => !reached.includes(s.id) && !s.optional).map((s) => s.id),
    closed: Boolean(closed),
  };
}

/** أبلغت حالةُ المستند الحالةَ المطلوبة أو تجاوزتها؟ */
function reachedState(actual, wanted) {
  const rank = { draft: 0, submitted: 1, approved: 2, done: 3, cancelled: -1, rejected: -1 };
  const a = rank[str(actual)] ?? -1;
  const w = rank[str(wanted)] ?? 0;
  return a >= w && a >= 0;
}

/**
 * فرق الاستلام بين ما شُحن وما استُلم — مادّةُ حكم الإغلاق.
 * @param {object[]} shipped بنود الشحن (TRN)
 * @param {object[]} received بنود الاستلام (TRC)
 */
export function receiptVariance(shipped = [], received = []) {
  const sum = (lines, field) => {
    const m = new Map();
    for (const l of Array.isArray(lines) ? lines : []) {
      const sku = up(l?.sku);
      if (!sku) continue;
      m.set(sku, round3((m.get(sku) || 0) + num(l?.[field] ?? l?.qty)));
    }
    return m;
  };
  const out = sum(shipped, 'qtyShipped');
  const inn = sum(received, 'qtyReceived');
  const rows = [];
  for (const sku of new Set([...out.keys(), ...inn.keys()])) {
    const s = out.get(sku) || 0;
    const r = inn.get(sku) || 0;
    if (round3(s - r) === 0) continue;
    rows.push({ sku, shipped: s, received: r, variance: round3(r - s) });
  }
  return rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}

/**
 * ★ حكم الإغلاق ‹FNB-401› — **لا يُغلق طلبٌ وله فرقٌ غير مسوّى**.
 *
 * والتسوية أحد ثلاثة: مستندُ تسويةٍ أو إرجاعٍ أو تالفٍ يغطّي الفرق، أو سببٌ
 * مقيَّد مكتوب. وبلا أحدهما يُرفض الإغلاق **بسببٍ يقول الصواب** لا برسالةٍ
 * عامّة.
 *
 * @param {object} cycle نتيجة `cycleProgress`
 * @param {object} ctx `{variance, settledBy, reason}`
 * @returns {{ok:boolean, problems:string[]}}
 */
export function closureVerdict(cycle, { variance = [], settledBy = [], reason = '' } = {}) {
  const problems = [];

  if (cycle?.closed) problems.push('الطلب مُغلقٌ سلفًا — والمغلَق لا يُغلق مرّتين.');
  if (!(cycle?.reached || []).includes('receive')) {
    problems.push('لا إغلاق قبل استلام الفرع — الدورة تُختم بوصول البضاعة لا بإصدار المستند.');
  }

  const open = (Array.isArray(variance) ? variance : []).filter((v) => num(v?.variance) !== 0);
  if (open.length) {
    const settledSkus = new Set(
      (Array.isArray(settledBy) ? settledBy : [])
        .flatMap((d) => (d?.lines || []).map((l) => up(l?.sku)))
        .filter(Boolean)
    );
    const unsettled = open.filter((v) => !settledSkus.has(up(v.sku)));
    if (unsettled.length && !str(reason)) {
      problems.push(
        `فرقٌ غير مسوًّى في ${unsettled.length} صنفًا (${unsettled.slice(0, 3).map((v) => v.sku).join(' · ')}` +
          `${unsettled.length > 3 ? ' …' : ''}) — سوِّه بمستندٍ أو اكتب سببه، فإغلاقٌ فوق فرقٍ يُخفي نقصًا في مخزون الفرع.`
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * أثر الإغلاق على الحجز ‹FNB-401›: **لا رصيدَ محجوزٌ إلى الأبد**.
 * الإغلاق أو الإلغاء يحرّر ما تبقّى محجوزًا — ومن أغلق ولم يحرّر جعل
 * المتاح أقلّ من الواقع بلا سببٍ يُرى.
 *
 * @returns {object[]} سطور تحرير `{sku, warehouse, qty}` — سالبةً للحجز.
 */
export function releaseOnClose(reservations = [], { branch = '' } = {}) {
  const wh = up(branch);
  return (Array.isArray(reservations) ? reservations : [])
    .filter((r) => num(r?.qty) > 0 && (!wh || up(r?.warehouse) === wh))
    .map((r) => ({ sku: up(r.sku), warehouse: up(r.warehouse), qty: -round3(num(r.qty)) }));
}

/** سياق سبب الفرق — من سجلّ الأسباب القائم لا قائمةٌ ثانية. */
export const VARIANCE_REASON_CONTEXT = 'receipt_variance';

/** حارسٌ للتوثيق: السياق المستعمَل معرَّفٌ في السجلّ القائم. */
export function varianceReasonContextExists() {
  return Boolean(REASON_CONTEXTS[VARIANCE_REASON_CONTEXT]);
}
