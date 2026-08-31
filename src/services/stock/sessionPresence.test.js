/**
 * اختبارات حضور الجلسة — منطق خالص.
 *
 * الخاصّيّتان المحوريّتان:
 *   ★★ **من دخل ولم يقرأ يظهر** — وهو طلبُ المالك بعينه، ولا يظهر اليوم لأنّ
 *      الجدول يُبنى من القراءات وحدها.
 *   ★ **ومن قرأ ولم يُسجَّل عضوًا يظهر أيضًا** — الجلساتُ المفتوحة قبل هذه
 *      المهمّة لا `members` لها، ومن يعدّ فيها الآن لا يجوز أن يختفي.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { presenceRows, presenceSummary, presenceLabel } from './sessionPresence.js';

const at = (m) => m?.ms ?? null;

const MEMBERS = [
  { uid: 'u1', name: 'محمد', ms: 1000 },
  { uid: 'u2', name: 'عبدالله', ms: 2000 },
  { uid: 'u3', name: 'رمزي', ms: 3000 },
];

const ROWS = [
  { byUid: 'u1', byName: 'محمد', base: 60, atMs: 5000 },
  { byUid: 'u1', byName: 'محمد', base: 12, atMs: 7000 },
  { byUid: 'u2', byName: 'عبدالله', base: 5, atMs: 6000 },
];

/* ───────────────── ★★ من دخل ولم يقرأ ───────────────── */

test('★★ رمزي دخل ولم يقرأ — ويظهر موسومًا', () => {
  const rows = presenceRows(MEMBERS, ROWS, { toMillis: at });
  const r = rows.find((x) => x.name === 'رمزي');
  assert.ok(r, 'موجودٌ رغم أنّه لم يمسح شيئًا');
  assert.equal(r.scans, 0);
  assert.equal(r.idle, true);
  assert.equal(r.joinedAt, 3000);
});

test('★ الصامتُ أوّلًا — فهو ما يحتاج سؤالَ المدير', () => {
  const rows = presenceRows(MEMBERS, ROWS, { toMillis: at });
  assert.equal(rows[0].name, 'رمزي');
});

test('يجمع قراءاتِ كلّ عضوٍ وإجماليَّه بالأساس وآخرَ وقت', () => {
  const rows = presenceRows(MEMBERS, ROWS, { toMillis: at });
  const m = rows.find((x) => x.name === 'محمد');
  assert.equal(m.scans, 2);
  assert.equal(m.base, 72);
  assert.equal(m.lastAt, 7000, 'الأحدثُ يفوز');
  assert.equal(m.idle, false);
});

/* ───────────────── ★ القراءة دليلُ حضور ───────────────── */

test('★ من قرأ ولم يُسجَّل عضوًا يُنبت له صفّ — الجلساتُ القديمة بلا members', () => {
  const rows = presenceRows([], ROWS, { toMillis: at });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.name).sort(), ['عبدالله', 'محمد']);
  assert.equal(rows.find((r) => r.name === 'محمد').joinedAt, null, 'لا وقتَ دخولٍ معروف');
});

test('★ يوصل بالهويّة أوّلًا ثمّ بالاسم — فالقيدُ القديم بلا `byUid` لا يُضاعف صاحبَه', () => {
  const rows = presenceRows([{ uid: 'u1', name: 'محمد', ms: 1 }], [{ byName: 'محمد', base: 3, atMs: 9 }], {
    toMillis: at,
  });
  assert.equal(rows.length, 1, 'صفٌّ واحدٌ لا اثنان');
  assert.equal(rows[0].scans, 1);
  assert.equal(rows[0].uid, 'u1');
});

test('العضوُ بلا اسمٍ يصير «غير معروف» ولا يُسقط', () => {
  const rows = presenceRows([{ uid: 'x', name: '  ' }], [], { toMillis: at });
  assert.equal(rows[0].name, 'غير معروف');
});

test('يقبل `id` بدل `uid` — فمستندُ Firestore معرّفُه هويّةُ صاحبه', () => {
  const rows = presenceRows([{ id: 'u9', name: 'خالد' }], [], { toMillis: at });
  assert.equal(rows[0].uid, 'u9');
});

test('لا ينهار على مُدخَلٍ غير قائمة ولا بلا محوِّل وقت', () => {
  assert.deepEqual(presenceRows(null, null), []);
  assert.deepEqual(presenceRows(undefined, undefined), []);
  assert.equal(presenceRows([{ uid: 'a', name: 'م' }], [])[0].joinedAt, null);
});

/* ───────────────── الملخّص ───────────────── */

test('«٣ في الجلسة · ٢ يعدّون · ١ لم يبدأ»', () => {
  const s = presenceSummary(presenceRows(MEMBERS, ROWS, { toMillis: at }));
  assert.deepEqual(s, { total: 3, active: 2, idle: 1 });
  assert.match(presenceLabel(s), /3 في الجلسة/);
  assert.match(presenceLabel(s), /1 دخلوا ولم يبدأوا/);
});

test('حين يعدّ الجميع لا يُذكر صامت', () => {
  const s = presenceSummary(presenceRows([], ROWS, { toMillis: at }));
  assert.equal(s.idle, 0);
  assert.match(presenceLabel(s), /كلُّهم يعدّون/);
});

test('★ الصفرُ بلا نصّ — لا سطرَ يقول «٠ في الجلسة»', () => {
  assert.equal(presenceLabel(presenceSummary([])), '');
  assert.equal(presenceLabel(null), '');
});
