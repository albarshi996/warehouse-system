/**
 * 🔒 صلاحيّاتُ **الكتابة** كما تفرضها `firestore.rules` — منطقٌ خالصٌ بلا Firebase.
 *
 * ═══ العطبُ الذي تحرسه هذه الوحدة ═══
 * البوّابة (`navCatalog.js`) تفتح `/dashboard/my-tasks` لسبعة أدوار، ومنها
 * `storekeeper` و`gate_officer` و`putaway_unit` و`picking_unit`. ومجموعةُ
 * `labor_tasks` محكومةٌ بـ`isLaborWriter()` — وهي **ثلاثةُ أدوارٍ لا سبعة**.
 * فالموظّف يفتح «مهامي»، ويمشي إلى الرفّ، ويمسح أوّلَ مسحة، فيرتدّ عملُه
 * بـ`permission-denied` **في منتصف المهمّة** وهو لا يفهم لماذا. أسوأُ منعٍ
 * هو الذي يقع بعد أن يبدأ العمل لا قبله.
 *
 * ═══ درسُ ل‑١٨ الذي يحرسه هذا الملفّ (نفسُ درس `lpnRoles.js`) ═══
 * قائمةُ أدوارٍ في الكود لا تطابق `firestore.rules` تعني شاشةً تمنع من تسمح
 * له القاعدة — أو أسوأ: شاشةً تسمح لمن تمنعه القاعدة. ولذلك **القوائم هنا
 * منسوخةٌ حرفًا من القاعدة، ومحروسةٌ بقارئٍ يقرأ ملفَّ القاعدة من القرص**
 * في `laborRoles.test.js`: من غيّر القاعدةَ ونسي هذه الوحدةَ يسقط بناؤه.
 *
 * ═══ حدودُ هذه الوحدة — قُلها صراحةً ═══
 * ⚠️ القاعدةُ تشترط أربعةَ أشياءَ لا شيئًا واحدًا:
 *     `isBootstrapAdmin() || (signedIn() && hasProfile() && isActive() && myRole() in [...])`
 *   وهذه الوحدةُ لا تعرف إلّا **الدور**. فهي تجيب عن «أيَملك دورُه هذا؟»
 *   لا عن «أتمرّ كتابتُه؟»: موظّفٌ موقوف (`isActive()` كاذبة) يُرفض هنا
 *   بـ`''` ويرتدّ من الخادم. والحارسُ الحقيقيُّ يبقى الخادمَ دائمًا —
 *   وهذه الوحدةُ **تُحسّن التجربة ولا تكون هي الأمن**.
 * ⚠️ و`isBootstrapAdmin()` هويّةٌ (UID) لا دور، فلا تُمثَّل هنا بحال.
 */
import { ROLES } from '../auth/roles.js';

/**
 * أدوارُ `isLaborWriter()` — حرفًا كما في `firestore.rules` (نحو السطر ٧٠).
 * مشرفو المناولة والمديران. وهي بوّابةُ `labor_tasks` كلِّها: إنشاءً وتحديثًا
 * وإلحاقَ أحداث.
 */
export const LABOR_WRITER_ROLES = Object.freeze([
  'admin', 'warehouse_manager', 'labor_supervisor',
]);

/**
 * أدوارُ `isStockActor()` — حرفًا كما في `firestore.rules` (نحو السطر ٩٩).
 * ★ وهي أوسعُ بوّابةٍ في القاعدة (مستعملةٌ في عشرات المواضع)، ولذلك بالذات
 * كان توسيعُها بدل إضافةِ حارسٍ مستقلٍّ خطأً متكرّرًا — انظر تعليقَ
 * `isCountAssignee` في القاعدة.
 */
export const STOCK_ACTOR_ROLES = Object.freeze([
  'admin', 'warehouse_manager', 'storekeeper', 'qc_inspector',
  'gate_officer', 'purchase_officer', 'return_manager',
  'inventory_auditor', 'finance_manager', 'fleet',
  'scm_manager', 'receiving_unit', 'putaway_unit', 'picking_unit',
]);

/** أدوارُ `isManager()` — تعريفُ بنية المستودع قرارٌ إداريٌّ لا عمليّةٌ يوميّة. */
export const MANAGER_WRITE_ROLES = Object.freeze(['admin', 'warehouse_manager']);

