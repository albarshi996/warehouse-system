import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { computeProcurementKpis } from '../../../services/kpi/procurementKpis.js';
import { toMillis } from '../../../services/documents/inbox.js';

/**
 * لوحة مؤشرات المشتريات — الأرقام التي يسأل عنها مُقيّم السلاسل أوّلًا، محسوبةً
 * من المستندات وسجلّها لا من انطباع. تكمّل لوحة القيادة التشغيلية (التي تقيس
 * دورة البيع والأسطول) بأربعة مؤشرات مشترياتٍ كانت غائبة:
 *   مدة دورة أمر الشراء · مهلة التوريد · التزام الموردين OTD · نسبة نفاد المخزون.
 *
 * كل الحساب في `procurementKpis.js` الخالص المُختبَر؛ هذا عرضٌ حيّ له، وكل رقمٍ
 * يحمل مقامه (عيّنته) فتُقرأ الثقة فيه.
 */

const DOC_CAP = 800;
const KPI_WINDOW_DAYS = 90;
const DAY_MS = 86400000;

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const days = (v) => (v == null ? '—' : `${v.toFixed(1)} يوم`);
const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');

/** لون المؤشر حسب هدفه. `invert` للمؤشرات التي الأقلّ فيها أفضل (المدد والنفاد). */
function tone(v, good, ok, invert = false) {
  if (v == null) return '#6b7280';
  const val = invert ? -v : v;
  const g = invert ? -good : good;
  const o = invert ? -ok : ok;
  if (val >= g) return '#10b981';
  if (val >= o) return '#f59e0b';
  return '#ef4444';
}

export default function ProcurementKpis() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const nowMs = useMemo(() => Date.now(), [docs]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const u = listenAllDocuments(setDocs, DOC_CAP);
    return () => u?.();
  }, [me]);

  const kpis = useMemo(() => computeProcurementKpis(docs, { nowMs, windowDays: KPI_WINDOW_DAYS }), [docs, nowMs]);

  const truncated = docs.length >= DOC_CAP;
  const oldestMs = useMemo(() => {
    let m = null;
    for (const d of docs) {
      const t = toMillis(d?.createdAt);
      if (t != null && (m == null || t < m)) m = t;
    }
    return m;
  }, [docs]);
  const windowIncomplete = truncated && oldestMs != null && oldestMs > nowMs - KPI_WINDOW_DAYS * DAY_MS;

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  const base = getBasePath();
  const { poCycle, leadTime, otd, stockout } = kpis;

  return (
    <div dir="rtl" className="space-y-6">
      {truncated && (
        <div
          className={`rounded-xl border p-3 text-xs leading-relaxed ${
            windowIncomplete
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          {windowIncomplete
            ? `⚠️ المؤشرات محسوبة على جزءٍ من آخر ${KPI_WINDOW_DAYS} يومًا فقط — بلغت اللوحة حدّ عرض ${num(DOC_CAP)} مستند، فقد تكون الأرقام ناقصة. للدقّة الكاملة عند هذا الحجم يلزم تجميع خادميّ.`
            : `ℹ️ محسوبة على آخر ${KPI_WINDOW_DAYS} يومًا (نافذة مكتملة)، من أحدث ${num(DOC_CAP)} مستند.`}
        </div>
      )}

      {/* ── المؤشرات الأربعة للمشتريات ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="مدة دورة أمر الشراء"
          hint="من رفع الطلب PR لإصدار الأمر PO · الأقلّ أفضل"
          value={days(poCycle.avgDays)}
          color={tone(poCycle.avgDays, 3, 7, true)}
          basis={poCycle.count ? `متوسط ${poCycle.count} أمرًا · وسيط ${days(poCycle.medianDays)}` : 'لا عيّنة كافية بعد'}
        />
        <Kpi
          label="مهلة التوريد"
          hint="من إصدار الأمر للاستلام GRN · الأقلّ أفضل"
          value={days(leadTime.avgDays)}
          color={tone(leadTime.avgDays, 7, 21, true)}
          basis={leadTime.count ? `متوسط ${leadTime.count} استلامًا · وسيط ${days(leadTime.medianDays)}` : 'لا عيّنة كافية بعد'}
        />
        <Kpi
          label="التزام الموردين (OTD)"
          hint="استلامٌ في موعده المطلوب أو قبله · هدف ≥90%"
          value={pct(otd.rate)}
          color={tone(otd.rate, 0.9, 0.75)}
          basis={otd.total ? `${num(otd.onTime)} من ${num(otd.total)} استلامًا في موعده` : 'لا أمرٌ بتاريخ تسليمٍ مطلوب بعد'}
        />
        <Kpi
          label="نسبة نفاد المخزون"
          hint="أصنافٌ عجز المخزون عنها ÷ المطلوبة · الأقلّ أفضل"
          value={pct(stockout.rate)}
          color={tone(stockout.rate, 0.05, 0.15, true)}
          basis={stockout.orderedItems ? `${num(stockout.stockoutItems)} صنفًا نفد من ${num(stockout.orderedItems)} مطلوبًا` : 'لا أوامر بيعٍ بعد'}
        />
      </div>

      {/* ── ملاحظة تفسيرية ── */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
        <p className="text-xs text-gray-300 leading-relaxed">
          <span className="text-brand-gold font-bold">لماذا هذه المؤشرات؟</span> هي المحور الرابع في مقابلة تقييم
          السلاسل — «الأداء والمؤشرات». وكلٌّ منها مردودٌ إلى مستنده: مدة الدورة من طوابع الطلب والأمر، ومهلة التوريد
          من الأمر والاستلام، والالتزام من تاريخ التسليم المطلوب مقابل الاستلام الفعليّ.
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          ملاحظة صدقٍ: <span className="text-gray-300">التزام الموردين (OTD)</span> هنا يقيس التزام <span className="text-gray-300">مورّدينا</span> —
          وهو غير <span className="text-gray-300">OTIF الأسطول</span> في لوحة سلاسل الإمداد الذي يقيس التزام <span className="text-gray-300">شاحناتنا</span>.
          للمؤشرات التشغيلية الأربعة (التنفيذ · دورة البيع · دقّة المخزون · دقّة التسليم) انظر{' '}
          <a href={`${base}/dashboard/command-center`} className="text-brand-gold hover:underline">لوحة القيادة التشغيلية ↗</a>.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, hint, value, color, basis }) {
  return (
    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="text-sm font-bold text-gray-100 mt-1">{label}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>
      <div className="text-[10px] text-gray-400 mt-2 border-t border-white/5 pt-2">{basis}</div>
    </div>
  );
}

function Notice({ children }) {
  return <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-4">{children}</div>;
}
