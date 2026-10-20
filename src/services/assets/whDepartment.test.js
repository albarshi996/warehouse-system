/**
 * اختباراتُ أصول إدارة المستودعات وعهدِها.
 *
 * وأثقلُ ما هنا ثلاثة: **ما يشبه الإدارةَ ولا يُطابق لا يختفي** · و**عهدةٌ
 * ترقِّم أصلًا غيرَ موجودٍ تُقال** · و**عهدتان مفتوحتان لنفس الجهاز تناقضٌ
 * يُعلَن** لا يُختار أحدُهما صامتًا. كلُّها أخطاءٌ لا تشتكي إن مرّت.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EQUIPMENT_KINDS,
  WH_DEPARTMENT_LABEL,
  WH_DEPARTMENT_VALUES,
  cleanSpecs,
  custodyHistory,
  custodyIndex,
  describeSpecs,
  equipmentKind,
  equipmentLabel,
  filterWh,
  holderOf,
  isNearDepartment,
  isOpenCustody,
  linkReport,
  matchesWhDepartment,
  normDept,
  specFields,
  specVerdict,
  splitByDepartment,
  whSnapshot,
} from './whDepartment.js';

const asset = (over = {}) => ({
  id: 'BRZ-0001',
  assetName: 'جهاز مسح باركود',
  assetType: 'معدّة',
  brand: 'Zebra',
  serial: 'ZB-77',
  qty: 1,
  condition: 'جيد',
  responsible: '',
  department: 'مخازن',
  section: '',
  location: 'المستودع',
  notes: '',
  equipmentKind: 'handheld',
  specs: { model: 'TC21', serial: 'ZB-77', imei: '3561', os: 'Android 11' },
  ...over,
});

const custody = (over = {}) => ({
  number: 'CUST-2026-0001',
  employeeName: 'أحمد الشريف',
  itemKind: 'جهاز مسح باركود (PDA)',
  itemDesc: 'Zebra TC21',
  state: 'active',
  issueDate: '2026-10-01',
  assetNo: 'BRZ-0001',
  ...over,
});

// ── الإدارة ──────────────────────────────────────────────────────────────

test('قيمُ الإدارة مجمّدةٌ ومعها اسمٌ معروض', () => {
  assert.equal(WH_DEPARTMENT_LABEL, 'إدارة المستودعات');
  assert.ok(Object.isFrozen(WH_DEPARTMENT_VALUES));
  assert.ok(WH_DEPARTMENT_VALUES.includes('مخازن'));
  assert.ok(WH_DEPARTMENT_VALUES.includes('إدارة السلاسل والإمداد والمخازن'));
});

test('★ والتطبيعُ يتجاوز الهمزةَ والتاءَ المربوطةَ والفراغاتِ الزائدة', () => {
  assert.equal(normDept('  إدارة   المستودعات '), normDept('اداره المستودعات'));
  assert.equal(normDept('المخازن'), 'المخازن');
  assert.ok(matchesWhDepartment({ department: ' ادارة المستودعات ' }));
  assert.ok(matchesWhDepartment({ department: 'إدارة السلاسل والإمداد والمخازن' }));
  assert.equal(matchesWhDepartment({ department: 'تقنية' }), false);
  assert.equal(matchesWhDepartment({ department: '' }), false);
});

test('★★★ وما يشبه الإدارةَ ولا يُطابق يُعرَض للتصحيح — لا يختفي', () => {
  assert.ok(isNearDepartment({ department: 'مخزن فينسيا' }));
  assert.ok(isNearDepartment({ department: 'السلاسل والإمداد' }));
  assert.equal(isNearDepartment({ department: 'مخازن' }), false, 'المطابقُ ليس قريبًا');
  assert.equal(isNearDepartment({ department: 'تسويق' }), false);
});

test('والقسمةُ ثلاثٌ: داخلٌ وقريبٌ وخارج', () => {
  const rows = [
    asset({ id: 'BRZ-0001', department: 'مخازن' }),
    asset({ id: 'BRZ-0002', department: 'إدارة السلاسل والإمداد والمخازن' }),
    asset({ id: 'BRZ-0003', department: 'مخزن فينسيا' }),
    asset({ id: 'BRZ-0004', department: 'تقنية' }),
  ];
  const s = splitByDepartment(rows);
  assert.deepEqual(s.inside.map((a) => a.id), ['BRZ-0001', 'BRZ-0002']);
  assert.deepEqual(s.nearMiss.map((a) => a.id), ['BRZ-0003']);
  assert.deepEqual(s.outside.map((a) => a.id), ['BRZ-0004']);
});

test('★ وقيمُ الإدارة تُمرَّر فتتوسّع بلا تعديل كود', () => {
  const rows = [asset({ department: 'إدارة النقل' })];
  assert.equal(splitByDepartment(rows).inside.length, 0);
  assert.equal(splitByDepartment(rows, ['إدارة النقل']).inside.length, 1);
});

// ── المعدّات ─────────────────────────────────────────────────────────────

test('أنواعُ المعدّات بيانٌ لا كود، ولكلٍّ حقولُه', () => {
  assert.ok(EQUIPMENT_KINDS.length >= 9);
  assert.ok(Object.isFrozen(EQUIPMENT_KINDS));
  assert.equal(equipmentLabel('rack'), 'رفّ تخزين');
  assert.equal(equipmentLabel('pallet'), 'طبليّة');
  assert.equal(equipmentLabel('handheld'), 'جهاز مسح محمول (PDA)');
  assert.equal(specFields('handheld').map((f) => f.key).join(','), 'model,serial,imei,os');
  assert.equal(specFields('other').length, 0);
});

test('★ والمجهولُ لا يُفترض «أخرى» — يُقال غيرَ محدَّد', () => {
  assert.equal(equipmentKind('nope'), null);
  assert.equal(equipmentLabel('nope'), 'غير محدَّد');
  assert.deepEqual(specFields('nope'), []);
});

test('والمواصفاتُ تُنقّى على حقول النوع — فما لا ينتمي لا يُخزَّن', () => {
  const clean = cleanSpecs('pallet', { palletType: ' خشب ', dims: '', imei: '999', junk: 'x' });
  assert.deepEqual(clean, { palletType: 'خشب' });
});

test('والحقولُ الرقميّةُ أرقامٌ غيرُ سالبة، ولا حقلَ مطلوب', () => {
  assert.deepEqual(specVerdict('rack', { levels: '4', capacityKg: '800' }), { ok: true, problems: [] });
  assert.deepEqual(specVerdict('rack', {}), { ok: true, problems: [] }, 'الفراغُ يمرّ — التفاصيلُ تُستكمل');
  assert.equal(specVerdict('rack', { levels: 'أربعة' }).ok, false);
  assert.equal(specVerdict('rack', { capacityKg: '-5' }).ok, false);
  assert.equal(specVerdict('nope', {}).ok, false);
});

test('ووصفُ المواصفات نصٌّ مرتّبٌ بحقولها', () => {
  assert.equal(
    describeSpecs('handheld', { model: 'TC21', imei: '3561' }),
    'الموديل: TC21 · IMEI: 3561'
  );
  assert.equal(describeSpecs('other', {}), '');
});

// ── العهد ────────────────────────────────────────────────────────────────

test('الفهرسُ يربط العهدةَ برقم الأصل، وبلا رقمٍ لا تدخله', () => {
  const idx = custodyIndex([custody(), custody({ number: 'CUST-2', assetNo: '' })]);
  assert.equal(idx.size, 1);
  assert.equal(idx.get('BRZ-0001').length, 1);
});

test('★★★ ومن يحمل الأصلَ الآن: العهدةُ المفتوحة وحدَها', () => {
  const idx = custodyIndex([custody()]);
  const h = holderOf(asset(), idx);
  assert.equal(h.employeeName, 'أحمد الشريف');
  assert.equal(h.conflict, 0);
  // والمغلقةُ لا تجعل الجهازَ محمولًا
  const closed = custodyIndex([custody({ state: 'returned' })]);
  assert.equal(holderOf(asset(), closed), null);
  assert.ok(isOpenCustody(custody()) && !isOpenCustody(custody({ state: 'lost' })));
});

test('★★★ وعهدتان مفتوحتان لنفس الجهاز تناقضٌ يُعلَن لا يُختار أحدُهما صامتًا', () => {
  const idx = custodyIndex([custody(), custody({ number: 'CUST-2', employeeName: 'خالد' })]);
  const h = holderOf(asset(), idx);
  assert.equal(h.conflict, 2, 'العددُ يُقال فتُعرض المشكلةُ في الشاشة');
});

test('وتاريخُ الحَمَلة الأحدثُ أوّلًا — فالتتبّعُ يشمل من حمله سابقًا', () => {
  const idx = custodyIndex([
    custody({ number: 'CUST-1', issueDate: '2026-01-01', state: 'returned', employeeName: 'سراج' }),
    custody({ number: 'CUST-2', issueDate: '2026-10-01', employeeName: 'أحمد' }),
  ]);
  assert.deepEqual(custodyHistory(asset(), idx).map((c) => c.employeeName), ['أحمد', 'سراج']);
});

test('★★★ وعهدةٌ ترقِّم أصلًا غيرَ موجودٍ في الجرد تُقال — سندٌ موقَّعٌ على مجهول', () => {
  const r = linkReport([asset()], [custody(), custody({ number: 'CUST-9', assetNo: 'BRZ-9999' })]);
  assert.deepEqual(r.danglingAssetNos, ['BRZ-9999']);
});

test('★★ وعهدةٌ مفتوحةٌ بلا رقمِ أصلٍ تُعدّ غيرَ مرتبطة — لا يُعرف أيَّ جهازٍ تخصّ', () => {
  const r = linkReport([asset()], [custody({ number: 'CUST-3', assetNo: '' })]);
  assert.equal(r.unlinked.length, 1);
  assert.equal(r.free.length, 1, 'والأصلُ يبقى بلا حامل');
  // والمغلقةُ بلا رقمٍ لا تُحتسب معلَّقة
  assert.equal(linkReport([asset()], [custody({ assetNo: '', state: 'returned' })]).unlinked.length, 0);
});

test('وتقريرُ الربط يفرز المحمولَ عن الحرّ', () => {
  const rows = [asset({ id: 'BRZ-0001' }), asset({ id: 'BRZ-0002' })];
  const r = linkReport(rows, [custody()]);
  assert.deepEqual(r.held.map((a) => a.id), ['BRZ-0001']);
  assert.deepEqual(r.free.map((a) => a.id), ['BRZ-0002']);
});

// ── اللقطة والتصفية ──────────────────────────────────────────────────────

test('اللقطةُ تحصر الإدارةَ وتعدّ المحمولَ والمعلَّقَ والقريب', () => {
  const rows = [
    asset({ id: 'BRZ-0001', department: 'مخازن' }),
    asset({ id: 'BRZ-0002', department: 'مخازن', equipmentKind: 'rack' }),
    asset({ id: 'BRZ-0003', department: 'مخازن', archived: true }),
    asset({ id: 'BRZ-0004', department: 'مخزن فينسيا' }),
    asset({ id: 'BRZ-0005', department: 'تقنية' }),
  ];
  const snap = whSnapshot(rows, [custody(), custody({ number: 'CUST-4', assetNo: '' })]);
  assert.equal(snap.assets, 2, 'المكهَّنُ خارجَ العدّ');
  assert.equal(snap.archived, 1);
  assert.equal(snap.nearMiss, 1);
  assert.equal(snap.held, 1);
  assert.equal(snap.free, 1);
  assert.equal(snap.unlinkedCustodies, 1);
  assert.deepEqual(snap.byKind.map(([k]) => k).sort(), ['handheld', 'rack']);
});

test('التصفية: بحثٌ حرٌّ ونوعٌ وحالةٌ وحاملٌ ومحمولٌ وحرّ', () => {
  const rows = [
    asset({ id: 'BRZ-0001' }),
    asset({ id: 'BRZ-0002', equipmentKind: 'rack', assetName: 'رفّ ثقيل', specs: { bay: 'A3' } }),
  ];
  const idx = custodyIndex([custody()]);
  assert.equal(filterWh(rows, {}, idx).length, 2);
  assert.equal(filterWh(rows, { kind: 'rack' }, idx).length, 1);
  assert.equal(filterWh(rows, { heldOnly: true }, idx).length, 1);
  assert.equal(filterWh(rows, { freeOnly: true }, idx).length, 1);
  assert.equal(filterWh(rows, { holder: 'أحمد' }, idx).length, 1);
  assert.equal(filterWh(rows, { q: 'A3' }, idx).length, 1, 'والبحثُ يبلغ المواصفات');
  assert.equal(filterWh(rows, { q: 'أحمد' }, idx).length, 1, 'ويبلغ اسمَ الحامل');
  assert.equal(filterWh(rows, { q: 'رفّ تخزين' }, idx).length, 1, 'ويبلغ اسمَ النوع');
});

test('★ والمكهَّنُ مستثنًى افتراضًا ويُطلب صريحًا', () => {
  const rows = [asset(), asset({ id: 'BRZ-0002', archived: true })];
  assert.equal(filterWh(rows, {}).length, 1);
  assert.equal(filterWh(rows, { includeArchived: true }).length, 2);
});
