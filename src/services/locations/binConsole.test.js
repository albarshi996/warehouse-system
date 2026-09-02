/**
 * اختبارات لوحة الخانة.
 *
 * جوهرُها ثلاثة: **التوجيهُ بالتصنيف لا بترتيب الحقول** · **المحتوى يُقرأ من
 * الرصيد والطبالي معًا** · **ولا مستندَ يُخترع بلا مرجعٍ يفرضه مخطّطُه**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BIN_MODES,
  binContents,
  binProblem,
  buildDocDraft,
  draftLineFor,
  entryProblems,
  identifyBin,
  linesForScan,
  matchesLine,
  modeOf,
  orderRequirementOf,
  routeScan,
} from './binConsole.js';

const BIN = 'RH-A-R-01-01';
const OTHER = 'RH-A-R-01-02';

const BALANCES = [
  { sku: 'WNW-001', barcode: '6281006521', nameAr: 'زيت', bin: BIN, batch: 'B1', expiry: '2027-06-30', qty: 12, unitCost: 5, warehouse: 'WH001' },
  { sku: 'WNW-001', barcode: '6281006521', nameAr: 'زيت', bin: BIN, batch: 'B2', expiry: '2027-11-30', qty: 8, unitCost: 5, warehouse: 'WH001' },
  { sku: 'WNW-002', barcode: '6281006538', nameAr: 'سكّر', bin: BIN, batch: '', expiry: '', qty: 3, unitCost: 2, warehouse: 'WH001' },
  { sku: 'WNW-003', barcode: '6281006545', nameAr: 'أرزّ', bin: OTHER, batch: '', expiry: '', qty: 99, unitCost: 1, warehouse: 'WH001' },
  // صفٌّ قديم يكتب الموقع في `location` — التوافقُ الرجعيّ لا يُكسر.
  { sku: 'WNW-004', barcode: '6281006552', nameAr: 'ملح', location: BIN, qty: 5, warehouse: 'WH001' },
];

const UNITS = [
  { code: 'LPN-RH-20260901-000001', state: 'STORED', bin: BIN },
  { code: 'LPN-RH-20260901-000002', state: 'STORED', bin: OTHER },
];

test('★★★ التوجيهُ بالتصنيف: الخانةُ تُفتح، والصنفُ يدخلها، والطبليّةُ تُعرض', () => {
  assert.equal(routeScan(BIN).action, 'bin');
  assert.equal(routeScan(BIN).code, BIN);
  assert.equal(routeScan('6281006521', { hasBin: true }).action, 'item');
  assert.equal(routeScan('LPN-RH-20260901-000001', { hasBin: true }).action, 'pallet');
  assert.equal(routeScan('TR-J-L-05-10', { hasBin: true }).action, 'bin', 'وخانةٌ أخرى تُفتح مكانها');
});

test('★★★ وما يقطع شكلُه الشكَّ يُردّ برسالةٍ تقول الصواب لا بكلمة «خطأ»', () => {
  // تصحيح 2026-09-02: الرقمُ الصرفُ **لم يعد** يُردّ — قد يكون ملصقَ رفٍّ من
  // لفّةٍ جاهزة، فيُسأل عنه (اختبارُ «الأصمّ» أدناه). أمّا الطبليّةُ ببادئتها
  // فشكلُها يقطع الشكّ، ولا يُسأل عمّا لا يحتمل سؤالًا.
  const v = routeScan('LPN-RH-20260901-000001', { hasBin: false });
  assert.equal(v.action, 'reject');
  assert.match(v.message, /موقع تخزين/);
  assert.match(v.message, /LPN-RH-20260901-000001/, 'والرسالةُ تذكر ما مُسح فعلًا');
});

test('المسحةُ الفارغة تُطلب ولا تُعدّ عطبًا في التصنيف', () => {
  assert.equal(routeScan('').action, 'reject');
  assert.match(routeScan('   ').message, /امسح باركود الخانة/);
});

test('★★★ محتوى الخانة: الأصنافُ والطبالي معًا — وما ليس فيها لا يظهر', () => {
  const c = binContents(BIN, { balances: BALANCES, units: UNITS });
  assert.equal(c.bin, BIN);
  assert.equal(c.lines.length, 4, 'ثلاثةُ أصنافٍ بأربعة صفوفٍ — ومنها صفٌّ بحقل location القديم');
  assert.equal(c.skuCount, 3, 'أربعةُ صفوفٍ وثلاثةُ أصناف — فصنفٌ واحدٌ بدفعتين');
  assert.equal(c.totalQty, 28, '12 + 8 + 3 + 5');
  assert.equal(c.pallets.length, 1, 'طبليّةٌ واحدةٌ واقفةٌ في هذه الخانة');
  assert.equal(c.pallets[0].code, 'LPN-RH-20260901-000001');
});

test('محتوى خانةٍ فارغةٍ أو كودٍ معطوب يُعاد فارغًا لا مكسورًا', () => {
  const empty = binContents('RH-Z-R-05-10', { balances: BALANCES, units: UNITS });
  assert.deepEqual(empty.lines, []);
  assert.equal(empty.totalQty, 0);
  assert.equal(binContents('', {}).bin, '');
});

test('★★ ثلاثُ حالاتٍ للخانة — والبانيةُ التي لم تُشغَّل لا يُحكم بها', () => {
  assert.equal(binProblem(BIN, [BIN, OTHER]), '');
  assert.match(binProblem('RH-Z-Z-09-09', [BIN]), /غير معرَّفة/);
  assert.equal(binProblem(BIN, []), '', 'بلا مواقعَ معرَّفةٍ لا يُحكم على أحد');
  assert.match(binProblem('', [BIN]), /مطلوب/);
});

test('المطابقةُ تقبل الكودَ والباركود — فالملصقُ قد يحمل أيًّا منهما', () => {
  const line = BALANCES[0];
  assert.equal(matchesLine(line, 'WNW-001'), true);
  assert.equal(matchesLine(line, 'wnw-001'), true);
  assert.equal(matchesLine(line, '6281006521'), true);
  assert.equal(matchesLine(line, '06281006521'), true, 'والصفرُ البادئ يُسقَط — UPC-A هي EAN-13 بصفر');
  assert.equal(matchesLine(line, 'WNW-002'), false);
  assert.equal(matchesLine(line, ''), false);
});

test('★★ صنفٌ بدفعتين يُعيد صفّين — فالخانةُ قد تخلط الدفعات', () => {
  const c = binContents(BIN, { balances: BALANCES, units: UNITS });
  const hits = linesForScan(c, '6281006521');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((l) => l.batch), ['B1', 'B2']);
});

test('★★★ بندُ الجرد: الفارقُ لا يُكتب بل يُحسب — قاعدةُ ADJ نفسُها', () => {
  const line = draftLineFor('count', { bin: BIN, item: BALANCES[0], qty: 10, bookQty: 12 });
  assert.equal(line.bin, BIN);
  assert.equal(line.sku, 'WNW-001');
  assert.equal(line.description, 'زيت', 'المحرّكُ يقرأ الاسمَ من description لا من nameAr');
  assert.equal(line.bookQty, 12);
  assert.equal(line.count1, 10);
  assert.equal(line.variance, undefined, 'الفارقُ يُحسب في المستند لا هنا');
});

test('بندُ السحب يحمل qtyPicked — وبندُ التخزين qty، كما تسمّيهما القاعدة', () => {
  assert.equal(draftLineFor('pick', { bin: BIN, item: BALANCES[0], qty: 4 }).qtyPicked, 4);
  assert.equal(draftLineFor('putaway', { bin: BIN, item: BALANCES[0], qty: 4 }).qty, 4);
  assert.equal(draftLineFor('lookup', { bin: BIN, item: BALANCES[0], qty: 4 }), null, 'الاستعلامُ لا يبني بندًا');
});

test('★★★ سحبٌ يتجاوز ما في الخانة يُردّ قبل أن يحمل العاملُ البضاعة', () => {
  const c = binContents(BIN, { balances: BALANCES, units: UNITS });
  const line = draftLineFor('pick', { bin: BIN, item: BALANCES[0], qty: 25 });
  const problems = entryProblems('pick', { line, contents: c, scanned: '6281006521' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /تتجاوز ما في الخانة \(20\)/, 'المتاحُ مجموعُ الدفعتين');

  const ok = draftLineFor('pick', { bin: BIN, item: BALANCES[0], qty: 20 });
  assert.deepEqual(entryProblems('pick', { line: ok, contents: c, scanned: '6281006521' }), []);
});

test('★★ والجردُ لا يُحرَس بالرصيد — العدُّ الفعليُّ قد يتجاوز الدفتريّ وهذا معناه', () => {
  const c = binContents(BIN, { balances: BALANCES, units: UNITS });
  const line = draftLineFor('count', { bin: BIN, item: BALANCES[0], qty: 999, bookQty: 12 });
  assert.deepEqual(entryProblems('count', { line, contents: c, scanned: '6281006521' }), []);
});

test('كمّيّةٌ صفرٌ أو بلا خانةٍ تُردّ في كلّ وضعٍ كاتب', () => {
  for (const mode of ['count', 'pick', 'putaway']) {
    const zero = draftLineFor(mode, { bin: BIN, item: BALANCES[0], qty: 0, bookQty: 1 });
    assert.ok(entryProblems(mode, { line: zero }).some((p) => /أكبر من صفر/.test(p)), mode);
    const noBin = draftLineFor(mode, { bin: '', item: BALANCES[0], qty: 1, bookQty: 1 });
    assert.ok(entryProblems(mode, { line: noBin }).some((p) => /لا خانةَ مفتوحة/.test(p)), mode);
  }
  assert.match(entryProblems('lookup', {})[0], /لا يكتب شيئًا/);
});

test('★★★ محضرُ الجرد يقول أين وقع: zone هي الخانةُ نفسُها', () => {
  const lines = [draftLineFor('count', { bin: BIN, item: BALANCES[0], qty: 10, bookQty: 12 })];
  const draft = buildDocDraft('count', { bin: BIN, warehouse: 'WH001', lines, today: '2026-09-02' });
  assert.equal(draft.type, 'CC');
  assert.equal(draft.header.zone, BIN);
  assert.equal(draft.header.warehouse, 'WH001');
  assert.equal(draft.header.countDate, '2026-09-02');
  assert.equal(draft.lines.length, 1);
});

test('★★ وقائمةُ السحب تحمل وجهتَها — وهي إلزامُ مخطّطها', () => {
  const lines = [draftLineFor('pick', { bin: BIN, item: BALANCES[0], qty: 4 })];
  const draft = buildDocDraft('pick', { bin: BIN, warehouse: 'WH001', lines, destination: 'ساحة التجهيز', today: '2026-09-02' });
  assert.equal(draft.type, 'PICK');
  assert.equal(draft.header.destination, 'ساحة التجهيز');
  assert.equal(draft.header.sourceBin, BIN);
});

test('★★★ ولا مستندَ يُخترع بلا مرجعٍ يفرضه مخطّطُه', () => {
  // أمرُ التخزين إلزامُه `grnRef` مرجعًا إلى مذكّرة استلامٍ قائمة. فبناؤه من
  // الرفّ يُنتج مستندًا يرفضه مخطّطُه عند الإرسال — والعاملُ يكون قد خزّن.
  assert.equal(buildDocDraft('putaway', { bin: BIN, warehouse: 'WH001', lines: [{}] }), null);
  assert.match(orderRequirementOf('putaway'), /GRN/);
  assert.match(orderRequirementOf('putaway'), /اخترْ أمر تخزينٍ مفتوحًا/);
  assert.equal(orderRequirementOf('count'), '', 'والجردُ يُنشأ من الرفّ فلا شرطَ عليه');
  assert.equal(buildDocDraft('lookup', { bin: BIN, lines: [{}] }), null);
  assert.equal(buildDocDraft('count', { bin: BIN, lines: [] }), null, 'ولا مستندَ بلا بند');
});

test('الأوضاعُ أربعةٌ، والمجهولُ يعود استعلامًا — أسلمُ الأربعة', () => {
  assert.deepEqual(BIN_MODES.map((m) => m.id), ['lookup', 'count', 'pick', 'putaway']);
  assert.equal(modeOf('لا وجود له').id, 'lookup');
  assert.equal(BIN_MODES.filter((m) => m.docType).length, 3);
});

/**
 * ═══ حارسُ الوصْل — منطقٌ سليمٌ في شاشةٍ توصله خطأً يبقى عطبًا ═══
 *
 * يقرأ الشاشةَ نصًّا (عرفُ `lpnWiring.test.js`): لا يختبر دالّةً بل يختبر
 * أنّ الشاشة تستدعيها بالقيمة الصحيحة.
 */
