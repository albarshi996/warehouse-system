/**
 * اختبارات الأدوار المخزنيّة — دورٌ واحدٌ للموظّف وخريطةٌ تقول ماذا يفعل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIELD_OPS,
  FIELD_ROLES,
  MY_TASKS_OP,
  PORTAL_TO_FIELD,
  ROLE_OPS,
  canDo,
  fieldRolesOf,
  opProblem,
  opsOf,
  seesBookQtyWhileCounting,
  warehouseProblem,
  roleSummary,
  uiGate,
} from './lpnRoles.js';
import { ROLE_NAV } from '../auth/navAccess.js';
import { NAV_GROUPS } from '../auth/navCatalog.js';
// ‹JR-701› السؤالُ الثاني: من يكتب `labor_tasks` في `firestore.rules`.
import { collectionWriteProblem } from '../labor/laborRoles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('أدوار خطة ٧ الثمانية كلُّها ممثَّلة', () => {
  assert.equal(Object.keys(FIELD_ROLES).length, 8);
  for (const r of ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER', 'COUNTER', 'GOVERNANCE', 'SUPERVISOR', 'ADMIN']) {
    assert.ok(FIELD_ROLES[r], `«${r}» موجود`);
    assert.ok(ROLE_OPS[r], `وله عملياتٌ معرَّفة`);
  }
});

test('★★ خريطةُ أدوار البوابة إلى الميدان — دورٌ واحدٌ للموظّف لا نظامان', () => {
  assert.deepEqual(fieldRolesOf('storekeeper'), ['RECEIVER', 'PUTAWAY', 'PICKER', 'LOADER']);
  assert.deepEqual(fieldRolesOf('inventory_auditor'), ['COUNTER']);
  assert.deepEqual(fieldRolesOf('viewer'), [], 'المشاهد لا ينفّذ ميدانيًّا');
});

test('★★★ فصلُ المهامّ: من يكوّن الطبلية لا يعتمدها', () => {
  assert.ok(canDo('storekeeper', 'RECEIVE'), 'أمين المخزن يستلم');
  assert.ok(!canDo('storekeeper', 'APPROVE'), 'ولا يعتمد ما كوّنه');
  assert.ok(canDo('warehouse_manager', 'APPROVE'));
  assert.ok(canDo('qc_inspector', 'APPROVE'), 'ومفتّش الجودة صاحبُها الطبيعيّ');
  assert.ok(!canDo('qc_inspector', 'RECEIVE'), 'ولا يستلم ما سيعتمده');
});

test('★★ التجاوز والتسوية للمشرف — لا للمنفّذ', () => {
  assert.ok(!canDo('storekeeper', 'OVERRIDE'), 'المنفّذ لا يتجاوز بنفسه');
  assert.ok(!canDo('storekeeper', 'ADJUST'), 'ولا يعتمد تسوية');
  assert.ok(canDo('warehouse_manager', 'OVERRIDE'));
  assert.ok(canDo('warehouse_manager', 'ADJUST'));
});

test('★★ رسالةُ المنع تقول من يملكها — فيذهب الموظّف إليه لا يبحث', () => {
  const p = opProblem('storekeeper', 'APPROVE');
  assert.match(p, /اعتماد الحوكمة/);
  assert.match(p, /موظّف الحوكمة/, 'تسمّي المالك');
  assert.equal(opProblem('warehouse_manager', 'APPROVE'), '');
  assert.match(opProblem('storekeeper', 'FLY'), /غير معروفة/);
});

test('🔒 حصرُ المستودع: الموظّف يعمل في مستودعه — والمديران فوق الحصر', () => {
  assert.match(
    warehouseProblem('storekeeper', { userWarehouse: 'MAIN', targetWarehouse: 'TRP' }),
    /راجع مشرفك/
  );
  assert.equal(warehouseProblem('storekeeper', { userWarehouse: 'MAIN', targetWarehouse: 'main' }), '', 'التطبيع');
  assert.equal(warehouseProblem('warehouse_manager', { userWarehouse: 'MAIN', targetWarehouse: 'TRP' }), '');
  assert.equal(warehouseProblem('storekeeper', { userWarehouse: '', targetWarehouse: 'TRP' }), '', 'بلا مستودعٍ مسجَّل لا حصر');
});

test('★★★ الجردُ الأعمى ليس صلاحيّةً بل قاعدةَ الطبقة — لا لأحد', () => {
  assert.equal(seesBookQtyWhileCounting(), false);
});

test('🔒 درس ل-١٨: كلّ دورٍ في الخريطة موجودٌ في نظام أدوار البوابة', () => {
  // شاشةٌ تمنح دورًا لا تعرفه القاعدة تعني صلاحيّةً تُمنح ولا تُنفَّذ.
  for (const role of Object.keys(PORTAL_TO_FIELD)) {
    assert.ok(ROLE_NAV[role] || role === 'admin', `الدور «${role}» معروفٌ في navAccess`);
  }
});

test('🔒 كلّ دورٍ في الخريطة مذكورٌ في firestore.rules — فلا تسمح شاشةٌ بما تمنعه القاعدة', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  for (const role of Object.keys(PORTAL_TO_FIELD)) {
    assert.ok(rules.includes(`'${role}'`), `الدور «${role}» غير مذكورٍ في القواعد — عملُه سيرتدّ من الخادم`);
  }
});

test('كلّ عمليةٍ في المصفوفة معرَّفةٌ في قائمة العمليات — ولا عمليةَ بلا مالك', () => {
  for (const [role, ops] of Object.entries(ROLE_OPS)) {
    for (const op of ops) assert.ok(Object.hasOwn(FIELD_OPS, op), `«${op}» لدور «${role}» غير معرَّفة`);
  }
  for (const op of Object.keys(FIELD_OPS)) {
    const owners = Object.values(ROLE_OPS).filter((ops) => ops.includes(op));
    assert.ok(owners.length > 0, `العملية «${op}» بلا مالكٍ واحد`);
  }
  assert.deepEqual(opsOf('viewer'), []);
});

/* ── ‹LPN-511› بوّابةُ الشاشة ──────────────────────────────────────── */

