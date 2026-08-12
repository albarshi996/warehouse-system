/**
 * دفتر الذمم — من له علينا ومن علينا له (م٤-ج · يسدّ ف‑١).
 *
 * ═══ العطب ═══
 * `accountBalance` لقطةٌ مستوردة من إكسل: رقمٌ بلا سطور، لا يقول متى نشأ ولا
 * ممّ تكوّن ولا ما الذي أقفله. فإن اختلف مع المورّد على مئة دينار لم يكن في
 * النظام ما يُحتجّ به.
 *
 * ═══ جدول القواعد لا شيفرةٌ متفرّقة ═══
 * على نسق `POSTING_RULES` تمامًا: السؤال «ما الأثر الماليّ لهذا المستند؟» يُجاب
 * من مكانٍ واحد يُقرأ في دقيقة. وإضافة نوعٍ جديد سطرٌ هنا لا جراحة.
 *
 * ═══ ملحق فقط ═══
 * السطر يُكتب ولا يُعدَّل ولا يُحذف. والتصحيح **قيدٌ مضادّ** لا محوٌ للقديم —
 * فدفترٌ يُمحى منه سطرٌ ليس دفترًا بل مسوّدة.
 *
 * ═══ ما ليس هذا ═══
 * ليس محرّك قيودٍ مزدوج (القرار ٢: أودو يولّد القيد). هذا **دفتر ذمم شركاء**
 * وحده: كم لهذا العميل وكم على ذاك المورّد، وبأيّ مستندٍ نشأ وبأيّ أُقفل.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

const num = (v) => Number(v) || 0;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/** طرفا الدفتر. */
export const PARTIES = Object.freeze({
  customer: { id: 'customer', label: 'عميل', debitLabel: 'مدين علينا له', sign: +1 },
  supplier: { id: 'supplier', label: 'مورّد', debitLabel: 'دائن له علينا', sign: -1 },
});

/**
 * جدول الأثر الماليّ: أيّ مستندٍ يُقيَّد، ولأيّ طرف، وبأيّ اتّجاه.
 *
 * `direction`:
 *   `debit`  — يزيد ما على الطرف (فاتورةٌ على عميل · بضاعةٌ استُلمت من مورّد)
 *   `credit` — ينقصه (قبضٌ من عميل · سدادٌ لمورّد · مرتجع)
 *
 * `amount(doc)` يقرأ المبلغ من المستند نفسه — فلا يُخزَّن مجموعٌ ينحرف عن بنوده.
 */
export const LEDGER_RULES = Object.freeze({
  /* ── ذمم العملاء (مدينون) ── */
  INV: {
    party: 'customer',
    direction: 'debit',
    labelAr: 'فاتورة بيع',
    amount: (d) => sumLines(d, ['lineTotal', 'amount', 'total'], true),
  },
  VSI: {
    party: 'customer',
    direction: 'debit',
    labelAr: 'بيع من المركبة',
    amount: (d) => sumSales(d),
  },
  VCS: { party: 'customer', direction: 'debit', labelAr: 'تحقّق بيع أمانة', amount: (d) => sumSales(d) },
  RCP: { party: 'customer', direction: 'credit', labelAr: 'سند قبض', amount: (d) => sumLines(d, ['amount']) },
  // التحصيل الميدانيّ (م٥-أ): ينقص ذمّة العميل كالقبض — والفرق أنّ المال يبقى
  // في عهدة المندوب حتّى الإيداع، وذاك أثرٌ على حسابه لا على ذمّة العميل.
  RCV: { party: 'customer', direction: 'credit', labelAr: 'تحصيل ميدانيّ', amount: (d) => sumLines(d, ['amount']) },
  CN: { party: 'customer', direction: 'credit', labelAr: 'إشعار دائن', amount: (d) => sumLines(d, ['lineTotal', 'amount', 'total'], true) },
  RET: { party: 'customer', direction: 'credit', labelAr: 'مرتجع مبيعات', amount: (d) => sumSales(d) },
  CRN: { party: 'customer', direction: 'credit', labelAr: 'مرتجع ميدانيّ', amount: (d) => sumSales(d) },

  /* ── ذمم الموردين (دائنون) ── */
  GRN: { party: 'supplier', direction: 'debit', labelAr: 'استلام بضاعة', amount: (d) => sumReceipt(d) },
  SPV: { party: 'supplier', direction: 'credit', labelAr: 'سداد مورّد', amount: (d) => sumLines(d, ['amount']) },
  SRN: { party: 'supplier', direction: 'credit', labelAr: 'رفض استلام', amount: (d) => sumReceipt(d) },
});

