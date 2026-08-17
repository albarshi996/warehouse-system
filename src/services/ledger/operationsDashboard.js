/**
 * عقل لوحة القيادة التشغيلية — يجمع الدورة كلها في صورةٍ واحدة ومؤشرات وأداء.
 *
 * لا اختراع هنا، بل **تجميع**: كل مصدرٍ بُني واختُبر في جلساتٍ سابقة (الدفتر ·
 * المبيعات · النقل · التقارير)، وهذا الملف يلمّ شتاتها في ثلاث نتائج للإدارة:
 *   1. **المؤشرات (KPIs)** — نسبة التنفيذ · زمن دورة الطلب · دقّة المخزون ·
 *      دقّة التسليم. أرقامٌ تقيس الصحّة لا تصفها.
 *   2. **اللقطة (Snapshot)** — عدّادات لحظية موزَّعة على المبيعات والمخازن
 *      والنقل والمخزون والمالية.
 *   3. **الاستثناءات (Exceptions)** — ما هو غير طبيعيٍّ فقط: ما يحتاج تدخّلًا
 *      اليوم. لأن لوحةً تعرض كل شيء لا تُوجّه إلى شيء.
 *
 * خالصٌ عمدًا (بلا Firestore، والوقت يُمرَّر `nowMs` لا يُقرأ) — كي يُختبَر في
 * Node ويبقى حسابه ثابتًا.
 */
import { pendingOrders, outOfStockItems } from './salesReports.js';
import { pendingShipments, transferVariances } from './transferReports.js';
import { stuckBalances, locationLabel } from './locations.js';
import { availableQty } from './reservations.js';
import { toMillis, ageInState, isStale } from '../documents/inbox.js';
import { expiryStatus } from '../balances/balanceKey.js';
import { AUTO_PULL_MS, PULL_SCOPE_IDS, lastPullLabel, scopeOf } from '../odoo/pullRegistry.js';

const DAY = 86400000;

/** المستند مفتوحٌ ما لم يُنجَز أو يُرفض. */
function isOpen(d) {
  return Boolean(d) && !['done', 'rejected'].includes(d.state);
}

function ofType(docs, t) {
  return (docs || []).filter((d) => d?.type === t);
}

/* ═══════════════════ المؤشرات ═══════════════════ */

/**
 * يقصر المستندات على نافذةٍ زمنية (آخر `windowDays` يومًا) إن طُلبت.
 *
 * لماذا؟ المؤشرات تقيس **الأداء الحديث** لا التاريخ كلّه؛ وحسابها على «أحدث N
 * مستند» (حدّ العرض) يجعلها تنحرف صامتةً متى تجاوز الإجمالي ذلك الحدّ. النافذة
 * الزمنية تجعل الرقم صحيحًا ومستقرًّا مهما نما الحجم. المستند بلا تاريخ يُحتسب
 * (لا نُسقط ما نجهل تاريخه). بلا نافذة (الوضع الافتراضي) تُحسب على الكلّ.
 */
function withinWindow(docs, nowMs, windowDays) {
  if (nowMs == null || !(windowDays > 0)) return docs || [];
  const cutoff = nowMs - windowDays * DAY;
  return (docs || []).filter((d) => {
    const t = toMillis(d?.createdAt);
    return t == null || t >= cutoff;
  });
}

/**
 * المؤشرات الأربعة. كلٌّ يُعيد `null` إن غابت بياناته — فلا نلوّن نجاحًا مزيّفًا
 * من لا شيء. المقامُ ظاهرٌ في `basis` لتُقرأ الثقة في الرقم.
 *
 * `opts.windowDays` + `opts.nowMs` (اختياريّان): يقصران الحساب على آخر N يومًا.
 */
