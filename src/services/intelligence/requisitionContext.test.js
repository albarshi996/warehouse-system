/**
 * حارس سياق طلب الشراء وأولويّته ‹FNB-601 · FNB-602›.
 *
 * أخطر ما يحرسه: **طلبٌ بلا سياقٍ لا يُرسَل** (يمنع لا ينبّه — نصّ المستند
 * يرفض «مطلوب ١٠٠٠ كجم دجاج»)، و**الأولويّة تُحسب فتتغيّر بتغيّر الواقع**
 * لا تُختار فتجمد، و**التصعيد اليدويّ يحتاج سببًا** باسم صاحبه.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PR_PRIORITY, CONTEXT_FIELDS, buildRequisitionLine, priorityOfNeed,
  requisitionSendVerdict, rankRequisitionLines, escalate,
} from './requisitionContext.js';
import { indexRecipes } from '../items/recipe.js';
import { indexLocations } from '../org/orgLocations.js';

const ITEMS = new Map([
  ['CHICKEN', { sku: 'CHICKEN', baseUom: 'KG' }],
  ['BURGER', { sku: 'BURGER', baseUom: 'PCS' }],
]);
const RECIPES = indexRecipes([{
  outputSku: 'BURGER', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1,
  lines: [{ sku: 'CHICKEN', qty: 150, uom: 'G' }],
}]);
const TREE = indexLocations([
  { code: 'FNB', nameAr: 'قطاع', level: 'sector' },
  { code: 'BRD1', nameAr: 'براند', level: 'brand', parentCode: 'FNB' },
  { code: 'BR01', nameAr: 'فرع ١', level: 'branch', parentCode: 'BRD1' },
  { code: 'BR02', nameAr: 'فرع ٢', level: 'branch', parentCode: 'BRD1' },
]);
const MENUS = new Map([['BR01', ['BURGER']], ['BR02', ['BURGER']]]);

test('الحقول العشرة معلَنةٌ بمصدر كلٍّ منها — سجلٌّ يُقرأ بلا فتح الكود', () => {
  assert.equal(CONTEXT_FIELDS.length, 10);
  for (const f of CONTEXT_FIELDS) assert.ok(f.labelAr && f.source, `الحقل «${f.key}» بلا مصدر`);
  assert.equal(Object.keys(PR_PRIORITY).length, 4);
});

test('★★ الحقول محسوبةٌ لا مكتوبة — والنفاد وتاريخ الاحتياج مشتقّان', () => {
  // ٥٠ في اليد و٢٥ بالطريق ومعدّلٌ ٥ ⇒ يكفي ١٥ يومًا.
  const line = buildRequisitionLine(
    { sku: 'CHICKEN', qty: 200 },
    { onHand: 50, inTransit: 25, rate: 5, leadDays: 7, today: '2026-08-18', recipes: RECIPES, itemsBySku: ITEMS, branchMenus: MENUS, orgIndex: TREE }
  );
  assert.equal(line.daysLeft, 15);
  assert.equal(line.stockoutDate, '2026-09-02', 'تاريخ النفاد محسوب');
  assert.equal(line.requiredDate, '2026-08-26', 'وتاريخ الاحتياج قبله بمهلة التوريد');
  // وأثر النقص من الوصفة والشجرة — لا يُكتب بيد.
  assert.deepEqual(line.branches.sort(), ['BR01', 'BR02']);
  assert.deepEqual(line.brands, ['BRD1']);
  assert.deepEqual(line.menuItems, ['BURGER']);
  assert.match(line.why, /فرعًا/);
});

test('★ «بالطريق» تؤجّل النفاد ولا تُلغيه', () => {
  const base = { onHand: 10, rate: 5, leadDays: 7, today: '2026-08-18' };
  const without = buildRequisitionLine({ sku: 'CHICKEN', qty: 100 }, base);
  const withTransit = buildRequisitionLine({ sku: 'CHICKEN', qty: 100 }, { ...base, inTransit: 40 });
  assert.equal(without.daysLeft, 2);
  assert.equal(withTransit.daysLeft, 10);
  assert.ok(withTransit.stockoutDate > without.stockoutDate);
});

test('★★ الأولويّة تُحسب: نفدٌ قبل وصول التوريد = حرج، والبديل يخفّفها درجةً', () => {
  assert.equal(priorityOfNeed({ daysLeft: 0, leadDays: 7 }).id, 'CRITICAL');
  assert.equal(priorityOfNeed({ daysLeft: 3, leadDays: 7 }).id, 'CRITICAL');
  // وبديلٌ معرَّف يجعلها عاجلةً لا حرجة — لا يُلغي الإلحاح بل يخفّفه.
  assert.equal(priorityOfNeed({ daysLeft: 3, leadDays: 7, hasAlternative: true }).id, 'URGENT');
  assert.equal(priorityOfNeed({ daysLeft: 10, leadDays: 7 }).id, 'URGENT');
  assert.equal(priorityOfNeed({ daysLeft: 20, leadDays: 7 }).id, 'NORMAL');
  assert.equal(priorityOfNeed({ daysLeft: 60, leadDays: 7 }).id, 'PLANNED');
});

test('★ وعشرة فروعٍ متأثّرة ترفع الدرجة ولو بعُد النفاد', () => {
  const few = priorityOfNeed({ daysLeft: 12, leadDays: 7, branchCount: 1 });
  const many = priorityOfNeed({ daysLeft: 12, leadDays: 7, branchCount: 10 });
  assert.equal(few.id, 'URGENT');
  assert.equal(many.id, 'URGENT');
  // والفرق يظهر حين يبعد النفاد: عشرةٌ تُبقيه عاجلًا وواحدٌ يُنزله.
  assert.equal(priorityOfNeed({ daysLeft: 20, leadDays: 7, branchCount: 1 }).id, 'NORMAL');
  assert.equal(priorityOfNeed({ daysLeft: 20, leadDays: 7, branchCount: 10 }).id, 'URGENT');
});

test('وبلا تاريخٍ كافٍ لا يُخمَّن إلحاح — «مخطَّط» حتّى يُعرف الواقع', () => {
  const v = priorityOfNeed({ daysLeft: null });
  assert.equal(v.id, 'PLANNED');
  assert.match(v.why, /لا تاريخ استهلاكٍ كافٍ/);
});

test('★★ طلبٌ بلا سياقٍ لا يُرسَل — يمنع لا ينبّه، والناقص يُسمّى', () => {
  // «مطلوب ١٠٠٠ كجم دجاج» وحدها — مرفوضة.
  const bare = requisitionSendVerdict([{ sku: 'CHICKEN', qty: 1000 }]);
  assert.equal(bare.ok, false);
  assert.match(bare.problems[0], /ينقصه/);
  assert.match(bare.problems[0], /المخزون الحالي/);
  assert.match(bare.problems[0], /لا يُرسَل/);

  // والكامل يمرّ.
  const full = buildRequisitionLine({ sku: 'CHICKEN', qty: 200 }, { onHand: 50, rate: 5, leadDays: 7, today: '2026-08-18' });
  assert.equal(requisitionSendVerdict([full]).ok, true);
  assert.equal(requisitionSendVerdict([]).ok, false);
});

test('الترتيب بالإلحاح المحسوب — الأشدّ أوّلًا', () => {
  const rows = [
    { sku: 'A', priority: 'NORMAL', daysLeft: 20 },
    { sku: 'B', priority: 'CRITICAL', daysLeft: 1 },
    { sku: 'C', priority: 'URGENT', daysLeft: 5 },
  ];
  assert.deepEqual(rankRequisitionLines(rows).map((r) => r.sku), ['B', 'C', 'A']);
});

test('★ التصعيد اليدويّ يحتاج سببًا باسم صاحبه — والمحسوب يبقى مذكورًا', () => {
  const line = { sku: 'CHICKEN', priority: 'NORMAL' };
  assert.equal(escalate(line, { to: 'CRITICAL', by: 'المدير' }).ok, false, 'مرّ تصعيدٌ بلا سبب');
  assert.equal(escalate(line, { to: 'مخترَعة', by: 'x', reason: 'y' }).ok, false);

  const up = escalate(line, { to: 'CRITICAL', by: 'محمد', reason: 'وعدُ افتتاحٍ الأسبوع القادم' });
  assert.equal(up.ok, true);
  assert.equal(up.line.priority, 'CRITICAL');
  assert.equal(up.line.manualPriority.by, 'محمد');
  assert.match(up.line.priorityWhy, /المحسوب كان عادي/, 'المحسوب يبقى مذكورًا فيُراجَع التجاوز');
});
