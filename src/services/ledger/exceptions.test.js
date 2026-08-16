/**
 * اختبارات سجلّ الاستثناءات ‹EXE-201› — دورة الحياة كاملةً في Node بلا شبكة.
 *
 * والقواعد الثلاث محروسةٌ هنا: الإغلاق بقرارٍ مكتوب والدليل يُعلَن ولا يمنع ·
 * لا تعديلَ أثرٍ والتصحيح استثناءٌ جديد · والوقت المتبقّي يُحسب ولا يُخزَّن.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXCEPTION_STATUS,
  EXCEPTION_TYPES,
  VANISHED_NOTE,
  boardRows,
  filterRows,
  detectionsToDrafts,
  reconcileDetections,
  SEVERITY,
  canTransition,
  closeVerdict,
  correctionDraft,
  exceptionNumber,
  exceptionProblems,
  fingerprint,
  isOpenStatus,
  remainingTime,
  shapeException,
  sortForBoard,
  summarize,
} from './exceptions.js';
import { parseNumber } from '../documents/numberFormat.js';

const NOW = Date.parse('2026-08-16T12:00:00Z');
const exc = (over = {}) =>
  shapeException({
    type: 'qc_reject',
    severity: SEVERITY.HIGH,
    docRef: { type: 'GRN', number: 'GRN-2026-0007' },
    sku: 'WW40CMDISPLAY',
    qty: 3,
    reason: 'غياب ملصق البراند ووجود أثر استعمال',
    location: 'QC-HOLD-01',
    ownerRole: 'qc_inspector',
    dueAt: '2026-08-16T14:00:00Z',
    ...over,
  });

/* ── الحقول الثلاثة عشر ────────────────────────────────────────── */

test('★ الحقول الثلاثة عشر كلّها محفوظة — لا يذوب الاختلاف في ملاحظةٍ نصّيّة', () => {
  const e = exc({ number: 'EXC-2026-0041' });
  for (const f of ['number', 'type', 'severity', 'docRef', 'sku', 'qty', 'reason', 'location', 'ownerRole', 'dueAt', 'action', 'status', 'decision']) {
    assert.ok(f in e, `الحقل «${f}» مفقود`);
  }
  assert.equal(e.status, EXCEPTION_STATUS.OPEN, 'يبدأ مفتوحًا');
});

test('★★ لكلّ نوعٍ إجراءٌ مطلوب — تنبيهٌ بلا «افعل كذا» يُقرأ ويُترك', () => {
  for (const [id, t] of Object.entries(EXCEPTION_TYPES)) {
    assert.ok(t.action, `النوع «${id}» بلا إجراء`);
    assert.ok(t.owner, `النوع «${id}» بلا مسؤول`);
  }
  assert.equal(exc().action, EXCEPTION_TYPES.qc_reject.action, 'والإجراء يُملأ من النوع تلقائيًّا');
});

test('الترقيم من مولّد الترقيم القائم لا من مولّدٍ ثانٍ', () => {
  assert.equal(exceptionNumber(2026, 41), 'EXC-2026-0041');
  assert.deepEqual(parseNumber(exceptionNumber(2026, 41)), { type: 'EXC', year: 2026, seq: 41 });
});

/* ── ما يمنع الحفظ ─────────────────────────────────────────────── */

test('★ استثناءٌ بلا سببٍ شكوى لا معلومة', () => {
  assert.match(exceptionProblems({ ...exc(), reason: '' })[0], /السبب مطلوب/);
});

test('نوعٌ مجهول لا يُحفظ · واستثناءٌ بلا مرجعٍ لا يُتتبَّع', () => {
  assert.match(exceptionProblems({ type: 'طيران', reason: 'x' })[0], /نوع الاستثناء غير معروف/);
  const orphan = exceptionProblems({ type: 'expired', reason: 'x', docRef: {}, sku: '', location: '' });
  assert.match(orphan[0], /بلا مرجع/);
});

test('استثناءٌ سليم لا مشكلة فيه', () => {
  assert.deepEqual(exceptionProblems(exc()), []);
});

/* ── البصمة (مفتاح EXE-202) ───────────────────────────────────── */

test('★★ البصمة تجعل حادثتين حادثةً واحدة — وإلّا فُتح الاستثناء عند كلّ رسم', () => {
  assert.equal(fingerprint(exc()), fingerprint(exc({ severity: SEVERITY.LOW, reason: 'صياغةٌ أخرى' })));
  assert.notEqual(fingerprint(exc()), fingerprint(exc({ sku: 'OTHER' })));
  assert.notEqual(fingerprint(exc()), fingerprint(exc({ type: 'expired' })));
  assert.notEqual(fingerprint(exc()), fingerprint(exc({ docRef: { type: 'GRN', number: 'GRN-2026-0008' } })));
});

