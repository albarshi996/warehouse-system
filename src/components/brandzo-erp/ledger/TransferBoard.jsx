import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { TRANSFER_CHAIN } from '../../../services/documents/chain.js';
import { pendingShipments, transferVariances, SHIPMENT_STATUS } from '../../../services/ledger/transferReports.js';
import { getBasePath } from '../../../services/auth/authService.js';

/**
 * لوحة النقل بين المستودعات — نافذة مخزن النقل وتقريراه.
 *
 * تجيب عن ثلاثة أسئلة تشغيلية: ماذا في الطريق الآن؟ أين ضاعت الفروق؟ وهل عاد
 * مخزن النقل صفرًا؟ الأوّلان تقريران محكومان، والثالث رصيدُ موقع `TRANSIT`
 * الحيّ — فإن لم يكن صفرًا، فما تبقّى فيه هو مجموع ما لم يصل بعد.
 */

const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');
const TRANSIT = 'TRANSIT';

export default function TransferBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const u1 = listenDocumentsByTypes(TRANSFER_CHAIN, setDocs, 300);
    const u2 = listenBalances(setBalances, () => setBalances([]));
    return () => {
      u1?.();
      u2?.();
    };
  }, [me]);

  const pending = useMemo(() => pendingShipments(docs), [docs]);
  const variances = useMemo(() => transferVariances(docs), [docs]);

  // رصيد مخزن النقل الحيّ — إثبات التصفير (أو كشف ما عَلِق).
  const transitRows = useMemo(
    () =>
      balances
        .filter((b) => String(b.warehouse || '').toUpperCase() === TRANSIT)
        .filter((b) => Math.abs(Number(b.qty) || 0) > 0.0001)
        .sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0)),
    [balances]
  );
  const transitTotal = useMemo(() => transitRows.reduce((s, b) => s + (Number(b.qty) || 0), 0), [transitRows]);

  if (!ready) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();

  return (
    <div dir="rtl" className="space-y-5">
      {/* شريط مؤشّرات مخزن النقل */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="في الطريق" value={pending.inTransit} tone="#f59e0b" hint="شحنات غادرت ولم تُستلم" />
        <Stat label="بفرق كميات" value={pending.withVariance} tone="#ef4444" hint="استُلمت ناقصةً" />
        <Stat label="رصيد مخزن النقل" value={num(transitTotal)} tone={transitTotal > 0 ? '#f59e0b' : '#10b981'} hint={transitTotal > 0 ? 'يجب أن يعود صفرًا' : 'صفرٌ — لا شيء عالق ✓'} />
        <Stat label="فروق غير مسوّاة" value={variances.unresolved} tone="#ef4444" hint={`نقصٌ إجماليّ ${num(variances.totalShortage)}`} />
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 flex-wrap">
        {[
          ['pending', '🚚 الشحنات المعلّقة'],
          ['variance', '⚖️ فروقات النقل'],
          ['transit', '📦 رصيد مخزن النقل'],
        ].map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${tab === k ? 'bg-brand-red text-white' : 'bg-chip text-ink-2 hover:bg-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="rounded-xl bg-surface border border-line p-4 overflow-x-auto">
          <table className="w-full text-xs bz-dashboard-table">
            <thead>
              <tr className="text-muted text-right">
                <th className="py-2">مستند النقل</th>
                <th>المسار</th>
                <th>التاريخ</th>
                <th>مشحون</th>
                <th>مستلَم</th>
                <th>متبقٍّ</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {pending.rows.map((r) => {
                const s = SHIPMENT_STATUS[r.status];
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2">
                      <a href={`${base}/dashboard/document?type=TRN&id=${r.id}`} className="font-bold text-accent hover:underline">
                        {r.number || 'مسودّة'}
                      </a>
                      {r.driverName && <div className="text-gray-500">{r.driverName} · {r.vehiclePlate}</div>}
                    </td>
                    <td className="text-ink-2 whitespace-nowrap">{r.fromWarehouse} ← {r.toWarehouse}</td>
                    <td className="text-muted whitespace-nowrap">{r.shipmentDate || '—'}</td>
                    <td className="text-ink-2">{num(r.shipped)}</td>
                    <td className="text-ink-2">{num(r.received)}</td>
                    <td className={r.remaining > 0 ? 'text-amber-300 font-bold' : 'text-gray-500'}>{num(r.remaining)}</td>
                    <td className="whitespace-nowrap font-bold" style={{ color: s.color }}>{s.emoji} {s.label}</td>
                  </tr>
                );
              })}
              {!pending.rows.length && <Empty cols={7}>لا شحنات نقلٍ بعد.</Empty>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'variance' && (
        <div className="rounded-xl bg-surface border border-line p-4 overflow-x-auto">
          <table className="w-full text-xs bz-dashboard-table">
            <thead>
              <tr className="text-muted text-right">
                <th className="py-2">المستند</th>
                <th>الصنف</th>
                <th>المسار</th>
                <th>مشحون</th>
                <th>مستلَم</th>
                <th>الفارق</th>
                <th>السبب</th>
                <th>التسوية</th>
              </tr>
            </thead>
            <tbody>
              {variances.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 text-ink-2 whitespace-nowrap">{r.transferNote}</td>
                  <td className="text-ink">{r.description}</td>
                  <td className="text-muted whitespace-nowrap">{r.fromWarehouse} ← {r.toWarehouse}</td>
                  <td className="text-ink-2">{num(r.shipped)}</td>
                  <td className="text-ink-2">{num(r.received)}</td>
                  <td className="font-bold" style={{ color: r.variance < 0 ? '#ef4444' : '#10b981' }}>
                    {r.variance > 0 ? `+${num(r.variance)}` : num(r.variance)}
                  </td>
                  <td className="text-ink-2">{r.reason || <span className="text-red-300">بلا سبب</span>}</td>
                  <td className={r.resolved ? 'text-emerald-300' : 'text-amber-300'}>{r.settlement}</td>
                </tr>
              ))}
              {!variances.rows.length && <Empty cols={8}>لا فروق نقلٍ — كل ما شُحن وصل كاملًا ✓</Empty>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'transit' && (
        <div className="rounded-xl bg-surface border border-line p-4">
          <p className="text-xs text-muted mb-3 leading-relaxed">
            🚚 <b className="text-ink-2">مخزن النقل</b> موقعٌ وسيط يجب أن يعود <b className="text-emerald-300">صفرًا</b> بعد اكتمال كل استلام.
            أيّ رصيدٍ باقٍ هنا = بضاعةٌ غادرت المصدر ولم تصل الوجهة بعد — شحنةٌ في الطريق أو فرقٌ لم يُسوَّ.
          </p>
          {transitRows.length === 0 ? (
            <p className="text-emerald-300 text-sm py-8 text-center font-bold">✓ مخزن النقل صفرٌ — لا شيء عالق في الطريق.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs bz-dashboard-table">
                <thead>
                  <tr className="text-muted text-right">
                    <th className="py-2">الصنف</th>
                    <th>التشغيلة</th>
                    <th>الصلاحية</th>
                    <th>العالق</th>
                  </tr>
                </thead>
                <tbody>
                  {transitRows.map((b) => (
                    <tr key={b.id} className="border-t border-line">
                      <td className="py-2">
                        <div className="font-bold text-ink">{b.sku || b.barcode}</div>
                        <div className="text-muted">{b.nameAr}</div>
                      </td>
                      <td className="text-ink-2">{b.batch || '—'}</td>
                      <td className="text-muted">{b.expiry || '—'}</td>
                      <td className="font-bold text-amber-300">{num(b.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }) {
  return (
    <div className="rounded-xl bg-surface border border-line p-3">
      <div className="text-2xl font-bold" style={{ color: tone }}>{value}</div>
      <div className="text-xs font-bold text-ink-2 mt-1">{label}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</div>
    </div>
  );
}

function Empty({ cols, children }) {
  return (
    <tr>
      <td colSpan={cols} className="py-6 text-center text-gray-500">{children}</td>
    </tr>
  );
}

function Notice({ children }) {
  return <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-4">{children}</div>;
}
