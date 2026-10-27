/**
 * ظلُّ المخزن المحلّيّ — الدفترُ والخزينةُ معًا (م٢ · الشريحةُ الثالثة).
 *
 * عرضٌ **للقراءة فقط** يقرأ ما كتبته الشريحتان الأولى (القيد) والثانية (الخزينة)
 * من المخزن المحلّيّ عبر الباب `_db` — فيُرى على الجهاز، بلا إنترنت، أنّ الدفترَ
 * متوازنٌ والورديّاتِ مُسكَّرة. لا يكتب شيئًا ولا يمسّ الحيَّ. كلُّ التشكيل في
 * `localShadowView` الخالص المُختبَر؛ هذا غلافُ عرضٍ رقيق.
 *
 * ★ خاملٌ: صفرُ مستهلكين — لا صفحةَ ولا كتالوجَ تنقّلٍ يستورده بعد. وصلُه صفحةً
 *   مرئيّةً خطوةُ القطع (م٣)، مع شرحٍ في دليل الاستخدام حينها.
 */
import { useEffect, useMemo, useState } from 'react';
import * as door from '../../../services/_db/index.js';
import { localShadowView, balanceTone } from '../../../services/accounting/localShadowView.js';
import { accountDef, baseOf } from '../../../services/accounting/accounts.js';

const fmt = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATE_AR = { open: 'مفتوحة', closed: 'مُسكَّرة' };

/** اسمُ الحساب عربيًّا: الأساسُ من الدليل، والذمّةُ الفرعيّةُ باسمها ثمّ رمز الطرف. */
function accountLabel(account) {
  const def = accountDef(account);
  const nameAr = def ? def.nameAr : account;
  const party = String(account).includes(':') ? String(account).split(':')[1] : '';
  return party ? `${nameAr} — ${party}` : nameAr;
}

export default function LocalShadowBoard({ db = door }) {
  const [view, setView] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await localShadowView(db);
        if (alive) setView(v);
      } catch (e) {
        if (alive) setError(e?.message || 'تعذّرت قراءةُ المخزن المحلّيّ');
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tb = view?.ledger?.trialBalance;
  const treasury = view?.treasury;
  // ثلاثُ حالات: غيرُ معلومٍ (تحميلٌ/تعذّرُ قراءة) ≠ مختلّ — فلا أحمرَ كاذب.
  const tbTone = balanceTone(ready, tb);
  const varianceTone = useMemo(() => {
    const v = Number(treasury?.totalVariance) || 0;
    return v === 0 ? 'text-ink' : 'text-danger';
  }, [treasury]);

  return (
    <div dir="rtl" className="text-right">
      <div className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-2 leading-relaxed">
          مرآةٌ لِما كُتب فعلًا في المخزن المحلّيّ على الجهاز: قيودُ الدفتر المزدوج وورديّاتُ الخزينة.
          <b> عرضٌ للقراءة فقط</b> — لا كتابةَ حيّة ولا مساسَ بأودو أو الخلفيّة الافتراضيّة.
        </p>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/40 rounded-xl p-3 mb-4 text-sm text-danger">
          تعذّرت القراءة: {error}
        </div>
      )}

      {/* ═══════ الدفتر ═══════ */}
      <h2 className="text-lg font-bold text-ink mb-2">الدفتر المحلّيّ</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="عدد القيود" value={ready ? String(view?.ledger?.entryCount ?? 0) : '…'} />
        <Stat label="الحسابات" value={ready ? String(tb?.accounts ?? 0) : '…'} />
        <Stat label="قيودٌ مرفوضة" value={ready ? String(view?.ledger?.errorCount ?? 0) : '…'} />
        <div
          className={`rounded-xl p-3 border ${
            tbTone === 'ok'
              ? 'border-success/30 bg-success/5'
              : tbTone === 'bad'
                ? 'border-danger/40 bg-danger/5'
                : 'border-ink/10 bg-white'
          }`}
        >
          <div className="text-xs text-ink-2 mb-1">ميزانُ المراجعة</div>
          <div
            className={`text-lg font-bold ${
              tbTone === 'ok' ? 'text-success' : tbTone === 'bad' ? 'text-danger' : 'text-ink'
            }`}
          >
            {tbTone === 'ok' ? 'متوازنٌ = 0.00' : tbTone === 'bad' ? 'غيرُ متوازن' : ready ? '—' : '…'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-xl overflow-hidden mb-6">
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
                <td colSpan={4} className="p-6 text-center text-ink-2">جارٍ القراءة…</td>
              </tr>
            )}
            {ready && (!tb || tb.rows.length === 0) && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-2">لا قيودَ محلّيّةً بعد.</td>
              </tr>
            )}
            {tb?.rows.map((r) => (
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

      {/* ═══════ الخزينة ═══════ */}
      <h2 className="text-lg font-bold text-ink mb-2">الخزينة المحلّيّة</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="الورديّات" value={ready ? String(treasury?.sessionCount ?? 0) : '…'} />
        <Stat label="مفتوحة" value={ready ? String(treasury?.openCount ?? 0) : '…'} />
        <Stat label="مُسكَّرة" value={ready ? String(treasury?.closedCount ?? 0) : '…'} />
        <div className="rounded-xl p-3 border border-ink/10 bg-white">
          <div className="text-xs text-ink-2 mb-1">إجماليُّ الفروق</div>
          <div className={`text-lg font-bold tabular-nums ${varianceTone}`}>
            {ready ? fmt(treasury?.totalVariance) : '…'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy/5 text-ink-2">
            <tr>
              <th className="p-3 text-right font-semibold">الوردية</th>
              <th className="p-3 text-right font-semibold">الحالة</th>
              <th className="p-3 text-left font-semibold">البداية</th>
              <th className="p-3 text-left font-semibold">المتوقَّع</th>
              <th className="p-3 text-left font-semibold">المعدود</th>
              <th className="p-3 text-left font-semibold">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {!ready && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-2">جارٍ القراءة…</td>
              </tr>
            )}
            {ready && (!treasury || treasury.rows.length === 0) && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-2">لا ورديّاتٍ محلّيّةً بعد.</td>
              </tr>
            )}
            {treasury?.rows.map((r) => (
              <tr key={r.id} className="border-t border-ink/5">
                <td className="p-3 font-medium text-ink">
                  {r.id}
                  {r.shift ? <span className="text-ink-2 text-xs"> · {r.shift}</span> : null}
                </td>
                <td className="p-3 text-ink-2">{STATE_AR[r.state] || r.state}</td>
                <td className="p-3 text-left tabular-nums">{fmt(r.openingBalance)}</td>
                <td className="p-3 text-left tabular-nums">{fmt(r.expected)}</td>
                <td className="p-3 text-left tabular-nums">{r.counted == null ? '—' : fmt(r.counted)}</td>
                <td
                  className={`p-3 text-left tabular-nums font-semibold ${
                    r.variance == null || r.variance === 0 ? 'text-ink-2' : 'text-danger'
                  }`}
                >
                  {r.variance == null ? '—' : fmt(r.variance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
