/**
 * هويّة المركبة الممسوحة ‹LPN-707› — `VEH-RH-TRK-001`. منطق خالص.
 *
 * ═══ الفجوة (ف-١٣) ═══
 * التحميل اليوم **يختار** المركبة من قائمة. والنصّ رفض هذا صراحةً وقال الغرض:
 * «إثباتُ أنّ عمليّة التحميل تمّت على السيارة الصحيحة، **وليس اختيارها من
 * قائمة فقط**». والفرق ليس شكليًّا: الاختيار يقع والموظّف في المكتب، والمسح لا
 * يقع إلّا وهو **بجانب السيارة** — والملصق يُثبَّت داخلها في نقطةٍ لا تُمسح
 * إلّا هناك.
 *
 * ═══ ★★ والهويّة ثابتةٌ والسائق متغيّر ═══
 * «إذا تغيّر السائق، تبقى هويّة السيارة ثابتة ويُحدَّث اسم السائق في الرحلة».
 * ولذلك **لا يدخل السائق في الكود** ولا في السجلّ — يُقرأ من الرحلة الجارية.
 * وكودٌ يحمل اسم سائقٍ يصير كذبًا أوّلَ إجازة.
 *
 * ═══ والسجلّ القائم لا يُنسخ ═══
 * `vehicles/{vehicleId}` يعرف اللوحة والماركة والحمولة، و`trips` تعرف الرحلة
 * والسائق. فهذا الملفّ **نحوٌ وجسر**: يبني الهويّة ويقرأ منها، ويجمع بطاقة
 * العرض من المصادر القائمة — ولا يُنشئ سجلَّ مركباتٍ ثانيًا.
 */

import { SEGMENT_SEPARATOR, VEHICLE_PREFIX, classifyScan, normalizeScan } from './barcodeCode.js';

/**
 * أنواع المركبات المعروفة — للعرض ولاقتراح النوع، **لا للحصر**: أسطولٌ يكبر
 * ونوعٌ يُشترى لا ينبغي أن يوقفه تعديلُ كود.
 */
export const VEHICLE_TYPES = Object.freeze({
  TRK: 'شاحنة',
  VAN: 'فان',
  PKP: 'بيك أب',
  REF: 'مبرَّدة',
  TRL: 'مقطورة',
  FRK: 'رافعة شوكيّة',
});

/** عدد خانات التسلسل — ثلاثٌ تكفي ٩٩٩ مركبةً من النوع الواحد في الفرع. */
export const VEHICLE_SEQ_DIGITS = 3;

/** أطول مقطعٍ مقبول — كنحو المواقع والطبالي. */
const MAX_SEGMENT = 12;
const SEGMENT_RE = /^[A-Z0-9]+$/;

const up = (v) => String(v ?? '').trim().toUpperCase();

/** عنوانُ النوع للعرض — والمجهولُ يُعرض برمزه لا بفراغ. */
export function vehicleTypeLabel(type) {
  const t = up(type);
  return VEHICLE_TYPES[t] || t;
}

/**
 * يبني هويّة المركبة. يعيد `''` إن تعذّر بناؤها سليمة — **لا هويّةً عرجاء**
 * (نمط `formatLpnCode` نفسه).
 */
export function formatVehicleCode({ branch, vehicleType, seq } = {}) {
  const b = up(branch);
  const t = up(vehicleType);
  const n = Math.trunc(Number(seq));

  if (!SEGMENT_RE.test(b) || b.length > MAX_SEGMENT) return '';
  if (!SEGMENT_RE.test(t) || t.length > MAX_SEGMENT) return '';
  if (!Number.isFinite(n) || n < 1 || n > 10 ** VEHICLE_SEQ_DIGITS - 1) return '';

  return [VEHICLE_PREFIX, b, t, String(n).padStart(VEHICLE_SEQ_DIGITS, '0')].join(SEGMENT_SEPARATOR);
}

/** يفكّ الهويّة إلى مقاطعها — أو `null` لغير صالحة. */
export function parseVehicleCode(raw) {
  const scan = classifyScan(raw);
  if (scan.kind !== 'VEHICLE') return null;
  return {
    code: scan.code,
    branch: scan.parts.branch,
    vehicleType: scan.parts.vehicleType,
    typeLabel: vehicleTypeLabel(scan.parts.vehicleType),
    seq: Number(scan.parts.seq),
  };
}

/** سببُ رفض هويّة مركبة — أو `''`. الرسالة تحمل الصورة الصحيحة. */
export function vehicleCodeProblem(raw) {
  const value = normalizeScan(raw);
  if (!value) return 'هويّة المركبة مطلوبة.';
  const scan = classifyScan(value);
  if (scan.kind === 'VEHICLE') return '';
  return scan.problem || `«${value}» ليس هويّة مركبة — الصورة: ${VEHICLE_PREFIX}-RH-TRK-001`;
}

/** مفتاح عدّاد التسلسل — لكلّ فرعٍ ونوعٍ عدّادُه، فلا يفيض ولا يتصادم. */
export function vehicleCounterKey({ branch, vehicleType } = {}) {
  const b = up(branch);
  const t = up(vehicleType);
  if (!b || !t) return '';
  return [VEHICLE_PREFIX, b, t].join(SEGMENT_SEPARATOR);
}

