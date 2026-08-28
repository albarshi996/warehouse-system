/**
 * بيّنة الحركة ‹LPN-719› — لا حركةَ بلا مسحتين. منطق خالص.
 *
 * ═══ القاعدة التي ختم بها نصّ الطلب ═══
 * «**لا تتغيّر حالةُ طلبٍ ولا طبليةٍ ولا مركبةٍ بمجرّد الضغط على زرّ؛ بل
 * تُثبَّت الحركة بمسح باركود الأصل وباركود الوجهة، مع تسجيل الموظّف والوقت.**»
 *
 * ═══ ولماذا وحدةٌ مستقلّةٌ لهذه القاعدة (ف-٢٢) ═══
 * لأنّها **مبدأٌ يعبر الشاشات كلَّها**: التخزين والنقل والتحميل والخروج
 * والاستلام. ومبدأٌ يُكتب في كلّ شاشةٍ على حدة يُنسى في واحدةٍ منها — وتلك
 * الواحدة هي الباب الذي يدخل منه كلُّ خطأ (درسُ المراجعة العدائية: «الحارس
 * الذي يحمي بابًا واحدًا لا يحمي البيت»).
 *
 * فالبيّنة **كائنٌ** يُبنى ويُمرَّر ويُخزَّن مع الحركة — فيُسأل بعد سنة: بأيّ
 * مسحتين وقعت هذه الحركة؟ ومن مسح؟ ومتى؟
 *
 * ═══ ★★ والتجاوز مسموحٌ ومكشوف ═══
 * منعُ الاختيار اليدويّ منعًا تامًّا يوقف مستودعًا كلّما تلف ملصق. فالاختيار
 * جائزٌ **بصلاحيّةٍ وسببٍ مكتوب**، ويُوسم في السجلّ `يدويّ` — فيظهر في التقرير
 * ويُسأل عنه. والفرق بين «ممنوع» و«مكشوف» هو الفرق بين نظامٍ يُلتَفّ عليه
 * ونظامٍ يُحاسِب.
 */

import { classifyScan, kindLabel, normalizeScan } from '../barcodes/barcodeCode.js';

/** طرفا الحركة — أصلٌ ووجهة. */
export const PROOF_ROLES = Object.freeze({
  SOURCE: { id: 'SOURCE', labelAr: 'الأصل' },
  DESTINATION: { id: 'DESTINATION', labelAr: 'الوجهة' },
});

/** كيف ثبتت البيّنة. */
export const PROOF_METHODS = Object.freeze({
  SCAN: { id: 'SCAN', labelAr: 'مسح', trusted: true },
  MANUAL: { id: 'MANUAL', labelAr: 'اختيارٌ يدويّ', trusted: false },
});

const s = (v) => String(v ?? '').trim();

/**
 * ما يمنع بناء بيّنة — أو `''`.
 *
 * @param {{role:string, value:string, expect?:string[], actor:string, at:string,
 *          manual?:boolean, reason?:string}} input
 */
export function proofProblem({ role, value, expect = [], actor, at, manual = false, reason = '' } = {}) {
  if (!PROOF_ROLES[role]) return `طرفٌ غير معروف «${role ?? ''}» — الأصل أو الوجهة.`;
  if (!s(actor)) return 'بيّنةٌ بلا فاعلٍ لا تُسجَّل — من مسح؟';
  if (!s(at)) return 'بيّنةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.';

  const scan = classifyScan(value);
  if (!scan.code) return `${PROOF_ROLES[role].labelAr}: امسح الباركود أو اكتب كوده.`;
  if (scan.problem) return scan.problem;

  const wanted = (Array.isArray(expect) ? expect : [expect]).filter(Boolean);
  if (wanted.length && !wanted.includes(scan.kind)) {
    return `${PROOF_ROLES[role].labelAr} المطلوب ${wanted.map(kindLabel).join(' أو ')} — والممسوح ${kindLabel(scan.kind)} «${scan.code}».`;
  }

  // ★★ الاختيار اليدويّ **جائزٌ بسبب**: منعُه التامّ يوقف مستودعًا كلّما تلف ملصق.
  if (manual && !s(reason)) {
    return `الاختيار اليدويّ لـ${PROOF_ROLES[role].labelAr} يحتاج سببًا مكتوبًا — يبقى في السجلّ ويُسأل عنه.`;
  }
  return '';
}

/**
 * يبني بيّنةً واحدة. `{proof}` أو `{problem}`.
 * البيّنة **مجمَّدة**: ما دخل السجلّ لا تعدّله يدٌ بعدها.
 */
export function buildProof({ role, value, expect = [], actor, actorName = '', at, device = '', manual = false, reason = '' } = {}) {
  const problem = proofProblem({ role, value, expect, actor, at, manual, reason });
  if (problem) return { problem };
  const scan = classifyScan(value);
  return {
    proof: Object.freeze({
      role,
      kind: scan.kind,
      kindLabel: kindLabel(scan.kind),
      code: scan.code,
      method: manual ? PROOF_METHODS.MANUAL.id : PROOF_METHODS.SCAN.id,
      actor: s(actor),
      actorName: s(actorName),
      at: s(at),
      device: s(device),
      reason: s(reason),
    }),
  };
}

