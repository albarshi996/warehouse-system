/**
 * ورقة الملصقات ‹LPN-708› — دفعةٌ تُطبع وإعادةٌ تُسجَّل. منطق خالص.
 *
 * ═══ الفجوتان (ف-١٧ · ف-١٨) ═══
 * ٢٤٠٠ موقعٍ كانت تُطبع **ملصقًا ملصقًا**: نافذةٌ تُفتح وتُطبع وتُغلق، ٢٤٠٠
 * مرّة. فلا تُطبع، فيبقى المستودع بلا ملصقاتٍ على الحديد — ويبقى كلُّ ما بُني
 * فوق المسح معطَّلًا. والنصّ طلبها صراحةً: «طباعة موقعٍ واحد أو مجموعةٍ محدَّدة
 * أو دفعةٍ كاملة».
 *
 * وإعادةُ طباعة ملصقٍ تالف كانت **بلا سجلّ** لغير الطبلية — والنصّ اشترط:
 * «إعادة طباعة الملصق مع تسجيل من أعاد طباعته وسبب ذلك».
 *
 * ═══ ★★ قرارُ تصميمٍ يستحقّ التفسير: ماذا يحمل الباركود؟ ═══
 * الملصق يُظهر **الكود الكامل** `BR-RH-W01-DOCK-OUT-01` كما أراد النصّ —
 * وهو ما تقرؤه العين. أمّا **الباركود نفسه فيحمل الكود القانونيّ**
 * `W01-DOCK-OUT-01`.
 *
 * ولماذا؟ لأنّ كلّ شاشةٍ قائمة اليوم (المسح والتخزين والسحب والجرد) تقارن
 * الممسوح بكود الموقع المخزَّن. فلو حمل الباركود الصورة الكاملة لَتوقّف
 * **المسحُ كلُّه** يوم تُطبع الملصقات الجديدة — وهذا كسرٌ لما يعمل، وهو ما
 * لا يجوز. والشاشاتُ الجديدة تقبل الصورتين (`resolveLocationScan`)، فمن مسح
 * ملصقًا خارجيًّا بالصورة الكاملة يمرّ أيضًا.
 *
 * ═══ والملصق لا يُملى ═══
 * كلُّ حقلٍ عليه **مشتقٌّ** من السجلّ — القاعدة نفسها في `labelModel.buildLabel`:
 * حقلٌ يُكتب بيدٍ يعني ملصقًا يكذب عن الشيء الذي عليه.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from './barcodeCode.js';
import { serviceTypeOf } from '../locations/serviceLocations.js';
import { shortLabelOf } from '../locations/locationCode.js';
import { buildQualifiedCode } from '../locations/qualifiedCode.js';
import { parseVehicleCode } from './vehicleCode.js';

/**
 * مقاسات الملصقات — بالمليمتر.
 * الطبلية ١٠×١٥ (مقاسُ ملصقات الطبالي الشائع · `labelModel`)، والرفّ أعرضُ
 * وأقصر لأنّه يُلصق على حافّة الرفّ، والصغير للخانات الضيّقة.
 */
export const LABEL_SIZES = Object.freeze({
  pallet: { id: 'pallet', labelAr: 'طبلية ١٠×١٥', widthMm: 100, heightMm: 150, perRow: 2 },
  shelf: { id: 'shelf', labelAr: 'رفّ ١٠×٥', widthMm: 100, heightMm: 50, perRow: 2 },
  small: { id: 'small', labelAr: 'خانة ٥×٢٫٥', widthMm: 50, heightMm: 25, perRow: 4 },
  door: { id: 'door', labelAr: 'باب ١٥×١٠', widthMm: 150, heightMm: 100, perRow: 1 },
});

/** المقاس الافتراضيّ لكلّ نوع — يُقترح ويُغيَّر، ولا يُترك للمستخدم يخمّن. */
export const DEFAULT_SIZE_BY_KIND = Object.freeze({
  [BARCODE_KINDS.PALLET.id]: 'pallet',
  [BARCODE_KINDS.LOCATION.id]: 'shelf',
  [BARCODE_KINDS.STAGING.id]: 'door',
  [BARCODE_KINDS.DOCK_IN.id]: 'door',
  [BARCODE_KINDS.DOCK_OUT.id]: 'door',
  [BARCODE_KINDS.GATE_OUT.id]: 'door',
  [BARCODE_KINDS.VEHICLE.id]: 'shelf',
  [BARCODE_KINDS.SHIPMENT.id]: 'pallet',
  [BARCODE_KINDS.PARCEL.id]: 'pallet',
});

