/**
 * ═══════════════════════════════════════════════════════════════════
 *  استئنافُ الجلسة — «رجّعني إلى جردي» بضغطةٍ لا برمزٍ يُملى
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ الفجوة (قِيست من الشيفرة 2026-08-31) ═══
 * الاستئنافُ اليوم **صامتٌ ومربوطٌ بالجهاز**: `ScanFlow` يقرأ مفتاحًا واحدًا
 * (`bzCloudOpId`) من `localStorage` ويدخل الجلسةَ من تلقائه. فإن كان الأمرُ
 * على ما يُرام لم يعلم العادّ بشيء، وإن اختلّ لم يجد زرًّا يضغطه:
 *
 *   ★ بدّل هاتفَه ⇐ المفتاحُ بقي في الأوّل، فلا طريقَ إلّا الرمز.
 *   ★ مُسح متصفّحُه ⇐ ضاع المفتاح وهو في وسط جرد.
 *   ★ نسي الرمزَ ولم يُحفظ الرابط ⇐ يقف حتى يجد المدير.
 *
 * ═══ ولمَ مصدران لا مصدرٌ واحد ═══
 * الجلساتُ المفتوحة تُقرأ **من الخادم** (فيراها من دخل بجهازٍ جديد)، وترتيبُها
 * يُبنى من **ذاكرة الجهاز** (فيجد صاحبُ الجهاز جلستَه أوّلَ سطر). ولو اكتُفي
 * بالخادم لَتساوت جلسةُ محمدٍ التي يعدّ فيها منذ ساعتين مع جلسةِ فرعٍ آخر؛
 * ولو اكتُفي بالجهاز لَما نفع الهاتفَ الجديد شيء.
 *
 * ★★ **والذاكرة ترتيبٌ لا صلاحيّة:** ما يُقرأ من الجهاز يُرتِّب القائمةَ ولا
 * يمنح حقَّ دخول. الحقُّ في قواعد الأمان وحدها، وأيُّ سطرٍ هنا لا يُغيّر منه
 * شيئًا. فمن عبث بتخزين متصفّحه لم ينل إلّا ترتيبًا مختلفًا.
 *
 * بلا Firestore وبلا DOM — التخزين يُحقن.
 */

const KEY = 'bzMyOps';

/** سقفُ ما يُتذكَّر — جلساتُ أسبوعٍ لا أكثر، والقائمة تُعرض قصيرة. */
export const MAX_REMEMBERED = 12;

function safeRead(store) {
  try {
    const raw = store?.getItem?.(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.id === 'string' && r.id) : [];
  } catch {
    return [];
  }
}

/**
 * جلساتُ هذا الجهاز — الأحدثُ أوّلًا.
 * @returns {{id:string, code:string, type:string, at:number}[]}
 */
export function recentSessions(store) {
  return safeRead(store).slice().sort((a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0));
}

/**
 * يتذكّر جلسةً دخلها صاحبُ الجهاز — **ولا يرمي أبدًا**.
 *
 * والدخولُ المتكرّر لا يُنبت سطرًا ثانيًا: يُحدَّث وقتُ السطر القائم، وإلّا
 * امتلأت القائمة بجلسةٍ واحدةٍ اثنتي عشرة مرّة.
 *
 * @param {Storage} store
 * @param {{id:string, code?:string, type?:string}} op
 * @param {{now?:number, max?:number}} [opts]
 * @returns {object[]} القائمة بعد التحديث
 */
export function rememberSession(store, op, opts = {}) {
  const id = String(op?.id || '').trim();
  if (!id) return recentSessions(store);
  const max = Number(opts.max) > 0 ? Number(opts.max) : MAX_REMEMBERED;
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : 0;
  const list = safeRead(store).filter((r) => r.id !== id);
  list.push({ id, code: String(op?.code || ''), type: String(op?.type || ''), at: now });
  list.sort((a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0));
  const trimmed = list.slice(0, max);
  try {
    store?.setItem?.(KEY, JSON.stringify(trimmed));
  } catch {
    // تخزينٌ ممنوعٌ أو ممتلئ — الذاكرة تسقط والدخول يمضي.
  }
  return trimmed;
}

/** ينسى جلسةً (بعد إقفالها) — فلا تبقى في قائمة الاستئناف سطرًا ميّتًا. */
export function forgetSession(store, opId) {
  const id = String(opId || '').trim();
  if (!id) return recentSessions(store);
  const list = safeRead(store).filter((r) => r.id !== id);
  try {
    store?.setItem?.(KEY, JSON.stringify(list));
  } catch {
    /* يُبتلع */
  }
  return list;
}

/**
 * ★ قائمةُ الاستئناف — الخادمُ يقول **ماذا يوجد**، والجهازُ يقول **ما يخصّني**.
 *
 * والمقفَلُ يخرج: جلسةٌ أُقفلت لا تُستأنف، وعرضُها زرًّا يُضغط فيرتدّ إحباط.
 * والمكرَّر يُوحَّد بالمعرّف — لا بالرمز: رمزان متطابقان لجلستين شذوذٌ يُحسم
 * في مكانه (`resolveOperationByCode`)، ولا يُخفى هنا بدمجٍ صامت.
 *
 * @param {object[]} openOps الجلسات المفتوحة كما تُقرأ من الخادم
 * @param {{id:string, at?:number}[]} recent ذاكرةُ الجهاز
 * @returns {(object & {mine:boolean, lastSeenAt:number})[]}
 *   مرتّبةً: جلساتي بالأحدث أوّلًا، ثمّ البقيّة.
 */
export function resumeList(openOps, recent = []) {
  const seen = new Map();
  for (const r of Array.isArray(recent) ? recent : []) {
    const id = String(r?.id || '').trim();
    if (id) seen.set(id, Number(r?.at) || 0);
  }
  const byId = new Map();
  for (const op of Array.isArray(openOps) ? openOps : []) {
    const id = String(op?.id || '').trim();
    if (!id || op?.status === 'closed') continue;
    if (!byId.has(id)) byId.set(id, op);
  }
  return [...byId.values()]
    .map((op) => ({ ...op, mine: seen.has(op.id), lastSeenAt: seen.get(op.id) || 0 }))
    .sort((a, b) => {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });
}

/**
 * سطرُ الوصف كما يُقرأ في البطاقة — نوعُ الجلسة ونطاقُها ومن فتحها.
 * يُبنى هنا لا في الشاشة كي يُختبر، ولئلّا يفترق نصّان لمعنًى واحد.
 *
 * @param {object} op
 * @param {(op:object)=>string} scopeText دالّةُ نصّ النطاق (تُحقن لتبقى الوحدة خالصة)
 */
export function resumeLine(op, scopeText) {
  const parts = [];
  if (op?.type) parts.push(String(op.type));
  const scope = typeof scopeText === 'function' ? String(scopeText(op) || '') : '';
  if (scope) parts.push(scope);
  const by = String(op?.createdByName || '').trim();
  if (by) parts.push(`فتحها ${by}`);
  return parts.join(' · ');
}
