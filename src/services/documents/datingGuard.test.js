/**
 * اختبارات حارس نزاهة التاريخ (م٢-ب · يسدّ ف‑٨).
 *
 * الاختباران الأخطر هنا ليسا «هل يمنع؟» بل **«هل يمنع ما لا يجب منعه؟»**:
 * صلاحيّة دفعةٍ في ٢٠٢٨ يجب أن تمرّ، وموعد سدادٍ بعد شهرٍ يجب أن يمرّ. حارسٌ
 * يمنعهما يوقف المستودع في أوّل يوم — وهو فشلٌ أسوأ من الفجوة التي يسدّها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import SCHEMAS from './schemas/index.js';
import {
  dayOf,
  fieldVerdict,
  evaluateHeaderDates,
  dateSaveVerdict,
  backdateTag,
  eventFieldsOf,
  isFieldLocked,
  defaultValueFor,
} from './datingGuard.js';

const TODAY = '2026-08-11';
const ctx = (extra = {}) => ({ docType: 'GRN', schema: SCHEMAS.GRN, today: TODAY, settings: null, ...extra });

/* ═══════════ ١. ما لا يجب منعه ═══════════ */

test('★★ صلاحيّة الدفعة في المستقبل تمرّ — وإلّا رُفض كلّ استلامٍ لبضاعةٍ صالحة', () => {
  const v = dateSaveVerdict(
    ctx({ header: { receivedAt: TODAY, expiryDate: '2028-01-01' } })
  );
  assert.equal(v.ok, true, v.problems.join(' · '));
});

test('★★ موعد السداد والتسليم المطلوب في المستقبل يمرّان', () => {
  const inv = dateSaveVerdict({
    docType: 'INV',
    schema: SCHEMAS.INV,
    today: TODAY,
    settings: null,
    header: { invoiceDate: TODAY, dueDate: '2026-12-31' },
  });
  assert.equal(inv.ok, true, inv.problems.join(' · '));

  const po = dateSaveVerdict({
    docType: 'PO',
    schema: SCHEMAS.PO,
    today: TODAY,
    settings: null,
    header: { issueDate: TODAY, requiredDelivery: '2027-03-01' },
  });
  assert.equal(po.ok, true, po.problems.join(' · '));
});

test('الحقل الفارغ لا يُحاكَم — التحقّق من الإلزام شأن المخطّط', () => {
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '', expiryDate: '' } }));
  assert.equal(v.ok, true);
});

test('حقلٌ غير مصنَّفٍ أو نوعٌ مجهول لا يُحرَس', () => {
  assert.equal(fieldVerdict('GRN', 'supplier', 'مورّد', { today: TODAY }).verdict, 'ok');
  assert.equal(fieldVerdict('لا نوع', 'receivedAt', '2030-01-01', { today: TODAY }).verdict, 'ok');
});

/* ═══════════ ٢. لا واقعة في المستقبل ═══════════ */

test('★ تاريخ استلامٍ بعد اليوم يُرفض', () => {
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-12' } }));
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /لا واقعة في المستقبل/);
  assert.equal(v.tag, null, 'المرفوض لا يُوسَم — لا يُحفظ أصلًا');
});

test('★ ولا يفكّه المدير — المستقبل ليس صلاحيّةً بل استحالة', () => {
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-12' }, role: 'admin', reason: 'سبب' }));
  assert.equal(v.ok, false);
});

test('اليوم نفسه يمرّ', () => {
  assert.equal(dateSaveVerdict(ctx({ header: { receivedAt: TODAY } })).ok, true);
});

/* ═══════════ ٣. المدى والاعتماد والسبب ═══════════ */

test('★ داخل السبعة أيّام يمرّ بلا سببٍ ولا اعتماد', () => {
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-04' }, role: 'storekeeper' }));
  assert.equal(v.ok, true);
  assert.equal(v.tag, null, 'ما دخل المدى ليس تأريخًا للماضي — لا يُوسَم');
});

test('★ ما وراء المدى: يحتاج اعتمادًا وسببًا معًا', () => {
  const bare = ctx({ header: { receivedAt: '2026-08-01' }, role: 'storekeeper' });

  const noneGiven = dateSaveVerdict(bare);
  assert.equal(noneGiven.ok, false);
  assert.equal(noneGiven.problems.length, 2, 'نقصان: لا اعتماد ولا سبب');

  const reasonOnly = dateSaveVerdict({ ...bare, reason: 'وصلت الفاتورة متأخّرة' });
  assert.equal(reasonOnly.ok, false, 'السبب وحده لا يكفي');
  assert.match(reasonOnly.problems[0], /يعتمده/);

  const approverOnly = dateSaveVerdict({ ...bare, role: 'warehouse_manager' });
  assert.equal(approverOnly.ok, false, 'والاعتماد وحده لا يكفي');
  assert.match(approverOnly.problems[0], /سببٌ مكتوب/);

  const both = dateSaveVerdict({ ...bare, role: 'warehouse_manager', reason: 'وصلت الفاتورة متأخّرة' });
  assert.equal(both.ok, true);
});

test('★ الوسم دائمٌ ويحمل ما يُسأل عنه: أيّ حقلٍ وكم يومًا ولماذا', () => {
  const v = dateSaveVerdict(
    ctx({ header: { receivedAt: '2026-08-01' }, role: 'admin', reason: '  تأخّر إدخال  ' })
  );
  assert.equal(v.ok, true);
  assert.deepEqual(v.tag, {
    backdated: true,
    fields: ['receivedAt'],
    daysBack: 10,
    reason: 'تأخّر إدخال',
  });
});

