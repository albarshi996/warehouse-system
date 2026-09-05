/**
 * اختبارات نموذج موقع التخزين — السعة والحالة والخلط والشجرة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HANDLING,
  HANDLING_TYPES,
  allowsItem,
  balanceLocationCode,
  binCellVerdict,
  buildLocationTree,
  canReceive,
  declaredHandling,
  handlingLabel,
  locationOptions,
  locationProblems,
  mixingProblem,
  occupancyOf,
  shapeLocation,
} from './locationsModel.js';

const at = (code, qty, extra = {}) => ({ bin: code, qty, sku: 'A', batch: 'B1', ...extra });

test('التسوية: الكود يُفكّ إلى مقاطعه والافتراضات تُملأ', () => {
  const s = shapeLocation({ code: 'main-a01-r01-b09-lf-p01', nameAr: ' رفّ ألف ' });
  assert.equal(s.code, 'MAIN-A01-R01-B09-LF-P01');
  assert.equal(s.warehouse, 'MAIN');
  assert.equal(s.rack, 'R01');
  assert.equal(s.nameAr, 'رفّ ألف');
  assert.equal(s.status, 'active');
  assert.equal(s.storageType, 'ambient');
  assert.equal(s.mixItems, true, 'الخلط مسموحٌ افتراضًا — المنع قرارٌ يُتّخذ لا حالةٌ تُفترض');
});

test('التسوية: حالةٌ أو نوعٌ مجهول يسقط إلى الافتراضيّ ولا ينهار', () => {
  const s = shapeLocation({ code: 'MAIN-A01', status: 'خرافة', storageType: 'خرافة' });
  assert.equal(s.status, 'active');
  assert.equal(s.storageType, 'ambient');
});

test('أخطاء النموذج: الكود الفاسد والحالة المجهولة والسعة السالبة', () => {
  assert.match(locationProblems({ code: 'MAIN' })[0], /مقطعين على الأقلّ/);
  assert.match(locationProblems({ code: 'MAIN-A01', status: 'خرافة' })[0], /حالة غير معروفة/);
  assert.match(locationProblems({ code: 'MAIN-A01', capacity: { qty: -5 } })[0], /لا تكون سالبة/);
  assert.deepEqual(locationProblems({ code: 'MAIN-A01' }), [], 'الموقع السليم بلا شكوى');
});

test('★★ لا سقفَ ⇒ لا منع: موقعٌ بلا سعةٍ يستقبل مهما بلغ رصيده', () => {
  // لو عُدّت السعةُ الغائبة صفرًا لصار كلّ موقعٍ لم يُملأ حقلُه ممتلئًا يوم
  // التشغيل، فتوقّف المستودع أوّل يوم — فشلٌ أسوأ من الفجوة التي يسدّها الحقل.
  const loose = { code: 'MAIN-A01', status: 'active' };
  assert.equal(canReceive(loose, 999999).ok, true);
  assert.equal(occupancyOf(loose, [at('MAIN-A01', 500)]).remainingQty, null, 'غير محدودة ≠ صفر');
  assert.equal(occupancyOf(loose, [at('MAIN-A01', 500)]).pct, null);
});

test('السعة المحدَّدة تمنع عند بلوغها — وبسببٍ مكتوب', () => {
  const capped = { code: 'MAIN-A01', status: 'active', capacity: { qty: 100 } };
  assert.equal(canReceive(capped, 99).ok, true);
  const verdict = canReceive(capped, 100);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /بلغ سعته \(100\)/, 'الرفض بلا سببٍ شكوى لا معلومة');
});

test('الحالة تمنع الاستقبال — والموقّف والمؤرشف والممتلئ لا يُقترحون', () => {
  for (const status of ['reserved', 'full', 'stopped', 'maintenance', 'archived']) {
    const v = canReceive({ code: 'MAIN-A01', status });
    assert.equal(v.ok, false, `${status} لا يستقبل`);
    assert.ok(v.reason.length > 0, 'ولكلّ رفضٍ سببه');
  }
  assert.equal(canReceive({ code: 'MAIN-A01', status: 'active' }).ok, true);
  assert.equal(canReceive(null).ok, false, 'موقعٌ غير معرَّف في السيّد لا يستقبل');
});

test('الإشغال يُحصى من الأرصدة الواقعة في الموقع وحده', () => {
  const loc = { code: 'MAIN-A01-R01', capacity: { qty: 200 } };
  const balances = [
    at('MAIN-A01-R01', 50),
    at('MAIN-A01-R01', 30, { batch: 'B2' }),
    at('MAIN-A01-R02', 900, { batch: 'B3' }),
  ];
  const occ = occupancyOf(loc, balances);
  assert.equal(occ.usedQty, 80, 'رصيد الرفّ المجاور لا يُحسب هنا');
  assert.equal(occ.remainingQty, 120);
  assert.equal(occ.pct, 40);
  assert.equal(occ.batches, 2);
  assert.equal(occ.lines, 2);
});

test('موقع الرصيد: القيد يتقدّم على الشيت (ل‑٥ حتى يُوحَّد الحقلان)', () => {
  assert.equal(balanceLocationCode({ bin: 'MAIN-A01', location: 'MAIN-B99' }), 'MAIN-A01');
  assert.equal(balanceLocationCode({ location: 'main-b99' }), 'MAIN-B99', 'والشيت يُقرأ حين لا قيد');
  assert.equal(balanceLocationCode({}), '');
});

test('سياسة الخلط: الموقع الفارغ لا يخالف شيئًا — أوّل صنفٍ فيه يحدّد ما بعده', () => {
  const strict = { code: 'MAIN-A01', mixItems: false, mixBatches: false };
  assert.equal(mixingProblem(strict, [], { sku: 'A', batch: 'B1' }), '');
  assert.equal(mixingProblem(strict, [at('MAIN-A01', 10)], { sku: 'A', batch: 'B1' }), '', 'الصنف نفسه والدفعة نفسها يمرّان');
});

test('سياسة الخلط: صنفٌ أو دفعةٌ غريبة تُرفض بسببٍ يذكر الموجود', () => {
  const strict = { code: 'MAIN-A01', mixItems: false, mixBatches: false };
  assert.match(mixingProblem(strict, [at('MAIN-A01', 10)], { sku: 'Z', batch: 'B1' }), /لا يقبل خلط الأصناف/);
  assert.match(mixingProblem(strict, [at('MAIN-A01', 10)], { sku: 'A', batch: 'B9' }), /لا يقبل خلط الدفعات/);

  const loose = { code: 'MAIN-A01', mixItems: true, mixBatches: true };
  assert.equal(mixingProblem(loose, [at('MAIN-A01', 10)], { sku: 'Z', batch: 'B9' }), '', 'والسماحُ يسمح');
});

test('القوائم المسموحة: الفارغة تعني «الكلّ مسموح»', () => {
  assert.equal(allowsItem({ code: 'MAIN-A01' }, { sku: 'ANY' }).ok, true);
  assert.equal(allowsItem({ code: 'MAIN-A01', allowedItems: ['A', 'B'] }, { sku: 'a' }).ok, true, 'المطابقة بلا حسّاسية حالة');
  const denied = allowsItem({ code: 'MAIN-A01', allowedItems: ['A'] }, { sku: 'Z' });
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /محصورٌ بأصناف/);
});

test('خيارات الخانة: تُحصر بمستودع المستند، والمؤرشَف يُستبعد من الاقتراح', () => {
  const locs = [
    { code: 'MAIN-A01', warehouse: 'MAIN', nameAr: 'ممرّ ألف' },
    { code: 'MAIN-A02', warehouse: 'MAIN' },
    { code: 'WH2-C01', warehouse: 'WH2' },
    { code: 'MAIN-Z99', warehouse: 'MAIN', status: 'archived' },
  ];
  const all = locationOptions(locs);
  assert.equal(all.length, 3, 'المؤرشَف لا يُقترح');
  assert.equal(all[0].label, 'MAIN-A01 — ممرّ ألف', 'الاسم يُعرض مع الكود حين يوجد');

  const main = locationOptions(locs, { warehouse: 'MAIN' });
  assert.deepEqual(main.map((o) => o.value), ['MAIN-A01', 'MAIN-A02'], 'رفٌّ في مستودعٍ آخر لا يُقترح');
});

test('★★ حكم الخانة: الفراغ ليس خطأً — مستندات اليوم كلّها بلا موقع', () => {
  // حقلٌ يمنع الحفظ لفراغه يوقف الدورة القائمة كلّها في لحظة.
  assert.deepEqual(binCellVerdict('', [{ code: 'MAIN-A01' }]), { level: 'ok', message: '' });
  assert.deepEqual(binCellVerdict(null, []), { level: 'ok', message: '' });
});

test('★★ حكم الخانة: بلا سيّدٍ مبنيّ لا حكم — تُنبَّه حين تعرف لا حين تجهل', () => {
  assert.equal(binCellVerdict('MAIN-A01', []).level, 'ok', 'قائمةٌ فارغة ⇒ لا معرفة ⇒ لا اتّهام');
  assert.equal(binCellVerdict('MAIN-A01', null).level, 'ok');
});

test('حكم الخانة: غير المسجَّل والموقوف يُنبَّه عليهما بسببٍ مكتوب', () => {
  const locs = [
    { code: 'MAIN-A01', status: 'active' },
    { code: 'MAIN-A02', status: 'stopped' },
  ];
  assert.equal(binCellVerdict('MAIN-A01', locs).level, 'ok');
  assert.match(binCellVerdict('MAIN-A09', locs).message, /غير مسجَّل/);
  assert.match(binCellVerdict('MAIN-A02', locs).message, /متوقّف/);
  assert.match(binCellVerdict('RECEIVING', locs).message, /رمزٌ محجوز/, 'والكود الفاسد يُنبَّه عليه بسببه');
});

/* ═══════════════════════════════════════════════════════════════════════
 * نوعُ المناولة ومواضعُ الطبالي ‹JR-601›
 * ═══════════════════════════════════════════════════════════════════════ */

