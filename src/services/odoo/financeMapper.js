/**
 * مطابقات المرآة المالية — من أودو إلى شكلٍ تقرؤه البوابة (SAP-16).
 *
 * ═══ ما هذا الملفّ وما ليس هو ═══
 * **هو**: مترجمٌ يفهم شكل أودو (`[id, name]` للحقول العلاقيّة، و`false`
 * للفراغ، و`move_type` بدل مجموعاتٍ متفرّقة) ويُخرج كائنًا عربيًّا مقروءًا.
 * **ليس**: محرّك قيود. لا يحسب مدينًا ولا دائنًا ولا يشتقّ حسابًا. كلّ رقمٍ
 * هنا **مستوردٌ كما هو**. من أراد تغييره فليغيّره في أودو (§16.1 ‹454›).
 *
 * ═══ لماذا فاتورةٌ وقيدٌ في نموذجٍ واحد؟ ═══
 * لأنّ أودو كذلك: الفاتورة `account.move` بـ`move_type` مختلف. فمن بنى
 * مجموعةً للفواتير وأخرى للقيود ضاعف الحقيقة وخالف مصدرها. نسحب النموذج
 * مرّةً ونُصنّف بالنوع.
 *
 * ═══ التوازن يُفحص ولا يُصلَح ═══
 * `Sum(Debit) = Sum(Credit)` (§16.9 ‹647›). فإن اختلّ فالعطب في المصدر أو في
 * السحب — والبوابة **تُعلنه ولا تُسوّيه**. تسويةٌ صامتة تُخفي عطبًا محاسبيًّا.
 *
 * منطق خالص: بلا شبكة وبلا Firestore وبلا DOM.
 */
import { refText } from './docCrosswalk.js';

/* ─────────────────────────── أدوات شكل أودو ─────────────────────────── */

/** معرّف حقلٍ علاقيّ `[id, name]` — أو `null`. */
export function relId(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (value && typeof value === 'object') return value.id ?? null;
  return null;
}

/** اسم حقلٍ علاقيّ `[id, name]` — أو نصٌّ فارغ. لا يُخرج حشوًا أبدًا. */
export function relName(value) {
  return refText(value);
}

/** رقمٌ آمن: `false` و`null` و`''` كلّها صفر، لا `NaN`. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** نصٌّ آمن: `false` في أودو تعني الفراغ لا الكلمة. */
export function str(value) {
  if (value === false || value === null || value === undefined) return '';
  return String(value).trim();
}

/* ─────────────────────────── المعاجم ─────────────────────────── */

/** نوع القيد — تصنيف §16.6 ‹574-595› من `move_type` مباشرةً. */
export const MOVE_KINDS = Object.freeze({
  entry: { id: 'entry', labelAr: 'قيد يوميّة', side: 'general' },
  in_invoice: { id: 'in_invoice', labelAr: 'فاتورة مورّد', side: 'vendor' },
  in_refund: { id: 'in_refund', labelAr: 'إشعار دائن مورّد', side: 'vendor' },
  in_receipt: { id: 'in_receipt', labelAr: 'إيصال مورّد', side: 'vendor' },
  out_invoice: { id: 'out_invoice', labelAr: 'فاتورة عميل', side: 'customer' },
  out_refund: { id: 'out_refund', labelAr: 'إشعار دائن عميل', side: 'customer' },
  out_receipt: { id: 'out_receipt', labelAr: 'إيصال عميل', side: 'customer' },
});

/** حالة القيد في أودو — والفرق بين «مرحَّل» و«ملغى» محفوظ (§16.9 ‹660›). */
export const MOVE_STATES = Object.freeze({
  draft: { id: 'draft', labelAr: 'مسوّدة', posted: false },
  posted: { id: 'posted', labelAr: 'مُرحَّل', posted: true },
  cancel: { id: 'cancel', labelAr: 'ملغى', posted: false },
});

/** اتّجاه الدفعة: واردٌ تحصيل، وصادرٌ دفع. */
export const PAYMENT_TYPES = Object.freeze({
  inbound: { id: 'inbound', labelAr: 'تحصيل من عميل' },
  outbound: { id: 'outbound', labelAr: 'دفع لمورّد' },
});

export function moveKind(moveType) {
  return MOVE_KINDS[str(moveType)] ?? MOVE_KINDS.entry;
}

export function moveState(state) {
  return MOVE_STATES[str(state)] ?? MOVE_STATES.draft;
}

/* ─────────────────────────── المطابقات ─────────────────────────── */

/**
 * حسابٌ من شجرة الحسابات.
 * لا يُخترع كودٌ ولا اسمٌ ولا تصنيف — ما لا يعطيه أودو يبقى فارغًا (§16.4 ‹549›).
 */
export function accountFromOdoo(rec = {}) {
  return {
    odooId: rec.id ?? null,
    code: str(rec.code),
    name: str(rec.name),
    accountType: str(rec.account_type),
    reconcile: Boolean(rec.reconcile),
    deprecated: Boolean(rec.deprecated),
    companyId: relId(rec.company_id),
    company: relName(rec.company_id),
    currency: relName(rec.currency_id),
  };
}

/**
 * قيدٌ أو فاتورة — نموذجٌ واحد بنوعين.
 *
 * `residual` هو **الرصيد المفتوح** الذي تطلبه §16.17 ‹765›: مبلغٌ لم يُسدَّد
 * بعد. مستوردٌ من أودو لا محسوبٌ عندنا — فالتسوية سلطته لا سلطتنا.
 */
