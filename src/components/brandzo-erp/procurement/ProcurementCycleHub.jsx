/**
 * قمرة دورة المشتريات الداخلية — نقطة القيادة الموحّدة للدورة (طلبات الإدارات
 * من المالية): طلب ← كشف عروض ← أمر شراء ← صرف خزينة ← تسليم.
 *
 * لا تُنشئ هذه الشاشة مستنداتٍ ولا تعتمدها بنفسها: كلّ إجراء يمرّ عبر محرّك
 * المستندات القائم (`/dashboard/document`) — فلا تكرار لمنطقٍ ولا حذف. هنا:
 *   · مطلقات إنشاء **حسب الدور** (يرى كلٌّ ما يملك إنشاءه فقط).
 *   · قائمة حيّة بمستندات الدورة بثلاثة تبويبات (بانتظار اعتمادي · مستنداتي · الكل).
 *   · شريط المراحل الخمس ومؤشّرات سريعة.
 *
 * تُرقّى بمكوّنات أودو داخل `.o_theme` (ListView · Badge · Pager · o_kpi) على
 * بيانات Firestore الحيّة — نفس نمط `PartnerMaster` و`DocumentsInbox`.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import { getState } from '../../../services/documents/states.js';
import { INTERNAL_PROCUREMENT_CHAIN } from '../../../services/documents/chain.js';
import { pageSlice } from '../../../services/ui/pagination.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import Pager from '../../odoo/Pager.jsx';

const PAGE_SIZE = 50;

/** خريطة عرض: حالة المستند ← نوع شارة أودو (عرضٌ فقط، لا منطق). */
const STATE_BADGE = {
  draft: 'draft',
  submitted: 'warn',
  approved: 'progress',
  rejected: 'danger',
  done: 'done',
};

const LIST_COLS = [
  { key: 'title', label: 'المستند' },
  { key: 'number', label: 'الرقم' },
  { key: 'state', label: 'الحالة' },
  { key: 'creator', label: 'أنشأه' },
  { key: 'updated', label: 'آخر تحديث' },
  { key: 'actions', label: '' },
];

