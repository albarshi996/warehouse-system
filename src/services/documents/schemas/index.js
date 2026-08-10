/**
 * سجلّ مخطّطات المستندات — أضف نموذجًا هنا، فيعمل في المحرّك كاملًا.
 *
 * النطاق المعتمد (قرار المالك 2026-07-15): **الدورة المحكومة**. النماذج
 * الإدارية (Report21 · DailyHuddle · WeeklyCheck) تبقى للطباعة كما هي.
 *
 * ⚠️ بلغت المجموعة **27** نموذجًا محكومًا: بعد الأربعة والعشرين أُضيف في
 * «التحسينات الجراحية» (2026-08-04) **تأكيد التسليم (POD)** و**إشعار رفض
 * الاستلام (SRN)**، ثمّ **مستند مناولة الحاوية (CTR)** التوثيقيّ (المحور
 * الثاني، 2026-08-05) — والعدّ الحيّ من SCHEMAS أدناه لا من رقمٍ مكتوب.
 *
 * الجدول أدناه هو خطة F2→F4 مرئيةً في الكود: كل نموذج ومرحلته وحارسه.
 */
import grn from './grn.js';
import pr from './pr.js';
import po from './po.js';
import qc from './qc.js';
import putaway from './putaway.js';
import pick from './pick.js';
import pack from './pack.js';
import dn from './dn.js';
import pod from './pod.js';
import gp from './gp.js';
import ret from './ret.js';
import srn from './srn.js';
import dmg from './dmg.js';
import cc from './cc.js';
import adj from './adj.js';
import cn from './cn.js';
import so from './so.js';
import inv from './inv.js';
import tr from './tr.js';
import trn from './trn.js';
import trc from './trc.js';
import ctr from './ctr.js';
// دورة البيع من المركبة (المستودع المتنقّل): تحميل ← بيع ← مرتجع ← إرجاع ← تسوية
import vld from './vld.js';
import vsi from './vsi.js';
import crn from './crn.js';
import vrt from './vrt.js';
import vsr from './vsr.js';
// دورة المشتريات الداخلية (طلبات الإدارات من المالية): طلب ← عروض ← أمر ← صرف ← تسليم
import ipr from './ipr.js';
import rfq from './rfq.js';
import ipo from './ipo.js';
import pv from './pv.js';
import dlv from './dlv.js';

/** المخطّطات الجاهزة. */
const SCHEMAS = {
  PR: pr,
  PO: po,
  GRN: grn,
  QC: qc,
  PUTAWAY: putaway,
  SO: so,
  PICK: pick,
  PACK: pack,
  DN: dn,
  POD: pod,
  GP: gp,
  INV: inv,
  TR: tr,
  TRN: trn,
  TRC: trc,
  CTR: ctr,
  VLD: vld,
  VSI: vsi,
  CRN: crn,
  VRT: vrt,
  VSR: vsr,
  RET: ret,
  SRN: srn,
  DMG: dmg,
  CC: cc,
  ADJ: adj,
  CN: cn,
  IPR: ipr,
  RFQ: rfq,
  IPO: ipo,
  PV: pv,
  DLV: dlv,
};

/**
 * خارطة النماذج المحكومة (26) — للعرض وللتخطيط. `ready` تُشتقّ من SCHEMAS أعلاه
 * فلا يفترق الجدول عن الواقع (درس «تحقّق قبل الثقة»).
 */
