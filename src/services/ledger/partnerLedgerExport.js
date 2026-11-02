/**
 * نماذجُ مؤشّرِ المديونيّة وتصديرِها (طلب المالك 2026-11-02).
 *
 * المالكُ أراد ثلاثًا على الذمم: **مؤشّرَ متابعةٍ** يجمع ما له وما عليه والمتأخّر،
 * و**تصديرَ إكسل منظّمٍ وPDF** لا كشفًا مسطّحًا بـCSV. والمنطقُ القائمُ كافٍ
 * (`balances`·`aging`·`reminders`·`statement` في [[partnerLedger]]) — فهذا الملفُّ
 * **تجميعٌ وتشكيلٌ** لا حسابٌ جديد: دوالُّ خالصةٌ تُختبر وحدها، والشاشةُ والمصدّرُ
 * يستدعيانها لا يُعيدان بناءها.
 *
 * ★ لا يستورد xlsx ولا DOM: يُعيد نماذجَ بيانات (مصفوفاتٍ ومجاميع)، فالتصديرُ
 *   الفعليّ (exportAoaSheets · exportElementToPdf) يبقى في الشاشة. فيُختبَر الخرجُ
 *   في Node بلا متصفّح.
 *
 * منطق خالص: بلا Firestore وبلا DOM وبلا شبكة.
 */
import { balances, aging, reminders, statement, AGING_BUCKETS } from './partnerLedger.js';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.009; // عتبةُ الصفر: ما دونها رصيدٌ مقفلٌ لا دَين.

/**
 * المستحقُّ لنا مقابل المستحقِّ علينا — **بحسب نوع الطرف لا بإشارة الرصيد وحدها**.
 *
 * ★★★ `balances` تجمع `delta` بلا تطبيق إشارة الطرف: فرصيدُ العميل الموجبُ دَينٌ
 * لنا (فاتورةٌ مدينة)، لكنّ رصيدَ المورّد الموجبَ دَينٌ **علينا** (استلامٌ يزيد ما
 * نَدينه). فلو قسمنا بالإشارة وحدها عُدَّ ما نَدينه للمورّد «لنا» — خطأٌ يقلب
 * المؤشّر. فالقاعدة: للعميل والعامل الموجبُ لنا، وللمورّد الموجبُ علينا.
 */
function receivableSignFor(party) {
  return party === 'supplier' ? -1 : 1;
}

/**
 * مؤشّرُ متابعة المديونيّة لمجموعةِ سطورٍ (طرفٌ واحد عادةً، كما تُرشّحه الشاشة).
 *
 * `receivable` المستحقُّ لنا و`payable` المستحقُّ علينا — مُصنَّفان بنوع الطرف
 * (انظر `receivableSignFor`). والمتأخّر/المقترب من `reminders` نفسِها فلا يتباعد
 * المؤشّرُ عن طبقة التذكير في الشاشة.
 *
 * @param {Array}  entries سطور الدفتر (من `entriesFrom`)
 * @param {string} today   اليوم بختم الخادم — لا ساعةُ الجهاز (دالّةٌ خالصة)
 * @param {{soonDays?:number}} opts نافذةُ «يقترب»
 */
export function debtSummary(entries = [], today = '', { soonDays = 7 } = {}) {
  const bal = balances(entries);
  const rem = reminders(entries, today, { soonDays });

  let receivable = 0; // لنا
  let payable = 0; // علينا
  let receivableParties = 0;
  let payableParties = 0;
  for (const b of bal) {
    const signed = b.balance * receivableSignFor(b.party); // موجبٌ ⟶ لنا، سالبٌ ⟶ علينا
    if (signed > EPS) {
      receivable = money(receivable + signed);
      receivableParties += 1;
    } else if (signed < -EPS) {
      payable = money(payable + -signed);
      payableParties += 1;
    }
  }

  const overdue = money(rem.reduce((s, r) => s + r.overdue, 0));
  const soon = money(rem.reduce((s, r) => s + r.soon, 0));
  const nextDue = rem.map((r) => r.nextDue).filter(Boolean).sort()[0] || '';
  // أقربُ استحقاقٍ **لكلّ حالةٍ على حدة**: `nextDue` العامّ قد يكون تاريخًا ماضيًا
  // (متأخّرًا)، فعرضُه في بطاقة «يقترب» يُضلّل. فنفصل أقربَ المقترب عن أقرب المتأخّر.
  const items = rem.flatMap((r) => r.items || []);
  const soonNextDue = items.filter((i) => i.status === 'soon').map((i) => i.dueDate).filter(Boolean).sort()[0] || '';
  const overdueNextDue = items.filter((i) => i.status === 'overdue').map((i) => i.dueDate).filter(Boolean).sort()[0] || '';

  return {
    receivable,
    payable,
    net: money(receivable - payable),
    parties: bal.length,
    receivableParties,
    payableParties,
    overdue,
    soon,
    overdueParties: rem.filter((r) => r.overdue > EPS).length,
    soonParties: rem.filter((r) => r.soon > EPS).length,
    nextDue,
    soonNextDue,
    overdueNextDue,
  };
}

