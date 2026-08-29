/**
 * حلُّ كود الصنف — المصدر الواحد (BULK-000).
 *
 * حارسٌ لأربعة:
 *   1. **الترتيب الحاكم محفوظٌ حرفيًّا** — الهويّة ثمّ الباركود ثمّ كتالوج
 *      الطرف. وانقلابُه يعني صنفًا خاطئًا في مستندٍ صحيح.
 *   2. **المجهول لا يوقف** — `null` لا استثناء، وفشلُ كتالوج الطرف يُبتلع
 *      كما كان يُبتلع في المحرّك.
 *   3. **ما كُتب بيدٍ لا يُدهس** — والهويّةُ وحدها تُثبَّت بصيغة الماستر.
 *   4. **لا حالةَ ولا رسالة** — الدالّتان تُستدعيان بلا React وبلا شبكة،
 *      وهذا الملفّ نفسه بيّنةُ ذلك: لو قرأتا حالةً لما عمل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  documentPartner,
  resolveItemCode,
  applyResolvedItem,
  resolveItemCodes,
  outcomeFor,
  duplicateGroups,
  codeStatuses,
  skuCellVerdict,
  mergeDuplicateLines,
} from './itemResolver.js';
import { normalizeItemCode } from '../items/itemIdentity.js';
import { planPaste as planPasteForTest, applyPastePlan as applyPastePlanForTest } from './bulkPaste.js';

const ITEM = {
  sku: 'ITM-1',
  nameAr: 'زيت زيتون',
  baseUom: 'piece',
  buyUom: 'carton',
  uomFactors: { carton: 12 },
  uomBarcodes: { '6001': 'carton' },
};

/** استدعاءاتٌ مزيّفة تسجّل ما سُئل وبأيّ ترتيب. */
function fakeLookups({ bySku = {}, byBarcode = {}, partnerHit = null, partnerThrows = false } = {}) {
  const calls = [];
  return {
    calls,
    lookups: {
      getItem: async (v) => { calls.push(`sku:${v}`); return bySku[v] || null; },
      lookupByBarcode: async (v) => { calls.push(`barcode:${v}`); return byBarcode[v] || null; },
      lookupItemByPartnerCode: async ({ code }) => {
        calls.push(`partner:${code}`);
        if (partnerThrows) throw new Error('لا صلاحية');
        return partnerHit;
      },
    },
  };
}

test('طرف المستند: المورّد أوّلًا ثمّ العميل، وبلا طرفٍ لا كتالوج', () => {
  assert.deepEqual(documentPartner({ supplierCode: 'S-1' }), { partnerType: 'supplier', partnerCode: 'S-1' });
  assert.deepEqual(documentPartner({ customerCode: 'C-9' }), { partnerType: 'customer', partnerCode: 'C-9' });
  assert.deepEqual(documentPartner({ supplierCode: 'S-1', customerCode: 'C-9' }), { partnerType: 'supplier', partnerCode: 'S-1' });
  assert.equal(documentPartner({}), null);
  assert.equal(documentPartner(null), null);
});

test('عمود الكود: الهويّة أوّلًا — ولا يُسأل الباركود إن أجابت', async () => {
  const { calls, lookups } = fakeLookups({ bySku: { 'ITM-1': ITEM } });
  const r = await resolveItemCode('ITM-1', { columnKey: 'sku', lookups });
  assert.equal(r.item.sku, 'ITM-1');
  assert.deepEqual(calls, ['sku:ITM-1']);
});

test('عمود الكود: الباركود احتياطٌ ثانٍ، وكتالوج الطرف ثالثٌ — بالترتيب', async () => {
  const entry = { partnerItemCode: 'SUP-77', uom: 'carton', conversionFactor: 24 };
  const { calls, lookups } = fakeLookups({ partnerHit: { item: ITEM, entry } });
  const r = await resolveItemCode('SUP-77', {
    columnKey: 'sku',
    partner: { partnerType: 'supplier', partnerCode: 'S-1' },
    lookups,
  });
  assert.deepEqual(calls, ['sku:SUP-77', 'barcode:SUP-77', 'partner:SUP-77']);
  assert.equal(r.viaPartner, entry);
});

