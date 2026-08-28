/**
 * دورة التعبئة ‹LPN-712› — من طلبٍ محضَّر إلى طرودٍ مغلقةٍ جاهزةٍ للتحميل. منطق خالص.
 *
 * ═══ الفجوة (ف-١٦) ═══
 * التعبئة اليوم **مستندٌ ورقيّ** (`documents/schemas/pack.js`): أرقام الطرود
 * تُكتب باليد، والمعبِّئ لا يُسجَّل، وإعادةُ فتح طردٍ مكتملٍ تقع بلا أثر. فإذا
 * وصل العميل ناقصًا لم يُعرف: أفي التحضير نقص أم في التعبئة أم في الطريق؟
 *
 * ═══ ★★ والقاعدة الحاكمة تُطبَّق هنا حرفيًّا ═══
 * «إذا أُعيد فتح طردٍ مكتمل، **يجب تسجيل السبب والموظّف والوقت، وإلغاء الملصق
 * السابق أو توضيح أنّه أُعيدت طباعته**». فالفتحُ هنا ليس مسحَ حالةٍ بل **حدثٌ
 * يُقيَّد**، وملصقُ الطرد القديم يُبطَل بقرارٍ لا بسهو — لأنّ ملصقين لطردٍ
 * واحدٍ في الشاحنة يعني طردًا يُحسب مرّتين.
 *
 * ═══ وحالات الطلب الخمس كما عدّدها النصّ ═══
 * `قيد التحضير · مكتمل · قيد التعبئة · جاهز للتحميل · محمَّل` — ومعها
 * «في منطقة التجهيز» لأنّ النصّ سأل عنها صراحةً: «الطلبات الموجودة في كلّ
 * منطقة تحضير».
 *
 * ═══ والنمط من `pickingTask.js` ═══
 * دورةُ المهمّة وحالاتُها وحكمُ إغلاقها — النمط نفسه، فلا يتعلّم القارئ
 * دورتين. والزمنُ يُمرَّر ولا يُقرأ.
 */

import { parcelCodeProblem, parcelCodes, parcelOfTotal, parseShipmentCode, shipmentCodeProblem } from './shipmentCode.js';
import { normalizeScan } from '../barcodes/barcodeCode.js';
import { normalizeLocationCode } from '../locations/locationCode.js';

/** حالات الطلب في رحلته من الرفّ إلى الشاحنة. */
export const ORDER_STATES = Object.freeze({
  PICKING: 'قيد التحضير',
  PICKED: 'مكتمل التحضير',
  STAGED: 'في منطقة التجهيز',
  PACKING: 'قيد التعبئة',
  READY: 'جاهز للتحميل',
  LOADED: 'محمَّل',
});

/** الانتقالات المسموحة — والرجوعُ الوحيد من التعبئة إلى التجهيز (طردٌ أُعيد فتحه). */
export const ORDER_TRANSITIONS = Object.freeze({
  PICKING: Object.freeze(['PICKED']),
  PICKED: Object.freeze(['STAGED', 'PACKING']),
  STAGED: Object.freeze(['PACKING']),
  PACKING: Object.freeze(['READY', 'STAGED']),
  READY: Object.freeze(['LOADED', 'PACKING']),
  LOADED: Object.freeze([]),
});

/** حالات الطرد. `REOPENED` حالةٌ لا محو — أثرُ الفتح يبقى. */
export const PARCEL_STATES = Object.freeze({
  OPEN: 'مفتوح',
  CLOSED: 'مغلق',
  REOPENED: 'أُعيد فتحه',
  CANCELLED: 'ملغى',
});

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const qty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** عنوانُ حالة الطلب للعرض. */
export function orderStateLabel(state) {
  return ORDER_STATES[state] ?? s(state);
}

/** سببُ منع انتقال حالة الطلب — أو `''`. */
export function orderTransitionProblem(current, next) {
  if (!ORDER_STATES[next]) return `حالةٌ غير معروفة «${next ?? ''}».`;
  const allowed = ORDER_TRANSITIONS[current] ?? [];
  if (allowed.includes(next)) return '';
  return allowed.length
    ? `لا انتقال من «${orderStateLabel(current)}» إلى «${orderStateLabel(next)}» — المتاح: ${allowed.map(orderStateLabel).join(' · ')}.`
    : `«${orderStateLabel(current)}» حالةٌ ختاميّة — لا انتقال بعدها.`;
}

