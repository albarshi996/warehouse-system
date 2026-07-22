/**
 * اختبارات منطق الاجتماعات التحضيرية:
 *   - البذرة الحقيقية سليمة: 7 اجتماعات · 36 بندًا · معرّفات فريدة ·
 *     والعناوين منقولة حرفيًّا من خطاب المالك (لا زيادة ولا نقصان).
 *   - الدمج لا يفقد شيئًا: البذرة تحكم العناوين، والمحفوظ يحكم ما جرى،
 *     والبند اليتيم (حُذف عنوانه من البذرة) يبقى ولا يُمحى.
 *   - لا محضر رسمي بلا تاريخ وحاضرين وموقّعَين من الطرفين وبنود محسومة.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MEETING_STATES,
  MEETING_TRANSITIONS,
  ITEM_STATES,
  canTransitionMeeting,
  mergeMeeting,
  mergeAll,
  meetingProgress,
  overallSummary,
  minutesVerdict,
  itemsByState,
  allAgreements,
  itemPatch,
} from './meetingsModel.js';

const SEED = JSON.parse(readFileSync(new URL('../../data/meetings-seed.json', import.meta.url), 'utf8'));

/** اجتماع مكتمل صالح للإصدار — نبني عليه اختبارات الرفض بحذف شرط واحد. */
function readyMeeting() {
  const m = mergeMeeting(
    { id: 'MX', no: '99', dept: 'إدارة الاختبار', icon: '🧪', goal: 'هدف', items: [
      { id: 'MX-1', title: 'بند أول', ask: 'أ', why: 'ب', theirSide: 'ج', draft: true },
      { id: 'MX-2', title: 'بند ثانٍ', ask: 'أ', why: 'ب', theirSide: 'ج', draft: true },
    ] },
    null
  );
  m.date = '2026-08-01';
  m.attendees = [{ name: 'فلان', role: 'مدير' }];
  m.signatories = [
    { name: 'محمد البرشي', role: 'مدير السلاسل', side: 'us' },
    { name: 'ممثل الإدارة', role: 'مدير', side: 'them' },
  ];
  m.items[0].state = 'agreed';
  m.items[0].decision = 'اتُّفق على كذا';
  m.items[1].state = 'deferred';
  return m;
}

// ═══════════ البذرة الحقيقية ═══════════

test('البذرة: سبعة اجتماعات و36 بندًا بمعرّفات فريدة', () => {
  assert.equal(SEED.meetings.length, 7);
  const items = SEED.meetings.flatMap((m) => m.items);
  assert.equal(items.length, 36);
  assert.equal(new Set(items.map((i) => i.id)).size, 36);
  assert.equal(new Set(SEED.meetings.map((m) => m.id)).size, 7);
});

test('توزيع البنود يطابق خطاب المالك إدارةً بإدارة', () => {
  assert.deepEqual(
    SEED.meetings.map((m) => [m.no, m.dept, m.items.length]),
    [
      ['01', 'الإدارة المالية', 10],
      ['02', 'إدارة الموارد البشرية', 6],
      ['03', 'إدارة تقنية المعلومات', 5],
      ['04', 'إدارة بلاي تايم', 3],
      ['05', 'إدارة التسويق', 4],
      ['06', 'إدارة الجودة', 4],
      ['07', 'إدارة الحوكمة', 4],
    ]
  );
});

test('كل بند يحمل مسودّة العرض الثلاثية معلَّمة draft', () => {
  for (const m of SEED.meetings) {
    for (const i of m.items) {
      assert.ok(i.title && i.title.trim(), `عنوان ${i.id}`);
      assert.ok(i.ask && i.why && i.theirSide, `مسودّة ${i.id}`);
      assert.equal(i.draft, true, `${i.id} يجب أن يُعلَّم مسودّة`);
    }
  }
});

test('نصوص الخطاب الرسمي محفوظة حرفيًّا كما كتبها المالك', () => {
  assert.ok(
    SEED.meta.preamble.startsWith(
      'تُنسَّق سلسلة من الاجتماعات الثنائية بين إدارة السلاسل والإمداد والمخازن والإدارات السبع التالية'
    )
  );
  assert.ok(SEED.meta.preamble.includes('تعزيز التكامل، وتبادل الخبرات، وتوحيد الإجراءات'));
  assert.ok(SEED.meta.outcome.startsWith('يُفضي تنفيذ هذه الاجتماعات إلى إعداد نظام إداري تعاوني متكامل ومعتمد'));
  assert.ok(SEED.meta.outcome.includes('تُرفع إلى الإدارة العامة لاعتمادها والعمل بموجبها'));
  assert.equal(
    SEED.meta.closing,
    'شاكرين لإدارتكم الموقّرة حسن تعاونها الدائم، وتفضلوا بقبول فائق الاحترام والتقدير.'
  );
});

