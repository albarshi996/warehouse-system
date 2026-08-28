/**
 * 🔒 حرّاسُ المطابقة ‹GATE-401/402›.
 *
 * والاختبارُ الأوّل مثالُ المالك حرفيًّا: «بوابة الأمن 20 / الاستلام 18».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { countableDrafts } from '../lpn/grnBridge.js';
import {
  LIABLE_PARTIES,
  COUNTABLE_STATES,
  RECONCILE_STATUS,
  liableLabel,
  gateDeclared,
  receivedDeclared,
  reconcileVisit,
  decideVariance,
  openVarianceProblem,
  reconcileAll,
} from './gateReconcile.js';

const visitWith = (pallets, extra = {}) => ({
  id: 'v1',
  plate: '27-123456',
  load: { in: { poRef: 'po-2026-00125', party: 'XYZ', pallets: pallets.map((c) => ({ count: c, ownership: 'supplier' })), ...extra } },
});

const sessionWith = (n, state = 'APPROVED') => ({
  order: { id: 'o1', number: 'PO-2026-00125', type: 'PO' },
  drafts: Array.from({ length: n }, (_, i) => ({ lpn: `LPN-${i}`, state })),
});

/* ═══════════ مثالُ المالك ═══════════ */

test('★★★ مثالُ المالك حرفيًّا: بوابة ٢٠ / استلام ١٨ ⇒ فرقٌ يحتاج قرارًا', () => {
  const r = reconcileVisit(visitWith([20]), sessionWith(18));
  assert.equal(r.status, 'variance');
  assert.equal(r.variance, 2);
  assert.ok(r.text.includes('بوابة 20'), r.text);
  assert.ok(r.text.includes('استلام 18'), r.text);
  assert.ok(r.text.includes('اختلافٌ في عدد الطبليات'));
});

test('★ والمطابقُ يُقال مطابقًا — لا صمتًا يُشبه العطب', () => {
  const r = reconcileVisit(visitWith([12, 6]), sessionWith(18));
  assert.equal(r.status, 'match');
  assert.equal(r.variance, 0);
  assert.equal(r.label, RECONCILE_STATUS.match);
});

test('★★ والزائدُ يُقال زائدًا لا ناقصًا — والاتّجاهُ يغيّر من يُسأل', () => {
  const r = reconcileVisit(visitWith([15]), sessionWith(18));
  assert.equal(r.variance, -3);
  assert.ok(r.text.includes('زائدةٌ على المُعلَن'), r.text);
});

/* ═══════════ ★ ولا فرقَ كاذب ═══════════ */

test('★★ زيارةٌ بلا استلامٍ بعد لا تُنتج فرقًا كاذبًا', () => {
  const r = reconcileVisit(visitWith([20]), null);
  assert.equal(r.status, 'noReceipt');
  assert.equal(r.variance, 0);
  assert.ok(r.text.includes('لم يُسجَّل استلامٌ بعد'));
});

test('★★ وزيارةٌ لم يُعلَن فيها عددٌ لا تُقابَل أصلًا', () => {
  const r = reconcileVisit({ id: 'v', plate: 'A 1', load: { in: {} } }, sessionWith(18));
  assert.equal(r.status, 'noDeclaration');
  assert.equal(r.variance, 0);
});

test('★★ الطبالي غيرُ المعتمَدة لا تُحتسب — فلا يظهر فرقٌ سببُه انتظارُ الحوكمة', () => {
  assert.equal(receivedDeclared(sessionWith(18, 'DRAFT')).pallets, 0);
  assert.equal(receivedDeclared(sessionWith(18, 'REJECTED')).pallets, 0);
  assert.equal(receivedDeclared(sessionWith(18, 'STORED')).pallets, 18);
});

test('★★★ وقائمةُ الحالات المحتسَبة = قائمةُ grnBridge نفسُها — فلا رقمان لحقيقةٍ واحدة', () => {
  const drafts = ['DRAFT', 'SCANNING', 'APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED', 'REJECTED', 'RETURNED']
    .map((state, i) => ({ lpn: `L${i}`, state }));
  const viaBridge = countableDrafts(drafts).map((d) => d.state).sort();
  const viaHere = drafts.filter((d) => COUNTABLE_STATES.includes(d.state)).map((d) => d.state).sort();
  assert.deepEqual(viaHere, viaBridge, 'المطابقةُ تعدّ طبالي لا يعدّها جسرُ GRN — فيختلف رقمان عن حقيقةٍ واحدة');
});

/* ═══════════ الطرودُ تُعلَن بلا نظير ═══════════ */

test('★ الطرودُ تُعلَن ولا تُقابَل — فمقارنةُ طردٍ بحبّةٍ فرقٌ مخترَع', () => {
  const r = reconcileVisit(visitWith([20], { packages: 400 }), sessionWith(20));
  assert.equal(r.status, 'match', 'حُسب فرقٌ من الطرود ولا نظيرَ لها');
  assert.ok(r.packagesNote.includes('400'), r.packagesNote);
  assert.ok(r.packagesNote.includes('لا نظيرَ'));
});

