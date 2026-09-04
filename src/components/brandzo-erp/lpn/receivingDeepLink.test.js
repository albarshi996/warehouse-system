/**
 * حارسُ «شاشةُ الاستلام تقرأ أمرَها من العنوان» — ‹JR-102 نصفُه الثاني›.
 *
 * ═══ ★★★ ولماذا لا يكتفي بالبحث عن نصٍّ في الملفّ ═══
 * فحصٌ نقضيٌّ أثبت أنّ آلافَ الاختبارات الخضراء لم تمسك عطبًا واحدًا لأنّها
 * تبني بياناتِها بيدها. فهذا الحارسُ يفعل ثلاثةً بخلافها:
 *
 * ① **يُشغّل شيفرةَ الشاشة نفسَها** لا نسخةً منها: يقتطع كتلةَ الرابط من
 *    `ReceivingFlow.jsx` بين علامتيها ويُحمّلها وحدةً حيّة. فما يُختبَر هنا
 *    هو البايتاتُ التي تُبنى وتُنشر — ولو غُيّرت غدًا سقط الحارس.
 *    (والاقتطاعُ ضرورةٌ لا اختيار: `node --test` لا يستورد `.jsx`، ولا مترجمَ
 *    في هذه الشجرة — و`node_modules` فيها فارغ.)
 *
 * ② **يسلك طريقَ المستدعي الحقيقيّ**: المسارُ من `fieldRouteFor` لا نصًّا
 *    مكتوبًا هنا، ثمّ يُبنى الرابطُ كما يبنيه صفُّ المستندات، ثمّ يُقرأ منه
 *    المعامل كما تقرؤه الشاشة. فمفتاحٌ يفترق طرفاه يسقط هنا لا عند الموظّف.
 *
 * ③ **وبطاقاتُ الأوامر من `openOrderCard` على مستندٍ مكتوبٍ بشكله الحقيقيّ**
 *    (رأسُه تحت `header` من المخطّط نفسِه)، والجلسةُ من `openSession` — أي
 *    من **الكاتبَين** لا من عيّنةٍ مريحة.
 *
 * ⚠️ والعطبُ الذي وُلد منه: زرُّ «ابدأ الاستلام الميدانيّ» يفتح الشاشةَ على
 * قائمتها، فيبحث الموظّفُ عن أمره بين المفتوحة — والرحلةُ تنقطع في آخر متر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fieldRouteFor } from '../../../services/tasks/fieldRoutes.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import { emptyDocument } from '../../../services/documents/schemaUtils.js';
import { documentLineProgress } from '../../../services/documents/documentLineProgress.js';
import { openOrderCard, openSession } from '../../../services/lpn/receivingSession.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLOW = path.join(HERE, 'ReceivingFlow.jsx');
const PICKING = path.join(HERE, 'PickingFlow.jsx');

const flowSource = fs.readFileSync(FLOW, 'utf8');

/**
 * كتلةُ الرابط من الشاشة — تُقتطع بعلامتيها وتُحمَّل وحدةً حيّة.
 *
 * ★ العلامتان عقدٌ مكتوبٌ في الشاشة نفسِها، وكسرُهما يُقال بصوتٍ عالٍ هنا لا
 * يمرّ بحارسٍ يخضرّ على العدم.
 */
const OPEN_MARK = '/* ⟦deep-link⟧';
const CLOSE_MARK = '/* ⟦/deep-link⟧ */';

