/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  دفترُ النقد اليوميّ (المرحلة م) — نظيرُ «النظام الموحّد» في إكسل المالك
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * يُجسّد دلالةَ إكسل خزينتك حرفًا: **دفترُ نقدٍ متّصلٌ لكلّ محلّ** (رصيدٌ افتتاحيٌّ
 * ثمّ حركاتٌ قبضٍ/صرف)، تُبنى منه تلقائيًّا:
 *   • **تقريرٌ يوميّ**: رصيدُ بداية اليوم (= إقفالُ أمس) · إجماليُّ القبض · إجماليُّ
 *     الصرف · رصيدُ نهاية اليوم · عددُ الحركات النشطة/الملغاة · سطورُ اليوم برصيدٍ
 *     تراكميّ — وهو «تسكيرُ الخزينة اليوميّ».
 *   • **ملخّصٌ شهريّ**: صفٌّ لكلّ يومٍ (افتتاح/قبض/صرف/إقفال/عدد).
 *
 * ★★★ **إلغاءٌ لا حذف** (كحالة «ملغي» في الإكسل): الإلغاءُ قيدٌ مضادٌّ يُلحَق، والسطرُ
 *     الأصليُّ يبقى مشطوبًا ويُستبعد من الإجماليات — والرصيدُ يتعادل.
 * ★★ **منطوقٌ بالمحلّ**: دفترٌ لكلّ محلّ (`CB:<shop>`)، معزولٌ تمامًا عن غيره.
 * ★ **بابٌ محقونٌ لا مستورَد**: فوق `createLocalTreasury` (كاتبٌ واحدٌ مُسلسَل)،
 *   فيُبرهَن على مخزنٍ في الذاكرة و`node:sqlite`. لا RLS محلّيًّا — العزلُ في القراءة.
 *
 * المبالغُ في واجهة الخدمة بالوحدة الكبرى (دينار)، وتُخزَّن بالصغرى الصحيحة.
 */
import { createLocalTreasury } from './localTreasuryStore.js';
import { CASH_MOVEMENTS } from './cashSession.js';
import { toMinor, fromMinor } from './money.js';

const BOOK_PREFIX = 'CB';
/** معرّفُ دفترِ محلٍّ — دفترٌ واحدٌ متّصلٌ لكلّ محلّ («_» للمحلّ غير المحدَّد). */
const bookId = (shop) => `${BOOK_PREFIX}:${shop == null || shop === '' ? '_' : shop}`;
const dayOf = (at) => String(at ?? '').slice(0, 10);
const dirOf = (kind) => CASH_MOVEMENTS[kind]?.dir;
/** أثرُ الحركة على الدرج بالوحدة الصغرى: وارد موجب، صادر سالب. */
const netMinor = (m) => (dirOf(m.kind) === 'in' ? Number(m.amount) || 0 : -(Number(m.amount) || 0));

