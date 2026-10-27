/**
 * اختيارُ محوَّل المصادقة — منطقٌ خالص، يُختبَر بلا سحابةٍ ولا حساب.
 *
 * ★ يُختبر التبديلُ نفسُه لا وجودُه فقط (نفسُ درس `_db/backend.test.js`)، ويُفحص
 *   نصًّا أنّ المقبسَ يصل العقدَ كاملًا والمحوَّلَ القائمَ يُصدّره — فلا يُستورَد
 *   `firebaseAuth.js` في Node (يجرّ Firebase الذي لا يعمل بلا بيئة بناء).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_AUTH_BACKEND,
  authBackendNameFrom,
  pickAuthBackend,
  missingAuthSymbols,
  REQUIRED_AUTH_SYMBOLS,
} from './backend.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ═══════════════════ قراءة الاسم ═══════════════════ */

test('بيئةٌ فارغة ⇒ المحوَّل الافتراضيّ (firebase)', () => {
  assert.equal(authBackendNameFrom({}), 'firebase');
  assert.equal(authBackendNameFrom(undefined), 'firebase');
  assert.equal(authBackendNameFrom(null), 'firebase');
});

test('متغيّرٌ فارغٌ أو فراغاتٌ ⇒ الافتراض لا انهيار', () => {
  assert.equal(authBackendNameFrom({ PUBLIC_AUTH_BACKEND: '' }), DEFAULT_AUTH_BACKEND);
  assert.equal(authBackendNameFrom({ PUBLIC_AUTH_BACKEND: '   ' }), DEFAULT_AUTH_BACKEND);
});

test('يقرأ الاسمَ المذكورَ ويقلّم الفراغ', () => {
  assert.equal(authBackendNameFrom({ PUBLIC_AUTH_BACKEND: 'local' }), 'local');
  assert.equal(authBackendNameFrom({ PUBLIC_AUTH_BACKEND: '  local \n' }), 'local');
});

/* ═══════════════════ الاختيار ═══════════════════ */

test('يختار المحوَّلَ المطلوبَ ويُعيده كما هو', () => {
  const fake = { BACKEND_NAME: 'fake', signIn: () => 'ok' };
  const table = { firebase: { BACKEND_NAME: 'firebase' }, fake };
  assert.equal(pickAuthBackend('fake', table), fake);
  assert.equal(pickAuthBackend('fake', table).signIn(), 'ok');
  assert.equal(pickAuthBackend('firebase', table).BACKEND_NAME, 'firebase');
});

test('★★ اسمٌ مجهولٌ يسقط ولا يرجع صامتًا إلى الافتراض', () => {
  const table = { firebase: {} };
  assert.throws(() => pickAuthBackend('firebasee', table), /محوَّل مصادقةٍ مجهول/);
  assert.throws(() => pickAuthBackend('', table), /محوَّل مصادقةٍ مجهول/);
  assert.throws(() => pickAuthBackend('Firebase', table), /محوَّل مصادقةٍ مجهول/, 'حسّاسٌ لحالة الأحرف');
});

test('لا يُخدَع بخصائص السلسلة الأصليّة', () => {
  assert.throws(() => pickAuthBackend('toString', { firebase: {} }), /مجهول/);
  assert.throws(() => pickAuthBackend('constructor', { firebase: {} }), /مجهول/);
});

/* ═══════════════════ العقد ═══════════════════ */

test('العقدُ يُسمّي خمسةَ رموزٍ مقيسةً من مستعملي المصادقة', () => {
  assert.equal(REQUIRED_AUTH_SYMBOLS.length, 5);
  assert.ok(Object.isFrozen(REQUIRED_AUTH_SYMBOLS), 'لا يُعدَّل العقدُ في وقت التشغيل');
  for (const n of ['subscribeAuth', 'signIn', 'signOutUser', 'sendPasswordReset', 'fetchUserProfile']) {
    assert.ok(REQUIRED_AUTH_SYMBOLS.includes(n), `${n} من العقد`);
  }
});

test('محوَّلٌ ناقصٌ/معدومٌ/غيرُ دالّة ⇒ يُعلن الناقصَ بالاسم', () => {
  const partial = { subscribeAuth: () => {}, signIn: () => {} };
  const missing = missingAuthSymbols(partial);
  assert.ok(missing.includes('fetchUserProfile'));
  assert.ok(!missing.includes('signIn'));
  assert.deepEqual(missingAuthSymbols(null), [...REQUIRED_AUTH_SYMBOLS]);

  const full = {};
  for (const n of REQUIRED_AUTH_SYMBOLS) full[n] = () => {};
  assert.deepEqual(missingAuthSymbols(full), []);
  full.signIn = 'not-a-function';
  assert.deepEqual(missingAuthSymbols(full), ['signIn']);
});

/* ═══════════════════ الوصلُ نصًّا (بلا تحميل Firebase في Node) ═══════════════════ */

test('المقبسُ (_auth/index.js) يُصدّر كلَّ رمزٍ في العقد', () => {
  const src = readFileSync(join(HERE, 'index.js'), 'utf8');
  const missing = REQUIRED_AUTH_SYMBOLS.filter(
    (n) => !new RegExp(`^export const ${n}\\s*=`, 'm').test(src)
  );
  assert.deepEqual(missing, [], 'رموزٌ في العقد لا يصلها المقبس: ' + missing.join(', '));
});

test('محوَّلُ Firebase يُصدّر كلَّ رمزٍ في العقد', () => {
  const src = readFileSync(join(HERE, 'firebaseAuth.js'), 'utf8');
  const missing = REQUIRED_AUTH_SYMBOLS.filter(
    (n) => !new RegExp(`export (async function|function|const) ${n}\\b`).test(src)
  );
  assert.deepEqual(missing, [], 'رموزٌ في العقد لا يُصدّرها محوَّل Firebase: ' + missing.join(', '));
});

test('المقبسُ والمحوَّلُ لا يقرّران بأنفسهما — القرارُ في backend.js', () => {
  const backend = readFileSync(join(HERE, 'backend.js'), 'utf8');
  assert.doesNotMatch(backend, /^\s*import\s/m, '`backend.js` منطقٌ خالصٌ لا يستورد شيئًا');
});
