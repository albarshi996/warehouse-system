/**
 * ★★ حارس قاعدة المالك (2026-08-14): **«كلّ ما له أثرٌ في البوابة يجب أن
 * يكون له تقرير»** — SAP-14 · يسدّ ف‑٤٧ ويمنع عودته.
 *
 * القاعدة تصير آليّةً هنا: كلّ نوع مستندٍ **له قاعدة ترحيلٍ مخزنيّة**
 * (أي أثرٌ حقيقيّ على البضاعة) يجب أن يظهر في تقريرٍ واحدٍ على الأقلّ.
 * ومن أضاف نوعًا ذا أثرٍ غدًا بلا تقرير — يسقط البناء قبل النشر.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { REPORTS, OPERATIONS_REPORTS } from './index.js';
import { POSTING_RULES } from '../ledger/postingRules.js';
import { readyTypes } from '../documents/schemas/index.js';

/** الأنواع التي تُنتجها التقارير فعلًا على بياناتٍ اصطناعيّة شاملة. */
function typesCoveredByReports() {
  const covered = new Set();
  // بياناتٌ اصطناعيّة: حركةٌ ومستندٌ **لكلّ** نوعٍ ذي أثر — فما يظهر في
  // صفوف تقريرٍ ما يُعدّ مغطّى، وما لا يظهر في أيٍّ منها يسقط الاختبار.
  const types = Object.keys(POSTING_RULES);
  const data = {
    moves: types.map((t, i) => ({
      id: `m${i}`, docType: t, docNumber: `${t}-1`, sku: 'A', nameAr: 'صنف',
      qty: 5, value: 50, from: 'E5', to: 'E2', batch: 'B1',
      postedAtDay: '2026-08-01', repName: 'سالم', tripRef: 'T1',
    })),
    documents: types.map((t, i) => ({
      id: `d${i}`, type: t, number: `${t}-1`, state: 'done',
      header: { warehouse: 'E5', issueDate: '2026-08-01' }, lines: [{ sku: 'A' }], postedMoves: 1,
    })),
    balances: [], ledger: [], items: [],
  };

  for (const def of Object.values(REPORTS)) {
    let rows = [];
    try {
      rows = def.rows(data, {}) || [];
    } catch {
      rows = [];
    }
    for (const r of rows) {
      for (const key of ['docType', 'type']) {
        const t = String(r?.[key] ?? '').trim();
        if (t) covered.add(t);
      }
    }
  }
  return covered;
}

test('★★ قاعدة المالك: كلّ نوعٍ له أثرٌ مخزنيّ له تقريرٌ يُظهره — بلا استثناء', () => {
  const covered = typesCoveredByReports();
  const missing = Object.keys(POSTING_RULES).filter((t) => !covered.has(t));
  assert.deepEqual(
    missing,
    [],
    `أنواعٌ لها أثرٌ في البوابة ولا تظهر في أيّ تقرير: ${missing.join(' · ')} — أضِف تقريرًا يُظهرها (operationsReports.js)`
  );
});

test('★★ سجلّ المستندات يغطّي كلّ نوعٍ جاهزٍ في النظام — لا نوعَ خارج التقارير', () => {
  const register = OPERATIONS_REPORTS.find((r) => r.id === 'documents-register');
  assert.ok(register, 'سجلّ المستندات موجود');
  const documents = readyTypes().map((t, i) => ({
    id: `d${i}`, type: t, number: `${t}-1`, state: 'draft', header: {}, lines: [],
  }));
  const rows = register.rows({ documents }, {});
  const shown = new Set(rows.map((r) => r.type));
  const missing = readyTypes().filter((t) => !shown.has(t));
  assert.deepEqual(missing, [], `أنواعٌ غائبة عن سجلّ المستندات: ${missing.join(' · ')}`);
});

test('★ التقارير التشغيليّة الخمسة مسجَّلةٌ في السجلّ العامّ بلا تكرار معرّف', () => {
  for (const def of OPERATIONS_REPORTS) {
    assert.equal(REPORTS[def.id], def, `${def.id} مسجَّل`);
    assert.ok(def.titleAr && def.group && def.roles?.length, `${def.id} مكتمل الوصف`);
  }
  assert.equal(OPERATIONS_REPORTS.length, 5);
});

test('★ تقرير المندوبين يحسب العهدة: المحمَّل − المُباع − المُرجَع', () => {
  const rep = OPERATIONS_REPORTS.find((r) => r.id === 'rep-activity');
  const moves = [
    { docType: 'VLD', repName: 'سالم', qty: 100, tripRef: 'T1', postedAtDay: '2026-08-01' },
    { docType: 'VSI', repName: 'سالم', qty: 60, value: 600, tripRef: 'T1', postedAtDay: '2026-08-02' },
    { docType: 'VRT', repName: 'سالم', qty: 30, tripRef: 'T1', postedAtDay: '2026-08-02' },
  ];
  const [row] = rep.rows({ moves }, {});
  assert.equal(row.loadedQty, 100);
  assert.equal(row.soldQty, 60);
  assert.equal(row.returnedQty, 30);
  assert.equal(row.onVanQty, 10, 'المتبقّي بالعهدة');
  assert.equal(row.soldValue, 600);
  assert.equal(row.trips, 1);
});

test('★ تقرير الفروع يوازن: وارد وصادر وصافٍ لكلّ موقع', () => {
  const branch = OPERATIONS_REPORTS.find((r) => r.id === 'branch-activity');
  const moves = [
    { docType: 'GRN', from: null, to: 'E5', qty: 100, value: 1000, postedAtDay: '2026-08-01' },
    { docType: 'TRN', from: 'E5', to: 'E2', qty: 40, value: 400, postedAtDay: '2026-08-03' },
  ];
  const rows = branch.rows({ moves }, {});
  const e5 = rows.find((r) => r.warehouse === 'E5');
  assert.equal(e5.inQty, 100);
  assert.equal(e5.outQty, 40);
  assert.equal(e5.netQty, 60);
  assert.equal(rows.find((r) => r.warehouse === 'E2').inQty, 40);
});
