import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  listenOperations,
  listenScans,
  closeOperation,
} from '../../../services/stock/operationsService.js';
import {
  buildLogRows,
  filterLogRows,
  logPeople,
  logTotals,
  workByPerson,
  logExportRows,
} from '../../../services/stock/monitorLog.js';
import { lastSeenByUser } from '../../../services/stock/scanQueue.js';
import { scopeLabel, scopeOf } from '../../../services/stock/operationScope.js';
import { formatOperationCode } from '../../../services/stock/operationCode.js';
import { exportElementToPdf } from '../../../services/reports/pdfExport.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import Pager from '../../odoo/Pager.jsx';
import { pageSlice } from '../../../services/ui/pagination.js';
import { int, num } from '../../odoo/format.js';

const LOG_PAGE = 100;

import { MANAGER_ROLES } from '../../../services/auth/roles.js';

// خرائط نوع العملية → اسم أيقونة أودو (بدل الإيموجي؛ FontAwesome غير مُحمَّل).
const OP_ICONS = {
  'جرد': 'clipboardList',
  'استلام': 'arrowDownTray',
  'صرف': 'arrowUpTray',
  'إضافة أصناف': 'layers',
  'تالف': 'alertTriangle',
  'مرتجع': 'arrowLeftRight',
};

/** يحوّل طابع Firestore الزمني إلى نص عربي مقروء. */
function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} ي`;
}

const OP_COLS = [
  { key: 'type', label: 'العملية' },
  { key: 'status', label: 'الحالة' },
  { key: 'by', label: 'المنفّذ' },
  { key: 'when', label: 'الوقت' },
];

/**
 * ★★ أعمدةُ سجلّ المتابعة — **مرجعٌ يُحتجّ به** (طلب المالك 2026-08-31).
 *
 * كان العمودُ «الكمية» وحدَه، فيقرأ المديرُ «محمد — ٥» ولا يدري أخمسةَ
 * كراتينَ أم خمسَ قطع — وهو ما تمنعه قاعدتُنا CAP-103 نفسُها. والآن:
 * الكمّيّةُ بوحدتها، ومعادلُها بوحدة الأساس (وهو وحده ما يُجمع)، والوقتُ
 * **مطلقٌ** لا نسبيًّا وحدَه (فـ«قبل ٥ د» لا تصلح ورقةً بعد أسبوع).
 */
const SCAN_COLS = [
  { key: 'when', label: 'الوقت' },
  { key: 'by', label: 'مَن قرأ' },
  { key: 'item', label: 'ماذا قرأ' },
  { key: 'qty', label: 'الكمّيّة', numeric: true },
  { key: 'base', label: 'بالأساس', numeric: true },
  { key: 'flags', label: '' },
];

const PERSON_COLS = [
  { key: 'name', label: 'العادّ' },
  { key: 'scans', label: 'قيود', numeric: true },
  { key: 'items', label: 'أصناف', numeric: true },
  { key: 'base', label: 'الإجمالي بالأساس', numeric: true },
  { key: 'seen', label: 'آخر قراءة وصلت' },
];

/**
 * شاشة متابعة العمليات — للمدير العام ومدير المستودع.
 * تعرض العمليات لحظياً، ومن يعمل عليها، وسجلّ المسح الحيّ لكل عملية.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + ListView + Badge + o_kpi + o_alert) — **المنطق (الاشتراكات
 * وخدمة الإقفال والتجميع) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2).
 */
export default function OperationsMonitor() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [selected, setSelected] = useState(null);
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  // تصفيةُ سجلّ المتابعة — بالشخص وبنصٍّ حرّ (طلب المالك: «مرجعٌ احتياطيّ»).
  const [person, setPerson] = useState('all');
  const [term, setTerm] = useState('');
  const [logPage, setLogPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  // عنصرُ الطباعة — `exportElementToPdf` ترفض النصّ وتشترط عنصرَ DOM حقيقيًّا.
  const printRef = useRef(null);

  // من أنا؟ ثم استمع للعمليات إن كنت مديراً.
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      const profile = user ? await fetchUserProfile(user) : null;
      setMe(profile);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !MANAGER_ROLES.includes(me.role)) return;
    const unsub = listenOperations((rows) => {
      setOps(rows);
      setLoadingOps(false);
    });
    return () => unsub();
  }, [me]);

  // سجلّ المسح الحيّ للعملية المختارة.
  useEffect(() => {
    if (!selected) {
      setScans([]);
      return;
    }
    setLoadingScans(true);
    const unsub = listenScans(selected, (rows) => {
      setScans(rows);
      setLoadingScans(false);
    });
    return () => unsub();
  }, [selected]);

  const shown = useMemo(
    () => (filter === 'all' ? ops : ops.filter((o) => o.status === filter)),
    [ops, filter]
  );

  const openCount = useMemo(() => ops.filter((o) => o.status === 'open').length, [ops]);

  /*
    سجلُّ المتابعة — الحساب كلُّه في `monitorLog.js` الخالص المختبَر، والشاشة
    تعرضه ولا تُعيد بناءه. (كان التجميعُ مكتوبًا هنا داخل `useMemo`، فلم يكن
    يُختبر سطرًا واحدًا — وهو **الجدولُ الذي يُحتجّ به** عند الخلاف.)
  */
  const logRows = useMemo(() => buildLogRows(scans, { toMillis: (s) => s?.at?.toDate?.()?.getTime?.() ?? null }), [scans]);
  const people = useMemo(() => logPeople(logRows), [logRows]);
  const shownLog = useMemo(() => filterLogRows(logRows, { person, term }), [logRows, person, term]);
  const totals = useMemo(() => logTotals(shownLog), [shownLog]);
  const byPerson = useMemo(() => workByPerson(logRows), [logRows]);
  const seenMap = useMemo(() => {
    const m = new Map();
    for (const r of lastSeenByUser(scans, (s) => s?.at?.toDate?.()?.getTime?.() ?? null)) m.set(r.name, r.lastAt);
    return m;
  }, [scans]);
  const pagedLog = useMemo(() => pageSlice(shownLog, logPage, LOG_PAGE), [shownLog, logPage]);
  useEffect(() => setLogPage(0), [person, term, selected]);

  async function handleClose(opId) {
    if (!confirm('إقفال العملية؟ لن يُقبل أي مسح جديد عليها.')) return;
    try {
      await closeOperation(opId);
      flash('أُقفلت العملية.');
    } catch {
      flash('تعذّر الإقفال (تحقّق من صلاحيتك).');
    }
  }

  function flash(t) {
    setMsg(t);
    setTimeout(() => setMsg(''), 3500);
  }

  /** طابعُ الوقت المطلق — واحدٌ للشاشة وللتصدير، فلا يفترق ملفٌّ عن جدول. */
  function stampOf(ms) {
    if (ms == null) return '—';
    return new Date(ms).toLocaleString('ar-LY-u-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  /** اسمُ الملفّ — رمزُ الجلسة ثمّ اليوم، فيُعرف مصدرُه بعد شهر. */
  function fileStem() {
    const code = formatOperationCode(sel?.code || '') || (selected || '').slice(0, 8);
    return `Audit_${code}_${new Date().toISOString().slice(0, 10)}`;
  }

  /**
   * ★ تصديرُ سجلّ المتابعة إكسل — **ما هو معروضٌ بعد التصفية** هو المُصدَّر.
   * فمن صفّى على «محمد» وصدّر، حصل على عمل محمد لا على الجلسة كلّها — وهذا
   * ما يُطلب عند الخلاف. والصفوفُ من المنطق الخالص لا تُبنى هنا.
   */
  async function exportLogExcel() {
    if (!shownLog.length) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(logExportRows(shownLog, { formatTime: stampOf })),
        'سجلّ المتابعة'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          byPerson.map((p) => ({
            'العادّ': p.name,
            'عدد القيود': p.scans,
            'أصناف مختلفة': p.items,
            'الإجمالي بوحدة الأساس': p.base,
            'قيودٌ بوحدةٍ بلا معامل': p.uncertain,
            'آخر قراءة وصلت': stampOf(seenMap.get(p.name) || null),
          }))
        ),
        'توزيع العمل'
      );
      XLSX.writeFile(wb, `${fileStem()}.xlsx`);
      flash(`صُدِّر ${shownLog.length} قيدًا إلى إكسل.`);
    } catch {
      flash('تعذّر التصدير إلى إكسل.');
    } finally {
      setExporting(false);
    }
  }

  /**
   * ★★ تصديرُ محضرٍ PDF — عبر البوّابة الوحيدة `exportElementToPdf`.
   *
   * وتُمرَّر **عنصرَ DOM** لا نصَّ HTML عمدًا وبإلزام: المدخلُ يرفض النصّ
   * لأنّ مسارَ النصّ داخل `html2pdf` يُحيي DOMPurify 3.3.1 المخبوزةَ في
   * بنائها — والحارسُ هناك مكتوبٌ ومُختبَر، فلا يُلتَفّ عليه هنا.
   */
  async function exportLogPdf() {
    if (!shownLog.length || !printRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(printRef.current, {
        margin: [10, 10, 12, 10],
        filename: `${fileStem()}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      });
      flash('صُدِّر محضرُ المتابعة PDF.');
    } catch {
      flash('تعذّر تصدير PDF.');
    } finally {
      setExporting(false);
    }
  }

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_dashboard_empty">جارٍ التحقّق…</div>
        </div>
      </div>
    );
  }

  if (!me || !MANAGER_ROLES.includes(me.role)) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> غير مصرّح</div>
            هذه الشاشة للمدير العام ومدير المستودع فقط.
          </div>
        </div>
      </div>
    );
  }

  const sel = ops.find((o) => o.id === selected);

  const opRows = shown.map((o) => ({
    id: o.id,
    decoration: selected === o.id ? 'bf' : o.status !== 'open' ? 'muted' : undefined,
    cells: {
      type: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Icon name={OP_ICONS[o.type] || 'package'} size={15} /> {o.type}
        </span>
      ),
      status: (
        <Badge variant={o.status === 'open' ? 'done' : 'draft'}>
          {o.status === 'open' ? 'مفتوحة' : 'مُقفلة'}
        </Badge>
      ),
      by: o.createdByName || 'غير معروف',
      when: (
        <span style={{ color: 'var(--o-main-color-muted)', fontSize: 'var(--o-font-size-xs)' }}>
          {fmtTime(o.createdAt)} · {fmtRelative(o.createdAt)}
        </span>
      ),
    },
  }));

  /*
    ★★ صفُّ السجلّ — كلُّ ما يحتاجه من يُراجع بعد أسبوع:
    الوقتُ مطلقًا (والنسبيُّ تحته للعين) · مَن قرأ · ماذا قرأ بباركوده
    · الكمّيّةُ **بوحدتها** · ومعادلُها بالأساس (وهو وحده ما يُجمع).
    والخصمُ يُميَّز بالإشارة لا يُخلط بقراءة.
  */
  const scanRows = pagedLog.map((r) => ({
    id: r.id,
    decoration: r.direction === 'out' ? 'muted' : undefined,
    cells: {
      when: (
        <div>
          <div style={{ fontSize: 'var(--o-font-size-xs)', fontFamily: 'monospace' }} dir="ltr">
            {r.atMs == null ? '—' : stampOf(r.atMs)}
          </div>
          <div style={{ color: 'var(--o-gray-500)', fontSize: '11px' }}>
            {r.pending ? 'لم يصل بعد' : fmtRelative(scans.find((s) => s.id === r.id)?.at)}
          </div>
        </div>
      ),
      by: <span style={{ fontWeight: 'var(--o-font-weight-medium)' }}>{r.byName}</span>,
      item: (
        <div>
          <div style={{ fontWeight: 'var(--o-font-weight-medium)' }}>{r.name}</div>
          <div style={{ color: 'var(--o-gray-500)', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)' }} dir="ltr">
            {r.barcode}{r.sku ? ` · ${r.sku}` : ''}
          </div>
        </div>
      ),
      qty: (
        <span className="decoration-bf">
          {num(r.qty)} <span style={{ fontWeight: 400, color: 'var(--o-gray-500)' }}>{r.uom || '—'}</span>
        </span>
      ),
      base: r.baseQty == null ? <span style={{ color: 'var(--o-text-warning)' }}>—</span> : num(r.baseQty),
      flags: (
        <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
          {r.direction === 'out' && <Badge variant="draft">خصم</Badge>}
          {r.uncertain && <Badge variant="progress">بلا معامل</Badge>}
          {r.collision && <Badge variant="progress">تصادم</Badge>}
        </span>
      ),
    },
  }));

  const personRows = byPerson.map((p) => ({
    id: p.name,
    cells: {
      name: <span style={{ fontWeight: 'var(--o-font-weight-medium)' }}>{p.name}</span>,
      scans: int(p.scans),
      items: int(p.items),
      base: <span className="decoration-bf">{num(p.base)}</span>,
      seen: (
        <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
          {seenMap.get(p.name) ? stampOf(seenMap.get(p.name)) : '—'}
        </span>
      ),
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">متابعة العمليات</span></nav>
        </div>
      </div>

      <div className="o_ds">
        {msg && (
          <div className="o_alert" style={{ background: 'var(--o-badge-info-bg)', color: 'var(--o-text-info)', borderColor: 'var(--o-badge-info-bg)' }}>
            {msg}
          </div>
        )}

        {/* لقطة سريعة */}
        <div className="o_dashboard_kpis">
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="clipboardList" size={20} /></span>
            <span className="o_kpi_value">{int(ops.length)}</span>
            <span className="o_kpi_label">إجمالي العمليات</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="activity" size={20} /></span>
            <span className="o_kpi_value">{int(openCount)}</span>
            <span className="o_kpi_label">مفتوحة الآن</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="checkCircle" size={20} /></span>
            <span className="o_kpi_value">{int(ops.length - openCount)}</span>
            <span className="o_kpi_label">مُقفلة</span>
          </div>
        </div>

        <div className="o_dashboard_grid2">
          {/* قائمة العمليات */}
          <div className="o_dashboard_card">
            <div className="o_dashboard_card_head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="package" size={16} /> العمليات
              </span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="o_input"
                style={{ width: 'auto' }}
              >
                <option value="all">الكل</option>
                <option value="open">مفتوحة</option>
                <option value="closed">مُقفلة</option>
              </select>
            </div>

            {loadingOps ? (
              <div className="o_dashboard_empty">جارٍ التحميل…</div>
            ) : shown.length === 0 ? (
              <div className="o_dashboard_empty">
                لا توجد عمليات بعد. تظهر هنا فور بدء أي موظّف عملية جرد أو استلام.
              </div>
            ) : (
              <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                <ListView
                  selectable={false}
                  columns={OP_COLS}
                  rows={opRows}
                  onRowClick={(row) => setSelected(row.id)}
                />
              </div>
            )}
          </div>

          {/* تفاصيل العملية المختارة */}
          <div className="o_dashboard_card">
            {!sel ? (
              <div className="o_dashboard_empty">اختر عملية من القائمة لعرض سجلّ المسح الحيّ.</div>
            ) : (
              <>
                <div className="o_dashboard_card_head">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Icon name={OP_ICONS[sel.type] || 'package'} size={16} /> {sel.type}
                    <span style={{ color: 'var(--o-gray-500)', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)' }} dir="ltr">
                      {sel.id.slice(0, 8)}
                    </span>
                  </span>
                  {sel.status === 'open' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleClose(sel.id)}>
                      <Icon name="checkCircle" size={14} /> إقفال العملية
                    </button>
                  )}
                </div>

                <div className="o_ds_pad">
                  <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 14px' }}>
                    بدأها {sel.createdByName || 'غير معروف'} · {fmtTime(sel.createdAt)}
                  </p>

                  {/* إجماليات — والجمعُ بوحدة الأساس وحدَها (CAP-103) */}
                  <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(totals.scanCount)}</span>
                      <span className="o_kpi_label">قراءة</span>
                    </div>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{num(totals.baseTotal)}</span>
                      <span className="o_kpi_label">الإجمالي بوحدة الأساس</span>
                    </div>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(totals.itemCount)}</span>
                      <span className="o_kpi_label">صنف مختلف</span>
                    </div>
                    <div className="o_kpi">
                      <span className="o_kpi_value">{int(totals.peopleCount)}</span>
                      <span className="o_kpi_label">عادّ</span>
                    </div>
                  </div>

                  {/* ما يُحسم قبل الاعتماد — يُعلَن ولا يُخفى (ق-٢) */}
                  {totals.uncertain > 0 && (
                    <div className="o_alert warning" style={{ marginBottom: '14px' }}>
                      <div className="o_alert_title">
                        <Icon name="alertTriangle" size={15} /> {int(totals.uncertain)} قيدًا بوحدةٍ بلا معامل
                      </div>
                      مجموعُها بوحدة الأساس غير مضمون — عرِّف معاملَ الوحدة في ماستر الأصناف قبل اعتماد الكشف.
                    </div>
                  )}

                  {/* ★ توزيع العمل — جدولٌ لا شاراتٌ: هذا ما يُجيب «ماذا قرأ محمد» */}
                  {byPerson.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                      <h3 className="o_dashboard_section_title">
                        <Icon name="users" size={16} /> توزيع العمل على العادّين
                      </h3>
                      <div style={{ border: '1px solid var(--o-border-color)', borderRadius: 'var(--o-border-radius)' }}>
                        <ListView selectable={false} columns={PERSON_COLS} rows={personRows} />
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--o-main-color-muted)', lineHeight: 1.7 }}>
                        ★ «آخر قراءة وصلت» هي ما يُغني عمّا لا يُرى من مكتبك: طابورُ هاتف
                        العادّ محلّيٌّ لا ينتقل إلى الخادم. فصمتُ عشرين دقيقةً إمّا انصرافٌ
                        وإمّا عملٌ محبوسٌ في جهازه — فاسأله.
                      </p>
                    </div>
                  )}

                  {/* سجلّ المتابعة — مَن قرأ · ماذا · وكم */}
                  <div>
                    <h3 className="o_dashboard_section_title">
                      <Icon name="activity" size={16} /> سجلّ المتابعة
                      <span style={{ color: 'var(--o-gray-500)', fontWeight: 400, fontSize: 'var(--o-font-size-xs)' }}>
                        (يتحدّث تلقائيًّا)
                      </span>
                    </h3>

                    {/* شريطُ التصفية والتصدير */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                      <select
                        className="o_input"
                        style={{ width: 'auto' }}
                        value={person}
                        onChange={(e) => setPerson(e.target.value)}
                        aria-label="تصفية بالعادّ"
                        data-log-person
                      >
                        <option value="all">كلّ العادّين</option>
                        {people.map((p) => (
                          <option key={p.name} value={p.name}>{p.name} ({p.count})</option>
                        ))}
                      </select>
                      <input
                        type="search"
                        className="o_input"
                        style={{ flex: 1, minWidth: '160px' }}
                        placeholder="ابحث بالصنف أو الباركود أو الكود…"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        aria-label="بحث في السجلّ"
                        data-log-search
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={exportLogExcel}
                        disabled={!shownLog.length || exporting}
                        data-log-xlsx
                      >
                        <Icon name="fileUp" size={14} /> تصدير إكسل
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={exportLogPdf}
                        disabled={!shownLog.length || exporting}
                        data-log-pdf
                      >
                        <Icon name="printer" size={14} /> محضر PDF
                      </button>
                    </div>

                    {loadingScans ? (
                      <div className="o_dashboard_empty">جارٍ التحميل…</div>
                    ) : logRows.length === 0 ? (
                      <div className="o_dashboard_empty">لا قراءة بعد على هذه الجلسة.</div>
                    ) : shownLog.length === 0 ? (
                      <div className="o_dashboard_empty">لا نتيجة لهذه التصفية.</div>
                    ) : (
                      <>
                        <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1px solid var(--o-border-color)', borderRadius: 'var(--o-border-radius)' }}>
                          <ListView selectable={false} columns={SCAN_COLS} rows={scanRows} />
                        </div>
                        {shownLog.length > LOG_PAGE && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <Pager
                              page={logPage}
                              size={LOG_PAGE}
                              total={shownLog.length}
                              onPage={setLogPage}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/*
        ★★ محضرُ المتابعة المطبوع — عنصرُ DOM حقيقيّ يُمرَّر إلى
        `exportElementToPdf`. ولا يُبنى نصَّ HTML عمدًا: المدخلُ الوحيد يرفض
        النصّ لأنّ مسارَه داخل `html2pdf` يُحيي DOMPurify المخبوزةَ في بنائها.

        ويُرسم **خارج الشاشة** لا `display:none`: عنصرٌ مخفيٌّ بلا أبعادٍ
        يلتقطه `html2canvas` صفحةً بيضاء. وعرضُه ٧٩٤px = A4 عند ٩٦ نقطة/بوصة.

        ولا يُرسم إلّا حين تكون هناك جلسةٌ مختارةٌ وصفوفٌ تُطبع — فلا شجرةَ
        DOM ثقيلةٌ تُبنى مع كلّ لقطةٍ حيّة بلا سبب.
      */}
      {sel && shownLog.length > 0 && (
        <div style={{ position: 'fixed', insetInlineStart: '-10000px', top: 0, zIndex: -1 }} aria-hidden="true">
          <div
            ref={printRef}
            dir="rtl"
            style={{
              width: '794px', padding: '24px', background: '#fff', color: '#111',
              fontFamily: 'IBM Plex Sans Arabic, system-ui, sans-serif', fontSize: '12px', lineHeight: 1.7,
            }}
          >
            <h1 style={{ fontSize: '18px', margin: '0 0 4px', fontWeight: 700 }}>محضر متابعة الجرد</h1>
            <p style={{ margin: '0 0 14px', fontSize: '11px', color: '#555' }}>
              سجلٌّ دائمٌ ملحق-فقط — لا يُعدَّل ولا يُحذف. صُدِّر في {stampOf(Date.now())}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11.5px' }}>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700, width: '22%' }}>رمز الجلسة</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontFamily: 'monospace' }}>
                    {formatOperationCode(sel.code || '') || sel.id.slice(0, 8)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700, width: '22%' }}>النوع</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{sel.type}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700 }}>النطاق</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{scopeLabel(scopeOf(sel))}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700 }}>الحالة</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>
                    {sel.status === 'open' ? 'مفتوحة' : 'مُقفلة'}
                  </td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700 }}>فتحها</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{sel.createdByName || 'غير معروف'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700 }}>وقت الفتح</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{fmtTime(sel.createdAt)}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', fontWeight: 700 }}>المعروض</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }} colSpan={3}>
                    {person === 'all' ? 'كلّ العادّين' : `العادّ: ${person}`}
                    {term ? ` · بحث: «${term}»` : ''} — {int(totals.scanCount)} قراءة من {int(logRows.length)}
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 style={{ fontSize: '13px', margin: '0 0 6px', fontWeight: 700 }}>توزيع العمل</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#f3f3f5' }}>
                  {['العادّ', 'قيود', 'أصناف', 'الإجمالي بالأساس', 'آخر قراءة وصلت'].map((h) => (
                    <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'start' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPerson.map((p) => (
                  <tr key={p.name}>
                    <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{p.name}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{int(p.scans)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{int(p.items)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{num(p.base)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>
                      {seenMap.get(p.name) ? stampOf(seenMap.get(p.name)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 style={{ fontSize: '13px', margin: '0 0 6px', fontWeight: 700 }}>سجلّ القراءات</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr style={{ background: '#f3f3f5' }}>
                  {['الوقت', 'مَن قرأ', 'الصنف', 'الباركود', 'الكمّيّة', 'الوحدة', 'بالأساس', 'الاتّجاه'].map((h) => (
                    <th key={h} style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'start' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownLog.map((r) => (
                  <tr key={r.id}>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', whiteSpace: 'nowrap' }} dir="ltr">
                      {r.atMs == null ? '—' : stampOf(r.atMs)}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{r.byName}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{r.name}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', fontFamily: 'monospace' }} dir="ltr">{r.barcode}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{num(r.qty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{r.uom || '—'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{r.baseQty == null ? '—' : num(r.baseQty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 5px' }}>{r.direction === 'out' ? 'خصم' : 'إضافة'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginTop: '14px', fontSize: '10px', color: '#666' }}>
              الجمعُ يقع بوحدة الأساس وحدَها — وجمعُ كرتونٍ مع قطعةٍ رقمٌ بلا معنى.
              {totals.uncertain > 0 && ` وفي هذا الكشف ${int(totals.uncertain)} قيدًا بوحدةٍ بلا معامل، مجموعُها بالأساس غير مضمون.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
