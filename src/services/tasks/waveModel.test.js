/**
 * حارسُ الموجات — ‹WMS-701›.
 *
 * ★★★ وأخطرُ بندٍ فيه الثالث: **الإنجازُ من البنود لا من عددها.** موجةٌ فيها
 * مستندٌ من مئة بندٍ وتسعةُ مستنداتٍ من بندٍ واحد: إنجازُ التسعةِ يقول «٩٠٪»
 * بالعدد **و٨٪ بالعمل** — والمشرفُ يقرأ التسعين فيُبلّغ الناقلَ أنّه جاهز.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WAVE_STATES,
  WAVE_CRITERIA,
  CRITERION_IDS,
  stateLabel,
  isOpenWave,
  waveCode,
  criterionValueOf,
  proposeMembers,
  formWave,
  addMember,
  removeMember,
  transitionProblem,
  releaseWave,
  cancelWave,
  waveProgress,
  closeWave,
  waveBoard,
  waveSummary,
} from './waveModel.js';

const NOW = Date.UTC(2026, 9, 3);
const ACT = { actor: 'U1', actorName: 'محمد', at: NOW };

const doc = (id, over = {}) => ({
  id,
  number: `PK-${id}`,
  type: 'pick',
  header: { carrier: 'الوسيط', warehouse: 'WH001', mustShipBy: '2026-10-05', ...over.header },
  lines: Array.from({ length: over.lines ?? 3 }, (_, i) => ({ sku: `S${i}` })),
});

const formed = (ids, over = {}) =>
  formWave({
    criterion: 'carrier',
    value: 'الوسيط',
    members: ids.map((id) => ({ id, number: `PK-${id}`, lines: over.lines ?? 3 })),
    seq: 1,
    ...ACT,
  }).wave;

/* ══════════ ① المعاييرُ معلَنةٌ لا حرّة ══════════ */

test('★★★ المعاييرُ معلَنةٌ — فلا «موجة ٣» و«W3» و«الموجة الثالثة» ثلاثُ موجات', () => {
  for (const id of ['carrier', 'shipDate', 'zone', 'route']) {
    assert.ok(WAVE_CRITERIA[id]?.labelAr && WAVE_CRITERIA[id]?.hint, `معيارٌ ناقص: ${id}`);
  }
  assert.deepEqual(CRITERION_IDS, ['carrier', 'shipDate', 'zone', 'route']);
  assert.equal(formWave({ criterion: 'نصٌّ حرّ', value: 'س', members: [{ id: 'D1' }], ...ACT }).ok, false);
  assert.ok(proposeMembers([], { criterion: 'مجهول', value: 'س' }).problem.includes('المسموح'));
});

test('قيمةُ المعيار تُقرأ من رأس المستند — والتاريخُ يُقصَر يومًا', () => {
  assert.equal(criterionValueOf(doc('D1'), 'carrier'), 'الوسيط');
  assert.equal(criterionValueOf(doc('D1'), 'shipDate'), '2026-10-05');
  assert.equal(criterionValueOf(doc('D1'), 'zone'), 'WH001');
  assert.equal(criterionValueOf({ header: { mustShipBy: '2026-10-05T10:00:00Z' } }, 'shipDate'), '2026-10-05');
  assert.equal(criterionValueOf(doc('D1'), 'مجهول'), '');
  assert.equal(criterionValueOf({}, 'carrier'), '');
});

test('وكودُ الموجة من تاريخٍ مُمرَّرٍ وتسلسل — ولا ساعةَ تُقرأ', () => {
  assert.equal(waveCode(NOW, 1), 'WV-20261003-01');
  assert.equal(waveCode(NOW, 12), 'WV-20261003-12');
  assert.equal(waveCode(NOW, 1), waveCode(NOW, 1));
  assert.ok(waveCode(undefined, 1).startsWith('WV-00000000'), 'اختُرع تاريخٌ من الساعة');
});

/* ══════════ ② مستندٌ في موجةٍ لا يدخل أخرى — ويُقال أين ══════════ */

