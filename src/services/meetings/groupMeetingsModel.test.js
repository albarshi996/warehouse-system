/**
 * اختبارات منطق الاجتماعات الجماعية:
 *   - البناء بلا بذرة: اجتماع جديد فارغ سليم البنية، والدمج من Firestore
 *     يملأ النواقص ولا ينهار على حقلٍ غائب.
 *   - حكم المحضر الجماعي: لا إصدار بلا عنوان وتاريخ وإدارات وحاضر وموقّعَين
 *     وبنودٍ محسومة — وبلا شرط us/them (طاولة واحدة لعدّة إدارات).
 *   - الحفظ لا يفقد بندًا، والبنود كلّها «مُضافة».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUP_KIND,
  ORG_DEPARTMENTS,
  DEFAULT_GROUP_SIGNATORIES,
  blankGroupMeeting,
  mergeGroupMeeting,
  mergeGroupAll,
  newGroupItem,
  groupItemsPatch,
  groupMinutesVerdict,
  groupAgendaVerdict,
  newGroupId,
  meetingProgress,
} from './groupMeetingsModel.js';

/** اجتماع جماعي مكتمل صالح للإصدار — نبني عليه اختبارات الرفض بحذف شرطٍ واحد. */
function validGroupMeeting() {
  const m = blankGroupMeeting({
    idSeed: 'test1',
    title: 'اجتماع تنسيقي شهري',
    date: '2026-08-01',
    place: 'قاعة الاجتماعات',
    departments: ['الإدارة المالية', 'إدارة الجودة'],
  });
  m.attendees = [{ name: 'أحمد', role: 'ممثل المالية', dept: 'الإدارة المالية' }];
  const it = newGroupItem(m, { title: 'توحيد نموذج طلب الصرف' });
  it.state = 'agreed';
  it.decision = 'يُعتمد النموذج الموحّد ابتداءً من الشهر القادم.';
  m.items.push(it);
  return m;
}

test('blankGroupMeeting: بنية سليمة ووسم جماعي وموقّعان افتراضيان', () => {
  const m = blankGroupMeeting({ idSeed: 'x', title: '  اجتماع  ' });
  assert.equal(m.kind, GROUP_KIND);
  assert.equal(m.id, 'G-x');
  assert.equal(m.title, 'اجتماع'); // trim
  assert.equal(m.state, 'scheduled');
  assert.deepEqual(m.items, []);
  assert.deepEqual(m.transcript, []);
  assert.equal(m.archived, false);
  assert.equal(m.signatories.length, 2);
  assert.ok(m.signatories.some((s) => s.name.includes('البرشي')));
  assert.ok(m.signatories.some((s) => s.name.includes('الباش')));
});

test('newGroupId: حتميّ بالبذرة، وفريدٌ بدونها', () => {
  assert.equal(newGroupId('abc'), 'G-abc');
  const a = newGroupId();
  const b = newGroupId();
  assert.ok(a.startsWith('G-'));
  assert.notEqual(a, b);
});

test('ORG_DEPARTMENTS: يضمّ إدارتينا والإدارات السبع', () => {
  assert.ok(ORG_DEPARTMENTS.includes('إدارة السلاسل والإمداد والمخازن'));
  assert.ok(ORG_DEPARTMENTS.includes('الإدارة المالية'));
  assert.ok(ORG_DEPARTMENTS.includes('إدارة الحوكمة'));
  assert.equal(new Set(ORG_DEPARTMENTS).size, ORG_DEPARTMENTS.length); // لا تكرار
});

test('mergeGroupMeeting: يملأ النواقص ولا ينهار على وثيقةٍ ناقصة', () => {
  const m = mergeGroupMeeting({ id: 'G-1' });
  assert.equal(m.id, 'G-1');
  assert.equal(m.kind, GROUP_KIND);
  assert.deepEqual(m.departments, []);
  assert.deepEqual(m.items, []);
  assert.equal(m.signatories.length, 2); // افتراضيّ عند الغياب
  assert.equal(m.number, null);
});

test('mergeGroupMeeting: البنود تُشكَّل كلّها كـ«مُضافة»', () => {
  const m = mergeGroupMeeting({
    id: 'G-1',
    items: [{ id: 'G-1-c1', title: 'بند', state: 'agreed', decision: 'قرار' }],
  });
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].custom, true);
  assert.equal(m.items[0].state, 'agreed');
});

