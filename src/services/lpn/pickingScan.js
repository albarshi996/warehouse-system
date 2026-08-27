/**
 * تنفيذ التحضير بالمسح الثلاثيّ — موقعٌ ثمّ طبليةٌ ثمّ صنف. منطق خالص.
 *
 * المشكلة التي يحلّها: السحب بلا مسحٍ يعتمد على أنّ المحضّر **قرأ الورقة
 * صحيحًا ووقف عند الرفّ الصحيح وأخذ الدفعة الصحيحة**. وثلاثتها تُخطئ في
 * يومٍ مزدحم، ولا يُكتشف الخطأ إلّا عند العميل — أو في الجرد بعد شهر.
 *
 * فالمسح الثلاثيّ يجعل كلّ خطوةٍ مبرهنةً لا مظنونة (خطة ٧ سادسًا).
 *
 * ═══ الموانع السبعة (خطة ٧ حرفيًّا) ═══
 * ①موقعٌ مخالف · ②صنفٌ أو دفعةٌ غير مخصّصة · ③كمّيّةٌ أكبر من المطلوب ·
 * ④طبليةٌ محجوزةٌ أو تحت الفحص · ⑤دفعةٌ منتهية · ⑥مخزونٌ غير متاح ·
 * ⑦رصيدٌ سالب. وكلٌّ منها له اختبارٌ يثبته.
 *
 * ═══ ولماذا تُمسح الطبلية أصلًا؟ ═══
 * لأنّ الرفّ قد يحمل طباليَ عدّة من الصنف نفسه بدفعاتٍ مختلفة. فمسحُ الموقع
 * والصنف وحدهما يقول «أخذتُ من هنا» ولا يقول **من أيّ حمولة** — فتضيع
 * الدفعة، ويسقط FEFO، وينقطع نسبُ ما وصل العميل.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { isBlockedForIssue, LPN_FLAGS, stateLabel } from './lpnLifecycle.js';
import { normalizeLpnCode, isValidLpnCode } from './lpnCode.js';
import { currentStep, stepRemaining } from './pickingTask.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/** مراحل المسح الثلاث — بترتيبها الحاكم. */
export const SCAN_STAGES = Object.freeze({
  BIN: 'امسح باركود الرفّ',
  PALLET: 'امسح ملصق الطبلية',
  ITEM: 'امسح باركود الصنف',
  QTY: 'أدخل الكمّيّة المسحوبة',
});

/** المرحلة التالية المنتظَرة — تُشتقّ ممّا مُسح لا من عدّادٍ في الشاشة. */
export function nextStage(progress) {
  if (!progress?.bin) return 'BIN';
  if (!progress?.lpn) return 'PALLET';
  if (!progress?.sku) return 'ITEM';
  return 'QTY';
}

/** ① حكم مسح الرفّ: يجب أن يكون رفّ الخطوة الجارية بعينه. */
export function binVerdict(task, code) {
  const step = currentStep(task);
  if (!step) return { ok: false, message: 'لا خطوةَ جارية — المهمّة اكتملت أو أُقفلت.' };
  const wanted = normalizeLocationCode(code);
  if (!wanted) return { ok: false, message: SCAN_STAGES.BIN + ' — لا سحبَ من موقعٍ غير مقروء فعليًّا.' };
  if (wanted !== normalizeLocationCode(step.bin)) {
    return {
      ok: false,
      message: `المطلوب الآن رفّ «${step.bin}» والممسوح «${wanted}» — لا تأخذ صنفًا من موقعٍ غير موقعه المطلوب.`,
    };
  }
  return { ok: true, message: '', step };
}

/** ④ حكم مسح الطبلية: موجودةٌ في الرفّ، وليست موسومةً حاجبًا. */
export function palletVerdict(step, code, unit) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) {
    return { ok: false, message: `«${code ?? ''}» ليس ملصق طبلية — ${SCAN_STAGES.PALLET}.` };
  }
  if (!unit) return { ok: false, message: `الطبلية «${lpn}» غير موجودة في السجلّ — سجّلها استثناءً للحوكمة.` };

  if (normalizeLocationCode(unit.bin) !== normalizeLocationCode(step?.bin)) {
    return {
      ok: false,
      message: `الطبلية «${lpn}» مسجَّلةٌ في «${unit.bin || 'بلا موقع'}» لا في «${step?.bin}» — إمّا نُقلت بلا تسجيل وإمّا هذه طبليةٌ أخرى.`,
    };
  }
  // ④ الوسم الحاجب يمنع الصرف — لا الوجود (وهو نصّ خطة ٧: «الصرف من طبلية
  // محجوزة أو تحت الفحص» من الممنوعات).
  if (isBlockedForIssue(unit)) {
    const names = (unit.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f)).map((f) => `«${LPN_FLAGS[f]}»`).join(' و');
    return { ok: false, message: `الطبلية موسومة ${names} — لا يُصرف منها حتى يُرفع الوسم بقرار حوكمة.` };
  }
  if (!['STORED', 'RESERVED', 'PICKING'].includes(unit.state)) {
    return { ok: false, message: `الطبلية «${stateLabel(unit.state)}» — لا يُسحب منها في هذه الحالة.` };
  }
  return { ok: true, message: '', unit };
}