function fmt(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** هل يملك هذا الدور اعتماد هذا النوع؟ (من المخطّط — نظير قاعدة approveRoles). */
function canApprove(role, type) {
  if (role === 'admin') return true;
  return (getSchema(type)?.roles?.approve || []).includes(role);
}

/** هل يملك هذا الدور إنشاء هذا النوع؟ (من المخطّط — نظير قاعدة الإنشاء). */
function canCreate(role, type) {
  if (role === 'admin') return true;
  return (getSchema(type)?.roles?.create || []).includes(role);
}

export default function ProcurementCycleHub() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
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
    const unsub = listenDocumentsByTypes(
      INTERNAL_PROCUREMENT_CHAIN,
      (rows) => {
        setDocs(rows);
        setLoading(false);
      },
      400
    );
    return () => unsub();
  }, [me]);

  useEffect(() => setPage(0), [tab, search]);

  /** ما ينتظر اعتماد هذا المستخدم تحديدًا في الدورة. */
  const forMe = useMemo(
    () => docs.filter((d) => d.state === 'submitted' && canApprove(me?.role, d.type)),
    [docs, me]
  );
  const mine = useMemo(() => docs.filter((d) => d.createdByUid === me?.uid), [docs, me]);

  const source = tab === 'mine' ? mine : tab === 'pending' ? forMe : docs;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((d) => {
      const title = getSchema(d.type)?.titleAr || d.type;
      const hay = `${d.number || ''} ${title} ${d.createdByName || ''} ${d.header?.department || ''} ${d.header?.beneficiary || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [source, search]);

  const pageRows = useMemo(() => pageSlice(filtered, page, PAGE_SIZE), [filtered, page]);

  /** أنواع الدورة التي يملك هذا الدور إنشاءها — تصير مطلقات في شريط الأدوات. */
  const creatable = useMemo(
    () => (me ? INTERNAL_PROCUREMENT_CHAIN.filter((t) => canCreate(me.role, t)) : []),
    [me]
  );

  if (!ready || loading) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_dashboard_empty">جارٍ التحميل…</div></div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> يلزم تسجيل الدخول</div>
            افتح دورة المشتريات بعد الدخول لتُسجَّل هويتك على كل إجراء.
          </div>
        </div>
      </div>
    );
  }

  const listRows = pageRows.map((d) => {
    const st = getState(d.state);
    const title = getSchema(d.type)?.titleAr || d.type;
    return {
      id: d.id,
      decoration: d.state === 'rejected' ? 'danger' : undefined,
      cells: {
        title,
        number: <span className="decoration-bf">{d.number || 'مسودّة'}</span>,
        state: <Badge variant={STATE_BADGE[d.state] || 'draft'}>{st?.label || d.state}</Badge>,
        creator: d.createdByName || '—',
        updated: fmt(d.updatedAt),
        actions: (
          <a
            className="btn btn-secondary btn-sm"
            href={`${base}/dashboard/document?type=${d.type}&id=${d.id}`}
          >
            فتح
          </a>
        ),
      },
    };
  });

  const tabs = [
    { key: 'pending', label: 'بانتظار اعتمادي', count: forMe.length },
    { key: 'mine', label: 'مستنداتي', count: mine.length },
    { key: 'all', label: 'كل مستندات الدورة', count: docs.length },
  ];

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb"><span className="o_active">دورة المشتريات الداخلية</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px', flexWrap: 'wrap' }}>
          {creatable.map((t) => (
            <a key={t} className="btn btn-primary" href={`${base}/dashboard/document?type=${t}`}>
              <Icon name="fileText" size={15} /> {getSchema(t)?.titleAr || t}
            </a>
          ))}
        </div>
      </div>

      <div className="o_ds">
        {/* شريط المراحل الخمس — الخريطة الذهنية للدورة */}
        <div
          className="o_ds_card o_ds_pad"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '18px' }}
          aria-label="مراحل الدورة"
        >
          {INTERNAL_PROCUREMENT_CHAIN.map((t, i) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 11px',
                  borderRadius: 'var(--o-border-radius)', background: 'var(--o-gray-100)',
                  border: '1px solid var(--o-gray-200)', fontSize: 'var(--o-font-size-xs)',
                  fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color)',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '999px',
                    background: 'var(--o-brand-primary)', color: '#fff', fontSize: '11px',
                  }}
                >
                  {(i + 1).toLocaleString('ar-LY-u-nu-latn')}
                </span>
                {getSchema(t)?.titleAr || t}
              </span>
              {i < INTERNAL_PROCUREMENT_CHAIN.length - 1 && (
                <span style={{ color: 'var(--o-gray-400)' }}>←</span>
              )}
            </span>
          ))}
        </div>

        <div className="o_dashboard_kpis">
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="clipboardList" size={18} /></span>
            <span className="o_kpi_value">{forMe.length.toLocaleString('ar-LY-u-nu-latn')}</span>
            <span className="o_kpi_label">بانتظار اعتمادي</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="fileText" size={18} /></span>
            <span className="o_kpi_value">{mine.length.toLocaleString('ar-LY-u-nu-latn')}</span>
            <span className="o_kpi_label">مستنداتي</span>
          </div>
          <div className="o_kpi">
            <span className="o_kpi_icon"><Icon name="shoppingCart" size={18} /></span>
            <span className="o_kpi_value">{docs.length.toLocaleString('ar-LY-u-nu-latn')}</span>
            <span className="o_kpi_label">إجمالي مستندات الدورة</span>
          </div>
        </div>

        <div className="o_ds_card">
          <div className="o_ds_toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span style={{ marginInlineStart: '6px', fontSize: '11px', background: 'var(--o-gray-200)', color: 'var(--o-gray-700)', borderRadius: '999px', padding: '1px 7px' }}>
                      {t.count.toLocaleString('ar-LY-u-nu-latn')}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="o_searchview">
              <span className="o_searchview_icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالرقم أو الإدارة أو المستفيد…"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="o_dashboard_empty">
              {tab === 'pending'
                ? 'لا مستندات تنتظر اعتمادك حاليًّا.'
                : tab === 'mine'
                  ? 'لم تُنشئ مستندات في الدورة بعد.'
                  : 'لا مستندات في الدورة بعد — ابدأ بطلب مشتريات جديد.'}
            </div>
          ) : (
            <>
              <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
              <Pager total={filtered.length} page={page} size={PAGE_SIZE} onPage={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
