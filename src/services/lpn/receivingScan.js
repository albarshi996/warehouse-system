/**
 * مسح الاستلام — حكمُ كلّ قراءةٍ عند الشاحنة. منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: الموظّف يمسح باركودًا فماذا يحدث؟ خطة ٧ تُجيب بسبعة
 * موانع وأربع خطواتٍ آليّة — وبلا موضعٍ واحدٍ يحكم، تتفرّق الأحكام على
 * الشاشة والخدمة فتختلفان يومًا: تقبل الشاشة ما ترفضه الخدمة، أو أسوأ —
 * تقبل الخدمة ما كان يجب أن يُردّ.
 *
 * ═══ القاعدتان الحاكمتان ═══
 *
 * ١· **الرفض يقول الصواب لا كلمة «خطأ»** — يسمّي المطلوب والممسوح معًا
 *    («المفتوح ٦٠ والممسوح ٧٢»)، فيُصلح الموظّف بلا أن يسأل أحدًا. وهو عرف
 *    `scanGate.js` القائم نفسه، يُستدعى منطقُه ولا يُنسخ.
 *
 * ٢· **الحارس يمرّر بسببٍ مقيَّد ولا يوقف العمل** (ق-٣): التجاوز فوق المفتوح
 *    لا يُمنع منعًا باتًّا بل يحتاج **صلاحية مشرف** — لأنّ الشاحنة واقفةٌ
 *    والمورد أرسل زيادةً، وبابٌ مغلقٌ تمامًا يعني كتابةً على ورقةٍ خارج
 *    النظام. أمّا الصنف الغريب والدفعة المنتهية فمنعٌ حقيقيّ: لا سبب يجعلهما
 *    مقبولَين.
 *
 * ═══ العبوة تُحوَّل يوم القراءة لا يوم اكتشاف الفرق ═══
 * باركود الكرتونة يرفع الكمّيّة **بمعامله** (١٢ لا ١) — من `unitForBarcode`
 * و`factorToBase` القائمتين (CAP-102/103). ومعاملٌ مجهولٌ **يُعلَن ولا
 * يُخمَّن**: القراءة تمرّ بكمّيّتها الظاهرة موسومةً بأنّ أساسها غير معروف.
 */

import { normalizeUom, factorToBase, baseUomOf } from '../items/uomModel.js';
import { unitForBarcode, itemForLine } from '../items/uomWiring.js';
import { findSessionLine, remainingOf } from './receivingSession.js';
import { readingProblem } from './lpnContents.js';

/**
 * أسباب الرفض المقيَّدة (خطة ٧ §٣-٥) — قائمةٌ معلنة لا نصٌّ حرّ.
 * نصٌّ حرٌّ يعني تقريرًا لا يُجمَع: «تلف» و«تالف» و«مكسور» ثلاثة أسباب.
 */
export const REJECT_REASONS = Object.freeze({
  DAMAGED: 'تلف',
  SHORT: 'نقص',
  EXCESS: 'زيادة',
  BARCODE_MISMATCH: 'اختلاف الباركود',
  ITEM_MISMATCH: 'اختلاف الصنف',
  EXPIRED: 'منتهي الصلاحية',
  WET: 'بلل أو تلوّث',
  OTHER: 'أخرى',
});

/** الأسباب التي لا تقوم إلّا بملاحظةٍ مكتوبة — «أخرى» بلا شرحٍ لا تُفيد. */
const NOTE_REQUIRED = new Set(['OTHER']);

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * حلّ الباركود إلى صنفٍ ووحدةٍ ومعامل — استدعاءٌ للنواة القائمة لا نسخٌ لها.
 *
 * @returns {{item, uom, factor, via}} و`item=null` للباركود المجهول.
 */
export function resolveScan(raw, indexes) {
  const code = String(raw ?? '').trim();
  const item = itemForLine({ barcode: code, sku: code }, indexes);
  if (!item) return { item: null, uom: '', factor: null, via: 'unknown' };

  // وحدةُ هذا الباركود بعينه: كرتونةٌ أم وحدة؟ فإن لم يُعرف الباركود وحدةً
  // فهو باركود الصنف الأساس.
  const uom = normalizeUom(unitForBarcode(item, code)) || baseUomOf(item);
  const factor = factorToBase(item, uom);
  return { item, uom, factor, via: unitForBarcode(item, code) ? 'uom-barcode' : 'item-barcode' };
}

