/**
 * اختبارات نوع الصنف (م٣-أ · يسدّ ف‑٤ب).
 *
 * الاختباران الحاكمان: **الترحيل لا يغيّر رقمًا واحدًا**، و**الخدمة لا تُنتج
 * رصيدًا**. وما بينهما تفاصيل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEM_TYPES,
  ITEM_TYPE_OPTIONS,
  DEFAULT_ITEM_TYPE,
  typeOf,
  isStocked,
  isSellable,
  isMovable,
  itemTypeMap,
  lineType,
  stockableLines,
  serviceLines,
  sellableProblems,
  loadableProblems,
  itemTypeStats,
  documentItemProblems,
  normalizeItemType,
} from './itemType.js';

const MASTER = [
  { sku: 'A', itemType: 'sale' },
  { sku: 'PKG', itemType: 'internal' },
  { sku: 'FREIGHT', itemType: 'service' },
  { sku: 'OLD' }, // صنفٌ قديم بلا نوع — الترحيل
];
const MAP = itemTypeMap(MASTER);

/* ═══════════ ١. الترحيل ═══════════ */

test('★★ الترحيل صفرُ أثر: كلّ صنفٍ بلا نوع يُعامَل بيعًا — سلوك اليوم حرفيًّا', () => {
  assert.equal(typeOf({}), 'sale');
  assert.equal(typeOf({ sku: 'X' }), 'sale');
  assert.equal(typeOf(null), 'sale');
  assert.equal(typeOf({ itemType: '' }), 'sale');
  assert.equal(typeOf({ itemType: 'نوع مخترع' }), 'sale', 'الفاسد لا يفتح ولا يُعطّل');
  assert.equal(DEFAULT_ITEM_TYPE, 'sale');
});

test('★★ غياب خريطة الأنواع = سلوك اليوم: كلّ البنود تُقيَّد', () => {
  // الميزة تُفعَّل بالبيانات لا بالنشر. فقبل أن يصنّف المالك شيئًا، لا شيء يتغيّر.
  const lines = [{ sku: 'A' }, { sku: 'FREIGHT' }, { sku: 'PKG' }];
  assert.equal(stockableLines(lines, null).length, 3);
  assert.equal(serviceLines(lines, null).length, 0);
  assert.equal(sellableProblems(lines, null).ok, true);
  assert.equal(loadableProblems(lines, null).ok, true);
});

/* ═══════════ ٢. الخدمة لا تُنتج رصيدًا ═══════════ */

test('★★ الخدمة تخرج من القيد المخزنيّ — لا رصيد وهميّ في الجرد', () => {
  const lines = [{ sku: 'A', qty: 5 }, { sku: 'FREIGHT', qty: 1 }, { sku: 'PKG', qty: 3 }];
  const stocked = stockableLines(lines, MAP);
  assert.deepEqual(stocked.map((l) => l.sku), ['A', 'PKG'], 'البيع والداخليّ يُقيَّدان');
  assert.deepEqual(serviceLines(lines, MAP).map((l) => l.sku), ['FREIGHT']);
});

test('★ والداخليّ يُقيَّد — مواد التغليف بضاعةٌ حقيقيّة وإن لم تُبَع', () => {
  assert.equal(isStocked('internal'), true);
  assert.equal(isStocked('service'), false);
  assert.equal(isStocked('sale'), true);
});

test('الصنف الذي ليس في الماستر يُعامَل بيعًا — لا نمنع بسبب جهلنا', () => {
  assert.equal(lineType({ sku: 'مجهول' }, MAP), 'sale');
  assert.equal(lineType({}, MAP), 'sale');
  assert.equal(lineType({ sku: 'a' }, MAP), 'sale', 'الحرف الصغير يطابق');
});

test('itemTypeMap: يقبل itemCode كما يقبل sku', () => {
  assert.equal(lineType({ itemCode: 'FREIGHT' }, MAP), 'service');
});

/* ═══════════ ٣. الصنف الداخليّ لا يُباع (القرار ٤) ═══════════ */

test('★ الداخليّ في أمر بيع يُمنع افتراضًا، ويسمّي البند بعينه', () => {
  const lines = [{ sku: 'A' }, { sku: 'PKG', description: 'كرتون تغليف' }];
  const v = sellableProblems(lines, MAP, null, 'storekeeper');
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 1);
  assert.match(v.problems[0], /PKG/);
  assert.match(v.problems[0], /لا يُباع/);
});

test('★ ويفكّه صاحب الصلاحية — تحذيرًا لا منعًا', () => {
  const lines = [{ sku: 'PKG' }];
  const v = sellableProblems(lines, MAP, null, 'warehouse_manager');
  assert.equal(v.ok, true);
  assert.equal(v.warnings.length, 1, 'يمرّ ويُسجَّل — لا يمرّ صامتًا');
});

test('★ والسياسة من الإعدادات لا من الكود', () => {
  const lines = [{ sku: 'PKG' }];
  const open = { items: { internalInSales: 'allow' } };
  assert.equal(sellableProblems(lines, MAP, open, 'storekeeper').ok, true);

  const warn = { items: { internalInSales: 'warn' } };
  const v = sellableProblems(lines, MAP, warn, 'storekeeper');
  assert.equal(v.ok, true);
  assert.equal(v.warnings.length, 1);

  const moved = { items: { internalInSales: 'block', overrideRole: 'finance_manager' } };
  assert.equal(sellableProblems(lines, MAP, moved, 'warehouse_manager').ok, false, 'الدور القديم لم يعد يفكّ');
  assert.equal(sellableProblems(lines, MAP, moved, 'finance_manager').ok, true);
});

