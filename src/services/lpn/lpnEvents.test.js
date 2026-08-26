/**
 * اختبارات سجلّ أحداث الطبلية — «سجلّ جميع انتقالاتها» وعدٌ يقوم على الملحق-فقط.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LPN_EVENT_TYPES,
  buildEvent,
  docEventId,
  eventProblem,
  orderEvents,
  reverseEvent,
  sessionEventId,
} from './lpnEvents.js';

const LPN = 'LPN-MAIN-20260826-000001';
const BASE = { type: 'READING_ADDED', lpn: LPN, actor: 'محمد', at: '2026-08-26T10:00:00Z', device: 'DEV-01' };

test('الحدث المكتمل يُبنى مجمَّدًا — ما دخل السجلّ لا تعدّله يدٌ بعدها', () => {
  const r = buildEvent({ ...BASE, doc: { type: 'GRN', number: 'GRN-2026-0032' }, details: { sku: 'WNW-001', qty: 12 } });
  assert.equal(r.problem, undefined);
  assert.ok(Object.isFrozen(r.event));
  assert.ok(Object.isFrozen(r.event.doc));
  assert.equal(r.event.label, 'قراءة صنف');
  assert.throws(() => {
    'use strict';
    r.event.actor = 'غيري';
  }, 'التجميد فعليّ لا شكليّ');
});

test('★★ لا حدث بلا نوعٍ معروفٍ أو فاعلٍ أو وقتٍ أو طبلية — سجلّ المجهول أسوأ من لا سجلّ', () => {
  assert.match(eventProblem({ ...BASE, type: 'HACKED' }), /غير معروف/);
  assert.match(eventProblem({ ...BASE, actor: ' ' }), /بلا فاعل/);
  assert.match(eventProblem({ ...BASE, at: '' }), /بلا وقت/);
  assert.match(eventProblem({ ...BASE, lpn: '' }), /بلا طبلية/);
  assert.equal(eventProblem(BASE), '');
});

test('أحداث السبب الإلزامي: تراجعٌ وإرجاعٌ ورفضٌ وإعادة طباعةٍ ووسمٌ — بلا سببٍ تُرفض', () => {
  for (const type of ['READING_REVERSED', 'RETURNED', 'REJECTED', 'LABEL_REPRINTED', 'FLAGGED', 'EXCEPTION']) {
    assert.match(eventProblem({ ...BASE, type }), /سببًا مكتوبًا/, `«${type}» يحتاج سببًا`);
    assert.equal(eventProblem({ ...BASE, type, reason: 'سببٌ مكتوب' }), '');
  }
});

test('★★ معرّف حدث المستند حتميّ docId__lpn — إعادة المعالجة تكتب فوق نفسها', () => {
  assert.equal(docEventId('GRN-2026-0032', LPN), `GRN-2026-0032__${LPN}`);
  assert.equal(docEventId('GRN-2026-0032', 'lpn-main-20260826-000001'), `GRN-2026-0032__${LPN}`, 'التطبيع قبل المعرّف');
  assert.equal(docEventId('', LPN), null);
});

test('★★ معرّف حدث الجلسة حتميّ lpn__device__seq — انقطاع الشبكة لا يضاعف القراءة', () => {
  assert.equal(sessionEventId(LPN, 'DEV-01', 7), `${LPN}__DEV-01__000007`);
  assert.equal(sessionEventId(LPN, 'DEV-01', 7), sessionEventId(LPN, 'DEV-01', 7), 'نفس المدخل نفس المعرّف — دائمًا');
  assert.equal(sessionEventId(LPN, '', 7), null);
  assert.equal(sessionEventId(LPN, 'DEV-01', -1), null);
});

test('التراجع حدثٌ جديد يسمّي أصله وسببه — والأصل لا يُمسّ', () => {
  const original = buildEvent({ ...BASE, details: { sku: 'WNW-001', qty: 12 } }).event;
  const r = reverseEvent(original, { reason: 'مسحتُ الكرتونة مرّتين', actor: 'محمد', at: '2026-08-26T10:05:00Z', originalId: 'EV-1' });
  assert.equal(r.problem, undefined);
  assert.equal(r.event.type, 'READING_REVERSED');
  assert.equal(r.event.details.reversedEventId, 'EV-1');
  assert.equal(original.details.qty, 12, 'الأصل باقٍ كما هو');

  const closed = buildEvent({ ...BASE, type: 'CLOSED' }).event;
  assert.match(reverseEvent(closed, { reason: 'س', actor: 'محمد', at: '2026-08-26T10:06:00Z' }).problem, /عن قراءةٍ فقط/);
});

test('الترتيب بالوقت ثم التسلسل — نسخةٌ مرتّبة والأصل لا يُعدَّل', () => {
  const events = [
    { at: '2026-08-26T10:02:00Z', seq: 1, type: 'CLOSED' },
    { at: '2026-08-26T10:00:00Z', seq: 2, type: 'READING_ADDED' },
    { at: '2026-08-26T10:00:00Z', seq: 1, type: 'CREATED' },
  ];
  const ordered = orderEvents(events);
  assert.deepEqual(ordered.map((e) => e.type), ['CREATED', 'READING_ADDED', 'CLOSED']);
  assert.equal(events[0].type, 'CLOSED', 'الأصل بترتيبه');
});

test('قائمة الأنواع تغطي رحلة خطة ٧ كاملة — من الإنشاء إلى الجرد', () => {
  for (const needed of ['CREATED', 'CLOSED', 'APPROVED', 'LABEL_PRINTED', 'LABEL_CONFIRMED', 'MOVED', 'PICKED_FROM', 'SPLIT', 'MERGED', 'COUNT_SEEN']) {
    assert.ok(needed in LPN_EVENT_TYPES, `«${needed}» في القائمة`);
  }
});