test('★★★ المحجوزُ يُستبعد ويُقال **في أيّ موجةٍ هو** — ومنعٌ بلا عنوانٍ يُرسل الموظّفَ يبحث', () => {
  const w1 = formed(['D1']);
  const out = proposeMembers([doc('D1'), doc('D2')], { criterion: 'carrier', value: 'الوسيط', waves: [w1] });
  assert.equal(out.eligible.length, 1);
  assert.equal(out.eligible[0].id, 'D2');
  assert.equal(out.taken.length, 1);
  assert.equal(out.taken[0].waveCode, w1.code, 'لم يُقل في أيّ موجة');
  assert.ok(out.taken[0].reason.includes(w1.code) && out.taken[0].reason.includes('قيد التكوين'), out.taken[0].reason);
});

test('وموجةٌ مُغلقةٌ أو ملغاةٌ لا تحجز — فمستنداتُها تعود حرّةً', () => {
  const closed = { ...formed(['D1']), state: 'closed' };
  const cancelled = { ...formed(['D2']), state: 'cancelled' };
  const out = proposeMembers([doc('D1'), doc('D2')], { criterion: 'carrier', value: 'الوسيط', waves: [closed, cancelled] });
  assert.equal(out.eligible.length, 2);
  assert.equal(out.taken.length, 0);
});

test('والمُطلَقةُ تحجز كما تحجز قيدُ التكوين', () => {
  const released = { ...formed(['D1']), state: 'released' };
  const out = proposeMembers([doc('D1')], { criterion: 'carrier', value: 'الوسيط', waves: [released] });
  assert.equal(out.taken.length, 1);
  assert.ok(out.taken[0].reason.includes('مُطلَقة'));
});

test('ومستندٌ بمعيارٍ آخرَ لا يُقترح، والقائمةُ الفارغةُ تُعلَن بسببها', () => {
  const out = proposeMembers([doc('D1', { header: { carrier: 'ناقلٌ آخر' } })], { criterion: 'carrier', value: 'الوسيط' });
  assert.equal(out.eligible.length, 0);
  assert.ok(out.problem.includes('الناقل'), out.problem);
  assert.ok(proposeMembers([], { criterion: 'carrier', value: '' }).problem.includes('قيمةُ'));
});

/* ══════════ ③ التكوينُ والتفرّدُ داخله ══════════ */

test('★★ مستندٌ مرّتين في موجةٍ واحدةٍ يُضاعف بنودَها فتُقرأ نسبةٌ خطأً — فيُسقَط', () => {
  const w = formWave({
    criterion: 'carrier',
    value: 'الوسيط',
    members: [{ id: 'D1', lines: 10 }, { id: 'D1', lines: 10 }, { id: 'D2', lines: 5 }],
    seq: 1,
    ...ACT,
  }).wave;
  assert.equal(w.members.length, 2);
  assert.equal(w.plannedLines, 15, 'تضاعفت بنودُ مستندٍ مكرَّر');
});

test('وموجةٌ بلا مستنداتٍ أو بلا مُكوِّنٍ لا تُنشأ', () => {
  assert.equal(formWave({ criterion: 'carrier', value: 'س', members: [], ...ACT }).ok, false);
  assert.equal(formWave({ criterion: 'carrier', value: 'س', members: [{ id: 'D1' }], at: NOW }).ok, false);
  assert.ok(formWave({ criterion: 'carrier', value: 'س', members: [{ id: '' }], ...ACT }).problem.includes('بلا مستندات'));
});

test('والموجةُ تُولَد **قيد التكوين** ومعها من كوّنها ومتى', () => {
  const w = formed(['D1', 'D2']);
  assert.equal(w.state, WAVE_STATES.forming.id);
  assert.equal(w.formedBy, 'U1');
  assert.equal(w.formedByName, 'محمد');
  assert.equal(w.formedAt, NOW);
  assert.equal(w.releasedAt, null);
  assert.equal(w.plannedLines, 6);
});

/* ══════════ ④ الإضافةُ والحذفُ قيدَ التكوين وحدَه ══════════ */

test('★★★ لا تُضاف ولا تُحذف مستنداتٌ من موجةٍ مُطلَقة — وإلّا تبدّل العملُ تحت يد المجهّز', () => {
  const released = releaseWave(formed(['D1']), ACT).wave;
  assert.equal(addMember(released, doc('D2')).ok, false);
  assert.ok(addMember(released, doc('D2')).problem.includes('مُطلَقة'));
  assert.equal(removeMember(released, 'D1').ok, false);
});

