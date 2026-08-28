/**
 * فئتا الباركود وصلاحيّاتهما ‹LPN-702› — بنيةُ المدير وتشغيلُ الموظّف. منطق خالص.
 *
 * ═══ الفصل الذي طلبه النصّ حرفيًّا ═══
 * «باركودات بصلاحية المدير»: المستودعات والمناطق والممرّات والرفوف والخانات
 * ومناطق التحضير وأبواب التحميل وأبواب الاستلام وبوّابات الخروج والسيارات —
 * **هذه باركودات رئيسيّة وثابتة، ولا يجوز للموظّف العادي إنشاؤها أو تغييرها**.
 *
 * «باركودات بصلاحية الموظّف»: الطبلية أثناء الاستلام، والطرد أثناء التعبئة،
 * وملصق طلب العميل، وملصق الشحنة أو المرتجع — **أثناء مهمّةٍ مصرَّح بها**.
 *
 * ═══ ولماذا فئتان لا قائمةُ أدوارٍ لكلّ نوع ═══
 * لأنّ الفرق **جوهريّ لا إداريّ**: باركود البنية يصف **المبنى** — يُطبع مرّةً
 * ويُلصق على حديدٍ ويبقى سنين، وخطؤه يُفسد كلّ حركةٍ تمرّ به. وباركود التشغيل
 * يصف **حمولةً عابرة** — يولد ويُغلق في يوم. فقائمةُ أدوارٍ لكلّ نوعٍ تُخفي
 * هذا الفرق خلف جدول، وفئتان تُظهرانه.
 *
 * ═══ والمصفوفة تُقرأ من `lpnRoles` ولا تُنسخ ═══
 * الأدوار الميدانيّة الثمانية وخريطتُها إلى أدوار البوّابة مبنيّةٌ ومختبَرة في
 * [`lpn/lpnRoles.js`](../lpn/lpnRoles.js) ‹LPN-506›. فهذا الملفّ **يسألها**:
 * جدولُ أدوارٍ ثانٍ يعني دورًا يُضاف في مكانٍ ويُنسى في آخر.
 *
 * ═══ ★★ والقاعدة التي لا استثناء لها ═══
 * **الموظّف لا يكتب رقم الباركود بنفسه — النظام يولّده وفق التسلسل.**
 * وهي محروسةٌ هنا بالبناء لا بالواجهة: قيمةٌ ممرَّرةٌ من الخارج لنوعٍ تشغيليّ
 * تُرفض. ولو تُركت للواجهة لَمرّت من أوّل شاشةٍ تُكتب على عجل.
 */

import { BARCODE_KINDS } from './barcodeCode.js';
import { canDo, fieldRolesOf } from '../lpn/lpnRoles.js';

/** الفئتان — وصفُ كلٍّ يُعرض للمستخدم كما هو. */
export const BARCODE_CLASSES = Object.freeze({
  STRUCTURE: Object.freeze({
    id: 'STRUCTURE',
    labelAr: 'باركود بنية',
    hint: 'يصف المبنى: موقعٌ أو بابٌ أو بوّابةٌ أو مركبة. يولّده المدير ويبقى ثابتًا.',
  }),
  OPERATION: Object.freeze({
    id: 'OPERATION',
    labelAr: 'باركود تشغيل',
    hint: 'يصف حمولةً عابرة: طبليةٌ أو شحنةٌ أو طرد. يولّده الموظّف أثناء مهمّةٍ مصرَّح بها.',
  }),
});

/**
 * فئةُ كلّ نوع. `ITEM` غائبٌ عمدًا: باركود الصنف **يأتي من المورّد** ولا
 * يولّده أحدٌ عندنا — وإدراجه فئةً يوهم أنّنا نصنعه.
 */
export const KIND_CLASS = Object.freeze({
  [BARCODE_KINDS.LOCATION.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.STAGING.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.DOCK_IN.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.DOCK_OUT.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.GATE_OUT.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.VEHICLE.id]: BARCODE_CLASSES.STRUCTURE.id,
  [BARCODE_KINDS.PALLET.id]: BARCODE_CLASSES.OPERATION.id,
  [BARCODE_KINDS.SHIPMENT.id]: BARCODE_CLASSES.OPERATION.id,
  [BARCODE_KINDS.PARCEL.id]: BARCODE_CLASSES.OPERATION.id,
});