/** ②⑤ حكم مسح الصنف: مطابقٌ لبند الخطوة، ودفعتُه هي المخصّصة وغير منتهية. */
export function itemVerdict(step, { sku, barcode, batch, expiry } = {}, { asOf } = {}) {
  const scanned = up(sku) || up(barcode);
  if (!scanned) return { ok: false, message: SCAN_STAGES.ITEM };
  if (scanned !== up(step?.sku) && scanned !== up(step?.barcode)) {
    return { ok: false, message: `المطلوب «${step?.sku}» والممسوح «${scanned}» — صنفٌ غير مخصّصٍ لهذه الخطوة.` };
  }
  // ② الدفعة المخصّصة: خُصّصت بـFEFO في الخطّة، فأخذُ غيرها يكسر الترتيب
  // ويترك الأقرب انتهاءً على الرفّ حتى يفسد.
  const wantBatch = up(step?.batch);
  if (wantBatch && up(batch) !== wantBatch) {
    return {
      ok: false,
      message: `المخصَّص دفعة «${wantBatch}» والممسوح «${up(batch) || 'بلا دفعة'}» — الأقرب انتهاءً أوّلًا (FEFO)، وأخذُ غيرها يترك القديم يفسد.`,
    };
  }
  // ⑤ الصلاحية: منتهيةٌ لا تُصرف بحال.
  const exp = String(expiry ?? step?.expiry ?? '').slice(0, 10);
  const today = String(asOf ?? '').slice(0, 10);
  if (exp && today && exp < today) {
    return { ok: false, message: `الدفعة «${up(batch) || wantBatch}» منتهيةٌ منذ ${exp} — لا تُصرف؛ أبلغ الحوكمة لسحبها.` };
  }
  return { ok: true, message: '' };
}

/**
 * ③⑥⑦ حكم الكمّيّة: لا فوق المطلوب، ولا فوق ما تحمله الطبلية، ولا سالب.
 *
 * ★ والفرق بين الحدَّين مقصود: «فوق المطلوب» يحمي **الأمر** من تنفيذٍ زائد،
 * و«فوق المحمول» يحمي **الحقيقة** من رصيدٍ سالب. وقد يقع أحدهما دون الآخر.
 */
export function qtyVerdict(step, unit, qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: `الكمّيّة «${qty}» غير صالحة — أكبر من صفر.` };

  const remaining = stepRemaining(step);
  if (n > remaining) {
    return { ok: false, message: `المطلوب من هذه الخطوة ${remaining} والمدخَل ${n} — لا تأخذ أكثر ممّا طُلب.` };
  }

  const onPallet = (unit?.lines ?? [])
    .filter((l) => up(l.sku) === up(step?.sku) && (!up(step?.batch) || up(l.batch) === up(step?.batch)))
    .reduce((s, l) => s + (Number(l.baseQty ?? l.qty) || 0), 0);

  if (onPallet > 0 && n > onPallet) {
    return {
      ok: false,
      message: `على الطبلية ${onPallet} والمطلوب سحبُ ${n} — الرصيد لا يُسالَب. راجع محتوى الطبلية أو خذ الباقي من طبليةٍ أخرى.`,
    };
  }
  return { ok: true, message: '' };
}

/**
 * الحكم الكامل لمسحةٍ مكتملة — يجمع الأربعة بترتيبها.
 *
 * @returns {{ok:boolean, message:string, stage:string, pick?:object}}
 */
export function pickVerdict(task, { bin, lpn, sku, barcode, batch, expiry, qty }, { unit, asOf } = {}) {
  const b = binVerdict(task, bin);
  if (!b.ok) return { ...b, stage: 'BIN' };
  const step = b.step;

  const p = palletVerdict(step, lpn, unit);
  if (!p.ok) return { ...p, stage: 'PALLET' };

  const i = itemVerdict(step, { sku, barcode, batch, expiry }, { asOf });
  if (!i.ok) return { ...i, stage: 'ITEM' };

  const q = qtyVerdict(step, unit, qty);
  if (!q.ok) return { ...q, stage: 'QTY' };

  return {
    ok: true,
    message: '',
    stage: 'DONE',
    pick: {
      seq: step.seq,
      bin: normalizeLocationCode(bin),
      lpn: normalizeLpnCode(lpn),
      sku: up(step.sku),
      batch: up(step.batch),
      expiry: step.expiry ?? '',
      qty: Number(qty),
    },
  };
}

/**
 * تطبيق سحبةٍ مقبولة على المهمّة — يعيد مهمّةً **جديدة**.
 * الخطوة تُقفل حين يبلغ المسحوب المطلوب؛ ودونه تبقى مفتوحةً للباقي.
 */
export function applyPick(task, pick) {
  const steps = (task?.steps ?? []).map((s) => {
    if (s.seq !== pick.seq) return s;
    const picked = (Number(s.picked) || 0) + (Number(pick.qty) || 0);
    return { ...s, picked, state: picked >= (Number(s.required) || 0) ? 'DONE' : 'PENDING' };
  });
  return { ...task, state: 'IN_PROGRESS', steps };
}

/**
 * ما يُسحب من الطبلية الأمّ — بصيغة `removeQty` في طبقة المحتويات.
 * (تُطبَّق هناك لا هنا: موضعٌ واحدٌ يحكم المحتوى.)
 */
export function takeFromPallet(pick) {
  return { sku: pick.sku, batch: pick.batch, expiry: pick.expiry, uom: pick.uom ?? '', qty: pick.qty };
}
