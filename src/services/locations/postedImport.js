/**
 * ‹SRC-POST› الاستيرادُ المُرحِّل — منطقٌ خالص بلا Firebase ولا DOM.
 *
 * صندوقُ الاستيراد القديم (`sourceImport.js`) يصنع من مستند المصدر **أمرَ عمل**:
 * مسودّةَ تخزينٍ أو سحبٍ ينفّذها العامل. وهذا يصنع منه **واقعةً منجَزة**: مستندًا
 * أُنجز في أودو فيُرحَّل هنا كما وقع، ويُحرّك الرصيد من موقعٍ إلى موقع.
 *
 * ═══ القرار الحاكم (المالك 2026-10-20 — الخيار أ) ═══
 * أرصدةُ لقطة 19 أكتوبر هي **الرصيد الافتتاحيّ**، وكلُّ مستندٍ أُنجز بعدها يُرحَّل.
 * فالعقودُ هنا أربعة، وكسرُ أيٍّ منها يُفسد المطابقة مع أودو بصمت:
 *
 * ① **لا مستندَ قبل الافتتاح.** ما أُنجز قبل `OPENING_CUTOFF` أثرُه داخلٌ في الرصيد
 *    الافتتاحيّ — ترحيلُه يضاعفه. يُحجب ولا يُرحَّل.
 * ② **مستندُ المصدر يُرحَّل مرّةً واحدةً إلى الأبد.** المفتاحُ مرجعُه وحده — لا تاريخُ
 *    آخر تعديلٍ كما في صندوق الأوامر: تعديلُ ملاحظةٍ في أودو بعد الإنجاز لا يجعل
 *    التسليمَ تسليمَين.
 * ③ **مفتاحُ الرصيد مفتاحُ الافتتاح.** الأرصدةُ الافتتاحيّة بلا دفعةٍ ولا صلاحيةٍ ولا
 *    موقع؛ فبندٌ يحمل دفعةً يصيب مفتاحًا آخر، فيُرفض الخارجُ «رصيدًا غير كافٍ» ويُولد
 *    الداخلُ رصيدًا موازيًا. فالدفعةُ والصلاحيةُ تُحفظان على البند **وصفًا** لا مفتاحًا.
 * ④ **الاتّجاهُ من الموقعين لا من اسم المستند.** «IN» و«OUT» تسميةُ أودو، والحقيقةُ
 *    في نوع الموقعين: من المورّد إلى المخزن استلام، ومن المخزن إلى الطريق إرساليّة.
 */
import { fingerprintId } from './sourceImport.js';
import { normalizeUom } from '../items/uomModel.js';

/** أوّلُ يومٍ يُرحَّل — ما قبله داخلٌ في لقطة 19 أكتوبر (قرار المالك، الخيار أ). */
export const OPENING_CUTOFF = '2026-10-20';

/** نوعُ سجلّات منع التكرار في `source_imports` — منفصلٌ عن بصمات الأوامر. */
export const POSTED_KIND = 'posted';

/**
 * مستودعا نوفا في أودو ⟵ كودا البوّابة. والتحقّقُ يرفض ما سواهما:
 * استلامٌ إلى «WHNBE» كان سيُنشئ رصيدًا في مستودعٍ لا وجود له.
 */
export const ODOO_WAREHOUSE_MAP = Object.freeze({ WHNBE: 'WH001', WHNTR: 'WH002' });
export const PORTAL_WAREHOUSES = Object.freeze([...new Set(Object.values(ODOO_WAREHOUSE_MAP))]);

/** أقصى بنود المستند — حدُّ القيد في معاملةٍ واحدة (`MAX_LINES` في ledgerService). */
export const MAX_POSTED_LINES = 150;

/** نوعُ المستند ⟵ وصفُه للمعاينة. */
export const POSTED_TYPES = Object.freeze({
  SRI: { labelAr: 'استلام', effect: 'يدخل المستودع' },
  SRO: { labelAr: 'تسليم', effect: 'يخرج من المستودع' },
  SXO: { labelAr: 'إرساليّة نقل', effect: 'من المستودع إلى الطريق' },
  SXI: { labelAr: 'استلام نقل', effect: 'من الطريق إلى المستودع' },
  SRA: { labelAr: 'تسوية جرد', effect: 'زيادةٌ أو نقصٌ في المستودع' },
});

