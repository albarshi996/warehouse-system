/**
 * اختبارات قوائم الأسعار (م٣-ج · يسدّ ف‑٣).
 *
 * الاختبار الحاكم: **من لا قائمة له يعمل كما كان.** فالتدرّج هو ما يمنع
 * التعطيل، ومعيار الإتمام «لا بند بيع بسعرٍ يدويٍّ بلا وسم» لا يعني «لا بيع
 * بلا قائمة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICE_SEGMENTS,
  lineKey,
  isActiveOn,
  listForCustomer,
  priceFor,
  priceVerdict,
  priceDocument,
  deviationRows,
  deviationSummary,
  DEVIATION_COLUMNS,
  listProblems,
} from './priceListModel.js';

const RETAIL = {
  id: 'L1',
  name: 'تجزئة',
  segment: 'retail',
  isDefault: true,
  lines: [
    { sku: 'A', uom: 'piece', price: 10, minQty: 0 },
    { sku: 'A', uom: 'box', price: 110, minQty: 0 },
    { sku: 'A', uom: 'piece', price: 8, minQty: 100 }, // شريحة جملة داخل القائمة
    { sku: 'B', uom: 'piece', price: 25, minQty: 0 },
  ],
};
const WHOLESALE = { id: 'L2', name: 'جملة', segment: 'wholesale', lines: [{ sku: 'A', uom: 'piece', price: 7, minQty: 0 }] };

/* ═══════════ ١. التدرّج: من لا قائمة له يعمل كما كان ═══════════ */

test('★★ لا قائمة ⇒ الكتابة اليدوية تمرّ بلا وسمٍ ولا تنبيه', () => {
  const v = priceVerdict({ list: null, line: { sku: 'A', uom: 'piece', unitPrice: 999 }, role: 'sales_rep' });
  assert.equal(v.ok, true);
  assert.equal(v.status, 'noList');
  assert.equal(v.tag, null);
  assert.equal(v.warning, '');
  assert.equal(v.problem, '');
});

