/**
 * اختبارات بناء مستندات الاجتماعات — تُغني عن فتح متصفّح لصفحة محميّة.
 *
 * تتحقّق من: الشرائح تعرض الحقول الثلاثة وتعدّ البنود · المحضر يبني صفًّا
 * لكل بند ويُبرز ما يحتاج تصعيدًا · الخطاب يحمل بنود إدارته وحدها ونصوص
 * المالك حرفيًّا · التهريب يمنع الحقن · ألّا يتسرّب `undefined` إلى الورق.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mergeMeeting, MEETING_STATES, consolidate } from './meetingsModel.js';
import {
  esc,
  stateBadge,
  slideHtml,
  slidesHtml,
  minutesHtml,
  invitationHtml,
  meetingCardHtml,
  systemReportHtml,
} from './meetingsView.js';

const SEED = JSON.parse(readFileSync(new URL('../../data/meetings-seed.json', import.meta.url), 'utf8'));

/** اجتماع مالية مملوء كما لو انعقد. */
function filled() {
  const m = mergeMeeting(SEED.meetings[0], null);
  m.date = '2026-08-03';
  m.place = 'قاعة الاجتماعات — الإدارة العامة';
  m.number = 'MOM-2026-0001';
  m.letterNumber = 'LTR-2026-0001';
  m.attendees = [
    { name: 'محمد البرشي', role: 'مدير السلاسل والإمداد والمخازن', side: 'us' },
    { name: 'مسؤول المالية', role: 'المدير المالي', side: 'them' },
  ];
  m.signatories = [
    { name: 'محمد البرشي', role: 'مدير إدارة السلاسل والإمداد والمخازن', side: 'us' },
    { name: 'مسؤول المالية', role: 'المدير المالي', side: 'them' },
  ];
  m.items[0].state = 'agreed';
  m.items[0].decision = 'تسمية نقطة اتصال واحدة\nولقاء شهري أول كل شهر';
  m.items[0].ownerUs = 'محمد البرشي';
  m.items[0].ownerThem = 'المدير المالي';
  m.items[0].due = '2026-08-15';
  m.items[1].state = 'escalate';
  m.items[2].state = 'deferred';
  return m;
}

/** أي نصّ يذهب إلى الورق يجب ألّا يحوي هذه الآثار. */
function assertClean(html, where) {
  for (const bad of ['undefined', 'null', '[object Object]', 'NaN']) {
    assert.ok(!html.includes(bad), `${where}: تسرّب «${bad}»`);
  }
}

// ═══════════ التهريب ═══════════