const SCREEN = readFileSync(new URL('../../components/brandzo-erp/locations/BinConsole.jsx', import.meta.url), 'utf8');

test('★★★ ترويسةُ المستند تحمل كودَ المستودع لا بادئةَ الملصق', () => {
  // كُشف بالفحص الحيّ 2026-09-02: كانت الترويسة تحمل «RH». ومعرّفُ الرصيد
  // `صنف__مستودع__دفعة` — فقيدٌ على «RH» يُنشئ رصيدًا موازيًا لنفس البضاعة
  // المقيَّدة على «WH001»: عجزٌ في مكانٍ وفائضٌ في آخر، بلا صوت.
  const call = SCREEN.slice(SCREEN.indexOf('const draft = buildDocDraft('), SCREEN.indexOf('lines: entries'));
  assert.ok(call.includes('warehouse: whDoc?.code'), 'الترويسةُ تُبنى بكود المستودع');
  assert.ok(!call.includes('warehouse: binPrefixOf('), 'ولا تُبنى بالبادئة');
});

test('★★ والشاشةُ تسأل عن الطبالي بالهويّتين — وإلّا عُرضت خانةٌ «بلا طبالي» وفيها طبالي', () => {
  const call = SCREEN.slice(SCREEN.indexOf('listUnitsAt('), SCREEN.indexOf('listUnitsAt(') + 400);
  assert.ok(SCREEN.includes('[whDoc.code, binPrefixOf(whDoc)]'), 'كودُ البوّابة وبادئةُ الملصق معًا');
  assert.ok(call.includes('bin: code'), 'ومقيَّدةٌ بالخانة المفتوحة');
});

