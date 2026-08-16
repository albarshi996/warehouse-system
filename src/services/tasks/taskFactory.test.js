/**
 * اختبارات مصنع المهامّ ‹EXE-102› — القرارات الأربعة تُحرَس هنا:
 *   ١ الاقتراح لا يُملأ في خانة الوجهة (العامل يختار الرفّ)
 *   ٢ الفاصل هو المنطقة — عاملٌ لممرّ
 *   ٣ النقص سطرٌ مفتوح لا صمت
 *   ٤ التوليد مرّةً واحدة — والمولَّد سابقًا يُترك ولا يُدهس
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateTasks, taskKey, workTypeForDoc, zoneOf } from './taskFactory.js';
import { lineGaps, workProgress } from './taskShape.js';
import { shapeLocation } from '../locations/locationsModel.js';

const NOW = Date.parse('2026-08-16T09:00:00Z');

// المواقع تمرّ بـ`shapeLocation` قبل الحفظ (هي التي تشتقّ `warehouse` من الكود)
// — فبذرةٌ تتخطّاها تختبر شكلًا لا يوجد في القاعدة.
const loc = (code, over = {}) => shapeLocation({ code, status: 'active', storageType: 'ambient', capacity: { qty: 100 }, ...over });
const bal = (over = {}) => ({ sku: 'WNW-001', qty: 50, warehouse: 'MAIN', bin: 'MAIN-A01-R01-B01', expiry: '2027-01-01', ...over });

const putawayDoc = (lines) => ({
  type: 'PUTAWAY',
  number: 'PUTAWAY-2026-0001',
  id: 'd1',
  header: { warehouse: 'MAIN' },
  lines,
});
const pickDoc = (lines) => ({ type: 'PICK', number: 'PICK-2026-0007', id: 'd2', header: { warehouse: 'MAIN' }, lines });

/* ── الخريطة بين المستند والعمل ────────────────────────────────── */

test('مستندٌ لا يولّد عملًا ميدانيًّا يُقال فيه ذلك ولا يُخترع له نوع', () => {
  assert.equal(workTypeForDoc('PUTAWAY'), 'putaway');
  assert.equal(workTypeForDoc('pick'), 'pick');
  assert.equal(workTypeForDoc('INV'), '');
  const r = generateTasks({ type: 'INV', number: 'INV-2026-0001' });
  assert.deepEqual(r.tasks, []);
  assert.match(r.problem, /لا يولّد مهامّ ميدانيّة/);
});

test('★★ لا حركة بلا مستند — مستندٌ بلا رقمٍ رسميّ لا يولّد', () => {
  const r = generateTasks(putawayDoc([{ sku: 'A', qty: 5 }]), {});
  assert.equal(r.tasks.length, 1);
  const r2 = generateTasks({ ...putawayDoc([{ sku: 'A', qty: 5 }]), number: '' }, {});
  assert.match(r2.problem, /لا حركة بلا مستند/);
});

/* ── القرار ١: الاقتراح لا يُملأ في الخانة ─────────────────────── */

test('★★ الوجهة تبقى مفتوحة والمرشّحون بجانبها — العامل يختار الرفّ', () => {
  const r = generateTasks(putawayDoc([{ sku: 'WNW-001', qty: 10, batch: 'B1' }]), {
    locations: [loc('MAIN-A01-R01-B01'), loc('MAIN-A01-R01-B02')],
    balances: [],
  });
  const line = r.tasks[0].work.lines[0];
  assert.equal(line.toBin, '', 'لو مُلئت لصار الاقتراح أمرًا وسقط سببُ التجاوز');
  assert.ok(r.tasks[0].advice[0].suggested.length > 0, 'والمرشّحون معروضون');
  assert.match(lineGaps(line, 'putaway')[0], /موقع الوجهة مفتوح/);
});

test('★ بلا سيّد مواقع لا يتوقّف التخزين — يُبنى العمل ويُقال سبب تعذّر الاقتراح', () => {
  const r = generateTasks(putawayDoc([{ sku: 'WNW-001', qty: 10 }]), { locations: [], balances: [] });
  assert.equal(r.tasks.length, 1, 'المهمّة تُبنى');
  assert.equal(r.tasks[0].advice[0].suggested.length, 0);
  assert.match(r.tasks[0].advice[0].problem, /سيّد المواقع فارغ/);
});

test('المرشّحون خارج الحمولة المخزَّنة — عونٌ للشاشة لا قرارٌ محفوظ', () => {
  const r = generateTasks(putawayDoc([{ sku: 'WNW-001', qty: 10 }]), { locations: [loc('MAIN-A01-R01-B01')], balances: [] });
  assert.equal('suggested' in r.tasks[0].work.lines[0], false);
});

