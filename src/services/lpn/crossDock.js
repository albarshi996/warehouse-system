/**
 * التجهيزُ المباشر Cross-Docking — مستلَمٌ عليه طلبٌ مفتوحٌ **لا يُخزَّن
 * ليُسحب غدًا**. منطقٌ خالصٌ بلا Firebase وبلا ساعة.
 *
 * ‹WMS-401› · الفجوة و-٥: كلُّ مستلَمٍ في البوّابة يسلك مسارًا واحدًا — يُخزَّن
 * ثمّ يُسحب. ولو كان عليه أمرُ بيعٍ مفتوحٌ ينتظر **على الرصيف نفسِه**، فالعاملُ
 * يحمله إلى الرفّ، ثمّ يأتي غدًا محضّرٌ فيحمله من الرفّ إلى نفس الرصيف.
 *
 * ★★★ **والتكلفةُ مضاعفةٌ في ثلاثة أبعاد**: مشيٌ مرّتين · مناولةٌ مرّتين
 * (وكلُّ مناولةٍ احتمالُ تلف) · **وزمنٌ** — فأمرٌ كان يُشحَن اليوم يُشحَن غدًا
 * لأنّ البضاعةَ «دخلت المخزن». وهذا الأخيرُ لا يُقاس في أيّ تقرير، ويُلقى
 * اللومُ على التوريد.
 *
 * ═══ خمسُ قواعدَ تحكم هذا الملفّ ═══
 *
 * ① **لا اقتراحَ بلا طلبٍ مفتوح.** ولا يُقترح أكثرُ من المطلوب: فائضُ
 *    الاستلام يُخزَّن، والعبورُ بقدر الحاجة لا بقدر الوصول.
 *
 * ② **الصلاحيّةُ شرطٌ لا تحذير.** مستلَمٌ ينتهي **قبل موعد الشحن** لا يُقترح
 *    للعبور — فسحبُه إلى الرصيف يعني رفضَه عند التحميل، أو أسوأ: تسليمَه.
 *    ★★ وفرقٌ دقيقٌ قُصد: الصلاحيّةُ تُقاس بموعد **الشحن** لا بـ«الآن».
 *    فبضاعةٌ صالحةٌ اليوم ومنتهيةٌ بعد أسبوعٍ تمرّ على حارسٍ يقرأ «الآن»
 *    وتُرفض على الرصيف بعد أسبوع.
 *
 * ③ **الاقتراحُ لا يُنفّذ.** قرارُ المالك في التسكين (2026-08-16) يسري حرفًا:
 *    المحرّكُ يُرتّب ويُعلّل، **والقرارُ للإنسان**. فالعاملُ يرى الرصيفَ
 *    والشاحنةَ والعربة، والنظامُ لا يراها.
 *
 * ④ **المرفوضُ يُعرض بسببه لا يُخفى** — وهي قاعدةُ `putawaySuggest` نفسُها:
 *    عاملٌ يعلم أنّ على الصنف أمرًا ولا يراه في القائمة يظنّ النظامَ معطَّلًا.
 *
 * ⑤ **المسارُ المختار يُقيَّد.** عبورٌ أو تخزينٌ، ومن قرّر ولماذا — فقرارٌ
 *    بلا أثرٍ لا يُراجَع، ولا يُعرف بعد شهرٍ لماذا مرّت طبليّةٌ ولم تُخزَّن.
 */

