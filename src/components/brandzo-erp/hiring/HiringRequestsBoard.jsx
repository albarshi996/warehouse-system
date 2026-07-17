/**
 * طلبات التوظيف من الإدارات — منفصلة عن «التوظيف» (بيانات مرشحين حسّاسة).
 * إدارة تكتب مسمّى وظيفي + بطاقة تعريفية وترى طلباتها هي فقط؛ المدير العام
 * ومدير المستودع يراجعان كل الطلبات من كل الإدارات.
 */
import { useEffect, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { jobOptions } from '../../../services/recruitment/jobsCatalog.js';
import {
  canSubmitHiringRequest,
  canReviewHiringRequests,
  addHiringRequest,
  listenMyHiringRequests,
  listenAllHiringRequests,
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
          onSaved={() => setMsg('أُرسل الطلب بنجاح.')}
          onError={(t) => setErr(t)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-right">
          <thead>
            <tr className="bg-white/10">
              {[
                'المسمى الوظيفي',
                'الإدارة',
                'بطاقة التعريف',
                ...(isReviewer ? ['أُرسل بواسطة'] : []),
                'التاريخ',
                'الحالة',
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-bold text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isReviewer ? 6 : 5} className="p-8 text-center text-gray-500 text-sm">
                  {isReviewer ? 'لا طلبات بعد من أي إدارة.' : 'لا طلبات لك بعد — أرسل أول طلب أعلاه.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2 text-sm font-bold text-white whitespace-nowrap">{r.jobTitle}</td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">{r.departmentName}</td>
                  <td className="px-3 py-2 text-sm text-gray-300 max-w-[320px]">{r.description || '—'}</td>
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
  const [jobTitle, setJobTitle] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const input =
    'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-gold/60';

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addHiringRequest({ jobTitle, departmentName, description, profile });
      setJobTitle('');
      setDepartmentName('');
      setDescription('');
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

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <label className="block text-xs font-bold text-gray-300 mb-1.5">
            اسم الإدارة<span className="text-brand-red mr-1">*</span>
          </label>
          <input
            className={input}
            value={departmentName}
            onChange={(e) => setDepartmentName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-300 mb-1.5">
            المسمى الوظيفي<span className="text-brand-red mr-1">*</span>
          </label>
          <input className={input} list="hiring-job-titles" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
          <datalist id="hiring-job-titles">
            {jobOptions().map((j) => (
              <option key={j.id} value={j.title} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-300 mb-1.5">بطاقة تعريفية (وصف الحاجة والمهام المطلوبة)</label>
        <textarea
          className={input}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="لماذا تحتاج الإدارة هذه الوظيفة؟ المهام والمتطلبات الأساسية..."
        />
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
