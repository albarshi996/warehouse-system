/**
 * بوّابة الخروج ‹LPN-716› — غيرُ باب التحميل. منطق خالص.
 *
 * ═══ الفرق الذي أصرّ عليه النصّ ═══
 * «**يجب التفريق بين: باب التحميل** — المكان الذي أُدخلت منه الطلبات إلى
 * السيارة، **وبوّابة الخروج** — النقطة التي غادرت عندها السيارة المستودع.»
 *
 * وليس هذا تفصيلًا إداريًّا: بين البابِ والبوّابة **مسافةٌ ووقت**. شاحنةٌ
 * حُمِّلت الساعة العاشرة وخرجت الواحدة ظهرًا وقفت ثلاث ساعاتٍ في الساحة —
 * ولو كان الختمُ واحدًا لَما عُرف ذلك أبدًا. وشاحنةٌ حُمِّلت ولم تخرج قطّ
 * تظهر «مسلَّمة» في تقريرٍ يقرؤه المدير وهي واقفةٌ خلف السور.
 *
 * ═══ ★★ والقاعدة: الخروج بمسحتين ═══
 * ① بوّابة الخروج · ② المركبة أو الرحلة. ثمّ يتحقّق النظام من **اكتمال
 * التحميل** ومن **ألّا طلبات ناقصة ولا زائدة**، ثمّ يُسجَّل **وقت الخروج
 * الفعليّ** وتصير الرحلة «خرجت للتسليم».
 *
 * ═══ والنواة القائمة تُستدعى ولا تُنسخ ═══
 * `yardModel.exitVerdict` يحكم خروج الزيارة (تصريحٌ وإخلاءُ باب) — يُستدعى
 * كما هو. وهذا الملفّ يضيف ما لا يعرفه: **بيّنةَ المسح** و**اكتمال الحمولة**.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from '../barcodes/barcodeCode.js';
import { vehicleMatchVerdict } from '../barcodes/vehicleCode.js';
import { serviceTypeOf } from '../locations/serviceLocations.js';
import { resolveLocationScan } from '../locations/qualifiedCode.js';
import { exitVerdict as yardExitVerdict } from '../fleet/yardModel.js';
import { PROOF_ROLES, buildProof, movementProblem, proofCode, proofSummary, withProof } from './movementProof.js';
import { loadingCounters } from './stagingLoading.js';

/** خطوتا البوّابة — بوّابةٌ ثمّ مركبةٌ أو رحلة. */
export const EXIT_STEPS = Object.freeze([
  {
    id: 'GATE',
    labelAr: 'بوّابة الخروج',
    kinds: [BARCODE_KINDS.GATE_OUT.id],
    role: PROOF_ROLES.DESTINATION.id,
    hint: 'امسح ملصق البوّابة — لا ملصق باب التحميل.',
  },
  {
    id: 'VEHICLE',
    labelAr: 'المركبة أو الرحلة',
    kinds: [BARCODE_KINDS.VEHICLE.id, BARCODE_KINDS.DOCUMENT.id],
    role: PROOF_ROLES.SOURCE.id,
    hint: 'امسح ملصق السيارة من داخلها، أو رقم الرحلة.',
  },
]);

/** حالات جلسة البوّابة. */
export const EXIT_STATES = Object.freeze({
  OPEN: 'بانتظار المسح',
  EXITED: 'خرجت للتسليم',
  BLOCKED: 'موقوفة عند البوّابة',
});

/** ما يجب أن يُمسح قبل رفع الحاجز — يُقرأ من الخطوات لا يُكتب ثانيةً. */
export const REQUIRED_EXIT_PROOFS = Object.freeze(
  EXIT_STEPS.map((st) => ({ role: st.role, kinds: st.kinds, labelAr: st.labelAr }))
);

const s = (v) => String(v ?? '').trim();

/** الخطوةُ بمعرّفها — أو `null`. */
export function exitStep(id) {
  return EXIT_STEPS.find((st) => st.id === id) ?? null;
}

/** يفتح جلسة بوّابةٍ فارغة. */
export function openExit({ warehouse = '', actor, actorName = '', at, device = '' } = {}) {
  if (!s(actor)) return { problem: 'جلسةُ بوّابةٍ بلا فاعلٍ لا تُفتح.' };
  if (!s(at)) return { problem: 'جلسةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.' };
  return {
    session: {
      state: 'OPEN',
      warehouse: s(warehouse).toUpperCase(),
      gate: '',
      vehicle: '',
      tripRef: '',
      proofs: [],
      openedBy: s(actor),
      openedByName: s(actorName),
      openedAt: s(at),
      device: s(device),
      exitedAt: '',
      exitedBy: '',
      overrideNote: '',
    },
  };
}

