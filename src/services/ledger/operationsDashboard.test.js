/**
 * اختبارات عقل لوحة القيادة — المؤشرات واللقطة والاستثناءات. منطق خالص.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN,
  REFERENCE_FRESH_MS,
  REFERENCE_STALE_MS,
  computeKpis,
  freshnessLevel,
  operationExceptions,
  operationsSnapshot,
  originOf,
  referenceFreshness,
  unmarkedCounters,
} from './operationsDashboard.js';
import { PULL_SCOPE_IDS } from '../odoo/pullRegistry.js';

const NOW = Date.parse('2026-07-27T00:00:00Z');
const ms = (iso) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

/* ───────────────── المؤشرات ───────────────── */

test('نسبة التنفيذ = المخصَّص ÷ المطلوب', () => {
  const docs = [
    { id: '1', type: 'SO', state: 'approved', soReserved: true, lines: [{ qty: 10 }], soAllocation: [{ qty: 6 }] },
    { id: '2', type: 'SO', state: 'approved', soReserved: true, lines: [{ qty: 10 }], soAllocation: [{ qty: 10 }] },
  ];
  const k = computeKpis(docs);
  assert.equal(k.fillRate, 0.8, '16 من 20');
  assert.equal(k.basis.requested, 20);
});

test('زمن دورة الطلب = متوسط الأيام من الأمر للتسليم', () => {
  const docs = [
    { id: 's1', type: 'SO', state: 'done', createdAt: ms('2026-07-10T00:00:00Z') },
    { id: 'd1', type: 'DN', state: 'done', links: { SO: { id: 's1' } }, postedAt: ms('2026-07-14T00:00:00Z') },
  ];
  const k = computeKpis(docs);
  assert.equal(k.cycleTimeDays, 4, 'أربعة أيام');
});

test('دقّة المخزون من محاضر الجرد المصادَقة', () => {
  const docs = [
    { id: 'c1', type: 'CC', state: 'done', lines: [{ bookQty: 100, count2: 98 }, { bookQty: 100, count2: 100 }] },
  ];
  const k = computeKpis(docs);
  // فرقٌ مطلق 2 من دفتريّ 200 ⇒ 99%
  assert.equal(k.inventoryAccuracy, 0.99);
});

test('دقّة التسليم = المستلَم ÷ المشحون عبر استلامات النقل', () => {
  const docs = [
    { id: 't1', type: 'TRC', state: 'done', lines: [{ qtyShipped: 50, qtyReceived: 48 }] },
  ];
  const k = computeKpis(docs);
  assert.equal(k.deliveryAccuracy, 0.96);
});

test('المؤشرات بلا بيانات ⇒ null لا صفرٌ مزيّف', () => {
  const k = computeKpis([]);
  assert.equal(k.fillRate, null);
  assert.equal(k.cycleTimeDays, null);
  assert.equal(k.inventoryAccuracy, null);
  assert.equal(k.deliveryAccuracy, null);
});

/* ───────────────── اللقطة ───────────────── */

test('اللقطة تعدّ المفتوح وتحسب تحت الحدّ الأدنى', () => {
  const docs = [
    { id: 'so1', type: 'SO', state: 'approved', soReserved: true, lines: [{ sku: 'A', qty: 5 }], soAllocation: [{ qty: 5 }] },
    { id: 'pk1', type: 'PICK', state: 'approved' },
    { id: 'pk2', type: 'PICK', state: 'done' }, // مُنجَز ⇒ ليس مفتوحًا
  ];
  const balances = [{ sku: 'A', warehouse: 'E5', qty: 2, qtyReserved: 0 }];
  const items = [{ sku: 'A', minStock: 10 }];
  const snap = operationsSnapshot(docs, balances, items);
  assert.equal(snap.warehouse.picking, 1, 'قائمة سحبٍ واحدة مفتوحة');
  assert.equal(snap.inventory.belowMin, 1, 'المتاح 2 < الحدّ 10');
  assert.equal(snap.sales.orders, 1);
});

/* ───────────────── الاستثناءات ───────────────── */