/** مجموع عمودٍ ماليٍّ من البنود — أوّل مفتاحٍ موجود يفوز. */
function sumLines(doc, keys, computeFromQty = false) {
  return money(
    (doc?.lines || []).reduce((total, line) => {
      for (const k of keys) {
        if (line?.[k] != null && line[k] !== '') return total + num(line[k]);
      }
      if (computeFromQty) return total + num(line?.qty) * num(line?.unitPrice);
      return total;
    }, 0)
  );
}

/** مجموع بيعٍ: (كمّيّة × سعر) ناقص الخصم. */
function sumSales(doc) {
  return money(
    (doc?.lines || []).reduce(
      (total, l) => total + Math.max(0, num(l?.qty) * num(l?.unitPrice) - num(l?.discount)),
      0
    )
  );
}

/** مجموع استلام: المقبول × الكلفة. المرفوض لا يُذمّ به المورّد. */
function sumReceipt(doc) {
  return money(
    (doc?.lines || []).reduce((total, l) => {
      const qty = num(l?.qtyAccepted ?? l?.qtyReceived ?? l?.qtyRejected ?? l?.qty);
      return total + qty * num(l?.unitCost ?? l?.unitPrice);
    }, 0)
  );
}

/** هل لهذا المستند أثرٌ في دفتر الذمم؟ */
export function ledgerRuleFor(type) {
  return LEDGER_RULES[type] || null;
}

/** رمز الطرف من رأس المستند — العميل برمزه والمورّد برمزه أو باسمه. */
export function partyCodeOf(doc, party) {
  const h = doc?.header || {};
  if (party === 'customer') return up(h.customerCode || h.payer || h.customer);
  return up(h.supplierCode || h.supplier);
}

/**
 * سطر دفترٍ من مستند، أو `null` إن لم يكن له أثر.
 * المعرّف حتميّ (`نوع__معرّف`) فإعادة القيد تكتب فوق نفسها ولا تُضاعف —
 * نفس ضمانة دفتر المخزون.
 */
export function entryFor(doc) {
  const rule = ledgerRuleFor(doc?.type);
  if (!rule) return null;

  const code = partyCodeOf(doc, rule.party);
  if (!code) return null; // بلا طرفٍ لا ذمّة — ولا نخترع طرفًا

  const amount = money(rule.amount(doc));
  if (amount <= 0) return null; // صفرٌ ليس ذمّة

  return {
    id: `${doc.type}__${str(doc.id)}`,
    party: rule.party,
    partyCode: code,
    partyName: str(doc.header?.customer || doc.header?.payer || doc.header?.supplier) || code,
    docType: doc.type,
    docId: str(doc.id),
    docNumber: str(doc.number),
    // `collectionDate` تاريخ التحصيل الميدانيّ (RCV) — غيابه هنا كان يكتب قيد
    // التحصيل بتاريخٍ فارغ فيتقدّم كلُّ سدادٍ على فاتورته في ترتيب الكشف.
    date: str(doc.header?.invoiceDate || doc.header?.receiptDate || doc.header?.paymentDate || doc.header?.collectionDate || doc.header?.saleDate || doc.header?.receivedAt || doc.header?.returnDate || doc.header?.issueDate).slice(0, 10),
    dueDate: str(doc.header?.dueDate).slice(0, 10),
    direction: rule.direction,
    labelAr: rule.labelAr,
    amount,
    // موجبٌ يزيد ما على الطرف، وسالبٌ ينقصه — والاتّجاه صريحٌ فوقه.
    delta: rule.direction === 'debit' ? amount : -amount,
    // ما قاصّه هذا السند من مستنداتٍ أخرى (بنود سندَي القبض والسداد).
    allocations: (doc?.lines || [])
      .filter((l) => str(l?.invoiceRef || l?.docRef) && num(l?.amount) > 0)
      .map((l) => ({ ref: str(l.invoiceRef || l.docRef), amount: money(num(l.amount)) })),
  };
}

/** سطور دفترٍ من مجموعة مستندات — المنجَزة والمعتمَدة وحدها. */
export function entriesFrom(documents = [], { states = ['done', 'approved'] } = {}) {
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state))
    .map(entryFor)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * كشف حساب طرفٍ واحد: السطور بالرصيد المتراكم.
 * الرصيد الافتتاحيّ يُمرَّر صراحةً — فما استُورد من إكسل نقطةُ بدايةٍ لا حقيقة
 * جارية، ولا يُخلط بما وُلد في النظام.
 */
