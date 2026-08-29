/**
 * تصديرُ PDF — **المدخلُ الوحيد** إلى `html2pdf.js` في البوّابة كلِّها.
 *
 * ═══ ولماذا مدخلٌ واحدٌ لسطرَي استدعاء؟ ═══
 * لأنّ للمكتبة **مسارًا خطِرًا وآخرَ آمنًا، والفرقُ بينهما وسيطٌ واحد**:
 *
 *   · `.from(el)` — عنصرُ DOM: يُرسَم كما هو، **ولا تُستدعى DOMPurify أصلًا**.
 *   · `.from(str)` — نصُّ HTML: تُحمَّل DOMPurify وتُنظّفه.
 *
 * ★★★ **والمكتبةُ تشحن DOMPurify 3.3.1 مخبوزةً في بنائها** — وهي في مدى
 * الإصابة (`<= 3.4.12`). ورقّينا `dompurify` إلى `3.4.14` في الشجرة، **ولم
 * يبلغ الترقيةَ ما بداخل الحزمة**: `html2pdf.js` تُعلن `dompurify: ^3.3.1`
 * فيحلّها npm إلى الجديدة، **لكنّ البناءَ الجاهز يحمل القديمةَ داخله**.
 * و`npm audit` يراها مُصلَحة — لأنّه يقرأ شجرةَ التبعيّات لا ما بداخل البناء.
 * و`0.14.0` أحدثُ ما نشره صانعوها (قِيس 2026-08-29).
 *
 * ★★ **فالخطرُ عندنا صفرٌ ما دام لا يُمرَّر نصّ** — وموضعانا يمرّران عنصرَين.
 * لكنّ ذلك **حالٌ لا ضمان**: سطرٌ واحدٌ يكتبه أحدهم غدًا (`.from(html)`)
 * يُحيي المسارَ الخطِر بلا أن يشتكي شيء. فصار المنعُ **بنيويًّا لا تذكيرًا**:
 * مدخلٌ واحدٌ يرفض ما ليس عنصرًا، وحارسٌ يمنع استيرادَ المكتبة من دونه.
 *
 * وإن رُفعت المكتبةُ أو استُبدلت يومًا، فالتغييرُ هنا وحدَه.
 */

/**
 * يتحقّق أنّ المصدر عنصرُ DOM حقيقيّ — لا نصًّا ولا كائنًا يشبهه.
 *
 * ولا يُستعمل `instanceof Element` وحدَه عمدًا: الدالّة تُختبَر في Node بلا
 * متصفّح، و`nodeType === 1` هو العقدُ الذي تقرأه `html2pdf` نفسُها.
 *
 * @param {unknown} source
 * @returns {asserts source is Element}
 */
export function assertPdfSource(source) {
  if (typeof source === 'string') {
    throw new TypeError(
      'تصديرُ PDF من نصِّ HTML ممنوع: يُحيي مسارًا داخل html2pdf يستدعي DOMPurify 3.3.1 ' +
        'المخبوزةَ في بنائها (وهي في مدى الإصابة). ابنِ عنصرًا وأدخله: ' +
        'const el = document.createElement("div"); el.innerHTML = …; ثمّ مرّر el.',
    );
  }
  if (!source || typeof source !== 'object' || source.nodeType !== 1) {
    throw new TypeError('تصديرُ PDF يحتاج عنصرَ DOM — والمُمرَّرُ ليس عنصرًا.');
  }
}

/**
 * يُصدّر عنصرَ DOM ملفَّ PDF ويحفظه.
 *
 * @param {Element} element العنصرُ المرسوم — لا نصَّ HTML.
 * @param {object} options خياراتُ html2pdf (هامش · اسم الملفّ · jsPDF · …).
 * @returns {Promise<void>}
 */
export async function exportElementToPdf(element, options) {
  assertPdfSource(element);
  const mod = await import('html2pdf.js');
  const html2pdf = mod.default || mod;
  await html2pdf().set(options).from(element).save();
}
