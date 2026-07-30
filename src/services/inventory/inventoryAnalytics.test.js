/**
 * اختبارات تحليل المخزون — بياناتٌ اصطناعيةٌ حتميّة (`nowMs` مُمرَّر):
 * إعادة الطلب على الحدّ الأدنى، والراكد بأنواعه (لم يُصرف / متجاوزٌ النافذة /
 * نشطٌ لا يُحجب)، والتقييم بالفئات ومسعَّره.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonKey,
  lastOutflowByItem,
  reorderReport,
  stagnantReport,
  valuationReport,
  inventorySummary,
} from './inventoryAnalytics.js';

const DAY = 86400000;
const NOW = 1_760_000_000_000; // لحظةٌ ثابتة
const sec = (ms) => ({ seconds: Math.floor(ms / 1000) });

/** خروجٌ للخارج (from مخزن، to خالية). */
const outflow = (sku, ms, qty = 1) => ({ sku, from: 'E5', to: null, qty, postedAt: sec(ms) });
/** دخولٌ من الخارج (لا يُنهي الركود). */
const inflow = (sku, ms, qty = 1) => ({ sku, from: null, to: 'E5', qty, postedAt: sec(ms) });
/** نقلٌ داخليّ (لا يُعدّ صرفًا — لا يُنهي الركود). */
const transfer = (sku, ms, qty = 1) => ({ sku, from: 'E5', to: 'E2', qty, postedAt: sec(ms) });

const items = [
  { sku: 'A', nameAr: 'صنف نشط', balance: 5, minStock: 2, costPrice: 10, category: 'أدوات' },
  { sku: 'B', nameAr: 'تحت الحد', balance: 1, minStock: 4, costPrice: 20, category: 'أدوات' },
  { sku: 'C', nameAr: 'راكد بيع قديم', balance: 8, minStock: 0, costPrice: 5, category: 'مواد' },
  { sku: 'D', nameAr: 'لم يُصرف قط', balance: 3, minStock: 0, costPrice: 100, category: 'مواد' },
  { sku: 'E', nameAr: 'رصيد صفر', balance: 0, minStock: 0, costPrice: 50, category: 'مواد' },
  { sku: 'F', nameAr: 'بلا تكلفة', balance: 2, minStock: 0, costPrice: 0, category: 'أدوات' },
];

const moves = [
  outflow('A', NOW - 5 * DAY),      // نشط: صُرف قبل 5 أيام
  transfer('A', NOW - 1 * DAY),     // نقل داخليّ حديث (لا يُحتسب صرفًا)
  outflow('B', NOW - 3 * DAY),      // B تحت الحدّ لكنّه نشط
  outflow('C', NOW - 200 * DAY),    // C آخر صرفٍ قبل 200 يوم ⇒ راكد
  inflow('C', NOW - 2 * DAY),       // دخولٌ حديث لا يُنهي ركوده
  outflow('E', NOW - 10 * DAY),     // E صُرف حديثًا لكن رصيده صفر
];

/* ---------- canonKey ---------- */

test('canonKey يرفع الحالة وينظّف، ويسقط الفارغ', () => {
  assert.equal(canonKey({ sku: ' a1 ' }), 'A1');
  assert.equal(canonKey({ barcode: 'x.y' }), 'X-Y');
  assert.equal(canonKey({ sku: '', barcode: '' }), null);
});

/* ---------- lastOutflowByItem ---------- */

test('lastOutflowByItem يأخذ أحدث خروجٍ للخارج ويتجاهل الدخول والنقل الداخليّ', () => {
  const map = lastOutflowByItem(moves);
  assert.equal(map.get('A'), Math.floor((NOW - 5 * DAY) / 1000)); // النقل الداخليّ لم يُحدّثها
  assert.equal(map.has('D'), false); // لم يُصرف قط
});

/* ---------- reorderReport ---------- */

test('reorderReport يرصد ما رصيده ≤ حدّه الأدنى ويحصي بلا حدّ', () => {
  const r = reorderReport(items);
  assert.equal(r.count, 1);
  assert.equal(r.rows[0].sku, 'B');
  assert.equal(r.rows[0].shortfall, 3); // 4 − 1
  assert.equal(r.rows[0].orderValue, 60); // 3 × 20
  assert.equal(r.withoutMin, 4); // C D E F (A و B لهما حدّ)
});

/* ---------- stagnantReport ---------- */

test('stagnantReport يرصد الراكد ويستثني النشط والرصيد الصفر', () => {
  const r = stagnantReport(items, moves, NOW, { stagnantDays: 90 });
  const skus = r.rows.map((x) => x.sku).sort();
  assert.deepEqual(skus, ['C', 'D']); // C قديم الصرف · D لم يُصرف قط
  assert.ok(!skus.includes('A') && !skus.includes('B')); // نشطان
  assert.ok(!skus.includes('E')); // رصيده صفر
});

test('stagnantReport يميّز «لم يُصرف قط» ويحسب أيام الركود', () => {
  const r = stagnantReport(items, moves, NOW, { stagnantDays: 90 });
  const D = r.rows.find((x) => x.sku === 'D');
  const C = r.rows.find((x) => x.sku === 'C');
  assert.equal(D.daysIdle, null); // لم يُصرف قط
  assert.equal(C.daysIdle, 200);
  assert.equal(r.rows[0].sku, 'D'); // الأعلى قيمة أولًا: 3×100=300 قبل 8×5=40
  assert.equal(r.value, 340);
});

test('stagnantReport يحترم نافذةً أضيق', () => {
  const r = stagnantReport(items, moves, NOW, { stagnantDays: 4 });
  const skus = r.rows.map((x) => x.sku).sort();
  // بنافذة 4 أيام: A (صُرف قبل 5) يصير راكدًا أيضًا، وكذا C وD؛ B (قبل 3) يبقى نشطًا
  assert.ok(skus.includes('A') && skus.includes('C') && skus.includes('D'));
  assert.ok(!skus.includes('B'));
});

/* ---------- valuationReport ---------- */

test('valuationReport يجمع القيمة بالفئات ويحصي غير المسعَّر', () => {
  const v = valuationReport(items);
  // A 50 · B 20 · C 40 · D 300 · E 0 · F 0 = 410
  assert.equal(v.total, 410);
  assert.equal(v.itemsUnpriced, 1); // F تكلفته صفر
  assert.equal(v.itemsPriced, 5);
  assert.equal(v.categories[0].category, 'مواد'); // 340 > أدوات 70
  assert.equal(v.categories[0].value, 340);
});

/* ---------- inventorySummary ---------- */

test('inventorySummary يجمع الأرقام ويحسب حصّة الراكد', () => {
  const s = inventorySummary(items, moves, NOW, { stagnantDays: 90 });
  assert.equal(s.itemsTotal, 6);
  assert.equal(s.totalValue, 410);
  assert.equal(s.reorderCount, 1);
  assert.equal(s.stagnantCount, 2);
  assert.equal(s.stagnantValue, 340);
  assert.ok(Math.abs(s.stagnantShare - 340 / 410) < 1e-9);
});