async function loadDeepLinkBlock() {
  const from = flowSource.indexOf(OPEN_MARK);
  const to = flowSource.indexOf(CLOSE_MARK);
  assert.ok(
    from !== -1 && to > from,
    'ReceivingFlow.jsx بلا كتلة ⟦deep-link⟧ — الشاشةُ لا تقرأ أمرَها من العنوان، فمن ضغط «ابدأ الاستلام الميدانيّ» يصل إلى قائمةٍ يبحث فيها عن أمره.'
  );
  const block = flowSource.slice(from, to);
  for (const needed of ['export function docParamOf', 'export function deepLinkTarget']) {
    assert.ok(block.includes(needed), `كتلةُ الرابط بلا «${needed}»`);
  }
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(block)}`);
}

/**
 * مستندٌ **بالشكل الذي يكتبه الكاتبُ فعلًا** — نمطُ `receivingSession.test.js`
 * حرفًا: الجذرُ يحمل النوعَ والرقمَ والحالةَ والبنود، وكلُّ حقول الرأس تحت
 * `header` مبنيّةً من المخطّط نفسِه فلا تكذب العيّنةُ إن تغيّر المخطّط.
 */
function writtenDocument(type, { id, number, state = 'approved', header, lines }) {
  const schema = getSchema(type);
  const blank = emptyDocument(schema, { rows: lines.length });
  return {
    id,
    type,
    stage: schema.stage ?? null,
    number,
    state,
    header: { ...blank.header, ...header },
    lines: lines.map((line, index) => ({ ...blank.lines[index], ...line })),
    links: {},
  };
}

const PO_DOC = writtenDocument('PO', {
  id: 'po-written-1',
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

// ★★★ `TRN` لا `TR`: طلبُ النقل لم يُشحن — والاستلامُ على مستند النقل
// الذي يرافق الحمولة (صُحّح 2026-09-04، انظر `closeTargetOf`).
const TRN_DOC = writtenDocument('TRN', {
  id: 'tr-written-1',
  number: 'TRN-2026-0004',
  header: {
    fromWarehouse: 'TRP',
    toWarehouse: 'MAIN',
    requestDate: '2026-08-21',
    requiredDate: '2026-08-25',
  },
  lines: [{ sku: 'WNW-001', barcode: '6221', description: 'ماء نوفا', uom: 'CTN', qty: 40 }],
});

/** القائمةُ كما تبنيها الشاشة حرفًا: بطاقةٌ من `openOrderCard` مرشَّحةٌ بـ`canReceive`. */
const ORDERS = [PO_DOC, TRN_DOC].map((d) => openOrderCard(d, [], [])).filter((c) => c.canReceive);

/** جلسةٌ مفتوحةٌ كما يكتبها `openSession` — لا كائنٌ مصنوعٌ بيدٍ حرّة. */
function openSessionRow(doc, sessionId) {
  const built = openSession(doc, documentLineProgress(doc, [], []), {
    actor: 'أحمد الشريف',
    at: '2026-09-04T07:00:00Z',
    warehouse: 'MAIN',
    device: 'WEB',
  });
  assert.equal(built.problem, undefined, 'العيّنةُ نفسُها لا تُفتح — راجع المستند لا الحارس');
  return { id: sessionId, ...built.session };
}

/** الرابطُ كما يبنيه صفُّ المستندات: مسارُ الوحدة + معرّفُ المستند. */
function hrefFromRow(doc) {
  const route = fieldRouteFor(doc);
  assert.ok(route, `لا مسارَ ميدانيًّا لـ${doc.type} — تغيّرت الخريطة`);
  return `/warehouse${route.path}?doc=${encodeURIComponent(doc.id)}`;
}

test('★★★ القائمةُ عيّنةٌ صادقة — بطاقاتٌ من الكاتب لا من اليد', () => {
  assert.equal(ORDERS.length, 2, 'أمرُ الشراء ومستندُ النقل كلاهما قابلٌ للاستلام');
  assert.equal(ORDERS[0].id, 'po-written-1');
  assert.equal(ORDERS[0].number, 'PO-2026-0015');
});

test('★★★ معرّفُ الأمر يعبر من رابط الصفّ إلى الشاشة — مفتاحٌ واحدٌ لا مفتاحان', async () => {
  const { docParamOf } = await loadDeepLinkBlock();
  const href = hrefFromRow(PO_DOC);
  const search = new URL(href, 'https://portal.example').search;
  assert.equal(
    docParamOf(search),
    'po-written-1',
    'الشاشةُ لا تقرأ المعاملَ الذي يكتبه الصفّ — والموظّفُ يظنّها فتحت على أمره وهي على قائمتها'
  );
  // ولا معاملَ ⇒ لا شيء: من فتح الشاشةَ من القائمة يعمل كما كان حرفًا.
  assert.equal(docParamOf(''), '');
  assert.equal(docParamOf('?op=H4K9TM'), '', 'معاملُ دعوةِ الجرد لا يُخلط بمعاملِ الأمر');
});

test('★★★ أمرٌ في القائمة يُفتح مباشرةً — لا يُترك للبحث اليدويّ', async () => {
  const { docParamOf, deepLinkTarget } = await loadDeepLinkBlock();
  const wanted = docParamOf(new URL(hrefFromRow(PO_DOC), 'https://portal.example').search);
  const t = deepLinkTarget({ wanted, orders: ORDERS, openSessions: [], actor: 'محمد', allowed: true });
  assert.equal(t.kind, 'order', 'الأمرُ المطابق لا يُفتح — الرحلةُ تنقطع في آخر متر');
  assert.equal(t.id, 'po-written-1');
});

test('★★ ومستندُ النقل كذلك — القائمةُ تشمله فالرابطُ يشمله', async () => {
  const { docParamOf, deepLinkTarget } = await loadDeepLinkBlock();
  const wanted = docParamOf(new URL(hrefFromRow(TRN_DOC), 'https://portal.example').search);
  const t = deepLinkTarget({ wanted, orders: ORDERS, openSessions: [], actor: 'محمد', allowed: true });
  assert.equal(t.kind, 'order');
  assert.equal(t.id, 'tr-written-1');
});

test('★★ ورقمُ الأمر يُقبل كما يُقبل معرّفُه — من نسخ «PO-2026-0015» بيده يصل', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  const t = deepLinkTarget({ wanted: 'po-2026-0015', orders: ORDERS, openSessions: [], actor: 'محمد', allowed: true });
  assert.equal(t.kind, 'order');
  assert.equal(t.id, 'po-written-1');
});

test('★★★ وأمرٌ عليه جلسةٌ مفتوحة يُتابَع ولا تُفتح ثانيةٌ عليه', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  const live = openSessionRow(PO_DOC, 'sess-9');
  const t = deepLinkTarget({
    wanted: 'po-written-1',
    orders: ORDERS,
    openSessions: [live],
    actor: 'محمد',
    allowed: true,
  });
  /*
   * ★★★ المزلقُ المقيس: `startSession` تُنشئ **دائمًا**. فلو فتح الرابطُ جلسةً
   * ثانيةً على أمرٍ عليه جلسة لَمسح عاملان في جلستين لا ترى إحداهما الأخرى —
   * وهو نقيضُ ما بُني له `listenSession`. والرابطُ ضغطةٌ واحدةٌ تتكرّر بكلّ
   * إعادةِ تحميل، فالخطرُ أكبر من نقرةِ يدٍ لا أصغر.
   */
  assert.equal(t.kind, 'session', 'الرابطُ يفتح جلسةً ثانيةً على أمرٍ عليه جلسة');
  assert.equal(t.id, 'sess-9');
  assert.match(t.message, /أحمد الشريف/, 'لا يُقال من يمسك الجلسة');
});

test('★★★ وما ليس في المفتوحة يُقال سببُه — والصمتُ ممنوع', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  const t = deepLinkTarget({ wanted: 'po-ghost', orders: ORDERS, openSessions: [], actor: 'محمد', allowed: true });
  assert.equal(t.kind, 'missing');
  assert.ok(String(t.message).trim().length > 0, 'شاشةٌ تصمت أمام رابطٍ لا يُطابق — والموظّفُ يظنّ أمرَه ضائعًا');
  assert.match(t.message, /po-ghost/, 'الرسالةُ لا تسمّي ما بُحث عنه');
  assert.match(t.message, /أُغلق|استُلم/, 'الرسالةُ لا تقول العلّةَ المرجّحة');
});

test('★★★ ولا يُفتح من الرابط ما يمنعه الدورُ أو تُجهَل هويّةُ فاتحه', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  /*
   * ★ لا حكمَ صلاحيّةٍ جديدٌ هنا: `allowed` عينُ ما يعطّل زرَّ الصفّ في
   * الشاشة (`recvGate.allowed` من `uiGate`). والقيدُ أنّ الرابطَ لا يفعل
   * بالعنوان ما تمنعه الشاشةُ بالضغط — وإلّا صار العنوانُ بابًا خلفيًّا.
   */
  const denied = deepLinkTarget({ wanted: 'po-written-1', orders: ORDERS, openSessions: [], actor: 'محمد', allowed: false });
  assert.equal(denied.kind, 'highlight', 'الرابطُ يفتح جلسةً لمن يمنعه دورُه');
  assert.equal(denied.id, 'po-written-1', 'ولا يُبرَز له أمرُه فلا يفهم لماذا لم يُفتح');
  assert.ok(String(denied.message).trim().length > 0);

  // وهويّةٌ لم تُقرأ: `openSession` نفسُها ترفض جلسةً بلا فاعل — فالإبرازُ أصدق
  // من نداءٍ يُردّ بـ«لم تُقرأ هويّتك».
  const anon = deepLinkTarget({ wanted: 'po-written-1', orders: ORDERS, openSessions: [], actor: '', allowed: true });
  assert.equal(anon.kind, 'highlight');
  assert.equal(anon.id, 'po-written-1');
});

test('★★★ وجهلٌ بالجلسات لا يبرّر إنشاءً — تعذّرت القراءةُ فلا تُفتح جلسةٌ بلا يد', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  /*
   * ⚠️ `listOpenSessions` قد تُخفق (شبكةٌ · صلاحيةٌ · فهرس)، والشاشةُ تبتلع
   * إخفاقَها بقائمةٍ فارغة كي لا يُمنع فتحُ جلسةٍ بالضغط. لكنّ **الرابطَ لا
   * يضغطه أحد**: يقع بمجرّد الفتح ويتكرّر بكلّ إعادةِ تحميل — فقائمةٌ فارغةٌ
   * لأنّها لم تُقرأ تصير إذنًا بجلسةٍ ثانيةٍ على أمرٍ عليه جلسة.
   */
  const t = deepLinkTarget({
    wanted: 'po-written-1',
    orders: ORDERS,
    openSessions: [],
    sessionsKnown: false,
    actor: 'محمد',
    allowed: true,
  });
  assert.equal(t.kind, 'highlight', 'الرابطُ يُنشئ جلسةً وهو لا يدري أعليه جلسةٌ أم لا');
  assert.equal(t.id, 'po-written-1');
  assert.match(t.message, /تعذّرت/, 'ولا يُقال للموظّف لماذا لم تُفتح');
});

test('★★ ولا معاملَ ⇒ لا تغيّرَ في سلوك الشاشة', async () => {
  const { deepLinkTarget } = await loadDeepLinkBlock();
  assert.equal(deepLinkTarget({ wanted: '', orders: ORDERS, openSessions: [] }).kind, 'none');
  assert.equal(deepLinkTarget({}).kind, 'none', 'نداءٌ بلا وسائطَ لا يرمي');
});

test('★★★ والشاشةُ توصل الكتلةَ فعلًا وتنظّف العنوانَ بنمط الشاشات الشقيقة', () => {
  /*
   * ★★ منطقٌ بلا مستدعٍ هو النمطُ الأوّلُ في دفتر أعطاب هذه الطبقة: دالّةٌ
   * مبنيّةٌ مختبَرةٌ لا يناديها أحد. فلا يكفي أن تصحّ الكتلة — يجب أن تُنادى.
   */
  assert.ok(flowSource.includes('docParamOf('), 'الكتلةُ مبنيّةٌ ولا تقرؤها الشاشة');
  assert.ok(flowSource.includes('deepLinkTarget({'), 'الحكمُ مبنيٌّ ولا تستدعيه الشاشة');

  /*
   * ★★★ والتنظيفُ نمطُ `ScanFlow.jsx` و`PickingFlow.jsx` حرفًا لا نمطٌ ثانٍ:
   * بغيره تُعيد كلُّ إعادةِ تحميلٍ الموظّفَ إلى أمرٍ تركه بقصد.
   */
  assert.ok(flowSource.includes(`searchParams.delete('doc')`), 'المعاملُ يبقى في شريط العنوان');
  assert.ok(flowSource.includes('window.history.replaceState({}, \'\', url)'), 'التنظيفُ بغير نمط الشاشات الشقيقة');

  // ومفتاحٌ واحدٌ للشاشتين الميدانيّتين — فما يتعلّمه الموظّفُ في شاشةٍ يعمل في الأخرى.
  const picking = fs.readFileSync(PICKING, 'utf8');
  assert.ok(picking.includes(`.get('doc')`), 'شاشةُ التحضير غيّرت مفتاحَها — فافترق المفتاحان');
});
