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
    // ★★ كلّ سحبةٍ تسجّل **من أيّ طبلية** جاءت: خطوةٌ واحدة قد تُستوفى من
    // طبليتين (الأولى نفدت والباقي من الثانية). وبلا هذا يضيع النسب عند
    // تكوين حمولة الصرف، فلا يُعرف أصلُ ما وصل العميل.
    const from = [...(s.picks ?? [])];
    const at = from.find((f) => f.lpn === pick.lpn);
    if (at) at.qty += Number(pick.qty) || 0;
    else if (pick.lpn) from.push({ lpn: pick.lpn, qty: Number(pick.qty) || 0 });
    return { ...s, picked, picks: from, state: picked >= (Number(s.required) || 0) ? 'DONE' : 'PENDING' };
  });
  return { ...task, state: 'IN_PROGRESS', steps };
}

/**
 * سحبات المهمّة مسطّحةً — مدخلُ `buildIssuePallet` عند الإقفال.
 * تُشتقّ من الخطوات ولا تُخزَّن ثانيةً.
 */
export function picksOfTask(task) {
  const out = [];
  for (const s of task?.steps ?? []) {
    for (const p of s.picks ?? []) {
      if (!(Number(p.qty) > 0)) continue;
      out.push({
        seq: s.seq, lpn: p.lpn, sku: s.sku, batch: s.batch, expiry: s.expiry,
        uom: s.uom ?? '', factor: s.factor ?? null, qty: Number(p.qty), baseQty: Number(p.qty),
      });
    }
  }
  return out;
}

/**
 * ما يُسحب من الطبلية الأمّ — بصيغة `removeQty` في طبقة المحتويات.
 * (تُطبَّق هناك لا هنا: موضعٌ واحدٌ يحكم المحتوى.)
 */
export function takeFromPallet(pick) {
  return { sku: pick.sku, batch: pick.batch, expiry: pick.expiry, uom: pick.uom ?? '', qty: pick.qty };
}

/**
 * ★★★ طبليةُ الصرف من سحباتِ المهمّة (LPN-304) — **هويّةٌ جديدة بنسبها**.
 *
 * ولماذا هويّةٌ جديدة لا امتدادٌ لأمّ؟ لأنّ حمولةَ الصرف **تكوينٌ جديد**:
 * تُجمع من ثلاث طبالٍ أو أربع، فأيّ هويّةٍ من هويّاتها تكذب عن الباقي.
 * والنسب هو ما يحفظ الجواب حين يُسأل: «هذه الكرتونة التالفة عند العميل —
 * من أين جاءت؟» فتُقرأ `parentCodes` صعودًا حتى أوّل استلام.
 *
 * والبنود تُدمج بهويّة (صنف×دفعة×صلاحية×وحدة): سحبتان من طبليتين لدفعةٍ
 * واحدة بندٌ واحد بكمّيّتهما — لا صفّان يُقرآن دفعتين.
 *
 * @param {Array} picks سحباتٌ مقبولة من `pickVerdict`
 * @param {object} opts {code هويّة مولَّدة · warehouse · sourceDoc · actor}
 * @returns {{pallet:object}|{problem:string}}
 */
export function buildIssuePallet(picks, { code, warehouse = '', sourceDoc = null, route = '', branch = '', actor } = {}) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) {
    return { problem: `هويّة طبلية الصرف «${code ?? ''}» غير صالحة — تولد من العدّاد لا من اليد.` };
  }
  const list = (picks ?? []).filter((p) => Number(p?.qty) > 0);
  if (list.length === 0) return { problem: 'طبليةُ صرفٍ بلا سحبةٍ واحدة لا تُكوَّن.' };
  if (!String(actor ?? '').trim()) return { problem: 'تكوينُ طبلية الصرف بلا فاعلٍ لا يُسجَّل.' };

  const byKey = new Map();
  const parents = [];
  for (const p of list) {
    const key = [up(p.sku), up(p.batch), String(p.expiry ?? '').slice(0, 10), up(p.uom)].join('__');
    const line = byKey.get(key) ?? {
      sku: up(p.sku), batch: up(p.batch), expiry: String(p.expiry ?? '').slice(0, 10),
      uom: up(p.uom), factor: p.factor ?? null, qty: 0, baseQty: 0,
      // ★ مصادرُ البند نفسه: أيّ طبليةٍ أسهمت وبكم — فالنسب سطريٌّ لا رأسيٌّ
      // فقط، ويُجاب «هذه الكرتونة من أيّ حمولة» لا «من إحدى هذه الأربع».
      from: [],
    };
    line.qty += Number(p.qty) || 0;
    line.baseQty += Number(p.baseQty ?? p.qty) || 0;
    const src = normalizeLpnCode(p.lpn);
    if (src) {
      if (!parents.includes(src)) parents.push(src);
      const at = line.from.find((f) => f.lpn === src);
      if (at) at.qty += Number(p.qty) || 0;
      else line.from.push({ lpn: src, qty: Number(p.qty) || 0 });
    }
    byKey.set(key, line);
  }

  return {
    pallet: {
      code: lpn,
      state: 'PICKING',
      flags: [],
      warehouse: up(warehouse),
      bin: '',
      lines: [...byKey.values()],
      parentCodes: parents,
      sourceDoc,
      /*
       * ★★★ الوجهةُ تُحمل من المهمّة إلى الحمولة (2026-08-27 · LPN-309).
       *
       * `stagingAssignVerdict` يمنع «طبليةَ فرعٍ في مسار فرعٍ آخر» بمقارنة
       * `unit.route || unit.branch` بمنطقة التجهيز. وكان الحقلان **لا
       * يُكتبان على طبلية الصرف أبدًا** — `route` يعيش على مهمّة التحضير
       * وينتهي عندها. فالمقارنة تقرأ `undefined` والشرط `wanted && given`
       * يسقط، **فالحارسُ لا يُطلق ولو مرّة**. وهو أخطر حارسٍ في هذه الخطوة:
       * عطبُه لا يُكتشف إلّا حين يشتكي فرعٌ من نقصٍ وآخر من زيادة.
       */
      route: up(route),
      branch: up(branch),
      createdBy: String(actor).trim(),
    },
  };
}
