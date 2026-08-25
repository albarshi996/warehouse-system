/**
 * برج مراقبة القطاع ‹FNB-801 · FNB-802› — منطق خالص.
 *
 * ═══ النزول الخماسيّ ═══
 * `F&B → Brand → Branch → Item → Transaction/Document` (أسطر 422–440).
 * وكلّ مستوًى **يُفتح إلى الذي تحته**، والرقم في الأعلى = مجموع ما تحته
 * حرفيًّا — فتجميعٌ لا يُفتَح رقمٌ مغلق، وتجميعٌ لا يتوازن رقمٌ لا يُصدَّق.
 *
 * ═══ ولماذا طبقةٌ لا غرفةٌ ثانية ═══
 * غرفة القيادة قائمةٌ وتعمل (`operationsDashboard` + `drill.js`). والبرج
 * **بُعدٌ عليها** لا شاشةٌ منافسة — قاعدة المالك: «صفحة فوق صفحة» مرفوضة،
 * ودرس ت٨: «طبقةً ثانية لا خريطةً ثانية».
 *
 * ═══ واللوحة تعرض ما يحتاج تدخّلًا فقط ═══
 * «إظهار الحالات التي تحتاج تدخّلًا فقط» (سطر 648). فالبرج **مرشِّحٌ لا
 * تقرير**: ما لا يحتاج قرارًا لا يُعرض، وإلّا غرق المدير في أرقامٍ سليمة
 * وفاته الخلل.
 */
import { ancestryOf } from '../org/orgLocations.js';
import { EXCEPTION_TYPES } from './exceptions.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();

/** مستويات النزول الخمسة — بالترتيب، وكلٌّ يُفتح إلى تاليه. */
export const TOWER_LEVELS = Object.freeze([
  { id: 'sector', labelAr: 'القطاع', next: 'brand' },
  { id: 'brand', labelAr: 'البراند', next: 'branch' },
  { id: 'branch', labelAr: 'الفرع', next: 'item' },
  { id: 'item', labelAr: 'الصنف', next: 'document' },
  { id: 'document', labelAr: 'المستند', next: null },
]);

/** المستوى التالي في النزول — و`null` عند المستند (نهاية الطريق). */
export function nextLevel(level) {
  return TOWER_LEVELS.find((l) => l.id === str(level))?.next || null;
}

/**
 * فئات الاستثناء التسع التي تطلبها اللوحة (أسطر 444–460) — **مربوطةً
 * بأنواعٍ مبنيّة فعلًا** في السجلّ القائم. و`types` فارغةٌ تعني فئةً
 * تنتظر بناءً، وتُعلَن ولا يَعِد البرج بها.
 */
export const TOWER_CATEGORIES = Object.freeze([
  { id: 'stockout', labelAr: 'خطر النفاد', types: ['below_min', 'no_stock'] },
  { id: 'supplier_delay', labelAr: 'تأخّر مورّد', types: ['approval_stale'] },
  { id: 'expiry', labelAr: 'خطر الصلاحيّة', types: ['expired', 'near_expiry'] },
  { id: 'production_delay', labelAr: 'تأخّر إنتاج', types: ['production_delay', 'low_yield'] },
  { id: 'emergency', labelAr: 'طلبات طارئة', types: ['order_deviation'] },
  { id: 'late_pr', labelAr: 'طلبات شراءٍ متأخّرة', types: ['approval_stale'] },
  { id: 'receiving_variance', labelAr: 'فرق استلام الفرع', types: ['transit_variance', 'transfer_unreceived'] },
  { id: 'waste', labelAr: 'الهدر', types: ['qc_reject'] },
  { id: 'consumption', labelAr: 'انحراف استهلاكٍ مرتفع', types: ['consumption_variance'] },
  // ‹FNB-802› أربعُ فئاتٍ زادها **حارس الشمول** لا نصّ المستند: أنواعٌ
  // مبنيّةٌ من خططٍ سابقة كانت ستسقط من اللوحة بلا تصنيف — واستثناءٌ
  // يُكشف ولا يُعرض أسوأ من استثناءٍ لا يُكشف.
  { id: 'handling', labelAr: 'تعثّر مناولة', types: ['pick_shortfall', 'putaway_blocked'] },
  { id: 'stuck', labelAr: 'رصيدٌ عالقٌ في موقع نظام', types: ['stuck_balance'] },
  { id: 'master_data', labelAr: 'نقصٌ في الماستر', types: ['recipe_unlinked'] },
]);

