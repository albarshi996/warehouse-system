/**
 * 🔒 حارسُ الوصل ‹VIS-202› — **السجلُّ يُكتب فعلًا، ولا يُسقط البوّابة أبدًا.**
 *
 * ═══ ولماذا يُفحص النصُّ لا السلوك؟ ═══
 * `AuthGate` مكوّنُ متصفّحٍ يستورد Firebase، ولا محاكيَ DOM في هذه الشجرة.
 * فالمفحوصُ هنا **العقدُ المكتوب في الشيفرة**: أنّ النداء موجودٌ في الموضع
 * الصحيح، وأنّه **بلا `await`**، وأنّ الخطأ مبتلَعٌ في الخدمة.
 *
 * وهو نمطُ `lpnIsolation.test.js` القائم: حرّاسُ شجرةٍ تمسح الاستيرادات مسحًا
 * آليًّا — لا مراجعةَ يدٍ تنسى.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const GATE = path.join(ROOT, 'src/components/brandzo-erp/access/AuthGate.jsx');
const SERVICE = path.join(HERE, 'visitService.js');
const RULES = path.join(ROOT, 'firestore.rules');

const gateSrc = fs.readFileSync(GATE, 'utf8');
const serviceSrc = fs.readFileSync(SERVICE, 'utf8');
const rulesSrc = fs.readFileSync(RULES, 'utf8');

test('★★★ الوصل: AuthGate يستدعي recordVisit فعلًا — لا منطقَ بلا مستدعٍ', () => {
  assert.ok(gateSrc.includes("from '../../../services/activity/visitService.js'"), 'الخدمةُ غيرُ مستوردة');
  assert.ok(/recordVisit\(\s*\{/.test(gateSrc), 'الخدمةُ مستوردةٌ ولا تُستدعى — استيرادٌ ميّت');
});

test('★★★ ض-٢ نقضٌ: النداءُ بلا await — فالرسمُ لا ينتظر السجلّ', () => {
  const call = gateSrc.match(/^.*recordVisit\(.*$/m)?.[0] ?? '';
  assert.ok(call, 'لم يُعثر على سطر النداء');
  assert.ok(!/await\s+recordVisit/.test(gateSrc), 'النداءُ بـawait — فشبكةٌ بطيئةٌ تُجمّد كشفَ الغطاء عن الشاشة');
  assert.ok(!/return\s+recordVisit/.test(gateSrc));
});

test('★★★ ض-٢: يُسجَّل **بعد** كشفِ الغطاء لا قبله — فلا يؤخّر ظهورَ الشاشة', () => {
  const overlayAt = gateSrc.indexOf("overlay.style.display = 'none'");
  const recordAt = gateSrc.indexOf('recordVisit({');
  assert.ok(overlayAt > 0 && recordAt > 0);
  assert.ok(recordAt > overlayAt, 'السجلُّ قبل كشف الغطاء — يؤخّر ما يراه الموظّف');
});

test('★★★ ض-٢: كلُّ خطأٍ مبتلَعٌ في الخدمة — ولا يصعد إلى الشاشة', () => {
  assert.ok(/}\s*catch\s*{/.test(serviceSrc), 'لا catch في recordVisit — خطأُ شبكةٍ يصعد إلى الحارس');
  assert.ok(!/throw\s/.test(serviceSrc), 'الخدمةُ ترمي — والحارسُ لا يلتقط');
  // ولا تُرجع الخدمةُ خطأً يُفسَّر نجاحًا: العقدُ boolean صريح.
  assert.ok(serviceSrc.includes('return false;'), 'لا مسارَ فشلٍ معلَنًا');
});

test('★★ ولا يُسجَّل إلّا مصادَقٌ مسموحٌ له بالصفحة', () => {
  const idx = gateSrc.indexOf('recordVisit({');
  const before = gateSrc.slice(0, idx);
  assert.ok(before.includes('isPathAllowed'), 'يُسجَّل قبل فحص الصلاحيّة — فتُسجَّل صفحةٌ سيُطرد منها');
  assert.ok(before.includes("profile?.active === false"), 'يُسجَّل قبل فحص الإيقاف — فيُسجَّل موقوف');
  assert.ok(serviceSrc.includes('auth?.currentUser'), 'الخدمةُ لا تتحقّق من وجود مستخدم');
});

test('★★★ ض-١ إضافةٌ صرفة: AuthGate لم يفقد حارسًا من حرّاسه الثلاثة', () => {
  for (const guard of ['loginUrlFor', 'signOutUser', 'landingPathFor', 'isPathAllowed', 'fetchMatrixOnce']) {
    assert.ok(gateSrc.includes(guard), `الحارسُ «${guard}» اختفى — إضافةُ السجلّ أتلفت ما يعمل`);
  }
  assert.equal((gateSrc.match(/window\.location\.replace/g) || []).length, 3, 'عددُ التحويلات تغيّر');
});

test('★★★ القاعدةُ ملحقةٌ-فقط والقراءةُ للأدمن وحده', () => {
  const block = rulesSrc.slice(rulesSrc.indexOf('match /portal_visits/'), rulesSrc.indexOf('match /portal_visits/') + 900);
  assert.ok(block, 'لا قاعدةَ للمجموعة — الكتابةُ سترتدّ permission-denied');
  assert.ok(/allow read:\s*if isAdmin\(\)/.test(block), 'قراءةُ سجلّ التتبّع ليست محصورةً بالأدمن');
  assert.ok(/allow update, delete: if false/.test(block), 'السجلُّ يُعدَّل أو يُحذف — فليس سجلًّا');
  assert.ok(block.includes('request.resource.data.uid == request.auth.uid'), 'يستطيع أحدٌ تسجيل زيارةٍ باسم غيره');
});

test('★★ ولا شاشةَ تكتب في المجموعة مباشرةً — الكتابةُ من الخدمة وحدها', () => {
  const writers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jsx|astro)$/.test(e.name) && fs.readFileSync(full, 'utf8').includes('portal_visits')) {
        writers.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepEqual(writers, [], `مكوّنٌ يذكر المجموعة مباشرةً: ${writers.join(' · ')}`);
});