test('والإضافةُ قيدَ التكوين تعمل وتمنع التكرارَ والمحجوزَ في غيرها', () => {
  const w = formed(['D1']);
  const added = addMember(w, doc('D2', { lines: 4 }));
  assert.equal(added.ok, true, added.problem);
  assert.equal(added.wave.members.length, 2);
  assert.equal(added.wave.plannedLines, 3 + 4);
  assert.equal(addMember(added.wave, doc('D2')).ok, false, 'أُضيف مرّتين');
  assert.ok(addMember(added.wave, doc('D2')).problem.includes('أصلًا'));
  assert.equal(addMember(w, { number: 'x' }).ok, false);

  // ★ وتسلسلٌ آخرُ قصدًا: موجتان بنفس اليوم ونفس التسلسل لهما **نفسُ الكود**،
  // واستثناءُ الموجةِ نفسَها يقع بالكود — فكودٌ مكرَّرٌ يُعمي الحارس. والعقدُ
  // المعلَن أنّ المستدعي يُمرّر تسلسلًا فريدًا (انظر `waveCode`).
  const other = formWave({ criterion: 'carrier', value: 'الوسيط', members: [{ id: 'D9', lines: 3 }], seq: 2, ...ACT }).wave;
  assert.notEqual(other.code, w.code);
  assert.equal(addMember(w, doc('D9'), { waves: [other] }).ok, false);
  assert.ok(addMember(w, doc('D9'), { waves: [other] }).problem.includes(other.code));
});

test('★★ والحذفُ حتّى الفراغِ يُعلَن ولا يُصمت عنه — فموجةٌ فارغةٌ لا تُطلَق', () => {
  const w = formed(['D1']);
  const r = removeMember(w, 'D1');
  assert.equal(r.ok, true);
  assert.equal(r.wave.members.length, 0);
  assert.ok(r.problem.includes('فارغة'), r.problem);
  assert.equal(releaseWave(r.wave, ACT).ok, false, 'أُطلقت موجةٌ فارغة');
  assert.equal(removeMember(w, 'D9').ok, false);
});

/* ══════════ ⑤ الإطلاقُ طورٌ مستقلّ ══════════ */

test('★★★ الإطلاقُ مستقلٌّ عن التكوين — وموجةٌ مكوَّنةٌ لم تُطلَق لا تُنتج مهمّة', () => {
  const w = formed(['D1']);
  assert.equal(isOpenWave(w), true);
  assert.equal(w.state, 'forming', 'التكوينُ أطلق — فتُولَد مهمّةٌ لكلّ ضغطةِ مراجعة');
  const r = releaseWave(w, ACT);
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.wave.state, 'released');
  assert.equal(r.wave.releasedBy, 'U1');
  assert.equal(r.wave.releasedAt, NOW);
  // ولا تُطلَق مرّتين.
  assert.equal(releaseWave(r.wave, ACT).ok, false);
  assert.equal(releaseWave(w, { at: NOW }).ok, false, 'أُطلقت بلا فاعل');
});

test('آلةُ الحالاتِ تقرّر وحدَها، وتقول المسموحَ أو أنّه طورٌ نهائيّ', () => {
  assert.equal(transitionProblem('forming', 'released'), '');
  assert.equal(transitionProblem('forming', 'cancelled'), '');
  assert.equal(transitionProblem('released', 'closed'), '');
  assert.ok(transitionProblem('forming', 'closed').includes('المسموح'));
  assert.ok(transitionProblem('closed', 'released').includes('نهائيّ'));
  assert.ok(transitionProblem('مجهول', 'closed').includes('غيرُ معروف'));
  assert.equal(stateLabel('released'), 'مُطلَقة');
  assert.equal(stateLabel('طيران'), 'طيران', 'المجهولُ يُعرض كما كُتب');
});

test('والإلغاءُ قيدَ التكوين وحدَه، وبسببٍ إلزاميّ', () => {
  const w = formed(['D1']);
  assert.equal(cancelWave(w, { actor: 'U1', at: NOW }).ok, false, 'أُلغيت بلا سبب');
  const c = cancelWave(w, { actor: 'U1', reason: 'الناقلُ تأخّر أسبوعًا', at: NOW });
  assert.equal(c.ok, true, c.problem);
  assert.equal(c.wave.state, 'cancelled');
  assert.equal(isOpenWave(c.wave), false);
  assert.equal(cancelWave(releaseWave(w, ACT).wave, { actor: 'U1', reason: 'س' }).ok, false);
});

