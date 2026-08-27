/**
 * مؤشّرات أداء التنفيذ الميدانيّ — تُحسب من الأحداث المختومة بالوقت.
 *
 * ═══ القاعدة الحاكمة ═══
 * **كلّ مؤشّرٍ يفصح عن مصدره — ولا رقمَ بلا أصل.** فمديرٌ يرى «دقّة التحضير
 * ٩٤٪» ولا يعرف من أين جاءت لا يستطيع أن يحسّنها ولا أن يصدّقها.
 *
 * ولذلك كلّ دالّةٍ هنا تعيد `{value, basis, sample}`: القيمة، وممّ حُسبت،
 * وعلى كم عيّنة. ومؤشّرٌ على ثلاث حالاتٍ يُقال إنّه على ثلاث — فلا يُبنى
 * عليه قرارٌ كأنّه على ثلاثمئة.
 */

const ms = (a, b) => {
  const t1 = Date.parse(a ?? '');
  const t2 = Date.parse(b ?? '');
  return Number.isNaN(t1) || Number.isNaN(t2) ? null : Math.max(0, t2 - t1);
};

const avg = (list) => (list.length === 0 ? null : list.reduce((s, v) => s + v, 0) / list.length);

/** قالبُ المؤشّر — قيمةٌ وأصلٌ وحجمُ عيّنة. */
function kpi(value, basis, sample) {
  return { value, basis, sample, reliable: sample >= 10 };
}

/**
 * ★ زمنُ الاستلام: من فتح الجلسة إلى اعتماد آخر طبلية.
 * (خطة ٧ الثالث عشر: «زمن استلام أمر الشراء».)
 */
export function receivingCycleMs(sessions) {
  const spans = [];
  for (const s of sessions ?? []) {
    const end = s?.closedAt || (s?.drafts ?? []).map((d) => d.decidedAt).filter(Boolean).sort().pop();
    const span = ms(s?.openedAt, end);
    if (span !== null) spans.push(span);
  }
  return kpi(avg(spans), 'من فتح جلسة الاستلام إلى آخر قرار حوكمة', spans.length);
}

/**
 * ★★ الوقت بين الاستلام والتخزين — «كم بقيت البضاعة في ساحة الاستلام».
 * مؤشّرٌ عمليٌّ لا شكليّ: طبليةٌ تبقى يومين في الساحة تُداس وتضيع.
 */
export function receiptToStorageMs(units, eventsByLpn) {
  const spans = [];
  for (const u of units ?? []) {
    const evs = eventsByLpn?.[u.code] ?? [];
    const approved = evs.find((e) => e.type === 'APPROVED')?.at;
    const stored = evs.filter((e) => e.type === 'MOVED').map((e) => e.at).sort()[0];
    const span = ms(approved, stored);
    if (span !== null) spans.push(span);
  }
  return kpi(avg(spans), 'من اعتماد الحوكمة إلى أوّل انتقال موقع', spans.length);
}

/** مدّةُ بقاء الطبالي في منطقة التجهيز (خطة ٧). */
export function stagingDwellMs(units, eventsByLpn) {
  const spans = [];
  for (const u of units ?? []) {
    const evs = eventsByLpn?.[u.code] ?? [];
    const staged = evs.find((e) => e.details?.toStage === 'STAGED' || e.type === 'STATE_CHANGED')?.at;
    const loaded = evs.find((e) => e.details?.to === 'LOADED')?.at;
    const span = ms(staged, loaded);
    if (span !== null) spans.push(span);
  }
  return kpi(avg(spans), 'من دخول التجهيز إلى التحميل', spans.length);
}

/**
 * ★★ نسبةُ أخطاء القراءة — المرفوض من مجموع المحاولات.
 *
 * وهي مؤشّرُ **النظام لا الموظّف**: نسبةٌ عاليةٌ تعني غالبًا باركوداتٍ غير
 * مسجّلةٍ أو ملصقاتٍ تالفة، لا موظّفًا مهملًا. فتُقرأ للإصلاح لا للّوم.
 */
export function scanRejectRate(scanEvents) {
  const all = (scanEvents ?? []).length;
  if (all === 0) return kpi(null, 'لا قراءات', 0);
  const rejected = (scanEvents ?? []).filter((e) => e.result === 'rejected' || e.type === 'EXCEPTION').length;
  return kpi(Math.round((rejected / all) * 100), 'المرفوض من مجموع القراءات', all);
}

/** قراءاتُ كلّ موظّف — للتوزيع لا للمقارنة العقابيّة. */
export function scansByActor(scanEvents) {
  const by = new Map();
  for (const e of scanEvents ?? []) {
    const a = String(e?.actor ?? '').trim();
    if (!a) continue;
    by.set(a, (by.get(a) ?? 0) + 1);
  }
  return [...by.entries()].map(([actor, count]) => ({ actor, count })).sort((x, y) => y.count - x.count);
}

/**
 * ★★★ دقّةُ التحضير: الخطوات المنفَّذة كاملةً من مجموع الخطوات.
 *
 * ولماذا الخطوات لا الكمّيّات؟ لأنّ خطوةً نُفّذت نصفَها خطأٌ كاملٌ في نظر
 * العميل: يصل الطلب ناقصًا. والكمّيّة تُخفي ذلك — تسعون بالمئة من الكمّيّة
 * قد تعني عشرة طلباتٍ ناقصة.
 */
export function pickAccuracy(tasks) {
  let done = 0;
  let total = 0;
  for (const t of tasks ?? []) {
    for (const s of t?.steps ?? []) {
      total += 1;
      if (s.state === 'DONE' && Number(s.picked) >= Number(s.required)) done += 1;
    }
  }
  if (total === 0) return kpi(null, 'لا مهامّ', 0);
  return kpi(Math.round((done / total) * 100), 'الخطوات المنفَّذة كاملةً من مجموعها', total);
}

/** عددُ الطبالي في كلّ حالة — لوحةُ حالةٍ لحظيّة. */
export function palletsByState(units) {
  const by = new Map();
  for (const u of units ?? []) {
    const s = u?.state ?? 'غير معروف';
    by.set(s, (by.get(s) ?? 0) + 1);
  }
  return [...by.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);
}

/**
 * ★ عددُ إعادة الطباعة وأسبابها — مؤشّرٌ يكشف عطبًا ماديًّا لا بشريًّا.
 * (ملصقاتٌ تتمزّق كثيرًا = ورقٌ رديء أو طابعةٌ تحتاج صيانة.)
 */
export function reprintRate(printJobs) {
  const all = (printJobs ?? []).filter((j) => j?.state !== 'CANCELLED');
  if (all.length === 0) return kpi(null, 'لا مهامّ طباعة', 0);
  const re = all.filter((j) => j.isReprint);
  const reasons = new Map();
  for (const j of re) {
    const r = String(j.reason ?? '').trim() || 'بلا سبب';
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  return {
    ...kpi(Math.round((re.length / all.length) * 100), 'المعاد طباعتها من مجموع الملصقات', all.length),
    topReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3),
  };
}

/** الأصنافُ أو المواقع كثيرةُ الاستثناءات — أين يتكرّر العطب (خطة ٧). */
export function exceptionHotspots(exceptions) {
  const by = new Map();
  for (const e of exceptions ?? []) {
    const key = e?.sku || e?.bin || e?.barcode || 'غير محدَّد';
    const entry = by.get(key) ?? { key, count: 0, types: new Set() };
    entry.count += 1;
    if (e?.type) entry.types.add(e.type);
    by.set(key, entry);
  }
  return [...by.values()]
    .map((e) => ({ key: e.key, count: e.count, types: [...e.types] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
