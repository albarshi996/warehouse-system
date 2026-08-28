/**
 * دفترُ الطبليات العائدة ‹GATE-301/302› — منطق خالص.
 *
 * ═══ ★★ ولماذا دفترٌ ولا يُشتقّ من الزيارات؟ (ق-٥) ═══
 * عرفُ البوّابة أن يُشتقّ لا يُخزَّن (`doorOccupancy` · `buildCard`) — لكنّ
 * `VISITS_CAP = 200` في `yardService`: «الساحة تُدار باليوم لا بالتاريخ
 * كلّه». ورصيدُ مورّدٍ شهريٌّ قد يحتاج ثلاثمئة زيارة، فالاشتقاقُ من الزيارات
 * **يعطي رقمًا ناقصًا ولا يخبرك أنّه ناقص** — وهو أسوأ من عدم وجود الشاشة.
 *
 * والبيّنةُ على أنّ لا نواةَ قائمةً تصلح: `stock_moves` دفترُ الأصناف
 * بوحداتها ومعاملاتها، وإقحامُ الخشب فيه يُفسد كلَّ أرصدة المخزون بصفوفٍ لا
 * صنفَ لها. وهي البيّنةُ نفسُها التي بُرّرت بها `yard_visits` حين رُفض
 * إقحامُها في `trips`.
 *
 * ═══ والدفترُ ملحقٌ-فقط ═══
 * لا سطرَ يُعدَّل ولا يُحذف (`allow update, delete: if false`). وكلُّ تصحيحٍ
 * **سطرٌ جديدٌ بسببه** — نمطُ المجموعات المقدّسة في البوّابة (`audit` ·
 * `stock_moves` · `scans`).
 *
 * ═══ ★ والرصيدُ إشارتُه معناه ═══
 * `balance = الداخل − الخارج` لكلّ طرف:
 *   موجبٌ ⇒ **نحتفظ بطبلياتٍ تخصّه** — دَينٌ عينيٌّ علينا.
 *   سالبٌ ⇒ **طبلياتُنا عنده** ولم تعد.
 * ومثالُ المالك: دخل ٨٠ · خرج ٦٥ ⇒ الرصيد ١٥ لصالحه علينا.
 */

const s = (v) => String(v ?? '').trim();
const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};

/**
 * أنواعُ حركة الدفتر — ولكلٍّ **إشارتُه** في الرصيد.
 *
 * `OPENING` ضروريّ: بلا رصيدٍ افتتاحيّ يبدأ الجدولُ من صفرٍ وهو ليس صفرًا،
 * فيقرأ المديرُ «لا طبليات للمورّد عندنا» وفي الساحة مئةٌ منها.
 * و`WRITE_OFF` يُخرج التالفَ والمفقود من الرصيد **القابل للردّ** ويُبقي أثرَه.
 */
export const PALLET_MOVE_KINDS = Object.freeze([
  { id: 'IN', label: 'دخول', sign: +1 },
  { id: 'OUT', label: 'خروج', sign: -1 },
  { id: 'OPENING', label: 'رصيد افتتاحيّ', sign: +1 },
  { id: 'WRITE_OFF', label: 'شطب (تالف أو مفقود)', sign: -1 },
]);

const KIND_BY_ID = new Map(PALLET_MOVE_KINDS.map((k) => [k.id, k]));

export function moveKind(id) {
  return KIND_BY_ID.get(s(id).toUpperCase()) || null;
}

/** الطرفُ المجهول اسمٌ صريحٌ لا فراغ — فلا تختفي حركةٌ من الجدول. */
export const UNKNOWN_PARTY = 'بلا جهةٍ مسمّاة';

/**
 * سطرُ دفترٍ مسوّى. **لا ساعةَ تُقرأ هنا**: `at` يُمرَّر من طبقة الخدمة
 * بختم الخادم (نمط `yardModel`: «الزمن يُمرَّر ولا يُقرأ»).
 */
export function shapeMove(input) {
  const kind = moveKind(input?.kind) ? s(input.kind).toUpperCase() : 'IN';
  return {
    kind,
    count: n(input?.count),
    party: s(input?.party) || UNKNOWN_PARTY,
    ownership: s(input?.ownership) || 'company',
    type: s(input?.type).toUpperCase() || 'STD',
    condition: s(input?.condition) || 'sound',
    visitId: s(input?.visitId),
    plate: s(input?.plate).toUpperCase(),
    reason: s(input?.reason),
    note: s(input?.note),
    at: Number.isFinite(Number(input?.at)) ? Number(input.at) : null,
  };
}

/** ما يمنع كتابةَ سطرٍ في دفترٍ لا يُصحَّح بعد الكتابة. */
export function moveProblems(input) {
  const m = shapeMove(input);
  const out = [];
  if (!m.count) out.push('عددُ الطبليات مطلوب — سطرٌ بصفرٍ ليس حركة.');
  if (!moveKind(m.kind)) out.push(`نوعُ حركةٍ غير معروف: ${m.kind}`);
  if (m.kind === 'WRITE_OFF' && !m.note) {
    out.push('الشطبُ يحتاج سببًا مكتوبًا — والدفترُ لا يُصحَّح بعد الكتابة فلا يُشطب بلا بيان.');
  }
  if (m.kind === 'OPENING' && !m.note) {
    out.push('الرصيدُ الافتتاحيّ يحتاج بيانًا — متى جُرد ومن جرده.');
  }
  return out;
}

