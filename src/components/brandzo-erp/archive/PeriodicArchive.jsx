import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ARCHIVE_SEED } from '../../../services/archive/archiveSeed.js';
import {
  mergeArchive,
  byCategory,
  filterArchive,
  archiveSummary,
  expiringSoon,
  docStatus,
  statusLabel,
  confidentialityLabel,
  daysUntil,
  todayISO,
  EXPIRY_WARNING_DAYS,
  ARCHIVE_CATEGORIES,
  STORED_STATUSES,
  STATUS_LABELS,
  CONFIDENTIALITY,
  DOC_TYPES,
} from '../../../services/archive/archiveModel.js';
import {
  validateArchiveFile,
  isValidRefNumber,
  routeExplain,
} from '../../../services/archive/archiveFile.js';
import {
  listenArchive,
  addArchiveDoc,
  updateArchiveDoc,
  approveArchiveDoc,
  fetchArchiveVersions,
} from '../../../services/archive/archiveService.js';
import { openOverlay, closeOverlay } from '../../../services/ui/overlayHistory.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';

/**
 * الأرشيف الدوريّ — التقارير ومحاضر الاجتماعات في مصدرٍ واحدٍ معتمد.
 *
 * طبقتان: بذرةٌ ثابتة تُفتح حيًّا من `public/archive/`، ورفعٌ حيّ يخزّنه المالك
 * في أيّ وقت (الصغير base64 في Firestore، والكبير في Storage). تبويبان
 * (تقارير · محاضر)، وشارةٌ للمصدر الأوّل المعتمد. الأرقام الإشاريّة `BFP-SCM-PR`.
 *
 * ── دورة حياة الوثيقة ──
 * لكلّ وثيقةٍ نوعٌ ودرجةُ سرّية وتاريخُ انتهاءٍ تُشتقّ منه حالتها، وكلماتٌ
 * مفتاحية ونصٌّ مستخرَج يُبحث فيهما، وسجلُّ إصداراتٍ وتتبّع. الشاشة ثلاث
 * طبقات: **ما يحتاج تدخّلًا الآن** (المنتهي والمشرف على الانتهاء)، ثمّ
 * البحث والتصفية، ثمّ الفهرس الكامل.
 */

const WRITER_ROLES = ['admin', 'warehouse_manager'];

/**
 * اليوم بصيغة `YYYY-MM-DD`. **الساعة تُقرأ هنا** — في طبقة الواجهة — لأنّ
 * `archiveModel.js` منطقٌ خالص يُمرَّر إليه الوقت ولا يسأل عنه، فيبقى
 * اختبارُه صادقًا في أيّ يوم.
 */
const today = () => todayISO(Date.now());

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL;

/** يربط طبقةً بزرّ الرجوع (يُغلقها لا يغادر الصفحة). */
function useBackClose(onClose, name) {
  const cbRef = useRef(onClose);
  useEffect(() => {
    cbRef.current = onClose;
  });
  useEffect(() => {
    const key = openOverlay(() => cbRef.current && cbRef.current(), name);
    return () => closeOverlay(key);
  }, []);
}

/** الحقول الوصفيّة الفارغة — مبدأُ نموذجِ الرفع ونموذجِ التحرير معًا. */
const EMPTY_FIELDS = {
  category: 'report',
  title: '',
  refNumber: '',
  date: '',
  period: '',
  note: '',
  type: '',
  status: 'active',
  confidential: 'public',
  expiry: '',
  keywords: '',
  ocrText: '',
  dept: '',
  project: '',
  issuer: '',
  client: '',
};

/** يلتقط الحقول الوصفيّة من وثيقةٍ قائمة (للتحرير). */
function fieldsOf(doc) {
  const out = { ...EMPTY_FIELDS };
  Object.keys(EMPTY_FIELDS).forEach((k) => {
    if (doc[k] !== undefined && doc[k] !== null) out[k] = doc[k];
  });
  return out;
}

