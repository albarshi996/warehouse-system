/**
 * مهامُّ تزويد وجه التجهيز — **من رفٍّ بعينه إلى رفٍّ بعينه**، بكمّيّةٍ بعينها.
 * منطقٌ خالصٌ بلا Firebase وبلا ساعة.
 *
 * ‹WMS-302› · تكملةُ الفجوة و-٤: `replenishModel` يقول **أنّ** الوجه ناقصٌ
 * وكم نقصُه. وهذا الملفّ يقول **من أين يُملأ**.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★ ولماذا «من أين» شرطٌ لا زينة؟
 * ═══════════════════════════════════════════════════════════════════════
 *
 * مهمّةٌ نصُّها «زوِّد RH-A-R-01-01 بثمانين كرتونًا من ITM-1» تُسلَّم لعاملٍ
 * **فيقف**. أين الثمانون؟ في المستودع أربعُ طبليّاتٍ من الصنف في أربعة ممرّات.
 * فيسأل، أو يأخذ أقربَها — **وهي الأحدثُ غالبًا** لأنّ الأحدثَ يُخزَّن في
 * الفارغ القريب. فيُزوَّد وجهُ التجهيز بالأحدث، **ويبقى الأقدمُ راكدًا حتّى
 * يبلغ تاريخَه وهو في الرفّ.**
 *
 * ★★★ وهذا هو العطبُ بعينه: **FEFO يُطبَّق على السحب للعميل ولا يُطبَّق على
 * التزويد الداخليّ** — فيُصنع داخل المستودع طابورٌ مقلوب، ويُلقى اللومُ على
 * «المخزون الراكد» وسببُه قرارُ مشيٍ لا قرارُ شراء.
 *
 * فالمصدرُ **يُختار بـFEFO ويُسمّى رفًّا رفًّا**، ويُعاد استعمالُ
 * `allocateFefo` القائمِ المُختبَر بلا نسخِ سطر.
 *
 * ═══ وأربعُ قواعدَ أُخَر ═══
 *
 * ① **لا مهمّةَ تُخترع.** بلا مصدرٍ كافٍ تُعلَن المهمّةُ **ناقصةً** بكمّيّتها
 *    المتاحة وسببُ العجز — لا كمّيّةٌ كاملةٌ تُطلب ولا مهمّةٌ تُكتَم.
 *
 * ② **الوجهُ لا يُزوَّد من نفسِه ولا من وجهٍ آخر.** مصدرُ التزويد **مخزونٌ
 *    سائبٌ** (احتياطيّ)، وسحبُه من وجهِ تجهيزٍ آخرَ يُفرغ ذاك فيُولَّد له
 *    طلبُ تزويدٍ — حلقةٌ لا تنتهي، ومشيٌ بلا فائدة.
 *
 * ③ **المعرّفُ حتميّ.** مهمّةٌ قائمةٌ لنفس الخانة والصنف لا تُضاعَف — وإلّا
 *    وُلدت نسخةٌ جديدةٌ في كلّ فتحةِ شاشة، فصار الطابورُ مئةَ مهمّةٍ لخانةٍ
 *    واحدة ولا أحدَ يصدّقه.
 *
 * ④ **لا ساعةَ تُقرأ.** `nowMs` يُمرَّر — ومنه وحده يُحكَم على الصلاحية.
 */

import { normalizeLocationCode, shortLabelOf } from './locationCode.js';
import { balanceLocationCode } from './locationsModel.js';
import { facesNeedingReplenish, isPickFace, FACE_LEVELS } from './replenishModel.js';
import { allocateFefo } from '../ledger/reservations.js';
import { expiryStatus } from '../balances/balanceKey.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n) => Math.round(n * 1000) / 1000;

/** حالاتُ مهمّة التزويد — طورانِ فقط: مُقترَحةٌ ثمّ مُطلَقة (كقاعدة الموجات). */
export const REPLENISH_STATES = Object.freeze({
  suggested: { id: 'suggested', labelAr: 'مقترَحة' },
  released: { id: 'released', labelAr: 'مُطلَقة' },
});

/**
 * معرّفٌ حتميٌّ للمهمّة — خانةٌ وصنفٌ (القاعدة ③).
 *
 * ★ ولا يدخله الوقتُ ولا العجزُ: لو دخلا لوُلد معرّفٌ جديدٌ كلّما تبدّل
 * الرصيدُ بوحدة، فصار منعُ التضاعف حبرًا.
 * ★★ ويُقيَّد صالحًا لـFirestore: بلا شرطةٍ مائلةٍ ولا حروفٍ عربيّة.
 */
