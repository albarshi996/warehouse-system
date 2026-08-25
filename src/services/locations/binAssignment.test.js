/**
 * اختبارات إسناد الأصناف إلى مواقعها.
 *
 * جوهرُها التمييزُ الثلاثيّ: **مُسنَدٌ ومعروف** (قابلٌ للتوجيه) · **بلا موقع**
 * (مشروعٌ وغيرُ موجَّه) · **موقعٌ مجهول** (عطبٌ يُمنع الاعتماد حتّى يُصلَح).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { assignmentNotes, assignmentReport, directablePct, rowBin } from './binAssignment.js';

const KNOWN = ['RHB-PIK-A01-R01-L01-B01', 'RHB-PIK-A01-R01-L01-B02'];

test('★★ ثلاث حالاتٍ لا حالتان — والمجهول وحده عطب', () => {
  const rows = [
    { sku: 'A', warehouse: 'RHB', bin: 'RHB-PIK-A01-R01-L01-B01', qty: 10 },
    { sku: 'B', warehouse: 'RHB', bin: '', qty: 5 },
    { sku: 'C', warehouse: 'RHB', bin: 'RHB-PIK-A99-R01-L01-B01', qty: 3 },
  ];
  const r = assignmentReport(rows, KNOWN);
  assert.equal(r.total, 3);
  assert.equal(r.assigned, 1, 'المعروف وحده قابلٌ للتوجيه');
  assert.equal(r.unassigned, 1, 'بلا موقعٍ مشروعٌ ولا يُعدّ خطأً');
  assert.equal(r.unknown, 1);
  assert.equal(r.ok, false, 'المجهول يمنع');
  assert.equal(r.unknownRows[0].bin, 'RHB-PIK-A99-R01-L01-B01');
});

test('★★ بلا مواقعَ معرَّفةٍ بعد لا يُحكم على أحد — البانية لم تُشغَّل', () => {
  const rows = [{ sku: 'A', warehouse: 'RHB', bin: 'RHB-PIK-A01', qty: 1 }];
  const r = assignmentReport(rows, []);
  assert.equal(r.unknown, 0, 'حكمُ «مجهول» على قائمةٍ فارغة حكمٌ على الأداة لا على البيانات');
  assert.equal(r.assigned, 1);
  assert.equal(r.ok, true);
});

test('★ التقرير يُجمَّع بالمستودع وتُجمع كمّيّاته', () => {
  const rows = [
    { sku: 'A', warehouse: 'RHB', bin: KNOWN[0], qty: 10 },
    { sku: 'B', warehouse: 'RHB', bin: '', qty: 5 },
    { sku: 'C', warehouse: 'TRP', bin: '', qty: 100 },
  ];
  const r = assignmentReport(rows, KNOWN);
  const trp = r.byWarehouse.find((w) => w.warehouse === 'TRP');
  const rhb = r.byWarehouse.find((w) => w.warehouse === 'RHB');
  assert.equal(trp.qty, 100);
  assert.equal(rhb.qty, 15);
  assert.equal(r.byWarehouse[0].warehouse, 'TRP', 'الأكثر كمّيّةً أوّلًا');
});

test('★ المستودع يُشتقّ من الكود حين يغيب عمودُه', () => {
  const r = assignmentReport([{ sku: 'A', bin: KNOWN[0], qty: 1 }], KNOWN);
  assert.equal(r.byWarehouse[0].warehouse, 'RHB');
});

test('نسبة القابل للتوجيه تُحسب ولا تنهار على الفارغ', () => {
  assert.equal(directablePct(assignmentReport([], KNOWN)), 0);
  const r = assignmentReport(
    [{ sku: 'A', bin: KNOWN[0], qty: 1 }, { sku: 'B', bin: '', qty: 1 }],
    KNOWN
  );
  assert.equal(directablePct(r), 50);
});

test('★ الملاحظات جملٌ تقول الصواب — والمجهولُ يُسمّى بكوده', () => {
  const rows = [
    { sku: 'C', warehouse: 'RHB', bin: 'RHB-PIK-A99', qty: 3 },
    { sku: 'B', warehouse: 'RHB', bin: '', qty: 5 },
  ];
  const notes = assignmentNotes(assignmentReport(rows, KNOWN));
  assert.ok(notes.some((n) => n.includes('RHB-PIK-A99')), 'يُسمّى الرفّ المجهول');
  assert.ok(notes.some((n) => /عرِّفه في بانية المواقع/.test(n)), 'يقول الصواب لا العطب فقط');
  assert.ok(notes.some((n) => /لا يدخل مسار السحب/.test(n)), 'بلا موقعٍ يُعلَن أثره');
  assert.ok(notes.some((n) => /قابلٌ للتوجيه/.test(n)), 'النسبة تُعلَن دون النصف');
});

test('rowBin يقبل `location` القديم كما يقبله الحفظ', () => {
  assert.equal(rowBin({ location: 'rhb-pik-a01' }), 'RHB-PIK-A01');
  assert.equal(rowBin({ bin: 'RHB-PIK-A01', location: 'X' }), 'RHB-PIK-A01', 'bin يتقدّم');
  assert.equal(rowBin({}), '');
});

test('ورقةٌ فارغة تُقال ولا تنهار', () => {
  const r = assignmentReport([], KNOWN);
  assert.equal(r.total, 0);
  assert.deepEqual(assignmentNotes(r), ['لا صفوفَ في الورقة.']);
});
