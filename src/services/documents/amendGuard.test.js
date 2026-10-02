/**
 * اختبارات التعديل المحكوم والإزالة.
 *
 * ★★★ وأهمُّ ما يُحرَس هنا ليس أنّ التعديلَ يعمل، بل أنّ فتحَه **لم يفتح
 * بابًا ثالثًا**: المختومُ مختومٌ ولو كان الطالبُ مديرًا عامًّا · والمُقيَّدُ
 * لا يُعدَّل مهما كانت حالتُه · والفارقُ يُسجَّل حقلًا حقلًا وإلّا كانت
 * الميزةُ ثغرة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AMEND_CLASSES,
  GOVERNED_STATES,
  AMEND_ROLES,
  amendClassOf,
  amendVerdict,
  canEditNow,
  headerDiff,
  linesDiff,
  amendAuditNote,
  hasChanges,
  REMOVAL_ACTIONS,
  eligibleForHardDelete,
  removalOptions,
} from './amendGuard.js';
import { STATES, EDITABLE_STATES, TERMINAL_STATES } from './states.js';
import { getSchema } from './schemas/index.js';

const GRN = getSchema('GRN');

const ADMIN = { role: 'admin', uid: 'u-admin' };
const MGR = { role: 'warehouse_manager', uid: 'u-mgr' };
const QC = { role: 'qc_inspector', uid: 'u-qc' };
const KEEPER = { role: 'storekeeper', uid: 'u-keep' };

const doc = (over = {}) => ({
  id: 'd1',
  type: 'GRN',
  state: 'draft',
  number: null,
  createdByUid: 'u-keep',
  header: {},
  lines: [],
  ...over,
});

/* ═══════════════ الأصناف ═══════════════ */

test('★★ كلُّ حالةٍ في النظام لها صنفُ تعديلٍ — ولا حالةَ بلا حكم', () => {
  for (const id of Object.keys(STATES)) {
    const cls = amendClassOf(id);
    assert.ok(cls && cls.id, `الحالة ${id} بلا صنفِ تعديل`);
    assert.ok(cls.hint, `الحالة ${id}: الصنفُ بلا شرح`);
  }
  // والحالةُ المجهولةُ تُختَم ولا تُفتَح — الافتراضُ الآمن.
  assert.equal(amendClassOf('شيءٌ غريب').id, 'sealed');
  assert.equal(amendClassOf(undefined).id, 'sealed');
});

test('★★★ الحالاتُ الثلاثُ المختومةُ لا تُعدَّل، والمنجَزُ منها', () => {
  for (const id of ['done', ...TERMINAL_STATES]) {
    assert.equal(amendClassOf(id).id, 'sealed', `${id} ليس مختومًا — والدفترُ ملحق-فقط`);
  }
});

test('الحرُّ هو ما كان قائمًا بلا زيادةٍ ولا نقص', () => {
  for (const id of EDITABLE_STATES) {
    assert.equal(amendClassOf(id).id, 'free', `${id} خرج من التحرير الحرّ — كسرٌ لما كان يعمل`);
  }
  assert.equal(AMEND_CLASSES.free.needsReason, false);
});

test('المحكومُ يلزمه سببٌ — وهو جوهرُ الفرق عن التلاعب', () => {
  for (const id of GOVERNED_STATES) assert.equal(amendClassOf(id).id, 'governed');
  assert.equal(AMEND_CLASSES.governed.needsReason, true);
  // ولا تتقاطع المجموعتان.
  for (const id of GOVERNED_STATES) assert.ok(!EDITABLE_STATES.includes(id));
});

/* ═══════════════ الحكم ═══════════════ */

test('★★★ المختومُ لا يُعدَّل ولو كان الطالبُ مديرًا عامًّا', () => {
  for (const state of ['done', 'closed', 'canceled']) {
    const v = amendVerdict(doc({ state }), ADMIN, { reason: 'سببٌ وجيهٌ جدًّا' });
    assert.equal(v.allowed, false, `المدير العامُّ عدّل مستندًا «${state}» — والحركاتُ مُرحَّلةٌ بلا رجعة`);
    assert.match(v.problem, /عكسي|مختوم|انتهى/);
  }
});

