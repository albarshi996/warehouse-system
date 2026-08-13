/**
 * حارس كتالوج الطرف‑الصنف (SAP-2 · ف‑٦) — الاختبار قبل الواجهة (§22 ‹995›).
 *
 * البوّابات الحرفيّة: §10.2 ‹251› (ثلاثة إلزاميّة فقط) · SR-49 ‹3130-3138›
 * (ترتيب البحث الخماسيّ) · SR-50 ‹3161› (لا صنفَ جديدًا لكود مورد) ·
 * §21-٤ ‹979› (البحث بكود مورد يعيد الصنف الداخليّ الصحيح).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogEntryId,
  catalogEntryVerdict,
  entriesForItem,
  entriesForPartner,
  fiveStepItemSearch,
} from './itemPartnerCatalog.js';
import { connectedPartnerPlan, CONNECTED_FIELD } from './connectedPartner.js';

/* ═══════════════ المعرّف الحتميّ ═══════════════ */

test('★ المعرّف حتميّ: (نوع × رمز × صنف) — إعادة الإدخال تحديثٌ لا تكرار', () => {
  const a = catalogEntryId({ partnerType: 'supplier', partnerCode: 'acme', sku: 'itm-1' });
  const b = catalogEntryId({ partnerType: 'SUPPLIER', partnerCode: ' ACME ', sku: 'ITM-1' });
  assert.equal(a, 'SUPPLIER__ACME__ITM-1');
  assert.equal(a, b);
});

test('المعرّف يرفض الناقص ويُنظّف ما يكسر معرّف Firestore', () => {
  assert.equal(catalogEntryId({ partnerType: 'supplier', partnerCode: '', sku: 'ITM-1' }), null);
  assert.equal(catalogEntryId({ partnerType: 'x', partnerCode: 'A', sku: 'B' }), null);
  assert.equal(
    catalogEntryId({ partnerType: 'customer', partnerCode: 'a/b.c', sku: 's k' }),
    'CUSTOMER__A-B-C__S_K'
  );
});

/* ═══════════════ الإلزاميّ ثلاثة فقط (§10.2 ‹251›) ═══════════════ */

