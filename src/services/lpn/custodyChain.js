/**
 * سلسلة العهدة ‹LPN-718› — من الباب إلى الباب في تتبّعٍ واحد. منطق خالص.
 *
 * ═══ الفجوة (ف-٢١) ═══
 * الحلقاتُ الأربع بُنيت كلٌّ في مكانها: التحميلُ عند الباب ‹LPN-715›،
 * والمركبةُ ‹LPN-707›، والخروجُ من البوّابة ‹LPN-716›، والاستلامُ عند الباب
 * ‹LPN-717›. وأربعُ حلقاتٍ لا تُقرأ من طرفٍ واحد **ليست سلسلة**: تبقى أربع
 * شاشاتٍ يفتحها من يعرف أنّها موجودة.
 *
 * والنصّ ختم بها صراحةً: «وبذلك يحتفظ النظام بسلسلةٍ واضحة:
 * **باب التحميل ← السيارة ← بوّابة الخروج ← باب الاستلام**».
 *
 * ═══ ★★ والحلقة الناقصة تُعلن ولا تُخفى ═══
 * أنفعُ ما في هذه السلسلة ليس الحلقاتِ الموجودة بل **الغائبة**: شحنةٌ حُمِّلت
 * ولم تخرج، أو خرجت ولم تصل. وسلسلةٌ تعرض ما تعرفه وتسكت عمّا لا تعرفه تكذب
 * بالصمت — فالغائبةُ تُسمّى بابًا مفتوحًا يُلاحَق.
 *
 * ═══ ولا سيّدَ جديدًا ═══
 * هذا الملفّ **قارئٌ**: يجمع جلساتٍ قائمةً ويرتّبها. لا يخزّن حلقةً ولا
 * يكتب حدثًا — فلو خزّن لَافترق المخزون عن الجلسات أوّل تعديل.
 */

import { BARCODE_KINDS, classifyScan, kindLabel, normalizeScan } from '../barcodes/barcodeCode.js';
import { proofSummary } from './movementProof.js';

/** الحلقات الأربع — بالترتيب الذي كتبه النصّ، ولكلٍّ مصدرُها. */
export const CHAIN_LINKS = Object.freeze([
  { id: 'DOCK_OUT', labelAr: 'باب التحميل', kind: BARCODE_KINDS.DOCK_OUT.id, source: 'dockLoading' },
  { id: 'VEHICLE', labelAr: 'السيارة', kind: BARCODE_KINDS.VEHICLE.id, source: 'dockLoading' },
  { id: 'GATE_OUT', labelAr: 'بوّابة الخروج', kind: BARCODE_KINDS.GATE_OUT.id, source: 'exitGate' },
  { id: 'DOCK_IN', labelAr: 'باب الاستلام', kind: BARCODE_KINDS.DOCK_IN.id, source: 'inboundDock' },
]);

const s = (v) => String(v ?? '').trim();

/** يقرأ وقتًا نصّيًّا إلى مللي — والفاسدُ يعود `null` ولا يُخترع له وقت. */
function ms(at) {
  const t = Date.parse(s(at));
  return Number.isFinite(t) ? t : null;
}

/** كلُّ ما مُسح في جلسةِ بابٍ أو بوّابة — بيّناتُ البوّابة والحمولة معًا. */
function allCodes(session) {
  const proofs = [...(session?.proofs ?? []), ...(session?.itemProofs ?? [])];
  return new Set([
    ...proofs.map((p) => normalizeScan(p?.code)).filter(Boolean),
    ...(session?.loading?.loaded ?? []).map(normalizeScan),
    ...(session?.loading?.expected ?? []).map(normalizeScan),
    ...(session?.received ?? []).map(normalizeScan),
    ...(session?.expected ?? []).map(normalizeScan),
    normalizeScan(session?.door),
    normalizeScan(session?.gate),
    normalizeScan(session?.vehicle),
    normalizeScan(session?.tripRef),
  ].filter(Boolean));
}