export function computeKpis(docs, opts = {}) {
  const scoped = withinWindow(docs, opts.nowMs, opts.windowDays);
  const sos = ofType(scoped, 'SO');

  // نسبة التنفيذ (Fill Rate) = المخصَّص ÷ المطلوب عبر الأوامر المحجوزة.
  let requested = 0;
  let allocated = 0;
  for (const so of sos) {
    if (!so.soReserved) continue;
    requested += (so.lines || []).reduce((s, l) => s + (Number(l?.qty) || 0), 0);
    allocated += (so.soAllocation || []).reduce((s, a) => s + (Number(a?.qty) || 0), 0);
  }
  const fillRate = requested > 0 ? allocated / requested : null;

  // زمن دورة الطلب = متوسط (تسليمٌ منجَز − إنشاء الأمر) بالأيام.
  const doneDN = ofType(scoped, 'DN').filter((d) => d.state === 'done');
  const cycles = [];
  for (const so of sos) {
    const dn = doneDN.find((d) => d?.links?.SO?.id === so.id);
    if (!dn) continue;
    const start = toMillis(so.createdAt);
    const end = toMillis(dn.postedAt) ?? toMillis(dn.updatedAt);
    if (start != null && end != null && end >= start) cycles.push((end - start) / DAY);
  }
  const cycleTimeDays = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;

  // دقّة المخزون = 1 − (مجموع فروق الجرد المطلقة ÷ الدفتري) من محاضر مصادَقة.
  let book = 0;
  let absVar = 0;
  let anyCount = false;
  for (const cc of ofType(scoped, 'CC').filter((d) => d.state === 'done')) {
    for (const l of cc.lines || []) {
      const b = Number(l?.bookQty) || 0;
      const c = Number(l?.count2 ?? l?.actualQty) || 0;
      if (b === 0 && c === 0) continue;
      book += b;
      absVar += Math.abs(c - b);
      anyCount = true;
    }
  }
  const inventoryAccuracy = anyCount ? (book > 0 ? Math.max(0, 1 - absVar / book) : 1) : null;

  // دقّة التسليم = المستلَم ÷ المشحون عبر استلامات النقل (نقطة التحقّق الوحيدة).
  let shipped = 0;
  let received = 0;
  for (const trc of ofType(scoped, 'TRC').filter((d) => d.state === 'done')) {
    for (const l of trc.lines || []) {
      shipped += Number(l?.qtyShipped) || 0;
      received += Number(l?.qtyReceived) || 0;
    }
  }
  const deliveryAccuracy = shipped > 0 ? Math.min(1, received / shipped) : null;

  return {
    fillRate,
    cycleTimeDays,
    inventoryAccuracy,
    deliveryAccuracy,
    basis: {
      requested,
      allocated,
      deliveries: cycles.length,
      countedBook: book,
      shipped,
      windowDays: opts.windowDays || null,
      scopedDocs: scoped.length,
    },
  };
}

/* ═══════════════════ اللقطة ═══════════════════ */

/** المتاح لكل صنفٍ عبر كل المواقع (الموجود ناقص المحجوز). */
function availableBySku(balances) {
  const map = new Map();
  for (const b of balances || []) {
    const k = String(b.sku || b.barcode || '').trim().toUpperCase();
    if (!k) continue;
    map.set(k, (map.get(k) || 0) + availableQty(b));
  }
  return map;
}

/**
 * لقطة العدّادات اللحظية موزَّعةً على أقسام العمل. `items` (ماستر الأصناف)
 * اختياريّ — بدونه يتعذّر حساب «تحت الحدّ الأدنى» و«المطلوب شراؤه».
 */
export function operationsSnapshot(docs, balances, items) {
  const openOf = (t) => ofType(docs, t).filter(isOpen).length;
  const pend = pendingOrders(docs);
  const short = outOfStockItems(docs);
  const ship = pendingShipments(docs);
  const varr = transferVariances(docs);
  const stuck = stuckBalances(balances);

  const avail = availableBySku(balances);
  let belowMin = 0;
  let toBuy = 0;
  for (const it of items || []) {
    const min = Number(it?.minStock) || 0;
    if (min <= 0) continue;
    const have = avail.get(String(it.sku || '').trim().toUpperCase()) || 0;
    if (have < min) {
      belowMin += 1;
      if (have <= 0) toBuy += 1;
    }
  }

  return {
    sales: { orders: ofType(docs, 'SO').length, pending: pend.pending, noStock: pend.noStock, pendingValue: pend.pendingValue },
    warehouse: {
      picking: openOf('PICK'),
      putaway: openOf('PUTAWAY'),
      transfers: openOf('TR') + openOf('TRN'),
      returns: openOf('RET'),
      adjustments: openOf('ADJ'),
    },
    transit: { inTransit: ship.inTransit, variances: varr.unresolved, value: ship.transitValue },
    inventory: { shortItems: short.itemCount, belowMin, toBuy, stuck: stuck.length, lostValue: short.totalLostValue },
    finance: { invoices: ofType(docs, 'INV').length, creditNotes: ofType(docs, 'CN').length, awaitingClose: ofType(docs, 'INV').filter(isOpen).length },
  };
}

