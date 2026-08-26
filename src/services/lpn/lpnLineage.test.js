/**
 * اختبارات نسب الطبالي — «من أين جاءت هذه الكرتونة؟» سؤالُ ثوانٍ لا تحقيق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lineageTrace, mergeUnits, needsNewIdentity, splitUnit } from './lpnLineage.js';

const MOTHER = {
  code: 'LPN-MAIN-20260826-000001',
  warehouse: 'MAIN',
  bin: 'MAIN-A01-R01',
  state: 'STORED',
  flags: [],
  lines: [
    { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'CTN', factor: 12, qty: 10, baseQty: 120 },
    { sku: 'WNW-002', batch: 'B2409', expiry: '', uom: 'EA', factor: 1, qty: 5, baseQty: 5 },
  ],
  sourceDoc: { type: 'GRN', number: 'GRN-2026-0032' },
};

const CHILD_CODE = 'LPN-MAIN-20260826-000002';
const TAKE = { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'CTN', factor: 12, qty: 4 };

test('★★ التقسيم: البنت تحمل نسب أمّها والأمّ تبقى بهويّتها ناقصةَ المحتوى فقط', () => {
  const r = splitUnit(MOTHER, { takes: [TAKE], childCode: CHILD_CODE, actor: 'محمد' });
  assert.equal(r.problem, undefined);
  assert.equal(r.parent.code, MOTHER.code, 'هويّة الأمّ لا تُمسّ');
  assert.equal(r.parent.state, 'STORED', 'وحالتها لا تُمسّ');
  assert.equal(r.parent.lines.find((l) => l.sku === 'WNW-001').qty, 6);
  assert.deepEqual(r.child.parentCodes, [MOTHER.code], 'البنت تسمّي أمّها');
  assert.equal(r.child.state, 'PICKING', 'طبلية الصرف تولد قيد التحضير');
  assert.equal(r.child.lines[0].qty, 4);
  assert.equal(r.child.sourceDoc.number, 'GRN-2026-0032', 'مستند الأصل يعبر للبنت — التتبّع لا ينقطع');
});

test('التقسيم يرفض: هويّة بنتٍ فاسدة أو مطابقة للأمّ أو سحبًا فوق المحمول', () => {
  assert.match(splitUnit(MOTHER, { takes: [TAKE], childCode: 'يدوي-123', actor: 'محمد' }).problem, /من العدّاد لا من اليد/);
  assert.match(splitUnit(MOTHER, { takes: [TAKE], childCode: MOTHER.code, actor: 'محمد' }).problem, /هويّة أمّها/);
  assert.match(splitUnit(MOTHER, { takes: [{ ...TAKE, qty: 99 }], childCode: CHILD_CODE, actor: 'محمد' }).problem, /لا يُسالَب/);
  assert.match(splitUnit(MOTHER, { takes: [], childCode: CHILD_CODE, actor: 'محمد' }).problem, /بلا بنود/);
  assert.match(splitUnit(MOTHER, { takes: [TAKE], childCode: CHILD_CODE }).problem, /بلا فاعل/);
});

test('التقسيم لا يعدّل الأمّ الأصل — نسخٌ لا طفرة', () => {
  splitUnit(MOTHER, { takes: [TAKE], childCode: CHILD_CODE, actor: 'محمد' });
  assert.equal(MOTHER.lines.find((l) => l.sku === 'WNW-001').qty, 10);
});

test('★★ الدمج هويّةٌ ثالثة تسمّي المصدرين — لا يبتلع أحدهما الآخر', () => {
  const a = { ...MOTHER, code: 'LPN-MAIN-20260826-000003', lines: [{ sku: 'WNW-001', batch: 'B2408', uom: 'CTN', factor: 12, qty: 2, baseQty: 24 }] };
  const b = { ...MOTHER, code: 'LPN-MAIN-20260826-000004', lines: [{ sku: 'WNW-001', batch: 'B2408', uom: 'CTN', factor: 12, qty: 3, baseQty: 36 }] };

  const r = mergeUnits([a, b], { mergedCode: 'LPN-MAIN-20260826-000005', actor: 'محمد' });
  assert.equal(r.problem, undefined);
  assert.deepEqual(r.merged.parentCodes, [a.code, b.code]);
  assert.equal(r.merged.lines.length, 1, 'البنود المتطابقة تُدمج');
  assert.equal(r.merged.lines[0].qty, 5);
  assert.ok(r.sources.every((s) => s.lines.length === 0), 'المصادر تُفرَّغ وتبقى بهويّاتها — لا تُحذف');

  assert.match(mergeUnits([a, b], { mergedCode: a.code, actor: 'محمد' }).problem, /لا يبتلع/);
  assert.match(mergeUnits([a], { mergedCode: 'LPN-MAIN-20260826-000005', actor: 'محمد' }).problem, /طبليتين فأكثر/);
});

test('🔒 الدمج داخل مستودعٍ واحد — النقل بين المستودعين بمستنده لا بالدمج', () => {
  const here = { ...MOTHER, code: 'LPN-MAIN-20260826-000006' };
  const there = { ...MOTHER, code: 'LPN-TRP-20260826-000001', warehouse: 'TRP' };
  const p = mergeUnits([here, there], { mergedCode: 'LPN-MAIN-20260826-000007', actor: 'محمد' }).problem;
  assert.match(p, /MAIN وTRP/, 'الرسالة تسمّي المستودعين');
  assert.match(p, /بمستنده/, 'وتقول الصواب: أين يقع النقل');
});

test('شجرة النسب: صعودًا للأصول ونزولًا للفروع — عبر أجيالٍ لا جيلٍ واحد', () => {
  const g1 = { code: 'LPN-MAIN-20260826-000001', parentCodes: [] };
  const g2 = { code: 'LPN-MAIN-20260826-000002', parentCodes: ['LPN-MAIN-20260826-000001'] };
  const g3 = { code: 'LPN-MAIN-20260827-000001', parentCodes: ['LPN-MAIN-20260826-000002', 'LPN-MAIN-20260826-000003'] };
  const other = { code: 'LPN-MAIN-20260826-000003', parentCodes: [] };
  const all = [g1, g2, g3, other];

  assert.deepEqual(lineageTrace(all, g3.code).ancestors, [g2.code, g1.code, other.code], 'الجدّة تظهر بعد الأمّ');
  assert.deepEqual(lineageTrace(all, g1.code).descendants, [g2.code, g3.code]);
  assert.deepEqual(lineageTrace(all, other.code), { ancestors: [], descendants: [g3.code] });
});

test('قاعدة LPN-402 دالّةً: الكاملة تعبر بهويّتها — والمفتوحة هويّةٌ جديدة', () => {
  assert.ok(!needsNewIdentity({}), 'نقلُ طبليةٍ كاملةٍ مغلقة لا يولّد هويّة');
  assert.ok(needsNewIdentity({ contentChanged: true }));
  assert.ok(needsNewIdentity({ isSplit: true }));
  assert.ok(needsNewIdentity({ isMerge: true }));
});

// ═══ ما كشفته المراجعة العدائية 2026-08-26 ═══

test('★★★ لا غسلَ للوسم بالتقسيم: أمٌّ تالفةٌ لا تُقسَّم — والبنت ترث أوسمة أمّها', () => {
  const damaged = { ...MOTHER, flags: ['DAMAGED'] };
  const blocked = splitUnit(damaged, { takes: [TAKE], childCode: CHILD_CODE, actor: 'محمد' });
  assert.match(blocked.problem, /تالفة/, 'التقسيم يُردّ والوسم يُسمّى');

  // وبقرار حوكمةٍ مقيَّد يمرّ — والبنت **ترث** الوسم: البضاعة هي التالفة لا الرقم.
  const passed = splitUnit(damaged, {
    takes: [TAKE], childCode: CHILD_CODE, actor: 'محمد',
    override: true, overrideNote: 'فرز التالف بقرار الحوكمة',
  });
  assert.equal(passed.problem, undefined);
  assert.deepEqual(passed.child.flags, ['DAMAGED'], 'البنت تالفةٌ كأمّها — لا تدخل دورة الصرف نظيفة');
});

test('★★★ الحمولة الختاميّة لا تُقسَّم ولا تُدمَج: مصروفةٌ دورتها انتهت', () => {
  const issued = { ...MOTHER, state: 'ISSUED' };
  assert.match(splitUnit(issued, { takes: [TAKE], childCode: CHILD_CODE, actor: 'محمد' }).problem, /دورتها انتهت/);

  const a = { ...MOTHER, code: 'LPN-MAIN-20260826-000010', state: 'ISSUED' };
  const b = { ...MOTHER, code: 'LPN-MAIN-20260826-000011' };
  const p = mergeUnits([a, b], { mergedCode: 'LPN-MAIN-20260826-000012', actor: 'محمد' }).problem;
  assert.match(p, /LPN-MAIN-20260826-000010/, 'الرسالة تسمّي الطبلية المانعة');
  assert.match(p, /دورتها انتهت/);
});

test('★★ بند البنت يُبنى من بند الأمّ: المعامل والاسم يعبران فلا يضيع baseQty', () => {
  // المستدعي يمرّر الكمّيّة والهويّة فقط — كما تفعل شاشةٌ حقيقيّة.
  const bare = { sku: 'WNW-001', batch: 'B2408', expiry: '2027-01-01', uom: 'CTN', qty: 4 };
  const r = splitUnit(MOTHER, { takes: [bare], childCode: CHILD_CODE, actor: 'محمد' });
  assert.equal(r.problem, undefined);
  assert.equal(r.child.lines[0].factor, 12, 'المعامل من الأمّ لا من المستدعي');
  assert.equal(r.child.lines[0].baseQty, 48, 'فالكمّيّة الأساس محفوظةٌ عبر التقسيم');
  assert.equal(r.parent.lines.find((l) => l.sku === 'WNW-001').baseQty, 72, 'ومجموع الأمّ والبنت يساوي الأصل ١٢٠');
});

test('★ حالة الدمج الافتراضيّة يقبلها الكيان — لا افتراضيٌّ يفشل عند أوّل حفظ', () => {
  const a = { ...MOTHER, code: 'LPN-MAIN-20260826-000020', lines: [{ sku: 'WNW-001', batch: 'B2408', uom: 'CTN', factor: 12, qty: 2, baseQty: 24 }] };
  const b = { ...MOTHER, code: 'LPN-MAIN-20260826-000021', lines: [{ sku: 'WNW-001', batch: 'B2408', uom: 'CTN', factor: 12, qty: 3, baseQty: 36 }] };
  const r = mergeUnits([a, b], { mergedCode: 'LPN-MAIN-20260826-000022', actor: 'محمد' });
  assert.ok(['APPROVED', 'PICKING'].includes(r.merged.state), 'من حالتَي التجسيد اللتين تقبلهما الخدمة');
});
