/**
 * التجهيز والتحميل — من طبلية صرفٍ مغلقة إلى شاحنةٍ تخرج. منطق خالص.
 *
 * المشكلة التي يحلّها: أخطرُ خسارةٍ في المستودع لا تقع في الرفّ بل **عند
 * باب الشحن**: طبليةٌ تُحمَّل لفرعٍ غير فرعها، أو تُترك فتخرج الشاحنة ناقصة،
 * أو تُحمَّل مرّتين فتُحسب مرّتين. وثلاثتها تُكتشف عند العميل لا عندنا.
 *
 * فالتحقّق **طبليةً بطبلية** يغلق الأبواب الثلاثة (خطة ٧ سابعًا).
 *
 * ═══ القاعدتان الحاكمتان ═══
 * ①**لا تحميل طبليةٍ غير مرتبطةٍ بالمستند أو الرحلة** (القاعدة ٧)، و**لا
 *   تُحمَّل مرّتين** (القاعدة ٨).
 * ②**لا يُغلق التحميل بناقصةٍ أو زائدة** إلّا بصلاحيةٍ استثنائيّةٍ بسبب —
 *   لأنّ الشاحنة قد تكون واقفةً والسائق ينتظر، وبابٌ مغلقٌ تمامًا يعني
 *   خروجًا بلا تسجيل.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { normalizeLpnCode, isValidLpnCode } from './lpnCode.js';
import { isBlockedForIssue, LPN_FLAGS, stateLabel } from './lpnLifecycle.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/* ═══════════════ التجهيز (LPN-305) ═══════════════ */

/**
 * ★ منطقة التجهيز **موقعٌ** بنحو الكود القائم لا كيانٌ موازٍ.
 *
 * ولماذا؟ لأنّها رفٌّ في المبنى له كودٌ ويُمسح ويُخزَّن فيه — فلو صارت
 * كيانًا ثانيًا لَاحتاجت سيّدًا ثانيًا وخريطةً ثانيةً وتقريرًا ثانيًا،
 * وافترقت عن المواقع أوّلَ تغييرٍ في أحدهما.
 */
export function stagingAssignVerdict(unit, binCode, { route = '', branch = '' } = {}) {
  const bin = normalizeLocationCode(binCode);
  if (!bin) return { ok: false, message: 'امسح باركود منطقة التجهيز — لا ربطَ بموقعٍ غير مقروء.' };
  if (unit?.state !== 'ISSUE_CLOSED') {
    return { ok: false, message: `الطبلية «${stateLabel(unit?.state)}» — تُجهَّز بعد إغلاقها طبليةَ صرف.` };
  }

  // ★ منعُ الخلط: طبليةُ فرعٍ في مسار فرعٍ آخر تخرج مع الشاحنة الخطأ،
  // ولا تُكتشف إلّا حين يشتكي فرعٌ من نقصٍ وآخر من زيادة.
  const wanted = up(unit?.route || unit?.branch);
  const given = up(route || branch);
  if (wanted && given && wanted !== given) {
    return {
      ok: false,
      message: `الطبلية لـ«${wanted}» والمنطقة لـ«${given}» — لا تضعها في مسار فرعٍ آخر؛ تخرج مع الشاحنة الخطأ.`,
    };
  }
  return { ok: true, message: '', bin };
}

/** مدّة بقاء الطبلية في التجهيز — من أحداثها لا من حقلٍ مخزَّن (مؤشّر خطة ٧). */
export function stagingDwellMs(unit, nowMs) {
  const at = Date.parse(unit?.stagedAt ?? '');
  if (Number.isNaN(at) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, nowMs - at);
}

/* ═══════════════ التحميل (LPN-306) ═══════════════ */

/** حالات جلسة التحميل. */
export const LOADING_STATES = Object.freeze({
  OPEN: 'مفتوحة',
  CLOSED: 'مغلقة',
  CANCELLED: 'ملغاة',
});

/**
 * فتح جلسة تحميلٍ لرحلةٍ أو مستند — بقائمةِ الطبالي المتوقَّعة.
 *
 * @returns {{session:object}|{problem:string}}
 */