test('★★★ والمُقيَّدُ في الدفتر لا يُعدَّل مهما كانت حالتُه', () => {
  // `posted` يظهر على «معتمَد» في حجز أمر البيع — فالحالةُ وحدها لا تكفي حارسًا.
  const posted = doc({ state: 'approved', posted: true });
  for (const user of [ADMIN, MGR]) {
    const v = amendVerdict(posted, user, { reason: 'سبب' });
    assert.equal(v.allowed, false, `${user.role} عدّل مستندًا مُقيَّدًا`);
    assert.match(v.problem, /قُيِّد|عكسي/);
  }
});

test('المسودّةُ لصاحبها — والغريبُ لا يحرّرها', () => {
  assert.equal(canEditNow(doc(), KEEPER), true);
  assert.equal(canEditNow(doc(), QC), false);
  assert.equal(canEditNow(doc(), ADMIN), true, 'المدير العامُّ فقد ما كان يملكه');
  assert.match(amendVerdict(doc(), QC).problem, /لصاحبها/);
});

test('والمسودّةُ لا تلزمها أسبابٌ — لا طقوسَ جديدةً على عملٍ يسير', () => {
  const v = amendVerdict(doc(), KEEPER);
  assert.equal(v.needsReason, false);
  assert.equal(v.allowed, true);
});

test('★★★ التعديلُ المحكومُ لا يقع بلا سببٍ مكتوب', () => {
  for (const state of GOVERNED_STATES) {
    const without = amendVerdict(doc({ state }), ADMIN);
    assert.equal(without.allowed, false, `«${state}» عُدِّل بلا سبب`);
    assert.match(without.problem, /سبب/);
    assert.equal(without.needsReason, true);

    const blank = amendVerdict(doc({ state }), ADMIN, { reason: '   ' });
    assert.equal(blank.allowed, false, 'فراغاتٌ قُبِلت سببًا');

    const withReason = amendVerdict(doc({ state }), ADMIN, { reason: 'خطأٌ مطبعيٌّ في رمز الصنف' });
    assert.equal(withReason.allowed, true);
  }
});

test('★★★ ولا يملكه كلُّ معتمِد — وإلّا عاد بابُ «يبدّل السعر ثمّ يعتمد»', () => {
  // مفتّشُ الجودة يعتمد الاستلام، ومع ذلك لا يملك تعديلَ بنوده.
  assert.ok((GRN.roles?.approve || []).includes('qc_inspector'), 'المخطّطُ تغيّر — راجع البيّنة');
  const v = amendVerdict(doc({ state: 'submitted' }), QC, { reason: 'سبب' });
  assert.equal(v.allowed, false, 'المعتمِدُ عدّل ما يعتمده — فصلُ المهامّ سقط');
  assert.match(v.problem, /مدير المستودع|المدير العام/);
});

test('وأمينُ المخزن لا يعدّل ما خرج من يده', () => {
  const v = amendVerdict(doc({ state: 'submitted' }), KEEPER, { reason: 'سبب' });
  assert.equal(v.allowed, false);
  assert.match(v.problem, /الرفض/, 'لم يُدَلَّ على المخرج المشروع');
});

test('ومديرُ المستودع يملكه — وهو القائمةُ المعلَنة', () => {
  assert.deepEqual(AMEND_ROLES, ['warehouse_manager']);
  const v = amendVerdict(doc({ state: 'approved' }), MGR, { reason: 'تصحيحُ الدفعة' });
  assert.equal(v.allowed, true);
});

test('★★★ و`serverReady` تقول الحقَّ: الخادمُ اليومَ يقبل المديرَ العامَّ وحده', () => {
  // ★ هذا هو الحارسُ ضدّ «منجَزٌ عندي ≠ وصل المستخدم»: مديرُ المستودع يملك
  // الإجراءَ في الواجهة، والخادمُ يرفضه حتى تُنشَر الرقعة. فلا يُدَّعى نجاحٌ.
  const mgr = amendVerdict(doc({ state: 'approved' }), MGR, { reason: 'سبب' });
  assert.equal(mgr.allowed, true);
  assert.equal(mgr.serverReady, false, 'ادُّعي أنّ الخادمَ يقبل مديرَ المستودع — وهو يرفضه اليوم');

  const admin = amendVerdict(doc({ state: 'approved' }), ADMIN, { reason: 'سبب' });
  assert.equal(admin.serverReady, true);

  // والمسودّةُ جاهزةٌ للجميع — القواعدُ القائمةُ تقبلها.
  assert.equal(amendVerdict(doc(), KEEPER).serverReady, true);
});

