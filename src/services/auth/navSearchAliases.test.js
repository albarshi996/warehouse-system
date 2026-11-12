/**
 * بيّنةُ بحث الرئيسيّة — «ما يكتبه المالكُ يجد شاشتَه» (إصلاح 2026-11-12).
 *
 * ★★★ العطبُ الذي وُلدت منه: المالكُ بحث عن «تقرير العهدة» و«إثبات الدخول والخروج»
 *     فلم يجد شيئًا، والشاشتان قائمتان — لأنّ المطابقةَ كانت بالتسمية حرفيًّا. فهذه
 *     البيّنةُ تبحث **بعبارات المالك نفسِها** على **كتالوج التنقّل الحقيقيّ** لا عيّنةٍ
 *     مصنوعة، فلو تغيّرت تسميةٌ أو سقط مرادفٌ سقطت هنا لا عند المستخدم.
 *
 * ★★ وما أضافته المراجعةُ العدائيّة: واوُ العطف بلا «ال» · الكتابةُ التدريجيّة ·
 *     كلمةُ الحشو المكتوبةُ بدايةَ كلمة · الأرقامُ الهنديّة · ترتيبُ النتائج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAr, searchTokens, screenMatchScore, screenMatches, NAV_SEARCH_ALIASES } from './navSearchAliases.js';
import { flatItems } from './navCatalog.js';

const SCREENS = flatItems().filter((it) => it.path && !it.external);
const find = (term) => SCREENS.filter((s) => screenMatches(s, term)).map((s) => s.path);

test('التطبيع: يُسقط «ال» والتشكيل ويوحّد الألف والتاء المربوطة والأرقام', () => {
  assert.equal(normalizeAr('العهد النقديّة'), 'عهد نقديه');
  assert.equal(normalizeAr('إثبات الدخول والخروج'), 'اثبات دخول خروج');
  assert.equal(normalizeAr('للعهدة'), 'عهده');
  assert.equal(normalizeAr('  مركز   البوابة '), 'مركز بوابه');
  assert.equal(normalizeAr('موقع ١٥٥'), 'موقع 155');
  assert.equal(normalizeAr('العهد', { keepArticle: true }), 'العهد');
  assert.equal(normalizeAr(null), '');
});

test('الكلمات: الحشوُ يُسقط إن بقي غيرُه، ويبقى إن كان هو العبارةَ كلَّها', () => {
  assert.deepEqual(searchTokens('تقرير عن العهدة'), ['تقرير', 'العهده']);
  // الحشوُ يُطابَق بصيغته المطبَّعة: «على» و«إلى» تسقطان فلا تُفشلان العبارة.
  assert.deepEqual(searchTokens('الدخول إلى البوابة'), ['الدخول', 'البوابه']);
  assert.deepEqual(searchTokens('تقرير على العهدة'), ['تقرير', 'العهده']);
  // كتابةٌ تدريجيّة: «أو» في طريقها إلى «أودو»، وحرفٌ مفردٌ — لا تُفرَّغ القائمة.
  assert.deepEqual(searchTokens('أو'), ['او']);
  assert.deepEqual(searchTokens('ع'), ['ع']);
  assert.deepEqual(searchTokens(''), []);
});

test('★★★ عبارتا المالك حرفيًّا تجدان شاشتَيهما على الكتالوج الحقيقيّ', () => {
  assert.ok(find('تقرير العهدة').includes('/dashboard/cash-custody'), '«تقرير العهدة» لا تجد العهد النقديّة');
  const gate = find('اثبات الدخول والخروج');
  assert.ok(gate.includes('/dashboard/gate-post'), '«إثبات الدخول والخروج» لا تجد مركز البوابة');
});

test('★★★ واوُ العطف بلا «ال» — «دخول وخروج» تجد البوابة (عيبُ المراجعة م١)', () => {
  assert.ok(find('دخول وخروج').includes('/dashboard/gate-post'));
  assert.ok(find('اثبات دخول وخروج').includes('/dashboard/gate-post'));
});

test('★★ والكلماتُ المفردةُ الطبيعيّة تجد شاشاتِها', () => {
  assert.ok(find('عهدة').includes('/dashboard/cash-custody'));
  assert.ok(find('كشف العهدة').includes('/dashboard/cash-custody'));
  assert.ok(find('تقارير العهدة').includes('/dashboard/cash-custody'));
  assert.ok(find('دخول').includes('/dashboard/gate-post'));
  assert.ok(find('خروج').includes('/dashboard/gate-post'));
  assert.ok(find('خروج').includes('/dashboard/gate-log'));
  assert.ok(find('تصريح').includes('/dashboard/documents'));
  assert.ok(find('البوابة').includes('/dashboard/gate-post'));
  assert.ok(find('١٥٥').includes('/dashboard/site-needs'), 'الأرقامُ الهنديّة لا تطابق 155');
});

test('★★★ الكتابةُ التدريجيّة لا تُفرغ القائمة (عيبُ المراجعة م٢)', () => {
  // «ال» + حرف: كانت تجد قبل التطبيع، ويجب أن تبقى تجد.
  assert.ok(find('الع').includes('/dashboard/cash-custody'), '«الع» لا تجد «العهد النقديّة»');
  assert.ok(find('الب').includes('/dashboard/gate-post'), '«الب» لا تجد «مركز البوابة»');
  // حرفٌ مفرد.
  assert.ok(find('ع').length > 0);
  // كلمةُ حشوٍ كُتبت بدايةَ كلمة.
  assert.ok(find('أو').includes('/dashboard/odoo-reports'), '«أو» لا تجد تقارير أودو');
});

test('الدرجات: التسميةُ الصريحة ٤ · المرادفُ الصريح ٣ · وسطَ كلمةٍ في التسمية ٢', () => {
  const custody = { path: '/dashboard/cash-custody', label: 'العهد النقديّة' };
  assert.equal(screenMatchScore(custody, 'النقدية'), 4);
  assert.equal(screenMatchScore(custody, 'تسوية'), 3);
  assert.equal(screenMatchScore(custody, 'قدي'), 2); // وسط «النقديه»
  assert.equal(screenMatchScore(custody, 'صاروخ'), 0);
  assert.equal(screenMatchScore(custody, ''), 0);
});

test('★★ المرادفُ الصريح يتقدّم على ورودٍ عرَضيٍّ وسط كلمة — «الأمن» ← البوابة أوّلًا', () => {
  const gate = { path: '/dashboard/gate-post', label: 'مركز البوابة' };
  const sync = { path: '/dashboard/somewhere', label: 'المزامنة' }; // فيها «امن» وسط الكلمة
  assert.ok(screenMatchScore(gate, 'الأمن') > screenMatchScore(sync, 'الأمن'));
  assert.ok(screenMatchScore(sync, 'الأمن') > 0); // ما زالت تظهر، لكن بعدها
});

test('شاشةٌ بلا مرادفاتٍ تبقى مبحوثةً بتسميتها — الغيابُ لا يُخفي', () => {
  const plain = { path: '/dashboard/nowhere-special', label: 'إدارة الأصناف' };
  assert.equal(screenMatches(plain, 'الأصناف'), true);
  assert.equal(screenMatches(plain, 'اصناف'), true); // بلا همزةٍ وبلا «ال»
  assert.equal(screenMatches(plain, 'عهدة'), false);
});

test('★★ كلُّ مسارٍ في المرادفات شاشةٌ قائمةٌ في الكتالوج — لا مرادفَ يتيمًا', () => {
  const known = new Set(SCREENS.map((s) => s.path));
  for (const path of Object.keys(NAV_SEARCH_ALIASES)) {
    assert.ok(known.has(path), `مرادفٌ لشاشةٍ غير موجودة: ${path}`);
  }
});