// ═══════════ الحالات ═══════════

test('الانتقالات المسموحة فقط، ولا خروج من «موقّع»', () => {
  assert.equal(canTransitionMeeting('scheduled', 'held'), true);
  assert.equal(canTransitionMeeting('held', 'issued'), true);
  assert.equal(canTransitionMeeting('issued', 'signed'), true);
  assert.equal(canTransitionMeeting('issued', 'held'), true, 'العودة للمسودّة قبل التوقيع لتصحيح خطأ');
  assert.equal(canTransitionMeeting('scheduled', 'signed'), false, 'لا قفز إلى التوقيع');
  assert.equal(canTransitionMeeting('scheduled', 'issued'), false);
  assert.equal(canTransitionMeeting('signed', 'held'), false, 'الموقّع لا يعود مسودّة');
  assert.deepEqual(MEETING_TRANSITIONS.signed, []);
  assert.equal(canTransitionMeeting('مجهول', 'held'), false);
});

test('كل حالة تحمل تسميتها ولونها للعرض', () => {
  for (const map of [MEETING_STATES, ITEM_STATES]) {
    for (const [id, s] of Object.entries(map)) {
      assert.equal(s.id, id);
      assert.ok(s.label && s.emoji && s.color);
    }
  }
});

// ═══════════ الدمج ═══════════

test('الدمج بلا محفوظ يُعيد البذرة بحقول محضر فارغة', () => {
  const m = mergeMeeting(SEED.meetings[0], null);
  assert.equal(m.state, 'scheduled');
  assert.equal(m.items.length, 10);
  assert.ok(m.items.every((i) => i.state === 'pending' && i.decision === '' && i.draft === true));
  assert.equal(m.number, null);
});

test('المحفوظ يحكم ما جرى في الغرفة والبذرة تحكم العناوين', () => {
  const saved = {
    state: 'held',
    date: '2026-08-02',
    items: [{ id: 'M01-1', state: 'agreed', decision: 'قرار محفوظ', ownerUs: 'أنا' }],
  };
  const m = mergeMeeting(SEED.meetings[0], saved);
  const first = m.items[0];
  assert.equal(first.title, SEED.meetings[0].items[0].title, 'العنوان من البذرة');
  assert.equal(first.decision, 'قرار محفوظ');
  assert.equal(first.ownerUs, 'أنا');
  assert.equal(first.state, 'agreed');
  assert.equal(m.items[1].state, 'pending', 'البنود الأخرى لم تتأثّر');
  assert.equal(m.date, '2026-08-02');
});

test('تحرير المسودّة يزيل وسم draft ولا يعود يدهسها البذرة', () => {
  const saved = { items: [{ id: 'M01-1', ask: 'صياغتي أنا' }] };
  const m = mergeMeeting(SEED.meetings[0], saved);
  assert.equal(m.items[0].ask, 'صياغتي أنا');
  assert.equal(m.items[0].draft, false);
  assert.equal(m.items[1].draft, true, 'ما لم يُحرَّر يبقى مسودّة');
});

test('بند محفوظ حُذف عنوانه من البذرة يبقى ولا يُمحى', () => {
  const saved = { items: [{ id: 'قديم-1', title: 'بند من نسخة سابقة', decision: 'قرار مهم' }] };
  const m = mergeMeeting(SEED.meetings[3], saved);
  assert.equal(m.items.length, SEED.meetings[3].items.length + 1);
  const orphan = m.items[m.items.length - 1];
  assert.equal(orphan.orphan, true);
  assert.equal(orphan.decision, 'قرار مهم');
});

test('mergeAll يدمج السبعة ويحترم المحفوظ لكل واحد', () => {
  const all = mergeAll(SEED.meetings, { M03: { state: 'signed' } });
  assert.equal(all.length, 7);
  assert.equal(all.find((m) => m.id === 'M03').state, 'signed');
  assert.equal(all.find((m) => m.id === 'M01').state, 'scheduled');
});

// ═══════════ التقدّم ═══════════