/* ══════ التشغيليّ والمرجعيّ ‹EXE-503› — يسدّ ف ت‑١٢ ══════
 *
 * ═══ العطب ═══
 * اللوحة تعرض «١٢ صنفًا تحت الحدّ الأدنى» بلا أن تقول إنّ **الحدّ نفسه**
 * مستورَدٌ من أودو قبل أسبوع. فيُقرأ رقمٌ نصفُه لحظيٌّ ونصفُه قديمٌ كأنّه
 * لحظيٌّ كلّه — وهو أخطر من رقمٍ قديمٍ صريح، لأنّ صراحته تُفقده الثقة
 * فيُراجَع، وصمتَه يجعله يُصدَّق.
 *
 * ═══ فلا يُخلط طرفان في رقم ═══
 * كلّ عدّادٍ في اللقطة يُعلن أصله: **لحظيّ** من دفترنا · **مرجعيّ** مستورَد ·
 * أو **مركَّب** منهما. والمركَّب يحكمه أقدمُ طرفيه.
 *
 * وعدّادٌ يُضاف بلا أصلٍ معلَن **يكشفه الحارس** (`unmarkedCounters`) ولا
 * يُعرض صامتًا — نمط `unpolicedWorkTypes` وحارس `timeFields` نفسه.
 */

export const ORIGIN = Object.freeze({
  live: {
    id: 'live',
    label: 'لحظيّ',
    hint: 'من دفترنا — يتغيّر لحظةَ يُنجَز مستند',
  },
  reference: {
    id: 'reference',
    label: 'مرجعيّ',
    hint: 'مستورَدٌ من أودو — لا يتغيّر إلّا بسحبٍ جديد',
  },
  mixed: {
    id: 'mixed',
    label: 'مركَّب',
    hint: 'يقارن رصيدَنا اللحظيّ بحدٍّ مرجعيّ — وأقدمُ طرفيه يحكم صدقه',
  },
});

/**
 * أصل كلّ عدّادٍ في اللقطة، بمفاتيح `القسم.الحقل` نفسها التي يُخرجها
 * `operationsSnapshot` — فلا خريطةَ أسماءٍ ثانية تتباعد عنه.
 *
 * والمركَّبان هما الوحيدان: `belowMin` و`toBuy` يقارنان المتاح (من أرصدتنا)
 * بـ`minStock` (من ماستر الأصناف المستورَد). وما عداهما مبنيٌّ على مستنداتنا
 * وأرصدتنا وحدها.
 */
export const SNAPSHOT_ORIGIN = Object.freeze({
  'sales.orders': ORIGIN.live.id,
  'sales.pending': ORIGIN.live.id,
  'sales.noStock': ORIGIN.live.id,
  'sales.pendingValue': ORIGIN.live.id,
  'warehouse.picking': ORIGIN.live.id,
  'warehouse.putaway': ORIGIN.live.id,
  'warehouse.transfers': ORIGIN.live.id,
  'warehouse.returns': ORIGIN.live.id,
  'warehouse.adjustments': ORIGIN.live.id,
  'transit.inTransit': ORIGIN.live.id,
  'transit.variances': ORIGIN.live.id,
  'transit.value': ORIGIN.live.id,
  'inventory.shortItems': ORIGIN.live.id,
  'inventory.belowMin': ORIGIN.mixed.id,
  'inventory.toBuy': ORIGIN.mixed.id,
  'inventory.stuck': ORIGIN.live.id,
  'inventory.lostValue': ORIGIN.live.id,
  'finance.invoices': ORIGIN.live.id,
  'finance.creditNotes': ORIGIN.live.id,
  'finance.awaitingClose': ORIGIN.live.id,
});

