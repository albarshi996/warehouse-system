/**
 * 🔒 حرّاسُ سجلّ زيارات البوّابة ‹VIS-101/102›.
 *
 * والاختبارُ الأهمّ هو **سؤال المالك نفسُه**: «حتّى لو كان نفس اليوزر» —
 * فحسابٌ واحدٌ من جهازين في يومٍ واحدٍ يجب أن يُكشف، وإلّا فالسجلُّ لا يجيب
 * ما بُني له.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VISIT_KINDS,
  isVisitKind,
  screenLabel,
  shapeVisit,
  visitProblems,
  visitDocId,
  dayKey,
  visitText,
  multiDeviceAccounts,
  visitsSnapshot,
  daysIn,
} from './visitModel.js';
import { makeDeviceId, isDeviceId, readDeviceId } from './deviceId.js';

const DAY = 24 * 60 * 60 * 1000;
const T = Date.UTC(2026, 7, 28, 10, 32) + 3 * 60 * 60 * 1000; // ١٠:٣٢ بتوقيت محلّيّ تقريبيّ
const v = (over = {}) => ({
  kind: 'VIEW',
  uid: 'u1',
  userName: 'سعد',
  role: 'gate_officer',
  deviceId: 'A3F2',
  sessionId: 'S1',
  path: '/dashboard/gate-post',
  at: T,
  ...over,
});

/* ═══════════ ★★★ سؤالُ المالك ═══════════ */

test('★★★ نفسُ الحساب من جهازين في اليوم نفسه ⇒ يُكشف', () => {
  const rows = multiDeviceAccounts([
    v({ deviceId: 'A3F2' }),
    v({ deviceId: 'A3F2', path: '/dashboard/pallet-control' }),
    v({ deviceId: '9B1C', path: '/dashboard/pallet-control', at: T + 9 * 60000 }),
  ]);
  assert.equal(rows.length, 1, 'حسابٌ بجهازين لم يُكشف — وهو ما بُني السجلّ لأجله');
  assert.deepEqual(rows[0].devices, ['9B1C', 'A3F2']);
  assert.equal(rows[0].userName, 'سعد');
  assert.equal(rows[0].count, 3);
});

test('★★ وجهازٌ واحدٌ مهما تكرّر لا يُكشف — فلا إنذارٌ كاذب', () => {
  const rows = multiDeviceAccounts([v(), v({ at: T + 60000 }), v({ at: T + 120000 })]);
  assert.deepEqual(rows, [], 'أُنذر على موظّفٍ لم يفعل شيئًا — فيُتعلَّم تجاهلُ الإنذار');
});

test('★★ واليومان لا يختلطان — جهازان في يومين ليسا حسابًا بجهازين', () => {
  const rows = multiDeviceAccounts([v({ deviceId: 'A3F2' }), v({ deviceId: '9B1C', at: T + DAY })]);
  assert.deepEqual(rows, [], 'خُلط يومان فصار انتقالُ موظّفٍ من هاتفه إلى حاسوبه غدًا تهمةً');
});

test('★ وحسابان مختلفان لا يُجمعان ولو تشاركا الجهاز', () => {
  const rows = multiDeviceAccounts([
    v({ uid: 'u1', deviceId: 'A3F2' }),
    v({ uid: 'u2', deviceId: '9B1C' }),
  ]);
  assert.deepEqual(rows, []);
});

test('★ وسطرٌ بلا وقتٍ أو بلا جهازٍ يُتجاهَل ولا يُسقط الحساب', () => {
  const rows = multiDeviceAccounts([v({ at: null }), v({ deviceId: '' }), v({ deviceId: '9B1C' })]);
  assert.deepEqual(rows, []);
  assert.doesNotThrow(() => multiDeviceAccounts(null));
});

/* ═══════════ الجدول الذي أقرّه المالك ═══════════ */

