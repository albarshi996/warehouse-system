/**
 * اختبارات مطابقة المخزون — المستوى يُختار من الشيت، والفرق لا يُصلَح صامتًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS_LABELS,
  detectLevel,
  locationMismatch,
  reconcile,
  referenceCoverage,
  toCountDraft,
  variances,
} from './reconcile.js';

const sys = (over = {}) => ({ snapshotDate: '2026-08-16', warehouse: 'E5', sku: 'A', barcode: '629', description: 'زيت', systemQty: 100, ...over });
const phy = (over = {}) => ({ warehouse: 'E5', sku: 'A', barcode: '629', nameAr: 'زيت', qty: 100, bin: 'E5-A01-R01', ...over });

test('★★ المستوى يُختار من الشيت لا بافتراضٍ منّا', () => {
  assert.deepEqual(detectLevel([sys()]), { byLocation: false, byBatch: false });
  assert.deepEqual(detectLevel([sys({ batch: 'B1' })]), { byLocation: false, byBatch: true });
  assert.deepEqual(detectLevel([sys({ systemLocation: 'WH/Stock' })]), { byLocation: true, byBatch: false });
});

test('★★ شيتٌ بلا مواقع: الفعليّ يُجمَّع إلى مستوى الصنف والمستودع', () => {
  // رفّان عندنا ورقمٌ واحد في النظام — ومقارنةُ مفصَّلٍ بمجمَل تُنتج فروقًا
  // كاذبة بعدد الرفوف. التجميع قبل الطرح هو ما يمنعها.
  const r = reconcile([sys({ systemQty: 100 })], [phy({ qty: 60, bin: 'E5-A01-R01' }), phy({ qty: 40, bin: 'E5-A02-R09' })]);
  assert.equal(r.rows.length, 1, 'صفٌّ واحد لا صفّان');
  assert.equal(r.rows[0].physicalQty, 100);
  assert.equal(r.rows[0].variance, 0);
  assert.equal(r.rows[0].status, 'match');
});

test('★★ الأرقام الثلاثة منفصلة — لا رقمٌ واحد اسمه «الرصيد»', () => {
  const r = reconcile([sys({ systemQty: 75 })], [phy({ qty: 80 })]);
  assert.deepEqual(
    { systemQty: r.rows[0].systemQty, physicalQty: r.rows[0].physicalQty, variance: r.rows[0].variance },
    { systemQty: 75, physicalQty: 80, variance: 5 }
  );
  assert.equal(r.rows[0].status, 'surplus');
});

test('العجز والزيادة والمفقود من كلّ جهة يُصنَّفون لا يُجمَعون رقمًا', () => {
  const r = reconcile(
    [sys({ sku: 'A', systemQty: 100 }), sys({ sku: 'B', systemQty: 50 }), sys({ sku: 'C', systemQty: 10 })],
    [phy({ sku: 'A', qty: 90 }), phy({ sku: 'B', qty: 55 }), phy({ sku: 'D', qty: 7 })]
  );
  const by = Object.fromEntries(r.rows.map((x) => [x.sku, x.status]));
  assert.equal(by.A, 'shortage');
  assert.equal(by.B, 'surplus');
  assert.equal(by.C, 'missing-in-portal', 'يعرفه النظام ولا وجود له عندنا');
  assert.equal(by.D, 'missing-in-system', 'عندنا ولا يعرفه النظام');
  assert.equal(r.summary.matched, 0);
  assert.equal(r.summary.netVariance, -10 + 5 - 10 + 7);
});

test('المطابقة بالدفعة حين يحملها الشيت', () => {
  const r = reconcile(
    [sys({ batch: 'B1', systemQty: 60 }), sys({ batch: 'B2', systemQty: 40 })],
    [phy({ batch: 'B1', qty: 60 }), phy({ batch: 'B2', qty: 35 })]
  );
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows.find((x) => x.batch === 'B2').variance, -5);
  assert.equal(r.rows.find((x) => x.batch === 'B1').status, 'match');
});

test('★★ حدُّ المقارنة يُعلَن حين لا تطابق مواقع النظام رفوفنا', () => {
  // مواقع أودو (WH/Stock) ليست رفوفنا (E5-A01-R01) — والمقارنة بالموقع
  // عندها تُنتج «فروقًا» بعدد الرفوف وهي وهمٌ كامل.
  const r = reconcile([sys({ systemLocation: 'WH/Stock' })], [phy()]);
  const note = locationMismatch(r, ['E5-A01-R01', 'E5-A02-R09']);
  assert.match(note, /تُنتج فروقًا وهميّة/);
  assert.match(note, /اترك عمود موقع النظام فارغًا/, 'ويقول العلاج');
});

test('لا حدَّ يُعلَن حين تتطابق المواقع أو حين لا تُقارَن بالموقع', () => {
  const matching = reconcile([sys({ systemLocation: 'E5-A01-R01' })], [phy()]);
  assert.equal(locationMismatch(matching, ['E5-A01-R01']), '');
  const noLoc = reconcile([sys()], [phy()]);
  assert.equal(locationMismatch(noLoc, ['E5-A01-R01']), '', 'بلا مقارنةٍ بالموقع لا حدّ');
});

test('★★ الفرق يتحوّل إلى محضر جرد CC لا إلى تسويةٍ مباشرة', () => {
  // البوابة لا تكتب في أيّ نظامٍ خارجيّ، والتسوية لا تمرّ بلا سند:
  // CC يُعتمد أوّلًا ثمّ يُشتقّ منه ADJ — وحارس adjustmentVerdict القائم
  // يشترط محضرًا معتمَدًا وسببًا لكلّ بند.
  const r = reconcile([sys({ systemQty: 100 })], [phy({ qty: 90 })]);
  const draft = toCountDraft(r, { warehouse: 'E5' });
  assert.equal(draft.type, 'CC', 'لا ADJ مباشرةً');
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].bookQty, 100, 'الدفتريّ = رصيد النظام');
  assert.equal(draft.lines[0].count2, 90, 'والمعدود = الفعليّ عندنا');
  assert.match(draft.lines[0].notes, /فرق -10/);
  assert.match(draft.header.notes, /مطابقة لقطة النظام بتاريخ 2026-08-16/);
});

test('المطابق لا يدخل محضر الجرد — لا يُطلب من أحدٍ عدّ ما لا فرق فيه', () => {
  const r = reconcile([sys(), sys({ sku: 'B', systemQty: 5 })], [phy(), phy({ sku: 'B', qty: 4 })]);
  assert.equal(variances(r).length, 1);
  assert.deepEqual(toCountDraft(r).lines.map((l) => l.sku), ['B']);
});

test('الترتيب بالأثر: أكبر فرقٍ أوّلًا', () => {
  const r = reconcile(
    [sys({ sku: 'A', systemQty: 100 }), sys({ sku: 'B', systemQty: 100 })],
    [phy({ sku: 'A', qty: 99 }), phy({ sku: 'B', qty: 50 })]
  );
  assert.equal(r.rows[0].sku, 'B', 'الفرق ‎-50 قبل ‎-1');
});

test('الملخّص يجمع الأعداد والكميّات وصافي الفرق', () => {
  const r = reconcile([sys({ systemQty: 100 })], [phy({ qty: 90 })]);
  assert.deepEqual(
    { lines: r.summary.lines, shortage: r.summary.shortage, systemQty: r.summary.systemQty, physicalQty: r.summary.physicalQty, net: r.summary.netVariance },
    { lines: 1, shortage: 1, systemQty: 100, physicalQty: 90, net: -10 }
  );
  assert.equal(r.snapshotDate, '2026-08-16');
});

test('لكلّ حالةٍ تسميةٌ عربيّة تقول معناها', () => {
  for (const k of ['match', 'surplus', 'shortage', 'missing-in-system', 'missing-in-portal']) {
    assert.ok(STATUS_LABELS[k] && STATUS_LABELS[k].length > 0, `${k} بلا تسمية`);
  }
});

test('المدخل الفارغ لا ينهار', () => {
  const r = reconcile([], []);
  assert.deepEqual(r.rows, []);
  assert.equal(r.summary.lines, 0);
  assert.deepEqual(toCountDraft(r).lines, []);
});


/* ═══ تغطية المرجع — حارس ق-٦ (وصل الطبقة 2026-08-24) ═══ */

