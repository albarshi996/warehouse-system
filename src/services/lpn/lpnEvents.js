/**
 * سجلّ أحداث الطبلية — ملحقٌ-فقط: من فعل ماذا ومتى وبأيّ مستند. منطق خالص.
 *
 * المشكلة التي يحلّها: بطاقة الطبلية تَعِد بـ«سجلّ جميع انتقالاتها» (خطة ٧)،
 * وحقلٌ يُحدَّث يمحو سابقه — فالوعد لا يقوم إلّا على سجلٍّ **يُلحَق ولا
 * يُعدَّل**: كلّ ما جرى للحمولة حدثٌ مختومٌ بفاعله ووقته وجهازه ومستنده.
 *
 * ═══ القاعدتان الحاكمتان (خطة ٧ §١١) ═══
 * ١· **لا حذف ولا تعديل** — التصحيح حدثٌ عكسيٌّ جديد يسمّي أصله وسببه.
 * ٢· **المعرّف حتميّ** — إعادة الإرسال بعد انقطاعٍ تكتب فوق نفسها لا
 *    نسخةً ثانية (نهج CAP-302 ومعرّف الحركة `docId__NNN` في الدفتر):
 *    حدثُ تتبّعِ مستندٍ معرّفه `docId__lpn`، وحدثُ جلسةٍ معرّفه
 *    `lpn__device__seq` — كلاهما يُحسب ولا يُرتجل.
 *
 * الكتابة الفعليّة في `lpnService.js` — هنا البناء والتحقّق والترتيب.
 */

import { normalizeLpnCode } from './lpnCode.js';

/** أنواع الأحداث المقيَّدة — ما ليس منها لا يدخل السجلّ. */
export const LPN_EVENT_TYPES = Object.freeze({
  CREATED: 'إنشاء الطبلية',
  READING_ADDED: 'قراءة صنف',
  READING_REVERSED: 'تراجع عن قراءة',
  CLOSED: 'إغلاق للحوكمة',
  RETURNED: 'إرجاع للتصحيح',
  APPROVED: 'اعتماد الحوكمة',
  REJECTED: 'رفض الحوكمة',
  LABEL_PRINTED: 'طباعة الملصق',
  LABEL_REPRINTED: 'إعادة طباعة الملصق',
  LABEL_CONFIRMED: 'تأكيد لصق الملصق',
  MOVED: 'انتقال موقع',
  PICKED_FROM: 'سحبٌ منها',
  SPLIT: 'تقسيم',
  MERGED: 'دمج',
  STATE_CHANGED: 'تغيير حالة',
  FLAGGED: 'وسم استثنائي',
  FLAG_CLEARED: 'رفع وسم',
  COUNT_SEEN: 'شوهدت في الجرد',
  EXCEPTION: 'استثناء',
});

/** الأحداث التي لا تقوم إلّا بسبب — بلا سببٍ تُرفض من البناء. */
const REASON_REQUIRED = new Set(['READING_REVERSED', 'RETURNED', 'REJECTED', 'LABEL_REPRINTED', 'FLAGGED', 'FLAG_CLEARED', 'EXCEPTION']);

/**
 * سبب رفض الحدث — أو '' إن كان سليمًا. حدثٌ بلا فاعلٍ أو بنوعٍ مجهول
 * لا يدخل السجلّ أصلًا: سجلٌّ فيه «مجهول فعل شيئًا» أسوأ من لا سجلّ.
 */
export function eventProblem({ type, lpn, actor, at, reason } = {}) {
  // `hasOwn` لا `in` — «constructor» و«toString» ليسا نوعَي حدث.
  if (!Object.hasOwn(LPN_EVENT_TYPES, type)) return `نوع الحدث «${type ?? ''}» غير معروف — الأنواع مقيَّدة بقائمةٍ معلنة.`;
  if (!normalizeLpnCode(lpn)) return 'حدثٌ بلا طبلية — على أيّ حمولةٍ وقع؟';
  if (!String(actor ?? '').trim()) return `حدث «${LPN_EVENT_TYPES[type]}» بلا فاعلٍ لا يُسجَّل.`;
  if (!String(at ?? '').trim()) return 'حدثٌ بلا وقتٍ لا يُرتَّب في الرحلة — مرّر الوقت من المستدعي.';
  if (REASON_REQUIRED.has(type) && !String(reason ?? '').trim()) {
    return `حدث «${LPN_EVENT_TYPES[type]}» يحتاج سببًا مكتوبًا — يبقى في السجلّ للأبد.`;
  }
  return '';
}

