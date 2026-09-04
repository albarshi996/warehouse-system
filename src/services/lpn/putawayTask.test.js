/**
 * اختبارات مهمّة التخزين — الجسر بين مقترحٍ يعرفه النظام وعاملٍ يقف بالطبلية.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUTAWAY_STATES,
  binScanVerdict,
  completePutaway,
  offSuggestionRate,
  openPutawayTask,
  taskOpenProblem,
} from './putawayTask.js';

const UNIT = {
  code: 'LPN-MAIN-20260826-000145',
  state: 'LABEL_PRINTED',
  flags: [],
  warehouse: 'MAIN',
  bin: '',
  lines: [{ sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'carton', qty: 5, baseQty: 60 }],
};

// سيّد المواقع يحمل  حقلًا صريحًا — لا يُشتقّ من الكود.
const LOCATIONS = [
  { code: 'MAIN-A01-R01-B01', warehouse: 'MAIN', status: 'active' },
  { code: 'MAIN-A01-R01-B02', warehouse: 'MAIN', status: 'active' },
  { code: 'MAIN-A01-R01-B09', warehouse: 'MAIN', status: 'full' },
  { code: 'MAIN-A02-R01-B01', warehouse: 'MAIN', status: 'stopped' },
  { code: 'TRP-A01-R01-B01', warehouse: 'TRP', status: 'active' },
];
const CTX = { locations: LOCATIONS, balances: [], actor: 'أحمد', at: '2026-08-26T11:00:00Z' };

test('★★ المهمّة تُنشأ للمعتمدة المطبوع ملصقُها وتحمل المقترح للميدان', () => {
  const r = openPutawayTask(UNIT, CTX);
  assert.equal(r.problem, undefined);
  assert.equal(r.task.state, 'OPEN');
  assert.equal(r.task.lpn, UNIT.code);
  assert.ok(Array.isArray(r.task.suggestions), 'الاقتراح يصل الميدان — لا يبقى في النظام');
});

test('🔒 لا تخزينَ قبل الاعتماد والملصق — حمولةٌ بلا ملصقٍ تدخل الرفّ لا تُقرأ بعدها', () => {
  assert.match(taskOpenProblem({ ...UNIT, state: 'SCANNING' }), /بعد اعتمادها وطباعة ملصقها/);
  assert.match(taskOpenProblem({ ...UNIT, state: 'PENDING_GOVERNANCE' }), /بعد اعتمادها/);
  assert.equal(taskOpenProblem({ ...UNIT, state: 'PENDING_PUTAWAY' }), '');
  assert.match(taskOpenProblem({}), /لا طبلية/);
});

test('★★ الموقع غير المقروء يُردّ — «لا تخزينَ في موقعٍ غير مقروء فعليًّا»', () => {
  const v = binScanVerdict(UNIT, '', CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /امسح باركود الرفّ/);
});

test('★★★ رفٌّ في مستودعٍ آخر يُردّ منعًا — النقل بين المستودعين بأمرٍ لا بتخزين', () => {
  const v = binScanVerdict(UNIT, 'TRP-A01-R01-B01', CTX);
  assert.ok(!v.ok);
  assert.ok(!v.canOverride, 'وهذا منعٌ حقيقيّ لا يُفتح بسبب');
  assert.match(v.message, /مستودع «MAIN» والرفّ «TRP»/, 'تسمّي المستودعين');
  assert.match(v.message, /القاعدة ٣/);
});

test('★★★ الرفّ الممتلئ أو الموقوف يمرّ بسببٍ مقيَّد — العامل يختار (درس LOC)', () => {
  const full = binScanVerdict(UNIT, 'MAIN-A01-R01-B09', CTX);
  assert.ok(!full.ok);
  assert.ok(full.canOverride, 'بابٌ بسببٍ لا جدار');
  assert.ok(full.needsReason);
  assert.match(full.message, /ممتلئ/);

  const stopped = binScanVerdict(UNIT, 'MAIN-A02-R01-B01', CTX);
  assert.ok(!stopped.ok);
  assert.ok(stopped.canOverride);
  assert.match(stopped.message, /متوقّف/);
});

test('الرفّ غير المسجَّل يمرّ بسبب — والمسجَّل الفعّال يمرّ بلا شيء', () => {
  const unknown = binScanVerdict(UNIT, 'MAIN-Z09-R09-B09', CTX);
  assert.ok(!unknown.ok);
  assert.ok(unknown.canOverride);
  assert.match(unknown.message, /غير مسجَّل في سيّد المواقع/);

  assert.ok(binScanVerdict(UNIT, 'MAIN-A01-R01-B01', CTX).ok);
  assert.ok(binScanVerdict(UNIT, 'main a01 r01 b01', CTX).ok, 'التطبيع قبل المقارنة');
});

test('★ الطبلية الموسومة تُخزَّن ويُعلَن وسمُها — لا تبقى في الممرّ', () => {
  const damaged = { ...UNIT, flags: ['DAMAGED'] };
  const v = binScanVerdict(damaged, 'MAIN-A01-R01-B01', CTX);
  assert.ok(v.ok, 'التخزين لا يُمنع — حمولةٌ تالفةٌ في ممرٍّ أسوأ');
  assert.match(v.message, /موقع الحجر أو الفحص/, 'لكنّ الرسالة توجّه لرفّ الحجر');
});

test('★★ الإتمام يسجّل الموقعين والفاعل والوقت والمهمّة — حقول خطة ٧ الخمسة', () => {
  const task = openPutawayTask(UNIT, CTX).task;
  const r = completePutaway(task, UNIT, 'MAIN-A01-R01-B01', CTX);
  assert.equal(r.problem, undefined);
  assert.equal(r.task.state, 'DONE');
  assert.equal(r.task.toBin, 'MAIN-A01-R01-B01');
  assert.equal(r.move.fromBin, '', 'من لا مكان — أوّل تخزين');
  assert.equal(r.move.toBin, 'MAIN-A01-R01-B01');
  assert.equal(r.move.actor, 'أحمد');
  assert.equal(r.move.at, '2026-08-26T11:00:00Z');
});

test('🔒 مهمّةُ طبليةٍ لا تُنفَّذ بطبليةٍ أخرى — ولا تُنفَّذ مرّتين', () => {
  const task = openPutawayTask(UNIT, CTX).task;
  const other = { ...UNIT, code: 'LPN-MAIN-20260826-000999' };
  assert.match(completePutaway(task, other, 'MAIN-A01-R01-B01', CTX).problem, /امسح الطبلية الصحيحة/);

  const done = completePutaway(task, UNIT, 'MAIN-A01-R01-B01', CTX).task;
  assert.match(completePutaway(done, UNIT, 'MAIN-A01-R01-B01', CTX).problem, /لا تُنفَّذ مرّتين/);
  assert.equal(PUTAWAY_STATES.DONE, 'منفَّذة');
});

test('★★ التخزين في الممتلئ بلا سببٍ يُردّ — وبسببٍ يمرّ ويُقيَّد', () => {
  const task = openPutawayTask(UNIT, CTX).task;
  const blocked = completePutaway(task, UNIT, 'MAIN-A01-R01-B09', CTX);
  assert.match(blocked.problem, /سببًا مكتوبًا يُقيَّد باسمك/);

  const passed = completePutaway(task, UNIT, 'MAIN-A01-R01-B09', { ...CTX, overrideNote: 'الرفّ فرغ اليوم ولم يُحدَّث في السيّد' });
  assert.equal(passed.problem, undefined);
  assert.match(passed.move.overrideNote, /لم يُحدَّث في السيّد/, 'والسبب يبقى على الحركة');
});

test('★ نسبة الخروج عن المقترح — لا لتُلام بل ليُراجَع المقترح', () => {
  const r = offSuggestionRate([
    { toBin: 'A', offSuggestion: true },
    { toBin: 'B', offSuggestion: false },
    { toBin: 'C', offSuggestion: true },
    { toBin: 'D', offSuggestion: false },
  ]);
  assert.deepEqual(r, { total: 4, off: 2, rate: 50 });
  assert.deepEqual(offSuggestionRate([]), { total: 0, off: 0, rate: 0 });
});

test('★ المرفوض يصل الميدان بسببه — عاملٌ يرى لماذا رُفض رفٌّ يختار البديل بعلم', () => {
  const task = openPutawayTask(UNIT, CTX).task;
  const full = task.rejectedBins.find((r) => r.code === 'MAIN-A01-R01-B09');
  assert.ok(full, 'الممتلئ يظهر في المرفوض لا يختفي');
  assert.match(full.reason, /ممتلئ/, 'وبسببه مكتوبًا');
  assert.ok(task.suggestions.length > 0, 'والمقبول يُقترح مرتّبًا');
});

/* ═══════════════════════════════════════════════════════════════════════
 * فهرسُ الطبالي يبلغ الحكم — السلكُ الذي كان مقطوعًا
 *
 * `canReceive` تحمل فرعَ رفضٍ لسقف الطبالي منذ ‹JR-601›، و`occupancyOf`
 * تحمل وسيطَ الفهرس. وكان **لا مستدعيَ واحدٌ يمرّره**: فالمشغولُ `null`
 * أبدًا، وفرعُ الرفض يستحيل بلوغُه في الإنتاج — رفٌّ سقفُه طبليّتان يقبل
 * الخمسين. والاختباراتُ القائمة لم تمسكه لأنّها تبني `Map` بيدها وتناديه
 * مباشرةً، فتُثبت أنّ **الدالّة** تعمل ولا تسأل هل يصلها أحد.
 *
 * فهذان الحارسان يمرّان **بالمستدعي الحقيقيّ** بوحداتِ مناولةٍ بشكلها
 * المكتوب في `createHandlingUnit`: مسطّحةً (code · state · bin · lines)
 * لا تحت رأس، وحالتُها من `ON_FLOOR_STATES` وإلّا لم تُعدّ واقفةً أصلًا.
 * ═══════════════════════════════════════════════════════════════════════ */

