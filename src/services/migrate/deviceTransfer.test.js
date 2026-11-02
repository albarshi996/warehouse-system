/**
 * اختبارات النقل بين الأجهزة (ن): حزمةٌ، معاينةٌ تُصنّف (جديد/محدَّث/تعارض/بلا
 * تغيير)، ومنعُ تكرار، وكشفُ تعارضِ نسختين بلا دهس، وتطبيقٌ بقرار.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTransferBundle,
  planTransferImport,
  applyTransferPlan,
  contentFingerprint,
  docUpdatedMillis,
  toPortable,
  APPEND_ONLY,
} from './deviceTransfer.js';
import { fromExportValue } from './importDump.js';

// طابعٌ حيٌّ كـmakeTimestamp المحلّيّ: مفاتيحُ دوالٍّ مملوكةٌ معدَّدة (تُسقَط في JSON).
const liveTs = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms, toDate: () => new Date(ms) });

const localIndex = (docs) => new Map(docs.map((d) => [d.id, { data: d.data, updatedAt: d.updatedAt }]));

test('★ البصمةُ تتجاهل الترتيبَ وطوابعَ التغيير، فالمحتوى المتطابق يُدمَج لا يُكرَّر', () => {
  assert.equal(
    contentFingerprint({ a: 1, b: 2, updatedAt: 100 }),
    contentFingerprint({ b: 2, a: 1, updatedAt: 999 }),
    'ترتيبُ المفاتيح وطابعُ التحديث لا يغيّران المحتوى',
  );
  assert.notEqual(contentFingerprint({ a: 1 }), contentFingerprint({ a: 2 }));
});

test('★ مِلّي التحديث يُقرأ الطابعَ بأشكاله: رقمٌ · {seconds,nanoseconds} · {__ts__} · محمول', () => {
  assert.equal(docUpdatedMillis({ updatedAt: 1700 }), 1700);
  assert.equal(docUpdatedMillis({ updatedAt: { seconds: 5, nanoseconds: 0 } }), 5000);
  assert.equal(docUpdatedMillis({ updatedAt: { __ts__: 1700 } }), 1700);
  assert.equal(docUpdatedMillis({ updatedAt: { __type: 'timestamp', iso: '2026-10-21T00:00:00Z' } }), Date.parse('2026-10-21T00:00:00Z'));
  assert.equal(docUpdatedMillis({}), 0);
});

test('★★ المعاينةُ تُصنّف: جديد · بلا تغيير · محدَّث (الواردُ أحدث) · تعارض', () => {
  const bundle = buildTransferBundle({
    documents: [
      { id: 'D1', data: { n: 'جديد' }, updatedAt: 500 },         // غيرُ موجودٍ محلّيًّا → جديد
      { id: 'D2', data: { n: 'ثابت' }, updatedAt: 999 },          // نفسُ المحتوى → بلا تغيير
      { id: 'D3', data: { n: 'وارد-أحدث' }, updatedAt: 800 },     // مختلفٌ والواردُ أحدث → محدَّث
      { id: 'D4', data: { n: 'وارد-أقدم' }, updatedAt: 100 },     // مختلفٌ والمحلّيُّ أحدث → تعارض
    ],
  }, { device: 'جهاز-أ' });

  const local = {
    documents: localIndex([
      { id: 'D2', data: { n: 'ثابت' }, updatedAt: 200 },
      { id: 'D3', data: { n: 'محلّيّ-قديم' }, updatedAt: 400 },
      { id: 'D4', data: { n: 'محلّيّ-أحدث' }, updatedAt: 700 },
    ]),
  };

  const plan = planTransferImport(bundle, local);
  assert.deepEqual(plan.summary, { total: 4, new: 1, update: 1, unchanged: 1, conflict: 1 });
  assert.equal(plan.device, 'جهاز-أ');
  assert.equal(plan.actionable, 2, 'الجديدُ والمحدَّثُ يُطبَّقان، والتعارضُ يحتاج حلًّا');
  assert.equal(plan.items.find((i) => i.id === 'D1').status, 'new');
  assert.equal(plan.items.find((i) => i.id === 'D2').status, 'unchanged');
  assert.equal(plan.items.find((i) => i.id === 'D3').status, 'update');
  assert.equal(plan.items.find((i) => i.id === 'D4').status, 'conflict');
});

test('★★★ المجموعةُ الملحقة-فقط: اختلافُ محتوى معرّفٍ تعارضٌ لا تحديثٌ ولو كان الواردُ أحدث', () => {
  const bundle = buildTransferBundle({
    scans: [{ id: 'S1', data: { code: 'A', qty: 9 }, updatedAt: 9999 }],
  });
  const local = { scans: localIndex([{ id: 'S1', data: { code: 'A', qty: 5 }, updatedAt: 1 }]) };
  const plan = planTransferImport(bundle, local);
  assert.equal(plan.items[0].status, 'conflict', 'سجلٌّ ملحق-فقط لا يُدهَس وإن بدا الواردُ أحدث');
  assert.ok(APPEND_ONLY.has('scans'));
});

test('★★ التطبيقُ: الجديدُ والمحدَّثُ يُكتبان، والتعارضُ يُبقي المحلّيَّ افتراضًا (لا دهسَ صامت)', () => {
  const bundle = buildTransferBundle({
    documents: [
      { id: 'D1', data: { n: 'جديد' }, updatedAt: 5 },
      { id: 'D3', data: { n: 'وارد-أحدث' }, updatedAt: 800 },
      { id: 'D4', data: { n: 'وارد' }, updatedAt: 100 },
    ],
  });
  const local = {
    documents: localIndex([
      { id: 'D3', data: { n: 'قديم' }, updatedAt: 400 },
      { id: 'D4', data: { n: 'محلّيّ-أحدث' }, updatedAt: 700 },
    ]),
  };
  const plan = planTransferImport(bundle, local);

  // بلا قراراتٍ: الجديدُ يُضاف، المحدَّثُ يُؤخَذ، التعارضُ يبقى محلّيًّا (لا op له).
  const d = applyTransferPlan(plan);
  assert.deepEqual(d.report, { applied: 2, added: 1, updated: 1, conflictsTaken: 0, conflictsKept: 1, appendOnlyBlocked: 0, unchanged: 0 });
  assert.deepEqual(d.ops.map((o) => o.id).sort(), ['D1', 'D3']);
  assert.equal(d.ops.find((o) => o.id === 'D3').data.n, 'وارد-أحدث');

  // بحلٍّ صريح: أخذُ التعارض D4 وإبقاءُ المحدَّث D3.
  const r = applyTransferPlan(plan, { resolutions: { 'documents/D4': 'take', 'documents/D3': 'keep' } });
  assert.deepEqual(r.ops.map((o) => o.id).sort(), ['D1', 'D4']);
  assert.equal(r.report.conflictsTaken, 1);
  assert.equal(r.report.updated, 0, 'المحدَّثُ أُبقي بقرار keep');
});

test('★★★ الملحق-فقط مقدّس: تعارضُه لا يُدهَس ولو طُلب أخذُه، والجديدُ يُلحَق', () => {
  const bundle = buildTransferBundle({
    scans: [
      { id: 'S1', data: { code: 'A', qty: 9 }, updatedAt: 9999 }, // تعارضٌ مع محلّيّ
      { id: 'S2', data: { code: 'B', qty: 3 }, updatedAt: 5 },     // جديد → يُلحَق
    ],
  });
  const local = { scans: localIndex([{ id: 'S1', data: { code: 'A', qty: 5 }, updatedAt: 1 }]) };
  const plan = planTransferImport(bundle, local);
  // حتّى بطلب الأخذ، التعارضُ الملحق-فقط يُحجَب ولا op له؛ والجديدُ يُلحَق.
  const r = applyTransferPlan(plan, { resolutions: { 'scans/S1': 'take' } });
  assert.equal(r.report.appendOnlyBlocked, 1);
  assert.equal(r.report.conflictsTaken, 0, 'لم يُدهَس السجلُّ المقدّس');
  assert.deepEqual(r.ops.map((o) => o.id), ['S2'], 'الجديدُ وحدَه أُلحِق');
});

test('★ الروابطُ تُحفظ: المستندُ يُنقَل كاملًا (shop/sector/links)', () => {
  const bundle = buildTransferBundle({
    documents: [{ id: 'D1', data: { type: 'EXP', shop: 'RH', header: { sector: 'أغذية' }, links: { PO: 'PO-1' } }, updatedAt: 5 }],
  });
  const [op] = applyTransferPlan(planTransferImport(bundle, {})).ops;
  assert.equal(op.data.shop, 'RH');
  assert.equal(op.data.header.sector, 'أغذية');
  assert.deepEqual(op.data.links, { PO: 'PO-1' });
});

/* ═══════════ الطوابعُ الزمنيّة عبر حدّ الـJSON (عطبُ المراجعة) ═══════════ */

