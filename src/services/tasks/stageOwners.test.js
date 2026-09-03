/**
 * اختبارات «صاحب المرحلة» ‹JR-105›.
 *
 * ★★ **حارسُ المطابقة أوّلًا وهو سببُ وجود هذا الملفّ.** الخطرُ ليس خطأً في
 * الوحدة بل **انحرافَها مع الزمن**: يُبدَّل معتمِدُ نوعٍ في `firestore.rules`
 * ويبقى مخطّطُ النوع على القديم — فتقول الشاشةُ لموظّفٍ «ينتظر اعتماد
 * فلان» وفلانٌ لا يملكه، فيقف المستندُ ولا يعرف أحدٌ لماذا. فمن غيّر
 * القاعدةَ ونسي المخطّطَ **يسقط بناؤه هنا**، لا عند رفٍّ في مستودع.
 *
 * وهو نمطُ `labor/laborRoles.test.js` نفسُه (بُني اليوم): يقرأ ملفَّ القاعدة
 * من القرص ويقارن **قائمتين**، ولا يفحص وجودَ ملفّ.
 *
 * ⚠️ وإن تعذّر الاستخراجُ من نصّ القاعدة سقط الاختبارُ **برسالةٍ تقول ذلك**
 * — ولا يُقارن فارغًا بفارغٍ فيمرّ وهو أعمى.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGES,
  STAGE_LABELS,
  UNMAPPED_ROUTES,
  nextOwnerOf,
  readDocTypeRoles,
  roleNames,
  stageOwnerLine,
  stageOwnersFor,
} from './stageOwners.js';
import { FIELD_ROUTES } from './fieldRoutes.js';
import { CHAINS, STANDALONE_TYPES } from '../documents/chain.js';
import { readyTypes } from '../documents/schemas/index.js';
import { STATES } from '../documents/states.js';
import { ROLES } from '../auth/roles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/** كلُّ نوعٍ تعرفه الرحلة — سلاسلُ `chain.js` ومستقلّاتُه، لا قائمةٌ ثانية. */
const CHAIN_TYPES = [...new Set([...CHAINS.flat(), ...Object.keys(STANDALONE_TYPES)])];

const sorted = (a) => [...a].sort();

/* ═══════════════ ① ★★ الحارس: القاعدةُ هي المصدر ═══════════════ */

test('★★ `approve` و`complete` لكلّ نوعٍ تطابقان firestore.rules حرفًا', () => {
  for (const [stage, fnName] of [['approve', 'approveRoles'], ['complete', 'completeRoles']]) {
    const read = readDocTypeRoles(RULES, fnName);
    assert.ok(read.ok, `فشل استخراجُ «${fnName}()» — لا تُصدّق نجاحًا هنا: ${read.reason}`);
    assert.ok(
      Object.keys(read.map).length >= CHAIN_TYPES.length,
      `«${fnName}()» أعطت ${Object.keys(read.map).length} نوعًا و«chain.js» يعرف ${CHAIN_TYPES.length} — استخراجٌ مبتور`
    );

    for (const type of CHAIN_TYPES) {
      const inRules = read.map[type];
      assert.ok(inRules, `«${type}» في chain.js ولا وجودَ له في «${fnName}()» — نوعٌ بلا حارسٍ على الخادم`);
      const inCode = stageOwnersFor(type)[stage];
      const extra = sorted(inRules).filter((r) => !inCode.includes(r));
      const missing = sorted(inCode).filter((r) => !inRules.includes(r));
      assert.deepEqual(
        sorted(inCode),
        sorted(inRules),
        `انحرف «${STAGE_LABELS[stage]}» لـ«${type}» عن القاعدة — شاشةٌ تكذب على موظّف:\n` +
          `  • في القاعدة ولا في المخطّط: ${extra.join(' · ') || '—'}\n` +
          `  • في المخطّط ولا في القاعدة: ${missing.join(' · ') || '—'}`
      );
    }
  }
});