test('★★★ الدورُ المجهول يمرّ — منعٌ بُني على جهلٍ بالهويّة أسوأ من سماحٍ يردّه الخادم', () => {
  // العطبُ الذي يحرسه هذا الاختبار وقع فعلًا: قراءةٌ فشلت فعاد الدور
  // `viewer`، فمُنع المديرُ العام صامتًا وهو لا يفهم لماذا.
  for (const unknown of ['', null, undefined, 'viewer', 'دورٌ لم يُخرَّط بعد']) {
    const g = uiGate(unknown, 'RECEIVE');
    assert.ok(g.allowed, `«${unknown}» حُجب — والشاشةُ لا تعرف من هو`);
    assert.equal(g.known, false);
    assert.equal(g.message, '');
  }
});

test('★★ والدورُ المعروف يُحكم بالمصفوفة — ويُقال له من يملكها', () => {
  const auditor = uiGate('inventory_auditor', 'APPROVE');
  assert.ok(!auditor.allowed, 'موظّف الجرد لا يعتمد');
  assert.ok(auditor.known);
  assert.match(auditor.message, /موظّف الحوكمة/, 'يُقال له إلى من يذهب');

  assert.ok(uiGate('inventory_auditor', 'COUNT').allowed);
  assert.ok(uiGate('storekeeper', 'RECEIVE').allowed);
  assert.ok(!uiGate('storekeeper', 'APPROVE').allowed, 'من يكوّن الطبلية لا يعتمدها');
  assert.ok(uiGate('admin', 'OVERRIDE').allowed);
});

test('★ الملخّصُ للعرض لا للمنع — ويعلن جهلَه بالدور المجهول', () => {
  const s = roleSummary('storekeeper');
  assert.ok(s.known);
  assert.ok(s.fieldLabels.length > 0 && s.opLabels.length > 0);

  const u = roleSummary('viewer');
  assert.equal(u.known, false);
  assert.deepEqual(u.fieldLabels, [], 'لا يُخترع له دورٌ ميدانيّ');
});

