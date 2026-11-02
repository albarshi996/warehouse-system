/**
 * اختبارات بُعد القطاع (ق) — متعامدٌ مع المحلّ، مُشتقٌّ من فئة الصنف، اختياريّ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sectorOfItem,
  listSectors,
  filterItemsBySector,
  sectorOfDoc,
  sectorRollup,
  sectorLabel,
  UNCLASSIFIED,
  MIXED,
} from './sectorDimension.js';

test('★ قطاعُ الصنف: أوّلُ حقلِ تصنيفٍ مملوء بالأولويّة، أو «غير مصنّف»', () => {
  assert.equal(sectorOfItem({ department: 'أغذية', family: 'ألبان' }), 'أغذية', 'القسمُ أعمُّ من العائلة');
  assert.equal(sectorOfItem({ family: 'عناية' }), 'عناية', 'يسقط إلى العائلة');
  assert.equal(sectorOfItem({ category: 'منظّفات' }), 'منظّفات');
  assert.equal(sectorOfItem({ sector: 'خاصّ', department: 'أغذية' }), 'خاصّ', 'الصريحُ يفوز (توافقٌ أماميّ)');
  assert.equal(sectorOfItem({ nameAr: 'صنف' }), '', 'بلا تصنيفٍ = غير مصنّف، لا يُخترع');
});

test('★ سردُ القطاعات مرتّبًا مع عدّ غير المصنّف', () => {
  const r = listSectors([{ department: 'أغذية' }, { department: 'مستحضرات' }, { department: 'أغذية' }, { nameAr: 'س' }]);
  assert.deepEqual(r.sectors, ['أغذية', 'مستحضرات']);
  assert.equal(r.unclassified, 1);
});

test('★★ الترشيحُ بالقطاع متعامدٌ: يعمل مستقلًّا، و«» = الكلّ، و«غير مصنّف» منفصل', () => {
  const items = [{ sku: 'a', department: 'أغذية' }, { sku: 'b', department: 'مستحضرات' }, { sku: 'c' }];
  assert.equal(filterItemsBySector(items, '').length, 3, 'بلا ترشيحٍ = الكلّ');
  assert.deepEqual(filterItemsBySector(items, 'أغذية').map((i) => i.sku), ['a']);
  assert.deepEqual(filterItemsBySector(items, UNCLASSIFIED).map((i) => i.sku), ['c']);
});

test('★★ قطاعُ المستند من بنوده: واحدٌ ⇒ هو، متعدّدٌ ⇒ MIXED، لا شيءَ ⇒ ""', () => {
  const index = { A: 'أغذية', B: 'مستحضرات' };
  const resolve = (sku) => index[sku] || '';
  assert.equal(sectorOfDoc({ lines: [{ sku: 'A' }, { sku: 'A' }] }, resolve), 'أغذية');
  assert.equal(sectorOfDoc({ lines: [{ sku: 'A' }, { sku: 'B' }] }, resolve), MIXED);
  assert.equal(sectorOfDoc({ lines: [{ sku: 'Z' }] }, resolve), '');
  assert.equal(sectorOfDoc({ header: { sector: 'صريح' }, lines: [{ sku: 'A' }] }, resolve), 'صريح', 'الصريحُ يفوز');
  assert.equal(sectorOfDoc({ lines: [{ category: 'أغذية' }] }), 'أغذية', 'فئةُ البند مباشرةً إن حملها');
});

test('★★★ التجميعُ بالقطاع متعامدٌ مع المحلّ: ترشيحٌ بالمحلّ ثمّ تجميعٌ بالقطاع', () => {
  const rows = [
    { department: 'أغذية', shop: 'S1', val: 100 },
    { department: 'أغذية', shop: 'S2', val: 40 },
    { department: 'مستحضرات', shop: 'S1', val: 60 },
    { nameAr: 'س', shop: 'S1', val: 10 },
  ];
  const opts = { measureOf: (r) => r.val, shopOf: (r) => r.shop };

  // عبر كلّ المحلّات: القطاعُ يصنّف مستقلًّا عن المحلّ.
  const all = sectorRollup(rows, opts);
  assert.equal(all.find((r) => r.sector === 'أغذية').total, 140, 'الأغذيةُ عبر المحلّين');
  assert.equal(all.find((r) => r.sector === UNCLASSIFIED).total, 10);

  // محلُّ S1 وحدَه: نفسُ القطاعات مرشَّحةً بالمحلّ (البُعدان مستقلّان).
  const s1 = sectorRollup(rows, { ...opts, shop: 'S1' });
  assert.equal(s1.find((r) => r.sector === 'أغذية').total, 100, 'أغذيةُ S1 وحدَها');
  assert.equal(s1.find((r) => r.sector === 'مستحضرات').total, 60);
});

test('★ اسمُ العرض يترجم الرمزين الخاصّين ويُبقي الحرَّ', () => {
  assert.equal(sectorLabel(''), 'غير مصنّف');
  assert.equal(sectorLabel(UNCLASSIFIED), 'غير مصنّف');
  assert.equal(sectorLabel(MIXED), 'متعدّد القطاعات');
  assert.equal(sectorLabel('أغذية'), 'أغذية');
});