test('mergeGroupAll: يفلتر الجماعية فقط ويرتّب بالأحدث', () => {
  const byId = {
    M01: { id: 'M01', dept: 'المالية' }, // اجتماع ثنائي — يُستبعد
    __system_report__: { id: '__system_report__', kind: 'system_report' }, // يُستبعد
    'G-1': { id: 'G-1', kind: GROUP_KIND, title: 'أقدم', date: '2026-07-01' },
    'G-2': { id: 'G-2', kind: GROUP_KIND, title: 'أحدث', date: '2026-08-01' },
  };
  const list = mergeGroupAll(byId);
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'أحدث'); // الأحدث أولًا
  assert.equal(list[1].title, 'أقدم');
});

test('groupItemsPatch: يحفظ عنوان كل بند (كلّها مُضافة)', () => {
  const m = validGroupMeeting();
  const patch = groupItemsPatch(m);
  assert.equal(patch.length, 1);
  assert.equal(patch[0].title, 'توحيد نموذج طلب الصرف');
  assert.equal(patch[0].custom, true);
  assert.equal(patch[0].decision, 'يُعتمد النموذج الموحّد ابتداءً من الشهر القادم.');
});

test('groupMinutesVerdict: يقبل الاجتماع المكتمل', () => {
  const v = groupMinutesVerdict(validGroupMeeting());
  assert.equal(v.ok, true, v.problems.join(' · '));
  assert.deepEqual(v.problems, []);
});

test('groupMinutesVerdict: يرفض بلا عنوان', () => {
  const m = validGroupMeeting();
  m.title = '';
  const v = groupMinutesVerdict(m);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes('عنوان')));
});

test('groupMinutesVerdict: يرفض بلا تاريخ', () => {
  const m = validGroupMeeting();
  m.date = '';
  assert.equal(groupMinutesVerdict(m).ok, false);
});

test('groupMinutesVerdict: يرفض بلا إدارات مشاركة', () => {
  const m = validGroupMeeting();
  m.departments = [];
  const v = groupMinutesVerdict(m);
  assert.ok(v.problems.some((p) => p.includes('الإدارات')));
});

test('groupMinutesVerdict: يرفض بموقّعٍ واحد فقط', () => {
  const m = validGroupMeeting();
  m.signatories = [{ name: 'وحيد', role: 'مدير' }];
  const v = groupMinutesVerdict(m);
  assert.ok(v.problems.some((p) => p.includes('موقّعَين')));
});

test('groupMinutesVerdict: يرفض بندًا متفقًا عليه بلا نصّ قرار', () => {
  const m = validGroupMeeting();
  m.items[0].decision = '';
  const v = groupMinutesVerdict(m);
  assert.ok(v.problems.some((p) => p.includes('نصّ قرار')));
});

test('groupMinutesVerdict: يرفض بندًا لم يُحسم', () => {
  const m = validGroupMeeting();
  m.items[0].state = 'pending';
  const v = groupMinutesVerdict(m);
  assert.ok(v.problems.some((p) => p.includes('لم يُحسم')));
});

test('meetingProgress يعمل على الاجتماع الجماعي (إعادة استخدام)', () => {
  const m = validGroupMeeting();
  const p = meetingProgress(m);
  assert.equal(p.total, 1);
  assert.equal(p.agreed, 1);
  assert.equal(p.settled, 1);
  assert.equal(p.percent, 100);
});

test('groupAgendaVerdict: يمنع التحرير بعد الاعتماد ويُنبّه بعد الإصدار', () => {
  const draft = validGroupMeeting();
  assert.equal(groupAgendaVerdict(draft).ok, true);
  assert.equal(groupAgendaVerdict(draft).warn, '');

  const issued = { ...draft, number: 'MOM-2026-0007' };
  assert.equal(groupAgendaVerdict(issued).ok, true);
  assert.ok(groupAgendaVerdict(issued).warn.includes('MOM-2026-0007'));

  const signed = { ...draft, state: 'signed' };
  assert.equal(groupAgendaVerdict(signed).ok, false);
});

test('DEFAULT_GROUP_SIGNATORIES: مطابقة أسماء التوقيعات المعتمدة', () => {
  assert.equal(DEFAULT_GROUP_SIGNATORIES.length, 2);
  const names = DEFAULT_GROUP_SIGNATORIES.map((s) => s.name).join(' ');
  assert.ok(names.includes('البرشي'));
  assert.ok(names.includes('الباش'));
});