/* ── ‹JR-701› انحرافُ الخريطة — دَينُ د٧ مغلقًا ────────────────────────── */

/**
 * ★★★ العطبُ الذي يقيسه ما بعدُ — **تسامحُ `uiGate` يُخفي انحرافًا**.
 *
 * `uiGate` تمرّر الدورَ المجهول عمدًا (اقرأ تعليقَها: منعٌ بُني على جهلٍ
 * بالهويّة أسوأ من سماحٍ يردّه الخادم). وهو صوابٌ لمن **لا شأن له بالميدان**.
 * لكنّ دورًا يفتح له `navCatalog` شاشةً ميدانيّةً ثمّ يمرّ بـ`{known:false}`
 * ليس متسامَحًا معه — بل **غيرَ مُخرَّطٍ أصلًا**: يفتح الشاشة، فتُخفي عنه
 * الشاشةُ رسالةَ المنع، فيعمل حتّى يرتدّ عملُه من `firestore.rules` بلا
 * سببٍ يفهمه. فالفرقُ بين «يمرّ لأنّه مأذون» و«يمرّ لأنّه مجهول» هو كلّ شيء.
 */

/**
 * المساراتُ الميدانيّة: ما يقف عنده موظّفٌ في الممرّ فينفّذ — لا ما يقرؤه.
 *
 * ⚠️ وتُكتب صراحةً لأنّ «ميدانيّ» حكمٌ لا يُشتقّ من الكتالوج: `documents`
 * و`tasks` مفتوحتان لوحدات الميدان الثلاث ولا تُنفَّذ فيهما عمليّة.
 */
const FIELD_ROUTES = Object.freeze([
  '/dashboard/my-tasks',
  '/dashboard/bin-console',
  '/dashboard/pick-plan',
  '/dashboard/directed-storage',
  '/dashboard/labor-operations',
]);

const isFieldRoute = (p) =>
  String(p ?? '').startsWith('/dashboard/lpn-') || FIELD_ROUTES.includes(p);

/** الدورُ ← المساراتُ الميدانيّة التي يفتحها له الكتالوج. */
function rolesOnFieldRoutes() {
  const where = new Map();
  for (const g of NAV_GROUPS) {
    for (const it of g.items ?? []) {
      if (!isFieldRoute(it.path)) continue;
      for (const r of it.roles ?? []) {
        if (!where.has(r)) where.set(r, []);
        where.get(r).push(it.path);
      }
    }
  }
  return where;
}

/** المساراتُ الميدانيّة التي يفتحها الكتالوجُ لدورٍ بعينه. */
const visibleFieldRoutes = (role) => rolesOnFieldRoutes().get(role) ?? [];

/** مداخلُ ميدانيّةٌ بلا `roles` — تُفتح لكلّ من يرى المجموعة فلا يراها الجامعُ أعلاه. */
const fieldItemsWithoutRoles = () =>
  NAV_GROUPS.flatMap((g) => g.items ?? [])
    .filter((it) => isFieldRoute(it.path) && !it.roles)
    .map((it) => it.path);

const unmappedFieldRoles = () =>
  [...rolesOnFieldRoutes().keys()].filter((r) => !Object.hasOwn(PORTAL_TO_FIELD, r)).sort();

test('★★★ كلُّ دورٍ يفتح له الكتالوجُ شاشةً ميدانيّةً مخرَّطٌ في الخريطة', () => {
  // ★★ كان متجاوَزًا بـ`skip` منذ الدفعة الأولى — دَينًا معلَنًا لا مذكورًا في
  // رأس أحد. ورُفع في ‹JR-701› بخَرْط الوحدات الثلاث: فخضرّ **من غير أن
  // يُكتب فيه سطر**، وهو ما يجعل إغلاقَه بيّنةً لا ادّعاءً.
  const where = rolesOnFieldRoutes();
  const missing = unmappedFieldRoles();
  assert.deepEqual(
    missing,
    [],
    `أدوارٌ تفتح شاشاتٍ ميدانيّةً ولا تعرفها «PORTAL_TO_FIELD» — فتمرّ في ` +
      `uiGate لأنّها مجهولةٌ لا لأنّها مأذونة:\n` +
      missing.map((r) => `  · «${r}» ← ${where.get(r).join(' · ')}`).join('\n')
  );
});

