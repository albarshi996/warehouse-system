/**
 * منطق الاجتماعات الجماعية الخالص — بلا Firestore وبلا DOM.
 *
 * الفرق عن الاجتماعات التحضيرية الثنائية (M01…M07): **لا بذرة ثابتة.**
 * الاجتماع الجماعي يُنشئه المدير كاملًا (عنوان · إدارات مشاركة · بنود)،
 * ويجمع عدّة إدارات على طاولة واحدة بدل طرفَين اثنين. فمحضره **متعدّد
 * التواقيع** لا ثنائيّها، وبنوده كلّها «مُضافة» (لا أصل لها في بذرة).
 *
 * يعيد استخدام محرّك المحاضر الناضج (الحالات · تقدّم البنود · تشكيل البند)
 * ولا يكرّره — الجديد هنا ثلاثة أشياء فقط: البناء بلا بذرة، والإدارات
 * المشاركة، وحكم إصدار المحضر الجماعي.
 */
import {
  MEETING_STATES,
  ITEM_STATES,
  SETTLED,
  meetingProgress,
  overallSummary,
  createItem,
  itemPatch,
  canTransitionMeeting,
} from './meetingsModel.js';

// نُعيد تصدير ما تحتاجه الواجهة من المحرّك المشترك، فتستورد من مكان واحد.
export { MEETING_STATES, ITEM_STATES, meetingProgress, overallSummary, canTransitionMeeting };

/** الوسم الذي يميّز الاجتماع الجماعي عن السبعة و«التقرير المجمّع» في المجموعة. */
export const GROUP_KIND = 'group';

/**
 * إدارات الشركة القابلة للمشاركة في اجتماع جماعي.
 * السبع من بذرة الاجتماعات التحضيرية + إدارتانا العُليا (المُنظِّمتان).
 */
export const ORG_DEPARTMENTS = [
  'إدارة السلاسل والإمداد والمخازن',
  'إدارة الخدمات اللوجستية والخدمية',
  'الإدارة المالية',
  'إدارة الموارد البشرية',
  'إدارة تقنية المعلومات',
  'إدارة بلاي تايم',
  'إدارة التسويق',
  'إدارة الجودة',
  'إدارة الحوكمة',
];

/**
 * الموقّعان الافتراضيان — مديرا إدارتينا (قرار المالك 23.07). أسماؤهما تطابق
 * التوقيعات المعتمدة PNG فتُدرَج صورهما في المحضر تلقائيًّا (راجع meetingsView).
 */
export const DEFAULT_GROUP_SIGNATORIES = [
  {
    name: 'محمد إبراهيم البرشي',
    role: 'مدير إدارة السلاسل والإمداد والمخازن',
    dept: 'إدارة السلاسل والإمداد والمخازن',
  },
  {
    name: 'رمزي الباش',
    role: 'مدير إدارة الخدمات اللوجستية والخدمية',
    dept: 'إدارة الخدمات اللوجستية والخدمية',
  },
];

/**
 * معرّف اجتماع جماعي محلّيّ مؤقّت — تستبدله الخدمة بمعرّف Firestore عند أول
 * حفظ. يُمرَّر صراحةً في الاختبارات فيبقى حتميًّا.
 */
