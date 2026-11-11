/**
 * لوحة «العهد النقديّة» — شاشةٌ تفاعليّةٌ مستقلّةٌ بمجموعة Firestore خاصّة
 * (`cash_custody`). سجلٌّ نقديٌّ لحمَلة العهد (موقع ١٥٥ ومخزن الرحبة): استلامُ
 * عهدةٍ ⟵ مصروفاتٌ بفواتيرَ مبوّبة ⟵ رصيدٌ لكلّ حامل، وكشفُ عهدةٍ يُطبع.
 *
 * ★★★ **نقديّةٌ لا عينيّة:** لا علاقةَ لها بـ`/dashboard/custody` (عهدُ الأجهزة
 *     والمعدّات) ولا بدفتر القيد المزدوج — سجلٌّ قائمٌ بذاته.
 *
 * البنيةُ ثلاثُ طبقات (نمط البوّابة) داخل `.o_theme`:
 *   ① تدخّلٌ الآن/ملخّص — بطاقةُ رصيدٍ لكلّ حامل، وتنبيهٌ أحمرُ للسالب والمنخفض.
 *   ② تسجيلٌ سريع       — نموذجا «استلام عهدة» و«مصروف».
 *   ③ الفهرس           — كلُّ القيود بتصفيةٍ، وزرُّ طباعة كشف العهدة لكلّ حامل.
 *
 * المبالغُ بالدينار الليبيّ (وحدة money.js الصغرى)، أرقامٌ لاتينيّة، بلا إيموجي،
 * والأحمرُ للتحذير وحدَه.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  subscribeCashCustody,
  addReceipt,
  addExpense,
  addApproval,
  DEFAULT_SITE,
  CUSTODY_SITES,
} from '../../../services/custody/cashCustodyService.js';
import {
  CUSTODY_CATEGORIES,
  CUSTODY_COMPANIES,
  CUSTODY_KINDS,
  canManageCustody,
  listCustodians,
  custodyBalance,
  custodyStatement,
  custodyDistribution,
  custodyClosing,
  custodyCap,
  expenseStatus,
  pendingApprovals,
  custodySiteGroups,
  custodySiteNames,
} from '../../../services/custody/cashCustody.js';
import { fromMinor, toMinor } from '../../../services/accounting/money.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { createShops } from '../../../services/shops/shopsService.js';
import { db } from '../../../services/_db/index.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * صياغةُ الدينار الليبيّ — أرقامٌ لاتينيّة (R2) وثلاثُ منازلَ (الدرهم). القيمةُ
 * تأتي بالوحدة الصغرى وتُحوَّل بـ`fromMinor` فلا حسابَ عائمٍ هشّ.
 */