/**
 * بناء حدثٍ مكتمل — يعيد الحدث مجمَّدًا (`Object.freeze`): ما دخل السجلّ
 * لا تعدّله يدٌ بعدها ولو بالسهو.
 *
 * @returns {{event:object}|{problem:string}}
 */
export function buildEvent({ type, lpn, actor, at, device = '', doc = null, reason = '', details = null, seq = null } = {}) {
  const problem = eventProblem({ type, lpn, actor, at, reason });
  if (problem) return { problem };
  return {
    event: Object.freeze({
      type,
      label: LPN_EVENT_TYPES[type],
      lpn: normalizeLpnCode(lpn),
      actor: String(actor).trim(),
      at: String(at).trim(),
      device: String(device ?? '').trim(),
      doc: doc && doc.type && (doc.id || doc.number) ? Object.freeze({ type: doc.type, id: doc.id ?? '', number: doc.number ?? '' }) : null,
      reason: String(reason ?? '').trim(),
      details: details ?? null,
      seq: Number.isInteger(seq) ? seq : null,
    }),
  };
}

/**
 * معرّف حدث تتبّع مستند: `docId__lpn` — مستندٌ واحد يمسّ الطبلية مرّةً
 * واحدة في السجلّ مهما أُعيدت معالجته (idempotent).
 */
export function docEventId(docId, lpn) {
  const doc = String(docId ?? '').trim();
  const code = normalizeLpnCode(lpn);
  if (!doc || !code) return null;
  return `${doc}__${code}`;
}

/**
 * معرّف حدث جلسةٍ ميدانية: `lpn__device__seq` — الجهاز يرقّم أحداثه
 * تسلسليًّا، فإعادة الإرسال بعد انقطاع الشبكة تكتب فوق نفسها لا تضاعف.
 */
export function sessionEventId(lpn, device, seq) {
  const code = normalizeLpnCode(lpn);
  const dev = String(device ?? '').trim();
  if (!code || !dev || !Number.isInteger(seq) || seq < 0) return null;
  return `${code}__${dev}__${String(seq).padStart(6, '0')}`;
}

/**
 * حدثُ التراجع — لا يمسّ الأصل: حدثٌ جديد يسمّي معرّف أصله وسببه.
 * (التصحيح قيدُ فرقٍ لا تعديل — مبدأ الدفتر نفسه.)
 */
export function reverseEvent(original, { reason, actor, at, device = '', originalId = '' } = {}) {
  if (!original || original.type !== 'READING_ADDED') {
    return { problem: 'التراجع عن قراءةٍ فقط — غيرُ القراءة يُصحَّح بحدثه المناسب (إرجاع الحوكمة أو حركة عكسية).' };
  }
  return buildEvent({
    type: 'READING_REVERSED',
    lpn: original.lpn,
    actor,
    at,
    device,
    reason,
    details: { reversedEventId: String(originalId ?? '').trim() || null, reversedDetails: original.details ?? null },
  });
}

/**
 * ترتيب الأحداث للرحلة: بالوقت، وعند التطابق بالتسلسل — يعيد نسخةً مرتّبة
 * ولا يعدّل الأصل.
 */
export function orderEvents(events) {
  return [...(events ?? [])].sort((a, b) => {
    const at = String(a?.at ?? '').localeCompare(String(b?.at ?? ''));
    if (at !== 0) return at;
    return (a?.seq ?? 0) - (b?.seq ?? 0);
  });
}
