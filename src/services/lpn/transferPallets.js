/**
 * النقل بالطبالي — فوق سلسلة TR←TRN←TRC القائمة. منطق خالص.
 *
 * المشكلة التي يحلّها: سلسلة النقل مبنيّةٌ وتعمل — TRN يقيّد إلى مخزن
 * `TRANSIT` فيظهر الرصيد «في الطريق» ولا يُصرف من طرفَيه. **ولا أحد يعرف
 * أيّ طبليةٍ على الشاحنة**: يصل النقل فيُعدّ صنفًا صنفًا من جديد، ويُكتشف
 * النقص بلا أن يُعرف أين وقع — في التحميل أم الطريق أم التفريغ.
 *
 * فالطبالي تحوّل النقل من «كمّيّاتٍ تُعدّ مرّتين» إلى **حمولاتٍ تُمسح**.
 *
 * ═══ القاعدة الحاكمة (خطة ٧ · القواعد ٤ و٥ و٩) ═══
 * ④**لا يُغلق أمر النقل عند مغادرة المصدر بل عند اعتماد الوجهة**،
 * ⑤وما بينهما «قيد النقل» لا يتصرّف فيه أحد،
 * ⑨**ولا تُستلم الطبلية مرّتين** في الوجهة.
 *
 * والقاعدتان الأوليان **مبنيّتان في الدفتر أصلًا** (TRANSIT) — فهذا الملفّ
 * لا يعيد بناءهما بل يضيف إليهما هويّة الحمولة.
 */

import { normalizeLpnCode, isValidLpnCode } from './lpnCode.js';
import { isBlockedForIssue, LPN_FLAGS, stateLabel } from './lpnLifecycle.js';
import { needsNewIdentity } from './lpnLineage.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

/* ═══════════════ الهويّة عبر النقل (LPN-402) ═══════════════ */

/**
 * ★★ هل تعبر الطبلية بهويّتها أم تُولَّد لها هويّةٌ جديدة؟
 *
 * قاعدة خطة ٧: **الكاملة غير المفتوحة تعبر بهويّتها** — استمراريّةُ التتبّع
 * أهمّ من الترتيب الإداريّ. فطبليةٌ خرجت من بنغازي ووصلت طرابلس كما هي
 * يجب أن تُقرأ بالرقم نفسه؛ لو وُلّدت لها هويّةٌ جديدة لَانقطع خيطُ من
 * استلمها أوّلًا ومن كوّنها.
 *
 * أمّا التقسيم والدمج وتغيير المحتوى فهويّةٌ جديدة بنسبٍ إلى الأصل.
 */
export function transferIdentityDecision({ opened = false, split = false, merged = false } = {}) {
  const fresh = needsNewIdentity({ contentChanged: opened, isSplit: split, isMerge: merged });
  return {
    keepsIdentity: !fresh,
    reason: fresh
      ? 'الحمولة تغيّرت (فتحٌ أو تقسيمٌ أو دمج) — هويّةٌ جديدة بنسبها إلى الأصل.'
      : 'الطبلية كاملةٌ لم تُفتح — تعبر بهويّتها فلا ينقطع خيط التتبّع.',
  };
}

/* ═══════════════ المغادرة (LPN-403) ═══════════════ */

/**
 * سبب رفض إدراج طبليةٍ في شحنة نقلٍ — أو '' إن جاز.
 *
 * ★ ولماذا يُمنع الموسوم هنا أيضًا؟ لأنّ النقل **صرفٌ من المصدر**: حمولةٌ
 * تحت الفحص تخرج من المستودع فتصير في الطريق، ويصل قرارُ الفحص متأخّرًا
 * إلى مستودعٍ آخر لا يعرف قصّتها.
 */
export function shipPalletProblem(unit, { fromWarehouse } = {}) {
  if (!unit?.code) return 'لا طبلية — امسح الملصق.';
  if (!['STORED', 'RESERVED', 'ISSUE_CLOSED', 'STAGED'].includes(unit.state)) {
    return `الطبلية «${stateLabel(unit.state)}» — لا تُشحن في هذه الحالة.`;
  }
  if (isBlockedForIssue(unit)) {
    const names = (unit.flags ?? []).filter((f) => Object.hasOwn(LPN_FLAGS, f)).map((f) => `«${LPN_FLAGS[f]}»`).join(' و');
    return `الطبلية موسومة ${names} — لا تُشحن؛ قرارُ الفحص يصل متأخّرًا إلى مستودعٍ لا يعرف قصّتها.`;
  }
  const wh = up(fromWarehouse);
  if (wh && up(unit.warehouse) !== wh) {
    return `الطبلية في «${unit.warehouse}» والشحنة من «${wh}» — لا تُشحن حمولةٌ ليست هنا.`;
  }
  return '';
}