/** فئةُ نوعٍ ما — والمجهول يُعلَن ولا يُبتلع. */
export function categoryOfType(type) {
  const t = str(type);
  return TOWER_CATEGORIES.find((c) => c.types.includes(t))?.id || '';
}

/**
 * ‹FNB-802› حارس الشمول: كلّ نوعٍ مذكورٍ في الفئات **مبنيٌّ في السجلّ**،
 * وكلّ نوعٍ مبنيٍّ له فئة. فلا تَعِد اللوحة بما لا وجود له، ولا يسقط
 * استثناءٌ من العرض لأنّ أحدًا نسي تصنيفه.
 */
export function categoryCoverage() {
  const declared = new Set(TOWER_CATEGORIES.flatMap((c) => c.types));
  const built = new Set(Object.keys(EXCEPTION_TYPES));
  return {
    promisedButMissing: [...declared].filter((t) => !built.has(t)).sort(),
    builtButUncategorized: [...built].filter((t) => !declared.has(t)).sort(),
  };
}

/** مفتاحُ استثناءٍ على مستوًى ما — موضعُه في الشجرة، أو صنفُه، أو مستندُه. */
function keyAt(exc, level, chain) {
  if (level === 'item') return up(exc?.sku);
  if (level === 'document') return up(exc?.docRef?.number || exc?.docRef?.id);
  return up(chain.find((n) => n.level === level)?.code);
}

/**
 * البرج ‹FNB-801› — يجمع الاستثناءات على مستوًى ويعرض **ما يحتاج تدخّلًا**.
 *
 * ★★ والترشيح **بالمسار كلّه لا بأبٍ واحد**: نزولٌ خماسيٌّ يمرّ بالصنف، ومن
 * رشّح بالموضع وحده سقط عنده الطريق — لأنّ مفتاح الصنف ليس موقعًا في الشجرة
 * فلا يطابقه نسبٌ أبدًا، فتعود المستنداتُ فارغةً ويبدو أنّ لا خلل. وأسوأ من
 * ذلك: ترشيحٌ بالصنف وحده يعرض صنفَ كلّ الفروع تحت فرعٍ واحد.
 *
 * @param {object[]} exceptions استثناءاتٌ مفتوحة `{type, location, sku, severity, docRef}`
 * @param {Map} orgIndex فهرس الشجرة
 * @param {{level?:string, parent?:string, path?:Array<{level,key}>}} [opts]
 *   `parent` اختصارٌ لخطوةٍ واحدةٍ في الشجرة (توافقٌ رجعيّ)، و`path` المسارُ
 *   المتراكم — وكلّ خطوةٍ فيه شرطٌ يجب أن يتحقّق.
 * @returns {{level, rows, total, uncategorized}}
 */