/**
 * أدوارُ `isVanSalesWriter()` و`isProcurementActor()`.
 *
 * ★★ ولماذا هما هنا وهذه وحدةُ مناولة؟ لأنّ `documents` **لا يحكمها حارسٌ
 * واحد** بل أربعةٌ بـ«أو» (السطر ٣٧٢). فلو مثّلتُ منها اثنين فقط لقالت هذه
 * الوحدةُ لمندوب المبيعات «لا تملك إنشاء مستند» والقاعدةُ تسمح له — وهو
 * بعينه العطبُ الذي بُنيت لتمنعه، مقلوبًا. **النموذجُ الناقصُ يكذب.**
 */
export const VAN_SALES_ROLES = Object.freeze([
  'admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor',
]);
export const PROCUREMENT_ROLES = Object.freeze([
  'admin', 'warehouse_manager', 'department_user',
  'purchase_officer', 'finance_manager', 'treasury',
]);

/** اسمُ الحارس في القاعدة ⟶ أدوارُه. مفاتيحُه هي ما تشير إليه `WRITE_GATES`. */
export const GUARD_ROLES = Object.freeze({
  isLaborWriter: LABOR_WRITER_ROLES,
  isStockActor: STOCK_ACTOR_ROLES,
  isManager: MANAGER_WRITE_ROLES,
  isVanSalesWriter: VAN_SALES_ROLES,
  isProcurementActor: PROCUREMENT_ROLES,
});

/**
 * ★★ خريطةُ **بوّابةِ الإنشاء**: اسمُ المجموعة ⟶ الحرّاسُ الذين يفتحونها
 * (أيُّ واحدٍ منهم يكفي — «أو» كما في القاعدة حرفًا).
 *
 * ⚠️ **الإنشاءُ وحدَه**: التحديثُ في `documents` ليس بوّابةَ أدوارٍ أصلًا بل
 * دورةَ حياة (المنشئُ يحرّر مسودّته · المعتمِدُ يبتّ · المنجِزُ يختم)، وهي
 * في `approveRoles`/`completeRoles` لا هنا. فمن سأل هذه الخريطةَ عن «أيعتمد
 * فلانٌ هذا المستند؟» سألها ما لا تعرف.
 */
export const WRITE_GATES = Object.freeze({
  labor_tasks: Object.freeze(['isLaborWriter']),
  picking_tasks: Object.freeze(['isStockActor']),
  handling_units: Object.freeze(['isStockActor']),
  receiving_sessions: Object.freeze(['isStockActor']),
  documents: Object.freeze([
    'isStockActor', 'isProcurementActor', 'isLaborWriter', 'isVanSalesWriter',
  ]),
  bin_locations: Object.freeze(['isManager']),
  warehouses: Object.freeze(['isManager']),
});

/** أسماءٌ عربيّةٌ للمجموعات — الرسالةُ تُقرأ في شاشةِ موظّفٍ لا في سجلّ خادم. */
export const COLLECTION_LABELS = Object.freeze({
  labor_tasks: 'مهامّ المناولة',
  picking_tasks: 'مهامّ التحضير',
  handling_units: 'الطبالي',
  receiving_sessions: 'جلسات الاستلام',
  documents: 'المستندات',
  bin_locations: 'مواقع التخزين',
  warehouses: 'المستودعات',
});

/** ★ سقفُ أسماءِ المُلّاك في الرسالة — رسالةٌ بثمانيةَ عشرَ اسمًا لا تُقرأ. */
const OWNERS_SHOWN = 6;

/** الأدوارُ التي تفتح هذه المجموعةَ — اتّحادُ أدوارِ حرّاسها، بلا تكرار. */
export function writeGateRoles(collection) {
  const gates = WRITE_GATES[collection];
  if (!gates) return [];
  const roles = new Set();
  for (const g of gates) for (const r of GUARD_ROLES[g] ?? []) roles.add(r);
  return [...roles];
}

/**
 * سببُ المنع نصًّا — أو `''` إن جازت الكتابة.
 *
 * ★ ويقول **من يملكها**: موظّفٌ يُمنع ولا يعرف إلى من يذهب يبحث عمّن يمرّره،
 * وموظّفٌ يُقال له «هذه لمشرف المناولة» يذهب إليه (نمطُ `opProblem`).
 *
 * ★★★ وحالتان تُعيدان `''` عمدًا — **لا تحكم على ما لا تعرف**:
 *   ① مجموعةٌ ليست في الخريطة: صمتُنا عنها جهلٌ لا إذن، والخادمُ يبتّ.
 *   ② دورٌ فارغٌ أو غيرُ محمَّل بعد: هذا **العطبُ الذي وقع فعلًا** في
 *      `fetchUserProfile` — قراءةٌ فشلت فعاد الدورُ افتراضيًّا، فمُنع المديرُ
 *      العامّ نفسُه بلا سبب. ومنعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ
 *      يردّه الخادمُ برسالةٍ واضحة.
 */