/**
 * سقفُ الورقة الواحدة — حاجزٌ ضدّ غلطةِ زرٍّ تُرسل ٥٠٠٠ ملصقٍ إلى الطابعة.
 * والسقف **يُعلَن ولا يُقصّ صامتًا**: من طلب أكثر يُقال له كم بقي.
 */
export const MAX_SHEET_LABELS = 500;

const s = (v) => String(v ?? '').trim();

/** أوضاع الاختيار الثلاثة التي نصّ عليها الطلب. */
export const SELECTION_MODES = Object.freeze({
  one: { id: 'one', labelAr: 'ملصقٌ واحد' },
  range: { id: 'range', labelAr: 'مجموعةٌ محدَّدة' },
  all: { id: 'all', labelAr: 'دفعةٌ كاملة' },
});

/**
 * يختار ما يُطبع من قائمةٍ كاملة.
 *
 * `range` يقبل **مدًى أبجديًّا بين كودين** (من `W01-A01-R01` إلى
 * `W01-A01-R09`) لا مدًى رقميًّا: الأكواد نصوصٌ مرتَّبة، ومدًى رقميٌّ يفترض
 * ترقيمًا متّصلًا لا يوجد في مستودعٍ حقيقيّ.
 *
 * @returns {{codes:string[], problem:string}}
 */
export function pickSelection(all, { mode = 'all', code = '', from = '', to = '', codes = [] } = {}) {
  const pool = (all ?? []).map((x) => normalizeScan(x?.value ?? x?.code ?? x)).filter(Boolean);

  if (mode === SELECTION_MODES.one.id) {
    const one = normalizeScan(code);
    if (!one) return { codes: [], problem: 'اختر الملصق المطلوب.' };
    if (!pool.includes(one)) return { codes: [], problem: `«${one}» ليس في القائمة المعروضة.` };
    return { codes: [one], problem: '' };
  }

  if (mode === SELECTION_MODES.range.id) {
    const picked = (codes ?? []).map(normalizeScan).filter(Boolean);
    if (picked.length) {
      const missing = picked.filter((c) => !pool.includes(c));
      if (missing.length) return { codes: [], problem: `خارج القائمة: ${missing.join(' · ')}` };
      return { codes: picked, problem: '' };
    }
    const a = normalizeScan(from);
    const b = normalizeScan(to);
    if (!a || !b) return { codes: [], problem: 'حدّد أوّل المدى وآخره — أو اختر أكوادًا بعينها.' };
    if (a > b) return { codes: [], problem: `المدى معكوس: «${a}» بعد «${b}».` };
    const within = pool.filter((c) => c >= a && c <= b).sort();
    if (!within.length) return { codes: [], problem: `لا أكواد بين «${a}» و«${b}» في القائمة.` };
    return { codes: within, problem: '' };
  }

  if (!pool.length) return { codes: [], problem: 'لا شيء ليُطبع.' };
  return { codes: pool.slice().sort(), problem: '' };
}

/**
 * يبني ملصقًا واحدًا — حقولُه بحسب نوعه، وكلُّها مشتقّة.
 *
 * `barcodeValue` هو **ما يُشفَّر فعلًا**: الكود القانونيّ (انظر ترويسة الملفّ).
 * و`headline` ما تقرؤه العين.
 */
