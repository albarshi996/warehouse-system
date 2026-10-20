/**
 * حارسُ محرّك الإسناد — ‹WMS-501›.
 *
 * ★★★ وأهمُّ بندٍ فيه هو **الثاني**: منعٌ بُني على جهلٍ بالهويّة أسوأ من
 * سماحٍ يردّه الخادم. وهو دَينٌ مكتوبٌ بثمنه في طبقة الطبالي (`uiGate`) —
 * فلو أقصى هذا المحرّكُ دورًا لا تعرفه المصفوفةُ لأعاد العطبَ نفسَه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEIGHTS,
  FULL_LOAD,
  ZONE_CROWD,
  skillShare,
  zoneShare,
  scoreWorker,
  suggestAssignees,
  explain,
  candidateSummary,
  zoneLoadIndex,
} from './assignEngine.js';

const NOW = Date.UTC(2026, 9, 3);
const MIN = 60000;

/** مهمّةُ سحبٍ في منطقةٍ معلومة. */
const TASK = (over = {}) => ({ bin: 'RH-A-R-01-01', workType: 'PICK', op: 'PICK', ...over });

/** عاملٌ محضّرٌ متاح. */
const W = (over = {}) => ({
  uid: 'U1',
  name: 'أحمد',
  portalRole: 'picking_unit',
  zone: 'RH-A',
  openTasks: 0,
  ...over,
});

/* ══════════ ① الأوزانُ معلَنةٌ ومجموعُها مئة ══════════ */

test('★★ الأوزانُ الثمانيةُ معلَنةٌ ومجموعُها مئةٌ — فتُقرأ الدرجةُ نسبةً', () => {
  const keys = ['zone', 'skill', 'load', 'productivity', 'equipment', 'deadline', 'congestion', 'idle'];
  for (const k of keys) assert.ok(Number.isFinite(WEIGHTS[k]), `وزنٌ ناقص: ${k}`);
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  // ★ والصلاحيّةُ ليست وزنًا — هي مانع.
  assert.equal(WEIGHTS.permission, undefined, 'الصلاحيّةُ صارت وزنًا — فيُسنَد لمن لا يملكها بدرجةٍ عالية');
});

/* ══════════ ② الصلاحيّةُ مانعٌ — والجهلُ ليس منعًا ══════════ */

test('★★★ من لا يملك العمليّة يُستبعد لا يُخفَّض — وإلّا ارتدّ الإسنادُ على الخادم', () => {
  // `receiving_unit` دورٌ معروفٌ للمصفوفة لا يملك PICK.
  const out = suggestAssignees(TASK(), [W({ portalRole: 'receiving_unit' })], { nowMs: NOW });
  assert.equal(out.candidates.length, 0, 'أُسنِد سحبٌ لمن لا يملكه — فيرتدّ ويُظنّ النظامُ معطوبًا');
  assert.equal(out.excluded.length, 1);
  assert.ok(out.excluded[0].reason, 'استُبعد بلا سبب');
});

test('★★★ ودورٌ لا تعرفه المصفوفةُ يمرّ مرشَّحًا بعلامته — لا يُقصى بجهل', () => {
  const out = suggestAssignees(TASK(), [W({ portalRole: 'دورٌ جديدٌ لم يُسجَّل' })], { nowMs: NOW });
  assert.equal(out.candidates.length, 1, 'أُقصي بجهلٍ بالهويّة — وهو العطبُ الذي كُتب بثمنه');
  assert.equal(out.candidates[0].roleKnown, false);
  assert.equal(out.unknownRoles, 1);
  assert.ok(
    out.candidates[0].reasons.some((r) => r.includes('لا تعرفه مصفوفة')),
    'العلامةُ كُتمت — فيظنّ المشرفُ الحكمَ تامًّا'
  );
});

test('والدورُ المعروفُ المأذونُ يمرّ بعلامةِ معرفة', () => {
  const out = suggestAssignees(TASK(), [W()], { nowMs: NOW });
  assert.equal(out.candidates[0].roleKnown, true);
  assert.ok(!out.candidates[0].reasons.some((r) => r.includes('لا تعرفه')));
});

test('وغيرُ المتاح يُستبعد بسببه المكتوب، وبلا سببٍ يُقال سببٌ عامّ', () => {
  const a = suggestAssignees(TASK(), [W({ available: false, unavailableReason: 'في إجازةٍ مرضيّة' })], { nowMs: NOW });
  assert.equal(a.excluded[0].reason, 'في إجازةٍ مرضيّة');
  const b = suggestAssignees(TASK(), [W({ available: false })], { nowMs: NOW });
  assert.ok(b.excluded[0].reason.includes('غيرُ متاح'));
});

