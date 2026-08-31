/**
 * ═══════════════════════════════════════════════════════════════════
 *  حضورُ الجلسة — «مَن دخل» لا «مَن قرأ» (طلب المالك 2026-08-31)
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ الفجوة ═══
 * جدولُ المتابعة يُبنى من **القراءات**، فمن دخل الجلسة ولم يمسح صنفًا بعدُ
 * **لا وجود له عند المدير**. والمالك يريد أن يرى الستّة بمجرّد دخولهم:
 * «دخل فيها الأفراد من ١ إلى ٦».
 *
 * وهذا فرقٌ عمليٌّ لا تجميليّ: رمزي دخل قبل ساعةٍ ولم يُسجّل قراءةً واحدة —
 * أهو يعدّ في ممرٍّ بعيدٍ وهاتفُه بلا شبكة، أم لم يبدأ أصلًا؟ الجدولُ الذي
 * لا يعرف بوجوده **لا يطرح السؤال**.
 *
 * ═══ ولمَ مجموعةٌ جديدةٌ لا وسمٌ على القيود ═══
 * لأنّ «الدخول» حدثٌ **بلا قيد**: لو كُتب قيدَ مسحٍ بكمّيّةٍ صفرٍ ليُعلن
 * الحضور، لَلوّث الدفترَ الملحق-فقط ببياناتٍ ليست عدًّا — ولَحُسب في
 * `scanCount` ولَظهر صفًّا في الكشف. فالحضورُ مجموعةٌ مستقلّة
 * `operations/{opId}/members/{uid}` — قيدُها **معرّفُه هويّةُ صاحبه**، فلا
 * يتكرّر عضوٌ مهما دخل وخرج.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

const str = (v) => String(v ?? '').trim();

/**
 * ★ صفوفُ الحضور — الأعضاءُ المسجَّلون **وكلُّ من قرأ ولو لم يُسجَّل**.
 *
 * والجمعُ من المصدرين ضروريٌّ لا احتياطيّ: الجلساتُ المفتوحة قبل هذه المهمّة
 * لا `members` لها إطلاقًا، ومن يعدّ فيها الآن يجب أن يظهر. فالقراءةُ نفسُها
 * دليلُ حضورٍ لا يُنكَر — ومن قرأ فقد حضر ولو لم يُكتب اسمُه في المجموعة.
 *
 * @param {object[]} members مستنداتُ `members` (uid · name · joinedAt)
 * @param {object[]} logRows صفوفُ السجلّ من `buildLogRows`
 * @param {{toMillis?:(m:object)=>number|null}} [opts]
 * @returns {{uid:string, name:string, joinedAt:number|null, scans:number,
 *            base:number, lastAt:number|null, idle:boolean}[]}
 *   مرتّبةً: **من دخل ولم يقرأ أوّلًا** — فهو ما يحتاج نظرَ المدير.
 */
export function presenceRows(members, logRows, { toMillis } = {}) {
  const at = typeof toMillis === 'function' ? toMillis : () => null;
  const byName = new Map();
  const byUid = new Map();

  for (const m of Array.isArray(members) ? members : []) {
    const uid = str(m?.uid || m?.id);
    const name = str(m?.name) || 'غير معروف';
    const raw = at(m);
    const ms = raw == null ? null : Number(raw);
    const row = {
      uid,
      name,
      joinedAt: ms != null && Number.isFinite(ms) ? ms : null,
      scans: 0,
      base: 0,
      lastAt: null,
    };
    if (uid) byUid.set(uid, row);
    // الاسمُ مفتاحُ الوصل مع القيود: القيدُ يحمل `byUid` و`byName` معًا،
    // لكنّ الجلسات القديمة قد تحمل الاسمَ وحدَه — فيُجمع بالاثنين.
    if (!byName.has(name)) byName.set(name, row);
  }

  for (const r of Array.isArray(logRows) ? logRows : []) {
    const uid = str(r?.byUid);
    const name = str(r?.byName) || 'غير معروف';
    let row = (uid && byUid.get(uid)) || byName.get(name);
    if (!row) {
      // ★ قرأ ولم يُسجَّل عضوًا — يُنبت له صفٌّ: القراءةُ دليلُ حضورٍ لا يُنكَر.
      row = { uid, name, joinedAt: null, scans: 0, base: 0, lastAt: null };
      if (uid) byUid.set(uid, row);
      byName.set(name, row);
    }
    row.scans++;
    row.base += Number(r?.base) || 0;
    const ms = r?.atMs;
    if (ms != null && Number.isFinite(ms) && (row.lastAt == null || ms > row.lastAt)) row.lastAt = ms;
  }

  const all = new Set([...byUid.values(), ...byName.values()]);
  return [...all]
    .map((r) => ({ ...r, base: Math.round(r.base * 1e6) / 1e6, idle: r.scans === 0 }))
    .sort((a, b) => {
      // ★ الصامتُ أوّلًا — وهو ما يحتاج سؤالًا؛ ثمّ الأقلُّ قراءةً.
      if (a.idle !== b.idle) return a.idle ? -1 : 1;
      return a.scans - b.scans || a.name.localeCompare(b.name);
    });
}

/** ملخّصُ الحضور — «٦ دخلوا، ٤ يعدّون، ٢ لم يبدآ». */
export function presenceSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const idle = list.filter((r) => r.idle).length;
  return { total: list.length, active: list.length - idle, idle };
}

/** نصُّ الملخّص كما يُقرأ — والصفرُ لا نصَّ له. */
export function presenceLabel(summary) {
  const s = summary || {};
  if (!s.total) return '';
  if (!s.idle) return `${s.total} في الجلسة — كلُّهم يعدّون.`;
  return `${s.total} في الجلسة · ${s.active} يعدّون · ${s.idle} دخلوا ولم يبدأوا بعد.`;
}
