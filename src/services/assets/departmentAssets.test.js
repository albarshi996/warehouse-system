/**
 * اختباراتُ جرد أصول الإدارات — وأثقلُها **أنّ الاستيرادَ لا يدهس**.
 *
 * فلو عاد أحدٌ يومًا فجعل الاستيرادَ يكتب فوق الرقم القائم (كما كانت الشاشةُ
 * تفعل في الذاكرة)، سقط اختبارُ «لا يدهس» وقال له أيَّ أصلٍ سيمحوه. وهو العطبُ
 * الذي لا يشتكي: استيرادٌ يُعاد بعد يومِ جردٍ يمحو عملَ اليوم كلِّه بلا صوت.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSET_NO_RE,
  isAssetNo,
  assetDocKey,
  assetVerdict,
  archiveVerdict,
  splitArchived,
  planAssetImport,
  describeImportPlan,
  assetFingerprint,
  workbookToAssetRows,
  readAssetFiles,
  splitImportFiles,
  writeErrorMessage,
  readErrorMessage,
  cloudChipState,
  reasonModalCopy,
  MAIN_SHEET,
  SKIP_SHEETS,
} from './departmentAssets.js';

const row = (over = {}) => ({
  id: '',
  assetType: 'حاسوب',
  assetName: 'حاسوب مكتبي',
  department: 'الموارد البشرية',
  qty: 1,
  ...over,
});

// ─── الهويّة ──────────────────────────────────────────────────────────────
test('الصيغةُ أربعةُ أرقامٍ بعد البادئة — لا أقلّ ولا أكثر', () => {
  assert.ok(isAssetNo('BRZ-0001'));
  assert.ok(isAssetNo('  BRZ-9999  '), 'المسافاتُ تُقصّ قبل الحكم');
  assert.ok(!isAssetNo('BRZ-1'));
  assert.ok(!isAssetNo('BRZ-00001'));
  assert.ok(!isAssetNo('brz-0001'), 'البادئةُ حسّاسةٌ للحالة');
  assert.ok(!isAssetNo(''));
  assert.ok(!isAssetNo(null));
  assert.ok(ASSET_NO_RE instanceof RegExp);
});

test('معرّفُ المستند هو الرقمُ نفسُه، والمشوَّهُ يرمي', () => {
  assert.equal(assetDocKey('BRZ-0012'), 'BRZ-0012');
  assert.equal(assetDocKey(' BRZ-0012 '), 'BRZ-0012');
  assert.throws(() => assetDocKey('12'), /مشوّه/);
  assert.throws(() => assetDocKey(''), /مشوّه/);
});

test('المعرّفُ لا يصطدم بمعرّفات فينسيا', () => {
  // فينسيا: `<المجموعة>-<الرقم>` مثل `issue-BRZ-0001`. وهذه: `BRZ-0001`.
  assert.throws(() => assetDocKey('issue-BRZ-0001'), /مشوّه/);
  assert.notEqual(assetDocKey('BRZ-0001'), 'issue-BRZ-0001');
});

// ─── الحكمُ على السجلّ ────────────────────────────────────────────────────
test('الحكمُ يُلزم النوعَ والاسمَ والإدارةَ والكمّيّة — بنفس إلزامات الشاشة', () => {
  assert.ok(assetVerdict(row()).ok);

  assert.deepEqual(assetVerdict(row({ assetType: '' })).problems, ['نوعُ الأصل مطلوب.']);
  assert.deepEqual(assetVerdict(row({ assetName: '   ' })).problems, ['اسمُ الأصل مطلوب.']);
  assert.deepEqual(assetVerdict(row({ department: '' })).problems, ['الإدارةُ مطلوبة.']);

  for (const bad of [0, -1, '', 'ثلاث', null]) {
    assert.ok(!assetVerdict(row({ qty: bad })).ok, `كمّيّةٌ مرفوضة: ${bad}`);
  }
  assert.ok(assetVerdict(row({ qty: '7' })).ok, 'نصُّ رقمٍ يُقرأ رقمًا');
});

test('الحكمُ يجمع كلَّ النواقص لا أوّلَها', () => {
  const v = assetVerdict({ qty: 0 });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 4);
});

test('رقمٌ مذكورٌ مشوَّهٌ يُرفض، وغيابُه لا يُرفض', () => {
  assert.ok(!assetVerdict(row({ id: '12' })).ok);
  assert.ok(assetVerdict(row({ id: '' })).ok, 'الغائبُ يُرقَّم لاحقًا فلا يُرفض');
});

// ─── التكهين ─────────────────────────────────────────────────────────────
test('التكهينُ بلا سببٍ مرفوض', () => {
  assert.ok(!archiveVerdict('').ok);
  assert.ok(!archiveVerdict('   ').ok);
  const v = archiveVerdict('  تلف نهائيّ  ');
  assert.ok(v.ok);
  assert.equal(v.reason, 'تلف نهائيّ', 'السببُ يُقصّ');
});

test('المكهَّنُ يُفصل عن الحيّ', () => {
  const { live, archived } = splitArchived([
    { id: 'BRZ-0001' },
    { id: 'BRZ-0002', archived: true },
    { id: 'BRZ-0003', archived: false },
  ]);
  assert.deepEqual(live.map((a) => a.id), ['BRZ-0001', 'BRZ-0003']);
  assert.deepEqual(archived.map((a) => a.id), ['BRZ-0002']);
  assert.deepEqual(splitArchived(null), { live: [], archived: [] });
});

// ─── ★★★ الاستيرادُ لا يدهس ───────────────────────────────────────────────
test('★★★ رقمٌ قائمٌ في القاعدة يُتخطّى ولا يُدهس', () => {
  const plan = planAssetImport([row({ id: 'BRZ-0001', assetName: 'لابتوب' })], [
    row({ id: 'BRZ-0001', assetName: 'طابعة واردةٌ من ملفّ' }),
    row({ id: 'BRZ-0002', assetName: 'كرسيّ' }),
  ]);
  assert.deepEqual(plan.toWrite.map((r) => r.key), ['BRZ-0002']);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].key, 'BRZ-0001');
  assert.equal(plan.skipped[0].reason, 'exists');
});

test('★★★ إعادةُ الاستيراد نفسِه عمليّةٌ آمنةٌ — صفرُ كتابة', () => {
  const rows = [row({ id: 'BRZ-0001' }), row({ id: 'BRZ-0002' })];
  const first = planAssetImport([], rows);
  assert.equal(first.toWrite.length, 2);

  const again = planAssetImport(first.toWrite, rows);
  assert.equal(again.toWrite.length, 0, 'لا كتابةَ ثانية');
  assert.equal(again.skipped.length, 2);
  assert.ok(again.skipped.every((s) => s.reason === 'exists'));
});

test('رقمٌ تكرّر داخل الملفّ: الأوّلُ يُكتب والثاني يُسمَّى', () => {
  const plan = planAssetImport([], [
    row({ id: 'BRZ-0005', assetName: 'الأوّل' }),
    row({ id: 'BRZ-0005', assetName: 'الثاني' }),
  ]);
  assert.equal(plan.toWrite.length, 1);
  assert.equal(plan.toWrite[0].assetName, 'الأوّل');
  assert.equal(plan.skipped[0].reason, 'duplicate');
  assert.equal(plan.skipped[0].key, 'BRZ-0005');
});

test('سجلٌّ بلا رقمٍ يُرقَّم، والترقيمُ يقفز فوق المحجوز', () => {
  const plan = planAssetImport([row({ id: 'BRZ-0003', assetName: 'قائم' })], [row(), row({ assetName: 'آخر' })]);
  assert.deepEqual(plan.toWrite.map((r) => r.key), ['BRZ-0004', 'BRZ-0005']);
  assert.equal(plan.assigned, 2);
  assert.equal(plan.nextNo, 6);
});

test('الترقيمُ لا يصطدم برقمٍ صريحٍ يأتي بعده في الدفعة نفسِها', () => {
  // ★ الحالةُ الخَبِثة: صفٌّ بلا رقمٍ يأخذ BRZ-0001، ثمّ صفٌّ صريحٌ بـBRZ-0001.
  const plan = planAssetImport([], [row({ assetName: 'بلا رقم' }), row({ id: 'BRZ-0001', assetName: 'صريح' })]);
  assert.equal(plan.toWrite[0].key, 'BRZ-0001');
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].reason, 'duplicate');
});

test('رقمٌ مشوَّهٌ يُرقَّم ولا يُهمَل — فالبياناتُ تدخل', () => {
  const plan = planAssetImport([], [row({ id: 'غير-صالح', assetName: 'مكتب' })]);
  assert.equal(plan.toWrite.length, 1);
  assert.equal(plan.toWrite[0].key, 'BRZ-0001');
  assert.equal(plan.toWrite[0].assetName, 'مكتب');
});

test('صفٌّ ناقصٌ يُتخطّى بسببٍ مذكور', () => {
  const plan = planAssetImport([], [row({ assetName: '' }), row()]);
  assert.equal(plan.toWrite.length, 1);
  assert.equal(plan.skipped[0].reason, 'invalid');
  assert.deepEqual(plan.skipped[0].problems, ['اسمُ الأصل مطلوب.']);
});

test('مدخلٌ فارغٌ أو معدومٌ لا يرمي', () => {
  assert.deepEqual(planAssetImport([], []).toWrite, []);
  assert.deepEqual(planAssetImport(null, null).toWrite, []);
  assert.deepEqual(planAssetImport(['BRZ-0001'], []).toWrite, [], 'ومفاتيحُ نصّيّةٌ مقبولةٌ تسامحًا');
});

test('القائمُ لا يُحسب مكرَّرًا مرّتين: القاعدةُ أسبقُ من الدفعة', () => {
  const plan = planAssetImport([row({ id: 'BRZ-0001' })], [row({ id: 'BRZ-0001' }), row({ id: 'BRZ-0001' })]);
  assert.equal(plan.toWrite.length, 0);
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['exists', 'exists']);
});

// ─── الجملةُ تسمّي المتخطَّى ──────────────────────────────────────────────
test('الجملةُ تسمّي الأرقامَ المتخطّاة لا عددَها وحدَه', () => {
  const plan = planAssetImport([row({ id: 'BRZ-0001' }), row({ id: 'BRZ-0002' })], [
    row({ id: 'BRZ-0001' }),
    row({ id: 'BRZ-0002' }),
    row({ id: 'BRZ-0009' }),
  ]);
  const said = describeImportPlan(plan);
  assert.match(said, /كُتب 1/);
  assert.match(said, /تُخطّي 2/);
  assert.match(said, /BRZ-0001/, 'الرقمُ المتخطَّى مذكورٌ بعينه');
  assert.match(said, /BRZ-0002/);
});

test('الجملةُ تقول كم رُقّم تلقائيًّا', () => {
  assert.match(describeImportPlan(planAssetImport([], [row(), row({ assetName: 'آخر' })])), /منها 2 رُقّم تلقائيًّا/);
});

test('الجملةُ تُختصر عند الكثرة ولا تصير صفحة', () => {
  const keys = Array.from({ length: 15 }, (_, i) => `BRZ-${String(i + 1).padStart(4, '0')}`);
  const plan = planAssetImport(keys.map((id) => row({ id })), keys.map((id) => row({ id })));
  const said = describeImportPlan(plan, { limit: 3 });
  assert.match(said, /و12 غيرها/);
});

test('الجملةُ تحتمل خطّةً معدومة', () => {
  assert.match(describeImportPlan(null), /كُتب 0/);
});

// ─── ★★★ الإعادةُ آمنةٌ لصفٍّ بلا رقم (أمسكه التشغيلُ الحيُّ لا اختبار) ────
test('★★★ صفٌّ بلا رقمٍ لا يُضاف نسخةً ثانيةً عند إعادة الاستيراد', () => {
  // العطبُ الحيّ: الصفُّ بلا رقمٍ يأخذ رقمًا جديدًا في كلّ مرّة، فأُعيد الملفّ
  // فصار «راوتر الطابق الثاني» أصلَين — لا دهسَ ولكنْ تضخُّمٌ صامت.
  const file = [row({ assetName: 'راوتر الطابق الثاني', assetType: 'راوتر', brand: 'TP-Link', serial: 'R-9' })];
  const first = planAssetImport([], file);
  assert.equal(first.toWrite.length, 1);
  assert.equal(first.toWrite[0].key, 'BRZ-0001');

  const again = planAssetImport(first.toWrite, file);
  assert.equal(again.toWrite.length, 0, 'لا نسخةَ ثانية');
  assert.equal(again.skipped[0].reason, 'exists');
  assert.equal(again.skipped[0].by, 'fingerprint');
});

test('★★★ والبصمةُ تُعدّ عدًّا: ثلاثةُ كراسٍ متماثلةٍ ثلاثةٌ أوّلَ مرّةٍ وصفرٌ بعدها', () => {
  const three = [1, 2, 3].map(() => row({ assetName: 'كرسيّ', assetType: 'كرسيّ' }));
  const first = planAssetImport([], three);
  assert.equal(first.toWrite.length, 3, 'الملفُّ يقول ثلاثةً فتُكتب ثلاثة');
  assert.deepEqual(first.toWrite.map((r) => r.key), ['BRZ-0001', 'BRZ-0002', 'BRZ-0003']);

  const again = planAssetImport(first.toWrite, three);
  assert.equal(again.toWrite.length, 0);

  // وملفٌّ بأربعةٍ على قاعدةٍ فيها ثلاثةٌ يكتب الرابعَ وحدَه.
  const four = [...three, row({ assetName: 'كرسيّ', assetType: 'كرسيّ' })];
  const more = planAssetImport(first.toWrite, four);
  assert.equal(more.toWrite.length, 1);
});

test('البصمةُ تُطبِّع المسافاتَ والحالة فلا تصنع أصلًا ثانيًا', () => {
  const a = { assetName: 'مكتب خشبيّ', assetType: 'مكتب', department: 'إدارة', brand: 'Ikea', serial: 'X1', qty: 1 };
  const b = { ...a, assetName: '  مكتب   خشبيّ ', brand: 'IKEA' };
  assert.equal(assetFingerprint(a), assetFingerprint(b));
  assert.equal(planAssetImport([{ ...a, id: 'BRZ-0001' }], [b]).toWrite.length, 0);
});

test('اختلافُ الإدارة أو السيريال يصنع أصلًا آخر', () => {
  const a = row({ assetName: 'مكتب', brand: 'Ikea', serial: 'X1' });
  for (const diff of [{ department: 'مالية' }, { serial: 'X2' }, { assetType: 'كرسيّ' }]) {
    const plan = planAssetImport([{ ...a, id: 'BRZ-0001' }], [{ ...a, ...diff }]);
    assert.equal(plan.toWrite.length, 1, `مختلفٌ في ${Object.keys(diff)[0]}`);
  }
});

test('ورقمٌ صريحٌ جديدٌ يُكتب ولو طابق بصمةَ قائم — فالرقمُ ادّعاءُ هويّةٍ صريح', () => {
  const a = row({ assetName: 'مكتب' });
  const plan = planAssetImport([{ ...a, id: 'BRZ-0001' }], [{ ...a, id: 'BRZ-0007' }]);
  assert.equal(plan.toWrite.length, 1);
  assert.equal(plan.toWrite[0].key, 'BRZ-0007');
});

test('الصفُّ بلا رقمٍ يُقال عددًا لا رقمًا — فلا رقمَ له ليُسمَّى', () => {
  const file = [row({ assetName: 'راوتر' })];
  const said = describeImportPlan(planAssetImport(planAssetImport([], file).toWrite, file));
  assert.match(said, /صفوفٌ بلا رقمٍ موجودةٌ أصلًا: 1/);
  assert.ok(!/: —/.test(said), 'ولا شرطةٌ مذكورةٌ مكانَ رقم');
  assert.ok(!said.includes('لم تُدهَس'), 'ولا يُحسب في «أرقامٌ قائمة» فلا رقمَ له');
});

// ─── قراءةُ المصنَّف (XLSX مُحقَنةٌ لا مستوردة) ─────────────────────────────
const calls = [];
const spy = (sheet, dept) => { calls.push([sheet, dept]); return [{ sheet, dept }]; };

test('ورقةُ «جرد الأصول» إن وُجدت هي المصدرُ وحدَها', () => {
  calls.length = 0;
  const out = workbookToAssetRows(
    { Sheets: { [MAIN_SHEET]: 'MAIN', 'الموارد البشرية': 'HR' }, SheetNames: [MAIN_SHEET, 'الموارد البشرية'] },
    spy
  );
  assert.deepEqual(calls, [['MAIN', null]], 'لا تُقرأ ورقةٌ أخرى');
  assert.deepEqual(out, [{ sheet: 'MAIN', dept: null }]);
});

test('بلا الورقة الجامعة: كلُّ ورقةٍ إدارةٌ باسمها', () => {
  calls.length = 0;
  workbookToAssetRows({ Sheets: { تقنية: 'A', مالية: 'B' }, SheetNames: ['تقنية', 'مالية'] }, spy);
  assert.deepEqual(calls, [['A', 'تقنية'], ['B', 'مالية']]);
});

test('ورقةُ الملخّص لا تُقرأ — وإلّا قُرئ التصديرُ أصولًا', () => {
  calls.length = 0;
  workbookToAssetRows(
    { Sheets: { [SKIP_SHEETS[0]]: 'SUM', تقنية: 'A' }, SheetNames: [SKIP_SHEETS[0], 'تقنية'] },
    spy
  );
  assert.deepEqual(calls, [['A', 'تقنية']]);
});

test('اسمُ ورقةٍ بلا جسدٍ يُتخطّى، ومصنَّفٌ معدومٌ لا يرمي', () => {
  calls.length = 0;
  assert.deepEqual(workbookToAssetRows({ Sheets: {}, SheetNames: ['وهم'] }, spy), []);
  assert.deepEqual(workbookToAssetRows(null, spy), []);
  assert.deepEqual(calls, []);
});

test('قارئٌ يُعيد معدومًا لا يُسقط الصفوف', () => {
  assert.deepEqual(workbookToAssetRows({ Sheets: { أ: 'A' }, SheetNames: ['أ'] }, () => null), []);
});

// ─── قراءةُ الملفّات على دفعات ────────────────────────────────────────────
test('تُقرأ كلُّ الملفّات، والدفعاتُ تسلّم الخيط', () => {
  const files = Array.from({ length: 7 }, (_, i) => ({ name: `f${i}.xlsx` }));
  let yields = 0;
  return readAssetFiles(files, {
    readRows: (f) => [{ from: f.name }],
    batch: 3,
    yieldFn: async () => { yields += 1; },
  }).then(({ rows, unreadable }) => {
    assert.equal(rows.length, 7);
    assert.equal(unreadable, 0);
    assert.equal(yields, 3, 'ثلاثُ دفعاتٍ لسبعةِ ملفّاتٍ بحدّ ثلاثة');
  });
});

test('★ ملفٌّ تالفٌ يُعدّ ولا يُسقط الباقي', async () => {
  const { rows, unreadable } = await readAssetFiles(
    [{ name: 'a.xlsx' }, { name: 'bad.xlsx' }, { name: 'c.xlsx' }],
    { readRows: (f) => { if (f.name === 'bad.xlsx') throw new Error('تالف'); return [{ from: f.name }]; } }
  );
  assert.deepEqual(rows.map((r) => r.from), ['a.xlsx', 'c.xlsx']);
  assert.equal(unreadable, 1);
});

test('قارئٌ يُعيد ما ليس مصفوفةً يُحسب تعذُّرًا', async () => {
  const { rows, unreadable } = await readAssetFiles([{ name: 'a.xlsx' }], { readRows: () => undefined });
  assert.deepEqual(rows, []);
  assert.equal(unreadable, 1);
});

test('بلا ملفّاتٍ: صفرٌ وصفر', async () => {
  assert.deepEqual(await readAssetFiles([], { readRows: () => [] }), { rows: [], unreadable: 0 });
  assert.deepEqual(await readAssetFiles(null, { readRows: () => [] }), { rows: [], unreadable: 0 });
});

test('الامتدادُ يُفصل بلا حسٍّ للحالة', () => {
  const { ok, bad } = splitImportFiles([
    { name: 'a.XLSX' }, { name: 'b.xls' }, { name: 'c.csv' }, { name: 'd' },
  ]);
  assert.deepEqual(ok.map((f) => f.name), ['a.XLSX', 'b.xls']);
  assert.deepEqual(bad.map((f) => f.name), ['c.csv', 'd']);
});

// ─── النصوص ──────────────────────────────────────────────────────────────
test('رفضُ الصلاحيّة يُترجَم ولا يُعرض رمزًا', () => {
  assert.match(writeErrorMessage({ code: 'permission-denied' }), /يقرأ هذه الشاشة ولا يكتب/);
  assert.ok(!writeErrorMessage({ code: 'permission-denied' }).includes('permission'));
  assert.match(writeErrorMessage({ code: 'unavailable' }), /لا اتّصال/);
  assert.equal(writeErrorMessage({ message: 'الأصل ناقص' }), 'الأصل ناقص');
  assert.equal(writeErrorMessage(null), 'تعذّرت الكتابة.');
});

test('رفضُ القراءة يُترجَم كذلك', () => {
  assert.match(readErrorMessage({ code: 'permission-denied' }), /رفضت القراءة/);
  assert.match(readErrorMessage({ code: 'unavailable' }), /تعذّر الاتّصال/);
});

test('شارةُ السحابة: الصلاحيّةُ أسبقُ من الطابور', () => {
  assert.deepEqual(cloudChipState({ canWrite: false, hasPending: true }).state, 'denied');
  assert.deepEqual(cloudChipState({ canWrite: true, hasPending: true }).state, 'pending');
  assert.deepEqual(cloudChipState({ canWrite: true, hasPending: false }).state, 'online');
});

test('★ نافذةُ التكهين تقول «ولا تُحذف» — والقاعدةُ تمنع الحذف فعلًا', () => {
  const a = reasonModalCopy('archive', 'BRZ-0001 — مكتب');
  assert.match(a.lead, /BRZ-0001 — مكتب/);
  assert.match(a.lead, /ولا تُحذف/);
  assert.equal(a.confirm, 'كهّن');
  assert.equal(a.danger, true);

  const r = reasonModalCopy('restore', 'BRZ-0001');
  assert.match(r.lead, /يعود/);
  assert.equal(r.confirm, 'أرجِع');
  assert.equal(r.danger, false);
  assert.notEqual(a.placeholder, r.placeholder);
});
