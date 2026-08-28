/**
 * باب الاستلام ‹LPN-717› — المرسَل مقابل المستلَم. منطق خالص.
 *
 * ═══ الفجوتان (ف-١٤ · ف-٢١) ═══
 * الاستلام مبنيٌّ (م٢) لكنّه يبدأ **من الشاشة** لا من الرصيف: لا بابَ يُمسح،
 * ولا مركبةَ تُثبت، ولا وقتَ يُعرف متى وصلت الشاحنة. فإذا اختلف المرسَل عن
 * المستلَم لم يُعرف أين وقع الفرق — أفي المصدر أم في الطريق أم عند الإنزال؟
 *
 * ═══ والنصّ عدّد خمسَ حالاتٍ يُستعمل فيها باب الاستلام ═══
 * توريدٌ جديد · تحويلٌ من مستودعٍ آخر · وصولُ سيّارةٍ من فرعٍ آخر ·
 * استلامُ المرتجعات · رجوعُ طلبٍ غير مسلَّم.
 *
 * وليست تسمياتٍ: **كلُّ حالةٍ لها وجهةٌ تالية مختلفة**. التوريد يمضي إلى
 * الفحص، والتحويلُ إلى الاستلام، والمرتجعُ إلى منطقة فحص المرتجعات، والطلبُ
 * الراجع يعود إلى مكانه. وخلطُها يعني مرتجعًا يدخل المخزون الصالح للبيع بلا
 * فرز — وهو ما منعته `SYSTEM_LOCATIONS.RETURNS` صراحةً.
 *
 * ═══ والنواة القائمة تُستدعى ═══
 * `transferPallets` يحمل مطابقة أمر النقل وفروقَه (LPN-404 · LPN-405) — يُقرأ
 * منه ولا يُنسخ. وهذا الملفّ يضيف **البوّابةَ قبله**: بابٌ ومركبةٌ يُمسحان.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from '../barcodes/barcodeCode.js';
import { vehicleMatchVerdict } from '../barcodes/vehicleCode.js';
import { serviceTypeOf } from '../locations/serviceLocations.js';
import { resolveLocationScan } from '../locations/qualifiedCode.js';
import { SYSTEM_LOCATIONS } from '../ledger/locations.js';
import { PROOF_ROLES, buildProof, movementProblem, proofCode, proofSummary, withProof } from './movementProof.js';

/**
 * أغراضُ الوصول الخمسة — ولكلٍّ **وجهتُه التالية**.
 * `nextStop` رمزُ موقع نظامٍ قائم أو مرحلةُ عملٍ معلنة، لا نصٌّ حرّ.
 */
export const INBOUND_PURPOSES = Object.freeze({
  SUPPLY: {
    id: 'SUPPLY',
    labelAr: 'توريدٌ جديد',
    nextStop: SYSTEM_LOCATIONS.RECEIVING.code,
    nextLabel: 'الفحص ثمّ ساحة الاستلام',
    expectsList: false,
  },
  TRANSFER_IN: {
    id: 'TRANSFER_IN',
    labelAr: 'تحويلٌ من مستودعٍ آخر',
    nextStop: SYSTEM_LOCATIONS.RECEIVING.code,
    nextLabel: 'ساحة الاستلام ثمّ التخزين',
    expectsList: true,
  },
  BRANCH_ARRIVAL: {
    id: 'BRANCH_ARRIVAL',
    labelAr: 'وصولُ سيّارةٍ من فرعٍ آخر',
    nextStop: SYSTEM_LOCATIONS.RECEIVING.code,
    nextLabel: 'ساحة الاستلام',
    expectsList: true,
  },
  RETURNS: {
    id: 'RETURNS',
    labelAr: 'استلامُ مرتجعات',
    nextStop: SYSTEM_LOCATIONS.RETURNS.code,
    nextLabel: 'منطقة فحص المرتجعات',
    expectsList: false,
  },
  UNDELIVERED: {
    id: 'UNDELIVERED',
    labelAr: 'رجوعُ طلبٍ غير مسلَّم',
    nextStop: SYSTEM_LOCATIONS.RETURNS.code,
    nextLabel: 'فحص المرتجعات ثمّ إعادة التخزين',
    expectsList: true,
  },
});

