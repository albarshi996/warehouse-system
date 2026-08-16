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