test('⚠️ والوحداتُ الثلاث مخرَّطةٌ بأدوارها بالاسم — لا بعددٍ مبهم', () => {
  // ★★★ ولماذا بالاسم؟ لأنّ «صفرَ غيرِ مخرَّط» أعلاه يخضرّ أيضًا لو سُحبت
  // الشاشاتُ من الثلاثة سحبًا صامتًا. فهذا يقول ماذا تملك كلُّ واحدةٍ فعلًا.
  assert.deepEqual(fieldRolesOf('receiving_unit'), ['RECEIVER']);
  assert.deepEqual(fieldRolesOf('putaway_unit'), ['PUTAWAY']);
  assert.deepEqual(fieldRolesOf('picking_unit'), ['PICKER']);

  // ★★ وكلُّ وحدةٍ تمرّ الآن **لأنّها مأذونة** لا لأنّها مجهولة — وفرقُ
  // الاثنين هو العطبُ كلُّه: `known:true` تعني أنّ الشاشة تحكم بالمصفوفة.
  for (const [role, op] of [['receiving_unit', 'RECEIVE'], ['putaway_unit', 'PUTAWAY'], ['picking_unit', 'PICK']]) {
    const g = uiGate(role, op);
    assert.ok(g.known, `«${role}» ما زال مجهولًا للخريطة`);
    assert.ok(g.allowed, `«${role}» يُمنع من عمليّته الأصليّة «${op}»`);
  }
  // وواحدةٌ تُمنع ممّا ليس لها — فالخَرْطُ حكمٌ لا فتحُ باب.
  assert.ok(!uiGate('picking_unit', 'APPROVE').allowed, 'من يحضّر لا يعتمد');

  // ★★★ و`count_assignee` و`scm_manager` غائبان عن الخريطة **بقياسٍ لا بسهو**:
  // `ROLE_NAV` يمنحهما `daily`/`warehouses`/`reports` ولا يمنحهما `lpn` ولا
  // `putaway`. فإن فُتحت لأحدهما شاشةٌ ميدانيّةٌ يومًا صرخ هذا السطرُ باسمه.
  const where = rolesOnFieldRoutes();
  for (const absent of ['count_assignee', 'scm_manager']) {
    assert.ok(!where.has(absent), `«${absent}» صار على مسارٍ ميدانيّ — فخرّطه في «PORTAL_TO_FIELD»`);
  }

  // ⚠️ ومدخلٌ ميدانيٌّ بلا `roles` مفتوحٌ لكلّ من يرى المجموعة، والجامعُ
  // أعلاه لا يرى فيه دورًا — فيخضرّ العدُّ بينما اتّسع البابُ صامتًا.
  assert.deepEqual(fieldItemsWithoutRoles(), [], 'مدخلٌ ميدانيٌّ بلا `roles` — يُفتح للمجموعة كلّها ولا يعدّه هذا الحارس');
});

test('🔒 وحداتُ الميدان الثلاث معروفةٌ في البوابة والقواعد — فالناقصُ كان الخَرْطَ وحده', () => {
  // ★ تمييزُ الدَّين: لو كانت هذه الأدوار مجهولةً للبوابة أو للخادم لكان
  // العطبُ أكبر (دورٌ مخترَع). وهي معروفةٌ في الاثنين — فالناقصُ **الخَرْط**
  // وحده، وهو ما جعل إصلاحَ ‹JR-701› ثلاثةَ أسطرٍ لا مشروعًا.
  //
  // ⚠️ وتُسمّى الثلاثةُ صراحةً لا تُقرأ من `unmappedFieldRoles()`: تلك صارت
  // فارغةً بالإصلاح، فحلقةٌ عليها **لا تُطلق ولو مرّة** — حارسٌ أخضرُ أبدًا.
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  for (const role of ['receiving_unit', 'putaway_unit', 'picking_unit']) {
    assert.ok(ROLE_NAV[role], `الدور «${role}» معروفٌ في navAccess`);
    assert.ok(rules.includes(`'${role}'`), `والدور «${role}» مذكورٌ في firestore.rules`);
  }
});

