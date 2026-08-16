/**
 * اختبارات بوّابة المسح — الرفض يقول الصواب، والتجاوز يمرّ بسبب، والجزئيّ يُحفظ.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyScan,
  batchScanVerdict,
  itemScanVerdict,
  matchesItem,
  qtyVerdict,
  scanVerdict,
  splitByLocation,
} from './scanGate.js';
import { finishVerdict, lineProgress, taskProgress, isLineLevel, ORDER_TYPES } from '../labor/laborModel.js';

const LINE = { sku: 'WNW-001', barcode: '6291234567890', description: 'زيت ذرة', batch: 'B2408', expiry: '2027-06-30', qtyRequired: 20, qtyDone: 0 };
const LOC = { code: 'E5-A01', warehouse: 'E5', status: 'active', storageType: 'ambient', capacity: { qty: 100 }, mixItems: true, mixBatches: true };

test('★ مهمّتا التخزين والسحب مضافتان بلا كسر الأربعة القائمة', () => {
  assert.equal(ORDER_TYPES.putaway.docType, 'PUTAWAY');
  assert.equal(ORDER_TYPES.pick.docType, 'PICK');
  assert.equal(isLineLevel('putaway'), true);
  assert.equal(isLineLevel('receipt'), false, 'أمر الاستلام يبقى عدّادَ وحدات');
  for (const old of ['receipt', 'transfer', 'delivery', 'container']) {
    assert.ok(ORDER_TYPES[old], `${old} يجب أن يبقى`);
  }
});

test('مطابقة الصنف تقبل الكود أو الباركود — الملصق قد يحمل أيًّا منهما', () => {
  assert.ok(matchesItem(LINE, 'WNW-001'));
  assert.ok(matchesItem(LINE, 'wnw-001'));
  assert.ok(matchesItem(LINE, '6291234567890'));
  assert.ok(matchesItem(LINE, '06291234567890'), 'الصفر البادئ لا يُنتج صنفًا آخر');
  assert.ok(!matchesItem(LINE, 'WNW-002'));
});

test('🔒 ★★ مسح صنفٍ خاطئ يُرفض برسالة **تقول الصواب** لا كلمة «خطأ»', () => {
  const v = itemScanVerdict(LINE, 'WNW-002');
  assert.equal(v.ok, false);
  assert.match(v.message, /المطلوب «WNW-001»/, 'تذكر المطلوب');
  assert.match(v.message, /زيت ذرة/, 'وتذكر اسمه');
});

test('🔒 ★★ مسح دفعةٍ غير مخصَّصة يُرفض ويذكر المخصَّصة', () => {
  const v = batchScanVerdict(LINE, 'B9999');
  assert.equal(v.ok, false);
  assert.match(v.message, /المطلوب «B2408»/);
  assert.match(v.message, /الممسوح «B9999»/);
});

test('★★ بندٌ بلا دفعة يقبل أيّ مسح — حارسٌ يشترطها يوقف عملًا صحيحًا', () => {
  const noBatch = { ...LINE, batch: '' };
  assert.equal(batchScanVerdict(noBatch, '').ok, true);
  assert.equal(batchScanVerdict(noBatch, 'أيّ شيء').ok, true);
  assert.equal(batchScanVerdict(LINE, '').ok, false, 'وبندٌ له دفعة يطلبها');
});

test('الكمّيّة: الصفر يُرفض، والتجاوز يُعلَن ولا يُبتلع', () => {
  assert.equal(qtyVerdict(LINE, 0).ok, false);
  assert.equal(qtyVerdict(LINE, 20).ok, true);
  const over = qtyVerdict(LINE, 25);
  assert.equal(over.ok, false);
  assert.equal(over.over, true);
  assert.match(over.message, /تتجاوز المتبقّي 20/);
});

test('★★ مسحٌ سليم كامل يمرّ ويُخرج قيدًا جاهزًا', () => {
  const v = scanVerdict({
    line: LINE, scannedItem: '6291234567890', scannedBatch: 'B2408', scannedBin: 'E5-A01',
    qty: 20, locations: [LOC], balances: [],
  });
  assert.deepEqual(v.problems, []);
  assert.equal(v.ok, true);
  assert.equal(v.entry.locationCode, 'E5-A01');
  assert.equal(v.entry.qty, 20);
  assert.equal(v.entry.override, false);
});

test('★★ بلا موقعٍ ممسوح لا تخزين — «لا تخزين بلا رفّ معلوم»', () => {
  const v = scanVerdict({ line: LINE, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: '', qty: 20, locations: [LOC], balances: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /امسح باركود الموقع/);
});

test('🔒 ★★ رفٌّ مرفوض: يُمنع بلا سبب، ويمرّ بسببٍ مكتوب — لا يُوقف العامل', () => {
  const stopped = { ...LOC, code: 'E5-A02', status: 'stopped' };
  const args = { line: LINE, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: 'E5-A02', qty: 20, locations: [stopped], balances: [] };

  const without = scanVerdict(args);
  assert.equal(without.ok, false);
  assert.equal(without.needsOverrideReason, true);
  assert.match(without.problems.join(' '), /إلزاميّ/);

  const withNote = scanVerdict({ ...args, overrideNote: 'الرفّ أُصلح ولم تُحدَّث حالته' });
  assert.equal(withNote.ok, true, 'العمل لا يتوقّف');
  assert.equal(withNote.entry.override, true);
  assert.equal(withNote.entry.overrideNote, 'الرفّ أُصلح ولم تُحدَّث حالته');
  assert.match(withNote.entry.overrideReason, /متوقّف/, 'ويُحفظ حكم النظام مع سبب المخالف');
});

test('★★ الإنجاز الجزئيّ يحفظ المتبقّي ولا يُغلق المهمّة', () => {
  let line = { ...LINE };
  const v = scanVerdict({ line, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: 'E5-A01', qty: 12, locations: [LOC], balances: [] });
  line = applyScan(line, v.entry);

  assert.deepEqual(lineProgress(line), { required: 20, done: 12, remaining: 8, state: 'partial' });
  const p = taskProgress([line]);
  assert.equal(p.complete, false);
  assert.equal(p.remaining, 8);
  assert.equal(p.pct, 60);

  const f = finishVerdict([line]);
  assert.equal(f.nextState, 'paused', 'لا تُغلق منجَزةً وفيها متبقٍّ');
  assert.equal(f.partial, true);
  assert.match(f.message, /يبقى 8/);
});

test('اكتمال البنود كلّها يسمح بإغلاق المهمّة', () => {
  const line = { ...LINE, qtyDone: 20 };
  assert.equal(lineProgress(line).state, 'done');
  assert.equal(taskProgress([line]).complete, true);
  assert.deepEqual(finishVerdict([line]), { nextState: 'done', partial: false, message: '' });
});

test('لم يُنجَز شيء ⇒ تبقى المهمّة كما هي ويُقال ذلك', () => {
  const f = finishVerdict([{ ...LINE }]);
  assert.equal(f.nextState, 'paused');
  assert.match(f.message, /لم يُنجَز شيء/);
});

test('★★ بندٌ واحد على رفّين: كلّ مسحٍ يُسجَّل، والقيد يتوزّع', () => {
  let line = { ...LINE };
  const a = scanVerdict({ line, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: 'E5-A01', qty: 12, locations: [LOC], balances: [] });
  line = applyScan(line, a.entry);
  const b = scanVerdict({ line, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: 'E5-A02', qty: 8, locations: [{ ...LOC, code: 'E5-A02' }], balances: [] });
  line = applyScan(line, b.entry);

  assert.equal(lineProgress(line).state, 'done');
  assert.equal(line.scans.length, 2);

  const split = splitByLocation(line);
  assert.equal(split.length, 2, 'سطرا قيدٍ لا سطرٌ واحد');
  assert.deepEqual(split.map((s) => [s.bin, s.qty]), [['E5-A01', 12], ['E5-A02', 8]]);
  assert.equal(split.reduce((s, x) => s + x.qty, 0), 20, 'ومجموعهما هو المطلوب');
});

test('مسحان على الرفّ نفسه يُجمعان في سطر قيدٍ واحد', () => {
  let line = { ...LINE, qtyRequired: 20 };
  for (const q of [5, 7]) {
    const v = scanVerdict({ line, scannedItem: 'WNW-001', scannedBatch: 'B2408', scannedBin: 'E5-A01', qty: q, locations: [LOC], balances: [] });
    line = applyScan(line, v.entry);
  }
  const split = splitByLocation(line);
  assert.equal(split.length, 1);
  assert.equal(split[0].qty, 12);
});
