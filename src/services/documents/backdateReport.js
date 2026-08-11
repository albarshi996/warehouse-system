/**
 * تقرير التواريخ المعدّلة (م٢-ج · يكمل سدّ ف‑٨).
 *
 * ═══ لماذا تقريرٌ لا شارةٌ وحدها ═══
 * حارس م٢-ب يمنع التزوير الصامت، لكنّه **يسمح** بالتأريخ للماضي حين يُبرَّر —
 * وهذا صواب: الفاتورة تصل متأخّرة والبضاعة تُستلم قبل أن يُفتح الحاسوب. لكنّ
 * المسموح المتكرّر يصير عادةً، والعادة تصير بابًا. فالشارة على المستند تكشف
 * الحالة، وهذا التقرير يكشف **النمط**: مَن يؤرّخ للماضي دائمًا؟ أيّ نوعٍ من
 * المستندات؟ وهل الأسباب أسبابٌ أم نسخٌ ولصق؟
 *
 * ═══ لا يخترع رقمًا ═══
 * كلّ صفٍّ هنا مقروءٌ من كتلة `dating` التي كتبها الخادم (م٢-ب): الحقول
 * والأيّام والسبب والهويّة وختم الوقت. لا حساب ولا تخمين — الرقم بلا مرجعٍ
 * لا يُعرض.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */

const str = (v) => String(v ?? '').trim();

/** يحوّل ختم Firestore أو نصًّا أو تاريخًا إلى `YYYY-MM-DD`، أو '' إن تعذّر. */
export function stampDay(at) {
  if (!at) return '';
  if (typeof at?.toDate === 'function') return at.toDate().toISOString().slice(0, 10);
  if (at instanceof Date) return at.toISOString().slice(0, 10);
  if (typeof at === 'number') return new Date(at).toISOString().slice(0, 10);
  const s = str(at);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/**
 * صفوف التقرير من المستندات.
 * يتجاهل ما لا وسم له — البريء لا يظهر في تقرير المخالفات.
 *
 * @param {object[]} documents مستندات كما تصل من Firestore
 * @returns {{id:string, type:string, number:string, state:string, fields:string[], daysBack:number, reason:string, byName:string, byRole:string, at:string}[]}
 */
export function backdateRows(documents = []) {
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => d?.dating?.backdated)
    .map((d) => ({
      id: str(d.id),
      type: str(d.type),
      number: str(d.number) || '(بلا رقم — مسوّدة)',
      state: str(d.state),
      fields: Array.isArray(d.dating.fields) ? d.dating.fields : [],
      daysBack: Number(d.dating.daysBack) || 0,
      reason: str(d.dating.reason),
      byName: str(d.dating.byName) || 'غير معروف',
      byRole: str(d.dating.byRole),
      at: stampDay(d.dating.at),
    }))
    // الأبعد تأريخًا أوّلًا: عشرون يومًا تسبق يومين في الانتباه.
    .sort((a, b) => b.daysBack - a.daysBack || b.at.localeCompare(a.at));
}

/** فلاتر التقرير. الفارغ لا يُقيّد. */
export function filterRows(rows = [], { person = '', type = '', minDays = 0, from = '', to = '' } = {}) {
  return rows.filter((r) => {
    if (person && r.byName !== person) return false;
    if (type && r.type !== type) return false;
    if (minDays && r.daysBack < Number(minDays)) return false;
    if (from && r.at && r.at < from) return false;
    if (to && r.at && r.at > to) return false;
    return true;
  });
}

/**
 * الملخّص — ما يُقرأ قبل الجدول.
 *
 * `repeatedReasons` هو الرقم الذي يستحقّ الانتباه: سببٌ واحدٌ مكرّرٌ عشر مرّات
 * ليس سببًا بل نسخٌ ولصق، والحقل الذي وُضع ليُفكّر صار حقلًا يُملأ.
 */
export function backdateSummary(rows = []) {
  const byPerson = new Map();
  const byType = new Map();
  const byReason = new Map();
  let worst = null;
  let noReason = 0;

  for (const r of rows) {
    byPerson.set(r.byName, (byPerson.get(r.byName) || 0) + 1);
    byType.set(r.type, (byType.get(r.type) || 0) + 1);
    if (!r.reason) noReason += 1;
    else byReason.set(r.reason, (byReason.get(r.reason) || 0) + 1);
    if (!worst || r.daysBack > worst.daysBack) worst = r;
  }

  const rank = (m) =>
    [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    total: rows.length,
    people: rank(byPerson),
    types: rank(byType),
    repeatedReasons: rank(byReason).filter((r) => r.count > 1),
    noReason,
    worst,
    avgDaysBack: rows.length ? Math.round((rows.reduce((s, r) => s + r.daysBack, 0) / rows.length) * 10) / 10 : 0,
  };
}

/**
 * ما يستحقّ تدخّلًا الآن — الطبقة الأولى في الشاشة.
 * ليست أحكامًا بل أسئلة: الرقم يُعرض ومعه مرجعه، والقرار للمدير.
 */
export function attentionItems(rows = []) {
  const s = backdateSummary(rows);
  const out = [];
  if (s.noReason > 0) {
    out.push({ key: 'noReason', text: `${s.noReason} مستندًا مؤرَّخًا للماضي بلا سببٍ مكتوب`, tone: 'warn' });
  }
  for (const r of s.repeatedReasons.slice(0, 3)) {
    out.push({ key: `reason:${r.key}`, text: `سببٌ مكرّر ${r.count} مرّات: «${r.key}»`, tone: 'warn' });
  }
  const heavy = s.people.filter((p) => p.count >= 5);
  for (const p of heavy.slice(0, 3)) {
    out.push({ key: `person:${p.key}`, text: `${p.key}: ${p.count} حالة تأريخٍ للماضي`, tone: 'warn' });
  }
  if (s.worst && s.worst.daysBack >= 30) {
    out.push({
      key: 'worst',
      text: `أبعد تأريخ: ${s.worst.daysBack} يومًا على ${s.worst.number} (${s.worst.byName})`,
      tone: 'warn',
    });
  }
  return out;
}

/** أعمدة التصدير — يرثها محرّك التقارير في م‑٨ بلا إعادة كتابة. */
export const BACKDATE_COLUMNS = [
  { key: 'number', label: 'المستند' },
  { key: 'type', label: 'النوع' },
  { key: 'fields', label: 'الحقل المؤرَّخ' },
  { key: 'daysBack', label: 'الأيّام للماضي' },
  { key: 'at', label: 'تاريخ التسجيل' },
  { key: 'byName', label: 'الفاعل' },
  { key: 'reason', label: 'السبب' },
  { key: 'state', label: 'الحالة' },
];