/** خطوات باب الاستلام — بابٌ ومركبةٌ ثمّ الحمولة. */
export const INBOUND_STEPS = Object.freeze([
  {
    id: 'DOOR',
    labelAr: 'باب الاستلام',
    kinds: [BARCODE_KINDS.DOCK_IN.id],
    role: PROOF_ROLES.DESTINATION.id,
    hint: 'امسح ملصق الرصيف الذي وقفت عنده الشاحنة.',
  },
  {
    id: 'VEHICLE',
    labelAr: 'المركبة أو الرحلة',
    kinds: [BARCODE_KINDS.VEHICLE.id, BARCODE_KINDS.DOCUMENT.id],
    role: PROOF_ROLES.SOURCE.id,
    hint: 'امسح ملصق السيارة أو رقم الرحلة.',
  },
  {
    id: 'ITEMS',
    labelAr: 'الطبالي والطرود المنزَّلة',
    kinds: [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id],
    role: PROOF_ROLES.SOURCE.id,
    hint: 'امسح كلّ طبليةٍ أو طردٍ يُنزَل.',
  },
]);

/** حالات جلسة باب الاستلام. */
export const INBOUND_STATES = Object.freeze({
  GATE: 'بوّابة المسح',
  UNLOADING: 'قيد التنزيل',
  CLOSED: 'أُغلقت',
});

/** ما يجب أن يُمسح قبل أن يُنزَّل شيء. */
export const REQUIRED_INBOUND_PROOFS = Object.freeze(
  INBOUND_STEPS.filter((st) => st.id !== 'ITEMS').map((st) => ({ role: st.role, kinds: st.kinds, labelAr: st.labelAr }))
);

/** حالُ الحمولة عند الإنزال — سليمةٌ أو تالفة. */
export const UNLOAD_CONDITIONS = Object.freeze({
  INTACT: 'سليمة',
  DAMAGED: 'تالفة',
});

const s = (v) => String(v ?? '').trim();

/** الغرضُ بمعرّفه — أو `null`. */
export function inboundPurpose(id) {
  return INBOUND_PURPOSES[s(id).toUpperCase()] ?? null;
}

/** الخطوةُ بمعرّفها — أو `null`. */
export function inboundStep(id) {
  return INBOUND_STEPS.find((st) => st.id === id) ?? null;
}

/**
 * يفتح جلسة بابٍ للاستلام.
 *
 * `expected` قائمةُ ما أُرسل (من أمر النقل أو من التحميل في المصدر) — تُترك
 * فارغةً في التوريد الجديد، فالمورّد لا يرسل طبالينا.
 */
export function openInbound({ purpose = 'SUPPLY', warehouse = '', expected = [], order = null, actor, actorName = '', at, device = '' } = {}) {
  const p = inboundPurpose(purpose);
  if (!p) return { problem: `غرضٌ غير معروف «${purpose ?? ''}» — الأغراض: ${Object.values(INBOUND_PURPOSES).map((x) => x.labelAr).join(' · ')}.` };
  if (!s(actor)) return { problem: 'جلسةُ بابٍ بلا فاعلٍ لا تُفتح.' };
  if (!s(at)) return { problem: 'جلسةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.' };

  const list = [...new Set((expected ?? []).map((c) => classifyScan(c).code).filter(Boolean))];
  if (p.expectsList && list.length === 0) {
    return { problem: `«${p.labelAr}» يحتاج قائمةَ ما أُرسل — بلا قائمةٍ لا تُعرف الفروق.` };
  }

  return {
    session: {
      state: 'GATE',
      purpose: p.id,
      warehouse: s(warehouse).toUpperCase(),
      order,
      expected: list,
      received: [],
      damaged: [],
      extras: [],
      door: '',
      vehicle: '',
      tripRef: '',
      proofs: [],
      itemProofs: [],
      openedBy: s(actor),
      openedByName: s(actorName),
      openedAt: s(at),
      device: s(device),
      closedBy: '',
      closedAt: '',
    },
  };
}

