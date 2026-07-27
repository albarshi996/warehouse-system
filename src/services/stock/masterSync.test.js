/**
 * اختبارات الماستر الحيّ — منطق خالص.
 * يحرس الثابت المحوري: **التحديث الحيّ يمسّ حقول الماستر فقط
 * (الرصيد الدفتري والسعر) ولا يلمس حالة الجرد (الكمية الفعلية/المسح).**
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { indexMaster, findMasterFor, masterFieldsOf, refreshMasterFields } from './masterSync.js';

const canon = (v) => {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s\-_]/g, '');
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
};

/* ───────────────── الفهرسة والمطابقة ───────────────── */

test('الفهرسة تربط الصنف بكوده وكل باركوداته', () => {
  const idx = indexMaster([{ sku: 'A1', barcodes: ['801', '802'], balance: 5 }]);
  assert.equal(idx.get('a1').sku, 'A1', 'الكود يُصغَّر');
  assert.equal(idx.get('801').balance, 5);
  assert.equal(idx.get('802').balance, 5);
});

test('المطابقة: بالكود ثم بالباركود الأساسي ثم بأيّ باركود', () => {
  const idx = indexMaster([{ sku: 'A1', barcodes: ['801'], balance: 9 }]);
  assert.equal(findMasterFor({ itemCode: 'a1' }, idx).balance, 9, 'بالكود');
  assert.equal(findMasterFor({ barcodeLower: '801' }, idx).balance, 9, 'بالباركود');
  assert.equal(findMasterFor({ barcodes: ['801'] }, idx).balance, 9, 'بقائمة الباركود');
  assert.equal(findMasterFor({ itemCode: 'zzz' }, idx), null, 'لا مطابقة');
});

test('حقول الماستر: الرصيد من balance والسعر من unitPrice/costPrice', () => {
  assert.deepEqual(masterFieldsOf({ balance: 12, unitPrice: 3 }), { systemQty: 12, unitPrice: 3 });
  assert.deepEqual(masterFieldsOf({ balance: 0, costPrice: 7 }), { systemQty: 0, unitPrice: 7 });
  assert.deepEqual(masterFieldsOf({}), { systemQty: 0, unitPrice: 0 });
});

/* ───────────────── التحديث في المكان ───────────────── */

test('يحدّث الرصيد الدفتري والسعر ولا يمسّ الكمية الفعلية/المسح', () => {
  const items = [
    { itemCode: 'A1', barcodeLower: '801', systemQty: 100, unitPrice: 2, actualQty: 37, scanned: true, notes: 'ملاحظة ميدانية' },
  ];
  const master = [{ sku: 'A1', barcodes: ['801'], balance: 120, unitPrice: 2.5 }];
  const { updated, changes } = refreshMasterFields(items, master);
  assert.equal(items[0].systemQty, 120, 'الرصيد حُدّث');
  assert.equal(items[0].unitPrice, 2.5, 'السعر حُدّث');
  assert.equal(items[0].actualQty, 37, 'الكمية الفعلية لم تُمسّ');
  assert.equal(items[0].scanned, true, 'حالة المسح لم تُمسّ');
  assert.equal(items[0].notes, 'ملاحظة ميدانية', 'الملاحظات لم تُمسّ');
  assert.equal(updated, 1);
  assert.deepEqual(changes[0], { itemCode: 'A1', from: 100, to: 120 });
});

test('لا تغيير ⇒ updated=0 (idempotent، فلا إعادة رسمٍ عابثة)', () => {
  const items = [{ itemCode: 'A1', systemQty: 50, unitPrice: 1 }];
  const master = [{ sku: 'A1', balance: 50, unitPrice: 1 }];
  assert.equal(refreshMasterFields(items, master).updated, 0);
});

test('الصنف اليدويّ (isManual) يُتجاوَز — لا مصدر له في الماستر', () => {
  const items = [{ itemCode: 'X', systemQty: 0, isManual: true, actualQty: 4 }];
  const master = [{ sku: 'X', balance: 999 }];
  const { updated } = refreshMasterFields(items, master);
  assert.equal(updated, 0);
  assert.equal(items[0].systemQty, 0, 'اليدويّ لا يتأثّر');
});

test('صنفٌ لا مقابل له في الماستر يبقى كما هو', () => {
  const items = [{ itemCode: 'GHOST', systemQty: 8, actualQty: 3 }];
  const { updated } = refreshMasterFields(items, [{ sku: 'A1', balance: 5 }]);
  assert.equal(updated, 0);
  assert.equal(items[0].systemQty, 8);
});

test('المطابقة القانونية توحّد الأصفار البادئة وصيغة الباركود', () => {
  const items = [{ barcodeLower: '0-0-251', systemQty: 0, actualQty: 10, scanned: true }];
  const master = [{ sku: 'A1', barcodes: ['251'], balance: 60 }];
  refreshMasterFields(items, master, canon);
  assert.equal(items[0].systemQty, 60, 'طابق رغم اختلاف الصيغة');
  assert.equal(items[0].actualQty, 10, 'الفعليّة سليمة');
});

test('مدخلات فارغة/غائبة آمنة', () => {
  assert.deepEqual(refreshMasterFields(null, null), { updated: 0, changes: [] });
  assert.equal(indexMaster(null).size, 0);
  assert.equal(findMasterFor(null, new Map()), null);
});
