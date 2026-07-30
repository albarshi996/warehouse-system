import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { OUTBOUND_CHAIN, BILLING_CHAIN } from '../../../services/documents/chain.js';
import { pendingOrders, outOfStockItems, ORDER_STATUS } from '../../../services/ledger/salesReports.js';

/**
 * الرقابة على الطلبات — التقريران اللذان يحوّلان أوامر البيع إلى قرار.
 *
 * الأوّل «الطلبات المعلّقة»: كل أمرٍ لم يُسلَّم، مصنَّفًا بالرصيد وسبب التعثّر —
 * فيرى المدير أين توقّف كل طلب. والثاني «الأصناف غير المتوفّرة»: العجز مجمَّعًا
 * صنفًا صنفًا بقيمته المفقودة ومتوسط طلبه — إشارةُ شراءٍ مسبَّبة.
 */

const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');
const money = (n) => `${(Number(n) || 0).toLocaleString('ar-LY', { maximumFractionDigits: 0 })} د.ل`;

export default function OrderControlBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
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
    // سلسلة المبيعات كاملة: أمر البيع وأبناؤه (SO·PICK·PACK·DN·GP) + الفاتورة.
    const types = [...new Set([...OUTBOUND_CHAIN, ...BILLING_CHAIN])];
    const unsub = listenDocumentsByTypes(types, setDocs, 400);
    return () => unsub?.();
  }, [me]);

  const pending = useMemo(() => pendingOrders(docs), [docs]);
  const shortage = useMemo(() => outOfStockItems(docs), [docs]);

  if (!ready) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();

  return (
    <div dir="rtl" className="space-y-5">
      {/* مؤشّرات */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="طلبات معلّقة" value={pending.pending} tone="#f59e0b" hint={money(pending.pendingValue)} />
        <Stat label="يوجد رصيد" value={pending.withStock} tone="#3b82f6" hint="بانتظار التعبئة أو التجهيز" />
        <Stat label="لا يوجد رصيد" value={pending.noStock} tone="#ef4444" hint="تُحوَّل لتقرير العجز" />
        <Stat label="أصناف عاجزة" value={shortage.itemCount} tone="#ef4444" hint={`قيمة مفقودة ${money(shortage.totalLostValue)}`} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          ['pending', '📋 الطلبات المعلّقة'],
          ['shortage', '🚫 الأصناف غير المتوفّرة'],
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
        <>
          {/* توزيع الأسباب */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(pending.byReason).map(([status, count]) => {
              const s = ORDER_STATUS[status];
              return (
                <span key={status} className="text-[11px] font-bold rounded-full px-3 py-1 border" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}11` }}>
                  {s.emoji} {s.label}: {count}
                </span>
              );
            })}
          </div>
          <div className="rounded-xl bg-surface border border-line p-4 overflow-x-auto">
            <table className="w-full text-xs bz-dashboard-table">
              <thead>
                <tr className="text-muted text-right">
                  <th className="py-2">أمر البيع</th>
                  <th>العميل</th>
                  <th>المستودع</th>
                  <th>التاريخ</th>
                  <th>القيمة</th>
                  <th>الحالة / سبب عدم التنفيذ</th>
                </tr>
              </thead>
              <tbody>
                {pending.rows.map((r) => {
                  const s = ORDER_STATUS[r.status];
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2">
                        <a href={`${base}/dashboard/document?type=SO&id=${r.id}`} className="font-bold text-accent hover:underline">
                          {r.number || 'مسودّة'}
                        </a>
                      </td>
                      <td className="text-ink-2">{r.customer || '—'}</td>
                      <td className="text-muted">{r.warehouse || '—'}</td>
                      <td className="text-muted whitespace-nowrap">{r.orderDate || '—'}</td>
                      <td className="text-ink-2 whitespace-nowrap">{money(r.value)}</td>
                      <td className="whitespace-nowrap font-bold" style={{ color: s.color }}>
                        {s.emoji} {r.holdReason || s.label}
                        {r.status === 'no-stock' && r.shortfallCount > 0 && (
                          <span className="text-gray-500 font-normal"> ({r.shortfallCount} صنفًا)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!pending.rows.length && <Empty cols={6}>لا طلبات معلّقة — كل أمرٍ سُلّم أو أُقفل ✓</Empty>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'shortage' && (
        <div className="rounded-xl bg-surface border border-line p-4">
          <p className="text-xs text-muted mb-3 leading-relaxed">
            🚫 كل صنفٍ عجز المخزون عن تلبيته — مرتّبًا بالقيمة المفقودة. يُغذّي <b className="text-ink-2">التنبؤ بالطلب</b> و<b className="text-ink-2">التخطيط الشرائي</b> وضبط <b className="text-ink-2">حدّ المخزون الأدنى</b>.
            <span className="text-gray-500"> (متوسط الطلب الشهري محسوبٌ على {num(shortage.monthsSpanned)} شهرًا)</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs bz-dashboard-table">
              <thead>
                <tr className="text-muted text-right">
                  <th className="py-2">الصنف</th>
                  <th>مرّات الطلب</th>
                  <th>الكمية العاجزة</th>
                  <th>القيمة المفقودة</th>
                  <th>متوسط الطلب الشهري</th>
                  <th>آخر نفاد</th>
                </tr>
              </thead>
              <tbody>
                {shortage.rows.map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-2">
                      <div className="font-bold text-ink">{r.sku || r.barcode}</div>
                      <div className="text-muted">{r.nameAr}</div>
                    </td>
                    <td className="text-ink-2">{num(r.times)}</td>
                    <td className="text-amber-300 font-bold">{num(r.shortQty)}</td>
                    <td className="text-red-300 font-bold whitespace-nowrap">{money(r.lostValue)}</td>
                    <td className="text-ink-2">{num(Math.round(r.avgMonthly))}</td>
                    <td className="text-muted whitespace-nowrap">{r.lastStockout || '—'}</td>
                  </tr>
                ))}
                {!shortage.rows.length && <Empty cols={6}>لا عجز — كل ما طُلب توفّر ✓</Empty>}
              </tbody>
            </table>
          </div>
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
