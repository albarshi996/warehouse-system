/**
 * اختبارات البحث الموحَّد — «مدخلٌ واحد يعرف ماذا أُعطي».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { QUERY_KINDS, classifyQuery, resultCard, searchPallets, traceOf } from './lpnSearch.js';

const A = 'LPN-MAIN-20260827-000145';
const UNITS = [
  {
    code: A, state: 'STORED', flags: [], warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01',
    supplier: 'شركة نوفا', createdBy: 'محمد',
    sourceDoc: { type: 'GRN', number: 'GRN-2026-0032' },
    lines: [{ sku: 'WNW-001', name: 'ماء نوفا', barcode: '6221000', batch: 'B2408', baseQty: 60 }],
  },
  {
    code: 'LPN-MAIN-20260827-000200', state: 'STORED', flags: ['DAMAGED'], warehouse: 'MAIN', bin: 'MAIN-A09-R01-B01',
    lines: [{ sku: 'WNW-002', name: 'عصير', batch: 'B9000', baseQty: 12 }],
  },
];

test('★★ نوعُ المدخل يُستنتج من شكله — والأخصُّ أوّلًا', () => {
  assert.equal(classifyQuery(A).kind, 'LPN');
  assert.equal(classifyQuery('GRN-2026-0032').kind, 'DOCUMENT');
  assert.equal(classifyQuery('MAIN-A01-R01-B01').kind, 'BIN');
  assert.equal(classifyQuery('6221000').kind, 'ITEM');
  assert.equal(classifyQuery('ماء').kind, 'TEXT');
  assert.equal(classifyQuery('').kind, 'TEXT');
  assert.equal(QUERY_KINDS.LPN, 'رقم طبلية');
});

test('★ الهويّة تُستنتج قبل النصّ — ولا تُقرأ نصًّا حرًّا', () => {
  const r = searchPallets(UNITS, A);
  assert.equal(r.kind, 'LPN');
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].why, 'هويّة الطبلية');
});

test('★★ الموقعُ الأعلى يجد ما تحته — «MAIN-A01» يجد رفوفه', () => {
  const exact = searchPallets(UNITS, 'MAIN-A01-R01-B01');
  assert.equal(exact.results.length, 1);
  assert.equal(exact.results[0].why, 'واقفةٌ في هذا الموقع');

  const zone = searchPallets(UNITS, 'MAIN-A01');
  assert.equal(zone.results.length, 1);
  assert.match(zone.results[0].why, /تحت هذا النطاق/);

  const wh = searchPallets(UNITS, 'MAIN-A09');
  assert.equal(wh.results.length, 1, 'ولا يخلط منطقةً بأخرى');
});

test('البحث بالمستند وبالباركود وبالدفعة — وكلٌّ يقول سبب مطابقته', () => {
  assert.match(searchPallets(UNITS, 'GRN-2026-0032').results[0].why, /مستندها المصدر/);
  assert.match(searchPallets(UNITS, '6221000').results[0].why, /تحمل الصنف/);
  const batch = searchPallets(UNITS, 'B2408');
  assert.match(batch.results[0].why, /دفعة|صنفٌ أو دفعة/, 'الدفعة تُطابَق نصًّا إن لم تُصنَّف');
});

test('★★ النصّ الحرّ مدخلٌ واحدٌ لا أحدَ عشر — يبحث في الهويّة والصنف والمورّد والموظّف', () => {
  assert.match(searchPallets(UNITS, 'ماء').results[0].why, /صنفٌ أو دفعة/);
  assert.match(searchPallets(UNITS, 'نوفا').results[0].why, /صنفٌ أو دفعة|مورّدها/);
  assert.match(searchPallets(UNITS, 'محمد').results[0].why, /أنشأها/);
  assert.equal(searchPallets(UNITS, 'لا شيء').results.length, 0);
});

test('بطاقةُ النتيجة تكفي للتعرّف — بحالتها وأوسمتها بالعربيّة', () => {
  const card = resultCard(UNITS[1]);
  assert.equal(card.stateLabel, 'مخزَّنة');
  assert.deepEqual(card.flags, ['تالفة']);
  assert.equal(card.bin, 'MAIN-A09-R01-B01');
  assert.equal(card.itemCount, 1);
});

test('★★★ التتبّع يُبنى من الأحداث — فما وقع هو ما سُجّل، ولا سردَ منفصلٌ يُنسى', () => {
  const events = [
    { type: 'CREATED', at: '2026-08-27T09:00:00Z', actor: 'محمد', label: 'إنشاء الطبلية', doc: { number: 'GRN-2026-0032' } },
    { type: 'MOVED', at: '2026-08-27T11:00:00Z', actor: 'أحمد', label: 'انتقال موقع', doc: { number: 'PUTAWAY-2026-0002' }, details: { toBin: 'MAIN-A01-R01-B01' } },
    { type: 'PICKED_FROM', at: '2026-08-28T08:00:00Z', actor: 'سالم', label: 'سحبٌ منها', doc: { number: 'PICK-2026-0021' } },
  ];
  const t = traceOf(UNITS[0], events);
  assert.equal(t.stations.length, 3);
  assert.equal(t.born.label, 'إنشاء الطبلية');
  assert.equal(t.last.label, 'سحبٌ منها');
  assert.deepEqual(t.documentPath, ['GRN-2026-0032', 'PUTAWAY-2026-0002', 'PICK-2026-0021'], 'مثال خطة ٧ حرفيًّا');
  assert.deepEqual(t.binPath, ['MAIN-A01-R01-B01']);
});

test('الأحداث تُرتَّب بالوقت مهما وصلت مبعثرة — والفارغُ لا يُنهار عليه', () => {
  const jumbled = [
    { type: 'MOVED', at: '2026-08-27T11:00:00Z', label: 'ب' },
    { type: 'CREATED', at: '2026-08-27T09:00:00Z', label: 'أ' },
  ];
  assert.equal(traceOf(UNITS[0], jumbled).born.label, 'أ');
  const empty = traceOf(UNITS[0], []);
  assert.equal(empty.born, null);
  assert.deepEqual(empty.stations, []);
  assert.deepEqual(empty.documentPath, ['GRN-2026-0032'], 'ومستندُ المصدر يبقى');
});