/** رفٌّ سقفُه طبليّتان — والسعةُ بالقطعة واسعةٌ عمدًا كي يكون المانعُ الطبالي وحدَها. */
const CAPPED_BIN = 'MAIN-A01-R01-B01';
const CAPPED_LOCATIONS = [
  { code: CAPPED_BIN, warehouse: 'MAIN', status: 'active', storageType: 'ambient', capacity: { qty: 1000, pallets: 2 } },
  { code: 'MAIN-A01-R01-B02', warehouse: 'MAIN', status: 'active', storageType: 'ambient', capacity: { qty: 1000, pallets: 2 } },
];

/** طبليّتان واقفتان في الرفّ الأوّل — بشكل مستند `handling_units` نفسِه. */
const ON_FLOOR = [
  {
    code: 'LPN-MAIN-20260826-000101', state: 'STORED', flags: [], warehouse: 'MAIN', bin: CAPPED_BIN,
    lines: [{ sku: 'WNW-009', batch: 'B2401', uom: 'carton', qty: 10, baseQty: 120 }],
    contentRev: 1, parentCodes: [], sourceDoc: { type: 'GRN', number: 'GRN-1', id: 'g1' }, route: '', branch: '',
  },
  {
    code: 'LPN-MAIN-20260826-000102', state: 'RESERVED', flags: [], warehouse: 'MAIN', bin: CAPPED_BIN,
    lines: [{ sku: 'WNW-009', batch: 'B2401', uom: 'carton', qty: 10, baseQty: 120 }],
    contentRev: 1, parentCodes: [], sourceDoc: { type: 'GRN', number: 'GRN-1', id: 'g1' }, route: '', branch: '',
  },
];

