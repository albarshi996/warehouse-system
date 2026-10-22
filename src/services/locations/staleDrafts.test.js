/**
 * ‹ODOO-ORD› مسوّداتُ أودو القديمة: القاعدةُ الضيّقة، والإلغاءُ بالمسار الجماعيّ وحده.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { STALE_CANCEL_NOTE, STALE_DRAFT_TYPES, isStaleOdooDraft, sourceDayOf, summarizeStale } from './staleDrafts.js';

/** مسودّةُ تخزينٍ بشكل ما كتبه `toDocumentDraft` في 19 أكتوبر. */
const putaway = (over = {}, header = {}) => ({
  id: 'D1', type: 'PUTAWAY', state: 'draft',
  header: { putawayDate: '2026-10-07', warehouse: 'WH001', sourceRef: 'WHNBE/IN/00001', sourceSystem: 'Odoo', ...header },
  ...over,
});
const pick = (header = {}) => ({
  id: 'D2', type: 'PICK', state: 'draft',
  header: { orderDate: '2026-10-19', warehouse: 'WH002', sourceRef: 'WHNTR/OUT/00012', sourceSystem: 'Odoo', ...header },
});

test('مسوّداتُ أودو قبل الافتتاح تُلغى: تخزينٌ وسحب', () => {
  assert.equal(isStaleOdooDraft(putaway()), true);
  assert.equal(isStaleOdooDraft(pick()), true, 'آخرُ يومٍ قبل الافتتاح');
  assert.equal(sourceDayOf(putaway({}, { putawayDate: '2026-10-07 13:21:19' })), '2026-10-07');
});

test('★★ وما سواها لا يُمسّ', () => {
  assert.equal(isStaleOdooDraft(pick({ orderDate: '2026-10-20' })), false, 'يومُ الافتتاح نفسُه بعد اللقطة');
  assert.equal(isStaleOdooDraft(putaway({ state: 'submitted' })), false, 'ما تقدّم في دورته قرارٌ آخر');
  assert.equal(isStaleOdooDraft(putaway({ state: 'canceled' })), false, 'الملغى لا يُلغى ثانيةً');
  assert.equal(isStaleOdooDraft(putaway({ type: 'SRI' })), false, 'المستندُ المُرحَّل ليس مسودّةَ تنفيذ');
  assert.equal(isStaleOdooDraft(putaway({ type: 'OSO' })), false);
  assert.equal(isStaleOdooDraft(putaway({}, { sourceSystem: '' })), false, 'أمرٌ أنشأه عاملٌ في البوّابة');
  assert.equal(isStaleOdooDraft(putaway({}, { sourceRef: ' ' })), false, 'بلا مرجعٍ لا خيطَ إلى أودو');
  assert.equal(isStaleOdooDraft(putaway({}, { putawayDate: '' })), false, 'بلا تاريخٍ لا حكم');
  assert.equal(isStaleOdooDraft(putaway({}, { putawayDate: '45937' })), false, 'رقمُ إكسل ليس تاريخًا');
  assert.equal(isStaleOdooDraft(null), false);
});

test('العددُ بالنوع', () => {
  assert.deepEqual(summarizeStale([putaway(), pick(), pick()]), { total: 3, byType: { PUTAWAY: 1, PICK: 2 } });
  assert.deepEqual(summarizeStale([]), { total: 0, byType: { PUTAWAY: 0, PICK: 0 } });
  assert.deepEqual([...STALE_DRAFT_TYPES], ['PUTAWAY', 'PICK']);
  assert.ok(STALE_CANCEL_NOTE.trim().length > 10, 'السببُ المقترح ليس فارغًا');
});

const source = (rel) =>
  fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('★★★ الإلغاءُ بمُنفِّذ الجماعيّ وحده — لا كتابةَ حالةٍ مباشرة', () => {
  const svc = source('./staleDraftsService.js');
  assert.match(svc, /planBulk\(rest, 'cancel', user, \{ note \}\)/);
  assert.match(svc, /await runBulk\(plan, \{/);
  assert.match(svc, /rest = plan\.deferred;/, 'ما تجاوز سقفَ الخمسين يُنفَّذ في دفعةٍ تالية');
  for (const fn of ['writeBatch', 'updateDoc', 'setDoc', 'runTransaction', 'deleteDoc', 'transitionDocument']) {
    assert.doesNotMatch(svc, new RegExp(`\\b${fn}\\s*\\(`), `${fn}() طريقٌ ثانٍ إلى الحالة`);
  }
  assert.match(svc, /\.filter\(\(d\) => isStaleOdooDraft\(d\)\)/, 'القاعدةُ الضيّقة تحكم ما يُعرض');
});

test('★★ اللوحةُ في تبويب الترحيل، لمن يملك الترحيل', () => {
  assert.match(source('../../components/brandzo-erp/locations/PostedImport.jsx'), /\{canPost && <StaleDraftsPanel profile=\{profile\} canAct=\{canPost\} \/>\}/);
});