const USAGES = ['supplier', 'customer', 'internal', 'transit', 'inventory', 'production', 'view'];

const str = (v) => (v === false || v === null || v === undefined ? '' : String(v).trim());
const upper = (v) => str(v).toUpperCase();

/**
 * نوعُ الموقع: من حقل `usage` في أودو إن وُجد، وإلّا من اسمه.
 * والترتيبُ مقصود: «Inter-branch Transfers/… In Transit» فيه شرطةٌ مائلة، فلو سُئل عن
 * الشرطة قبل الطريق لصار الطريقُ مخزنًا داخليًّا.
 */
export function usageOf(usage, name) {
  const u = str(usage).toLowerCase();
  if (USAGES.includes(u)) return u;
  const n = str(name).toLowerCase();
  if (!n) return '';
  if (/transit/.test(n)) return 'transit';
  if (/vendor|supplier/.test(n)) return 'supplier';
  if (/customer/.test(n)) return 'customer';
  if (/inventory adjustment|virtual locations|scrap/.test(n)) return 'inventory';
  if (/production/.test(n)) return 'production';
  if (n.includes('/')) return 'internal';
  return '';
}

/**
 * يصنّف مستندَ المصدر بموقعيه.
 *
 * @returns {{type?:string, header?:object, isReturn?:boolean, skip?:string, error?:string}}
 *   `type` يُرحَّل · `skip` لا أثرَ له على رصيد المستودع · `error` يُحجب بسببٍ مكتوب.
 */
export function classifyPicking({ sourceUsage, destinationUsage, sourceLocation, destinationLocation, fromWarehouse, toWarehouse } = {}) {
  const from = usageOf(sourceUsage, sourceLocation);
  const to = usageOf(destinationUsage, destinationLocation);
  const fromWh = upper(fromWarehouse);
  const toWh = upper(toWarehouse);

  if (!from || !to) {
    return { error: `تعذّر تعرّف طرفَي الحركة («${str(sourceLocation) || '؟'}» ⟵ «${str(destinationLocation) || '؟'}»).` };
  }
  // ‹SRC-POST› تسويةُ الجرد (والإتلافُ موقعُه من النوع نفسه): تُرحَّل SRA بإشارتها — الزيادةُ تدخل
  // المستودع والنقصُ يخرج منه. وبلاها لا تكتمل المطابقة: «تحديثُ كمّيّةٍ» في أودو بلا مستند يبقى فرقًا.
  if (from === 'inventory' && to === 'internal') {
    if (!toWh) return { error: 'تسويةٌ بلا مستودع.' };
    return { type: 'SRA', header: { warehouse: toWh }, sign: 1 };
  }
  if (from === 'internal' && to === 'inventory') {
    if (!fromWh) return { error: 'تسويةٌ بلا مستودع.' };
    return { type: 'SRA', header: { warehouse: fromWh }, sign: -1 };
  }
  if (from === 'inventory' || to === 'inventory' || from === 'production' || to === 'production') {
    return { error: 'حركةُ إنتاجٍ أو تسويةٌ بين حسابين — ليست على رفٍّ ولا تُرحَّل من هذا المسار.' };
  }
  const outside = (u) => u === 'supplier' || u === 'customer';

  if (outside(from) && to === 'internal') {
    if (!toWh) return { error: 'استلامٌ بلا مستودعٍ مستلِم.' };
    return { type: 'SRI', header: { warehouse: toWh }, isReturn: from === 'customer' };
  }
  if (from === 'internal' && outside(to)) {
    if (!fromWh) return { error: 'تسليمٌ بلا مستودعٍ مسلِّم.' };
    return { type: 'SRO', header: { warehouse: fromWh }, isReturn: to === 'supplier' };
  }
  if (from === 'internal' && to === 'transit') {
    if (!fromWh) return { error: 'إرساليّةُ نقلٍ بلا مستودعٍ مرسِل.' };
    return { type: 'SXO', header: { fromWarehouse: fromWh, toWarehouse: toWh } };
  }
  if (from === 'transit' && to === 'internal') {
    if (!toWh) return { error: 'استلامُ نقلٍ بلا مستودعٍ مستلِم.' };
    return { type: 'SXI', header: { fromWarehouse: fromWh, toWarehouse: toWh } };
  }
  if (from === 'internal' && to === 'internal') {
    if (fromWh && toWh && fromWh !== toWh) {
      return { error: `نقلٌ مباشرٌ من ${fromWh} إلى ${toWh} بلا طريق — لا نظيرَ له بعد، يُرحَّل يدويًّا.` };
    }
    return { skip: 'حركةٌ داخل المستودع الواحد (سحبٌ أو تجهيز) — لا أثرَ لها على رصيده.' };
  }
  if (outside(from) && outside(to)) {
    return { skip: 'شحنٌ مباشرٌ من المورّد إلى العميل — لم يدخل المستودع.' };
  }
  return { error: `اتّجاهٌ غير معروف: ${from} ⟵ ${to}.` };
}