/**
 * حكمُ قراءةٍ واحدة — `{ok, message, needsSupervisor, entry}`.
 *
 * الترتيب هو الحارس: الباركود المجهول أوّلًا (لا يُحكم على مجهول)، ثمّ
 * انتماؤه للأمر، ثمّ الكمّيّة، ثمّ الصلاحية والخلط عبر `readingProblem`
 * القائمة، ثمّ التجاوز أخيرًا — لأنّه الوحيد الذي يُفتح بصلاحية.
 *
 * @param {object} session جلسة الاستلام
 * @param {object} scan {barcode, qty, batch, expiry, override, overrideNote}
 * @param {object} ctx {indexes, asOf, policy}
 */
export function scanVerdict(session, scan, { indexes, asOf, policy } = {}) {
  const raw = String(scan?.barcode ?? '').trim();
  if (!raw) return reject('قراءةٌ فارغة — امسح الباركود ثانيةً.');

  const { item, uom, factor } = resolveScan(raw, indexes);

  // ★ الباركود المجهول **لا يُردّ ويُنسى** — يصير استثناءً يُسجَّل (خطة ٧:
  // «قراءة باركود غير معروف دون تحويله إلى استثناء» من الممنوعات).
  if (!item) {
    return {
      ok: false,
      message: `الباركود «${raw}» غير معروف في ماستر الأصناف — سُجّل استثناءً لتُراجعه الحوكمة، ولا يدخل الطبلية.`,
      needsSupervisor: false,
      exception: { type: 'UNKNOWN_BARCODE', barcode: raw },
      entry: null,
    };
  }

  const line = findSessionLine(session, { sku: item.sku, barcode: raw });
  if (!line) {
    const names = (session?.lines ?? []).map((l) => l.sku).filter(Boolean).slice(0, 3).join(' · ');
    return {
      ok: false,
      message: `الصنف «${item.sku || raw}» ليس في أمر «${session?.order?.number ?? ''}» — أصنافه: ${names || 'لا أصناف'}. لا استلام لصنفٍ خارج الأمر.`,
      needsSupervisor: false,
      exception: { type: 'ITEM_NOT_IN_ORDER', barcode: raw, sku: item.sku ?? '' },
      entry: null,
    };
  }

  // الكمّيّة: افتراضُها واحدةٌ من وحدة الباركود — مسحةٌ واحدة = عبوةٌ واحدة.
  const qty = scan?.qty === undefined || scan?.qty === null ? 1 : Number(scan.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return reject(`الكمّيّة «${scan?.qty}» غير صالحة — أكبر من صفر.`);
  }

  // الصلاحية وسياسة الخلط وملصقُ الطبلية في خانة الدفعة: أحكامٌ مبنيّةٌ
  // مختبَرة في طبقة المحتويات — تُستدعى ولا تُعاد.
  const contentProblem = readingProblem(currentLines(session, scan), { sku: item.sku, barcode: raw, batch: scan?.batch, expiry: scan?.expiry, uom, qty }, { asOf, policy });
  if (contentProblem) return reject(contentProblem);

  // الكمّيّة بالوحدة الأساس — عليها يقع حكم التجاوز، وإلّا قُورنت كراتينُ بوحدات.
  const baseQty = Number.isFinite(factor) && factor > 0 ? qty * factor : null;
  const remaining = remainingOf(line);
  const over = baseQty === null ? 0 : baseQty - remaining;

  if (over > 0) {
    if (!scan?.override) {
      return {
        ok: false,
        message: `المفتوح من «${item.sku}» ${remaining} والممسوح ${baseQty} — الزائد ${over}. يحتاج صلاحية مشرفٍ بسببٍ مكتوب.`,
        needsSupervisor: true,
        exception: { type: 'OVER_RECEIPT', sku: item.sku ?? '', remaining, scanned: baseQty, over },
        entry: null,
      };
    }
    if (!String(scan?.overrideNote ?? '').trim()) {
      return { ok: false, message: 'التجاوز يحتاج سببًا مكتوبًا يُقيَّد باسم المشرف — يبقى في السجلّ.', needsSupervisor: true, entry: null };
    }
  }

  return {
    ok: true,
    message: '',
    needsSupervisor: false,
    entry: {
      lineId: line.lineId,
      sku: up(item.sku),
      barcode: raw,
      name: item.name ?? item.description ?? '',
      uom,
      factor: Number.isFinite(factor) && factor > 0 ? factor : null,
      qty,
      baseQty,
      batch: up(scan?.batch),
      expiry: String(scan?.expiry ?? '').trim(),
      // ★ المعامل المجهول يُعلَن ولا يُخمَّن — الكمّيّة تدخل والأساس موسومٌ
      // مجهولًا، فيظهر في فاحص الاحتواء قائمةَ عملٍ لا رقمًا كاذبًا.
      baseUnknown: baseQty === null,
      over: over > 0 ? over : 0,
      overrideNote: over > 0 ? String(scan.overrideNote).trim() : '',
    },
  };
}