/* ── ‹JR-701› بوّابةُ «مهامي» — السؤالان معًا لا واحدٌ منهما ─────────────── */

/**
 * ★★★ لماذا سؤالان؟
 *
 * `uiGate` **تمرّر المجهولَ عمدًا** (اقرأ تعليقها). فشاشةٌ تسألها وحدَها تفتح
 * لكلّ دورٍ لم يُخرَّط — وهو أسوأُ من حالِ اليوم لا أفضل. و`labor_tasks`
 * محكومةٌ في `firestore.rules` بـ`isLaborWriter()` وحدَه (ثلاثةُ أدوار)،
 * فالسؤالُ الثاني `collectionWriteProblem` هو الذي يعرف الخادم.
 *
 * ومحصّلةُ الاثنين **قرارُ المالك ق‑أ**: «أغلقها على المشرفين الآن» — فيتحوّل
 * فشلٌ صامتٌ في منتصف الممرّ إلى بابٍ مغلقٍ صادقٍ عند المدخل.
 */
const myTasksDenial = (role) => {
  const gate = uiGate(role, MY_TASKS_OP);
  return gate.allowed ? collectionWriteProblem(role, 'labor_tasks') : gate.message;
};

test('★★★ «مهامي» للمشرفين الثلاثة — وأمينُ المخزن يُمنع عند المدخل لا عند الرفّ', () => {
  for (const r of ['admin', 'warehouse_manager', 'labor_supervisor']) {
    assert.equal(myTasksDenial(r), '', `«${r}» كاتبُ مناولةٍ في القاعدة فتُفتح له`);
  }
  // ★★ الأربعةُ الذين كانت البوّابةُ تفتح لهم الشاشةَ ويرفضهم الخادم.
  for (const r of ['storekeeper', 'gate_officer', 'putaway_unit', 'picking_unit']) {
    assert.notEqual(myTasksDenial(r), '', `«${r}» يُرفض في الخادم — فالبابُ يُغلق قبل أن يمشي`);
  }
  // والرسالةُ تقول **من يملك الشاشة** لا «غير مصرّح».
  assert.match(myTasksDenial('storekeeper'), /مشرف المناولة/, 'تسمّي المالك فيذهب إليه');
});

test('★★★ ولا يكفي `uiGate` وحدَه — نقضٌ لا دعوى', () => {
  // أمينُ المخزن يملك `PUTAWAY` في المصفوفة، فـ`uiGate` تفتح له الشاشةَ
  // والخادمُ يرفض أوّلَ مسحة. فلو سُئلت وحدَها لعاد العطبُ بعينه.
  assert.ok(uiGate('storekeeper', MY_TASKS_OP).allowed, 'المصفوفةُ وحدَها تفتحها له');
  assert.notEqual(collectionWriteProblem('storekeeper', 'labor_tasks'), '', 'والقاعدةُ تمنعه');
});

test('★★ وأمينُ المخزن يبقى على شاشات الطبالي — فالبابُ المغلقُ مقصودٌ لا سهو', () => {
  // ق‑أ: «العاملُ الميدانيّ يبقى على شاشات الطبالي وهي مسموحةٌ له في الخادم
  // أصلًا». فلو أغلقنا عنه هذه أيضًا لكان الإصلاحُ سلبًا لا تصحيحًا.
  for (const op of ['RECEIVE', 'PUTAWAY', 'PICK', 'STAGE', 'LOAD']) {
    assert.ok(uiGate('storekeeper', op).allowed, `«${op}» من صلاحيّته الميدانيّة`);
  }
  const nav = new Set(visibleFieldRoutes('storekeeper'));
  assert.ok(!nav.has('/dashboard/my-tasks'), '«مهامي» سُحبت من الكتالوج');
  assert.ok(nav.has('/dashboard/lpn-receiving') && nav.has('/dashboard/lpn-picking'), 'وشاشاتُ الطبالي باقية');
});
