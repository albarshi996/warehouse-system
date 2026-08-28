/**
 * نموذجُ سجلّ زيارات البوّابة ‹VIS-101› — منطق خالص بلا Firestore وبلا DOM.
 *
 * ═══ الغرض (طلب المالك 2026-08-28) ═══
 * «سجلٌّ لمعرفة حركة كلّ دخولٍ وموقعه على البوّابة **حتّى لو كان نفس اليوزر**».
 * والشقُّ الأخير هو الغاية: الهاتفُ المشترك في المستودع يمرّ بين عمّال، فحسابٌ
 * واحدٌ قد يكون خلفه شخصان. والحسابُ وحده لا يفرّقهما — **الجهازُ يفرّقهما**.
 *
 * ═══ ★ ولا ساعةَ تُقرأ هنا ═══
 * كلُّ دالّةٍ تأخذ الوقتَ وسيطًا. والأختامُ تُكتب في طبقة الخدمة
 * بـ`serverTimestamp` (نمط `yardModel`: «الزمن يُمرَّر ولا يُقرأ») — فلا ساعةُ
 * متصفّحٍ مضبوطةٌ خطأً تقرّر أنّ زيارةً وقعت غدًا.
 *
 * ═══ والتسميةُ تُشتقّ لا تُكتب ═══
 * اسمُ الشاشة يأتي من `navCatalog` — المصدرِ الواحد نفسِه الذي تُرسم منه
 * القائمة. فيومَ يُعاد تسميةُ شاشةٍ يتبعها السجلُّ بلا تعديل، ولا يبقى في
 * التاريخ اسمٌ لم يعد له وجود.
 */

import { NAV_GROUPS, PINNED_ITEM } from '../auth/navCatalog.js';

const s = (v) => String(v ?? '').trim();

/** أنواعُ الحدث الثلاثة — ولا رابعَ لها (ق: «عاديّ» بلا تتبّعِ ضغطات). */
export const VISIT_KINDS = Object.freeze([
  { id: 'LOGIN', label: 'دخل البوّابة' },
  { id: 'VIEW', label: 'فتح' },
  { id: 'LOGOUT', label: 'خرج من البوّابة' },
]);

const KIND_IDS = new Set(VISIT_KINDS.map((k) => k.id));

export function isVisitKind(kind) {
  return KIND_IDS.has(s(kind).toUpperCase());
}

/** خريطةُ المسار إلى اسمِه — تُبنى مرّةً من الكتالوج. */
const LABEL_BY_PATH = new Map([
  [PINNED_ITEM.path, PINNED_ITEM.label],
  ...NAV_GROUPS.flatMap((g) => g.items.map((it) => [it.path, it.label])),
]);

/**
 * اسمُ الشاشة من مسارها — والمجهولُ يعود بمساره ظاهرًا لا فارغًا.
 *
 * (نمط `t()` في معجم الميدان: مفتاحٌ مجهولٌ يعود بنفسه ليُرى ويُصلَح، لا
 * فراغًا يُشبه سطرًا سليمًا.)
 */
export function screenLabel(path) {
  const p = s(path);
  return LABEL_BY_PATH.get(p) || p || '—';
}

/** سطرُ زيارةٍ مسوّى. */
export function shapeVisit(input) {
  const kind = isVisitKind(input?.kind) ? s(input.kind).toUpperCase() : 'VIEW';
  const path = s(input?.path);
  return {
    kind,
    uid: s(input?.uid),
    userName: s(input?.userName),
    role: s(input?.role),
    deviceId: s(input?.deviceId).toUpperCase(),
    sessionId: s(input?.sessionId),
    path,
    label: s(input?.label) || screenLabel(path),
    at: Number.isFinite(Number(input?.at)) ? Number(input.at) : null,
  };
}

/** ما يمنع كتابةَ سطرٍ في سجلٍّ لا يُصحَّح بعد الكتابة. */
export function visitProblems(input) {
  const v = shapeVisit(input);
  const out = [];
  if (!v.uid) out.push('لا هويّةَ حساب — سطرٌ بلا صاحبٍ لا يفيد.');
  if (!v.deviceId) out.push('لا رقمَ جهاز — وبه وحده يُفرَّق شخصان على حسابٍ واحد.');
  if (v.kind === 'VIEW' && !v.path) out.push('فتحُ شاشةٍ بلا مسار.');
  return out;
}

