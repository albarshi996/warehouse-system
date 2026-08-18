/**
 * حارس دورة الإنتاج ‹FNB-502›.
 *
 * أخطر ما يحرسه: **توازن الموادّ** (ما خرج = ما دخل + الفاقد المعلَن)،
 * و**موقع الإنتاج يعود إلى الصفر** (رصيدٌ باقٍ فيه = دفعةٌ لم تُغلق)،
 * و**الإنتاج تحويلُ قيمةٍ لا خلقُها** فلا قيدَ ماليًّا يضاعف تكلفة المخزون.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema, readyTypes } from './schemas/index.js';
import { PRODUCTION_CHAIN, derivationTargets, deriveDocument } from './chain.js';
import { buildMoves } from '../ledger/movements.js';
import { SYSTEM_LOCATIONS } from '../ledger/locations.js';
import { movesStock } from '../ledger/postingRules.js';
import { FINANCIAL_IMPACT } from '../odoo/financialImpact.js';
import { ROLES } from '../auth/roles.js';

test('★ الثلاثة مسجّلة وكاملة البنية — بالآليّة القائمة لا بمحرّكٍ ثانٍ', () => {
  for (const t of PRODUCTION_CHAIN) {
    const s = getSchema(t);
    assert.ok(s, `مخطّط ${t} غير مسجّل`);
    assert.equal(s.type, t);
    assert.ok(s.roles.create.length && s.roles.approve.length && s.roles.complete.length);
    assert.ok(s.sections.some((sec) => sec.kind === 'table'), `${t} بلا جدول بنود`);
    assert.equal(typeof s.warnings, 'function', `${t} بلا تحذيرات`);
  }
  assert.ok(readyTypes().includes('PRO'));
  assert.deepEqual(PRODUCTION_CHAIN, ['PRO', 'MIS', 'PRC']);
});

test('أمر الإنتاج يتفرّع اثنتين، وطرفا السلسلة نهايتان', () => {
  assert.deepEqual(derivationTargets('PRO'), ['MIS', 'PRC']);
  assert.deepEqual(derivationTargets('MIS'), []);
  assert.deepEqual(derivationTargets('PRC'), []);
});

test('★★ الأمر لا يقيّد، والصرف والاستلام يقيّدان', () => {
  assert.equal(movesStock('PRO'), false, 'أمرٌ لا حركة — كالطلب وأمر الشراء');
  assert.equal(movesStock('MIS'), true);
  assert.equal(movesStock('PRC'), true);
});

test('★★ الموادّ تخرج إلى موقع الإنتاج، والمنتَج يخرج منه — والموقع يعود صفرًا', () => {
  const mis = {
    id: 'M1', type: 'MIS', number: 'MIS-1',
    header: { warehouse: 'KITCHEN', issueDate: '2026-08-18' },
    lines: [{ sku: 'CHICKEN', qtyIssued: 30, unitCost: 10 }],
  };
  const prc = {
    id: 'P1', type: 'PRC', number: 'PRC-1',
    header: { warehouse: 'KITCHEN', receivedAt: '2026-08-18' },
    lines: [{ sku: 'SAUCE', qtyProduced: 28, unitCost: 10, batch: 'PB-1', expiry: '2026-09-18' }],
  };

  const out = buildMoves(mis).moves[0];
  assert.equal(out.from, 'KITCHEN', 'الموادّ تغادر رفّها');
  assert.equal(out.to, SYSTEM_LOCATIONS.PRODUCTION.code, 'إلى موقع الإنتاج لا إلى العدم');

  const back = buildMoves(prc).moves[0];
  assert.equal(back.from, SYSTEM_LOCATIONS.PRODUCTION.code);
  assert.equal(back.to, 'KITCHEN', 'والمنتَج يعود إلى الرفّ');

  // ورصيدٌ باقٍ في الوسيط = دفعةٌ لم تُغلق — فالحارس معلَنٌ في تعريفه.
  assert.equal(SYSTEM_LOCATIONS.PRODUCTION.mustZero, true);
});

test('★★ الإنتاج تحويلُ قيمةٍ لا خلقُها — فلا قيدَ ماليّ يضاعف تكلفة المخزون', () => {
  for (const t of ['MIS', 'PRC']) {
    assert.equal(FINANCIAL_IMPACT[t].financial, false, `${t} أُعلن ماليًّا فتضاعفت التكلفة`);
    assert.equal(FINANCIAL_IMPACT[t].stockEffect, true);
    assert.equal(FINANCIAL_IMPACT[t].odooDoc, null, 'لا مستندَ ماليًّا في أودو لنقلٍ داخليّ');
  }
  // والأمر خطّةٌ: يظهر في أودو أمرَ تصنيعٍ بلا قيد.
  assert.equal(FINANCIAL_IMPACT.PRO.stockEffect, false);
  assert.equal(FINANCIAL_IMPACT.PRO.odooDoc, 'mrp.production');
});

test('الصرف يُشتقّ من الأمر فيرث مركز تكلفته ووحدته — ولا يُكتب مرّتين', () => {
  const pro = {
    type: 'PRO', number: 'PRO-1', state: 'approved',
    header: { warehouse: 'KITCHEN', costCenter: 'FNB-CK', orderDate: '2026-08-18', productionDate: '2026-08-19' },
    lines: [{ sku: 'SAUCE', description: 'صوص', qtyPlanned: 100, uom: 'KG', recipeRef: 'SAUCE@1' }],
  };
  const mis = deriveDocument(pro, 'MIS');
  assert.equal(mis.header.costCenter, 'FNB-CK');
  assert.equal(mis.header.warehouse, 'KITCHEN');

  // والاستلام يرث المخطَّط ليُقاس عليه الـYield.
  const prc = deriveDocument(pro, 'PRC');
  assert.equal(prc.lines[0].qtyPlanned, 100);
  assert.equal(prc.lines[0].sku, 'SAUCE');
});

test('★ تحذيراتٌ تقول الصواب: أمرٌ بلا وصفة · صرفٌ ينحرف عن المحسوب · منتَجٌ بلا دفعة', () => {
  const proW = getSchema('PRO').warnings({ header: { productionDate: '2026-08-19' }, lines: [{ qtyPlanned: 10 }] });
  assert.ok(proW.some((w) => w.includes('بلا وصفةٍ مرجعيّة')));

  const misW = getSchema('MIS').warnings({ lines: [{ qtyRequired: 100, qtyIssued: 130, batch: 'B1' }] });
  assert.ok(misW.some((w) => w.includes('٪١٠')), 'انحراف الصرف عن الوصفة يُعلَن');

  const prcW = getSchema('PRC').warnings({ header: {}, lines: [{ qtyProduced: 10 }] });
  assert.ok(prcW.some((w) => w.includes('بلا دفعة إنتاج')));
  assert.ok(prcW.some((w) => w.includes('بلا مرجع فحص')), 'الجودة قبل التعبئة');
});

test('★ الـYield محسوبٌ على الاستلام — المنتَج الفعليّ إلى المخطَّط', () => {
  const summary = getSchema('PRC').sections.find((s) => s.key === 'summary');
  const yieldField = summary.fields.find((f) => f.key === 'yieldPct');
  assert.ok(yieldField, 'حقل الـYield غائب');
  assert.equal(yieldField.compute({ lines: [{ qtyPlanned: 100, qtyProduced: 92 }] }), 92);
  // وبلا مخطَّطٍ لا قسمةَ على صفر.
  assert.equal(yieldField.compute({ lines: [{ qtyProduced: 5 }] }), 0);
});

test('دور الشيف التنفيذيّ معرَّفٌ ويعتمد الإنتاج — ق-O05 بسلوكه الافتراضيّ', () => {
  assert.ok(ROLES.executive_chef, 'الدور غير معرَّف');
  for (const t of PRODUCTION_CHAIN) {
    assert.ok(getSchema(t).roles.approve.includes('executive_chef'), `${t}: الشيف لا يعتمده`);
    assert.ok(getSchema(t).roles.approve.includes('warehouse_manager'), `${t}: المدير معتمِدٌ أعلى`);
  }
});
