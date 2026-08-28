/**
 * 🔒 حارس دليل الاستخدام — **كلّ شاشةٍ في البوّابة لها شرحٌ في الدليل.**
 *
 * ═══ القاعدة الثابتة (طلب المالك 2026-08-28) ═══
 * «أيُّ إضافةٍ أو ميزةٍ جديدة **من شروطها** ذكرُها في هذا الدليل — ليكون
 * مرجعًا عامًّا.»
 *
 * وقاعدةٌ مكتوبةٌ في وثيقةٍ تُنسى، فمُكْنِنَت هنا: مَن أضاف شاشةً إلى
 * `navCatalog.js` ولم يكتب شرحَها في `src/data/usage-guide.json` **يسقط
 * اختبارُه** — قبل أن يصل البناءَ أو الدفع.
 *
 * وهي محروسةٌ في موضعين لا واحد:
 *   ① هنا في `npm test` — فيُكتشف الخرقُ في ثوانٍ.
 *   ② في `prebuild` — فلا يُبنى موقعٌ ولا يُنشر بشاشةٍ بلا شرح.
 *
 * ولا يفحص هذا الحارس **وجود الملفّ** بل **تطابقَ القائمتين**: كلُّ مسارٍ
 * في القائمة له مدخلٌ بخطوات، وكلُّ مدخلٍ في الدليل يقابله مسارٌ قائم —
 * فلا شاشةٌ بلا شرحٍ ولا شرحٌ لشاشةٍ حُذفت.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readNav } from '../../../scripts/build-usage-guide.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const nav = readNav(fs.readFileSync(path.join(ROOT, 'src/services/auth/navCatalog.js'), 'utf8'));
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/usage-guide.json'), 'utf8'));
const paths = [...new Set(nav.flatMap((g) => g.items.map((i) => i.path)))];

test('🔒 كلّ شاشةٍ في قائمة البوّابة لها شرحٌ بخطواتٍ في دليل الاستخدام', () => {
  const missing = paths.filter((p) => !(guide[p]?.steps?.length > 0));
  assert.deepEqual(
    missing,
    [],
    'شاشةٌ تصل إليها القائمةُ ولا شرحَ لها — والقاعدة: أيّ إضافةٍ من شروطها ذكرُها في الدليل:\n' +
      missing.map((m) => `  • ${m}`).join('\n')
  );
});

test('★ ولا شرحَ يتيمًا — مدخلٌ في الدليل لشاشةٍ لم تعد في القائمة', () => {
  const orphans = Object.keys(guide).filter((p) => !paths.includes(p));
  assert.deepEqual(
    orphans,
    [],
    `شرحٌ لشاشةٍ غير موجودةٍ في القائمة — يُحذف أو تُعاد الشاشة:\n${orphans.map((m) => `  • ${m}`).join('\n')}`
  );
});

test('★★ ولا شرحَ فارغًا يمرّ — لكلّ شاشةٍ خطوةٌ مفهومةٌ لا سطرٌ رمزيّ', () => {
  const thin = paths.filter((p) => {
    const e = guide[p];
    const text = [...(e?.steps ?? []), e?.what ?? ''].join(' ').trim();
    return text.length < 25;
  });
  assert.deepEqual(thin, [], `شرحٌ أقصرُ من أن يُفيد:\n${thin.map((m) => `  • ${m}`).join('\n')}`);
});

test('★ والدليلُ المنشور مولَّدٌ حديثًا — لا نسخةٌ قديمةٌ تُخالف القائمة', () => {
  const out = path.join(ROOT, 'public', 'دليل-استخدام-البوابة.html');
  assert.ok(fs.existsSync(out), 'الدليل غير مبنيّ — شغّل npm run guide');
  const html = fs.readFileSync(out, 'utf8');
  // عيّنةٌ من المسارات يجب أن تكون فيه — فنسخةٌ قديمةٌ تسقط هنا.
  for (const p of paths.slice(0, 12)) {
    assert.ok(html.includes(p), `الدليل المنشور لا يذكر «${p}» — أعِد توليده بـnpm run guide`);
  }
});