/* ── القرار ٢: الفاصل هو المنطقة ───────────────────────────────── */

test('المنطقة تُشتقّ من الكود — والموقع المفتوح بلا منطقة', () => {
  assert.equal(zoneOf('MAIN-A01-R01-B09'), 'MAIN-A01');
  assert.equal(zoneOf(''), '');
});

test('★★ مستندٌ واحد يُنتج مهمّةً لكلّ منطقة — عاملٌ لممرّ', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-001', qty: 10 }, { sku: 'WNW-002', qty: 10 }]), {
    balances: [
      bal({ sku: 'WNW-001', bin: 'MAIN-A01-R01-B01', qty: 50 }),
      bal({ sku: 'WNW-002', bin: 'MAIN-A02-R05-B03', qty: 50 }),
    ],
    nowMs: NOW,
  });
  assert.equal(r.tasks.length, 2);
  assert.deepEqual(r.tasks.map((t) => t.group), ['MAIN-A01', 'MAIN-A02']);
  assert.equal(r.tasks[0].work.lines.length, 1);
});

test('التقسيم يُلغى بالطلب فتصير مهمّةً واحدة', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-001', qty: 10 }, { sku: 'WNW-002', qty: 10 }]), {
    balances: [bal({ sku: 'WNW-001', bin: 'MAIN-A01-R01-B01' }), bal({ sku: 'WNW-002', bin: 'MAIN-A02-R05-B03' })],
    nowMs: NOW,
    splitBy: 'none',
  });
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].work.lines.length, 2);
});

/* ── الإحالة لا النسخ ──────────────────────────────────────────── */

test('★★ ترتيب السحب هو مسار `pickPathOrder` نفسه — لا ترتيبٌ جديد يُطيل المشي', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-002', qty: 5 }, { sku: 'WNW-001', qty: 5 }]), {
    balances: [
      bal({ sku: 'WNW-002', bin: 'MAIN-A01-R09-B01' }),
      bal({ sku: 'WNW-001', bin: 'MAIN-A01-R01-B01' }),
    ],
    nowMs: NOW,
    splitBy: 'none',
  });
  assert.deepEqual(
    r.tasks[0].work.lines.map((l) => l.fromBin),
    ['MAIN-A01-R01-B01', 'MAIN-A01-R09-B01'],
    'مرتَّبٌ بالموقع لا بترتيب البنود'
  );
});

test('★★ السحب يتبع FEFO — الأقرب انتهاءً أوّلًا وقد يُقسَّم على رفّين', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-001', qty: 30 }]), {
    balances: [
      bal({ bin: 'MAIN-A01-R01-B02', qty: 20, batch: 'NEW', expiry: '2028-01-01' }),
      bal({ bin: 'MAIN-A01-R01-B01', qty: 20, batch: 'OLD', expiry: '2026-10-01' }),
    ],
    nowMs: NOW,
    splitBy: 'none',
  });
  const lines = r.tasks[0].work.lines;
  assert.equal(lines.length, 2, 'الكمّيّة قُسّمت على رفّين');
  const old = lines.find((l) => l.batch === 'OLD');
  assert.equal(old.qtyRequired, 20, 'الأقدم صلاحيةً يُستنفد أوّلًا');
  assert.equal(lines.find((l) => l.batch === 'NEW').qtyRequired, 10);
});

/* ── القرار ٣: النقص لا يُبتلع ─────────────────────────────────── */

test('★★ خصّص FEFO أقلّ من المطلوب: الفرق سطرٌ مفتوح ويُعاد في `shortages`', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-001', qty: 50 }]), {
    balances: [bal({ qty: 30 })],
    nowMs: NOW,
    splitBy: 'none',
  });
  const p = workProgress(r.tasks[0].work);
  assert.equal(p.totalRequired, 50, 'الخمسون كلّها ظاهرة — لا ثلاثون فقط');
  assert.equal(r.shortages.length, 1);
  assert.equal(r.shortages[0].qty, 20);
  const open = r.tasks[0].work.lines.find((l) => !l.fromBin);
  assert.equal(open.qtyRequired, 20, 'العشرون الناقصة سطرٌ بمصدرٍ مفتوح');
});

test('صنفٌ بلا رصيدٍ أصلًا يُعلَن ولا يُسقط المستند', () => {
  const r = generateTasks(pickDoc([{ sku: 'MISSING', qty: 7 }]), { balances: [], nowMs: NOW });
  assert.equal(r.tasks.length, 1);
  assert.equal(r.shortages[0].qty, 7);
  assert.equal(r.tasks[0].group, '', 'بلا منطقةٍ لأنّ مصدره مفتوح');
  assert.equal(r.tasks[0].groupLabel, 'بلا منطقة');
});