export function buildSheetLabel(value, { record = null, qualifier = {}, company = 'Brandzo', copy = 1 } = {}) {
  const scan = classifyScan(value);
  if (scan.kind === BARCODE_KINDS.UNKNOWN.id) return null;

  const base = {
    company,
    kind: scan.kind,
    kindLabel: kindLabel(scan.kind),
    code: scan.code,
    barcodeValue: scan.code,
    headline: scan.code,
    subline: '',
    lines: [],
    copy,
    reprint: copy > 1,
  };

  if (scan.kind === BARCODE_KINDS.VEHICLE.id) {
    const p = parseVehicleCode(scan.code);
    return {
      ...base,
      headline: scan.code,
      subline: p ? `${p.typeLabel} · فرع ${p.branch}` : '',
      lines: [
        record?.plateNo ? `لوحة ${s(record.plateNo)}` : '',
        record?.internalNo ? `رقم داخليّ ${s(record.internalNo)}` : '',
      ].filter(Boolean),
    };
  }

  if (scan.kind === BARCODE_KINDS.PALLET.id || scan.kind === BARCODE_KINDS.SHIPMENT.id || scan.kind === BARCODE_KINDS.PARCEL.id) {
    return {
      ...base,
      subline: s(record?.orderRef ?? record?.docRef),
      lines: [record?.customerName ? s(record.customerName) : '', record?.warehouse ? s(record.warehouse) : ''].filter(Boolean),
    };
  }

  // المواقع وأنواع الخدمة — العينُ تقرأ الكود الكامل، والباركود يحمل القانونيّ.
  const service = serviceTypeOf(scan.code);
  return {
    ...base,
    headline: buildQualifiedCode(scan.code, qualifier),
    subline: service ? service.labelAr : shortLabelOf(scan.code),
    lines: [
      s(record?.nameAr),
      service ? service.hint : '',
      scan.code !== buildQualifiedCode(scan.code, qualifier) ? scan.code : '',
    ].filter(Boolean),
  };
}

/**
 * ★★ ورقةُ ملصقاتٍ كاملة — جاهزةٌ للطباعة أو لـPDF.
 *
 * @returns {{labels:object[], size:object, pages:number, problem:string, dropped:number}}
 */
export function buildLabelSheet({ codes = [], records = {}, size = '', qualifier = {}, company = 'Brandzo', copies = 1 } = {}) {
  const list = (codes ?? []).map(normalizeScan).filter(Boolean);
  if (!list.length) return { labels: [], size: LABEL_SIZES.shelf, pages: 0, problem: 'لا شيء ليُطبع.', dropped: 0 };

  const n = Math.max(1, Math.trunc(Number(copies) || 1));
  const wanted = list.length * n;
  const dropped = Math.max(0, wanted - MAX_SHEET_LABELS);

  const sizeId = size || DEFAULT_SIZE_BY_KIND[classifyScan(list[0]).kind] || 'shelf';
  const chosen = LABEL_SIZES[sizeId] ?? LABEL_SIZES.shelf;

  const labels = [];
  for (const code of list) {
    for (let c = 1; c <= n; c += 1) {
      if (labels.length >= MAX_SHEET_LABELS) break;
      const label = buildSheetLabel(code, { record: records?.[code] ?? null, qualifier, company, copy: c });
      if (label) labels.push(label);
    }
  }

  return {
    labels,
    size: chosen,
    perRow: chosen.perRow,
    pages: Math.ceil(labels.length / (chosen.perRow * Math.max(1, Math.floor(297 / chosen.heightMm)))),
    dropped,
    problem: dropped
      ? `الورقة تحمل ${MAX_SHEET_LABELS} ملصقًا كحدٍّ أقصى — طُبع ${labels.length} وبقي ${dropped}. اطبع الباقي في دفعةٍ ثانية.`
      : '',
  };
}

/**
 * حكمُ إعادة الطباعة — السببُ إلزاميّ، والقيدُ في السجلّ.
 *
 * وهذا **جسرٌ** إلى `barcodeRegistry.printProblem`: الحكم هناك مرّةً واحدة،
 * وهنا الرسالةُ المخصَّصة للورقة (كم ملصقًا يُعاد ولأيّ سبب).
 */
export function reprintSheetProblem({ codes = [], reason = '' } = {}) {
  const list = (codes ?? []).map(normalizeScan).filter(Boolean);
  if (!list.length) return 'لا ملصق ليُعاد.';
  if (!s(reason)) {
    return list.length === 1
      ? 'اكتب سبب إعادة الطباعة — هو ما يُقرأ حين تُوجد نسختان من الملصق نفسه.'
      : `إعادةُ ${list.length} ملصقًا تحتاج سببًا مكتوبًا — يبقى في السجلّ للأبد.`;
  }
  return '';
}
