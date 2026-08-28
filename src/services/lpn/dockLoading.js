/**
 * التحميل عند الباب ‹LPN-715› — المسح الرباعيّ. منطق خالص.
 *
 * ═══ الفجوات (ف-١٣ · ف-١٤ · ف-٢١) ═══
 * التحميل اليوم يتحقّق **طبليةً بطبلية** (`stagingLoading` · LPN-306) — وهذا
 * نصفُ الحارس. والنصفُ الغائب هو **أين** و**على ماذا**: البابُ يُختار من قائمة،
 * والمركبةُ تُختار من قائمة، والرحلةُ كذلك. فلا بيّنةَ أنّ الموظّف كان عند
 * الباب أصلًا، ولا أنّ الحمولة دخلت **هذه** السيارة.
 *
 * ═══ والنصّ قالها في أربع خطوات ═══
 *   ① مسح باركود باب التحميل أو الخروج
 *   ② مسح باركود السيارة
 *   ③ مسح باركود الرحلة أو أمر التحميل
 *   ④ مسح كلّ طبليةٍ أو طردٍ **قبل إدخاله** إلى السيارة
 * ثمّ: «لا يُعدّ الطلب محمَّلًا بمجرّد نقله من منطقة التحضير؛ بل **يجب أن
 * يُقرأ باركودُه فعليًّا عند باب التحميل**».
 *
 * ═══ ★★ والنواة تكبر ولا يُبنى بجانبها ═══
 * جلسةُ التحميل وقاعدتاها (لا تُحمَّل مرّتين · لا تُحمَّل خارج الرحلة) مبنيّةٌ
 * ومختبَرة في `stagingLoading.js` — وهذا الملفّ **يلفّها بالبوّابة الثلاثيّة**
 * ولا يعيد كتابتها. والبيّنة كائنُ `movementProof` نفسه الذي تستعمله بوّابة
 * الخروج وباب الاستلام — فقاعدةٌ واحدةٌ لا ثلاث.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from '../barcodes/barcodeCode.js';
import { vehicleMatchVerdict } from '../barcodes/vehicleCode.js';
import { serviceTypeOf } from '../locations/serviceLocations.js';
import { resolveLocationScan } from '../locations/qualifiedCode.js';
import {
  PROOF_ROLES,
  buildProof,
  movementProblem,
  proofCode,
  proofSummary,
  withProof,
} from './movementProof.js';
import {
  applyExtra,
  applyLoad,
  closeLoading,
  loadScanVerdict,
  loadingCloseProblem,
  loadingCounters,
  openLoading,
} from './stagingLoading.js';

/** خطوات الباب الأربع — بالترتيب الذي كتبه النصّ. */
export const DOCK_STEPS = Object.freeze([
  {
    id: 'DOOR',
    labelAr: 'باب التحميل',
    kinds: [BARCODE_KINDS.DOCK_OUT.id],
    role: PROOF_ROLES.DESTINATION.id,
    hint: 'امسح ملصق الباب الذي وقفت عنده الشاحنة.',
  },
  {
    id: 'VEHICLE',
    labelAr: 'المركبة',
    kinds: [BARCODE_KINDS.VEHICLE.id],
    role: PROOF_ROLES.DESTINATION.id,
    hint: 'امسح ملصق السيارة من داخلها — لا تختره من قائمة.',
  },
  {
    id: 'TRIP',
    labelAr: 'الرحلة أو أمر التحميل',
    kinds: [BARCODE_KINDS.DOCUMENT.id],
    role: PROOF_ROLES.DESTINATION.id,
    hint: 'امسح رقم الرحلة أو أمر التحميل.',
  },
  {
    id: 'ITEMS',
    labelAr: 'الطبالي والطرود',
    kinds: [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id],
    role: PROOF_ROLES.SOURCE.id,
    hint: 'امسح كلّ طبليةٍ أو طردٍ قبل إدخاله إلى السيارة.',
  },
]);

/** حالات جلسة الباب. */
export const DOCK_STATES = Object.freeze({
  GATE: 'بوّابة المسح الثلاثيّ',
  LOADING: 'قيد التحميل',
  CLOSED: 'أُغلقت',
});

