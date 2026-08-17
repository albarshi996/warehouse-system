/**
 * نموذج موقع التخزين — منطق خالص بلا Firebase وبلا DOM.
 *
 * الموقع ليس نصًّا في خانة، بل كيانٌ له حالةٌ وسعةٌ ونوعُ تخزينٍ وقواعدُ خلط.
 * وعلى هذه الأربعة يقوم **التخزين الموجّه** لاحقًا: بلا سعةٍ لا يُعرف الممتلئ،
 * وبلا نوعٍ يُخزَّن المجمَّد في رفٍّ عاديّ، وبلا قواعد خلطٍ تختلط الدفعات فيموت
 * تتبّعها.
 *
 * القاعدة الحاكمة للسعة: **لا سقفَ ⇒ لا منع.** سعةٌ غائبة أو صفرٌ تعني «غير
 * محدودة» لا «ممتلئ». وإلّا لصار كلُّ موقعٍ لم يُملأ حقلُه ممتلئًا يوم التشغيل،
 * فتوقّف المستودع أوّل يوم — وهو فشلٌ أسوأ من الفجوة التي يسدّها الحقل.
 */

import { normalizeLocationCode, parseLocationCode, locationCodeProblem, parentCodeOf } from './locationCode.js';

/**
 * حالات الموقع. `accepts` تعني: أيقبل بضاعةً جديدة؟
 * والأرشفة لا حذف — الأثر التاريخيّ يبقى (`archived`).
 */
export const LOCATION_STATUSES = {
  active: { id: 'active', labelAr: 'فعّال', accepts: true, hint: 'جاهزٌ للتخزين والسحب.' },
  reserved: { id: 'reserved', labelAr: 'محجوز', accepts: false, hint: 'محجوزٌ لغرضٍ قائم — لا يُقترح لبضاعةٍ جديدة.' },
  full: { id: 'full', labelAr: 'ممتلئ', accepts: false, hint: 'بلغ سعته — لا يُقترح حتى يفرغ.' },
  stopped: { id: 'stopped', labelAr: 'متوقّف', accepts: false, hint: 'أُوقف إداريًّا — لا تخزين ولا اقتراح.' },
  maintenance: { id: 'maintenance', labelAr: 'تحت الصيانة', accepts: false, hint: 'رفٌّ يُصلَح — لا يستقبل بضاعة.' },
  archived: { id: 'archived', labelAr: 'مؤرشَف', accepts: false, hint: 'خرج من الخدمة؛ يبقى لأثره التاريخيّ ولا يُحذف.' },
};

/** الحالة الافتراضية لموقعٍ جديد. */
export const DEFAULT_STATUS = 'active';

/**
 * أنواع التخزين. `RETURNS`/`QUARANTINE`/`DAMAGED` هنا **صفةُ رفٍّ ماديّ**
 * لا حالةَ مخزون — الحالة يحملها موقع النظام (`ledger/locations.js`). الفرق
 * جوهريّ: هذا يقول «أيّ رفٍّ يصلح»، وذاك يقول «في أيّ مرحلةٍ الصنف».
 */
export const STORAGE_TYPES = {
  ambient: { id: 'ambient', labelAr: 'عادي' },
  chilled: { id: 'chilled', labelAr: 'مبرَّد' },
  frozen: { id: 'frozen', labelAr: 'مجمَّد' },
  hazmat: { id: 'hazmat', labelAr: 'مواد حسّاسة' },
  returns: { id: 'returns', labelAr: 'مرتجعات' },
  quarantine: { id: 'quarantine', labelAr: 'حجر' },
  damaged: { id: 'damaged', labelAr: 'تالف' },
};

export const DEFAULT_STORAGE_TYPE = 'ambient';

/** مقاييس السعة الأربعة — كلٌّ اختياريّ، والغائب «غير محدود». */
export const CAPACITY_MEASURES = ['qty', 'cartons', 'weightKg', 'volumeM3'];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v) => String(v ?? '').trim();