export function createCashbook(db) {
  const T = createLocalTreasury(db);

  /** ترتيبٌ زمنيٌّ ثابت: بالطابع ثمّ التسلسل (فيصحّ مع إدخالٍ بتاريخٍ رجعيّ). */
  const chrono = (a, b) =>
    String(a.at ?? '').localeCompare(String(b.at ?? '')) || (Number(a.seq) || 0) - (Number(b.seq) || 0);

  /** يفصل الحركاتِ النشطةَ عن الملغاة (الأصلُ المُلغى + القيدُ المضادّ يخرجان). */
  function partition(movements) {
    const cancelled = new Set(
      movements.filter((m) => m.reverses != null).map((m) => Number(m.reverses)),
    );
    const active = movements.filter((m) => m.reverses == null && !cancelled.has(Number(m.seq)));
    const struck = movements.filter((m) => m.reverses == null && cancelled.has(Number(m.seq)));
    return { active: active.slice().sort(chrono), struck: struck.slice().sort(chrono) };
  }

  /**
   * يفتح دفترَ محلٍّ برصيدٍ افتتاحيّ (مرّةً — idempotent، فإعادتُه تُبقي الأوّل).
   * @param {{shop?:string|null, openingBalance?:number, openedBy?:string, at?:string}} input
   */
  async function openBook({ shop = null, openingBalance = 0, openedBy = '', at = '' } = {}) {
    return T.open({
      id: bookId(shop),
      shift: 'cashbook',
      openingBalance: toMinor(openingBalance),
      openedBy,
      openedAt: at,
      shop: shop ?? null,
    });
  }

  /** يُلحق حركةً (قبضًا أو صرفًا) إلى دفتر المحلّ — المبلغُ بالدينار. */
  async function addEntry({ shop = null, dir, kind, amount, memo = '', at = '', byUid = '' }) {
    const resolvedKind = kind || (dir === 'in' ? 'customer_receipt' : 'expense');
    if (dirOf(resolvedKind) !== (dir || dirOf(resolvedKind))) {
      return { ok: false, reason: 'bad-kind', message: 'نوعُ الحركة لا يطابق الاتّجاه' };
    }
    return T.addMovement({
      sessionId: bookId(shop),
      kind: resolvedKind,
      method: 'cash',
      amount: toMinor(amount),
      memo,
      at,
      byUid,
    });
  }

  /** قبضٌ (وارد). `kind` اختياريٌّ من أنواع الوارد (الافتراض: قبض عميل). */
  const addReceipt = (input) => addEntry({ ...input, dir: 'in' });
  /** صرفٌ (صادر). `kind` اختياريٌّ من أنواع الصادر (الافتراض: مصروف). */
  const addPayment = (input) => addEntry({ ...input, dir: 'out' });

  /** يُلغي حركةً بتسلسلها (قيدٌ مضادّ لا حذف). */
  async function cancelEntry({ shop = null, seq, reason = '', at = '', byUid = '' }) {
    return T.cancelMovement(bookId(shop), seq, { reason, at, byUid });
  }

  /**
   * التقريرُ اليوميّ لمحلٍّ في يومٍ (`YYYY-MM-DD`): رصيدُ بداية اليوم = الافتتاحُ +
   * صافي النشط قبل اليوم؛ ثمّ قبضُ اليوم وصرفُه وإقفالُه، وسطورُ اليوم برصيدٍ تراكميّ،
   * والملغاةُ منفصلةً (مشطوبةً، خارج الإجماليات). @returns null إن لم يوجد الدفتر.
   */
  async function dailyReport(shop, day) {
    const id = bookId(shop);
    const session = await T.getSession(id);
    if (!session) return null;
    const { active, struck } = partition(await T.listMovements(id));

    const opening = active
      .filter((m) => dayOf(m.at) < day)
      .reduce((bal, m) => bal + netMinor(m), Number(session.openingBalance) || 0);

    let running = opening;
    let totalIn = 0;
    let totalOut = 0;
    const rows = [];
    for (const m of active) {
      if (dayOf(m.at) !== day) continue;
      running += netMinor(m);
      const isIn = dirOf(m.kind) === 'in';
      if (isIn) totalIn += Number(m.amount) || 0;
      else totalOut += Number(m.amount) || 0;
      rows.push({
        seq: m.seq,
        kind: m.kind,
        labelAr: CASH_MOVEMENTS[m.kind]?.labelAr || m.kind,
        memo: m.memo || '',
        in: isIn ? fromMinor(m.amount) : 0,
        out: isIn ? 0 : fromMinor(m.amount),
        balance: fromMinor(running),
        at: m.at || '',
      });
    }

    const cancelledRows = struck
      .filter((m) => dayOf(m.at) === day)
      .map((m) => ({
        seq: m.seq,
        kind: m.kind,
        labelAr: CASH_MOVEMENTS[m.kind]?.labelAr || m.kind,
        memo: m.memo || '',
        in: dirOf(m.kind) === 'in' ? fromMinor(m.amount) : 0,
        out: dirOf(m.kind) === 'in' ? 0 : fromMinor(m.amount),
        cancelled: true,
      }));

    return {
      shop: shop ?? null,
      day,
      opening: fromMinor(opening),
      totalIn: fromMinor(totalIn),
      totalOut: fromMinor(totalOut),
      closing: fromMinor(running),
      activeCount: rows.length,
      cancelledCount: cancelledRows.length,
      rows,
      cancelledRows,
    };
  }

  /**
   * ملخّصٌ شهريٌّ لمحلٍّ (`YYYY-MM`): صفٌّ لكلّ يومٍ فيه حركاتٌ نشطة، بافتتاحٍ يساوي
   * إقفالَ اليوم السابق (يُسلسَل عبر كامل الدفتر ثمّ يُرشَّح بالشهر). @returns [] أو null.
   */
  async function monthlySummary(shop, month) {
    const id = bookId(shop);
    const session = await T.getSession(id);
    if (!session) return null;
    const { active } = partition(await T.listMovements(id));

    let running = Number(session.openingBalance) || 0;
    const byDay = new Map();
    for (const m of active) {
      const d = dayOf(m.at);
      if (!byDay.has(d)) byDay.set(d, { day: d, opening: running, inMinor: 0, outMinor: 0, count: 0, closing: running });
      const row = byDay.get(d);
      running += netMinor(m);
      if (dirOf(m.kind) === 'in') row.inMinor += Number(m.amount) || 0;
      else row.outMinor += Number(m.amount) || 0;
      row.count += 1;
      row.closing = running;
    }

    return [...byDay.values()]
      .filter((r) => r.day.startsWith(month))
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({
        day: r.day,
        opening: fromMinor(r.opening),
        totalIn: fromMinor(r.inMinor),
        totalOut: fromMinor(r.outMinor),
        closing: fromMinor(r.closing),
        count: r.count,
      }));
  }

  return { openBook, addReceipt, addPayment, addEntry, cancelEntry, dailyReport, monthlySummary, bookId, CASH_MOVEMENTS };
}