/** ★ ما يجب أن يُمسح قبل أن يُحمَّل شيء — تُقرأ من الخطوات لا تُكتب ثانيةً. */
export const REQUIRED_GATE_PROOFS = Object.freeze(
  DOCK_STEPS.filter((st) => st.id !== 'ITEMS').map((st) => ({ role: st.role, kinds: st.kinds, labelAr: st.labelAr }))
);

const s = (v) => String(v ?? '').trim();

/** الخطوةُ بمعرّفها — أو `null`. */
export function dockStep(id) {
  return DOCK_STEPS.find((st) => st.id === id) ?? null;
}

/**
 * يفتح جلسةَ بابٍ فارغة — لا شيء فيها إلّا الفاعل والوقت.
 *
 * ولماذا تُفتح فارغة؟ لأنّ الخطوات الثلاث الأولى **بيّنات** لا إعدادات:
 * تُملأ بالمسح واحدةً واحدة، ولو مُلئت من قائمةٍ عند الفتح لَعاد الاختيار
 * الذي منعه النصّ.
 */
export function openDockSession({ warehouse = '', actor, actorName = '', at, device = '' } = {}) {
  if (!s(actor)) return { problem: 'جلسةُ بابٍ بلا فاعلٍ لا تُفتح.' };
  if (!s(at)) return { problem: 'جلسةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.' };
  return {
    session: {
      state: 'GATE',
      warehouse: s(warehouse).toUpperCase(),
      door: '',
      vehicle: '',
      tripRef: '',
      proofs: [],
      itemProofs: [],
      loading: null,
      openedBy: s(actor),
      openedByName: s(actorName),
      openedAt: s(at),
      device: s(device),
      closedBy: '',
      closedAt: '',
    },
  };
}

/**
 * ★★ حكم مسح خطوةٍ من الثلاث.
 *
 * `ctx` يحمل ما يُقارَن به: سجلّ الأبواب، ومركبةُ الرحلة المتوقَّعة، ومرجعُها.
 * وكلُّ رفضٍ **يقول الصواب** لا كلمة «خطأ».
 */
export function gateScanVerdict(session, stepId, code, ctx = {}) {
  const step = dockStep(stepId);
  if (!step || step.id === 'ITEMS') return { ok: false, message: `خطوةٌ غير معروفة «${stepId ?? ''}».` };
  if (session?.state === 'CLOSED') return { ok: false, message: 'الجلسة أُغلقت — لا مسحَ بعد الإغلاق.' };

  // ★ الملصق قد يُطبع بالصورة الكاملة `BR-RH-W01-DOCK-OUT-01` — تُردّ للمعرّف.
  const resolved = step.id === 'DOOR' ? resolveLocationScan(code, ctx.qualifier ?? {}) : { code: normalizeScan(code), problem: '' };
  if (resolved.problem) return { ok: false, message: resolved.problem };

  const scan = classifyScan(resolved.code);
  if (scan.problem) return { ok: false, message: scan.problem };
  if (!step.kinds.includes(scan.kind)) {
    return {
      ok: false,
      message: `${step.labelAr}: المطلوب ${step.kinds.map(kindLabel).join(' أو ')} — والممسوح ${kindLabel(scan.kind)} «${scan.code}».`,
    };
  }

  if (step.id === 'DOOR') {
    const type = serviceTypeOf(scan.code);
    if (type?.doorFlow !== 'outbound') {
      return { ok: false, message: `«${scan.code}» ${type?.labelAr ?? 'ليس بابًا'} — التحميل لا يقع إلّا في باب تحميل.` };
    }
    const door = (ctx.doors ?? []).find((d) => normalizeScan(d?.code) === scan.code);
    if (door && door.active === false) {
      return { ok: false, message: `الباب «${scan.code}» خارج الخدمة — اختر بابًا فعّالًا.` };
    }
    const wh = s(session?.warehouse).toUpperCase();
    const doorWh = s(door?.warehouse).toUpperCase();
    if (wh && doorWh && wh !== doorWh) {
      return { ok: false, message: `الباب «${scan.code}» تابعٌ لمستودع ${doorWh} وأنت في ${wh}.` };
    }
    return { ok: true, message: '', code: scan.code };
  }

  if (step.id === 'VEHICLE') {
    const out = vehicleMatchVerdict(scan.code, {
      expectedCode: ctx.expectedVehicle ?? '',
      expectedPlate: ctx.expectedPlate ?? '',
    });
    return out.ok ? { ok: true, message: '', code: scan.code } : out;
  }

  // TRIP — الرحلة أو أمر التحميل
  const want = normalizeScan(ctx.expectedTrip ?? '');
  if (want && scan.code !== want) {
    return { ok: false, message: `أمرُ التحميل المتوقَّع «${want}» والممسوح «${scan.code}» — راجع الرحلة.` };
  }
  return { ok: true, message: '', code: scan.code };
}