const LYD_FMT = new Intl.NumberFormat('ar-LY-u-nu-latn', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
function dinar(minor) {
  return `${LYD_FMT.format(fromMinor(minor))} د.ل`;
}

/** نسبةُ «قارب النفاد»: المتبقّي موجبٌ لكنّه ≤ ١٠٪ من المستلَم. */
function balanceLevel(b) {
  if (b.remaining < 0) return 'negative';
  if (b.received > 0 && b.remaining <= b.received * 0.1) return 'low';
  return 'ok';
}

export default function CashCustodyBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // ‹توسيع العهدة› ماستر القطاع/المخزن للمواقع الديناميّة.
  const [warehouses, setWarehouses] = useState([]);
  const [shops, setShops] = useState([]);

  // تصفيةُ الفهرس.
  const [fCustodian, setFCustodian] = useState('');
  const [fSite, setFSite] = useState('');
  const [fKind, setFKind] = useState('');
  const [fCategory, setFCategory] = useState('');

  // مدى كشف العهدة (اختياريّ) + هدفُ الطباعة.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [printTarget, setPrintTarget] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    return subscribeCashCustody(
      (list, hasPending) => {
        setRows(list);
        setPending(hasPending);
      },
      (e) => setErr(e?.message || 'تعذّر الاتصال بالسحابة.')
    );
  }, [me]);

  // ‹توسيع العهدة› المخازنُ الحيّة (اشتراك) والقطاعاتُ (مرّةً) — المواقعُ منها.
  // أيُّ فشلٍ هنا لا يُعطّل الشاشة: تُستعمل المواقعُ السابقةُ احتياطًا.
  useEffect(() => {
    if (!me) return undefined;
    return subscribeWarehouses(
      (list) => setWarehouses(Array.isArray(list) ? list : []),
      () => setWarehouses([])
    );
  }, [me]);

  useEffect(() => {
    if (!me) return undefined;
    let alive = true;
    (async () => {
      try {
        const list = await createShops(db).listActive();
        if (alive) setShops(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setShops([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  // الطباعةُ بعد رسمِ العرض المخفيّ، وتُمسح عند الانتهاء.
  useEffect(() => {
    if (!printTarget) return undefined;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* الطباعةُ غيرُ متاحة — لا شيء يُفعل. */
      }
    }, 60);
    const after = () => setPrintTarget(null);
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [printTarget]);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  const role = me?.role;
  const canManage = canManageCustody(role);
  const custodians = useMemo(() => listCustodians(rows), [rows]);

  // ‹توسيع العهدة› مواقعُ العهدة من المخازن مجمَّعةً بقطاعها، وتُضمُّ مواقعُ القيود
  // القديمة. فارغًا تمامًا نرجع للقائمة الثابتة القديمة (لا شاشةٌ بلا مواقع).
  const legacySites = useMemo(() => [...new Set(rows.map((r) => String(r.site || '').trim()).filter(Boolean))], [rows]);
  const siteGroups = useMemo(() => {
    const groups = custodySiteGroups(warehouses, shops, legacySites);
    if (custodySiteNames(groups).length) return groups;
    return [{ sector: '', sites: CUSTODY_SITES }]; // احتياطُ الإقلاع قبل تحميل المخازن
  }, [warehouses, shops, legacySites]);
  const siteNames = useMemo(() => custodySiteNames(siteGroups), [siteGroups]);
  const defaultSite = useMemo(() => siteNames[0] || DEFAULT_SITE, [siteNames]);

  // ‹توسيع العهدة› مصروفاتٌ تجاوزت سقفَ حاملها ولم تُعتمد بعد.
  const approvalQueue = useMemo(() => pendingApprovals(rows), [rows]);
  // ‹مراجعة› عددُ القيود النقديّة (بلا قيود الاعتماد) — مقامُ عدّاد الفهرس، وإلّا
  // بدا فلترٌ مفعَّلٌ وهو غيرُ مفعَّل حين يوجد اعتمادٌ (visibleRows يستثني الاعتماد).
  const cashCount = useMemo(() => rows.filter((r) => r.kind !== CUSTODY_KINDS.APPROVAL).length, [rows]);
  const capByCustodian = useMemo(() => {
    const m = {};
    for (const c of custodians) m[c] = custodyCap(rows, c);
    return m;
  }, [custodians, rows]);

  /** ملخّصُ كلّ حامل عهدة (رصيدٌ ومستواه). */
  const summary = useMemo(
    () =>
      custodians.map((c) => {
        const b = custodyBalance(rows, c);
        return { custodian: c, ...b, level: balanceLevel(b) };
      }),
    [custodians, rows]
  );

  const alerts = useMemo(() => summary.filter((s) => s.level !== 'ok'), [summary]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          // ‹توسيع العهدة› الاعتمادُ قيدٌ حوكميٌّ لا نقديّ — لا يظهر في فهرس القيود.
          r.kind !== CUSTODY_KINDS.APPROVAL &&
          (!fCustodian || r.custodian === fCustodian) &&
          (!fSite || r.site === fSite) &&
          (!fKind || r.kind === fKind) &&
          (!fCategory || r.category === fCategory)
      ),
    [rows, fCustodian, fSite, fKind, fCategory]
  );

  const totals = useMemo(() => {
    let received = 0;
    let spent = 0;
    for (const r of visibleRows) {
      if (r.kind === CUSTODY_KINDS.EXPENSE) spent += Math.round(Number(r.amount) || 0);
      else received += Math.round(Number(r.amount) || 0);
    }
    return { received, spent };
  }, [visibleRows]);

  function printStatement(custodian) {
    setErr('');
    setPrintTarget({ custodian, from, to });
  }

  // ‹توسيع العهدة› اعتمادُ مصروفٍ تجاوز السقف — قيدٌ حوكميٌّ ملحقٌ لا يمسّ الرصيد.
  async function approveExpense(exp) {
    setErr('');
    try {
      await addApproval({ expenseId: exp.id, custodian: exp.custodian, note: '' }, me);
      flash(`اعتُمد مصروفُ «${exp.custodian}» (${exp.invoiceNo || exp.id}) وحُفظ في السحابة.`);
    } catch (ex) {
      setErr(ex?.message || 'تعذّر اعتمادُ المصروف.');
    }
  }

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_ds_card">
            <div className="o_dashboard_empty">جارٍ التحقّق…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title">
              <Icon name="shield" size={16} /> غير مصرّح
            </div>
            سجّل الدخول لعرض العهد النقديّة.
          </div>
        </div>
      </div>
    );
  }

  const cols = [
    { key: 'date', label: 'التاريخ' },
    { key: 'kind', label: 'النوع' },
    { key: 'custodian', label: 'حامل العهدة' },
    { key: 'category', label: 'الفئة' },
    { key: 'invoiceNo', label: 'رقم الفاتورة' },
    { key: 'received', label: 'وارد (استلام)', numeric: true },
    { key: 'spent', label: 'منصرف (مصروف)', numeric: true },
    { key: 'status', label: 'الاعتماد' },
    { key: 'site', label: 'الموقع' },
    { key: 'by', label: 'المُسجِّل' },
  ];

  const listRows = visibleRows.map((r) => {
    const isExpense = r.kind === CUSTODY_KINDS.EXPENSE;
    let status = '—';
    if (isExpense) {
      const st = expenseStatus(rows, r, capByCustodian[r.custodian]);
      if (st === 'approved') status = <Badge variant="done">معتمَد</Badge>;
      else if (st === 'pending') status = <Badge variant="danger">بانتظار الاعتماد</Badge>;
    } else if (Number(r.cap) > 0) {
      status = <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>سقف: {dinar(r.cap)}</span>;
    }
    return {
      id: r.id,
      cells: {
        date: r.date || '—',
        kind: (
          <Badge variant={isExpense ? 'warn' : 'progress'}>{isExpense ? 'مصروف' : 'استلام'}</Badge>
        ),
        custodian: <span className="decoration-bf">{r.custodian || '—'}</span>,
        category: isExpense ? r.category || 'أخرى' : '—',
        invoiceNo: isExpense ? r.invoiceNo || '—' : '—',
        received: !isExpense ? dinar(r.amount) : '—',
        spent: isExpense ? dinar(r.amount) : '—',
        status,
        site: r.site || '—',
        by: r.createdByName || '—',
      },
    };
  });

  return (
    <div className="o_theme" dir="rtl">
      <div className="cc-screen">
        <div className="o_control_panel">
          <div className="o_cp_start">
            <nav className="o_breadcrumb" aria-label="مسار التنقّل">
              <span className="o_active">العهد النقديّة</span>
            </nav>
          </div>
          <div className="o_cp_end">
            <span className="o_badge o_badge-draft" title="حالة المزامنة مع السحابة">
              <Icon name="globe" size={13} /> {pending ? 'بانتظار المزامنة…' : 'متزامن'}
            </span>
          </div>
        </div>

        <div className="o_ds">
          {msg && <div className="o_alert success">{msg}</div>}
          {err && <div className="o_alert danger">{err}</div>}

          {/* تنبيهُ الأرصدةِ السالبةِ أو المنخفضة — الأحمرُ للسالب وحدَه */}
          {alerts.length > 0 && (
            <div
              className={alerts.some((a) => a.level === 'negative') ? 'o_alert danger' : 'o_alert'}
              style={
                alerts.some((a) => a.level === 'negative')
                  ? undefined
                  : {
                      background: 'var(--o-amber-50, #fff8e1)',
                      border: '1px solid var(--o-amber-200, #ffe08a)',
                      color: 'var(--o-gray-800, #333)',
                    }
              }
            >
              <div className="o_alert_title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="alertTriangle" size={16} /> انتباه للأرصدة
              </div>
              {alerts.map((a) => (
                <div key={a.custodian} style={{ fontSize: 'var(--o-font-size-sm)' }}>
                  {a.custodian}: المتبقّي{' '}
                  <strong style={a.level === 'negative' ? { color: 'var(--o-text-danger)' } : undefined}>
                    {dinar(a.remaining)}
                  </strong>{' '}
                  {a.level === 'negative' ? '(رصيدٌ سالب — مصروفٌ فوق العهدة)' : '(قارب النفاد — يحتاج تزويدًا)'}
                </div>
              ))}
            </div>
          )}

          {/* ‹توسيع العهدة› مصروفاتٌ فوق السقف بانتظار الاعتماد — تدخّلٌ إداريّ */}
          {canManage && approvalQueue.length > 0 && (
            <div
              className="o_ds_card o_ds_pad"
              style={{ marginBottom: '18px', border: '1px solid var(--o-amber-200, #ffe08a)' }}
            >
              <h3
                className="o_form_title"
                style={{ fontSize: '15px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Icon name="alertTriangle" size={16} /> مصروفاتٌ بانتظار الاعتماد ({int(approvalQueue.length)})
              </h3>
              <div style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-gray-600)', marginBottom: '10px' }}>
                مصروفاتٌ تجاوزت سقفَ حاملها — صُرفت فعلًا وتُنتظر مصادقتُك. الاعتمادُ توثيقٌ لا إلغاء؛ وتصحيحُ
                الخطأ بقيدٍ مضادّ.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {approvalQueue.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                      border: '1px solid var(--o-border-color)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--o-font-size-sm)' }}>
                      <span>
                        <strong className="decoration-bf">{e.custodian}</strong> — {dinar(e.amount)}{' '}
                        <span style={{ color: 'var(--o-gray-500)' }}>
                          ({e.category || 'أخرى'} · فاتورة {e.invoiceNo || '—'} · {e.date})
                        </span>
                      </span>
                      <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-text-danger)' }}>
                        فوق السقف ({dinar(capByCustodian[e.custodian] || 0)})
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => approveExpense(e)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Icon name="checkCircle" size={14} /> اعتمِد
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ① تدخّلٌ الآن / ملخّص الأرصدة */}
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
            <h3
              className="o_form_title"
              style={{ fontSize: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Icon name="dollarSign" size={16} /> أرصدةُ حمَلة العهد
            </h3>

            {/* مدى كشف العهدة (اختياريّ) — يُطبَّق على ما تطبعه */}
            <div
              className="no-print"
              style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}
            >
              <label className="o_field_block" style={{ margin: 0 }}>
                <span className="o_form_label">من تاريخ (لكشف العهدة)</span>
                <input className="o_input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="o_field_block" style={{ margin: 0 }}>
                <span className="o_form_label">إلى تاريخ</span>
                <input className="o_input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', alignSelf: 'center' }}>
                اتركهما فارغين لكشفٍ عن كامل المدّة.
              </span>
            </div>

            {summary.length === 0 ? (
              <div className="o_dashboard_empty">لا قيودَ بعد — سجّل استلامَ عهدةٍ لتبدأ.</div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '12px',
                }}
              >
                {summary.map((s) => (
                  <div
                    key={s.custodian}
                    style={{
                      border: '1px solid var(--o-border-color)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span className="decoration-bf" style={{ fontWeight: 700 }}>
                        {s.custodian}
                      </span>
                      {s.level === 'negative' ? (
                        <Badge variant="danger">رصيدٌ سالب</Badge>
                      ) : s.level === 'low' ? (
                        <Badge variant="warn">قارب النفاد</Badge>
                      ) : (
                        <Badge variant="done">سليم</Badge>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: 'var(--o-font-size-sm)' }}>
                      <span style={{ color: 'var(--o-gray-600)' }}>
                        المستلَم: <strong>{dinar(s.received)}</strong>
                      </span>
                      <span style={{ color: 'var(--o-gray-600)' }}>
                        المصروف: <strong>{dinar(s.spent)}</strong>
                      </span>
                      <span>
                        المتبقّي:{' '}
                        <strong style={s.remaining < 0 ? { color: 'var(--o-text-danger)' } : { fontSize: '15px' }}>
                          {dinar(s.remaining)}
                        </strong>
                      </span>
                      {capByCustodian[s.custodian] != null && (
                        <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
                          سقفُ المصروف الواحد: <strong>{dinar(capByCustodian[s.custodian])}</strong>{' '}
                          <span>(ما فوقه يحتاج اعتمادًا)</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm no-print"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start' }}
                      onClick={() => printStatement(s.custodian)}
                    >
                      <Icon name="printer" size={14} /> طباعة كشف العهدة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ② تسجيلٌ سريع */}
          {canManage ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '18px',
              }}
            >
              <ReceiptForm
                profile={me}
                custodians={custodians}
                siteGroups={siteGroups}
                defaultSite={defaultSite}
                onSaved={() => flash('سُجّل استلامُ العهدة وحُفظ في السحابة.')}
                onError={(t) => setErr(t)}
              />
              <ExpenseForm
                profile={me}
                custodians={custodians}
                siteGroups={siteGroups}
                defaultSite={defaultSite}
                capByCustodian={capByCustodian}
                onSaved={() => flash('سُجّل المصروفُ وحُفظ في السحابة.')}
                onError={(t) => setErr(t)}
              />
            </div>
          ) : (
            <div className="o_alert" style={{ marginBottom: '18px' }}>
              التسجيلُ للمدير العامّ ومدير المستودع والمالية والخزينة. حسابُك للاطّلاع فقط.
            </div>
          )}

          {/* ③ الفهرس الكامل */}
          <div className="o_ds_card">
            <div
              className="o_ds_pad"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                borderBottom: '1px solid var(--o-border-color)',
              }}
            >
              <h3
                className="o_form_title"
                style={{ fontSize: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Icon name="clipboardList" size={16} /> فهرس القيود
                <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', fontWeight: 400 }}>
                  ({int(visibleRows.length)} من {int(cashCount)})
                </span>
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  className="o_input"
                  value={fCustodian}
                  onChange={(e) => setFCustodian(e.target.value)}
                  aria-label="تصفية بالحامل"
                >
                  <option value="">كلُّ الحمَلة</option>
                  {custodians.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select className="o_input" value={fSite} onChange={(e) => setFSite(e.target.value)} aria-label="تصفية بالموقع">
                  <option value="">كلُّ المواقع</option>
                  {siteNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select className="o_input" value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="تصفية بالنوع">
                  <option value="">النوعان</option>
                  <option value={CUSTODY_KINDS.RECEIPT}>استلام</option>
                  <option value={CUSTODY_KINDS.EXPENSE}>مصروف</option>
                </select>
                <select
                  className="o_input"
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  aria-label="تصفية بالفئة"
                >
                  <option value="">كلُّ الفئات</option>
                  {CUSTODY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {visibleRows.length === 0 ? (
              <div className="o_dashboard_empty">لا قيودَ بهذه التصفية.</div>
            ) : (
              <ListView
                selectable={false}
                columns={cols}
                rows={listRows}
                footer={{
                  label: 'الإجمالي (حسب التصفية)',
                  cells: { received: dinar(totals.received), spent: dinar(totals.spent) },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {printTarget && (
        <CashCustodyStatementPrint
          rows={rows}
          custodian={printTarget.custodian}
          from={printTarget.from}
          to={printTarget.to}
        />
      )}
    </div>
  );
}

/* ═══════════════════ النماذج ═══════════════════ */

function ReceiptForm({ profile, custodians, siteGroups, defaultSite, onSaved, onError }) {
  const [custodian, setCustodian] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [site, setSite] = useState(defaultSite || DEFAULT_SITE);
  const [cap, setCap] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // ‹مراجعة› يتبع الموقعُ الافتراضيَّ **ما لم يختر المستخدمُ بعد** — فلا يُدهَس
  // اختيارُه حين يصل ماسترُ المخزن أو يغيّره مستخدمٌ آخر (حارسُ «لا إفساد»).
  const sitePicked = useRef(false);
  const pickSite = (v) => {
    sitePicked.current = true;
    setSite(v);
  };

  useEffect(() => {
    if (!sitePicked.current) setSite(defaultSite || DEFAULT_SITE);
  }, [defaultSite]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addReceipt({ custodian, amount, date, site, note, cap }, profile);
      setCustodian('');
      setAmount('');
      setDate(todayIso());
      sitePicked.current = false;
      setSite(defaultSite || DEFAULT_SITE);
      setCap('');
      setNote('');
      onSaved();
    } catch (ex) {
      onError(ex?.message || 'تعذّر تسجيل الاستلام.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="o_ds_card o_ds_pad" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 className="o_form_title" style={{ fontSize: '15px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="plus" size={16} /> تسجيل استلام عهدة
      </h3>
      <CustodianField value={custodian} onChange={setCustodian} custodians={custodians} />
      <div className="o_form_grid">
        <L label="المبلغ (دينار ليبيّ)" required>
          <input className="o_input" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </L>
        <L label="التاريخ" required>
          <input className="o_input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </L>
        <SiteField value={site} onChange={pickSite} groups={siteGroups} />
        <L label="سقف المصروف الواحد (اختياريّ)">
          <input
            className="o_input"
            type="number"
            min="0"
            step="0.001"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="فوقه يحتاج المصروفُ اعتمادًا"
          />
        </L>
      </div>
      <L label="ملاحظة">
        <input className="o_input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="سببُ التسليم أو مرجعُه…" />
      </L>
      <div className="o_form_actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'جارٍ الحفظ…' : 'تسجيل الاستلام'}
        </button>
      </div>
    </form>
  );
}

function ExpenseForm({ profile, custodians, siteGroups, defaultSite, capByCustodian, onSaved, onError }) {
  const [custodian, setCustodian] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CUSTODY_CATEGORIES[0]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(todayIso());
  const [site, setSite] = useState(defaultSite || DEFAULT_SITE);
  const [note, setNote] = useState('');
  // ‹توزيع الشركات› الشركةُ المستفيدةُ اختياريّةٌ — فراغٌ = «غير محدّد» يُسوَّى لاحقًا.
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  // ‹مراجعة› يتبع الموقعُ الافتراضيَّ ما لم يختر المستخدمُ بعد (حارسُ «لا إفساد»).
  const sitePicked = useRef(false);
  const pickSite = (v) => {
    sitePicked.current = true;
    setSite(v);
  };

  useEffect(() => {
    if (!sitePicked.current) setSite(defaultSite || DEFAULT_SITE);
  }, [defaultSite]);

  // ‹توسيع العهدة› تنبيهُ تجاوز السقف — لا يمنع التسجيل، بل يُعلم أنّه سيحتاج اعتمادًا.
  const custCap = capByCustodian ? capByCustodian[String(custodian || '').trim()] ?? null : null;
  const overCap = custCap != null && String(amount).trim() !== '' && toMinor(amount) > custCap;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addExpense({ custodian, amount, category, invoiceNo, company, date, site, note }, profile);
      setCustodian('');
      setAmount('');
      setCategory(CUSTODY_CATEGORIES[0]);
      setInvoiceNo('');
      setCompany('');
      setDate(todayIso());
      sitePicked.current = false;
      setSite(defaultSite || DEFAULT_SITE);
      setNote('');
      onSaved();
    } catch (ex) {
      onError(ex?.message || 'تعذّر تسجيل المصروف.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="o_ds_card o_ds_pad" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 className="o_form_title" style={{ fontSize: '15px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="fileText" size={16} /> تسجيل مصروف
      </h3>
      <CustodianField value={custodian} onChange={setCustodian} custodians={custodians} />
      <div className="o_form_grid">
        <L label="المبلغ (دينار ليبيّ)" required>
          <input className="o_input" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </L>
        <L label="الفئة" required>
          <select className="o_input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CUSTODY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </L>
        <L label="رقم الفاتورة" required>
          <input className="o_input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required placeholder="رقمُ الفاتورة أو السند" />
        </L>
        <L label="الشركة المستفيدة">
          <select className="o_input" value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">— غير محدّد —</option>
            {CUSTODY_COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </L>
        <L label="التاريخ" required>
          <input className="o_input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </L>
        <SiteField value={site} onChange={pickSite} groups={siteGroups} />
      </div>
      {overCap && (
        <div
          className="o_alert"
          style={{
            background: 'var(--o-amber-50, #fff8e1)',
            border: '1px solid var(--o-amber-200, #ffe08a)',
            color: 'var(--o-gray-800, #333)',
            fontSize: 'var(--o-font-size-sm)',
          }}
        >
          <Icon name="alertTriangle" size={14} /> هذا المصروفُ فوق سقفِ «{custodian}» ({dinar(custCap)}) — يُسجَّل
          ويُنقص الرصيد، ثمّ يظهر في «بانتظار الاعتماد» حتّى يصادقه مديرٌ. (تنبيهٌ لا منع.)
        </div>
      )}
      <L label="ملاحظة">
        <input className="o_input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="بيانُ المصروف…" />
      </L>
      <div className="o_form_actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'جارٍ الحفظ…' : 'تسجيل المصروف'}
        </button>
      </div>
    </form>
  );
}

function CustodianField({ value, onChange, custodians }) {
  return (
    <L label="حامل العهدة" required>
      <input
        className="o_input"
        list="cc-custodians"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="اسمُ حامل العهدة"
      />
      <datalist id="cc-custodians">
        {custodians.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </L>
  );
}

function SiteField({ value, onChange, groups }) {
  // المجموعاتُ من ماستر القطاع/المخزن؛ واحتياطًا القائمةُ الثابتةُ القديمة.
  const list = Array.isArray(groups) && groups.length ? groups : [{ sector: '', sites: CUSTODY_SITES }];
  const known = new Set(list.flatMap((g) => g.sites || []));
  return (
    <L label="الموقع" required>
      <select className="o_input" value={value} onChange={(e) => onChange(e.target.value)}>
        {/* قيمةٌ خارجَ القائمة (موروثةٌ أو افتراضٌ قبل التحميل) تبقى ظاهرةً مختارة. */}
        {value && !known.has(value) && <option value={value}>{value}</option>}
        {list.map((g, i) =>
          g.sector ? (
            <optgroup key={g.sector} label={g.sector}>
              {g.sites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          ) : (
            g.sites.map((s) => (
              <option key={`${i}-${s}`} value={s}>
                {s}
              </option>
            ))
          )
        )}
      </select>
    </L>
  );
}

function L({ label, required, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

/* ═══════════════════ كشفُ العهدة — عرضُ طباعةٍ بلا هويّةِ شركة ═══════════════════ */

/**
 * ★★★ **بلا أيّ اسمٍ أو شعارٍ أو صفةِ شركة** (شرطُ المالك الإلزاميّ). ورقةٌ
 *     نظيفة: عنوان «كشف عهدة» · حامل العهدة · الموقع · المدى · جدولُ القيود ·
 *     الرصيدُ الافتتاحيُّ والختاميّ · خاناتُ توقيعٍ (حامل العهدة · المعتمِد).
 *
 * الكساءُ مخفيٌّ على الشاشة (`.cc-print { display:none }`) ويظهر في الطباعة
 * وحدَها، وتُخفى شاشةُ البوّابة (`.cc-screen`) حينها — فلا تُطبع الطبقتان معًا.
 */
function CashCustodyStatementPrint({ rows, custodian, from, to }) {
  const ref = useRef(null);
  const { opening, lines, closing } = custodyStatement(rows, custodian, { from, to });
  // ‹توزيع الشركات والإقفال بمسارين› — فجوتا آلية العهد (المصروفُ المسوَّم بشركةٍ
  // يُوزَّع ويُقفَل؛ وغيرُ المسوَّم يُفرَد تحت «غير محدّد» فيُسوَّى أوّلًا).
  const distribution = custodyDistribution(rows, custodian, { from, to });
  const tracks = custodyClosing(rows, custodian, { from, to });
  const site = useMemo(() => {
    const sites = [...new Set(rows.filter((r) => r.custodian === custodian && r.site).map((r) => r.site))];
    return sites.join(' · ') || '—';
  }, [rows, custodian]);

  const rangeText = from || to ? `${from || '…'} ← ${to || '…'}` : 'كامل المدّة';

  return (
    <div className="cc-print" dir="rtl" ref={ref}>
      <style>{PRINT_CSS}</style>

      <header className="ccp-head">
        <h1>كشف عهدة نقديّة</h1>
        <div className="ccp-meta">
          <span>
            حامل العهدة: <strong>{custodian}</strong>
          </span>
          <span>الموقع: {site}</span>
          <span>المدّة: {rangeText}</span>
          <span>تاريخ الطباعة: {todayIso()}</span>
        </div>
      </header>

      <table className="ccp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>الفئة</th>
            <th>الشركة</th>
            <th>رقم الفاتورة</th>
            <th>وارد</th>
            <th>منصرف</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ccp-opening">
            <td colSpan={8}>الرصيد الافتتاحيّ</td>
            <td className="ccp-num">{dinar(opening)}</td>
          </tr>
          {lines.map((l, i) => {
            const isExpense = l.kind === CUSTODY_KINDS.EXPENSE;
            return (
              <tr key={l.id || i}>
                <td>{i + 1}</td>
                <td>{l.date || '—'}</td>
                <td>{isExpense ? 'مصروف' : 'استلام'}</td>
                <td>{isExpense ? l.category || 'أخرى' : '—'}</td>
                <td>{isExpense ? l.company || '—' : '—'}</td>
                <td>{isExpense ? l.invoiceNo || '—' : '—'}</td>
                <td className="ccp-num">{!isExpense ? dinar(l.amount) : '—'}</td>
                <td className="ccp-num">{isExpense ? dinar(l.amount) : '—'}</td>
                <td className="ccp-num">{dinar(l.running)}</td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={9} className="ccp-empty">
                لا حركاتٍ في هذه المدّة.
              </td>
            </tr>
          )}
          <tr className="ccp-closing">
            <td colSpan={8}>الرصيد الختاميّ</td>
            <td className="ccp-num">{dinar(closing)}</td>
          </tr>
        </tbody>
      </table>

      {distribution.length > 0 && (
        <>
          <h2 className="ccp-subhead">توزيع المصروف على الشركات المستفيدة</h2>
          <table className="ccp-table">
            <thead>
              <tr>
                <th>الشركة</th>
                <th>قيمة التحميل</th>
                <th>جهة الإقفال</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((d) => (
                <tr key={d.company}>
                  <td>{d.company}</td>
                  <td className="ccp-num">{dinar(d.amount)}</td>
                  <td>{d.track || '— يُحدَّد —'}</td>
                </tr>
              ))}
              <tr className="ccp-closing">
                <td>إجمالي المصروف</td>
                <td className="ccp-num">{dinar(distribution.reduce((s, d) => s + d.amount, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>

          <h2 className="ccp-subhead">الإقفال بمسارين</h2>
          <table className="ccp-table">
            <thead>
              <tr>
                <th>جهة الإقفال</th>
                <th>الشركات</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.track}>
                  <td>
                    <strong>{t.track}</strong>
                  </td>
                  <td>{t.companies.map((x) => x.company).join(' · ')}</td>
                  <td className="ccp-num">{dinar(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="ccp-signs">
        <div className="ccp-sign">
          <div className="ccp-sign-line" />
          <div className="ccp-sign-label">حامل العهدة</div>
        </div>
        <div className="ccp-sign">
          <div className="ccp-sign-line" />
          <div className="ccp-sign-label">المعتمِد</div>
        </div>
      </div>
    </div>
  );
}

/**
 * أنماطُ الطباعة — بلا شَوْلَةٍ مائلة في التعليقات (الكتلةُ قالبٌ نصّيّ، وأيُّ
 * شَوْلَةٍ تُغلقه فيسقط الملفّ). لا كتلةَ هويّةٍ ولا ترويسةَ شركة — عمدًا.
 */
const PRINT_CSS = `
.cc-print { display: none; }
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  body { background: #fff !important; }
  .cc-screen, .no-print { display: none !important; }
  .cc-print {
    display: block !important;
    background: #fff; color: #000; font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif;
    font-size: 10pt; width: 100%;
  }
  .cc-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .ccp-head { border-bottom: 2px solid #333; padding-bottom: 3mm; margin-bottom: 4mm; }
  .ccp-head h1 { font-size: 15pt; font-weight: 800; margin: 0 0 2mm; text-align: center; }
  .ccp-meta { display: flex; flex-wrap: wrap; gap: 2mm 8mm; font-size: 9pt; justify-content: center; }
  .ccp-subhead { font-size: 11pt; font-weight: 800; margin: 6mm 0 2mm; border-bottom: 1px solid #333; padding-bottom: 1mm; }

  .ccp-table { width: 100%; border-collapse: collapse; }
  .ccp-table th, .ccp-table td { border: 1px solid #333; padding: 1.6mm 2mm; font-size: 8.5pt; text-align: right; }
  .ccp-table th { background: #eee; font-weight: 800; }
  .ccp-num { font-family: monospace; direction: ltr; unicode-bidi: isolate; text-align: left; }
  .ccp-opening td, .ccp-closing td { background: #f3f3f3; font-weight: 800; }
  .ccp-empty { text-align: center; color: #666; }

  .ccp-signs { display: flex; gap: 10mm; margin-top: 12mm; break-inside: avoid; }
  .ccp-sign { flex: 1; text-align: center; }
  .ccp-sign-line { border-top: 1px solid #333; margin-bottom: 1.5mm; }
  .ccp-sign-label { font-size: 9pt; color: #333; }
}
`;
