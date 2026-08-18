/**
 * حارس الإغلاق اليوميّ ‹FNB-803›.
 *
 * أخطر ما يحرسه: **لا يُغلق يومٌ وله فرقٌ بلا سبب** (إغلاقٌ فوقه يجعل رصيد
 * الغد يبدأ كاذبًا)، و**الإغلاق ملحق-فقط** فالتصحيح سجلٌّ جديد يشير للأوّل،
 * و**حدُّ ق‑ت٢**: التحصيل وطرق الدفع إشارةٌ من أودو لا دفترٌ ثانٍ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSE_ELEMENTS, elementsBy, buildDailyClose, closeVerdict,
  correctionOf, missingCloseException, closeSummary, CLOSE_GRACE_DAYS,
} from './dailyClose.js';
import { EXCEPTION_TYPES } from '../ledger/exceptions.js';
import { FINANCE_OWNER } from '../odoo/financialImpact.js';

const DOCS = [
  { type: 'RET', date: '2026-08-18', lines: [{ qty: 3 }] },
  { type: 'DMG', date: '2026-08-18', lines: [{ qty: 5 }] },
  { type: 'TR', date: '2026-08-18', lines: [{ qty: 40 }, { qty: 10 }] },
  { type: 'TRC', date: '2026-08-18', lines: [{ qtyReceived: 48 }] },
  { type: 'CC', date: '2026-08-18', lines: [{ variance: -2 }] },
  { type: 'RET', date: '2026-08-17', lines: [{ qty: 99 }] }, // يومٌ آخر — لا يتسرّب.
];

test('★ العناصر العشرة معلَنةٌ بمالكِ كلٍّ منها — وحدُّ ق‑ت٢ محروس', () => {
  assert.equal(CLOSE_ELEMENTS.length, 10);
  // التحصيل وطرق الدفع والمبيعات إشارةٌ من أودو لا دفترٌ ثانٍ.
  const mirrored = elementsBy(FINANCE_OWNER);
  assert.ok(mirrored.includes('collection'));
  assert.ok(mirrored.includes('paymentMethods'));
  assert.ok(mirrored.includes('sales'));
  // وساعات العمالة تُقرأ من labor_tasks — لا إدخالَ يدويّ.
  assert.equal(CLOSE_ELEMENTS.find((e) => e.key === 'laborHours').source, 'labor_tasks بأختام الخادم');
});

test('★ السجلّ يُبنى من مستندات اليوم وحده — ولا يتسرّب يومٌ آخر', () => {
  const r = buildDailyClose({ branch: 'BR01', date: '2026-08-18' }, { documents: DOCS, laborHours: 26 });
  assert.deepEqual(r.problems, []);
  assert.equal(r.elements.returns.qty, 3, 'مرتجع الأمس تسرّب');
  assert.equal(r.elements.waste.qty, 5);
  assert.equal(r.elements.stockRequests.qty, 50);
  assert.equal(r.elements.transfers.qty, 48);
  assert.equal(r.elements.shortCount.variance, -2);
  assert.equal(r.elements.laborHours, 26);
});

test('الغائب يُسمّى — سجلٌّ ناقصٌ يُعلَن خيرٌ من سجلٍّ يبدو كاملًا', () => {
  const r = buildDailyClose({ branch: 'BR01', date: '2026-08-18' }, { documents: DOCS });
  assert.ok(r.missing.includes('sales'), 'المبيعات لم تصل من المرآة');
  assert.ok(r.missing.includes('laborHours'));
  assert.ok(!r.missing.includes('returns'), 'المحسوب لا يُعدّ ناقصًا');
});

test('★★ لا يُغلق يومٌ وله فرقُ جردٍ بلا سبب', () => {
  const r = buildDailyClose({ branch: 'BR01', date: '2026-08-18' }, { documents: DOCS, laborHours: 26 });
  const blocked = closeVerdict(r);
  assert.equal(blocked.ok, false);
  assert.match(blocked.problems[0], /فرقُ جردٍ/);
  assert.match(blocked.problems[0], /رصيد الغد يبدأ كاذبًا/);

  // وبسببٍ مكتوب يمرّ.
  assert.equal(closeVerdict(r, { reason: 'كسرٌ أُثبت بمحضر' }).ok, true);
});

test('وبلا فرقٍ يُغلق مباشرةً — والمغلَق لا يُغلق مرّتين', () => {
  const clean = buildDailyClose({ branch: 'BR01', date: '2026-08-18' }, { documents: [], laborHours: 8 });
  assert.equal(closeVerdict(clean).ok, true);
  assert.equal(closeVerdict({ ...clean, closed: true }).ok, false);
});

test('★ عناصرُ الفرع نفسه غيابُها إهمالٌ لا انقطاعُ مرآة', () => {
  const noLabor = buildDailyClose({ branch: 'BR01', date: '2026-08-18' }, { documents: [] });
  const v = closeVerdict(noLabor);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /ساعات العمالة/);
  // وغيابُ المبيعات (مرآة أودو) وحده لا يمنع الإغلاق.
  assert.equal(closeVerdict(noLabor, { force: true }).ok, true);
});

test('★★ الإغلاق ملحق-فقط: التصحيح سجلٌّ جديد يشير إلى الأوّل', () => {
  const closed = { id: 'BR01-2026-08-18', branch: 'BR01', date: '2026-08-18', closed: true, elements: {} };
  const fix = correctionOf(closed, { elements: { waste: { count: 1, qty: 9 } } });
  assert.equal(fix.ok, true);
  assert.equal(fix.record.correctsRef, 'BR01-2026-08-18');
  assert.equal(fix.record.closed, false, 'التصحيح يبدأ مفتوحًا ليُغلق بحكمه');
  // وسجلٌّ لم يُغلق يُعدَّل مباشرةً ولا يحتاج تصحيحًا.
  assert.equal(correctionOf({ ...closed, closed: false }).ok, false);
});

test('★ يومٌ بلا إغلاقٍ يظهر استثناءً بعد مهلته — من النوع القائم', () => {
  assert.equal(missingCloseException('BR01', '2026-08-18', { today: '2026-08-19' }), null, 'داخل المهلة');
  const late = missingCloseException('BR01', '2026-08-18', { today: '2026-08-25' });
  assert.ok(late);
  assert.equal(late.type, 'approval_stale');
  assert.ok(EXCEPTION_TYPES.approval_stale, 'النوع مبنيٌّ من قبل — لا صنفٌ جديد');
  assert.match(late.reason, /سجلٌّ يُنسى لا يُقرأ/);
  assert.equal(CLOSE_GRACE_DAYS, 1);
});

test('الملخّص يرفع غير المُغلق أوّلًا ثمّ الأكثر نقصًا', () => {
  const rows = closeSummary([
    { branch: 'BR01', date: '2026-08-18', closed: true, missing: [], elements: {} },
    { branch: 'BR02', date: '2026-08-18', closed: false, missing: ['sales'], elements: {} },
    { branch: 'BR03', date: '2026-08-18', closed: false, missing: ['sales', 'laborHours'], elements: {} },
  ]);
  assert.deepEqual(rows.map((r) => r.branch), ['BR03', 'BR02', 'BR01']);
});
