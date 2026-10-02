/**
 * اختبارات الإجراءات الجماعيّة.
 *
 * ★★★ أهمُّ حارسٍ هنا ليس أنّ الاعتماد يعمل، بل أنّ **الجماعيَّ لا يُنشئ
 * سلطةً جديدة**: ما يُرفض فرديًّا يُرفض جماعيًّا. فالاختبارُ الأوّل يقارن
 * حكمَ `planBulk` بحكم `canDo` و`isLegalTransition` نفسِهما — لا بقائمةٍ
 * مكتوبةٍ هنا تنحرف معهما.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_BULK,
  BULK_ACTIONS,
  bulkActionFor,
  rejectionFor,
  planBulk,
  planSummary,
  groupBlocked,
  summarizeRun,
  qcGovernedTypes,
  qcQueue,
} from './bulkActions.js';
import { TRANSITIONS, STATES, canDo, isLegalTransition } from './states.js';
import SCHEMAS from './schemas/index.js';

const QC = { role: 'qc_inspector', uid: 'u-qc' };
const MGR = { role: 'warehouse_manager', uid: 'u-mgr' };
const KEEPER = { role: 'storekeeper', uid: 'u-keep' };
const ADMIN = { role: 'admin', uid: 'u-admin' };

const grn = (over = {}) => ({
  id: 'g1',
  type: 'GRN',
  state: 'submitted',
  number: 'GRN-2026-000001',
  createdByUid: 'u-keep',
  header: {},
  lines: [{ sku: 'A', qty: 1 }],
  ...over,
});

/* ═══════════════ العقدُ الحاكم ═══════════════ */

test('★★★ كلُّ إجراءٍ جماعيٍّ له نقلةٌ قائمةٌ في جدول الحالات — لا إجراءَ مخترعًا', () => {
  for (const a of BULK_ACTIONS) {
    assert.ok(STATES[a.to], `${a.id}: الحالةُ الهدف «${a.to}» غيرُ معروفة`);
    for (const from of a.from) {
      assert.ok(STATES[from], `${a.id}: الحالةُ المصدر «${from}» غيرُ معروفة`);
      assert.ok(
        isLegalTransition(from, a.to),
        `${a.id}: يدّعي نقلةً من «${from}» إلى «${a.to}» لا وجودَ لها في TRANSITIONS`
      );
    }
    assert.ok(a.label && a.hint, `${a.id} بلا عنوانٍ أو شرح`);
  }
});

test('★★★ والنقلةُ التي تُلزِم سببًا، يُلزمه إجراؤها الجماعيُّ أيضًا', () => {
  for (const a of BULK_ACTIONS) {
    for (const from of a.from) {
      const t = (TRANSITIONS[from] || []).find((x) => x.to === a.to);
      if (t?.needsNote) {
        assert.equal(
          a.needsNote,
          true,
          `${a.id}: النقلةُ من «${from}» تُلزِم سببًا والإجراءُ الجماعيُّ لا يُلزمه — بابُ إلغاءٍ بلا أثر`
        );
      }
    }
  }
});

test('★★★ لا إرسالَ جماعيًّا — فالتيسيرُ في الجهة الخطأ يُغرق المعتمِدين', () => {
  assert.equal(bulkActionFor('submit'), null);
  assert.ok(!BULK_ACTIONS.some((a) => a.to === 'submitted'));
});

test('★★ المنجَزُ لا يُلغى جماعيًّا — أثرُه مُرحَّل', () => {
  const cancel = bulkActionFor('cancel');
  assert.ok(!cancel.from.includes('done'), 'الإلغاءُ يدّعي المنجَز — والدفترُ ملحق-فقط');
  // والجدولُ نفسُه يقول ذلك.
  assert.equal(isLegalTransition('done', 'canceled'), false);
});

/* ═══════════════ الاستبعاد ═══════════════ */