/** بندٌ مسوًّى — صورةٌ واحدةٌ للمتوقَّع وللمعبَّأ فتصحّ المقارنة. */
function shapeLine(line) {
  return {
    sku: up(line?.sku),
    barcode: s(line?.barcode),
    description: s(line?.description),
    uom: s(line?.uom),
    batch: up(line?.batch),
    qty: qty(line?.qty),
  };
}

/**
 * يفتح جلسة تعبئةٍ لطلبٍ محضَّر.
 *
 * @returns {{session:object}|{problem:string}}
 */
export function openPacking(order, { actor, actorName = '', at, stagingBin = '' } = {}) {
  if (!s(order?.orderRef)) return { problem: 'لا مرجعَ للطلب — أيّ طلبٍ يُعبَّأ؟' };
  if (!s(actor)) return { problem: 'التعبئة بلا معبِّئٍ لا تُسجَّل — النصّ اشترط تسجيل من عبّأ.' };
  if (!s(at)) return { problem: 'جلسةٌ بلا وقتٍ لا تُرتَّب — مرّر الوقت من المستدعي.' };

  const state = s(order?.state) || 'PICKED';
  const problem = state === 'PACKING' ? '' : orderTransitionProblem(state, 'PACKING');
  if (problem) return { problem };

  const expected = (order?.lines ?? []).map(shapeLine).filter((l) => l.sku && l.qty > 0);
  if (!expected.length) return { problem: 'الطلب بلا بنودٍ محضَّرة — لا شيء يُعبَّأ.' };

  return {
    session: {
      orderRef: s(order.orderRef),
      orderType: up(order?.orderType ?? order?.type),
      customerCode: up(order?.customerCode),
      customerName: s(order?.customerName),
      branch: up(order?.branch),
      route: up(order?.route),
      warehouse: up(order?.warehouse),
      stagingBin: normalizeLocationCode(stagingBin),
      state: 'PACKING',
      shipment: '',
      parcelTotal: 0,
      parcels: [],
      expected,
      openedBy: s(actor),
      openedByName: s(actorName),
      openedAt: s(at),
      closedBy: '',
      closedAt: '',
    },
  };
}

/**
 * ★★ يحدّد عدد الطرود النهائيّ ويولّد أكوادها.
 *
 * ولا يقلّ العدد عن **الطرود المغلقة**: ملصقاتُها في الشاحنة، وتقليصُ العدد
 * تحتها يجعل ملصقًا مطبوعًا يشير إلى طردٍ لا وجود له في النظام.
 */
export function setParcelCount(session, total, { shipment = '' } = {}) {
  const shp = normalizeScan(shipment || session?.shipment);
  const shipmentProblem = shipmentCodeProblem(shp);
  if (shipmentProblem) return { problem: shipmentProblem };

  const t = Math.trunc(Number(total));
  const closed = (session?.parcels ?? []).filter((p) => p.state === 'CLOSED').length;
  if (!Number.isFinite(t) || t < 1) return { problem: 'عدد الطرود يبدأ من ١.' };
  if (t < closed) {
    return { problem: `أُغلق ${closed} طردًا وملصقاتُها في الميدان — لا يقلّ العدد عنها. ألغِ طردًا بسببٍ إن لزم.` };
  }

  const built = parcelCodes(shp, t);
  if (built.problem) return { problem: built.problem };

  const byNo = new Map((session?.parcels ?? []).map((p) => [p.no, p]));
  const parcels = built.codes.map((code, i) => {
    const no = i + 1;
    const existing = byNo.get(no);
    return existing
      ? { ...existing, code }
      : { no, code, state: 'OPEN', lines: [], closedBy: '', closedAt: '', reopens: [], labelCopies: 0 };
  });

  return { session: { ...session, shipment: shp, parcelTotal: t, parcels } };
}

/** الطردُ بعدده — أو `null`. */
export function parcelOf(session, no) {
  return (session?.parcels ?? []).find((p) => p.no === Math.trunc(Number(no))) ?? null;
}

/** الطردُ بكوده الممسوح — أو `null`. */
export function parcelByCode(session, code) {
  const parsed = parseShipmentCode(code);
  if (!parsed?.isParcel) return null;
  if (normalizeScan(session?.shipment) && parsed.shipment !== normalizeScan(session.shipment)) return null;
  return parcelOf(session, parsed.parcelNo);
}

/**
 * حكمُ مسح طردٍ في هذه الجلسة — الرسالة تسمّي شحنته حين يكون من غيرها.
 */
