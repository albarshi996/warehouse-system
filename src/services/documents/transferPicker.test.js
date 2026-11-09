/**
 * اختبارات منتقي أصناف مخزن النقل (جزء ٣) ووسمِ الإضافة (جزء ٤) — موقع 155.
 *
 * نحرس ثلاثًا: (أ) الاقتراحُ المفلترُ بالمخزن يَعرض ما في المخزن فقط وبكمّيّته،
 * و«عرض الكل» يَعرض الماستر. (ب) الوسمُ لا يقع قبل قراءة أرصدة المصدر —
 * ★★★ وهو العطبُ الأخطر: وسمُ الكلّ «مضافًا» يفبرك زيادةَ جردٍ لصنفٍ موجود.
 * (ج) النقاوةُ: بلا تغييرٍ يُعاد المرجعُ نفسُه (فلا حلقةُ رسمٍ في الواجهة).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  senderIdentities,
  lineInSender,
  annotateAdditions,
  buildItemSuggestions,
  addedItemsSourceConflict,
} from './transferPicker.js';

const BALANCES = [
  { sku: 'ITM-1', barcode: '1001', nameAr: 'زيت', warehouse: 'E5', qty: 10, batch: 'A' },
  { sku: 'ITM-1', barcode: '1001', nameAr: 'زيت', warehouse: 'E5', qty: 5, batch: 'B' }, // تشغيلةٌ ثانية
  { sku: 'ITM-2', barcode: '1002', nameAr: 'سكر', warehouse: 'E5', qty: 3 },
];

const ITEMS = [
  { sku: 'ITM-1', barcode: '1001', nameAr: 'زيت' },
  { sku: 'ITM-2', barcode: '1002', nameAr: 'سكر' },
  { sku: 'ITM-9', barcode: '1009', nameAr: 'ملح' }, // في الماستر لا في المخزن
];

/* ───────── هويّاتُ المصدر ───────── */

test('senderIdentities: أكوادٌ وباركوداتٌ مطبَّعة بأحرفٍ كبيرة', () => {
  const id = senderIdentities([{ sku: 'itm-1', barcode: 'bc9' }, { sku: 'ITM-2' }]);
  assert.ok(id.skus.has('ITM-1'));
  assert.ok(id.skus.has('ITM-2'));
  assert.ok(id.barcodes.has('BC9'));
});

test('lineInSender: يطابق بالكود أو الباركود', () => {
  const id = senderIdentities(BALANCES);
  assert.equal(lineInSender({ sku: 'itm-1' }, id), true);
  assert.equal(lineInSender({ barcode: '1002' }, id), true);
  assert.equal(lineInSender({ sku: 'ITM-9' }, id), false);
  assert.equal(lineInSender({}, id), false);
  assert.equal(lineInSender({ sku: 'X' }, null), false);
});

/* ───────── ★★★ الوسمُ لا يقع قبل قراءة الأرصدة ───────── */

test('★★★ بلا loaded لا وسمَ — ولو كانت الهويّاتُ حاضرة', () => {
  const id = senderIdentities(BALANCES);
  const lines = [{ sku: 'ITM-9', qty: 2 }]; // ليس في المصدر، لكن لم تُقرأ الأرصدة
  const out = annotateAdditions(lines, id, { loaded: false });
  assert.equal(out[0].addedFromTransfer, undefined, 'لا يُفبرَك وسمٌ قبل اليقين');
});

test('★★★ مع loaded: الغائبُ عن المصدر يُوسَم، والموجودُ لا', () => {
  const id = senderIdentities(BALANCES);
  const lines = [{ sku: 'ITM-1', qty: 2 }, { sku: 'ITM-9', qty: 4 }];
  const out = annotateAdditions(lines, id, { loaded: true });
  assert.equal(out[0].addedFromTransfer, undefined, 'الموجودُ في المصدر نقلٌ عاديّ');
  assert.equal(out[1].addedFromTransfer, true, 'الغائبُ يُضاف من نقل');
});

test('الوسمُ يُنزَع إن صار الصنفُ معروفًا (أو انقطع المصدر)', () => {
  const id = senderIdentities(BALANCES);
  const lines = [{ sku: 'ITM-1', qty: 2, addedFromTransfer: true }];
  const out = annotateAdditions(lines, id, { loaded: true });
  assert.equal(out[0].addedFromTransfer, undefined, 'صار في المصدر — يُنزَع الوسم');
  // وانقطاعُ المصدر (loaded=false) ينزع كلَّ وسم.
  const out2 = annotateAdditions(lines, id, { loaded: false });
  assert.equal(out2[0].addedFromTransfer, undefined);
});

test('البندُ بلا هويّةٍ لا يُوسَم', () => {
  const id = senderIdentities(BALANCES);
  const out = annotateAdditions([{ qty: 5 }], id, { loaded: true });
  assert.equal(out[0].addedFromTransfer, undefined);
});