test('المستندُ المعدومُ يُرفض بسببٍ مكتوب', () => {
  assert.equal(amendVerdict(null, ADMIN).allowed, false);
  assert.match(amendVerdict(null, ADMIN).problem, /غير موجود/);
});

/* ═══════════════ الفارق — قلبُ سجلّ التدقيق ═══════════════ */

test('★★★ فارقُ الرأس يحمل العنوانَ العربيَّ والقيمتين — وبلا هذا كانت الميزةُ ثغرة', () => {
  const before = { supplier: 'أ', invoiceNo: '100' };
  const after = { supplier: 'ب', invoiceNo: '100' };
  const d = headerDiff(before, after, GRN);
  assert.equal(d.length, 1, 'حقلٌ لم يتغيّر حُسب تغييرًا');
  assert.equal(d[0].key, 'supplier');
  assert.equal(d[0].before, 'أ');
  assert.equal(d[0].after, 'ب');
  // والعنوانُ عربيٌّ لا مفتاحٌ — مدقّقٌ يقرأ العنوان.
  assert.ok(d[0].label && d[0].label !== 'supplier', `العنوانُ بقي مفتاحًا: ${d[0].label}`);
});

test('★★ الفراغُ والمعدومُ سواءٌ — فلا يغرق السجلُّ بضجيجِ حقولٍ فارغة', () => {
  assert.deepEqual(headerDiff({ a: '' }, { a: null }, GRN), []);
  assert.deepEqual(headerDiff({ a: undefined }, {}, GRN), []);
  assert.deepEqual(headerDiff({}, { a: '' }, GRN), []);
  // لكنّ الفراغَ إلى قيمةٍ تغييرٌ حقيقيّ.
  assert.equal(headerDiff({ a: '' }, { a: 'x' }, GRN).length, 1);
});

test('★ والرقمُ يُقارَن قيمةً — فإكسل يُعيده نصًّا ولا يُسجَّل تغييرٌ وهميّ', () => {
  assert.deepEqual(headerDiff({ qty: 5 }, { qty: '5' }, GRN), []);
  assert.equal(headerDiff({ qty: 5 }, { qty: 6 }, GRN).length, 1);
  assert.equal(headerDiff({ qty: '5.0' }, { qty: 5 }, GRN).length, 0);
});

test('الحقولُ الداخليّةُ (_checklist) لا تُقارَن حقلًا حقلًا', () => {
  assert.deepEqual(headerDiff({ _checklist: { a: 1 } }, { _checklist: { a: 2 } }, GRN), []);
});

test('★★ فارقُ البنود يميّز المُضاف والمحذوف والمُغيَّر — بموضعه', () => {
  const before = [{ sku: 'A', qtyReceived: 5 }, { sku: 'B', qtyReceived: 3 }];
  const after = [{ sku: 'A', qtyReceived: 4 }, { sku: 'B', qtyReceived: 3 }, { sku: 'C', qtyReceived: 1 }];
  const d = linesDiff(before, after, GRN);
  assert.equal(d.length, 2);
  assert.equal(d[0].row, 1);
  assert.equal(d[0].kind, 'changed');
  assert.equal(d[0].fields[0].before, 5);
  assert.equal(d[0].fields[0].after, 4);
  assert.equal(d[1].row, 3);
  assert.equal(d[1].kind, 'added');
});

test('والحذفُ يُسجَّل بما كان فيه — لا «بندٌ حُذف» مبهمًا', () => {
  const d = linesDiff([{ sku: 'A', qtyReceived: 9 }], [{}], GRN);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, 'removed');
  assert.ok(d[0].fields.some((f) => String(f.after) === '9'), 'المحذوفُ لم يُوصَف');
});

test('★★ الصفوفُ الفارغةُ ليست تغييرًا — والمستندُ يُولد بعشرةٍ فارغة', () => {
  assert.deepEqual(linesDiff([{}, {}, {}], [{}, {}], GRN), []);
  assert.deepEqual(linesDiff([], [{}, {}], GRN), []);
  assert.deepEqual(linesDiff([{ sku: '' }], [{ sku: null }], GRN), []);
});