export function moveFromOdoo(rec = {}) {
  const kind = moveKind(rec.move_type);
  const state = moveState(rec.state);
  const total = num(rec.amount_total);
  const residual = num(rec.amount_residual);
  return {
    odooId: rec.id ?? null,
    number: str(rec.name),
    ref: str(rec.ref),
    kind: kind.id,
    kindLabel: kind.labelAr,
    side: kind.side,
    state: state.id,
    stateLabel: state.labelAr,
    posted: state.posted,
    date: str(rec.date),
    invoiceDate: str(rec.invoice_date),
    dueDate: str(rec.invoice_date_due),
    partnerId: relId(rec.partner_id),
    partner: relName(rec.partner_id),
    journal: relName(rec.journal_id),
    currency: relName(rec.currency_id),
    total,
    residual,
    settled: Math.round((total - residual) * 1e6) / 1e6,
    // مستند العكس إن وُجد — §16.9 ‹660›: التصحيح بقيدٍ عكسيّ لا بتعديل.
    reversedOfId: relId(rec.reversed_entry_id),
    reversedOf: relName(rec.reversed_entry_id),
    // أصل السلسلة: يربط الفاتورة بالمستند التشغيليّ (§16.3 ‹496›).
    origin: str(rec.invoice_origin),
  };
}

/** سطر حسابٍ داخل قيد. */
export function moveLineFromOdoo(rec = {}) {
  const debit = num(rec.debit);
  const credit = num(rec.credit);
  return {
    odooId: rec.id ?? null,
    moveId: relId(rec.move_id),
    moveNumber: relName(rec.move_id),
    accountId: relId(rec.account_id),
    account: relName(rec.account_id),
    partnerId: relId(rec.partner_id),
    partner: relName(rec.partner_id),
    label: str(rec.name),
    debit,
    credit,
    balance: num(rec.balance) || Math.round((debit - credit) * 1e6) / 1e6,
    date: str(rec.date),
    currency: relName(rec.currency_id),
  };
}

/** دفعةٌ أو تحصيل. */
export function paymentFromOdoo(rec = {}) {
  const type = PAYMENT_TYPES[str(rec.payment_type)] ?? PAYMENT_TYPES.outbound;
  return {
    odooId: rec.id ?? null,
    number: str(rec.name),
    direction: type.id,
    directionLabel: type.labelAr,
    partnerType: str(rec.partner_type),
    partnerId: relId(rec.partner_id),
    partner: relName(rec.partner_id),
    amount: num(rec.amount),
    currency: relName(rec.currency_id),
    date: str(rec.date),
    state: str(rec.state),
    journal: relName(rec.journal_id),
  };
}

/* ─────────────────────────── الرقابة ─────────────────────────── */

/**
 * توازن القيد — §16.9 ‹647›.
 *
 * يُعلن الاختلال ولا يُصلحه. والفارق يُعاد كما هو كي يظهر في الواجهة رقمًا
 * لا تحذيرًا مبهمًا.
 */
export function moveBalance(lines = []) {
  const rows = Array.isArray(lines) ? lines : [];
  const debit = rows.reduce((s, l) => s + num(l.debit), 0);
  const credit = rows.reduce((s, l) => s + num(l.credit), 0);
  const diff = Math.round((debit - credit) * 1e6) / 1e6;
  return { debit, credit, diff, balanced: diff === 0, lines: rows.length };
}

/**
 * تجميع الأسطر بقيدها — لعرض «الأثر المالي» لمستندٍ واحد.
 * @returns {Map<string, object[]>}
 */
export function linesByMove(lines = []) {
  const map = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = str(line?.moveNumber) || String(line?.moveId ?? '');
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(line);
  }
  return map;
}

/**
 * أرصدة الطرف المفتوحة — §16.17 ‹762-770›.
 *
 * يجمع من القيود المرحَّلة وحدها: المسوّدة لا تُنشئ التزامًا، والملغاة لا
 * تبقى. ولا يُخصم شيءٌ لم يُرحَّل.
 */
export function partnerOpenBalances(moves = []) {
  const map = new Map();
  for (const m of Array.isArray(moves) ? moves : []) {
    if (!m?.posted || !m.partner) continue;
    const key = m.partner;
    if (!map.has(key)) {
      map.set(key, { partner: key, partnerId: m.partnerId ?? null, vendor: 0, customer: 0, open: 0, count: 0 });
    }
    const row = map.get(key);
    row.count += 1;
    row.open = Math.round((row.open + num(m.residual)) * 1e6) / 1e6;
    if (m.side === 'vendor') row.vendor = Math.round((row.vendor + num(m.residual)) * 1e6) / 1e6;
    if (m.side === 'customer') row.customer = Math.round((row.customer + num(m.residual)) * 1e6) / 1e6;
  }
  return [...map.values()].sort((a, b) => Math.abs(b.open) - Math.abs(a.open));
}

/**
 * الحسابات في شكل شجرة — §16.4 ‹516›.
 *
 * أودو لا يعطي أبًا صريحًا لكلّ حساب، لكنّ **الكود نفسه هرميّ**: `1` أصول،
 * `11` نقد، `1101` صندوق. فالتشجير بالبادئة أصدق من اختراع أبٍ غير موجود.
 */
export function accountTree(accounts = []) {
  const rows = [...(Array.isArray(accounts) ? accounts : [])]
    .filter((a) => a?.code)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return rows.map((a) => {
    const code = String(a.code);
    const parent = rows
      .filter((p) => p.code !== code && code.startsWith(String(p.code)))
      .sort((x, y) => String(y.code).length - String(x.code).length)[0];
    return { ...a, parentCode: parent ? String(parent.code) : null, level: parent ? String(parent.code).length : 0 };
  });
}
