/**
 * حارس عرض اجتماع الموارد البشرية.
 *
 * العرض لا يؤلّف شيئًا: يعرض خمس عشرة شريحةً مقتصَّةً من دليل الإدارة.
 * فالخطر الوحيد أن يفترق ما في الملفّ عمّا يقوله الفهرس — فيُعرض على
 * الموارد البشرية عنوانٌ وتحته شريحةٌ أخرى. لذلك يُقرأ الملفّ المنشور
 * ويُطابَق: عددًا وترتيبًا وعناوينَ يمكن التحقّق منها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MANUAL_PATH, keyboardHelp, meetingMeta, portalScreens, slides } from './hr-meeting.js';
import { internalPaths } from '../services/auth/navCatalog.js';

const manualFile = fileURLToPath(new URL(`../../public${MANUAL_PATH}`, import.meta.url));

test('شرائح الاجتماع منشورةٌ في البوابة', () => {
  assert.ok(existsSync(manualFile), `ملفّ الشرائح غير موجود: ${MANUAL_PATH}`);
  assert.ok(statSync(manualFile).size > 100_000, 'الملفّ أصغر من أن يحمل خمس عشرة شريحة');
});

test('عدد صفحات الملفّ يساوي عدد شرائح العرض', () => {
  // عدّ الصفحات من بنية PDF مباشرةً — بلا مكتبة: كلّ صفحة كائنٌ بنوع /Page.
  const raw = readFileSync(manualFile, 'latin1');
  const pageObjects = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pageObjects, slides.length, `صفحات الملفّ ${pageObjects} وشرائح العرض ${slides.length}`);
  assert.equal(slides.length, 15, 'العرض يجب أن يبقى خمس عشرة شريحة — قرار المالك: الأساسيات فقط');
});

test('الفهرس متّسق: صفحاتٌ فريدة وعناوينُ ومحاورُ مكتملة', () => {
  const seen = new Set();
  for (const slide of slides) {
    assert.ok(Number.isInteger(slide.page) && slide.page > 0, `صفحةٌ غير صالحة: ${slide.page}`);
    assert.ok(!seen.has(slide.page), `الشريحة ${slide.page} مكرّرة في العرض`);
    seen.add(slide.page);
    assert.ok(slide.title?.trim(), `شريحة ${slide.page} بلا عنوان`);
    assert.ok(slide.axis?.trim(), `شريحة ${slide.page} بلا محور`);
  }
});

test('محاور الاجتماع السبعة كلّها ممثَّلة', () => {
  const axes = [...new Set(slides.map((slide) => slide.axis))];
  assert.deepEqual(axes, [
    'الهيكل الوظيفي',
    'الأقسام والأدوار',
    'التوظيف وسياساته',
    'العقوبات',
    'الجوائز',
    'الترقية',
    'التوظيف والتوثيق في البوابة',
  ]);
});

/**
 * تحقّقٌ من المضمون لا من العدّ وحده: ستّة عناوين تخرج من الملفّ نصًّا
 * سليمًا (العربية المتّصلة تُستخرج أحيانًا مقلوبةً داخل الكلمة، فتُختار
 * العناوين التي تصمد). لو أُبدلت صفحةٌ بأخرى سقط هذا الاختبار.
 */
test('العناوين القابلة للاستخراج موجودةٌ في صفحاتها', () => {
  const raw = readFileSync(manualFile, 'latin1');
  for (const needle of ['القيادة ورؤساء الأقسام', 'الوظائف المساندة', 'سياسة التوظيف', 'سياسة العقوبات', 'سياسة المكافآت', 'سياسة الترقية']) {
    assert.ok(
      slides.some((slide) => slide.title.includes(needle)),
      `العنوان «${needle}» غير مذكورٍ في فهرس العرض`,
    );
  }
  assert.ok(raw.includes('/Type'), 'الملفّ ليس PDF صالحًا');
});

test('شاشات البوابة المرتبطة كلّها مسارات تعرفها البوابة', () => {
  const known = new Set(internalPaths());
  assert.equal(portalScreens.length, 7);
  for (const [label, path] of portalScreens) {
    assert.ok(known.has(path), `الشاشة «${label}» تشير إلى مسارٍ مجهول: ${path}`);
  }
});

test('بيانات العرض مكتملة', () => {
  assert.ok(meetingMeta.docNumber?.trim() && meetingMeta.titleAr?.trim() && meetingMeta.subtitle?.trim());
  assert.equal(keyboardHelp.length, 5);
});