export function parcelScanVerdict(session, code) {
  const problem = parcelCodeProblem(code, { total: session?.parcelTotal, shipment: session?.shipment });
  if (problem) return { ok: false, message: problem, parcel: null };
  const parcel = parcelByCode(session, code);
  if (!parcel) return { ok: false, message: `الطرد «${normalizeScan(code)}» ليس في هذه الجلسة.`, parcel: null };
  return { ok: true, message: '', parcel };
}

/**
 * ★ ما تبقّى من كلّ بندٍ بعد ما وُزّع على الطرود.
 * محسوبٌ لا مخزَّن — حقلٌ يُخزَّن يفترق عن الطرود أوّل تعديل.
 */
export function remainingLines(session) {
  const packed = new Map();
  for (const p of session?.parcels ?? []) {
    if (p.state === 'CANCELLED') continue;
    for (const l of p.lines ?? []) {
      const key = `${up(l.sku)}__${up(l.batch)}`;
      packed.set(key, (packed.get(key) ?? 0) + qty(l.qty));
    }
  }
  return (session?.expected ?? []).map((l) => {
    const key = `${l.sku}__${l.batch}`;
    const done = packed.get(key) ?? 0;
    return { ...l, packed: done, remaining: Math.max(0, l.qty - done), extra: Math.max(0, done - l.qty) };
  });
}

/**
 * حكمُ إضافة بندٍ إلى طرد — يمنع **الدخيل** و**الزائد**.
 *
 * وهما العطبان اللذان يصلان العميل: صنفٌ ليس له، أو كمّيّةٌ أكثر ممّا طلب —
 * وكلاهما يُكتشف عنده لا عندنا.
 */
export function packLineVerdict(session, no, line) {
  const parcel = parcelOf(session, no);
  if (!parcel) return { ok: false, message: `لا طردَ برقم ${no} في هذه الجلسة.` };
  if (parcel.state === 'CLOSED') return { ok: false, message: `الطرد ${no} مغلق — أعِد فتحه بسببٍ قبل التعديل.` };
  if (parcel.state === 'CANCELLED') return { ok: false, message: `الطرد ${no} ملغًى.` };

  const shaped = shapeLine(line);
  if (!shaped.sku) return { ok: false, message: 'امسح باركود الصنف.' };
  if (shaped.qty <= 0) return { ok: false, message: 'الكمّيّة تبدأ من واحد.' };

  const row = remainingLines(session).find((r) => r.sku === shaped.sku && r.batch === shaped.batch);
  if (!row) {
    return { ok: false, message: `«${shaped.sku}» ليس من بنود هذا الطلب — صنفٌ دخيلٌ يصل العميل ولا يعرف أحدٌ من أين.` };
  }
  if (shaped.qty > row.remaining) {
    return {
      ok: false,
      message: `المتبقّي من «${shaped.sku}» ${row.remaining} ${row.uom || ''} والمطلوب إضافته ${shaped.qty} — زائدٌ عن المحضَّر.`.trim(),
    };
  }
  return { ok: true, message: '' };
}

/** يضيف بندًا إلى طرد — `{session}` أو `{problem}`. */
export function packLine(session, no, line) {
  const verdict = packLineVerdict(session, no, line);
  if (!verdict.ok) return { problem: verdict.message };
  const shaped = shapeLine(line);
  return {
    session: {
      ...session,
      parcels: session.parcels.map((p) => {
        if (p.no !== Math.trunc(Number(no))) return p;
        const idx = (p.lines ?? []).findIndex((l) => up(l.sku) === shaped.sku && up(l.batch) === shaped.batch);
        const lines =
          idx >= 0
            ? p.lines.map((l, i) => (i === idx ? { ...l, qty: qty(l.qty) + shaped.qty } : l))
            : [...(p.lines ?? []), shaped];
        return { ...p, lines };
      }),
    },
  };
}

/** سببُ منع إغلاق طرد — أو `''`. */
export function closeParcelProblem(session, no) {
  const parcel = parcelOf(session, no);
  if (!parcel) return `لا طردَ برقم ${no}.`;
  if (parcel.state === 'CLOSED') return `الطرد ${no} مغلقٌ سلفًا.`;
  if (parcel.state === 'CANCELLED') return `الطرد ${no} ملغًى.`;
  if (!(parcel.lines ?? []).length) return `الطرد ${no} فارغ — طردٌ فارغٌ مغلقٌ ملصقٌ بلا حمولة.`;
  return '';
}

