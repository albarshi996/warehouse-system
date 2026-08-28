/**
 * خدمة استلام النقل في الوجهة — الشحنةُ تصل، فتُطابَق طبليةً بطبلية.
 *
 * ═══ ولماذا في الشاشة الميدانيّة لا في لوحة النقل؟ ═══
 * لأنّ **من يمسح يقف عند الشاحنة لا عند مكتب**. لوحةُ النقل تقريرٌ لمشرفٍ
 * يقرأ، وهذا عملُ يدٍ تفتح الباب وتنزل الحمولة. والدورُ نفسه (`LOADER`)
 * يحمل التحميل في المصدر والاستلام في الوجهة — عاملٌ واحدٌ على طرفَي الرحلة.
 *
 * ═══ الجلسةُ تُشتقّ ولا تُخزَّن (نمط LPN-310) ═══
 *   · المتوقَّع = الطبالي التي غادرت بهذه الوجهة (`LOADED`).
 *   · المستلَم = ما بلغ `ISSUED` منها — **والانتقالُ نفسه هو السجلّ**.
 * فلا مجموعةَ جديدةٌ تنتظر نشرَ قاعدة، وجلسةٌ ضاعت تعود كما كانت.
 *
 * ═══ القاعدة ١٥ ═══
 * **أيّ فرقٍ يبقى مفتوحًا حتى صدور قرار.** ولا استثناءَ بسببٍ عابر هنا —
 * بخلاف التحميل: الفرقُ يعني بضاعةً ضاعت أو زادت، وإغلاقُه «ليمشي الحال»
 * يقتل الثقة بالسجلّ كلّه. والحكمُ في `receiveCloseProblem` لا هنا.
 */
import { appendUnitEvent, listUnitsByState, transitionUnit } from './lpnService.js';
import {
  applyReceive,
  buildDiscrepancies,
  receiveCloseProblem,
  receiveCounters,
  receiveScanVerdict,
  shipmentManifest,
} from './transferPallets.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

const routeOf = (u) => up(u?.route || u?.branch);

/** الشحناتُ الواصلة — مجمَّعةً بوجهتها. */
export async function listInbound({ max = 200 } = {}) {
  const groups = await Promise.all(['LOADED', 'ISSUED'].map((s) => listUnitsByState(s, max)));
  const units = groups.flat();
  const byRoute = new Map();
  for (const u of units) {
    const r = routeOf(u) || '—';
    const e = byRoute.get(r) ?? { route: r, onTruck: 0, received: 0 };
    if (u.state === 'ISSUED') e.received += 1; else e.onTruck += 1;
    byRoute.set(r, e);
  }
  return {
    routes: [...byRoute.values()].filter((r) => r.onTruck > 0).sort((a, b) => b.onTruck - a.onTruck),
    units,
    capped: groups.some((g) => g.length >= max),
  };
}

/**
 * بناءُ جلسة استلامٍ لوجهةٍ من الحالة الحيّة.
 *
 * @returns {{session:object, units:object[], manifest:object}}
 */
export function buildInboundSession(units, route, { actor, at } = {}) {
  const want = up(route);
  const mine = (units ?? []).filter((u) => routeOf(u) === want);
  const expected = mine.map((u) => u.code);
  const received = mine.filter((u) => u.state === 'ISSUED').map((u) => u.code);

  return {
    session: {
      state: 'OPEN',
      order: { number: want },
      tripId: want,
      expected,
      received,
      needsCount: [],
      extras: [],
      sealBroken: [],
      openedBy: String(actor ?? '').trim(),
      openedAt: at ?? null,
    },
    units: mine,
    manifest: shipmentManifest(mine),
  };
}

export { receiveCounters, receiveCloseProblem, buildDiscrepancies };

/**
 * مسحُ طبليةٍ عند الوصول — الحكمُ ثمّ الإثبات.
 *
 * ★ والمفتوحةُ أو مكسورةُ الختم **تُوسم لتُعدّ فعليًّا** — فالطبليةُ التي
 * فُتحت في الطريق لا تُصدَّق على ختمها.
 */
export async function scanInbound(session, code, unit, { sealIntact = true, opened = false, actor, nowIso = new Date().toISOString() } = {}) {
  const at = nowIso;
  const verdict = receiveScanVerdict(session, code, unit);
  if (!verdict.ok) return { problem: verdict.message, kind: verdict.kind };

  await transitionUnit(unit.code, 'ISSUED', { actor, at, doc: unit.sourceDoc ?? null });
  if (opened || !sealIntact) {
    await appendUnitEvent(
      unit.code,
      {
        type: 'EXCEPTION',
        actor,
        at,
        reason: opened ? 'وصلت مفتوحةً — تُعدّ صنفًا صنفًا' : 'ختمٌ مكسور عند الوصول',
        details: { kind: 'INBOUND_SEAL', trip: session?.tripId ?? '' },
      },
      { id: `INSEAL__${session?.tripId ?? ''}__${unit.code}` }
    );
  }

  const next = applyReceive(session, code, { sealIntact, opened });
  return {
    session: {
      ...next,
      sealBroken: sealIntact ? (next.sealBroken ?? []) : [...(next.sealBroken ?? []), up(code)],
    },
  };
}