import { normalizeItemCode } from '../items/itemIdentity.js';
import { barcodeLookupVariants } from '../excel/excelSchema.js';
import { expiryStatus } from '../balances/balanceKey.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').trim();
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * أنواعُ المستندات التي تُمثّل **طلبًا صادرًا** يصلح للعبور — مُعلَنةٌ قابلةٌ
 * للتبديل من المستدعي، لا مدفونةٌ في شرط.
 *
 * ★ و`trn` (النقل بين المخازن) داخلةٌ عمدًا: طبليّةٌ وصلت طرابلس وهي مطلوبةٌ
 * في الرحبة **أحقُّ بالعبور من غيرها** — فتخزينُها ثمّ سحبُها ثمّ تحميلُها
 * ثلاثُ مناولاتٍ لا واحدة.
 *
 * ⚠️ و`mis` (صرفُ موادّ للإنتاج) داخلةٌ أيضًا، لكنّها تختلف في أنّ وجهتَها
 * المطبخُ لا الرصيف — والفرقُ لا يمسّ الحساب، يمسّ وجهةَ العامل. فتُقال
 * الوجهةُ في المقترَح (`destinationHint`) ولا يُفترض الرصيف.
 */
export const DEMAND_TYPES = Object.freeze(['so', 'pick', 'dlv', 'trn', 'mis', 'vld']);

/** وجهةُ العبور بحسب نوع الطلب — فلا يُرسَل عاملٌ إلى الرصيف وطلبُه للمطبخ. */
const DESTINATION_HINT = Object.freeze({
  so: 'منطقة التجهيز أو الرصيف',
  pick: 'منطقة التجهيز',
  dlv: 'رصيف التحميل',
  trn: 'رصيف النقل بين المخازن',
  mis: 'المطبخ أو خطّ الإنتاج',
  vld: 'عربة المندوب',
});

/** حالاتُ قرار المسار. */
export const ROUTES = Object.freeze({
  crossDock: { id: 'cross-dock', labelAr: 'تجهيزٌ مباشر (عبور)' },
  putaway: { id: 'putaway', labelAr: 'تخزين' },
});

/** مفاتيحُ مطابقةِ الصنف — الكودُ أوّلًا ثمّ الباركودُ بصيغتيه (قاعدةُ الهويّة). */
function itemKeys(line) {
  return [normalizeItemCode(line?.sku), ...barcodeLookupVariants(line?.barcode)].filter(Boolean).map(up);
}

/** أيتطابق سطرُ الطلب مع المستلَم؟ */
function sameItem(a, b) {
  const ka = new Set(itemKeys(a));
  return itemKeys(b).some((k) => ka.has(k));
}

/**
 * موعدُ الشحن المطلوب لمستندٍ — ومنه وحده تُقاس الصلاحيّة (القاعدة ②).
 * و`null` تعني «بلا موعدٍ معلَن» فلا يُحكَم بتاريخٍ لم يُكتب.
 */