export function statement(entries = [], { partyCode = '', opening = 0 } = {}) {
  const code = up(partyCode);
  let running = money(opening);
  const rows = entries
    .filter((e) => !code || e.partyCode === code)
    .map((e) => {
      running = money(running + e.delta);
      return { ...e, balance: running };
    });
  const debit = money(rows.filter((r) => r.direction === 'debit').reduce((s, r) => s + r.amount, 0));
  const credit = money(rows.filter((r) => r.direction === 'credit').reduce((s, r) => s + r.amount, 0));
  return {
    opening: money(opening),
    rows,
    debit,
    credit,
    closing: running,
    // المتبقّي يطابق مجموع السطور — معيار الإتمام في الخطة، ويُثبت لا يُقال.
    balanced: money(money(opening) + debit - credit) === running,
  };
}

/** أرصدة كلّ الأطراف — لشاشةٍ واحدة تعرض من عليه ومن له. */
export function balances(entries = [], { openings = {} } = {}) {
  const map = new Map();
  for (const e of entries) {
    const prev = map.get(e.partyCode) || {
      partyCode: e.partyCode,
      partyName: e.partyName,
      party: e.party,
      balance: money(openings[e.partyCode] || 0),
      entries: 0,
      lastDate: '',
    };
    prev.balance = money(prev.balance + e.delta);
    prev.entries += 1;
    if (e.date > prev.lastDate) prev.lastDate = e.date;
    map.set(e.partyCode, prev);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

/** شرائح أعمار الديون الخمس (نصّ الخطة). */
export const AGING_BUCKETS = [
  { key: 'current', label: 'جارٍ (لم يستحقّ)', from: -Infinity, to: 0 },
  { key: 'd1_30', label: '١–٣٠ يومًا', from: 1, to: 30 },
  { key: 'd31_60', label: '٣١–٦٠ يومًا', from: 31, to: 60 },
  { key: 'd61_90', label: '٦١–٩٠ يومًا', from: 61, to: 90 },
  { key: 'over90', label: 'أكثر من ٩٠ يومًا', from: 91, to: Infinity },
];

/** أيّ شريحةٍ يقع فيها دَينٌ عمرُه كذا يومًا بعد الاستحقاق؟ */
export function bucketOf(daysOverdue) {
  const d = Number(daysOverdue);
  if (!Number.isFinite(d)) return 'current';
  return AGING_BUCKETS.find((b) => d >= b.from && d <= b.to)?.key || 'over90';
}

/**
 * أعمار الديون: توزيع المدين غير المسدَّد على الشرائح الخمس.
 *
 * **المقاصّة أوّلًا:** يُطبَّق الدائن على المدين **بالأقدم أوّلًا** (FIFO) —
 * فمن دفع ألفًا سدّد أقدم فاتورةٍ لا أحدثها، وإلّا ظهر دَينٌ قديمٌ لم يعد قائمًا.
 *
 * @param {string} today اليوم بختم الخادم — لا يُقرأ من ساعة الجهاز
 */
export function aging(entries = [], today = '') {
  const day = str(today).slice(0, 10);
  const byParty = new Map();

  for (const e of entries) {
    const bag = byParty.get(e.partyCode) || { partyCode: e.partyCode, partyName: e.partyName, party: e.party, open: [], credit: 0 };
    if (e.direction === 'debit') bag.open.push({ ...e, remaining: e.amount });
    else bag.credit = money(bag.credit + e.amount);
    byParty.set(e.partyCode, bag);
  }

  const out = [];
  for (const bag of byParty.values()) {
    bag.open.sort((a, b) => a.date.localeCompare(b.date)); // الأقدم أوّلًا
    let credit = bag.credit;
    for (const row of bag.open) {
      if (credit <= 0) break;
      const applied = Math.min(credit, row.remaining);
      row.remaining = money(row.remaining - applied);
      credit = money(credit - applied);
    }

    const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0]));
    let total = 0;
    for (const row of bag.open) {
      if (row.remaining <= 0) continue;
      const due = row.dueDate || row.date;
      const daysOverdue = day && due ? Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000) : 0;
      buckets[bucketOf(daysOverdue)] = money(buckets[bucketOf(daysOverdue)] + row.remaining);
      total = money(total + row.remaining);
    }

    // فائضُ الدائن بعد سداد كلّ المدين: دفعةٌ مقدَّمة لا دَين.
    out.push({ ...bag, buckets, total, advance: money(credit), open: undefined });
  }
  return out.sort((a, b) => b.total - a.total);
}