test('★ والقارئُ يقرأ فعلًا لا يعيد ما زُرع فيه', () => {
  const ap = readDocTypeRoles(RULES, 'approveRoles');
  assert.ok(ap.ok, ap.reason);
  // ثلاثُ عيّناتٍ من القاعدة نفسِها، فيها فصلُ المهامّ المكتوبُ في تعليقها:
  assert.deepEqual(ap.map.PUTAWAY, ['warehouse_manager', 'inventory_auditor']);
  assert.ok(ap.map.GP.includes('gate_officer'), 'اعتمادُ تصريح البوابة لضابطها');
  assert.equal(ap.map.GP.includes('storekeeper'), false, 'ولا لأمين المخزن الذي جهّز الشحنة');
  // والتعليقاتُ ممحوّة: بين أسطر الخريطة أسماءُ أدوارٍ في نصٍّ عربيّ.
  assert.equal(ap.map.ADJ.includes('inventory_auditor'), false, 'لا يعتمد التسويةَ من أدخلها');
});

test('★ والحارسُ لا يُزوّر نجاحًا حين يفشل الاستخراج', () => {
  assert.equal(readDocTypeRoles(RULES, 'noSuchFunction').ok, false);
  assert.match(readDocTypeRoles(RULES, 'noSuchFunction').reason, /لم يُعثر/);
  assert.equal(readDocTypeRoles('', 'approveRoles').ok, false);
  assert.equal(readDocTypeRoles(RULES, 'is Bad Name').ok, false);

  // دالّةٌ بالاسم الصحيح وبلا خريطةٍ داخلها: الشكلُ تغيّر، فالجوابُ فشلٌ
  // لا خريطةٌ فارغة.
  const shapeless = 'function approveRoles(docType) {\n  return [];\n  }\n';
  const r = readDocTypeRoles(shapeless, 'approveRoles');
  assert.equal(r.ok, false);
  assert.deepEqual(r.map, {});
  assert.match(r.reason, /تغيّر شكلُ القاعدة/);

  // ومصفوفةٌ لا تحمل إلّا تعليقًا: التعليقُ يُمحى فتخرج فارغةً — وتُعلن فشلَها.
  const commented =
    "function approveRoles(docType) {\n  return docType == 'PR' ? [\n  // 'admin'\n  ]\n  : [];\n  }\n";
  assert.equal(readDocTypeRoles(commented, 'approveRoles').ok, false, 'تعليقٌ لا يُحسب دورًا');
});

test('★★★ ومُثبَتٌ بالنقض: قاعدةٌ محرّفةٌ تُكشف ولا تمرّ', () => {
  // لو غُيّر معتمِدُ «PUTAWAY» في القاعدة ونُسي المخطّط، وجب أن يظهر الفرق.
  const tampered = RULES.replace(
    "docType == 'PUTAWAY' ? ['warehouse_manager', 'inventory_auditor']",
    "docType == 'PUTAWAY' ? ['warehouse_manager', 'gate_officer']"
  );
  assert.notEqual(tampered, RULES, 'نصُّ الاستبدال لم يعد موجودًا — حدِّث النقضَ مع القاعدة');
  const read = readDocTypeRoles(tampered, 'approveRoles');
  assert.ok(read.ok, read.reason);
  assert.notDeepEqual(
    sorted(read.map.PUTAWAY),
    sorted(stageOwnersFor('PUTAWAY').approve),
    'الحارسُ أعمى: قاعدةٌ محرّفةٌ ومخطّطٌ قديمٌ تساويا'
  );
});

/* ═══════════════ ② 🔒 لا نوعَ صامت · ولا دورَ مخترَع ═══════════════ */

test('🔒 كلُّ نوعٍ في chain.js له أصحابٌ في المراحل الأربع — أو غيابٌ معلَنٌ مكتوب', () => {
  assert.ok(CHAIN_TYPES.length >= 40, `عدُّ الأنواع انهار: ${CHAIN_TYPES.length}`);
  for (const type of CHAIN_TYPES) {
    const owners = stageOwnersFor(type);
    assert.ok(owners.known, `«${type}» في chain.js وبلا مخطّطٍ في محرّك المستندات`);
    for (const stage of STAGES) {
      const hasOwners = owners[stage].length > 0;
      const declared = String(owners.absence[stage] ?? '').trim();
      assert.ok(
        hasOwners || declared,
        `«${type}» بلا أصحابٍ في «${stage}» وبلا سببٍ مكتوب — وهذا هو الصمتُ الممنوع`
      );
      assert.equal(hasOwners && declared !== '', false, 'لا يجتمع أصحابٌ وسببُ غياب');
    }
    // والمراحلُ الثلاثُ الأولى لها أصحابٌ دائمًا: هي ما تفرضه القاعدة.
    for (const stage of ['create', 'approve', 'complete']) {
      assert.ok(owners[stage].length > 0, `«${type}» بلا «${stage}» — القاعدةُ تفرضها`);
    }
  }
});

