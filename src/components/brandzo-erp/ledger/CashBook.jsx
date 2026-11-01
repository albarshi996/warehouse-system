/**
 * الخزينةُ اليوميّة — دفترُ النقد (المرحلة م)، نظيرُ «النظام الموحّد» في إكسل المالك.
 *
 * ثلاثُ طبقات: (تدخّل الآن) المحلُّ الفعّال والتاريخ ورصيدُ اليوم؛ (إجراء سريع) فتحُ
 * الدفتر برصيدٍ افتتاحيّ، ثمّ قبضٌ/صرفٌ بالبيان؛ (فهرس كامل) سجلُّ حركة اليوم برصيدٍ
 * تراكميّ وإلغاءٍ لا حذف، والملخّصُ الشهريّ. غلافُ عرضٍ رقيقٌ فوق `cashbookService`
 * المُختبَر. أرقامٌ لاتينيّة، بلا إيموجي، الأحمرُ للتحذير فقط، منطوقٌ بالمحلّ.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as door from '../../../services/_db/index.js';
import { createCashbook } from '../../../services/accounting/cashbookService.js';
import { getActiveShop, subscribeActiveShop } from '../../../services/shops/shopStore.js';
import ShopSwitcher from '../shops/ShopSwitcher.jsx';

const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

export default function CashBook({ db = door }) {
  const CB = useMemo(() => createCashbook(db), [db]);
  const [shop, setShop] = useState(getActiveShop());
  const [day, setDay] = useState(todayStr());
  const [report, setReport] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }

  // نماذج الإدخال
  const [opening, setOpening] = useState('');
  const [dir, setDir] = useState('out'); // الغالبُ في الدفتر صرف
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const month = (day || '').slice(0, 7);

  useEffect(() => subscribeActiveShop((s) => setShop(s)), []);

  const refresh = useCallback(async () => {
    setReady(false);
    try {
      const [r, m] = await Promise.all([CB.dailyReport(shop, day), CB.monthlySummary(shop, month)]);
      setReport(r);
      setMonthly(Array.isArray(m) ? m : []);
    } catch (e) {
      setMsg({ tone: 'warn', text: 'تعذّرت القراءة: ' + (e?.message || '') });
    } finally {
      setReady(true);
    }
  }, [CB, shop, day, month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const bookOpen = report !== null;

  const openBook = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await CB.openBook({ shop, openingBalance: Number(opening) || 0, at: day });
    setBusy(false);
    if (!r.ok) setMsg({ tone: 'warn', text: 'تعذّر فتحُ الدفتر: ' + (r.message || r.reason) });
    else {
      setMsg({ tone: 'ok', text: 'فُتح الدفترُ برصيدٍ افتتاحيّ ' + fmt(Number(opening) || 0) });
      setOpening('');
    }
    refresh();
  };

  const addEntry = async (e) => {
    e.preventDefault();
    const val = Number(amount);
    if (!(val > 0)) {
      setMsg({ tone: 'warn', text: 'أدخِل مبلغًا موجبًا' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fn = dir === 'in' ? CB.addReceipt : CB.addPayment;
    const r = await fn({ shop, amount: val, memo, at: day });
    setBusy(false);
    if (!r.ok) setMsg({ tone: 'warn', text: 'تعذّر التسجيل: ' + (r.message || r.reason) });
    else {
      setMsg({ tone: 'ok', text: (dir === 'in' ? 'سُجّل قبضٌ ' : 'سُجّل صرفٌ ') + fmt(val) });
      setAmount('');
      setMemo('');
    }
    refresh();
  };

  const cancel = async (seq) => {
    setBusy(true);
    await CB.cancelEntry({ shop, seq, at: day });
    setBusy(false);
    refresh();
  };

  return (
    <div className="o_theme" dir="rtl">
      {/* طبقة ١ — تدخّل الآن: المحلّ والتاريخ */}
      <div className="bg-white border border-ink/10 rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <ShopSwitcher db={db} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          التاريخ:
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="border border-ink/15 rounded-lg px-3 py-1.5 text-sm text-ink bg-white"
          />
        </label>
      </div>

      {msg && (
        <div
          className={`mb-4 text-sm rounded-lg p-2 ${
            msg.tone === 'ok'
              ? 'text-ink bg-success/5 border border-success/30'
              : 'text-danger bg-danger/5 border border-danger/40'
          }`}
        >
          {msg.text}
        </div>
      )}

      {!ready && <div className="text-center text-ink-2 p-6">جارٍ القراءة…</div>}

      {ready && !bookOpen && (
        /* الدفترُ غيرُ مفتوحٍ لهذا المحلّ — افتحه برصيدٍ افتتاحيّ */
        <form onSubmit={openBook} className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
          <h2 className="text-base font-bold text-ink mb-2">افتح دفترَ هذا المحلّ</h2>
          <p className="text-sm text-ink-2 mb-3">
            لا دفترَ نقدٍ لهذا المحلّ بعد. افتحه برصيدٍ افتتاحيّ (نقطةُ انطلاق سلسلة الأرصدة).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-2">الرصيدُ الافتتاحيّ</span>
              <input
                type="number"
                step="0.001"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0.00"
                className="border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink w-40 tabular-nums"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'جارٍ…' : 'افتح الدفتر'}
            </button>
          </div>
        </form>
      )}

      {ready && bookOpen && (
        <>
          {/* طبقة ١ (تكملة) — أرصدةُ اليوم */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="رصيدُ بداية اليوم" value={fmt(report.opening)} />
            <Stat label="إجماليُّ القبض" value={fmt(report.totalIn)} tone="in" />
            <Stat label="إجماليُّ الصرف" value={fmt(report.totalOut)} tone="out" />
            <Stat label="رصيدُ نهاية اليوم" value={fmt(report.closing)} strong />
          </div>

          {/* طبقة ٢ — إجراء سريع: قبض/صرف */}
          <form onSubmit={addEntry} className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex rounded-lg overflow-hidden border border-ink/15">
                <button
                  type="button"
                  onClick={() => setDir('out')}
                  className={`px-3 py-2 text-sm font-bold ${dir === 'out' ? 'bg-brand-navy text-white' : 'bg-white text-ink-2'}`}
                >
                  صرف
                </button>
                <button
                  type="button"
                  onClick={() => setDir('in')}
                  className={`px-3 py-2 text-sm font-bold ${dir === 'in' ? 'bg-brand-navy text-white' : 'bg-white text-ink-2'}`}
                >
                  قبض
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-2">المبلغ</span>
                <input
                  type="number"
                  step="0.001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink w-32 tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
                <span className="text-xs text-ink-2">البيان</span>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="غداء · توصيل · إيجار …"
                  className="border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink w-full"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {busy ? 'جارٍ…' : 'سجّل'}
              </button>
            </div>
          </form>

          {/* طبقة ٣ — فهرس كامل: سجلُّ حركة اليوم */}
          <h2 className="text-lg font-bold text-ink mb-2">
            حركةُ يوم {day} <span className="text-sm text-ink-2 font-normal">({report.activeCount} حركة)</span>
          </h2>
          <div className="bg-white border border-ink/10 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy/5 text-ink-2">
                <tr>
                  <th className="p-3 text-right font-semibold">البيان</th>
                  <th className="p-3 text-left font-semibold">قبض</th>
                  <th className="p-3 text-left font-semibold">صرف</th>
                  <th className="p-3 text-left font-semibold">الرصيد</th>
                  <th className="p-3 text-center font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && report.cancelledRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-ink-2">لا حركةَ في هذا اليوم.</td>
                  </tr>
                )}
                {report.rows.map((r) => (
                  <tr key={r.seq} className="border-t border-ink/5">
                    <td className="p-3 text-ink">{r.memo || r.labelAr}</td>
                    <td className="p-3 text-left tabular-nums">{r.in ? fmt(r.in) : '—'}</td>
                    <td className="p-3 text-left tabular-nums">{r.out ? fmt(r.out) : '—'}</td>
                    <td className="p-3 text-left tabular-nums font-semibold text-ink">{fmt(r.balance)}</td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => cancel(r.seq)}
                        disabled={busy}
                        className="text-xs text-danger hover:underline disabled:opacity-50"
                      >
                        إلغاء
                      </button>
                    </td>
                  </tr>
                ))}
                {report.cancelledRows.map((r) => (
                  <tr key={`x-${r.seq}`} className="border-t border-ink/5 text-ink-2 line-through">
                    <td className="p-3">{r.memo || r.labelAr}</td>
                    <td className="p-3 text-left tabular-nums">{r.in ? fmt(r.in) : '—'}</td>
                    <td className="p-3 text-left tabular-nums">{r.out ? fmt(r.out) : '—'}</td>
                    <td className="p-3 text-left">—</td>
                    <td className="p-3 text-center text-xs">ملغاة</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* الملخّصُ الشهريّ */}
          <h2 className="text-lg font-bold text-ink mb-2">الملخّصُ الشهريّ — {month}</h2>
          <div className="bg-white border border-ink/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy/5 text-ink-2">
                <tr>
                  <th className="p-3 text-right font-semibold">اليوم</th>
                  <th className="p-3 text-left font-semibold">البداية</th>
                  <th className="p-3 text-left font-semibold">القبض</th>
                  <th className="p-3 text-left font-semibold">الصرف</th>
                  <th className="p-3 text-left font-semibold">الإقفال</th>
                </tr>
              </thead>
              <tbody>
                {monthly.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-ink-2">لا حركةَ في هذا الشهر.</td>
                  </tr>
                )}
                {monthly.map((r) => (
                  <tr
                    key={r.day}
                    className={`border-t border-ink/5 cursor-pointer hover:bg-brand-navy/5 ${r.day === day ? 'bg-brand-navy/5' : ''}`}
                    onClick={() => setDay(r.day)}
                  >
                    <td className="p-3 text-ink tabular-nums">{r.day}</td>
                    <td className="p-3 text-left tabular-nums">{fmt(r.opening)}</td>
                    <td className="p-3 text-left tabular-nums">{r.totalIn ? fmt(r.totalIn) : '—'}</td>
                    <td className="p-3 text-left tabular-nums">{r.totalOut ? fmt(r.totalOut) : '—'}</td>
                    <td className="p-3 text-left tabular-nums font-semibold text-ink">{fmt(r.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, strong }) {
  const color = tone === 'out' ? 'text-ink' : 'text-ink';
  return (
    <div className={`rounded-xl p-3 border ${strong ? 'border-brand-navy/30 bg-brand-navy/5' : 'border-ink/10 bg-white'}`}>
      <div className="text-xs text-ink-2 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${strong ? 'text-brand-navy' : color}`}>{value}</div>
    </div>
  );
}
