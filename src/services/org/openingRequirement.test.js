/**
 * حارس شدّة الافتتاح ‹FNB-204›.
 *
 * أخطر ما يحرسه: **لا كمّيّةَ بلا مرجع** (كلّ رقمٍ يحمل مصدره، والمجهول
 * يبقى صفرًا معلَنًا لا يُخمَّن)، و**الشدّة طلبُ نقلٍ يُولَّد لا مستندٌ
 * جديد**، و**الانتقال حدثٌ لا حذف** — الماضي لا يُلغى.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpeningRequirement, toTransferRequest, copyOpeningFrom,
  transitionVerdict, STATE_TRANSITIONS, servedBy, QTY_SOURCES,
} from './openingRequirement.js';
import { shapeBranchProfile } from './branchProfile.js';
import { indexPolicies } from '../intelligence/stockPolicy.js';
import { indexRecipes } from '../items/recipe.js';
import { getSchema } from '../documents/schemas/index.js';

const ITEMS = new Map([
  ['CHICKEN', { sku: 'CHICKEN', baseUom: 'KG' }],
  ['BUN', { sku: 'BUN', baseUom: 'PCS' }],
  ['BURGER', { sku: 'BURGER', baseUom: 'PCS' }],
]);

const RECIPES = indexRecipes([{
  outputSku: 'BURGER', version: 1, effectiveFrom: '2026-01-01', yieldQty: 1,
  lines: [{ sku: 'CHICKEN', qty: 150, uom: 'G' }, { sku: 'BUN', qty: 1, uom: 'PCS' }],
}]);

const DIMS = { branch: 'BR01', brand: 'BRD1', sector: 'FNB' };

const branchWith = (profile) => ({
  code: 'BR01', level: 'branch', profile: shapeBranchProfile(profile),
});

test('فرعٌ بلا ملفٍّ لا تُولَّد له شدّةٌ صامتة — يُعلَن السبب', () => {
  const r = buildOpeningRequirement({ code: 'BR01', level: 'branch' });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('لا ملفّ تشغيليّ')));
  assert.deepEqual(r.lines, []);
});

test('★ الكمّيّة من Par Level حين وُجد — والسطر يحمل مصدره', () => {
  const policies = indexPolicies([{ scope: 'branch', scopeCode: 'BR01', sku: 'CHICKEN', parLevel: 120 }]);
  const r = buildOpeningRequirement(
    branchWith({ concept: 'qsr', allowedSkus: ['CHICKEN'], coversPerDay: 300 }),
    { policies, dims: DIMS, recipes: RECIPES, itemsBySku: ITEMS }
  );
  assert.equal(r.ok, true);
  const line = r.lines.find((l) => l.sku === 'CHICKEN');
  assert.equal(line.qty, 120);
  assert.equal(line.source, 'par');
  assert.match(line.why, /Par Level 120/);
  assert.match(line.why, /سياسة branch/);
});

test('★ وإن غاب السقف تُحسب من الطاقة والوصفة — بمرجعها كاملًا', () => {
  // برجر: ١٥٠غ دجاج للوجبة ⇒ ٠٫١٥ كجم × ٣٠٠ وجبة × ٧ أيّام = ٣١٥ كجم.
  const r = buildOpeningRequirement(
    branchWith({ concept: 'qsr', menuSkus: ['BURGER'], coversPerDay: 300 }),
    { policies: indexPolicies([]), dims: DIMS, recipes: RECIPES, itemsBySku: ITEMS, coverDays: 7 }
  );
  assert.equal(r.ok, true);
  const chicken = r.lines.find((l) => l.sku === 'CHICKEN');
  assert.equal(chicken.source, 'capacity');
  assert.equal(chicken.qty, 315);
  assert.match(chicken.why, /300 وجبة\/يوم/);
  assert.equal(r.lines.find((l) => l.sku === 'BUN').qty, 2100); // حبّةٌ لكلّ وجبة.
});

test('★★ لا كمّيّةَ بلا مرجع: المجهول يبقى صفرًا معلَنًا ولا يُخمَّن', () => {
  const r = buildOpeningRequirement(
    branchWith({ concept: 'cafe', allowedSkus: ['CHICKEN'], coversPerDay: 0 }),
    { policies: indexPolicies([]), dims: DIMS, recipes: RECIPES, itemsBySku: ITEMS }
  );
  const line = r.lines[0];
  assert.equal(line.qty, 0);
  assert.equal(line.source, 'none');
  assert.ok(r.warnings.some((w) => w.includes('بلا مصدرِ كمّيّة')));
  assert.ok(r.warnings.some((w) => w.includes('تُدخَل يدويًّا')));
  // وكلّ سطرٍ يحمل مصدرًا معرَّفًا في السجلّ.
  for (const l of r.lines) assert.ok(QTY_SOURCES[l.source], `مصدرٌ غير معرَّف: ${l.source}`);
});

test('★ الشدّة طلبُ نقلٍ يُولَّد — لا مستندٌ جديد يضاعف السلسلة', () => {
  const r = buildOpeningRequirement(
    branchWith({ concept: 'qsr', menuSkus: ['BURGER'], coversPerDay: 100 }),
    { policies: indexPolicies([]), dims: DIMS, recipes: RECIPES, itemsBySku: ITEMS }
  );
  const tr = toTransferRequest(r, { fromWarehouse: 'MAIN', requestDate: '2026-09-01' });
  assert.equal(tr.type, 'TR');
  assert.ok(getSchema('TR'), 'الشدّة تستعمل مستندًا مبنيًّا لا مخترَعًا');
  assert.equal(tr.header.toWarehouse, 'BR01');
  assert.equal(tr.header.costCenter, 'BR01'); // الصرف على الفرع المستفيد (FNB-103).
  assert.ok(tr.lines.length > 0);
  assert.ok(tr.lines.every((l) => l.notes), 'كلّ بندٍ يحمل مرجع كمّيّته للمراجع');
});

test('نسخُ الشدّة بين فرعَي المفهوم نفسه — ويُرفض عبر المفاهيم', () => {
  const cafe1 = branchWith({ concept: 'cafe', allowedSkus: ['COFFEE'], menuSkus: ['LATTE'] });
  const cafe2 = branchWith({ concept: 'cafe' });
  const bakery = branchWith({ concept: 'bakery' });
  const ok = copyOpeningFrom(cafe1, cafe2);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.skus, ['COFFEE', 'LATTE']);
  const bad = copyOpeningFrom(cafe1, bakery);
  assert.equal(bad.ok, false);
  assert.match(bad.problem, /مفهومٍ لا تصلح لآخر/);
  // وبلا مفهومٍ محدَّد لا يُنسخ بالتخمين.
  assert.equal(copyOpeningFrom(cafe1, branchWith({})).ok, false);
});

test('★ الانتقال حدثٌ محكوم: الماضي لا يُلغى، والتشغيل لا يسبق تاريخه', () => {
  assert.equal(transitionVerdict('planned', 'opening').ok, true);
  assert.equal(transitionVerdict('opening', 'operating', branchWith({ openingDate: '2026-09-01' })).ok, true);
  // الرجوع إلى «قيد التجهيز» ممنوع — الماضي لا يُلغى.
  assert.equal(transitionVerdict('operating', 'planned').ok, false);
  assert.match(transitionVerdict('operating', 'planned').problem, /الماضي لا يُلغى/);
  // والموقوف يُعاد تشغيلًا.
  assert.equal(transitionVerdict('suspended', 'operating', branchWith({ openingDate: '2026-01-01' })).ok, true);
  // ولا تشغيلَ مستمرّ بلا تاريخ افتتاح.
  const noDate = transitionVerdict('opening', 'operating', branchWith({}));
  assert.equal(noDate.ok, false);
  assert.match(noDate.problem, /بلا تاريخ افتتاح/);
  assert.equal(transitionVerdict('opening', 'opening').ok, false);
  assert.ok(STATE_TRANSITIONS.planned.includes('opening'));
});

test('من يُخدَم بالمقترح ومن بالشدّة — بحالة الفرع لا بتاريخه', () => {
  assert.equal(servedBy(branchWith({ state: 'opening', openingDate: '2026-09-01' })), 'opening');
  assert.equal(servedBy(branchWith({ state: 'operating', openingDate: '2026-09-01' })), 'replenishment');
  assert.equal(servedBy(branchWith({ state: 'suspended' })), 'opening');
  assert.equal(servedBy({}), 'opening'); // ما لم يُفتح لا يُقترح له.
});
