/**
 * لوحةُ المصاريف المبوّبة (ذ · «تقريرٌ نظيفٌ لكلّ فئة») — عرضٌ مُلخِّصٌ لما
 * أُنشئ من مستندات المصاريف (EXP/SAL/ADV/ADVR) عبر «بدء مستند جديد».
 *
 * ثلاثُ طبقات: (تدخّل الآن) إجماليُّ المصروف والسلفُ القائمة للمحلّ الفعّال؛
 * (إجراء سريع) أين تُنشأ المستندات؛ (فهرس كامل) جدولُ الفئات وأحدثُ المصاريف.
 * قراءةٌ خالصة فوق `expenseSummary` المُختبَر — أرقامٌ لاتينيّة، منطوقٌ بالمحلّ.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { getActiveShop, subscribeActiveShop } from '../../../services/shops/shopStore.js';
import { expenseSummary } from '../../../services/accounting/expenseSummary.js';
import { categoryLabel } from '../../../services/accounting/expenseCategories.js';
import ShopSwitcher from '../shops/ShopSwitcher.jsx';

const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager'];
const EXPENSE_TYPES = ['EXP', 'SAL', 'ADV', 'ADVR'];
const TYPE_LABEL = { EXP: 'مصروف', SAL: 'راتب', ADV: 'سلفة', ADVR: 'سداد سلفة' };

const card = 'rounded-xl border border-line bg-surface p-4';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amountOf = (d) => Number(d?.header?.amount ?? d?.header?.total ?? d?.header?.amountPaid) || 0;
const dateOf = (d) => String(d?.header?.expenseDate || d?.header?.payDate || d?.header?.advanceDate || d?.header?.repayDate || '').slice(0, 10);
const shopOf = (d) => d?.shop ?? d?.header?.shop ?? null;
const partyOf = (d) => d?.header?.worker || d?.header?.beneficiary || (d?.type === 'EXP' ? categoryLabel(d?.header?.category) : '') || '';

export default function ExpensesBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [shop, setShop] = useState(getActiveShop());

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => subscribeActiveShop((s) => setShop(s)), []);

  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    return listenDocumentsByTypes(EXPENSE_TYPES, setDocs, 400);
  }, [me]);

  const summary = useMemo(() => expenseSummary(docs, { shop }), [docs, shop]);
  const recent = useMemo(() => {
    const scoped = shop ? docs.filter((d) => shopOf(d) === shop) : docs;
    return scoped
      .filter((d) => ['done', 'closed'].includes(d?.state))
      .slice()
      .sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
      .slice(0, 20);
  }, [docs, shop]);

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!VIEWER_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">لوحةُ المصاريف محصورةٌ بالمديرَين والمالي والخزينة.</p>;
  }

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: تدخّل الآن ═══ */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <ShopSwitcher />
          <span className="text-xs text-ink-2">المصاريفُ معزولةٌ بالمحلّ — بدّل المحلَّ ليتغيّر التقرير.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">إجماليّ المصروف (منجَز)</div>
            <div className="text-ink text-lg">{fmt(summary.expenseTotal)} د.ل</div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">سلفٌ قائمة (لم تُسترَدّ)</div>
            <div className="text-ink text-lg">{fmt(summary.advancesOut)} د.ل</div>
          </div>
          <div className="rounded-lg bg-chip border border-line p-3">
            <div className="text-ink-2 text-xs mb-1">مستنداتٌ محسوبة</div>
            <div className="text-ink text-lg">{summary.docs}</div>
          </div>
        </div>
      </section>

      {/* ═══ الطبقة ٢: إجراء سريع ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">تسجيلُ مصروفٍ أو راتبٍ أو سلفة</h2>
        <p className="text-sm text-ink-2">
          تُنشأ المستندات من <a className="text-brand underline" href="/dashboard/documents">بدء مستند جديد</a> ضمن مجموعتَي
          «المصاريف والرواتب» و«فواتير الموردين». كلُّ مستندٍ يُقيَّد في دفتر الجهاز عند إنجازه، ويظهر أثرُه هنا منطوقًا بالمحلّ.
        </p>
      </section>

      {/* ═══ الطبقة ٣: الفئات وأحدث المصاريف ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">المصروف لكلّ فئة</h2>
        {summary.rows.length === 0 ? (
          <p className="text-sm text-ink-2">لا مصاريفَ بعد — تظهر هنا حين تُنجَز أوّلُ مستند.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  <th className="text-right font-bold py-2 px-2">الفئة</th>
                  <th className="text-right font-bold py-2 px-2">الإجماليّ (د.ل)</th>
                  <th className="text-right font-bold py-2 px-2">عددُ المستندات</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.key} className="border-b border-line/60">
                    <td className="py-2 px-2 text-ink">{r.labelAr}{r.key === 'worker_advance' ? ' (صافٍ)' : ''}</td>
                    <td className="py-2 px-2 text-ink">{fmt(r.total)}</td>
                    <td className="py-2 px-2 text-ink">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-3">أحدثُ المصاريف</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-2">لا مستندات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  <th className="text-right font-bold py-2 px-2">التاريخ</th>
                  <th className="text-right font-bold py-2 px-2">النوع</th>
                  <th className="text-right font-bold py-2 px-2">الجهة / الفئة</th>
                  <th className="text-right font-bold py-2 px-2">المبلغ (د.ل)</th>
                  <th className="text-right font-bold py-2 px-2">المستند</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id} className="border-b border-line/60">
                    <td className="py-2 px-2 text-ink">{dateOf(d)}</td>
                    <td className="py-2 px-2 text-ink">{TYPE_LABEL[d.type] || d.type}</td>
                    <td className="py-2 px-2 text-ink">{partyOf(d)}</td>
                    <td className="py-2 px-2 text-ink">{fmt(amountOf(d))}</td>
                    <td className="py-2 px-2 text-ink-2">{d.number || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