test('★★★ رسالةُ الردّ تُعرض قبل فتح أيّ خانة — وإلّا وقف العاملُ بلا ردّ', () => {
  // كُشف بالفحص الحيّ 2026-09-02: كانت الرسالة داخل القسم المشروط بخانةٍ
  // مفتوحة، **وأشيعُ ردٍّ يقع قبل ذلك**: من يمسح صنفًا قبل الخانة. فتُبنى
  // الرسالةُ ولا تُعرض — وهو أسوأ من رسالةٍ رديئة.
  const gate = SCREEN.indexOf('{bin && !pending && !problem && (');
  const shown = SCREEN.indexOf('{msg.text && (');
  assert.ok(shown > 0, 'الرسالةُ معروضة');
  assert.ok(shown < gate, 'ومعروضةٌ قبل حارس الخانة المفتوحة لا داخله');
});

test('★★ ولا كتابةَ رصيدٍ من الشاشة — المسوّدةُ وحدها', () => {
  assert.ok(SCREEN.includes('createDraft('), 'تُنشئ مسوّدةً');
  for (const forbidden of ['saveBalancesBulk', 'writeBatch', 'postMoves', 'transitionDocument']) {
    assert.ok(!SCREEN.includes(forbidden), `الشاشةُ لا تستدعي ${forbidden} — الرصيدُ يتحرّك في محرّك المستندات`);
  }
});

