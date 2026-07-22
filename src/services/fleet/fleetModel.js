/**
 * منطق عمليات الأسطول الخالص — سلاسل الإمداد (المرجع التشغيلي م-٢).
 *
 * لا شبكة ولا Firebase هنا: آلة حالات الرحلة، بروتوكول الاستلام والتسليم
 * اليومي، رياضيات الوقود، مناطق التوزيع، ومؤشرات الأداء — كلها دوال خالصة
 * تُختبر وحدها (نمط `inspectionModel.js`).
 *
 * دورة الرحلة (Dispatch-to-POD) كما في المرجع:
 *   قيد التحضير → تصريح البوابة → في الطريق → POD (سُلّمت) → مقفلة
 *   (والإلغاء متاح من التحضير فقط — بعد إصدار التصريح لا رجعة إلا بإقفال موثق)
 */

/** حالات الرحلة بالترتيب الرسمي. */
export const TRIP_STATES = {
  preparing: { id: 'preparing', label: 'قيد التحضير', emoji: '📋', color: '#64748b' },
  gatepass: { id: 'gatepass', label: 'تصريح بوابة', emoji: '🎫', color: '#d97706' },
  enroute: { id: 'enroute', label: 'في الطريق', emoji: '🚚', color: '#0ea5e9' },
  delivered: { id: 'delivered', label: 'سُلّمت (POD)', emoji: '📱', color: '#10b981' },
  closed: { id: 'closed', label: 'مقفلة', emoji: '🔒', color: '#334155' },
  cancelled: { id: 'cancelled', label: 'ملغاة', emoji: '⛔', color: '#ef4444' },
};

/** الانتقالات المسموحة — لا طريق سواها. */
export const TRIP_TRANSITIONS = {
  preparing: ['gatepass', 'cancelled'],
  gatepass: ['enroute'],
  enroute: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
};

/** هل هذا الانتقال مشروع؟ */
export function canTransitionTrip(from, to) {
  return (TRIP_TRANSITIONS[from] || []).includes(to);
}

/** الرحلات الحيّة (تشغل مركبة وسائقًا الآن). */
export const ACTIVE_TRIP_STATES = ['gatepass', 'enroute'];

/**
 * مناطق التوزيع الديموغرافية (بنغازي) — جدول ٢-٤ في المرجع حرفيًّا.
 */
export const ZONES = [
  {
    id: 'A',
    label: 'المناطق A — استهلاك مرتفع',
    freq: 'يومي / يوم بديل',
    vehicle: 'شاحنة مبردة كبيرة',
    examples: 'هايبر ماركت، سلاسل كبرى',
    color: '#ef4444',
  },
  {
    id: 'B',
    label: 'المناطق B — متوسط',
    freq: 'مرتين أسبوعياً',
    vehicle: 'شاحنة متوسطة',
    examples: 'سوبر ماركت، محلات متوسطة',
    color: '#f59e0b',
  },
  {
    id: 'C',
    label: 'المناطق C — تجزئة',
    freq: 'مرة أسبوعياً',
    vehicle: 'فان / شاحنة صغيرة',
    examples: 'محلات التجزئة الصغيرة',
    color: '#10b981',
  },
];

export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || null;
}

/* ══════════════ بروتوكول الاستلام والتسليم اليومي (٢-٢) ══════════════ */

/**
 * بنود الفحص اليومي بين الورديات — القاعدة: لا تصريح بوابة بلا نموذج مكتمل.
 * `type`: check (سليم/ملاحظة) · temp (قراءة حرارة) · odo (قراءة عداد) ·
 * fuel (مستوى الوقود بالأرباع).
 */
