/**
 * ‹SRC-POST› اختبارات الاستيراد المُرحِّل — الاتّجاه وحدّ الافتتاح ومنع التكرار ومفتاح الرصيد.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPENING_CUTOFF,
  POSTED_KIND,
  buildPostedPreview,
  classifyPicking,
  groupPostedRows,
  odooUtcToLibyaDay,
  postedMarker,
  postedMarkerId,
  routeLabel,
  toPostedDraft,
  usageOf,
} from './postedImport.js';
import { buildMoves, balanceDeltas } from '../ledger/movements.js';
import { balanceId } from '../balances/balanceKey.js';

/** صفٌّ كما يخرج من ورقة SourcePosted — تسليمٌ حقيقيٌّ من أودو 2026-10-20. */
const row = (over = {}) => ({
  docRef: 'WHNBE/OUT/00074',
  docId: '198',
  lineId: '8454',
  sourceUpdatedAt: '2026-10-20 09:35:58',
  sourceSystem: 'Odoo',
  docStatus: 'done',
  doneDate: '2026-10-20',
  sourceLocation: 'WHNBE/Stock',
  sourceUsage: 'internal',
  destinationLocation: 'Partners/Customers',
  destinationUsage: 'customer',
  fromWarehouse: 'WH001',
  toWarehouse: '',
  partnerCode: '829',
  partner: 'صيدلية القلعه',
  orderRef: 'SBEN00074',
  sku: '8068056931732',
  barcode: '8068056931732',
  description: 'LOOSE POWDER PINK CC006',
  uom: 'Units',
  qty: 1,
  batch: '',
  expiry: '',
  unitCost: 0,
  ...over,
});

/* ═══════════ ١. الاتّجاه من الموقعين (العقد ④) ═══════════ */

test('نوعُ الموقع: الحقلُ أوّلًا، ثمّ الاسم — والطريقُ قبل الشرطة المائلة', () => {
  assert.equal(usageOf('internal', 'Partners/Customers'), 'internal', 'الحقل يغلب الاسم');
  assert.equal(usageOf('', 'WHNBE/Stock'), 'internal');
  assert.equal(usageOf('', 'Partners/Customers'), 'customer');
  assert.equal(usageOf('', 'Partners/Vendors'), 'supplier');
  // ★★ فيه شرطةٌ مائلة — ولو سُئل عنها أوّلًا لصار الطريقُ مخزنًا.
  assert.equal(usageOf('', 'Nova Inter-branch Transfers/Benghazi to Tripoli - In Transit'), 'transit');
  assert.equal(usageOf('', 'Virtual Locations/Inventory adjustment'), 'inventory');
  assert.equal(usageOf(false, false), '', 'فراغُ أودو `false` لا يصير نصًّا');
});

test('الاتّجاهات الأربعة — والمرتجعان', () => {
  const sri = classifyPicking({ sourceUsage: 'supplier', destinationUsage: 'internal', toWarehouse: 'wh002' });
  assert.deepEqual(sri, { type: 'SRI', header: { warehouse: 'WH002' }, isReturn: false });

  const ret = classifyPicking({ sourceUsage: 'customer', destinationUsage: 'internal', toWarehouse: 'WH001' });
  assert.equal(ret.type, 'SRI', 'مرتجعُ العميل استلامٌ إلى المستودع');
  assert.equal(ret.isReturn, true);

  const sro = classifyPicking({ sourceUsage: 'internal', destinationUsage: 'customer', fromWarehouse: 'WH001' });
  assert.deepEqual(sro, { type: 'SRO', header: { warehouse: 'WH001' }, isReturn: false });

  const rtv = classifyPicking({ sourceUsage: 'internal', destinationUsage: 'supplier', fromWarehouse: 'WH002' });
  assert.equal(rtv.type, 'SRO', 'مرتجعٌ إلى المورّد تسليمٌ من المستودع');
  assert.equal(rtv.isReturn, true);

  const sxo = classifyPicking({ sourceUsage: 'internal', destinationUsage: 'transit', fromWarehouse: 'WH001', toWarehouse: 'WH002' });
  assert.deepEqual(sxo, { type: 'SXO', header: { fromWarehouse: 'WH001', toWarehouse: 'WH002' } });

  const sxi = classifyPicking({ sourceUsage: 'transit', destinationUsage: 'internal', fromWarehouse: 'WH001', toWarehouse: 'WH002' });
  assert.deepEqual(sxi, { type: 'SXI', header: { fromWarehouse: 'WH001', toWarehouse: 'WH002' } });
});