export function shipByOf(document) {
  const raw =
    document?.header?.mustShipBy ??
    document?.header?.shipDate ??
    document?.header?.dueDate ??
    document?.header?.deliveryDate ??
    null;
  if (!raw) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (Number.isFinite(Number(raw?.seconds))) return Number(raw.seconds) * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * أتصلُح هذه الدفعةُ لطلبٍ يُشحَن في هذا الموعد؟
 *
 * @returns {{ok:boolean, reason:string}}
 */
export function expiryVerdict(received, { shipByMs, nowMs } = {}) {
  const expiry = txt(received?.expiry);
  if (!expiry) return { ok: true, reason: '' }; // لا صلاحيّةَ معلَنةٌ ⟹ لا حكم

  // ★★ الحكمُ بموعد الشحن أوّلًا — وهو القصد. و«الآن» بديلٌ أدنى لمن لم يُعلن
  // موعدًا: فبضاعةٌ منتهيةٌ **اليوم** لا تُقترح للعبور بحالٍ.
  const horizon = Number.isFinite(shipByMs) ? shipByMs : nowMs;
  if (!Number.isFinite(horizon)) return { ok: true, reason: '' };

  const status = expiryStatus(expiry, horizon);
  if (status === 'expired') {
    return {
      ok: false,
      reason: Number.isFinite(shipByMs)
        ? `تنتهي صلاحيّتُها (${expiry}) قبل موعد الشحن — تُخزَّن ولا تعبُر، وتُراجَع للإتلاف أو التصفية.`
        : `صلاحيّتُها منتهيةٌ (${expiry}) — لا تعبُر.`,
    };
  }
  return { ok: true, reason: '' };
}

/**
 * الكمّيّةُ المفتوحةُ لصنفٍ في صفٍّ من صندوق العمل المفتوح.
 * تُجمَع من **أسطر** الصفّ لا من إجماليّه: مستندٌ فيه عشرةُ بنودٍ لا يُقترح
 * عبورُ طبليّةٍ لصنفٍ واحدٍ بكمّيّة بنوده كلِّها.
 */
function openQtyFor(row, received) {
  let qty = 0;
  const lines = [];
  for (const line of row?.lines || []) {
    if (!sameItem(line, received)) continue;
    const open = num(line?.open);
    if (open <= 0) continue;
    qty += open;
    lines.push({ lineId: line.lineId, lineNumber: line.lineNumber, uom: line.uom || '', open: round(open) });
  }
  return { qty: round(qty), lines };
}

/**
 * مرشَّحو العبور لبندٍ مستلَمٍ واحد.
 *
 * @param {object} received بندُ الاستلام `{sku, barcode, qty, uom, batch, expiry, warehouse}`
 * @param {object} ctx
 * @param {Array}  ctx.openRows صفوفُ `buildOpenBox` (مستنداتٌ فيها عملٌ مفتوح)
 * @param {number} [ctx.nowMs]
 * @param {string[]} [ctx.demandTypes]
 * @param {string} [ctx.warehouse] حصرٌ بمستودع الاستلام
 * @returns {{candidates:Array, rejected:Array, coverable:number, remainder:number, problem:string}}
 */
export function crossDockCandidates(received, { openRows = [], nowMs, demandTypes = DEMAND_TYPES, warehouse } = {}) {
  const have = round(num(received?.qty));
  const keys = itemKeys(received);
  const wanted = new Set(demandTypes.map((t) => String(t).trim().toLowerCase()));
  const wh = up(warehouse || received?.warehouse);

  if (!keys.length) {
    return { candidates: [], rejected: [], coverable: 0, remainder: have, problem: 'البندُ بلا كودٍ ولا باركود — لا مطابقة.' };
  }
  if (have <= 0) {
    return { candidates: [], rejected: [], coverable: 0, remainder: 0, problem: 'كمّيّةُ البند صفر — لا شيء يعبُر.' };
  }

  const candidates = [];
  const rejected = [];

  for (const row of openRows || []) {
    const doc = row?.document;
    const type = String(doc?.type ?? '').trim().toLowerCase();
    if (!doc?.id || !wanted.has(type)) continue;

    const docWh = up(doc?.header?.warehouse);
    const { qty: openQty, lines } = openQtyFor(row, received);
    if (openQty <= 0) continue; // لا يُعدّ مرفوضًا: الصنفُ ليس في هذا الطلب أصلًا

    const label = {
      docId: doc.id,
      docType: type,
      docNumber: doc.number || doc.id,
      party: txt(doc?.header?.partyName || doc?.header?.customerName || doc?.header?.toWarehouse),
      warehouse: docWh,
      needed: openQty,
      lines,
    };

    // ④ المرفوضُ يُعرض بسببه.
    if (wh && docWh && docWh !== wh) {
      rejected.push({ ...label, reason: `الطلبُ على مستودع «${docWh}» والاستلامُ في «${wh}».` });
      continue;
    }
    const shipByMs = shipByOf(doc);
    const expiryOk = expiryVerdict(received, { shipByMs, nowMs });
    if (!expiryOk.ok) {
      rejected.push({ ...label, reason: expiryOk.reason, shipByMs });
      continue;
    }

    candidates.push({
      ...label,
      shipByMs,
      // ① لا يُقترح أكثرُ من المطلوب — ولا أكثرُ من الموجود.
      suggestQty: round(Math.min(openQty, have)),
      destinationHint: DESTINATION_HINT[type] || 'منطقة التجهيز',
      reason: reasonFor(type, openQty, shipByMs, nowMs),
    });
  }

  // الأعجلُ أوّلًا: موعدُ شحنٍ أقربُ يسبق، ثمّ الأكبرُ حاجةً، ثمّ الرقمُ
  // أبجديًّا كي يكون الترتيبُ حتميًّا فلا يتبدّل بين فتحةٍ وأخرى.
  candidates.sort(
    (a, b) =>
      horizonRank(a.shipByMs) - horizonRank(b.shipByMs) ||
      (a.shipByMs ?? 0) - (b.shipByMs ?? 0) ||
      b.needed - a.needed ||
      (a.docNumber < b.docNumber ? -1 : 1)
  );

  // التغطيةُ المتتالية: أوّلُ طلبٍ يأخذ ما يحتاج، والذي بعده ما بقي.
  let left = have;
  for (const c of candidates) {
    c.suggestQty = round(Math.min(c.needed, left));
    left = round(Math.max(0, left - c.suggestQty));
  }
  const usable = candidates.filter((c) => c.suggestQty > 0);
  const coverable = round(have - left);

  return {
    candidates: usable,
    rejected,
    coverable,
    remainder: round(left),
    problem: usable.length
      ? ''
      : rejected.length
        ? 'لا طلبَ مفتوحًا يصلح للعبور — راجع الأسباب أدناه، والبندُ يُخزَّن.'
        : 'لا طلبَ مفتوحًا على هذا الصنف — يُخزَّن.',
  };
}

/** مَن بلا موعدٍ يُؤخَّر عن ذي الموعد — ولا يُقدَّم بصفرٍ مفترَض. */
function horizonRank(ms) {
  return Number.isFinite(ms) ? 0 : 1;
}

function reasonFor(type, openQty, shipByMs, nowMs) {
  const what = DESTINATION_HINT[type] || 'التجهيز';
  const when =
    Number.isFinite(shipByMs) && Number.isFinite(nowMs)
      ? shipByMs - nowMs <= 86400000
        ? ' — وموعدُ شحنه خلال يوم'
        : ''
      : '';
  return `طلبٌ مفتوحٌ بـ${openQty} ينتظر في ${what}${when} — عبورٌ يوفّر مناولتين ومشيَين.`;
}

/**
 * خطّةُ عبورٍ لاستلامٍ كامل — بندًا بندًا.
 *
 * @returns {{lines:Array, totals:{lines:number, crossDockable:number, qtyCovered:number}, problem:string}}
 */
export function crossDockPlan(receivedLines, ctx = {}) {
  // ★★★ تحفّظٌ مُعلَنٌ لا مكتوم: `measureDocument` تحتاج **صلاتَ المستند**
  // لتخصم ما نُفِّذ من المطلوب. وقراءةُ الصلات تقع مستندًا مستندًا
  // (`fetchDocumentRelations`) فلا تُحمَّل على شاشة استلامٍ تقرأ مئةَ أمر.
  //
  // فحين لا تُمرَّر (`relationsKnown:false`) يكون «المفتوح» **حدًّا أعلى**:
  // أمرٌ نُفِّذ نصفُه يبدو مفتوحًا كلَّه. والأثرُ أنّ العبورَ يُقترح أكثرَ من
  // الحاجة — فيُقال صريحًا، لأنّ الاقتراحَ قرارُ إنسانٍ يراجع رقمَ الأمر،
  // **ورقمٌ صامتٌ أخطرُ من رقمٍ موصوفٍ بنقصه**.
  const caveat =
    ctx.relationsKnown === false
      ? 'المفتوحُ محسوبٌ على المطلوب بلا خصم ما نُفِّذ من الأمر — راجع رقمَ الأمر قبل التسليم.'
      : '';
  const lines = (receivedLines || []).map((received, index) => ({
    index,
    sku: txt(received?.sku),
    barcode: txt(received?.barcode),
    qty: round(num(received?.qty)),
    batch: txt(received?.batch),
    expiry: txt(received?.expiry),
    ...crossDockCandidates(received, ctx),
  }));

  const crossDockable = lines.filter((l) => l.candidates.length).length;
  const qtyCovered = round(lines.reduce((s, l) => s + l.coverable, 0));
  return {
    lines,
    totals: { lines: lines.length, crossDockable, qtyCovered },
    caveat,
    problem: !lines.length
      ? 'لا بنودَ في الاستلام.'
      : crossDockable
        ? ''
        : 'لا بندَ يصلح للعبور في هذا الاستلام — كلُّه يُخزَّن.',
  };
}

/**
 * قيدُ قرار المسار — ما يُكتب في `audit` (القاعدة ⑤).
 *
 * ★★ والسببُ **إلزاميٌّ على العبور وحده** لا على التخزين: التخزينُ هو
 * الافتراضيُّ الذي يسلكه كلُّ شيءٍ اليوم، فإلزامُ سببٍ له يعني سؤالَ العامل
 * «لماذا عملتَ عملَك المعتاد؟» في كلّ بندٍ — فيُكتب «عاديّ» ألفَ مرّةٍ ويموت
 * الحقل. والعبورُ **خروجٌ عن المعتاد** فيستحقّ سببًا.
 */
export function routeDecision({ route, received, demand, note, profile, at } = {}) {
  const id = route === ROUTES.crossDock.id ? ROUTES.crossDock.id : route === ROUTES.putaway.id ? ROUTES.putaway.id : '';
  if (!id) return { ok: false, problem: 'مسارٌ غيرُ معروف — عبورٌ أو تخزين.', entry: null };

  const reason = txt(note);
  if (id === ROUTES.crossDock.id) {
    if (!demand?.docId) {
      return { ok: false, problem: 'عبورٌ بلا طلبٍ مرجعيٍّ لا يُقيَّد — إلى أيّ أمرٍ تُسلَّم البضاعة؟', entry: null };
    }
    if (!reason) {
      return { ok: false, problem: 'سببُ العبور إلزاميّ — وهو خروجٌ عن المعتاد يُراجَع بعد شهر.', entry: null };
    }
  }

  return {
    ok: true,
    problem: '',
    entry: {
      action: 'receiving-route-decision',
      route: id,
      routeLabel: id === ROUTES.crossDock.id ? ROUTES.crossDock.labelAr : ROUTES.putaway.labelAr,
      sku: txt(received?.sku),
      barcode: txt(received?.barcode),
      batch: txt(received?.batch),
      expiry: txt(received?.expiry),
      qty: round(num(received?.qty)),
      demandDocId: txt(demand?.docId),
      demandDocType: txt(demand?.docType),
      demandDocNumber: txt(demand?.docNumber),
      demandQty: demand?.suggestQty === undefined ? null : round(num(demand.suggestQty)),
      destination: txt(demand?.destinationHint),
      note: reason,
      byName: txt(profile?.name),
      byRole: txt(profile?.role),
      at: Number.isFinite(at) ? at : null,
    },
  };
}

/** سطرٌ يُقرأ على الشاشة بجانب البند. */
export function crossDockSummary(line) {
  if (!line) return '';
  if (!line.candidates?.length) return line.problem || '';
  const best = line.candidates[0];
  const more = line.candidates.length > 1 ? ` و${line.candidates.length - 1} طلبًا آخر` : '';
  const left = line.remainder > 0 ? ` · ويُخزَّن الباقي ${line.remainder}` : '';
  return `عبورٌ ${best.suggestQty} إلى ${best.docNumber}${best.party ? ` (${best.party})` : ''} ⟶ ${best.destinationHint}${more}${left}`;
}
