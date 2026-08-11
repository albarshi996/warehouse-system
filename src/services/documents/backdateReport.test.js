/**
 * اختبارات تقرير التواريخ المعدّلة (م٢-ج).
 *
 * التقرير لا يخترع رقمًا: كلّ عمودٍ فيه مقروءٌ من كتلة `dating` التي كتبها
 * الخادم. فالاختبار الأهمّ أنّه **لا يُظهر من لا وسم له**، ولا يُخفي من له وسم.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stampDay,
  backdateRows,
  filterRows,
  backdateSummary,
  attentionItems,
  BACKDATE_COLUMNS,
} from './backdateReport.js';

const doc = (id, dating, extra = {}) => ({ id, type: 'GRN', number: `GRN-${id}`, state: 'done', dating, ...extra });
const tag = (daysBack, byName, reason = 'سبب', at = '2026-08-10') => ({
  backdated: true,
  fields: ['receivedAt'],
  daysBack,
  reason,
  byName,
  byRole: 'storekeeper',
  at,
});

/* ═══════════ ١. من يظهر ومن لا يظهر ═══════════ */

test('★ البريء لا يظهر — بلا وسمٍ بلا صفّ', () => {
  const rows = backdateRows([
    doc('1', tag(10, 'أحمد')),
    doc('2', null),
    doc('3', undefined),
    doc('4', { backdated: false }),
    { id: '5', type: 'PO' },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '1');
});

test('المدخل الفاسد لا يرمي', () => {
  assert.deepEqual(backdateRows(null), []);
  assert.deepEqual(backdateRows('نصّ'), []);
  assert.deepEqual(backdateRows([]), []);
});

test('★ الأبعد تأريخًا أوّلًا — عشرون يومًا تسبق يومين في الانتباه', () => {
  const rows = backdateRows([doc('a', tag(2, 'أ')), doc('b', tag(20, 'ب')), doc('c', tag(9, 'ج'))]);
  assert.deepEqual(rows.map((r) => r.daysBack), [20, 9, 2]);
});

test('المسوّدة بلا رقمٍ تُعرض ولا تُخفى', () => {
  const rows = backdateRows([{ id: 'x', type: 'GRN', number: null, state: 'draft', dating: tag(9, 'أ') }]);
  assert.match(rows[0].number, /بلا رقم/);
});

/* ═══════════ ٢. ختم الوقت بأشكاله ═══════════ */

test('stampDay: يقبل ختم Firestore والتاريخ والنصّ والرقم', () => {
  assert.equal(stampDay({ toDate: () => new Date('2026-08-11T09:00:00Z') }), '2026-08-11');
  assert.equal(stampDay(new Date('2026-08-11T23:00:00Z')), '2026-08-11');
  assert.equal(stampDay('2026-08-11T05:00'), '2026-08-11');
  assert.equal(stampDay(Date.parse('2026-08-11T00:00:00Z')), '2026-08-11');
  assert.equal(stampDay(null), '');
  assert.equal(stampDay('ليس تاريخًا'), '');
});

/* ═══════════ ٣. الفلاتر ═══════════ */

test('★ الفلاتر تعمل مجتمعة، والفارغ لا يُقيّد', () => {
  const rows = backdateRows([
    doc('1', tag(20, 'أحمد', 'س', '2026-08-01')),
    doc('2', tag(3, 'أحمد', 'س', '2026-08-10'), { type: 'PO' }),
    doc('3', tag(15, 'سالم', 'س', '2026-08-09')),
  ]);
  assert.equal(filterRows(rows).length, 3, 'بلا فلاتر: الكلّ');
  assert.equal(filterRows(rows, { person: 'أحمد' }).length, 2);
  assert.equal(filterRows(rows, { person: 'أحمد', minDays: 10 }).length, 1);
  assert.equal(filterRows(rows, { type: 'PO' }).length, 1);
  assert.equal(filterRows(rows, { from: '2026-08-05' }).length, 2);
  assert.equal(filterRows(rows, { from: '2026-08-05', to: '2026-08-09' }).length, 1);
});

/* ═══════════ ٤. الملخّص ═══════════ */

test('★ الملخّص يكشف النمط لا الحالة', () => {
  const rows = backdateRows([
    doc('1', tag(20, 'أحمد', 'تأخّر المورّد')),
    doc('2', tag(10, 'أحمد', 'تأخّر المورّد')),
    doc('3', tag(8, 'سالم', 'انقطاع الشبكة')),
  ]);
  const s = backdateSummary(rows);
  assert.equal(s.total, 3);
  assert.deepEqual(s.people[0], { key: 'أحمد', count: 2 });
  assert.equal(s.worst.daysBack, 20);
  assert.equal(s.avgDaysBack, 12.7);
  assert.deepEqual(s.repeatedReasons, [{ key: 'تأخّر المورّد', count: 2 }], 'المكرّر وحده يُبلَّغ');
});

test('★ السبب المفقود يُحصى — الوسم بلا سببٍ يقع حين تُلغى إلزاميّته', () => {
  const rows = backdateRows([doc('1', tag(9, 'أ', '')), doc('2', tag(9, 'ب', 'سبب'))]);
  assert.equal(backdateSummary(rows).noReason, 1);
  assert.equal(backdateSummary(rows).repeatedReasons.length, 0, 'الفارغ لا يُعدّ سببًا مكرّرًا');
});

test('الملخّص الفارغ لا يرمي ولا يقسم على صفر', () => {
  const s = backdateSummary([]);
  assert.equal(s.total, 0);
  assert.equal(s.avgDaysBack, 0);
  assert.equal(s.worst, null);
  assert.deepEqual(s.people, []);
});

/* ═══════════ ٥. طبقة «تدخّل الآن» ═══════════ */

test('★ التنبيهات أسئلةٌ لا أحكام — وتظهر عند العتبة فقط', () => {
  assert.deepEqual(attentionItems([]), [], 'لا شيء عند النظافة');

  const mild = backdateRows([doc('1', tag(9, 'أ', 'سبب مختلف'))]);
  assert.deepEqual(attentionItems(mild), [], 'حالةٌ واحدة مبرّرة ليست نمطًا');

  const heavy = backdateRows(
    Array.from({ length: 5 }, (_, i) => doc(String(i), tag(40, 'أحمد', 'تأخّر')))
  );
  const items = attentionItems(heavy);
  assert.ok(items.some((i) => i.key.startsWith('reason:')), 'السبب المكرّر');
  assert.ok(items.some((i) => i.key === 'person:أحمد'), 'الفاعل المتكرّر');
  assert.ok(items.some((i) => i.key === 'worst'), 'الأبعد تأريخًا');
  assert.ok(items.every((i) => i.tone === 'warn'), 'الأحمر للتحذير فقط');
});

/* ═══════════ ٦. عقد الأعمدة ═══════════ */

test('★ الأعمدة تجيب الأسئلة الأربعة: من · ماذا · متى · لماذا', () => {
  const keys = BACKDATE_COLUMNS.map((c) => c.key);
  for (const need of ['byName', 'fields', 'at', 'reason', 'daysBack']) {
    assert.ok(keys.includes(need), `عمود ${need} مفقود`);
  }
  // وكلّ عمودٍ يجب أن يكون موجودًا فعلًا في الصفّ — عمودٌ بلا بيانات كذبٌ مطبوع.
  const row = backdateRows([doc('1', tag(9, 'أ'))])[0];
  for (const c of BACKDATE_COLUMNS) {
    assert.ok(c.key in row, `العمود ${c.key} لا مقابل له في الصفّ`);
    assert.ok(c.label, `العمود ${c.key} بلا تسمية`);
  }
});
