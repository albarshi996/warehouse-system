/**
 * صندوق المستندات (F5) — «مستنداتي» و«بانتظار اعتمادي» و«الكل» (للمدير).
 *
 * هذه هي الشاشة التي لم يكن للورق مثيلٌ لها: الورقة المطبوعة تُوضع على مكتب
 * **فتُنسى**، ولا أحد يعرف كم بقيت هناك. هنا يرى المعتمِد ما ينتظره **مرتّبًا
 * بإلحاحه**، ويرى المُنشئ أين وصل مستنده، ويُكشف المنسيّ بشارة «متأخّر».
 *
 * كل الحساب في `inbox.js` الخالص المُختبَر؛ هذا عرضٌ وتفاعل.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ListView + Badge + o_kpi + o_input) — **المنطق (الاشتراكات والتصفية والفرز
 * والتصدير) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2) عبر format.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import {
  listenMyDocuments,
  listenPendingApproval,
  listenAllDocuments,
} from '../../../services/documents/documentsService.js';
import { getSchema, GOVERNED_FORMS } from '../../../services/documents/schemas/index.js';
import { getState } from '../../../services/documents/states.js';
import { START_GROUPS } from '../../../services/documents/startGroups.js';
import { fieldRouteFor } from '../../../services/tasks/fieldRoutes.js';
import { nextOwnerOf } from '../../../services/tasks/stageOwners.js';
import {
  awaitingMyApproval,
  sortByUrgency,
  inboxStats,
  ageInState,
  isStale,
  toCsv,
  csvFileName,
} from '../../../services/documents/inbox.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

import { MANAGER_ROLES } from '../../../services/auth/roles.js';

/* ═══ طلبُ المالك 2026-10-02: التقريرُ والتحديدُ والإجراءُ الجماعيّ ═══ */
import {
  EMPTY_CRITERIA,
  filterReport,
  hasActiveCriteria,
  partyLabel,
  eventDay,
  groupReport,
  REPORT_COLUMNS,
  reportRows,
  criteriaSummary,
} from '../../../services/documents/docReport.js';
import {
  toggleId,
  toggleAll,
  pruneSelection,
  selectedRows,
  copyPlan,
  copyMessage,
  writeClipboard,
} from '../../../services/ui/tableSelection.js';
import { reportSheetMatrix, reportSheetWidths, reportFileName } from '../../../services/documents/docExcel.js';
import { qcQueue } from '../../../services/documents/bulkActions.js';
import SCHEMAS from '../../../services/documents/schemas/index.js';
import DocumentFilters from './DocumentFilters.jsx';
import BulkActionBar from './BulkActionBar.jsx';

/** خريطة عرض: حالة المستند ← نوع شارة أودو (عرضٌ فقط، لا منطق). */
const STATE_BADGE = {
  draft: 'draft',
  submitted: 'warn',
  approved: 'progress',
  rejected: 'danger',
  done: 'done',
};

/**
 * أعمدة قائمة أودو.
 *
 * ★ وزِيد عمودان 2026-10-02: **الطرف** و**تاريخ الواقعة**. وبلا الطرف كان
 * الموظّفُ يفتح المستندَ ليعرف من مورّدُه — وهو أوّلُ ما يسأل عنه؛ وبلا
 * تاريخ الواقعة لا يُفرَّق استلامُ أمسِ المسجَّلُ اليوم من استلام اليوم.
 */
const LIST_COLS = [
  { key: 'number', label: 'الرقم' },
  { key: 'type', label: 'النوع' },
  { key: 'party', label: 'المورّد/العميل' },
  { key: 'eventDate', label: 'تاريخ الواقعة' },
  { key: 'state', label: 'الحالة' },
  { key: 'creator', label: 'أنشأه' },
  { key: 'age', label: 'الانتظار' },
  { key: 'updated', label: 'آخر تحديث' },
  { key: 'actions', label: '' },
];

