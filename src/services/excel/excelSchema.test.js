/**
 * اختبارات مخطّط الأصناف — المنطق الخالص الذي يقف بين شيت المستودع والماستر.
 * `node --test` بلا شبكة ولا متصفّح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DATASETS,
  IMPORT_TEMPLATE_DATASETS,
  importFingerprint,
  normalizeBarcode,
  barcodeLookupVariants,
  splitMulti,
  detectHeaderRow,
  buildHeaderIndex,
  resolveHeaderCell,
  toNumber,
} from './excelSchema.js';

// ── تطبيع الباركود (أخطر نقطة: الماسح يجب أن يطابق الشيت) ─────────
test('الباركود يُطبَّع فيطابق الماسحُ الشيتَ مهما اختلفت كتابته', () => {
  assert.equal(normalizeBarcode('8059692040599'), '8059692040599');
  assert.equal(normalizeBarcode(' 8059692040599 '), '8059692040599');
  assert.equal(normalizeBarcode('8059-692-040599'), '8059692040599');
  assert.equal(normalizeBarcode('8059 692 040599'), '8059692040599');
  assert.equal(normalizeBarcode('8059_692_040599'), '8059692040599');
});

test('الأرقام العربية تُقرأ كالغربية', () => {
  assert.equal(normalizeBarcode('٨٠٥٩٦٩٢٠٤٠٥٩٩'), '8059692040599');
});

test('🚨 الصيغة الأسّية التي يفرضها إكسيل على الباركودات الطويلة تُفكّ', () => {
  // إكسيل يخزّن 8059692040599 رقمًا فيعرضه 8.05969E+12 — بلا هذا الفكّ
  // يُستورد الباركود مشوّهًا فلا يطابقه الماسح أبدًا.
  assert.equal(normalizeBarcode('8.059692040599e+12'), '8059692040599');
  assert.equal(normalizeBarcode('8.05969E+12'), '8059690000000');
});

test('الفارغ يبقى فارغًا لا "undefined"', () => {
  assert.equal(normalizeBarcode(''), '');
  assert.equal(normalizeBarcode(null), '');
  assert.equal(normalizeBarcode(undefined), '');
});

// ── الأصفار البادئة (طلب المالك 2026-07-21: `00251` ≡ `251`) ────────
test('🚨 الأصفار البادئة تُسقط من الأرقام الخالصة — الملصق 00251 يطابق الشيت 251', () => {
  assert.equal(normalizeBarcode('00251'), '251');
  assert.equal(normalizeBarcode('251'), '251');
  // قارئ EAN-13 يعطي UPC-A بصفر بادئ — القارئان يلتقيان على صيغة واحدة:
  assert.equal(normalizeBarcode('085715324009'), '85715324009');
  assert.equal(normalizeBarcode('85715324009'), '85715324009');
  // كله أصفار ⇒ يبقى صفر واحد لا سلسلة فارغة:
  assert.equal(normalizeBarcode('0000'), '0');
});

test('غير الرقمي الخالص لا تُمسّ أصفاره — الكود يبقى كما هو', () => {
  assert.equal(normalizeBarcode('IP34927'), 'ip34927');
  assert.equal(normalizeBarcode('0IP34927'), '0ip34927');
  assert.equal(normalizeBarcode('MB 007X'), 'mb007x');
});

test('صيغتا البحث: القياسية + كما كُتبت (لالتقاط مخزون ما قبل الإسقاط)', () => {
  assert.deepEqual(barcodeLookupVariants('00251'), ['251', '00251']);
  assert.deepEqual(barcodeLookupVariants('251'), ['251']);
  assert.deepEqual(barcodeLookupVariants('IP 34927'), ['ip34927']);
  assert.deepEqual(barcodeLookupVariants(''), []);
});

test('عدّة باركودات في خانة واحدة تُفصل بأي فاصل شائع', () => {
  assert.deepEqual(splitMulti('8059692040599, 8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('8059692040599/8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('8059692040599 | 8059692040600'), ['8059692040599', '8059692040600']);
  assert.deepEqual(splitMulti('123،456'), ['123', '456'], 'الفاصلة العربية');
  assert.deepEqual(splitMulti(''), []);
});

// ── اكتشاف صفّ العناوين ────────────────────────────────────────────
test('يجد صفّ العناوين ولو لم يكن الأول (شيتات المستودع فوقها عناوين وشعارات)', () => {
  const matrix = [
    ['شركة برند زو — جرد المستودع', '', '', ''],
    ['', '', '', ''],
    ['الباركود', 'كود الصنف', 'اسم الصنف', 'الكمية الدفترية'],
    ['8059692040599', 'WNW-001', 'أساس سائل', '10'],
  ];
  const { index, hits } = detectHeaderRow(matrix, 'items');
  assert.equal(index, 2, 'صفّ العناوين هو الثالث');
  assert.ok(hits >= 4);
});

test('يعمل حين تكون العناوين في الصف الأول فعلًا', () => {
  const matrix = [
    ['كود الصنف', 'اسم الصنف'],
    ['WNW-001', 'أساس'],
  ];
  assert.equal(detectHeaderRow(matrix, 'items').index, 0);
});

test('يقبل العناوين الإنجليزية والعربية معًا', () => {
  const matrix = [['SKU', 'Barcode', 'Product Name', 'Qty']];
  assert.ok(detectHeaderRow(matrix, 'items').hits >= 4);
});

// ── حلّ العناوين ───────────────────────────────────────────────────
test('★ شيت المالك الحقيقي يُقرأ عمودًا عمودًا', () => {
  // العناوين **الحرفية** كما أرسلها المالك 2026-07-15 — بأخطائها الإملائية.
  // هذا هو العقد بين ملفّه والنظام؛ أي كسر هنا يعني استيرادًا فاسدًا.
  const real = [
    'Item Description', 'Bar Code', 'Bar Code - Code', 'Purchese Price',
    'Sell Price', 'UoM Group Name', 'Department', 'Section', 'Family',
    'Sub-Family', 'UoM Group Code', 'المورد',
  ];
  const index = buildHeaderIndex('items');
  assert.deepEqual(
    real.map((h) => resolveHeaderCell(h, index)?.field),
    ['nameAr', 'barcode', 'barcodeAlt', 'costPrice', 'sellPrice', 'uomGroupName',
      'department', 'section', 'family', 'subFamily', 'uomGroupCode', 'supplier']
  );
});

test('«Purchese Price» بخطئها الإملائي مقبولة — ملفّاته الحقيقية تحملها', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('Purchese Price', index)?.field, 'costPrice');
  assert.equal(resolveHeaderCell('Purchase Price', index)?.field, 'costPrice');
});

test('سعر الشراء وسعر البيع لا يختلطان', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('Sell Price', index)?.field, 'sellPrice');
  assert.equal(resolveHeaderCell('سعر البيع', index)?.field, 'sellPrice');
  assert.equal(resolveHeaderCell('سعر الشراء', index)?.field, 'costPrice');
});

test('عمودا الباركود يُحلّان إلى حقلين مختلفين (يُضمّان لاحقًا)', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('Bar Code', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('Bar Code - Code', index)?.field, 'barcodeAlt');
});

test('التسلسل الرباعي كامل — لا يُسحق إلى مستويين', () => {
  const index = buildHeaderIndex('items');
  assert.deepEqual(
    ['Department', 'Section', 'Family', 'Sub-Family'].map((h) => resolveHeaderCell(h, index)?.field),
    ['department', 'section', 'family', 'subFamily']
  );
});

test('قالب الجرد القديم ما زال يُقرأ (صفر حذف)', () => {
  const legacy = ['الباركود', 'كود الصنف', 'اسم الصنف', 'الظل/اللون', 'التصنيف', 'التصنيف الفرعي', 'الكمية الدفترية', 'الوحدة', 'ملاحظات'];
  const index = buildHeaderIndex('items');
  assert.deepEqual(
    legacy.map((h) => resolveHeaderCell(h, index)?.field),
    ['barcode', 'sku', 'nameAr', 'shade', 'family', 'subFamily', 'balance', 'uomGroupName', 'notes']
  );
});

test('«حاوية الكود» ليست إلزامية — تُملأ من أودو لاحقًا', () => {
  const sku = DATASETS.items.columns.find((c) => c.field === 'sku');
  assert.equal(sku.required, false, 'لو كانت إلزامية لرُفض شيت المالك كلّه اليوم');
});

// ── ورقة الأرصدة ───────────────────────────────────────────────────
test('أعمدة الأرصدة تُقرأ عربيّها وإنجليزيّها', () => {
  const index = buildHeaderIndex('balances');
  const headers = ['Bar Code', 'Warehouse (المخزن)', 'Batch / Lot (التشغيلة)', 'Expiry (تاريخ الصلاحية)', 'Qty (الكمية)'];
  assert.deepEqual(
    headers.map((h) => resolveHeaderCell(h, index)?.field),
    ['barcode', 'warehouse', 'batch', 'expiry', 'qty']
  );
});

test('المخزن والكمية إلزاميان في الأرصدة — رصيد بلا مخزن رقم بلا معنى', () => {
  const required = DATASETS.balances.columns.filter((c) => c.required).map((c) => c.field);
  assert.deepEqual(required.sort(), ['qty', 'warehouse']);
});

test('الأرصدة تحمل ما يحتاجه حارس FEFO', () => {
  const fields = DATASETS.balances.columns.map((c) => c.field);
  for (const f of ['batch', 'expiry', 'warehouse', 'qty']) {
    assert.ok(fields.includes(f), `FEFO يحتاج ${f}`);
  }
});

test('الأرصدة والتعريفات مجموعتان مستقلّتان — فلا يدهس رفعُ إحداهما الأخرى', () => {
  assert.ok(DATASETS.items && DATASETS.balances);
  assert.ok(!DATASETS.items.templateFields.includes('balance'), 'قالب التعريفات بلا كمية');
  assert.ok(!DATASETS.balances.templateFields.includes('costPrice'), 'قالب الأرصدة بلا أسعار');
});

test('الحدّ الأدنى في التعريفات لا الأرصدة — فهو خاصّية صنف لا كمية', () => {
  assert.ok(DATASETS.items.templateFields.includes('minStock'));
  assert.ok(!DATASETS.balances.templateFields.includes('minStock'));
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('Min Stock (الحد الأدنى)', index)?.field, 'minStock');
  assert.equal(resolveHeaderCell('الحد الأدنى', index)?.field, 'minStock');
});

test('حالة الصنف تُقرأ — بدونها لا سبيل لإيقاف صنف من الشيت', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('Status (الحالة)', index)?.field, 'status');
  assert.equal(resolveHeaderCell('الحالة', index)?.field, 'status');
});

test('تكلفة الوحدة في الأرصدة لا التعريفات — تكلفة التشغيلة ≠ سعر الشراء اليوم', () => {
  assert.ok(DATASETS.balances.templateFields.includes('unitCost'));
  assert.ok(!DATASETS.items.templateFields.includes('unitCost'));
  const index = buildHeaderIndex('balances');
  assert.equal(resolveHeaderCell('Unit Cost (تكلفة الوحدة)', index)?.field, 'unitCost');
});

test('عناوين الأرصدة العربية المجرّدة تُقرأ (شيت جرد يدوي)', () => {
  const index = buildHeaderIndex('balances');
  assert.deepEqual(
    ['الباركود', 'المخزن', 'التشغيلة', 'تاريخ الصلاحية', 'الكمية'].map((h) => resolveHeaderCell(h, index)?.field),
    ['barcode', 'warehouse', 'batch', 'expiry', 'qty']
  );
});

test('العنوان المزيّن يُحلّ بالاحتواء', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('الباركود (EAN)', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('  كود الصنف  ', index)?.field, 'sku');
});

test('🚨 «كود» مُحتواة داخل «الباركود» — ولا يجوز أن تخطف عمودها', () => {
  // خلل حقيقي (2026-07-15): مطابقة «أول احتواء» كانت تُسند عمود الباركود إلى
  // حقل sku، فتُستورد الباركودات أكوادًا وتبقى الأصناف بلا باركود — صامتًا.
  // الحلّ: أطول مرادف يفوز. هذا الاختبار يمنع عودته.
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('الباركود', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('الباركود (EAN)', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('الباركود / Barcode', index)?.field, 'barcode');
  assert.equal(resolveHeaderCell('باركود الصنف', index)?.field, 'barcode');
});

test('صفّ العناوين يُرجَّح بعدد الأعمدة المتمايزة لا بالخانات', () => {
  const matrix = [
    ['الكمية', 'الكمية', 'الكمية', 'الكمية', 'الكمية'], // 5 خانات، عمود واحد
    ['كود الصنف', 'اسم الصنف', 'الباركود'], // 3 أعمدة حقيقية
  ];
  assert.equal(detectHeaderRow(matrix, 'items').index, 1);
});

test('العنوان المجهول لا يُحلّ إلى عمود خاطئ', () => {
  const index = buildHeaderIndex('items');
  assert.equal(resolveHeaderCell('عمود لا معنى له', index), null);
  assert.equal(resolveHeaderCell('', index), null);
});

// ── مخطّط الأصناف ──────────────────────────────────────────────────
test('عمود الباركود موجود ومتعدّد (كان غائبًا تمامًا قبل 2026-07-15)', () => {
  const barcode = DATASETS.items.columns.find((c) => c.field === 'barcode');
  assert.ok(barcode, 'عمود الباركود موجود');
  assert.equal(barcode.multi, true, 'يقبل عدّة باركودات');
});

test('اسم الصنف وحده إلزامي — والهوية يحرسها المستورد لا المخطّط', () => {
  // تغيّر بقرار المالك (2026-07-15): «حاوية الكود» تُملأ من أودو لاحقًا، فلو
  // بقي الكود إلزاميًّا لرُفض شيته كلّه اليوم. الهوية يحرسها المستورد بقاعدة
  // «لا كود ولا باركود ⇒ رفض» — فلا يدخل صنف يستحيل التعرّف عليه.
  const required = DATASETS.items.columns.filter((c) => c.required).map((c) => c.field);
  assert.deepEqual(required, ['nameAr']);
});

test('★★ ل‑٦: حقلٌ واحد للموقع اسمه bin — والعناوين القديمة كلّها تصل إليه', () => {
  // كان للموقع حقلان: يكتب الشيتُ `location` ويكتب القيدُ `bin` ولا يوحّدهما
  // أحد، فيتنازعان على معنًى واحد. الآن الوجهة واحدة والعنوان المعروض لم يتغيّر.
  const index = buildHeaderIndex('balances');
  for (const header of ['location', 'الموقع', 'الرف', 'bin', 'rack', 'shelf', 'بوكس', 'Location (الموقع/الرف)']) {
    assert.equal(resolveHeaderCell(header, index)?.field, 'bin', `«${header}» يجب أن تصل إلى bin`);
  }
  assert.ok(
    !DATASETS.balances.columns.some((c) => c.field === 'location'),
    'ولا يبقى حقلٌ ثانٍ للموقع في المخطّط'
  );
  assert.ok(DATASETS.balances.templateFields.includes('bin'));
});

// ── قالب الاستيراد القياسيّ (LOC-201) ──────────────────────────────
test('★★ القالب محايدٌ عن النظام المصدر — ولا اسم لأودو في أيّ حقل', () => {
  // البوابة عقدُها واحد وأيّ نظام يُكيَّف إليه؛ فحقلٌ اسمه «أودو» يربط العقد
  // بمورّدٍ بعينه ويكسره يوم يتغيّر النظام.
  for (const key of IMPORT_TEMPLATE_DATASETS) {
    for (const col of DATASETS[key].columns) {
      assert.ok(!/odoo/i.test(col.field), `الحقل «${col.field}» في ${key} يحمل اسم نظامٍ بعينه`);
      assert.ok(!/odoo/i.test(col.labelAr), `العنوان «${col.labelAr}» في ${key} يحمل اسم نظامٍ بعينه`);
    }
  }
});

test('عناوين القالب المولَّد تصل كلّها إلى حقولها — القالب والمستورد مصدرٌ واحد', () => {
  for (const key of IMPORT_TEMPLATE_DATASETS) {
    const ds = DATASETS[key];
    const index = buildHeaderIndex(key);
    for (const field of ds.templateFields) {
      const col = ds.columns.find((c) => c.field === field);
      assert.ok(col, `${key}: حقل القالب «${field}» ليس في الأعمدة`);
      assert.equal(
        resolveHeaderCell(col.labelAr, index)?.field,
        field,
        `${key}: العنوان «${col.labelAr}» لا يعود إلى حقله`
      );
    }
  }
});

test('مرادفات أودو والعربية والخطأ الإملائيّ مقبولة — فلا ينكسر شيتٌ قائم', () => {
  const index = buildHeaderIndex('receipt');
  const expect = {
    'Odoo Reference': 'docRef',
    'Odoo Line ID': 'lineId',
    write_date: 'sourceUpdatedAt',
    DISCREPTION: 'description',
    SKU: 'sku',
    'الكمية': 'qty',
    'رقم الدفعة': 'batch',
    'المستودع': 'warehouse',
  };
  for (const [header, field] of Object.entries(expect)) {
    assert.equal(resolveHeaderCell(header, index)?.field, field, `«${header}» يجب أن تصل إلى ${field}`);
  }
});

test('★★ البصمة: نفس السطر ⇒ نفس البصمة، واختلاف أيّ جزءٍ يغيّرها', () => {
  const base = { docRef: 'IN-42', lineId: '55871', sourceUpdatedAt: '2026-08-16' };
  assert.equal(importFingerprint(base), importFingerprint({ ...base }), 'إعادة الاستيراد تحديثٌ لا تكرار');
  assert.notEqual(importFingerprint(base), importFingerprint({ ...base, lineId: '55872' }));
  assert.notEqual(importFingerprint(base), importFingerprint({ ...base, sourceUpdatedAt: '2026-08-17' }));
  assert.equal(importFingerprint({ ...base, docRef: ' in-42 ' }), importFingerprint(base), 'الفراغ والحالة لا يُنتجان بصمتين');
});

test('★★ البصمة تسقط إلى محتوى الصفّ بلا معرّف سطر — ولا تسقط كلّها', () => {
  // نظامٌ لا يُصدّر معرّف سطر يجب ألّا يفقد منع التكرار تمامًا.
  const a = importFingerprint({ docRef: 'IN-42', sku: 'WNW-001', batch: 'B2408', qty: 120 });
  const b = importFingerprint({ docRef: 'IN-42', sku: 'WNW-001', batch: 'B2411', qty: 120 });
  assert.ok(a.includes('C_'), 'يُعلَن أنّها بصمة محتوى');
  assert.notEqual(a, b, 'دفعتان مختلفتان ⇒ بصمتان');
  assert.equal(a, importFingerprint({ docRef: 'IN-42', sku: 'WNW-001', batch: 'B2408', qty: 120 }));
});

test('★★ هويّة السطر الثلاثيّة موجودة في الوارد والصادر — وهي ما لا يُحرَّر', () => {
  for (const key of ['receipt', 'delivery']) {
    const fields = DATASETS[key].columns.map((c) => c.field);
    for (const id of ['docRef', 'lineId', 'sourceUpdatedAt']) {
      assert.ok(fields.includes(id), `${key} بلا ${id} — تنكسر بصمة منع التكرار`);
    }
  }
});

test('لقطة المخزون: رصيد الصفر مشروع، وموقع النظام اختياريّ', () => {
  const cols = DATASETS.stockSnapshot.columns;
  const qty = cols.find((c) => c.field === 'systemQty');
  assert.equal(qty.required, true, 'الرصيد مطلوب');
  assert.equal(qty.nonNegative, true, 'ولا يكون سالبًا');
  assert.equal(cols.find((c) => c.field === 'systemLocation').required, false, 'موقع النظام يُترك فارغًا فيُحسب الفرق بالمستودع');
});

test('⚠️ حقول البوابة الثلاثة ليست أعمدةً في الشيت — تُكتب من هويّة المستخدم', () => {
  // وضعُها في الشيت يجعلها قابلةً للتزوير بيد من يملأ الملفّ (قرار المالك).
  for (const key of IMPORT_TEMPLATE_DATASETS) {
    const fields = DATASETS[key].columns.map((c) => c.field);
    for (const forbidden of ['importedBy', 'importedAt', 'importFileName']) {
      assert.ok(!fields.includes(forbidden), `${key}: «${forbidden}» يجب ألّا يكون عمودًا في الشيت`);
    }
  }
});

test('الأرقام تتحمّل الفواصل والأرقام العربية', () => {
  assert.equal(toNumber('1,250'), 1250);
  assert.equal(toNumber('١٠'), 10);
  assert.equal(toNumber(''), 0);
  assert.ok(Number.isNaN(toNumber('غير رقم')));
});