export default function PeriodicArchive() {
  const [profile, setProfile] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [liveById, setLiveById] = useState({});
  const [tab, setTab] = useState('report');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [confidential, setConfidential] = useState('');
  const [type, setType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null); // وثيقةٌ قيد تحرير بياناتها
  const [detail, setDetail] = useState(null); // وثيقةٌ مفتوحة التفاصيل
  const [viewer, setViewer] = useState(null); // وثيقة HTML حيّة للمعاينة
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 4200);
  }, []);

  useEffect(() => {
    const unsubAuth = subscribeAuth(async (user) => {
      const p = user ? await fetchUserProfile(user) : null;
      setProfile(p);
      setCanWrite(Boolean(p) && WRITER_ROLES.includes(p.role));
    });
    const unsubA = listenArchive((byId) => setLiveById(byId));
    return () => {
      unsubAuth();
      unsubA();
    };
  }, []);

  const list = useMemo(() => mergeArchive(ARCHIVE_SEED, liveById), [liveById]);
  const summary = useMemo(() => archiveSummary(list, today()), [list]);
  const attention = useMemo(() => {
    const t = today();
    const soon = expiringSoon(list, EXPIRY_WARNING_DAYS, t);
    const gone = list.filter((d) => docStatus(d, t) === 'expired');
    return [...gone, ...soon];
  }, [list]);

  const shown = useMemo(
    () => filterArchive(list, { category: tab, query, status, confidential, type }, today()),
    [list, tab, query, status, confidential, type]
  );
  const typeOptions = useMemo(() => typesInUse(list), [list]);

  const filtering = Boolean(query || status || confidential || type);

  // التفاصيل المفتوحة تُقرأ من اللقطة الحيّة لا من نسخةٍ مجمّدة — فتتحدّث
  // البطاقة فور اعتمادها أو تحريرها دون إغلاقٍ وفتح.
  const detailLive = detail ? list.find((d) => d.id === detail.id) || detail : null;

  const handleUpload = async (fields, payload) => {
    if (!canWrite) return false;
    try {
      await addArchiveDoc(fields, payload, profile);
      setUploading(false);
      showToast(`رُفع «${fields.title}» إلى الأرشيف`);
      return true;
    } catch (e) {
      showToast('تعذّر الرفع: ' + e.message);
      return false;
    }
  };

  const handleEdit = async (fields) => {
    if (!canWrite || !editing) return false;
    try {
      await updateArchiveDoc(editing.id, fields, profile, editing);
      setEditing(null);
      showToast('حُفظ التعديل، وحُفظت لقطةُ ما قبله في الإصدارات');
      return true;
    } catch (e) {
      showToast('تعذّر الحفظ: ' + e.message);
      return false;
    }
  };

  const handleApprove = async (doc) => {
    if (!canWrite) return;
    try {
      await approveArchiveDoc(doc.id, profile);
      showToast(`اعتُمدت «${doc.title}»`);
    } catch (e) {
      showToast('تعذّر الاعتماد: ' + e.message);
    }
  };

  const openDoc = (d) => {
    if (d.source === 'seed') {
      window.open(`${BASE}${d.path}`, '_blank', 'noopener');
    } else if (d.storageUrl) {
      window.open(d.storageUrl, '_blank', 'noopener');
    } else if (d.format === 'html' && d.fileData) {
      setViewer(d);
    } else if (d.fileData) {
      window.open(d.fileData, '_blank', 'noopener');
    } else {
      showToast('لا ملفَّ مرفقًا بهذه الوثيقة.');
    }
  };

  return (
    <div className="ar-wrap">
      {/* ── الرأس ── */}
      <div className="ar-hero">
        <div className="ar-hero-main">
          <h2>الأرشيف الدوريّ — التقارير ومحاضر الاجتماعات</h2>
          <p>
            المصدر الأوّل المعتمد للتقارير الدورية والمحاضر — لا ملفّاتٌ متناثرة. كلّ
            وثيقةٍ برقمها الإشاريّ وتاريخها ودرجة سرّيتها وأجلها، تُفتح حيًّا، ويُبحث
            في عنوانها وكلماتها ونصّها المستخرَج.
          </p>
          {summary.primary && (
            <div className="ar-primary-line">
              <span className="ar-badge">المصدر المعتمد</span>
              <span>{summary.primary.title}</span>
              {summary.primary.refNumber && <span className="ar-num">{summary.primary.refNumber}</span>}
            </div>
          )}
        </div>
        <div className="ar-hero-side">
          <div className="ar-kpis">
            <div className="ar-kpi"><span className="n">{summary.reports}</span><span className="l">تقريرًا</span></div>
            <div className="ar-kpi"><span className="n">{summary.minutes}</span><span className="l">محضرًا</span></div>
            <div className={`ar-kpi ${summary.expiring ? 'warn' : ''}`}>
              <span className="n">{summary.expiring}</span><span className="l">ينتهي قريبًا</span>
            </div>
            <div className={`ar-kpi ${summary.expired ? 'danger' : ''}`}>
              <span className="n">{summary.expired}</span><span className="l">منتهية</span>
            </div>
          </div>
          {canWrite && (
            <button className="kbtn b-accent" onClick={() => setUploading(true)}>＋ رفع وثيقة</button>
          )}
        </div>
      </div>

      {/* ── الطبقة ١: ما يحتاج تدخّلًا الآن ── */}
      {attention.length > 0 && (
        <AttentionStrip docs={attention} onOpen={(d) => setDetail(d)} />
      )}

      {/* ── الطبقة ٢: البحث والتصفية ── */}
      <SearchFilters
        query={query} setQuery={setQuery}
        status={status} setStatus={setStatus}
        confidential={confidential} setConfidential={setConfidential}
        type={type} setType={setType}
        types={typeOptions}
      />

      {/* ── الطبقة ٣: الفهرس الكامل ── */}
      <div className="ar-tabs">
        {Object.entries(ARCHIVE_CATEGORIES).map(([key, label]) => (
          <button key={key} className={`ar-tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
            {label}
            <span className="ar-tab-n">{byCategory(list, key).length}</span>
          </button>
        ))}
        {filtering && (
          <span className="ar-filter-note">
            ظاهرٌ {shown.length} من {byCategory(list, tab).length}
            <button className="ar-clear" onClick={() => { setQuery(''); setStatus(''); setConfidential(''); setType(''); }}>
              مسح التصفية
            </button>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="kempty">
          {filtering ? 'لا وثيقة تطابق البحث في هذا التصنيف.' : 'لا وثائق في هذا التصنيف بعد.'}
        </div>
      ) : (
        <div className="ar-grid">
          {shown.map((d) => (
            <ArchiveCard key={d.id} doc={d} onOpen={() => openDoc(d)} onDetail={() => setDetail(d)} />
          ))}
        </div>
      )}

      {uploading && (
        <UploadForm onCancel={() => setUploading(false)} onUpload={handleUpload} showToast={showToast} />
      )}
      {editing && (
        <EditForm doc={editing} onCancel={() => setEditing(null)} onSave={handleEdit} showToast={showToast} />
      )}
      {detailLive && (
        <DocDetail
          doc={detailLive}
          canWrite={canWrite}
          onClose={() => setDetail(null)}
          onOpen={() => openDoc(detailLive)}
          onEdit={() => { setDetail(null); setEditing(detailLive); }}
          onApprove={() => handleApprove(detailLive)}
        />
      )}
      {viewer && <HtmlViewer doc={viewer} onClose={() => setViewer(null)} />}
      <Toast msg={toastMsg} />
    </div>
  );
}

/** الأنواع المستعملة فعلًا في الأرشيف — لا نعرض في المصفاة نوعًا بلا وثيقة. */
function typesInUse(list) {
  return [...new Set((list || []).map((d) => d.type).filter(Boolean))].sort();
}

/* ═══════════════ شارات ═══════════════ */

/** شارة الحالة — الأحمر للمنتهية وحدها، والكهرمانيّ للمشرفة على الانتهاء. */
function StatusBadge({ doc }) {
  const t = today();
  const s = docStatus(doc, t);
  const left = daysUntil(doc.expiry, t);
  const title =
    s === 'expiring' ? `يبقى ${left} يومًا` : s === 'expired' ? `مضى ${Math.abs(left)} يومًا` : '';
  return <span className={`ar-st st-${s}`} title={title}>{statusLabel(s)}</span>;
}

/** شارة السرّية — لا تُعرض لـ«عام» فلا تُثقل البطاقة بما هو الأصل. */
function ConfBadge({ level }) {
  if (!level || level === 'public') return null;
  return <span className={`ar-cf cf-${level}`}>{confidentialityLabel(level)}</span>;
}

/* ═══════════════ الطبقة ١: تدخّل الآن ═══════════════ */

function AttentionStrip({ docs, onOpen }) {
  return (
    <div className="ar-attn">
      <div className="ar-attn-head">
        <span className="ar-attn-title">يحتاج تدخّلًا الآن</span>
        <span className="ar-attn-sub">وثائق مضى أجلها أو يقترب — الأقرب أوّلًا</span>
      </div>
      <div className="ar-attn-row">
        {docs.map((d) => {
          const left = daysUntil(d.expiry, today());
          return (
            <button key={d.id} className="ar-attn-item" onClick={() => onOpen(d)}>
              <StatusBadge doc={d} />
              <span className="ar-attn-name">{d.title}</span>
              <span className="ar-attn-days">
                {left < 0 ? `مضى ${Math.abs(left)} يومًا` : `يبقى ${left} يومًا`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════ الطبقة ٢: البحث والتصفية ═══════════════ */

function SearchFilters({
  query, setQuery, status, setStatus, confidential, setConfidential, type, setType, types,
}) {
  return (
    <div className="ar-filters">
      <input
        type="search"
        className="ar-search"
        value={query}
        placeholder="بحثٌ شامل: الرقم الإشاريّ · العنوان · الكلمات المفتاحية · النصّ المستخرَج…"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips">
        <button className={`chip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>كلّ الحالات</button>
        {Object.keys(STATUS_LABELS).map((k) => (
          <button key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>
            {STATUS_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="ar-selects">
        <select value={confidential} onChange={(e) => setConfidential(e.target.value)}>
          <option value="">كلّ درجات السرّية</option>
          {Object.entries(CONFIDENTIALITY).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={types.length === 0}>
          <option value="">{types.length ? 'كلّ الأنواع' : 'لا أنواع بعد'}</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ═══════════════ الطبقة ٣: بطاقة وثيقة ═══════════════ */

function ArchiveCard({ doc, onOpen, onDetail }) {
  const fmt = { html: 'HTML', pdf: 'PDF', image: 'صورة' }[doc.format] || doc.format;
  return (
    <div className={`ar-card ${doc.primary ? 'primary' : ''}`}>
      <div className="ar-card-top">
        <span className="ar-num">{doc.refNumber || 'بلا رقم'}</span>
        {doc.primary && <span className="ar-badge sm">معتمد</span>}
        <span className="ar-fmt">{fmt}</span>
      </div>
      <h3 className="ar-title">{doc.title}</h3>
      <div className="ar-chipline">
        <StatusBadge doc={doc} />
        <ConfBadge level={doc.confidential} />
        {doc.type && <span className="ar-type">{doc.type}</span>}
      </div>
      <div className="ar-meta">
        {doc.date || 'بلا تاريخ'}
        {doc.period ? ` · ${doc.period}` : ''}
        {doc.expiry ? ` · ينتهي ${doc.expiry}` : ''}
        {doc.source === 'live' ? ' · مرفوع' : ''}
        {doc.storageUrl ? ' · في المخزن' : ''}
      </div>
      {doc.note && <p className="ar-note">{doc.note}</p>}
      <div className="ar-card-foot">
        <button className="kbtn b-accent sm" onClick={onOpen}>فتح</button>
        <button className="kbtn b-ghost sm" onClick={onDetail}>التفاصيل</button>
        {doc.source === 'live' && doc.fileData && doc.format !== 'html' && (
          <a className="kbtn b-ghost sm" href={doc.fileData} download={doc.fileName || doc.title}>تنزيل</a>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ تفاصيل الوثيقة (بيانات · إصدارات · تتبّع) ═══════════════ */

function DocDetail({ doc, canWrite, onClose, onOpen, onEdit, onApprove }) {
  const [pane, setPane] = useState('data');
  const [versions, setVersions] = useState(null); // null = لم تُقرأ بعد
  const [loadingV, setLoadingV] = useState(false);
  useBackClose(onClose, 'archive-detail');

  useEffect(() => {
    if (pane !== 'versions' || versions !== null || doc.source !== 'live') return;
    setLoadingV(true);
    fetchArchiveVersions(doc.id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoadingV(false));
  }, [pane, versions, doc.id, doc.source]);

  const status = docStatus(doc, today());
  const rows = [
    ['الرقم الإشاريّ', doc.refNumber],
    ['التصنيف', ARCHIVE_CATEGORIES[doc.category]],
    ['النوع', doc.type],
    ['الحالة', statusLabel(status)],
    ['السرّية', confidentialityLabel(doc.confidential)],
    ['تاريخ الإصدار', doc.date],
    ['تاريخ الانتهاء', doc.expiry],
    ['الفترة', doc.period],
    ['الإدارة', doc.dept],
    ['المشروع', doc.project],
    ['الجهة المصدِرة', doc.issuer],
    ['العميل', doc.client],
    ['الكلمات المفتاحية', doc.keywords],
    ['اعتمدها', doc.approvedBy && `${doc.approvedBy}${doc.approvedDate ? ` · ${doc.approvedDate}` : ''}`],
    ['رفعها', doc.byName],
    ['اسم الملفّ', doc.fileName],
  ].filter(([, v]) => v);

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>{doc.title}</h3>
          <button className="kbtn b-ghost" onClick={onClose}>✕ إغلاق</button>
        </div>

        <div className="ar-panes">
          {[['data', 'البيانات'], ['versions', 'الإصدارات'], ['track', 'التتبّع']].map(([k, label]) => (
            <button key={k} className={`ar-pane ${pane === k ? 'on' : ''}`} onClick={() => setPane(k)}>
              {label}
              {k === 'track' && doc.tracking?.length > 0 && <span className="ar-tab-n">{doc.tracking.length}</span>}
              {k === 'versions' && doc.versionCount > 0 && <span className="ar-tab-n">{doc.versionCount}</span>}
            </button>
          ))}
        </div>

        <div className="dlgbody">
          {pane === 'data' && (
            <>
              <div className="ar-chipline">
                <StatusBadge doc={doc} />
                <ConfBadge level={doc.confidential} />
                {doc.primary && <span className="ar-badge sm">المصدر المعتمد</span>}
              </div>
              <dl className="ar-dl">
                {rows.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              {doc.note && <p className="ar-note">{doc.note}</p>}
              {doc.ocrText && (
                <details className="ar-ocr">
                  <summary>النصّ المستخرَج ({doc.ocrText.length} حرفًا)</summary>
                  <pre>{doc.ocrText}</pre>
                </details>
              )}
            </>
          )}

          {pane === 'versions' && (
            doc.source !== 'live' ? (
              <div className="kempty">البذرة الثابتة لا إصدارات لها — تُحرَّر في المستودع.</div>
            ) : loadingV ? (
              <div className="kempty">يُقرأ سجلّ الإصدارات…</div>
            ) : !versions || versions.length === 0 ? (
              <div className="kempty">لم تُحرَّر هذه الوثيقة بعد — لا إصدارات سابقة.</div>
            ) : (
              <ul className="ar-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <span className="ar-num">إصدار {v.version}</span>
                    <span className="ar-list-main">{v.snapshot?.title || 'بلا عنوان'}</span>
                    <span className="ar-list-by">{v.byName}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {pane === 'track' && (
            !doc.tracking || doc.tracking.length === 0 ? (
              <div className="kempty">لا سجلّ تتبّعٍ لهذه الوثيقة.</div>
            ) : (
              <ul className="ar-list">
                {[...doc.tracking].reverse().map((t, i) => (
                  <li key={`${t.at}-${i}`}>
                    <span className="ar-op">{t.action}</span>
                    <span className="ar-list-main">{t.byName}</span>
                    <span className="ar-list-by">{String(t.at || '').slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        <div className="dlgfoot">
          <button className="kbtn b-accent" onClick={onOpen}>فتح الملفّ</button>
          {canWrite && doc.editable && (
            <button className="kbtn b-ghost" onClick={onEdit}>تحرير البيانات</button>
          )}
          {canWrite && doc.editable && doc.status !== 'approved' && (
            <button className="kbtn b-ghost" onClick={onApprove}>اعتماد</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ الحقول الوصفيّة (مشتركة: رفعٌ وتحرير) ═══════════════ */

function MetaFields({ f, set, refOk }) {
  return (
    <>
      <div className="fld">
        <label>التصنيف</label>
        <div className="chips" style={{ marginTop: 4 }}>
          {Object.entries(ARCHIVE_CATEGORIES).map(([key, label]) => (
            <button key={key} type="button" className={`chip ${f.category === key ? 'on' : ''}`}
              onClick={() => set('category', key)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="fld">
        <label>العنوان *</label>
        <input type="text" value={f.title} autoFocus placeholder="مثال: التقرير الشامل الأسبوعي — W32"
          onChange={(e) => set('title', e.target.value)} />
      </div>
      <div className="frow c2">
        <div className="fld">
          <label>الرقم الإشاريّ</label>
          <input type="text" value={f.refNumber} placeholder="BFP-SCM-PR-2026-007"
            className={!refOk ? 'bad' : ''} onChange={(e) => set('refNumber', e.target.value)} />
        </div>
        <div className="fld">
          <label>النوع</label>
          <select value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">بلا نوع</option>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="frow c3">
        <div className="fld">
          <label>تاريخ الإصدار</label>
          <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="fld">
          <label>تاريخ الانتهاء</label>
          <input type="date" value={f.expiry} onChange={(e) => set('expiry', e.target.value)} />
        </div>
        <div className="fld">
          <label>الفترة</label>
          <input type="text" value={f.period} placeholder="الأسبوع W32 · 2026"
            onChange={(e) => set('period', e.target.value)} />
        </div>
      </div>
      <div className="frow c2">
        <div className="fld">
          <label>الحالة</label>
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(STORED_STATUSES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label>درجة السرّية</label>
          <select value={f.confidential} onChange={(e) => set('confidential', e.target.value)}>
            {Object.entries(CONFIDENTIALITY).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="frow c2">
        <div className="fld">
          <label>الإدارة</label>
          <input type="text" value={f.dept} onChange={(e) => set('dept', e.target.value)} />
        </div>
        <div className="fld">
          <label>المشروع</label>
          <input type="text" value={f.project} onChange={(e) => set('project', e.target.value)} />
        </div>
      </div>
      <div className="frow c2">
        <div className="fld">
          <label>الجهة المصدِرة</label>
          <input type="text" value={f.issuer} onChange={(e) => set('issuer', e.target.value)} />
        </div>
        <div className="fld">
          <label>العميل</label>
          <input type="text" value={f.client} onChange={(e) => set('client', e.target.value)} />
        </div>
      </div>
      <div className="fld">
        <label>الكلمات المفتاحية</label>
        <input type="text" value={f.keywords} placeholder="كلماتٌ تفصل بينها فاصلة — تُبحث مع العنوان"
          onChange={(e) => set('keywords', e.target.value)} />
      </div>
      <div className="fld">
        <label>ملاحظة</label>
        <textarea value={f.note} placeholder="وصفٌ موجز للوثيقة…" onChange={(e) => set('note', e.target.value)} />
      </div>
      <div className="fld">
        <label>النصّ المستخرَج (للبحث الداخليّ)</label>
        <textarea value={f.ocrText} rows={4}
          placeholder="الصق نصّ الوثيقة هنا ليصير قابلًا للبحث. (الاستخراج الآليّ OCR مرحلةٌ تالية.)"
          onChange={(e) => set('ocrText', e.target.value)} />
      </div>
    </>
  );
}

/* ═══════════════ لوحة الرفع ═══════════════ */

function UploadForm({ onCancel, onUpload, showToast }) {
  const [f, setF] = useState(EMPTY_FIELDS);
  const [file, setFile] = useState(null); // { raw, data?, format, name, route }
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  useBackClose(onCancel, 'archive-upload');

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const refOk = isValidRefNumber(f.refNumber);

  const pickFile = (raw) => {
    if (!raw) return;
    const v = validateArchiveFile(raw);
    if (!v.ok) {
      showToast(v.error);
      return;
    }
    if (v.route === 'storage') {
      // الكبير لا يُقرأ في الذاكرة أصلًا — يُسلَّم كما هو لمسار الرفع.
      setFile({ raw, format: v.format, name: raw.name, route: 'storage', hint: routeExplain(v, raw) });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setFile({ raw, data: reader.result, format: v.format, name: raw.name, route: 'inline', hint: routeExplain(v, raw) });
    reader.onerror = () => showToast('تعذّرت قراءة الملفّ.');
    reader.readAsDataURL(raw);
  };

  const submit = async () => {
    if (!f.title.trim()) return showToast('العنوان مطلوب.');
    if (!file) return showToast('اختر ملفًّا للرفع.');
    if (!refOk) return showToast('الرقم الإشاريّ بصيغةٍ غير صحيحة (مثال: BFP-SCM-PR-2026-006).');
    setBusy(true);
    setPct(0);
    const payload = file.route === 'storage'
      ? { route: 'storage', file: file.raw, onProgress: setPct }
      : { route: 'inline', fileData: file.data };
    await onUpload({ ...f, title: f.title.trim(), format: file.format, fileName: file.name }, payload);
    setBusy(false);
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>رفع وثيقة إلى الأرشيف</h3>
          <button className="kbtn b-ghost" onClick={onCancel} disabled={busy}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <MetaFields f={f} set={set} refOk={refOk} />
          <div className="fld">
            <label>الملفّ * (HTML / PDF / صورة)</label>
            <input type="file" accept=".html,.htm,application/pdf,image/jpeg,image/png"
              onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
          </div>
          {file && (
            <div className="ar-file-ok">
              اختير: {file.name} ({file.format}) — {file.hint}
            </div>
          )}
          {busy && file?.route === 'storage' && (
            <div className="ar-prog">
              <div className="ar-prog-track"><div className="ar-prog-fill" style={{ width: `${pct}%` }} /></div>
              <span>{pct}%</span>
            </div>
          )}
          <div className="ar-hint">
            الصغير يُحفظ داخل الوثيقة (حتى ٧٠٠ك.ب للـPDF/الصورة و٩٠٠ك.ب للـHTML)،
            والأكبر يُرفع إلى مخزن الملفّات حتى ٥٠م.ب. القرار آليّ بالحجم.
          </div>
        </div>
        <div className="dlgfoot">
          <button className="kbtn b-accent" onClick={submit} disabled={busy || !f.title.trim() || !file}>
            {busy ? 'يُرفع…' : 'رفع'}
          </button>
          <button className="kbtn b-ghost" onClick={onCancel} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ لوحة التحرير (البيانات لا الملفّ) ═══════════════ */

function EditForm({ doc, onCancel, onSave, showToast }) {
  const [f, setF] = useState(() => fieldsOf(doc));
  const [busy, setBusy] = useState(false);
  useBackClose(onCancel, 'archive-edit');

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const refOk = isValidRefNumber(f.refNumber);
  const refLocked = Boolean(doc.refNumber);

  const submit = async () => {
    if (!f.title.trim()) return showToast('العنوان مطلوب.');
    if (!refOk) return showToast('الرقم الإشاريّ بصيغةٍ غير صحيحة.');
    setBusy(true);
    await onSave({ ...f, title: f.title.trim() });
    setBusy(false);
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>تحرير بيانات الوثيقة</h3>
          <button className="kbtn b-ghost" onClick={onCancel} disabled={busy}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <div className="ar-hint">
            الملفّ نفسه لا يُستبدَل — التحرير للبيانات وحدها، وتُحفظ لقطةُ ما قبله
            في «الإصدارات».{refLocked ? ' والرقم الإشاريّ ثابتٌ بعد كتابته.' : ''}
          </div>
          <MetaFields f={f} set={set} refOk={refOk} />
        </div>
        <div className="dlgfoot">
          <button className="kbtn b-accent" onClick={submit} disabled={busy || !f.title.trim()}>
            {busy ? 'يُحفظ…' : 'حفظ التعديل'}
          </button>
          <button className="kbtn b-ghost" onClick={onCancel} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ عارض HTML الحيّ (iframe معزول) ═══════════════ */

function HtmlViewer({ doc, onClose }) {
  useBackClose(onClose, 'archive-viewer');
  // فكّ ترميز dataURL إلى نصّ HTML لعرضه في iframe معزول (sandbox بلا سكربتات).
  let html = '';
  try {
    const comma = String(doc.fileData || '').indexOf(',');
    html = comma >= 0 ? decodeURIComponent(escape(atob(doc.fileData.slice(comma + 1)))) : '';
  } catch {
    html = '<p style="font-family:sans-serif;padding:2rem">تعذّر عرض الوثيقة.</p>';
  }
  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlgbox viewer" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>{doc.title}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="kbtn b-ghost" href={doc.fileData} download={doc.fileName || doc.title}>تنزيل</a>
            <button className="kbtn b-ghost" onClick={onClose}>✕ إغلاق</button>
          </div>
        </div>
        <iframe className="ar-frame" title={doc.title} sandbox="allow-popups allow-downloads" srcDoc={html} />
      </div>
    </div>
  );
}

/* ═══════════════ توست ═══════════════ */

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="toastw">
      <div className="toast">{msg}</div>
    </div>
  );
}