test('🔒 كلُّ دورٍ تُصدره الوحدة موجودٌ في roles.js — فلا دورَ مخترَع', () => {
  const seen = new Set();
  for (const type of CHAIN_TYPES) {
    const owners = stageOwnersFor(type);
    for (const stage of STAGES) for (const role of owners[stage]) seen.add(role);
  }
  assert.ok(seen.size > 10, `مجموعةُ الأدوار انهارت: ${seen.size}`);
  const invented = [...seen].filter((r) => !ROLES[r]);
  assert.deepEqual(invented, [], `أدوارٌ لا وجودَ لها في roles.js: ${invented.join(' · ')}`);
  // والأسماءُ العربيّةُ من `roles.js` لا مكتوبةً بيد.
  assert.deepEqual(roleNames(['warehouse_manager', 'inventory_auditor']), [
    ROLES.warehouse_manager.label,
    ROLES.inventory_auditor.label,
  ]);
});

test('★ ومخطّطاتُ المحرّك كلُّها ممثَّلةٌ في الرحلة — لا نوعَ بلا خريطة', () => {
  for (const type of readyTypes()) {
    assert.ok(
      CHAIN_TYPES.includes(type),
      `«${type}» له مخطّطٌ وليس في chain.js — نوعٌ لا تعرف الرحلةُ مكانَه`
    );
  }
});

/* ═══════════════ ③ التنفيذُ الميدانيّ مشتقٌّ لا مسرود ═══════════════ */

test('⚠️ كلُّ شاشةٍ في FIELD_ROUTES معروفةُ العمليّة — والمرآةُ لا تنحرف صامتة', () => {
  assert.deepEqual(
    UNMAPPED_ROUTES,
    [],
    `شاشةٌ يوجَّه إليها مستندٌ ولا عمليّةَ لها في stageOwners.js: ${UNMAPPED_ROUTES.join(' · ')}` +
      ' — فيظهر نوعٌ موجَّهٌ بلا منفّذين'
  );
});

test('★★ كلُّ نوعٍ موجَّهٍ إلى شاشةٍ له منفّذون — وغيرُ الموجَّه غيابُه معلَن', () => {
  const routed = Object.keys(FIELD_ROUTES);
  assert.ok(routed.length > 0, 'جدولُ المسارات فارغ — الحارسُ نفسُه معطوب');
  for (const type of routed) {
    assert.ok(
      stageOwnersFor(type).execute.length > 0,
      `«${type}» يُوجَّه إلى شاشةٍ ميدانيّةٍ ولا منفّذَ له`
    );
  }
  for (const type of CHAIN_TYPES.filter((t) => !routed.includes(t))) {
    const owners = stageOwnersFor(type);
    assert.deepEqual(owners.execute, [], `«${type}» بلا شاشةٍ ومعه منفّذون`);
    assert.match(owners.absence.execute, /لا شاشةَ تنفيذ/, `«${type}» غيابُه غيرُ معلَن`);
  }
});

test('★ والمنفّذون مشتقّون من lpnRoles لا مسرودون — عيّنتان تُثبتان الاشتقاق', () => {
  // التخزينُ يفتح لوحةَ الخانة، ومشرفُ المناولة يملك عمليّةَ التخزين هناك.
  const putaway = stageOwnersFor('PUTAWAY').execute;
  assert.ok(putaway.includes('labor_supervisor'), 'مشرفُ المناولة PUTAWAY في lpnRoles');
  assert.equal(putaway.includes('qc_inspector'), false, 'الحوكمةُ تعتمد ولا تخزّن');
  // والجردُ يفتح شاشةَ العدّ، وصاحبُها المدقّق وحدَه مع المديرَين.
  assert.deepEqual(stageOwnersFor('CC').execute, ['admin', 'warehouse_manager', 'inventory_auditor']);
});

