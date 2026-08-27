/**
 * اختبارات محضر فرق النقل — «الفرق يبقى مفتوحًا حتى صدور قرار» (القاعدة ١٥).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import tdr, {
  DISCREPANCY_KINDS,
  LIABLE_PARTIES,
  completionProblems,
  discrepancyWarnings,
  openDiscrepancies,
} from './tdr.js';
import { getSchema, GOVERNED_FORMS } from './index.js';
import { STANDALONE_TYPES } from '../chain.js';
import { FINANCIAL_IMPACT } from '../../odoo/financialImpact.js';

const SOLVED = {
  kind: 'كمّيّة ناقصة', lpn: 'LPN-MAIN-20260827-000001', sku: 'WNW-001',
  qtySent: 60, qtyReceived: 50, decision: 'نقصٌ في الطريق', liability: 'الناقل', correction: 'خصمٌ من مستحقّاته',
};
const OPEN = { kind: 'طبلية ناقصة', lpn: 'LPN-MAIN-20260827-000002', qtySent: 1, qtyReceived: 0 };

test('المخطّط مسجَّلٌ بنوعه وأدواره وتوقيعاته الثلاثة', () => {
  assert.equal(getSchema('TDR')?.type, 'TDR');
  assert.equal(tdr.formCode, 'BFP-TDR-001');
  assert.equal(tdr.signatures.length, 3, 'خانات التوقيع ثلاث كما في الورق');
  assert.deepEqual(tdr.roles.approve, ['warehouse_manager']);
  assert.ok(GOVERNED_FORMS.some((f) => f.type === 'TDR'), 'وله صفٌّ في خارطة النماذج');
});

test('★★ مستقلٌّ بسببٍ مكتوب — لا يُشتقّ منه كمّيّةٌ ولا إليه', () => {
  assert.ok(STANDALONE_TYPES.TDR, 'مسجَّلٌ في سجلّ المستقلّات');
  assert.match(STANDALONE_TYPES.TDR, /لا كمّيّةَ تُشتقّ منه ولا إليه/);
  assert.match(STANDALONE_TYPES.TDR, /يحرّك البضاعة مرّتين/, 'والسبب مكتوبٌ لا مضمَر');
});

test('★★★ لا يقيّد حركةً ولا أثرَ ماليًّا له — القيدُ وقع في TRN وTRC', () => {
  const impact = FINANCIAL_IMPACT.TDR;
  assert.equal(impact.financial, false);
  assert.equal(impact.stockEffect, false, 'محضرٌ رقابيٌّ لا حركةَ مخزنيّة له');
  assert.equal(impact.odooDoc, null);
  assert.match(impact.note, /الحركة التصحيحية/, 'وأثرُ الحسم يقع بها لا بالمحضر');
});

test('الفروق غير المحسومة تُعدّ — عمودٌ محسوب لا يُكتب بالقلم', () => {
  assert.equal(openDiscrepancies([SOLVED, OPEN]), 1);
  assert.equal(openDiscrepancies([SOLVED]), 0);
  assert.equal(openDiscrepancies([]), 0);
});

test('★★ التحذيرات تسمّي العلّة: فرقٌ بلا قرار · محسومٌ بلا متحمِّل · نوعٌ خارج القائمة', () => {
  assert.match(discrepancyWarnings({ lines: [] })[0], /محضرٌ بلا فرقٍ لا معنى له/);
  assert.match(discrepancyWarnings({ lines: [OPEN] }).join(' '), /بلا قرار/);
  assert.match(discrepancyWarnings({ lines: [OPEN] }).join(' '), /القاعدة ١٥/);

  const noLiability = { ...SOLVED, liability: '' };
  assert.match(discrepancyWarnings({ lines: [noLiability] }).join(' '), /بلا صاحبٍ لا يُطالَب به أحد/);

  const badKind = { ...SOLVED, kind: 'شيءٌ ما' };
  assert.match(discrepancyWarnings({ lines: [badKind] }).join(' '), /خارج القائمة المعتمَدة/);
  assert.deepEqual(discrepancyWarnings({ lines: [SOLVED] }), [], 'المحضر السليم بلا تحذير');
});

test('★★★ حارس الإنجاز: لا يُنجَز محضرٌ فيه فرقٌ بلا قرار', () => {
  const p = completionProblems({ lines: [SOLVED, OPEN] });
  assert.match(p.join(' '), /احسمها قبل الإنجاز/);
  assert.match(p.join(' '), /أيّ فرقٍ يبقى مفتوحًا حتى صدور قرار/);

  assert.match(completionProblems({ lines: [] }).join(' '), /لا شيء يُحسم/);
  assert.match(completionProblems({ lines: [{ ...SOLVED, liability: '' }] }).join(' '), /سمِّه ولو «قيد التحقيق»/);
  assert.deepEqual(completionProblems({ lines: [SOLVED] }), [], 'المحسوم كاملًا يُنجَز');
});

test('القوائم المقيَّدة: تسعةُ أنواع فروقٍ وخمسةُ أطرافٍ متحمِّلة', () => {
  assert.equal(DISCREPANCY_KINDS.length, 9);
  assert.ok(DISCREPANCY_KINDS.includes('كسر في الختم'));
  assert.ok(LIABLE_PARTIES.includes('قيد التحقيق'), 'وللمجهول اسمٌ فلا يبقى الفرق بلا صاحب');
  assert.ok(Object.isFrozen(DISCREPANCY_KINDS));
});

test('★ المحضر يُحرَّر على استلامٍ وقع — والمرجع إلزاميّ', () => {
  const ref = tdr.sections[0].fields.find((f) => f.key === 'transferReceiptRef');
  assert.equal(ref.docType, 'TRC');
  assert.ok(ref.required, 'لا فرقَ بلا استلام');
  const lpnCol = tdr.sections[1].columns.find((c) => c.key === 'lpn');
  assert.ok(lpnCol.scannable, 'ورقم الطبلية يُمسح لا يُكتب');
});