test('وعاملٌ بلا معرّفٍ لا يُسنَد إليه شيء', () => {
  const out = suggestAssignees(TASK(), [W({ uid: '', id: '' })], { nowMs: NOW });
  assert.equal(out.candidates.length, 0);
  assert.ok(out.excluded[0].reason.includes('بلا معرّف'));
});

/* ══════════ ③ لا يُخترع مرشَّح ══════════ */

test('★★★ بلا عمّالٍ تُعاد قائمةٌ فارغةٌ بسببٍ معلَن — لا عاملٌ عشوائيٌّ يبدو ذكيًّا', () => {
  const out = suggestAssignees(TASK(), [], { nowMs: NOW });
  assert.equal(out.candidates.length, 0);
  assert.ok(out.problem.includes('لا عمّالَ'), out.problem);
  assert.ok(out.problem.includes('عرِّف'), 'لم تُقل خطوةُ العلاج');
});

test('وكلُّ العمّال مستبعَدون ⟹ سببٌ آخرُ يدلّ على الأسفل', () => {
  const out = suggestAssignees(TASK(), [W({ available: false })], { nowMs: NOW });
  assert.ok(out.problem.includes('راجع الأسباب'), out.problem);
});

/* ══════════ ④ الموضعُ أقوى عامل ══════════ */

test('★★★ من في منطقة المهمّة يسبق — والمشيُ هو الكلفة', () => {
  const out = suggestAssignees(TASK(), [
    W({ uid: 'FAR', name: 'بعيد', zone: 'RH-Z' }),
    W({ uid: 'NEAR', name: 'قريب', zone: 'RH-A' }),
  ], { nowMs: NOW });
  assert.equal(out.candidates[0].uid, 'NEAR', 'سبق البعيدُ القريبَ');
  assert.ok(out.candidates[0].score > out.candidates[1].score);
});

test('ونفسُ المستودعِ أقربُ من مستودعٍ آخر — ثلاثُ درجاتٍ لا اثنتان', () => {
  assert.equal(zoneShare({ zone: 'RH-A' }, 'RH-A').share, 1);
  assert.equal(zoneShare({ zone: 'RH-Z' }, 'RH-A').share, 0.45);
  assert.equal(zoneShare({ zone: 'WH-A' }, 'RH-A').share, 0.05);
});

test('ومجهولُ الموضعِ أو مجهولةُ المنطقةِ نصفُ النصيب — الجهلُ لا يُرقّي ولا يُسقِط', () => {
  assert.equal(zoneShare({ zone: '' }, 'RH-A').share, 0.5);
  assert.equal(zoneShare({ zone: 'RH-A' }, '').share, 0.5);
});

test('والمنطقةُ تُشتقّ من كود الخانة إن لم تُعلَن', () => {
  const out = suggestAssignees({ bin: 'RH-A-R-05-02', op: 'PICK', workType: 'PICK' }, [W({ zone: 'RH-A' })], { nowMs: NOW });
  assert.ok(out.candidates[0].reasons.some((r) => r.includes('في منطقة المهمّة')), out.candidates[0].reasons.join(' | '));
});

/* ══════════ ⑤ المهارة ══════════ */

test('المهارةُ المعلَنةُ تسبق المشتقّةَ من الدور، والمجهولةُ نصفٌ', () => {
  assert.equal(skillShare({ skills: ['PICK'] }, 'PICK').share, 1);
  assert.equal(skillShare({ skills: ['LOAD'] }, 'PICK').share, 0.15);
  assert.equal(skillShare({ fieldRoles: ['PICKER'] }, 'PICK').share, 0.85);
  assert.equal(skillShare({ fieldRoles: ['LOADER'] }, 'PICK').share, 0.25);
  assert.equal(skillShare({}, 'PICK').share, 0.5);
  assert.equal(skillShare({ skills: ['PICK'] }, '').share, 0.5, 'نوعُ عملٍ مجهولٌ لم يُمرَّر بنصف النصيب');
});

/* ══════════ ⑥ الحملُ معكوسٌ ولا يمنع ══════════ */

test('★★★ الفارغُ يتقدّم — فلا يُحمَّل المجتهدُ ويُنسى الفارغ', () => {
  const out = suggestAssignees(TASK(), [
    W({ uid: 'BUSY', openTasks: 3 }),
    W({ uid: 'FREE', openTasks: 0 }),
  ], { nowMs: NOW });
  assert.equal(out.candidates[0].uid, 'FREE');
});

test('★★ والمحمَّلُ لا يُمنع — فالمنعُ يُفرغ الطابورَ على رؤوسٍ قليلةٍ في يومِ ذروة', () => {
  const out = suggestAssignees(TASK(), [W({ openTasks: FULL_LOAD * 5 })], { nowMs: NOW });
  assert.equal(out.candidates.length, 1, 'مُنع المحمَّلُ — فمن يعمل في الذروة؟');
  const load = out.candidates[0].factors.find((f) => f.id === 'load');
  assert.equal(load.points, 0);
});

