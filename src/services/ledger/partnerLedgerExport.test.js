/**
 * اختباراتُ مؤشّرِ المديونيّة ونماذجِ تصديرها (طلب المالك 2026-11-02).
 * خالصةٌ: تبني سطورَ دفترٍ بشكل `entryFor` مباشرةً وتقيس المجاميعَ والأوراق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { debtSummary, ledgerExcelSheets, ledgerReportModel } from './partnerLedgerExport.js';

/** سطرُ دفترٍ بشكل `entryFor` — delta مشتقٌّ من الاتّجاه كما في المصدر. */
function mk(o) {
  return {
    id: `${o.docType}__${o.docId}`,
    party: o.party,
    partyCode: o.partyCode,
    partyName: o.partyName || o.partyCode,
    docType: o.docType,
    docId: o.docId,
    docNumber: o.docNumber,
    date: o.date,
    dueDate: o.dueDate || '',
    direction: o.direction,
    labelAr: o.labelAr || '',
    amount: o.amount,
    delta: o.direction === 'debit' ? o.amount : -o.amount,
    allocations: o.allocations || [],
  };
}

const TODAY = '2026-11-02';

const CUSTOMERS = [
  mk({ party: 'customer', partyCode: 'A', partyName: 'عميل أ', docType: 'INV', docId: 'a', docNumber: 'INV-1', date: '2026-09-20', dueDate: '2026-10-01', direction: 'debit', amount: 1000 }),
  mk({ party: 'customer', partyCode: 'B', partyName: 'عميل ب', docType: 'INV', docId: 'b', docNumber: 'INV-2', date: '2026-10-30', dueDate: '2026-11-05', direction: 'debit', amount: 500 }),
  mk({ party: 'customer', partyCode: 'B', partyName: 'عميل ب', docType: 'RCP', docId: 'r', docNumber: 'RCP-1', date: '2026-11-01', direction: 'credit', amount: 200 }),
];

test('★★ مؤشّرُ المديونيّة: المستحقُّ لنا والمتأخّر والمقترب — بمقاصّة الأقدم', () => {
  const s = debtSummary(CUSTOMERS, TODAY, { soonDays: 7 });
  assert.equal(s.receivable, 1300, 'A=1000 + B=(500−200)=300');
  assert.equal(s.payable, 0);
  assert.equal(s.net, 1300);
  assert.equal(s.parties, 2);
  assert.equal(s.receivableParties, 2);
  assert.equal(s.overdue, 1000, 'A متأخّرةٌ (استحقاقُها قبل اليوم)');
  assert.equal(s.soon, 300, 'B تستحقّ خلال أسبوع بعد خصم القبض');
  assert.equal(s.overdueParties, 1);
  assert.equal(s.soonParties, 1);
  assert.equal(s.nextDue, '2026-10-01', 'أقربُ استحقاقٍ بين الأطراف (عامّ)');
  // أقربُ المقترب تاريخٌ مستقبليّ (B)، لا تاريخُ A الماضي المتأخّر — فلا تُضلَّل بطاقةُ «يقترب».
  assert.equal(s.soonNextDue, '2026-11-05');
  assert.equal(s.overdueNextDue, '2026-10-01');
});

test('★★★ المورّد: رصيدُه الموجبُ دَينٌ علينا لا لنا — التصنيفُ بنوع الطرف لا بالإشارة', () => {
  const suppliers = [
    mk({ party: 'supplier', partyCode: 'S', partyName: 'مورّد', docType: 'GRN', docId: 'g', docNumber: 'GRN-1', date: '2026-10-10', direction: 'debit', amount: 800 }),
    mk({ party: 'supplier', partyCode: 'S', partyName: 'مورّد', docType: 'SPV', docId: 'p', docNumber: 'SPV-1', date: '2026-10-20', direction: 'credit', amount: 300 }),
  ];
  const s = debtSummary(suppliers, TODAY);
  // الرصيدُ +500 لكنّه مورّدٌ: المستحقُّ علينا، لا لنا (العطبُ لو قُسم بالإشارة وحدها).
  assert.equal(s.payable, 500);
  assert.equal(s.payableParties, 1);
  assert.equal(s.receivable, 0);
  assert.equal(s.receivableParties, 0);
  assert.equal(s.net, -500);
});

test('★★ أوراقُ إكسل منظّمة: المؤشّر ثمّ التذكير ثمّ الأرصدة — وكشفُ الطرف إن اختير', () => {
  const sheets = ledgerExcelSheets(CUSTOMERS, TODAY, { soonDays: 7, partyLabel: 'عميل', partyCode: 'B' });
  assert.equal(sheets.length, 4, 'مؤشّر · تذكير · أرصدة · كشف B');
  assert.equal(sheets[0].name, 'المؤشّر');
  assert.equal(sheets[1].name, 'التذكير');
  assert.equal(sheets[2].name, 'الأرصدة والأعمار');
  assert.ok(sheets[3].name.startsWith('كشف'), sheets[3].name);
  // ورقةُ المؤشّر تحمل المستحقَّ لنا = 1300.
  const recRow = sheets[0].aoa.find((r) => r[0] === 'المستحقُّ لنا');
  assert.equal(recRow[1], 1300);
  // ورقةُ التذكير ترويستُها معلومة.
  assert.deepEqual(sheets[1].aoa[0], ['الطرف', 'الرمز', 'متأخّر', 'يقترب', 'أقربُ استحقاق']);
  // كلُّ ورقةٍ aoa غيرُ فارغة.
  for (const sh of sheets) assert.ok(Array.isArray(sh.aoa) && sh.aoa.length > 0, sh.name);
});

test('★ بلا طرفٍ مختار: ثلاثُ أوراقٍ بلا كشف', () => {
  const sheets = ledgerExcelSheets(CUSTOMERS, TODAY, { soonDays: 7 });
  assert.equal(sheets.length, 3);
  assert.ok(!sheets.some((s) => s.name.startsWith('كشف')));
});

test('★ نموذجُ التقرير: الكشفُ null بلا طرف، وكاملٌ معه', () => {
  assert.equal(ledgerReportModel(CUSTOMERS, TODAY).statement, null);
  const m = ledgerReportModel(CUSTOMERS, TODAY, { partyCode: 'B' });
  assert.ok(m.statement, 'كشفُ B موجود');
  assert.equal(m.statement.partyCode, 'B');
  assert.equal(m.statement.closing, 300, 'مدين 500 − دائن 200');
  assert.ok(m.reminderRows.length >= 2);
});

test('★ فارغٌ لا يرمي: مجاميعُ صفرٌ وأوراقٌ بترويساتها', () => {
  const s = debtSummary([], TODAY);
  assert.equal(s.receivable, 0);
  assert.equal(s.payable, 0);
  assert.equal(s.parties, 0);
  const sheets = ledgerExcelSheets([], TODAY);
  assert.equal(sheets.length, 3);
  assert.ok(sheets[1].aoa.length === 1, 'التذكير ترويسةٌ بلا صفوف');
});
