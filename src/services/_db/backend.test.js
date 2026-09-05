/**
 * اختيارُ المحوَّل — منطقٌ خالص، يُختبَر بلا سحابةٍ ولا حساب.
 *
 * ★ ويُختبر **التبديلُ نفسُه** لا وجودُه فقط: مفتاحٌ لم يُجرَّب قطُّ هو مفتاحٌ
 *   لا نعرف أنّه يعمل — والدرسُ مسجَّل: «حارسٌ يقرأ حقلًا لا يُكتب أبدًا فلا
 *   يُطلق ولو مرّة». فيوم يصل PostgreSQL لا يكون التبديلُ فرضيّةً تُجرَّب
 *   أوّلَ مرّةٍ على الإنتاج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BACKEND,
  backendNameFrom,
  pickBackend,
  missingSymbols,
  REQUIRED_SYMBOLS,
} from './backend.js';

/* ═══════════════════ قراءة الاسم ═══════════════════ */

test('بيئةٌ فارغة ⇒ المحوَّل الافتراضيّ', () => {
  assert.equal(backendNameFrom({}), 'firestore');
  assert.equal(backendNameFrom(undefined), 'firestore');
  assert.equal(backendNameFrom(null), 'firestore');
});

test('متغيّرٌ فارغٌ أو فراغاتٌ ⇒ الافتراض لا انهيار', () => {
  // في بناء CI بلا `.env` يصير المتغيّرُ نصًّا فارغًا لا معدومًا.
  assert.equal(backendNameFrom({ PUBLIC_DB_BACKEND: '' }), DEFAULT_BACKEND);
  assert.equal(backendNameFrom({ PUBLIC_DB_BACKEND: '   ' }), DEFAULT_BACKEND);
});

test('يقرأ الاسمَ المذكورَ ويقلّم الفراغ', () => {
  assert.equal(backendNameFrom({ PUBLIC_DB_BACKEND: 'postgres' }), 'postgres');
  assert.equal(backendNameFrom({ PUBLIC_DB_BACKEND: '  postgres \n' }), 'postgres');
});

/* ═══════════════════ الاختيار ═══════════════════ */

test('يختار المحوَّلَ المطلوبَ ويُعيده كما هو', () => {
  const fake = { BACKEND_NAME: 'fake', doc: () => 'fake-doc' };
  const table = { firestore: { BACKEND_NAME: 'firestore' }, fake };

  assert.equal(pickBackend('fake', table), fake);
  assert.equal(pickBackend('fake', table).doc(), 'fake-doc', 'ودالّتُه تعمل');
  assert.equal(pickBackend('firestore', table).BACKEND_NAME, 'firestore');
});

test('★★ اسمٌ مجهولٌ يسقط ولا يرجع صامتًا إلى الافتراض', () => {
  const table = { firestore: {} };
  // `postgress` بحرفٍ زائد — الخطأُ المطبعيُّ الذي كان سيُبقي كلَّ كتابةٍ في
  // القاعدة القديمة يوم التحويل، والجميعُ يظنّها انتقلت.
  assert.throws(() => pickBackend('postgress', table), /محوَّل قاعدة بيانات مجهول/);
  assert.throws(() => pickBackend('', table), /محوَّل قاعدة بيانات مجهول/);
  assert.throws(() => pickBackend('Firestore', table), /محوَّل قاعدة بيانات مجهول/, 'حسّاسٌ لحالة الأحرف');
});

test('رسالةُ الخطأ تسمّي المتاحَ كي يُصلَّح بلا بحث', () => {
  try {
    pickBackend('mysql', { firestore: {}, postgres: {} });
    assert.fail('كان يجب أن يسقط');
  } catch (err) {
    assert.match(err.message, /firestore/);
    assert.match(err.message, /postgres/);
  }
});

test('لا يُخدَع بخصائص السلسلة الأصليّة', () => {
  // `table['toString']` موجودةٌ بالوراثة — ولو قُرئت بـ`table[name]` وحدَها
  // لعادت دالّةً بدل أن يسقط الاختيار.
  assert.throws(() => pickBackend('toString', { firestore: {} }), /مجهول/);
  assert.throws(() => pickBackend('constructor', { firestore: {} }), /مجهول/);
});

/* ═══════════════════ العقد ═══════════════════ */

test('العقدُ يُسمّي ٢٢ رمزًا مقيسةً من الخدمات', () => {
  assert.equal(REQUIRED_SYMBOLS.length, 22);
  assert.ok(Object.isFrozen(REQUIRED_SYMBOLS), 'لا يُعدَّل العقدُ في وقت التشغيل');
  for (const n of ['doc', 'onSnapshot', 'runTransaction', 'serverTimestamp', 'increment']) {
    assert.ok(REQUIRED_SYMBOLS.includes(n), `${n} من العقد`);
  }
});

test('محوَّلٌ ناقصٌ يُعلن ما ينقصه بالاسم', () => {
  const partial = { doc: () => {}, collection: () => {} };
  const missing = missingSymbols(partial);

  assert.ok(missing.includes('onSnapshot'), 'يسمّي الناقص');
  assert.ok(!missing.includes('doc'), 'ولا يسمّي الموجود');
  assert.equal(missing.length, REQUIRED_SYMBOLS.length - 2);
});

test('محوَّلٌ معدومٌ ⇒ كلُّ العقد ناقص', () => {
  assert.deepEqual(missingSymbols(null), [...REQUIRED_SYMBOLS]);
  assert.deepEqual(missingSymbols(undefined), [...REQUIRED_SYMBOLS]);
});

test('محوَّلٌ تامٌّ ⇒ لا ناقص', () => {
  const full = {};
  for (const n of REQUIRED_SYMBOLS) full[n] = () => {};
  assert.deepEqual(missingSymbols(full), []);
});

test('★ خاصّيّةٌ موجودةٌ لكنّها ليست دالّةً تُعدّ ناقصة', () => {
  // محوَّلٌ يُصدّر `onSnapshot` قيمةً لا دالّة يمرّ من فحصِ الوجود ويسقط عند
  // أوّل استدعاءٍ في شاشةٍ عند مستخدم. الفحصُ على النوع لا على الوجود.
  const full = {};
  for (const n of REQUIRED_SYMBOLS) full[n] = () => {};
  full.onSnapshot = 'not-a-function';
  assert.deepEqual(missingSymbols(full), ['onSnapshot']);
});