/**
 * التصفير: إقفال رصيدٍ بمقاصّةٍ موثّقة **بلا حذف ولا تعديل للتاريخ**.
 * يُعيد سطرًا مضادًّا يُلحَق بالدفتر — لا أمرًا بمحو ما سبق.
 */
export function closeoutEntry({ partyCode, party, partyName, balance, reason, date, byName }) {
  const amount = money(Math.abs(balance));
  if (amount <= 0) return null;
  return {
    id: `CLOSEOUT__${up(partyCode)}__${str(date)}`,
    party,
    partyCode: up(partyCode),
    partyName: str(partyName) || up(partyCode),
    docType: 'CLOSEOUT',
    docId: '',
    docNumber: '',
    date: str(date).slice(0, 10),
    dueDate: '',
    direction: balance > 0 ? 'credit' : 'debit',
    labelAr: 'تصفير موثّق',
    amount,
    delta: balance > 0 ? -amount : amount,
    allocations: [],
    reason: str(reason),
    byName: str(byName),
  };
}

/**
 * الرصيد المفتوح لكلّ فاتورةٍ على حدة (CC-302).
 *
 * `aging` يقاصّ على مستوى الطرف بالأقدم أوّلًا — وهذا صحيحٌ للأعمار، لكنّ
 * التحصيل الميدانيّ يوزَّع على فواتير بعينها (`allocations`)، وكانت تُكتب
 * ولا يقرؤها أحد. هنا القارئ: المدين يُجمع برقم مستنده، وكلّ مقاصّةٍ
 * دائنة تُطرح من فاتورتها المسمّاة — فيُعرف المفتوح فاتورةً فاتورة،
 * ويُمسك التحصيل الزائد قبل أن تُسمّيه الأعمار «دفعةً مقدَّمة».
 *
 * @param {Array}  entries سطور الدفتر (من `entriesFrom`)
 * @param {string} partyCode رمز الطرف — تُحسب فواتيره وحده
 * @returns {Array<{ref:string, total:number, paid:number, remaining:number}>}
 */
export function invoiceOutstanding(entries = [], partyCode = '') {
  const code = up(partyCode);
  if (!code) return [];
  const byRef = new Map();

  for (const e of entries) {
    if (up(e?.partyCode) !== code) continue;
    if (e.direction === 'debit') {
      const ref = str(e.docNumber) || str(e.docId);
      if (!ref) continue;
      const row = byRef.get(ref) || { ref, total: 0, paid: 0 };
      row.total = money(row.total + e.amount);
      byRef.set(ref, row);
    } else {
      for (const a of e.allocations || []) {
        const ref = str(a?.ref);
        if (!ref) continue;
        const row = byRef.get(ref) || { ref, total: 0, paid: 0 };
        row.paid = money(row.paid + (Number(a?.amount) || 0));
        byRef.set(ref, row);
      }
    }
  }

  return [...byRef.values()]
    .map((row) => ({ ...row, remaining: money(row.total - row.paid) }))
    .sort((a, b) => a.ref.localeCompare(b.ref, 'ar'));
}

/**
 * حارس تجاوز التحصيل: بنود سندٍ (RCV/RCP) تتجاوز المفتوحَ لفواتيرها المسمّاة.
 * دالّة خالصة تُغذّى بالمفتوح المحسوب أعلاه وتعيد مشاكل بصيغة نصّية —
 * فارغُ المرجع لا يُحاكَم هنا (له تحذيره في المخطّط)، والفاتورة المجهولة
 * تُسمّى مشكلةً لأنّ توزيعًا على ما لا وجود له مالٌ بلا وجهة.
 */
export function overCollectionProblems(doc, outstanding = []) {
  const open = new Map((outstanding || []).map((row) => [str(row.ref), row]));
  const problems = [];
  for (const [i, line] of (doc?.lines || []).entries()) {
    const ref = str(line?.invoiceRef || line?.docRef);
    const amount = num(line?.amount);
    if (!ref || amount <= 0) continue;
    const row = open.get(ref);
    if (!row) {
      problems.push(`البند ${i + 1}: الفاتورة «${ref}» لا مدينَ مفتوحًا لها في دفتر هذا العميل`);
      continue;
    }
    if (amount - row.remaining > 0.009) {
      problems.push(
        `البند ${i + 1}: التحصيل ${amount} يتجاوز المفتوح ${row.remaining} للفاتورة «${ref}»`
      );
    }
  }
  return problems;
}