/* ── الانتقالات ───────────────────────────────────────────────── */

test('★★ المسار: مفتوح ← قيد المعالجة ← بانتظار اعتماد ← مُغلق', () => {
  assert.equal(canTransition('open', 'in_progress'), true);
  assert.equal(canTransition('in_progress', 'awaiting_approval'), true);
  assert.equal(canTransition('awaiting_approval', 'closed'), true);
  assert.equal(canTransition('open', 'closed'), false, 'لا قفزَ إلى الإغلاق بلا اعتماد');
});

test('★★ لا انتقالَ من «مُغلق» — لا تعديلَ أثر', () => {
  for (const to of Object.values(EXCEPTION_STATUS)) assert.equal(canTransition('closed', to), false, to);
});

test('التصعيد ليس نهايةً — يعود منه إلى المعالجة أو الإغلاق', () => {
  assert.equal(canTransition('open', 'escalated'), true);
  assert.equal(canTransition('escalated', 'in_progress'), true);
  assert.equal(canTransition('escalated', 'closed'), true);
});

test('المفتوح يُعدّ والمُغلق لا', () => {
  assert.equal(isOpenStatus('escalated'), true);
  assert.equal(isOpenStatus('closed'), false);
  assert.equal(isOpenStatus('طائر'), false, 'وحالةٌ مجهولة ليست مفتوحة');
});

/* ── حكم الإغلاق ──────────────────────────────────────────────── */

test('★★ الإغلاق يحتاج قرارًا مكتوبًا — «أُغلق» بلا سببٍ أسوأ من عدمه', () => {
  const ready = exc({ status: EXCEPTION_STATUS.AWAITING_APPROVAL });
  const v = closeVerdict(ready, { decision: '' });
  assert.equal(v.ok, false);
  assert.match(v.problem, /قرارًا مكتوبًا/);
});

test('★★ الدليل يُعلَن نقصه ولا يمنع — ومنعُه يوقف الدورة (ت-O02)', () => {
  const ready = exc({ status: EXCEPTION_STATUS.AWAITING_APPROVAL });
  const v = closeVerdict(ready, { decision: 'أُرجع للمورّد بموجب SRN-2026-0002' });
  assert.equal(v.ok, true, 'يُغلق');
  assert.equal(v.gaps.length, 1, 'ويُعلَن نقص الدليل');
  assert.match(v.gaps[0], /بلا دليل/);

  const withEvidence = closeVerdict(ready, { decision: 'أُرجع للمورّد', evidenceRef: 'SRN-2026-0002' });
  assert.deepEqual(withEvidence.gaps, []);
});

test('★ الإغلاق من حالةٍ لا تسبقه يُرفض بسببه', () => {
  const v = closeVerdict(exc({ status: EXCEPTION_STATUS.OPEN }), { decision: 'خلاص' });
  assert.equal(v.ok, false);
  assert.match(v.problem, /يمرّ بالاعتماد أوّلًا/);
});

test('★★ المغلَق لا يُغلق ثانيةً — والرسالة تدلّ على الطريق الصحيح', () => {
  const v = closeVerdict(exc({ status: EXCEPTION_STATUS.CLOSED }), { decision: 'مرّةً أخرى' });
  assert.equal(v.ok, false);
  assert.match(v.problem, /التصحيح استثناءٌ جديد/);
});

/* ── التصحيح ──────────────────────────────────────────────────── */

test('★★ التصحيح استثناءٌ جديد يشير للأوّل ولا يمسّه', () => {
  const closed = exc({ number: 'EXC-2026-0041', status: EXCEPTION_STATUS.CLOSED, decision: 'قُبل استثناءً' });
  const fix = correctionDraft(closed, { reason: 'القرار بُني على عدّ خاطئ' });
  assert.equal(fix.correctsRef, 'EXC-2026-0041');
  assert.equal(fix.status, EXCEPTION_STATUS.OPEN);
  assert.equal(fix.number, '', 'يأخذ رقمًا جديدًا عند الحفظ');
  assert.equal(fix.decision, '', 'ولا يرث قرار الأوّل');
  assert.equal(closed.status, EXCEPTION_STATUS.CLOSED, 'والأصل لم يُمسّ');
});