test('التهريب يبطل الحقن ويقبل الفارغ', () => {
  const out = esc('<img src=x onerror="x()"> & "ق"');
  assert.ok(!out.includes('<img') && out.includes('&lt;img'));
  assert.ok(out.includes('&amp;') && out.includes('&quot;'));
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('قرارٌ خبيث يخرج مهرَّبًا في المحضر لا منفَّذًا', () => {
  const m = filled();
  m.items[0].decision = '<script>bad()</script>';
  const html = minutesHtml(m, { meta: SEED.meta });
  assert.ok(!html.includes('<script>bad()'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ═══════════ الشرائح ═══════════

test('الشريحة تعرض الحقول الثلاثة وترقيم البند', () => {
  const m = filled();
  const html = slideHtml(m.items[0], { index: 0, total: 10, dept: m.dept });
  assert.ok(html.includes('البند 1 من 10'));
  assert.ok(html.includes('ما نطلبه') && html.includes('لماذا'));
  assert.ok(html.includes('ما يخصّ الإدارة المالية'), 'يسمّي الإدارة المقابلة');
  assert.ok(html.includes(m.items[0].title));
  assertClean(html, 'slideHtml');
});

test('البند المسودّة يحمل تنبيهًا، والمحرَّر لا يحمله', () => {
  const m = filled();
  assert.ok(slideHtml(m.items[5], { index: 5, total: 10 }).includes('مسودّة — عدّلها قبل العرض'));
  m.items[5].draft = false;
  assert.ok(!slideHtml(m.items[5], { index: 5, total: 10 }).includes('مسودّة — عدّلها'));
});

test('القرار يظهر في الشريحة بعد كتابته فقط', () => {
  const m = filled();
  assert.ok(slideHtml(m.items[0], {}).includes('القرار المتفق عليه'));
  assert.ok(!slideHtml(m.items[4], {}).includes('القرار المتفق عليه'));
});

test('الحقل متعدّد الأسطر يخرج فقرات لا سطرًا ملتصقًا', () => {
  const html = slideHtml(filled().items[0], {});
  assert.ok(html.includes('<p>تسمية نقطة اتصال واحدة</p>'));
  assert.ok(html.includes('<p>ولقاء شهري أول كل شهر</p>'));
});

test('كل بنود الاجتماع تُصبح شرائح بالترتيب', () => {
  const m = filled();
  const html = slidesHtml(m);
  assert.equal((html.match(/class="slide"/g) || []).length, 10);
  assert.ok(html.indexOf('البند 1 من 10') < html.indexOf('البند 10 من 10'));
  assertClean(html, 'slidesHtml');
});

// ═══════════ المحضر ═══════════

test('المحضر يبني صفًّا لكل بند ويحمل الطرفين والرقم', () => {
  const html = minutesHtml(filled(), { meta: SEED.meta });
  assert.equal((html.match(/<tr><td class="d-n">/g) || []).length, 10);
  assert.ok(html.includes('MOM-2026-0001'));
  assert.ok(html.includes('إدارة السلاسل والإمداد والمخازن'));
  assert.ok(html.includes('الإدارة المالية'));
  assert.ok(html.includes('2026-08-03'));
  assertClean(html, 'minutesHtml');
});

test('المحضر يُبرز بنود التصعيد في صندوق مستقلّ', () => {
  const html = minutesHtml(filled(), { meta: SEED.meta });
  assert.ok(html.includes('بنود تحتاج تصعيدًا للإدارة العامة (1)'));
  assert.ok(html.includes('d-warn'));
});

test('اجتماع بلا تصعيد لا يعرض الصندوق', () => {
  const m = filled();
  m.items[1].state = 'agreed';
  m.items[1].decision = 'اتُّفق';
  assert.ok(!minutesHtml(m, { meta: SEED.meta }).includes('تحتاج تصعيدًا'));
});

test('الحاضرون والموقّعون يظهران، والفارغ منهم يُسقَط', () => {
  const m = filled();
  m.attendees.push({ name: '   ', role: 'شبح' });
  m.signatories.push({ name: '', role: 'فارغ' });
  const html = minutesHtml(m, { meta: SEED.meta });
  assert.equal((html.match(/<li><b>/g) || []).length, 2, 'حاضران فقط');
  assert.equal((html.match(/class="d-sig"/g) || []).length, 2, 'موقّعان فقط');
  assert.ok(!html.includes('شبح') && !html.includes('فارغ'));
});

test('محضر بلا حاضرين يقول ذلك صراحةً ولا ينهار', () => {
  const m = filled();
  m.attendees = [];
  m.signatories = [];
  const html = minutesHtml(m, {});
  assert.ok(html.includes('لم يُسجَّل حاضرون'));
  assert.ok(!html.includes('class="d-sig"'));
  assertClean(html, 'minutesHtml بلا حضور');
});

test('عدد الموقّعين حرّ — ثلاثة موقّعين تُرسم ثلاثة', () => {
  const m = filled();
  m.signatories.push({ name: 'رمزي الباش', role: 'مدير الخدمات اللوجستية والخدمية', side: 'us' });
  const html = minutesHtml(m, {});
  assert.equal((html.match(/class="d-sig"/g) || []).length, 3);
  assert.ok(html.includes('رمزي الباش'));
});

test('ملخّص البنود في رأس المحضر يطابق الحالات', () => {
  const html = minutesHtml(filled(), {});
  assert.ok(html.includes('10 بندًا — 1 متفق عليه · 1 مؤجَّل · 1 للتصعيد'));
});

// ═══════════ الخطاب ═══════════

test('الخطاب يحمل بنود إدارته وحدها ونصوص المالك حرفيًّا', () => {
  const m = filled();
  const html = invitationHtml(m, { meta: SEED.meta });
  assert.equal((html.match(/<li><span class="l-n">/g) || []).length, 10);
  assert.ok(html.includes('السادة / الإدارة المالية'));
  assert.ok(html.includes('اجتماع تحضيري رقم (01)'));
  assert.ok(html.includes(SEED.meta.preamble));
  assert.ok(html.includes(SEED.meta.closing));
  assert.ok(html.includes('LTR-2026-0001'));
  assertClean(html, 'invitationHtml');
});

test('خطاب إدارة أخرى يحمل بنودها هي لا بنود المالية', () => {
  const hr = mergeMeeting(SEED.meetings[1], null);
  const html = invitationHtml(hr, { meta: SEED.meta });
  assert.equal((html.match(/<li><span class="l-n">/g) || []).length, 6);
  assert.ok(html.includes('التوظيف') && html.includes('آلية الترقيات'));
  assert.ok(!html.includes('نقل العُهد ومتابعتها'), 'لا تسرّب من اجتماع آخر');
});

test('الخطاب بلا موعد لا يطبع سطر الموعد', () => {
  const m = mergeMeeting(SEED.meetings[2], null);
  const html = invitationHtml(m, { meta: SEED.meta });
  assert.ok(!html.includes('الموعد المقترح'));
  assertClean(html, 'invitationHtml بلا موعد');
});

test('الخطابات السبعة كلها تُبنى سليمة', () => {
  for (const seed of SEED.meetings) {
    const m = mergeMeeting(seed, null);
    const html = invitationHtml(m, { meta: SEED.meta });
    assert.equal((html.match(/<li><span class="l-n">/g) || []).length, seed.items.length, seed.dept);
    assert.ok(html.includes(seed.dept));
    assertClean(html, `خطاب ${seed.dept}`);
  }
});

// ═══════════ البطاقات والشارات ═══════════

test('البطاقة تعرض التقدّم والحالة والرقم', () => {
  const html = meetingCardHtml(filled(), { states: MEETING_STATES, selectedId: 'M01' });
  assert.ok(html.includes('mcard sel'));
  assert.ok(html.includes('الإدارة المالية'));
  assert.ok(html.includes('3/10 بندًا محسومًا'));
  assert.ok(html.includes('width:30%'));
  assert.ok(html.includes('MOM-2026-0001'));
  assertClean(html, 'meetingCardHtml');
});

test('بطاقة اجتماع لم يبدأ: صفر تقدّم وبلا رقم', () => {
  const m = mergeMeeting(SEED.meetings[4], null);
  const html = meetingCardHtml(m, { states: MEETING_STATES });
  assert.ok(html.includes('0/4 بندًا محسومًا'));
  assert.ok(html.includes('width:0%'));
  assert.ok(!html.includes('mcard sel'));
  assertClean(html, 'بطاقة لم تبدأ');
});

test('شارة الحالة تُعيد المعروف وتتحمّل المجهول', () => {
  assert.ok(stateBadge('agreed').includes('متفق عليه'));
  assert.ok(stateBadge('escalate').includes('يحتاج تصعيدًا'));
  assert.ok(stateBadge('حاجة').includes('لم يُناقَش'), 'المجهول يرجع للافتراضي');
});

// ═══════════ التقرير المجمّع (دفعة ٣) ═══════════

function seriesForReport() {
  const mk = (id, no, dept, items) => {
    const m = mergeMeeting(
      { id, no, dept, icon: '🧪', goal: 'هدف', items: items.map((_, k) => ({ id: `${id}-${k + 1}`, title: `بند ${k + 1} — ${dept}`, ask: 'أ', why: 'ب', theirSide: 'ج', draft: true })) },
      null
    );
    m.date = `2026-08-0${no}`;
    m.number = `MOM-2026-000${no}`;
    m.state = 'issued';
    items.forEach((st, k) => Object.assign(m.items[k], st));
    return m;
  };
  return [
    mk('MA', '1', 'الإدارة المالية', [
      { state: 'agreed', decision: 'قرار مالي', ownerUs: 'البرشي', ownerThem: 'المالية', due: '2026-09-10' },
      { state: 'escalate', discussion: 'خلاف على الصلاحية' },
    ]),
    mk('MB', '2', 'إدارة الجودة', [
      { state: 'agreed', decision: 'قرار جودة', ownerUs: 'الباش', due: '2026-08-20' },
      { state: 'deferred', discussion: 'يحتاج دراسة' },
    ]),
  ];
}

test('التقرير المجمّع: الأقسام الخمسة والترويسة والاعتماد', () => {
  const html = systemReportHtml(consolidate(seriesForReport()), {
    meta: { preamble: 'تمهيد الخطاب', outcome: 'المخرج النهائي', basedOn: 'خطاب المالك' },
    number: 'SYS-2026-0001',
    date: '2026-09-01',
  });
  assert.ok(html.includes('النظام الإداري التعاوني الموحّد'));
  assert.ok(html.includes('SYS-2026-0001'));
  for (const h of ['سجلّ المحاضر المرجعية', 'القرارات المعتمدة', 'خطة التنفيذ', 'مرفوعة إلى الإدارة العامة', 'مؤجَّلة']) {
    assert.ok(html.includes(h), `القسم «${h}» غائب`);
  }
  assert.ok(html.includes('اعتماد الإدارة العامة'));
  assert.ok(html.includes('تمهيد الخطاب') && html.includes('المخرج النهائي'));
});

test('التقرير يردّ كل قرار إلى محضره المرقَّم', () => {
  const html = systemReportHtml(consolidate(seriesForReport()), {});
  assert.ok(html.includes('MOM-2026-0001'));
  assert.ok(html.includes('MOM-2026-0002'));
  assert.ok(html.includes('قرار مالي') && html.includes('قرار جودة'));
});

test('المصعَّد والمؤجَّل يظهران بنصّ نقاشهما لا بعنوانهما وحده', () => {
  const html = systemReportHtml(consolidate(seriesForReport()), {});
  assert.ok(html.includes('خلاف على الصلاحية'));
  assert.ok(html.includes('يحتاج دراسة'));
});

test('بلا رقم رسمي: يُطبع «مسودّة» لا رقمٌ كاذب', () => {
  const html = systemReportHtml(consolidate(seriesForReport()), {});
  assert.ok(html.includes('مسودّة'));
  assert.ok(!/SYS-\d{4}-\d{4}/.test(html));
});

test('التقرير يُهرّب HTML في نصوص القرارات', () => {
  const s = seriesForReport();
  s[0].items[0].decision = '<script>alert(1)</script>';
  const html = systemReportHtml(consolidate(s), {});
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('التوقيعان المعتمدان يُدرجان في التقرير المجمّع', () => {
  const html = systemReportHtml(consolidate(seriesForReport()), {
    signatories: [
      { name: 'محمد إبراهيم البرشي', role: 'مدير السلاسل والإمداد والمخازن', side: 'us' },
      { name: 'رمزي الباش', role: 'مدير الخدمات اللوجستية', side: 'us' },
    ],
    assetBase: '/warehouse-system/',
  });
  assert.equal((html.match(/sig-img/g) || []).length, 2);
  assert.ok(html.includes('/warehouse-system/identity/signatures/signature-2.png'));
});

test('التقرير على سلسلة فارغة لا ينهار', () => {
  const html = systemReportHtml(consolidate([]), {});
  assert.ok(html.includes('النظام الإداري التعاوني الموحّد'));
  assert.ok(html.includes('لم تُعتمد قرارات بعد'));
});

test('البذرة تحمل التوقيعين المعتمدين للتقرير المجمّع', () => {
  const sigs = SEED.reportSignatories;
  assert.equal(sigs.length, 2, 'التقرير الرسمي يصدر بتوقيعَي المديرَين');
  assert.ok(sigs.every((s) => String(s.name || '').trim() && String(s.role || '').trim()));
  assert.ok(sigs.some((s) => s.name.includes('البرشي')));
  assert.ok(sigs.some((s) => s.name.includes('الباش')));

  // وكلاهما له صورة توقيع فعلية في المخرج — لا سطر فارغ.
  const html = systemReportHtml(consolidate([]), { signatories: sigs, assetBase: '/warehouse-system/' });
  assert.equal((html.match(/sig-img/g) || []).length, 2, 'صورتا التوقيع غير مكتملتين');
});