export const HANDOVER_ITEMS = [
  { id: 'cooling', label: 'وحدة التبريد (2°م–4°م للمبردات)', icon: '🌡️', type: 'temp', coldOnly: true },
  { id: 'body', label: 'الهيكل الخارجي (توثيق الخدوش قبل التسلُّم)', icon: '🚗', type: 'check' },
  { id: 'odometer', label: 'قراءة العداد (كم)', icon: '⏱️', type: 'odo' },
  { id: 'fuel', label: 'مستوى الوقود', icon: '⛽', type: 'fuel' },
  { id: 'lights', label: 'الأضواء والإشارات', icon: '💡', type: 'check' },
  { id: 'tires', label: 'الإطارات والضغط', icon: '🔧', type: 'check' },
];

/** مستويات الوقود — يُحظر التسليم بأقل من ربع خزان. */
export const FUEL_LEVELS = [
  { id: 'full', label: 'ممتلئ', fraction: 1 },
  { id: 'three_q', label: '¾ خزان', fraction: 0.75 },
  { id: 'half', label: '½ خزان', fraction: 0.5 },
  { id: 'quarter', label: '¼ خزان', fraction: 0.25 },
  { id: 'below_q', label: 'أقل من الربع', fraction: 0.1 },
];

/** الورديات المعتمدة. */
export const SHIFTS = ['صباحية', 'مسائية'];

/** نموذج تسليم فارغ ليوم ووردية. */
export function emptyHandover(date, shift) {
  const items = {};
  for (const it of HANDOVER_ITEMS) items[it.id] = { status: '', notes: '' };
  return {
    date: date || '',
    shift: shift || SHIFTS[0],
    refrigerated: false,
    tempReading: '',
    odometer: '',
    fuelLevel: '',
    items,
    fromDriver: '',
    toDriver: '',
    notes: '',
  };
}

/**
 * حكم البروتوكول: هل النموذج مكتمل ويُجيز إصدار تصريح البوابة؟
 * يُعيد { ok, problems[] } — كل مشكلة نصّ عربي يُعرض للسائق كما هو.
 */
export function handoverVerdict(handover) {
  const problems = [];
  const h = handover || {};

  if (!h.date) problems.push('تاريخ التسليم مطلوب');
  if (!h.fromDriver || !h.toDriver) problems.push('اسما المُسلِّم والمُستلِم مطلوبان');
  if (!h.odometer || Number(h.odometer) <= 0) problems.push('قراءة العداد مطلوبة');

  const fuel = FUEL_LEVELS.find((f) => f.id === h.fuelLevel);
  if (!fuel) problems.push('مستوى الوقود مطلوب');
  else if (fuel.fraction < 0.25) problems.push('يُحظر تسليم المركبة بأقل من ربع خزان — زوّد الوقود أولًا');

  if (h.refrigerated) {
    const t = Number(h.tempReading);
    if (h.tempReading === '' || Number.isNaN(t)) problems.push('قراءة حرارة وحدة التبريد مطلوبة للمبردات');
    else if (t < 2 || t > 4) problems.push(`حرارة التبريد ${t}°م خارج النطاق المطلوب (2°م–4°م)`);
  }

  for (const it of HANDOVER_ITEMS) {
    if (it.type !== 'check') continue;
    const entry = (h.items || {})[it.id];
    if (!entry || !entry.status) problems.push(`بند «${it.label}» لم يُفحص`);
    else if (entry.status === 'ملاحظة' && !entry.notes) problems.push(`بند «${it.label}» عليه ملاحظة بلا وصف`);
  }

  return { ok: problems.length === 0, problems };
}

/** معرّف مستند التسليم حتميّ (تاريخ + وردية) ⇒ إعادة الحفظ تُحدّث لا تكرّر. */
export function handoverDocId(handover) {
  const date = String(handover?.date || '').trim();
  const shift = String(handover?.shift || '').trim();
  if (!date || !shift) return null;
  return `${date}__${shift}`;
}

/* ══════════════ سجل الوقود والتكاليف (٢-٥) ══════════════ */

/** نسبة الانحراف التي تُطلق التنبيه (٢-٥: أكثر من 15%). */
export const FUEL_ANOMALY_TOLERANCE = 0.15;