/**
 * يقترح نوع المركبة من سجلّها القائم — الحقلُ الصريح أوّلًا، ثمّ الوصف.
 *
 * ولماذا اقتراحٌ لا استنتاجٌ قاطع؟ لأنّ الوصف نصٌّ حرّ كتبه بشر: «تريلا»
 * و«شاحنة كبيرة» و«مقطورة» كلُّها مقطورة، ولا يُبنى حكمٌ قاطعٌ على نصٍّ حرّ.
 * فيُقترح ويُصحّح المدير قبل الاعتماد.
 */
export function suggestVehicleType(vehicle) {
  const explicit = up(vehicle?.vehicleType ?? vehicle?.type);
  if (explicit && VEHICLE_TYPES[explicit]) return explicit;

  const text = `${vehicle?.desc ?? ''} ${vehicle?.brand ?? ''} ${vehicle?.model ?? ''} ${vehicle?.category ?? ''}`;
  if (/مبرَّد|مبرد|ثلاج|REEFER|REF/i.test(text)) return 'REF';
  if (/مقطور|تريل|TRAILER/i.test(text)) return 'TRL';
  if (/رافع|شوكي|FORK/i.test(text)) return 'FRK';
  if (/بيك|وانيت|PICK/i.test(text)) return 'PKP';
  if (/فان|VAN/i.test(text)) return 'VAN';
  if (/شاحن|قلاب|TRUCK/i.test(text)) return 'TRK';
  return 'TRK';
}

/**
 * ★★ بطاقة باركود المركبة — التسعةُ التي عدّدها النصّ، **محسوبةً من المصادر
 * القائمة** لا مخزَّنةً في حقولٍ تفترق عن الواقع.
 *
 * @param {object} vehicle سجلّ المركبة (`vehicles/{id}`)
 * @param {{trip?:object, visits?:object[], units?:object[], parcels?:object[]}} ctx
 */
export function vehicleBarcodeCard(vehicle, { trip = null, visits = [], units = [], parcels = [] } = {}) {
  const code = normalizeScan(vehicle?.barcode ?? vehicle?.vehicleCode ?? '');
  const parsed = code ? parseVehicleCode(code) : null;
  const vehicleId = String(vehicle?.id ?? '').trim();
  const plate = String(vehicle?.plateNo ?? '').trim();

  const myVisits = (visits ?? []).filter(
    (v) => String(v?.vehicleId ?? '').trim() === vehicleId || String(v?.plateNo ?? '').trim() === plate
  );

  return {
    code,
    valid: Boolean(parsed),
    // ① رقم السيارة الداخليّ ② رقم اللوحة ③ نوعها ④ فرعها
    internalNo: String(vehicle?.internalNo ?? vehicle?.assetNo ?? vehicleId).trim(),
    plateNo: plate,
    vehicleType: parsed?.vehicleType || suggestVehicleType(vehicle),
    typeLabel: vehicleTypeLabel(parsed?.vehicleType || suggestVehicleType(vehicle)),
    branch: parsed?.branch || up(vehicle?.branch ?? vehicle?.warehouse),
    // ⑤ السائق الحاليّ — من الرحلة لا من المركبة: الهويّة تثبت والسائق يتغيّر
    driverName: String(trip?.driverName ?? '').trim(),
    // ⑥ حالة المركبة ⑦ الرحلة الجارية
    status: String(vehicle?.status ?? '').trim(),
    tripId: String(trip?.id ?? '').trim(),
    tripState: String(trip?.state ?? '').trim(),
    // ⑧ أبواب التحميل المستعملة — من زيارات الساحة، بلا تكرار
    doors: [...new Set(myVisits.map((v) => up(v?.door)).filter(Boolean))],
    // ⑨ المحمَّل عليها: طبالٍ وطرودٍ وطلبات
    unitCodes: (units ?? []).map((u) => normalizeScan(u?.code ?? u)).filter(Boolean),
    parcelCodes: (parcels ?? []).map((p) => normalizeScan(p?.code ?? p)).filter(Boolean),
    orderRefs: [
      ...new Set(
        [...(units ?? []), ...(parcels ?? [])]
          .map((x) => String(x?.orderRef ?? x?.docRef ?? '').trim())
          .filter(Boolean)
      ),
    ],
  };
}

/**
 * حكمُ مطابقة مركبةٍ ممسوحةٍ برحلةٍ قائمة — الرسالة تسمّي المتوقَّع والممسوح.
 *
 * وهو الحارس الذي يمنع أخطر خطأ عند الباب: **التحميل على السيارة الخطأ**،
 * ولا يُكتشف إلّا حين يشتكي فرعٌ من نقصٍ وآخرُ من زيادة.
 */
export function vehicleMatchVerdict(scanned, { expectedCode = '', expectedPlate = '' } = {}) {
  const problem = vehicleCodeProblem(scanned);
  if (problem) return { ok: false, message: problem };

  const code = normalizeScan(scanned);
  const want = normalizeScan(expectedCode);
  if (!want) {
    return { ok: true, message: '', code };
  }
  if (code === want) return { ok: true, message: '', code };
  return {
    ok: false,
    message: `هذه ليست مركبة الرحلة. المطلوبة «${want}»${expectedPlate ? ` (لوحة ${expectedPlate})` : ''} والممسوحة «${code}».`,
    code,
  };
}
