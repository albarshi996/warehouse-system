/**
 * اختبارات استئناف الجلسة — منطق خالص بتخزينٍ محقون.
 *
 * الخاصّيّتان المحوريّتان:
 *   ★ **الجهاز يُرتّب ولا يُصرّح:** ما يُقرأ من التخزين يُقدّم سطرًا على سطر،
 *     ولا يُنتج حقَّ دخولٍ ولا يُدخل جلسةً ليست في قائمة الخادم.
 *   ★★ **المقفَلُ لا يُعرض:** زرٌّ يُضغط فيرتدّ إحباطٌ لا استئناف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recentSessions,
  rememberSession,
  forgetSession,
  resumeList,
  resumeLine,
  MAX_REMEMBERED,
} from './sessionResume.js';

function fakeStore(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

/* ───────────────── ذاكرة الجهاز ───────────────── */

test('يتذكّر جلسةً ويقرأها', () => {
  const s = fakeStore();
  rememberSession(s, { id: 'op1', code: 'H4K9TM', type: 'جرد' }, { now: 100 });
  const [row] = recentSessions(s);
  assert.equal(row.id, 'op1');
  assert.equal(row.code, 'H4K9TM');
  assert.equal(row.type, 'جرد');
  assert.equal(row.at, 100);
});

test('الأحدثُ أوّلًا', () => {
  const s = fakeStore();
  rememberSession(s, { id: 'a' }, { now: 10 });
  rememberSession(s, { id: 'b' }, { now: 50 });
  rememberSession(s, { id: 'c' }, { now: 30 });
  assert.deepEqual(recentSessions(s).map((r) => r.id), ['b', 'c', 'a']);
});

test('★ الدخولُ المتكرّر يُحدّث ولا يُنبت سطرًا ثانيًا', () => {
  const s = fakeStore();
  rememberSession(s, { id: 'op1' }, { now: 10 });
  rememberSession(s, { id: 'op1' }, { now: 90 });
  const rows = recentSessions(s);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].at, 90);
});

test('السقفُ يُسقط الأقدم', () => {
  const s = fakeStore();
  for (let i = 1; i <= 5; i++) rememberSession(s, { id: `op${i}` }, { now: i, max: 3 });
  assert.deepEqual(recentSessions(s).map((r) => r.id), ['op5', 'op4', 'op3']);
  assert.equal(MAX_REMEMBERED, 12);
});

test('بلا معرّفٍ لا يُكتب شيء', () => {
  const s = fakeStore();
  rememberSession(s, { code: 'H4K9TM' }, { now: 1 });
  rememberSession(s, null, { now: 1 });
  assert.deepEqual(recentSessions(s), []);
});

test('النسيان يُزيل جلسةً واحدة', () => {
  const s = fakeStore();
  rememberSession(s, { id: 'a' }, { now: 1 });
  rememberSession(s, { id: 'b' }, { now: 2 });
  forgetSession(s, 'a');
  assert.deepEqual(recentSessions(s).map((r) => r.id), ['b']);
});

/* ───────────────── لا ينهار ولا يُسقط ───────────────── */

test('★ تخزينٌ معطوبٌ أو ممنوعٌ أو غائب — يُقرأ فارغًا ولا يرمي', () => {
  assert.deepEqual(recentSessions(fakeStore({ bzMyOps: '{{{' })), []);
  assert.deepEqual(recentSessions(fakeStore({ bzMyOps: '{"a":1}' })), []);
  assert.deepEqual(recentSessions(null), []);
  assert.doesNotThrow(() => rememberSession(null, { id: 'a' }));
  assert.doesNotThrow(() => forgetSession(null, 'a'));
});

test('يُسقط السطورَ بلا معرّفٍ من محتوًى قديم', () => {
  const s = fakeStore({ bzMyOps: JSON.stringify([{ id: 'a' }, { code: 'X' }, null, { id: '' }]) });
  assert.deepEqual(recentSessions(s).map((r) => r.id), ['a']);
});

test('★ الكتابةُ التي ترمي لا تُسقط الدخول', () => {
  const s = fakeStore();
  s.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.doesNotThrow(() => rememberSession(s, { id: 'a' }, { now: 1 }));
});

/* ───────────────── ★ قائمة الاستئناف ───────────────── */

const OPS = [
  { id: 'op1', code: 'AAA111', type: 'جرد', status: 'open' },
  { id: 'op2', code: 'BBB222', type: 'استلام', status: 'open' },
  { id: 'op3', code: 'CCC333', type: 'جرد', status: 'open' },
];

test('★ جلساتي أوّلًا، والأحدثُ منها قبل الأقدم', () => {
  const list = resumeList(OPS, [
    { id: 'op3', at: 10 },
    { id: 'op2', at: 90 },
  ]);
  assert.deepEqual(list.map((o) => o.id), ['op2', 'op3', 'op1']);
  assert.equal(list[0].mine, true);
  assert.equal(list[2].mine, false, 'ما لم أدخله يُعرض ولا يُقدَّم');
});

test('★★ المقفَلُ لا يُعرض — زرٌّ يُضغط فيرتدّ إحباط', () => {
  const list = resumeList([...OPS, { id: 'op9', status: 'closed' }], []);
  assert.equal(list.find((o) => o.id === 'op9'), undefined);
});

test('★★ الجهازُ يُرتّب ولا يُصرّح — ذاكرةٌ لجلسةٍ ليست عند الخادم لا تُنتج سطرًا', () => {
  const list = resumeList(OPS, [{ id: 'وهمية', at: 999 }]);
  assert.equal(list.length, 3);
  assert.equal(list.find((o) => o.id === 'وهمية'), undefined);
  assert.deepEqual(list.map((o) => o.mine), [false, false, false]);
});

test('المكرَّرُ يُوحَّد بالمعرّف ولا يُدمج بالرمز', () => {
  const dup = [
    { id: 'op1', code: 'SAME11', status: 'open' },
    { id: 'op1', code: 'SAME11', status: 'open' },
    { id: 'op2', code: 'SAME11', status: 'open' },
  ];
  const list = resumeList(dup, []);
  assert.equal(list.length, 2, 'رمزان متطابقان لجلستين لا يُخفيان بدمجٍ صامت');
});

test('لا جلساتٍ = قائمةٌ فارغة (ولا انهيار على مُدخَلٍ غير قائمة)', () => {
  assert.deepEqual(resumeList([], []), []);
  assert.deepEqual(resumeList(null, null), []);
  assert.deepEqual(resumeList(undefined), []);
});

test('السطرُ بلا معرّفٍ يُسقط من قائمة الخادم', () => {
  assert.deepEqual(resumeList([{ code: 'X', status: 'open' }], []), []);
});

/* ───────────────── سطر الوصف ───────────────── */

test('يجمع النوعَ والنطاقَ ومن فتحها', () => {
  const line = resumeLine(
    { type: 'جرد', createdByName: 'محمد' },
    () => 'المستودع BEN'
  );
  assert.equal(line, 'جرد · المستودع BEN · فتحها محمد');
});

test('يُسقط الغائبَ ولا يترك فواصلَ يتيمة', () => {
  assert.equal(resumeLine({ type: 'جرد' }), 'جرد');
  assert.equal(resumeLine({}), '');
  assert.equal(resumeLine({ createdByName: '  ' }), '');
});
