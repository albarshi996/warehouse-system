import test from 'node:test';
import assert from 'node:assert/strict';
import { indexLocations } from '../org/orgLocations.js';
import { indexPolicies } from '../intelligence/stockPolicy.js';
import { rebalanceSuggestions, rebalanceVerdict } from '../intelligence/rebalance.js';
import { branchPositions, closeRecords, costOwnership } from './towerReading.js';

/* ═══ شجرةٌ صغيرة: قطاعٌ ← براند ← فرعان، ومستودعٌ مركزيّ خارجها ═══ */
const orgIndex = indexLocations([
  { code: 'FNB', level: 'sector', nameAr: 'الأغذية' },
  { code: 'BRZ', level: 'brand', parentCode: 'FNB', nameAr: 'براندزو' },
  { code: 'BR1', level: 'branch', parentCode: 'BRZ', nameAr: 'طرابلس' },
  { code: 'BR2', level: 'branch', parentCode: 'BRZ', nameAr: 'بنغازي' },
]);

const bal = (warehouse, sku, qty, expiry = '') => ({ warehouse, sku, qty, expiry });

/* ═══ ① أقربُ صلاحيّةٍ هي الحاكمة ═══ */

test('الأرصدة تُجمَع على (فرع·صنف) عبر الدفعات والمواقع', () => {
  const { positions } = branchPositions([bal('BR1', 'MILK', 5), bal('BR1', 'MILK', 7)], { orgIndex });
  assert.equal(positions.length, 1);
  assert.equal(positions[0].onHand, 12);
});

test('★ أقربُ صلاحيّةٍ تحكم — لا آخرُ صفٍّ قُرئ', () => {
  const { positions } = branchPositions(
    [bal('BR1', 'MILK', 5, '2026-12-01'), bal('BR1', 'MILK', 7, '2026-09-01'), bal('BR1', 'MILK', 3, '2027-01-01')],
    { orgIndex }
  );
  assert.equal(positions[0].expiry, '2026-09-01', 'عليها يقع حارس النقل');
});

test('صفٌّ بلا صلاحيّةٍ لا يمحو صلاحيّةً معروفة', () => {
  const { positions } = branchPositions([bal('BR1', 'MILK', 5, '2026-09-01'), bal('BR1', 'MILK', 2, '')], { orgIndex });
  assert.equal(positions[0].expiry, '2026-09-01');
});

/* ═══ ② رصيدٌ خارج الشجرة ليس فرعًا ═══ */

test('★ مستودعٌ خارج الشجرة يُحصى ولا يصير موضعًا — فلا يُقترح نقلٌ من حيث لا فرع', () => {
  const r = branchPositions([bal('MAIN', 'MILK', 900), bal('BR1', 'MILK', 5)], { orgIndex });
  assert.equal(r.unlinked, 1);
  assert.equal(r.positions.length, 1);
  assert.equal(r.positions[0].branch, 'BR1');
});

test('الفروع تُحصى بعددها لا بعدد صفوفها', () => {
  const r = branchPositions([bal('BR1', 'MILK', 5), bal('BR1', 'EGG', 2), bal('BR2', 'MILK', 9)], { orgIndex });
  assert.equal(r.branches, 2);
  assert.equal(r.positions.length, 3);
});

/* ═══ ③ موضعٌ بلا سياسةٍ لا يُحكم عليه ═══ */

test('★★ بلا حدٍّ ولا Par: يُحصى ويُعلَن — ولا يُفترض له حدٌّ من عندنا', () => {
  const r = branchPositions([bal('BR1', 'MILK', 5), bal('BR2', 'MILK', 90)], { orgIndex });
  assert.equal(r.unpolicied, 2);
  for (const p of r.positions) {
    assert.equal(p.minQty, 0);
    assert.equal(p.parLevel, 0);
  }
  // ولأنّ الحدّ صفرٌ لا يقترح المحرّك نقلًا — النقص لا يُعرف بلا حدّ.
  assert.equal(rebalanceSuggestions(r.positions, { today: '2026-08-25' }).length, 0);
});

test('السياسة تُورَث من البراند حين لا يصرّح الفرع — والمصدر يُعلَن', () => {
  const policyIndex = indexPolicies([{ scope: 'brand', scopeCode: 'BRZ', sku: 'MILK', minQty: 10, parLevel: 20 }]);
  const { positions, unpolicied } = branchPositions([bal('BR1', 'MILK', 5)], { orgIndex, policyIndex });
  assert.equal(unpolicied, 0);
  assert.equal(positions[0].minQty, 10);
  assert.equal(positions[0].parLevel, 20);
  assert.equal(positions[0].policySource, 'brand');
});