/** أصل عدّادٍ بمساره، أو `null` — والفراغ يعني «غير معلَن» لا «لحظيّ». */
export function originOf(path) {
  return ORIGIN[SNAPSHOT_ORIGIN[path]] || null;
}

/** عدّاداتٌ في اللقطة بلا أصلٍ معلَن — الفراغُ هو السلامة (يحرسه الاختبار). */
export function unmarkedCounters(snapshot) {
  const out = [];
  for (const [section, group] of Object.entries(snapshot || {})) {
    if (!group || typeof group !== 'object') continue;
    for (const field of Object.keys(group)) {
      if (!SNAPSHOT_ORIGIN[`${section}.${field}`]) out.push(`${section}.${field}`);
    }
  }
  return out;
}

/** ثلاث دورات سحبٍ — تحتها المرجعيّ حديثٌ عمليًّا. */
export const REFERENCE_FRESH_MS = 3 * AUTO_PULL_MS;
/** يومٌ كامل — فوقه لا يُعرض المرجعيّ إلّا بتحذير. */
export const REFERENCE_STALE_MS = DAY;

/**
 * درجات قِدَم المرجعيّ. و«لم يُسحب قطّ» ليست «قديمًا»: الأولى تقول إنّ المرجع
 * **ليس أودو** (حدودٌ من استيراد Excel أو إدخالٍ محلّيّ)، والثانية تقول إنّه
 * أودو وقد تقادم.
 *
 * ★ ولذلك `never.warn === false`: منشأةٌ لم تربط أودو قطّ لا تستحقّ شريطًا
 * أحمر دائمًا. والأحمر الذي لا يزول يُهمَل، فيسقط معه الأحمر الصادق.
 * التحذير للمتقادم **الذي يُعرف أنّه يزحف**.
 */
export const FRESHNESS = Object.freeze({
  never: { id: 'never', label: 'لم يُسحب من أودو — المرجع محلّيّ', warn: false },
  fresh: { id: 'fresh', label: 'حديث', warn: false },
  aging: { id: 'aging', label: 'يتقادم', warn: false },
  stale: { id: 'stale', label: 'قديم — يحتاج سحبًا', warn: true },
});

export function freshnessLevel(ms, nowMs) {
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return FRESHNESS.never;
  const age = nowMs - ms;
  if (age <= REFERENCE_FRESH_MS) return FRESHNESS.fresh;
  if (age < REFERENCE_STALE_MS) return FRESHNESS.aging;
  return FRESHNESS.stale;
}

/**
 * ⚠️ الأصناف تهبط في **نموذجٍ قائم** (`Items_Master`) لا في مرآة — فلا سطرَ
 * لها في `odoo_pull_state`، وزمنُ سحبها في سجلّ أحداث المزامنة. خريطةٌ
 * صغيرةٌ معلنة أهونُ من قراءةٍ صامتة تُعيد «لم يُسحب قطّ» وقد سُحب.
 */
const EVENT_SOURCE_OF = Object.freeze({ items: 'item' });

/** أحدث زمن سحبٍ لنوع مصدرٍ في سجلّ الأحداث. */
function lastPullEventMs(events, sourceType) {
  let best = null;
  for (const e of events || []) {
    if (String(e?.kind) !== 'pull' || String(e?.sourceType) !== sourceType) continue;
    const ms = toMillis(e?.ts);
    if (ms != null && (best == null || ms > best)) best = ms;
  }
  return best;
}

