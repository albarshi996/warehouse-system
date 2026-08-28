/**
 * نحو الشحنة والطرد ‹LPN-711› — `SHP-RH-20260827-000125-01`. منطق خالص.
 *
 * ═══ الفجوة (ف-١٥) ═══
 * الطلب يخرج من المستودع اليوم بلا هويّةٍ ماديّة: `PACK` مستندٌ ورقيٌّ فيه
 * «رقم طرد» **يُكتب باليد**، فلا يُمسح ولا يُتتبَّع. والنصّ طلب العكس تمامًا:
 * «إذا كان الطلب يتكوّن من عدّة طرود، يحصل **كلُّ طردٍ على باركود مستقلّ**،
 * لكن جميعها ترتبط برقم الطلب والشحنة نفسها».
 *
 * ═══ ★★ ولماذا الطرد **لاحقةٌ** على الشحنة لا رقمٌ مستقلّ ═══
 * لأنّ العلاقة تُقرأ حينئذٍ **من الباركود وحده**: عاملٌ يمسح طردًا عند الباب
 * فيعرف النظام شحنته قبل أن يسأل قاعدة البيانات. ورقمٌ مستقلٌّ للطرد يعني
 * قراءةً ثانيةً لكلّ مسحة — وشبكةً تتعطّل فيقف الباب.
 *
 * ═══ و«١ من ٤» **محسوبةٌ** لا مكتوبة ═══
 * النصّ اشترط رقم الطرد «١ من ٤». ولو كُتب الإجماليّ بيدٍ لَافترق عن الواقع
 * أوّلَ طردٍ يُضاف: أربعةٌ على الملصقات وخمسةٌ في الشاحنة. فالإجماليّ يُقرأ من
 * الشحنة، والملصق يُبنى منه.
 *
 * البناء يتبع `lpnCode.js` حرفيًّا: بادئةٌ ونطاقٌ ويومٌ وتسلسلٌ ستّ خانات —
 * فالعاملُ الذي تعلّم قراءة ملصق الطبلية يقرأ ملصق الشحنة بلا تعلّمٍ ثانٍ.
 */

import { SEGMENT_SEPARATOR, SHIPMENT_PREFIX, classifyScan, normalizeScan } from '../barcodes/barcodeCode.js';

/** عدد خانات تسلسل الشحنة اليوميّ — ستٌّ كتسلسل الطبلية. */
export const SHIPMENT_SEQ_DIGITS = 6;

/** عدد خانات رقم الطرد — اثنتان تكفيان ٩٩ طردًا في الشحنة الواحدة. */
export const PARCEL_DIGITS = 2;

/** أقصى عدد طرودٍ في شحنة — حاجزٌ ضدّ غلطةِ رقمٍ تطبع ألف ملصق. */
export const MAX_PARCELS = 99;

/** أطول مقطع نطاقٍ (فرعٍ أو مستودع) — كنحو المواقع والطبالي. */
const MAX_SCOPE_LEN = 12;
const SCOPE_RE = /^[A-Z0-9]+$/;

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * ختمُ اليوم `YYYYMMDD` — **باليوم المحلّيّ لا UTC**.
 *
 * ولماذا؟ الدرسُ نفسه الذي كلّف طبقة الطبالي تصحيحًا: الورديّة الليليّة
 * تشحن الساعة الواحدة صباحًا، وUTC يعطيها **تاريخ أمس** — فتُبحث شحنةُ اليوم
 * في يومٍ مضى ولا تُوجد.
 */