/** ★★ حكمُ مسح البابِ أو المركبة — وبابُ التحميل يُردّ هنا كما تُردّ البوّابة هناك. */
export function inboundScanVerdict(session, stepId, code, ctx = {}) {
  const step = inboundStep(stepId);
  if (!step || step.id === 'ITEMS') return { ok: false, message: `خطوةٌ غير معروفة «${stepId ?? ''}».` };
  if (session?.state === 'CLOSED') return { ok: false, message: 'الجلسة أُغلقت — لا مسحَ بعد الإغلاق.' };

  const resolved = step.id === 'DOOR' ? resolveLocationScan(code, ctx.qualifier ?? {}) : { code: normalizeScan(code), problem: '' };
  if (resolved.problem) return { ok: false, message: resolved.problem };

  const scan = classifyScan(resolved.code);
  if (scan.problem) return { ok: false, message: scan.problem };

  if (step.id === 'DOOR') {
    const type = serviceTypeOf(scan.code);
    if (type?.doorFlow !== 'inbound') {
      return {
        ok: false,
        message: `«${scan.code}» ${type?.labelAr ?? 'ليس بابًا'} — التنزيل لا يقع إلّا في باب استلام.`,
      };
    }
    const door = (ctx.doors ?? []).find((d) => normalizeScan(d?.code) === scan.code);
    if (door && door.active === false) return { ok: false, message: `الباب «${scan.code}» خارج الخدمة.` };
    const wh = s(session?.warehouse).toUpperCase();
    const doorWh = s(door?.warehouse).toUpperCase();
    if (wh && doorWh && wh !== doorWh) {
      return { ok: false, message: `الباب «${scan.code}» تابعٌ لمستودع ${doorWh} وأنت في ${wh}.` };
    }
    return { ok: true, message: '', code: scan.code };
  }

  if (scan.kind === BARCODE_KINDS.VEHICLE.id) {
    const out = vehicleMatchVerdict(scan.code, { expectedCode: ctx.expectedVehicle ?? '', expectedPlate: ctx.expectedPlate ?? '' });
    return out.ok ? { ok: true, message: '', code: scan.code } : out;
  }
  if (scan.kind === BARCODE_KINDS.DOCUMENT.id) {
    const want = normalizeScan(ctx.expectedTrip ?? '');
    if (want && scan.code !== want) return { ok: false, message: `الرحلة المتوقَّعة «${want}» والممسوحة «${scan.code}».` };
    return { ok: true, message: '', code: scan.code };
  }
  return { ok: false, message: `${step.labelAr}: المطلوب مركبةٌ أو رحلة — والممسوح ${kindLabel(scan.kind)} «${scan.code}».` };
}

/** يثبّت بيّنةَ بابٍ أو مركبة. */
export function applyInboundScan(session, stepId, code, { actor, actorName = '', at, manual = false, reason = '', ctx = {} } = {}) {
  const step = inboundStep(stepId);
  if (!step) return { problem: `خطوةٌ غير معروفة «${stepId ?? ''}».` };
  if (!manual) {
    const verdict = inboundScanVerdict(session, stepId, code, ctx);
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
      door: proofCode(proofs, PROOF_ROLES.DESTINATION.id, BARCODE_KINDS.DOCK_IN.id),
      vehicle: proofCode(proofs, PROOF_ROLES.SOURCE.id, BARCODE_KINDS.VEHICLE.id),
      tripRef: proofCode(proofs, PROOF_ROLES.SOURCE.id, BARCODE_KINDS.DOCUMENT.id),
    },
  };
}

/** ما بقي من مسح البوّابة. */
export function inboundGaps(session) {
  return movementProblem({ required: REQUIRED_INBOUND_PROOFS, proofs: session?.proofs ?? [] });
}

/** يبدأ التنزيل — ولا يبدأ قبل مسح الباب والمركبة. */
export function beginUnloading(session) {
  const gaps = inboundGaps(session);
  if (!gaps.ok) return { problem: gaps.message };
  if (session?.state !== 'GATE') return { problem: `الجلسة «${INBOUND_STATES[session?.state] ?? '؟'}» — بدأت سلفًا.` };
  return { session: { ...session, state: 'UNLOADING' } };
}

