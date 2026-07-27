/**
 * اختبارات محرّك دمج المسح الحيّ — منطق خالص.
 * يحرس الخاصّية المحورية: **مجموع قيود الدفتر = الكمية الفعلية المدموجة**،
 * فلا يُحسب صنفٌ مرّتين حين يجرده جهازان، والإلغاء يعكس ولا يمحو.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanKey, summarizeScans, applyLedgerToItems } from './scanMerge.js';

/* ───────────────── التطبيع ───────────────── */

test('المفتاح يشذّب ويصغّر الحروف', () => {
  assert.equal(scanKey('  ABC-123  '), 'abc-123');
  assert.equal(scanKey(null), '');
  assert.equal(scanKey(88), '88');
});

/* ───────────────── التجميع ───────────────── */

test('يجمع كميات الباركود الواحد عبر عدّة قيود (أجهزة مختلفة)', () => {
  const led = summarizeScans([
    { barcode: '801', qty: 3, name: 'كريم' },
    { barcode: '801', qty: 2 },
    { barcode: '802', qty: 5, name: 'مسكارا' },
  ]);
  assert.equal(led.get('801').qty, 5, '3+2 من جهازين');
  assert.equal(led.get('801').count, 2);
  assert.equal(led.get('801').name, 'كريم', 'يحتفظ بآخر اسمٍ معروف');
  assert.equal(led.get('802').qty, 5);
});

test('القيد السالب يعكس المسح (الإلغاء لا يمحو التاريخ)', () => {
  const led = summarizeScans([
    { barcode: '801', qty: 4 },
    { barcode: '801', qty: -4 }, // إلغاء
  ]);
  assert.equal(led.get('801').qty, 0, 'الصافي صفر');
  assert.equal(led.get('801').count, 2, 'القيدان باقيان في التاريخ');
});

test('القيود بلا باركود أو كمية غير رقمية لا تكسر التجميع', () => {
  const led = summarizeScans([
    { barcode: '', qty: 9 },
    { barcode: '801', qty: 'x' },
    { barcode: '801', qty: 2 },
    null,
  ]);
  assert.equal(led.has(''), false, 'باركود فارغ يُهمَل');
  assert.equal(led.get('801').qty, 2, 'كمية غير رقمية = 0');
});

/* ───────────────── التوفيق ───────────────── */

test('يضبط الكمية الفعلية من الدفتر ولا يمسّ الكمية الدفترية', () => {
  const items = [
    { barcode: '801', barcodeLower: '801', systemQty: 100, actualQty: 0, scanned: false },
    { barcode: '802', barcodeLower: '802', systemQty: 50, actualQty: 0, scanned: false },
  ];
  const led = summarizeScans([
    { barcode: '801', qty: 7 },
    { barcode: '801', qty: 3 },
  ]);
  const { changed, missing } = applyLedgerToItems(items, led);
  assert.equal(items[0].actualQty, 10, 'المجموع 7+3');
  assert.equal(items[0].scanned, true);
  assert.equal(items[0].systemQty, 100, 'الدفترية لم تُمسّ');
  assert.equal(items[1].actualQty, 0, 'صنفٌ بلا قيود يبقى صفرًا/غير ممسوح');
  assert.equal(items[1].scanned, false);
  assert.equal(changed, 1, 'صنفٌ واحد تغيّر');
  assert.equal(missing.length, 0);
});

test('لا ازدواج عدّ: التوفيق يستبدل لا يجمع فوق القيمة المحلّية', () => {
  // الجهاز حدّث محليًّا actualQty=10، ثم وصل الدفتر بالمجموع نفسه 10.
  const items = [{ barcode: '801', barcodeLower: '801', systemQty: 100, actualQty: 10, scanned: true }];
  const led = summarizeScans([{ barcode: '801', qty: 10 }]);
  applyLedgerToItems(items, led);
  assert.equal(items[0].actualQty, 10, 'يبقى 10 لا 20 — استبدالٌ لا جمع');
});

test('صنف مسحه زميلٌ ولا نملكه محليًّا يظهر في missing', () => {
  const items = [{ barcode: '801', barcodeLower: '801', actualQty: 0, scanned: false }];
  const led = summarizeScans([
    { barcode: '801', qty: 2 },
    { barcode: '999', qty: 4, name: 'صنف زميل' },
  ]);
  const { missing } = applyLedgerToItems(items, led);
  assert.equal(missing.length, 1);
  assert.deepEqual(missing[0], { barcode: '999', name: 'صنف زميل', qty: 4 });
});

test('صنف صافيه صفر (مُسح ثم أُلغي) لا يُنبت سطرًا في missing', () => {
  const items = [];
  const led = summarizeScans([
    { barcode: '999', qty: 4 },
    { barcode: '999', qty: -4 },
  ]);
  const { missing } = applyLedgerToItems(items, led);
  assert.equal(missing.length, 0, 'الصافي صفر ⇒ غير ممسوح ⇒ لا سطر');
});

test('التوفيق يطابق بالباركود بعد التصغير (الجلسة تحمل حروفًا كبيرة)', () => {
  const items = [{ barcode: 'ABC', barcodeLower: 'abc', actualQty: 0, scanned: false }];
  const led = summarizeScans([{ barcode: 'abc', qty: 6 }]);
  applyLedgerToItems(items, led);
  assert.equal(items[0].actualQty, 6);
});

test('مدخلات فارغة/غائبة آمنة', () => {
  assert.deepEqual(applyLedgerToItems(null, new Map()), { changed: 0, missing: [] });
  assert.equal(summarizeScans(null).size, 0);
});

test('keyFn مخصّصة توحّد الأصفار البادئة (كما bzCanonCode في الصفحة)', () => {
  // نفس منطق الصفحة: يُسقط الفراغات/الشُّرَط والأصفار البادئة للأرقام.
  const canon = (v) => {
    const s = String(v ?? '').trim().toLowerCase().replace(/[\s\-_]/g, '');
    return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
  };
  const led = summarizeScans(
    [
      { barcode: '00251', qty: 3 },
      { barcode: '251', qty: 2 },
    ],
    canon
  );
  assert.equal(led.get('251').qty, 5, '00251 و251 صنفٌ واحد');
  const items = [{ barcode: '0-0-251', barcodeLower: '0-0-251', actualQty: 0, scanned: false }];
  applyLedgerToItems(items, led, canon);
  assert.equal(items[0].actualQty, 5, 'الصنف يطابق رغم اختلاف صيغة الباركود');
});
