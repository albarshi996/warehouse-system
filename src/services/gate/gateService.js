/**
 * بوابةُ الأمن في السحابة ‹GATE› — طبقةٌ رقيقةٌ تنفّذ ولا تقرّر.
 *
 * ═══ ولا مجموعةَ زياراتٍ ثانية ═══
 * القاعدة الحاكمة: **لا مجموعة Firestore جديدة إلّا ببيّنة أنّ لا نواة تصلح.**
 * وزيارةُ البوّابة هي زيارةُ الساحة نفسُها — `yard_visits` القائمة منذ
 * ‹EXE-602›. فهذا الملفّ **يستدعي `yardService`** ولا يكتب في المجموعة
 * مباشرةً: فلا ختمٌ يُكتب بطريقين، ولا حارسٌ يُتجاوَز بمسارٍ ثانٍ.
 *
 * ═══ وكلُّ حكمٍ في النموذج الخالص ═══
 * `visitProblems` · `canTransitionVisit` · `exitVerdict` (وفيه القفلُ الرابع
 * `outLoadProblems`) — كلُّها في `fleet/yardModel.js` و`gate/gateModel.js`
 * مختبَرةً. وهنا **ترتيبُ النداءات** لا قاعدةُ عمل.
 *
 * ═══ والدخولُ ختمان لا ختمٌ واحد ═══
 * تُفتح الزيارة عند «وصول» ثمّ تُنقل فورًا إلى «تسجيل بوابة». ولماذا لا
 * تُفتح عند «تسجيل بوابة» رأسًا؟ لأنّ مؤقّت البقاء `turnaround` يُقاس من
 * ختم الوصول — وزيارةٌ بلا ختمِ وصولٍ تبقى بلا زمنِ بقاءٍ للأبد.
 */
import {
  openVisit,
  advanceVisit,
  readVisit,
  listenYardVisits,
  listenDoors,
  listenVisitEvents,
  assignDoor,
  cancelVisit,
  holdVisit,
  VISITS_CAP,
} from '../fleet/yardService.js';
import { EXIT_STAGE, PERMIT_STAGE, shapeVisit, stageIndex } from '../fleet/yardModel.js';
import { shapeInLoad, shapeOutLoad, shapeVisitor, needsDoor, normalizePlate, isGateReason } from './gateModel.js';

/** يُعاد تصديرُه كي لا تستورد الشاشةُ طبقتين لتقرأ زياراتٍ وأبوابًا. */
export { listenYardVisits, listenDoors, listenVisitEvents, assignDoor, cancelVisit, holdVisit, VISITS_CAP };

/**
 * ★ تسجيلُ دخولٍ من الحاجز.
 *
 * ولا يُطلب من الحارس إلّا ما يظهر له: السببُ يشتقّ الغرضَ (ق-٣)، وحالةُ
 * الحمولة تُظهر حقولَها (ج‑٤)، والنقصُ يُعلَن ولا يمنع — فالملزِمُ لوحةٌ فقط.
 *
 * @returns {Promise<string>} معرّفُ الزيارة.
 */
export async function checkIn(input, profile) {
  if (!isGateReason(input?.reason)) {
    throw new Error('سببُ الدخول مطلوب — وبلا سببٍ لا يعرف النظامُ أتحتاج بابًا أم لا.');
  }
  const payload = {
    plate: normalizePlate(input?.plate),
    carrier: input?.carrier,
    driverName: input?.driverName,
    driverId: input?.driverId,
    reason: input.reason,
    load: { in: shapeInLoad(input?.load), out: {} },
    visitor: shapeVisitor(input?.visitor),
  };

  const visitId = await openVisit(payload, profile, 'arrived');
  // الختمُ الثاني فورًا: الحارسُ سجّلها وهي أمامه، فزمنُ الانتظار يبدأ الآن.
  await advanceVisit(visitId, 'checkedIn', {}, profile);
  return visitId;
}

