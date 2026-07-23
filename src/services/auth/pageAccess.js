/**
 * «أي دور يفتح أي صفحة» — الحارس الحقيقي، **مشتقٌّ من كتالوج القائمة**.
 *
 * ⚠️ **ما كان قبل تدقيق 23.07.2026:** كان هذا الملف يحمل قائمة يدوية تقيّد
 * دورين فقط (`department_user` و`fleet`)، وكل دور آخر «بلا تقييد إطلاقًا» —
 * أي أن أمين المخزن أو مفتّش الجودة كان يفتح `/dashboard/users` أو
 * `/dashboard/recruitment` بكتابة الرابط، لأن `navAccess` يُخفي الرابط من
 * القائمة ولا يمنع الوصول إليها. الآن تُشتقّ الصلاحية من نفس المصدر الذي
 * تُرسم منه القائمة (`navCatalog.js`)، فيستحيل انحراف القائمتين بنيويًّا.
 *
 * القاعدة:  يُسمح للدور بالصفحة ⟺ (يرى مجموعتها) و(يرى عنصرها)
 *           أو كانت الصفحة في `ALWAYS_ALLOWED` أدناه.
 *           وما لا يعرفه الكتالوج **يُمنع افتراضيًّا** (كقواعد الخادم).
 *
 * ملاحظة أمنية باقية: هذا حارس واجهة (يمنع فتح الشاشة). **الإلزام الحقيقي
 * يبقى في `firestore.rules` على الخادم** وهي التي تمنع قراءة البيانات
 * وكتابتها فعلًا. الطبقتان مقصودتان معًا، لا بديلًا عن بعضهما.
 */
import { canSeeGroup, canSeeItem, canSeeHome, groupsFor } from './navAccess.js';
import { isAdmin } from './roles.js';
import { NAV_GROUPS, placementsFor, internalPaths } from './navCatalog.js';

/** لوحة التحكم الرئيسية — صلاحيتها تُحسم بـ`canSeeHome` لا بالكتالوج. */
export const HOME_PATH = '/dashboard';

/**
 * صفحات خارج القائمة يُسمح بها لكل مَن دخل — ليست حسّاسة، ويُوصَل إليها
 * برمجيًّا لا برابط ثابت. تُكتب هنا صراحةً، ويفرض اختبار الانحراف في
 * `pageAccess.test.js` ألّا توجد صفحة ثالثة لا هنا ولا في الكتالوج.
 */
export const ALWAYS_ALLOWED = [
  '/dashboard/document', // شاشة المستند الواحد — تُفتح من صندوق المستندات بمعرّفه
];

/** يُزيل الشرطة الختامية كي يتطابق `/dashboard/` مع `/dashboard`. */
function trimSlash(p) {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * يحوّل مسار المتصفّح الكامل إلى مسار الكتالوج (بإسقاط `base`).
 * المسارات العربية تصل من `location.pathname` مُرمَّزة — تُفكّ هنا.
 */
export function toCatalogPath(pathname, base = '') {
  let clean = String(pathname || '');
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* مسار برمز تالف — يُقارن كما هو */
  }
  clean = trimSlash(clean);
  const prefix = trimSlash(String(base || ''));
  if (prefix && clean.startsWith(prefix)) return clean.slice(prefix.length) || HOME_PATH;
  return clean;
}

/** هل يسمح دور هذا المستخدم بفتح هذه الصفحة؟ (المسار بصيغة الكتالوج) */
export function canOpenPath(roleId, catalogPath) {
  if (isAdmin(roleId)) return true;
  const path = trimSlash(String(catalogPath || ''));

  if (path === HOME_PATH) return canSeeHome(roleId);
  if (ALWAYS_ALLOWED.includes(path)) return true;

  const spots = placementsFor(path);
  // صفحة لا يعرفها الكتالوج ⇒ منع افتراضي (لا «مسموح لأنه غير مذكور»).
  if (spots.length === 0) return false;

  // موضعٌ واحد يكفي — الصفحة قد تتكرّر في مجموعتين بأدوار مختلفة
  // (المهام ومساعد الاجتماعات يظهران في «اليومية/الأرشيف» وفي «طلبات الإدارات»).
  return spots.some(
    (spot) => canSeeGroup(roleId, spot.groupKey) && canSeeItem(roleId, spot.roles)
  );
}

/** كل الصفحات التي يفتحها هذا الدور فعلًا. */
export function allowedPathsFor(roleId) {
  const pages = [HOME_PATH, ...ALWAYS_ALLOWED, ...internalPaths()];
  return [...new Set(pages)].filter((p) => canOpenPath(roleId, p));
}

/**
 * وجهة التحويل حين يُمنع الدور من الصفحة المطلوبة.
 *
 * لوحة التحكم لمن يراها؛ وإلا **أوّل صفحة في أولى مجموعات الدور نفسه** —
 * لا أوّل صفحة مسموحة في الكتالوج كلّه، وإلا هبط «مستخدم الإدارة» على
 * «المهام» (أول ما يصادفه الكتالوج) بدل «طلب توظيف» صفحته الأساسية.
 */
export function landingPathFor(roleId) {
  if (canOpenPath(roleId, HOME_PATH)) return HOME_PATH;

  for (const key of groupsFor(roleId)) {
    const group = NAV_GROUPS.find((g) => g.key === key);
    const hit = group?.items.find((it) => !it.external && canOpenPath(roleId, it.path));
    if (hit) return hit.path;
  }

  const any = internalPaths().find((p) => canOpenPath(roleId, p));
  return any || HOME_PATH;
}

/** الواجهة التي يستدعيها `AuthGate` — تقبل مسار المتصفّح الكامل مع `base`. */
export function isPathAllowed(roleId, pathname, base) {
  return canOpenPath(roleId, toCatalogPath(pathname, base));
}