/**
 * حساب قيد وقود: المسافة، كم/لتر، تكلفة الكيلومتر.
 * يُعيد null إن كانت المدخلات غير قابلة للحساب.
 */
export function fuelStats({ odoBefore, odoAfter, liters, cost }) {
  const before = Number(odoBefore);
  const after = Number(odoAfter);
  const l = Number(liters);
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  const distanceKm = after - before;
  const kmPerLiter = Number.isFinite(l) && l > 0 ? distanceKm / l : null;
  const c = Number(cost);
  const costPerKm = Number.isFinite(c) && c > 0 ? c / distanceKm : null;
  return { distanceKm, kmPerLiter, costPerKm };
}

/**
 * كشف الاستهلاك غير الطبيعي: كم/لتر الفعلي أقل من القياسي بأكثر من 15%.
 * baseline = متوسط استهلاك المركبة القياسي (كم/لتر) من بطاقتها.
 */
export function fuelAnomaly(kmPerLiter, baselineKmPerLiter, tolerance = FUEL_ANOMALY_TOLERANCE) {
  const actual = Number(kmPerLiter);
  const base = Number(baselineKmPerLiter);
  if (!Number.isFinite(actual) || !Number.isFinite(base) || base <= 0 || actual <= 0) {
    return { anomalous: false, deviation: null };
  }
  // الانحراف موجب = استهلاك أسوأ من القياسي (قطع كيلومترات أقل لكل لتر).
  const deviation = (base - actual) / base;
  return { anomalous: deviation > tolerance, deviation };
}

/* ══════════════ مؤشرات الأداء (م-٤) ══════════════ */

/** لقطة الأسطول الفوري: كم رحلة في كل حالة. */
export function tripSnapshot(trips) {
  const snap = { total: 0, preparing: 0, gatepass: 0, enroute: 0, delivered: 0, closed: 0, cancelled: 0 };
  for (const t of trips || []) {
    if (!TRIP_STATES[t.state]) continue;
    snap.total += 1;
    snap[t.state] += 1;
  }
  return snap;
}

/**
 * نسبة POD: الرحلات المنتهية (سُلّمت أو أُقفلت) الموثّقة بتوقيع إلكتروني.
 * هدف المرجع: 100% — صفر تسليم بلا POD.
 */
export function podRate(trips) {
  const finished = (trips || []).filter((t) => t.state === 'delivered' || t.state === 'closed');
  if (finished.length === 0) return null;
  const withPod = finished.filter((t) => t.pod && (t.pod.receiverName || t.pod.signature));
  return withPod.length / finished.length;
}

/**
 * OTIF تقريبي: من الرحلات المنتهية، كم سُلّم في تاريخه المخطط أو قبله؟
 * (القياس الكامل بالكميات يأتي مع ربط أوامر التسليم ببنود المستندات.)
 */
export function otifRate(trips) {
  const finished = (trips || []).filter(
    (t) => (t.state === 'delivered' || t.state === 'closed') && t.plannedDate && t.deliveredDate
  );
  if (finished.length === 0) return null;
  const onTime = finished.filter((t) => t.deliveredDate <= t.plannedDate);
  return onTime.length / finished.length;
}

/** إجماليات الوقود عبر قيود متعددة: لترات · تكلفة · مسافة · متوسط كم/لتر. */
export function fuelTotals(entries) {
  const sum = { liters: 0, cost: 0, distanceKm: 0, anomalies: 0 };
  for (const e of entries || []) {
    sum.liters += Number(e.liters) || 0;
    sum.cost += Number(e.cost) || 0;
    sum.distanceKm += Number(e.distanceKm) || 0;
    if (e.anomalous) sum.anomalies += 1;
  }
  sum.kmPerLiter = sum.liters > 0 && sum.distanceKm > 0 ? sum.distanceKm / sum.liters : null;
  sum.costPerKm = sum.distanceKm > 0 && sum.cost > 0 ? sum.cost / sum.distanceKm : null;
  return sum;
}