/**
 * بيانُ الشحنة: الطبالي وما تحمله — يُطبع ويُرافق السائق ويُقارَن عند الوصول.
 *
 * @returns {{pallets:Array, lines:Array, totalQty:number, palletCount:number}}
 */
export function shipmentManifest(units) {
  const lines = new Map();
  for (const u of units ?? []) {
    for (const l of u?.lines ?? []) {
      const key = [up(l.sku), up(l.batch)].join('__');
      const e = lines.get(key) ?? { sku: up(l.sku), batch: up(l.batch), expiry: l.expiry ?? '', qty: 0, pallets: [] };
      e.qty += Number(l.baseQty ?? l.qty) || 0;
      if (!e.pallets.includes(u.code)) e.pallets.push(u.code);
      lines.set(key, e);
    }
  }
  const list = [...lines.values()];
  return {
    pallets: (units ?? []).map((u) => ({ code: u.code, itemCount: (u.lines ?? []).length })),
    lines: list,
    totalQty: list.reduce((s, l) => s + l.qty, 0),
    palletCount: (units ?? []).length,
  };
}

/* ═══════════════ الاستلام في الوجهة (LPN-404) ═══════════════ */

/**
 * ★★★ حكم مسح طبليةٍ عند استلام النقل — القاعدة ٩ وأخواتها.
 *
 * @returns {{ok:boolean, message:string, kind?:string}}
 */
export function receiveScanVerdict(session, code, unit) {
  if (session?.state !== 'OPEN') return { ok: false, message: 'جلسةُ الاستلام مغلقة — لا مسحَ بعدها.' };
  const lpn = normalizeLpnCode(code);
  if (!isValidLpnCode(lpn)) return { ok: false, message: `«${code ?? ''}» ليس ملصق طبلية.` };

  // ⑨ لا تُستلم مرّتين — تُحسب مرّتين فيظهر فائضٌ وهميّ في الوجهة.
  if ((session.received ?? []).includes(lpn)) {
    return { ok: false, kind: 'DUPLICATE', message: `الطبلية «${lpn}» مستلَمةٌ في هذه الجلسة أصلًا — لا تُستلم مرّتين.` };
  }

  if (!(session.expected ?? []).includes(lpn)) {
    return {
      ok: false,
      kind: 'NOT_EXPECTED',
      message: `الطبلية «${lpn}» ليست في أمر النقل «${session.order?.number ?? ''}» — سجّلها فرقًا لتُحسم، ولا تدخلها المخزن بلا قرار.`,
    };
  }
  if (unit && !['LOADED', 'STAGED', 'LOADING'].includes(unit.state)) {
    return { ok: false, kind: 'STATE', message: `الطبلية «${stateLabel(unit?.state)}» — لم تُحمَّل في هذه الشحنة أصلًا.` };
  }
  return { ok: true, message: '' };
}

/** تسجيل استلام طبلية — بحالتها (سليمةٌ مغلقة أم مفتوحةٌ تحتاج عدًّا). */
export function applyReceive(session, code, { sealIntact = true, opened = false } = {}) {
  const lpn = normalizeLpnCode(code);
  return {
    ...session,
    received: [...(session.received ?? []), lpn],
    // ★ المفتوحةُ أو مكسورةُ الختم تُوسم لتُعدّ فعليًّا — «إذا كانت الطبلية
    // مفتوحة أو تم السحب منها يجب تأكيد أو قراءة محتوياتها» (خطة ٧).
    needsCount: opened || !sealIntact
      ? [...(session.needsCount ?? []), lpn]
      : (session.needsCount ?? []),
  };
}

/** عدّاد الاستلام — المتوقَّع والمستلَم والمفقود. */
export function receiveCounters(session) {
  const expected = session?.expected ?? [];
  const received = session?.received ?? [];
  const missing = expected.filter((c) => !received.includes(c));
  return {
    expected: expected.length,
    received: received.length,
    missing: missing.length,
    missingList: missing,
    needsCount: (session?.needsCount ?? []).length,
    complete: missing.length === 0,
  };
}

/* ═══════════════ محضر فرق النقل (LPN-405) ═══════════════ */

/** أنواع فروق النقل (خطة ٧ سادسًا) — قائمةٌ مقيَّدة لا نصٌّ حرّ. */
export const DISCREPANCY_TYPES = Object.freeze({
  PALLET_MISSING: 'طبلية ناقصة',
  PALLET_EXTRA: 'طبلية زائدة',
  ITEM_MISMATCH: 'صنف غير مطابق',
  BATCH_MISMATCH: 'دفعة مختلفة',
  QTY_SHORT: 'كمّيّة ناقصة',
  QTY_OVER: 'كمّيّة زائدة',
  DAMAGED: 'تلف',
  SEAL_BROKEN: 'كسر في الختم',
  OPENED: 'فتحٌ غير معتمَد للطبلية',
});