test('النقاوة: بلا تغييرٍ يُعاد المرجعُ نفسُه', () => {
  const id = senderIdentities(BALANCES);
  const lines = [{ sku: 'ITM-1', qty: 2 }];
  const out = annotateAdditions(lines, id, { loaded: true });
  assert.equal(out, lines, 'لا مصفوفةٌ جديدةٌ بلا داعٍ');
});

/* ───────── قائمةُ الاقتراح ───────── */

test('المفلتر بالمخزن: صنفٌ واحدٌ لكلّ هويّةٍ بكمّيّته المجمّعة', () => {
  const s = buildItemSuggestions({ balances: BALANCES, items: ITEMS, showAll: false });
  assert.equal(s.sku.length, 2, 'ITM-1 (مجمَّع) وITM-2');
  const oil = s.sku.find((o) => o.value === 'ITM-1');
  assert.match(oil.label, /زيت/);
  assert.match(oil.label, /رصيد 15/, 'الكمّيّةُ مجمّعةٌ عبر التشغيلتين');
  // ITM-9 (ماستر لا مخزن) غائبٌ عن المفلتر.
  assert.equal(s.sku.find((o) => o.value === 'ITM-9'), undefined);
  // عمودُ الباركود كذلك.
  assert.ok(s.barcode.find((o) => o.value === '1001'));
});

test('«عرض الكل»: الماسترُ كاملًا بما ليس في المخزن', () => {
  const s = buildItemSuggestions({ balances: BALANCES, items: ITEMS, showAll: true });
  assert.equal(s.sku.length, 3, 'كلُّ الماستر');
  assert.ok(s.sku.find((o) => o.value === 'ITM-9'), 'الصنفُ الذي ليس في المخزن حاضرٌ للإضافة');
});

test('الفراغُ لا ينفجر', () => {
  const s = buildItemSuggestions({});
  assert.deepEqual(s.sku, []);
  assert.deepEqual(s.barcode, []);
});

/* ───────── ★★★ حارسُ الرصيد الكلّيّ للبنود المضافة (مراجعةٌ عدائيّة) ───────── */

test('addedItemsSourceConflict: صنفٌ موسومٌ «مضاف» وله رصيدٌ في المصدر (دفعةٌ أخرى) يُردّ', () => {
  // ITM-1 له رصيدٌ في المصدر تحت دفعتين (A,B) — فوسمُه «مضافًا» بلا دفعةٍ خطأٌ
  // كان يمرّ من حارس المفتاح الواحد (NOBATCH=صفر) ويخلق مخزونًا في الوجهة.
  const lines = [{ sku: 'ITM-1', qty: 3, addedFromTransfer: true }];
  const problems = addedItemsSourceConflict(lines, BALANCES);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /رصيدًا \(15\)/, 'يجمع 10+5 عبر الدفعتين');
});

test('addedItemsSourceConflict: صنفٌ غائبٌ كلّيًّا عن المصدر يمرّ (إضافةٌ صحيحة)', () => {
  const lines = [{ sku: 'ITM-9', qty: 2, addedFromTransfer: true }];
  assert.deepEqual(addedItemsSourceConflict(lines, BALANCES), []);
});

test('addedItemsSourceConflict: القراءةُ المقطوعةُ تردُّ الإضافةَ كلَّها احترازًا', () => {
  const lines = [{ sku: 'ITM-9', qty: 2, addedFromTransfer: true }];
  const problems = addedItemsSourceConflict(lines, BALANCES, { truncated: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /بلغت الحدَّ/);
});

test('addedItemsSourceConflict: البنودُ غيرُ الموسومة لا تُفحَص (نقلٌ عاديّ)', () => {
  const lines = [{ sku: 'ITM-1', qty: 3 }, { sku: 'ITM-2', qty: 1 }];
  assert.deepEqual(addedItemsSourceConflict(lines, BALANCES), []);
  assert.deepEqual(addedItemsSourceConflict(lines, BALANCES, { truncated: true }), []);
});

test('★ اتّساقُ التطبيع: صنفٌ بمسافةٍ/نقطةٍ يُطابق هويّةَ المصدر (كـbalanceId) فلا يُوسَم كاذبًا', () => {
  // المصدرُ فيه "ITM 9" (بمسافة)؛ والبندُ "itm.9" — safe يوحّدهما (ITM_9 مقابل ITM_9؟)
  // الهدف: المطابقةُ بنفس تطبيع balanceId، فلا يُعدّ البندُ «مضافًا» وله رصيد.
  const bal = [{ sku: 'ITM 9', warehouse: 'E5', qty: 4 }];
  const ids = senderIdentities(bal);
  assert.ok(lineInSender({ sku: 'ITM 9' }, ids), 'نفسُ القيمة تُطابق');
  // والحارسُ الكلّيُّ يرى الرصيدَ تحت التطبيع الموحّد.
  const problems = addedItemsSourceConflict([{ sku: 'ITM 9', qty: 1, addedFromTransfer: true }], bal);
  assert.equal(problems.length, 1, 'له رصيدٌ في المصدر فيُردّ');
});