test('★★ نصُّ الحدث كما في جدول المالك حرفيًّا', () => {
  assert.equal(visitText(v({ kind: 'LOGIN' })), 'دخل البوّابة');
  assert.equal(visitText(v({ kind: 'VIEW', path: '/dashboard/gate-post' })), 'فتح «مركز البوابة»');
  assert.equal(visitText(v({ kind: 'VIEW', path: '/dashboard/pallet-control' })), 'فتح «الطبليات العائدة»');
  assert.equal(visitText(v({ kind: 'LOGOUT' })), 'خرج من البوّابة');
});

test('★★★ والتسميةُ تُشتقّ من الكتالوج لا تُكتب بيد — فلا اسمَ يتقادم', () => {
  assert.equal(screenLabel('/dashboard/gate-log'), 'سجلّ البوابة والمطابقة');
  assert.equal(screenLabel('/dashboard'), 'الرئيسية');
});

test('★ ومسارٌ مجهولٌ يعود بنفسه ظاهرًا لا فارغًا', () => {
  assert.equal(screenLabel('/dashboard/غير-موجودة'), '/dashboard/غير-موجودة');
  assert.equal(screenLabel(''), '—');
  assert.equal(screenLabel(null), '—');
});

/* ═══════════ ض-٤ · المعرّفُ الحتميّ يمنع التضاعف ═══════════ */

test('★★★ ض-٤: التركيبُ مرّتين في الدقيقة نفسها ⇒ معرّفٌ واحدٌ فيكتب فوق نفسه', () => {
  const a = visitDocId(v(), T);
  const b = visitDocId(v(), T + 5000);
  assert.equal(a, b, 'إعادةُ التركيب ضاعفت السطر — والحدُّ المجانيّ يُستهلك بلا فائدة');
});

test('★★ وزيارةٌ حقيقيّةٌ بعد دقائق ⇒ معرّفٌ جديد فلا تُبتلع', () => {
  assert.notEqual(visitDocId(v(), T), visitDocId(v(), T + 5 * 60000));
});

test('★★ وجهازان أو شاشتان أو جلستان ⇒ معرّفاتٌ مختلفة', () => {
  const base = visitDocId(v(), T);
  assert.notEqual(base, visitDocId(v({ deviceId: '9B1C' }), T));
  assert.notEqual(base, visitDocId(v({ sessionId: 'S2' }), T));
  assert.notEqual(base, visitDocId(v({ path: '/dashboard/pallet-control' }), T));
  assert.notEqual(base, visitDocId(v({ kind: 'LOGIN' }), T));
});

test('★★ والمعرّفُ صالحٌ لـFirestore — بلا شرطةٍ مائلةٍ ولا حروفٍ عربيّة', () => {
  const id = visitDocId(v({ path: '/dashboard/الطبليات-العائدة' }), T);
  assert.ok(!id.includes('/'), 'شرطةٌ مائلةٌ في المعرّف تُنشئ مجموعةً فرعيّةً لا مستندًا');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(id), `معرّفٌ فيه محارفُ غير آمنة: ${id}`);
  assert.ok(id.length < 1500);
});

/* ═══════════ التسوية والحرّاس ═══════════ */

test('★ الأنواعُ ثلاثةٌ ولا رابع — «عاديّ» بلا تتبّعِ ضغطات', () => {
  assert.equal(VISIT_KINDS.length, 3);
  assert.ok(isVisitKind('LOGIN') && isVisitKind('view'));
  assert.equal(isVisitKind('CLICK'), false);
  assert.equal(shapeVisit({ kind: 'CLICK' }).kind, 'VIEW', 'نوعٌ مجهولٌ يجب أن يسقط إلى VIEW لا أن يُخزَّن');
});

test('★ التسويةُ لا تنهار على مدخلٍ فارغ', () => {
  const x = shapeVisit(null);
  assert.equal(x.kind, 'VIEW');
  assert.equal(x.at, null);
  assert.equal(x.deviceId, '');
});

