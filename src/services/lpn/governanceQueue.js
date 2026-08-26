/**
 * طابور حوكمة الطبالي — القرارات السبعة وبطاقة المراجعة. منطق خالص.
 *
 * المشكلة التي يحلّها: خطة ٧ تضع بين الاستلام والرفّ **بوّابةً بشريّة**:
 * لا تصير الكمّيّة متاحةً للصرف لمجرّد أنّ عاملًا مسحها. فبين «قرأتُ» و«صار
 * مخزونًا» قرارٌ يتحمّله إنسانٌ باسمه — وهذا الملفّ يحكم ذلك القرار.
 *
 * ═══ القاعدة الحاكمة (خطة ٧ رابعًا) ═══
 * **الهويّة يولّدها النظام عند الاعتماد — لا الموظّف ولا قبل الاعتماد.**
 * فما قبل الحوكمة طبليةٌ **قيد التكوين** بمعرّفٍ مؤقّتٍ داخل جلستها لا
 * يُطبع ولا يُمسح؛ وما بعده حمولةٌ لها هويّةٌ دائمةٌ لا يُعاد استخدامها.
 *
 * وسبب هذا الفصل عمليٌّ لا شكليّ: هويّةٌ تُولَّد قبل الاعتماد تعني أرقامًا
 * محروقةً لكلّ طبليةٍ رُفضت — وملصقاتٍ طُبعت لحمولةٍ لم تدخل المخزن.
 *
 * القرارات السبعة تُحوَّل إلى حالاتٍ وأوسمةٍ في `lpnLifecycle` — لا مصفوفةَ
 * انتقالاتٍ ثانية هنا (سؤالان وحقيقةٌ واحدة).
 */

import { LPN_FLAGS } from './lpnLifecycle.js';
import { rejectionSummary } from './receivingScan.js';

/**
 * قرارات الحوكمة السبعة (خطة ٧ رابعًا) — كلٌّ بأثره المعلن.
 *
 * `state` الحالة التي تصير إليها الطبلية · `flag` الوسم المصاحب إن وُجد ·
 * `needsReason` أيحتاج القرار سببًا مكتوبًا · `generatesIdentity` أيولّد
 * الهويّة الدائمة.
 */
export const GOVERNANCE_DECISIONS = Object.freeze({
  APPROVE: Object.freeze({
    label: 'اعتماد الطبلية',
    state: 'APPROVED',
    flag: null,
    needsReason: false,
    generatesIdentity: true,
  }),
  APPROVE_WITH_NOTE: Object.freeze({
    label: 'اعتماد مع ملاحظة',
    state: 'APPROVED',
    flag: null,
    needsReason: true,
    generatesIdentity: true,
  }),
  RETURN: Object.freeze({
    label: 'إرجاع للموظّف للتصحيح',
    state: 'SCANNING',
    flag: null,
    needsReason: true,
    generatesIdentity: false,
  }),
  INSPECT: Object.freeze({
    label: 'وضعها تحت الفحص',
    state: 'APPROVED',
    flag: 'INSPECTION',
    needsReason: true,
    generatesIdentity: true,
  }),
  HOLD: Object.freeze({
    label: 'حجزها',
    state: 'APPROVED',
    flag: 'GOVERNANCE_HOLD',
    needsReason: true,
    generatesIdentity: true,
  }),
  REJECT: Object.freeze({
    label: 'رفضها',
    state: 'CANCELLED',
    flag: 'REJECTED',
    needsReason: true,
    generatesIdentity: false,
  }),
  PRINT: Object.freeze({
    label: 'طباعة الملصق',
    state: null,
    flag: null,
    needsReason: false,
    generatesIdentity: false,
  }),
});

/**
 * ★ القرارات التي **تُبقي الحمولة في المخزن** — وعليها وحدها تولد الهويّة.
 *
 * «تحت الفحص» و«محجوزة» تولّدان الهويّة عمدًا: الحمولة دخلت المستودع فعلًا
 * وتحتاج ملصقًا يُعرَف به مكانُها، والوسمُ يمنع صرفها لا وجودَها. أمّا
 * المرفوضة فلا تدخل أصلًا — فلا هويّة لها ولا ملصق.
 */
export function decisionOf(id) {
  return Object.hasOwn(GOVERNANCE_DECISIONS, id) ? GOVERNANCE_DECISIONS[id] : null;
}

/** سبب رفض قرارٍ — أو '' إن صحّ. */
export function decisionProblem(pallet, decisionId, { reason, actor } = {}) {
  const decision = decisionOf(decisionId);
  if (!decision) {
    return `القرار «${decisionId ?? ''}» غير معروف — القرارات: ${Object.values(GOVERNANCE_DECISIONS).map((d) => d.label).join(' · ')}.`;
  }
  if (pallet?.state !== 'PENDING_GOVERNANCE' && decisionId !== 'PRINT') {
    return `الطبلية ليست بانتظار الحوكمة — لا يُحكم على ما لم يُرفع بعد.`;
  }
  if (decision.needsReason && !String(reason ?? '').trim()) {
    return `قرار «${decision.label}» يحتاج سببًا مكتوبًا — يبقى في السجلّ باسم صاحبه.`;
  }
  if (!String(actor ?? '').trim()) return 'قرارُ حوكمةٍ بلا فاعلٍ لا يُسجَّل — من قرّر؟';
  return '';
}

