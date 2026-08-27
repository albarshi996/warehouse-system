/**
 * الجرد بالطبلية — شهادةُ رؤيةٍ بلا كمّيّات. منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: العدّ اليوم صنفًا صنفًا ولو كانت الحمولة **مغلقةً
 * مختومةً** لم تُفتح منذ استُلمت. فيقف العادّ أمام طبليةٍ فيها أربعون
 * كرتونةً يعدّها واحدةً واحدة — ساعةٌ لما يكفيه مسحٌ واحد.
 *
 * ═══ ح-٣ · ق-٢ — القاعدة التي لا يُصلَح خرقُها لاحقًا ═══
 * **مسحُ الطبلية في الجرد شهادةُ رؤيةٍ لا احتسابُ كمّيّة.**
 *
 * ولماذا؟ لأنّ «الالتقاط لا يُحاسِب» (CAP-101): لو أظهرنا للعادّ ما يقوله
 * سجلُّ الطبلية لَصار يؤكّد الرقم بدل أن يعدّ — وهو عين العطب الذي أُصلح
 * في شاشة الجرد حين حُذفت الأعمدة الدفتريّة من أمامه.
 *
 * فالمسح يقول: **«رأيتُ هذه الحمولة، ختمُها سليم»** — لا أكثر. والتوسعة
 * إلى كمّيّاتٍ تقع في **طبقة المطابقة** بعد ختم الكشف، حيث لا يراها العادّ
 * ولا توجّه عدَّه.
 */

import { normalizeLocationCode } from '../locations/locationCode.js';
import { normalizeLpnCode, isValidLpnCode } from './lpnCode.js';
import { stateLabel } from './lpnLifecycle.js';

/** نتيجةُ مشاهدة الطبلية — ثلاثُ حالاتٍ لا أكثر. */
export const SIGHTING = Object.freeze({
  SEALED: 'مغلقة سليمة الختم',
  OPENED: 'مفتوحة — تُعدّ فعليًّا',
  DAMAGED: 'تالفة أو مكسورة الختم',
});

/**
 * حكم مسح طبليةٍ في الجرد.
 *
 * ★ لاحظ ما **لا** يعود: لا كمّيّة، ولا عدد أصناف، ولا فرق. الجواب الوحيد
 * هو «سُجّلت المشاهدة» أو «هذه ليست طبلية».
 *
 * @returns {{ok:boolean, message:string, sighting?:object}}
 */
export function palletSightingVerdict(session, code, { bin, unit, sighting = 'SEALED', actor, at } = {}) {
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) return { ok: false, message: `«${code ?? ''}» ليس ملصق طبلية — امسح الملصق أو عُدّ الأصناف.` };
  if (!Object.hasOwn(SIGHTING, sighting)) return { ok: false, message: `حالةُ المشاهدة «${sighting}» غير معروفة.` };
  if (!String(actor ?? '').trim()) return { ok: false, message: 'المشاهدة بلا فاعلٍ لا تُسجَّل — من رآها؟' };

  const seen = normalizeLocationCode(bin);
  if (!seen) return { ok: false, message: 'امسح باركود الموقع أوّلًا — مشاهدةٌ بلا موقعٍ لا تُفيد الجرد.' };

  const already = (session?.sightings ?? []).find((s) => s.lpn === lpn);
  if (already) {
    return { ok: false, message: `الطبلية «${lpn}» مُسجَّلةٌ في هذه الجلسة — رُئيت في «${already.bin}».` };
  }

  return {
    ok: true,
    message: 'سُجّلت المشاهدة.',
    sighting: {
      lpn,
      bin: seen,
      sighting,
      // ★ موقعُ السجلّ يُسجَّل للمطابقة **ولا يُعرض للعادّ**: لو قيل له
      // «هذه مسجّلةٌ في رفٍّ آخر» لَصار يبحث عن التفسير بدل أن يُكمل عدَّه.
      recordedBin: normalizeLocationCode(unit?.bin) || '',
      recordedState: unit?.state ?? '',
      actor: String(actor).trim(),
      at: at ?? null,
    },
  };
}