test('الاستثناءات تكشف الاعتماد المتأخّر وترتّب بالخطورة', () => {
  const docs = [
    { id: 'a1', type: 'GRN', number: 'GRN-1', state: 'submitted', updatedAt: ms('2026-07-20T00:00:00Z') }, // 7 أيام > مهلة يومين
  ];
  const ex = operationExceptions(docs, [], NOW, []);
  assert.ok(ex.some((e) => e.category === 'approval'), 'اعتمادٌ متأخّر يُكشف');
  assert.equal(ex[0].severity, 'high');
});

test('استثناء الرصيد المنتهي على رصيدٍ موجب', () => {
  const balances = [{ sku: 'A', warehouse: 'E5', qty: 5, expiry: '2026-07-01' }];
  const ex = operationExceptions([], balances, NOW, []);
  assert.ok(ex.some((e) => e.category === 'inventory' && e.title.includes('منتهي')), 'المنتهي يُكشف');
});

test('لا استثناءات من لا شيء', () => {
  assert.equal(operationExceptions([], [], NOW, []).length, 0);
});

/* ───────────────── نافذة المؤشرات الزمنية ───────────────── */

test('نافذة المؤشرات: تُسقط الأوامر الأقدم من windowDays', () => {
  const docs = [
    // داخل النافذة (قبل 10 أيام): 6 من 10
    { id: 'new', type: 'SO', state: 'approved', soReserved: true, createdAt: ms('2026-07-17T00:00:00Z'), lines: [{ qty: 10 }], soAllocation: [{ qty: 6 }] },
    // خارج النافذة (قبل 120 يومًا): لو حُسب لغيّر النسبة
    { id: 'old', type: 'SO', state: 'approved', soReserved: true, createdAt: ms('2026-03-29T00:00:00Z'), lines: [{ qty: 100 }], soAllocation: [{ qty: 100 }] },
  ];
  const k = computeKpis(docs, { nowMs: NOW, windowDays: 90 });
  assert.equal(k.fillRate, 0.6, 'الأمر القديم خارج النافذة لا يُحتسب');
  assert.equal(k.basis.requested, 10);
  assert.equal(k.basis.windowDays, 90);
});

test('نافذة المؤشرات: بلا نافذة (الوضع الافتراضي) تُحسب على الكلّ', () => {
  const docs = [
    { id: 'new', type: 'SO', state: 'approved', soReserved: true, createdAt: ms('2026-07-17T00:00:00Z'), lines: [{ qty: 10 }], soAllocation: [{ qty: 6 }] },
    { id: 'old', type: 'SO', state: 'approved', soReserved: true, createdAt: ms('2026-03-29T00:00:00Z'), lines: [{ qty: 10 }], soAllocation: [{ qty: 10 }] },
  ];
  const k = computeKpis(docs);
  assert.equal(k.fillRate, 0.8, '16 من 20 — القديم محسوب بلا نافذة');
  assert.equal(k.basis.windowDays, null);
});

test('نافذة المؤشرات: مستندٌ بلا تاريخ يُحتسب (لا نُسقط ما نجهله)', () => {
  const docs = [
    { id: 'noDate', type: 'SO', state: 'approved', soReserved: true, lines: [{ qty: 10 }], soAllocation: [{ qty: 5 }] },
  ];
  const k = computeKpis(docs, { nowMs: NOW, windowDays: 90 });
  assert.equal(k.fillRate, 0.5, 'بلا createdAt يبقى داخل الحساب');
});

/* ───── التشغيليّ والمرجعيّ ‹EXE-503› · ف ت‑١٢ ───── */

test('★★ لا عدّادَ في اللقطة بلا أصلٍ معلَن — لا لحظيًّا افتراضًا', () => {
  // عدّادٌ يُضاف بلا قرارِ أصلٍ يُعرض كأنّه لحظيّ وقد يكون مستورَدًا قبل أسبوع.
  const snap = operationsSnapshot(
    [{ id: '1', type: 'SO', state: 'approved', lines: [{ sku: 'A', qty: 5 }] }],
    [{ sku: 'A', warehouse: 'MAIN', qty: 2 }],
    [{ sku: 'A', minStock: 10 }]
  );
  assert.deepEqual(unmarkedCounters(snap), [], 'كلّ عدّادٍ يقول من أين جاء');
});

