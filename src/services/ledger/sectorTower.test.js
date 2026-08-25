/**
 * حارس برج مراقبة القطاع ‹FNB-801 · FNB-802›.
 *
 * أخطر ما يحرسه: **الرقم في الأعلى = مجموع ما تحته حرفيًّا** (وتجميعٌ لا
 * يتوازن رقمٌ لا يُصدَّق)، و**كلّ نوعٍ مذكورٍ في الفئات مبنيٌّ فعلًا** فلا
 * تَعِد اللوحة بما لا وجود له، و**لا استثناء يسقط من العرض بلا تصنيف**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWER_LEVELS, TOWER_CATEGORIES, nextLevel, categoryOfType,
  categoryCoverage, towerView, towerBalance, drillInto,
} from './sectorTower.js';
import { EXCEPTION_TYPES } from './exceptions.js';
import { indexLocations } from '../org/orgLocations.js';

const ORG = indexLocations([
  { code: 'FNB', nameAr: 'قطاع', level: 'sector' },
  { code: 'BRD1', nameAr: 'براند أ', level: 'brand', parentCode: 'FNB' },
  { code: 'BRD2', nameAr: 'براند ب', level: 'brand', parentCode: 'FNB' },
  { code: 'BR01', nameAr: 'فرع ١', level: 'branch', parentCode: 'BRD1' },
  { code: 'BR02', nameAr: 'فرع ٢', level: 'branch', parentCode: 'BRD1' },
  { code: 'BR03', nameAr: 'فرع ٣', level: 'branch', parentCode: 'BRD2' },
]);

const EXC = [
  { type: 'below_min', location: 'BR01', sku: 'CHICKEN', docRef: { number: 'D-1' } },
  { type: 'near_expiry', location: 'BR01', sku: 'SAUCE', docRef: { number: 'D-2' } },
  { type: 'consumption_variance', location: 'BR02', sku: 'CHICKEN', docRef: { number: 'D-3' } },
  { type: 'production_delay', location: 'BR03', sku: 'SAUCE', docRef: { number: 'D-4' } },
];

test('★ النزول خماسيٌّ بالترتيب — والمستند نهاية الطريق', () => {
  assert.deepEqual(TOWER_LEVELS.map((l) => l.id), ['sector', 'brand', 'branch', 'item', 'document']);
  assert.equal(nextLevel('sector'), 'brand');
  assert.equal(nextLevel('branch'), 'item');
  assert.equal(nextLevel('document'), null, 'المستند لا يُفتح إلى شيء');
});

test('★★ الرقم في الأعلى = مجموع ما تحته حرفيًّا', () => {
  const balance = towerBalance(EXC, ORG);
  assert.equal(balance.ok, true, balance.problems.join(' · '));
  assert.equal(balance.total, 4);

  const sector = towerView(EXC, ORG, { level: 'sector' });
  assert.equal(sector.rows.find((r) => r.key === 'FNB').count, 4);
  const brand = towerView(EXC, ORG, { level: 'brand' });
  assert.equal(brand.rows.find((r) => r.key === 'BRD1').count, 3);
  assert.equal(brand.rows.find((r) => r.key === 'BRD2').count, 1);
});

test('★★ النزول يُرشِّح بالأب — براندٌ لا يعرض فروع غيره', () => {
  const inBrand1 = drillInto(EXC, ORG, { level: 'brand', key: 'BRD1' });
  assert.equal(inBrand1.leaf, false);
  assert.equal(inBrand1.level, 'branch');
  assert.deepEqual(inBrand1.rows.map((r) => r.key).sort(), ['BR01', 'BR02']);
  assert.ok(!inBrand1.rows.some((r) => r.key === 'BR03'), 'تسرّب فرعُ براندٍ آخر');
});

test('★ والنزول إلى المستند يُخرج المستندات نفسها لا تجميعًا فوقها', () => {
  const leaf = drillInto(EXC, ORG, { level: 'document', key: 'D-1' });
  assert.equal(leaf.leaf, true);
  assert.equal(leaf.items.length, 1);
  assert.equal(leaf.items[0].sku, 'CHICKEN');
});

test('★★ الطريقُ الخماسيّ يصل آخره — الفرعُ يُفتح إلى الصنف والصنفُ إلى المستند', () => {
  // كان النزول ينقطع هنا صامتًا: مفتاحُ الصنف ليس موقعًا في الشجرة، والترشيح
  // بالنسب وحده لا يطابقه أبدًا — فتعود المستنداتُ فارغةً ويبدو أن لا خلل.
  const items = drillInto(EXC, ORG, { level: 'branch', key: 'BR01', path: [{ level: 'brand', key: 'BRD1' }] });
  assert.equal(items.level, 'item');
  assert.deepEqual(items.rows.map((r) => r.key).sort(), ['CHICKEN', 'SAUCE']);

  const docs = drillInto(EXC, ORG, {
    level: 'item',
    key: 'CHICKEN',
    path: [{ level: 'brand', key: 'BRD1' }, { level: 'branch', key: 'BR01' }],
  });
  assert.equal(docs.level, 'document');
  assert.deepEqual(docs.rows.map((r) => r.key), ['D-1']);
});

test('★★ وكلُّ شرطٍ سبق يبقى قائمًا — صنفٌ داخل فرعٍ لا يجرّ مستنداتِه من فروع غيره', () => {
  // CHICKEN موجودٌ في BR01 (D-1) وفي BR02 (D-3). والنزول من BR01 لا يرى D-3.
  const docs = drillInto(EXC, ORG, {
    level: 'item',
    key: 'CHICKEN',
    path: [{ level: 'branch', key: 'BR01' }],
  });
  assert.deepEqual(docs.rows.map((r) => r.key), ['D-1']);
  assert.ok(!docs.rows.some((r) => r.key === 'D-3'), 'تسرّب مستندُ فرعٍ آخر');
});

test('★ وورقةُ المستند تحترم الطريق أيضًا — لا تلتقط رقمًا متشابهًا من فرعٍ آخر', () => {
  const leaf = drillInto(EXC, ORG, {
    level: 'document',
    key: 'D-3',
    path: [{ level: 'branch', key: 'BR01' }],
  });
  assert.equal(leaf.leaf, true);
  assert.equal(leaf.items.length, 0, 'D-3 في BR02 — لا يُعرض تحت BR01');
});

test('الترشيح بالأب وحده يبقى عاملًا — توافقٌ رجعيّ لمن يستدعي بلا مسار', () => {
  const v = towerView(EXC, ORG, { level: 'branch', parent: 'BRD1' });
  assert.deepEqual(v.rows.map((r) => r.key).sort(), ['BR01', 'BR02']);
});

test('★★ حارس الشمول: كلّ نوعٍ مذكورٍ مبنيٌّ، وكلّ مبنيٍّ مصنَّف', () => {
  const cov = categoryCoverage();
  assert.deepEqual(cov.promisedButMissing, [], 'اللوحة تَعِد بنوعٍ غير مبنيّ');
  assert.deepEqual(cov.builtButUncategorized, [], 'نوعٌ مبنيٌّ يسقط من العرض بلا تصنيف');
  // تسعٌ يطلبها المستند + أربعٌ زادها حارس الشمول لأنواعٍ مبنيّةٍ من
  // خططٍ سابقة كانت ستسقط من اللوحة بصمت.
  assert.equal(TOWER_CATEGORIES.length, 12);
  for (const id of ['stockout', 'supplier_delay', 'expiry', 'production_delay', 'emergency', 'late_pr', 'receiving_variance', 'waste', 'consumption']) {
    assert.ok(TOWER_CATEGORIES.some((c) => c.id === id), `فئة المستند «${id}» غائبة`);
  }
});

test('كلّ فئةٍ تشير إلى أنواعٍ في السجلّ القائم — لا سجلَّ ثانٍ', () => {
  for (const c of TOWER_CATEGORIES) {
    assert.ok(c.types.length, `الفئة «${c.id}» بلا أنواع`);
    for (const t of c.types) assert.ok(EXCEPTION_TYPES[t], `الفئة «${c.id}» تَعِد بنوع «${t}» غير مبنيّ`);
  }
  assert.equal(categoryOfType('near_expiry'), 'expiry');
  assert.equal(categoryOfType('نوعٌ مخترَع'), '', 'المجهول يُعلَن ولا يُبتلع');
});

test('★ اللوحة تعرض ما يحتاج تدخّلًا — والفئات تُعدّ لكلّ صفّ', () => {
  const branch = towerView(EXC, ORG, { level: 'branch' });
  const br01 = branch.rows.find((r) => r.key === 'BR01');
  assert.equal(br01.count, 2);
  assert.equal(br01.byCategory.stockout, 1);
  assert.equal(br01.byCategory.expiry, 1);
  assert.ok(br01.samples.length > 0, 'العيّنة تشرح الرقم');
  assert.equal(branch.uncategorized, 0);
});

test('استثناءٌ بموقعٍ خارج الشجرة يُحصى «غير مربوط» ولا يذوب', () => {
  const withGhost = [...EXC, { type: 'below_min', location: 'GHOST', sku: 'X' }];
  const sector = towerView(withGhost, ORG, { level: 'sector' });
  assert.equal(sector.total, 5);
  assert.ok(sector.rows.some((r) => r.label === 'غير مربوط'));
});