/** الأنواع التي يولّدها النظام فعلًا — ما عداها يُقرأ ولا يُنشأ. */
export const GENERATABLE_KINDS = Object.freeze(Object.keys(KIND_CLASS));

/** عمليّات الباركود — ما يُفعل به بعد أن يوجد. */
export const BARCODE_OPS = Object.freeze({
  GENERATE: 'توليد',
  BULK_GENERATE: 'توليد جماعيّ',
  PRINT: 'طباعة',
  REPRINT: 'إعادة طباعة',
  VOID: 'إلغاء أو إيقاف',
  RESOLVE: 'معالجة تكرارٍ أو استثناء',
});

/**
 * أدوارُ الميدان التي تملك **البنية**. المشرف والمدير وحدهما — والحوكمة
 * تعتمد ولا تبني (فصلُ المهامّ نفسه في `lpnRoles`).
 */
const STRUCTURE_FIELD_ROLES = Object.freeze(['SUPERVISOR', 'ADMIN']);

/**
 * العمليّةُ الميدانيّة التي تُجيز توليد كلّ نوعٍ تشغيليّ.
 *
 * الطبلية تولد أثناء **الاستلام** أو أثناء **التحضير** (طبلية صرف) —
 * فنوعٌ واحدٌ بمُجيزَين، والقبول لمن يملك أيًّا منهما.
 */
const OPERATION_KIND_OPS = Object.freeze({
  [BARCODE_KINDS.PALLET.id]: Object.freeze(['RECEIVE', 'PICK']),
  [BARCODE_KINDS.SHIPMENT.id]: Object.freeze(['STAGE', 'LOAD']),
  [BARCODE_KINDS.PARCEL.id]: Object.freeze(['STAGE', 'LOAD']),
});

const s = (v) => String(v ?? '').trim();

/** فئةُ نوعٍ ما — أو `''` لنوعٍ لا يولّده النظام. */
export function classOf(kind) {
  return KIND_CLASS[kind] ?? '';
}

/** هل النوع من البنية؟ */
export function isStructureKind(kind) {
  return classOf(kind) === BARCODE_CLASSES.STRUCTURE.id;
}

/** هل الدور مخوَّلٌ ببنية المستودع؟ */
export function ownsStructure(portalRole) {
  return fieldRolesOf(portalRole).some((r) => STRUCTURE_FIELD_ROLES.includes(r));
}

/**
 * سببُ منع دورٍ من توليد نوعٍ — أو `''` إن جاز.
 *
 * الرسالة **تسمّي الصلاحية المطلوبة** لا تقول «ممنوع»: عاملٌ يُمنع ولا يعرف
 * ممّن يطلب يبقى واقفًا، وعاملٌ يقرأ «هذه باركودات بنيةٍ يولّدها مشرف المخزن»
 * يمضي إلى مشرفه.
 */
export function generateProblem(kind, { portalRole } = {}) {
  if (!GENERATABLE_KINDS.includes(kind)) {
    return `النوع «${BARCODE_KINDS[kind]?.labelAr ?? kind ?? ''}» لا يولّده النظام — يُقرأ ولا يُنشأ.`;
  }
  if (isStructureKind(kind)) {
    if (ownsStructure(portalRole)) return '';
    return `«${BARCODE_KINDS[kind].labelAr}» من ${BARCODE_CLASSES.STRUCTURE.labelAr} — يولّده مشرف المخزن أو مدير النظام، لا الموظّف.`;
  }
  const allowed = OPERATION_KIND_OPS[kind] ?? [];
  if (allowed.some((op) => canDo(portalRole, op))) return '';
  return `توليد «${BARCODE_KINDS[kind].labelAr}» يحتاج صلاحيّة مهمّةٍ ميدانيّة (${allowed.join(' أو ')}) — ودورك لا يملكها.`;
}

/**
 * ★★ حكمُ التوليد الكامل — الصلاحيةُ **والسياق** معًا.
 *
 * ولماذا السياق شرط؟ لأنّ النصّ قيّد باركود الموظّف بأنّه «أثناء مهمّةٍ
 * مصرَّح بها»: طردٌ يولد بلا طلبٍ يخصّه هويّةٌ بلا حمولة — تُطبع وتُلصق
 * ويضيع أثرُها. فالتشغيليُّ يلزمه **مستندٌ أو مهمّة**، والبنيويّ يلزمه **سبب**
 * (لماذا يُنشأ بابٌ جديد اليوم؟) — وكلاهما يُقيَّد في السجلّ للأبد.
 *
 * @returns {{ok:boolean, message:string, class:string}}
 */