export function openLoading({ tripId = '', docRef = null, expected = [], vehicle = '', driver = '', actor, at } = {}) {
  if (!tripId && !docRef?.id) return { problem: 'التحميل يتبع رحلةً أو مستندًا — لا تحميلَ بلا أيّهما (القاعدة ٧).' };
  const list = [...new Set((expected ?? []).map((c) => normalizeLpnCode(c)).filter(isValidLpnCode))];
  if (list.length === 0) return { problem: 'لا طبليةً متوقَّعة — جهّز الطبالي أوّلًا ثمّ افتح التحميل.' };
  if (!String(actor ?? '').trim()) return { problem: 'جلسةُ تحميلٍ بلا فاعلٍ لا تُفتح.' };

  return {
    session: {
      state: 'OPEN',
      tripId: String(tripId ?? '').trim(),
      docRef,
      vehicle: up(vehicle),
      driver: String(driver ?? '').trim(),
      expected: list,
      loaded: [],
      extras: [],
      seal: '',
      openedBy: String(actor).trim(),
      openedAt: at ?? null,
    },
  };
}

/**
 * ★★★ حكم مسح طبليةٍ عند التحميل — القاعدتان ٧ و٨.
 *
 * @returns {{ok:boolean, message:string, kind?:string}}
 */
export function loadScanVerdict(session, code, unit) {
  if (session?.state !== 'OPEN') return { ok: false, message: `الجلسة «${LOADING_STATES[session?.state] ?? '؟'}» — لا مسحَ بعد الإغلاق.` };
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) return { ok: false, message: `«${code ?? ''}» ليس ملصق طبلية.` };

  // ⑧ لا تُحمَّل مرّتين — أخطرُ خطأٍ صامت: تُحسب مرّتين وتنقص من مكانٍ آخر.
  if ((session.loaded ?? []).includes(lpn)) {
    return { ok: false, kind: 'DUPLICATE', message: `الطبلية «${lpn}» محمَّلةٌ في هذه الرحلة أصلًا — لا تُحمَّل مرّتين.` };
  }

  // ⑦ خارج المستند أو الرحلة — تُردّ ولا تُبتلع.
  if (!(session.expected ?? []).includes(lpn)) {
    return {
      ok: false,
      kind: 'NOT_EXPECTED',
      message: `الطبلية «${lpn}» ليست في هذه الرحلة — راجع مسارها قبل تحميلها؛ تحميلُها هنا نقصٌ هناك.`,
    };
  }

  if (unit && isBlockedForIssue(unit)) {
    const names = (unit.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f)).map((f) => `«${LPN_FLAGS[f]}»`).join(' و');
    return { ok: false, kind: 'BLOCKED', message: `الطبلية موسومة ${names} — لا تُحمَّل حتى يُرفع الوسم.` };
  }

  return { ok: true, message: '' };
}

/** تسجيل طبليةٍ محمَّلة — يعيد جلسةً جديدة. */
export function applyLoad(session, code) {
  const lpn = normalizeLpnCode(code);
  return { ...session, loaded: [...(session.loaded ?? []), lpn] };
}

/**
 * تسجيل طبليةٍ زائدة **بقرار**: ليست في الرحلة لكنّها حُمِّلت فعلًا.
 * تُسجَّل صراحةً لا تُبتلع — فيُعرف يوم الوصول لماذا وصل ما لم يُرسَل.
 */
export function applyExtra(session, code, { reason, actor } = {}) {
  if (!String(reason ?? '').trim()) return { problem: 'الطبلية الزائدة تحتاج سببًا مكتوبًا — من قرّر تحميلها ولماذا؟' };
  if (!String(actor ?? '').trim()) return { problem: 'الزائدة بلا فاعلٍ لا تُسجَّل.' };
  const lpn = normalizeLpnCode(code);
  return {
    session: {
      ...session,
      loaded: [...(session.loaded ?? []), lpn],
      extras: [...(session.extras ?? []), { lpn, reason: String(reason).trim(), actor: String(actor).trim() }],
    },
  };
}

/** العدّاد اللحظيّ: المطلوب والمقروء والمتبقّي والزائد (خطة ٧ سابعًا). */
export function loadingCounters(session) {
  const expected = session?.expected ?? [];
  const loaded = session?.loaded ?? [];
  const missing = expected.filter((c) => !loaded.includes(c));
  return {
    expected: expected.length,
    loaded: loaded.length,
    missing: missing.length,
    missingList: missing,
    extras: (session?.extras ?? []).length,
    complete: missing.length === 0,
  };
}

/**
 * ★★★ سبب رفض إغلاق التحميل — أو '' إن جاز.
 *
 * الناقصةُ والزائدة كلتاهما تمنعان — والاستثناء بسببٍ مكتوبٍ لأنّ الشاحنة
 * قد تكون واقفةً والسائق ينتظر، وبابٌ مغلقٌ تمامًا يعني خروجًا بلا تسجيل.
 */