/** هل ثبتت هذه البيّنة بمسحٍ فعليّ؟ */
export function isScanned(proof) {
  return proof?.method === PROOF_METHODS.SCAN.id;
}

/**
 * ★★ حكمُ القاعدة الحاكمة — أطرفان بمسحتين أم زرٌّ ضُغط؟
 *
 * `required` يسمّي ما يجب أن يُمسح في هذه الحركة بعينها (بابٌ ومركبةٌ ورحلةٌ
 * وطرد مثلًا)، و`proofs` ما ثبت. والرسالة **تسمّي الناقص** — عاملٌ يُمنع ولا
 * يعرف ما ينقصه يبقى واقفًا.
 *
 * @returns {{ok:boolean, message:string, missing:string[], manual:object[]}}
 */
export function movementProblem({ required = [], proofs = [], allowManual = true } = {}) {
  const have = new Map((proofs ?? []).filter(Boolean).map((p) => [`${p.role}__${p.kind}`, p]));
  const byRole = new Map();
  for (const p of (proofs ?? []).filter(Boolean)) {
    if (!byRole.has(p.role)) byRole.set(p.role, []);
    byRole.get(p.role).push(p);
  }

  const missing = [];
  for (const req of required) {
    const role = req?.role ?? PROOF_ROLES.SOURCE.id;
    const kinds = (Array.isArray(req?.kinds) ? req.kinds : [req?.kind]).filter(Boolean);
    const found = kinds.some((k) => have.has(`${role}__${k}`));
    if (!found) missing.push(req?.labelAr || kinds.map(kindLabel).join(' أو ') || PROOF_ROLES[role]?.labelAr || 'بيّنة');
  }

  const manual = (proofs ?? []).filter((p) => p && !isScanned(p));
  if (missing.length) {
    return {
      ok: false,
      missing,
      manual,
      message: `لا تُثبَّت الحركة بضغط زرّ — ينقص مسحُ: ${missing.join(' · ')}.`,
    };
  }
  if (!allowManual && manual.length) {
    return {
      ok: false,
      missing: [],
      manual,
      message: `هذه الحركة لا تقبل اختيارًا يدويًّا — أُدخل ${manual.map((p) => p.kindLabel).join(' · ')} بلا مسح.`,
    };
  }
  return { ok: true, message: '', missing: [], manual };
}

/**
 * خلاصةُ البيّنات — للسجلّ وللتقرير الرقابيّ.
 * `trust` نسبةُ ما ثبت بمسحٍ فعليّ من الأطراف كلّها.
 */
export function proofSummary(proofs) {
  const rows = (proofs ?? []).filter(Boolean);
  const scanned = rows.filter(isScanned).length;
  return {
    total: rows.length,
    scanned,
    manual: rows.length - scanned,
    trust: rows.length ? Math.round((scanned / rows.length) * 100) : 0,
    codes: rows.map((p) => p.code),
    reasons: rows.filter((p) => !isScanned(p)).map((p) => ({ code: p.code, kind: p.kindLabel, reason: p.reason })),
  };
}

/**
 * سطرٌ واحدٌ يصف الحركة للسجلّ — «من `W01-A01` إلى `W01-DOCK-OUT-01` بمسحتين».
 * يُقرأ بعد سنةٍ فيُعرف كيف وقعت.
 */
export function proofLine(proofs) {
  const rows = (proofs ?? []).filter(Boolean);
  if (!rows.length) return 'بلا بيّنة';
  const src = rows.filter((p) => p.role === PROOF_ROLES.SOURCE.id).map((p) => p.code);
  const dst = rows.filter((p) => p.role === PROOF_ROLES.DESTINATION.id).map((p) => p.code);
  const summary = proofSummary(rows);
  const how = summary.manual ? `${summary.scanned} مسحًا و${summary.manual} يدويًّا` : `${summary.scanned} مسحًا`;
  return `من ${src.join(' + ') || '—'} إلى ${dst.join(' + ') || '—'} · ${how}`;
}

/**
 * مساعدٌ للشاشات: يجمع بيّنةً جديدةً إلى قائمةٍ قائمة، ويستبدل بيّنةَ الطرف
 * والنوع نفسه إن أُعيد مسحُه (العامل يمسح البابَ ثانيةً لأنّه أخطأ).
 */
export function withProof(proofs, proof) {
  const rows = (proofs ?? []).filter(Boolean);
  const idx = rows.findIndex((p) => p.role === proof.role && p.kind === proof.kind);
  if (idx < 0) return [...rows, proof];
  return rows.map((p, i) => (i === idx ? proof : p));
}

/** بيّنةُ طرفٍ ونوعٍ بعينهما — أو `null`. */
export function findProof(proofs, role, kind) {
  return (proofs ?? []).find((p) => p?.role === role && p?.kind === kind) ?? null;
}

/** الكود الذي ثبت لطرفٍ ونوع — أو `''`. */
export function proofCode(proofs, role, kind) {
  return normalizeScan(findProof(proofs, role, kind)?.code);
}