test('★★ الحدّ الأدنى مرجعيّ فالعدّاد مركَّب لا لحظيّ', () => {
  assert.equal(originOf('inventory.belowMin').id, ORIGIN.mixed.id);
  assert.equal(originOf('inventory.toBuy').id, ORIGIN.mixed.id);
  assert.equal(originOf('sales.pending').id, ORIGIN.live.id, 'وما بُني على مستنداتنا لحظيّ');
  assert.equal(originOf('inventory.zzz'), null, 'وغير المعلَن يُعاد فراغًا لا يُخمَّن');
});

test('★★ «لم يُسحب قطّ» تُعلَن ولا تُحذَّر — الأحمر الدائم يُهمَل فيسقط الصادق', () => {
  const never = referenceFreshness({}, NOW);
  assert.equal(never.level.id, 'never');
  assert.equal(never.warn, false, 'منشأةٌ لم تربط أودو لا تستحقّ شريطًا أحمر دائمًا');
  assert.match(never.level.label, /المرجع محلّيّ/, 'ويُقال السبب: الحدود من إدخالٍ محلّيّ');
  assert.match(never.master.ageLabel, /لم يُسحب/);
});

test('★★ المتقادم وحده يُحذَّر — لأنّه يُعرف أنّه يزحف', () => {
  const stale = referenceFreshness({ events: [{ kind: 'pull', sourceType: 'item', ts: NOW - REFERENCE_STALE_MS - 1 }] }, NOW);
  assert.equal(stale.level.id, 'stale');
  assert.equal(stale.warn, true);
});

test('قِدَم المرجعيّ ثلاث درجات بحدودٍ معلنة', () => {
  const at = (ms) => referenceFreshness({ events: [{ kind: 'pull', sourceType: 'item', ts: NOW - ms }] }, NOW).level.id;
  assert.equal(at(60000), 'fresh', 'قبل دقيقة');
  assert.equal(at(REFERENCE_FRESH_MS + 1000), 'aging');
  assert.equal(at(REFERENCE_STALE_MS + 1000), 'stale');
  assert.equal(freshnessLevel(null, NOW).id, 'never');
});

test('★★ زمن ماستر الأصناف من سجلّ الأحداث — لا سطرَ له في حالة السحب', () => {
  const f = referenceFreshness({
    events: [
      { kind: 'pull', sourceType: 'item', ts: NOW - 3 * 3600000 },
      { kind: 'push', sourceType: 'item', ts: NOW - 60000 },
    ],
  }, NOW);
  assert.equal(f.master.ms, NOW - 3 * 3600000, 'والدفع ليس سحبًا فلا يُحدِّث المرجع');
  assert.match(f.label, /ماستر الأصناف/);
  assert.match(f.label, /قبل 3 ساعات/);
});

test('مرايا السحب تُقرأ من حالتها ويُعلَن خطؤها', () => {
  const f = referenceFreshness({
    pullState: [{ scope: 'accounts', lastPulledAt: ms('2026-07-26T22:00:00Z'), lastCount: 40, lastError: 'انقطع الاتصال' }],
  }, NOW);
  const accounts = f.scopes.find((s) => s.id === 'accounts');
  assert.equal(accounts.count, 40);
  assert.equal(accounts.error, 'انقطع الاتصال');
  assert.equal(accounts.level, 'aging', 'قبل ساعتين');
  assert.equal(f.oldest.id, 'accounts', 'وهو الأقدم لأنّ غيره لم يُسحب');
});

test('كلّ نطاقات السحب معروضةٌ بأسمائها من سجلّها لا بجدولٍ ثانٍ', () => {
  const f = referenceFreshness({}, NOW);
  assert.equal(f.scopes.length, PULL_SCOPE_IDS.length);
  for (const s of f.scopes) assert.ok(s.label && s.label !== s.id, `${s.id} بلا تسميةٍ عربيّة`);
});