export const GOVERNED_FORMS = [
  { type: 'PR', stage: 1, titleAr: 'طلب شراء داخلي', file: 'form_PurchaseRequisition.html', phase: 'F2' },
  { type: 'PO', stage: 2, titleAr: 'أمر الشراء', file: 'form_PO.html', phase: 'F2' },
  { type: 'GRN', stage: 4, titleAr: 'مذكرة استلام البضائع', file: 'form_GRN.html', phase: 'F1' },
  { type: 'QC', stage: 4, titleAr: 'تقرير فحص الجودة', file: 'form_QCReport.html', phase: 'F2' },
  { type: 'PUTAWAY', stage: 5, titleAr: 'أمر التخزين', file: 'form_PutawayList.html', phase: 'F3' },
  { type: 'SO', stage: 6, titleAr: 'أمر البيع', file: '', phase: 'F6' },
  { type: 'PICK', stage: 6, titleAr: 'قائمة السحب', file: 'form_Picking.html', phase: 'F3' },
  { type: 'PACK', stage: 6, titleAr: 'قائمة التعبئة', file: 'form_PackingList.html', phase: 'F3' },
  { type: 'DN', stage: 7, titleAr: 'إذن تسليم', file: 'form_DeliveryNote.html', phase: 'F3' },
  { type: 'POD', stage: 8, titleAr: 'تأكيد التسليم', file: '', phase: 'SI' },
  { type: 'GP', stage: 7, titleAr: 'تصريح خروج من البوابة', file: 'form_GatePass.html', phase: 'F3' },
  { type: 'INV', stage: 12, titleAr: 'فاتورة العميل', file: '', phase: 'F6' },
  { type: 'TR', stage: 6, titleAr: 'طلب نقل', file: '', phase: 'F7' },
  { type: 'TRN', stage: 7, titleAr: 'مستند النقل', file: '', phase: 'F7' },
  { type: 'TRC', stage: 8, titleAr: 'استلام النقل', file: '', phase: 'F7' },
  { type: 'CTR', stage: 4, titleAr: 'مستند مناولة حاوية', file: '', phase: 'SI' },
  // البيع من المركبة (VS): المستودع المتنقّل — تحميلٌ فبيعٌ فمرتجعٌ فإرجاعٌ فتسوية
  { type: 'VLD', stage: 6, titleAr: 'أمر تحميل المركبة', file: '', phase: 'VS' },
  { type: 'VSI', stage: 7, titleAr: 'فاتورة بيع من المركبة', file: '', phase: 'VS' },
  { type: 'CRN', stage: 8, titleAr: 'مرتجع ميدانيّ من العميل', file: '', phase: 'VS' },
  { type: 'VRT', stage: 9, titleAr: 'إرجاع متبقّي المركبة', file: '', phase: 'VS' },
  { type: 'VSR', stage: 10, titleAr: 'تسوية نهاية الرحلة', file: '', phase: 'VS' },
  { type: 'RET', stage: 8, titleAr: 'إشعار الإرجاع', file: 'form_ReturnNote.html', phase: 'F4' },
  { type: 'SRN', stage: 4, titleAr: 'إشعار رفض الاستلام', file: '', phase: 'SI' },
  { type: 'DMG', stage: 8, titleAr: 'سند التالف', file: 'form_Damaged Goods Report.html', phase: 'F4' },
  { type: 'CC', stage: 9, titleAr: 'محضر الجرد الدوري', file: 'form_CycleCount.html', phase: 'F4' },
  { type: 'ADJ', stage: 10, titleAr: 'سند تسوية مخزون', file: 'form_Stock Adjustment Voucher.html', phase: 'F4' },
  { type: 'CN', stage: 11, titleAr: 'إشعار دائن', file: 'form_Credit Note.html', phase: 'F4' },
  // سلسلة المشتريات الداخلية (S12): طلب ← عروض ← أمر ← صرف ← تسليم
  { type: 'IPR', stage: 1, titleAr: 'طلب مشتريات داخلي', file: '', phase: 'IP' },
  { type: 'RFQ', stage: 2, titleAr: 'كشف مقارنة العروض', file: '', phase: 'IP' },
  { type: 'IPO', stage: 3, titleAr: 'أمر شراء داخلي', file: '', phase: 'IP' },
  { type: 'PV', stage: 4, titleAr: 'سند صرف الخزينة', file: '', phase: 'IP' },
  { type: 'DLV', stage: 5, titleAr: 'محضر تسليم للمستفيد', file: '', phase: 'IP' },
].map((f) => ({ ...f, ready: Boolean(SCHEMAS[f.type]) }));

/** يُعيد مخطّط النوع، أو null إن لم يُبنَ بعد. */
export function getSchema(type) {
  return SCHEMAS[type] || null;
}

/** أنواع المستندات الجاهزة فعلًا في المحرّك. */
export function readyTypes() {
  return Object.keys(SCHEMAS);
}

export default SCHEMAS;
