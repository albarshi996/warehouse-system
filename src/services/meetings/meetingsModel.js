/**
 * منطق الاجتماعات التحضيرية الخالص — بلا Firestore وبلا DOM.
 *
 * الفكرة الحاكمة: **الأجندة بذرةٌ ثابتة، والمحضر طبقةٌ فوقها.** عناوين
 * البنود الـ36 منقولة حرفيًّا من خطاب المالك في `meetings-seed.json` ولا
 * تُعدَّل من الواجهة؛ وما يُكتب في الاجتماع (نقاش · قرار · مسؤول · موعد)
 * يُحفظ منفصلًا ويُدمج عند العرض. فلو صحّح المالك صياغة بند في البذرة
 * لم يضِع ما سُجّل في اجتماع سابق.
 *
 * ولا يُصدَر محضر رسمي إلا بعد اجتياز `minutesVerdict` — لأن رقمًا رسميًّا
 * على محضر ناقص أسوأ من محضر بلا رقم.
 */

/** حالات الاجتماع — لا قفز بينها إلا وفق `MEETING_TRANSITIONS`. */
export const MEETING_STATES = {
  scheduled: { id: 'scheduled', label: 'مجدول', emoji: '📅', color: '#64748b' },
  held: { id: 'held', label: 'انعقد — محضر مسودّة', emoji: '📝', color: '#f59e0b' },
  issued: { id: 'issued', label: 'محضر رسمي صادر', emoji: '📜', color: '#3b82f6' },
  signed: { id: 'signed', label: 'موقّع ومعتمد', emoji: '✅', color: '#00b87a' },
};

export const MEETING_TRANSITIONS = {
  scheduled: ['held'],
  held: ['issued'],
  issued: ['signed', 'held'], // العودة للمسودّة مسموحة قبل التوقيع لتصحيح خطأ
  signed: [],
};

/** حال كل بند بعد مناقشته. */
export const ITEM_STATES = {
  pending: { id: 'pending', label: 'لم يُناقَش', emoji: '⚪', color: '#94a3b8' },
  agreed: { id: 'agreed', label: 'متفق عليه', emoji: '✅', color: '#00b87a' },
  deferred: { id: 'deferred', label: 'مؤجَّل', emoji: '⏸️', color: '#f59e0b' },
  escalate: { id: 'escalate', label: 'يحتاج تصعيدًا', emoji: '⬆️', color: '#ef4444' },
  na: { id: 'na', label: 'غير منطبق', emoji: '➖', color: '#64748b' },
};

/** البنود التي تُعدّ «محسومة» عند حساب اكتمال المحضر. */
const SETTLED = ['agreed', 'deferred', 'escalate', 'na'];

/** هل يجوز الانتقال من حالة إلى أخرى؟ */
export function canTransitionMeeting(from, to) {
  return (MEETING_TRANSITIONS[from] || []).includes(to);
}

/**
 * يدمج بذرة الاجتماع مع ما حُفظ سحابيًّا.
 * البذرة تحكم **العناوين والترتيب**؛ والمحفوظ يحكم **ما جرى في الغرفة**
 * وأي تحرير للمسودّة. بند محفوظ لا أصل له في البذرة يُلحق في آخر القائمة
 * (لئلّا يضيع شيء كتبه المالك ثم حُذف عنوانه من البذرة).
 */
export function mergeMeeting(seed, saved) {
  const s = saved || {};
  const savedItems = new Map((s.items || []).map((i) => [i.id, i]));

  const items = (seed.items || []).map((item) => {
    const rec = savedItems.get(item.id) || {};
    savedItems.delete(item.id);
    return {
      ...item,
      ask: rec.ask ?? item.ask,
      why: rec.why ?? item.why,
      theirSide: rec.theirSide ?? item.theirSide,
      draft: rec.ask !== undefined ? false : item.draft,
      discussion: rec.discussion || '',
      decision: rec.decision || '',
      ownerUs: rec.ownerUs || '',
      ownerThem: rec.ownerThem || '',
      due: rec.due || '',
      state: rec.state || 'pending',
    };
  });

  for (const orphan of savedItems.values()) {
    items.push({ draft: false, state: 'pending', ...orphan, orphan: true });
  }

  return {
    id: seed.id,
    no: seed.no,
    dept: seed.dept,
    icon: seed.icon,
    goal: s.goal ?? seed.goal,
    state: s.state || 'scheduled',
    date: s.date || '',
    place: s.place || '',
    attendees: s.attendees || [],
    signatories: s.signatories || [],
    number: s.number || null,
    letterNumber: s.letterNumber || null,
    notes: s.notes || '',
    items,
  };
}