/**
 * ★★ حكمُ مسح خطوةٍ عند البوّابة.
 *
 * وأهمُّ رفضٍ فيه: **باب التحميل يُردّ عند البوّابة**. عاملٌ يمسح ما تحت يده
 * ولا يميّز الملصقين — فالنظام يميّز، ويقول له الفرق بكلماتٍ يفهمها.
 */
export function exitScanVerdict(session, stepId, code, ctx = {}) {
  const step = exitStep(stepId);
  if (!step) return { ok: false, message: `خطوةٌ غير معروفة «${stepId ?? ''}».` };
  if (session?.state === 'EXITED') {
    return { ok: false, kind: 'ALREADY', message: `خرجت سلفًا ${s(session?.exitedAt)} — لا يُكرَّر ختم الخروج.` };
  }

  const resolved = step.id === 'GATE' ? resolveLocationScan(code, ctx.qualifier ?? {}) : { code: normalizeScan(code), problem: '' };
  if (resolved.problem) return { ok: false, message: resolved.problem };

  const scan = classifyScan(resolved.code);
  if (scan.problem) return { ok: false, message: scan.problem };

  if (step.id === 'GATE') {
    const type = serviceTypeOf(scan.code);
    if (type && type.id !== 'GATE_OUT') {
      return {
        ok: false,
        message: `«${scan.code}» ${type.labelAr} لا بوّابة خروج — البابُ حيث دخلت الطلبات السيارة، والبوّابة حيث غادرت السيارة الموقع.`,
      };
    }
    if (scan.kind !== BARCODE_KINDS.GATE_OUT.id) {
      return { ok: false, message: `${step.labelAr}: المطلوب بوّابة خروج — والممسوح ${kindLabel(scan.kind)} «${scan.code}».` };
    }
    const gate = (ctx.gates ?? []).find((g) => normalizeScan(g?.code) === scan.code);
    if (gate && gate.active === false) return { ok: false, message: `البوّابة «${scan.code}» خارج الخدمة.` };
    return { ok: true, message: '', code: scan.code };
  }

  // المركبة أو الرحلة — أحدهما يكفي، وكلاهما أوثق.
  if (scan.kind === BARCODE_KINDS.VEHICLE.id) {
    const out = vehicleMatchVerdict(scan.code, { expectedCode: ctx.expectedVehicle ?? '', expectedPlate: ctx.expectedPlate ?? '' });
    return out.ok ? { ok: true, message: '', code: scan.code } : out;
  }
  if (scan.kind === BARCODE_KINDS.DOCUMENT.id) {
    const want = normalizeScan(ctx.expectedTrip ?? '');
    if (want && scan.code !== want) {
      return { ok: false, message: `الرحلة المتوقَّعة «${want}» والممسوحة «${scan.code}».` };
    }
    return { ok: true, message: '', code: scan.code };
  }
  return { ok: false, message: `${step.labelAr}: المطلوب مركبةٌ أو رحلة — والممسوح ${kindLabel(scan.kind)} «${scan.code}».` };
}

/** يثبّت بيّنةَ خطوةٍ في جلسة البوّابة. */
export function applyExitScan(session, stepId, code, { actor, actorName = '', at, manual = false, reason = '', ctx = {} } = {}) {
  const step = exitStep(stepId);
  if (!step) return { problem: `خطوةٌ غير معروفة «${stepId ?? ''}».` };
  if (!manual) {
    const verdict = exitScanVerdict(session, stepId, code, ctx);
    if (!verdict.ok) return { problem: verdict.message, kind: verdict.kind };
  }

  const resolved = step.id === 'GATE' ? resolveLocationScan(code, ctx.qualifier ?? {}).code : normalizeScan(code);
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
      gate: proofCode(proofs, PROOF_ROLES.DESTINATION.id, BARCODE_KINDS.GATE_OUT.id),
      vehicle: proofCode(proofs, PROOF_ROLES.SOURCE.id, BARCODE_KINDS.VEHICLE.id),
      tripRef: proofCode(proofs, PROOF_ROLES.SOURCE.id, BARCODE_KINDS.DOCUMENT.id),
    },
  };
}

/** ما بقي من المسحتين — والمركبةُ أو الرحلةُ أحدهما يكفي. */
export function exitGaps(session) {
  return movementProblem({ required: REQUIRED_EXIT_PROOFS, proofs: session?.proofs ?? [] });
}

/**
 * ★★ جاهزيّةُ الخروج — المسحتان ثمّ اكتمالُ الحمولة ثمّ حكمُ الساحة.
 *
 * `dock` جلسةُ التحميل (أو جلسةُ `stagingLoading` مباشرةً)، و`visit` زيارةُ
 * الساحة إن وُجدت. وكلُّ سببٍ **يُعدَّد** ولا يُختصر: ضابط البوّابة يقرأ
 * الأسباب كلَّها فيعرف إلى من يذهب.
 *
 * @returns {{ok:boolean, problems:string[], warnings:string[]}}
 */