test('★★★ ما يرفضه canDo فرديًّا يرفضه التخطيطُ جماعيًّا — بلا قائمةٍ موازية', () => {
  const doc = grn();
  const approve = bulkActionFor('approve');
  const transition = TRANSITIONS.submitted.find((t) => t.to === 'approved');
  const schema = SCHEMAS.GRN;

  for (const user of [QC, MGR, KEEPER, ADMIN]) {
    const allowedIndividually = canDo(transition, user, schema, doc);
    const blockedInBulk = rejectionFor(doc, approve, user, schema) !== null;
    assert.equal(
      blockedInBulk,
      !allowedIndividually,
      `الدور ${user.role}: الفرديُّ يقول ${allowedIndividually} والجماعيُّ يقول ${!blockedInBulk}`
    );
  }
});

test('أمينُ المخزن لا يعتمد استلامًا — ولا جماعيًّا', () => {
  const reason = rejectionFor(grn(), bulkActionFor('approve'), KEEPER, SCHEMAS.GRN);
  assert.ok(reason, 'أمينُ المخزن اعتمد الجودة جماعيًّا — فصلُ المهامّ سقط');
  assert.match(reason, /صلاحية/);
});

test('مفتّشُ الجودة والمديرُ يعتمدان الاستلام', () => {
  assert.equal(rejectionFor(grn(), bulkActionFor('approve'), QC, SCHEMAS.GRN), null);
  assert.equal(rejectionFor(grn(), bulkActionFor('approve'), MGR, SCHEMAS.GRN), null);
});

test('★★ الحالةُ الخطأ تُستبعد وتُسمّى حالتُها — لا «غير مؤهَّل» مبهمًا', () => {
  const reason = rejectionFor(grn({ state: 'draft' }), bulkActionFor('approve'), QC, SCHEMAS.GRN);
  assert.ok(reason);
  assert.match(reason, /مسودّة/, 'السببُ لا يسمّي الحالةَ الفعليّة');
  assert.match(reason, /بانتظار الاعتماد/, 'السببُ لا يسمّي الحالةَ المطلوبة');
});

test('المستندُ المعدوم والإجراءُ المجهول يُستبعدان بسببٍ مكتوب', () => {
  assert.ok(rejectionFor(null, bulkActionFor('approve'), QC, SCHEMAS.GRN));
  assert.ok(rejectionFor(grn(), null, QC, SCHEMAS.GRN));
});

test('المخطّطُ يُستنبَط حين لا يُمرَّر — فلا يسقط الحكمُ لغيابه', () => {
  // بلا تمرير المخطّط: الوحدةُ تجلبه من `getSchema`.
  assert.equal(rejectionFor(grn(), bulkActionFor('approve'), QC), null);
  assert.ok(rejectionFor(grn(), bulkActionFor('approve'), KEEPER));
});

/* ═══════════════ الخطّة ═══════════════ */

test('الخطّةُ تفصل المؤهَّلَ من المستبعَد', () => {
  const docs = [grn({ id: 'a' }), grn({ id: 'b', state: 'draft' }), grn({ id: 'c' })];
  const plan = planBulk(docs, 'approve', QC, { schemas: SCHEMAS });
  assert.deepEqual(plan.eligible.map((d) => d.id), ['a', 'c']);
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.blocked[0].doc.id, 'b');
  assert.equal(plan.canRun, true);
});

test('★★ الإجراءُ المُلزِمُ سببًا لا يُشغَّل بلا سبب', () => {
  const docs = [grn({ state: 'approved' })];
  const without = planBulk(docs, 'close', MGR, { schemas: SCHEMAS });
  assert.equal(without.noteRequired, true);
  assert.equal(without.noteMissing, true);
  assert.equal(without.canRun, false, 'الإغلاقُ الجماعيُّ انطلق بلا سبب');
  assert.match(without.summary, /السبب/);

  const withNote = planBulk(docs, 'close', MGR, { schemas: SCHEMAS, note: 'المورّد ألغى الباقي' });
  assert.equal(withNote.canRun, true);
});