test('عمود الباركود: لا يُسأل الماستر بالهويّة — الباركود وسيلة بحثٍ لا هويّة', async () => {
  const { calls, lookups } = fakeLookups({ byBarcode: { 6001: ITEM } });
  const r = await resolveItemCode('6001', { columnKey: 'barcode', lookups });
  assert.deepEqual(calls, ['barcode:6001']);
  // باركود الوحدة يحدّد الوحدة أيضًا (SAP-3)
  assert.equal(r.unitFromBarcode, 'carton');
});

test('عمود الكود لا يشتقّ وحدةً من باركود — ولو تطابق النصّ', async () => {
  const { lookups } = fakeLookups({ bySku: { 6001: ITEM } });
  const r = await resolveItemCode('6001', { columnKey: 'sku', lookups });
  assert.equal(r.unitFromBarcode, '');
});

test('المجهول يُعيد null لا استثناءً — والفارغ لا يسأل أحدًا', async () => {
  const { calls, lookups } = fakeLookups();
  assert.equal(await resolveItemCode('MISSING', { columnKey: 'sku', lookups }), null);
  assert.equal(await resolveItemCode('   ', { columnKey: 'sku', lookups }), null);
  assert.deepEqual(calls, ['sku:MISSING', 'barcode:MISSING']);
});

test('بلا طرفٍ لا يُسأل الكتالوج أصلًا', async () => {
  const { calls, lookups } = fakeLookups();
  await resolveItemCode('X-1', { columnKey: 'sku', partner: null, lookups });
  assert.equal(calls.some((c) => c.startsWith('partner:')), false);
});

test('فشل كتالوج الطرف يُبتلع: مجهولٌ لا انفجار', async () => {
  const { lookups } = fakeLookups({ partnerThrows: true });
  const r = await resolveItemCode('SUP-77', {
    columnKey: 'sku',
    partner: { partnerType: 'supplier', partnerCode: 'S-1' },
    lookups,
  });
  assert.equal(r, null);
});

test('فشل الماستر نفسه يُرمى — «تعذّر السؤال» ليس «مجهولًا»', async () => {
  const lookups = { getItem: async () => { throw new Error('شبكة'); }, lookupByBarcode: async () => null };
  await assert.rejects(() => resolveItemCode('ITM-1', { columnKey: 'sku', lookups }), /شبكة/);
});

test('الختم على السطر: الفارغ يُملأ وما كُتب بيدٍ يبقى', () => {
  const line = { sku: '', description: 'وصفٌ كتبه الموظّف', qty: '2', uom: '' };
  const next = applyResolvedItem(line, { item: ITEM, viaPartner: null, unitFromBarcode: '' }, 'GRN');
  assert.equal(next.sku, 'ITM-1');
  assert.equal(next.description, 'وصفٌ كتبه الموظّف');
  assert.equal(next.uom, 'carton'); // وحدة الشراء لمستند شراء (ف‑٩)
  assert.equal(next.uomFactor, 12);
  assert.equal(next.baseQty, 24);
});

test('الهويّة تُثبَّت بصيغة الماستر، والكود المختلف يبقى كما كُتب', () => {
  const same = applyResolvedItem({ sku: 'itm-1' }, { item: ITEM }, 'GRN');
  assert.equal(same.sku, 'ITM-1');
  const other = applyResolvedItem({ sku: 'ITM-9' }, { item: ITEM }, 'GRN');
  assert.equal(other.sku, 'ITM-9');
});

test('كود الطرف يُختم على السطر ومعامله معه — والتخزين على الهويّة الداخليّة', () => {
  const entry = { partnerItemCode: 'SUP-77', uom: 'carton', conversionFactor: 24 };
  const next = applyResolvedItem({ sku: '', qty: '3' }, { item: ITEM, viaPartner: entry }, 'GRN');
  assert.equal(next.sku, 'ITM-1');
  assert.equal(next.partnerItemCode, 'SUP-77');
  assert.equal(next.uomFactor, 24); // معامل هذا المورّد لا معامل الصنف
  assert.equal(next.baseQty, 72);
});

test('باركود الوحدة يغلب افتراض العائلة', () => {
  const next = applyResolvedItem({ sku: '' }, { item: ITEM, unitFromBarcode: 'piece' }, 'GRN');
  assert.equal(next.uom, 'piece');
});

