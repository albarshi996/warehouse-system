/**
 * ملصق الطبلية وقائمة الطباعة — نموذج الملصق وسجلّ الإعادة. منطق خالص.
 *
 * المشكلة التي يحلّها: الملصق هو **الوجه المادّيّ للهويّة** — ما يُقرأ في
 * الممرّ بعد شهر. وحقلٌ يُكتب عليه بيدٍ يعني ملصقًا يكذب عن حمولته؛ ولذلك
 * كلُّ ما عليه **مشتقٌّ من بطاقة الطبلية** ولا يُملى.
 *
 * ═══ القاعدتان الحاكمتان (خطة ٧ رابعًا) ═══
 *
 * ١· **كلّ إعادة طباعةٍ تُسجَّل** باسمٍ وسببٍ ووقتٍ ورقمِ نسخة، والنسخة
 *    الثانية فصاعدًا تحمل «نسخة معاد طباعتها». وسببُ التشدّد: ملصقان
 *    متطابقان على طبليتين يعني حمولتين بهويّةٍ واحدة — وهو أسوأ ما يقع
 *    في مستودعٍ يعمل بالباركود.
 *
 * ٢· **PDF أوّلًا والحراريّة قرارُ عتاد** (ق-٣ · LPN-O01): الخطة نفسها
 *    تجيز «إخراج الملصق PDF كحلّ بديل»، فلا يتوقّف التشغيل على طابعة.
 */

import { buildCard } from './lpnCard.js';
import { shortLpnLabel } from './lpnCode.js';

/** مقاس الملصق الافتراضيّ — ١٠×١٥ سم، مقاسُ ملصقات الطبالي الشائع. */
export const DEFAULT_LABEL_SIZE = Object.freeze({ widthMm: 100, heightMm: 150 });

/** حالات مهمّة الطباعة — ملحقةٌ لا تُحذف. */
export const PRINT_STATES = Object.freeze({
  QUEUED: 'بانتظار الطباعة',
  PRINTED: 'طُبع',
  CANCELLED: 'أُلغي',
});

/**
 * نموذج الملصق — حقول خطة ٧ الثلاثة عشر، كلٌّ مشتقٌّ من البطاقة.
 *
 * @returns {object|null} النموذج، أو null لطبليةٍ بلا هويّةٍ صالحة
 *          (وهو الصواب: **لا ملصق قبل الاعتماد** — الهويّة تولد معه).
 */
export function buildLabel(unit, { events = [], allUnits = [], session = null, copy = 1, company = 'Brandzo' } = {}) {
  const card = buildCard(unit, { events, allUnits });
  if (!card) return null;

  return {
    company,
    lpn: card.code,
    shortLabel: shortLpnLabel(card.code),
    // الباركود والرمز يحملان الهويّة نفسها — لا نصًّا مختلفًا يفترق عنها.
    barcodeValue: card.code,
    qrValue: card.code,
    warehouse: card.warehouse,
    orderNumber: card.sourceDoc?.number ?? session?.order?.number ?? '',
    supplier: session?.supplier ?? '',
    receivedAt: card.createdAt ?? '',
    receivedBy: card.createdBy ?? '',
    itemCount: card.itemCount,
    totalQty: card.totalBaseQty,
    lots: card.lots,
    state: card.stateLabel,
    // ★ «Mixed Pallet» تُشتقّ من البنود ولا تُكتب — نصّ خطة ٧ حرفيًّا.
    isMixed: card.isMixed,
    mixedNotice: card.isMixed ? 'Mixed Pallet — طبلية مختلطة' : '',
    copy,
    // النسخة الثانية فصاعدًا تُعلن نفسها، فلا يُخلط ملصقٌ معادٌ بأصله.
    reprintNotice: copy > 1 ? `نسخة معاد طباعتها (${copy})` : '',
    size: DEFAULT_LABEL_SIZE,
  };
}

/**
 * سبب رفض إضافة مهمّة طباعة — أو '' إن صحّت.
 *
 * الإعادة تحتاج سببًا **دائمًا**: أوّلُ طباعةٍ حقٌّ، وما بعدها يحتاج تفسيرًا
 * (تلف الملصق · سقط · لم يُطبع). فبلا سببٍ لا يُعرف أهو عطبُ طابعةٍ متكرّر
 * أم عاملٌ يطبع نسخًا لطبالٍ لا يعرف أين هي.
 */