/* ══════════ ⑦ الإنتاجيّةُ تُنسَب لا تُقاس مطلقةً ══════════ */

test('★★★ الإنتاجيّةُ تُقاس بوسيط الفرقة — و«ستّون وحدةً» وحدَها لا تقول شيئًا', () => {
  const fast = scoreWorker(W({ unitsPerHour: 90, peerRate: 60 }), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  const slow = scoreWorker(W({ unitsPerHour: 30, peerRate: 60 }), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.ok(fast.score > slow.score);
  const f = fast.factors.find((x) => x.id === 'productivity');
  assert.ok(f.note.includes('90') && f.note.includes('60'), f.note);
});

test('وبلا وسيطٍ لا حكمَ — نصفُ النصيب، ولا يُقرأ رقمٌ مطلقٌ حكمًا', () => {
  const r = scoreWorker(W({ unitsPerHour: 90 }), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  const f = r.factors.find((x) => x.id === 'productivity');
  assert.equal(f.points, Math.round(WEIGHTS.productivity * 0.5));
  assert.ok(f.note.includes('لا إنتاجيّةَ مقيسة'));
});

/* ══════════ ⑧ المعدّةُ والمهلةُ والازدحامُ والفراغ ══════════ */

test('المهمّةُ التي تُسمّي معدّةً تُرقّي من يملكها، ومن لا يملكها لا يُمنع', () => {
  const out = suggestAssignees(TASK({ equipment: 'FORKLIFT' }), [
    W({ uid: 'NO' }),
    W({ uid: 'YES', equipment: ['forklift'] }),
  ], { nowMs: NOW });
  assert.equal(out.candidates[0].uid, 'YES');
  assert.equal(out.candidates.length, 2, 'مُنع من لا يملك المعدّة — ومعدّةٌ تُستعار');
  assert.ok(out.candidates[0].reasons.some((r) => r.includes('رافعة')), out.candidates[0].reasons.join(' | '));
});

test('ومهمّةٌ لا تُسمّي معدّةً: نصفُ النصيب للجميع — ولا يُخترع متطلَّب', () => {
  const r = scoreWorker(W(), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.equal(r.factors.find((f) => f.id === 'equipment').points, Math.round(WEIGHTS.equipment * 0.5));
});

test('★★ المهلةُ الضيّقةُ تُرقّي الأسرعَ — وبلا موعدٍ نصفُ النصيب', () => {
  const tight = { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW, due: NOW + 60000 };
  const fast = scoreWorker(W({ unitsPerHour: 90, peerRate: 60 }), tight);
  const slow = scoreWorker(W({ unitsPerHour: 20, peerRate: 60 }), tight);
  assert.ok(fast.factors.find((f) => f.id === 'deadline').points > slow.factors.find((f) => f.id === 'deadline').points);

  const none = scoreWorker(W(), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.equal(none.factors.find((f) => f.id === 'deadline').points, Math.round(WEIGHTS.deadline * 0.5));
  assert.ok(none.factors.find((f) => f.id === 'deadline').note.includes('بلا موعد'));
});

test('★★ الازدحامُ يُقرأ من فهرسٍ يُمرَّر — وغيابُه «لا أعرف» لا «خالٍ»', () => {
  const zoneLoad = zoneLoadIndex([
    { bin: 'RH-A-R-01-01' }, { bin: 'RH-A-R-02-01' }, { bin: 'RH-A-R-03-01' },
    { bin: 'RH-A-R-04-01' }, { bin: 'RH-A-R-05-01' }, { bin: 'RH-A-R-06-01' },
    { zone: 'RH-B' },
  ]);
  assert.equal(zoneLoad.get('RH-A'), ZONE_CROWD);
  const crowded = scoreWorker(W({ zone: 'RH-A' }), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW, zoneLoad });
  assert.equal(crowded.factors.find((f) => f.id === 'congestion').points, 0);
  const quiet = scoreWorker(W({ zone: 'RH-B' }), { taskZone: 'RH-B', op: 'PICK', workType: 'PICK', nowMs: NOW, zoneLoad });
  assert.ok(quiet.factors.find((f) => f.id === 'congestion').points > 0);
  // وبلا فهرسٍ: نصفُ النصيب لا صفرٌ ولا كامل.
  const blind = scoreWorker(W(), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.equal(blind.factors.find((f) => f.id === 'congestion').points, Math.round(WEIGHTS.congestion * 0.5));
});

test('وطولُ الفراغ يُحتسب — كي لا يُنسى من لا يُطلب', () => {
  const idle = scoreWorker(W({ idleSinceMs: NOW - 120 * MIN }), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.equal(idle.factors.find((f) => f.id === 'idle').points, WEIGHTS.idle);
  assert.ok(idle.factors.find((f) => f.id === 'idle').note.includes('120'));
  const unknown = scoreWorker(W(), { taskZone: 'RH-A', op: 'PICK', workType: 'PICK', nowMs: NOW });
  assert.ok(unknown.factors.find((f) => f.id === 'idle').note.includes('غيرُ معلومة'));
});

/* ══════════ ⑨ لا ساعةَ تُقرأ · والترتيبُ حتميّ ══════════ */

test('★★ لا ساعةَ تُقرأ: نفسُ المدخل ونفسُ nowMs ⟹ نفسُ المخرَج', () => {
  const workers = [W({ uid: 'A' }), W({ uid: 'B' })];
  const a = suggestAssignees(TASK(), workers, { nowMs: NOW });
  const b = suggestAssignees(TASK(), workers, { nowMs: NOW });
  assert.deepEqual(a.candidates.map((c) => c.uid), b.candidates.map((c) => c.uid));
});

test('والترتيبُ حتميٌّ عند التساوي — فلا يتبدّل المرشَّحُ بين فتحةٍ وأخرى', () => {
  const x = suggestAssignees(TASK(), [W({ uid: 'ZZ' }), W({ uid: 'AA' })], { nowMs: NOW });
  const y = suggestAssignees(TASK(), [W({ uid: 'AA' }), W({ uid: 'ZZ' })], { nowMs: NOW });
  assert.equal(x.candidates[0].uid, 'AA');
  assert.equal(y.candidates[0].uid, 'AA');
});

test('والسقفُ يُحترم', () => {
  const many = Array.from({ length: 12 }, (_, i) => W({ uid: `U${i}` }));
  assert.equal(suggestAssignees(TASK(), many, { nowMs: NOW }).candidates.length, 5);
  assert.equal(suggestAssignees(TASK(), many, { nowMs: NOW, limit: 2 }).candidates.length, 2);
});

/* ══════════ ⑩ السببُ مكتوبٌ لكلّ عامل ══════════ */

test('★★★ لكلّ مرشَّحٍ سببٌ مكتوبٌ لكلّ عامل — كشأن مرشّحي التسكين', () => {
  const out = suggestAssignees(TASK({ equipment: 'FORKLIFT', dueAt: NOW + 60000 }), [
    W({ skills: ['PICK'], unitsPerHour: 90, peerRate: 60, equipment: ['FORKLIFT'], idleSinceMs: NOW - 30 * MIN }),
  ], { nowMs: NOW, zoneLoad: zoneLoadIndex([{ zone: 'RH-A' }]) });
  const c = out.candidates[0];
  assert.equal(c.factors.length, 8, 'عاملٌ بلا سطرٍ في التعليل');
  for (const f of c.factors) {
    assert.ok(f.label && f.note, `عاملٌ بلا تسميةٍ أو سبب: ${f.id}`);
    assert.ok(Number.isFinite(f.points));
  }
  assert.ok(c.score > 60, `درجةُ عاملٍ مثاليٍّ منخفضة: ${c.score}`);
});

test('وثلاثةُ أسبابٍ أقوى تُعرَض في سطرٍ واحد', () => {
  const out = suggestAssignees(TASK(), [W({ skills: ['PICK'] })], { nowMs: NOW });
  const top = explain(out.candidates[0]);
  assert.ok(top.length <= 3 && top.length > 0, top.join(' | '));
  const line = candidateSummary(out.candidates[0]);
  assert.ok(line.includes('أحمد') && line.includes('٪'), line);
  assert.equal(candidateSummary(null), '');
});

test('وعلامةُ الدورِ المجهولِ تظهر في السطر', () => {
  const out = suggestAssignees(TASK(), [W({ portalRole: 'مجهول' })], { nowMs: NOW });
  assert.ok(candidateSummary(out.candidates[0]).includes('⚠'), candidateSummary(out.candidates[0]));
});

/* ══════════ ⑪ الاقتراحُ لا يُسنِد ══════════ */

test('★★★ المخرَجُ اقتراحٌ محض — لا حقلَ إسنادٍ ولا تبديلَ حالة', () => {
  const out = suggestAssignees(TASK(), [W()], { nowMs: NOW });
  const c = out.candidates[0];
  for (const forbidden of ['assignedTo', 'assigned', 'state', 'task']) {
    assert.equal(c[forbidden], undefined, `المحرّكُ يُسنِد — والإسنادُ فعلُ المدير: ${forbidden}`);
  }
});
