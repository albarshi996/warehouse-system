/**
 * 🔒 حارسُ صلاحيّات الكتابة — **قوائمُ الأدوار في الكود تطابق `firestore.rules`.**
 *
 * ═══ لماذا يقرأ الاختبارُ ملفَّ القاعدة من القرص؟ ═══
 * لأنّ الخطرَ ليس خطأً في الوحدة بل **انحرافَها مع الزمن**: يُضاف دورٌ إلى
 * `isStockActor()` في القاعدة فتبقى الوحدةُ على ثلاثةَ عشرَ دورًا، فتخبر
 * الشاشةُ موظّفًا أنّه لا يملك ما تسمح له به القاعدة — أو يُحذف دورٌ فتَعِدُه
 * الشاشةُ بما يرتدّ من الخادم. فمن غيّر القاعدةَ ونسي الوحدةَ **يسقط بناؤه
 * هنا**، لا في يد موظّفٍ واقفٍ عند الرفّ.
 *
 * وهو نمطُ `usageGuide.test.js` نفسُه: لا يفحص وجودَ ملفٍّ بل **تطابقَ قائمتين**.
 *
 * ⚠️ وإن فشل الاستخراجُ (تغيّر شكلُ القاعدة) فالاختبار **يسقط برسالةٍ تقول
 * إنّ الاستخراج فشل** — ولا يُقارن فارغًا بفارغٍ فيمرّ وهو أعمى.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLECTION_LABELS,
  GUARD_ROLES,
  LABOR_WRITER_ROLES,
  MANAGER_WRITE_ROLES,
  PROCUREMENT_ROLES,
  STOCK_ACTOR_ROLES,
  VAN_SALES_ROLES,
  WRITE_GATES,
  canReleaseTasks,
  collectionWriteProblem,
  readGuardRoles,
  writeGateRoles,
} from './laborRoles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/** كتلةُ مجموعةٍ في القاعدة: من `match /col/` إلى المطابقةِ العليا التي تليها. */
function collectionBlock(collection) {
  const start = RULES.indexOf(`match /${collection}/`);
  if (start < 0) return '';
  const next = RULES.indexOf('\n    match /', start + 1);
  return RULES.slice(start, next < 0 ? RULES.length : next);
}

/* ═══════════════ ① الحارس: القاعدةُ هي المصدر ═══════════════ */

test('🔒 كلُّ حارسٍ في الوحدة يطابق مصفوفتَه في firestore.rules حرفًا', () => {
  for (const [guard, exported] of Object.entries(GUARD_ROLES)) {
    const read = readGuardRoles(RULES, guard);
    assert.ok(
      read.ok,
      `فشل استخراجُ «${guard}()» من firestore.rules — لا تُصدّق نجاحًا هنا: ${read.reason}`
    );
    const inRules = [...read.roles].sort();
    const inCode = [...exported].sort();
    const extra = inRules.filter((r) => !inCode.includes(r));
    const missing = inCode.filter((r) => !inRules.includes(r));
    assert.deepEqual(
      inCode,
      inRules,
      `انحرفت أدوارُ «${guard}()» عن القاعدة — شاشةٌ تكذب على موظّف:\n` +
        `  • في القاعدة ولا في laborRoles.js: ${extra.join(' · ') || '—'}\n` +
        `  • في laborRoles.js ولا في القاعدة: ${missing.join(' · ') || '—'}`
    );
  }
});

test('★ والحارسُ لا يُزوّر نجاحًا حين يفشل الاستخراج', () => {
  assert.equal(readGuardRoles(RULES, 'isNoSuchGuard').ok, false, 'حارسٌ غيرُ موجودٍ يجب أن يفشل');
  assert.match(readGuardRoles(RULES, 'isNoSuchGuard').reason, /لم يُعثر/);

  // دالّةٌ بلا مصفوفةِ أدوار — الشكلُ تغيّر، فالجوابُ فشلٌ لا قائمةٌ فارغة.
  const shapeless = 'function isX() {\n  return signedIn() && isActive();\n}\n';
  const r = readGuardRoles(shapeless, 'isX');
  assert.equal(r.ok, false);
  assert.deepEqual(r.roles, []);
  assert.match(r.reason, /myRole/);

  // ومصفوفةٌ لا تحمل إلّا تعليقًا: التعليقُ يُمحى فتخرج فارغةً — وتُعلن فشلَها.
  const commented = "function isY() {\n  return myRole() in [\n    // 'admin'\n  ];\n}\n";
  assert.equal(readGuardRoles(commented, 'isY').ok, false, 'تعليقٌ لا يُحسب دورًا');

  assert.equal(readGuardRoles('', 'isStockActor').ok, false);
  assert.equal(readGuardRoles(RULES, 'is Bad Name').ok, false);
});