test('ما لا يُرحَّل: داخل المستودع يُتخطّى، والتسويةُ والنقلُ المباشر يُحجبان بسبب', () => {
  const pick = classifyPicking({ sourceUsage: 'internal', destinationUsage: 'internal', fromWarehouse: 'WH001', toWarehouse: 'WH001' });
  assert.ok(pick.skip && !pick.type, 'السحبُ إلى منطقة التجهيز لا يغيّر رصيد المستودع');

  const direct = classifyPicking({ sourceUsage: 'internal', destinationUsage: 'internal', fromWarehouse: 'WH001', toWarehouse: 'WH002' });
  assert.ok(direct.error && !direct.type, 'نقلٌ بلا طريقٍ لا يُبتلع تخطّيًا — بضاعةٌ تحرّكت فعلًا');

  assert.ok(classifyPicking({ sourceUsage: 'inventory', destinationUsage: 'internal', toWarehouse: 'WH001' }).error);
  assert.ok(classifyPicking({ sourceUsage: 'supplier', destinationUsage: 'customer' }).skip, 'الشحنُ المباشر لم يدخل المستودع');
  assert.ok(classifyPicking({ sourceUsage: 'internal', destinationUsage: 'customer' }).error, 'تسليمٌ بلا مستودع');
  assert.ok(classifyPicking({}).error);
});

/* ═══════════ ٢. الزمن وحدّ الافتتاح (العقد ①) ═══════════ */

test('وقتُ أودو بالتوقيت العالميّ ⟵ يومُ ليبيا', () => {
  assert.equal(odooUtcToLibyaDay('2026-10-20 09:35:58'), '2026-10-20');
  // ★ أُنجز الواحدةَ فجرًا بتوقيت طرابلس يومَ 21 — وأودو يخزّنه 23:00 من يوم 20.
  assert.equal(odooUtcToLibyaDay('2026-10-20 23:00:00'), '2026-10-21');
  assert.equal(odooUtcToLibyaDay('2026-10-20'), '2026-10-20', 'التاريخُ المجرّد لا يُزاح');
  assert.equal(odooUtcToLibyaDay(false), '');
});

test('★★★ ما أُنجز قبل الافتتاح يُحجب — أثرُه داخلٌ في لقطة 19 أكتوبر', () => {
  const p = buildPostedPreview([row({ doneDate: '2026-10-19' })]);
  assert.equal(p.documents[0].status, 'error');
  assert.match(p.documents[0].problems.join(' '), /قبل الرصيد الافتتاحيّ/);
  assert.equal(p.ok, false, 'لا شيء يُرحَّل');
  assert.equal(OPENING_CUTOFF, '2026-10-20');
});

test('غيرُ المنجَز في المصدر يُحجب', () => {
  const p = buildPostedPreview([row({ docStatus: 'assigned' })]);
  assert.equal(p.documents[0].status, 'error');
  assert.match(p.documents[0].problems.join(' '), /لم يُنجَز/);
});

/* ═══════════ ٣. منع التكرار (العقد ②) ═══════════ */

test('★★★ المفتاحُ المرجعُ وحده — تعديلٌ لاحقٌ في أودو لا يجعل التسليمَ تسليمَين', () => {
  const a = postedMarkerId('Odoo', 'WHNBE/OUT/00074');
  assert.equal(a, postedMarkerId('odoo', 'whnbe/out/00074'), 'حالةُ الحروف لا تصنع مفتاحًا ثانيًا');
  assert.ok(!a.includes('/'), 'معرّفُ Firestore بلا شرطةٍ مائلة');
  const first = groupPostedRows([row()])[0];
  const edited = groupPostedRows([row({ sourceUpdatedAt: '2026-10-21 08:00:00' })])[0];
  assert.equal(postedMarker({ ...first, doneDay: '2026-10-20', type: 'SRO' }, 'x').fingerprint,
    postedMarker({ ...edited, doneDay: '2026-10-20', type: 'SRO' }, 'x').fingerprint);
});