test('الخدمة تُباع — هي إيرادٌ لا بضاعة', () => {
  assert.equal(sellableProblems([{ sku: 'FREIGHT' }], MAP, null, 'storekeeper').ok, true);
  assert.equal(isSellable('service'), true);
  assert.equal(isSellable('internal'), false);
});

/* ═══════════ ٤. المركبة لا تُحمَّل خدمة ═══════════ */

test('★ خدمةٌ على مركبة تُمنع — وإلّا طاردها المندوب في تسويته', () => {
  const v = loadableProblems([{ sku: 'A' }, { sku: 'FREIGHT' }], MAP);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /FREIGHT/);
  assert.match(v.problems[0], /لا تُحمَّل/);

  assert.equal(loadableProblems([{ sku: 'A' }, { sku: 'PKG' }], MAP).ok, true, 'الداخليّ يُنقل');
  assert.equal(isMovable('service'), false);
  assert.equal(isMovable('internal'), true);
});

/* ═══════════ ٥. سلامة العقد ═══════════ */

test('★ خيارات الشاشة تطابق المنطق — لا خيارٌ يُعرض ولا يُقبل', () => {
  assert.equal(ITEM_TYPE_OPTIONS.length, Object.keys(ITEM_TYPES).length);
  for (const o of ITEM_TYPE_OPTIONS) {
    assert.ok(ITEM_TYPES[o.value], `${o.value} يُعرض ولا وجود له`);
    assert.ok(o.label && o.hint, `${o.value} بلا تسميةٍ أو تلميح`);
    assert.equal(typeOf({ itemType: o.value }), o.value, `${o.value} يُعرض ولا يُقبل`);
  }
});

test('★ لكلّ نوعٍ سلوكٌ مميّز — نوعان متطابقان يعنيان نوعًا زائدًا', () => {
  const shape = (t) => `${t.stocked}|${t.sellable}|${t.movable}`;
  const shapes = Object.values(ITEM_TYPES).map(shape);
  assert.equal(new Set(shapes).size, shapes.length);
});

test('itemTypeStats: يكشف كم صنفًا ينتظر تصنيف المالك', () => {
  const s = itemTypeStats(MASTER);
  assert.equal(s.total, 4);
  assert.equal(s.counts.sale, 2, 'المصنَّف بيعًا والقديم غير المصنَّف');
  assert.equal(s.counts.internal, 1);
  assert.equal(s.counts.service, 1);
  assert.equal(s.untyped, 1, 'صنفٌ واحد بلا تصنيفٍ صريح');
  assert.deepEqual(itemTypeStats([]).counts, { sale: 0, internal: 0, service: 0 });
});

/* ═══════════ ٦. الحارس الجامع للمستند ═══════════ */

test('★★ «يُخرج ملكيّة» غير «يُخرج مخزونًا» — النقل بين مستودعَينا لا يبيع شيئًا', () => {
  const lines = [{ sku: 'PKG' }];
  // نقلٌ داخليّ: الداخليّ يمرّ — وهو أصل وجوده.
  assert.equal(documentItemProblems('TRN', lines, MAP, null, 'storekeeper').ok, true);
  assert.equal(documentItemProblems('GRN', lines, MAP, null, 'storekeeper').ok, true);
  // بيعٌ: يُمنع.
  assert.equal(documentItemProblems('SO', lines, MAP, null, 'storekeeper').ok, false);
  assert.equal(documentItemProblems('VSI', lines, MAP, null, 'storekeeper').ok, false);
});

test('★ تحميل المركبة يمنع الخدمة ويقبل الداخليّ', () => {
  assert.equal(documentItemProblems('VLD', [{ sku: 'FREIGHT' }], MAP, null, 'sales_rep').ok, false);
  assert.equal(documentItemProblems('VLD', [{ sku: 'PKG' }], MAP, null, 'sales_rep').ok, true);
});

test('★ بيعُ خدمةٍ من المركبة: تُباع ولا تُحمَّل — فيمرّ VSI ويُمنع VLD', () => {
  const svc = [{ sku: 'FREIGHT' }];
  assert.equal(documentItemProblems('VSI', svc, MAP, null, 'sales_rep').ok, true, 'رسوم التوصيل تُباع');
  assert.equal(documentItemProblems('VLD', svc, MAP, null, 'sales_rep').ok, false, 'ولا تُحمَّل');
});

test('نوعٌ لا يخصّه حارس: يمرّ بلا فحص', () => {
  assert.equal(documentItemProblems('CC', [{ sku: 'PKG' }, { sku: 'FREIGHT' }], MAP, null, '').ok, true);
});

/* ═══════════ ٧. تطبيع الاستيراد ═══════════ */

test('★★ «خدمة» في الشيت تصير service — وإلّا صنّف المالك مئةً وهو لم يصنّف واحدًا', () => {
  assert.equal(normalizeItemType('خدمة'), 'service');
  assert.equal(normalizeItemType('خدمات'), 'service');
  assert.equal(normalizeItemType('رسوم'), 'service');
  assert.equal(normalizeItemType('داخلي'), 'internal');
  assert.equal(normalizeItemType('تغليف'), 'internal');
  assert.equal(normalizeItemType('بيع'), 'sale');
  assert.equal(normalizeItemType('Service'), 'service', 'حالة الأحرف لا تهمّ');
});

test('المجهول يُعيد فراغًا — و`typeOf` يتولّى السقوط الآمن إلى بيع', () => {
  assert.equal(normalizeItemType('شيء غريب'), '');
  assert.equal(normalizeItemType(''), '');
  assert.equal(normalizeItemType(null), '');
  assert.equal(typeOf({ itemType: 'خدمة' }), 'service', 'والمرادف يمرّ عبر typeOf أيضًا');
  assert.equal(typeOf({ itemType: 'شيء غريب' }), 'sale');
});