test('★ وعناوينُ البنود من جدولِ المخطّط', () => {
  const d = linesDiff([{ qtyReceived: 1 }], [{ qtyReceived: 2 }], GRN);
  assert.match(d[0].fields[0].label, /الكمية المستلمة/);
});

/* ═══════════════ قيدُ التدقيق ═══════════════ */

test('★★★ قيدُ التدقيق يحمل السببَ والقيمتين — «عُدِّل المستند» لا يساوي شيئًا', () => {
  const note = amendAuditNote({
    reason: 'المورّد صحّح فاتورته',
    headerChanges: headerDiff({ supplier: 'أ' }, { supplier: 'ب' }, GRN),
    lineChanges: linesDiff([{ qtyReceived: 100 }], [{ qtyReceived: 95 }], GRN),
  });
  assert.match(note, /المورّد صحّح فاتورته/);
  assert.match(note, /100/);
  assert.match(note, /95/);
  assert.match(note, /2 موضعًا/);
});

test('والفراغُ يُسمّى «فراغ» ولا يُكتب undefined', () => {
  const note = amendAuditNote({ reason: 'ر', headerChanges: headerDiff({}, { supplier: 'ب' }, GRN) });
  assert.match(note, /فراغ/);
  assert.ok(!note.includes('undefined'));
});

test('★★ والنصُّ يُقصُّ عند حدٍّ ويُقال إنّه قُصّ — فسقفُ المستند ١ م.ب', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    key: `k${i}`, label: `حقل ${i}`, before: 'أ', after: 'ب',
  }));
  const note = amendAuditNote({ reason: 'ر', headerChanges: many, max: 10 });
  assert.match(note, /60 موضعًا/, 'العددُ الكاملُ غاب');
  assert.match(note, /لم يُفصَّل/, 'قُصّ النصُّ صامتًا');
  assert.ok(note.length < 4000);
});

test('ولا تغييرَ يُقال صريحًا — فلا يُكتب قيدٌ على ضغطةِ حفظٍ بلا تعديل', () => {
  assert.match(amendAuditNote({ reason: 'ر' }), /لا حقلَ تغيّر/);
  assert.equal(hasChanges([], []), false);
  assert.equal(hasChanges(null, null), false);
  assert.equal(hasChanges([{ key: 'a' }], []), true);
  assert.equal(hasChanges([], [{ row: 1 }]), true);
});

/* ═══════════════ الإزالة ═══════════════ */

test('★★★ المرقَّمُ لا يُمحى — وثغرةُ التسلسل أوّلُ ما يسأل عنه مدقّق', () => {
  assert.equal(eligibleForHardDelete(doc({ number: 'GRN-2026-000001' })), false);
  assert.equal(eligibleForHardDelete(doc({ number: null })), true);
  // والمُقيَّدُ كذلك.
  assert.equal(eligibleForHardDelete(doc({ posted: true })), false);
  // وما خرج من التحرير.
  assert.equal(eligibleForHardDelete(doc({ state: 'approved' })), false);
  assert.equal(eligibleForHardDelete(doc({ state: 'rejected' })), true);
  assert.equal(eligibleForHardDelete(null), false);
});

test('★★★ والمحوُ غيرُ متاحٍ حتى تُنشَر القواعد — ولا يُرسَم زرٌّ يرتدّ', () => {
  const draft = doc();
  const [, hard] = removalOptions(draft, KEEPER, { rulesPublished: false });
  assert.equal(hard.id, 'hardDelete');
  assert.equal(hard.available, false, 'رُسم زرُّ محوٍ والخادمُ يقول allow delete: if false');
  assert.equal(hard.requiresRulesPublish, true);
  assert.match(hard.problem, /نشرَ قواعد/);
  // «للمالك» لا تحتوي «المالك» حرفًا (لامُ الجرّ تُبدِل أل التعريف) — فالجذر.
  assert.match(hard.problem, /مالك/, 'لم يُقل من ينشر');

  // وبعد النشر يُتاح.
  const [, after] = removalOptions(draft, KEEPER, { rulesPublished: true });
  assert.equal(after.available, true);
  assert.equal(after.requiresRulesPublish, false);
});

test('الإلغاءُ متاحٌ لصاحب المسودّة — وهو «الحذف» العمليّ', () => {
  const [cancel] = removalOptions(doc(), KEEPER);
  assert.equal(cancel.id, 'cancel');
  assert.equal(cancel.available, true);
  assert.equal(cancel.needsReason, true, 'الإلغاءُ بلا سببٍ لا يُوثَّق');
  assert.equal(cancel.destructive, false);
});

