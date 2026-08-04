/**
 * اختبارات وحدة لطبقة الرقابة/المطابقة — منطق خالص بلا شبكة ولا متصفّح.
 * تغطّي: حكم أحدث قيد · كشف النسخة الموقّعة/الصورة · صفوف المقارنة من المخطّط ·
 * اكتمال القائمة · تحذيرات الرقابة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  latestReconciliation,
  reconciliationVerdict,
  hasSignedCopy,
  hasPhoto,
  controlChecklist,
  hasControl,
  controlCompareRows,
  allChecked,
  controlWarnings,
} from './control.js';
import inv from './schemas/inv.js';
import dmg from './schemas/dmg.js';
import po from './schemas/po.js';

// ── أحدث قيد والحكم ────────────────────────────────────────────────
test('لا قيود ⇒ غير مُحقَّق', () => {
  assert.equal(latestReconciliation([]), null);
  assert.deepEqual(reconciliationVerdict([]), { verified: false, result: null });
});

test('الأحدث يحكم: مطابقٌ ثم اختلافٌ = اختلاف', () => {
  const recs = [
    { result: 'matched', byName: 'أ', at: 1 },
    { result: 'mismatch', byName: 'ب', at: 2, note: 'الكمية ناقصة' },
  ];
  const v = reconciliationVerdict(recs);
  assert.equal(v.verified, false);
  assert.equal(v.result, 'mismatch');
  assert.equal(v.by, 'ب');
  assert.equal(v.note, 'الكمية ناقصة');
});

test('آخر قيد مطابق ⇒ مُحقَّق', () => {
  const v = reconciliationVerdict([{ result: 'mismatch', at: 1 }, { result: 'matched', at: 2 }]);
  assert.equal(v.verified, true);
  assert.equal(v.result, 'matched');
});

// ── الأدلّة ────────────────────────────────────────────────────────
test('hasSignedCopy يكشف نسخةً موقّعة أو توقيعًا فقط', () => {
  assert.equal(hasSignedCopy([{ kind: 'invoice' }]), false);
  assert.equal(hasSignedCopy([{ kind: 'signedCopy' }]), true);
  assert.equal(hasSignedCopy([{ kind: 'signature' }]), true);
  assert.equal(hasSignedCopy([]), false);
});

test('hasPhoto يكشف صورةً بأيّ نوع image/*', () => {
  assert.equal(hasPhoto([{ mime: 'image/jpeg' }]), true);
  assert.equal(hasPhoto([{ mime: 'application/pdf' }]), false);
  assert.equal(hasPhoto([]), false);
});

// ── ضبط المخطّط ────────────────────────────────────────────────────
test('hasControl يميّز الأنواع الخاضعة للرقابة', () => {
  assert.equal(hasControl(inv), true);
  assert.equal(hasControl(dmg), true);
  assert.equal(hasControl(po), false, 'أمر الشراء لا رقابة مطابقة عليه');
});

test('controlChecklist يقرأ بنود القائمة من المخطّط', () => {
  assert.ok(controlChecklist(inv).length >= 4);
  assert.deepEqual(controlChecklist(po), []);
});

// ── صفوف المقارنة ──────────────────────────────────────────────────
test('controlCompareRows يبني القيم الصادرة من المخطّط (محسوبةً ومكتوبة)', () => {
  const doc = {
    header: { invoiceDate: '2026-08-04', customer: 'مطعم البركة', deliveryRef: 'DN-2026-0001' },
    lines: [{ qty: 2, unitPrice: 10 }],
  };
  const rows = controlCompareRows(inv, doc);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.equal(byKey.customer, 'مطعم البركة');
  assert.equal(byKey.invoiceDate, '2026-08-04');
  assert.equal(byKey.grandTotal, '20', 'الإجمالي المحسوب يظهر في المقارنة');
});

test('controlCompareRows يتجاهل المفاتيح غير الموجودة في المخطّط', () => {
  const rows = controlCompareRows({ control: { compareFields: ['zzz'] }, sections: [] }, { header: {} });
  assert.deepEqual(rows, []);
});

// ── اكتمال القائمة ─────────────────────────────────────────────────
test('allChecked يشترط تأشير كل البنود', () => {
  assert.equal(allChecked(inv, {}), false);
  const full = Object.fromEntries(controlChecklist(inv).map((i) => [i.key, true]));
  assert.equal(allChecked(inv, full), true);
  assert.equal(allChecked(po, {}), true, 'بلا قائمة ⇒ لا شرط');
});

// ── التحذيرات ──────────────────────────────────────────────────────
test('تحذيرات الرقابة: نسخة موقّعة ناقصة + لم يُطابَق بعد', () => {
  const w = controlWarnings(inv, {}, { attachments: [], records: [] });
  assert.ok(w.some((x) => x.includes('نسخة موقّعة')));
  assert.ok(w.some((x) => x.includes('لم يُطابَق')));
});

test('تحذيرات الرقابة تختفي بعد إرفاق موقّعة وتسجيل مطابقة', () => {
  const w = controlWarnings(inv, {}, {
    attachments: [{ kind: 'signedCopy', mime: 'application/pdf' }],
    records: [{ result: 'matched', at: 1 }],
  });
  assert.deepEqual(w, []);
});

test('تحذير الصور للتالف حين لا صورة، ثمّ تحذير الاختلاف', () => {
  const noPhoto = controlWarnings(dmg, {}, { attachments: [], records: [{ result: 'matched', at: 1 }] });
  assert.ok(noPhoto.some((x) => x.includes('صور')));
  const mismatch = controlWarnings(dmg, {}, {
    attachments: [{ mime: 'image/jpeg' }],
    records: [{ result: 'mismatch', at: 1, note: 'x' }],
  });
  assert.ok(mismatch.some((x) => x.includes('اختلاف')));
});

test('النوع بلا رقابة لا يُنتج تحذيرات', () => {
  assert.deepEqual(controlWarnings(po, {}, { attachments: [], records: [] }), []);
});