export function replenishTaskId(binCode, sku) {
  const bin = normalizeLocationCode(binCode).replace(/[^\w-]/g, '-');
  const item = up(sku).replace(/[^\w-]/g, '-') || 'ANY';
  return `RPL-${bin}-${item}`;
}

/**
 * مخزونُ المصدر المسموح — **سائبٌ لا وجهُ تجهيز** (القاعدة ②).
 *
 * @param {Array} balances الأرصدة
 * @param {Array} locations سيّد المواقع (لمعرفة أيُّها وجهُ تجهيز)
 * @param {string} targetBin الخانةُ المستهدَفة — تُستثنى حتمًا
 */
export function sourceStock(balances, locations, targetBin) {
  const faces = new Set(
    (locations || []).filter((l) => isPickFace(l)).map((l) => normalizeLocationCode(l?.code)).filter(Boolean)
  );
  const target = normalizeLocationCode(targetBin);
  return (balances || []).filter((b) => {
    const code = balanceLocationCode(b);
    if (!code) return false; // بضاعةٌ بلا رفٍّ لا يُرسَل إليها عامل
    if (code === target) return false;
    return !faces.has(code);
  });
}

/**
 * مهمّةُ تزويدٍ واحدة لوجهٍ واحد.
 *
 * @param {object} face حالةُ الوجه من `pickFaceState`
 * @param {object} ctx {balances, locations, nowMs, warehouse}
 * @returns {object} المهمّة — ومعها `shortfallReason` إن عجزت (القاعدة ①)
 */
export function planFace(face, { balances = [], locations = [], nowMs, warehouse } = {}) {
  const wanted = round(num(face?.shortfall));
  const sku = up(face?.sku);
  const target = normalizeLocationCode(face?.code);

  const task = {
    id: replenishTaskId(target, sku),
    state: REPLENISH_STATES.suggested.id,
    bin: target,
    binLabel: face?.shortLabel || shortLabelOf(target),
    sku,
    level: face?.level || 'unknown',
    urgency: FACE_LEVELS[face?.level]?.rank ?? 0,
    min: face?.min ?? null,
    max: face?.max ?? null,
    available: face?.available ?? null,
    wanted,
    planned: 0,
    moves: [],
    shortfallQty: wanted,
    shortfallReason: '',
    problem: '',
  };

  if (!target) return { ...task, problem: 'خانةٌ بلا كودٍ — لا مهمّة.' };
  if (wanted <= 0) return { ...task, problem: 'لا نقصَ في هذا الوجه.' };
  if (!sku) {
    // وجهٌ مختلطٌ بلا صنفٍ مخصَّصٍ ولا رصيدٍ يُعرَف منه: لا يُخترع صنف.
    return { ...task, problem: 'لا صنفَ معروفٌ لهذا الوجه — خصِّص له صنفًا أو ضع فيه رصيدًا أوّلًا.' };
  }

  const pool = sourceStock(balances, locations, target);
  // ④ المنتهي لا يُنقل إلى وجه التجهيز — ولا تُسحب بضاعةٌ لتُرفض عند الشحن.
  const sellable = Number.isFinite(nowMs) ? pool.filter((b) => expiryStatus(b?.expiry, nowMs) !== 'expired') : pool;

  // ★★★ وهنا يُعاد استعمالُ FEFO القائمِ بلا نسخِ سطر — فالأقدمُ يخرج من
  // الاحتياطيّ أوّلًا، ولا يُزوَّد الوجهُ بالأحدث والأقدمُ راكد.
  const result = allocateFefo({ sku, qty: wanted, warehouse: warehouse || face?.warehouse }, sellable);

  const moves = result.allocations.map((a) => ({
    fromBin: normalizeLocationCode(a.bin),
    fromLabel: a.bin ? shortLabelOf(a.bin) : '',
    toBin: target,
    sku,
    batch: a.batch || '',
    expiry: a.expiry || '',
    qty: round(num(a.qty)),
    balanceId: a.balanceId || a.id || '',
  }));
  const planned = round(moves.reduce((s, m) => s + m.qty, 0));
  const gap = round(Math.max(0, wanted - planned));

  return {
    ...task,
    planned,
    moves,
    shortfallQty: gap,
    // ① العجزُ يُعلَن بسببه ولا يُكتَم — ولا تُطلب كمّيّةٌ لا وجودَ لها.
    shortfallReason: gap
      ? planned === 0
        ? `لا مخزونَ سائبًا من «${sku}» خارج أوجه التجهيز — التزويدُ يحتاج استلامًا أو تحويلًا بين المخازن.`
        : `المتاح في الاحتياطيّ ${planned} من ${wanted} — والباقي ${gap} لا مصدرَ له.`
      : '',
    problem: '',
  };
}

