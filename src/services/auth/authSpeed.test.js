/**
 * ‹ODOO-ORD› بوّابةُ الدخول أسرع ولا تتجاوز التحقّق: قراءةٌ واحدةٌ للصفحة، والفشلُ يُعاد، والطبقةُ تقول ما يجري.
 *
 * `authService` و`AuthGate` يستوردان Firebase ولا محاكيَ DOM هنا — فالحارسُ يقرأ المصدر (نمطُ `visitWiring.test.js`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (rel) =>
  fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('★★ ملفُّ المستخدم يُقرأ مرّةً للصفحة — والقراءةُ الفاشلة تُحذف فتُعاد', () => {
  // المنطقُ انتقل إلى محوَّل المصادقة خلف المقبس (`_auth/`)؛ السلوكُ كما كان.
  const src = source('./_auth/firebaseAuth.js');
  assert.match(src, /const profileReads = new Map\(\);/);
  assert.match(src, /read\.catch\(\(\) => profileReads\.delete\(uid\)\);/, 'بلا حذفٍ يعلق الدورُ الافتراضيُّ على الصفحة كلّها');
  assert.match(src, /const data = await readUserDoc\(user\.uid\);/);
  assert.doesNotMatch(src, /getDoc\(doc\(db, 'users', user\.uid\)\)/, 'لا قراءةَ مباشرةً تتجاوز الذاكرة');
});

test('★★ مصفوفةُ الصلاحيّات مرّةً للصفحة — والفشلُ يُعاد والحفظُ يُسقط الذاكرة', () => {
  const src = source('./accessMatrixService.js');
  assert.match(src, /let matrixRead = null;/);
  assert.match(src, /matrixRead\.catch\(\(\) => \{ matrixRead = null; \}\);/);
  const save = src.slice(src.indexOf('export async function saveMatrix('));
  assert.match(save, /const clean = normalizeMatrix\(matrix\);\s*matrixRead = null;/, 'حفظٌ بلا إسقاطٍ يُبقي المصفوفةَ القديمة');
});

test('★★★ الطبقةُ لا تُرفع قبل التحقّق — لكنّها تقول «بطيء» وتعطي إعادةَ المحاولة', () => {
  const src = source('../../components/brandzo-erp/access/AuthGate.jsx');
  assert.match(src, /const slow = setTimeout\(\(\) => \{/);
  assert.match(src, /retry\.onclick = \(\) => window\.location\.reload\(\);/);
  const hide = src.search(/overlay\.style\.display = 'none';/);
  const check = src.indexOf('isPathAllowed(profile?.role');
  assert.ok(check > 0 && hide > check, 'الإخفاءُ بعد حارس الصفحة لا قبله');
  assert.ok(!/setTimeout\([^)]*display = 'none'/.test(src), 'المؤقّتُ لا يُخفي الطبقة أبدًا');
  assert.match(src, /clearTimeout\(slow\);\s*if \(overlay\) overlay\.style\.display = 'none';/);
  assert.match(src, /new CustomEvent\('brandzo:db-status', \{ detail: \{ online: true \} \}\)/, 'العلامةُ تعرف أنّ القاعدة متّصلة');
});