function fmt(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** بطاقة عدّ في شريط اللقطة — بمظهر مؤشّر أودو o_kpi. */
function Tile({ value, label, icon, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      {icon && <span className="o_kpi_icon"><Icon name={icon} size={18} /></span>}
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
    </div>
  );
}

export default function DocumentsInbox() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('pending');
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  /** معاييرُ التقرير كلُّها في كائنٍ واحد — مرجعُه `EMPTY_CRITERIA`. */
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupBy, setGroupBy] = useState('');
  /** التحديدُ تملكه الشاشة لا الجدول — انظر رأس `ListView`. */
  const [selected, setSelected] = useState(() => new Set());
  const [toast, setToast] = useState('');
  /** يُثبَّت مرّة عند التحميل: لو قرأنا الساعة في كل رسم لتغيّر الترتيب تحت المؤشّر. */
  const [now] = useState(() => Date.now());
  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const subs = [listenMyDocuments(me.uid, setMine), listenPendingApproval(setPending)];
    if (MANAGER_ROLES.includes(me.role)) subs.push(listenAllDocuments(setAll));
    return () => subs.forEach((u) => u());
  }, [me]);

  /** ما ينتظر اعتماد **هذا** المستخدم تحديدًا — لا كل ما أُرسل. */
  const forMe = useMemo(() => awaitingMyApproval(pending, me), [pending, me]);

  /**
   * ‹QC› طابورُ الجودة: ما ينتظر فحصَ هذا المفتّش من أنواعٍ **تُشتقّ من
   * المخطّطات** لا من قائمةٍ مكتوبة. وهو تيسيرُ «إجراءات فحص الجودة»: المفتّشُ
   * يفتح تبويبَه فيجد ما يخصُّه وحدَه، ويعتمده جماعيًّا بضغطتين.
   */
  const qcDocs = useMemo(
    () => qcQueue(pending, { role: me?.role, uid: me?.uid }, SCHEMAS),
    [pending, me?.role, me?.uid]
  );

  const source = tab === 'mine' ? mine : tab === 'pending' ? forMe : tab === 'qc' ? qcDocs : all;
  const rows = useMemo(
    () => sortByUrgency(filterReport(source, { ...criteria, nowMs: now }), now),
    [source, criteria, now]
  );
  const stats = useMemo(() => inboxStats(source, now), [source, now]);
  const groups = useMemo(
    () => (groupBy ? groupReport(rows, groupBy, criteria.basis) : []),
    [rows, groupBy, criteria.basis]
  );

  const visibleIds = useMemo(() => rows.map((d) => d.id), [rows]);

  /**
   * ★★★ التحديدُ يُقصُّ على المعروض عند كلّ تغيّرٍ في التصفية أو التبويب.
   *
   * وبلا هذا: يحدّد خمسةً، ثمّ يشدّد التصفيةَ فيختفي ثلاثةٌ عن عينه ويبقون
   * محدَّدين، ثمّ يضغط «اعتماد المحدَّد» فيعتمد ثلاثةً **لا يراها**. وهو أخطرُ
   * عطبٍ محتملٍ في هذه الميزة كلِّها.
   */
  useEffect(() => {
    setSelected((prev) => {
      const next = pruneSelection(prev, visibleIds);
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const selectedDocs = useMemo(() => selectedRows(rows, selected), [rows, selected]);

  function say(msg) {
    setToast(msg);
    // الرسالةُ تختفي وحدها: شريطُ نجاحٍ يبقى أبدًا يُقرأ خبرًا عن فعلٍ تالٍ.
    setTimeout(() => setToast(''), 6000);
  }

  function exportCsv() {
    const label = tab === 'mine' ? 'مستنداتي' : tab === 'pending' ? 'بانتظار-اعتمادي' : tab === 'qc' ? 'طابور-الجودة' : 'الكل';
    const blob = new Blob([toCsv(rows, now)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(label, now);
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * تصديرُ إكسل — المحدَّدُ إن وُجد، وإلّا المعروضُ كلُّه.
   *
   * ⚠️ و`xlsx` تُحمَّل **عند الطلب** لا مع الصفحة: المكتبةُ ~900 ك.ب، وتحميلُها
   * في كلّ فتحةٍ لشاشةٍ أغلبُ زوّارها لا يُصدّرون إهدارٌ لا يُحتمل على شبكة
   * المستودع. ولا CDN — نسخةٌ مستضافةٌ ذاتيًّا من الحزمة نفسِها (حارسُ
   * `vendoredLibs.test.js`).
   */
  async function exportXlsx(onlySelected = false) {
    const chosen = onlySelected && selectedDocs.length ? selectedDocs : rows;
    if (!chosen.length) return say('لا صفوفَ للتصدير.');
    try {
      const XLSX = await import('xlsx');
      const matrix = reportSheetMatrix(chosen, criteria, now);
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!cols'] = reportSheetWidths();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المستندات');
      XLSX.writeFile(wb, reportFileName(criteria, now));
      return say(`صُدِّر ${int(chosen.length)} صفًّا إلى إكسل.`);
    } catch (err) {
      return say(`تعذّر توليدُ ملفّ إكسل: ${err?.message || err}`);
    }
  }

  /** نسخٌ إلى الحافظة — من **صفوف البيانات** لا من المرسوم (انظر `tableSelection`). */
  async function copyRows() {
    const data = reportRows(rows, now);
    const byId = new Map(rows.map((d, i) => [d.id, { id: d.id, ...data[i] }]));
    const plan = copyPlan({
      columns: REPORT_COLUMNS,
      rows: [...byId.values()],
      selected,
    });
    const ok = await writeClipboard(plan.tsv);
    say(ok ? copyMessage(plan) : 'تعذّر النسخ — متصفّحُك لم يسمح بالوصول إلى الحافظة.');
  }

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_dashboard_empty">جارٍ التحقّق…</div></div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> يلزم تسجيل الدخول</div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'pending', label: 'بانتظار اعتمادي', count: forMe.length },
    // ‹QC› تبويبُ الجودة يظهر لمن له فيه شيءٌ فقط — فلا تبويبٌ فارغٌ أبدًا
    // في شاشة أمينِ مخزنٍ لا شأنَ له بالفحص.
    ...(qcDocs.length > 0 ? [{ key: 'qc', label: 'طابور فحص الجودة', count: qcDocs.length }] : []),
    { key: 'mine', label: 'مستنداتي', count: mine.length },
    ...(MANAGER_ROLES.includes(me.role) ? [{ key: 'all', label: 'كل المستندات', count: all.length }] : []),
  ];

  /**
   * أزرار البدء مجمّعة بسلسلتها — أربعون زرًّا مسطّحًا تُربك لا تُيسّر.
   * التصنيف نزل إلى `startGroups.js` الخالص ليقرأه حارس التدقيق: حين كان
   * هنا انحرف صامتًا وبقيت سبعةُ أنواعٍ مبنيّةً بلا زرٍّ يبدأها.
   */
  const readyForms = GOVERNED_FORMS.filter((f) => f.ready);

  const listRows = rows.map((d) => {
    const state = getState(d.state);
    const schema = getSchema(d.type);
    const age = ageInState(d, now);
    const stale = isStale(d, now);
    /**
     * الشاشةُ الميدانيّة لهذا الصفّ — أو `null`.
     *
     * ★★★ ولا حكمَ هنا: لا نوعَ يُقارَن ولا حالةَ تُفحص في JSX. الوحدةُ
     * `fieldRoutes.js` تعرف الاثنين معًا وتقيسهما من حرّاسٍ قائمين، فلو قبِلت
     * بوّابةُ التحضير نوعًا رابعًا غدًا ظهر زرُّه هنا بلا تعديلِ حرفٍ في العرض.
     * و`null` يعني **لا زرَّ**: الزرُّ الرماديُّ يَعِد بشيءٍ ثمّ يمنعه، وغيابُه أصدق.
     */
    const route = fieldRouteFor(d);
    /**
     * ‹JR-105› ومن ينتظر هذا المستندَ الآن — سطرًا واحدًا من `nextOwnerOf`.
     *
     * ★★★ وهذا موضعُه: هنا يقف الناسُ أمام المستندات. وكانت الوحدةُ تُستورَد
     * في شاشةٍ واحدةٍ من ١٥٢ (شاشةِ الاستلام) فيرى الواقفُ هنا كلَّ شيءٍ عن
     * الصفّ إلّا من ينتظره — فيسأل زميلَه، والمعرفةُ الشفويّةُ أوّلُ ما يسقط.
     *
     * ⚠️ ولا صياغةَ هنا: السطرُ يخرج من الوحدة تامًّا («ينتظر اعتماد: مدير
     * المستودع»)، والمجهولُ يمرّ **فارغًا** فلا يُكتب في شاشةِ موظّفٍ خبرٌ
     * عمّا نجهل. فمن أراد تبديلَ الصياغة بدّلها هناك لا في خمس شاشات.
     */
    const ownerLine = nextOwnerOf(d).line;
    return {
      id: d.id,
      decoration: stale ? 'danger' : undefined,
      cells: {
        number: <span className="decoration-bf" style={{ fontFamily: 'monospace' }}>{d.number || '— مسودّة'}</span>,
        type: schema?.titleAr || d.type,
        /* الطرفُ من `partyFields.js` عبر `docReport` — لا من تخمينِ حقلٍ هنا.
           والفراغُ فراغٌ: مستندُ تسويةٍ داخليٍّ لا طرفَ له، و«—» في عمودٍ
           نصفُه فارغٌ ضجيج. */
        party: partyLabel(d) ? (
          <span style={{ maxWidth: '220px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }} title={partyLabel(d)}>
            {partyLabel(d)}
          </span>
        ) : (
          <span style={{ color: 'var(--o-gray-400)' }}>—</span>
        ),
        eventDate: eventDay(d) ? (
          <span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate', fontSize: 'var(--o-font-size-xs)' }}>{eventDay(d)}</span>
        ) : (
          <span style={{ color: 'var(--o-gray-400)' }}>—</span>
        ),
        state: (
          /* الشارةُ تقول **أين** هو، والسطرُ تحتها يقول **من ينتظره** — والاثنان
             وجها خبرٍ واحد فلا يُفرَّقان في عمودين. والسطرُ يلتفّ ولا يُقصّ:
             «ينتظر اعتماد: مدير المستودع · المدير المالي» أطولُ من خانةٍ ضيّقة. */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
            <Badge variant={STATE_BADGE[d.state] || 'draft'}>{state.label}</Badge>
            {ownerLine && (
              <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)', lineHeight: 1.5 }}>{ownerLine}</span>
            )}
          </div>
        ),
        creator: d.createdByName,
        age:
          age == null ? (
            <span style={{ color: 'var(--o-gray-500)' }}>—</span>
          ) : stale ? (
            <span className="decoration-danger decoration-bf" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <Icon name="alertTriangle" size={13} /> {int(age)} يومًا
            </span>
          ) : (
            <span style={{ color: 'var(--o-main-color-muted)', whiteSpace: 'nowrap' }}>{int(age)} يومًا</span>
          ),
        updated: <span style={{ color: 'var(--o-gray-500)', fontSize: 'var(--o-font-size-xs)' }}>{fmt(d.updatedAt || d.createdAt)}</span>,
        actions: (
          /* زرّان لا واحد: التنفيذُ أوّلًا (فهو الفعلُ المقصود من الصفّ) والفتحُ
             ثانويٌّ بجانبه — والفجوةُ ٦px فلا يلتصقان فيُضغط غيرُ المراد. */
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {route && (
              /* ★★ و`href` لا `path`: يحمل `?doc=<معرّف>` إلى الشاشة التي تقرؤه
                 فتفتح على أمره، ويخرج عاريًا لشاشةٍ لا تقرأ — والفرقُ محسومٌ في
                 `fieldRoutes.js` لا هنا، فلا يَعِد هذا الصفُّ بما لا يقع. */
              <a
                href={`${base}${route.href}`}
                className="btn btn-primary btn-sm"
                title={route.reason}
                style={{ whiteSpace: 'nowrap' }}
              >
                {route.label}
              </a>
            )}
            <a href={`${base}/dashboard/document?type=${d.type}&id=${d.id}`} className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }}>
              فتح ←
            </a>
          </div>
        ),
      },
    };
  });

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">صندوق المستندات</span></nav>
        </div>
        <div className="o_cp_end">
          {/* إكسل أوّلًا: هو ما يُطلب فعلًا، وCSV يبقى لمن بنى عليه عملًا. */}
          <button type="button" className="btn btn-primary" onClick={() => exportXlsx(false)} disabled={rows.length === 0}>
            <Icon name="arrowDownTray" size={15} /> تصدير إكسل ({int(rows.length)})
          </button>
          <button type="button" className="btn btn-secondary" onClick={copyRows} disabled={rows.length === 0}>
            <Icon name="clipboardList" size={15} /> نسخٌ للجدول
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            CSV
          </button>
        </div>
      </div>

      {toast && (
        <div className="o_ds" style={{ paddingBottom: 0 }}>
          <div className="o_alert info">
            <div className="o_alert_title"><Icon name="fileText" size={15} /> {toast}</div>
          </div>
        </div>
      )}

      <div className="o_ds">
        {/* ── بدء مستند جديد، مجمّعًا بالسلسلة ── */}
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }}>
          <h3 className="o_form_title" style={{ fontSize: '16px', marginTop: 0, marginBottom: '12px' }}>بدء مستند جديد</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {START_GROUPS.map((g) => {
              const forms = readyForms.filter((f) => g.types.includes(f.type));
              if (!forms.length) return null;
              return (
                <div key={g.title} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '128px', fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)' }}>
                    <Icon name={g.icon} size={14} /> {g.title}
                  </span>
                  {forms.map((f) => (
                    <a key={f.type} href={`${base}/dashboard/document?type=${f.type}`} className="btn btn-primary btn-sm">
                      {f.titleAr}
                    </a>
                  ))}
                </div>
              );
            })}
            {GOVERNED_FORMS.some((f) => !f.ready) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '128px', fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-gray-500)' }}>
                  <Icon name="calendar" size={14} /> قادم
                </span>
                {GOVERNED_FORMS.filter((f) => !f.ready).map((f) => (
                  <span
                    key={f.type}
                    title={`يصل في المرحلة ${f.phase} — النموذج الورقي متاح الآن في مكتبة النماذج`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: 'var(--o-border-radius)', fontSize: 'var(--o-font-size-xs)', background: 'var(--o-gray-100)', color: 'var(--o-gray-500)', border: '1px solid var(--o-gray-200)', cursor: 'default' }}
                  >
                    {f.titleAr} <span style={{ fontSize: '10px', color: 'var(--o-gray-400)' }}>({f.phase})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── التبويبات ── */}
        <div className="o_ds_toolbar" style={{ marginBottom: '14px' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ marginInlineStart: '6px', fontSize: '11px', background: 'var(--o-gray-200)', color: 'var(--o-gray-700)', borderRadius: '999px', padding: '1px 7px' }}>{int(t.count)}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── لقطة الحالة ── */}
        {stats.total > 0 && (
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <Tile icon="fileText" value={stats.total} label="الإجمالي" />
            <Tile icon="notebook" value={stats.draft} label="مسودّة" />
            <Tile icon="clipboardList" value={stats.submitted} label="بانتظار الاعتماد" />
            <Tile icon="checkCircle" value={stats.approved} label="معتمَد" />
            <Tile icon="checkSquare" value={stats.done} label="منجَز" />
            <Tile icon="alertTriangle" value={stats.stale} label="متأخّر" alert={stats.stale > 0} />
          </div>
        )}

        {/* ── التقرير: البحثُ والتصفيةُ بالتاريخ والطرف والرقم ── */}
        <DocumentFilters
          criteria={criteria}
          onChange={setCriteria}
          types={readyForms}
          open={filtersOpen || hasActiveCriteria(criteria)}
          onToggleOpen={() => setFiltersOpen((v) => !v)}
          resultCount={rows.length}
          totalCount={source.length}
          nowMs={now}
        />

        {/* ── الإجراءُ الجماعيُّ على المحدَّد ── */}
        <BulkActionBar
          selectedDocs={selectedDocs}
          me={me}
          onClear={() => setSelected(new Set())}
          onCopy={copyRows}
          onExport={() => exportXlsx(true)}
          onDone={(out) => say(out.message)}
        />

        {/* ── القائمة ── */}
        <div className="o_ds_card">
          <div className="o_ds_toolbar">
            <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)' }}>
              تجميعٌ وملخّص
            </span>
            {[
              ['', 'بلا تجميع'],
              ['type', 'بالنوع'],
              ['day', 'باليوم'],
              ['party', 'بالطرف'],
              ['state', 'بالحالة'],
            ].map(([id, label]) => (
              <button
                key={id || 'none'}
                type="button"
                className={`btn btn-sm ${groupBy === id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGroupBy(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ملخّصُ التجميع — الجوابُ على «كم من كلّ نوع؟» بلا عدٍّ بالإصبع */}
          {groupBy && groups.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', padding: '0 var(--o-horizontal-padding) 12px' }}>
              {groups.map((g) => (
                <span
                  key={g.key || 'none'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: 'var(--o-border-radius)',
                    fontSize: 'var(--o-font-size-xs)', background: 'var(--o-gray-100)',
                    border: '1px solid var(--o-gray-200)',
                  }}
                >
                  {g.label}
                  <strong style={{ fontFamily: 'monospace' }}>{int(g.count)}</strong>
                </span>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="o_dashboard_empty">
              {hasActiveCriteria(criteria)
                ? `لا نتائج لهذه التصفية — ${criteriaSummary(criteria)}`
                : tab === 'pending'
                  ? 'لا شيء ينتظر اعتمادك.'
                  : tab === 'qc'
                    ? 'لا شيء ينتظر فحصَ الجودة.'
                    : 'لا مستندات بعد — ابدأ واحدًا من الأعلى.'}
            </div>
          ) : (
            <ListView
              columns={LIST_COLS}
              rows={listRows}
              selectedIds={selected}
              onToggle={(id) => setSelected((prev) => toggleId(prev, id))}
              onToggleAll={() => setSelected((prev) => toggleAll(prev, visibleIds))}
            />
          )}
        </div>

        {stats.stale > 0 && (
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', marginTop: '14px', lineHeight: 1.6 }}>
            «متأخّر» = تجاوز مهلة حالته (بانتظار الاعتماد: يومان · معتمَد: 5 أيام · مسودّة: أسبوعان) —
            وهو ما كان الورق يُخفيه على المكاتب.
          </p>
        )}
      </div>
    </div>
  );
}
