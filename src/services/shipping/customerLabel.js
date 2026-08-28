/**
 * ملصق العميل ‹LPN-713› — عشرة حقولٍ تُسحب من أمر الصرف ولا تُكتب. منطق خالص.
 *
 * ═══ القاعدة التي نصّ عليها الطلب حرفيًّا ═══
 * «**لا يُسمح للموظّف بتغيير اسم العميل أو رقم الطلب داخل الملصق يدويًّا؛ بل
 * تُسحب البيانات من أمر الصرف المعتمد.**»
 *
 * ولماذا هذا التشدّد؟ لأنّ ملصق العميل هو **آخر ما يُقرأ** قبل أن تخرج
 * البضاعة: بعده لا مراجعةَ ولا نظام — سائقٌ وورقة. فحقلٌ يُكتب بيدٍ هنا يعني
 * شحنةً تصل إلى العميل الخطأ، ولا يُكتشف إلّا حين يشتكي اثنان.
 *
 * ═══ ★★ والحارس في **البناء** لا في الواجهة ═══
 * `buildCustomerLabel` لا يقبل اسم عميلٍ ولا رقم طلبٍ من المستدعي أصلًا —
 * يقرؤهما من المستند. ولو تُرك للواجهة لَمرّ من أوّل شاشةٍ تُكتب على عجل
 * (الدرس نفسه في `barcodeKinds.valueSourceProblem`).
 *
 * ═══ وأمرٌ غير معتمَدٍ لا يُخرج ملصقًا ═══
 * يُقاس بـ`canDeriveFrom` من محرّك المستندات القائم — لا بفحصٍ ثانٍ يفترق عنه.
 */

import { canDeriveFrom } from '../documents/states.js';
import { parcelOfTotal, parseShipmentCode, shipmentCodeProblem, shortShipmentLabel } from './shipmentCode.js';
import { normalizeScan } from '../barcodes/barcodeCode.js';
import { parcelCard } from './packingFlow.js';

/**
 * الحقول العشرة — **معلنةً** لا مبعثرةً في JSX: الشاشةُ والاختبارُ والتقريرُ
 * ثلاثتُها تقرأ القائمة نفسها، فلا يسقط حقلٌ من ملصقٍ ويبقى في آخر.
 */
export const CUSTOMER_LABEL_FIELDS = Object.freeze([
  { key: 'customerName', labelAr: 'اسم العميل', source: 'أمر الصرف' },
  { key: 'orderRef', labelAr: 'رقم الطلب', source: 'أمر الصرف' },
  { key: 'shipment', labelAr: 'رقم الشحنة', source: 'جلسة التعبئة' },
  { key: 'destination', labelAr: 'الفرع أو عنوان التسليم', source: 'أمر الصرف' },
  { key: 'route', labelAr: 'خطّ السير أو الرحلة', source: 'أمر الصرف' },
  { key: 'parcelTotal', labelAr: 'عدد الطرود', source: 'جلسة التعبئة' },
  { key: 'ofTotal', labelAr: 'رقم الطرد', source: 'محسوب' },
  { key: 'barcodeValue', labelAr: 'باركود الطرد', source: 'نحو الشحنة' },
  { key: 'preparedAt', labelAr: 'تاريخ ووقت التجهيز', source: 'جلسة التعبئة' },
  { key: 'instructions', labelAr: 'تعليمات التسليم', source: 'أمر الصرف' },
]);

/** مقاس ملصق العميل — ١٠×١٥ كملصق الطبلية، فطابعةٌ واحدةٌ تكفي المستودع. */
export const CUSTOMER_LABEL_SIZE = Object.freeze({ widthMm: 100, heightMm: 150 });

const s = (v) => String(v ?? '').trim();

/**
 * الحقول التي **يُمنع** تمريرها من الواجهة — تُسحب من المستند وحده.
 * وهي بعينها ما نهى عنه النصّ.
 */
export const SEALED_FIELDS = Object.freeze(['customerName', 'customerCode', 'orderRef']);

/** سببُ رفض قيمةٍ مُملاةٍ يدويًّا لحقلٍ مختوم — أو `''`. */
export function manualOverrideProblem(overrides) {
  const touched = SEALED_FIELDS.filter((f) => s(overrides?.[f]));
  if (!touched.length) return '';
  const names = touched.map((f) => CUSTOMER_LABEL_FIELDS.find((x) => x.key === f)?.labelAr ?? f);
  return `${names.join(' و')} تُسحب من أمر الصرف المعتمد ولا تُكتب على الملصق — النصّ الحاكم يمنعه.`;
}

/**
 * سببُ منع إخراج ملصق عميل — أو `''`.
 *
 * @param {object} session جلسة التعبئة
 * @param {number} parcelNo رقم الطرد
 * @param {{order:object}} ctx أمر الصرف المعتمد
 */