/**
 * موقع الرصيد كما يقرؤه المنطق اليوم.
 *
 * ⚠️ حقلان لمعنًى واحد (ل‑٥): `bin` يكتبه القيد المخزنيّ و`location` يكتبه
 * استيراد إكسل، ولا أحد يوحّدهما. تُقرأ الأولويّة للقيد لأنّه أثرُ حركةٍ
 * فعليّة لا لقطةَ شيت. والتوحيد الكامل في LOC-106.
 */
export function balanceLocationCode(balance) {
  return normalizeLocationCode(balance?.bin || balance?.location || '');
}

/** يُسوّي مدخل النموذج إلى شكل المستند المخزَّن. */
export function shapeLocation(input) {
  const code = normalizeLocationCode(input?.code);
  const parsed = parseLocationCode(code);
  const capacity = {};
  for (const m of CAPACITY_MEASURES) capacity[m] = Math.max(0, num(input?.capacity?.[m]));

  return {
    code,
    warehouse: parsed?.warehouse || '',
    zone: parsed?.zone || '',
    rack: parsed?.rack || '',
    bay: parsed?.bay || '',
    level: parsed?.level || '',
    position: parsed?.position || '',
    nameAr: str(input?.nameAr),
    nameEn: str(input?.nameEn),
    status: LOCATION_STATUSES[input?.status] ? input.status : DEFAULT_STATUS,
    storageType: STORAGE_TYPES[input?.storageType] ? input.storageType : DEFAULT_STORAGE_TYPE,
    capacity,
    allowedItems: (input?.allowedItems || []).map(str).filter(Boolean),
    allowedFamilies: (input?.allowedFamilies || []).map(str).filter(Boolean),
    mixItems: input?.mixItems !== false,
    mixBatches: input?.mixBatches !== false,
    priority: num(input?.priority),
    distance: num(input?.distance),
    // ═══ شبكة الممرّات ‹EXE-801› — **كلّها اختياريّة** ═══
    // موقعٌ قائمٌ بلا واحدٍ منها يبقى صالحًا كما هو، ومفتاح الرصيد لا يمسّه
    // شيءٌ من هذا (الكود وحده يصنعه). وقرار المالك ت-O07 أن تُشتقّ الشبكة من
    // ترتيب الأكواد، فهذه الحقول **تجاوزٌ يدويّ** لمن قاس فعلًا لا شرطُ عمل.
    // و`null` هنا تعني «لم يُدخَل» — وهي غير الصفر الذي يعني «عند نقطة الصفر».
    ...gridFields(input),
  };
}

/** الحقول الستّة الاختياريّة للشبكة — الفارغ يبقى `null` ولا يُصفَّر. */
function gridFields(input) {
  const coord = (v) => (v === undefined || v === null || v === '' ? null : num(v));
  return {
    x: coord(input?.x),
    y: coord(input?.y),
    z: coord(input?.z),
    approach: str(input?.approach),
    aisle: str(input?.aisle).toUpperCase(),
    entryPoint: normalizeLocationCode(input?.entryPoint),
  };
}

/** أخطاء النموذج قبل الحفظ — قائمةٌ عربيّة فارغةٌ تعني «صالح». */
export function locationProblems(input) {
  const out = [];
  const codeProblem = locationCodeProblem(input?.code);
  if (codeProblem) out.push(codeProblem);
  if (input?.status && !LOCATION_STATUSES[input.status]) out.push(`حالة غير معروفة: «${input.status}»`);
  if (input?.storageType && !STORAGE_TYPES[input.storageType]) out.push(`نوع تخزين غير معروف: «${input.storageType}»`);
  for (const m of CAPACITY_MEASURES) {
    if (input?.capacity?.[m] !== undefined && num(input.capacity[m]) < 0) out.push(`سعة «${m}» لا تكون سالبة.`);
  }
  return out;
}

/**
 * حكم استقبال الموقع لبضاعة.
 *
 * @returns {{ok:boolean, reason:string}} والسبب مكتوبٌ دائمًا عند الرفض —
 *          «لا يُقترح» بلا سببٍ شكوى لا معلومة.
 */
