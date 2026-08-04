import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARCHIVE_SEED } from '../../../services/archive/archiveSeed.js';
import {
  mergeArchive,
  byCategory,
  archiveSummary,
  ARCHIVE_CATEGORIES,
} from '../../../services/archive/archiveModel.js';
import { validateArchiveFile, isValidRefNumber } from '../../../services/archive/archiveFile.js';
import { listenArchive, addArchiveDoc } from '../../../services/archive/archiveService.js';
import { openOverlay, closeOverlay } from '../../../services/ui/overlayHistory.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';

/**
 * الأرشيف الدوريّ — التقارير ومحاضر الاجتماعات في مصدرٍ واحدٍ معتمد.
 *
 * طبقتان: بذرةٌ ثابتة تُفتح حيًّا من `public/archive/`، ورفعٌ حيّ يخزّنه المالك
 * في أيّ وقت (base64 في Firestore). تبويبان (تقارير · محاضر)، وشارةٌ للمصدر
 * الأوّل المعتمد، ولوحةُ رفعٍ للمديرَين. الأرقام الإشاريّة `BFP-SCM-PR`.
 */

const WRITER_ROLES = ['admin', 'warehouse_manager'];

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

export default function PeriodicArchive() {
  const [profile, setProfile] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [liveById, setLiveById] = useState({});
  const [tab, setTab] = useState('report');
  const [uploading, setUploading] = useState(false);
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

  const list = mergeArchive(ARCHIVE_SEED, liveById);
  const summary = archiveSummary(list);
  const shown = byCategory(list, tab);

  const handleUpload = async (fields, fileData) => {
    if (!canWrite) return;
    try {
      await addArchiveDoc(fields, fileData, profile);
      setUploading(false);
      showToast(`رُفع «${fields.title}» إلى الأرشيف`);
    } catch (e) {
      showToast('تعذّر الرفع: ' + e.message);
    }
  };

  const openDoc = (d) => {
    if (d.source === 'seed') {
      window.open(`${BASE}${d.path}`, '_blank', 'noopener');
    } else if (d.format === 'html') {
      setViewer(d);
    } else if (d.fileData) {
      window.open(d.fileData, '_blank', 'noopener');
    }
  };

  return (
    <div className="ar-wrap">
      {/* رأس */}
      <div className="ar-hero">
        <div className="ar-hero-main">
          <h2>الأرشيف الدوريّ — التقارير ومحاضر الاجتماعات</h2>
          <p>
            المصدر الأوّل المعتمد للتقارير الدورية والمحاضر — لا ملفّاتٌ متناثرة. كلّ
            وثيقةٍ برقمها الإشاريّ وتاريخها، تُفتح حيًّا، ويمكن رفع جديدٍ في أيّ وقت.
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
          </div>
          {canWrite && (
            <button className="kbtn b-accent" onClick={() => setUploading(true)}>＋ رفع وثيقة</button>
          )}
        </div>
      </div>

      {/* تبويبان */}
      <div className="ar-tabs">
        {Object.entries(ARCHIVE_CATEGORIES).map(([key, label]) => (
          <button key={key} className={`ar-tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
            {label}
            <span className="ar-tab-n">{byCategory(list, key).length}</span>
          </button>
        ))}
      </div>

      {/* البطاقات */}
      {shown.length === 0 ? (
        <div className="kempty">لا وثائق في هذا التصنيف بعد.</div>
      ) : (
        <div className="ar-grid">
          {shown.map((d) => (
            <ArchiveCard key={d.id} doc={d} onOpen={() => openDoc(d)} />
          ))}
        </div>
      )}

      {uploading && (
        <UploadForm onCancel={() => setUploading(false)} onUpload={handleUpload} showToast={showToast} />
      )}
      {viewer && <HtmlViewer doc={viewer} onClose={() => setViewer(null)} />}
      <Toast msg={toastMsg} />
    </div>
  );
}

/* ═══════════════ بطاقة وثيقة ═══════════════ */

function ArchiveCard({ doc, onOpen }) {
  const fmt = { html: 'HTML', pdf: 'PDF', image: 'صورة' }[doc.format] || doc.format;
  return (
    <div className={`ar-card ${doc.primary ? 'primary' : ''}`}>
      <div className="ar-card-top">
        <span className="ar-num">{doc.refNumber || 'بلا رقم'}</span>
        {doc.primary && <span className="ar-badge sm">معتمد</span>}
        <span className="ar-fmt">{fmt}</span>
      </div>
      <h3 className="ar-title">{doc.title}</h3>
      <div className="ar-meta">
        {doc.date || 'بلا تاريخ'}
        {doc.period ? ` · ${doc.period}` : ''}
        {doc.source === 'live' ? ' · مرفوع' : ''}
      </div>
      {doc.note && <p className="ar-note">{doc.note}</p>}
      <div className="ar-card-foot">
        <button className="kbtn b-accent sm" onClick={onOpen}>فتح</button>
        {doc.source === 'live' && doc.fileData && doc.format !== 'html' && (
          <a className="kbtn b-ghost sm" href={doc.fileData} download={doc.fileName || doc.title}>تنزيل</a>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ لوحة الرفع ═══════════════ */

function UploadForm({ onCancel, onUpload, showToast }) {
  const [category, setCategory] = useState('report');
  const [title, setTitle] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null); // { data, format, name }
  const [busy, setBusy] = useState(false);
  useBackClose(onCancel, 'archive-upload');

  const refOk = isValidRefNumber(refNumber);

  const pickFile = (f) => {
    if (!f) return;
    const v = validateArchiveFile(f);
    if (!v.ok) {
      showToast(v.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFile({ data: reader.result, format: v.format, name: f.name });
    reader.onerror = () => showToast('تعذّرت قراءة الملفّ.');
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!title.trim()) return showToast('العنوان مطلوب.');
    if (!file) return showToast('اختر ملفًّا للرفع.');
    if (!refOk) return showToast('الرقم الإشاريّ بصيغةٍ غير صحيحة (مثال: BFP-SCM-PR-2026-006).');
    setBusy(true);
    await onUpload(
      { category, title: title.trim(), refNumber: refNumber.trim(), date, period: period.trim(), note: note.trim(), format: file.format, fileName: file.name },
      file.data
    );
    setBusy(false);
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>رفع وثيقة إلى الأرشيف</h3>
          <button className="kbtn b-ghost" onClick={onCancel}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <div className="fld">
            <label>التصنيف</label>
            <div className="chips" style={{ marginTop: 4 }}>
              {Object.entries(ARCHIVE_CATEGORIES).map(([key, label]) => (
                <button key={key} type="button" className={`chip ${category === key ? 'on' : ''}`}
                  onClick={() => setCategory(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="fld">
            <label>العنوان *</label>
            <input type="text" value={title} autoFocus placeholder="مثال: التقرير الشامل الأسبوعي — W32"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>الرقم الإشاريّ</label>
              <input type="text" value={refNumber} placeholder="BFP-SCM-PR-2026-007"
                className={!refOk ? 'bad' : ''} onChange={(e) => setRefNumber(e.target.value)} />
            </div>
            <div className="fld">
              <label>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>الفترة</label>
              <input type="text" value={period} placeholder="الأسبوع W32 · 2026"
                onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="fld">
              <label>الملفّ * (HTML / PDF / صورة)</label>
              <input type="file" accept=".html,.htm,application/pdf,image/jpeg,image/png"
                onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
            </div>
          </div>
          <div className="fld">
            <label>ملاحظة</label>
            <textarea value={note} placeholder="وصفٌ موجز للوثيقة…" onChange={(e) => setNote(e.target.value)} />
          </div>
          {file && <div className="ar-file-ok">اختير الملفّ: {file.name} ({file.format})</div>}
          <div className="ar-hint">
            الحدّ ~٩٠٠ك.ب للملفّ (نصّ HTML خفيف أو PDF مضغوط). رفع PDF متعدّد الميغابايت
            مباشرةً يحتاج تفعيل Storage لاحقًا.
          </div>
        </div>
        <div className="dlgfoot">
          <button className="kbtn b-accent" onClick={submit} disabled={busy || !title.trim() || !file}>
            {busy ? 'يُرفع…' : 'رفع'}
          </button>
          <button className="kbtn b-ghost" onClick={onCancel}>إلغاء</button>
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