/* ══════════ ⑥ الإنجازُ من البنود ══════════ */

test('★★★ تسعةٌ من عشرةٍ ليست تسعين بالمئة من العمل — والنسبتان تُعرضان معًا', () => {
  const members = [{ id: 'BIG', number: 'PK-BIG', lines: 100 }, ...Array.from({ length: 9 }, (_, i) => ({ id: `S${i}`, number: `PK-S${i}`, lines: 1 }))];
  const w = formWave({ criterion: 'carrier', value: 'الوسيط', members, seq: 1, ...ACT }).wave;
  const progress = { BIG: { requested: 100, executed: 0 } };
  for (let i = 0; i < 9; i += 1) progress[`S${i}`] = { requested: 1, executed: 1 };

  const p = waveProgress(w, progress);
  assert.equal(p.byDocPct, 90, 'النسبةُ بالعدد انحرفت');
  assert.equal(p.pct, 8, 'النسبةُ بالعمل حُسبت بالعدد — فيُبلَّغ الناقلُ أنّه جاهزٌ وهو ٨٪');
  assert.equal(p.requested, 109);
  assert.equal(p.executed, 9);
  assert.equal(p.gap, 100);
  assert.equal(p.complete, false);
  // والسطرُ يُعرض بالنسبتين معًا كي لا يُخدع القارئ.
  const line = waveSummary(w, progress);
  assert.ok(line.includes('8٪') && line.includes('90٪'), line);
});

test('والمنفَّذةُ كاملةً تُعلَن مكتملة', () => {
  const w = formed(['D1', 'D2'], { lines: 5 });
  const p = waveProgress(w, { D1: { requested: 5, executed: 5 }, D2: { requested: 5, executed: 5 } });
  assert.equal(p.pct, 100);
  assert.equal(p.complete, true);
  assert.equal(p.gap, 0);
  assert.equal(p.docsDone, 2);
});

test('★★ مستندٌ بلا قياسِ تنفيذٍ يُعدّ مجهولًا ويُعلَن — ولا يُحسب منفَّذًا ولا صفرًا كاذبًا', () => {
  const w = formed(['D1', 'D2']);
  const p = waveProgress(w, { D1: { requested: 5, executed: 5 } });
  assert.equal(p.unknownDocs, 1);
  assert.equal(p.pct, 100, 'النسبةُ على ما يُعرف');
  assert.equal(p.complete, false, 'أُعلنت مكتملةً ومستندٌ منها مجهولُ التنفيذ');
  assert.ok(p.caveat.includes('بلا قياسِ تنفيذ'), p.caveat);
  assert.equal(p.lines.find((l) => l.id === 'D2').pct, null);
});

test('والتنفيذُ فوق المطلوب لا يُنتج نسبةً فوق المئة', () => {
  const w = formed(['D1'], { lines: 5 });
  const p = waveProgress(w, { D1: { requested: 5, executed: 50 } });
  assert.equal(p.pct, 100);
  assert.equal(p.executed, 5);
});

test('والخريطةُ تُقرأ كائنًا أو Map', () => {
  const w = formed(['D1'], { lines: 4 });
  const asMap = new Map([['D1', { requested: 4, executed: 2 }]]);
  assert.equal(waveProgress(w, asMap).pct, 50);
  assert.equal(waveProgress(w, { D1: { requested: 4, executed: 2 } }).pct, 50);
  assert.equal(waveProgress(w, null).unknownDocs, 1);
});

/* ══════════ ⑦ الإغلاقُ بنقصٍ يحتاج سببًا ══════════ */

test('★★★ موجةٌ تُغلق بنقصٍ تحتاج سببًا — فالصامتةُ تُخفي طلبًا لم يُشحَن', () => {
  const w = releaseWave(formed(['D1', 'D2'], { lines: 10 }), ACT).wave;
  const progress = { D1: { requested: 10, executed: 10 }, D2: { requested: 10, executed: 3 } };

  const blocked = closeWave(w, progress, { actor: 'U1', at: NOW });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.needsReason, true);
  assert.ok(blocked.problem.includes('ناقصٌ 7') && blocked.problem.includes('65٪'), blocked.problem);
  assert.ok(blocked.problem.includes('لم يُشحَن'));

  const ok = closeWave(w, progress, { actor: 'U1', reason: 'الناقلُ خرج والباقي يُشحَن غدًا', at: NOW });
  assert.equal(ok.ok, true, ok.problem);
  assert.equal(ok.wave.state, 'closed');
  assert.equal(ok.wave.closeReason, 'الناقلُ خرج والباقي يُشحَن غدًا');
  assert.equal(ok.wave.closedPct, 65);
  assert.equal(ok.wave.closedGap, 7);
});