test('★ وبلا طرودٍ لا مُلاحظة', () => {
  assert.equal(reconcileVisit(visitWith([20]), sessionWith(20)).packagesNote, '');
});

/* ═══════════ القراءةُ من الزيارة ═══════════ */

test('★ gateDeclared يقرأ من الزيارة ولا يُعاد إدخالُه — والمفتاحُ يُطبَّع', () => {
  const g = gateDeclared(visitWith([10, 5]));
  assert.equal(g.pallets, 15);
  assert.equal(g.key, 'PO-2026-00125', 'مفتاحُ الربط لم يُطبَّع فلن يُطابق');
  assert.equal(g.plate, '27-123456');
  assert.equal(g.party, 'XYZ');
  assert.equal(g.declared, true);
});

test('★ وزيارةٌ فارغةٌ لا تنهار', () => {
  const g = gateDeclared(null);
  assert.equal(g.pallets, 0);
  assert.equal(g.declared, false);
});

/* ═══════════ ★★★ حسمُ الفرق — بالنقض ═══════════ */

const result = { visitId: 'v1', gate: { key: 'PO-1', pallets: 20 }, received: { pallets: 18 }, variance: 2, status: 'variance' };

test('★★★ نقضٌ: لا حسمَ بلا قرارٍ منصوص', () => {
  assert.ok(decideVariance(result, { liability: 'carrier', actor: 'سعد' }).problem.includes('نصًّا'));
});

test('★★★ نقضٌ: لا حسمَ بلا طرفٍ يتحمّله — فالفرقُ بلا صاحبٍ يتكرّر', () => {
  const p = decideVariance(result, { decision: 'نقصت', actor: 'سعد' }).problem;
  assert.ok(p.includes('الطرف الذي يتحمّله'), p);
});

test('★★★ نقضٌ: لا حسمَ بلا فاعلٍ باسمه', () => {
  assert.ok(decideVariance(result, { decision: 'نقصت', liability: 'carrier' }).problem.includes('فاعل'));
});

test('★★ نقضٌ: طرفٌ خارج القائمة يُرفض — والنصُّ الحرّ لا يُجمَّع تقريرًا', () => {
  const p = decideVariance(result, { decision: 'نقصت', liability: 'أحدهم', actor: 'سعد' }).problem;
  assert.ok(p.includes('غير معروف'), p);
});

test('★ والثلاثةُ مجتمعةً تُنتج قرارًا كاملًا يحمل الرقمين', () => {
  const { decision, problem } = decideVariance(result, {
    decision: 'نقصت طبليتان في الطريق — أُبلغ الناقل',
    liability: 'carrier',
    correction: 'مطالبةٌ بقيمتها',
    actor: 'سعد',
    at: 1700000000000,
  });
  assert.equal(problem, undefined);
  assert.equal(decision.liability, 'carrier');
  assert.equal(decision.gatePallets, 20);
  assert.equal(decision.receivedPallets, 18);
  assert.equal(decision.variance, 2);
  assert.equal(decision.decidedBy, 'سعد');
  assert.equal(decision.decidedAt, 1700000000000);
});

test('★ والأطرافُ المعلَنةُ خمسةٌ بتسمياتها — ومنها «لم يُحسم» صراحةً', () => {
  assert.equal(LIABLE_PARTIES.length, 5);
  assert.ok(LIABLE_PARTIES.some((p) => p.id === 'undetermined'), 'لا مخرجَ صادقًا لمن لم يحسم بعد فيُلصق التبعة بمن لا يستحقّ');
  assert.ok(liableLabel('carrier').includes('الناقل'));
  assert.equal(liableLabel('nope'), '');
});

/* ═══════════ الفرقُ يبقى ظاهرًا حتى يُحسم ═══════════ */

test('★★ فرقٌ بلا قرارٍ يبقى معلَنًا · والمحسومُ يسكت', () => {
  const r = reconcileVisit(visitWith([20]), sessionWith(18));
  assert.ok(openVarianceProblem(r, null).includes('بلا قرار'));
  assert.equal(openVarianceProblem(r, { decidedBy: 'سعد' }), '');
  assert.equal(openVarianceProblem(reconcileVisit(visitWith([18]), sessionWith(18)), null), '');
});

test('★ reconcileAll يسِم المحسومَ بحاله ويحمل هويّةَ الزيارة', () => {
  const rows = reconcileAll([
    { visit: visitWith([20]), session: sessionWith(18), decision: null },
    { visit: visitWith([20]), session: sessionWith(18), decision: { decidedBy: 'سعد' } },
    { visit: visitWith([18]), session: sessionWith(18) },
  ]);
  assert.equal(rows[0].status, 'variance');
  assert.equal(rows[1].status, 'decided');
  assert.equal(rows[1].label, RECONCILE_STATUS.decided);
  assert.equal(rows[2].status, 'match');
  assert.equal(rows[0].visitId, 'v1');
  assert.equal(rows[0].plate, '27-123456');
});