export function collectionWriteProblem(role, collection) {
  const gates = WRITE_GATES[collection];
  if (!gates) return '';
  const who = typeof role === 'string' ? role.trim() : '';
  if (!who) return '';
  if (gates.some((g) => (GUARD_ROLES[g] ?? []).includes(who))) return '';

  const owners = writeGateRoles(collection).map((r) => ROLES[r]?.label ?? r);
  const shown = owners.slice(0, OWNERS_SHOWN).join(' · ');
  const rest = owners.length > OWNERS_SHOWN ? ' وغيرُهم' : '';
  const label = COLLECTION_LABELS[collection] ?? collection;
  const mine = ROLES[who]?.label ?? who;
  return `«${label}» ليست من صلاحيّة «${mine}» — يكتبها: ${shown}${rest}.`;
}

/**
 * أيستطيع هذا الدورُ العملَ على «مهامي»؟ — اختصارُ `labor_tasks`.
 *
 * ★ سُمّيت بالفعل الميدانيّ لا بالمجموعة: الشاشةُ تسأل «أأعرض زرَّ الإطلاق؟»
 * لا «أأكتب في labor_tasks؟». والحكمُ واحدٌ لأنّ القاعدةَ تحكم الإنشاءَ
 * والتحديثَ وإلحاقَ الأحداث بالحارس نفسِه.
 */
export function canReleaseTasks(role) {
  return !collectionWriteProblem(role, 'labor_tasks');
}

/**
 * ★★★ قارئُ القاعدة — يستخرج مصفوفةَ أدوارِ حارسٍ من **نصّ** `firestore.rules`.
 *
 * دالّةٌ خالصةٌ بلا `fs` عمدًا: القراءةُ من القرص شأنُ من يستدعي (الاختبار
 * يقرأ، و`prebuild` يستطيع أن يقرأ) — وهي هنا لتُختبر بنصٍّ مصطنع أيضًا.
 *
 * ⚠️ ولا تُزوّر نجاحًا: إن تغيّر شكلُ القاعدة فلم يُعثر على الدالّة أو على
 * مصفوفتها أو خرجت فارغة، تُعيد `ok:false` **بسببٍ مقروء** — ولا تُعيد
 * قائمةً فارغةً تُطابق قائمةً فارغةً فيمرّ الحارسُ وهو أعمى.
 *
 * @returns {{ok:boolean, roles:string[], reason:string}}
 */
export function readGuardRoles(rulesText, guardName) {
  const fail = (reason) => ({ ok: false, roles: [], reason });
  if (typeof rulesText !== 'string' || !rulesText) return fail('نصُّ القاعدة فارغ.');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(guardName ?? ''))) {
    return fail(`اسمُ حارسٍ غيرُ صالح: «${guardName}».`);
  }

  // جسدُ الدالّة: من `{` إلى أوّلِ `}` يبدأ سطرًا — والقاعدةُ لا تُعشِّش
  // أقواسًا بهذا الشكل داخل حرّاس الأدوار.
  const fn = new RegExp(`function\\s+${guardName}\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(rulesText);
  if (!fn) return fail(`لم يُعثر على الدالّة «${guardName}()» في firestore.rules.`);

  // ⚠️ التعليقاتُ تُمحى أوّلًا: مصفوفةُ `isStockActor` فيها تعليقٌ عربيٌّ بين
  // السطور، ولولا محوُه لالتقط أيُّ اقتباسٍ فيه اسمَ دورٍ زائف.
  const body = fn[1].replace(/\/\/[^\n]*/g, '');
  const arr = /myRole\(\)\s*in\s*\[([^\]]*)\]/.exec(body);
  if (!arr) return fail(`لم يُعثر على «myRole() in [...]» داخل «${guardName}()» — تغيّر شكلُ القاعدة.`);

  const roles = [...arr[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  if (!roles.length) return fail(`مصفوفةُ أدوارِ «${guardName}()» خرجت فارغة — استخراجٌ فاشلٌ لا قاعدةٌ فارغة.`);
  return { ok: true, roles, reason: '' };
}