export function loadingCloseProblem(session, { override = false, overrideNote = '' } = {}) {
  if (session?.state !== 'OPEN') return `الجلسة «${LOADING_STATES[session?.state] ?? '؟'}» — لا تُغلق مرّتين.`;
  const c = loadingCounters(session);
  if (c.missing > 0 || c.extras > 0) {
    if (!override) {
      const parts = [];
      if (c.missing > 0) parts.push(`${c.missing} طبليةً لم تُحمَّل (${c.missingList.slice(0, 3).join(' · ')})`);
      if (c.extras > 0) parts.push(`${c.extras} طبليةً زائدة`);
      return `${parts.join(' و')} — لا تُغلق الرحلة ناقصةً ولا زائدة. حمّل الباقي أو أغلق بصلاحيةٍ وسبب.`;
    }
    if (!String(overrideNote ?? '').trim()) {
      return 'الإغلاق الاستثنائيّ يحتاج سببًا مكتوبًا — يُقيَّد باسم من قرّره ويبقى في السجلّ.';
    }
  }
  return '';
}

/** إغلاق التحميل واعتماد الخروج. */
export function closeLoading(session, { actor, at, seal = '', override = false, overrideNote = '' } = {}) {
  const problem = loadingCloseProblem(session, { override, overrideNote });
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'اعتمادُ الخروج بلا فاعلٍ لا يُسجَّل.' };
  return {
    session: {
      ...session,
      state: 'CLOSED',
      seal: String(seal ?? '').trim(),
      closedBy: String(actor).trim(),
      closedAt: at ?? null,
      ...(override ? { closeOverride: { note: String(overrideNote).trim(), actor: String(actor).trim() } } : {}),
    },
  };
}

/* ═══════════════ الرصيد المرحليّ (LPN-307) ═══════════════ */

/**
 * ★★ تدرّج الرصيد المرحليّ — **مشتقٌّ من حالات الطبالي لا بُعدٌ في المفتاح**.
 *
 * خطة ٧ تطلب التفريق بين: الفعليّ والمحجوز وقيد التحضير وفي التجهيز
 * والمحمَّل. وإضافةُ هذه المراحل إلى مفتاح الرصيد كانت ستقسّمه خمس مرّات
 * وتكسر مطابقة مفتاح الاستلام بمفتاح السحب وحارس FEFO.
 *
 * فالمراحل تُحسب هنا **للعرض والرقابة**، والفعليّ يبقى من الدفتر كما هو
 * (ح-٢). ومجموعُ المراحل لا يتجاوز الفعليّ أبدًا — واختبارٌ يثبته.
 */
const STAGE_OF = Object.freeze({
  RESERVED: 'reserved',
  PICKING: 'picking',
  ISSUE_CLOSED: 'picking',
  STAGED: 'staged',
  LOADING: 'staged',
  LOADED: 'loaded',
});

export function stagedBalanceOf(units, { sku, warehouse } = {}) {
  const item = up(sku);
  const wh = up(warehouse);
  const out = { reserved: 0, picking: 0, staged: 0, loaded: 0, stored: 0 };

  for (const u of units ?? []) {
    if (wh && up(u?.warehouse) !== wh) continue;
    const stage = STAGE_OF[u?.state] ?? (u?.state === 'STORED' ? 'stored' : null);
    if (!stage) continue;
    for (const l of u?.lines ?? []) {
      if (item && up(l?.sku) !== item && up(l?.barcode) !== item) continue;
      out[stage] += Number(l?.baseQty ?? l?.qty) || 0;
    }
  }
  return out;
}

/**
 * الصورة الكاملة لصنفٍ: الفعليّ **من الدفتر** والمراحل **من الطبالي**.
 *
 * @param {number} actualQty الرصيد الفعليّ من `balances` — يُمرَّر ولا يُحسب هنا.
 */
export function itemStockPicture(units, { sku, warehouse, actualQty = 0 } = {}) {
  const stages = stagedBalanceOf(units, { sku, warehouse });
  const inFlight = stages.reserved + stages.picking + stages.staged + stages.loaded;
  return {
    actual: Number(actualQty) || 0,
    ...stages,
    inFlight,
    // المتاح تقديرًا للعرض: الفعليّ ناقص ما التزم. والمتاح **الرسميّ** من
    // `availableQty` في الدفتر — وهذا لا ينافسه بل يفصّل أين ذهب الملتزَم.
    freeEstimate: Math.max(0, (Number(actualQty) || 0) - inFlight),
    // ★ علمُ التناقض: محمولٌ يتجاوز الفعليّ يعني حركةً لم تُقيَّد أو قراءةً
    // مكرّرة — يُعلَن ولا يُبتلع.
    exceedsActual: inFlight > (Number(actualQty) || 0),
  };
}