/**
 * قِدَم كلّ مرجعٍ مستورَد — **بنصّه** لا بختمٍ خامّ.
 *
 * التسميات من `PULL_SCOPES` ونصُّ العمر من `lastPullLabel` — الاثنان مبنيّان
 * في `pullRegistry`؛ فمن كتب صيغة «قبل ٣ دقائق» ثانيةً هنا فتح باب صيغتين
 * لعمرٍ واحد.
 *
 * @param {object} sources `{ events, pullState }` — سجلّ أحداث المزامنة وحالة السحب
 * @param {number} nowMs   الوقت يُمرَّر ولا يُقرأ
 * @returns {{scopes:Array, master:object|null, level:object, label:string, warn:boolean, oldest:object|null}}
 */
export function referenceFreshness(sources = {}, nowMs) {
  const { events = [], pullState = [] } = sources;
  const byScope = new Map();
  for (const row of pullState || []) if (row?.scope) byScope.set(String(row.scope), row);

  const scopes = PULL_SCOPE_IDS.map((id) => {
    const scope = scopeOf(id);
    const row = byScope.get(id);
    const stateMs = toMillis(row?.lastPulledAt);
    const eventMs = EVENT_SOURCE_OF[id] ? lastPullEventMs(events, EVENT_SOURCE_OF[id]) : null;
    const ms = stateMs ?? eventMs ?? null;
    const level = freshnessLevel(ms, nowMs);
    return {
      id,
      label: scope?.labelAr || id,
      family: scope?.family || '',
      ms,
      ageLabel: lastPullLabel(ms, nowMs),
      level: level.id,
      warn: level.warn,
      count: Number(row?.lastCount) || 0,
      error: String(row?.lastError || '').trim(),
    };
  });

  // ماستر الأصناف هو المرجع الذي تعتمد عليه أرقام **هذه** اللوحة (المركَّبان).
  const master = scopes.find((s) => s.id === 'items') || null;
  const pulled = scopes.filter((s) => s.ms != null);
  const oldest = pulled.length ? pulled.reduce((a, b) => (a.ms <= b.ms ? a : b)) : null;
  const level = FRESHNESS[master?.level] || FRESHNESS.never;

  return {
    scopes,
    master,
    oldest,
    level,
    /** نصٌّ واحد يوضع بجانب الرقم المرجعيّ — لا ختمَ خامًّا يفكّه القارئ. */
    label: master ? `${master.label}: ${master.ageLabel}` : 'لا مرجعَ معلَن',
    warn: level.warn,
  };
}

/* ═══════════════════ الاستثناءات ═══════════════════ */

const SEV = { high: 3, med: 2, low: 1 };

/**
 * الاستثناءات — ما يحتاج تدخّلًا فقط، مرتّبًا بالخطورة. كلٌّ برابطٍ يقود إلى
 * موضع المعالجة. `nowMs` يُمرَّر (لا يُقرأ) فيبقى الحساب ثابتًا للاختبار.
 *
 * ═══ ‹EXE-202› ما تغيّر هنا وما لم يتغيّر ═══
 * لم يُكتب كاشفٌ ثانٍ بجانب هذا: الكاشفات الستّة كما هي، وما أُضيف حقلُ
 * **هويّة** لكلّ كشفٍ (`identity`) يحمل نوعه ومرجعه وصنفه وكمّيّته وسببه.
 * فمن أراد العرض قرأ ما كان يقرأ، ومن أراد **فتح سجلٍّ** وجد ما يكفيه —
 * والبصمة تُشتقّ من الهويّة في `exceptions.js` لا هنا، فيبقى هذا حسابًا خالصًا.
 */
