/**
 * الدفترُ المحليّ — مطابقةُ الظلّ (الشريحة الأولى · قرار المالك 2026-10-25).
 *
 * عرضٌ **للقراءة فقط**: يشتقّ القيدَ المزدوجَ من مستندات القبض (RCP) والسداد (SPV)
 * القائمة، ويطابق حركةَ كلّ طرفٍ بدفتر الذمم — فيُرى «صفرُ الفرق» حيًّا. لا يكتب
 * شيئًا، ولا يمسّ أودو ولا دفترَ الذمم. كلُّ الحساب في خدماتٍ خالصةٍ مُختبَرة.
 */
import { useEffect, useMemo, useState } from 'react';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { reconcileLedger } from '../../../services/accounting/reconcile.js';
import { trialBalance } from '../../../services/accounting/reports.js';
import { LEDGER_DOC_TYPES } from '../../../services/accounting/deriveEntries.js';
import { LEDGER_T0 } from '../../../services/accounting/journal.js';
import { accountDef, baseOf } from '../../../services/accounting/accounts.js';

const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PARTY_AR = { customer: 'عميل', supplier: 'مورّد' };

/** اسمُ الحساب عربيًّا: الأساسُ من الدليل، والذمّةُ الفرعيّةُ باسمها ثمّ رمز الطرف. */
function accountLabel(account) {
  const def = accountDef(account);
  const nameAr = def ? def.nameAr : account;
  const party = String(account).includes(':') ? String(account).split(':')[1] : '';
  return party ? `${nameAr} — ${party}` : nameAr;
}

export default function LocalLedgerShadow() {
  const [docs, setDocs] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = listenDocumentsByTypes(
        LEDGER_DOC_TYPES,
        (rows) => {
          setDocs(Array.isArray(rows) ? rows : []);
          setReady(true);
        },
        400
      );
    } catch {
      setReady(true);
    }
    return () => {
      try {
        unsub();
      } catch {
        /* لا شيء */
      }
    };
  }, []);

  const { rows, allMatch, journalErrors } = useMemo(() => reconcileLedger(docs), [docs]);
  const totalLedger = useMemo(() => rows.reduce((s, r) => s + r.ledger, 0), [rows]);
  const totalJournal = useMemo(() => rows.reduce((s, r) => s + r.journal, 0), [rows]);
  const tb = useMemo(() => trialBalance(docs), [docs]);

  return (
    <div dir="rtl" className="text-right">
      <div className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-2 leading-relaxed">
          قيدٌ مزدوجٌ مُشتقٌّ من كامل الدورة المستندية (فاتورة · استلام · قبض · سداد · إشعار · مرتجع)
          منذ حدّ الافتتاح <b>{LEDGER_T0}</b>، ورصيدُ كلّ طرفٍ يُطابَق بدفتر الذمم القائم.
          <b> عرضٌ للقراءة فقط</b> — لا كتابةَ حيّة ولا مساسَ بأودو أو دفتر الذمم.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="الأطراف" value={String(rows.length)} />
        <Stat label="إجمالي أرصدة الذمم" value={fmt(totalLedger)} />
        <Stat label="إجمالي أرصدة القيد" value={fmt(totalJournal)} />
        <div
          className={`rounded-xl p-3 border ${
            allMatch ? 'border-success/30 bg-success/5' : 'border-danger/40 bg-danger/5'
          }`}
        >
          <div className="text-xs text-ink-2 mb-1">حالة المطابقة</div>
          <div className={`text-lg font-bold ${allMatch ? 'text-success' : 'text-danger'}`}>
            {allMatch ? 'مطابقٌ تمامًا' : 'يوجد فرق'}
          </div>
        </div>
      </div>

      {journalErrors.length > 0 && (
        <div className="bg-danger/5 border border-danger/40 rounded-xl p-3 mb-4 text-sm text-danger">
          <b>قيودٌ مرفوضة ({journalErrors.length}):</b>
          <ul className="list-disc pr-5 mt-1 space-y-1">
            {journalErrors.slice(0, 10).map((e, i) => (
              <li key={i}>
                {e.key}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-ink/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy/5 text-ink-2">
            <tr>
              <th className="p-3 text-right font-semibold">الطرف</th>
              <th className="p-3 text-right font-semibold">النوع</th>
              <th className="p-3 text-left font-semibold">رصيد الذمم</th>
              <th className="p-3 text-left font-semibold">رصيد القيد المزدوج</th>
              <th className="p-3 text-left font-semibold">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {!ready && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-2">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {ready && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-2">
                  لا حركاتِ ذممٍ بعد حدّ الافتتاح.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.partyCode} className="border-t border-ink/5">
                <td className="p-3 font-medium text-ink">{r.partyCode}</td>
                <td className="p-3 text-ink-2">{PARTY_AR[r.party] || r.party}</td>
                <td className="p-3 text-left tabular-nums">{fmt(r.ledger)}</td>
                <td className="p-3 text-left tabular-nums">{fmt(r.journal)}</td>
                <td
                  className={`p-3 text-left tabular-nums font-semibold ${
                    r.diff === 0 ? 'text-ink-2' : 'text-danger'
                  }`}
                >
                  {fmt(r.diff)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-ink">ميزانُ المراجعة</h3>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-lg border ${
              tb.balanced
                ? 'border-success/30 bg-success/5 text-success'
                : 'border-danger/40 bg-danger/5 text-danger'
            }`}
          >
            {tb.balanced ? 'متوازنٌ — مجموعُ الأرصدة = 0.00' : 'غيرُ متوازن'}
          </span>
        </div>
        <div className="bg-white border border-ink/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy/5 text-ink-2">
              <tr>
                <th className="p-3 text-right font-semibold">الحساب</th>
                <th className="p-3 text-left font-semibold">مدين</th>
                <th className="p-3 text-left font-semibold">دائن</th>
                <th className="p-3 text-left font-semibold">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {!ready && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-ink-2">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}
              {ready && tb.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-ink-2">
                    لا قيودَ بعد حدّ الافتتاح.
                  </td>
                </tr>
              )}
              {tb.rows.map((r) => (
                <tr key={r.account} className="border-t border-ink/5">
                  <td className="p-3 text-ink">
                    {accountLabel(r.account)}
                    <span className="text-ink-2 text-xs"> ({baseOf(r.account)})</span>
                  </td>
                  <td className="p-3 text-left tabular-nums">{r.debit ? fmt(r.debit) : '—'}</td>
                  <td className="p-3 text-left tabular-nums">{r.credit ? fmt(r.credit) : '—'}</td>
                  <td className="p-3 text-left tabular-nums font-semibold text-ink">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl p-3 border border-ink/10 bg-white">
      <div className="text-xs text-ink-2 mb-1">{label}</div>
      <div className="text-lg font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}
