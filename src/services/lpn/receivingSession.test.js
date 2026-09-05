/**
 * اختبارات جلسة الاستلام — «كم بقي مفتوحًا؟» سؤالُ الواقف عند الشاحنة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { getSchema } from '../documents/schemas/index.js';
import { allFields, emptyDocument } from '../documents/schemaUtils.js';
import { documentLineProgress } from '../documents/documentLineProgress.js';

import {
  SESSION_STATES,
  abandonSession,
  applyAccepted,
  attachPallet,
  closeSession,
  findSessionLine,
  openOrderCard,
  openSession,
  remainingOf,
  sessionCloseProblem,
  sessionLines,
  sessionOpenProblem,
  sessionTotals,
} from './receivingSession.js';

const PO = {
  id: 'po-1',
  type: 'PO',
  number: 'PO-2026-0015',
  state: 'approved',
  supplier: 'شركة نوفا',
  warehouse: 'main',
  issueDate: '2026-08-20',
  requiredDelivery: '2026-08-27',
  lines: [
    { sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', qty: 100 },
    { sku: 'WNW-002', barcode: '6222', description: 'ماء صغير', uom: 'CTN', qty: 50 },
  ],
};

/** تقدّمٌ مصنوعٌ يدويًّا — الجلسة تستهلكه ولا تحسبه. */
const progressOf = (open1, open2) => ({
  documentId: PO.id,
  documentType: 'PO',
  lines: [
    { lineId: 'L1', lineNumber: 1, sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', requested: 100, open: open1 },
    { lineId: 'L2', lineNumber: 2, sku: 'WNW-002', barcode: '6222', description: 'ماء صغير', uom: 'CTN', requested: 50, open: open2 },
  ],
  totals: { requested: 150, executed: 150 - open1 - open2, open: open1 + open2 },
});

const CTX = { actor: 'محمد', at: '2026-08-26T08:00:00Z', warehouse: 'MAIN' };

/**
 * ★★★ مستندٌ **بالشكل الذي يكتبه الكاتبُ فعلًا** — لا بالشكل المريح للاختبار.
 *
 * `documentsService.createDraft` و`createNextInChain` يكتبان كلاهما هكذا:
 * الجذرُ يحمل `type` و`number` و`state` و`lines`، **وكلُّ حقول الرأس تحت
 * `header`** — ورأسُه من `emptyHeader(schema)` فيأتي فيه المفتاحُ موجودًا
 * وقيمتُه نصٌّ فارغ. ولهذا يُبنى الرأسُ هنا من المخطّط نفسه لا بيدٍ حرّة:
 * فلو تغيّر المخطّطُ غدًا تغيّرت العيّنةُ معه ولم تكذب.
 *
 * ⚠️ والفارغُ المكتوبُ (`''`) مزلقٌ بعينه: قارئٌ يكتفي بـ`?? ` يقع عليه
 * فيظنّه قيمةً ولا يحتاط.
 */
function writtenDocument(type, { number, state = 'approved', header, lines }) {
  const schema = getSchema(type);
  const blank = emptyDocument(schema, { rows: lines.length });
  return {
    id: `${type.toLowerCase()}-written`,
    type,
    stage: schema.stage ?? null,
    number,
    state,
    header: { ...blank.header, ...header },
    lines: lines.map((line, index) => ({ ...blank.lines[index], ...line })),
    links: {},
  };
}

/** أمرُ شراءٍ حقيقيٌّ — رأسُه تحت `header` كما يكتبه المحرّك. */
const WRITTEN_PO = writtenDocument('PO', {
  number: 'PO-2026-0015',
  header: {
    supplier: 'شركة نوفا',
    warehouse: 'MAIN',
    issueDate: '2026-08-20',
    requiredDelivery: '2026-08-27',
  },
  lines: [
    { sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', qty: 100 },
    { sku: 'WNW-002', barcode: '6222', description: 'ماء صغير', uom: 'CTN', qty: 50 },
  ],
});

/** أمرُ نقلٍ حقيقيّ — ومستودعُه `toWarehouse` لا `warehouse` (مخطّط TR). */
// ★★★ `TRN` لا `TR`: مستندُ النقل هو ما يرافق الحمولة، وعليه يقع الاستلام.
// وطلبُ النقل `TR` طلبٌ لم يُشحن — صُحّح 2026-09-04.
const WRITTEN_TRN = writtenDocument('TRN', {
  number: 'TRN-2026-0004',
  header: {
    fromWarehouse: 'TRP',
    toWarehouse: 'MAIN',
    requestDate: '2026-08-21',
    requiredDate: '2026-08-25',
  },
  lines: [{ sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', qty: 40 }],
});

test('★★ الجلسة تُفتح على أمرٍ معتمدٍ له رصيدٌ مفتوح — وتحمل الرصيد للميدان', () => {
  const r = openSession(PO, progressOf(100, 50), CTX);
  assert.equal(r.problem, undefined);
  assert.equal(r.session.state, 'OPEN');
  assert.equal(r.session.order.number, 'PO-2026-0015');
  assert.equal(r.session.warehouse, 'MAIN');
  assert.equal(r.session.lines.length, 2);
  assert.equal(r.session.lines[0].open, 100);
  assert.equal(r.session.lines[0].received, 0, 'المقروء يبدأ صفرًا — والمستلَم سابقًا داخلٌ في المفتوح');
});

test('★★ الرصيد المفتوح من تقدّم البنود القائم — والاستلام الجزئيّ السابق محسوبٌ فيه', () => {
  // استُلم ٤٠ من المئة سابقًا ⇒ المفتوح ٦٠. الجلسة لا تحسب هذا بنفسها.
  const lines = sessionLines(PO, progressOf(60, 50));
  assert.equal(lines[0].ordered, 100, 'المطلوب الأصليّ يظهر');
  assert.equal(lines[0].open, 60, 'والمفتوح ما بقي — لا عمودَ موازٍ');
});

test('لا استلام دون مستندٍ معتمد — والرسالة تسمّي العلّة والقاعدة', () => {
  assert.match(sessionOpenProblem(null, progressOf(100, 50)), /لا مستند/);
  assert.match(sessionOpenProblem({ ...PO, type: 'SO' }, progressOf(100, 50)), /أمر شراءٍ «PO» أو مستند نقلٍ «TRN»/);
  // ★★★ و«TR» يُردّ بدلالةٍ لا بمنعٍ صامت: طلبٌ لم يُشحن، والحمولةُ تُستلم على TRN.
  assert.match(sessionOpenProblem({ ...PO, type: 'TR' }, progressOf(100, 50)), /لم يُشحن بعد/);
  assert.match(sessionOpenProblem({ ...PO, state: 'draft' }, progressOf(100, 50)), /حتى يُعتمد/);
  assert.match(sessionOpenProblem({ ...PO, state: 'canceled' }, progressOf(100, 50)), /حتى يُعتمد/);
  assert.equal(sessionOpenProblem({ ...PO, state: 'done' }, progressOf(100, 50)), '', 'المنجَز يُستلم عليه ما دام مفتوحًا');
});

test('★ أمرٌ استُلم كاملًا لا تُفتح عليه جلسة — والزائد قرارٌ لا جلسة', () => {
  const p = sessionOpenProblem(PO, progressOf(0, 0));
  assert.match(p, /استُلم كاملًا/);
  assert.match(p, /يحتاج قرارًا/, 'تقول الصواب: أين يذهب الزائد');
});

test('الجلسة بلا فاعلٍ أو وقتٍ لا تُفتح', () => {
  assert.match(openSession(PO, progressOf(100, 50), { at: CTX.at }).problem, /بلا فاعل/);
  assert.match(openSession(PO, progressOf(100, 50), { actor: 'محمد' }).problem, /بلا وقت/);
});

test('مستودع الجلسة: اختيار الموظّف وإلّا مستودع الأمر — ولا حمولةَ بلا مستودع', () => {
  assert.equal(openSession(PO, progressOf(100, 50), { ...CTX, warehouse: 'TRP' }).session.warehouse, 'TRP');
  assert.equal(openSession(PO, progressOf(100, 50), { ...CTX, warehouse: '' }).session.warehouse, 'MAIN', 'من الأمر ومُطبَّعًا');
});

test('السطر يُوجد بالكود أوّلًا ثمّ بالباركود توافقًا — والمجهول null', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  assert.equal(findSessionLine(s, { sku: 'wnw-001' }).lineId, 'L1', 'التطبيع قبل المقارنة');
  assert.equal(findSessionLine(s, { barcode: '6222' }).lineId, 'L2');
  assert.equal(findSessionLine(s, { sku: 'XX-9' }), null);
});

test('★★ المتبقّي يُشتقّ لحظيًّا: المفتوح ناقص ما قُرئ — ولا يهبط تحت الصفر', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  const after = applyAccepted(s, { lineId: 'L1', qty: 30 });
  assert.equal(after.lines[0].received, 30);
  assert.equal(remainingOf(after.lines[0]), 70);

  const over = applyAccepted(after, { lineId: 'L1', qty: 999 });
  assert.equal(remainingOf(over.lines[0]), 0, 'المتبقّي لا يُسالَب — والتجاوز يُحكم عليه في المسح');
  assert.equal(s.lines[0].received, 0, 'الأصل لا يُعدَّل — نسخٌ لا طفرة');
});

test('الخلاصة لحظيّة: المطلوب والمفتوح والمقروء والمتبقّي وعدد الطبالي', () => {
  let s = openSession(PO, progressOf(100, 50), CTX).session;
  s = applyAccepted(s, { lineId: 'L1', qty: 30, rejectedQty: 5 });
  s = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const t = sessionTotals(s);
  assert.deepEqual(
    { ordered: t.ordered, open: t.open, received: t.received, rejected: t.rejected, remaining: t.remaining, palletCount: t.palletCount },
    { ordered: 150, open: 150, received: 30, rejected: 5, remaining: 120, palletCount: 1 }
  );
});

test('الجلسة الواحدة تكوّن طبليةً أو أكثر — والمكرّرة لا تُضاف مرّتين', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  const one = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const twice = attachPallet(one, 'LPN-MAIN-20260826-000001');
  assert.equal(twice.pallets.length, 1);
  assert.equal(attachPallet(one, 'LPN-MAIN-20260826-000002').pallets.length, 2);
});

test('★★ الجلسة تُغلق ولو بقي مفتوحٌ — الاستلام الجزئيّ واقعُ مستودعٍ لا خطأ', () => {
  let s = openSession(PO, progressOf(100, 50), CTX).session;
  s = applyAccepted(s, { lineId: 'L1', qty: 30 });
  s = attachPallet(s, 'LPN-MAIN-20260826-000001');
  const closed = closeSession(s, { actor: 'محمد', at: CTX.at });
  assert.equal(closed.problem, undefined, 'المتبقّي ١٢٠ ولا يمنع الإغلاق');
  assert.equal(closed.session.state, 'CLOSED');
  assert.match(closeSession(closed.session, { actor: 'محمد' }).problem, /لا تُغلق مرّتين/);
});

test('★ جلسةٌ بلا طبليةٍ تُترك بسببٍ لا تُغلق إغلاقَ فراغ', () => {
  const s = openSession(PO, progressOf(100, 50), CTX).session;
  assert.match(sessionCloseProblem(s), /لم تُنتج شيئًا/);
  assert.match(abandonSession(s, { actor: 'محمد' }).problem, /سببًا مكتوبًا/);
  const left = abandonSession(s, { reason: 'الشاحنة تأخّرت — يُستأنف غدًا', actor: 'محمد', at: CTX.at });
  assert.equal(left.session.state, 'ABANDONED');
  assert.equal(left.session.abandonReason, 'الشاحنة تأخّرت — يُستأنف غدًا');
  assert.equal(SESSION_STATES.ABANDONED, 'متروكة');
});

test('★★ بطاقةُ الأمر للهاتف: حقول خطة ٧ — وما تَعِد به القائمة تقيس عليه الجلسة', () => {
  const card = openOrderCard(PO, [], []);
  assert.equal(card.number, 'PO-2026-0015');
  assert.equal(card.supplier, 'شركة نوفا');
  assert.equal(card.warehouse, 'MAIN');
  assert.equal(card.lineCount, 2);
  assert.equal(card.ordered, 150);
  assert.equal(card.open, 150, 'بلا علاقاتٍ: لم يُستلم شيء فالمفتوح كلّه');
  assert.ok(card.canReceive);
  assert.equal(card.blockedBecause, '');

  const draft = openOrderCard({ ...PO, state: 'draft' }, [], []);
  assert.ok(!draft.canReceive);
  assert.match(draft.blockedBecause, /حتى يُعتمد/, 'القائمة تقول لماذا لا يُستلم — لا تُخفي الأمر');
});

/* ══════════════════════════════════════════════════════════════════════
 * ★★★ حرّاسُ «الرأسُ تحت header» — العطبُ الذي لم يمسكه ٣٧٥٨ اختبارًا
 *
 * السببُ في كلّها واحد: العيّناتُ كانت **مسطّحة** (`order.supplier`) والواقعُ
 * غيرُها (`order.header.supplier`). فبطاقةُ الأمر في شاشة الاستلام كانت
 * تُبنى ببياناتٍ فارغة مع كلّ مستندٍ حقيقيّ — والاختبارُ أخضر.
 * ══════════════════════════════════════════════════════════════════════ */

test('★★★ بطاقةُ الأمر من مستندٍ بالشكل الذي يكتبه المحرّك — المورّدُ والمستودعُ والتواريخُ تصل', () => {
  const card = openOrderCard(WRITTEN_PO, [], []);
  assert.equal(card.supplier, 'شركة نوفا', 'المورّد تحت `header` — والجذرُ لا يحمله في مستندٍ حقيقيّ قطّ');
  assert.equal(card.warehouse, 'MAIN', 'ومستودعُ الأمر كذلك');
  assert.equal(card.issueDate, '2026-08-20');
  assert.equal(card.requiredDelivery, '2026-08-27');
  // والجذرُ يبقى مصدرَ ما يُكتب في الجذر: النوعُ والرقمُ والحالةُ والبنود.
  assert.equal(card.number, 'PO-2026-0015');
  assert.equal(card.state, 'approved');
  assert.equal(card.lineCount, 2);
  assert.equal(card.open, 150);
  assert.ok(card.canReceive, 'ولا يُحجب أمرٌ معتمدٌ مفتوح');
});

test('★★ الجلسةُ تُفتح على المستند الحقيقيّ فترث مورّدَه ومستودعَه — والتقدّمُ من محرّكه', () => {
  // التقدّمُ من `documentLineProgress` الحقيقيّ لا من عيّنةٍ بيد: هذا مسارُ
  // الشاشة حرفيًّا (بطاقةٌ ثمّ فتحُ جلسةٍ على المستند نفسه).
  const progress = documentLineProgress(WRITTEN_PO, [], []);
  const built = openSession(WRITTEN_PO, progress, { actor: 'محمد', at: CTX.at });
  assert.equal(built.problem, undefined);
  assert.equal(built.session.supplier, 'شركة نوفا', 'الطبالي المتولّدة ترث مورّدَ الجلسة — فلا تولد بلا مورّد');
  assert.equal(built.session.warehouse, 'MAIN', 'ولا حمولةَ بلا مستودعٍ تُنسب إليه');
  assert.equal(built.session.lines.length, 2);
});

test('★★ مستندُ النقل يُستلم عليه كذلك — ومستودعُه `toWarehouse` ومصدرُه `fromWarehouse`', () => {
  const card = openOrderCard(WRITTEN_TRN, [], []);
  assert.equal(card.warehouse, 'MAIN', 'المستودعُ المستلِم هو وجهةُ النقل لا مصدرُه');
  assert.equal(card.supplier, 'TRP', 'ومن جاءت منه الحمولةُ يظهر في موضع المورّد — الميدانُ يسأل «من أين؟»');
  assert.equal(card.issueDate, '2026-08-21');
  assert.equal(card.requiredDelivery, '2026-08-25');
  assert.ok(card.canReceive);
});

test('★ والمستنداتُ المسطّحةُ القديمة تُقرأ أيضًا — والاحتياطُ تسامحٌ لا افتراض', () => {
  const card = openOrderCard(PO, [], []);
  assert.equal(card.supplier, 'شركة نوفا');
  assert.equal(card.warehouse, 'MAIN');
  assert.equal(card.issueDate, '2026-08-20');
});

test('★★ ورأسٌ مكتوبٌ فارغًا لا يُحسب قيمةً — `emptyHeader` يكتب `\'\'` لا `undefined`', () => {
  // مزلقُ `??`: الفارغُ المكتوب يمرّ منه فيُبتلع الاحتياطُ إلى الجذر.
  const hybrid = { ...WRITTEN_PO, header: { ...WRITTEN_PO.header, warehouse: '', supplier: '' }, warehouse: 'TRP', supplier: 'شركة قديمة' };
  const card = openOrderCard(hybrid, [], []);
  assert.equal(card.warehouse, 'TRP');
  assert.equal(card.supplier, 'شركة قديمة');
});

test('🔒 ★★★ حارسٌ بنيويّ: لا اسمَ حقلِ رأسٍ يُقرأ من الجذر في هذا الملفّ — فيمسك النظائرَ المستقبليّة', () => {
  // أسماءُ حقول الرأس من المخطّطات نفسها لا من قائمةٍ بيد — فحقلٌ يُضاف غدًا
  // إلى PO أو TR يدخل الحراسةَ بلا أن يذكره أحد.
  const headerKeys = [...new Set(['PO', 'TR'].flatMap((type) => allFields(getSchema(type)).map((f) => f.key)))];
  assert.ok(headerKeys.includes('supplier') && headerKeys.includes('toWarehouse'), 'المخطّطاتُ تُقرأ فعلًا');

  // التعليقاتُ تُنزع أوّلًا: الحارسُ على الشيفرة لا على النثر.
  const source = fs
    .readFileSync(new URL('./receivingSession.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  // القراءةُ المشروعةُ بالمفتاح المحسوب (`header?.[key]`) — والوصولُ النقطيّ
  // (`order.supplier`) هو العطبُ بعينه: يقرأ من الجذر ما لا يُكتب فيه.
  const offenders = headerKeys
    .map((key) => ({ key, hits: (source.match(new RegExp(`\\??\\.${key}\\b`, 'g')) || []).length }))
    .filter((row) => row.hits > 0)
    .map((row) => `${row.key} ×${row.hits}`);

  assert.deepEqual(offenders, [], 'حقلُ رأسٍ يُقرأ من الجذر — مرّرْه بالمفتاح النصّيّ عبر قارئ الرأس الموحّد');
});

test('🔒 ★★★ والكاتبُ نفسُه يشهد: `documents` تُكتب بجذرٍ ضيّقٍ ورأسٍ تحت `header`', () => {
  // ★★★ العيّنةُ أعلاه ليست ادّعاءً: هذا الحارسُ يقرأ **الكاتبَ** لا القارئ،
  // فيستخرج مفاتيحَ الجذر التي يكتبها `createDraft` و`createNextInChain`
  // ويؤكّد أنّ حقولَ الرأس ليست فيها. فلو سُطّح الكاتبُ يومًا سقط هنا،
  // ولو حُشر حقلُ رأسٍ في الجذر سقط هنا — ولا يبقى الافتراضُ بلا شاهد.
  const writer = fs
    .readFileSync(new URL('../documents/documentsService.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  /**
   * مفاتيحُ المستوى الأوّل في كائنٍ يبدأ عند `open` — بعدّ الأقواس لا بالعين.
   * ★ والمختصرُ (`type,`) مفتاحٌ كالمصرَّح (`state: X`): من نسيه قرأ نصفَ الجذر
   * فظنّ الحارسَ خاضرًا وهو أعمى.
   */
  const topLevelKeys = (text, open) => {
    const keys = [];
    let depth = 0;
    let segment = '';
    const flush = () => {
      const m = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(segment.trim());
      if (m) keys.push(m[1]);
      segment = '';
    };
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{' || ch === '[' || ch === '(') { depth += 1; if (depth > 1) segment += ch; }
      else if (ch === '}' || ch === ']' || ch === ')') { depth -= 1; if (depth === 0) { flush(); break; } segment += ch; }
      else if (depth === 1 && ch === ',') flush();
      else if (depth >= 1) segment += ch;
    }
    return keys;
  };

  const blocks = ['addDoc(collection(db, DOCS), {', 'transaction.set(childRef, {'].map((needle) => {
    const at = writer.indexOf(needle);
    assert.notEqual(at, -1, `تعذّر العثور على كاتبٍ في محرّك المستندات: ${needle}`);
    return topLevelKeys(writer, at + needle.length - 1);
  });

  // ★★ نقضٌ يُثبت أنّ الحارسَ يعضّ: كاتبٌ مسطّحٌ مصطنعٌ **يجب** أن يُمسك.
  // ولولاه لَكان اخضرارُ الحارس بلا معنًى — يمرّ لأنّه لا يرى، لا لأنّه سليم.
  const flattened = 'addDoc(collection(db, DOCS), {\n  type,\n  state: INITIAL_STATE,\n  supplier: s,\n  lines,\n});';
  const flatKeys = topLevelKeys(flattened, flattened.indexOf('{'));
  assert.deepEqual(flatKeys, ['type', 'state', 'supplier', 'lines'], 'المستخرِجُ يقرأ المختصرَ والمصرَّحَ معًا — وإلّا فهو أعمى');

  assert.deepEqual(blocks[0], blocks[1], 'الكاتبان يكتبان الشكلَ نفسَه — فقارئٌ واحدٌ يكفيهما');

  const headerKeys = new Set(['PO', 'TR'].flatMap((type) => allFields(getSchema(type)).map((f) => f.key)));
  for (const rootKeys of blocks) {
    assert.ok(rootKeys.includes('header'), 'الرأسُ يُكتب في مفتاحٍ اسمُه `header`');
    assert.ok(rootKeys.includes('type') && rootKeys.includes('state') && rootKeys.includes('lines'), 'والجذرُ يحمل النوعَ والحالةَ والبنود');
    assert.deepEqual(
      rootKeys.filter((key) => headerKeys.has(key)),
      [],
      'حقلُ رأسٍ يُكتب في الجذر — فراجعْ قارئَ الرأس في جلسة الاستلام قبل أن تفترق البطاقةُ عن المستند'
    );
  }
});
