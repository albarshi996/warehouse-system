import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import {
  valuationReport,
  reorderReport,
  stagnantReport,
  inventorySummary,
} from '../../../services/inventory/inventoryAnalytics.js';

/**
 * تحليل المخزون الحيّ — التقييم والراكد وإعادة الطلب (§17). عرضٌ حيٌّ فوق
 * `inventoryAnalytics.js` الخالص المُختبَر: يشترك في ماستر الأصناف (الرصيد
 * والتكلفة والحدّ الأدنى) وفي أحدث حركات الدفتر (لاستخلاص آخر خروجٍ للراكد)،
 * فيجيب سؤالَي المدير: كم رأس مالٍ راقد؟ وأيّ صنفٍ تحت حدّه يوشك أن ينفد؟
 *
 * حوكمة الواجهة: بلا إيموجي · الأحمر للتحذير فقط · الربط قبل الإضافة.
 */

const MOVES_CAP = 2500;
const WINDOWS = [90, 180];

const money = (n) => `${(Number(n) || 0).toLocaleString('ar-LY', { maximumFractionDigits: 0 })} د.ل`;
const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');

export default function InventoryAnalytics() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [stagnantDays, setStagnantDays] = useState(90);
  const nowMs = useMemo(() => Date.now(), [items, moves]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const ui = subscribeItems(setItems, () => {}, { includeArchived: false });
    const um = listenRecentMoves(setMoves, MOVES_CAP);
    return () => { ui?.(); um?.(); };
  }, [me]);

  const valuation = useMemo(() => valuationReport(items), [items]);
  const reorder = useMemo(() => reorderReport(items), [items]);
  const stagnant = useMemo(
    () => stagnantReport(items, moves, nowMs, { stagnantDays }),
    [items, moves, nowMs, stagnantDays],
  );
  const summary = useMemo(
    () => inventorySummary(items, moves, nowMs, { stagnantDays }),
    [items, moves, nowMs, stagnantDays],
  );

  if (!ready) return <p className="text-muted text-sm">جارٍ التحميل…</p>;
  if (!me) return <p className="text-muted text-sm">يلزم تسجيل الدخول.</p>;

  const stagnantHigh = summary.stagnantShare != null && summary.stagnantShare >= 0.25;

  return (
    <div className="space-y-8">
      {/* بطاقات الملخّص */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile v={num(summary.itemsTotal)} l="صنفًا في الماستر" />
        <Tile v={money(summary.totalValue)} l="قيمة المخزون" accent />
        <Tile
          v={money(summary.stagnantValue)}
          l={`رأس مال راقد${summary.stagnantShare != null ? ` (${Math.round(summary.stagnantShare * 100)}٪)` : ''}`}
          warn={stagnantHigh}
        />
        <Tile v={num(summary.reorderCount)} l="تحت حدّ إعادة الطلب" warn={summary.reorderCount > 0} />
        <Tile v={num(summary.itemsUnpriced)} l="صنفًا بلا تكلفة" />
      </div>

      {/* تقييم المخزون بالفئات */}
      <section>
        <h2 className="text-lg font-bold text-ink mb-1">تقييم المخزون بالفئات</h2>
        <p className="text-xs text-muted mb-3">
          القيمة = الرصيد × التكلفة، من ماستر الأصناف.
          {summary.itemsUnpriced > 0 && (
            <span className="text-gray-500"> {' '}({num(summary.itemsUnpriced)} صنفًا بلا تكلفةٍ لا يدخل التقييم.)</span>
          )}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm text-right border-collapse min-w-[420px]">
            <thead>
              <tr className="text-ink-2 border-b border-line text-[11px] bg-chip">
                <th className="p-3 font-bold">الفئة</th>
                <th className="p-3 font-bold">عدد الأصناف</th>
                <th className="p-3 font-bold">القيمة</th>
                <th className="p-3 font-bold">الحصّة</th>
              </tr>
            </thead>
            <tbody>
              {valuation.categories.map((c) => (
                <tr key={c.category} className="border-b border-line">
                  <td className="p-3 text-ink font-bold">{c.category}</td>
                  <td className="p-3 text-ink-2">{num(c.count)}</td>
                  <td className="p-3 text-accent font-bold">{money(c.value)}</td>
                  <td className="p-3 text-muted">
                    {valuation.total > 0 ? `${Math.round((c.value / valuation.total) * 100)}٪` : '—'}
                  </td>
                </tr>
              ))}
              {valuation.categories.length === 0 && (
                <tr><td className="p-3 text-gray-500" colSpan={4}>لا أصناف بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* إعادة الطلب */}
      <section>
        <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
          <h2 className="text-lg font-bold text-ink">مقترحات إعادة الطلب</h2>
          <span className="text-xs text-muted">{num(reorder.count)} صنفًا تحت الحدّ الأدنى</span>
        </div>
        <p className="text-xs text-muted mb-3">
          الرصيد ≤ الحدّ الأدنى المعرَّف (`minStock`). الكمية المقترحة تُعيد الرصيد إلى الحدّ.
          {reorder.withoutMin > 0 && (
            <span className="text-gray-500"> {' '}({num(reorder.withoutMin)} صنفًا بلا حدٍّ أدنى — فجوة تغطية، تُضبط في ماستر الأصناف.)</span>
          )}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm text-right border-collapse min-w-[640px]">
            <thead>
              <tr className="text-ink-2 border-b border-line text-[11px] bg-chip">
                <th className="p-3 font-bold">الصنف</th>
                <th className="p-3 font-bold">الرصيد</th>
                <th className="p-3 font-bold">الحدّ الأدنى</th>
                <th className="p-3 font-bold">النقص</th>
                <th className="p-3 font-bold">قيمة التجديد المقترح</th>
              </tr>
            </thead>
            <tbody>
              {reorder.rows.map((r) => (
                <tr key={r.key} className="border-b border-line">
                  <td className="p-3"><span className="text-ink font-bold">{r.nameAr}</span>{r.sku && <span className="text-[10px] text-gray-500 block">{r.sku}</span>}</td>
                  <td className="p-3 text-red-400 font-bold">{num(r.balance)} {r.unit}</td>
                  <td className="p-3 text-ink-2">{num(r.minStock)}</td>
                  <td className="p-3 text-ink font-bold">{num(r.shortfall)}</td>
                  <td className="p-3 text-accent">{money(r.orderValue)}</td>
                </tr>
              ))}
              {reorder.rows.length === 0 && (
                <tr><td className="p-3 text-green-400" colSpan={5}>لا صنف تحت حدّه الأدنى — التغطية سليمة.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* الراكد */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-lg font-bold text-ink">المخزون الراكد</h2>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">بلا صرفٍ منذ</span>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setStagnantDays(w)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                  stagnantDays === w ? 'bg-brand-red text-white border-brand-red' : 'bg-chip text-ink-2 border-line hover:bg-surface-2'
                }`}
              >
                {w} يومًا
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted mb-3">
          أصنافٌ برصيدٍ موجبٍ وقيمةٍ لم تُصرَف للخارج ضمن النافذة — رأس مالٌ محتجز.
          إجماليّه <span className="text-ink font-bold">{money(stagnant.value)}</span>.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm text-right border-collapse min-w-[560px]">
            <thead>
              <tr className="text-ink-2 border-b border-line text-[11px] bg-chip">
                <th className="p-3 font-bold">الصنف</th>
                <th className="p-3 font-bold">الرصيد</th>
                <th className="p-3 font-bold">القيمة الراقدة</th>
                <th className="p-3 font-bold">منذ آخر صرف</th>
              </tr>
            </thead>
            <tbody>
              {stagnant.rows.slice(0, 100).map((r) => (
                <tr key={r.key} className="border-b border-line">
                  <td className="p-3"><span className="text-ink font-bold">{r.nameAr}</span>{r.sku && <span className="text-[10px] text-gray-500 block">{r.sku}</span>}</td>
                  <td className="p-3 text-ink-2">{num(r.balance)} {r.unit}</td>
                  <td className="p-3 text-accent font-bold">{money(r.value)}</td>
                  <td className="p-3 text-muted">{r.daysIdle == null ? 'لم يُصرف قطّ' : `${num(r.daysIdle)} يومًا`}</td>
                </tr>
              ))}
              {stagnant.rows.length === 0 && (
                <tr><td className="p-3 text-green-400" colSpan={4}>لا مخزون راكد ضمن النافذة.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {stagnant.rows.length > 100 && (
          <p className="text-[11px] text-gray-500 mt-2">تُعرض أعلى 100 صنفًا بالقيمة من أصل {num(stagnant.count)}.</p>
        )}
        <p className="text-[11px] text-gray-500 mt-2">
          يُقرأ آخر {num(MOVES_CAP)} حركةٍ من الدفتر؛ الأصناف الأقدم نشاطًا تظهر راكدةً بحقّ.
        </p>
      </section>
    </div>
  );
}

function Tile({ v, l, accent = false, warn = false }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${warn ? 'border-brand-red/40 bg-brand-red/5' : 'border-line bg-chip'}`}>
      <div className={`text-xl font-extrabold ${warn ? 'text-red-400' : accent ? 'text-accent' : 'text-ink'}`}>{v}</div>
      <div className="text-[10px] text-ink-2 mt-1 leading-snug">{l}</div>
    </div>
  );
}