const WIRED = { locations: CAPPED_LOCATIONS, balances: [], units: ON_FLOOR, actor: 'أحمد', at: '2026-08-26T11:00:00Z' };

test('★★★ رفٌّ بلغ سقفَ طبالِيه يُرفض بسببه المكتوب — من `openPutawayTask` لا من نداءٍ مباشر', () => {
  const r = openPutawayTask(UNIT, WIRED);
  assert.equal(r.problem, undefined);

  const rejected = r.task.rejectedBins.find((x) => x.code === CAPPED_BIN);
  assert.ok(
    rejected,
    'الرفُّ فيه طبليّتان وسقفُه طبليّتان ومرّ مرشَّحًا — فهرسُ الطبالي لم يبلغ الحكم، ' +
      'وفرعُ الرفض في locationsModel يستحيل بلوغُه في الإنتاج'
  );
  assert.match(rejected.reason, /بلغ سعته من الطبالي \(2\)/, 'ولكلّ رفضٍ سببُه المكتوب لا كلمةُ «مرفوض»');

  // والرفُّ الخالي يبقى مرشَّحًا: الفهرسُ يمنع الممتلئ ولا يُغلق المستودع.
  assert.deepEqual(r.task.suggestions.map((s) => s.code), ['MAIN-A01-R01-B02']);
  assert.equal(r.task.suggestedBin, 'MAIN-A01-R01-B02');
});

test('★★★ ومسحُ الرفّ الممتلئ من الطبالي يطلب سببًا مقيَّدًا — العاملُ يمرّ ولا يُمنع', () => {
  const v = binScanVerdict(UNIT, CAPPED_BIN, WIRED);
  assert.equal(v.ok, false, 'الحكمُ عند المسح يقرأ الفهرسَ كما يقرؤه الاقتراح — وإلّا افترقا');
  assert.ok(v.canOverride, 'بابٌ بسببٍ لا جدار (درس LOC)');
  assert.match(v.message, /بلغ سعته من الطبالي \(2\)/);

  const task = openPutawayTask(UNIT, WIRED).task;
  const blocked = completePutaway(task, UNIT, CAPPED_BIN, WIRED);
  assert.match(blocked.problem, /سببًا مكتوبًا يُقيَّد باسمك/);
});

test('🔒 وغيابُ الوحدات يعني «لا أعرف» فيمرّ — لا «صفر» فيمنع', () => {
  // مستدعٍ لم يجلب وحداتِ المناولة يحصل على حكم اليوم حرفًا: لا يُحسب
  // امتلاءٌ من جهل، ولا يُغلق رفٌّ لأنّ شاشةً لم تُوصَل بعد.
  const blind = openPutawayTask(UNIT, { ...WIRED, units: undefined });
  assert.deepEqual(blind.task.rejectedBins, [], 'بلا فهرسٍ لا رفضَ بالطبالي');
  assert.equal(blind.task.suggestions.length, 2);

  // وطبليّةٌ واحدةٌ تحت السقف لا تمنع الثانية.
  const room = openPutawayTask(UNIT, { ...WIRED, units: [ON_FLOOR[0]] });
  assert.deepEqual(room.task.rejectedBins, []);
});