export function printJobProblem({ lpn, copy, reason, actor } = {}) {
  if (!String(lpn ?? '').trim()) return 'مهمّةُ طباعةٍ بلا طبلية — أيّ حمولةٍ تُطبع؟';
  const n = Number(copy);
  if (!Number.isInteger(n) || n < 1) return `رقم النسخة «${copy}» غير صالح — يبدأ من واحد.`;
  if (n > 1 && !String(reason ?? '').trim()) {
    return 'إعادة الطباعة تحتاج سببًا مكتوبًا — ملصقان بهويّةٍ واحدة على طبليتين أسوأ ما يقع في مستودع.';
  }
  if (!String(actor ?? '').trim()) return 'مهمّةُ طباعةٍ بلا فاعلٍ لا تُسجَّل.';
  return '';
}

/**
 * بناء مهمّة طباعة.
 *
 * @returns {{job:object}|{problem:string}}
 */
export function buildPrintJob({ lpn, copy = 1, reason = '', actor, at, printer = 'PDF' } = {}) {
  const problem = printJobProblem({ lpn, copy, reason, actor });
  if (problem) return { problem };
  return {
    job: {
      lpn: String(lpn).trim(),
      copy: Number(copy),
      isReprint: Number(copy) > 1,
      reason: String(reason ?? '').trim(),
      printer: String(printer ?? 'PDF').trim() || 'PDF',
      state: 'QUEUED',
      requestedBy: String(actor).trim(),
      requestedAt: at ?? null,
    },
  };
}

/**
 * رقم النسخة التالية لطبلية — من سجلّ مهامّها لا من عدّادٍ منفصل.
 * (عدّادٌ منفصلٌ يفترق عن السجلّ أوّلَ مهمّةٍ أُلغيت.)
 */
export function nextCopyNumber(jobs, lpn) {
  const mine = (jobs ?? []).filter((j) => j?.lpn === lpn && j?.state !== 'CANCELLED');
  return mine.reduce((max, j) => Math.max(max, Number(j?.copy) || 0), 0) + 1;
}

/** خلاصةُ إعادة الطباعة للرقابة — من أكثرُ إعادةً ولماذا (مؤشّر خطة ٧). */
export function reprintSummary(jobs) {
  const by = new Map();
  for (const j of jobs ?? []) {
    if (!j?.isReprint || j?.state === 'CANCELLED') continue;
    const e = by.get(j.lpn) ?? { lpn: j.lpn, copies: 0, reasons: [] };
    e.copies += 1;
    if (j.reason && !e.reasons.includes(j.reason)) e.reasons.push(j.reason);
    by.set(j.lpn, e);
  }
  return [...by.values()].sort((a, b) => b.copies - a.copies);
}

/**
 * ★★ تأكيد اللصق بمسحٍ راجع (LPN-209) — «الملصق الصحيح على الطبلية الصحيحة».
 *
 * أخطرُ لحظةٍ في الدورة: عاملٌ يطبع ثلاثة ملصقاتٍ ويلصقها على ثلاث طبالٍ
 * بترتيبٍ خاطئ — فيصير كلُّ ما بعدها كذبًا منظَّمًا، والنظام واثقٌ تمامًا.
 * فالمسح الراجع يُغلق هذا الباب: يمسح الملصق **بعد لصقه** فيُطابَق.
 */
export function stickConfirmVerdict(expectedLpn, scannedLpn) {
  const expected = String(expectedLpn ?? '').trim().toUpperCase();
  const scanned = String(scannedLpn ?? '').trim().toUpperCase();
  if (!scanned) return { ok: false, message: 'امسح الملصق بعد لصقه لتأكيد أنّه على الطبلية الصحيحة.' };
  if (!expected) return { ok: false, message: 'لا طبليةَ منتظرةٌ للتأكيد.' };
  if (scanned !== expected) {
    return {
      ok: false,
      message: `هذا ملصق «${scanned}» والمنتظر «${expected}» — انزع الملصق وضعه على طبليته، ولا تُكمل حتى يتطابقا.`,
    };
  }
  return { ok: true, message: '' };
}