/** بنود الطبلية الجارية — تُمرَّر من المستدعي، والغائبة قائمةٌ فارغة. */
function currentLines(session, scan) {
  return scan?.palletLines ?? session?.currentPalletLines ?? [];
}

function reject(message) {
  return { ok: false, message, needsSupervisor: false, entry: null };
}

/**
 * سبب رفض تسجيل كمّيّةٍ مرفوضة — أو '' إن صحّ.
 *
 * ★ المقبول والمرفوض **كمّيّتان منفصلتان**: خطة ٧ تمنع «اعتماد الكمّيّة
 * المرفوضة ككمّيّة سليمة». فالمرفوض لا يدخل حمولة الطبلية أبدًا — يُسجَّل
 * بسببه ويذهب للحوكمة.
 */
export function rejectionProblem({ reason, qty, note } = {}) {
  if (!Object.hasOwn(REJECT_REASONS, reason)) {
    return `سبب الرفض «${reason ?? ''}» غير معروف — الأسباب مقيَّدة: ${Object.values(REJECT_REASONS).join(' · ')}.`;
  }
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return `الكمّيّة المرفوضة «${qty}» غير صالحة — أكبر من صفر.`;
  if (NOTE_REQUIRED.has(reason) && !String(note ?? '').trim()) {
    return `سبب «${REJECT_REASONS[reason]}» يحتاج شرحًا مكتوبًا — وإلّا لم يُفد التقرير شيئًا.`;
  }
  return '';
}

/**
 * قيدُ رفضٍ مكتمل — يذهب للحوكمة ولا يدخل حمولة الطبلية.
 *
 * @returns {{rejection:object}|{problem:string}}
 */
export function buildRejection({ reason, qty, note = '', sku, barcode, batch, expiry, photos = [], actor, at } = {}) {
  const problem = rejectionProblem({ reason, qty, note });
  if (problem) return { problem };
  if (!String(actor ?? '').trim()) return { problem: 'قيدُ رفضٍ بلا فاعلٍ لا يُسجَّل — من رفض؟' };
  return {
    rejection: {
      reason,
      reasonLabel: REJECT_REASONS[reason],
      qty: Number(qty),
      note: String(note ?? '').trim(),
      sku: up(sku),
      barcode: String(barcode ?? '').trim(),
      batch: up(batch),
      expiry: String(expiry ?? '').trim(),
      photos: Array.isArray(photos) ? photos : [],
      actor: String(actor).trim(),
      at: at ?? null,
    },
  };
}

/**
 * خلاصةُ الرفض للحوكمة: مجموعٌ لكلّ سببٍ باسمه — لا قائمةٌ خامٌّ تُقرأ صفًّا صفًّا.
 */
export function rejectionSummary(rejections) {
  const by = new Map();
  for (const r of rejections ?? []) {
    if (!Object.hasOwn(REJECT_REASONS, r?.reason)) continue;
    const e = by.get(r.reason) ?? { reason: r.reason, label: REJECT_REASONS[r.reason], qty: 0, count: 0 };
    e.qty += Number(r.qty) || 0;
    e.count += 1;
    by.set(r.reason, e);
  }
  return [...by.values()].sort((a, b) => b.qty - a.qty);
}