/**
 * يثبّت بيّنةَ خطوةٍ في الجلسة. `{session}` أو `{problem}`.
 *
 * `manual` مع سببٍ مكتوبٍ يمرّ — والبيّنة تُوسم يدويّةً فتظهر في التقرير.
 */
export function applyGateScan(session, stepId, code, { actor, actorName = '', at, manual = false, reason = '', ctx = {} } = {}) {
  const step = dockStep(stepId);
  if (!step) return { problem: `خطوةٌ غير معروفة «${stepId ?? ''}».` };

  if (!manual) {
    const verdict = gateScanVerdict(session, stepId, code, ctx);
    if (!verdict.ok) return { problem: verdict.message };
  }

  const resolved = step.id === 'DOOR' ? resolveLocationScan(code, ctx.qualifier ?? {}).code : normalizeScan(code);
  const built = buildProof({
    role: step.role,
    value: resolved,
    expect: step.kinds,
    actor,
    actorName,
    at,
    device: session?.device,
    manual,
    reason,
  });
  if (built.problem) return { problem: built.problem };

  const proofs = withProof(session?.proofs ?? [], built.proof);
  return {
    session: {
      ...session,
      proofs,
      door: proofCode(proofs, PROOF_ROLES.DESTINATION.id, BARCODE_KINDS.DOCK_OUT.id),
      vehicle: proofCode(proofs, PROOF_ROLES.DESTINATION.id, BARCODE_KINDS.VEHICLE.id),
      tripRef: proofCode(proofs, PROOF_ROLES.DESTINATION.id, BARCODE_KINDS.DOCUMENT.id),
    },
  };
}

/** ما بقي من الخطوات الثلاث — للشاشة، فتعرف ما تطلبه تاليًا. */
export function gateGaps(session) {
  return movementProblem({ required: REQUIRED_GATE_PROOFS, proofs: session?.proofs ?? [] });
}

/**
 * ★★ يبدأ التحميل — ولا يبدأ قبل اكتمال المسح الثلاثيّ.
 *
 * وهذا هو الحارس الذي ينقل القاعدة من وعدٍ إلى تنفيذ: بابٌ لم يُمسح يعني
 * جلسةً لا تُفتح أصلًا، لا مجرّد حقلٍ فارغٍ في تقرير.
 */
export function beginLoading(session, { expected = [], driver = '', docRef = null, actor, at } = {}) {
  const gaps = gateGaps(session);
  if (!gaps.ok) return { problem: gaps.message };
  if (session?.state !== 'GATE') return { problem: `الجلسة «${DOCK_STATES[session?.state] ?? '؟'}» — بدأت سلفًا.` };

  const opened = openLoading({
    tripId: session.tripRef,
    docRef: docRef ?? (session.tripRef ? { type: 'TRIP', id: session.tripRef, number: session.tripRef } : null),
    expected,
    vehicle: session.vehicle,
    driver,
    actor,
    at,
  });
  if (opened.problem) return { problem: opened.problem };

  return { session: { ...session, state: 'LOADING', loading: opened.session } };
}

/**
 * حكم مسح حمولةٍ عند الباب — يستدعي حارس `stagingLoading` نفسه.
 * والحمولة **طبليةٌ أو طرد** بعد توسعة ‹LPN-715›.
 */