test('★★★ الهجرةُ صفريّةُ الأثر: كلّ موقعٍ قائمٍ يصير «مختلطًا» بلا سقفِ طبالٍ', () => {
  // موقعٌ كُتب قبل وجود الحقل أصلًا: لا يُقيَّد ولا يُمنع — يصير قابلًا لكلّ
  // مناولةٍ كما كان، والتقييدُ قرارٌ يُتّخذ لاحقًا رفًّا رفًّا.
  const s = shapeLocation({ code: 'MAIN-A01' });
  assert.equal(s.handling, DEFAULT_HANDLING);
  assert.equal(s.handling, 'mixed');
  assert.equal(s.capacity.pallets, 0, 'وصفرٌ يعني «بلا سقف» لا «ممتلئ»');
  assert.equal(declaredHandling(s), '', 'و«مختلط» ليس إعلانًا بل رفعٌ للقيد');

  assert.equal(shapeLocation({ code: 'MAIN-A01', handling: 'خرافة' }).handling, 'mixed', 'والمجهول يسقط إلى المختلط');
  assert.equal(shapeLocation({ code: 'MAIN-A01', handling: 'pallet' }).handling, 'pallet');
});

test('نوعُ المناولة المعلَن: الفارغُ والمجهولُ والمختلطُ سواء — والمعلَنُ وحدَه يُقرأ', () => {
  assert.equal(declaredHandling({}), '');
  assert.equal(declaredHandling({ handling: '' }), '');
  assert.equal(declaredHandling({ handling: 'خرافة' }), '');
  assert.equal(declaredHandling({ handling: 'mixed' }), '');
  assert.equal(declaredHandling({ handling: 'PALLET' }), 'pallet', 'وحالةُ الحرف لا تصنع نوعًا ثانيًا');
  assert.equal(handlingLabel('piece'), 'بالقطعة');
  assert.equal(handlingLabel('خرافة'), 'خرافة', 'والمجهول يُعرض كما كُتب لا كـ«غير معروف»');
  for (const h of Object.values(HANDLING_TYPES)) assert.ok(h.labelAr && h.hint, `${h.id} بلا تسميةٍ أو شرح`);
});