export function canReceive(location, usedQty = 0) {
  if (!location) return { ok: false, reason: 'الموقع غير معرَّف في سيّد المواقع.' };
  const status = LOCATION_STATUSES[location.status] || LOCATION_STATUSES[DEFAULT_STATUS];
  if (!status.accepts) return { ok: false, reason: `الموقع ${status.labelAr} — ${status.hint}` };

  const cap = num(location.capacity?.qty);
  if (cap > 0 && num(usedQty) >= cap) {
    return { ok: false, reason: `الموقع بلغ سعته (${cap}) — لا مكان لبضاعةٍ جديدة.` };
  }
  return { ok: true, reason: '' };
}

/**
 * الإشغال: المستهلك والمتبقّي والنسبة لكلّ مقياس.
 * `remaining === null` تعني **غير محدودة** لا صفرًا — والفرق بينهما هو الفرق
 * بين «خزِّن هنا» و«ممنوع».
 */
export function occupancyOf(location, balances) {
  const code = normalizeLocationCode(location?.code);
  const mine = (balances || []).filter((b) => balanceLocationCode(b) === code);
  const usedQty = mine.reduce((s, b) => s + num(b.qty), 0);
  const cap = num(location?.capacity?.qty);

  return {
    code,
    lines: mine.length,
    usedQty,
    capacityQty: cap > 0 ? cap : null,
    remainingQty: cap > 0 ? Math.max(0, cap - usedQty) : null,
    pct: cap > 0 ? Math.min(100, Math.round((usedQty / cap) * 100)) : null,
    batches: new Set(mine.map((b) => str(b.batch) || 'NOBATCH')).size,
    items: new Set(mine.map((b) => str(b.sku) || str(b.barcode)).filter(Boolean)).size,
  };
}

/**
 * هل يخالف إيداعُ هذا الصنف/الدفعة سياسةَ الخلط في الموقع؟
 * الموقع الفارغ لا يخالف شيئًا — أوّل صنفٍ فيه يحدّد ما بعده.
 */
export function mixingProblem(location, balances, { sku, batch } = {}) {
  const code = normalizeLocationCode(location?.code);
  const mine = (balances || []).filter((b) => balanceLocationCode(b) === code && num(b.qty) > 0);
  if (!mine.length) return '';

  const incomingSku = str(sku).toUpperCase();
  const incomingBatch = str(batch).toUpperCase() || 'NOBATCH';

  if (location?.mixItems === false && incomingSku) {
    const others = new Set(mine.map((b) => str(b.sku).toUpperCase()).filter(Boolean));
    if (others.size && !others.has(incomingSku)) {
      return `الموقع لا يقبل خلط الأصناف — فيه ${[...others].join(' · ')}`;
    }
  }
  if (location?.mixBatches === false) {
    const others = new Set(mine.map((b) => str(b.batch).toUpperCase() || 'NOBATCH'));
    if (others.size && !others.has(incomingBatch)) {
      return `الموقع لا يقبل خلط الدفعات — فيه ${[...others].join(' · ')}`;
    }
  }
  return '';
}

/** هل يسمح الموقع بهذا الصنف/الفئة؟ القائمة الفارغة تعني «الكلّ مسموح». */
export function allowsItem(location, { sku, family } = {}) {
  const items = location?.allowedItems || [];
  const families = location?.allowedFamilies || [];
  if (items.length && !items.map((s) => s.toUpperCase()).includes(str(sku).toUpperCase())) {
    return { ok: false, reason: `الموقع محصورٌ بأصناف بعينها (${items.length}) وهذا الصنف ليس منها.` };
  }
  if (families.length && !families.map((s) => s.toUpperCase()).includes(str(family).toUpperCase())) {
    return { ok: false, reason: `الموقع محصورٌ بفئاتٍ بعينها (${families.length}) وفئة هذا الصنف ليست منها.` };
  }
  return { ok: true, reason: '' };
}