test('بلا صنفٍ لا يتغيّر السطر البتّة', () => {
  const line = { sku: 'X', qty: '1' };
  assert.equal(applyResolvedItem(line, null, 'GRN'), line);
});

/* ═══════════════ الجملة (BULK-103) ═══════════════ */

test('★ المكرّرُ يُسأل مرّةً واحدة — ذاكرةٌ مؤقّتةٌ للّصقة', async () => {
  const { calls, lookups } = fakeLookups({ bySku: { 'ITM-1': ITEM } });
  const b = await resolveItemCodes(['ITM-1', 'itm-1', ' ITM-1 ', 'ITM-1'], { columnKey: 'sku', lookups });
  assert.deepEqual(calls, ['sku:ITM-1']); // سؤالٌ واحدٌ لأربع كتابات
  assert.equal(b.ok, 1);
  assert.equal(outcomeFor(b, 'itm-1').status, 'ok');
});

test('★★ الفشلُ في كودٍ لا يوقف بقيّتَه — و«تعذّر» يتمايز عن «مجهول»', async () => {
  const lookups = {
    getItem: async (v) => {
      if (v === 'BOOM') throw new Error('شبكة');
      return v === 'ITM-1' ? ITEM : null;
    },
    lookupByBarcode: async () => null,
  };
  const b = await resolveItemCodes(['ITM-1', 'BOOM', 'GHOST'], { columnKey: 'sku', lookups });
  assert.deepEqual({ ok: b.ok, unknown: b.unknown, failed: b.failed }, { ok: 1, unknown: 1, failed: 1 });
  assert.equal(outcomeFor(b, 'ITM-1').status, 'ok');
  assert.equal(outcomeFor(b, 'BOOM').status, 'failed');
  assert.equal(outcomeFor(b, 'GHOST').status, 'unknown');
});

test('لصقةٌ فارغةٌ لا تسأل أحدًا', async () => {
  const { calls, lookups } = fakeLookups();
  const b = await resolveItemCodes(['', '  ', null], { columnKey: 'sku', lookups });
  assert.deepEqual(calls, []);
  assert.equal(b.byCode.size, 0);
});

test('المكرّرُ يُكشف بهويّته لا بصيغته — وبندٌ واحدٌ ليس تكرارًا', () => {
  const groups = duplicateGroups([
    { index: 0, value: 'ITM-1' },
    { index: 1, value: 'ITM-2' },
    { index: 2, value: 'itm-1' },
    { index: 3, value: ' ITM-1 ' },
  ]);
  assert.equal(groups.size, 1);
  assert.deepEqual(groups.get('ITM-1'), [0, 2, 3]);
  assert.equal(duplicateGroups([{ index: 0, value: 'X' }]).size, 0);
  assert.equal(duplicateGroups([]).size, 0);
});

/* ═══════════════ الحكم (BULK-104) ═══════════════ */

const batchOf = (map) => ({ byCode: new Map(Object.entries(map)) });

test('المجهولُ يُعلَّم برسالته، و«تعذّر السؤال» برسالةٍ أخرى — لا تُخلطان', () => {
  const statuses = codeStatuses(batchOf({
    'ITM-1': { status: 'ok' },
    'GHOST': { status: 'unknown' },
    'BOOM': { status: 'failed' },
  }));
  assert.equal(statuses.has('ITM-1'), false); // المستبانُ لا يُعلَّم
  assert.match(skuCellVerdict('ghost', { statuses }).message, /غير موجود في دليل الأصناف/);
  assert.match(skuCellVerdict('BOOM', { statuses }).message, /تعذّر سؤال الماستر/);
  assert.equal(skuCellVerdict('ITM-1', { statuses }), null);
});

test('★ العلامةُ تُشتقّ من الكود لا من الصفّ — يُصلحه الموظّف فتذهب بلا تنظيف', () => {
  const statuses = new Map([['GHOST', 'unknown']]);
  assert.notEqual(skuCellVerdict('GHOST', { statuses }), null);
  assert.equal(skuCellVerdict('ITM-1', { statuses }), null); // كُتب كودٌ صحيحٌ ⇒ لا علامة
  assert.equal(skuCellVerdict('', { statuses }), null);
  assert.equal(skuCellVerdict('X', {}), null);
});

