/**
 * حاسبةُ تسكير الوردية — تُظهر محرّكَ الخزينة (§7) حيًّا: رصيدُ البداية وحركاتُ
 * الدرج ⇐ المتوقَّع، ومقارنتُه بالمعدود. **حاسبةٌ للقراءة فقط: لا تحفظ شيئًا**
 * ولا تمسّ قاعدةً ولا أودو. كلُّ الحساب في `cashSession.js` الخالص المُختبَر.
 *
 * ★ النقدُ وحدَه يدخل الدرج؛ البطاقةُ والبنكُ يُتابَعان منفصلَين. والفرقُ يحتاج
 *   سببًا — ولا يتحوّل دَينًا تلقائيًّا (قرارُ الخطّة، مُمَكْنَنٌ في المحرّك).
 */
import { useMemo, useState } from 'react';
import { CASH_MOVEMENTS, PAYMENT_METHODS, openSession, summarize } from '../../../services/accounting/cashSession.js';
import { toMinor, fromMinor } from '../../../services/accounting/money.js';

const fmt = (minor) =>
  fromMinor(Number(minor) || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const METHOD_AR = { cash: 'نقد', bank: 'بنك', card: 'بطاقة' };

/** يحوّل نصًّا عشريًّا إلى وحدةٍ صغرى صحيحةٍ غيرِ سالبة، أو 0 إن تعذّر. */
function toMinorSafe(text) {
  const n = Number(String(text ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  try {
    return toMinor(n);
  } catch {
    return 0;
  }
}

const emptyRow = () => ({ kind: 'customer_receipt', method: 'cash', amount: '' });

export default function CashSessionCalc() {
  const [opening, setOpening] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');

  const { summary, error } = useMemo(() => {
    const openingMinor = toMinorSafe(opening);
    const moves = rows
      .filter((r) => r.kind && r.method && toMinorSafe(r.amount) > 0)
      .map((r) => ({ kind: r.kind, method: r.method, amount: toMinorSafe(r.amount) }));
    try {
      const session = openSession({ id: 'calc', openingBalance: openingMinor });
      return { summary: summarize(session, moves), error: null };
    } catch (e) {
      return { summary: null, error: e.message };
    }
  }, [opening, rows]);

  const hasCounted = counted.trim() !== '';
  const countedMinor = toMinorSafe(counted);
  const variance = summary ? countedMinor - summary.expectedCash : 0;
  const needsReason = hasCounted && variance !== 0 && reason.trim() === '';

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  return (
    <div dir="rtl" className="text-right">
      <div className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-2 leading-relaxed">
          أدخِل رصيدَ بداية الوردية وحركاتِ الخزينة، فتُحسب <b>قيمةُ النقد المتوقَّعة في الدرج</b>،
          وتُقارَن بما عددتَه فعلًا. <b>النقدُ وحده يدخل الدرج</b>؛ البطاقةُ والبنكُ يُتابَعان منفصلَين.
          <b> حاسبةٌ للقراءة فقط — لا تحفظ شيئًا.</b>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <label className="block">
          <span className="text-xs text-ink-2">رصيد بداية الوردية (نقدًا)</span>
          <input
            type="text"
            inputMode="decimal"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.000"
            className="mt-1 w-full border border-ink/15 rounded-lg p-2 text-left tabular-nums focus:border-brand-navy outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-2">النقد المعدود في الدرج عند القطع</span>
          <input
            type="text"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0.000"
            className="mt-1 w-full border border-ink/15 rounded-lg p-2 text-left tabular-nums focus:border-brand-navy outline-none"
          />
        </label>
      </div>

      <div className="bg-white border border-ink/10 rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between p-3 border-b border-ink/10">
          <h3 className="text-sm font-bold text-ink">حركاتُ الوردية</h3>
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-semibold text-brand-navy border border-brand-navy/30 rounded-lg px-3 py-1 hover:bg-brand-navy/5"
          >
            + حركة
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-brand-navy/5 text-ink-2">
            <tr>
              <th className="p-2 text-right font-semibold">النوع</th>
              <th className="p-2 text-right font-semibold">الوسيلة</th>
              <th className="p-2 text-left font-semibold">المبلغ</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const dir = CASH_MOVEMENTS[r.kind]?.dir;
              return (
                <tr key={i} className="border-t border-ink/5">
                  <td className="p-2">
                    <select
                      value={r.kind}
                      onChange={(e) => setRow(i, { kind: e.target.value })}
                      className="w-full border border-ink/15 rounded-lg p-1.5 bg-white outline-none focus:border-brand-navy"
                    >
                      {Object.entries(CASH_MOVEMENTS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.labelAr} ({v.dir === 'in' ? 'وارد' : 'صادر'})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      value={r.method}
                      onChange={(e) => setRow(i, { method: e.target.value })}
                      className="w-full border border-ink/15 rounded-lg p-1.5 bg-white outline-none focus:border-brand-navy"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_AR[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => setRow(i, { amount: e.target.value })}
                      placeholder="0.000"
                      className={`w-full border border-ink/15 rounded-lg p-1.5 text-left tabular-nums outline-none focus:border-brand-navy ${
                        r.method !== 'cash' ? 'bg-ink/5' : ''
                      }`}
                    />
                    {r.method !== 'cash' && (
                      <span className="text-[10px] text-ink-2">خارج الدرج ({dir === 'in' ? 'وارد' : 'صادر'})</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-ink-2 hover:text-danger text-lg leading-none"
                      aria-label="حذف"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/40 rounded-xl p-3 mb-4 text-sm text-danger">{error}</div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="رصيد البداية" value={fmt(summary.openingBalance)} />
            <Stat label="الوارد النقديّ" value={fmt(summary.cashIn)} />
            <Stat label="الصادر النقديّ" value={fmt(summary.cashOut)} />
            <div className="rounded-xl p-3 border border-brand-navy/30 bg-brand-navy/5">
              <div className="text-xs text-ink-2 mb-1">المتوقَّع في الدرج</div>
              <div className="text-lg font-bold text-brand-navy tabular-nums">{fmt(summary.expectedCash)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="صافي النقد" value={fmt(summary.byMethod.cash)} />
            <Stat label="صافي البنك (خارج الدرج)" value={fmt(summary.byMethod.bank)} />
            <Stat label="صافي البطاقة (خارج الدرج)" value={fmt(summary.byMethod.card)} />
          </div>

          {hasCounted && (
            <div
              className={`rounded-xl p-4 border mb-2 ${
                variance === 0
                  ? 'border-success/30 bg-success/5'
                  : variance < 0
                    ? 'border-danger/40 bg-danger/5'
                    : 'border-ink/15 bg-ink/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-2">الفرق (معدود − متوقَّع)</span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    variance === 0 ? 'text-success' : variance < 0 ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {variance > 0 ? '+' : ''}
                  {fmt(variance)}
                </span>
              </div>
              <div className="text-xs text-ink-2 mt-1">
                {variance === 0 ? 'مطابقٌ تمامًا' : variance < 0 ? 'عجزٌ في الدرج' : 'فائضٌ في الدرج'}
              </div>

              {variance !== 0 && (
                <div className="mt-3">
                  <label className="block">
                    <span className="text-xs text-ink-2">سببُ الفرق (إلزاميّ — لا يتحوّل دَينًا تلقائيًّا)</span>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="مثال: فكّةٌ ناقصة، خطأُ إدخال…"
                      className="mt-1 w-full border border-ink/15 rounded-lg p-2 outline-none focus:border-brand-navy"
                    />
                  </label>
                  <div className={`text-xs mt-1 ${needsReason ? 'text-danger' : 'text-success'}`}>
                    {needsReason ? 'الفرقُ يحتاج سببًا واعتمادًا قبل القبول.' : 'جاهزٌ للتسكير بسببٍ معلَّل.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
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