test('★★★ البصمةُ توحّد أشكالَ الطابع: الحيُّ = المحمولُ = {seconds,nanoseconds}', () => {
  const ms = Date.parse('2026-01-15T10:00:00.000Z');
  const live = contentFingerprint({ createdAt: liveTs(ms), n: 'x' });
  const portable = contentFingerprint({ createdAt: { __type: 'timestamp', iso: new Date(ms).toISOString() }, n: 'x' });
  const parsed = contentFingerprint({ createdAt: { seconds: Math.floor(ms / 1000), nanoseconds: 0 }, n: 'x' });
  assert.equal(live, portable, 'الحيُّ والمحمولُ سواءٌ في البصمة');
  assert.equal(live, parsed, 'وكذلك {seconds,nanoseconds} بعد دورة JSON');
});

test('★★★ إعادةُ نقلِ مستندٍ بطابعٍ غيرِ متقلّب (createdAt) = «بلا تغيير» لا «تعارض»', () => {
  const ms = Date.parse('2026-01-15T10:00:00.000Z');
  // المحلّيُّ طابعٌ حيّ؛ والحزمةُ تُرمِّزه محمولًا عبر buildTransferBundle.
  const bundle = buildTransferBundle({ documents: [{ id: 'D1', data: { createdAt: liveTs(ms), n: 'ثابت' } }] });
  const local = { documents: localIndex([{ id: 'D1', data: { createdAt: liveTs(ms), n: 'ثابت' }, updatedAt: ms }]) };
  const plan = planTransferImport(bundle, local);
  assert.equal(plan.items[0].status, 'unchanged', 'لا تعارضَ زائفًا من اختلاف شكل الطابع');
  assert.equal(plan.summary.conflict, 0);
});

