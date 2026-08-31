/**
 * اختبارات النسخة الاحتياطيّة على الجهاز — منطق خالص بتخزينٍ محقون.
 *
 * الخاصّيّة المحورية: **النسخة لا تُسقط الحفظ أبدًا.** تخزينٌ ممنوعٌ أو ممتلئٌ
 * أو معطوبُ المحتوى — كلُّها تُبتلع صامتةً، لأنّ نسخةً احتياطيّةً تُفشل
 * العمليّةَ الأصليّة عكسُ الغرض منها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backupKey,
  readBackup,
  appendBackup,
  clearBackup,
  listBackups,
  backupExportRows,
  MAX_ENTRIES,
} from './scanBackup.js';

/** تخزينٌ وهميٌّ بواجهة localStorage. */
function fakeStore(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const ENTRY = { barcode: '801', sku: 'SKU-1', name: 'كريم', qty: 3, uom: 'CTN', baseQty: 36 };

/* ───────────────── المفتاح ───────────────── */

test('المفتاح مرجعٌ واحدٌ يجمع الكاتب والقارئ', () => {
  assert.equal(backupKey('op1'), 'bzScanBackup:op1');
  assert.equal(backupKey('  op1  '), 'bzScanBackup:op1');
});

/* ───────────────── الإلحاق والقراءة ───────────────── */

test('يُلحق قيدًا ويقرأه', () => {
  const s = fakeStore();
  appendBackup(s, 'op1', ENTRY, { byName: 'محمد', opCode: 'H4K9TM', now: 1000 });
  const rows = readBackup(s, 'op1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].barcode, '801');
  assert.equal(rows[0].byName, 'محمد');
  assert.equal(rows[0].opCode, 'H4K9TM');
  assert.equal(rows[0].savedAt, 1000);
});

test('الأقدمُ أوّلًا كما كُتب — لا يُقلب الترتيب', () => {
  const s = fakeStore();
  appendBackup(s, 'op1', { ...ENTRY, barcode: 'A' });
  appendBackup(s, 'op1', { ...ENTRY, barcode: 'B' });
  assert.deepEqual(readBackup(s, 'op1').map((r) => r.barcode), ['A', 'B']);
});

test('كلُّ جلسةٍ نسخةٌ مستقلّة', () => {
  const s = fakeStore();
  appendBackup(s, 'op1', ENTRY);
  appendBackup(s, 'op2', ENTRY);
  appendBackup(s, 'op2', ENTRY);
  assert.equal(readBackup(s, 'op1').length, 1);
  assert.equal(readBackup(s, 'op2').length, 2);
});

test('بلا معرّف جلسةٍ لا يُكتب شيء', () => {
  const s = fakeStore();
  appendBackup(s, '', ENTRY);
  assert.equal(s.length, 0);
  assert.deepEqual(readBackup(s, ''), []);
});

/* ───────────────── ★ لا تُسقط الحفظ أبدًا ───────────────── */

test('★ تخزينٌ يرمي عند الكتابة (حصّةٌ ممتلئة) — لا ينتشر الخطأ', () => {
  const s = fakeStore();
  s.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.doesNotThrow(() => appendBackup(s, 'op1', ENTRY));
});

test('★ تخزينٌ يرمي عند القراءة (تصفّحٌ خاصّ) — يُعيد فارغًا', () => {
  const s = fakeStore();
  s.getItem = () => {
    throw new Error('SecurityError');
  };
  assert.deepEqual(readBackup(s, 'op1'), []);
  assert.doesNotThrow(() => appendBackup(s, 'op1', ENTRY));
});

test('★ محتوًى معطوبٌ (JSON غير صالح) يُقرأ فارغًا ولا ينهار', () => {
  const s = fakeStore({ 'bzScanBackup:op1': '{{{ليس جيسون' });
  assert.deepEqual(readBackup(s, 'op1'), []);
});

test('★ محتوًى صالحٌ لكنّه ليس قائمةً يُرفض', () => {
  const s = fakeStore({ 'bzScanBackup:op1': '{"a":1}' });
  assert.deepEqual(readBackup(s, 'op1'), []);
});

test('★ بلا تخزينٍ إطلاقًا (خادمٌ بلا متصفّح) لا شيء ينكسر', () => {
  assert.deepEqual(readBackup(undefined, 'op1'), []);
  assert.doesNotThrow(() => appendBackup(null, 'op1', ENTRY));
  assert.doesNotThrow(() => clearBackup(null, 'op1'));
  assert.deepEqual(listBackups(null), []);
});

/* ───────────────── السقف ───────────────── */

test('★ التجاوز يُسقط الأقدم لا الأحدث — آخرُ ما عُدّ أولى بالبقاء', () => {
  const s = fakeStore();
  for (let i = 1; i <= 5; i++) appendBackup(s, 'op1', { ...ENTRY, barcode: `B${i}` }, { max: 3 });
  const rows = readBackup(s, 'op1');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.barcode), ['B3', 'B4', 'B5']);
});

