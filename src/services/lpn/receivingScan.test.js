/**
 * اختبارات مسح الاستلام — الموانع السبعة التي تمنع «استلامًا لا يُصلَح لاحقًا».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItemIndexes } from '../items/uomWiring.js';
import { openSession } from './receivingSession.js';
import {
  REJECT_REASONS,
  buildRejection,
  rejectionProblem,
  rejectionSummary,
  resolveScan,
  scanVerdict,
} from './receivingScan.js';

// نموذج الصنف كما تكتبه الخدمة فعلًا: `barcodes` مصفوفةٌ **تضمّ باركودات
// الوحدات** (يدمجها ItemForm عمدًا «فمسحها يجد الصنف أصلًا»).
const WATER = {
  sku: 'WNW-001',
  name: 'ماء نوفا',
  barcodes: ['6221', '6221000'],
  baseUom: 'piece',
  uomFactors: { carton: 12 },
  uomBarcodes: { '6221000': 'carton' },
};
const SMALL = { sku: 'WNW-002', name: 'ماء صغير', barcodes: ['6222'], baseUom: 'piece' };
const INDEXES = buildItemIndexes([WATER, SMALL]);

const PO = {
  id: 'po-1', type: 'PO', number: 'PO-2026-0015', state: 'approved', warehouse: 'MAIN',
  lines: [{ sku: 'WNW-001', barcode: '6221', uom: 'piece', qty: 100 }],
};
const PROGRESS = {
  documentId: 'po-1', documentType: 'PO',
  lines: [{ lineId: 'L1', lineNumber: 1, sku: 'WNW-001', barcode: '6221', uom: 'piece', requested: 100, open: 60 }],
  totals: { requested: 100, executed: 40, open: 60 },
};
const SESSION = openSession(PO, PROGRESS, { actor: 'محمد', at: '2026-08-26T08:00:00Z' }).session;
const CTX = { indexes: INDEXES, asOf: '2026-08-26' };

test('★★ باركود الكرتونة يرفع بمعامله لا بواحد — التحويل يوم القراءة', () => {
  const r = resolveScan('6221000', INDEXES);
  assert.equal(r.item.sku, 'WNW-001');
  assert.equal(r.uom, 'carton', 'الرمز المعياريّ في البيت لا اختصارٌ حرّ');
  assert.equal(r.factor, 12);

  const v = scanVerdict(SESSION, { barcode: '6221000' }, CTX);
  assert.ok(v.ok, v.message);
  assert.equal(v.entry.qty, 1, 'مسحةٌ واحدة = عبوةٌ واحدة');
  assert.equal(v.entry.baseQty, 12, 'وأساسها اثنا عشر');
});

test('باركود الصنف الأساس يرفع بواحد — وحدةٌ لا كرتونة', () => {
  const v = scanVerdict(SESSION, { barcode: '6221' }, CTX);
  assert.ok(v.ok, v.message);
  assert.equal(v.entry.uom, 'piece');
  assert.equal(v.entry.baseQty, 1);
});

test('★★ الباركود المجهول لا يُردّ ويُنسى — يصير استثناءً يُسجَّل', () => {
  const v = scanVerdict(SESSION, { barcode: '9999999' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /غير معروف في ماستر الأصناف/);
  assert.match(v.message, /سُجّل استثناءً/, 'تقول الصواب: أين يذهب');
  assert.equal(v.exception.type, 'UNKNOWN_BARCODE');
  assert.equal(v.entry, null, 'ولا يدخل الطبلية');
});

test('★★ صنفٌ خارج الأمر يُردّ — والرسالة تسمّي أصناف الأمر', () => {
  const v = scanVerdict(SESSION, { barcode: '6222' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /ليس في أمر «PO-2026-0015»/);
  assert.match(v.message, /WNW-001/, 'تسمّي المطلوب');
  assert.equal(v.exception.type, 'ITEM_NOT_IN_ORDER');
});

test('★★★ التجاوز فوق المفتوح لا يُمنع منعًا باتًّا — يحتاج صلاحية مشرفٍ بسبب (ق-٣)', () => {
  // المفتوح ٦٠ · ستّ كراتين = ٧٢
  const v = scanVerdict(SESSION, { barcode: '6221000', qty: 6 }, CTX);
  assert.ok(!v.ok);
  assert.ok(v.needsSupervisor, 'بابٌ يُفتح بصلاحية لا جدارٌ يوقف الشاحنة');
  assert.match(v.message, /المفتوح من «WNW-001» 60 والممسوح 72/, 'تسمّي الرقمين');
  assert.match(v.message, /الزائد 12/);
  assert.equal(v.exception.type, 'OVER_RECEIPT');

  const noNote = scanVerdict(SESSION, { barcode: '6221000', qty: 6, override: true }, CTX);
  assert.ok(!noNote.ok);
  assert.match(noNote.message, /سببًا مكتوبًا/);

  const passed = scanVerdict(SESSION, { barcode: '6221000', qty: 6, override: true, overrideNote: 'المورد أرسل زيادةً — أمر المشرف بالاستلام' }, CTX);
  assert.ok(passed.ok, passed.message);
  assert.equal(passed.entry.over, 12, 'والزائد يُقيَّد على القيد');
  assert.match(passed.entry.overrideNote, /أمر المشرف/);
});

test('المفتوح تمامًا يمرّ بلا صلاحية — الحدّ ليس تجاوزًا', () => {
  const v = scanVerdict(SESSION, { barcode: '6221000', qty: 5 }, CTX);
  assert.ok(v.ok, v.message);
  assert.equal(v.entry.baseQty, 60);
  assert.equal(v.entry.over, 0);
});

test('🔒 الدفعة المنتهية تُردّ — حكمُ الصلاحية مستدعًى من طبقة المحتويات لا مكرَّرًا', () => {
  const v = scanVerdict(SESSION, { barcode: '6221', batch: 'B2401', expiry: '2026-01-01' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /منتهية الصلاحية منذ 2026-01-01/);
});

test('🔒 ملصق الطبلية في خانة الدفعة يُردّ — الاتّجاه المعاكس محروس', () => {
  const v = scanVerdict(SESSION, { barcode: '6221', batch: 'LPN-MAIN-20260826-000001' }, CTX);
  assert.ok(!v.ok);
  assert.match(v.message, /ملصق طبلية لا رقم تشغيلة/);
});

test('الكمّيّة صفرٌ فما دون تُردّ — والقراءة الفارغة كذلك', () => {
  assert.match(scanVerdict(SESSION, { barcode: '6221', qty: 0 }, CTX).message, /أكبر من صفر/);
  assert.match(scanVerdict(SESSION, { barcode: '6221', qty: -2 }, CTX).message, /أكبر من صفر/);
  assert.match(scanVerdict(SESSION, { barcode: '' }, CTX).message, /قراءةٌ فارغة/);
});

test('★ المعامل المجهول يُعلَن ولا يُخمَّن — القراءة تمرّ موسومةً', () => {
  const odd = { sku: 'ODD-1', name: 'صنف بلا معامل', barcodes: ['7000', '7001'], baseUom: 'kg', uomBarcodes: { 7001: 'box' } };
  const idx = buildItemIndexes([odd]);
  const session = openSession(
    { ...PO, lines: [{ sku: 'ODD-1', barcode: '7000', uom: 'kg', qty: 10 }] },
    { documentId: 'po-1', documentType: 'PO', lines: [{ lineId: 'L1', lineNumber: 1, sku: 'ODD-1', barcode: '7000', uom: 'kg', requested: 10, open: 10 }], totals: { requested: 10, executed: 0, open: 10 } },
    { actor: 'محمد', at: '2026-08-26T08:00:00Z' }
  ).session;

  const v = scanVerdict(session, { barcode: '7001' }, { indexes: idx, asOf: '2026-08-26' });
  assert.ok(v.ok, v.message);
  assert.equal(v.entry.baseQty, null, 'null تعني «لا أعرف» لا واحدًا');
  assert.ok(v.entry.baseUnknown, 'وموسومةٌ صراحةً فتظهر قائمةَ عملٍ لا رقمًا كاذبًا');
  assert.equal(v.entry.over, 0, 'ولا يُحكم بتجاوزٍ على مجهول');
});

// ═══ LPN-204 — المرفوض بأسبابه المقيَّدة ═══

test('★★ سبب الرفض مقيَّدٌ بقائمةٍ معلنة — والنصّ الحرّ يُردّ', () => {
  assert.match(rejectionProblem({ reason: 'مكسور', qty: 3 }), /غير معروف/);
  assert.match(rejectionProblem({ reason: 'DAMAGED', qty: 0 }), /أكبر من صفر/);
  assert.equal(rejectionProblem({ reason: 'DAMAGED', qty: 3 }), '');
  assert.equal(Object.keys(REJECT_REASONS).length, 8);
});

test('«أخرى» بلا شرحٍ لا تُفيد — فتُردّ', () => {
  assert.match(rejectionProblem({ reason: 'OTHER', qty: 2 }), /شرحًا مكتوبًا/);
  assert.equal(rejectionProblem({ reason: 'OTHER', qty: 2, note: 'الغلاف مفتوحٌ من المورد' }), '');
});

test('★★ المقبول والمرفوض كمّيّتان منفصلتان — والمرفوض لا يدخل الحمولة', () => {
  const r = buildRejection({ reason: 'DAMAGED', qty: 3, sku: 'wnw-001', batch: 'b2408', actor: 'محمد', at: '2026-08-26T09:00:00Z' });
  assert.equal(r.problem, undefined);
  assert.equal(r.rejection.reasonLabel, 'تلف');
  assert.equal(r.rejection.sku, 'WNW-001', 'التطبيع قبل التخزين');
  assert.equal(r.rejection.batch, 'B2408');
  assert.match(buildRejection({ reason: 'DAMAGED', qty: 3 }).problem, /بلا فاعل/);
});

test('خلاصةُ الرفض مجموعةٌ بالسبب ومرتّبةٌ بالأكبر — لا قائمةٌ خامّ', () => {
  const summary = rejectionSummary([
    { reason: 'DAMAGED', qty: 3 },
    { reason: 'SHORT', qty: 10 },
    { reason: 'DAMAGED', qty: 2 },
    { reason: 'مجهول', qty: 99 },
  ]);
  assert.equal(summary.length, 2, 'المجهول يُسقَط ولا يُحصى');
  assert.deepEqual(summary[0], { reason: 'SHORT', label: 'نقص', qty: 10, count: 1 });
  assert.deepEqual(summary[1], { reason: 'DAMAGED', label: 'تلف', qty: 5, count: 2 });
});
