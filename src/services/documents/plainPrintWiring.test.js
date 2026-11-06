/**
 * 🔒 حارسُ الطباعة المحايدة ‹155-PRINT› — رايةُ `plainPrint` على مستوى المخطّط.
 *
 * ═══ طلبُ المالك (منظومة موقع 155) ═══
 * كلُّ مستندٍ من مستندات الموقع (جرد/صرف/استلام/مناولة/نقل/عهد) يُطبع **بلا
 * اسمٍ أو شعارٍ أو صفةِ شركة**. والعلاجُ رايةٌ واحدةٌ `schema.plainPrint` تُضيف
 * صِنفَ `dp-plain` على جذر ورقة الطباعة، والإخفاءُ كلُّه CSS يطابق هذا الصنف.
 *
 * ولا مُصيّرَ DOM في هذه البوّابة (اختباراتٌ خالصةٌ في node)، فالحارسُ يقرأ
 * مصدرَ `DocumentPrint.jsx` ويُثبت الوصلَ **بالنقض لا بالوجود**:
 *   ① الرايةُ تُشتقّ من `=== true` حصرًا — فغيابُها طباعةٌ كاملة.
 *   ② الجذرُ يحمل `dp-plain` عند الراية وحدها.
 *   ③ CSS يُخفي الشعارَ والتذييلَ **لـ`dp-plain` وحدها**.
 *   ④ ★ النقضُ: المسارُ الافتراضيُّ ما زال يرسم الهويّةَ كاملةً (BFP/BHOME
 *      والتذييل) بلا شرطِ JS يحجبها — فالمستندُ الرسميُّ الآخرُ لا يتأثّر.
 *      وخاناتُ التوقيع تبقى (المواصفةُ تطلبها).
 *
 * ⚠️ وإن سقط هذا الحارس فالعلاجُ إصلاحُ الوصل لا تليينُ الشرط.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const print = fs.readFileSync(
  path.join(HERE, '..', '..', 'components', 'brandzo-erp', 'documents', 'DocumentPrint.jsx'),
  'utf8',
);

/* ───────── ① الراية تُشتقّ من `=== true` حصرًا ───────── */

test('★★ الرايةُ صريحةٌ: plainPrint === true لا قيمةٌ صادقةٌ عابرة', () => {
  assert.match(print, /const plain = schema\?\.plainPrint === true;/);
});

/* ───────── ② الجذرُ يحمل dp-plain عند الراية وحدها ───────── */

test('★★ الجذرُ dp-plain مشروطٌ بالراية، والافتراضُ doc-print وحده', () => {
  assert.match(print, /className=\{plain \? 'doc-print dp-plain' : 'doc-print'\}/);
});

/* ───────── ③ CSS يُخفي الهويّتين لـdp-plain وحدها ───────── */

test('★★ المحايدةُ تُخفي الشعارَ والتذييلَ وتحيّد الأحمرَ — بقاعدةٍ تطابق dp-plain', () => {
  assert.match(print, /\.doc-print\.dp-plain \.dp-brand \{ display: none; \}/);
  assert.match(print, /\.doc-print\.dp-plain \.dp-foot \{ display: none; \}/);
  assert.match(print, /\.doc-print\.dp-plain \.dp-head \{ border-bottom-color: #333; \}/);
});

/* ───────── ④ النقضُ: الافتراضيُّ يبقى كاملًا ───────── */

test('★★★ نقضٌ: المستندُ بلا الراية ما زال يطبع الهويّةَ كاملةً — لا شرطَ JS يحجبها', () => {
  // كتلةُ الشعار والتذييلُ يُرسمان دائمًا في JSX — الإخفاءُ CSS فقط (لـdp-plain).
  assert.match(print, /<div className="dp-brand">/);
  assert.match(print, /<span className="dp-logo">BFP<\/span>/);
  assert.match(print, /<strong>BHOME<\/strong>/);
  assert.match(print, /<footer className="dp-foot">/);
  assert.match(print, /BHOME — نادي الأهلي، بنغازي/);
  // ولا شرطَ `plain` يلتفّ على كتلتَي الهويّة في الرسم (وإلّا تأثّر الرسميُّ).
  assert.equal(/plain[^\n]*className="dp-brand"/.test(print), false);
  assert.equal(/plain[^\n]*className="dp-foot"/.test(print), false);
});

/* ───────── ⑤ خاناتُ التوقيع تبقى (المواصفةُ تطلبها) ───────── */

test('★ خاناتُ التوقيع لا تُمسّ بالطباعة المحايدة', () => {
  assert.match(print, /className="dp-signs"/);
  // لا قاعدةَ dp-plain تُخفي التواقيع.
  assert.equal(/\.doc-print\.dp-plain \.dp-signs \{ display: none/.test(print), false);
});
