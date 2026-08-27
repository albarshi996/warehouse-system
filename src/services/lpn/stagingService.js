/**
 * خدمة التجهيز — من طبلية صرفٍ مغلقة إلى منطقة تجهيزٍ بمسارها. تنقل ولا تقرّر.
 *
 * ═══ بلا مجموعةٍ جديدة ═══
 * منطقةُ التجهيز **موقعٌ بنحو الكود القائم لا كيانٌ موازٍ** (قرار LPN-305)،
 * فالربطُ نقلةُ موقعٍ وانتقالُ حالةٍ في `handling_units` — وقواعدُها منشورة.
 * ولا قاعدةَ جديدةٌ تنتظر نشرًا (درس LPN-O06/O07).
 *
 * ═══ القاعدة الحاكمة ═══
 * الحكم كلُّه في `stagingLoading` الخالصة. وأخطرُه **منعُ الخلط**: طبليةُ
 * فرعٍ في مسار فرعٍ آخر تخرج مع الشاحنة الخطأ، ولا تُكتشف إلّا حين يشتكي
 * فرعٌ من نقصٍ وآخر من زيادة.
 */
import { getUnit, listUnitsByState, moveUnit, transitionUnit } from './lpnService.js';
import { stagingAssignVerdict } from './stagingLoading.js';

/** الحالة التي تعني «مغلقةٌ تنتظر منطقة تجهيز». */
export const STAGING_QUEUE_STATE = 'ISSUE_CLOSED';

/** قائمةُ الانتظار — والسقفُ يُعلَن حين يُبلَغ فلا تبدو ناقصةٌ كاملة. */
export async function listStagingQueue({ max = 100 } = {}) {
  const units = await listUnitsByState(STAGING_QUEUE_STATE, max);
  return { units, capped: units.length >= max };
}

/** حكمُ منطقة التجهيز — معاينةٌ حيّةٌ بلا كتابة. */
export function previewStaging(unit, binCode, ctx = {}) {
  return stagingAssignVerdict(unit, binCode, ctx);
}

/**
 * ربطُ الطبلية بمنطقة تجهيز.
 *
 * الترتيب مقصود كما في التخزين: **النقلةُ قبل الحالة**. فانقطاعٌ بينهما
 * يترك الطبلية «مغلقةً» في منطقتها الصحيحة — تُعاد المحاولة فتُصحَّح؛
 * والعكسُ كان يخلّف طبليةً «مجهَّزة» بلا منطقةٍ تُعرف.
 */
export async function assignToStaging(code, binCode, { route = '', branch = '', actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const unit = await getUnit(code);
  if (!unit) return { problem: `الطبلية «${code}» غير موجودة — امسح الملصق ثانيةً.` };

  const verdict = stagingAssignVerdict(unit, binCode, { route, branch });
  if (!verdict.ok) return { problem: verdict.message };

  const docRef = unit.sourceDoc ?? null;
  if (!docRef?.id) {
    return { problem: 'الطبلية بلا مستندٍ مصدر — والنقلة تتبع مستندًا (القاعدة ١).' };
  }

  await moveUnit(unit.code, { toBin: verdict.bin, toWarehouse: unit.warehouse ?? '', docRef, actor, at });
  await transitionUnit(unit.code, 'STAGED', { actor, at, doc: docRef });

  return { bin: verdict.bin, stagedAt: at };
}
