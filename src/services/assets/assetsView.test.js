/**
 * اختباراتُ HTML جرد الأصول — ثلاثةُ حرّاسٍ لثلاثة أعطابٍ لا يراها اختبارُ
 * منطقٍ ولا تراها عينٌ في جردٍ عربيٍّ نظيف:
 *
 *   ① **التهريب** في موضعين بمهرِّبَين مختلفين (`innerHTML` و`onclick='…'`).
 *   ② **حصرُ الكتابة**: زرٌّ يُرسم لقارئٍ يُرفَض عند ضغطه فيُقرأ عطبًا.
 *   ③ **علامةُ المكهَّن**: أصلٌ خارجٌ يُعرض كالقائم يُصدَّق جردًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  conditionBadge,
  archivedTag,
  archivedWhy,
  rowActions,
  tableRowsHtml,
  cardsHtml,
  countLineHtml,
  deptBarsHtml,
  printRowsHtml,
  FORM_FIELDS,
  missingFormFields,
} from './assetsView.js';
import { assetVerdict } from './departmentAssets.js';

const asset = (over = {}) => ({
  id: 'BRZ-0001', assetType: 'حاسوب', assetName: 'حاسوب مكتبي', brand: 'Dell',
  serial: 'SN-9', qty: 2, condition: 'جيد', responsible: 'أحمد',
  department: 'تقنية', section: 'الشبكات', location: 'المبنى', receivedDate: '2026-01-15',
  notes: '', archived: false, archiveReason: '', ...over,
});

// ─── ① التهريب ───────────────────────────────────────────────────────────
test('★ اسمٌ فيه وسمٌ يُهرَّب ولا يُحقن', () => {
  const html = tableRowsHtml([asset({ assetName: '<img src=x onerror=alert(1)>' })], false);
  assert.ok(!html.includes('<img'), 'لا وسمَ حيًّا');
  assert.match(html, /&lt;img/);
});

test('★★ رقمٌ فيه مفردةٌ يُهرَّب لسياق `onclick` — ومهرِّبه غيرُ مهرِّب النصّ', () => {
  const html = tableRowsHtml([asset({ id: "BRZ-'0001" })], true);
  // لا تُغلق المفردةُ سمةَ onclick مبكّرًا
  assert.ok(!html.includes("openArchModal('BRZ-'0001')"), 'المفردةُ لا تخرج من السمة');
  assert.match(html, /openArchModal\('BRZ-&#39;0001'\)|openArchModal\('BRZ-\\&#39;0001'\)/);
});

test('سببُ تكهينٍ فيه وسمٌ يُهرَّب', () => {
  const html = archivedWhy(asset({ archived: true, archiveReason: '<b>تلف</b>' }));
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&lt;b&gt;تلف/);
});

// ─── ② حصرُ الكتابة ──────────────────────────────────────────────────────
test('★★★ القارئُ لا يرى زرَّ تكهينٍ ولا تعديل', () => {
  const html = tableRowsHtml([asset()], false);
  assert.ok(!html.includes('openArchModal'), 'لا زرَّ تكهين');
  assert.ok(!html.includes('startEdit'), 'لا زرَّ تعديل');
  assert.match(html, /قراءة/, 'ويُقال له إنّه قارئ');
});

test('الكاتبُ يرى التعديلَ والتكهين', () => {
  const html = tableRowsHtml([asset()], true);
  assert.match(html, /startEdit\('BRZ-0001'\)/);
  assert.match(html, /openArchModal\('BRZ-0001'\)/);
  assert.ok(!html.includes('openRestoreModal'), 'القائمُ لا يُرجَع');
});

test('المكهَّنُ يُرجَع ولا يُعدَّل ولا يُكهَّن ثانيًا', () => {
  const html = tableRowsHtml([asset({ archived: true, archiveReason: 'تلف' })], true);
  assert.match(html, /openRestoreModal\('BRZ-0001'\)/);
  assert.ok(!html.includes('openArchModal'));
  assert.ok(!html.includes('startEdit'));
});

test('بطاقةُ القارئ بلا شريطِ أزرارٍ أصلًا', () => {
  assert.ok(!cardsHtml([asset()], false).includes('card-actions'));
  assert.match(cardsHtml([asset()], true), /card-actions/);
});

test('أزرارُ البطاقة بنصٍّ وأزرارُ الجدول بأيقونة', () => {
  assert.match(rowActions(asset(), true, { compact: false }), /✎ تعديل/);
  assert.ok(!rowActions(asset(), true, { compact: true }).includes('✎ تعديل'));
  assert.equal(rowActions(asset(), false, { compact: false }), '', 'بطاقةُ القارئ لا تقول «قراءة» مرّتين');
});

// ─── ③ علامةُ المكهَّن ───────────────────────────────────────────────────
test('★★★ المكهَّنُ معلَّمٌ في الجدول والبطاقة معًا', () => {
  const a = asset({ archived: true, archiveReason: 'نُقل لشركةٍ أخرى' });
  for (const html of [tableRowsHtml([a], true), cardsHtml([a], true)]) {
    assert.match(html, /مكهَّن/, 'الوسمُ ظاهر');
    assert.match(html, /is-archived/, 'والصفُّ مميَّز');
    assert.match(html, /سببُ التكهين: نُقل لشركةٍ أخرى/, 'والسببُ مكتوب');
  }
});

test('القائمُ بلا وسمٍ ولا سببٍ ولا صنفٍ', () => {
  const html = tableRowsHtml([asset()], true);
  assert.ok(!html.includes('مكهَّن'));
  assert.ok(!html.includes('arch-why'));
  assert.ok(!html.includes('is-archived'));
});

test('مكهَّنٌ بلا سببٍ مكتوبٍ لا يطبع سطرًا فارغًا', () => {
  assert.equal(archivedWhy(asset({ archived: true, archiveReason: '' })), '');
  assert.equal(archivedTag(asset()), '');
});

// ─── البقيّة ─────────────────────────────────────────────────────────────
test('الشارةُ تأخذ صنفَ الحالة، والمجهولُ يقع على «جيد»', () => {
  assert.match(conditionBadge('معطل'), /badge-broken/);
  assert.match(conditionBadge('حالةٌ لا نعرفها'), /badge-good/);
  assert.match(conditionBadge(''), /—/);
});

test('الفراغاتُ تُعرض شرطةً لا فراغًا', () => {
  const html = tableRowsHtml([asset({ brand: '', serial: '', responsible: '' })], false);
  assert.ok(html.includes('—'));
});

test('★ سطرُ العدّ يقول كم مكهَّنًا أُخفي', () => {
  assert.match(countLineHtml({ shown: 5, base: 10, hidden: 3 }), /3 مكهَّنٌ مخفيّ/);
  assert.ok(!countLineHtml({ shown: 5, base: 10, hidden: 0 }).includes('مخفيّ'));
  assert.match(countLineHtml({ shown: 5, base: 10, hidden: 0 }), /عرض <strong>5<\/strong> من <strong>10<\/strong>/);
});

test('عرضُ الشريط نسبةٌ من الأكبر — فإدارةٌ واحدةٌ تملأ عمودَها', () => {
  assert.match(deptBarsHtml([['تقنية', 4]]), /width:100%/);
  const two = deptBarsHtml([['تقنية', 4], ['مالية', 2]]);
  assert.match(two, /width:100%/);
  assert.match(two, /width:50%/);
});

test('توزيعٌ فارغٌ لا يرمي ولا يُقسم على صفر', () => {
  assert.equal(deptBarsHtml([]), '');
  assert.equal(deptBarsHtml(null), '');
});

test('صفوفُ الطباعة تحمل الأعمدةَ الثلاثةَ عشرَ كلَّها', () => {
  const html = printRowsHtml([asset({ notes: 'ملاحظة' })]);
  assert.equal((html.match(/<td/g) || []).length, 13);
  assert.match(html, /ملاحظة/);
  assert.match(html, /الشبكات/, 'والقسمُ من أعمدة الطباعة وحدها');
});

test('قوائمُ فارغةٌ تُعيد نصًّا فارغًا لا «undefined»', () => {
  for (const fn of [tableRowsHtml, cardsHtml, printRowsHtml]) {
    assert.equal(fn([], true), '');
    assert.equal(fn(null, true), '');
  }
});

// ─── خريطةُ حقول النموذج ─────────────────────────────────────────────────
test('★★★ الخريطةُ تغطّي شكلَ السجلّ كلَّه — فحقلٌ ينقصها يحمل قيمةَ الأصل السابق', () => {
  const keys = FORM_FIELDS.map((f) => f.key);
  const shape = [
    'assetType', 'assetName', 'brand', 'serial', 'qty', 'condition',
    'responsible', 'department', 'section', 'location', 'receivedDate', 'notes',
  ];
  assert.deepEqual([...keys].sort(), [...shape].sort());
  assert.equal(new Set(keys).size, keys.length, 'لا حقلَ مرّتين');
  assert.equal(new Set(FORM_FIELDS.map((f) => f.id)).size, FORM_FIELDS.length, 'ولا مُعرِّفَ مرّتين');
});

test('الإلزاميّةُ هي بعينها ما يرفضه حكمُ السجلّ', () => {
  // ★ المرساة: لو أُلزم حقلٌ في الشاشة ولم يُلزَم في الحكم (أو العكس) لَقال
  // أحدُهما «تمّ» والآخرُ «ناقص» — فيُرفض الحفظُ بلا حقلٍ معلَّمٍ بالحمرة.
  const required = FORM_FIELDS.filter((f) => f.required).map((f) => f.key);
  assert.deepEqual([...required].sort(), ['assetName', 'assetType', 'department', 'qty'].sort());
  for (const key of required) {
    const full = { assetType: 'حاسوب', assetName: 'اسم', department: 'تقنية', qty: 1 };
    full[key] = key === 'qty' ? 0 : '';
    assert.ok(!assetVerdict(full).ok, `الحكمُ يرفض غيابَ ${key}`);
    assert.ok(missingFormFields(full).length > 0, `والشاشةُ تعلّم ${key}`);
  }
});

test('الناقصُ يُعلَّم بمُعرِّفه، والتامُّ لا يُعلَّم', () => {
  assert.deepEqual(missingFormFields({ assetType: 'حاسوب', assetName: 'اسم', department: 'تقنية', qty: 2 }), []);
  assert.deepEqual(missingFormFields({}), ['f-type', 'f-name', 'f-qty', 'f-dept']);
  assert.deepEqual(missingFormFields({ assetType: 'حاسوب', assetName: '  ', department: 'تقنية', qty: 1 }), ['f-name']);
});

test('الكمّيّةُ تُقاس رقمًا — فـ«صفر» مكتوبٌ وهو ناقص', () => {
  const base = { assetType: 'حاسوب', assetName: 'اسم', department: 'تقنية' };
  assert.deepEqual(missingFormFields({ ...base, qty: '0' }), ['f-qty']);
  assert.deepEqual(missingFormFields({ ...base, qty: '-3' }), ['f-qty']);
  assert.deepEqual(missingFormFields({ ...base, qty: 'ثلاث' }), ['f-qty']);
  assert.deepEqual(missingFormFields({ ...base, qty: '2' }), []);
});

test('تاريخُ الاستلام وحدَه يُفرَّغ إلى يوم التقويم', () => {
  assert.deepEqual(FORM_FIELDS.filter((f) => f.today).map((f) => f.key), ['receivedDate']);
});

test('قيمُ التفريغ معرَّفةٌ لكلّ حقل — فحقلٌ بلا قيمةٍ فارغةٍ يُكتب «undefined»', () => {
  for (const f of FORM_FIELDS) assert.notEqual(f.empty, undefined, f.id);
  assert.equal(FORM_FIELDS.find((f) => f.key === 'condition').empty, 'جيد');
  assert.equal(FORM_FIELDS.find((f) => f.key === 'qty').empty, 1);
});