test('★★ نقضٌ: سطرٌ بلا هويّةٍ أو بلا جهازٍ يُمنع', () => {
  assert.ok(visitProblems({ deviceId: 'A3F2', path: '/x' }).some((p) => p.includes('هويّةَ حساب')));
  assert.ok(visitProblems({ uid: 'u1', path: '/x' }).some((p) => p.includes('رقمَ جهاز')));
  assert.ok(visitProblems({ uid: 'u1', deviceId: 'A3F2', kind: 'VIEW' }).some((p) => p.includes('بلا مسار')));
  assert.deepEqual(visitProblems(v()), []);
});

test('★ ولا ساعةَ تُقرأ في المنطق الخالص — الوقتُ يُمرَّر', () => {
  assert.equal(shapeVisit({ uid: 'u' }).at, null);
  assert.equal(dayKey(undefined), '');
  assert.equal(dayKey(T), dayKey(T + 1000), 'اليومُ نفسُه لدقيقتين متجاورتين');
});

/* ═══════════ اللقطة ═══════════ */

test('★ اللقطةُ تعدّ الزائرين والأجهزة وأنشطَ الشاشات', () => {
  const snap = visitsSnapshot([
    v({ kind: 'LOGIN' }),
    v({ path: '/dashboard/gate-post' }),
    v({ path: '/dashboard/gate-post', at: T + 60000 }),
    v({ uid: 'u2', deviceId: '9B1C', path: '/dashboard/pallet-control' }),
  ]);
  assert.equal(snap.users, 2);
  assert.equal(snap.devices, 2);
  assert.equal(snap.logins, 1);
  assert.equal(snap.topScreens[0].path, '/dashboard/gate-post');
  assert.equal(snap.topScreens[0].count, 2);
  assert.equal(snap.topScreens[0].label, 'مركز البوابة');
});

test('★ واللقطةُ تُصفّى باليوم', () => {
  const all = [v(), v({ at: T + DAY })];
  assert.equal(visitsSnapshot(all).rows, 2);
  assert.equal(visitsSnapshot(all, dayKey(T)).rows, 1);
  assert.deepEqual(daysIn(all), [dayKey(T + DAY), dayKey(T)]);
});

/* ═══════════ ض-٢ · رقمُ الجهاز لا يُسقط شيئًا ═══════════ */

test('★★ رقمُ الجهاز أربعةُ محارفَ لا تلتبس — بلا صفرٍ ولا حرف O', () => {
  const id = makeDeviceId(() => 0);
  assert.equal(id.length, 4);
  assert.ok(isDeviceId(id));
  assert.ok(!/[01OI]/.test(makeDeviceId(() => 0.999)), 'محارفُ ملتبسةٌ تجعل الحارسَ يقرأ رقمًا خطأً');
});

test('★★★ ض-٢ نقضٌ: متصفّحٌ يمنع التخزين لا يرمي خطأً — يعيد رقمًا للجلسة', () => {
  const hostile = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
  };
  const r = readDeviceId(hostile);
  assert.ok(isDeviceId(r.id), 'سقط رقمُ الجهاز فسقطت معه الشاشة');
  assert.equal(r.persisted, false, 'ادّعى الثبات وهو غيرُ ثابت');
});

test('★★ ويُعلَن عدمُ الثبات حين يقبل المتصفّحُ الكتابةَ ولا يُبقيها', () => {
  const amnesiac = { getItem: () => null, setItem: () => {} };
  assert.equal(readDeviceId(amnesiac).persisted, false);
});

test('★ ورقمٌ محفوظٌ سليمٌ يُعاد كما هو — فلا يتغيّر الجهازُ كلّ صفحة', () => {
  const store = new Map([['bz.portal.deviceId', 'A3F2']]);
  const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, val) => store.set(k, val) };
  const r = readDeviceId(s);
  assert.equal(r.id, 'A3F2');
  assert.equal(r.persisted, true);
});

test('★ وقيمةٌ تالفةٌ في التخزين تُستبدل ولا تُستعمل', () => {
  const store = new Map([['bz.portal.deviceId', 'ســيّئ']]);
  const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, val) => store.set(k, val) };
  assert.ok(isDeviceId(readDeviceId(s).id));
});
