/**
 * مؤشرات المشتريات والدورة المستندية — منطق خالص يحوّل المستندات إلى أرقامٍ
 * دفاعية تُقاس بها إدارة السلاسل (استعداد اختبار ديلويت · الأفق الأوّل).
 *
 * لماذا هذا الملف؟ لوحة القيادة الحالية تقيس **دورة البيع** (الأمر ← التسليم)
 * و**الأسطول** (OTIF الشاحنات)، لكنها لا تقيس ما يسأل عنه مُقيّم السلاسل أوّلًا:
 *   1. **مدة دورة أمر الشراء** — من رفع الطلب (PR) حتى إصدار الأمر (PO).
 *      تكشف بيروقراطية الاعتماد وطبقات الصلاحية الزائدة.
 *   2. **مهلة التوريد** — من إصدار الأمر (PO) حتى الاستلام الفعلي (GRN).
 *      أساس تحديد مستويات المخزون الأمثل.
 *   3. **التزام الموردين (OTD)** — نسبة الاستلامات في موعدها المطلوب أو قبله.
 *      المؤشر الصحيح بديلًا عن OTIF الأسطول الذي يقيس شاحناتنا لا موردينا.
 *   4. **نسبة نفاد المخزون** — نسبة الأصناف المطلوبة التي عجز المخزون عنها.
 *      تربط أداء الإدارة بخسارة الإيراد.
 *
 * كل رقم يحمل **مقامه** (`basis`) لتُقرأ الثقة فيه: مؤشرٌ من ثلاث حالاتٍ ليس
 * كمؤشرٍ من ثلاثمئة. وكلٌّ يُعيد `null` حين تغيب بياناته — فلا نلوّن نجاحًا
 * مزيّفًا من لا شيء (نفس مبدأ `operationsDashboard.js`).
 *
 * خالصٌ عمدًا: بلا Firestore، والوقت يُمرَّر `nowMs` لا يُقرأ — كي يُختبَر في
 * Node ويبقى حسابه ثابتًا. المطابقة بين المستندات عبر `links` المشتقّة
 * (PO يحمل `links.PR`، وGRN يحمل `links.PO`) لا بالنصّ.
 */
import { toMillis } from '../documents/inbox.js';
import { dimensionsOf } from '../org/orgLocations.js';

const DAY = 86400000;

/** مفتاح الصنف: الكود أولًا فالباركود، مطبَّعًا. */
function itemKey(row) {
  return String(row?.sku || row?.barcode || '').trim().toUpperCase();
}

