/**
 * منطق الصيانة الخالص — المرجع التشغيلي م-٣ (Odoo Maintenance).
 *
 * تصنيف الأصول الخمسة، أنواع الصيانة الأربعة، دورة أمر الشغل الكاملة،
 * استحقاق الصيانة الوقائية (بالتاريخ وبالكيلومترات)، وMTTR — دوال خالصة
 * بلا شبكة تُختبر وحدها.
 */

/** فئات الأصول — جدول ٣-١ حرفيًّا (الدورة الافتراضية بالأيام تقريب عملي). */
export const ASSET_CATEGORIES = {
  handling: {
    id: 'handling',
    label: 'معدات المناولة',
    emoji: '🏗️',
    examples: 'رافعات شوكية، عربات بليت يدوية، عربات كهربائية',
    pmRule: 'كل 500 ساعة عمل',
    defaultPmDays: 90,
    responsible: 'مشرف الصيانة',
  },
  vehicle: {
    id: 'vehicle',
    label: 'مركبات الأسطول',
    emoji: '🚛',
    examples: 'شاحنات مبرّدة، شاحنات جافة، فانات توزيع',
    pmRule: 'كل 5,000 كم أو 3 أشهر',
    defaultPmDays: 90,
    defaultPmKm: 5000,
    responsible: 'مدير الأسطول',
  },
  cooling: {
    id: 'cooling',
    label: 'غرف التبريد',
    emoji: '❄️',
    examples: 'غرف تبريد CCP-2، ثلاجات الحجر الصحي، أنظمة المكثّف',
    pmRule: 'كل 6 أشهر + فحص أسبوعي',
    defaultPmDays: 180,
    responsible: 'فني الصيانة + الجودة',
    tempRange: '2°م — 4°م',
  },
  facility: {
    id: 'facility',
    label: 'المرافق والبنية التحتية',
    emoji: '⚡',
    examples: 'مولدات احتياطية، أبواب الأرصفة، الإضاءة الطارئة',
    pmRule: 'شهري',
    defaultPmDays: 30,
    responsible: 'مدير العمليات',
  },
  device: {
    id: 'device',
    label: 'أجهزة التشغيل',
    emoji: '📱',
    examples: 'أجهزة مسح باركود (PDA)، طابعات ملصقات، أجهزة وزن',
    pmRule: 'فحص فصلي',
    defaultPmDays: 90,
    responsible: 'مسؤول IT',
  },
};

/** أنواع الصيانة الأربعة — ٣-٢. */
export const MAINTENANCE_TYPES = {
  preventive: { id: 'preventive', label: 'وقائية', emoji: '🛡️', color: '#0ea5e9' },
  corrective: { id: 'corrective', label: 'علاجية', emoji: '🔧', color: '#f59e0b' },
  predictive: { id: 'predictive', label: 'تنبؤية', emoji: '🔍', color: '#8b5cf6' },
  replacement: { id: 'replacement', label: 'استبدال', emoji: '📦', color: '#10b981' },
};

/** أولويات أمر الشغل — العالي الخطورة يوقف الأصل فورًا (٣-٢). */
export const WO_PRIORITIES = {
  high: { id: 'high', label: 'عالي الخطورة', color: '#ef4444', stopsAsset: true },
  medium: { id: 'medium', label: 'متوسط', color: '#f59e0b', stopsAsset: false },
  low: { id: 'low', label: 'منخفض', color: '#10b981', stopsAsset: false },
};

/** دورة أمر الشغل — ٣-٣ حرفيًّا. */
export const WO_STATES = {
  draft: { id: 'draft', label: 'مسودة الطلب', emoji: '📝', color: '#64748b' },
  confirmed: { id: 'confirmed', label: 'اعتماد المشرف', emoji: '⏳', color: '#d97706' },
  in_progress: { id: 'in_progress', label: 'جاري الإصلاح', emoji: '🔧', color: '#0ea5e9' },
  repaired: { id: 'repaired', label: 'تم الإصلاح', emoji: '✅', color: '#10b981' },
  back_in_service: { id: 'back_in_service', label: 'عودة للخدمة', emoji: '🟢', color: '#059669' },
  scrapped: { id: 'scrapped', label: 'تكهين الأصل', emoji: '🗑️', color: '#991b1b' },
};