/**
 * وقتُ أودو (UTC) ⟵ يومُ ليبيا (UTC+2 بلا توقيتٍ صيفيّ).
 * تسليمٌ أُنجز الواحدةَ فجرًا بتوقيت طرابلس يُخزَّن في أودو قبل منتصف الليل — فيومُه
 * بالتوقيت العالميّ يومٌ سابق، وقد يسقط قبل حدّ الافتتاح وهو بعده.
 */
export function odooUtcToLibyaDay(value) {
  const s = str(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return '';
  if (m[4] === undefined) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) + 2 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** يومُ الإنجاز كما في الورقة — `YYYY-MM-DD` أو فراغ. */
function dayOf(value) {
  const m = str(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** معرّفُ سجلّ منع التكرار — **المرجعُ وحده** (العقد ②). */
export function postedMarkerId(sourceSystem, docRef) {
  return fingerprintId(postedFingerprint(sourceSystem, docRef));
}

export function postedFingerprint(sourceSystem, docRef) {
  return `POSTED__${upper(sourceSystem) || 'ODOO'}__${upper(docRef)}`;
}

/** وحدةُ أودو الأساسيّة ⟵ فراغ، فيُقيَّد البندُ بوحدة أساس الصنف كما هي. */
function portalUom(uom) {
  const u = str(uom);
  if (!u) return '';
  if (/^units?$/i.test(u) || normalizeUom(u) === 'piece') return '';
  return u;
}

const HEADER_FIELDS = [
  'docRef', 'docId', 'sourceSystem', 'docStatus', 'doneDate',
  'sourceLocation', 'sourceUsage', 'destinationLocation', 'destinationUsage',
  'fromWarehouse', 'toWarehouse', 'partnerCode', 'partner', 'orderRef',
];

/**
 * الصفوفُ المسطّحة ⟵ مستندات. واختلافُ قيمة رأسٍ بين صفَّين لمستندٍ واحد **يُعلَن**
 * ولا يُبتلع بأخذ آخر قيمة — كعقد صندوق الأوامر حرفًا.
 */
export function groupPostedRows(rows) {
  const byRef = new Map();
  for (const row of rows || []) {
    const ref = str(row?.docRef);
    if (!ref) continue;
    if (!byRef.has(ref)) {
      const head = { docRef: ref, sourceUpdatedAt: str(row.sourceUpdatedAt), lines: [], conflicts: [] };
      for (const f of HEADER_FIELDS) if (f !== 'docRef') head[f] = str(row[f]);
      byRef.set(ref, head);
    }
    const d = byRef.get(ref);
    for (const f of HEADER_FIELDS) {
      const incoming = str(row[f]);
      if (!incoming) continue;
      if (!d[f]) d[f] = incoming;
      else if (d[f] !== incoming) d.conflicts.push(`«${f}»: ${d[f]} ≠ ${incoming}`);
    }
    d.lines.push({
      lineId: str(row.lineId),
      sku: str(row.sku),
      barcode: str(row.barcode),
      description: str(row.description),
      uom: str(row.uom),
      qty: Number(row.qty) || 0,
      batch: str(row.batch),
      expiry: str(row.expiry),
      unitCost: Number(row.unitCost) || 0,
    });
  }
  return [...byRef.values()];
}

/**
 * المعاينة الكاملة — ما يُعرض قبل أيّ كتابة.
 *
 * @param {Array} rows صفوفُ الورقة (كما خرجت من `importSheet`)
 * @param {object} [opts]
 * @param {Map<string,{documentId:string, posted?:boolean, state?:string, exists?:boolean}>} [opts.known]
 *        سجلّاتُ منع التكرار الموجودة سلفًا، بمعرّفها — ومعها حالُ مستنداتها
 * @param {string} [opts.cutoff] أوّلُ يومٍ يُرحَّل
 * @param {string[]} [opts.warehouses] أكوادُ المستودعات المقبولة
 * @param {Array} [opts.sheetErrors] أخطاءُ قراءة الورقة (`importSheet().errors`)
 */
export function buildPostedPreview(rows, { known = new Map(), cutoff = OPENING_CUTOFF, warehouses = PORTAL_WAREHOUSES, sheetErrors = [] } = {}) {
  const accepted = new Set((warehouses || []).map(upper));
  const documents = groupPostedRows(rows).map((d) => {
    const problems = [...d.conflicts.map((c) => `تعارضُ رأس — ${c}`)];
    const cls = classifyPicking(d);
    const doneDay = dayOf(d.doneDate);
    const markerId = postedMarkerId(d.sourceSystem, d.docRef);
    const base = { ...d, doneDay, markerId, type: cls.type || '', classHeader: cls.header || {}, isReturn: Boolean(cls.isReturn), sign: cls.sign || 1 };

    if (cls.error) problems.push(cls.error);
    if (d.docStatus && d.docStatus.toLowerCase() !== 'done') problems.push(`لم يُنجَز في المصدر (الحالة «${d.docStatus}»).`);
    if (!doneDay) problems.push('بلا تاريخ إنجاز.');
    else if (doneDay < cutoff) problems.push(`أُنجز ${doneDay} — قبل الرصيد الافتتاحيّ (${cutoff})، فأثرُه داخلٌ فيه.`);
    for (const wh of Object.values(cls.header || {})) {
      if (wh && !accepted.has(wh)) problems.push(`المستودع «${wh}» ليس من مستودعات البوّابة (${[...accepted].join('، ')}).`);
    }
    if (!d.lines.length) problems.push('بلا بنود.');
    if (d.lines.length > MAX_POSTED_LINES) problems.push(`${d.lines.length} بندًا — الحدّ ${MAX_POSTED_LINES} للقيد الواحد.`);
    d.lines.forEach((l, i) => {
      if (!l.sku && !l.barcode) problems.push(`البند ${i + 1}: لا كود ولا باركود.`);
      if (!(l.qty > 0)) problems.push(`البند ${i + 1}: كمّيّةٌ غير موجبة (${l.qty}).`);
    });

    const prior = known.get(markerId);
    let status;
    if (prior?.posted) status = 'posted';
    else if (cls.skip && !problems.length) status = 'skip';
    else if (problems.length) status = 'error';
    else if (prior) status = 'resume';
    else status = 'new';

    return { ...base, status, problems, skipReason: cls.skip || '', documentId: prior?.documentId || '', priorState: prior?.state || '' };
  });

  const count = (s) => documents.filter((d) => d.status === s).length;
  const actionable = documents.filter((d) => d.status === 'new' || d.status === 'resume');
  // ★★★ `importSheet` يُسقط الصفَّ المعطوب ويُبقي إخوتَه — فلو رُحّلت الورقةُ لرُحّل مستندٌ
  // ناقصُ بندٍ ولا يدري أحد. فخطأٌ واحدٌ في الورقة يحجبها كلَّها: الترحيلُ كلُّه أو لا شيء.
  // والتنبيهُ لا يحجب (غيابُ معرّف السطر لا يمسّ مفتاحَ هذا المسار — المرجعُ وحده).
  const errors = (sheetErrors || []).filter((e) => e?.severity !== 'warning');
  return {
    documents,
    errors,
    summary: {
      total: documents.length,
      new: count('new'),
      resume: count('resume'),
      posted: count('posted'),
      skip: count('skip'),
      error: count('error'),
      lines: actionable.reduce((s, d) => s + d.lines.length, 0),
      qty: actionable.reduce((s, d) => s + d.lines.reduce((q, l) => q + l.qty, 0), 0),
    },
    cutoff,
    ok: actionable.length > 0 && errors.length === 0,
  };
}

/**
 * مستندُ المعاينة ⟵ مسودّةٌ بشكل `SRI/SRO/SXO/SXI`. لا يُنشئ شيئًا — يُشكّل فقط.
 * الدفعةُ والصلاحيةُ والوحدةُ الأصليّة تُحفظ على البند وصفًا (العقد ③).
 */
export function toPostedDraft(d) {
  const header = {
    sourceRef: d.docRef,
    sourceSystem: d.sourceSystem || 'Odoo',
    sourceDoneDate: d.doneDay,
    ...d.classHeader,
    sourceFrom: d.sourceLocation,
    sourceTo: d.destinationLocation,
    partner: d.partner,
    partnerCode: d.partnerCode,
    orderRef: d.orderRef,
    sourceDocId: d.docId,
    sourceUpdatedAt: d.sourceUpdatedAt,
    notes: d.isReturn ? 'مرتجعٌ أُنجز في المصدر' : '',
    // ‹ODOO-RPT› علَمٌ لا نصّ: تقريرُ المرتجع يفرز به، والملاحظةُ للقارئ وحده.
    isReturn: Boolean(d.isReturn),
  };
  const lines = d.lines.map((l) => ({
    sku: l.sku,
    barcode: l.barcode,
    description: l.description,
    uom: portalUom(l.uom),
    // التسويةُ بإشارتها (SRA): أودو يكتب الكمّيّة موجبةً والاتّجاهُ في الموقعين.
    qty: d.type === 'SRA' ? l.qty * (d.sign || 1) : l.qty,
    batch: '',
    expiry: '',
    unitCost: l.unitCost,
    sourceLineId: l.lineId,
    sourceUom: l.uom,
    sourceLot: l.batch,
    sourceExpiry: l.expiry,
  }));
  return { type: d.type, header, lines };
}

/** سجلُّ منع التكرار لمستندٍ — يُكتب **قبل** المسودّة ويحمل معرّفها (انظر الخدمة). */
export function postedMarker(d, documentId) {
  return {
    fingerprint: postedFingerprint(d.sourceSystem, d.docRef),
    kind: POSTED_KIND,
    docRef: d.docRef,
    lineId: '',
    sourceUpdatedAt: d.sourceUpdatedAt || '',
    sourceSystem: d.sourceSystem || 'Odoo',
    sourceDoneDate: d.doneDay,
    documentId,
    documentType: d.type,
    lines: d.lines.length,
    qty: d.lines.reduce((s, l) => s + l.qty, 0),
  };
}

/** «من … إلى …» بلغة المعاينة — الطرفُ الخارجيّ باسمه إن عُرف. */
export function routeLabel(d) {
  const h = d?.classHeader || {};
  const party = str(d?.partner);
  switch (d?.type) {
    case 'SRI': return { from: party || (d.isReturn ? 'العميل' : 'المورّد'), to: h.warehouse };
    case 'SRO': return { from: h.warehouse, to: party || (d.isReturn ? 'المورّد' : 'العميل') };
    case 'SXO': return { from: h.fromWarehouse, to: h.toWarehouse ? `الطريق إلى ${h.toWarehouse}` : 'الطريق' };
    case 'SXI': return { from: h.fromWarehouse ? `الطريق من ${h.fromWarehouse}` : 'الطريق', to: h.toWarehouse };
    case 'SRA': return (d.sign || 1) > 0 ? { from: 'تسوية جرد', to: h.warehouse } : { from: h.warehouse, to: 'تسوية جرد' };
    default: return { from: str(d?.sourceLocation), to: str(d?.destinationLocation) };
  }
}
