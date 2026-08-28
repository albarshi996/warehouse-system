/**
 * اختبارات سجلّ الباركود — الحقول الأحد عشر والحالات الخمس وقاعدة «لا تُعاد قيمة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARCODE_STATUSES,
  applyPrint,
  applyStatus,
  buildEntry,
  entryCard,
  entryProblems,
  filterEntries,
  isTerminalStatus,
  printProblem,
  registryCounters,
  reprintSummary,
  reuseProblem,
  shapeEntry,
  statusProblem,
} from './barcodeRegistry.js';
import { BARCODE_CLASSES } from './barcodeKinds.js';

const BASE = {
  value: 'W01-DOCK-OUT-01',
  createdBy: 'u-1',
  createdByName: 'محمد',
  createdAt: '2026-08-27T08:00:00.000Z',
  reason: 'افتتاح الرصيف الشماليّ',
};

test('القيد يُسوّى: القيمة تمرّ بالمصنّف فتُطبَّع، والنوع والفئة يُشتقّان', () => {
  const e = shapeEntry({ ...BASE, value: '  w01 dock out 01 ' });
  assert.equal(e.value, 'W01-DOCK-OUT-01', 'قيمةٌ تدخل بصورةٍ وتُمسح بأخرى تعني قيدًا لا يجده أحد');
  assert.equal(e.kind, 'DOCK_OUT');
  assert.equal(e.class, BARCODE_CLASSES.STRUCTURE.id);
  assert.equal(e.status, BARCODE_STATUSES.ACTIVE.id, 'المولود فعّال');
  assert.equal(e.printCount, 0);
});

test('★ قيدٌ بلا منشئٍ أو وقتٍ أو سببٍ لا يدخل السجلّ', () => {
  assert.deepEqual(entryProblems(BASE), []);
  assert.match(entryProblems({ ...BASE, createdBy: '' }).join(' '), /بلا منشئٍ/);
  assert.match(entryProblems({ ...BASE, createdAt: '' }).join(' '), /بلا وقتٍ/);
  assert.match(entryProblems({ ...BASE, reason: '' }).join(' '), /بلا سببٍ ولا مستندٍ ولا مهمّة/);
  assert.equal(
    entryProblems({ ...BASE, reason: '', docRef: 'GRN-2026-0007' }).length,
    0,
    'المستند يقوم مقام السبب — العمليّة نفسها هي السبب'
  );
});

test('★ قيمةٌ لا يعرفها المصنّف تُردّ بسبب المصنّف نفسه', () => {
  const bad = entryProblems({ ...BASE, value: '???' });
  assert.match(bad.join(' '), /الصور المقبولة/);
});

test('البناء يُجمّد القيد — ما دخل السجلّ لا تعدّله يدٌ بعدها', () => {
  const { entry, problems } = buildEntry(BASE);
  assert.equal(problems, undefined);
  assert.equal(Object.isFrozen(entry), true);
  assert.throws(() => {
    'use strict';
    entry.value = 'X';
  });
});

test('★★ لا تُعاد قيمةٌ قائمة — ولو كانت فعّالة: القيمة هي الهويّة', () => {
  const existing = shapeEntry(BASE);
  assert.match(reuseProblem('W01-DOCK-OUT-01', existing), /القيمة هي الهويّة/);
  assert.equal(reuseProblem('W01-DOCK-OUT-02', existing), '', 'قيمةٌ أخرى حرّة');
  assert.equal(reuseProblem('W01-DOCK-OUT-01', null), '', 'ولا قيدَ قائمٌ فلا منع');
});

test('★★ والمغلقة والملغاة محروقتان للأبد — نصّ الطلب في الطبلية وهو أخطر في الموقع', () => {
  const closed = shapeEntry({ ...BASE, status: 'CLOSED', statusAt: '2026-08-20' });
  assert.match(reuseProblem('W01-DOCK-OUT-01', closed), /ولا تُعاد قيمةٌ أُغلقت/);
  assert.equal(isTerminalStatus('CLOSED'), true);
  assert.equal(isTerminalStatus('VOID'), true);
  assert.equal(isTerminalStatus('DAMAGED'), false, 'التالف يُعاد طبعُه ويعود — والنصّ نصّ عليه');
});

test('الطباعة الأولى بلا سبب — والثانية فصاعدًا تُلزم سببًا', () => {
  const first = applyPrint(BASE, { actor: 'u-1', at: '2026-08-27T09:00:00.000Z' });
  assert.equal(first.problem, undefined);
  assert.equal(first.entry.printCount, 1);
  assert.equal(first.record.reprint, false);

  const second = applyPrint(first.entry, { actor: 'u-2', at: '2026-08-27T10:00:00.000Z' });
  assert.match(second.problem, /النسخة رقم 2/, 'العدد في الرسالة — فيعرف الموظّف كم نسخةً في الميدان');

  const ok = applyPrint(first.entry, { actor: 'u-2', actorName: 'علي', at: '2026-08-27T10:00:00.000Z', reason: 'تلف بالماء' });
  assert.equal(ok.entry.printCount, 2);
  assert.equal(ok.record.reprint, true);
  assert.equal(ok.record.reason, 'تلف بالماء');
  assert.equal(ok.entry.prints.length, 2, 'السجلّ ملحقٌ لا مستبدَل');
});

test('★★ إعادة طباعة التالف تعيده فعّالًا — دون إنشاء موقعٍ جديد', () => {
  const damaged = shapeEntry({ ...BASE, status: 'DAMAGED', printCount: 1 });
  const out = applyPrint(damaged, { actor: 'u-1', at: '2026-08-27T11:00:00.000Z', reason: 'الملصق ممزَّق' });
  assert.equal(out.entry.status, BARCODE_STATUSES.ACTIVE.id);
});

test('★ الملغى لا يُطبع — وإلّا عاد إلى الحديد ومُسح بعد شهر', () => {
  const voided = shapeEntry({ ...BASE, status: 'VOID' });
  assert.match(printProblem(voided, { actor: 'u-1', at: 'الآن' }), /ملغى/);
  assert.match(printProblem(BASE, { actor: '', at: 'الآن' }), /بلا فاعل/);
  assert.match(printProblem(BASE, { actor: 'u-1', at: '' }), /بلا وقت/);
});

test('انتقالات الحالة محكومة — والإلغاء والتلف يُلزمان سببًا', () => {
  assert.equal(statusProblem(BASE, 'IN_USE'), '');
  assert.match(statusProblem(BASE, 'VOID'), /يحتاج سببًا/);
  assert.equal(statusProblem(BASE, 'VOID', { reason: 'طُبع مكرَّرًا' }), '');
  assert.match(statusProblem(BASE, 'ACTIVE'), /فعّال أصلًا/);
  assert.match(statusProblem(BASE, 'طائر'), /غير معروفة/);

  const closed = shapeEntry({ ...BASE, status: 'CLOSED' });
  assert.match(statusProblem(closed, 'ACTIVE'), /ختاميّة/);
});

test('applyStatus يقيّد من نقل الحالة ومتى ولماذا', () => {
  const out = applyStatus(BASE, 'VOID', { actor: 'u-9', at: '2026-08-27T12:00:00.000Z', reason: 'ازدواج' });
  assert.equal(out.entry.status, 'VOID');
  assert.equal(out.entry.statusBy, 'u-9');
  assert.equal(out.entry.statusReason, 'ازدواج');
  assert.match(applyStatus(BASE, 'IN_USE', { actor: '', at: 'الآن' }).problem, /بلا فاعل/);
});

test('البطاقة تشتقّ كلّ ما تعرضه الشاشة — بما فيه وسم المنشئ', () => {
  const card = entryCard({ ...BASE, printCount: 3 });
  assert.equal(card.kindLabel, 'باب تحميل');
  assert.equal(card.statusLabel, 'فعّال');
  assert.equal(card.classLabel, 'باركود بنية');
  assert.equal(card.origin, 'أُنشئ بواسطة المدير محمد');
  assert.equal(card.reprinted, true);
  assert.equal(entryCard({ value: '' }), null);
});

test('العدّادات والخلاصة الرقابيّة', () => {
  const rows = [
    { ...BASE, printCount: 3 },
    { ...BASE, value: 'W01-DOCK-IN-01', printCount: 1 },
    { ...BASE, value: 'LPN-MAIN-20260827-000001', docRef: 'GRN-1', printCount: 0, status: 'IN_USE' },
  ];
  const c = registryCounters(rows);
  assert.equal(c.total, 3);
  assert.equal(c.byKind.DOCK_OUT, 1);
  assert.equal(c.structure, 2);
  assert.equal(c.operation, 1);
  assert.equal(c.neverPrinted, 1, 'باركودٌ لم يُطبع قطّ = ملصقٌ ليس على الحديد');

  const r = reprintSummary(rows);
  assert.equal(r.values, 1);
  assert.equal(r.extraCopies, 2);
  assert.equal(r.top[0].value, 'W01-DOCK-OUT-01');
});

test('التصفية بالنوع والحالة والمنشئ والنصّ — والنصّ يُطبَّع قبل المقارنة', () => {
  const rows = [
    { ...BASE, value: 'W01-DOCK-OUT-01' },
    { ...BASE, value: 'LPN-MAIN-20260827-000001', docRef: 'GRN-2026-0007', status: 'IN_USE' },
  ];
  assert.equal(filterEntries(rows, { kind: 'PALLET' }).length, 1);
  assert.equal(filterEntries(rows, { status: 'IN_USE' }).length, 1);
  assert.equal(filterEntries(rows, { term: 'dock out' }).length, 1, 'المسافة فاصلٌ كما في المسح');
  assert.equal(filterEntries(rows, { term: 'grn 2026 0007' }).length, 1, 'ويُبحث بالمستند أيضًا');
  assert.equal(filterEntries(rows, {}).length, 2);
});