test('والمكتملةُ تُغلق بلا سبب — فسؤالُ «لماذا؟» عن عملٍ تامٍّ يُميت الحقل', () => {
  const w = releaseWave(formed(['D1'], { lines: 5 }), ACT).wave;
  const r = closeWave(w, { D1: { requested: 5, executed: 5 } }, { actor: 'U1', at: NOW });
  assert.equal(r.ok, true, r.problem);
  assert.equal(r.wave.closeReason, '');
  assert.equal(r.wave.closedPct, 100);
});

test('وإغلاقُ موجةٍ لم تُطلَق يُردّ، وبلا فاعلٍ يُردّ', () => {
  const w = formed(['D1']);
  assert.equal(closeWave(w, {}, { actor: 'U1', reason: 'س', at: NOW }).ok, false);
  const released = releaseWave(w, ACT).wave;
  assert.equal(closeWave(released, {}, { reason: 'س', at: NOW }).ok, false);
});

test('ومستندٌ مجهولُ التنفيذِ يُلزم سببًا بنصٍّ يسمّي السبب', () => {
  const w = releaseWave(formed(['D1']), ACT).wave;
  const r = closeWave(w, {}, { actor: 'U1', at: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.problem.includes('بلا قياسِ تنفيذ'), r.problem);
});

/* ══════════ ⑧ اللوحة ══════════ */

test('لوحةُ الموجات: المفتوحةُ أوّلًا والترتيبُ حتميّ، ومعها عدّادُ المتأخّر', () => {
  const a = { ...formed(['D1'], { lines: 5 }), code: 'WV-20261003-01', value: 'ب', state: 'closed' };
  const b = { ...formed(['D2'], { lines: 5 }), code: 'WV-20261003-02', value: 'أ', state: 'released' };
  const c = { ...formed(['D3'], { lines: 5 }), code: 'WV-20261003-03', value: 'ج', state: 'forming' };
  const board = waveBoard([a, b, c], { D2: { requested: 5, executed: 1 } });
  assert.equal(board.rows[0].wave.code, 'WV-20261003-02', 'المفتوحةُ لم تسبق المُغلقة');
  assert.equal(board.rows[2].wave.state, 'closed');
  assert.deepEqual(board.counts, { total: 3, forming: 1, released: 1, closed: 1, behind: 1 });
  // والترتيبُ حتميّ.
  assert.deepEqual(waveBoard([c, b, a], {}).rows.map((r) => r.wave.code), waveBoard([a, b, c], {}).rows.map((r) => r.wave.code));
});

/* ══════════ ⑨ رسالةُ الرفض لا تنسب العلّةَ إلى النشر وحدَه ══════════ */

test('★★★ رسالةُ permission-denied تسمّي الأسباب الثلاثةَ — ولا تُرسل المالكَ ينشر ما نشره', async () => {
  const { waveError } = await import('./wavesService.js').catch(() => ({ waveError: null }));
  if (!waveError) return; // الخدمةُ تلمس Firestore؛ إن لم تُحمَّل في Node فلا حكم
  const msg = waveError({ code: 'permission-denied' });
  assert.ok(msg.includes('لم تُنشَر'), 'سببُ النشر غائب');
  assert.ok(msg.includes('دورُك'), 'سببُ الدور غائب — والرسالةُ كانت تكذب بعد النشر');
  assert.ok(msg.includes('موقوف'), 'سببُ الإيقاف غائب');
  // ولا تُجزم بواحدٍ منها.
  assert.ok(!/^قواعدُ الأمان/.test(msg), 'الرسالةُ تجزم بالنشر وحدَه');
});

test('وسطرُ العرضِ لا ينفجر على موجةٍ فاسدة', () => {
  assert.equal(waveSummary(null, {}), '');
  assert.equal(waveSummary({}, {}), '');
  assert.ok(waveSummary(formed(['D1']), {}).includes('WV-'));
  assert.deepEqual(waveBoard(null, null).counts.total, 0);
});
