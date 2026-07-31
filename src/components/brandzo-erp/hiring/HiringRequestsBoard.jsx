/**
 * طلبات التوظيف من الإدارات — منفصلة عن «التوظيف» (بيانات مرشحي المالك).
 * إدارة تكتب بطاقة تعريفية كاملة عن مرشّحها (اسم · مسمّى · هاتف · مؤهل …
 * وسيرة اختيارية) وترى طلباتها هي فقط؛ المدير العام ومدير المستودع يراجعان
 * كل الطلبات من كل الإدارات. النموذج بنفس حقول شاشة التوظيف الأصلية.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ListView + Badge + o_input + o_alert) — **المنطق (الاشتراكات والصلاحيات
 * والإرسال ورفع السيرة) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2).
 */
import { useEffect, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { jobOptions } from '../../../services/recruitment/jobsCatalog.js';
import { validateCv, ACCEPTED_CV_TYPES } from '../../../services/recruitment/cvFile.js';
import {
  canSubmitHiringRequest,
  canReviewHiringRequests,
  addHiringRequest,
  listenMyHiringRequests,
  listenAllHiringRequests,
  openCv,
} from '../../../services/hiring/hiringRequestsService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

const fmtDate = (ts) => ts?.toDate?.()?.toLocaleDateString('ar-LY-u-nu-latn') || '—';

export default function HiringRequestsBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const isReviewer = canReviewHiringRequests(me?.role);
  const isRequester = canSubmitHiringRequest(me?.role);

  useEffect(() => {
    if (!me) return;
    if (isReviewer) {
      return listenAllHiringRequests(setRows, (e) => setErr(e?.message || 'تعذّر الاتصال'));
    }
    if (isRequester) {
      return listenMyHiringRequests(me.uid, setRows, (e) => setErr(e?.message || 'تعذّر الاتصال'));
    }
  }, [me, isReviewer, isRequester]);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_ds_card"><div className="o_dashboard_empty">جارٍ التحقّق…</div></div></div>
      </div>
    );
  }

  if (!me || (!isReviewer && !isRequester)) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds">
          <div className="o_alert danger">
            <div className="o_alert_title"><Icon name="shield" size={16} /> غير مصرّح</div>
            هذه الشاشة لطلبات التوظيف من الإدارات فقط.
          </div>
        </div>
      </div>
    );
  }

  const cols = [
    { key: 'candidate', label: 'المرشّح' },
    { key: 'department', label: 'الإدارة' },
    { key: 'jobTitle', label: 'المسمى الوظيفي' },
    { key: 'qual', label: 'المؤهل · الخبرة' },
    { key: 'cv', label: 'السيرة' },
    ...(isReviewer ? [{ key: 'by', label: 'أُرسل بواسطة' }] : []),
    { key: 'date', label: 'التاريخ' },
    { key: 'status', label: 'الحالة' },
  ];

  const listRows = rows.map((r) => ({
    id: r.id,
    cells: {
      candidate: (
        <div>
          <span className="decoration-bf">{r.name || '—'}</span>
          <div style={{ direction: 'ltr', textAlign: 'right', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>{r.phone || '—'}</div>
        </div>
      ),
      department: r.departmentName,
      jobTitle: r.jobTitle,
      qual: `${r.qualification || '—'}${r.experienceYears ? ` · ${r.experienceYears} سنة` : ''}`,
      cv: r.hasCv ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCv(r.id).catch((e) => setErr(e.message))}>
          <Icon name="fileText" size={14} /> فتح
        </button>
      ) : (
        <span style={{ color: 'var(--o-gray-500)' }}>—</span>
      ),
      ...(isReviewer ? { by: r.createdByName } : {}),
      date: fmtDate(r.createdAt),
      status: <Badge variant="progress">مُرسَل</Badge>,
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">طلبات التوظيف</span></nav>
        </div>
      </div>

      <div className="o_ds">
        {msg && <div className="o_alert success">{msg}</div>}
        {err && <div className="o_alert danger">{err}</div>}

        {isRequester && (
          <div style={{ marginBottom: '18px' }}>
            <RequestForm
              profile={me}
              onSaved={() => flash('أُرسل الطلب بنجاح وحُفظ في السحابة.')}
              onError={(t) => setErr(t)}
            />
          </div>
        )}

        <div className="o_ds_card">
          {rows.length === 0 ? (
            <div className="o_dashboard_empty">
              {isReviewer ? 'لا طلبات بعد من أي إدارة.' : 'لا طلبات لك بعد — أرسل أول طلب أعلاه.'}
            </div>
          ) : (
            <ListView selectable={false} columns={cols} rows={listRows} />
          )}
        </div>
      </div>
    </div>
  );
}

function RequestForm({ profile, onSaved, onError }) {
  const [departmentName, setDepartmentName] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [qualification, setQualification] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [notes, setNotes] = useState('');
  const [cv, setCv] = useState(null);
  const [cvError, setCvError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const filledDetails = [phone, email, qualification, experienceYears, notes, cv].filter(Boolean).length;

  const input = 'o_input';

  function pickCv(e) {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setCv(null);
      setCvError('');
      return;
    }
    const check = validateCv(f);
    setCvError(check.ok ? '' : check.error);
    setCv(check.ok ? f : null);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addHiringRequest({
        departmentName, name, jobTitle, phone, email,
        qualification, experienceYears, notes, cvFile: cv, profile,
      });
      setDepartmentName('');
      setName('');
      setJobTitle('');
      setPhone('');
      setEmail('');
      setQualification('');
      setExperienceYears('');
      setNotes('');
      setCv(null);
      setShowDetails(false);
      onSaved();
    } catch (ex) {
      onError(ex.message || 'تعذّر إرسال الطلب.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="o_ds_card o_ds_pad" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="userPlus" size={18} /> طلب توظيف جديد
      </h3>

      {/* الأساسي: الإدارة · المرشّح · المسمّى */}
      <div className="o_form_grid">
        <L label="اسم الإدارة" required>
          <input className={input} value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} required autoFocus />
        </L>
        <L label="اسم المرشّح" required>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </L>
        <L label="المسمى الوظيفي" required>
          <input className={input} list="hiring-job-titles" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
          <datalist id="hiring-job-titles">
            {jobOptions().map((j) => (
              <option key={j.id} value={j.title} />
            ))}
          </datalist>
        </L>
      </div>

      {/* التفاصيل الإضافية: مطويّة كي لا يواجه المستخدم جدارًا */}
      <div style={{ borderTop: '1px solid var(--o-border-color)', paddingTop: '12px' }}>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="btn btn-secondary btn-sm"
          aria-expanded={showDetails}
        >
          <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: showDetails ? 'rotate(90deg)' : 'none' }}>▸</span>
          بطاقة تعريفية (رقم الهاتف · المؤهل · السيرة …)
          {!showDetails && filledDetails > 0 && (
            <Badge variant="progress">{int(filledDetails)} مُدخَل</Badge>
          )}
        </button>

        {showDetails && (
          <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="o_form_grid">
              <L label="رقم الهاتف">
                <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} style={{ direction: 'ltr', textAlign: 'right' }} />
              </L>
              <L label="البريد الإلكتروني">
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ direction: 'ltr', textAlign: 'right' }} />
              </L>
              <L label="المؤهل">
                <input className={input} value={qualification} onChange={(e) => setQualification(e.target.value)} />
              </L>
              <L label="سنوات الخبرة">
                <input className={input} type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} />
              </L>
            </div>

            <L label="ملاحظات / وصف الحاجة">
              <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="لماذا تحتاج الإدارة هذه الوظيفة؟ أي ملاحظات عن المرشّح…" />
            </L>

            <L label="السيرة الذاتية (PDF أو صورة — حتى 700KB)">
              <input
                className="o_input"
                type="file"
                accept={Object.keys(ACCEPTED_CV_TYPES).join(',')}
                onChange={pickCv}
              />
              {cvError && <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-text-danger)', marginTop: '4px' }}>{cvError}</p>}
              {cv && !cvError && (
                <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-action)', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="fileText" size={13} /> {cv.name}
                </p>
              )}
            </L>
          </div>
        )}
      </div>

      <div className="o_form_actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
        </button>
      </div>
    </form>
  );
}

function L({ label, required, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}