export function customerLabelProblem(session, parcelNo, { order, overrides = null } = {}) {
  const manual = manualOverrideProblem(overrides);
  if (manual) return manual;

  if (!order) return 'لا أمر صرفٍ مرتبط — الملصق يُسحب منه ولا يُخترع.';
  if (!canDeriveFrom(s(order?.state))) {
    return `أمرُ الصرف «${s(order?.number) || s(order?.id)}» ${s(order?.state) === 'draft' ? 'مسوّدة' : 'غير معتمَد'} — لا يُخرج ملصقًا حتى يُعتمد.`;
  }

  const shipmentProblem = shipmentCodeProblem(session?.shipment);
  if (shipmentProblem) return shipmentProblem;

  const card = parcelCard(session, parcelNo);
  if (!card) return `لا طردَ برقم ${parcelNo ?? ''} في هذه الجلسة.`;
  if (card.state === 'CANCELLED') return `الطرد ${card.no} ملغًى — لا ملصقَ لملغى.`;
  return '';
}

/**
 * يبني ملصق طردٍ واحد — أو `null` مع السبب في `customerLabelProblem`.
 *
 * لا يقبل `customerName` ولا `orderRef` من المستدعي: يقرؤهما من `order`.
 */
export function buildCustomerLabel(session, parcelNo, { order, at = '', company = 'Brandzo' } = {}) {
  if (customerLabelProblem(session, parcelNo, { order })) return null;
  const card = parcelCard(session, parcelNo);
  const parsed = parseShipmentCode(card.code);

  return {
    company,
    size: CUSTOMER_LABEL_SIZE,
    // ① اسم العميل ② رقم الطلب — من المستند وحده
    customerName: s(order?.customerName ?? order?.partnerName),
    customerCode: s(order?.customerCode ?? order?.partnerCode),
    orderRef: s(order?.number ?? order?.id ?? session?.orderRef),
    // ③ رقم الشحنة ④ الوجهة ⑤ خطّ السير
    shipment: normalizeScan(session?.shipment),
    destination: s(order?.destination ?? order?.branchName ?? order?.shipTo ?? session?.branch),
    route: s(order?.route ?? session?.route),
    // ⑥ عدد الطرود ⑦ «١ من ٤»
    parcelTotal: session?.parcelTotal ?? 0,
    parcelNo: card.no,
    ofTotal: parcelOfTotal(card.no, session?.parcelTotal),
    // ⑧ باركود الطرد — فريدٌ ومرتبطٌ بالشحنة نفسها
    barcodeValue: card.code,
    shortLabel: shortShipmentLabel(card.code),
    // ⑨ تاريخ ووقت التجهيز ⑩ تعليمات التسليم
    preparedAt: s(at) || s(session?.closedAt) || s(session?.openedAt),
    instructions: s(order?.deliveryNotes ?? order?.instructions ?? order?.notes),
    // للعرض — مشتقٌّ لا مخزَّن
    branch: s(parsed?.branch ?? session?.branch),
    qty: card.qty,
    reprint: (card.labelCopies ?? 0) > 0,
    copy: (card.labelCopies ?? 0) + 1,
    reopened: card.reopened,
  };
}

/**
 * ملصقات الشحنة كلَّها — الملغى يُستبعد، والباقي بترتيب أرقامه.
 *
 * @returns {{labels:object[], problem:string}}
 */
export function buildAllCustomerLabels(session, { order, at = '', company = 'Brandzo' } = {}) {
  const shipmentProblem = shipmentCodeProblem(session?.shipment);
  if (shipmentProblem) return { labels: [], problem: shipmentProblem };

  const labels = [];
  for (const parcel of session?.parcels ?? []) {
    if (parcel.state === 'CANCELLED') continue;
    const label = buildCustomerLabel(session, parcel.no, { order, at, company });
    if (label) labels.push(label);
  }
  if (!labels.length) {
    return { labels: [], problem: customerLabelProblem(session, session?.parcels?.[0]?.no, { order }) || 'لا طرودَ تُطبع.' };
  }
  return { labels, problem: '' };
}

/**
 * ★ فحصُ اكتمال الملصق — أيُّ حقلٍ من العشرة فارغ؟
 *
 * ولا يُمنع الطبع بفراغ حقلٍ اختياريّ (التعليمات قد لا توجد) — يُعلَن فقط،
 * فيعرف المعبِّئ ما ينقص قبل أن يخرج الملصق من الطابعة.
 */
export function labelGaps(label) {
  const optional = new Set(['instructions', 'route']);
  return CUSTOMER_LABEL_FIELDS.filter((f) => {
    const v = label?.[f.key];
    return !optional.has(f.key) && (v === '' || v === null || v === undefined || v === 0);
  }).map((f) => f.labelAr);
}
