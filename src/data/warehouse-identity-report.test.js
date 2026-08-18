/**
 * حارس عرض «الهوية التشغيلية للمستودعات».
 *
 * العرض **لا يؤلّف شيئًا**: يفتح تقرير التسويق نفسه ويُظهر قسمًا في كل شريحة.
 * فالخطر الوحيد أن يفترق فهرسُ العرض عن فهرس الملفّ — فيُعرض على التسويق
 * قسمٌ لا وجود له، أو يسقط قسمٌ موجود. لذلك يُعيد هذا الحارس قراءة التقرير
 * المنشور ويطابقه بالفهرس: رقمًا وعنوانًا ومرساةً وترتيبًا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REPORT_PATH, meetingMeta, sections, keyboardHelp } from './warehouse-identity-report.js';

const reportFile = fileURLToPath(new URL(`../../public${REPORT_PATH}`, import.meta.url));
const html = readFileSync(reportFile, 'utf8');

/** فهرس التقرير كما هو في الملفّ — يُقرأ ولا يُفترض. */
const fileToc = [...html.matchAll(/<a href="#([^"]+)"><span>(\d+)<\/span>([^<]+)<\/a>/g)]
  .map(([, anchor, n, title]) => ({ n, title: title.trim(), anchor }));

test('التقرير المصدر منشورٌ في البوابة ومعه أصوله', () => {
  assert.ok(existsSync(reportFile), `التقرير غير موجود: ${REPORT_PATH}`);
  assert.ok(statSync(reportFile).size > 500_000, 'التقرير أصغر من أن يكون النسخة الكاملة');
  for (const asset of [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(([, a]) => a)) {
    const path = fileURLToPath(new URL(`../../public/warehouse-identity/${asset}`, import.meta.url));
    assert.ok(existsSync(path), `أصلٌ مشارٌ إليه في التقرير وغير منقول: ${asset}`);
  }
});

test('فهرس العرض هو فهرس التقرير نفسه — رقمًا وعنوانًا ومرساةً وترتيبًا', () => {
  assert.equal(fileToc.length, 26, `عدد أقسام التقرير تغيّر: ${fileToc.length}`);
  assert.deepEqual(sections, fileToc, 'فهرس العرض فارق فهرس التقرير');
});

test('كل مرساةٍ في الفهرس لها عنوانٌ فعليّ في التقرير', () => {
  for (const section of sections) {
    assert.ok(
      html.includes(`id="${section.anchor}"`),
      `المرساة «${section.anchor}» (${section.title}) غير موجودةٍ في التقرير`,
    );
  }
});

test('أقسام العنوان في التقرير بعدد الفهرس — فلا قسمٌ يسقط من العرض', () => {
  const depthOne = [...html.matchAll(/<section class="content-section depth-1"[^>]*data-title="([^"]+)"/g)]
    .map(([, title]) => title.trim());
  assert.equal(depthOne.length, sections.length, `أقسام depth-1: ${depthOne.length}`);
  assert.deepEqual(depthOne, sections.map((section) => section.title));
});

test('نماذج التقرير البصريّة موجودةٌ فيما يُعرض — لا نصٌّ مجرّد', () => {
  // ٤٤٢ بطاقة نموذج مرسومةً بـSVG: هي جوهر ما صمّمه التسويق، ووجودها شرط
  // أن يكون المعروض «العرض» لا ملخّصًا عنه.
  const cards = (html.match(/class="concept-card/g) || []).length;
  const svgs = (html.match(/<svg\b/g) || []).length;
  assert.ok(cards >= 400, `بطاقات النماذج أقلّ من المتوقّع: ${cards}`);
  assert.ok(svgs >= 700, `رسوم SVG أقلّ من المتوقّع: ${svgs}`);
});

test('بيانات العرض مكتملةٌ بلا تأليف', () => {
  assert.ok(meetingMeta.docNumber?.trim() && meetingMeta.titleAr?.trim());
  assert.equal(keyboardHelp.length, 5);
  for (const section of sections) {
    assert.match(section.n, /^\d{2}$/, `رقم قسمٍ غير قياسيّ: ${section.n}`);
    assert.ok(section.title.trim() && section.anchor.trim());
  }
});
