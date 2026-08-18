/** حارس أمر الإنتاج ‹FNB-502› — بنيتُه وتحذيراته. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import schema, { productionOrderWarnings } from './pro.js';

test('أمر الإنتاج: أمرٌ لا حركة — بنيةٌ كاملة وأدوارٌ محدَّدة', () => {
  assert.equal(schema.type, 'PRO');
  assert.ok(schema.roles.approve.includes('executive_chef'), 'الشيف يعتمد وصفتَه');
  assert.ok(schema.roles.approve.includes('warehouse_manager'), 'والمدير معتمِدٌ أعلى');
  assert.ok(schema.sections.some((s) => s.kind === 'table'));
});

test('★ أمرٌ بلا وصفة يُعلَن: لن يُحسب له صرفُ موادّ ولا Yield', () => {
  const w = productionOrderWarnings({
    header: { productionDate: '2026-08-19' },
    lines: [{ qtyPlanned: 100 }],
  });
  assert.ok(w.some((m) => m.includes('بلا وصفةٍ مرجعيّة')));
  // وبالوصفة يصمت.
  assert.deepEqual(
    productionOrderWarnings({ header: { productionDate: '2026-08-19' }, lines: [{ qtyPlanned: 100, recipeRef: 'S@1' }] }),
    []
  );
});

test('أمرٌ فارغ أو بلا تاريخٍ مخطَّط يُعلَن — لا يُجدوَل ولا يُقاس تأخّره', () => {
  const w = productionOrderWarnings({ header: {}, lines: [] });
  assert.ok(w.some((m) => m.includes('أمرٌ فارغ')));
  assert.ok(w.some((m) => m.includes('بلا تاريخ إنتاجٍ مخطَّط')));
});