test('التصحيح بلا سببٍ مكتوب يأخذ سببًا يدلّ على أصله', () => {
  const fix = correctionDraft(exc({ number: 'EXC-2026-0041', status: EXCEPTION_STATUS.CLOSED }));
  assert.match(fix.reason, /EXC-2026-0041/);
});

/* ── الوقت يُحسب ولا يُخزَّن ───────────────────────────────────── */

test('★★ الوقت المتبقّي محسوبٌ بـ`nowMs` ممرَّرًا — وحقلٌ محفوظٌ له يكذب بعد دقيقة', () => {
  const e = exc();
  assert.equal('remaining' in e, false);
  assert.equal(remainingTime(e, NOW).hours, 2);
  assert.equal(remainingTime(e, NOW).overdue, false);
  const late = remainingTime(e, Date.parse('2026-08-16T17:00:00Z'));
  assert.equal(late.overdue, true);
  assert.match(late.label, /تأخّر 3 ساعة/);
});

test('بلا موعدٍ لا يُخترع تأخّر', () => {
  const r = remainingTime(exc({ dueAt: '' }), NOW);
  assert.deepEqual({ ms: r.ms, overdue: r.overdue }, { ms: null, overdue: false });
  assert.equal(r.label, 'بلا موعدٍ معلن');
});

/* ── اللوحة ───────────────────────────────────────────────────── */

test('الترتيب: الخطورة أوّلًا ثمّ الأقرب موعدًا', () => {
  const list = [
    exc({ severity: SEVERITY.LOW, dueAt: '2026-08-16T13:00:00Z', sku: 'L' }),
    exc({ severity: SEVERITY.HIGH, dueAt: '2026-08-16T18:00:00Z', sku: 'H-LATE' }),
    exc({ severity: SEVERITY.HIGH, dueAt: '2026-08-16T13:00:00Z', sku: 'H-SOON' }),
  ];
  assert.deepEqual(sortForBoard(list, NOW).map((e) => e.sku), ['H-SOON', 'H-LATE', 'L']);
});

test('بلا موعدٍ يُؤخَّر ولا يتصدّر على من له موعد', () => {
  const list = [exc({ dueAt: '', sku: 'NODUE' }), exc({ dueAt: '2026-08-16T20:00:00Z', sku: 'DUE' })];
  assert.deepEqual(sortForBoard(list, NOW).map((e) => e.sku), ['DUE', 'NODUE']);
});

test('الملخّص يعدّ المفتوح والمتأخّر والمرتفع — والمُغلق خارج العدّ', () => {
  const list = [
    exc({ severity: SEVERITY.HIGH, dueAt: '2026-08-16T09:00:00Z' }),
    exc({ severity: SEVERITY.LOW, type: 'expired' }),
    exc({ status: EXCEPTION_STATUS.CLOSED, severity: SEVERITY.HIGH }),
  ];
  const sum = summarize(list, NOW);
  assert.deepEqual(
    { total: sum.total, open: sum.open, closed: sum.closed, high: sum.high, overdue: sum.overdue },
    { total: 3, open: 2, closed: 1, high: 1, overdue: 1 }
  );
  assert.equal(sum.byType.expired, 1);
});

test('قائمةٌ فارغة لا تُسقط الملخّص', () => {
  assert.equal(summarize(null, NOW).open, 0);
  assert.deepEqual(sortForBoard(null, NOW), []);
});

/* ═══ مصالحة الكشف مع السجلّ ‹EXE-202› ═══ */

const detection = (over = {}) => ({
  severity: 'high',
  category: 'inventory',
  title: 'رصيدٌ عالق',
  detail: 'في ساحة الاستلام منذ أيام',
  href: '/dashboard/stock-ledger',
  identity: { type: 'stuck_balance', sku: 'WNW-001', qty: 12, location: 'RECEIVING', reason: 'عالقٌ في ساحة الاستلام' },
  ...over,
});

test('★ الكشف يصير مسودّةً بمسؤولها وإجرائها من نوعه', () => {
  const [d] = detectionsToDrafts([detection()]);
  assert.equal(d.type, 'stuck_balance');
  assert.equal(d.severity, SEVERITY.HIGH);
  assert.equal(d.ownerRole, EXCEPTION_TYPES.stuck_balance.owner);
  assert.equal(d.action, EXCEPTION_TYPES.stuck_balance.action);
});

test('كشفٌ بلا هويّة لا يصير سجلًّا — العرض شيءٌ والسجلّ شيءٌ آخر', () => {
  assert.deepEqual(detectionsToDrafts([{ severity: 'med', title: 'شيء', identity: null }]), []);
  assert.deepEqual(detectionsToDrafts([detection({ identity: { type: 'مجهول' } })]), []);
});