export function towerView(exceptions = [], orgIndex = null, opts = {}) {
  const level = str(opts.level) || 'sector';
  const parent = up(opts.parent);
  const path = (Array.isArray(opts.path) ? opts.path : [])
    .map((s) => ({ level: str(s?.level), key: up(s?.key) }))
    .filter((s) => s.level && s.key);
  const groups = new Map();
  let uncategorized = 0;
  let total = 0;

  for (const exc of Array.isArray(exceptions) ? exceptions : []) {
    const chain = orgIndex ? ancestryOf(orgIndex, exc?.location) : [];
    // ترشيحٌ بالأب: نزولٌ داخل براندٍ لا يعرض فروع غيره.
    if (parent && !chain.some((n) => up(n.code) === parent)) continue;
    // وترشيحٌ بالمسار: كلّ خطوةٍ سبقت شرطٌ قائم — فالفرعُ يبقى فرعَه والصنفُ صنفَه.
    if (path.length && !path.every((s) => keyAt(exc, s.level, chain) === s.key)) continue;

    const key = keyAt(exc, level, chain) || '—';
    total += 1;

    const cat = categoryOfType(exc?.type);
    if (!cat) uncategorized += 1;

    const at = groups.get(key) || { key, label: key === '—' ? 'غير مربوط' : key, count: 0, byCategory: {}, samples: [] };
    at.count += 1;
    at.byCategory[cat || 'other'] = (at.byCategory[cat || 'other'] || 0) + 1;
    if (at.samples.length < 3) at.samples.push({ type: exc?.type, sku: up(exc?.sku), reason: str(exc?.reason) });
    groups.set(key, at);
  }

  const rows = [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { level, rows, total, uncategorized, canDrillTo: nextLevel(level) };
}

/**
 * ★★ حارس التوازن ‹FNB-801›: **الرقم في الأعلى = مجموع ما تحته حرفيًّا**.
 * ومن عرض قطاعًا لا يساوي مجموع برانداته أنتج رقمًا لا يُصدَّق، وسقطت
 * الثقة باللوحة كلّها.
 */
export function towerBalance(exceptions = [], orgIndex) {
  const sector = towerView(exceptions, orgIndex, { level: 'sector' });
  const brand = towerView(exceptions, orgIndex, { level: 'brand' });
  const branch = towerView(exceptions, orgIndex, { level: 'branch' });
  const sum = (v) => v.rows.reduce((s, r) => s + r.count, 0);
  const problems = [];
  if (sum(sector) !== sum(brand)) problems.push(`القطاع ${sum(sector)} والبراندات ${sum(brand)}.`);
  if (sum(brand) !== sum(branch)) problems.push(`البراندات ${sum(brand)} والفروع ${sum(branch)}.`);
  return { ok: problems.length === 0, total: sum(sector), problems };
}

/**
 * النزول من خليّةٍ إلى ما تحتها — **تجميعٌ يُفتَح لا رقمٌ مغلق**
 * (نفس عقد `drill.js`: قائمةٌ لا تفسّر رقمها تُسقط الثقة).
 *
 * ★ و`path` هو المسارُ الذي سُلك حتّى هذه الخليّة (بلا الخطوة الحاليّة).
 * يُمرَّر فيبقى كلُّ شرطٍ سابقٍ قائمًا: النزول إلى صنفٍ داخل فرعٍ يعرض
 * مستنداتِ ذلك الفرع وحده — لا مستنداتِ الصنف في القطاع كلّه.
 */
export function drillInto(exceptions = [], orgIndex, { level, key, path = [] } = {}) {
  const next = nextLevel(level);
  const here = [...(Array.isArray(path) ? path : []), { level, key }];
  if (!next) {
    // نهاية الطريق: المستندات نفسها لا تجميعٌ فوقها — ومسبوقةً بشروط الطريق.
    const steps = here
      .map((s) => ({ level: str(s?.level), key: up(s?.key) }))
      .filter((s) => s.level && s.key);
    return {
      level: 'document',
      leaf: true,
      items: (Array.isArray(exceptions) ? exceptions : []).filter((e) => {
        const chain = orgIndex ? ancestryOf(orgIndex, e?.location) : [];
        return steps.every((s) => keyAt(e, s.level, chain) === s.key);
      }),
    };
  }
  return { ...towerView(exceptions, orgIndex, { level: next, path: here }), leaf: false, from: { level, key } };
}