/* ═══════════════ ④ السطرُ المعروض ═══════════════ */

test('★★ السطرُ العربيُّ كما طلبه المالك حرفًا', () => {
  assert.equal(stageOwnerLine('PUTAWAY', 'approve'), 'يعتمده: مدير المستودع · مدقّق الجرد');
  assert.equal(stageOwnerLine('PUTAWAY', 'create'), 'يُنشئه: أمين المخزن · مدير المستودع');
  assert.equal(stageOwnerLine('PUTAWAY', 'complete'), 'يُنجزه: أمين المخزن · مدير المستودع');
  assert.match(stageOwnerLine('PUTAWAY', 'execute'), /^ينفّذه ميدانيًّا: /);
  // والنوعُ يُقرأ مهما كُتب: صفُّ القائمة قد يحمل «putaway».
  assert.equal(stageOwnerLine('putaway', 'approve'), stageOwnerLine('PUTAWAY', 'approve'));
});

test('★ ومرحلةٌ بلا أصحابٍ تُعيد سببَها لا فراغًا', () => {
  const line = stageOwnerLine('GRN', 'execute');
  assert.match(line, /لا شاشةَ تنفيذ/, 'الغيابُ يُقرأ ولا يُسكت عنه');
});

test('★★★ والمجهولُ يمرّ صامتًا — لا نحرس ولا نمنع ولا نكتب رسالةً عمّا نجهل', () => {
  for (const t of ['NOPE', '', null, undefined, 42, {}]) {
    assert.equal(stageOwnerLine(t, 'approve'), '', `«${String(t)}» يجب أن يمرّ صامتًا`);
    const owners = stageOwnersFor(t);
    assert.equal(owners.known, false);
    assert.deepEqual(owners.approve, []);
    assert.match(owners.absence.approve, /لا يعرفه محرّكُ المستندات/);
  }
  // ومرحلةٌ لا وجودَ لها لا تُخترع لها رسالة.
  assert.equal(stageOwnerLine('PUTAWAY', 'no_such_stage'), '');
  assert.equal(stageOwnerLine('PUTAWAY', ''), '');
  assert.equal(stageOwnerLine('PUTAWAY', 'labels'), '', 'مفتاحٌ في الكائن وليس مرحلة');
});

test('★ وما تُعيده الدالّةُ نسخةٌ — تعديلُه لا يُفسد مخطّطَ النوع', () => {
  const a = stageOwnersFor('PUTAWAY');
  a.approve.push('viewer');
  a.labels.approve = 'مُحرَّف';
  const b = stageOwnersFor('PUTAWAY');
  assert.equal(b.approve.includes('viewer'), false, 'المخطّطُ تسرّب بالإحالة');
  assert.equal(b.labels.approve, STAGE_LABELS.approve);
});

/* ═══════════════ ⑤ ★★★ من ينتظره الآن ═══════════════ */

const doc = (over = {}) => ({ type: 'PUTAWAY', state: 'draft', ...over });

test('★★★ المسوّدةُ تنتظر صاحبَها بالاسم إن عُرف', () => {
  const r = nextOwnerOf(doc({ createdByName: 'محمد البرشي' }));
  assert.equal(r.stage, 'create');
  assert.equal(r.person, 'محمد البرشي');
  assert.equal(r.waiting, true);
  assert.equal(r.line, 'ينتظر إرساله للاعتماد من: محمد البرشي');
  // ولا يُسرد معه دورٌ: القاعدةُ تقصر الإرسال على `isCreator()` وحدَه.
  assert.equal(r.line.includes('أمين المخزن'), false);
});

test('★ ومسوّدةٌ بلا اسمٍ تنتظر أصحابَ الإنشاء بأدوارهم', () => {
  const r = nextOwnerOf(doc());
  assert.equal(r.person, '');
  assert.equal(r.line, 'ينتظر إرساله للاعتماد من: أمين المخزن · مدير المستودع');
  assert.deepEqual(r.roles, stageOwnersFor('PUTAWAY').create);
});