test('★★ الكشف المتكرّر لا يفتح سجلًّا ثانيًا', () => {
  const drafts = detectionsToDrafts([detection()]);
  const first = reconcileDetections(drafts, []);
  assert.equal(first.toOpen.length, 1);

  const saved = { ...first.toOpen[0], id: 'x1', status: EXCEPTION_STATUS.OPEN };
  const second = reconcileDetections(drafts, [saved]);
  assert.equal(second.toOpen.length, 0, 'لا يُفتح ثانيةً');
  assert.equal(second.active.length, 1);
});

test('★★ زوال السبب لا يُغلق — يُعلَّم وينتظر قرارًا', () => {
  const saved = { ...detectionsToDrafts([detection()])[0], id: 'x1', status: EXCEPTION_STATUS.IN_PROGRESS };
  const r = reconcileDetections([], [saved]);
  assert.equal(r.vanished.length, 1, 'يُعلَّم');
  assert.equal(r.vanished[0].status, EXCEPTION_STATUS.IN_PROGRESS, 'ولا تتغيّر حالته');
  assert.match(VANISHED_NOTE, /يبقى مفتوحًا/);
});

test('★ المُغلق لا يُعدّ زائلًا ولا يمنع فتح كشفٍ جديد بالبصمة نفسها', () => {
  const draft = detectionsToDrafts([detection()])[0];
  const closed = { ...draft, id: 'old', status: EXCEPTION_STATUS.CLOSED };
  const r = reconcileDetections([draft], [closed]);
  assert.equal(r.vanished.length, 0, 'المُغلق خارج الحساب');
  assert.equal(r.toOpen.length, 1, 'وتكرار الحادثة بعد إغلاقها حادثةٌ جديدة تُسجَّل');
});

test('كشفٌ فارغ وسجلٌّ فارغ لا يُنتجان شيئًا', () => {
  const r = reconcileDetections(null, null);
  assert.deepEqual([r.toOpen, r.active, r.vanished], [[], [], []]);
});

/* ═══ صندوق القرار ‹EXE-204› ═══ */

test('★★ المكشوف غير المسجَّل لا يختفي — يظهر موسومًا مع زرّ تسجيله', () => {
  const rows = boardRows([detection()], [], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].registered, false);
  assert.equal(rows[0].id, null);
});

test('★★ لكلّ صفٍّ إجراؤه ومسؤوله — قراءةٌ بلا «افعل كذا» تُترك', () => {
  const saved = { ...detectionsToDrafts([detection()])[0], id: 'x1', status: EXCEPTION_STATUS.OPEN, number: 'EXC-2026-0001' };
  const [row] = boardRows([detection()], [saved], NOW);
  assert.equal(row.registered, true);
  assert.equal(row.action, EXCEPTION_TYPES.stuck_balance.action);
  assert.equal(row.ownerRole, EXCEPTION_TYPES.stuck_balance.owner);
  assert.equal(row.typeLabel, EXCEPTION_TYPES.stuck_balance.label);
  assert.equal(row.stillDetected, true, 'وما زال المحرّك يكشفه');
});

test('★ المسجَّل الذي زال سببه يبقى في الصندوق موسومًا أنّه لم يُكشف الآن', () => {
  const saved = { ...detectionsToDrafts([detection()])[0], id: 'x1', status: EXCEPTION_STATUS.OPEN };
  const [row] = boardRows([], [saved], NOW);
  assert.equal(row.registered, true);
  assert.equal(row.stillDetected, false);
});

test('المُغلق خارج الصندوق', () => {
  const closed = { ...detectionsToDrafts([detection()])[0], id: 'x', status: EXCEPTION_STATUS.CLOSED };
  assert.equal(boardRows([], [closed], NOW).length, 0);
});

test('الترشيح بالخطورة والنوع وغير المسجَّل والمتأخّر', () => {
  const rows = boardRows([detection(), detection({ severity: 'med', identity: { type: 'expired', qty: 2, reason: 'منتهٍ' } })], [], NOW);
  assert.equal(filterRows(rows, { severity: SEVERITY.HIGH }).length, 1);
  assert.equal(filterRows(rows, { type: 'expired' }).length, 1);
  assert.equal(filterRows(rows, { onlyUnregistered: true }).length, 2);
  assert.equal(filterRows(rows, {}).length, 2, 'وبلا مرشّحٍ يظهر الكلّ');
});
