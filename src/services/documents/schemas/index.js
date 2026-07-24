/**
 * سجلّ مخطّطات المستندات — أضف نموذجًا هنا، فيعمل في المحرّك كاملًا.
 *
 * النطاق المعتمد (قرار المالك 2026-07-15): **الدورة المحكومة**. النماذج
 * الإدارية (Report21 · DailyHuddle · WeeklyCheck) تبقى للطباعة كما هي.
 *
 * ⚠️ نمت المجموعة من «12» إلى **14** حين فصّلت F4 عنقودَ المرتجعات والمالية
 * إلى خمسة مستندات مستقلّة (إرجاع · تالف · جرد · تسوية · إشعار دائن) كما نصّ
 * المرجع الورقي — والصدق مع الواقع أولى من التمسّك برقمٍ قديم (تحقّق قبل الثقة).
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
import gp from './gp.js';
import ret from './ret.js';
import dmg from './dmg.js';
import cc from './cc.js';
import adj from './adj.js';
import cn from './cn.js';

/** المخطّطات الجاهزة. */
const SCHEMAS = {
  PR: pr,
  PO: po,
  GRN: grn,
  QC: qc,
  PUTAWAY: putaway,
  PICK: pick,
  PACK: pack,
  DN: dn,
  GP: gp,
  RET: ret,
  DMG: dmg,
  CC: cc,
  ADJ: adj,
  CN: cn,
};

/**
 * خارطة الـ12 المحكومة — للعرض وللتخطيط. `ready` تُشتقّ من SCHEMAS أعلاه
 * فلا يفترق الجدول عن الواقع (درس «تحقّق قبل الثقة»).
 */
export const GOVERNED_FORMS = [
  { type: 'PR', stage: 1, titleAr: 'طلب شراء داخلي', file: 'form_PurchaseRequisition.html', phase: 'F2' },
  { type: 'PO', stage: 2, titleAr: 'أمر الشراء', file: 'form_PO.html', phase: 'F2' },
  { type: 'GRN', stage: 4, titleAr: 'مذكرة استلام البضائع', file: 'form_GRN.html', phase: 'F1' },
  { type: 'QC', stage: 4, titleAr: 'تقرير فحص الجودة', file: 'form_QCReport.html', phase: 'F2' },
  { type: 'PUTAWAY', stage: 5, titleAr: 'أمر التخزين', file: 'form_PutawayList.html', phase: 'F3' },
  { type: 'PICK', stage: 6, titleAr: 'قائمة السحب', file: 'form_Picking.html', phase: 'F3' },
  { type: 'PACK', stage: 6, titleAr: 'قائمة التعبئة', file: 'form_PackingList.html', phase: 'F3' },
  { type: 'DN', stage: 7, titleAr: 'إذن تسليم', file: 'form_DeliveryNote.html', phase: 'F3' },
  { type: 'GP', stage: 7, titleAr: 'تصريح خروج من البوابة', file: 'form_GatePass.html', phase: 'F3' },
  { type: 'RET', stage: 8, titleAr: 'إشعار الإرجاع', file: 'form_ReturnNote.html', phase: 'F4' },
  { type: 'DMG', stage: 8, titleAr: 'سند التالف', file: 'form_Damaged Goods Report.html', phase: 'F4' },
  { type: 'CC', stage: 9, titleAr: 'محضر الجرد الدوري', file: 'form_CycleCount.html', phase: 'F4' },
  { type: 'ADJ', stage: 10, titleAr: 'سند تسوية مخزون', file: 'form_Stock Adjustment Voucher.html', phase: 'F4' },
  { type: 'CN', stage: 11, titleAr: 'إشعار دائن', file: 'form_Credit Note.html', phase: 'F4' },
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