/**
 * ★ يشتقّ أسطرَ الدفتر من حمولةٍ واحدة — **مصدرُ الكتابة الوحيد**.
 *
 * ولماذا هنا لا في الخدمة؟ لأنّ الاشتقاق قاعدةُ عملٍ تُختبر: أيُّ ملكيّةٍ
 * تُنسب لأيّ طرف، وأيُّ حالٍ يُشطب. والخدمةُ تكتب ما تُعطى ولا تقرّر.
 *
 * @param {'IN'|'OUT'} kind
 * @param {object} load حمولةٌ فيها `pallets[]` و`party`
 * @param {object} ctx {visitId, plate, reason, at}
 * @returns {object[]} أسطرٌ جاهزةٌ للكتابة — وفراغُها يعني «لا طبليات».
 */
export function movesFromLoad(kind, load, ctx = {}) {
  const lines = Array.isArray(load?.pallets) ? load.pallets : [];
  return lines
    .map((l) =>
      shapeMove({
        kind,
        count: l?.count,
        ownership: l?.ownership,
        type: l?.type,
        condition: l?.condition,
        party: load?.party,
        visitId: ctx.visitId,
        plate: ctx.plate,
        reason: ctx.reason,
        at: ctx.at,
      })
    )
    .filter((m) => m.count > 0);
}

/** أثرُ سطرٍ في الرصيد — عددٌ موقَّعٌ بإشارة نوعه. */
export function signedCount(move) {
  const m = shapeMove(move);
  return (moveKind(m.kind)?.sign ?? 0) * m.count;
}

/**
 * ★★ الرصيدُ الكامل — أرصدةُ الأطراف والإجمالات الستّ.
 *
 * والإجمالاتُ **معلَنةٌ بما تعنيه** لا بأسماءٍ عامّة، لأنّ «إجمالي الطبليات»
 * وحدَه رقمٌ لا يُقرأ: أهو خشبُنا أم خشبُ الناس؟
 *
 * @param {object[]} moves أسطرُ الدفتر (بأيّ ترتيب)
 * @returns {{parties:object[], totals:object, moves:number}}
 */
export function palletBalance(moves) {
  const rows = (Array.isArray(moves) ? moves : []).map(shapeMove).filter((m) => m.count > 0);

  const byParty = new Map();
  const totals = {
    /** كلُّ ما هو داخل الموقع الآن — خشبُنا وخشبُ غيرنا معًا. */
    onSite: 0,
    /** ملكُ الشركة الموجود عندنا. */
    companyOnSite: 0,
    /** ملكُ الموردين والعملاء والناقلين الموجود عندنا — دَينٌ عينيٌّ علينا. */
    othersWithUs: 0,
    /** ملكُنا الذي خرج ولم يعد — دَينٌ عينيٌّ لنا. */
    oursWithOthers: 0,
    /** تالفةٌ عبرت البوّابة أو شُطبت. */
    damaged: 0,
    /** تحت المراجعة — لا تُحسب سليمةً ولا تُشطب بعد. */
    underReview: 0,
  };

  for (const m of rows) {
    const signed = signedCount(m);
    totals.onSite += signed;
    if (m.ownership === 'company') totals.companyOnSite += signed;
    if (m.condition === 'damaged') totals.damaged += m.count;
    if (m.condition === 'underReview') totals.underReview += m.count;

    const key = `${m.party}||${m.ownership}`;
    if (!byParty.has(key)) {
      byParty.set(key, { party: m.party, ownership: m.ownership, in: 0, out: 0, balance: 0, moves: 0 });
    }
    const row = byParty.get(key);
    row.moves += 1;
    if (signed > 0) row.in += m.count;
    else row.out += m.count;
    row.balance += signed;
  }

  const parties = [...byParty.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  // ★★ الدَّينان يُشتقّان **من صفوف الأطراف لا من مجموعٍ عامّ**.
  //
  // ولماذا؟ لأنّ الجمعَ العامّ يُقاصّ ما لا يجوز أن يُقاصّ: رصيدٌ افتتاحيٌّ
  // موجبٌ بمئتين وعشرين يمحو دَينًا عندك لعميلٍ بخمسٍ وأربعين، فيقرأ المديرُ
  // «لا شيء لأحدٍ علينا» وعند العميل خشبُنا. والدَّينُ **علاقةٌ بطرفٍ** لا
  // رقمٌ في خزنة — فيُجمع طرفًا طرفًا ولا يُقاصّ بين طرفين.
  for (const row of parties) {
    if (row.ownership === 'company') {
      if (row.balance < 0) totals.oursWithOthers += -row.balance;
    } else if (row.balance > 0) {
      totals.othersWithUs += row.balance;
    }
  }
  return { parties, totals, moves: rows.length };
}

/**
 * نصُّ الرصيد لطرفٍ — يقول **الاتّجاه** لا الرقمَ وحده.
 *
 * فرقمٌ عارٍ «١٥» لا يقول أعِندنا خشبُه أم عنده خشبُنا، والخطأُ في هذا
 * يُنتج مطالبةً في الاتّجاه الخطأ.
 */
export function balanceText(row) {
  const b = Number(row?.balance) || 0;
  const party = s(row?.party) || UNKNOWN_PARTY;
  if (b === 0) return `${party}: لا رصيد — ما دخل خرج.`;
  if (b > 0) return `${party}: لدينا ${b} طبليّةً تخصّه.`;
  return `${party}: لديه ${Math.abs(b)} طبليّةً تخصّنا.`;
}

/** أسطرُ طرفٍ بعينه — الأحدثُ أوّلًا حين يُعرف الوقت. */
export function movesOfParty(moves, party, ownership) {
  const p = s(party);
  return (Array.isArray(moves) ? moves : [])
    .map(shapeMove)
    .filter((m) => m.party === p && (!ownership || m.ownership === ownership))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