/** هل هذه الجلسة تخصّ هذا الكود؟ */
export function sessionTouches(session, code) {
  const value = classifyScan(code).code;
  return Boolean(value) && allCodes(session).has(value);
}

/**
 * ★★ يبني السلسلة من الجلسات الثلاث — والغائبُ يبقى حلقةً فارغةً مُسمّاة.
 *
 * @param {{dock?:object, exit?:object, inbound?:object}} sessions
 * @returns {{links:object[], complete:boolean, gaps:string[], spanMs:number|null}}
 */
export function buildCustodyChain({ dock = null, exit = null, inbound = null } = {}) {
  const dockProof = proofSummary([...(dock?.proofs ?? []), ...(dock?.itemProofs ?? [])]);
  const exitProof = proofSummary(exit?.proofs ?? []);
  const inProof = proofSummary([...(inbound?.proofs ?? []), ...(inbound?.itemProofs ?? [])]);

  /**
   * ★ وقتُ الحلقة **من بيّنتها** أوّلًا لا من أختام الجلسة.
   *
   * ولماذا؟ لأنّ الجلسة تُفتح مرّةً وتُغلق مرّة، وبين الطرفين تقع المسحات:
   * البابُ يُمسح أوّلًا ثمّ المركبة. فلو أُخذ لكلٍّ ختمُ الجلسة لَبدت السلسلة
   * **راجعةً إلى الخلف** — وهو كذبٌ في تقرير الأداء يقيس عليه المدير.
   */
  const proofAt = (session, kind) =>
    s([...(session?.proofs ?? []), ...(session?.itemProofs ?? [])].find((x) => x?.kind === kind)?.at);

  const raw = {
    DOCK_OUT: {
      code: s(dock?.door),
      at: proofAt(dock, BARCODE_KINDS.DOCK_OUT.id) || s(dock?.openedAt) || s(dock?.closedAt),
      actor: s(dock?.openedByName) || s(dock?.openedBy),
      trust: dockProof.trust,
    },
    VEHICLE: {
      code: s(dock?.vehicle) || s(exit?.vehicle) || s(inbound?.vehicle),
      at:
        proofAt(dock, BARCODE_KINDS.VEHICLE.id) ||
        proofAt(exit, BARCODE_KINDS.VEHICLE.id) ||
        s(dock?.openedAt) ||
        s(exit?.openedAt),
      actor: s(dock?.openedByName) || s(dock?.openedBy),
      trust: dockProof.trust,
    },
    GATE_OUT: {
      code: s(exit?.gate),
      at: s(exit?.exitedAt) || proofAt(exit, BARCODE_KINDS.GATE_OUT.id) || s(exit?.openedAt),
      actor: s(exit?.exitedBy) || s(exit?.openedByName) || s(exit?.openedBy),
      trust: exitProof.trust,
    },
    DOCK_IN: {
      code: s(inbound?.door),
      at: proofAt(inbound, BARCODE_KINDS.DOCK_IN.id) || s(inbound?.openedAt) || s(inbound?.closedAt),
      actor: s(inbound?.openedByName) || s(inbound?.openedBy),
      trust: inProof.trust,
    },
  };

  const links = CHAIN_LINKS.map((link) => {
    const row = raw[link.id] ?? {};
    return {
      ...link,
      code: row.code || '',
      at: row.at || '',
      atMs: ms(row.at),
      actor: row.actor || '',
      trust: row.code ? row.trust : 0,
      present: Boolean(row.code),
    };
  });

  const gaps = links.filter((l) => !l.present).map((l) => l.labelAr);
  const stamps = links.map((l) => l.atMs).filter((t) => t !== null);
  return {
    links,
    complete: gaps.length === 0,
    gaps,
    spanMs: stamps.length >= 2 ? Math.max(...stamps) - Math.min(...stamps) : null,
  };
}