test('★★★ الشكلُ المحمولُ يَعبُر الـJSON ويُعاد بناؤه طابعًا (لا خريطةٌ عارية)', () => {
  const ms = Date.parse('2026-01-15T10:00:00.000Z');
  const portable = toPortable({ createdAt: liveTs(ms), n: 'x' });
  assert.deepEqual(portable.createdAt, { __type: 'timestamp', iso: new Date(ms).toISOString() }, 'طابعٌ حيٌّ ⟵ شكلٌ محمول');
  // دورةُ JSON ثمّ إعادةُ البناء بـfromExportValue (محوّلُ طابعٍ وهميّ).
  const roundTripped = JSON.parse(JSON.stringify(portable));
  const Timestamp = { fromMillis: (m) => ({ __rebuilt__: m }) };
  const rebuilt = fromExportValue(roundTripped, Timestamp);
  assert.deepEqual(rebuilt.createdAt, { __rebuilt__: ms }, 'يُعاد بناؤه طابعًا لا {seconds,nanoseconds} عارية');
});

test('★ docUpdatedMillis يقرأ الطابعَ الحيَّ والمحمولَ والرقم', () => {
  const ms = Date.parse('2026-01-15T10:00:00.000Z');
  assert.equal(docUpdatedMillis({ updatedAt: liveTs(ms) }), ms);
  assert.equal(docUpdatedMillis({ updatedAt: { __type: 'timestamp', iso: new Date(ms).toISOString() } }), ms);
  assert.equal(docUpdatedMillis({ updatedAt: 1700 }), 1700);
});

test('★ الحزمةُ تحصي وتَسِم، والفارغةُ لا ترمي', () => {
  const b = buildTransferBundle({ documents: [{ id: 'A', data: {} }] }, { device: 'ج', exportedAt: 123 });
  assert.equal(b.version, 1);
  assert.equal(b.docCount, 1);
  assert.equal(b.device, 'ج');
  assert.deepEqual(planTransferImport({}, {}).summary, { total: 0, new: 0, update: 0, unchanged: 0, conflict: 0 });
});