/** يدمج كل الاجتماعات دفعةً واحدة. */
export function mergeAll(seedMeetings, savedById = {}) {
  return (seedMeetings || []).map((m) => mergeMeeting(m, savedById[m.id]));
}

/** تقدّم الاجتماع: كم بندًا حُسم من الإجمالي، وكم اتُّفق عليه. */
export function meetingProgress(meeting) {
  const items = meeting.items || [];
  const settled = items.filter((i) => SETTLED.includes(i.state));
  const agreed = items.filter((i) => i.state === 'agreed');
  return {
    total: items.length,
    settled: settled.length,
    agreed: agreed.length,
    escalate: items.filter((i) => i.state === 'escalate').length,
    deferred: items.filter((i) => i.state === 'deferred').length,
    pending: items.length - settled.length,
    percent: items.length ? Math.round((settled.length / items.length) * 100) : 0,
  };
}

/** لقطة عامة على الاجتماعات السبعة — لبطاقة الرأس ولتقرير الدفعة الثالثة. */
export function overallSummary(meetings) {
  const all = meetings || [];
  const items = all.flatMap((m) => m.items || []);
  return {
    meetings: all.length,
    held: all.filter((m) => m.state !== 'scheduled').length,
    signed: all.filter((m) => m.state === 'signed').length,
    items: items.length,
    agreed: items.filter((i) => i.state === 'agreed').length,
    escalate: items.filter((i) => i.state === 'escalate').length,
    pending: items.filter((i) => !SETTLED.includes(i.state)).length,
  };
}

/**
 * حكم إصدار المحضر الرسمي. يُعيد `{ ok, problems[] }` ولا يرمي —
 * الواجهة تعرض النواقص للمستخدم بدل أن تنهار.
 *
 * الشروط: تاريخ · حاضر واحد على الأقل · موقّعان بأسماء من الطرفين ·
 * كل بند محسوم · وكل بند «متفق عليه» له نصّ قرار مكتوب.
 */
export function minutesVerdict(meeting) {
  const problems = [];
  if (!meeting) return { ok: false, problems: ['لا اجتماع'] };

  if (!meeting.date) problems.push('تاريخ الاجتماع غير محدّد');
  if (!(meeting.attendees || []).some((a) => String(a.name || '').trim())) {
    problems.push('لم يُسجَّل أي حاضر');
  }

  const sigs = (meeting.signatories || []).filter((s) => String(s.name || '').trim());
  if (sigs.length < 2) problems.push('المحضر يحتاج موقّعَين على الأقل بأسمائهما');
  else {
    if (!sigs.some((s) => s.side === 'us')) problems.push('لا موقّع من إدارة السلاسل والإمداد والمخازن');
    if (!sigs.some((s) => s.side === 'them')) problems.push(`لا موقّع من ${meeting.dept}`);
  }

  const items = meeting.items || [];
  const unsettled = items.filter((i) => !SETTLED.includes(i.state));
  if (unsettled.length) {
    problems.push(`${unsettled.length} بندًا لم يُحسم: ${unsettled.slice(0, 3).map((i) => i.title).join(' · ')}${unsettled.length > 3 ? ' …' : ''}`);
  }

  const agreedNoText = items.filter((i) => i.state === 'agreed' && !String(i.decision || '').trim());
  if (agreedNoText.length) {
    problems.push(`${agreedNoText.length} بندًا «متفق عليه» بلا نصّ قرار مكتوب`);
  }

  return { ok: problems.length === 0, problems };
}

/** بنود اجتماع بحالة بعينها — أساس أقسام المحضر والتقرير النهائي. */
export function itemsByState(meeting, state) {
  return (meeting.items || []).filter((i) => i.state === state);
}

/** كل ما اتُّفق عليه عبر الاجتماعات — بذرة تقرير الدفعة الثالثة. */
export function allAgreements(meetings) {
  return (meetings || []).flatMap((m) =>
    itemsByState(m, 'agreed').map((i) => ({
      meetingId: m.id,
      dept: m.dept,
      number: m.number,
      date: m.date,
      itemId: i.id,
      title: i.title,
      decision: i.decision,
      ownerUs: i.ownerUs,
      ownerThem: i.ownerThem,
      due: i.due,
    }))
  );
}

/** الصفوف التي تُحفظ سحابيًّا من بند (نتفادى تخزين البذرة مرّتين). */
export function itemPatch(item) {
  return {
    id: item.id,
    ask: item.ask,
    why: item.why,
    theirSide: item.theirSide,
    discussion: item.discussion || '',
    decision: item.decision || '',
    ownerUs: item.ownerUs || '',
    ownerThem: item.ownerThem || '',
    due: item.due || '',
    state: item.state || 'pending',
  };
}