export function operationExceptions(docs, balances, nowMs, items) {
  const ex = [];
  const add = (severity, category, title, detail, href, identity) =>
    ex.push({ severity, category, title, detail, href, identity: identity || null });

  // 1) مستندات بانتظار الاعتماد تأخّرت عن مهلتها.
  for (const d of (docs || []).filter((x) => x.state === 'submitted')) {
    if (isStale(d, nowMs)) {
      const age = ageInState(d, nowMs);
      add('high', 'approval', `${d.number || d.type} بانتظار الاعتماد`, `مضى ${age ?? '؟'} يومًا بلا بتّ`, `/dashboard/document?type=${d.type}&id=${d.id}`,
        { type: 'approval_stale', docRef: { type: d.type, number: d.number, id: d.id }, reason: `مضى ${age ?? '؟'} يومًا بلا بتّ` });
    }
  }

  // 2) شحنات نقلٍ في الطريق (غادرت ولم تُستلم) وفروقٌ غير مسوّاة.
  const ship = pendingShipments(docs);
  for (const r of ship.rows.filter((x) => x.status === 'in-transit')) {
    add('med', 'transit', `شحنة ${r.number || ''} في الطريق`, `${r.fromWarehouse} ← ${r.toWarehouse} · ${r.remaining} وحدة لم تُستلم`, `/dashboard/transfers`,
      { type: 'transit_variance', docRef: { type: 'TRN', number: r.number }, qty: r.remaining, location: r.toWarehouse, reason: `${r.remaining} وحدة لم تُستلم` });
  }
  const varr = transferVariances(docs);
  if (varr.unresolved > 0)
    add('high', 'transit', `${varr.unresolved} فرق نقلٍ غير مسوّى`, `نقصٌ إجماليّ ${varr.totalShortage} وحدة عالقة في مخزن النقل`, `/dashboard/transfers`,
      { type: 'transit_variance', docRef: { type: 'TRN', number: 'ALL' }, qty: varr.totalShortage, reason: 'فروق نقلٍ غير مسوّاة' });

  // 3) طلبات بيعٍ بلا رصيد.
  const pend = pendingOrders(docs);
  for (const r of pend.rows.filter((x) => x.status === 'no-stock')) {
    add('high', 'sales', `أمر بيع ${r.number || ''} بلا رصيد`, `${r.customer || ''} · ${r.shortfallCount} صنفًا غير متوفّر`, `/dashboard/order-control`,
      { type: 'no_stock', docRef: { type: 'SO', number: r.number }, qty: r.shortfallCount, reason: `${r.shortfallCount} صنفًا غير متوفّر` });
  }

  // 4) رصيدٌ عالقٌ في مواقع النظام التي يجب أن تفرغ.
  for (const s of stuckBalances(balances)) {
    add('med', 'inventory', `${s.sku || s.barcode} عالقٌ في ${locationLabel(s.warehouse)}`, s.hint, `/dashboard/stock-ledger`,
      { type: 'stuck_balance', sku: s.sku, barcode: s.barcode, qty: s.qty, location: s.warehouse, reason: s.hint });
  }

  // 5) أصنافٌ منتهية أو قريبة الانتهاء (على رصيدٍ موجب).
  let expired = 0;
  let near = 0;
  for (const b of balances || []) {
    if ((Number(b.qty) || 0) <= 0) continue;
    const st = expiryStatus(b.expiry, nowMs);
    if (st === 'expired') expired += 1;
    else if (st === 'near') near += 1;
  }
  if (expired > 0)
    add('high', 'inventory', `${expired} رصيدًا منتهي الصلاحية`, 'يجب سحبه وإتلافه — لا يُباع ولا يُنقل', `/dashboard/stock-ledger`,
      { type: 'expired', qty: expired, reason: 'رصيدٌ منتهي الصلاحية على رصيدٍ موجب' });
  if (near > 0)
    add('med', 'inventory', `${near} رصيدًا قريب الانتهاء`, 'خلال 30 يومًا — قدّمه في الصرف (FEFO)', `/dashboard/stock-ledger`,
      { type: 'near_expiry', qty: near, reason: 'صلاحيةٌ تنتهي خلال 30 يومًا' });

  // 6) أصنافٌ تحت الحدّ الأدنى (يحتاج ماستر الأصناف).
  if (items?.length) {
    const avail = availableBySku(balances);
    const below = items.filter((it) => {
      const min = Number(it?.minStock) || 0;
      return min > 0 && (avail.get(String(it.sku || '').trim().toUpperCase()) || 0) < min;
    });
    if (below.length)
      add('med', 'inventory', `${below.length} صنفًا تحت الحدّ الأدنى`, 'راجع تقرير الأصناف المطلوب شراؤها', `/dashboard/order-control`,
        { type: 'below_min', qty: below.length, reason: `${below.length} صنفًا تحت الحدّ الأدنى` });
  }

  ex.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  return ex;
}
