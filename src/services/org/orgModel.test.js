/**
 * اختبارات منطق الهيكل التنظيمي الخالص:
 *   - المصدر الحقيقي (org-structure.json) صالح ومترابط: لا معرّف مكرّر،
 *     وكل بطاقة وصف مربوطة بعقدة موجودة فعلًا.
 *   - التعديلات لا تُفسد الشجرة: المعرّف المكرّر مرفوض، والجذر لا يُحذف
 *     ولا يُنقل، والعقدة لا تُنقل داخل فرعها (وهو ما يقطع الشجرة صامتًا).
 *   - المقارنة قبل/بعد ترصد الأربعة: إضافة · حذف · إعادة تسمية · نقل.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NODE_TYPES,
  flatten,
  findNode,
  pathTo,
  descendantIds,
  countByType,
  proposedCount,
  validateTree,
  updateNode,
  addChild,
  removeNode,
  moveNode,
  reorderNode,
  diffTrees,
  hasChanges,
  jobsOfNode,
  pagesOfBranch,
} from './orgModel.js';

const SOURCE = JSON.parse(
  readFileSync(new URL('../../data/org-structure.json', import.meta.url), 'utf8')
);

/** شجرة صغيرة مستقلة عن المصدر — لئلّا تكسر تعديلاتُ المالك الاختبارات. */
function sample() {
  return {
    id: 'root',
    title: 'الإدارة العليا',
    type: 'management',
    children: [
      {
        id: 'a',
        title: 'قسم أ',
        type: 'section',
        children: [{ id: 'a1', title: 'وحدة أ-1', type: 'unit', children: [] }],
      },
      { id: 'b', title: 'قسم ب', type: 'section', source: 'proposed', children: [] },
    ],
  };
}

// ═══════════ المصدر الحقيقي ═══════════

test('ملف الهيكل المصدر صالح — لا معرّف مكرّر ولا عقدة بلا مسمّى', () => {
  const verdict = validateTree(SOURCE.tree);
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
});

test('الهيكل الجديد: إدارتان عُليا والباقي أقسام ووحدات', () => {
  const counts = countByType(SOURCE.tree);
  assert.equal(counts.management, 2, 'الإدارتان العليا فقط');
  assert.equal(SOURCE.tree.title, 'إدارة السلاسل والإمداد والمخازن');
  const second = SOURCE.tree.children.find((c) => c.type === 'management');
  assert.equal(second.title, 'إدارة الخدمات اللوجستية والخدمية');
  assert.ok(counts.section > 0 && counts.unit > 0);
});

test('كل بطاقة وصف مربوطة بعقدة موجودة في الشجرة أو الوظائف المساندة', () => {
  const ids = new Set(flatten(SOURCE.tree).map((r) => r.node.id));
  SOURCE.supportFunctions.forEach((s) => ids.add(s.id));
  const orphans = SOURCE.jobs.filter((j) => !ids.has(j.orgId)).map((j) => `${j.id} → ${j.orgId}`);
  assert.deepEqual(orphans, []);
});

test('بطاقات الوصف لم تُفقد بالترحيل — 36 بطاقة بمعرّفات فريدة', () => {
  assert.equal(SOURCE.jobs.length, 36);
  assert.equal(new Set(SOURCE.jobs.map((j) => j.id)).size, 36);
  assert.ok(SOURCE.jobs.every((j) => j.title && j.duties.length > 0));
});

test('المنصبان المشغولان يحملان اسمَي شاغلَيهما', () => {
  const held = SOURCE.jobs.filter((j) => j.holder);
  assert.equal(held.length, 2);
  assert.ok(held.every((j) => j.occupied));
  assert.deepEqual(
    held.map((j) => j.holder).sort(),
    ['رمزي الباش', 'محمد البرشي']
  );
});

test('العقد المقترحة معلَّمة صراحةً — يراها المالك ويقرّرها', () => {
  assert.ok(proposedCount(SOURCE.tree) > 0);
  const proposed = flatten(SOURCE.tree).filter((r) => r.node.source === 'proposed');
  assert.ok(proposed.every((r) => r.node.title));
});

// ═══════════ التسطيح والبحث ═══════════

test('التسطيح يحفظ ترتيب العرض ويحسب العمق والمسار', () => {
  const rows = flatten(sample());
  assert.deepEqual(
    rows.map((r) => r.node.id),
    ['root', 'a', 'a1', 'b']
  );
  assert.deepEqual(
    rows.map((r) => r.depth),
    [0, 1, 2, 1]
  );
  assert.deepEqual(pathTo(sample(), 'a1'), ['الإدارة العليا', 'قسم أ', 'وحدة أ-1']);
  assert.equal(findNode(sample(), 'مجهول'), null);
});

test('الأحفاد تشمل العقدة نفسها — أساس منع النقل داخل الذات', () => {
  assert.deepEqual(descendantIds(sample(), 'a'), ['a', 'a1']);
});

// ═══════════ التعديل الآمن ═══════════

test('التعديل لا يمسّ الشجرة الأصلية (نسخة جديدة دائمًا)', () => {
  const before = sample();
  const after = updateNode(before, 'a', { title: 'قسم أ المعدّل', holder: 'فلان' });
  assert.equal(before.children[0].title, 'قسم أ', 'الأصل لم يتغيّر');
  assert.equal(findNode(after, 'a').title, 'قسم أ المعدّل');
  assert.equal(findNode(after, 'a').holder, 'فلان');
});