export function generateVerdict(kind, { portalRole, docRef = '', taskId = '', reason = '' } = {}) {
  const problem = generateProblem(kind, { portalRole });
  if (problem) return { ok: false, message: problem, class: classOf(kind) };

  if (isStructureKind(kind)) {
    if (!s(reason)) {
      return {
        ok: false,
        message: `${BARCODE_CLASSES.STRUCTURE.labelAr} يبقى في المبنى سنين — اكتب سبب إنشائه، فهو ما يُقرأ بعد سنة.`,
        class: BARCODE_CLASSES.STRUCTURE.id,
      };
    }
    return { ok: true, message: '', class: BARCODE_CLASSES.STRUCTURE.id };
  }

  if (!s(docRef) && !s(taskId)) {
    return {
      ok: false,
      message: `${BARCODE_CLASSES.OPERATION.labelAr} لا يولد إلّا أثناء مهمّةٍ مصرَّح بها — لا مستندَ ولا مهمّةَ مرتبطة.`,
      class: BARCODE_CLASSES.OPERATION.id,
    };
  }
  return { ok: true, message: '', class: BARCODE_CLASSES.OPERATION.id };
}

/**
 * ★★ حارسُ «النظام يولّد لا الموظّف» — قيمةٌ ممرَّرةٌ من الخارج تُرفض.
 *
 * والاستثناء الوحيد **البنية**: بابٌ أو منطقةٌ يسمّيها المدير بكودٍ يطابق
 * المبنى (`W01-DOCK-OUT-03` رقمُه مكتوبٌ على الحديد)، فهو لا يخترع تسلسلًا
 * بل **يصف واقعًا**. وأمّا الطبلية والطرد فتسلسلٌ لا يُملى.
 */
export function valueSourceProblem(kind, { value = '' } = {}) {
  if (!s(value)) return '';
  if (isStructureKind(kind)) return '';
  return `رقم «${BARCODE_KINDS[kind]?.labelAr ?? kind}» يولّده النظام وفق التسلسل — لا يُكتب بيد.`;
}

/** سببُ منع عمليّةٍ على باركودٍ قائم — أو `''` إن جازت. */
export function opProblem(op, kind, { portalRole } = {}) {
  switch (op) {
    case 'PRINT':
      return canDo(portalRole, 'PRINT') || ownsStructure(portalRole)
        ? ''
        : 'الطباعة تحتاج صلاحيّة طباعة الملصق — ودورك لا يملكها.';
    case 'REPRINT':
      return canDo(portalRole, 'REPRINT')
        ? ''
        : 'إعادة الطباعة تحتاج صلاحيّة معلنة — لأنّ ملصقين متطابقين على حمولتين أسوأ ما يقع في مستودعٍ يعمل بالباركود.';
    case 'BULK_GENERATE':
    case 'VOID':
    case 'RESOLVE':
      return ownsStructure(portalRole)
        ? ''
        : `«${BARCODE_OPS[op]}» من صلاحيّات المدير أو المشرف وحدهما.`;
    case 'GENERATE':
      return generateProblem(kind, { portalRole });
    default:
      return `عمليّةٌ غير معروفة «${op ?? ''}».`;
  }
}

/**
 * وسمُ العرض الذي طلبه النصّ: «أُنشئ بواسطة المدير» أو «بواسطة الموظّف أثناء
 * العمليّة رقم…». **مشتقٌّ** من فئة القيد ومستنده — لا حقلٌ يُكتب فيكذب.
 */
export function originLabel(entry) {
  const cls = s(entry?.class);
  const who = s(entry?.createdByName) || s(entry?.createdBy);
  if (cls === BARCODE_CLASSES.STRUCTURE.id) {
    return who ? `أُنشئ بواسطة المدير ${who}` : 'أُنشئ بواسطة المدير';
  }
  const ref = s(entry?.docRef) || s(entry?.taskId);
  const head = who ? `أُنشئ بواسطة الموظّف ${who}` : 'أُنشئ بواسطة الموظّف';
  return ref ? `${head} أثناء العمليّة ${ref}` : head;
}