test('السقف الافتراضيّ ألفان — فوق أيّ جردٍ حقيقيّ', () => {
  assert.equal(MAX_ENTRIES, 2000);
});

/* ───────────────── المحو والجرد ───────────────── */

test('المحو يُزيل نسخة الجلسة وحدها', () => {
  const s = fakeStore();
  appendBackup(s, 'op1', ENTRY);
  appendBackup(s, 'op2', ENTRY);
  clearBackup(s, 'op1');
  assert.equal(readBackup(s, 'op1').length, 0);
  assert.equal(readBackup(s, 'op2').length, 1);
});

test('يجرد الجلسات التي لها نسخةٌ محلّيّة', () => {
  const s = fakeStore();
  appendBackup(s, 'op1', ENTRY);
  appendBackup(s, 'op2', ENTRY);
  appendBackup(s, 'op2', ENTRY);
  const found = listBackups(s).sort((a, b) => a.opId.localeCompare(b.opId));
  assert.deepEqual(found, [{ opId: 'op1', count: 1 }, { opId: 'op2', count: 2 }]);
});

test('★ النسخة الفارغة لا تُعرض — سطرٌ يقول «عندك عمل» وليس فيه شيء كذب', () => {
  const s = fakeStore({ 'bzScanBackup:op9': '[]' });
  assert.deepEqual(listBackups(s), []);
});

test('لا يخلط مفاتيح غيره في التخزين', () => {
  const s = fakeStore({ bzCloudOpId: 'op1', 'other:key': '[1,2]' });
  appendBackup(s, 'op1', ENTRY);
  assert.deepEqual(listBackups(s), [{ opId: 'op1', count: 1 }]);
});

/* ───────────────── صفوف التصدير ───────────────── */

test('★ الوحدة عمودٌ مستقلّ — «٥» وحدها رقمٌ بلا معنى', () => {
  const [row] = backupExportRows([{ ...ENTRY, byName: 'محمد', opCode: 'H4K9TM', savedAt: 0 }]);
  assert.equal(row['الكمّيّة'], 3);
  assert.equal(row['الوحدة'], 'CTN');
  assert.equal(row['الكمّيّة بوحدة الأساس'], 36);
  assert.equal(row['العادّ'], 'محمد');
});

test('الأساس المجهول يُصدَّر «—» لا صفرًا — صفرٌ يكذب مجموعًا', () => {
  const [row] = backupExportRows([{ ...ENTRY, baseQty: null }]);
  assert.equal(row['الكمّيّة بوحدة الأساس'], '—');
});

test('يقبل محوِّل وقتٍ محقونًا ويُسمّي العمود بوقت الجهاز', () => {
  const [row] = backupExportRows([{ ...ENTRY, savedAt: 42 }], { formatTime: (v) => `t${v}` });
  assert.equal(row['وقت الجهاز'], 't42');
});

test('لا صفوفَ من مُدخَلٍ غير قائمة', () => {
  assert.deepEqual(backupExportRows(null), []);
  assert.deepEqual(backupExportRows(undefined), []);
});