test('★ والمردودُ يعود إلى صاحبه — كالمسوّدة في القاعدة سواء', () => {
  const r = nextOwnerOf(doc({ state: 'rejected', createdByName: 'محمد البرشي' }));
  assert.equal(r.stage, 'create');
  assert.equal(r.line, 'رُدَّ إلى صاحبه: محمد البرشي');
});

test('★★ والمُرسَلُ ينتظر معتمِديه', () => {
  const r = nextOwnerOf(doc({ state: 'submitted' }));
  assert.equal(r.stage, 'approve');
  assert.equal(r.line, 'ينتظر اعتماد: مدير المستودع · مدقّق الجرد');
  assert.equal(r.person, '', 'الاعتمادُ لأدوارٍ لا لشخصٍ بعينه');
});

test('★★★ والمعتمَدُ ينتظر منفّذيه الميدانيّين — وهذا أنفعُ ما يُخرجه', () => {
  const r = nextOwnerOf(doc({ state: 'approved' }));
  assert.equal(r.stage, 'execute');
  assert.match(r.line, /^ينتظر تنفيذه ميدانيًّا: /);
  assert.ok(r.names.includes('مشرف المناولة'));
});

test('★★ ومعتمَدٌ بلا شاشةٍ ميدانيّةٍ يسقط إلى الإنجاز — بنصّ القاعدة لا باجتهاد', () => {
  const r = nextOwnerOf({ type: 'GRN', state: 'approved' });
  assert.equal(r.stage, 'complete', 'GRN لا يُوجَّه إلى شاشةٍ ميدانيّة');
  assert.equal(r.line, 'ينتظر إنجازه: أمين المخزن · مدير المستودع');
  assert.deepEqual(r.roles, stageOwnersFor('GRN').complete);
});

test('★ والمنجَزُ ينتظر إغلاقه ممّن يملك إنجازه', () => {
  const r = nextOwnerOf(doc({ state: 'done' }));
  assert.equal(r.stage, 'complete');
  assert.equal(r.line, 'ينتظر إغلاقه: أمين المخزن · مدير المستودع');
});

test('★★ والمنتهيان لا ينتظران أحدًا — واسمُ الحالة من states.js لا مكتوبًا هنا', () => {
  for (const state of ['closed', 'canceled']) {
    const r = nextOwnerOf(doc({ state }));
    assert.equal(r.known, true);
    assert.equal(r.waiting, false);
    assert.deepEqual(r.roles, []);
    assert.equal(r.line, `${STATES[state].label} — لا ينتظر أحدًا.`);
  }
});

test('★★★ ومستندٌ مجهولُ النوعِ أو الحالةِ يمرّ صامتًا — لا «لا ينتظر أحدًا» عمّا نجهل', () => {
  for (const d of [null, undefined, {}, { type: 'NOPE', state: 'draft' }, doc({ state: 'zzz' })]) {
    const r = nextOwnerOf(d);
    assert.equal(r.known, false, `«${JSON.stringify(d)}» ادّعى معرفة`);
    assert.equal(r.waiting, false);
    assert.equal(r.line, '', 'خبرٌ نجهله لا يُقال');
    assert.deepEqual(r.roles, []);
  }
});

test('★ وكلُّ حالةٍ في states.js لها جوابٌ — فلا حالةَ تُسكت الوحدة', () => {
  for (const state of Object.keys(STATES)) {
    const r = nextOwnerOf(doc({ state }));
    assert.equal(r.known, true, `الحالةُ «${state}» في STATES ولا تعرفها الوحدة`);
    assert.notEqual(r.line, '', `الحالةُ «${state}» بلا سطرٍ يُعرض`);
  }
});

test('★ وترتيبُ العرض ترتيبُ الرحلة: التنفيذُ قبل الإنجاز', () => {
  assert.deepEqual(STAGES, ['create', 'approve', 'execute', 'complete']);
  for (const stage of STAGES) assert.ok(STAGE_LABELS[stage], `«${stage}» بلا فعلٍ معروض`);
  assert.deepEqual(Object.keys(STAGE_LABELS).sort(), [...STAGES].sort());
});