/** متوسط قائمة أرقام (null إن فرغت). */
function avg(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

/** الوسيط — أمتن من المتوسط أمام القيم الشاذّة (أمرٌ تعطّل شهرًا لا يُفسد الصورة). */
function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ofType(docs, t) {
  return (docs || []).filter((d) => d?.type === t);
}

/**
 * يقصر المستندات على آخر `windowDays` يومًا إن طُلبت (بلا نافذة = الكلّ).
 * المستند بلا تاريخ يُحتسب — لا نُسقط ما نجهل تاريخه. مطابقٌ لمنطق اللوحة.
 */
function withinWindow(docs, nowMs, windowDays) {
  if (nowMs == null || !(windowDays > 0)) return docs || [];
  const cutoff = nowMs - windowDays * DAY;
  return (docs || []).filter((d) => {
    const t = toMillis(d?.createdAt);
    return t == null || t >= cutoff;
  });
}

/** لحظة «إصدار أمر الشراء»: الاعتماد أولًا، فالترقيم، فالإنشاء (أوّل موجود). */
function poIssuedMs(po) {
  return toMillis(po?.approvedAt) ?? toMillis(po?.numberedAt) ?? toMillis(po?.createdAt);
}

/** لحظة «الاستلام الفعلي»: تاريخ الاستلام المُدخل، فالاعتماد، فآخر تحديث. */
function grnReceivedMs(grn) {
  return toMillis(grn?.header?.receivedAt) ?? toMillis(grn?.approvedAt) ?? toMillis(grn?.updatedAt);
}

/**
 * مدة دورة أمر الشراء = متوسط/وسيط (إصدار الأمر − إنشاء طلبه) بالأيام، عبر كل
 * أمرٍ مشتقٍّ من طلبٍ معروف تاريخه. يُقاس من إنشاء الطلب (بداية الاحتياج) لا من
 * اعتماده، فيلتقط الدورة كاملةً: اعتماد الطلب + إنشاء الأمر + اعتماد الأمر.
 *
 * @returns {{avgDays, medianDays, count, samples}}
 */
export function poCycleTime(docs) {
  const prById = new Map(ofType(docs, 'PR').map((d) => [d.id, d]));
  const spans = [];
  for (const po of ofType(docs, 'PO')) {
    const prId = po?.links?.PR?.id;
    const pr = prId ? prById.get(prId) : null;
    const start = toMillis(pr?.createdAt);
    const end = poIssuedMs(po);
    if (start != null && end != null && end >= start) spans.push((end - start) / DAY);
  }
  return { avgDays: avg(spans), medianDays: median(spans), count: spans.length, samples: spans };
}

/**
 * مهلة التوريد = متوسط/وسيط (الاستلام الفعلي − إصدار الأمر) بالأيام، عبر كل
 * مذكرة استلامٍ مشتقّةٍ من أمرٍ معروف لحظة إصداره.
 *
 * @returns {{avgDays, medianDays, count, samples}}
 */
export function supplierLeadTime(docs) {
  const poById = new Map(ofType(docs, 'PO').map((d) => [d.id, d]));
  const spans = [];
  for (const grn of ofType(docs, 'GRN')) {
    const poId = grn?.links?.PO?.id;
    const po = poId ? poById.get(poId) : null;
    const start = poIssuedMs(po);
    const end = grnReceivedMs(grn);
    if (start != null && end != null && end >= start) spans.push((end - start) / DAY);
  }
  return { avgDays: avg(spans), medianDays: median(spans), count: spans.length, samples: spans };
}

/**
 * التزام الموردين (On-Time Delivery) = نسبة الاستلامات التي وقعت في تاريخ
 * التسليم المطلوب على الأمر أو قبله. مهلة السماح يومٌ واحد: تاريخ التسليم
 * المطلوب يُخزَّن منتصفَ ليلٍ، فاستلامٌ في يومه نفسه يجب أن يُعدّ ملتزمًا.
 *
 * يُحتسب فقط ما لأمره تاريخُ تسليمٍ مطلوب واستلامٌ معروف — فبلا موعدٍ لا التزام
 * يُقاس. يُعيد `rate = null` إن لم توجد عيّنة.
 *
 * @returns {{rate, onTime, total}}
 */
export function supplierOtd(docs, grace = DAY) {
  const poById = new Map(ofType(docs, 'PO').map((d) => [d.id, d]));
  let onTime = 0;
  let total = 0;
  for (const grn of ofType(docs, 'GRN')) {
    const poId = grn?.links?.PO?.id;
    const po = poId ? poById.get(poId) : null;
    const planned = toMillis(po?.header?.requiredDelivery);
    const actual = grnReceivedMs(grn);
    if (planned == null || actual == null) continue;
    total += 1;
    if (actual <= planned + grace) onTime += 1;
  }
  return { rate: total ? onTime / total : null, onTime, total };
}

/**
 * نسبة نفاد المخزون = الأصناف التي عجز المخزون عن تلبيتها ÷ الأصناف المطلوبة.
 * أصنافٌ مميّزة لا كميات: «كم صنفًا نفد» أوضح رقابيًّا من «كم وحدة». مصدر العجز
 * هو `soShortfall` المثبَّت على أمر البيع لحظة اعتماده (انظر `salesService.js`).
 *
 * @returns {{rate, stockoutItems, orderedItems}}
 */
export function stockoutRate(docs) {
  const ordered = new Set();
  const stockedOut = new Set();
  for (const so of ofType(docs, 'SO')) {
    for (const l of so.lines || []) {
      const k = itemKey(l);
      if (k) ordered.add(k);
    }
    for (const s of so.soShortfall || []) {
      const k = itemKey(s);
      if (k) stockedOut.add(k);
    }
  }
  const orderedItems = ordered.size;
  const stockoutItems = [...stockedOut].filter((k) => ordered.has(k)).length;
  return { rate: orderedItems ? stockoutItems / orderedItems : null, stockoutItems, orderedItems };
}

/**
 * يجمع مؤشرات المشتريات الأربعة في نتيجةٍ واحدة، مقصورةً على نافذةٍ زمنية إن
 * طُلبت. هذا ما تستهلكه الشاشة — والدوال المفردة أعلاه تبقى مصدَّرة للاختبار
 * ولإعادة الاستعمال.
 */
export function computeProcurementKpis(docs, opts = {}) {
  const scoped = withinWindow(docs, opts.nowMs, opts.windowDays);
  return {
    poCycle: poCycleTime(scoped),
    leadTime: supplierLeadTime(scoped),
    otd: supplierOtd(scoped),
    stockout: stockoutRate(scoped),
    basis: { windowDays: opts.windowDays || null, scopedDocs: scoped.length },
  };
}

/* ═══════════════ ‹FNB-603› البُعد التنظيميّ ورؤية الحالة ═══════════════ */

/**
 * ‹FNB-603› المقاييس **ببُعد الفرع أو البراند أو القطاع** — لا مقياسَ جديد.
 *
 * التحقّق العدائيّ أثبت أنّ متابعة SLA مبنيّةٌ وحيّةٌ على شاشتين، فالمهمّة
 * **وصلٌ لا بناء**: نفس الدوال الأربع تُشغَّل على مستنداتٍ مُرشَّحة بالبُعد.
 * ومن بناها ثانيةً صنع مقياسين لشيءٍ واحد يتباعدان أوّل تعديل.
 *
 * والترشيح بالرمز المختوم على المستند (`costCenter`) أو بأبعاده المشتقّة —
 * ومستندٌ بلا رمزٍ يدخل «غير مربوط» ولا يذوب في المجموع بصمت.
 *
 * @param {object[]} docs المستندات
 * @param {Map} orgIndex فهرس الشجرة
 * @param {{level?:'branch'|'brand'|'sector', nowMs?:number, windowDays?:number}} [opts]
 * @returns {{byCode:Map<string,object>, unlinked:object|null}}
 */
export function procurementKpisByOrg(docs, orgIndex, opts = {}) {
  const level = opts.level || 'branch';
  const groups = new Map();
  const unlinkedDocs = [];

  for (const doc of Array.isArray(docs) ? docs : []) {
    const code = orgIndex ? dimensionsOf(orgIndex, doc)?.[level]?.code : '';
    if (!code) {
      unlinkedDocs.push(doc);
      continue;
    }
    const list = groups.get(code) || [];
    list.push(doc);
    groups.set(code, list);
  }

  const byCode = new Map();
  for (const [code, list] of groups) {
    byCode.set(code, { code, docs: list.length, ...computeProcurementKpis(list, opts) });
  }
  return {
    byCode,
    unlinked: unlinkedDocs.length ? { docs: unlinkedDocs.length, ...computeProcurementKpis(unlinkedDocs, opts) } : null,
  };
}

/** مراحل رحلة الشراء — من الطلب حتّى وصول المادّة، بمستنداتها المبنيّة. */
export const PROCUREMENT_TRAIL = Object.freeze([
  { id: 'requested', labelAr: 'طُلب', docType: 'PR', state: 'submitted' },
  { id: 'approved', labelAr: 'اعتُمد', docType: 'PR', state: 'approved' },
  { id: 'quoted', labelAr: 'قُورنت العروض', docType: 'RFQ', state: 'approved', optional: true },
  { id: 'ordered', labelAr: 'صدر أمر الشراء', docType: 'PO', state: 'approved' },
  { id: 'received', labelAr: 'وصلت المادّة', docType: 'GRN', state: 'done' },
  { id: 'inspected', labelAr: 'فُحصت', docType: 'QC', state: 'done', optional: true },
]);

const RANK = { draft: 0, submitted: 1, approved: 2, done: 3, cancelled: -1, rejected: -1 };
const reached = (actual, wanted) => (RANK[String(actual)] ?? -1) >= (RANK[String(wanted)] ?? 0) && (RANK[String(actual)] ?? -1) >= 0;

/**
 * ‹FNB-603› **رؤية الحالة من PR حتّى الوصول في سطرٍ واحد** — والتأخّر
 * يُنسب إلى **مرحلته** لا إلى الطلب جملةً: «تأخّر» بلا موضعٍ لا يُعالَج.
 *
 * @param {object[]} docs مستندات الرحلة الواحدة (PR وأحفاده)
 * @param {{nowMs?:number, stageDays?:number}} [opts]
 * @returns {{stage, label, reached:string[], stalledAt:string, stalledDays:number, done:boolean}}
 */
export function procurementStatus(docs = [], opts = {}) {
  const byType = new Map();
  for (const d of Array.isArray(docs) ? docs : []) {
    const t = String(d?.type || '').toUpperCase();
    if (t) byType.set(t, [...(byType.get(t) || []), d]);
  }

  const hit = [];
  let lastAt = null;
  for (const step of PROCUREMENT_TRAIL) {
    const match = (byType.get(step.docType) || []).find((d) => reached(d?.state, step.state));
    if (!match) continue;
    hit.push(step.id);
    const ms = toMillis(match?.updatedAt ?? match?.header?.requestDate ?? match?.header?.issueDate);
    if (ms != null) lastAt = ms;
  }

  const last = PROCUREMENT_TRAIL.filter((s) => hit.includes(s.id)).pop() || null;
  const done = hit.includes('received');
  // ما المرحلة التالية المنتظَرة؟ عندها يقف التأخّر لا عند الطلب كلّه.
  const next = PROCUREMENT_TRAIL.find((s) => !hit.includes(s.id) && !s.optional);
  const nowMs = Number(opts.nowMs);
  const stalledDays = !done && lastAt != null && Number.isFinite(nowMs)
    ? Math.max(0, Math.round((nowMs - lastAt) / DAY))
    : 0;

  return {
    stage: last?.id || '',
    label: last?.labelAr || 'لم يبدأ',
    reached: hit,
    stalledAt: done ? '' : next?.id || '',
    stalledLabel: done ? '' : next?.labelAr || '',
    stalledDays,
    done,
  };
}