/* ═══ والمواضع تُغذّي محرّك التوازن فعلًا ═══ */

test('★ موضعان بسياسةٍ يُنتجان نقلًا من الفائض إلى الناقص', () => {
  const policyIndex = indexPolicies([{ scope: 'brand', scopeCode: 'BRZ', sku: 'MILK', minQty: 10, parLevel: 20 }]);
  const { positions } = branchPositions(
    [bal('BR1', 'MILK', 4, '2026-12-01'), bal('BR2', 'MILK', 40, '2026-12-01')],
    { orgIndex, policyIndex }
  );
  const [s] = rebalanceSuggestions(positions, { today: '2026-08-25' });
  assert.ok(s, 'اقتراحٌ واحدٌ على الأقلّ');
  assert.equal(s.from, 'BR2');
  assert.equal(s.to, 'BR1');
  assert.equal(s.qty, 16); // BR1 يحتاج par(20) − 4 ؛ وBR2 يفيض 20
  assert.equal(rebalanceVerdict(s, positions, { today: '2026-08-25' }).ok, true);
});

test('★ صلاحيّةٌ لا تكفي الطريق تمنع النقل — نقلٌ ينتهي قبل أن يصل هدرٌ متعمَّد', () => {
  const policyIndex = indexPolicies([{ scope: 'brand', scopeCode: 'BRZ', sku: 'MILK', minQty: 10, parLevel: 20 }]);
  const { positions } = branchPositions(
    [bal('BR1', 'MILK', 4, '2026-12-01'), bal('BR2', 'MILK', 40, '2026-08-26')],
    { orgIndex, policyIndex }
  );
  assert.equal(rebalanceSuggestions(positions, { today: '2026-08-25' }).length, 0);
});

/* ═══ الإغلاق اليوميّ ═══ */

const doc = (type, warehouse, date, lines) => ({ type, header: { warehouse, date }, lines });

test('كلّ فرعٍ يُغلق بمستنداته هو لا بمستندات جاره', () => {
  const docs = [
    doc('DMG', 'BR1', '2026-08-25', [{ qty: 3 }]),
    doc('DMG', 'BR2', '2026-08-25', [{ qty: 11 }]),
  ];
  const records = closeRecords([{ code: 'BR1' }, { code: 'BR2' }], { documents: docs, date: '2026-08-25' });
  assert.equal(records.length, 2);
  assert.equal(records[0].elements.waste.qty, 3);
  assert.equal(records[1].elements.waste.qty, 11);
});

test('الغائب من العناصر يُسمّى — سجلٌّ ناقصٌ معلَنٌ خيرٌ من سجلٍّ يبدو كاملًا', () => {
  const [r] = closeRecords([{ code: 'BR1' }], { documents: [], date: '2026-08-25' });
  assert.ok(r.missing.includes('sales'), 'المبيعات تأتي مرآةً — وغيابها يُعلَن');
  assert.ok(r.missing.includes('laborHours'));
  assert.equal(r.closed, false);
});

test('استثناءات الفرع تُحصى في عنصر الملاحظات', () => {
  const [r] = closeRecords([{ code: 'BR1' }], {
    documents: [],
    exceptions: [{ location: 'BR1' }, { location: 'BR2' }],
    date: '2026-08-25',
  });
  assert.equal(r.elements.notes.open, 1);
});

/* ═══ حدُّ البوابة ═══ */

test('★★ حدُّ البوابة معروضٌ صفًّا صفًّا: ما تحسبه وما تقرؤه مرآةً', () => {
  const rows = costOwnership();
  const portal = rows.filter((r) => r.owner === 'portal').map((r) => r.metric);
  const mirrored = rows.filter((r) => r.owner !== 'portal').map((r) => r.metric);
  assert.ok(portal.includes('idealFoodCost'));
  assert.ok(mirrored.includes('branchProfitability'), 'ربحيّةُ الفرع يملكها أودو — وحسابُها هنا دفترٌ ثانٍ للمال');
  assert.equal(rows.every((r) => typeof r.labelAr === 'string' && r.labelAr), true, 'كلّ صفٍّ يحمل نصًّا يُعرض');
});