/** يغلق طردًا ويقيّد من أغلقه ومتى. */
export function closeParcel(session, no, { actor, at } = {}) {
  const problem = closeParcelProblem(session, no);
  if (problem) return { problem };
  if (!s(actor)) return { problem: 'إغلاق الطرد بلا فاعلٍ لا يُسجَّل.' };
  if (!s(at)) return { problem: 'إغلاق الطرد بلا وقتٍ لا يُرتَّب.' };

  return {
    session: {
      ...session,
      parcels: session.parcels.map((p) =>
        p.no === Math.trunc(Number(no)) ? { ...p, state: 'CLOSED', closedBy: s(actor), closedAt: s(at) } : p
      ),
    },
  };
}

/**
 * ★★ إعادة فتح طردٍ مكتمل — سببٌ وفاعلٌ ووقت، وملصقُه السابق يُبطَل.
 *
 * `voidLabel` يقول للمستدعي: **ألغِ قيد الملصق في سجلّ الباركود**. والقرار
 * هنا لا هناك، لأنّ الشرط شرطُ عملٍ لا شرطُ تخزين.
 */
export function reopenParcel(session, no, { reason, actor, at } = {}) {
  const parcel = parcelOf(session, no);
  if (!parcel) return { problem: `لا طردَ برقم ${no}.` };
  if (parcel.state !== 'CLOSED') return { problem: `الطرد ${no} ${PARCEL_STATES[parcel.state] ?? ''} — لا يُعاد فتحُ ما لم يُغلق.`.trim() };
  if (!s(reason)) return { problem: 'إعادة فتح طردٍ مكتملٍ تحتاج سببًا مكتوبًا — يبقى في السجلّ للأبد.' };
  if (!s(actor)) return { problem: 'إعادة الفتح بلا فاعلٍ لا تُسجَّل.' };
  if (!s(at)) return { problem: 'إعادة الفتح بلا وقتٍ لا تُرتَّب.' };

  const reopen = Object.freeze({ reason: s(reason), actor: s(actor), at: s(at), previousLabelCopies: parcel.labelCopies ?? 0 });
  return {
    session: {
      ...session,
      state: session.state === 'READY' ? 'PACKING' : session.state,
      parcels: session.parcels.map((p) =>
        p.no === parcel.no ? { ...p, state: 'REOPENED', reopens: [...(p.reopens ?? []), reopen] } : p
      ),
    },
    voidLabel: parcel.code,
    reopen,
  };
}

/** يلغي طردًا بسبب — حالةٌ لا حذف، وملصقُه يُبطَل. */
export function cancelParcel(session, no, { reason, actor, at } = {}) {
  const parcel = parcelOf(session, no);
  if (!parcel) return { problem: `لا طردَ برقم ${no}.` };
  if (!s(reason)) return { problem: 'إلغاء الطرد يحتاج سببًا مكتوبًا.' };
  if (!s(actor) || !s(at)) return { problem: 'الإلغاء بلا فاعلٍ ووقتٍ لا يُسجَّل.' };
  return {
    session: {
      ...session,
      parcels: session.parcels.map((p) =>
        p.no === parcel.no ? { ...p, state: 'CANCELLED', closedBy: s(actor), closedAt: s(at), cancelReason: s(reason) } : p
      ),
    },
    voidLabel: parcel.code,
  };
}

/** يسجّل طباعة ملصق طرد — العدّاد على الطرد، والسجلّ في `barcodes`. */
export function markParcelPrinted(session, no) {
  const parcel = parcelOf(session, no);
  if (!parcel) return { problem: `لا طردَ برقم ${no}.` };
  return {
    session: {
      ...session,
      parcels: session.parcels.map((p) => (p.no === parcel.no ? { ...p, labelCopies: (p.labelCopies ?? 0) + 1 } : p)),
    },
  };
}

/**
 * سببُ منع إتمام التعبئة — أو `''`.
 *
 * لا يُتمّ على **بندٍ متبقٍّ** ولا على **طردٍ مفتوح**: الأوّل بضاعةٌ بقيت على
 * الرفّ ويظنّها العميل قادمة، والثاني ملصقٌ لم يُلصق.
 */
