/**
 * خدمة جردِ الطبالي — «شهادةُ رؤيةٍ» تُسجَّل، لا كمّيّةٌ تُحسب.
 *
 * ═══ القيد الحاكم: ق-٢ / ح-٣ ═══
 * جردُ الطبلية المغلقة **شهادةُ رؤيةٍ بلا كمّيّات** — فلا يُخرق CAP-101
 * («الالتقاط لا يُحاسِب»). وكلُّ ما يمرّ من هنا حدثٌ على الطبلية نفسه:
 * «شوهدت في الجرد، في هذا الرفّ، بهذه الحالة». ولا رقمَ واحد.
 *
 * ═══ بلا مجموعةٍ جديدة ═══
 * المشاهدةُ حدثٌ في `handling_units/{lpn}/events` — وقواعدُها منشورةٌ منذ
 * LPN-O05. ولا مجموعةَ جردٍ ثانيةٌ تنتظر نشرَ قاعدة (درس LPN-O06/O07).
 *
 * ★ والمعرّفُ حتميّ `SIGHT__{session}__{lpn}`: فإعادةُ المسح تكتب فوق نفسها
 * ولا تُسجّل مشاهدتين. وهو ما يجعل ضياعَ جلسة المتصفّح غيرَ ضارّ — يُعاد
 * المسح فلا يتضاعف شيء.
 */
import { appendUnitEvent, getUnit, listUnitsByState } from './lpnService.js';
import { SIGHTING, applySighting, counterView, palletSightingVerdict } from './countPallet.js';

/** الحالاتُ التي تُعدّ «واقفةً في المستودع» فتُتوقَّع في الجرد. */
export const COUNTABLE_STATES = Object.freeze(['STORED', 'RESERVED', 'PICKING', 'PENDING_PUTAWAY']);

/** الطبالي المتوقَّعة في نطاق الجرد — للمطابقة لا للعرض على العادّ. */
export async function listCountableUnits({ max = 200 } = {}) {
  const groups = await Promise.all(COUNTABLE_STATES.map((s) => listUnitsByState(s, max)));
  const units = groups.flat();
  return { units, capped: groups.some((g) => g.length >= max) };
}

/**
 * تسجيلُ مشاهدةٍ — والجوابُ للعادّ نصٌّ ووصفٌ **بلا رقم**.
 *
 * @returns {Promise<{session:object, view:object}|{problem:string}>}
 */
export async function recordSighting(session, code, { bin, sighting = 'SEALED', actor, sessionId = 'S', nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const unit = await getUnit(code).catch(() => null);

  const verdict = palletSightingVerdict(session, code, { bin, unit, sighting, actor, at });
  if (!verdict.ok) return { problem: verdict.message };

  await appendUnitEvent(
    verdict.sighting.lpn,
    {
      type: 'COUNT_SEEN',
      actor,
      at,
      // ★ التفاصيلُ للمطابقة لا للعادّ: أين رُئيت وبأيّ حال. ولا كمّيّة.
      details: {
        bin: verdict.sighting.bin,
        sighting: verdict.sighting.sighting,
        recordedBin: verdict.sighting.recordedBin,
      },
    },
    { id: `SIGHT__${String(sessionId).trim() || 'S'}__${verdict.sighting.lpn}` }
  );

  return {
    session: applySighting(session, verdict.sighting),
    view: counterView(verdict.sighting, unit),
  };
}

export { SIGHTING };