test('السببُ من فراغاتٍ وحدها ليس سببًا', () => {
  const plan = planBulk([grn({ state: 'approved' })], 'close', MGR, { schemas: SCHEMAS, note: '   ' });
  assert.equal(plan.canRun, false);
});

test('والاعتمادُ لا يُلزم سببًا — فلا يُعطَّل بلا داعٍ', () => {
  const plan = planBulk([grn()], 'approve', QC, { schemas: SCHEMAS });
  assert.equal(plan.noteRequired, false);
  assert.equal(plan.canRun, true);
});

test('★★ ما تجاوز السقفَ يُؤخَّر ولا يُرفض', () => {
  const docs = Array.from({ length: MAX_BULK + 7 }, (_, i) => grn({ id: `d${i}` }));
  const plan = planBulk(docs, 'approve', QC, { schemas: SCHEMAS });
  assert.equal(plan.eligible.length, MAX_BULK);
  assert.equal(plan.deferred.length, 7);
  assert.equal(plan.canRun, true, 'تجاوزُ السقف أوقف الدفعةَ كلَّها');
  assert.match(plan.summary, new RegExp(String(MAX_BULK)));
});

test('السقفُ قابلٌ للضبط في النداء — للاختبار وللضبط المستقبليّ', () => {
  const docs = Array.from({ length: 5 }, (_, i) => grn({ id: `d${i}` }));
  const plan = planBulk(docs, 'approve', QC, { schemas: SCHEMAS, max: 2 });
  assert.equal(plan.eligible.length, 2);
  assert.equal(plan.deferred.length, 3);
});

test('تحديدٌ كلُّه مستبعَدٌ لا يُشغَّل', () => {
  const plan = planBulk([grn({ state: 'done' })], 'approve', QC, { schemas: SCHEMAS });
  assert.equal(plan.canRun, false);
  assert.match(plan.summary, /لا مستندَ مؤهَّلًا/);
});

test('الخطّةُ تقبل الفارغ والمعدوم', () => {
  assert.equal(planBulk([], 'approve', QC).canRun, false);
  assert.equal(planBulk(null, 'approve', QC).canRun, false);
  assert.equal(planBulk([grn()], 'nope', QC).canRun, false);
  assert.equal(planBulk([grn(), null, undefined], 'approve', QC, { schemas: SCHEMAS }).eligible.length, 1);
});

test('planSummary يصف الإجراءَ المجهول بلا انفجار', () => {
  assert.match(planSummary({ action: null, eligible: [], blocked: [], deferred: [] }), /غير معروف/);
});

/* ═══════════════ تجميعُ المستبعَد ═══════════════ */

test('★★ المستبعَدُ يُجمَع بسببه ويحمل أرقامَ مستنداته — لا عددَها وحده', () => {
  const blocked = [
    { doc: grn({ number: 'GRN-1' }), reason: 'سببٌ أ' },
    { doc: grn({ number: 'GRN-2' }), reason: 'سببٌ أ' },
    { doc: grn({ number: null }), reason: 'سببٌ ب' },
  ];
  const groups = groupBlocked(blocked);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].reason, 'سببٌ أ');
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].numbers, ['GRN-1', 'GRN-2']);
  // والمسودّةُ بلا رقمٍ تُسمّى ولا تظهر «undefined».
  assert.deepEqual(groups[1].numbers, ['مسودّة']);
});

test('groupBlocked يقبل الفارغ', () => {
  assert.deepEqual(groupBlocked([]), []);
  assert.deepEqual(groupBlocked(null), []);
});

/* ═══════════════ نتيجةُ التنفيذ ═══════════════ */

