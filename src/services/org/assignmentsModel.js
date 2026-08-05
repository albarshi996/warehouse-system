/**
 * منطق التسكين الخالص — من يشغل كل وظيفة الآن، محسوبًا من سجلّات التسكين.
 *
 * التسكين سجلٌّ ملحق-فقط: كلّ تعيينٍ لشخصٍ في منصبٍ سطرٌ مستقلّ. «الشاغل
 * الحاليّ» لوظيفةٍ = أحدث تسكينٍ **نشط** (`active`) لها. لا نلمس حقلَي
 * `holder`/`occupied` اليدويَّين في مصدر الهيكل — الحيُّ يعلو عرضًا، والمصدر
 * يبقى خطَّ أساسٍ تاريخيًّا.
 *
 * دوالٌّ خالصة (بلا Firestore/DOM) كي تُختبَر في Node وتُستدعى من الواجهة.
 */

/** ميلي-ثانية من طابع Firestore أو ثوانٍ أو نصّ/رقم — للترتيب فقط. */
function ms(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const n = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** أحدث تسكينٍ نشطٍ لكل وظيفة: خريطة jobId → سجلّ التسكين. */
export function activeAssignmentsByJob(assignments) {
  const byJob = new Map();
  for (const a of assignments || []) {
    if (!a || !a.jobId || a.active === false) continue;
    const cur = byJob.get(a.jobId);
    if (!cur || ms(a.startedAt) > ms(cur.startedAt)) byJob.set(a.jobId, a);
  }
  return byJob;
}

/**
 * يدمج الشاغل الحيّ في قائمة الوظائف: يضبط `holder`/`occupied` من التسكين
 * النشط إن وُجد، وإلّا يُبقي قيم المصدر كما هي. **لا يُعدّل المدخل.**
 * يضيف `assignedAt`/`assignmentId`/`candidateId` (يخدم الملف التعريفيّ لاحقًا).
 */
export function withLiveHolders(jobs, assignments) {
  const byJob = activeAssignmentsByJob(assignments);
  return (jobs || []).map((j) => {
    const a = byJob.get(j.id);
    if (!a) return j;
    return {
      ...j,
      holder: a.personName || j.holder || '',
      occupied: true,
      assignedAt: a.startedAt || null,
      assignmentId: a.id || null,
      candidateId: a.candidateId || null,
    };
  });
}
