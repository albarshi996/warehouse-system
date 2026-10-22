/**
 * ‹ODOO-ORD› تنظيفُ ما قبل الافتتاح: القاعدتان الضيّقتان، والإلغاءُ بالمسار الجماعيّ وحده.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CANCELABLE_STATES, STALE_CANCEL_NOTE, STALE_DRAFT_TYPES,
  createdDayOf, isPreOpeningPortalDoc, isStaleOdooDraft, sourceDayOf, staleGroupOf, summarizeStale,
} from './staleDrafts.js';

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
/** مستندٌ أُنشئ في البوّابة — طابعُ Firestore بـ`toMillis`. */
const at = (iso) => ({ toMillis: () => Date.parse(iso) });
const portal = (over = {}) => ({ id: 'P1', type: 'PO', state: 'approved', number: 'PO-2026-0002', header: { supplier: 'مورد اختبار مؤشرات 01' }, createdAt: at('2026-08-25T10:00:00Z'), ...over });

test('مسوّداتُ أودو قبل الافتتاح تُلغى: تخزينٌ وسحب', () => {
  assert.equal(isStaleOdooDraft(putaway()), true);
  assert.equal(isStaleOdooDraft(pick()), true, 'آخرُ يومٍ قبل الافتتاح');
  assert.equal(sourceDayOf(putaway({}, { putawayDate: '2026-10-07 13:21:19' })), '2026-10-07');
});

test('★★ وما سواها من أودو لا يُمسّ', () => {
  assert.equal(isStaleOdooDraft(pick({ orderDate: '2026-10-20' })), false, 'يومُ الافتتاح نفسُه بعد اللقطة');
  assert.equal(isStaleOdooDraft(putaway({ state: 'submitted' })), false, 'ما تقدّم في دورته قرارٌ آخر');
  assert.equal(isStaleOdooDraft(putaway({ state: 'canceled' })), false, 'الملغى لا يُلغى ثانيةً');
  assert.equal(isStaleOdooDraft(putaway({ type: 'SRI' })), false, 'المستندُ المُرحَّل ليس مسودّةَ تنفيذ');
  assert.equal(isStaleOdooDraft(putaway({}, { sourceRef: ' ' })), false, 'بلا مرجعٍ لا خيطَ إلى أودو');
  assert.equal(isStaleOdooDraft(putaway({}, { putawayDate: '' })), false, 'بلا تاريخٍ لا حكم');
  assert.equal(isStaleOdooDraft(putaway({}, { putawayDate: '45937' })), false, 'رقمُ إكسل ليس تاريخًا');
  assert.equal(isStaleOdooDraft(null), false);
});

test('مستنداتُ البوّابة التجريبيّة: مفتوحةٌ أُنشئت قبل الافتتاح', () => {
  assert.equal(isPreOpeningPortalDoc(portal()), true);
  assert.equal(isPreOpeningPortalDoc(portal({ state: 'draft' })), true);
  assert.equal(isPreOpeningPortalDoc(portal({ state: 'rejected' })), true);
  assert.equal(isPreOpeningPortalDoc(portal({ createdAt: at('2026-10-19T21:30:00Z') })), true, '23:30 بتوقيت ليبيا ليلةَ 19');
});

test('★★★ ولا يُمسّ: المنجَز · ما بعد الافتتاح · أوامرُ أودو المستورَدة · بلا طابع', () => {
  assert.equal(isPreOpeningPortalDoc(portal({ state: 'done' })), false, 'المنجَزُ لا يُلغى — أثرُه مُرحَّل');
  assert.equal(isPreOpeningPortalDoc(portal({ state: 'closed' })), false);
  assert.equal(isPreOpeningPortalDoc(portal({ createdAt: at('2026-10-19T22:30:00Z') })), false, '00:30 من 20 بتوقيت ليبيا عملٌ حقيقيّ');
  assert.equal(isPreOpeningPortalDoc(portal({ type: 'OSO', header: { sourceSystem: 'Odoo' } })), false, 'أمرُ أودو سجلٌّ يبقى');
  assert.equal(isPreOpeningPortalDoc(portal({ createdAt: undefined })), false, 'بلا طابعٍ لا حكم');
  assert.equal(createdDayOf({ createdAt: { seconds: Date.parse('2026-08-25T10:00:00Z') / 1000 } }), '2026-08-25');
  assert.equal(createdDayOf({ createdAt: '2026-10-19T22:06:43.645Z' }), '2026-10-20');
});

test('المجموعةُ والعدّ', () => {
  assert.equal(staleGroupOf(pick()), 'odooDraft');
  assert.equal(staleGroupOf(portal()), 'portalTrial');
  assert.equal(staleGroupOf(portal({ state: 'done' })), null);
  assert.deepEqual(summarizeStale([putaway(), pick(), portal()]), { total: 3, byGroup: { odooDraft: 2, portalTrial: 1 }, byType: { PUTAWAY: 1, PICK: 1, PO: 1 } });
  assert.deepEqual([...STALE_DRAFT_TYPES], ['PUTAWAY', 'PICK']);
  assert.deepEqual([...CANCELABLE_STATES], ['draft', 'rejected', 'approved']);
  assert.ok(STALE_CANCEL_NOTE.trim().length > 10, 'السببُ المقترح ليس فارغًا');
});

test('★★ حالاتُ الإلغاء هي جدولُ الإجراء الجماعيّ نفسُه — لو افترقا لعرضت اللوحةُ ما يرفضه المنفّذ', async () => {
  const { bulkActionFor } = await import('../documents/bulkActions.js');
  assert.deepEqual([...bulkActionFor('cancel').from].sort(), [...CANCELABLE_STATES].sort());
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
  assert.match(svc, /\.filter\(\(d\) => d\.staleGroup\)/, 'القاعدةُ الضيّقة تحكم ما يُعرض');
  assert.match(svc, /fromCache: Boolean\(snap\.metadata\?\.fromCache\)/, 'النتيجةُ تُعلن مصدرَها');
});

test('★★ اللوحةُ في تبويب الترحيل لمن يملكه — وتنذر حين تأتي النتيجةُ من الذاكرة', () => {
  assert.match(source('../../components/brandzo-erp/locations/PostedImport.jsx'), /\{canPost && <StaleDraftsPanel profile=\{profile\} canAct=\{canPost\} \/>\}/);
  assert.match(source('../../components/brandzo-erp/locations/StaleDraftsPanel.jsx'), /\{fromCache && \(/);
});