test('المعاينة تعرف المرحَّلَ سلفًا والمعلَّقَ في منتصف الطريق', () => {
  const id = postedMarkerId('Odoo', 'WHNBE/OUT/00074');
  const posted = buildPostedPreview([row()], { known: new Map([[id, { documentId: 'D1', posted: true }]]) });
  assert.equal(posted.documents[0].status, 'posted');
  assert.equal(posted.ok, false);

  const halfway = buildPostedPreview([row()], { known: new Map([[id, { documentId: 'D1', posted: false, state: 'submitted' }]]) });
  assert.equal(halfway.documents[0].status, 'resume', 'يُستأنف المستندُ نفسُه لا يُنشأ ثانٍ');
  assert.equal(halfway.documents[0].documentId, 'D1');
  assert.equal(halfway.summary.resume, 1);
});

/* ═══════════ ٤. التجميع والتحقّق ═══════════ */

test('الصفوفُ تُجمع مستندًا — وتعارضُ الرأس يُعلن', () => {
  const docs = groupPostedRows([row(), row({ lineId: '8455', sku: '656272714604', barcode: '656272714604', qty: 6 })]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].lines.length, 2);

  const p = buildPostedPreview([row(), row({ lineId: '8455', fromWarehouse: 'WH002' })]);
  assert.equal(p.documents[0].status, 'error');
  assert.match(p.documents[0].problems.join(' '), /تعارضُ رأس/);
});

test('مستودعٌ ليس للبوّابة يُحجب — لا رصيدَ في «WHNBE»', () => {
  const p = buildPostedPreview([row({ fromWarehouse: 'WHNBE' })]);
  assert.equal(p.documents[0].status, 'error');
  assert.match(p.documents[0].problems.join(' '), /ليس من مستودعات البوّابة/);
});

test('بندٌ بلا هويّةٍ أو بكمّيّةٍ صفرٍ يحجب مستندَه', () => {
  assert.equal(buildPostedPreview([row({ sku: '', barcode: '' })]).documents[0].status, 'error');
  assert.equal(buildPostedPreview([row({ qty: 0 })]).documents[0].status, 'error');
});

test('الملخّص يعدّ ما سيُرحَّل وحده', () => {
  const p = buildPostedPreview([
    row(),
    row({ lineId: '2', qty: 4 }),
    row({ docRef: 'WHNTR/OUT/00055', docId: '199', fromWarehouse: 'WH002', partner: 'محل جولد', partnerCode: '782', orderRef: 'STIP00053', qty: 6 }),
    row({ docRef: 'OLD/1', doneDate: '2026-10-18' }),
    row({ docRef: 'WHNBE/PICK/1', destinationLocation: 'WHNBE/Output', destinationUsage: 'internal', toWarehouse: 'WH001' }),
  ]);
  assert.deepEqual(
    { total: p.summary.total, new: p.summary.new, error: p.summary.error, skip: p.summary.skip, lines: p.summary.lines, qty: p.summary.qty },
    { total: 4, new: 2, error: 1, skip: 1, lines: 3, qty: 11 }
  );
  assert.equal(p.ok, true);
});

/* ═══════════ ٥. المسودّة ومفتاحُ الرصيد (العقد ③) ═══════════ */

test('المسودّة: الرأسُ يحمل المرجعَ والطرفين، والدفعةُ وصفٌ لا مفتاح', () => {
  const [d] = buildPostedPreview([row({ batch: 'LOT-7', expiry: '2027-01-01' })]).documents;
  const draft = toPostedDraft(d);
  assert.equal(draft.type, 'SRO');
  assert.equal(draft.header.sourceRef, 'WHNBE/OUT/00074');
  assert.equal(draft.header.sourceDoneDate, '2026-10-20');
  assert.equal(draft.header.warehouse, 'WH001');
  assert.equal(draft.header.sourceTo, 'Partners/Customers');
  assert.equal(draft.lines[0].batch, '');
  assert.equal(draft.lines[0].expiry, '');
  assert.equal(draft.lines[0].sourceLot, 'LOT-7', 'الدفعةُ محفوظةٌ وصفًا');
  assert.equal(draft.lines[0].uom, '', '«Units» أودو ⟵ وحدةُ أساس الصنف');
  assert.equal(draft.lines[0].sourceUom, 'Units');
});