test('★ والقارئُ يقرأ فعلًا لا يعيد ما زُرع فيه', () => {
  const read = readGuardRoles(RULES, 'isLaborWriter');
  assert.ok(read.ok, read.reason);
  assert.ok(read.roles.includes('labor_supervisor'), 'مشرف المناولة من القاعدة نفسِها');
  assert.equal(read.roles.includes('storekeeper'), false, 'أمين المخزن ليس كاتبَ مناولة في القاعدة');
  // ومصفوفةُ الفاعل المخزنيّ متعدّدةُ الأسطر وفيها تعليقٌ عربيّ بينها —
  // فنجاحُها دليلٌ على أنّ محوَ التعليقات يعمل.
  const actor = readGuardRoles(RULES, 'isStockActor');
  assert.ok(actor.ok, actor.reason);
  assert.ok(actor.roles.length >= 14, `مصفوفةٌ مبتورة: ${actor.roles.length}`);
  assert.ok(actor.roles.includes('picking_unit'), 'آخرُ عنصرٍ بعد التعليق');
  assert.equal(actor.roles.includes('fnb_manager'), false, 'دورُ القطاع ليس فاعلًا مخزنيًّا');
});

/* ═══════════════ ② الخريطة: كلُّ مجموعةٍ موجودةٌ وحرّاسُها معروفون ═══════ */

test('🔒 كلُّ مجموعةٍ في WRITE_GATES لها `match` في القاعدة، وحرّاسُها مذكورون فيه', () => {
  for (const [collection, gates] of Object.entries(WRITE_GATES)) {
    const block = collectionBlock(collection);
    assert.notEqual(block, '', `«${collection}» ليست في firestore.rules — اسمٌ مكتوبٌ خطأً يُسكت الحارس`);
    for (const gate of gates) {
      assert.ok(GUARD_ROLES[gate], `حارسٌ مجهولٌ في الخريطة: «${gate}»`);
      assert.ok(
        block.includes(`${gate}()`),
        `«${collection}» تُنسب إلى «${gate}()» والقاعدةُ لا تذكره في كتلتها`
      );
    }
    assert.ok(COLLECTION_LABELS[collection], `«${collection}» بلا اسمٍ عربيٍّ — الرسالةُ تُقرأ في شاشةِ موظّف`);
  }
});

test('★★ المجموعاتُ السبعُ المطلوبةُ كلُّها ممثَّلة', () => {
  for (const c of [
    'labor_tasks', 'picking_tasks', 'documents', 'handling_units',
    'receiving_sessions', 'bin_locations', 'warehouses',
  ]) {
    assert.ok(WRITE_GATES[c]?.length > 0, `«${c}» غير محكومةٍ في الخريطة`);
  }
});

test('★★★ `labor_tasks` لا يحرسها الفاعلُ المخزنيّ — وهذا أصلُ العطب', () => {
  const block = collectionBlock('labor_tasks');
  assert.match(block, /allow create, update: if isLaborWriter\(\)/);
  assert.equal(
    block.includes('isStockActor()'),
    false,
    'لو صار الفاعلُ المخزنيّ يكتب مهامَّ المناولة فالخريطةُ هنا تُحدَّث معه'
  );
});

test('★ والخريطةُ مجمَّدةٌ — لا يُبدّلها مستدعٍ في زمن التشغيل', () => {
  assert.ok(Object.isFrozen(WRITE_GATES));
  assert.ok(Object.isFrozen(GUARD_ROLES));
  assert.ok(Object.isFrozen(STOCK_ACTOR_ROLES) && Object.isFrozen(LABOR_WRITER_ROLES));
  assert.ok(Object.isFrozen(MANAGER_WRITE_ROLES) && Object.isFrozen(VAN_SALES_ROLES));
  assert.ok(Object.isFrozen(PROCUREMENT_ROLES));
  for (const gates of Object.values(WRITE_GATES)) assert.ok(Object.isFrozen(gates));
});

/* ═══════════════ ③ العطبُ الحيّ: «مهامي» تكذب على أمين المخزن ═══════════ */

test('★★★ العطبُ الحيّ: أمينُ المخزن يكتب `documents` ولا يكتب `labor_tasks`', () => {
  // البوّابةُ تفتح له `/dashboard/my-tasks`… والقاعدةُ ترفض أوّلَ مسحةٍ يمسحها.
  assert.equal(collectionWriteProblem('storekeeper', 'documents'), '', 'فاعلٌ مخزنيٌّ يُنشئ المستندات');
  const problem = collectionWriteProblem('storekeeper', 'labor_tasks');
  assert.notEqual(problem, '', 'أمينُ المخزن ليس في isLaborWriter — والشاشةُ يجب أن تقولها قبل الرفّ');
  assert.match(problem, /مشرف المناولة/, 'الرسالةُ تقول إلى من يذهب');
  assert.match(problem, /أمين المخزن/, 'وتسمّي دورَه بالعربيّة لا بمعرّفه');
  assert.equal(canReleaseTasks('storekeeper'), false);
});