/**
 * ★★ بناءُ فروق النقل آليًّا من جلسة الاستلام — تُقاس لا تُكتب بيد.
 *
 * وهذا هو الفرق العمليّ: محضرٌ يُكتب باليد يُكتب حين يتذكّر أحدٌ أن يكتبه،
 * ومحضرٌ يُقاس يوجد **دائمًا** حين يوجد فرق.
 */
export function buildDiscrepancies(session, { manifest, counted = {} } = {}) {
  const out = [];
  const c = receiveCounters(session);

  for (const lpn of c.missingList) {
    out.push({ type: 'PALLET_MISSING', lpn, sent: 1, received: 0, note: '' });
  }
  for (const extra of session?.extras ?? []) {
    out.push({ type: 'PALLET_EXTRA', lpn: extra.lpn, sent: 0, received: 1, note: extra.reason ?? '' });
  }
  for (const lpn of session?.sealBroken ?? []) {
    out.push({ type: 'SEAL_BROKEN', lpn, sent: 1, received: 1, note: '' });
  }

  // فروقُ الكمّيّة للمفتوحة التي عُدّت فعلًا — المغلقةُ السليمة لا تُعدّ.
  for (const [lpn, lines] of Object.entries(counted)) {
    const expectedLines = (manifest?.pallets ?? []).find((p) => p.code === lpn)?.lines
      ?? (manifest?.lines ?? []).filter((l) => (l.pallets ?? []).includes(lpn));
    for (const line of lines ?? []) {
      const want = (expectedLines ?? []).find((l) => up(l.sku) === up(line.sku) && up(l.batch) === up(line.batch));
      const sent = Number(want?.qty) || 0;
      const got = Number(line.qty) || 0;
      if (got < sent) out.push({ type: 'QTY_SHORT', lpn, sku: up(line.sku), batch: up(line.batch), sent, received: got, note: '' });
      else if (got > sent) out.push({ type: 'QTY_OVER', lpn, sku: up(line.sku), batch: up(line.batch), sent, received: got, note: '' });
    }
  }
  return out;
}

/**
 * سبب رفض إغلاق استلام النقل — أو '' إن جاز.
 *
 * ★★★ القاعدة ١٥ حرفيًّا: **أيّ فرقٍ يبقى مفتوحًا حتى صدور قرار**. فلا
 * يُغلق أمر النقل بفرقٍ غير محسوم — ولا استثناءَ هنا بسببٍ عابر: الفرق
 * يعني بضاعةً ضاعت أو زادت، وإغلاقُه «ليمشي الحال» يقتل الثقة بالسجلّ كلّه.
 */
export function receiveCloseProblem(session, discrepancies) {
  if (session?.state !== 'OPEN') return 'جلسةُ الاستلام مغلقة أصلًا.';
  const open = (discrepancies ?? []).filter((d) => !d.decision);
  if (open.length > 0) {
    const kinds = [...new Set(open.map((d) => DISCREPANCY_TYPES[d.type] ?? d.type))].join(' · ');
    return `${open.length} فرقًا بلا قرار (${kinds}) — لا يُغلق أمر النقل حتى تُحسم الفروق. افتح محضرًا واحسمها.`;
  }
  return '';
}

/** حسمُ فرقٍ بقرار حوكمةٍ يسمّي المسؤوليّة والحركة التصحيحية (خطة ٧ سادسًا). */
export function decideDiscrepancy(discrepancy, { decision, liability, correction = '', actor, at } = {}) {
  if (!String(decision ?? '').trim()) return { problem: 'قرارُ الفرق يحتاج نصًّا — ماذا تقرّر ولماذا؟' };
  if (!String(liability ?? '').trim()) {
    return { problem: 'الفرق يحتاج تحديد الطرف الذي يتحمّله — المصدر أم الناقل أم الوجهة؟ وبلا ذلك يبقى الفرق بلا صاحب.' };
  }
  if (!String(actor ?? '').trim()) return { problem: 'قرارُ الفرق بلا فاعلٍ لا يُسجَّل.' };
  return {
    discrepancy: {
      ...discrepancy,
      decision: String(decision).trim(),
      liability: String(liability).trim(),
      correction: String(correction ?? '').trim(),
      decidedBy: String(actor).trim(),
      decidedAt: at ?? null,
    },
  };
}