test('أخطاء النموذج: مناولةٌ مجهولةٌ وسعةُ طبالٍ سالبة', () => {
  assert.match(locationProblems({ code: 'MAIN-A01', handling: 'خرافة' })[0], /نوع مناولة غير معروف/);
  assert.match(locationProblems({ code: 'MAIN-A01', capacity: { pallets: -2 } })[0], /لا تكون سالبة/);
  assert.deepEqual(locationProblems({ code: 'MAIN-A01', handling: 'pallet', capacity: { pallets: 2 } }), []);
});

test('★★★ إشغالُ الطبالي: بلا فهرسٍ مُمرَّرٍ لا علم — و`null` ليست صفرًا', () => {
  // ولماذا وسيطٌ لا استيراد؟ الاتّجاه المشروع واحد: الطبقةُ الجديدة تقرأ
  // القائم، والقائمُ لا يعرفها — فلا يُسقط عطبُ الأحدثِ الأقدمَ.
  const capped = { code: 'MAIN-A01', capacity: { qty: 100, pallets: 4 } };
  const blind = occupancyOf(capped, []);
  assert.equal(blind.usedPallets, null, 'لم يُمرَّر الفهرس ⇒ لا يُحسب امتلاءٌ من جهل');
  assert.equal(blind.remainingPallets, null);
  assert.equal(blind.capacityPallets, 4, 'والسقفُ المعلَنُ يُقرأ من الموقع نفسِه');

  const known = occupancyOf(capped, [], new Map([['MAIN-A01', [{}, {}, {}]]]));
  assert.equal(known.usedPallets, 3);
  assert.equal(known.remainingPallets, 1);
  assert.equal(known.palletPct, 75);

  const elsewhere = occupancyOf(capped, [], new Map([['MAIN-A09', [{}]]]));
  assert.equal(elsewhere.usedPallets, 0, 'الفهرسُ معلومٌ وهذا الرفّ خالٍ — صفرٌ لا جهل');
});