/**
 * يبني الشجرة من قائمةٍ مسطّحة بالاعتماد على الكود نفسه — لا حقل `parentId`.
 *
 * لماذا من الكود؟ لأنّ الهرميّة **محفورةٌ في الهويّة**: `MAIN-A01-R01` ابنُ
 * `MAIN-A01` بحكم اسمه. وحقلُ أبٍ مستقلّ يفترق عن الاسم أوّل إعادة تنظيم،
 * فتصير للشجرة حقيقتان.
 *
 * الآباء الغائبون من القائمة يُستنبطون عقدًا افتراضيّة (`virtual: true`) كي لا
 * يسقط رفٌّ من الشجرة لأنّ منطقته لم تُسجَّل بعد.
 */
export function buildLocationTree(locations) {
  const byCode = new Map();
  const ensure = (code, real) => {
    if (!code) return null;
    let node = byCode.get(code);
    if (!node) {
      node = { code, location: null, virtual: true, children: [] };
      byCode.set(code, node);
    }
    if (real) {
      node.location = real;
      node.virtual = false;
    }
    return node;
  };

  for (const loc of locations || []) {
    const code = normalizeLocationCode(loc?.code);
    if (!code) continue;
    ensure(code, loc);
    // نُنشئ سلسلة الآباء كلّها حتى الجذر
    for (let p = parentCodeOf(code); p; p = parentCodeOf(p)) ensure(p, null);
  }

  const roots = [];
  for (const [code, node] of byCode) {
    const parent = byCode.get(parentCodeOf(code));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** تسمية الموقع للعرض: الاسم العربيّ إن وُجد، وإلّا الكود. */
export function locationLabelOf(location) {
  return str(location?.nameAr) || normalizeLocationCode(location?.code) || '—';
}

/**
 * خيارات خانة الموقع في جدول البنود — قائمةٌ مقترَحة لا حاصرة.
 *
 * لماذا `datalist` لا `select`؟ مستودعٌ واحد قد يحمل آلاف المواقع، والقائمة
 * المنسدلة تصير غير قابلة للاستعمال — والعامل يمسح الملصق أصلًا ولا يتصفّح.
 * فالاقتراح يُعين من يكتب، والمسحُ يمرّ بلا احتكاك.
 *
 * المؤرشَف يُستبعد من الاقتراح **ولا يُرفض** إن كُتب: مستندٌ قديم يشير إليه
 * يجب أن يبقى مقروءًا.
 */
export function locationOptions(locations, { warehouse } = {}) {
  const wh = normalizeLocationCode(warehouse);
  return (locations || [])
    .filter((l) => l?.status !== 'archived')
    .filter((l) => !wh || String(l?.warehouse || '').toUpperCase() === wh)
    .map((l) => ({
      value: normalizeLocationCode(l.code),
      label: str(l.nameAr) ? `${normalizeLocationCode(l.code)} — ${l.nameAr}` : normalizeLocationCode(l.code),
    }))
    .filter((o) => o.value)
    .sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * حكم خانة الموقع المكتوبة في بند مستند.
 *
 * ★★ الفراغ **ليس خطأً**: مستندات اليوم كلّها بلا موقع، وحقلٌ يمنع الحفظ
 * لفراغه يوقف الدورة القائمة كلّها في لحظة — وهو فشلٌ أسوأ من الفجوة.
 * وكذلك **لا يُرفض** كودٌ غير مسجَّل حين لا يكون سيّد المواقع مبنيًّا بعد
 * (`locations` فارغة): تُنبَّه ولا تُمنَع.
 *
 * @returns {{level:'ok'|'warn', message:string}}
 */
export function binCellVerdict(raw, locations) {
  const code = normalizeLocationCode(raw);
  if (!code) return { level: 'ok', message: '' };

  const problem = locationCodeProblem(code);
  if (problem) return { level: 'warn', message: problem };

  const list = locations || [];
  if (!list.length) return { level: 'ok', message: '' }; // لا سيّد بعد ⇒ لا حكم

  const found = list.find((l) => normalizeLocationCode(l?.code) === code);
  if (!found) return { level: 'warn', message: `«${code}» غير مسجَّل في سيّد المواقع.` };

  const status = LOCATION_STATUSES[found.status];
  if (status && !status.accepts) {
    return { level: 'warn', message: `«${code}» ${status.labelAr} — ${status.hint}` };
  }
  return { level: 'ok', message: '' };
}