export function exitReadiness(session, { dock = null, visit = null } = {}) {
  const problems = [];
  const warnings = [];

  const gaps = exitGaps(session);
  if (!gaps.ok) problems.push(gaps.message);

  const loading = dock?.loading ?? dock;
  if (loading) {
    const c = loadingCounters(loading);
    if (c.missing > 0) {
      problems.push(`${c.missing} حمولةً لم تُحمَّل (${c.missingList.slice(0, 3).join(' · ')}) — لا تخرج الرحلة ناقصة.`);
    }
    if (c.extras > 0) problems.push(`${c.extras} حمولةً زائدةً على الرحلة — راجعها قبل الخروج.`);
    if (loading.state === 'OPEN') warnings.push('جلسة التحميل لم تُغلق بعد — أغلقها ليُختم الحمل.');
  } else {
    warnings.push('لا جلسة تحميلٍ مرتبطة — الخروج يُسجَّل بلا مطابقةِ حمولة.');
  }

  if (visit) {
    const yard = yardExitVerdict(visit);
    problems.push(...(yard.problems ?? []));
  }

  return { ok: problems.length === 0, problems, warnings };
}

/** سببُ منع ختم الخروج — أو `''`. والتجاوز بسببٍ مكتوب. */
export function exitCloseProblem(session, ctx = {}, { override = false, overrideNote = '' } = {}) {
  if (session?.state === 'EXITED') return `خرجت سلفًا ${s(session?.exitedAt)} — لا يُكرَّر الختم.`;
  const readiness = exitReadiness(session, ctx);
  if (readiness.ok) return '';
  if (!override) return readiness.problems.join(' · ');
  if (!s(overrideNote)) return 'الخروج الاستثنائيّ يحتاج سببًا مكتوبًا — يُقيَّد باسم من قرّره ويبقى في السجلّ.';
  // ★ بيّنةُ المسح لا يرفعها تجاوز: بابٌ لم يُمسح لا يُعوَّض بسبب.
  const gaps = exitGaps(session);
  return gaps.ok ? '' : gaps.message;
}

/**
 * ★ يختم الخروج الفعليّ — مرّةً واحدة.
 *
 * `already` تُعيدها مسحةٌ ثانيةٌ لمركبةٍ خرجت: تُعلن ولا تُخطئ ولا تُكرّر —
 * فالعامل الذي يمسح مرّتين لا يُعاقَب برسالة خطأ.
 */
export function stampExit(session, ctx = {}, { actor, at, override = false, overrideNote = '' } = {}) {
  if (session?.state === 'EXITED') {
    return { already: true, session, message: `خرجت سلفًا ${s(session.exitedAt)}.` };
  }
  const problem = exitCloseProblem(session, ctx, { override, overrideNote });
  if (problem) return { problem };
  if (!s(actor)) return { problem: 'ختمُ الخروج بلا فاعلٍ لا يُسجَّل.' };
  if (!s(at)) return { problem: 'ختمُ الخروج بلا وقتٍ لا يُرتَّب — وهو وقتُ الخروج الفعليّ.' };

  return {
    session: {
      ...session,
      state: 'EXITED',
      exitedAt: s(at),
      exitedBy: s(actor),
      overrideNote: override ? s(overrideNote) : '',
    },
    tripState: 'خرجت للتسليم',
  };
}

/** يوقف مركبةً عند البوّابة بسبب — حالةٌ لا محو. */
export function blockAtGate(session, { reason, actor, at } = {}) {
  if (!s(reason)) return { problem: 'الإيقاف عند البوّابة يحتاج سببًا مكتوبًا.' };
  if (!s(actor) || !s(at)) return { problem: 'الإيقاف بلا فاعلٍ ووقتٍ لا يُسجَّل.' };
  return { session: { ...session, state: 'BLOCKED', blockReason: s(reason), blockedBy: s(actor), blockedAt: s(at) } };
}

/** بطاقةُ البوّابة — للسجلّ وللوحة. */
export function exitCard(session, ctx = {}) {
  const readiness = exitReadiness(session, ctx);
  const proof = proofSummary(session?.proofs ?? []);
  return {
    state: session?.state ?? '',
    stateLabel: EXIT_STATES[session?.state] ?? '',
    gate: s(session?.gate),
    vehicle: s(session?.vehicle),
    tripRef: s(session?.tripRef),
    exitedAt: s(session?.exitedAt),
    exitedBy: s(session?.exitedBy),
    ready: readiness.ok,
    problems: readiness.problems,
    warnings: readiness.warnings,
    trust: proof.trust,
    manualProofs: proof.manual,
  };
}