/**
 * ★ يقرأ السلسلة **من أيّ طرف**: طردٌ أو طبليةٌ أو مركبةٌ أو رحلةٌ أو باب.
 *
 * وهذا هو المطلوب فعلًا: العامل يمسك بيده طردًا ويسأل «أين مرّ هذا؟» — لا
 * يعرف رقم الجلسة ولا يجب أن يعرفه.
 */
export function chainFor(code, { docks = [], exits = [], inbounds = [] } = {}) {
  const scan = classifyScan(code);
  if (!scan.code) return { query: '', kind: '', ...buildCustodyChain({}) };

  const dock = (docks ?? []).find((x) => sessionTouches(x, scan.code)) ?? null;
  const exit =
    (exits ?? []).find((x) => sessionTouches(x, scan.code)) ??
    (dock ? (exits ?? []).find((x) => sessionTouches(x, dock.vehicle) || sessionTouches(x, dock.tripRef)) : null) ??
    null;
  const inbound =
    (inbounds ?? []).find((x) => sessionTouches(x, scan.code)) ??
    (dock ? (inbounds ?? []).find((x) => sessionTouches(x, dock.vehicle) || sessionTouches(x, dock.tripRef)) : null) ??
    null;

  return {
    query: scan.code,
    kind: scan.kind,
    kindLabel: kindLabel(scan.kind),
    ...buildCustodyChain({ dock, exit, inbound }),
  };
}

/**
 * الحلقةُ المفتوحة — أوّلُ غائبةٍ بعد آخرِ حاضرة. وهي **البابُ الذي يُلاحَق**:
 * «حُمِّلت ولم تخرج» أو «خرجت ولم تصل».
 */
export function openLink(chain) {
  const links = chain?.links ?? [];
  const lastPresent = links.reduce((idx, l, i) => (l.present ? i : idx), -1);
  if (lastPresent < 0) return null;
  const next = links[lastPresent + 1];
  if (!next) return null;
  return {
    ...next,
    after: links[lastPresent].labelAr,
    message: `${links[lastPresent].labelAr} تمّ ولم يتمّ «${next.labelAr}» — بابٌ مفتوحٌ يُلاحَق.`,
  };
}

/**
 * أزمنةُ الانتقال بين الحلقات — كم بقيت الشاحنة بين البابِ والبوّابة، وكم
 * استغرق الطريق. تُقرأ في تقرير الأداء ‹LPN-505›.
 */
export function chainDurations(chain) {
  const links = (chain?.links ?? []).filter((l) => l.present && l.atMs !== null);
  const out = [];
  for (let i = 1; i < links.length; i += 1) {
    const delta = links[i].atMs - links[i - 1].atMs;
    out.push({
      from: links[i - 1].labelAr,
      to: links[i].labelAr,
      ms: delta,
      minutes: Math.round(delta / 60000),
      backwards: delta < 0,
    });
  }
  return out;
}

/**
 * سطرٌ واحدٌ يصف السلسلة — للسجلّ وللبحث الموحّد.
 * الحاضرةُ بكودها، والغائبةُ بعلامةِ نقصٍ صريحة.
 */
export function chainLine(chain) {
  return (chain?.links ?? []).map((l) => (l.present ? `${l.labelAr}: ${l.code}` : `${l.labelAr}: ✕`)).join(' ← ');
}

/** خلاصةُ السلسلة للوحة: أين وصلت وما ينقصها ومقدارُ الثقة. */
export function chainSummary(chain) {
  const links = chain?.links ?? [];
  const present = links.filter((l) => l.present);
  const trusts = present.map((l) => l.trust);
  return {
    done: present.length,
    total: links.length,
    complete: Boolean(chain?.complete),
    gaps: chain?.gaps ?? [],
    open: openLink(chain),
    lastLink: present.at(-1)?.labelAr ?? '',
    lastAt: present.at(-1)?.at ?? '',
    trust: trusts.length ? Math.round(trusts.reduce((a, b) => a + b, 0) / trusts.length) : 0,
    spanMinutes: chain?.spanMs === null || chain?.spanMs === undefined ? null : Math.round(chain.spanMs / 60000),
  };
}