/**
 * ★★ معرّفٌ حتميّ يمنع تضاعفَ الكتابة (ض-٤).
 *
 * الجهازُ × الجلسة × النوع × المسار × **دقيقةُ الوقوع**. فإعادةُ تركيب المكوّن
 * أو تحديثُ الصفحة أو رجوعُ المستخدم خطوةً تكتب **فوق نفسها** ولا تُضيف سطرًا.
 *
 * ولماذا الدقيقة لا الساعة؟ لأنّ ساعةً كاملةً تبتلع زيارةً حقيقيّةً ثانيةً
 * للشاشة نفسها بعد نصف ساعة — والدقيقةُ تكفي لابتلاع التكرار التقنيّ وحده.
 *
 * ⚠️ والوقتُ هنا **للمعرّف فقط**، وساعةُ المتصفّح تكفيه: أسوأُ ما يفعله انحرافُها
 * سطرٌ زائدٌ أو ناقصٌ في الدقيقة. أمّا `at` المعروض فبختم الخادم.
 */
export function visitDocId(input, nowMs) {
  const v = shapeVisit(input);
  const minute = Math.floor((Number.isFinite(nowMs) ? nowMs : 0) / 60000);
  const safePath = (v.path || 'none').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'none';
  return `${v.deviceId || 'NODEV'}_${v.sessionId || 'NOSES'}_${v.kind}_${safePath}_${minute}`;
}

/* ═══════════════ القراءة ═══════════════ */

/** مفتاحُ اليوم — يُمرَّر الوقتُ ولا يُقرأ. */
export function dayKey(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** نصُّ الحدث كما يُقرأ في الجدول: «فتح «مركز البوابة»» · «دخل البوّابة». */
export function visitText(visit) {
  const v = shapeVisit(visit);
  if (v.kind === 'VIEW') return `فتح «${v.label}»`;
  return VISIT_KINDS.find((k) => k.id === v.kind)?.label || v.kind;
}

/**
 * ★★★ **حسابٌ فُتح من أكثر من جهازٍ في اليوم نفسه** — جوابُ سؤال المالك.
 *
 * وهي ليست تهمةً بل **سؤالًا يستحقّ النظر**: قد يكون الموظّفُ نفسُه انتقل من
 * هاتفٍ إلى حاسوب، وقد يكون شخصين. فتُعرض الحقيقةُ ولا يُصدَر حكم.
 *
 * @returns {Array<{uid, userName, day, devices:string[], count:number}>}
 */
export function multiDeviceAccounts(visits) {
  const byKey = new Map();
  for (const raw of Array.isArray(visits) ? visits : []) {
    const v = shapeVisit(raw);
    if (!v.uid || !v.deviceId || v.at === null) continue;
    const day = dayKey(v.at);
    const key = `${v.uid}||${day}`;
    if (!byKey.has(key)) byKey.set(key, { uid: v.uid, userName: v.userName, day, devices: new Set(), count: 0 });
    const row = byKey.get(key);
    row.devices.add(v.deviceId);
    row.count += 1;
    if (!row.userName && v.userName) row.userName = v.userName;
  }
  return [...byKey.values()]
    .filter((r) => r.devices.size > 1)
    .map((r) => ({ ...r, devices: [...r.devices].sort() }))
    .sort((a, b) => (a.day === b.day ? b.devices.length - a.devices.length : b.day.localeCompare(a.day)));
}

/**
 * لقطةُ يومٍ للوحة: كم زائرًا · كم جهازًا · أنشطُ الشاشات.
 *
 * @param {Array} visits
 * @param {string} [day] مفتاحُ اليوم — وغيابُه يعني «الكلّ».
 */
export function visitsSnapshot(visits, day) {
  const rows = (Array.isArray(visits) ? visits : [])
    .map(shapeVisit)
    .filter((v) => !day || (v.at !== null && dayKey(v.at) === day));

  const users = new Set();
  const devices = new Set();
  const screens = new Map();
  let logins = 0;

  for (const v of rows) {
    if (v.uid) users.add(v.uid);
    if (v.deviceId) devices.add(v.deviceId);
    if (v.kind === 'LOGIN') logins += 1;
    if (v.kind === 'VIEW' && v.path) screens.set(v.path, (screens.get(v.path) ?? 0) + 1);
  }

  const topScreens = [...screens.entries()]
    .map(([path, count]) => ({ path, label: screenLabel(path), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { rows: rows.length, users: users.size, devices: devices.size, logins, topScreens };
}

/** الأيّامُ الموجودة في السجلّ — الأحدثُ أوّلًا، لمصفاة الشاشة. */
export function daysIn(visits) {
  const days = new Set();
  for (const raw of Array.isArray(visits) ? visits : []) {
    const at = Number(raw?.at);
    if (Number.isFinite(at)) days.add(dayKey(at));
  }
  return [...days].sort().reverse();
}