/**
 * ═══ المرحلة الأولى: اقرأ · عرّف · ثمّ حدّد (طلب المالك 2026-09-02) ═══
 */
const WAREHOUSES = [
  {
    code: 'WH001',
    name: 'الرحبة',
    binPrefix: 'RH',
    segmentLabels: { zone: 'الممرّ', rack: 'الجهة', bay: 'الرفّ', level: 'الخانة' },
    valueLabels: { rack: { L: 'يسار', R: 'يمين' } },
  },
];

test('★★★ التعريفُ يقول للعامل ما مسح — بالعربيّة وبملخّصِ ما فيها', () => {
  const id = identifyBin(BIN, { warehouses: WAREHOUSES, knownCodes: [BIN], balances: BALANCES, units: UNITS });
  assert.equal(id.valid, true);
  assert.equal(id.code, BIN);
  assert.equal(id.warehouse.name, 'الرحبة');
  assert.equal(id.headline, 'الممرّ A · الجهة يمين · الرفّ 01 · الخانة 01');
  assert.deepEqual(id.segments.map((s) => s.label), ['الممرّ', 'الجهة', 'الرفّ', 'الخانة']);
  assert.equal(id.summary.skuCount, 3);
  assert.equal(id.summary.totalQty, 28);
  assert.equal(id.summary.palletCount, 1);
  assert.equal(id.summary.empty, false);
  assert.equal(id.problem, '');
  assert.equal(id.warning, '');
});

test('★★ وخانةٌ فارغةٌ تُقال فارغةً قبل أن يدخل', () => {
  const id = identifyBin('RH-Z-R-05-10', { warehouses: WAREHOUSES, knownCodes: ['RH-Z-R-05-10'], balances: BALANCES, units: UNITS });
  assert.equal(id.summary.empty, true);
  assert.equal(id.summary.totalQty, 0);
  assert.equal(id.problem, '');
});