test('★★ «لا سقفَ ⇒ لا منع» تمتدّ إلى الطبالي حرفًا', () => {
  const loose = { code: 'MAIN-A01', status: 'active', capacity: { qty: 100, pallets: 0 } };
  const occ = occupancyOf(loose, [], new Map([['MAIN-A01', [{}, {}, {}, {}, {}]]]));
  assert.equal(occ.capacityPallets, null, 'صفرٌ = غير محدودة');
  assert.equal(occ.remainingPallets, null);
  assert.equal(canReceive(loose, 0, occ.usedPallets).ok, true, 'خمسُ طبالٍ في رفٍّ بلا سقفٍ لا تمنع سادسة');

  const capped = { code: 'MAIN-A01', status: 'active', capacity: { pallets: 2 } };
  assert.equal(canReceive(capped, 0, 1).ok, true);
  const verdict = canReceive(capped, 0, 2);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /بلغ سعته من الطبالي \(2\)/, 'ولكلّ رفضٍ سببُه المكتوب');
});

test('🔒★★★ النداءُ ثنائيُّ الوسائط لم يتبدّل: مستدعٍ لا يعرف الطبالي يحصل على حكم اليوم', () => {
  // `mapGrid` و`LocationTree` وغيرهما ينادون بوسيطين. فلو حاسبتهم سعةُ
  // الطبالي على فهرسٍ لم يمرّروه، لَامتلأ الرفّ في وجههم بلا سبب.
  const capped = { code: 'MAIN-A01', status: 'active', capacity: { qty: 100, pallets: 1 } };
  assert.deepEqual(canReceive(capped, 50), { ok: true, reason: '' });
  assert.deepEqual(canReceive(capped, 50, null), { ok: true, reason: '' });
  assert.equal(occupancyOf(capped, [at('MAIN-A01', 50)]).remainingQty, 50, 'وحقولُ الكمّيّة كما هي');
});

test('الشجرة تُبنى من الكود لا من حقل أب، والآباء الغائبون يُستنبطون', () => {
  const tree = buildLocationTree([
    { code: 'MAIN-A01-R01-B09' },
    { code: 'MAIN-A01' },
    { code: 'WH2-C01' },
  ]);
  assert.equal(tree.length, 2, 'جذران: MAIN-A01 و WH2-C01');
  const main = tree.find((n) => n.code === 'MAIN-A01');
  assert.equal(main.virtual, false);
  assert.equal(main.children[0].code, 'MAIN-A01-R01');
  assert.equal(main.children[0].virtual, true, 'الرفّ الوسيط غير مسجَّل فيُستنبط ولا يسقط ابنُه من الشجرة');
  assert.equal(main.children[0].children[0].code, 'MAIN-A01-R01-B09');
});