test('★★ التغطية تفصل غيابَ التسجيل عن فرق البضاعة', () => {
  // صنفٌ يعرفه الطرفان بفرق · صنفٌ في النظام وحده · صنفٌ عندنا وحدنا.
  const report = reconcile(
    [sys({ sku: 'A', systemQty: 100 }), sys({ sku: 'B', systemQty: 50 })],
    [phy({ sku: 'A', qty: 90 }), phy({ sku: 'C', qty: 7 })]
  );
  const cov = referenceCoverage(report);
  assert.equal(cov.lines, 3);
  assert.equal(cov.both, 1, 'A وحده يعرفه الطرفان');
  assert.equal(cov.systemOnly, 1, 'B في النظام بلا رصيدٍ عندنا');
  assert.equal(cov.portalOnly, 1, 'C عندنا ولا يعرفه النظام');
  assert.equal(cov.pct, 33);
  assert.equal(cov.ready, false);
  assert.match(cov.note, /غيابُ تسجيلٍ لا فرقُ بضاعة/);
  assert.match(cov.note, /ق-٦/, 'يُنسب التأجيل إلى قرار المالك لا إلى رأيٍ منّا');
});

test('★ تغطيةٌ كاملة ⇒ جاهزةٌ وبلا ملاحظة', () => {
  const report = reconcile([sys({ sku: 'A', systemQty: 100 })], [phy({ sku: 'A', qty: 90 })]);
  const cov = referenceCoverage(report);
  assert.equal(cov.both, 1);
  assert.equal(cov.pct, 100);
  assert.equal(cov.ready, true);
  assert.equal(cov.note, '');
});

test('التغطية لا تنهار على تقريرٍ فارغ', () => {
  const cov = referenceCoverage(reconcile([], []));
  assert.equal(cov.lines, 0);
  assert.equal(cov.pct, 0);
  assert.equal(cov.ready, false);
  assert.match(cov.note, /ارفع لقطة النظام/);
  assert.deepEqual(referenceCoverage(null).lines, 0);
});

test('الفروقات المطابقة لا تُحسب غيابًا — النصف عتبةُ الجاهزيّة', () => {
  const report = reconcile(
    [sys({ sku: 'A', systemQty: 10 }), sys({ sku: 'B', systemQty: 20 })],
    [phy({ sku: 'A', qty: 11 }), phy({ sku: 'B', qty: 20 })]
  );
  const cov = referenceCoverage(report);
  assert.equal(cov.both, 2, 'المطابق والفرق كلاهما «يعرفه الطرفان»');
  assert.equal(cov.pct, 100);
  assert.equal(cov.ready, true);
});