test('التقدّم يعدّ المحسوم لا المتفق عليه وحده', () => {
  const m = readyMeeting();
  const p = meetingProgress(m);
  assert.deepEqual(
    { total: p.total, settled: p.settled, agreed: p.agreed, deferred: p.deferred, pending: p.pending, percent: p.percent },
    { total: 2, settled: 2, agreed: 1, deferred: 1, pending: 0, percent: 100 }
  );
});

test('اجتماع بلا بنود لا يقسم على صفر', () => {
  assert.equal(meetingProgress({ items: [] }).percent, 0);
});

test('اللقطة العامة تجمع السبعة', () => {
  const all = mergeAll(SEED.meetings, {});
  const s = overallSummary(all);
  assert.equal(s.meetings, 7);
  assert.equal(s.items, 36);
  assert.equal(s.agreed, 0);
  assert.equal(s.pending, 36);
  assert.equal(s.held, 0);
});

// ═══════════ حكم إصدار المحضر ═══════════

test('الاجتماع المكتمل يجتاز الحكم', () => {
  const v = minutesVerdict(readyMeeting());
  assert.deepEqual(v.problems, []);
  assert.equal(v.ok, true);
});

test('لا محضر بلا تاريخ', () => {
  const m = readyMeeting();
  m.date = '';
  assert.ok(minutesVerdict(m).problems.some((p) => p.includes('تاريخ')));
});

test('لا محضر بلا حاضرين', () => {
  const m = readyMeeting();
  m.attendees = [{ name: '   ' }];
  assert.ok(minutesVerdict(m).problems.some((p) => p.includes('حاضر')));
});

test('لا محضر بموقّع واحد ولا بطرف واحد', () => {
  const one = readyMeeting();
  one.signatories = [{ name: 'محمد البرشي', side: 'us' }];
  assert.ok(minutesVerdict(one).problems.some((p) => p.includes('موقّعَين على الأقل')));

  const sameSide = readyMeeting();
  sameSide.signatories = [
    { name: 'أ', side: 'us' },
    { name: 'ب', side: 'us' },
  ];
  const probs = minutesVerdict(sameSide).problems;
  assert.ok(probs.some((p) => p.includes('إدارة الاختبار')), 'يذكر الإدارة المقابلة بالاسم');
});

test('لا محضر وفيه بند لم يُحسم — والرسالة تسمّي البنود', () => {
  const m = readyMeeting();
  m.items[1].state = 'pending';
  const p = minutesVerdict(m).problems;
  assert.ok(p.some((x) => x.includes('لم يُحسم') && x.includes('بند ثانٍ')));
});

test('«متفق عليه» بلا نصّ قرار مرفوض — الاتفاق يُكتب لا يُذكر', () => {
  const m = readyMeeting();
  m.items[0].decision = '   ';
  assert.ok(minutesVerdict(m).problems.some((x) => x.includes('بلا نصّ قرار')));
});

test('المؤجَّل والمصعَّد وغير المنطبق لا تحتاج نصّ قرار', () => {
  const m = readyMeeting();
  m.items[0].state = 'escalate';
  m.items[0].decision = '';
  m.items[1].state = 'na';
  assert.deepEqual(minutesVerdict(m).problems, []);
});

// ═══════════ الاستخراج ═══════════

test('استخراج البنود بحالتها', () => {
  const m = readyMeeting();
  assert.equal(itemsByState(m, 'agreed').length, 1);
  assert.equal(itemsByState(m, 'deferred').length, 1);
  assert.equal(itemsByState(m, 'na').length, 0);
});

test('حصاد الاتفاقات عبر الاجتماعات — بذرة التقرير النهائي', () => {
  const m = readyMeeting();
  m.number = 'MOM-2026-0001';
  const rows = allAgreements([m]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dept, 'إدارة الاختبار');
  assert.equal(rows[0].number, 'MOM-2026-0001');
  assert.equal(rows[0].decision, 'اتُّفق على كذا');
  assert.deepEqual(allAgreements([]), []);
});

test('الحفظ يخزّن ما كُتب لا البذرة كاملةً', () => {
  const patch = itemPatch(readyMeeting().items[0]);
  assert.deepEqual(Object.keys(patch).sort(), [
    'ask', 'decision', 'discussion', 'due', 'id', 'ownerThem', 'ownerUs', 'state', 'theirSide', 'why',
  ]);
  assert.equal(patch.title, undefined, 'العنوان يبقى في البذرة ولا يُكرَّر');
});
