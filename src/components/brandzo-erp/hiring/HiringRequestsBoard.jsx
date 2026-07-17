/**
 * طلبات التوظيف من الإدارات — منفصلة عن «التوظيف» (بيانات مرشحي المالك).
 * إدارة تكتب بطاقة تعريفية كاملة عن مرشّحها (اسم · مسمّى · هاتف · مؤهل …
 * وسيرة اختيارية) وترى طلباتها هي فقط؛ المدير العام ومدير المستودع يراجعان
 * كل الطلبات من كل الإدارات. النموذج بنفس حقول شاشة التوظيف الأصلية.
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

const fmtDate = (ts) => ts?.toDate?.()?.toLocaleDateString('ar-LY') || '—';

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

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق…</p>;

  if (!me || (!isReviewer && !isRequester)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🚫 غير مصرّح</p>
        <p className="text-sm">هذه الشاشة لطلبات التوظيف من الإدارات فقط.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      {msg && (
        <div className="bg-brand-gold/15 border border-brand-gold/40 text-brand-gold rounded-xl px-4 py-2.5 text-sm text-center">
          {msg}
        </div>
      )}
      {err && (
        <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-xl px-4 py-2 text-sm text-center">
          {err}
        </div>
      )}

      {isRequester && (
        <RequestForm
          profile={me}
          onSaved={() => flash('أُرسل الطلب بنجاح وحُفظ في السحابة.')}
          onError={(t) => setErr(t)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] text-right">
          <thead>
            <tr className="bg-white/10">
              {[
                'المرشّح',
                'الإدارة',
                'المسمى الوظيفي',
                'المؤهل · الخبرة',
                'السيرة',
                ...(isReviewer ? ['أُرسل بواسطة'] : []),
                'التاريخ',
                'الحالة',
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-bold text-gray-300 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isReviewer ? 8 : 7} className="p-8 text-center text-gray-500 text-sm">
                  {isReviewer ? 'لا طلبات بعد من أي إدارة.' : 'لا طلبات لك بعد — أرسل أول طلب أعلاه.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2">
                    <p className="text-sm font-bold text-white">{r.name || '—'}</p>
                    <p className="text-[11px] text-gray-500" style={{ direction: 'ltr', textAlign: 'right' }}>{r.phone || '—'}</p>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">{r.departmentName}</td>
                  <td className="px-3 py-2 text-sm text-gray-200">{r.jobTitle}</td>
                  <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap">
                    {r.qualification || '—'}{r.experienceYears ? ` · ${r.experienceYears} سنة` : ''}
                  </td>
                  <td className="px-3 py-2">
                    {r.hasCv ? (
                      <button
                        type="button"
                        onClick={() => openCv(r.id).catch((e) => setErr(e.message))}
                        className="text-xs font-bold text-brand-gold hover:underline"
                      >
                        📄 فتح
                      </button>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                  {isReviewer && (
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{r.createdByName}</td>
                  )}
                  <td className="px-3 py-2 text-[11px] text-gray-500 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap bg-brand-gold/15 border-brand-gold/40 text-brand-gold">
                      🆕 مُرسَل
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

  const input =
    'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-gold/60';

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
    <form onSubmit={submit} className="bg-white/5 border border-brand-gold/25 rounded-2xl p-4 sm:p-5 space-y-4">
      <h3 className="text-base font-bold text-brand-gold">＋ طلب توظيف جديد</h3>

      {/* الأساسي: الإدارة · المرشّح · المسمّى */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
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
      <div className="border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-brand-gold transition-colors"
        >
          <span className={`inline-block transition-transform duration-200 ${showDetails ? 'rotate-90' : ''}`}>▸</span>
          بطاقة تعريفية (رقم الهاتف · المؤهل · السيرة …)
          {!showDetails && filledDetails > 0 && (
            <span className="text-[11px] bg-brand-gold/20 text-brand-gold rounded-full px-2 py-0.5">{filledDetails} مُدخَل</span>
          )}
        </button>

        {showDetails && (
          <div className="pt-4 space-y-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
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
                className="w-full text-xs text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-gold/20 file:text-brand-gold file:font-bold file:cursor-pointer"
                type="file"
                accept={Object.keys(ACCEPTED_CV_TYPES).join(',')}
                onChange={pickCv}
              />
              {cvError && <p className="text-xs text-red-300 mt-1">{cvError}</p>}
              {cv && !cvError && <p className="text-xs text-brand-gold mt-1">📄 {cv.name}</p>}
            </L>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-gold text-brand-navy hover:bg-brand-gold/85 transition-colors disabled:opacity-50"
      >
        {saving ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
      </button>
    </form>
  );
}

function L({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-brand-red mr-1">*</span>}
      </label>
      {children}
    </div>
  );
}