/**
 * حكمُ مسح حمولةٍ منزَّلة.
 *
 * القاعدتان: **لا تُستلم مرّتين**، و**ما ليس في القائمة يُسجَّل زائدًا بقرار**
 * لا يُبتلع. وحيث لا قائمة (توريدٌ جديد) يُقبل كلُّ ما يُمسح — والمورّد لا
 * يرسل طبالينا.
 */
export function unloadScanVerdict(session, code) {
  if (session?.state !== 'UNLOADING') {
    return { ok: false, message: 'امسح باب الاستلام والمركبة قبل تنزيل أيّ شيء.' };
  }
  const scan = classifyScan(code);
  if (![BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id].includes(scan.kind)) {
    return { ok: false, message: `«${normalizeScan(code)}» ليس ملصق طبلية ولا طرد.` };
  }
  if ((session.received ?? []).includes(scan.code)) {
    return { ok: false, kind: 'DUPLICATE', message: `«${scan.code}» مستلَمةٌ في هذه الجلسة أصلًا — لا تُستلم مرّتين.` };
  }
  const list = session.expected ?? [];
  if (list.length && !list.includes(scan.code)) {
    return {
      ok: false,
      kind: 'NOT_EXPECTED',
      message: `«${scan.code}» ليست في قائمة ما أُرسل — سجّلها زائدةً بسببٍ لتُحسم، ولا تدخل المخزن بلا قرار.`,
    };
  }
  return { ok: true, message: '', code: scan.code };
}

/** يسجّل حمولةً منزَّلة بحالها — سليمةً أو تالفة. */
export function applyUnload(session, code, { condition = 'INTACT', reason = '', actor, actorName = '', at } = {}) {
  const verdict = unloadScanVerdict(session, code);
  if (!verdict.ok) return { problem: verdict.message, kind: verdict.kind };
  if (condition === 'DAMAGED' && !s(reason)) {
    return { problem: 'الحمولة التالفة تحتاج وصفَ الضرر — يُقرأ في محضر الفرق ويُطالَب به المصدر.' };
  }

  const built = buildProof({
    role: PROOF_ROLES.SOURCE.id,
    value: verdict.code,
    expect: [BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id],
    actor,
    actorName,
    at,
    device: session?.device,
    reason,
  });
  if (built.problem) return { problem: built.problem };

  return {
    session: {
      ...session,
      received: [...(session.received ?? []), verdict.code],
      damaged:
        condition === 'DAMAGED'
          ? [...(session.damaged ?? []), { code: verdict.code, reason: s(reason), actor: s(actor), at: s(at) }]
          : session.damaged ?? [],
      itemProofs: [...(session.itemProofs ?? []), built.proof],
    },
  };
}

/** يسجّل حمولةً زائدةً بقرارٍ وسبب — تُسجَّل ولا تُبتلع. */
export function applyUnloadExtra(session, code, { reason, actor, actorName = '', at } = {}) {
  if (session?.state !== 'UNLOADING') return { problem: 'لا تنزيلَ قبل مسح الباب والمركبة.' };
  if (!s(reason)) return { problem: 'الحمولة الزائدة تحتاج سببًا مكتوبًا — من قرّر إنزالها ولماذا؟' };
  const scan = classifyScan(code);
  if (![BARCODE_KINDS.PALLET.id, BARCODE_KINDS.PARCEL.id].includes(scan.kind)) {
    return { problem: `«${normalizeScan(code)}» ليس ملصق طبلية ولا طرد.` };
  }
  const built = buildProof({
    role: PROOF_ROLES.SOURCE.id,
    value: scan.code,
    actor,
    actorName,
    at,
    reason,
  });
  if (built.problem) return { problem: built.problem };

  return {
    session: {
      ...session,
      received: [...(session.received ?? []), scan.code],
      extras: [...(session.extras ?? []), { code: scan.code, reason: s(reason), actor: s(actor), at: s(at) }],
      itemProofs: [...(session.itemProofs ?? []), built.proof],
    },
  };
}

