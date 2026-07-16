/**
 * لوحة التوظيف — المرشحون أحياءً في السحابة بدل جدول ثابت في صفحة تقرير.
 *
 * المسمّى يُختار من الكتالوج الرسمي (المولَّد من ملف الهيكل) فيتعبّأ الوصف
 * والتبعية تلقائيًّا. السيرة تُرفق وتُفتح عند الطلب. العملة: دينار ليبي.
 * الوصول: المدير العام ومدير المستودع (والإلزام الحقيقي في قواعد Firestore).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { JOBS, getJob, jobOptions } from '../../../services/recruitment/jobsCatalog.js';
import {
  canRecruit,
  CANDIDATE_STATES,
  candidateState,
  addCandidate,
  updateCandidate,
  setCandidateState,
  listenCandidates,
  openCv,
} from '../../../services/recruitment/candidatesService.js';
import { validateCv, ACCEPTED_CV_TYPES } from '../../../services/recruitment/cvFile.js';
import CandidatePrint from './CandidatePrint.jsx';

const LYD = (n) => `${Number(n || 0).toLocaleString('ar-LY')} د.ل`;

export default function RecruitmentBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | candidate object
  const [printing, setPrinting] = useState(null); // المرشح المراد طباعته
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !canRecruit(me.role)) return;
    const unsub = listenCandidates(setRows, (e) => setErr(e?.message || 'تعذّر الاتصال'));
    return () => unsub();
  }, [me]);

  const flash = (text, tone = 'ok') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4000);
  };

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.state === filter)),
    [rows, filter]
  );

  const counts = useMemo(() => {
    const c = {};
    for (const r of rows) c[r.state] = (c[r.state] || 0) + 1;
    return c;
  }, [rows]);

  async function changeState(row, state) {
    if (state === row.state) return;
    let note = '';
    if (state === 'rejected') {
      note = window.prompt('سبب الرفض — إلزامي (يُوثَّق باسمك في سجلّ التدقيق):') || '';
      if (!note.trim()) return;
    }
    try {
      await setCandidateState(row.id, state, { note, profile: me });
      flash(`${row.name} ← ${candidateState(state).label}`);
    } catch (e) {
      flash(e.message, 'err');
    }
  }

  function printCandidate(row) {
    setPrinting(row);
    // ننتظر رسم بطاقة الطباعة ثم نطبع، ونُخفيها بعدها.
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 400);
    }, 60);
  }

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق…</p>;
  if (!me || !canRecruit(me?.role)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🚫 غير مصرّح</p>
        <p className="text-sm">بيانات المرشحين حسّاسة — هذه الشاشة للمدير العام ومدير المستودع فقط.</p>
      </div>
    );
  }

  return (
    <>
    <div dir="rtl" className="space-y-5 recruit-screen">
      {msg && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm text-center border ${
            msg.tone === 'err'
              ? 'bg-brand-red/10 border-brand-red/40 text-red-200'
              : 'bg-brand-gold/15 border-brand-gold/40 text-brand-gold'
          }`}
        >
          {msg.text}
        </div>
      )}
      {err && <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-xl px-4 py-2 text-sm text-center">{err}</div>}

      {/* لقطة سريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="إجمالي المرشحين" value={rows.length} color="#DAAA3C" />
        {Object.values(CANDIDATE_STATES).map((s) => (
          <Stat key={s.id} label={s.label} value={counts[s.id] || 0} color={s.color} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        الوظائف الشاغرة في الهيكل الرسمي: <b className="text-brand-gold">{JOBS.filter((j) => !j.occupied).length}</b> من {JOBS.length}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {['all', ...Object.keys(CANDIDATE_STATES)].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filter === k
                  ? 'bg-brand-gold text-brand-navy border-brand-gold'
                  : 'bg-white/5 text-gray-300 border-white/15 hover:border-brand-gold/50'
              }`}
            >
              {k === 'all' ? 'الكل' : candidateState(k).label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => (v ? null : 'new'))}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-gold text-brand-navy hover:bg-brand-gold/85 transition-colors"
        >
          {editing ? 'إغلاق النموذج' : '＋ إضافة مرشح'}
        </button>
      </div>

      {editing && (
        <CandidateForm
          key={editing === 'new' ? 'new' : editing.id}
          profile={me}
          candidate={editing === 'new' ? null : editing}
          onSaved={(name, isEdit) => {
            setEditing(null);
            flash(isEdit ? `حُفظت تعديلات ${name}.` : `أُضيف المرشح ${name} وحُفظ في السحابة.`);
          }}
          onCancel={() => setEditing(null)}
          onError={(t) => flash(t, 'err')}
        />
      )}

      {/* الجدول */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] text-right">
          <thead>
            <tr className="bg-white/10">
              {['المرشح', 'الوظيفة', 'الحالة', 'الراتب المتوقّع', 'السيرة', 'أُضيف', 'نقل إلى', 'إجراءات'].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-bold text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-sm">
                  {rows.length === 0 ? 'لا مرشحين بعد — ابدأ بالإضافة.' : 'لا نتائج لهذا المرشّح.'}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const st = candidateState(r.state);
                return (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <p className="text-sm font-bold text-white">{r.name}</p>
                      <p className="text-[11px] text-gray-500" style={{ direction: 'ltr', textAlign: 'right' }}>{r.phone || '—'}</p>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200">{r.jobTitle}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
                        style={{ color: st.color, borderColor: `${st.color}66`, background: `${st.color}1a` }}
                      >
                        {st.emoji} {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-brand-gold font-bold whitespace-nowrap">{r.expectedSalary ? LYD(r.expectedSalary) : '—'}</td>
                    <td className="px-3 py-2">
                      {r.hasCv ? (
                        <button
                          type="button"
                          onClick={() => openCv(r.id).catch((e) => flash(e.message, 'err'))}
                          className="text-xs font-bold text-brand-gold hover:underline"
                        >
                          📄 فتح
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-500 whitespace-nowrap">
                      {r.createdAt?.toDate?.()?.toLocaleDateString('ar-LY') || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.state}
                        onChange={(e) => changeState(r, e.target.value)}
                        className="bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        {Object.values(CANDIDATE_STATES).map((s) => (
                          <option key={s.id} value={s.id} className="bg-brand-navy">
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(r);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-xs font-bold text-brand-gold hover:underline"
                          title="تعديل بيانات المرشح"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => printCandidate(r)}
                          className="text-xs font-bold text-gray-300 hover:text-white hover:underline"
                          title="طباعة بطاقة المرشح"
                        >
                          🖨️ طباعة
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* بطاقة الطباعة — شقيقة للشاشة (لا داخلها) كي لا يُخفيها إخفاء الشاشة */}
    {printing && <CandidatePrint candidate={printing} job={getJob(printing.jobId)} />}
    </>
  );
}

function CandidateForm({ profile, candidate, onSaved, onCancel, onError }) {
  const isEdit = Boolean(candidate);
  const [name, setName] = useState(candidate?.name || '');
  const [phone, setPhone] = useState(candidate?.phone || '');
  const [email, setEmail] = useState(candidate?.email || '');
  const [qualification, setQualification] = useState(candidate?.qualification || '');
  const [experienceYears, setExperienceYears] = useState(
    candidate?.experienceYears ? String(candidate.experienceYears) : ''
  );
  const [jobId, setJobId] = useState(candidate?.jobId || '');
  const [salary, setSalary] = useState(candidate?.expectedSalary ? String(candidate.expectedSalary) : '');
  const [notes, setNotes] = useState(candidate?.notes || '');
  const [cv, setCv] = useState(null);
  const [cvError, setCvError] = useState('');
  const [saving, setSaving] = useState(false);
  // في التحرير: التفاصيل مفتوحة (المستخدم جاء ليعدّلها)؛ في الإضافة: مطويّة.
  const [showDetails, setShowDetails] = useState(isEdit);

  const job = jobId ? getJob(jobId) : null;
  // كم تفصيلًا اختياريًّا مُلئ — يظهر على زرّ الطيّ فيُعرَف أن تحته بيانات.
  const filledDetails = [phone, email, qualification, experienceYears, salary, notes, cv].filter(Boolean).length;

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
    const payload = {
      name, phone, email, qualification, experienceYears,
      job, expectedSalary: salary, notes, cvFile: cv, profile,
    };
    try {
      if (isEdit) await updateCandidate(candidate.id, payload);
      else await addCandidate(payload);
      onSaved(name, isEdit);
    } catch (ex) {
      onError(ex.message || 'تعذّر الحفظ.');
    } finally {
      setSaving(false);
    }
  }

  const input =
    'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-gold/60';

  return (
    <form onSubmit={submit} className="bg-white/5 border border-brand-gold/25 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-brand-gold">
          {isEdit ? `✏️ تعديل: ${candidate.name}` : '＋ مرشح جديد'}
        </h3>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-white">
            إلغاء
          </button>
        )}
      </div>

      {/* الأساسي فقط: الاسم والوظيفة — البقية تُطوى كي لا يواجه المستخدم جدارًا */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <L label="اسم المرشح" required>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!isEdit} />
        </L>
        <L label="الوظيفة (من الهيكل الرسمي)" required>
          <select className={input} value={jobId} onChange={(e) => setJobId(e.target.value)} required>
            <option value="">— اختر المسمّى —</option>
            {jobOptions().map((j) => (
              <option key={j.id} value={j.id} className="bg-brand-navy">
                {j.icon} {j.title}{j.occupied ? ' (مشغولة حاليًا)' : ''}
              </option>
            ))}
          </select>
        </L>
      </div>

      {/* الوصف الوظيفي يظهر تلقائيًّا عند اختيار المسمّى — لا يُكتب يدويًّا */}
      <Reveal open={Boolean(job)}>
        {job && (
          <div className="bg-brand-gold/5 border border-brand-gold/20 rounded-xl p-3 text-xs leading-relaxed">
            <p className="font-bold text-brand-gold mb-1">
              {job.icon} {job.title} — {job.layer}
            </p>
            <p className="text-gray-400 mb-1">التبعية: {job.reportingTo} · المؤشرات: {job.kpis}</p>
            <ul className="text-gray-300 space-y-0.5 pr-4 list-disc">
              {job.duties.slice(0, 4).map((d) => (
                <li key={d}>{d}</li>
              ))}
              {job.duties.length > 4 && <li className="text-gray-500">… و{job.duties.length - 4} مهام أخرى</li>}
            </ul>
            {job.occupied && <p className="text-brand-red mt-1.5 font-bold">⚠️ هذا المنصب مشغول حاليًا حسب الهيكل — الترشيح له للتعاقب أو التوسّع.</p>}
          </div>
        )}
      </Reveal>

      {/* التفاصيل الاختيارية: مطويّة، تُفتح بضغطة */}
      <div className="border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-brand-gold transition-colors"
        >
          <span className={`inline-block transition-transform duration-200 ${showDetails ? 'rotate-90' : ''}`}>▸</span>
          تفاصيل إضافية (اختياري)
          {!showDetails && filledDetails > 0 && (
            <span className="text-[11px] bg-brand-gold/20 text-brand-gold rounded-full px-2 py-0.5">{filledDetails} مُدخَل</span>
          )}
        </button>

        <Reveal open={showDetails}>
          <div className="pt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <L label="الهاتف">
                <input className={input} style={{ direction: 'ltr', textAlign: 'right' }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09x-xxxxxxx" />
              </L>
              <L label="البريد الإلكتروني">
                <input type="email" className={input} style={{ direction: 'ltr', textAlign: 'right' }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </L>
              <L label="الراتب المتوقّع (دينار ليبي)">
                <input type="number" min="0" className={input} value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0 د.ل" />
              </L>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <L label="المؤهل العلمي">
                <input className={input} value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="بكالوريوس، دبلوم…" />
              </L>
              <L label="سنوات الخبرة">
                <input type="number" min="0" className={input} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="0" />
              </L>
              <L label={`السيرة الذاتية (${Object.values(ACCEPTED_CV_TYPES).join('/')} حتى 700KB)`}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickCv} className="text-xs text-gray-400 file:ml-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-gold file:text-brand-navy file:font-bold file:cursor-pointer" />
                {cvError && <p className="text-[11px] text-red-300 mt-1">⚠️ {cvError}</p>}
                {cv && !cvError && <p className="text-[11px] text-green-300 mt-1">✓ {cv.name} ({Math.round(cv.size / 1024)}KB)</p>}
                {isEdit && candidate.hasCv && !cv && (
                  <p className="text-[11px] text-gray-500 mt-1">سيرة مرفقة حاليًا — ارفع ملفًا جديدًا لاستبدالها.</p>
                )}
              </L>
            </div>
            <L label="ملاحظات">
              <textarea className={`${input} min-h-[42px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </L>
          </div>
        </Reveal>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || Boolean(cvError)}
          className="px-6 py-2 rounded-lg text-sm font-bold bg-brand-gold text-brand-navy hover:bg-brand-gold/85 disabled:opacity-50 transition-colors"
        >
          {saving ? 'جارٍ الحفظ…' : isEdit ? '💾 حفظ التعديلات' : '💾 حفظ المرشح في السحابة'}
        </button>
      </div>
    </form>
  );
}

/**
 * غلاف طيّ سلس — يفتح/يغلق محتواه بانتقال ارتفاع بدل الظهور المفاجئ.
 * grid-rows من 0fr إلى 1fr حيلة CSS تعطي انتقالًا سلسًا دون معرفة الارتفاع.
 */
function Reveal({ open, children }) {
  return (
    <div
      className="grid transition-all duration-300 ease-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
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

function Stat({ label, value, color }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
