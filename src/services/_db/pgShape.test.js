/**
 * بيّنةُ عكسِ الخريطة.
 *
 * ★★★ وأهمُّ اختبارٍ هنا ليس عن قيمةٍ بل عن **انجرافٍ بين ملفّين**: حقلٌ
 *     يُضاف إلى `db/sync/pg-maps.js` ولا يُضاف هنا يعني عمودًا يُكتب في
 *     القاعدة **ولا يعود إلى الشاشة أبدًا**. وهذا لا يُكتشف بالعين لأنّ
 *     الملفّين لا يُقرآن معًا. فيُقرأ الأمامُ هنا ويُقارَن حرفيًّا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowToDoc, columnsFor, specFor } from './pgShape.js';
import { MAPS } from '../../../db/sync/pg-maps.js';

/**
 * أعمدةٌ موجودةٌ في الأمام ولا مقابلَ لها هنا — **بسببٍ مكتوبٍ لكلٍّ**.
 * وإضافةُ اسمٍ إلى هذا الجدول قرارٌ، لا إسكاتٌ لاختبار.
 */
const EXCUSED = Object.freeze({
  // `documents.firebase_id` نسخةٌ حرفيّةٌ من `documents.id` — المزامنةُ تكتب
  // `__id` في العمودين معًا. فعمودُ المعرّف `id` يكفي، والثاني تكرار.
  documents: ['firebase_id'],
});

test('★★★ لا انجرافَ بين الخريطة الأماميّة وعكسِها — عمودًا عمودًا', () => {
  for (const head of ['Items_Master', 'documents']) {
    const forward = MAPS.find((m) => m.path === head);
    assert.ok(forward, `خريطةُ ${head} الأماميّة مفقودة`);

    const spec = specFor(head);
    const mine = new Set([...spec.fields.map(([, col]) => col), spec.idColumn]);
    const excused = new Set(EXCUSED[head] || []);

    const missing = Object.keys(forward.cols).filter((c) => !mine.has(c) && !excused.has(c));
    assert.deepEqual(
      missing,
      [],
      `أعمدةٌ تُكتب في «${head}» ولا تعود إلى الشاشة: ${missing.join(' · ')}`
    );

    const invented = [...mine].filter((c) => !(c in forward.cols));
    assert.deepEqual(
      invented,
      [],
      `أعمدةٌ تُقرأ من «${head}» ولا تُكتب أصلًا: ${invented.join(' · ')}`
    );
  }
});

test('صنفٌ يعود بأسماء المستند لا بأسماء الأعمدة', () => {
  const row = {
    firebase_id: 'FB1',
    sku: 'AP193',
    name_ar: 'كريم',
    name_en: 'Cream',
    barcodes: ['656272773236'],
    archived: false,
    sub_family: 'عناية',
    item_type: 'منتج',
    uom_factors: { box: 12 },
    unit_price: '12.50',
    legacy_balance: 7,
    created_at: '2026-10-19T22:00:00+00:00',
    extra: { soAllocation: 'X' },
  };
  const out = rowToDoc('Items_Master', row, { ts: (iso) => ({ iso }) });

  assert.equal(out.id, 'FB1');
  assert.equal(out.data.nameAr, 'كريم');
  assert.equal(out.data.subFamily, 'عناية');
  assert.equal(out.data.itemType, 'منتج');
  assert.deepEqual(out.data.barcodes, ['656272773236']);
  assert.deepEqual(out.data.uomFactors, { box: 12 });
  // ★ والرصيدُ القديم يعود باسمه الأصليّ لا باسم العمود.
  assert.equal(out.data.balance, 7);
  assert.equal(out.data.legacy_balance, undefined);
});

test('★★ العددُ يصل رقمًا ولو أرسلته القاعدةُ نصًّا', () => {
  const out = rowToDoc('Items_Master', { firebase_id: 'X', unit_price: '12.50' }, {});
  assert.equal(out.data.unitPrice, 12.5);
  assert.equal(typeof out.data.unitPrice, 'number');
});

test('★★★ الوقتُ يعود `Timestamp` لا نصًّا — وإلّا سقطت كلُّ شاشةٍ تنادي toDate', () => {
  const made = [];
  const out = rowToDoc(
    'documents',
    { id: 'D1', created_at: '2026-10-19T22:00:00+00:00' },
    { ts: (iso) => { made.push(iso); return { __ts: iso }; } }
  );
  assert.deepEqual(out.data.createdAt, { __ts: '2026-10-19T22:00:00+00:00' });
  assert.equal(made.length, 1);
});

test('★★★ نقض: مستندٌ لم يُعتمد لا يعود معتمَدًا في ١٩٧٠', () => {
  const out = rowToDoc(
    'documents',
    { id: 'D1', approved_at: null, posted_at: '' },
    { ts: (iso) => new Date(iso) }
  );
  assert.equal('approvedAt' in out.data, false);
  assert.equal('postedAt' in out.data, false);
});

test('★★ الزائدُ يُفرَد ولا يطمس عمودًا حقيقيًّا', () => {
  const out = rowToDoc(
    'documents',
    { id: 'D1', number: 'PO-1', extra: { number: 'مزوَّر', custom: 9 } },
    {}
  );
  assert.equal(out.data.number, 'PO-1', 'العمودُ المسمّى يعلو extra');
  assert.equal(out.data.custom, 9, 'وما في extra لا يضيع');
});

test('نقض: صفٌّ بلا معرّفٍ لا يصير مستندًا بمعرّفٍ فارغ', () => {
  assert.equal(rowToDoc('Items_Master', { firebase_id: null, sku: 'A' }, {}), null);
  assert.equal(rowToDoc('Items_Master', { firebase_id: '', sku: 'A' }, {}), null);
  assert.equal(rowToDoc('assets', { id: 'x' }, {}), null, 'مجموعةٌ غيرُ منسوخة');
  assert.equal(rowToDoc('documents', null, {}), null);
});

test('قائمةُ الأعمدة صريحةٌ وتضمّ المعرّفَ والزائد', () => {
  const cols = columnsFor('Items_Master');
  assert.ok(cols.includes('firebase_id'));
  assert.ok(cols.includes('extra'));
  assert.ok(cols.includes('name_ar'));
  assert.equal(new Set(cols).size, cols.length, 'لا تكرار');
  assert.equal(columnsFor('assets'), null);
});