test('★★ ومستندٌ كامل بلا قائمة يمرّ كما هو — لا سعرٌ يُدهس ولا بندٌ يُوسَم', () => {
  const lines = [{ sku: 'A', uom: 'piece', qty: 5, unitPrice: 999 }];
  const r = priceDocument({ list: null, lines, role: 'sales_rep' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.lines, lines, 'البنود لم تُمسّ');
});

test('★ صنف بيعٍ بلا سعرٍ في القائمة: تحذيرٌ لا منع (نصّ الخطة)', () => {
  const v = priceVerdict({ list: RETAIL, line: { sku: 'مجهول', uom: 'piece', unitPrice: 5 }, role: 'sales_rep' });
  assert.equal(v.ok, true);
  assert.equal(v.status, 'unpriced');
  assert.match(v.warning, /لا سعر له/);
});

/* ═══════════ ٢. اختيار السعر ═══════════ */

test('★★ سعر الصندوق غير سعر القطعة', () => {
  assert.equal(priceFor(RETAIL, 'A', 'piece').price, 10);
  assert.equal(priceFor(RETAIL, 'A', 'box').price, 110);
  assert.equal(priceFor(RETAIL, 'A', 'كرتون').found, false, 'وحدةٌ غير مسعّرة');
});

test('★ الحدّ الأدنى يختار أعلى شريحةٍ يبلغها الطلب', () => {
  assert.equal(priceFor(RETAIL, 'A', 'piece', 1).price, 10);
  assert.equal(priceFor(RETAIL, 'A', 'piece', 99).price, 10);
  assert.equal(priceFor(RETAIL, 'A', 'piece', 100).price, 8, 'بلوغ الحدّ يُنزل السعر');
  assert.equal(priceFor(RETAIL, 'A', 'piece', 500).price, 8);
});

test('lineKey يطبّع الوحدة والحروف', () => {
  assert.equal(lineKey('a', 'قطعة'), lineKey('A', 'piece'));
  assert.equal(lineKey('A', 'KG'), lineKey('a', 'كيلو'));
});

test('★ قائمة العميل تُقدَّم، ومن لا قائمة له يتبع الافتراضيّة', () => {
  const lists = [RETAIL, WHOLESALE];
  assert.equal(listForCustomer(lists, { priceListId: 'L2' }).id, 'L2');
  assert.equal(listForCustomer(lists, { priceListId: '' }).id, 'L1', 'الافتراضيّة');
  assert.equal(listForCustomer(lists, null).id, 'L1');
  assert.equal(listForCustomer([WHOLESALE], null), null, 'بلا افتراضيّة ⇒ لا قائمة');
  assert.equal(listForCustomer([], null), null);
});

test('★ قائمةٌ منتهيةٌ لا تُستعمل — والغياب يعني «بلا حدّ» لا «منتهية»', () => {
  const timed = { ...RETAIL, validFrom: '2026-01-01', validTo: '2026-06-30' };
  assert.equal(isActiveOn(timed, '2026-03-01'), true);
  assert.equal(isActiveOn(timed, '2026-08-11'), false);
  assert.equal(isActiveOn(timed, '2025-12-31'), false);
  assert.equal(isActiveOn(RETAIL, '2026-08-11'), true, 'بلا تاريخٍ تعمل أبدًا');
  assert.equal(isActiveOn({ ...RETAIL, active: false }, ''), false);
  assert.equal(listForCustomer([timed], null, '2026-08-11'), null, 'والمنتهية تُسقط الاختيار');
});

/* ═══════════ ٣. السعر اليدويّ: منعٌ أو وسم (القرار ٥) ═══════════ */

test('★★ سعرٌ يخالف القائمة: يُمنع على من لا صلاحية له', () => {
  const v = priceVerdict({ list: RETAIL, line: { sku: 'A', uom: 'piece', unitPrice: 6 }, role: 'sales_rep' });
  assert.equal(v.ok, false);
  assert.equal(v.status, 'manual');
  assert.match(v.problem, /سعر القائمة 10/);
});

test('★★ ويُوسَم لمن يملكها — والوسم يحمل ما يُسأل عنه', () => {
  const v = priceVerdict({ list: RETAIL, line: { sku: 'A', uom: 'piece', unitPrice: 6 }, role: 'sales_supervisor' });
  assert.equal(v.ok, true);
  assert.deepEqual(v.tag, { manualPrice: true, listPrice: 10, entered: 6, deltaPct: -40, listName: 'تجزئة' });
  assert.match(v.warning, /يُوسَم/);
});

test('★ الوسم لا يحمل هويّة — يكتبها الخادم', () => {
  const v = priceVerdict({ list: RETAIL, line: { sku: 'A', uom: 'piece', unitPrice: 6 }, role: 'admin' });
  assert.equal(v.tag.byName, undefined);
  assert.equal(v.tag.at, undefined);
});

test('السعر المطابق للقائمة لا يُوسَم', () => {
  const v = priceVerdict({ list: RETAIL, line: { sku: 'A', uom: 'piece', unitPrice: 10 }, role: 'sales_rep' });
  assert.equal(v.status, 'listed');
  assert.equal(v.tag, null);
});

test('★ والسياسة من الإعدادات: التشديد يمنع الجميع، والفتح يُلغي الوسم', () => {
  const line = { sku: 'A', uom: 'piece', unitPrice: 6 };
  const strict = { pricing: { manualOverride: 'block' } };
  assert.equal(priceVerdict({ list: RETAIL, line, settings: strict, role: 'admin' }).ok, false, 'حتّى الأدمن');

  const open = { pricing: { manualOverride: 'allow' } };
  const v = priceVerdict({ list: RETAIL, line, settings: open, role: 'sales_rep' });
  assert.equal(v.ok, true);
  assert.equal(v.tag, null, 'الفتح الكامل يُلغي الوسم');
});

/* ═══════════ ٤. ملء الأسعار في المستند ═══════════ */

test('★★ البند بلا سعرٍ يُملأ من القائمة — أصل الميزة: لا يكتب أحدٌ سعرًا بيده', () => {
  const r = priceDocument({
    list: RETAIL,
    lines: [{ sku: 'A', uom: 'piece', qty: 5 }, { sku: 'B', uom: 'piece', qty: 2 }],
    role: 'sales_rep',
  });
  assert.equal(r.lines[0].unitPrice, 10);
  assert.equal(r.lines[0].priceSource, 'تجزئة');
  assert.equal(r.lines[1].unitPrice, 25);
  assert.equal(r.ok, true);
});

test('★ والملء يحترم شريحة الكمّيّة', () => {
  const r = priceDocument({ list: RETAIL, lines: [{ sku: 'A', uom: 'piece', qty: 150 }], role: 'sales_rep' });
  assert.equal(r.lines[0].unitPrice, 8);
});

test('★ ومستندٌ فيه سعرٌ يدويٌّ ممنوع يُرفض كلّه بأسبابه', () => {
  const r = priceDocument({
    list: RETAIL,
    lines: [{ sku: 'A', uom: 'piece', qty: 5, unitPrice: 6 }, { sku: 'B', uom: 'piece', qty: 1, unitPrice: 25 }],
    role: 'sales_rep',
  });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1, 'البند الموافق للقائمة لا يُشتكى منه');
});