test('★★★ مانعٌ ومنبِّهٌ لا شيءٌ واحد — ونقصُ الإعداد لا يوقف عاملًا', () => {
  // كودٌ معطوب ⟶ مانع.
  const bad = identifyBin('ليس كودًا', { warehouses: WAREHOUSES });
  assert.equal(bad.valid, false);
  assert.match(bad.problem, /ليس كودَ موقعٍ صالح/);

  // خانةٌ لا وجودَ لها في سيّد المواقع ⟶ مانع.
  const unknown = identifyBin('RH-Z-Z-09-09', { warehouses: WAREHOUSES, knownCodes: [BIN] });
  assert.match(unknown.problem, /غير معرَّفة/);

  // ★ ومستودعٌ لم يُربط بالبادئة ⟶ **منبِّهٌ لا مانع**: نقصُ إعدادٍ لا خطأُ
  //   عامل، ومن أوقفه عليه أوقف عملًا صحيحًا بحجّة صفحةٍ لم تُكمَل.
  const unlinked = identifyBin(BIN, { warehouses: [], knownCodes: [BIN] });
  assert.equal(unlinked.problem, '', 'لا يُمنع');
  assert.match(unlinked.warning, /لم تُربط بمستودع/);
  assert.equal(unlinked.valid, true);
});

test('★★ والتعريفُ بلا سيّدِ مواقعَ مأهولٍ لا يحكم على أحد', () => {
  const id = identifyBin(BIN, { warehouses: WAREHOUSES, knownCodes: [], balances: BALANCES });
  assert.equal(id.problem, '', 'البانيةُ لم تُشغَّل بعد — فلا حكمَ بالجهل');
  assert.equal(id.known, true);
});

test('★★★ المسحةُ تعرض ولا تفتح — والفتحُ بضغطةِ العامل', () => {
  // طلبُ المالك 2026-09-02: «قراءةٌ وتعريفٌ ثمّ تحديد». والمسحُ فعلٌ أعمى —
  // فمن يفتح الخانةَ فورًا يجعل العاملَ يعمل في رفٍّ لم يتأكّد أنّه رفُّه،
  // ولا يكتشف الخطأ إلّا بعد أن يُثبت كمّيّاتٍ في المكان الغلط.
  assert.ok(SCREEN.includes("if (v.action === 'bin') { presentBin(v.code); return; }"), 'المسحةُ تعرض');
  assert.ok(!SCREEN.includes("if (v.action === 'bin') { openBin(v.code); return; }"), 'ولا تفتح');
  assert.ok(SCREEN.includes('const confirmBin = useCallback'), 'والتحديدُ فعلٌ مستقلّ');
  assert.ok(SCREEN.includes('حدّد هذه الخانة'), 'وله زرُّه');

  // والمرحلةُ الثانيةُ محجوبةٌ ما دام هناك معروضٌ لم يُحدَّد.
  assert.ok(SCREEN.includes('{bin && !pending && !problem && ('), 'ولا عملَ قبل التحديد');
});

test('★★ والوضعُ الافتراضيُّ إثباتُ ما في الخانة — أكثرُ ما يُفعل عند الرفّ', () => {
  assert.ok(SCREEN.includes("useState('count')"), 'الجردُ افتراضًا لا الاستعلام');
});

test('★★★ المسحةُ تُثبَّت فورًا ولا تُنتظر — والانتظارُ يعلّق الشاشةَ بلا شبكة', () => {
  // طلبُ المالك 2026-09-02: «عند المسح يُحفظ المسحُ باسم الممرّ الذي نختاره».
  // وكانت البنودُ تُجمع في الشاشة وتُحفظ بضغطةٍ في الآخر — فمن أُغلق هاتفُه
  // ضاع عملُه كلُّه.
  assert.ok(SCREEN.includes('appendScan(session.id, scanPayload('), 'كلُّ مسحةٍ قيدٌ في السجلّ');

  // ★ ولا await: وعدُ setDoc لا يُحلّ بلا شبكة (درسُ ‹CAP› الحرفيّ).
  assert.ok(!SCREEN.includes('await appendScan'), 'ولا تُنتظر');
  const call = SCREEN.slice(SCREEN.indexOf('appendScan(session.id'), SCREEN.indexOf('appendScan(session.id') + 400);
  assert.ok(call.includes('.catch('), 'والفشلُ الحقيقيُّ يُعلَن ولا يُبتلع');
});