test('والتنبيهُ أصفرُ دائمًا — الأحمرُ محجوزٌ للتحذير وحدَه، ولا منعَ للحفظ', () => {
  const v = skuCellVerdict('G', { statuses: new Map([['G', 'unknown']]) });
  assert.equal(v.level, 'warn');
});

test('المكرّرُ يُنبَّه ويبقى بندَين — والرسالةُ تقول لماذا (BULK-O01)', () => {
  const dups = duplicateGroups([
    { index: 0, value: 'ITM-1' },
    { index: 2, value: 'itm-1' },
  ]);
  const v = skuCellVerdict('ITM-1', { duplicates: dups });
  assert.match(v.message, /يبقى بندَين/);
  assert.match(v.message, /دفعتان أو موقعان أو سعران/);
});

test('المجهولُ يغلب المكرّر — أهمُّ ما يُقال أوّلًا', () => {
  const v = skuCellVerdict('G', {
    statuses: new Map([['G', 'unknown']]),
    duplicates: new Map([['G', [0, 1]]]),
  });
  assert.match(v.message, /غير موجود/);
});

test('الدمجُ يجمع الكمّيّة في الأوّل ويحذف البواقي — بقرارٍ لا تلقائيًّا', () => {
  const lines = [
    { sku: 'ITM-1', qty: '4' },
    { sku: 'ITM-2', qty: '1' },
    { sku: 'ITM-1', qty: '6' },
  ];
  const out = mergeDuplicateLines(lines, [0, 2]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { sku: 'ITM-1', qty: '10' });
  assert.deepEqual(out[1], { sku: 'ITM-2', qty: '1' });
  assert.equal(lines.length, 3); // ولا يُمسّ الأصل
});

test('الدمجُ لا يخترع رقمًا من نصٍّ غير رقميّ، ولا يفعل شيئًا لبندٍ واحد', () => {
  const lines = [{ sku: 'A', qty: 'غير محدّد' }, { sku: 'A', qty: '' }];
  assert.deepEqual(mergeDuplicateLines(lines, [0, 1])[0], { sku: 'A', qty: 'غير محدّد' });
  assert.deepEqual(mergeDuplicateLines(lines, [0]), lines);
  assert.deepEqual(mergeDuplicateLines(lines, [0, 9]), lines); // فهرسٌ لا وجود له
});

test('★★ العلامةُ لا تدخل البندَ أبدًا: المحفوظُ نظيفٌ من كلّ أثرٍ لها', () => {
  // المسارُ الخالصُ كاملًا: خطّةٌ ⇒ صفوفٌ ⇒ ختمُ المستبان — والمجهولُ يُترك.
  const COLUMNS = ['sku', 'description', 'qty', 'uom'];
  const empty = () => Object.fromEntries(COLUMNS.map((k) => [k, '']));
  const p = planPasteForTest({
    text: 'ITM-1\nGHOST\nITM-1',
    startIndex: 0,
    columnKeys: COLUMNS,
    startColumnKey: 'sku',
    lineCount: 1,
  });
  let out = applyPastePlanForTest([empty()], p, empty);
  const statuses = new Map([['GHOST', 'unknown']]);
  out = out.map((line) =>
    normalizeItemCode(line.sku) === 'ITM-1'
      ? applyResolvedItem(line, { item: ITEM, viaPartner: null, unitFromBarcode: '' }, 'GRN')
      : line
  );

  // العلامةُ تُرى في العرض…
  assert.notEqual(skuCellVerdict(out[1].sku, { statuses }), null);
  // …ولا أثرَ لها في البيانات: لا مفتاحَ خارج أعمدة المخطّط وإثراء الوحدات.
  const allowed = new Set([...COLUMNS, 'uomFactor', 'uomFactorFor', 'uomFactorSource', 'baseQty', 'baseUom', 'partnerItemCode']);
  for (const line of out) {
    for (const key of Object.keys(line)) {
      assert.ok(allowed.has(key), `مفتاحٌ دخيلٌ في البند المحفوظ: ${key}`);
    }
  }
  assert.equal(out[1].sku, 'GHOST'); // والمجهولُ يبقى كما كتبه الموظّف
});