/* ── القرار ٤: التوليد مرّةً واحدة ─────────────────────────────── */

test('★★ إعادة الاعتماد لا تُنتج مهامَّ مكرّرة', () => {
  const doc = pickDoc([{ sku: 'WNW-001', qty: 10 }]);
  const opts = { balances: [bal()], nowMs: NOW };

  const first = generateTasks(doc, opts);
  assert.equal(first.tasks.length, 1);
  assert.deepEqual(first.skipped, []);

  const again = generateTasks(doc, { ...opts, existingKeys: first.tasks.map((t) => t.key) });
  assert.deepEqual(again.tasks, [], 'لا مهمّة جديدة');
  assert.deepEqual(again.skipped, first.tasks.map((t) => t.key), 'وتُترك ولا تُدهس — لعلّ عاملًا بدأها');
});

test('المفتاح ثابتٌ عبر التوليدات ومختلفٌ بين المناطق والمستندات', () => {
  assert.equal(taskKey({ docType: 'PICK', docNumber: 'PICK-2026-0007', group: 'MAIN-A01' }), 'PICK::PICK-2026-0007::MAIN-A01');
  assert.notEqual(
    taskKey({ docType: 'PICK', docNumber: 'PICK-2026-0007', group: 'MAIN-A01' }),
    taskKey({ docType: 'PICK', docNumber: 'PICK-2026-0007', group: 'MAIN-A02' })
  );
  assert.match(taskKey({ docType: 'PICK', docNumber: 'P-1', group: '' }), /::ALL$/);
});

test('منطقةٌ جديدة تُولَّد وحدها والباقي يُترك — التوليد الجزئيّ لا يُعيد الكلّ', () => {
  const doc = pickDoc([{ sku: 'WNW-001', qty: 5 }, { sku: 'WNW-002', qty: 5 }]);
  const opts = {
    balances: [bal({ sku: 'WNW-001', bin: 'MAIN-A01-R01-B01' }), bal({ sku: 'WNW-002', bin: 'MAIN-A02-R05-B03' })],
    nowMs: NOW,
  };
  const first = generateTasks(doc, opts);
  const partial = generateTasks(doc, { ...opts, existingKeys: [first.tasks[0].key] });
  assert.equal(partial.tasks.length, 1);
  assert.equal(partial.tasks[0].group, 'MAIN-A02');
  assert.deepEqual(partial.skipped, [first.tasks[0].key]);
});

/* ── النقل الداخليّ ────────────────────────────────────────────── */

test('النقل الداخليّ يأخذ طرفيه من البند وإلّا من رأس المستند', () => {
  const doc = {
    type: 'TRN',
    number: 'TRN-2026-0003',
    header: { warehouse: 'MAIN', fromBin: 'MAIN-A01-R01', toBin: 'MAIN-B02-R04' },
    lines: [{ sku: 'A', qty: 4 }, { sku: 'B', qty: 6, fromBin: 'MAIN-A03-R02' }],
  };
  const r = generateTasks(doc, { splitBy: 'none' });
  assert.equal(r.tasks[0].work.workType, 'transfer');
  assert.equal(r.tasks[0].work.lines[0].fromBin, 'MAIN-A01-R01', 'من الرأس');
  assert.equal(r.tasks[0].work.lines[1].fromBin, 'MAIN-A03-R02', 'والبند يغلب الرأس');
  assert.equal(r.tasks[0].work.lines[0].toBin, 'MAIN-B02-R04');
});

test('بندٌ بكمّيّةٍ صفر لا يصير مهمّة، ومستندٌ كلّه أصفار يُقال فيه ذلك', () => {
  const r = generateTasks(putawayDoc([{ sku: 'A', qty: 0 }, { sku: 'B', qty: 3 }]), {});
  assert.equal(r.tasks[0].work.lines.length, 1);
  const none = generateTasks(putawayDoc([{ sku: 'A', qty: 0 }]), {});
  assert.match(none.problem, /لا بندَ قابلًا للتنفيذ/);
});

test('العنوان يُقرأ في سطرٍ واحد بلا فتح المهمّة', () => {
  const r = generateTasks(pickDoc([{ sku: 'WNW-001', qty: 10 }]), { balances: [bal()], nowMs: NOW });
  assert.match(r.tasks[0].title, /سحب من الرفوف PICK-2026-0007/);
  assert.match(r.tasks[0].title, /1 بندًا/);
});