test('★ وثلاثةٌ وحدَهم يملكون «مهامي» — والبقيّةُ تُمنع قبل أن تمشي', () => {
  for (const r of ['admin', 'warehouse_manager', 'labor_supervisor']) {
    assert.equal(canReleaseTasks(r), true, `«${r}» كاتبُ مناولةٍ في القاعدة`);
    assert.equal(collectionWriteProblem(r, 'labor_tasks'), '');
  }
  // ★ هؤلاء الأربعةُ تفتح لهم البوّابةُ `/dashboard/my-tasks` والقاعدةُ تمنعهم.
  for (const r of ['storekeeper', 'gate_officer', 'putaway_unit', 'picking_unit']) {
    assert.equal(canReleaseTasks(r), false, `«${r}» ليس كاتبَ مناولة`);
  }
});

/* ═══════════════ ④ سلوكُ الدالّة: لا تحكم على ما لا تعرف ═══════════ */

test('★★★ مجموعةٌ مجهولةٌ تمرّ — صمتُنا عنها جهلٌ لا إذن', () => {
  assert.equal(collectionWriteProblem('viewer', 'no_such_collection'), '');
  assert.equal(collectionWriteProblem('viewer', ''), '');
  assert.equal(collectionWriteProblem('viewer', undefined), '');
});

test('★★★ ودورٌ غيرُ محمَّلٍ يمرّ — لا يُمنع أحدٌ لأنّنا لم نعرفه بعد', () => {
  for (const r of [undefined, null, '', '   ', 42, {}]) {
    assert.equal(collectionWriteProblem(r, 'labor_tasks'), '', `«${String(r)}» دورٌ مجهولٌ لا يُمنع`);
    assert.equal(canReleaseTasks(r), true);
  }
  // أمّا دورٌ معروفُ الاسمِ خارجَ القاعدة فيُمنع: هذا حكمُ الخادم لا تخميننا.
  assert.notEqual(collectionWriteProblem('viewer', 'labor_tasks'), '');
  assert.notEqual(collectionWriteProblem('role_that_never_existed', 'labor_tasks'), '');
});

test('★★ `documents` أربعةُ حرّاسٍ لا واحد — والنموذجُ الناقصُ يكذب', () => {
  // مندوبُ المبيعات ليس فاعلًا مخزنيًّا، والقاعدةُ تسمح له بإنشاء مستند.
  assert.equal(collectionWriteProblem('sales_rep', 'documents'), '', 'isVanSalesWriter تفتحها له');
  assert.equal(collectionWriteProblem('treasury', 'documents'), '', 'isProcurementActor تفتحها له');
  assert.equal(collectionWriteProblem('labor_supervisor', 'documents'), '', 'isLaborWriter تفتحها له');
  // والمشاهدُ خارجَ الأربعة كلِّهم.
  assert.notEqual(collectionWriteProblem('viewer', 'documents'), '');
  // ★ ولا تُسرد ثمانيةَ عشرَ اسمًا في رسالةٍ: تُقصّ وتُختم بـ«وغيرُهم».
  assert.match(collectionWriteProblem('viewer', 'documents'), /وغيرُهم/);
});

test('★ مواقعُ التخزين والمستودعاتُ للمديرَين وحدَهما', () => {
  for (const c of ['bin_locations', 'warehouses']) {
    assert.equal(collectionWriteProblem('warehouse_manager', c), '');
    assert.notEqual(collectionWriteProblem('storekeeper', c), '', 'بنيةُ المستودع قرارٌ إداريّ');
    assert.deepEqual(writeGateRoles(c), ['admin', 'warehouse_manager']);
  }
});

test('★ والفاعلُ المخزنيُّ يملك مهامَّ التحضير والطبالي وجلساتِ الاستلام', () => {
  for (const c of ['picking_tasks', 'handling_units', 'receiving_sessions']) {
    assert.equal(collectionWriteProblem('picking_unit', c), '');
    assert.notEqual(collectionWriteProblem('labor_supervisor', c), '', 'مشرفُ المناولة ليس فاعلًا مخزنيًّا');
  }
});

test('★ `writeGateRoles` اتّحادٌ بلا تكرار — والمجهولةُ فارغة', () => {
  const roles = writeGateRoles('documents');
  assert.equal(new Set(roles).size, roles.length, 'admin يظهر في الحرّاس الأربعة كلِّهم');
  assert.ok(roles.includes('sales_rep') && roles.includes('storekeeper'));
  assert.deepEqual(writeGateRoles('no_such_collection'), []);
  assert.deepEqual(writeGateRoles('labor_tasks'), ['admin', 'warehouse_manager', 'labor_supervisor']);
});