/** تسجيل مشاهدة — يعيد جلسةً جديدة. */
export function applySighting(session, sighting) {
  return { ...session, sightings: [...(session?.sightings ?? []), sighting] };
}

/**
 * ★★ ما يُعرض للعادّ بعد المسح — **بلا رقمٍ واحد**.
 *
 * هذه الدالّة هي حارسُ ح-٣ عمليًّا: كلُّ ما تعيده نصٌّ ووصفٌ، ولا حقل
 * كمّيّةٍ فيها أصلًا. فمن أراد إظهار كمّيّةٍ للعادّ فسيحتاج أن يكتب مسارًا
 * آخر — ويصطدم بالاختبار الذي يحرس هذا العقد.
 */
export function counterView(sighting, unit) {
  return {
    lpn: sighting?.lpn ?? '',
    bin: sighting?.bin ?? '',
    status: SIGHTING[sighting?.sighting] ?? '',
    // وصفٌ لا كمّيّة: «ثلاثة أصناف» تُعين العادّ على التعرّف ولا تخبره بالعدد.
    itemsHint: describeContents(unit),
    needsManualCount: sighting?.sighting !== 'SEALED',
    hint: sighting?.sighting === 'SEALED'
      ? 'مغلقةٌ سليمة — لا حاجة لفتحها. انتقل إلى التالية.'
      : 'افتحها وعُدّ محتواها صنفًا صنفًا كالمعتاد.',
  };
}

/** وصفُ المحتوى بلا عدد — «ماءٌ وعصير» لا «٦٠ و٢٤». */
function describeContents(unit) {
  const names = [...new Set((unit?.lines ?? []).map((l) => l?.name || l?.sku).filter(Boolean))];
  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(' و');
  return `${names.slice(0, 2).join(' و')} و${names.length - 2} غيرها`;
}

/**
 * خلاصةُ الجلسة للعادّ — عددُ المشاهدات لا كمّيّاتها.
 */
export function sightingTotals(session) {
  const list = session?.sightings ?? [];
  return {
    seen: list.length,
    sealed: list.filter((s) => s.sighting === 'SEALED').length,
    opened: list.filter((s) => s.sighting === 'OPENED').length,
    damaged: list.filter((s) => s.sighting === 'DAMAGED').length,
    bins: new Set(list.map((s) => s.bin)).size,
  };
}

/* ═══════════════ ما بعد الختم — طبقة المطابقة (LPN-502) ═══════════════ */

/**
 * ★★★ فروقُ الطبالي — **تُحسب بعد ختم الكشف لا قبله**.
 *
 * هنا وحدها تدخل الكمّيّات: فالعادّ انتهى، والكشف خُتم، ولم يعد الرقم
 * يوجّه عدًّا. وهذا هو التمييز الذي تقوم عليه الطبقة كلّها.
 *
 * ثلاثُ قوائم منفصلة (خطة ٧ ثامنًا):
 *   ①**متوقَّعةٌ ولم تُرَ** — طبليةٌ يقول السجلّ إنّها في الرفّ ولم يجدها أحد.
 *   ②**رُئيت في غير موضعها** — موجودةٌ لكن في رفٍّ آخر: خطأُ موضعٍ لا نقص.
 *   ③**رُئيت ولا سجلَّ لها** — حمولةٌ في المستودع لا يعرفها النظام.
 *
 * ★ والفرق بين ① و② حاسم: الأولى بضاعةٌ **مفقودة**، والثانية بضاعةٌ
 * **موجودةٌ في غير مكانها**. وخلطهما يجعل جردًا سليمًا يبدو كارثة.
 */