test('★★ والمُرسَلُ لا يُسحب من تحت المعتمِد — ويُدَلُّ على المخرج', () => {
  const [cancel] = removalOptions(doc({ state: 'submitted' }), KEEPER);
  assert.equal(cancel.available, false);
  assert.match(cancel.problem, /يرفضه/, 'مُنع بلا أن يُدَلَّ على المخرج المشروع');
});

test('★★ والمنجَزُ لا يُلغى — ويُدَلُّ على الإغلاق والمستند العكسيّ', () => {
  const [cancel] = removalOptions(doc({ state: 'done' }), ADMIN);
  assert.equal(cancel.available, false);
  assert.match(cancel.problem, /أغلِقه|عكسي/);
});

test('والمنتهي انتهى أمرُه', () => {
  for (const state of TERMINAL_STATES) {
    const [cancel] = removalOptions(doc({ state }), ADMIN);
    assert.equal(cancel.available, false, `${state} قَبِل إلغاءً`);
  }
});

test('والغريبُ لا يُلغي مسودّةَ غيره', () => {
  const [cancel] = removalOptions(doc(), QC);
  assert.equal(cancel.available, false);
});

test('كلُّ إجراءِ إزالةٍ له شرحٌ وسببُ منعٍ حين يُمنع', () => {
  for (const user of [ADMIN, MGR, QC, KEEPER]) {
    for (const state of Object.keys(STATES)) {
      for (const opt of removalOptions(doc({ state }), user)) {
        assert.ok(opt.hint, `${opt.id} بلا شرح`);
        if (!opt.available) assert.ok(opt.problem, `${opt.id}/${state}/${user.role}: مُنع بلا سبب`);
      }
    }
  }
  assert.equal(Object.keys(REMOVAL_ACTIONS).length, 2);
});

/* ═══════════════ تطابقُ القواعد ═══════════════ */

test('★★★ الازدواجُ مع firestore.rules مُعلَنٌ ومحروس — والقواعدُ لا تستورد JS', () => {
  const rules = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'firestore.rules'),
    'utf8'
  );
  // الحارس: كلُّ دورٍ في `AMEND_ROLES` يجب أن يُذكر في القواعد — إمّا في
  // رقعةٍ منشورةٍ أو في تعليقٍ يُعلن الازدواج. وإلّا فالواجهةُ تمنح ما لا
  // يمنحه الخادمُ ولا أحدَ يعلم.
  for (const role of AMEND_ROLES) {
    assert.ok(
      rules.includes(role),
      `الدور «${role}» يملك التعديلَ المحكومَ في الواجهة ولا ذِكرَ له في firestore.rules`
    );
  }
});

test('★★★ وقاعدةُ المحو في الخادم تطابق `eligibleForHardDelete` — لا تزيد عليها', () => {
  const rules = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'firestore.rules'),
    'utf8'
  );
  // الرقعةُ طُبّقت 2026-10-02، فلم تعد القاعدةُ `allow delete: if false`.
  // ★★ والحارسُ يقرأ **البنية** لا نصَّ تعليق: التعليقُ يُعاد صوغُه فيسقط
  // الحارسُ بلا عطب، والشرطُ لا يتغيّر إلّا بتغيّر الحكم. (وقد وقع: هذا
  // الاختبارُ نفسُه كان يثبّت جملةً عربيّةً فأطلق على إعادة صياغتها.)
  // ⚠️ **تُقصّ من داخل `match /documents/{docId}` لا من أوّل الملفّ**: فيه
  // ٨١ قاعدةَ `allow delete` — وأوّلُها لمجموعةٍ أخرى تمامًا. (وقد وقع:
  // الحارسُ قرأ قاعدةَ غيرِ المستندات فأبلغ عن ثغرةٍ لا وجودَ لها.)
  const block = rules.indexOf('match /documents/{docId}');
  assert.ok(block > -1, 'لم يُعثر على كتلة المستندات في firestore.rules');
  const at = rules.indexOf('allow delete:', block);
  assert.ok(at > -1, 'لم تُقرأ قاعدةُ المحو من كتلة المستندات');
  const body = rules.slice(at, rules.indexOf(';', at));

  // ★★★ الشرطُ الذي لا يُفرَّط فيه: **المرقَّمُ لا يُمحى**.
  assert.match(body, /number == null/, 'قاعدةُ المحو لا تشترط غيابَ الرقم — ثغرةُ التسلسل تُفتح');
  // ولا يُمحى إلّا ما يُحرَّر، ولا المُقيَّد، ولا مسودّةُ غيرِك.
  assert.match(body, /state in \['draft', 'rejected'\]/, 'المحوُ لا يُحصر بالمسودّة والمرفوض');
  assert.match(body, /posted != true/, 'المحوُ لا يستثني المُقيَّد');
  assert.match(body, /createdByUid == request\.auth\.uid/, 'المحوُ لا يُحصر بصاحبه');

  // وكلُّ شرطٍ في الخادم له مقابلٌ في `eligibleForHardDelete` — فلا تفترق
  // الواجهةُ عن الحكم. (نُقاس بالسلوك لا بالنصّ.)
  assert.equal(eligibleForHardDelete({ state: 'draft', number: null }), true);
  assert.equal(eligibleForHardDelete({ state: 'draft', number: 'GRN-1' }), false);
  assert.equal(eligibleForHardDelete({ state: 'draft', number: null, posted: true }), false);
  assert.equal(eligibleForHardDelete({ state: 'approved', number: null }), false);
});