export function itemScanVerdict(session, code, unit) {
  if (session?.state !== 'LOADING') {
    return { ok: false, message: 'أكمل مسح الباب والمركبة والرحلة قبل تحميل أيّ شيء.' };
  }
  return loadScanVerdict(session.loading, code, unit);
}

/** يسجّل حمولةً محمَّلة ببيّنتها. */
export function applyItemScan(session, code, { actor, actorName = '', at, unit = null } = {}) {
  const verdict = itemScanVerdict(session, code, unit);
  if (!verdict.ok) return { problem: verdict.message, kind: verdict.kind };

  const built = buildProof({
    role: PROOF_ROLES.SOURCE.id,
    value: code,
    expect: [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id],
    actor,
    actorName,
    at,
    device: session?.device,
  });
  if (built.problem) return { problem: built.problem };

  return {
    session: {
      ...session,
      loading: applyLoad(session.loading, code),
      itemProofs: [...(session.itemProofs ?? []), built.proof],
    },
    proof: built.proof,
  };
}

/** يسجّل حمولةً زائدةً بقرارٍ وسبب — تُسجَّل ولا تُبتلع. */
export function applyItemExtra(session, code, { reason, actor, actorName = '', at } = {}) {
  if (session?.state !== 'LOADING') return { problem: 'لا تحميلَ قبل اكتمال المسح الثلاثيّ.' };
  const out = applyExtra(session.loading, code, { reason, actor });
  if (out.problem) return { problem: out.problem };

  const built = buildProof({
    role: PROOF_ROLES.SOURCE.id,
    value: code,
    expect: [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id],
    actor,
    actorName,
    at,
    reason,
  });
  if (built.problem) return { problem: built.problem };

  return { session: { ...session, loading: out.session, itemProofs: [...(session.itemProofs ?? []), built.proof] } };
}

/** عدّاداتُ الجلسة — بوّابةً وحمولةً معًا. */
export function dockCounters(session) {
  const gate = gateGaps(session);
  const load = session?.loading ? loadingCounters(session.loading) : { expected: 0, loaded: 0, missing: 0, extras: 0, complete: false, missingList: [] };
  return {
    ...load,
    gateReady: gate.ok,
    gateMissing: gate.missing,
    proof: proofSummary([...(session?.proofs ?? []), ...(session?.itemProofs ?? [])]),
  };
}

/** سببُ منع إغلاق الباب — أو `''`. */
export function dockCloseProblem(session, { override = false, overrideNote = '' } = {}) {
  if (session?.state !== 'LOADING') return `الجلسة «${DOCK_STATES[session?.state] ?? '؟'}» — لا تُغلق إلّا وهي قيد التحميل.`;
  return loadingCloseProblem(session.loading, { override, overrideNote });
}

/** يغلق التحميل عند الباب. */
export function closeDock(session, { actor, at, seal = '', override = false, overrideNote = '' } = {}) {
  const problem = dockCloseProblem(session, { override, overrideNote });
  if (problem) return { problem };
  const out = closeLoading(session.loading, { actor, at, seal, override, overrideNote });
  if (out.problem) return { problem: out.problem };
  return {
    session: { ...session, state: 'CLOSED', loading: out.session, closedBy: s(actor), closedAt: s(at) },
  };
}

/**
 * بطاقةُ الجلسة للسجلّ — تُقرأ بعد سنةٍ فيُعرف: أيُّ بابٍ وأيّةُ سيارةٍ
 * وأيّةُ رحلةٍ وكم حمولةً وبأيّ بيّنة.
 */
export function dockCard(session) {
  const c = dockCounters(session);
  return {
    state: session?.state ?? '',
    stateLabel: DOCK_STATES[session?.state] ?? '',
    door: s(session?.door),
    vehicle: s(session?.vehicle),
    tripRef: s(session?.tripRef),
    warehouse: s(session?.warehouse),
    openedBy: s(session?.openedByName) || s(session?.openedBy),
    openedAt: s(session?.openedAt),
    closedAt: s(session?.closedAt),
    expected: c.expected,
    loaded: c.loaded,
    missing: c.missing,
    extras: c.extras,
    complete: c.complete,
    trust: c.proof.trust,
    manualProofs: c.proof.manual,
  };
}