test('الوسم لا يحمل اسم المعتمِد ولا وقته — يكتبهما الخادم لا المتصفّح', () => {
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-01' }, role: 'admin', reason: 'س' }));
  assert.equal(v.tag.byName, undefined);
  assert.equal(v.tag.at, undefined);
});

/* ═══════════ ٤. السياسة تحكم لا الكود ═══════════ */

test('★ توسيع المدى من الشاشة يُمرّر ما كان يُرفض — بلا لمس كود', () => {
  const header = { receivedAt: '2026-08-01' };
  assert.equal(dateSaveVerdict(ctx({ header, role: 'storekeeper' })).ok, false);

  const loose = { dating: { backdateDays: 30, requireReason: true, approveRole: 'warehouse_manager' } };
  assert.equal(dateSaveVerdict(ctx({ header, role: 'storekeeper', settings: loose })).ok, true);
});

test('★ تشديد المدى إلى صفرٍ يمنع أمسِ', () => {
  const strict = { dating: { backdateDays: 0, requireReason: true, approveRole: 'warehouse_manager' } };
  assert.equal(dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-10' }, settings: strict })).ok, false);
  assert.equal(dateSaveVerdict(ctx({ header: { receivedAt: TODAY }, settings: strict })).ok, true);
});

test('★ نقل دور الاعتماد يُنقل الصلاحية فعلًا', () => {
  const moved = { dating: { backdateDays: 7, requireReason: true, approveRole: 'finance_manager' } };
  const args = { ...ctx({ header: { receivedAt: '2026-08-01' }, settings: moved }), reason: 'سبب' };
  assert.equal(dateSaveVerdict({ ...args, role: 'warehouse_manager' }).ok, false, 'الدور القديم لم يعد يعتمد');
  assert.equal(dateSaveVerdict({ ...args, role: 'finance_manager' }).ok, true);
});

test('إلغاء إلزام السبب يُلغيه — والاعتماد يبقى', () => {
  const noReason = { dating: { backdateDays: 7, requireReason: false, approveRole: 'warehouse_manager' } };
  const v = dateSaveVerdict(ctx({ header: { receivedAt: '2026-08-01' }, role: 'warehouse_manager', settings: noReason }));
  assert.equal(v.ok, true);
  assert.equal(v.tag.reason, '', 'ويبقى الوسم — الواقعة أُرّخت للماضي وإن لم يُطلب سبب');
});

/* ═══════════ ٥. الحكم على الرأس ═══════════ */

test('evaluateHeaderDates: يفصل المرفوض عمّا يحتاج اعتمادًا', () => {
  const ev = evaluateHeaderDates(
    ctx({ header: { receivedAt: '2026-08-01', expiryDate: '2028-01-01' }, role: 'storekeeper' })
  );
  assert.equal(ev.ok, false);
  assert.equal(ev.blocked.length, 0);
  assert.equal(ev.needsApproval.length, 1);
  assert.equal(ev.needsApproval[0].field, 'receivedAt');
  assert.equal(ev.canApprove, false);
  assert.equal(ev.approver, 'warehouse_manager');
  assert.equal(ev.fields.length, 1, 'ختم الواقعة وحده يدخل الحكم');
});

test('الرسالة تحمل تسمية الحقل من المخطّط لا مفتاحه', () => {
  const ev = evaluateHeaderDates(ctx({ header: { receivedAt: '2026-08-12' } }));
  assert.match(ev.blocked[0].label, /تاريخ ووقت الاستلام/);
});

test('backdateTag: لا وسم بلا تأريخٍ للماضي', () => {
  assert.equal(backdateTag({ needsApproval: [] }), null);
  assert.equal(backdateTag(null), null);
});

/* ═══════════ ٦. الواجهة والافتراضات ═══════════ */

test('★ ختم الواقعة مقفلٌ في الواجهة، وما عداه مفتوح', () => {
  assert.equal(isFieldLocked('GRN', 'receivedAt'), true);
  assert.equal(isFieldLocked('GRN', 'expiryDate'), false, 'الصلاحيّة تُكتب بيد أمين المخزن');
  assert.equal(isFieldLocked('PO', 'requiredDelivery'), false);
  assert.equal(isFieldLocked('PICK', 'orderDate'), false, 'المنقول ليس ختمًا');
  assert.equal(isFieldLocked('GRN', 'supplier'), false);
});

test('eventFieldsOf: يستخرج أختام الواقعة من المخطّط', () => {
  assert.deepEqual(eventFieldsOf('GRN', SCHEMAS.GRN), ['receivedAt']);
  assert.deepEqual(eventFieldsOf('PICK', SCHEMAS.PICK), [], 'PICK بلا ختمٍ — استثناءٌ مُعلَن');
  assert.deepEqual(eventFieldsOf('GRN', null), []);
});

test('defaultValueFor: المسوّدة الجديدة تُفتح بتاريخ اليوم لختم الواقعة وحده', () => {
  assert.equal(defaultValueFor('GRN', 'receivedAt', TODAY), TODAY);
  assert.equal(defaultValueFor('GRN', 'expiryDate', TODAY), '');
  assert.equal(defaultValueFor('PO', 'requiredDelivery', TODAY), '');
});

test('dayOf: يقصّ الوقت من datetime ويتحمّل الفراغ', () => {
  assert.equal(dayOf('2026-08-11T14:30'), '2026-08-11');
  assert.equal(dayOf('2026-08-11'), '2026-08-11');
  assert.equal(dayOf(null), '');
  assert.equal(dayOf(undefined), '');
});