export function packingCloseProblem(session, { override = false, overrideNote = '' } = {}) {
  if (session?.state !== 'PACKING') return `الجلسة «${orderStateLabel(session?.state)}» — لا تُتمّ إلّا وهي قيد التعبئة.`;
  if (!session?.parcelTotal) return 'حدّد عدد الطرود قبل الإتمام.';

  const open = (session.parcels ?? []).filter((p) => p.state === 'OPEN' || p.state === 'REOPENED');
  const left = remainingLines(session).filter((r) => r.remaining > 0);

  if (!open.length && !left.length) return '';
  if (override) {
    return s(overrideNote) ? '' : 'التجاوز يحتاج سببًا مكتوبًا — يبقى في السجلّ.';
  }
  const parts = [];
  if (open.length) parts.push(`${open.length} طردًا مفتوحًا (${open.map((p) => p.no).join(' · ')})`);
  if (left.length) parts.push(`${left.length} بندًا لم يُعبَّأ كاملًا (${left.map((r) => r.sku).join(' · ')})`);
  return `لا يُتمّ: ${parts.join(' · ')}.`;
}

/** يتمّ التعبئة فينتقل الطلب إلى «جاهز للتحميل». */
export function closePacking(session, { actor, at, override = false, overrideNote = '' } = {}) {
  const problem = packingCloseProblem(session, { override, overrideNote });
  if (problem) return { problem };
  if (!s(actor)) return { problem: 'الإتمام بلا فاعلٍ لا يُسجَّل.' };
  if (!s(at)) return { problem: 'الإتمام بلا وقتٍ لا يُرتَّب.' };

  return {
    session: {
      ...session,
      state: 'READY',
      closedBy: s(actor),
      closedAt: s(at),
      overrideNote: override ? s(overrideNote) : '',
    },
  };
}

/** عدّادات الجلسة — للشاشة وللوحة. */
export function packingCounters(session) {
  const parcels = session?.parcels ?? [];
  const rows = remainingLines(session);
  return {
    total: session?.parcelTotal ?? 0,
    closed: parcels.filter((p) => p.state === 'CLOSED').length,
    open: parcels.filter((p) => p.state === 'OPEN').length,
    reopened: parcels.filter((p) => p.state === 'REOPENED').length,
    cancelled: parcels.filter((p) => p.state === 'CANCELLED').length,
    linesLeft: rows.filter((r) => r.remaining > 0).length,
    qtyLeft: rows.reduce((t, r) => t + r.remaining, 0),
    printed: parcels.filter((p) => (p.labelCopies ?? 0) > 0).length,
  };
}

/**
 * ★ لوحةُ مناطق التجهيز — جوابُ الأسئلة الخمسة التي سألها النصّ:
 * أيُّ طلباتٍ في كلّ منطقة · من يحضّرها · متى بدأ ومتى انتهى · ما عُبّئ وما بقي
 * · وحالةُ الطلب.
 */
export function stagingBoard(sessions) {
  const zones = new Map();
  for (const session of sessions ?? []) {
    const bin = normalizeLocationCode(session?.stagingBin) || 'بلا منطقة';
    if (!zones.has(bin)) zones.set(bin, { bin, orders: [], count: 0 });
    const counters = packingCounters(session);
    zones.get(bin).orders.push({
      orderRef: s(session?.orderRef),
      customerName: s(session?.customerName),
      route: up(session?.route),
      state: s(session?.state),
      stateLabel: orderStateLabel(session?.state),
      owner: s(session?.openedByName) || s(session?.openedBy),
      startedAt: s(session?.openedAt),
      finishedAt: s(session?.closedAt),
      parcels: counters.total,
      closedParcels: counters.closed,
      qtyLeft: counters.qtyLeft,
      shipment: normalizeScan(session?.shipment),
    });
    zones.get(bin).count += 1;
  }
  return [...zones.values()].sort((a, b) => a.bin.localeCompare(b.bin));
}

/** ملخّصُ طردٍ للعرض — بما فيه «١ من ٤». */
export function parcelCard(session, no) {
  const parcel = parcelOf(session, no);
  if (!parcel) return null;
  return {
    ...parcel,
    stateLabel: PARCEL_STATES[parcel.state] ?? '',
    ofTotal: parcelOfTotal(parcel.no, session?.parcelTotal),
    qty: (parcel.lines ?? []).reduce((t, l) => t + qty(l.qty), 0),
    reopened: (parcel.reopens ?? []).length > 0,
    lastReopen: (parcel.reopens ?? []).at(-1) ?? null,
  };
}