test('★★ والجلسةُ ممرٌّ لا خانة — وتُستأنف المفتوحةُ ولا تُفتح ثانية', () => {
  assert.ok(SCREEN.includes('sessionScopeFor(code)'), 'النطاقُ من الخانة');
  assert.ok(SCREEN.includes('findSessionFor(open, code)'), 'وتُستأنف المفتوحة');
  assert.ok(SCREEN.includes('type: BIN_SESSION_TYPE'), 'ولا تُخلط بجرد الشاشة العامّ');
});

test('★★★ والمحضرُ يُبنى من القيود المحفوظة لا من الشاشة', () => {
  const fn = SCREEN.slice(SCREEN.indexOf('async function finishSession'), SCREEN.indexOf('async function saveDraft'));
  assert.ok(fn.includes('sessionDraft(session, scans'), 'المصدرُ هو `scans` الحيّة');
  assert.ok(!fn.includes('entries'), 'لا قائمةُ الشاشة');
  // ★ والإقفالُ **بعد** إنشاء المستند: من أقفل أوّلًا رفض الخادمُ ما بقي في
  //   طابور الهاتف (درسُ ‹CAP›: الإقفالُ يبتلع الطابور).
  assert.ok(fn.indexOf('createDraft(') < fn.indexOf('closeOperation('), 'والإقفالُ بعد الإنشاء لا قبله');
});

/**
 * ═══ ويزارد التكويد ‹LOC-708› — «الباركودُ يُربط بعنوانه، ولا يُفترض» ═══
 */
const WIZARD = readFileSync(new URL('../../components/brandzo-erp/locations/BinCodingWizard.jsx', import.meta.url), 'utf8');

test('★★★ المسحةُ تبحث عن ربطٍ قبل كلّ شيء — ولا تفترض عنوان الباركود', () => {
  assert.ok(SCREEN.includes('findByBarcode(locations, raw)'), 'الربطُ يُبحث أوّلًا');
  assert.ok(SCREEN.includes('setCoding(normalizeBinBarcode(raw))'), 'وغيرُ المربوط يُفتح له ويزارد');
});

test('★★★ وباركودٌ أصمُّ غيرُ مربوطٍ يُسأل عنه ولا يُحكم بأنّه صنف', () => {
  // كُشف بالفحص الحيّ 2026-09-02: الرقمُ الصرفُ كان يُصنَّف صنفًا فيُردّ —
  // فيستحيل تكويدُ مخزنٍ ملصقاتُه أرقامٌ من لفّةٍ جاهزة.
  const v = routeScan('8059692043057', { hasBin: false, bound: false });
  assert.equal(v.action, 'ambiguous');
  assert.match(v.message, /غير مربوطٍ بموقع/);
  assert.ok(SCREEN.includes("v.action === 'ambiguous'"), 'والشاشةُ تعرض السؤال');
  assert.ok(SCREEN.includes('هذا ملصقُ موقع — كوّدْه'), 'بزرَّيه');

  // ومربوطٌ ⟶ موقعٌ مهما كان شكلُه.
  assert.equal(routeScan('8059692043057', { hasBin: false, bound: true }).action, 'bin');
  // وداخلَ خانةٍ مفتوحةٍ يبقى الرقمُ صنفًا.
  assert.equal(routeScan('8059692043057', { hasBin: true, bound: false }).action, 'item');
});

test('★★ الويزاردُ خطوةٌ واحدةٌ في الشاشة لا أربعةُ حقولٍ دفعة', () => {
  assert.ok(WIZARD.includes('خطوة {num(at + 1)} من {num(steps.length)}'), 'ورقمُ الخطوة معروض');
  assert.ok(WIZARD.includes('steps[at].options.map('), 'وخياراتُ الخطوة الحاليّة وحدَها');
  assert.ok(WIZARD.includes('onBack?.(i)'), 'والرجوعُ إلى أيّ خطوةٍ سبقت');
});

test('★★★ والربطُ يمرّ بكاتبٍ مستقلٍّ لا بالنموذج — وإلّا مسحه التوليد', () => {
  assert.ok(SCREEN.includes('await bindLocationBarcode(code, coding, me)'), 'الربطُ بكاتبه');
  assert.ok(SCREEN.includes('if (!manual) await bindLocationBarcode'), 'والإدخالُ اليدويّ يفتح ولا يربط');
});