test('★★★ وبوّابةُ التعديل المحكوم في الخادم: لا تمسّ الحالةَ وتُلزم سببًا', () => {
  const rules = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'firestore.rules'),
    'utf8'
  );
  assert.match(rules, /function isGovernedAmend\(\)/, 'بوّابةُ التعديل المحكوم غائبةٌ عن القواعد');
  // الجسمُ يُقصّ من اسم الدالّة إلى أوّل `;` — فجسمُها تعبيرُ `return` واحد.
  const at = rules.indexOf('function isGovernedAmend()');
  const body = rules.slice(at, rules.indexOf(';', at));
  assert.ok(body.length > 100, 'لم يُقرأ جسمُ isGovernedAmend');

  // ★★★ أخطرُ شرطٍ فيها: **الحالةُ لا تتغيّر** — فلا تجتمع مع اعتمادٍ في
  // كتابةٍ واحدة، وهو عينُ ما يمنعه `contentUnchanged` من الجهة الأخرى.
  assert.match(body, /request\.resource\.data\.state == resource\.data\.state/, 'التعديلُ قد يجتمع مع نقلةِ حالة — بابُ ث‑٤ يُعاد فتحه');
  // والسببُ إلزاميٌّ على الخادم لا في الواجهة وحدها.
  assert.match(body, /amended\.reason\.size\(\) > 0/, 'السببُ غيرُ ملزِمٍ على الخادم');
  // والختمُ من الخادم والكاتبُ هو الفاعل.
  assert.match(body, /amended\.at == request\.time/, 'الوسمُ يُؤرَّخ من المتصفّح');
  assert.match(body, /amended\.byUid == request\.auth\.uid/, 'الوسمُ يُنسَب إلى غير فاعله');
  // والحقولُ معدودة — فلا يُرقَّم ولا يُقيَّد ولا تُبدَّل هويّةٌ من هذا الباب.
  assert.match(body, /hasOnly\(\['header', 'lines', 'amended', 'updatedAt'\]\)/, 'الحقولُ غيرُ محصورة');
  // والمُقيَّدُ مستثنًى.
  assert.match(body, /posted != true/, 'المُقيَّدُ قابلٌ للتعديل');

  // ★★★ ولا يُستعمل `approveRoles` هنا بحال: لو فُعل لعاد بابُ «المالي
  // يبدّل السعر ثمّ يعتمد» مفتوحًا بخطوتين بدل خطوة.
  assert.ok(!/approveRoles/.test(body), 'بوّابةُ التعديل تستعمل أدوارَ الاعتماد — فصلُ المهامّ يسقط');

  // وقائمةُ الأدوار هي `AMEND_ROLES` نفسُها — الازدواجُ المُعلَن محروس.
  for (const role of AMEND_ROLES) {
    assert.ok(body.includes(`'${role}'`), `الدور «${role}» في AMEND_ROLES ولا ذِكرَ له في بوّابة الخادم`);
  }
});
