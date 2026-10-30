/**
 * اختباراتُ حارس الترقيم بلا اتّصال ‹NUM-601›.
 *
 * ═══ العطبُ الذي جاء منه ═══
 * رأسُ `numberingService` يقول منذ البداية «⚠️ لا يعمل بلا إنترنت» — **ولم
 * يكن في الكود ما يُلزمه**. و`runTransaction` بلا اتّصالٍ **لا ترمي بل
 * تتعلّق أبدًا**، فمعالجُ الزرّ ينتظر إلى غير نهاية: لا نجاحَ ولا خطأ.
 * ورآه المالكُ حرفيًّا: عشرُ بطاقاتِ صرفٍ كلُّها «مسودّة · بلا رقم»، لأنّ
 * المسودّاتِ `setDoc` تُقيَّد في طابور الأوفلاين وتعود فورًا.
 *
 * ★★★ **وأثقلُ اختبارٍ هنا هو المرساة**: يقرأ `numberingService.js` نصًّا
 * ويتثبّت أنّ الحارسَ **يسبق** `runTransaction`. فحارسٌ يُحذف أو يُزاح إلى ما
 * بعد المعاملة يُعيد التعلّقَ الأبديّ — **ولا يُسقط اختبارًا واحدًا** لأنّ
 * الخدمةَ تستورد Firebase فلا تُحمَّل في Node أصلًا. (وهو نمطُ «منطقٌ بلا
 * مستدعٍ» الذي تكرّر في هذا المستودع.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { numberingVerdict, OFFLINE_NUMBER_MESSAGE } from './numberFormat.js';

const SERVICE = readFileSync(new URL('./numberingService.js', import.meta.url), 'utf8');

// ─── الحكمُ الخالص ────────────────────────────────────────────────────────
test('غيرُ متّصلٍ يقينًا ⇒ يُمنع الحجزُ برمزٍ ورسالة', () => {
  const v = numberingVerdict({ online: false });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'offline');
  assert.equal(v.message, OFFLINE_NUMBER_MESSAGE);
});

test('★★ والظنُّ لا يمنع: «متّصل» أو مجهولٌ يمرّان', () => {
  // `navigator.onLine === true` ظنٌّ لا يقين (جهازٌ على راوترٍ بلا إنترنت
  // يقولها)، فحارسٌ يمنع عليها يمنع عملًا صحيحًا — وذاك أسوأُ من سكوته.
  assert.equal(numberingVerdict({ online: true }).ok, true);
  assert.equal(numberingVerdict({}).ok, true);
  assert.equal(numberingVerdict().ok, true);
  assert.equal(numberingVerdict({ online: undefined }).ok, true);
  assert.equal(numberingVerdict({ online: null }).ok, true);
});

test('الرسالةُ تقول للموظّف ما يفعل ولا تخيفه على عمله', () => {
  assert.match(OFFLINE_NUMBER_MESSAGE, /اتّصال/, 'تسمّي السبب');
  assert.match(OFFLINE_NUMBER_MESSAGE, /مسودّتُك محفوظةٌ/, 'وتطمئنه أنّ عملَه لم يضع');
  assert.match(OFFLINE_NUMBER_MESSAGE, /حين تعود الشبكة/, 'وتقول متى يُعيد المحاولة');
  assert.ok(!/offline|error|failed/i.test(OFFLINE_NUMBER_MESSAGE), 'ولا رمزَ أجنبيًّا يُقرأ عطبًا');
});

// ─── ★★★ المرساة: الحارسُ موصولٌ ويسبق المعاملة ──────────────────────────
test('★★★ الخدمةُ تستدعي الحكمَ فعلًا — لا منطقَ بلا مستدعٍ', () => {
  assert.match(SERVICE, /numberingVerdict/, 'مستورَدٌ ومستدعًى');
  assert.match(SERVICE, /from '\.\/numberFormat\.js'/, 'من الوحدة الخالصة');
});

test('★★★ والحارسُ يسبق `runTransaction` — وإلّا عاد التعلّقُ الأبديّ', () => {
  const guard = SERVICE.indexOf('numberingVerdict({');
  const txn = SERVICE.indexOf('runTransaction(');
  assert.ok(guard > 0, 'الحارسُ موجود');
  assert.ok(txn > 0, 'والمعاملةُ موجودة');
  assert.ok(
    guard < txn,
    'الحارسُ يجب أن يسبق المعاملةَ: حارسٌ بعدها لا يمنع تعلّقًا أبديًّا'
  );
});

test('★★ والمنعُ يرمي ومعه `code` — فالشاشةُ تفرّق الصلاحيّةَ من الاتّصال', () => {
  assert.match(SERVICE, /err\.code = verdict\.code/, 'الرمزُ يُنقل إلى الخطأ');
  assert.match(SERVICE, /throw err/, 'ويُرمى فلا يمضي إلى المعاملة');
});

test('★ وحالةُ الاتّصال تُقرأ من المتصفّح، وخارجَه تُعدّ متّصلة', () => {
  // وإلّا سقطت اختباراتُ Node كلُّها على خدماتٍ لا شأنَ لها بالشبكة.
  assert.match(SERVICE, /typeof navigator === 'undefined'/, 'Node يمرّ');
  assert.match(SERVICE, /navigator\.onLine !== false/, 'والنفيُ وحدَه يمنع');
});

// ─── ★★★ القاعدةُ المحلّيّةُ تحجز أوفلاين (جاهزيّة القطع) ──────────────────
test('★★★ تحت القاعدة المحلّيّة: يُحجز الرقمُ ولو غيرَ متّصلٍ (العدّادُ على الجهاز)', () => {
  assert.equal(numberingVerdict({ online: false, local: true }).ok, true, 'محلّيٌّ ⟵ لا يُشترط الاتّصال');
  assert.equal(numberingVerdict({ online: true, local: true }).ok, true);
  // وبلا local يبقى الحارسُ السحابيُّ كما كان (نقضُ الانحدار).
  assert.equal(numberingVerdict({ online: false, local: false }).ok, false, 'سحابيٌّ غيرُ متّصلٍ ⟵ يُمنع');
  assert.equal(numberingVerdict({ online: false }).ok, false);
});

test('★★★ الخدمةُ تمرّر local من خلفيّة الباب — فالأوفلاين المحلّيُّ لا يُمنع', () => {
  assert.match(SERVICE, /BACKEND === 'local-sqlite'/, 'تُسقط شرطَ الاتّصال تحت local-sqlite');
  assert.match(SERVICE, /local:/, 'وتُمرّره إلى الحكم');
});