test('الإضافة ترفض المعرّف المكرّر والأب المجهول', () => {
  assert.throws(() => addChild(sample(), 'root', { id: 'a', title: 'مكرّر' }), /مستخدم بالفعل/);
  assert.throws(() => addChild(sample(), 'مجهول', { id: 'z', title: 'جديد' }), /غير موجود/);
  const t = addChild(sample(), 'a', { id: 'a2', title: 'وحدة أ-2', type: 'unit' });
  assert.equal(findNode(t, 'a2').source, 'proposed', 'المضاف يدويًّا يُعلَّم مقترحًا');
  assert.equal(countByType(t).total, 5);
});

test('الحذف يزيل الفرع كاملًا، والجذر محميّ', () => {
  const t = removeNode(sample(), 'a');
  assert.equal(findNode(t, 'a'), null);
  assert.equal(findNode(t, 'a1'), null, 'الأحفاد ذهبوا مع أبيهم');
  assert.throws(() => removeNode(sample(), 'root'), /لا يمكن حذف جذر/);
  assert.throws(() => removeNode(sample(), 'مجهول'), /غير موجودة/);
});

test('النقل داخل الفرع نفسه مرفوض — وإلّا انقطعت الشجرة صامتة', () => {
  assert.throws(() => moveNode(sample(), 'a', 'a1'), /داخل نفسها أو أحد فروعها/);
  assert.throws(() => moveNode(sample(), 'a', 'a'), /داخل نفسها أو أحد فروعها/);
  assert.throws(() => moveNode(sample(), 'root', 'a'), /لا يمكن نقل جذر/);
});

test('النقل الصحيح ينقل العقدة بأحفادها ولا يفقد أحدًا', () => {
  const t = moveNode(sample(), 'a', 'b');
  assert.equal(countByType(t).total, countByType(sample()).total);
  assert.deepEqual(pathTo(t, 'a1'), ['الإدارة العليا', 'قسم ب', 'قسم أ', 'وحدة أ-1']);
  assert.deepEqual(validateTree(t).problems, []);
});

test('الترتيب بين الإخوة يتحرّك، ويتوقّف عند الطرف بلا انهيار', () => {
  const t = reorderNode(sample(), 'b', -1);
  assert.deepEqual(
    t.children.map((c) => c.id),
    ['b', 'a']
  );
  const same = reorderNode(sample(), 'a', -1);
  assert.deepEqual(
    same.children.map((c) => c.id),
    ['a', 'b'],
    'خارج الحدود = لا تغيير'
  );
  assert.throws(() => reorderNode(sample(), 'root', 1), /لا يمكن ترتيب الجذر/);
});

// ═══════════ التحقّق ═══════════

test('التحقق يصطاد المعرّف المكرّر والمسمّى الفارغ والنوع المجهول', () => {
  const bad = sample();
  bad.children[1].id = 'a';
  bad.children[0].children[0].title = '   ';
  bad.children[1].type = 'حاجة';
  const v = validateTree(bad);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes('معرّف مكرّر')));
  assert.ok(v.problems.some((p) => p.includes('بلا مسمّى')));
  assert.ok(v.problems.some((p) => p.includes('نوع غير معروف')));
});

test('كل الأنواع المستخدمة في المصدر معروفة', () => {
  const used = new Set(flatten(SOURCE.tree).map((r) => r.node.type));
  for (const t of used) assert.ok(NODE_TYPES.includes(t), `نوع غير معروف: ${t}`);
});

// ═══════════ قبل/بعد ═══════════

test('المقارنة ترصد الإضافة والحذف وإعادة التسمية والنقل', () => {
  const before = sample();
  let after = updateNode(before, 'a', { title: 'قسم أ الجديد' });
  after = addChild(after, 'root', { id: 'c', title: 'قسم ج', type: 'section' });
  after = moveNode(after, 'a1', 'b');
  after = removeNode(after, 'c');
  after = addChild(after, 'b', { id: 'd', title: 'وحدة د', type: 'unit' });

  const d = diffTrees(before, after);
  assert.deepEqual(d.renamed, [{ id: 'a', from: 'قسم أ', to: 'قسم أ الجديد' }]);
  assert.deepEqual(
    d.added.map((x) => x.id),
    ['d']
  );
  assert.deepEqual(d.removed, []);
  assert.equal(d.moved.length, 1);
  assert.equal(d.moved[0].id, 'a1');
  assert.equal(d.moved[0].to, 'الإدارة العليا ← قسم ب');
  assert.equal(hasChanges(d), true);
});

test('شجرتان متطابقتان = لا فروق', () => {
  assert.equal(hasChanges(diffTrees(sample(), sample())), false);
  assert.equal(hasChanges(diffTrees(SOURCE.tree, SOURCE.tree)), false);
});

// ═══════════ الربط بالنظام الحيّ ═══════════

test('صفحات الفرع تُجمع بلا تكرار من العقدة وكل ما تحتها', () => {
  const pages = pagesOfBranch(SOURCE.tree, 'mgmt-logistics');
  assert.ok(pages.includes('/dashboard/fleet-operations'));
  assert.ok(pages.includes('/dashboard/maintenance-center'));
  assert.equal(new Set(pages).size, pages.length, 'بلا تكرار');
  assert.deepEqual(pagesOfBranch(SOURCE.tree, 'مجهول'), []);
});

test('بطاقات الوصف تُستدعى بعقدتها', () => {
  const rootJobs = jobsOfNode(SOURCE.jobs, 'root');
  assert.equal(rootJobs.length, 1);
  assert.equal(rootJobs[0].title, 'مدير إدارة السلاسل والإمداد والمخازن');
  assert.equal(rootJobs[0].formerTitle, 'مدير المستودع التنفيذي');
  assert.deepEqual(jobsOfNode(SOURCE.jobs, 'لا-أحد'), []);
});