export function palletDiff(session, expectedUnits) {
  const seen = new Map((session?.sightings ?? []).map((s) => [s.lpn, s]));
  const scope = scopeBins(session);
  const expected = (expectedUnits ?? []).filter((u) => {
    const bin = normalizeLocationCode(u?.bin);
    return bin && (scope.size === 0 || withinScope(bin, scope));
  });

  const missing = [];
  const misplaced = [];
  for (const u of expected) {
    const code = normalizeLpnCode(u.code);
    const sight = seen.get(code);
    if (!sight) {
      missing.push({ lpn: code, recordedBin: normalizeLocationCode(u.bin), state: stateLabel(u.state) });
      continue;
    }
    if (sight.bin !== normalizeLocationCode(u.bin)) {
      misplaced.push({ lpn: code, recordedBin: normalizeLocationCode(u.bin), seenBin: sight.bin });
    }
  }

  const known = new Set(expected.map((u) => normalizeLpnCode(u.code)));
  const unknownUnits = new Set((expectedUnits ?? []).map((u) => normalizeLpnCode(u.code)));
  const stray = [...seen.values()]
    .filter((s) => !known.has(s.lpn) && !unknownUnits.has(s.lpn))
    .map((s) => ({ lpn: s.lpn, seenBin: s.bin }));

  return { missing, misplaced, stray, needsManualCount: [...seen.values()].filter((s) => s.sighting !== 'SEALED').map((s) => s.lpn) };
}

/**
 * نطاقُ الجلسة المكانيّ — بادئةُ موقعٍ واحدة، **الأضيق يحكم**.
 *
 * ⚠️ وهذا ليس تفصيلًا: لو أُخذ المستودع والمنطقة معًا لَابتلع الأوسعُ
 * الأضيق — فجلسةٌ نطاقُها «MAIN-A01» تشمل «MAIN» أيضًا، فتُحسب كلُّ طبليةٍ
 * في المستودع مفقودةً لأنّ العادّ لم يمرّ إلّا بممرٍّ واحد. وهو خطأٌ يجعل
 * جردًا سليمًا يبدو كارثة.
 */
function scopeBins(session) {
  const zone = normalizeLocationCode(session?.zone);
  const warehouse = normalizeLocationCode(session?.warehouse);
  const narrowest = zone || warehouse;
  return narrowest ? new Set([narrowest]) : new Set();
}

function withinScope(bin, scope) {
  for (const s of scope) if (bin === s || bin.startsWith(`${s}-`)) return true;
  return false;
}

/**
 * أثرُ الفروق على المطابقة — **اقتراحٌ لا تسوية**.
 *
 * القاعدة ١٧: نتيجةُ الجرد لا تعدّل رصيدًا إلّا بتسويةٍ معتمَدة. فهذه تبني
 * مدخلات مسار CC←ADJ القائم، ولا تكتب رصيدًا بحال.
 */
export function reconcileInput(diff, units) {
  const byCode = new Map((units ?? []).map((u) => [normalizeLpnCode(u.code), u]));
  const rows = [];
  for (const m of diff?.missing ?? []) {
    const u = byCode.get(m.lpn);
    for (const l of u?.lines ?? []) {
      rows.push({
        kind: 'MISSING_PALLET', lpn: m.lpn, bin: m.recordedBin,
        sku: l.sku, batch: l.batch, expiry: l.expiry,
        bookQty: Number(l.baseQty ?? l.qty) || 0, countedQty: 0,
        note: 'طبليةٌ متوقَّعةٌ لم تُرَ — تحقيقٌ قبل التسوية',
      });
    }
  }
  // ★ المنقولة **لا تدخل التسوية**: الكمّيّة موجودةٌ ولم تتغيّر، والذي
  // تغيّر موضعُها — فتصحيحُها نقلُ موقعٍ لا تسويةُ رصيد.
  return { rows, relocations: diff?.misplaced ?? [], strays: diff?.stray ?? [] };
}