/**
 * التحقّق — الختمُ الذي يقول «رأيتُ أوراقَها وطابقتُ لوحتَها».
 *
 * وهو ما يفتح المسارَ القصير لمن لا بابَ له: بعده يمضي الزائرُ إلى التصريح
 * مباشرةً، وتنتظر شاحنةُ البضاعة بابًا يُسنده مشرفُ المناولة.
 */
export function verify(visitId, profile) {
  return advanceVisit(visitId, 'verified', {}, profile);
}

/**
 * ★★ تسجيلُ خروجٍ — ق-٤: حمولةٌ **ثانية** في الزيارة نفسها.
 *
 * والحمولةُ تُكتب **قبل** الانتقال إلى «خروج»، لأنّ `advanceVisit` يستدعي
 * `exitVerdict` على الحالة المدموجة — فالقفلُ الرابع يقرأ ما كتبته الشاشة
 * فعلًا لا حقلًا فارغًا. (درسُ ‹LPN›: حارسٌ يقرأ حقلًا لا يُكتب لا يُطلق قطّ.)
 *
 * @param {object} out حمولةُ الخروج بحالتها الخمس.
 * @param {string} permitRef رقمُ تصريح الخروج GP — لا ترقيمَ ثانٍ للساحة.
 */
export async function checkOut(visitId, { out, permitRef } = {}, profile) {
  const current = shapeVisit(await readVisit(visitId));
  const load = { in: current.load.in, out: shapeOutLoad(out) };
  const permit = String(permitRef ?? current.permitRef ?? '').trim();

  // إلى «تصريح» أوّلًا إن لم تكن هناك — ومنها وحدها يجوز الخروج.
  if (current.stage !== PERMIT_STAGE) {
    await advanceVisit(visitId, PERMIT_STAGE, { load, permitRef: permit }, profile);
  }
  await advanceVisit(visitId, EXIT_STAGE, { load, permitRef: permit }, profile);
  return { load, permitRef: permit };
}

/**
 * الخطوةُ التالية لزيارةٍ ما — **نصٌّ وفعلٌ**، لا شجرةَ شروطٍ في الشاشة.
 *
 * ★ ولماذا هنا لا في المكوّن؟ لأنّ الحارس على الحاجز يحتاج **زرًّا واحدًا
 * يعرف ما يفعل**، والشروطُ المكتوبة في JSX لا تُختبر وأوّلُ حالةٍ تُنسى فيها
 * تترك المركبة عالقةً بلا زرّ.
 *
 * @returns {{stage:string, label:string, kind:string}|null}
 */
export function nextStepFor(visit) {
  const v = shapeVisit(visit);
  const i = stageIndex(v.stage);
  if (i < 0) return null;
  if (v.stage === EXIT_STAGE) return null;
  if (v.stage === 'arrived') return { stage: 'checkedIn', label: 'سجّل عند البوابة', kind: 'gate' };
  if (v.stage === 'checkedIn') return { stage: 'verified', label: 'تحقّقتُ من الأوراق', kind: 'gate' };
  if (v.stage === 'verified') {
    return needsDoor(v.reason, v.load?.in?.state)
      ? { stage: 'parked', label: 'تنتظر بابًا — مشرفُ المناولة يُسنده', kind: 'yard' }
      : { stage: PERMIT_STAGE, label: 'صرّح بالخروج', kind: 'gate' };
  }
  if (v.stage === PERMIT_STAGE) return { stage: EXIT_STAGE, label: 'سجّل الخروج', kind: 'gate' };
  return { stage: null, label: 'داخل الساحة — بيد مشرف المناولة', kind: 'yard' };
}

/** أهذه الزيارةُ ما زالت داخل الموقع؟ (للقائمة الحيّة على الحاجز) */
export function isOnSite(visit) {
  const stage = String(visit?.stage ?? '');
  return stage !== EXIT_STAGE && stage !== 'canceled';
}