export function shipmentDateStamp(date) {
  const d = date instanceof Date ? date : new Date(date ?? NaN);
  if (Number.isNaN(d.getTime())) {
    const raw = normalizeScan(date).replace(/-/g, '');
    return /^\d{8}$/.test(raw) ? raw : '';
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** يبني رقم الشحنة — أو `''` إن تعذّر بناؤه سليمًا. */
export function formatShipmentCode({ branch, date, seq } = {}) {
  const b = up(branch);
  const stamp = shipmentDateStamp(date);
  const n = Math.trunc(Number(seq));

  if (!SCOPE_RE.test(b) || b.length > MAX_SCOPE_LEN) return '';
  if (!/^\d{8}$/.test(stamp)) return '';
  if (!Number.isFinite(n) || n < 1 || n > 10 ** SHIPMENT_SEQ_DIGITS - 1) return '';

  return [SHIPMENT_PREFIX, b, stamp, String(n).padStart(SHIPMENT_SEQ_DIGITS, '0')].join(SEGMENT_SEPARATOR);
}

/** يبني رقم طردٍ من شحنته — أو `''`. */
export function formatParcelCode(shipmentCode, parcelNo) {
  const scan = classifyScan(shipmentCode);
  if (scan.kind !== 'SHIPMENT') return '';
  const n = Math.trunc(Number(parcelNo));
  if (!Number.isFinite(n) || n < 1 || n > MAX_PARCELS) return '';
  return `${scan.code}${SEGMENT_SEPARATOR}${String(n).padStart(PARCEL_DIGITS, '0')}`;
}

/** يفكّ رقم شحنةٍ أو طرد — أو `null`. */
export function parseShipmentCode(raw) {
  const scan = classifyScan(raw);
  if (scan.kind !== 'SHIPMENT' && scan.kind !== 'PARCEL') return null;
  const isParcel = scan.kind === 'PARCEL';
  return {
    code: scan.code,
    isParcel,
    shipment: isParcel ? scan.code.split(SEGMENT_SEPARATOR).slice(0, 4).join(SEGMENT_SEPARATOR) : scan.code,
    branch: scan.parts.branch,
    date: scan.parts.date,
    seq: Number(scan.parts.seq),
    parcelNo: isParcel ? scan.parts.parcel : null,
  };
}

/** رقم شحنة الطرد — أو الشحنة نفسها إن مُسحت شحنةً. `''` لغير ذلك. */
export function shipmentOf(raw) {
  return parseShipmentCode(raw)?.shipment ?? '';
}

/** سببُ رفض رقم شحنة — أو `''`. */
export function shipmentCodeProblem(raw) {
  const value = normalizeScan(raw);
  if (!value) return 'رقم الشحنة مطلوب.';
  const scan = classifyScan(value);
  if (scan.kind === 'SHIPMENT') return '';
  if (scan.kind === 'PARCEL') return `«${value}» رقم طردٍ لا شحنة — شحنتُه ${shipmentOf(value)}.`;
  return scan.problem || `«${value}» ليس رقم شحنة — الصورة: ${SHIPMENT_PREFIX}-RH-20260827-000125`;
}

/**
 * سببُ رفض رقم طرد — أو `''`.
 *
 * `total` حين يُمرَّر يُفعّل الحارس الذي طلبه النصّ ضمنًا: **طردٌ رقمُه يتجاوز
 * العدد الكلّيّ** ملصقٌ لطردٍ لا وجود له — يخرج من الشاحنة ولا يجده أحد.
 */
export function parcelCodeProblem(raw, { total = 0, shipment = '' } = {}) {
  const value = normalizeScan(raw);
  if (!value) return 'رقم الطرد مطلوب.';
  const parsed = parseShipmentCode(value);
  if (!parsed) return classifyScan(value).problem || `«${value}» ليس رقم طرد.`;
  if (!parsed.isParcel) return `«${value}» رقم شحنةٍ لا طرد — الطرد يحمل لاحقةَ رقمه (${value}-01).`;

  const want = normalizeScan(shipment);
  if (want && parsed.shipment !== want) {
    return `هذا الطرد من شحنة «${parsed.shipment}» والمطلوب من «${want}».`;
  }
  const n = Math.trunc(Number(total));
  if (Number.isFinite(n) && n > 0 && parsed.parcelNo > n) {
    return `الطرد رقم ${parsed.parcelNo} والشحنة ${n} طرودًا — ملصقٌ لطردٍ لا وجود له.`;
  }
  return '';
}

/**
 * «١ من ٤» — بالأرقام اللاتينيّة كنمط البوّابة كلّها.
 * تُبنى من الرقم والإجماليّ، ولا تُكتب في حقل.
 */
export function parcelOfTotal(parcelNo, total) {
  const n = Math.trunc(Number(parcelNo));
  const t = Math.trunc(Number(total));
  if (!Number.isFinite(n) || n < 1) return '';
  if (!Number.isFinite(t) || t < 1) return String(n);
  return `${n} من ${t}`;
}

/** يولّد أكواد طرود شحنةٍ كلَّها — `{codes, problem}`. */
export function parcelCodes(shipmentCode, total) {
  const problem = shipmentCodeProblem(shipmentCode);
  if (problem) return { codes: [], problem };
  const t = Math.trunc(Number(total));
  if (!Number.isFinite(t) || t < 1) return { codes: [], problem: 'عدد الطرود يبدأ من ١.' };
  if (t > MAX_PARCELS) return { codes: [], problem: `الشحنة لا تتجاوز ${MAX_PARCELS} طردًا — رقمٌ أكبر غالبًا غلطةُ طباعة.` };

  const codes = [];
  for (let i = 1; i <= t; i += 1) codes.push(formatParcelCode(shipmentCode, i));
  return { codes, problem: '' };
}

/** مفتاح عدّاد الشحنات — لكلّ فرعٍ ويومٍ عدّادُه (نمط `lpnCounterKey`). */
export function shipmentCounterKey({ branch, date } = {}) {
  const b = up(branch);
  const stamp = shipmentDateStamp(date);
  if (!SCOPE_RE.test(b) || !/^\d{8}$/.test(stamp)) return '';
  return [SHIPMENT_PREFIX, b, stamp].join(SEGMENT_SEPARATOR);
}

/** المختصر الذي يقرأه العامل من بعيد — آخرُ ثلاثِ خاناتٍ ورقمُ الطرد. */
export function shortShipmentLabel(raw) {
  const p = parseShipmentCode(raw);
  if (!p) return normalizeScan(raw);
  const tail = String(p.seq).padStart(SHIPMENT_SEQ_DIGITS, '0').slice(-3);
  return p.isParcel ? `${tail}/${String(p.parcelNo).padStart(PARCEL_DIGITS, '0')}` : tail;
}