/**
 * نموذجُ التقرير الكامل (للعرض وللـPDF) — بنيةٌ خالصةٌ لا DOM.
 * الشاشةُ تبنيه عنصرًا وتمرّره إلى `exportElementToPdf` (الذي يرفض النصّ).
 *
 * @param {Array}  entries
 * @param {string} today
 * @param {{soonDays?:number, partyLabel?:string, partyCode?:string}} opts
 */
export function ledgerReportModel(entries = [], today = '', { soonDays = 7, partyLabel = '', partyCode = '' } = {}) {
  const summary = debtSummary(entries, today, { soonDays });
  const rem = reminders(entries, today, { soonDays });
  const bal = balances(entries);
  const age = aging(entries, today);
  const ageByCode = new Map(age.map((a) => [a.partyCode, a]));

  const balanceRows = bal.map((r) => ({
    partyName: r.partyName,
    partyCode: r.partyCode,
    balance: r.balance,
    buckets: ageByCode.get(r.partyCode)?.buckets || Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0])),
    lastDate: r.lastDate,
  }));

  const code = String(partyCode || '').toUpperCase();
  const view = code ? statement(entries, { partyCode: code }) : null;

  return {
    title: 'مؤشّرُ متابعة المديونيّة وكشوف الحساب',
    partyLabel: String(partyLabel || ''),
    today: String(today || '').slice(0, 10),
    soonDays,
    summary,
    reminderRows: rem.map((r) => ({
      partyName: r.partyName,
      partyCode: r.partyCode,
      overdue: r.overdue,
      soon: r.soon,
      nextDue: r.nextDue,
    })),
    balanceRows,
    statement: view
      ? {
          partyName: view.rows[0]?.partyName || code,
          partyCode: code,
          opening: view.opening,
          debit: view.debit,
          credit: view.credit,
          closing: view.closing,
          balanced: view.balanced,
          rows: view.rows.map((r) => ({
            date: r.date,
            docNumber: r.docNumber,
            labelAr: r.labelAr,
            debit: r.direction === 'debit' ? r.amount : '',
            credit: r.direction === 'credit' ? r.amount : '',
            dueDate: r.dueDate || '',
            balance: r.balance,
          })),
        }
      : null,
  };
}

/**
 * أوراقُ إكسل منظّمة (array-of-arrays) جاهزةٌ لـ`exportAoaSheets` — منظّمٌ لا مسطّح:
 * ورقةُ **المؤشّر** ثمّ **التذكير** ثمّ **الأرصدة والأعمار**، وكشفُ الطرف إن اختير.
 *
 * @returns {{name:string, aoa:Array<Array>}[]}
 */
export function ledgerExcelSheets(entries = [], today = '', opts = {}) {
  const { soonDays = 7, partyLabel = '' } = opts;
  const m = ledgerReportModel(entries, today, opts);
  const s = m.summary;

  const summarySheet = {
    name: 'المؤشّر',
    aoa: [
      ['مؤشّرُ متابعة المديونيّة', partyLabel],
      ['بتاريخ', m.today],
      [],
      ['المستحقُّ لنا', s.receivable, `${s.receivableParties} طرفًا`],
      ['المستحقُّ علينا', s.payable, `${s.payableParties} طرفًا`],
      ['الصافي', s.net],
      ['عددُ الأطراف', s.parties],
      [],
      ['المتأخّرُ عن الاستحقاق', s.overdue, `${s.overdueParties} طرفًا`],
      [`يستحقُّ خلال ${soonDays} يومًا`, s.soon, `${s.soonParties} طرفًا`],
      ['أقربُ استحقاق', s.nextDue],
    ],
  };

  const reminderSheet = {
    name: 'التذكير',
    aoa: [
      ['الطرف', 'الرمز', 'متأخّر', 'يقترب', 'أقربُ استحقاق'],
      ...m.reminderRows.map((r) => [r.partyName, r.partyCode, r.overdue, r.soon, r.nextDue]),
    ],
  };

  const balancesSheet = {
    name: 'الأرصدة والأعمار',
    aoa: [
      ['الطرف', 'الرمز', 'الرصيد', ...AGING_BUCKETS.map((b) => b.label), 'آخرُ حركة'],
      ...m.balanceRows.map((r) => [
        r.partyName,
        r.partyCode,
        r.balance,
        ...AGING_BUCKETS.map((b) => r.buckets[b.key] || 0),
        r.lastDate,
      ]),
    ],
  };

  const sheets = [summarySheet, reminderSheet, balancesSheet];

  if (m.statement) {
    sheets.push({
      name: `كشف ${m.statement.partyCode}`.slice(0, 31),
      aoa: [
        [`كشفُ حساب — ${m.statement.partyName}`],
        ['افتتاحيّ', m.statement.opening, 'مدين', m.statement.debit, 'دائن', m.statement.credit, 'المتبقّي', m.statement.closing],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين', 'دائن', 'الاستحقاق', 'الرصيد'],
        ...m.statement.rows.map((r) => [r.date, r.docNumber, r.labelAr, r.debit, r.credit, r.dueDate, r.balance]),
      ],
    });
  }

  return sheets;
}