/* ═══════════ ٥. تقرير الانحراف ═══════════ */

const DOCS = [
  {
    id: 'D1', number: 'VSI-1', type: 'VSI', createdByName: 'أحمد',
    header: { customer: 'بقالة النور' },
    lines: [
      { sku: 'A', qty: 100, pricing: { manualPrice: true, listPrice: 10, entered: 8, deltaPct: -20, listName: 'تجزئة' } },
      { sku: 'B', qty: 1 }, // بلا وسم
    ],
  },
  {
    id: 'D2', number: 'VSI-2', type: 'VSI', createdByName: 'سالم',
    header: { customerCode: 'C-2' },
    lines: [{ sku: 'A', qty: 10, pricing: { manualPrice: true, listPrice: 10, entered: 12, deltaPct: 20, listName: 'تجزئة' } }],
  },
];

test('★★ التقرير يقرأ الوسم لا يقارن بأثرٍ رجعيّ — القائمة تتغيّر والوسم لا', () => {
  const rows = deviationRows(DOCS);
  assert.equal(rows.length, 2, 'البند بلا وسمٍ لا يظهر');
  assert.equal(rows[0].sku, 'A');
  assert.equal(rows[0].listPrice, 10);
  assert.equal(rows[0].entered, 8);
});

test('★ الأكبر أثرًا بالدينار أوّلًا — لا الأكبر نسبةً', () => {
  const rows = deviationRows(DOCS);
  assert.equal(rows[0].impact, -200, '١٠٠ قطعة × ناقص ٢ = ٢٠٠ خسارة');
  assert.equal(rows[1].impact, 20);
  assert.ok(Math.abs(rows[0].impact) > Math.abs(rows[1].impact), 'ونسبتاهما ٢٠٪ سواء');
});

test('★ الملخّص يكشف من يبيع بأقلّ من القائمة', () => {
  const s = deviationSummary(deviationRows(DOCS));
  assert.equal(s.total, 2);
  assert.equal(s.below, 1);
  assert.equal(s.above, 1);
  assert.equal(s.impact, -180);
  assert.equal(s.people[0].key, 'أحمد', 'الأكثر خسارةً أوّلًا');
  assert.equal(s.people[0].impact, -200);
});

test('التقرير الفارغ لا يرمي', () => {
  assert.deepEqual(deviationRows([]), []);
  assert.deepEqual(deviationRows(null), []);
  assert.equal(deviationSummary([]).total, 0);
  assert.equal(deviationSummary([]).impact, 0);
});

test('★ الأعمدة تجيب: من باع بغير سعر القائمة وبكم', () => {
  const keys = DEVIATION_COLUMNS.map((c) => c.key);
  for (const need of ['byName', 'listPrice', 'entered', 'impact', 'sku']) {
    assert.ok(keys.includes(need), `عمود ${need} مفقود`);
  }
  const row = deviationRows(DOCS)[0];
  for (const c of DEVIATION_COLUMNS) assert.ok(c.key in row, `العمود ${c.key} بلا مقابل`);
});

/* ═══════════ ٦. تحقّق القائمة ═══════════ */

test('★ تكرار الصنف بنفس الوحدة والحدّ يُمنع — أيّ السعرين يُعتمد؟', () => {
  const dup = { name: 'ق', lines: [{ sku: 'A', uom: 'piece', price: 10 }, { sku: 'a', uom: 'قطعة', price: 12 }] };
  assert.match(listProblems(dup)[0], /تكرار/);
});

test('الشرائح المختلفة لنفس الصنف ليست تكرارًا', () => {
  assert.deepEqual(listProblems(RETAIL), []);
});

test('نافذةٌ مقلوبة وسعرٌ سالبٌ واسمٌ ناقص', () => {
  assert.match(listProblems({ name: '', lines: [] })[0], /بلا اسم/);
  assert.match(listProblems({ name: 'ق', validFrom: '2026-06-01', validTo: '2026-01-01', lines: [] })[0], /مقلوبة/);
  assert.match(listProblems({ name: 'ق', lines: [{ sku: 'A', price: -5 }] })[0], /سالب/);
});

test('الشرائح المعروضة معرَّفة', () => {
  assert.equal(PRICE_SEGMENTS.length, 4);
  for (const s of PRICE_SEGMENTS) assert.ok(s.value && s.label);
});
