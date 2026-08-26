/**
 * بطاقة الطبلية — تجميع العرض والتتبّع من الكيان والأحداث والنسب. منطق خالص.
 *
 * المشكلة التي يحلّها: خطة ٧ تَعِد أنّ «قراءة باركود الطبلية تُظهر بطاقةً
 * كاملة» بثلاثة عشر حقلًا — والحقول مبعثرة بطبيعتها: الهويّة والحالة على
 * الكيان، والرحلة في الأحداث، والأصل في النسب. البطاقة تجمعها **قراءةً
 * محضة**: لا حقل يُحسب هنا وله مصدرٌ هناك، فلا يفترق رقمان عن حقيقةٍ واحدة.
 *
 * ═══ القاعدة الحاكمة ═══
 * **البطاقة تُشتقّ ولا تُخزَّن** (عرف `shortLabelOf`): تخزينها حقلًا يعني
 * بطاقةً تكذب من أوّل تعديلٍ لم يُحدّثها. والغائب يُتسامح معه — طبليةٌ بلا
 * أحداثٍ بعدُ أو بلا نسبٍ تعرض بطاقةً صحيحة لا انهيارًا.
 *
 * (نمط `descendantsOf` في محرّك المستندات: دالّة قراءةٍ تجمع القائم ولا
 * تبني محرّكًا جديدًا.)
 */

import { isValidLpnCode, normalizeLpnCode, shortLpnLabel } from './lpnCode.js';
import { stateLabel, activeFlags, LPN_FLAGS } from './lpnLifecycle.js';
import { isMixed, isEmpty, totalBaseQty, distinctItems } from './lpnContents.js';
import { orderEvents } from './lpnEvents.js';
import { lineageTrace } from './lpnLineage.js';

/**
 * سلامة الطبلية للعرض — تُشتقّ من الأوسمة بترتيب الأخطر أوّلًا:
 * التالفة قبل المرفوضة قبل الموقوفة… والخالية من الأوسمة «سليمة».
 */
const INTEGRITY_ORDER = ['DAMAGED', 'REJECTED', 'EXPIRED', 'MISSING', 'UNDER_INVESTIGATION', 'ON_HOLD', 'GOVERNANCE_HOLD', 'INSPECTION', 'UNDER_COUNT'];

export function integrityOf(unit) {
  const flags = activeFlags(unit);
  for (const f of INTEGRITY_ORDER) if (flags.includes(f)) return LPN_FLAGS[f];
  return 'سليمة';
}

/** أمغلقةٌ الطبلية؟ تُشتقّ من الحالة — ما بعد «قيد القراءة» مغلقٌ للقراءات. */
export function isClosedOf(unit) {
  return !['DRAFT', 'SCANNING', 'PICKING'].includes(unit?.state);
}

/**
 * بطاقة الطبلية الكاملة — حقول خطة ٧ الثلاثة عشر، كلٌّ من مصدره الواحد.
 *
 * @param {object} unit الكيان {code, state, flags, warehouse, bin, lines, parentCodes, sourceDoc, orderRef, createdBy, createdAt}
 * @param {Array} events سجلّ أحداثها (اختياري — الغائب رحلةٌ فارغة لا انهيار)
 * @param {Array} allUnits سجلّ الطبالي للنسب (اختياري)
 * @returns {object|null} البطاقة، أو null لهويّةٍ فاسدة.
 */
export function buildCard(unit, { events = [], allUnits = [] } = {}) {
  const code = normalizeLpnCode(unit?.code);
  // هويّةٌ لا تجتاز النحو لا بطاقة لها — بطاقةٌ عرجاء لهويّةٍ فاسدة تُطبَع
  // على ملصقٍ وتتوالد منها قراءاتٌ لا تُطابِق شيئًا.
  if (!isValidLpnCode(code)) return null;

  const ordered = orderEvents((events ?? []).filter((e) => normalizeLpnCode(e?.lpn) === code));
  const lineage = lineageTrace(allUnits ?? [], code);
  const lines = unit?.lines ?? [];

  return {
    code,
    shortLabel: shortLpnLabel(code),
    sourceDoc: unit?.sourceDoc ?? null,
    orderRef: unit?.orderRef ?? null,
    lines,
    lots: lotsOf(lines),
    warehouse: unit?.warehouse ?? '',
    bin: unit?.bin ?? '',
    state: unit?.state ?? '',
    stateLabel: stateLabel(unit?.state),
    flags: activeFlags(unit),
    integrity: integrityOf(unit),
    isClosed: isClosedOf(unit),
    isMixed: isMixed(lines),
    isEmpty: isEmpty(lines),
    totalBaseQty: totalBaseQty(lines),
    itemCount: distinctItems(lines).length,
    createdBy: unit?.createdBy ?? '',
    createdAt: unit?.createdAt ?? '',
    journey: ordered,
    moves: ordered.filter((e) => e.type === 'MOVED'),
    parents: lineage.ancestors,
    children: lineage.descendants,
  };
}

/** التشغيلات وصلاحياتها — صفٌّ لكلّ (دفعة×صلاحية) بمجموع كمّيّاتها. */
export function lotsOf(lines) {
  const map = new Map();
  for (const l of lines ?? []) {
    const batch = String(l?.batch ?? '').trim().toUpperCase();
    const expiry = String(l?.expiry ?? '').trim();
    if (!batch && !expiry) continue;
    const key = `${batch}__${expiry}`;
    const entry = map.get(key) ?? { batch, expiry, qty: 0 };
    entry.qty += Number(l?.qty) || 0;
    map.set(key, entry);
  }
  return [...map.values()];
}

/**
 * سطر التتبّع المستندي — «PO-2026-0015 → GRN-2026-0032 → LPN-000145 → …»
 * (مثال خطة ٧ حرفيًّا): ما قبل الطبلية من روابط مستند مصدرها، والطبلية
 * عقدةً، وما بعدها من أحداث الاستهلاك الحاملة مستندات.
 */
export function traceLine(card) {
  if (!card) return '';
  const before = [];
  const links = card.sourceDoc?.links ?? {};
  for (const l of Object.values(links)) if (l?.number) before.push(l.number);
  if (card.sourceDoc?.number) before.push(card.sourceDoc.number);

  const after = [];
  for (const e of card.journey ?? []) {
    const num = e?.doc?.number;
    if (num && num !== card.sourceDoc?.number && !after.includes(num) && !before.includes(num)) after.push(num);
  }
  return [...before, card.code, ...after].join(' → ');
}