/** الانتقالات المشروعة — التكهين متاح من أي حالة نشطة (استحالة الإصلاح). */
export const WO_TRANSITIONS = {
  draft: ['confirmed'],
  confirmed: ['in_progress', 'scrapped'],
  in_progress: ['repaired', 'scrapped'],
  repaired: ['back_in_service', 'scrapped'],
  back_in_service: [],
  scrapped: [],
};

export function canTransitionWO(from, to) {
  return (WO_TRANSITIONS[from] || []).includes(to);
}

/** أوامر الشغل المفتوحة (تشغل الأصل أو تنتظره). */
export const OPEN_WO_STATES = ['draft', 'confirmed', 'in_progress', 'repaired'];

/* ══════════════ استحقاق الصيانة الوقائية ══════════════ */

/** كم يومًا قبل الاستحقاق يبدأ التحذير (تنبيه أودو: 7 أيام). */
export const PM_WARN_DAYS = 7;

/**
 * حالة استحقاق الصيانة الوقائية لأصل:
 *   'overdue'  متأخرة · 'due'  خلال أسبوع · 'ok'  في المدى · 'none'  لا جدولة.
 * تجمع بين الاستحقاق بالتاريخ (nextPmDate) وبالكيلومترات (nextPmKm مقابل
 * currentKm) — أيّهما أسبق يحكم.
 */
export function pmStatus(asset, todayIso) {
  const a = asset || {};
  const today = String(todayIso || '').slice(0, 10);
  let byDate = 'none';
  let daysLeft = null;
  if (a.nextPmDate && today) {
    const diffMs = new Date(a.nextPmDate) - new Date(today);
    daysLeft = Math.round(diffMs / 86400000);
    byDate = daysLeft < 0 ? 'overdue' : daysLeft <= PM_WARN_DAYS ? 'due' : 'ok';
  }
  let byKm = 'none';
  let kmLeft = null;
  const nextKm = Number(a.nextPmKm);
  const curKm = Number(a.currentKm);
  if (Number.isFinite(nextKm) && nextKm > 0 && Number.isFinite(curKm) && curKm > 0) {
    kmLeft = nextKm - curKm;
    byKm = kmLeft < 0 ? 'overdue' : kmLeft <= 500 ? 'due' : 'ok';
  }
  const rank = { overdue: 3, due: 2, ok: 1, none: 0 };
  const status = rank[byDate] >= rank[byKm] ? byDate : byKm;
  return { status, daysLeft, kmLeft };
}

/* ══════════════ مؤشرات الصيانة (م-٤ تقرير ٦) ══════════════ */

/**
 * متوسط وقت الإصلاح MTTR بالساعات — للأوامر التي لها لحظتا اعتماد وإصلاح.
 * timestamps مليّة (ms) تُخزَّن على المستند عند كل انتقال.
 */
export function mttrHours(workOrders) {
  const done = (workOrders || []).filter((w) => {
    const c = Number(w.confirmedAtMs);
    const r = Number(w.repairedAtMs);
    return Number.isFinite(c) && Number.isFinite(r) && r > c;
  });
  if (done.length === 0) return null;
  const totalMs = done.reduce((s, w) => s + (Number(w.repairedAtMs) - Number(w.confirmedAtMs)), 0);
  return totalMs / done.length / 3600000;
}

/** لقطة أوامر الشغل: حسب الحالة + المفتوح العالي الخطورة + تكاليف القطع. */
export function woSnapshot(workOrders) {
  const snap = { total: 0, open: 0, highOpen: 0, partsCost: 0 };
  for (const s of Object.keys(WO_STATES)) snap[s] = 0;
  for (const w of workOrders || []) {
    if (!WO_STATES[w.state]) continue;
    snap.total += 1;
    snap[w.state] += 1;
    if (OPEN_WO_STATES.includes(w.state)) {
      snap.open += 1;
      if (w.priority === 'high') snap.highOpen += 1;
    }
    snap.partsCost += Number(w.partsCost) || 0;
  }
  return snap;
}