/**
 * أثرُ القرار مخطَّطًا — تُنفّذه الخدمة بمعاملةٍ واحدة.
 *
 * @returns {{plan:object}|{problem:string}} و`plan` يحمل: الحالة الجديدة
 *   والوسم وحاجة توليد الهويّة وأنواع الأحداث المطلوبة.
 */
export function planDecision(pallet, decisionId, { reason = '', actor, at } = {}) {
  const problem = decisionProblem(pallet, decisionId, { reason, actor });
  if (problem) return { problem };
  const decision = GOVERNANCE_DECISIONS[decisionId];

  return {
    plan: {
      decision: decisionId,
      label: decision.label,
      nextState: decision.state,
      flag: decision.flag,
      flagLabel: decision.flag ? LPN_FLAGS[decision.flag] : '',
      generatesIdentity: decision.generatesIdentity,
      // الطبلية المعتمدة تدخل قائمة الطباعة تلقائيًّا — لا يطلبها أحد.
      queuesPrint: decision.generatesIdentity,
      eventType: EVENT_OF[decisionId],
      reason: String(reason ?? '').trim(),
      actor: String(actor).trim(),
      at: at ?? null,
    },
  };
}

/** نوعُ الحدث المسجَّل لكلّ قرار — من قائمة `lpnEvents` المقيَّدة. */
const EVENT_OF = Object.freeze({
  APPROVE: 'APPROVED',
  APPROVE_WITH_NOTE: 'APPROVED',
  RETURN: 'RETURNED',
  INSPECT: 'FLAGGED',
  HOLD: 'FLAGGED',
  REJECT: 'REJECTED',
  PRINT: 'LABEL_PRINTED',
});

/**
 * بطاقةُ المراجعة — ما يراه موظّف الحوكمة قبل أن يقرّر (خطة ٧ رابعًا).
 *
 * تسعةُ حقول: الأمر والمورد والمستلم وزمنا القراءة والبنود والدفعات
 * والزائد والمرفوض والاستثناءات. **لا قرارَ بلا هذه الصورة كاملة** — ومن
 * يقرّر على نصفها يوقّع على ما لا يعرف.
 */
export function reviewCard(pallet, session, { rejections = [], exceptions = [] } = {}) {
  const lines = pallet?.lines ?? [];
  const overs = lines.filter((l) => Number(l?.over) > 0);
  const unknownBase = lines.filter((l) => l?.baseUnknown || l?.baseQty === null || l?.baseQty === undefined);

  return {
    palletRef: pallet?.code ?? pallet?.tempRef ?? '',
    order: session?.order ?? null,
    supplier: session?.supplier ?? '',
    warehouse: pallet?.warehouse ?? session?.warehouse ?? '',
    receivedBy: session?.openedBy ?? '',
    startedAt: session?.openedAt ?? '',
    closedAt: pallet?.closedAt ?? '',
    lines,
    lots: lotsOf(lines),
    itemCount: new Set(lines.map((l) => l?.sku).filter(Boolean)).size,
    totalQty: lines.reduce((s, l) => s + (Number(l?.qty) || 0), 0),
    // ★ الأرقام التي تستدعي قرارًا تُرفع للأعلى — لا تُدفن في جدولٍ طويل.
    overs,
    unknownBase,
    rejections,
    rejectionSummary: rejectionSummary(rejections),
    exceptions,
    // أهناك ما يستوجب وقفة؟ — لا يمنع الاعتماد، لكن لا يمرّ بلا أن يُرى.
    needsAttention: overs.length > 0 || rejections.length > 0 || exceptions.length > 0 || unknownBase.length > 0,
  };
}

/** التشغيلات على الطبلية — (دفعة × صلاحية) بمجموعها. */
function lotsOf(lines) {
  const map = new Map();
  for (const l of lines ?? []) {
    const batch = String(l?.batch ?? '').trim().toUpperCase();
    const expiry = String(l?.expiry ?? '').trim();
    if (!batch && !expiry) continue;
    const key = `${batch}__${expiry}`;
    const e = map.get(key) ?? { batch, expiry, qty: 0 };
    e.qty += Number(l?.qty) || 0;
    map.set(key, e);
  }
  return [...map.values()];
}

/**
 * عدّادات لوحة الحوكمة — تُشتقّ من الطبالي لحظيًّا، ولا عدّادَ يُكتب بيد.
 * (عدّادات خطة ٧ الأربعة عشر تُبنى على هذه حين تأتي اللوحة في م٥.)
 */
export function governanceCounters(pallets) {
  const count = (fn) => (pallets ?? []).filter(fn).length;
  return {
    pendingApproval: count((p) => p?.state === 'PENDING_GOVERNANCE'),
    pendingPrint: count((p) => p?.state === 'APPROVED'),
    pendingPutaway: count((p) => p?.state === 'PENDING_PUTAWAY' || p?.state === 'LABEL_PRINTED'),
    underInspection: count((p) => (p?.flags ?? []).includes('INSPECTION')),
    held: count((p) => (p?.flags ?? []).includes('GOVERNANCE_HOLD') || (p?.flags ?? []).includes('ON_HOLD')),
    stored: count((p) => p?.state === 'STORED'),
  };
}