/**
 * ★★ الفرق بين المرسَل والمستلَم — ناقصٌ وزائدٌ وتالف.
 * محسوبٌ لا مخزَّن، فلا يفترق عن المسحات.
 */
export function inboundVariance(session) {
  const expected = session?.expected ?? [];
  const received = session?.received ?? [];
  const missing = expected.filter((c) => !received.includes(c));
  const extras = (session?.extras ?? []).map((x) => x.code);
  const damaged = (session?.damaged ?? []).map((x) => x.code);
  return {
    expected: expected.length,
    received: received.length,
    missing: missing.length,
    missingList: missing,
    extras: extras.length,
    extrasList: extras,
    damaged: damaged.length,
    damagedList: damaged,
    clean: missing.length === 0 && extras.length === 0 && damaged.length === 0,
  };
}

/** سببُ منع إغلاق باب الاستلام — أو `''`. والفرقُ يُمرَّر بسببٍ مكتوب. */
export function inboundCloseProblem(session, { override = false, overrideNote = '' } = {}) {
  if (session?.state !== 'UNLOADING') return `الجلسة «${INBOUND_STATES[session?.state] ?? '؟'}» — لا تُغلق إلّا وهي قيد التنزيل.`;
  if (!(session.received ?? []).length && !(session.expected ?? []).length) {
    return 'لم يُنزَّل شيء — امسح ما نزل أو ألغِ الجلسة.';
  }
  const v = inboundVariance(session);
  if (v.clean) return '';
  if (!override) {
    const parts = [];
    if (v.missing) parts.push(`${v.missing} لم تصل (${v.missingList.slice(0, 3).join(' · ')})`);
    if (v.extras) parts.push(`${v.extras} زائدة`);
    if (v.damaged) parts.push(`${v.damaged} تالفة`);
    return `${parts.join(' · ')} — لا يُغلق الباب على فرقٍ بلا قرار. أغلق بصلاحيةٍ وسببٍ يُقيَّد في محضر الفرق.`;
  }
  if (!s(overrideNote)) return 'الإغلاق على فرقٍ يحتاج سببًا مكتوبًا — يُقيَّد باسم من قرّره ويبقى في السجلّ.';
  return '';
}

/**
 * يغلق باب الاستلام ويقول **الوجهة التالية** — فحصٌ أو استلامٌ أو مرتجعات.
 * وهي مشتقّةٌ من الغرض لا مختارةٌ بيد.
 */
export function closeInbound(session, { actor, at, override = false, overrideNote = '' } = {}) {
  const problem = inboundCloseProblem(session, { override, overrideNote });
  if (problem) return { problem };
  if (!s(actor)) return { problem: 'إغلاقُ الباب بلا فاعلٍ لا يُسجَّل.' };
  if (!s(at)) return { problem: 'إغلاقُ الباب بلا وقتٍ لا يُرتَّب.' };

  const p = inboundPurpose(session?.purpose);
  return {
    session: {
      ...session,
      state: 'CLOSED',
      closedBy: s(actor),
      closedAt: s(at),
      overrideNote: override ? s(overrideNote) : '',
      nextStop: p?.nextStop ?? '',
    },
    nextStop: p?.nextStop ?? '',
    nextLabel: p?.nextLabel ?? '',
    variance: inboundVariance(session),
  };
}

/** بطاقةُ باب الاستلام — للسجلّ ولمحضر الفرق. */
export function inboundCard(session) {
  const p = inboundPurpose(session?.purpose);
  const v = inboundVariance(session);
  const proof = proofSummary([...(session?.proofs ?? []), ...(session?.itemProofs ?? [])]);
  return {
    state: session?.state ?? '',
    stateLabel: INBOUND_STATES[session?.state] ?? '',
    purpose: p?.id ?? '',
    purposeLabel: p?.labelAr ?? '',
    nextLabel: p?.nextLabel ?? '',
    door: s(session?.door),
    vehicle: s(session?.vehicle),
    tripRef: s(session?.tripRef),
    warehouse: s(session?.warehouse),
    arrivedAt: s(session?.openedAt),
    closedAt: s(session?.closedAt),
    ...v,
    trust: proof.trust,
    manualProofs: proof.manual,
  };
}