test('★★★ الفشلُ الجزئيُّ يُبلَّغ عددين واسمَ كلِّ ساقطٍ — لا «تمّ» ولا «فشل»', () => {
  const outcomes = [
    { doc: grn({ number: 'GRN-1' }), ok: true },
    { doc: grn({ number: 'GRN-2' }), ok: false, error: 'لا بند بكمية' },
    { doc: grn({ number: 'GRN-3' }), ok: true },
  ];
  const s = summarizeRun(outcomes);
  assert.equal(s.doneCount, 2);
  assert.equal(s.failedCount, 1);
  assert.equal(s.partial, true);
  assert.equal(s.failures.length, 1);
  assert.equal(s.failures[0].number, 'GRN-2');
  assert.match(s.failures[0].reason, /لا بند بكمية/);
  // والرسالةُ تحمل العددين كليهما.
  assert.match(s.message, /2/);
  assert.match(s.message, /1/);
});

test('النجاحُ الكاملُ والسقوطُ الكاملُ يُفرَّقان، ولا `partial` فيهما', () => {
  const allOk = summarizeRun([{ doc: grn(), ok: true }]);
  assert.equal(allOk.partial, false);
  assert.match(allOk.message, /تمّ على 1/);

  const allBad = summarizeRun([{ doc: grn(), ok: false, error: 'x' }]);
  assert.equal(allBad.partial, false);
  assert.match(allBad.message, /لم يُنفَّذ أيٌّ/);
});

test('سببٌ غيرُ مُبلَّغٍ يُسمّى ولا يُترك فارغًا', () => {
  const s = summarizeRun([{ doc: grn(), ok: false }]);
  assert.match(s.failures[0].reason, /غير مُبلَّغ/);
});

test('summarizeRun يقبل الفارغ', () => {
  assert.equal(summarizeRun([]).total, 0);
  assert.match(summarizeRun(null).message, /لم يُنفَّذ شيء/);
});

/* ═══════════════ طابورُ الجودة ═══════════════ */

test('★★ أنواعُ الجودة تُشتقّ من المخطّطات لا من قائمةٍ مكتوبة', () => {
  const types = qcGovernedTypes(SCHEMAS);
  assert.ok(types.length >= 4, `أنواعُ الجودة ${types.length} — أقلُّ من المتوقَّع`);
  // والحارس: كلُّ مخطّطٍ فيه qc_inspector معتمِدًا موجودٌ في القائمة، ولا زيادة.
  for (const s of Object.values(SCHEMAS)) {
    const governed = (s?.roles?.approve || []).includes('qc_inspector');
    assert.equal(types.includes(s.type), governed, `${s.type}: الاشتقاقُ خالف المخطّط`);
  }
  assert.ok(types.includes('GRN'), 'الاستلامُ ليس في طابور الجودة');
});

test('طابورُ الجودة يعرض المُرسَلَ من أنواع الجودة لمفتّشها', () => {
  const docs = [
    grn({ id: 'a' }),
    grn({ id: 'b', state: 'approved' }),
    { id: 'c', type: 'PR', state: 'submitted', header: {}, lines: [] },
  ];
  const queue = qcQueue(docs, QC, SCHEMAS);
  assert.deepEqual(queue.map((d) => d.id), ['a'], 'الطابورُ ضمّ ما ليس للجودة أو ما ليس مُرسَلًا');
});

test('★ والمديرُ يرى الطابور — فلا يتعطّل الفحصُ بغياب المفتّش', () => {
  assert.equal(qcQueue([grn()], MGR, SCHEMAS).length, 1);
  // وأمينُ المخزن لا يراه.
  assert.equal(qcQueue([grn()], KEEPER, SCHEMAS).length, 0);
});

test('طابورُ الجودة يقبل الفارغ', () => {
  assert.deepEqual(qcQueue([], QC, SCHEMAS), []);
  assert.deepEqual(qcQueue(null, QC, SCHEMAS), []);
  assert.deepEqual(qcQueue([grn()], QC, {}), []);
});