/**
 * خطّةُ التزويد كاملةً — كلُّ وجهٍ ناقصٍ ومهمّتُه.
 *
 * @returns {{tasks:Array, counts:object, unsourced:Array, problem:string}}
 */
export function replenishPlan({ locations = [], balances = [], nowMs, warehouse } = {}) {
  const { faces, counts } = facesNeedingReplenish(locations, balances, { warehouse });

  if (!locations.length) {
    return { tasks: [], counts, unsourced: [], problem: 'سيّد المواقع فارغ — عرِّف مواقع المستودع أوّلًا.' };
  }
  if (!counts.total) {
    return {
      tasks: [],
      counts,
      unsourced: [],
      problem: 'لا وجهَ تجهيزٍ معلَنًا في هذا المستودع — أعلِن الخانة وجهًا وحدَّها الأدنى والأعلى، ثمّ تُولَّد المهامّ.',
    };
  }

  const tasks = faces
    .map((face) => planFace(face, { balances, locations, nowMs, warehouse }))
    .filter((t) => !t.problem);

  // ★★ الترتيبُ من `facesNeedingReplenish` محفوظٌ (الفارغُ ثمّ الأكبرُ عجزًا)،
  // ويُقدَّم عليه **ما له مصدرٌ فعلًا**: مهمّةٌ بلا مصدرٍ لا تُنفَّذ، فتصديرُها
  // رأسَ الطابور يجعل العاملَ يقرأ ثلاثَ مهامّ قبل أن يجد ما يعمله.
  tasks.sort((a, b) => (b.planned > 0) - (a.planned > 0) || b.urgency - a.urgency || b.shortfallQty - a.shortfallQty || (a.id < b.id ? -1 : 1));

  return {
    tasks,
    counts: {
      ...counts,
      tasks: tasks.length,
      sourced: tasks.filter((t) => t.planned > 0).length,
      partial: tasks.filter((t) => t.planned > 0 && t.shortfallQty > 0).length,
      unsourced: tasks.filter((t) => t.planned === 0).length,
    },
    unsourced: tasks.filter((t) => t.planned === 0),
    problem: '',
  };
}

/**
 * إطلاقُ مهمّة — طورٌ **مستقلٌّ عن التكوين** (نفسُ قاعدة الموجات).
 * ومقترَحةٌ لم تُطلَق لا تظهر للعامل: الاقتراحُ قراءةٌ والإطلاقُ قرار.
 */
export function releaseVerdict(task, { actor, reason = '' } = {}) {
  if (!task?.id) return { ok: false, problem: 'مهمّةٌ بلا معرّف.' };
  if (task.state === REPLENISH_STATES.released.id) return { ok: false, problem: 'المهمّةُ مُطلَقةٌ أصلًا.' };
  if (!String(actor ?? '').trim()) return { ok: false, problem: 'إطلاقٌ بلا فاعلٍ لا يُقبل.' };
  // ★ وإطلاقُ مهمّةٍ بلا مصدرٍ يحتاج سببًا: العاملُ سيقف، فليُعلَم لماذا أُرسل.
  if (task.planned === 0 && !String(reason ?? '').trim()) {
    return { ok: false, problem: 'مهمّةٌ بلا مصدرٍ لا تُطلَق بلا سبب — العاملُ سيقف، فيُكتب لماذا أُرسل.' };
  }
  return {
    ok: true,
    problem: '',
    task: {
      ...task,
      state: REPLENISH_STATES.released.id,
      releasedBy: String(actor).trim(),
      releaseReason: String(reason ?? '').trim(),
    },
  };
}

/** سطرٌ يُقرأ على الشاشة — من أين وإلى أين وكم. */
export function taskSummary(task) {
  if (!task?.id) return '';
  const where = task.binLabel || task.bin;
  if (!task.moves.length) return `${where} ← ${task.sku}: ${task.wanted} مطلوبةً — ${task.shortfallReason}`;
  const froms = task.moves.map((m) => `${m.fromLabel || m.fromBin}${m.batch ? ` (${m.batch})` : ''} ×${m.qty}`).join(' · ');
  const gap = task.shortfallQty ? ` · ناقصٌ ${task.shortfallQty}` : '';
  return `${where} ← ${task.sku}: ${task.planned} من ${froms}${gap}`;
}