export function newGroupId(seed) {
  if (seed) return `G-${seed}`;
  return `G-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** يشكّل بندًا واحدًا محفوظًا في هيئة موحّدة — كل بنود الجماعي «مُضافة». */
function normalizeItem(it = {}) {
  return {
    id: it.id,
    title: it.title || '',
    ask: it.ask || '',
    why: it.why || '',
    theirSide: it.theirSide || '',
    discussion: it.discussion || '',
    decision: it.decision || '',
    ownerUs: it.ownerUs || '',
    ownerThem: it.ownerThem || '',
    due: it.due || '',
    state: it.state || 'pending',
    custom: true,
  };
}

/**
 * اجتماع جماعي جديد فارغ جاهز للغرفة.
 * @param {object} fields { id?, title, date?, place?, goal?, departments? }
 */
export function blankGroupMeeting(fields = {}) {
  return {
    id: fields.id || newGroupId(fields.idSeed),
    kind: GROUP_KIND,
    title: String(fields.title || '').trim(),
    date: fields.date || '',
    place: fields.place || '',
    goal: fields.goal || '',
    notes: '',
    departments: Array.isArray(fields.departments) ? [...fields.departments] : [],
    attendees: [],
    signatories: DEFAULT_GROUP_SIGNATORIES.map((s) => ({ ...s })),
    items: [],
    // التفريغ النصّي من التسجيل الحيّ — يُحفظ سحابيًّا (الصوت يبقى محليًّا).
    transcript: [],
    recordingMeta: null,
    state: 'scheduled',
    number: null,
    issuedAt: null,
    archived: false,
  };
}

/**
 * يبني كائن اجتماع جماعي من وثيقة Firestore — لا بذرة تُدمج، فالمحفوظ هو كل
 * الحقيقة. يملأ النواقص بالافتراضات الآمنة فلا تنهار الواجهة على حقلٍ غائب.
 */
export function mergeGroupMeeting(saved) {
  const s = saved || {};
  return {
    id: s.id,
    kind: GROUP_KIND,
    title: s.title || '',
    date: s.date || '',
    place: s.place || '',
    goal: s.goal || '',
    notes: s.notes || '',
    departments: Array.isArray(s.departments) ? s.departments : [],
    attendees: Array.isArray(s.attendees) ? s.attendees : [],
    signatories: Array.isArray(s.signatories) && s.signatories.length
      ? s.signatories
      : DEFAULT_GROUP_SIGNATORIES.map((x) => ({ ...x })),
    items: (s.items || []).map(normalizeItem),
    transcript: Array.isArray(s.transcript) ? s.transcript : [],
    recordingMeta: s.recordingMeta || null,
    state: s.state || 'scheduled',
    number: s.number || null,
    issuedAt: s.issuedAt || null,
    archived: Boolean(s.archived),
  };
}

/** يبني قائمة الاجتماعات الجماعية من خريطة Firestore، مرتّبةً بالأحدث تاريخًا. */
export function mergeGroupAll(savedById = {}) {
  return Object.values(savedById || {})
    .filter((d) => d && d.kind === GROUP_KIND)
    .map(mergeGroupMeeting)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** بند جماعي جديد جاهز للإلحاق — يعيد استخدام تشكيل المحرّك المشترك. */
export function newGroupItem(meeting, fields = {}) {
  return createItem(meeting, fields);
}

/** إدارتنا المنظِّمة — الطرف الثابت الذي يُدعى إليه كلّ اجتماعٍ تحضيريّ. */
export const ORGANIZING_DEPARTMENT = 'إدارة السلاسل والإمداد والمخازن';

/**
 * يبني اجتماعًا يدويًّا جديدًا **من قالب** (أحد الاجتماعات السبعة المبذورة في
 * `meetings-seed.json`): يملأ العنوان والهدف والإدارتين وبنودَ الخطاب كنقطة
 * بداية **قابلة للتحرير الكامل** — بلا دمجٍ آليٍّ ببذرةٍ بعدها. فالقالب بذرةٌ
 * تُنسَخ مرّةً واحدة، ثمّ يملك الاجتماع حياته الخاصّة كأيّ اجتماعٍ أُنشئ يدويًّا.
 * يُبقي الصفحةَ حرّةً (المالك يكتب ويحذف) دون أن يُهدر صياغةَ خطابه الرسميّ.
 *
 * @param {object} seed اجتماعٌ من بذرة `meetings-seed.json`
 * @param {object} fields تجاوزات اختيارية { id?, idSeed?, date?, place? }
 */
export function meetingFromTemplate(seed = {}, fields = {}) {
  const dept = String(seed.dept || '').trim();
  const meeting = blankGroupMeeting({
    ...fields,
    title: dept ? `اجتماع تحضيري — ${dept}` : 'اجتماع تحضيري',
    goal: seed.goal || '',
    departments: [ORGANIZING_DEPARTMENT, dept].filter(Boolean),
  });
  for (const it of seed.items || []) {
    meeting.items.push(
      newGroupItem(meeting, {
        title: it.title || '',
        ask: it.ask || '',
        why: it.why || '',
        theirSide: it.theirSide || '',
      })
    );
  }
  return meeting;
}

/** كل ما يُحفظ من البنود — بنود الجماعي كلّها مُضافة فتُحفظ كاملة. */
export function groupItemsPatch(meeting) {
  return (meeting.items || []).map(itemPatch);
}

/**
 * حكم إصدار المحضر الجماعي — `{ ok, problems[] }`، لا يرمي.
 *
 * يشبه `minutesVerdict` الثنائي لكن بلا شرط us/them: الاجتماع الجماعي طاولة
 * واحدة لعدّة إدارات، فالمطلوب موقّعان اثنان على الأقل بأسمائهما لا موقّعٌ من
 * كل طرف. والشروط الباقية واحدة: عنوان · تاريخ · إدارات · حاضر · بنود محسومة ·
 * وكل «متفق عليه» له نصّ قرار.
 */
export function groupMinutesVerdict(meeting) {
  const problems = [];
  if (!meeting) return { ok: false, problems: ['لا اجتماع'] };

  if (!String(meeting.title || '').trim()) problems.push('الاجتماع بلا عنوان');
  if (!meeting.date) problems.push('تاريخ الاجتماع غير محدّد');
  if (!(meeting.departments || []).length) problems.push('لم تُحدَّد الإدارات المشاركة');
  if (!(meeting.attendees || []).some((a) => String(a.name || '').trim())) {
    problems.push('لم يُسجَّل أي حاضر');
  }

  const sigs = (meeting.signatories || []).filter((s) => String(s.name || '').trim());
  if (sigs.length < 2) problems.push('المحضر يحتاج موقّعَين على الأقل بأسمائهما');

  const items = meeting.items || [];
  if (!items.length) problems.push('لا بنود في الاجتماع');

  const unsettled = items.filter((i) => !SETTLED.includes(i.state));
  if (unsettled.length) {
    problems.push(
      `${unsettled.length} بندًا لم يُحسم: ${unsettled.slice(0, 3).map((i) => i.title).join(' · ')}${unsettled.length > 3 ? ' …' : ''}`
    );
  }

  const agreedNoText = items.filter((i) => i.state === 'agreed' && !String(i.decision || '').trim());
  if (agreedNoText.length) {
    problems.push(`${agreedNoText.length} بندًا «متفق عليه» بلا نصّ قرار مكتوب`);
  }

  return { ok: problems.length === 0, problems };
}

/** هل يجوز تحرير أجندة هذا الاجتماع الجماعي الآن؟ نفس مبدأ الثنائي. */
export function groupAgendaVerdict(meeting) {
  if (!meeting) return { ok: false, reason: 'لا اجتماع', warn: '' };
  if (meeting.state === 'signed') {
    return { ok: false, reason: 'المحضر معتمد وموقّع — بنوده لا تُعدَّل.', warn: '' };
  }
  if (meeting.number) {
    return {
      ok: true,
      reason: '',
      warn: `المحضر صادر برقم ${meeting.number} — أي تعديل على البنود يستوجب إعادة طباعته وتوقيعه.`,
    };
  }
  return { ok: true, reason: '', warn: '' };
}