test('★★ حكم الإدخال: الطرف والصنف وكوده — ولا شيء غيرها شرطًا', () => {
  const v = catalogEntryVerdict({
    partnerType: 'supplier',
    partnerCode: 'acme',
    sku: 'itm-1',
    partnerItemCode: 'vnd-99',
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.entry, {
    partnerType: 'supplier',
    partnerCode: 'ACME',
    sku: 'ITM-1',
    partnerItemCode: 'VND-99',
  });
});

test('★ الناقص يُقال بالاسم لا باستثناءٍ غامض', () => {
  const v = catalogEntryVerdict({ partnerType: 'supplier' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 3);
  assert.match(v.problems.join(' '), /رمز الطرف/);
  assert.match(v.problems.join(' '), /كود الصنف الداخليّ/);
  assert.match(v.problems.join(' '), /كود الطرف للصنف/);
});

test('★ الاختياريّ يُكتب حين يَرِد ولا يُخترع حين يغيب (§10.6 ‹251›)', () => {
  const v = catalogEntryVerdict({
    partnerType: 'customer',
    partnerCode: 'C1',
    sku: 'ITM-1',
    partnerItemCode: 'CUST-5',
    uom: 'CTN',
    conversionFactor: '24',
  });
  assert.equal(v.ok, true);
  assert.equal(v.entry.uom, 'CTN');
  assert.equal(v.entry.conversionFactor, 24);
  assert.equal('price' in v.entry, false);
  assert.equal('leadDays' in v.entry, false);
});

test('رقمٌ فاسد في حقلٍ اختياريّ يُرفض بالاسم', () => {
  const v = catalogEntryVerdict({
    partnerType: 'supplier', partnerCode: 'A', sku: 'B', partnerItemCode: 'C',
    conversionFactor: 'abc',
  });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /conversionFactor/);
});

/* ═══════════════ الاستخراج ═══════════════ */

const ENTRIES = [
  { partnerType: 'supplier', partnerCode: 'ACME', sku: 'ITM-1', partnerItemCode: 'VND-99' },
  { partnerType: 'supplier', partnerCode: 'OTHER', sku: 'ITM-1', partnerItemCode: 'X-1' },
  { partnerType: 'customer', partnerCode: 'C1', sku: 'ITM-2', partnerItemCode: 'CUST-5' },
];

test('سجلّات الصنف وسجلّات الطرف تُستخرج مطبَّعةً', () => {
  assert.equal(entriesForItem(ENTRIES, ' itm-1 ').length, 2);
  assert.equal(entriesForPartner(ENTRIES, 'supplier', 'acme').length, 1);
  assert.deepEqual(entriesForPartner(ENTRIES, 'customer', 'C1')[0].partnerItemCode, 'CUST-5');
});

/* ═══════════════ ترتيب البحث الخماسيّ (SR-49) ═══════════════ */

const ITEMS = [
  { sku: 'ITM-1', nameAr: 'كريم يدين', nameEn: 'Hand Cream', barcodes: ['8059692040599'] },
  { sku: 'ITM-2', nameAr: 'شامبو', nameEn: 'Shampoo', barcodes: ['111'], mfrCatalogNo: 'MFG-77' },
  { sku: 'VND-99', nameAr: 'صنفٌ كوده يشبه كود المورد', barcodes: [] },
];
const CTX = { items: ITEMS, entries: ENTRIES, partnerType: 'supplier', partnerCode: 'ACME' };

test('★★ ١: الكود الداخليّ يتقدّم على كلّ شيء — حتى على كود الطرف المطابق', () => {
  // VND-99 كودُ صنفٍ داخليّ وكودُ ACME للصنف ITM-1 معًا — الداخليّ يفوز (الترتيب).
  const hit = fiveStepItemSearch('VND-99', CTX);
  assert.equal(hit.via, 'sku');
  assert.equal(hit.item.sku, 'VND-99');
});

test('٢: الباركود بعد الكود — وبصيغة الأصفار البادئة أيضًا', () => {
  assert.equal(fiveStepItemSearch('8059692040599', CTX).via, 'barcode');
  assert.equal(fiveStepItemSearch('0111', CTX).item.sku, 'ITM-2');
});

test('★★ ٣ و§21-٤: كود المورد يعيد الصنف الداخليّ الصحيح — لهذا الطرف وحده', () => {
  const hit = fiveStepItemSearch('X-1', CTX);
  assert.equal(hit, null); // X-1 كودُ OTHER لا ACME — لا يتسرّب.
  const mine = fiveStepItemSearch('x-1', { ...CTX, partnerCode: 'OTHER' });
  assert.equal(mine.via, 'partner-code');
  assert.equal(mine.item.sku, 'ITM-1'); // الهويّة الداخليّة هي المخزَّنة.
  assert.equal(mine.entry.partnerItemCode, 'X-1'); // وكود الطرف يبقى للعرض (§10 ‹257›).
});

test('٤: رقم كتالوج المصنع يُقرأ إن وُجد الحقل — ولا يُخترع', () => {
  assert.equal(fiveStepItemSearch('MFG-77', CTX).via, 'mfr-catalog');
});

test('٥: الاسم أو جزؤه — آخر الخمسة', () => {
  assert.equal(fiveStepItemSearch('شامبو', CTX).item.sku, 'ITM-2');
  assert.equal(fiveStepItemSearch('cream', CTX).via, 'name');
});

test('★★ SR-50: المجهول يعود null — لا صنفَ جديدًا لكود مورد', () => {
  assert.equal(fiveStepItemSearch('UNKNOWN-CODE', CTX), null);
  assert.equal(fiveStepItemSearch('', CTX), null);
});

test('بلا سياق طرفٍ تُتخطّى الخطوة ٣ ولا تنهار الدالّة', () => {
  const hit = fiveStepItemSearch('VND-99', { items: ITEMS });
  assert.equal(hit.via, 'sku');
  assert.equal(fiveStepItemSearch('X-1', { items: ITEMS }), null);
});

/* ═══════════════ الربط المتبادل (ف‑٧ · §21-٥) ═══════════════ */

test('★★ الربط يكتب المرآتين معًا — بطاقةُ كلٍّ تشير إلى الآخر', () => {
  const { writes } = connectedPartnerPlan('supplier', 'acme', '', 'c1');
  assert.deepEqual(writes, [
    { kind: 'supplier', code: 'ACME', value: 'C1' },
    { kind: 'customer', code: 'C1', value: 'ACME' },
  ]);
});

test('★ تغيير الربط يمحو المرآة القديمة — فلا بطاقةَ تشير لمن هجرها', () => {
  const { writes } = connectedPartnerPlan('customer', 'C1', 'ACME', 'NEWSUP');
  assert.deepEqual(writes, [
    { kind: 'customer', code: 'C1', value: 'NEWSUP' },
    { kind: 'supplier', code: 'NEWSUP', value: 'C1' },
    { kind: 'supplier', code: 'ACME', value: '' },
  ]);
});

test('الفكّ يمحو الطرفين، واللاتغيير لا يكتب شيئًا', () => {
  assert.deepEqual(connectedPartnerPlan('supplier', 'A', 'B', '').writes, [
    { kind: 'supplier', code: 'A', value: '' },
    { kind: 'customer', code: 'B', value: '' },
  ]);
  assert.deepEqual(connectedPartnerPlan('supplier', 'A', 'B', 'b').writes, []);
});

test('نوعٌ مجهول أو رمزٌ فارغ يُرفضان', () => {
  assert.throws(() => connectedPartnerPlan('x', 'A', '', 'B'), /نوع شريك غير معروف/);
  assert.throws(() => connectedPartnerPlan('supplier', '', '', 'B'), /رمز البطاقة مطلوب/);
});

test('اسم الحقل الواحد ثابت — عقدٌ تقرؤه الواجهة والقواعد', () => {
  assert.equal(CONNECTED_FIELD, 'connectedPartnerCode');
});