test('★★★ التسليمُ المُرحَّل يُنقص **مفتاحَ الرصيد الافتتاحيّ نفسَه** — لا مفتاحًا موازيًا', () => {
  const [d] = buildPostedPreview([row({ qty: 3, batch: 'LOT-7', expiry: '2027-01-01' })]).documents;
  const draft = toPostedDraft(d);
  const { moves, problems } = buildMoves({ id: 'DOC1', state: 'done', ...draft });
  assert.deepEqual(problems, []);
  const { deltas } = balanceDeltas(moves);
  // مفتاحُ صفّ «الأرصدة» المرفوع من أودو: الصنف × المستودع × بلا دفعة.
  const opening = balanceId({ sku: '8068056931732', barcode: '8068056931732', warehouse: 'WH001', batch: '' });
  assert.deepEqual(deltas.map((x) => [x.id, x.delta]), [[opening, -3]], 'العميلُ خارجُ المنشأة لا رصيدَ له');
});

test('★★ الاستلامُ يُزيد المستودع، والإرساليّةُ والاستلامُ يمرّان بالطريق', () => {
  const mk = (over) => toPostedDraft(buildPostedPreview([row(over)]).documents[0]);
  const deltasOf = (draft) => balanceDeltas(buildMoves({ id: 'D', state: 'done', ...draft }).moves).deltas.map((x) => [x.warehouse, x.delta]);

  assert.deepEqual(deltasOf(mk({ sourceUsage: 'supplier', destinationUsage: 'internal', fromWarehouse: '', toWarehouse: 'WH002', qty: 5 })), [['WH002', 5]]);
  assert.deepEqual(deltasOf(mk({ destinationUsage: 'transit', destinationLocation: 'In Transit', toWarehouse: 'WH002', qty: 5 })), [['WH001', -5], ['TRANSIT', 5]]);
  assert.deepEqual(deltasOf(mk({ sourceUsage: 'transit', sourceLocation: 'In Transit', destinationUsage: 'internal', destinationLocation: 'WHNTR/Stock', toWarehouse: 'WH002', qty: 5 })), [['TRANSIT', -5], ['WH002', 5]]);
});

test('سجلُّ منع التكرار من نوعٍ مستقلّ ويحمل معرّفَ المستند', () => {
  const [d] = buildPostedPreview([row()]).documents;
  const m = postedMarker(d, 'DOC-9');
  assert.equal(m.kind, POSTED_KIND);
  assert.equal(m.documentId, 'DOC-9');
  assert.equal(m.documentType, 'SRO');
  assert.equal(m.fingerprint, 'POSTED__ODOO__WHNBE/OUT/00074');
});

test('★★★ خطأٌ واحدٌ في الورقة يحجبها كلَّها — لا يُرحَّل مستندٌ سقط منه بند', () => {
  // `importSheet` أسقط صفًّا معطوبًا وأبقى إخوتَه: المستندُ يبدو سليمًا وهو ناقص.
  const sheetErrors = [{ row: 7, column: 'qty', message: 'الكمية يجب أن تكون أكبر من صفر.' }];
  const p = buildPostedPreview([row()], { sheetErrors });
  assert.equal(p.documents[0].status, 'new', 'المستندُ وحده لا يكشف ما سقط منه');
  assert.equal(p.ok, false, 'فالحجبُ على مستوى الورقة');
  assert.equal(p.errors.length, 1);

  const warned = buildPostedPreview([row()], { sheetErrors: [{ row: 2, column: 'lineId', severity: 'warning', message: 'لا معرّف سطر' }] });
  assert.equal(warned.ok, true, 'التنبيهُ لا يحجب');
});

test('«من … إلى …» يسمّي الطرفين كما وقعا', () => {
  const doc = (over) => buildPostedPreview([row(over)]).documents[0];
  assert.deepEqual(routeLabel(doc()), { from: 'WH001', to: 'صيدلية القلعه' });
  assert.deepEqual(routeLabel(doc({ partner: '' })), { from: 'WH001', to: 'العميل' });
  assert.deepEqual(
    routeLabel(doc({ sourceUsage: 'customer', destinationUsage: 'internal', fromWarehouse: '', toWarehouse: 'WH002', partner: '' })),
    { from: 'العميل', to: 'WH002' },
    'المرتجعُ من العميل'
  );
  assert.deepEqual(routeLabel(doc({ destinationUsage: 'transit', toWarehouse: 'WH002' })), { from: 'WH001', to: 'الطريق إلى WH002' });
});
