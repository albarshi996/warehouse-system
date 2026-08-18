/**
 * حارس تكلفة الغذاء وحدّ البوابة ‹FNB-703›.
 *
 * أخطر ما يحرسه: **لا تُحسب في البوابة أرقامٌ يملكها أودو** (وحسابُها هنا
 * يفتح للمال دفترًا ثانيًا — نصّ المستند على منعه)، و**الفرق يُنسب لأسبابه
 * الثلاثة** لا يُطلق رقمًا واحدًا لا يُعالَج.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_SCOPE, VARIANCE_CAUSES, foodCostOf, foodCostReport,
  foodCostRatio, scopeVerdict, ownerOf,
} from './foodCost.js';
import { FINANCE_OWNER, FINANCIAL_IMPACT } from '../odoo/financialImpact.js';

test('★★ حدّ البوابة معلَنٌ ومطابقٌ للعقد القائم — أودو يملك المال', () => {
  assert.equal(COST_SCOPE.owner, FINANCE_OWNER);
  assert.equal(FINANCE_OWNER, 'odoo');
  // ربحيّة الفرع ليست في المحسوب — وهي نهاية سلسلة R365 (سطر 713).
  assert.ok(!COST_SCOPE.computed.includes('branchProfitability'));
  assert.ok(COST_SCOPE.mirrored.includes('branchProfitability'));
  assert.ok(COST_SCOPE.mirrored.includes('cogs'));
});

test('★★ حارس الحدّ: مقياسٌ يملكه أودو لا يُعرض إن لم يصل من المرآة', () => {
  const blocked = scopeVerdict(['idealFoodCost', 'branchProfitability']);
  assert.equal(blocked.ok, false);
  assert.match(blocked.problems[0], /يُقرأ مرآةً/);
  assert.match(blocked.problems[0], /دفترًا ثانيًا/);

  // ووصولُه من المرآة يُجيز عرضه.
  assert.equal(scopeVerdict(['branchProfitability'], { fromMirror: ['branchProfitability'] }).ok, true);
  // وما تحسبه البوابة يمرّ بلا شرط.
  assert.equal(scopeVerdict(['idealFoodCost', 'actualFoodCost', 'variance']).ok, true);
});

test('ملكيّة كلّ مقياسٍ معلنةٌ — وغير المصنَّف لا يُعرض رقمًا', () => {
  assert.equal(ownerOf('idealFoodCost').owner, 'portal');
  assert.equal(ownerOf('cogs').owner, 'odoo');
  assert.equal(ownerOf('شيءٌ مخترَع').owner, 'unknown');
});

test('★★ الفرق يُنسب لأسبابه الثلاثة — والباقي يُشتقّ ولا يُخمَّن', () => {
  // مثاليٌّ ١٠٠ وفعليٌّ ١٢٠: هدرٌ ٥ وفرقُ جردٍ ٣ ⇒ الباقي ١٢ وصفةً/تحضيرًا.
  const r = foodCostOf(
    { sku: 'CHICKEN', branch: 'BR01' },
    { idealQty: 100, actualQty: 120, unitCost: 10, wasteQty: 5, countVarianceQty: 3 }
  );
  assert.equal(r.idealCost, 1000);
  assert.equal(r.actualCost, 1200);
  assert.equal(r.varianceQty, 20);
  assert.equal(r.varianceCost, 200);
  assert.equal(r.variancePct, 20);

  const byCause = Object.fromEntries(r.causes.map((c) => [c.id, c]));
  assert.equal(byCause.waste.qty, 5);
  assert.equal(byCause.count.qty, 3);
  assert.equal(byCause.recipe.qty, 12, 'الباقي بعد المفسَّر');
  // ومجموع الأسباب = الفرق كلّه — لا جزءَ يضيع.
  assert.equal(r.causes.reduce((s, c) => s + c.qty, 0), r.varianceQty);
  assert.equal(Object.keys(VARIANCE_CAUSES).length, 3);
});

test('والفرق السالب (استُهلك أقلّ) يُنسب كذلك — لا يُبتلع بوصفه توفيرًا', () => {
  const r = foodCostOf({ sku: 'X', branch: 'BR01' }, { idealQty: 100, actualQty: 85, unitCost: 4 });
  assert.equal(r.varianceQty, -15);
  assert.equal(r.varianceCost, -60);
  assert.equal(r.causes.find((c) => c.id === 'recipe').qty, -15);
  assert.match(r.why, /وصفةً أو تحضيرًا/);
});

test('التقرير مرتَّبٌ بأثر الفرق الماليّ — الأكبر أثرًا أوّلًا', () => {
  const rows = [
    { sku: 'A', branch: 'BR01', idealQty: 10, actualQty: 11, unitCost: 1 },   // ١
    { sku: 'B', branch: 'BR01', idealQty: 100, actualQty: 130, unitCost: 20 }, // ٦٠٠
    { sku: 'C', branch: 'BR01', idealQty: 50, actualQty: 45, unitCost: 5 },    // ‎−٢٥
  ];
  const report = foodCostReport(rows);
  assert.deepEqual(report.map((r) => r.sku), ['B', 'C', 'A']);
});

test('نسبة تكلفة الغذاء — وبلا مبيعاتٍ لا تُخمَّن قسمةٌ على صفر', () => {
  assert.equal(foodCostRatio({ cost: 300, sales: 1000 }).ratio, 30);
  const none = foodCostRatio({ cost: 300, sales: 0 });
  assert.equal(none.ratio, null);
  assert.match(none.why, /لا تُخمَّن/);
});

test('★ ولا تُدخِل تكلفةُ الغذاء قيدًا محاسبيًّا في البوابة', () => {
  // العقد القائم: التسليم وحده يُخرج الملكيّة فيُنشئ قيدًا في أودو.
  assert.equal(FINANCIAL_IMPACT.DN.odooDoc, 'account.move');
  // وحركات الإنتاج الداخليّة لا قيدَ لها — فحسابُ تكلفةٍ فوقها لا يُنشئ مالًا.
  assert.equal(FINANCIAL_IMPACT.MIS.financial, false);
  assert.equal(FINANCIAL_IMPACT.PRC.financial, false);
});
