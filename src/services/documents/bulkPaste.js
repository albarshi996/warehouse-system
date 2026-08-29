/**
 * قارئُ اللصق الجماعيّ — نصٌّ ملصوقٌ ⇒ خطّةُ صفوف (BULK-101 · يسدّ ث‑٢).
 *
 * ═══ ما يحلّه ═══
 * خانةُ الجدول `input` عاديّة: لصقُ عشرين سطرًا يضع النصّ كلَّه في خانةٍ
 * واحدة — عشرون كودًا في خليّةٍ واحدة. فالمطلوب أن يُقرأ النصّ **قبل** أن
 * يصل الخانة، ويُترجَم إلى «أيّ خليّةٍ تأخذ ماذا، وكم صفًّا يُضاف».
 *
 * ═══ ولا شيء هنا يعرف متصفّحًا ═══
 * لا DOM ولا React ولا شبكة — نصٌّ يدخل وخطّةٌ تخرج. ولذلك يُختبر كلُّه
 * قبل أن تُلمس الواجهة (§22 ‹995›)، وهو شرطُ BULK-101 الصريح.
 *
 * ═══ القواعد الثلاث ═══
 *   ① **سطرٌ لكلّ صنف، وتبويبٌ بين الأعمدة** — كما ينسخ إكسل حرفيًّا،
 *      والأعمدةُ تُملأ بالترتيب من الخانة التي بدأ منها اللصق (BULK-O02).
 *   ② **`CRLF` يُقلَّم** — إكسل وويندوز ينسخان بـ`\r\n`، ومحرفُ `\r`
 *      الزائد يجعل «ITM-1» كودًا آخر لا يجده الماستر أبدًا.
 *   ③ **الفارغ لا يدهس المكتوب** — خليّةٌ فارغةٌ في اللصقة تُترك، ولا
 *      تُبيّض ما كتبه الموظّف بيده. وهي قاعدةُ `applyItemToLine` نفسُها.
 */

/** فاصلُ الأسطر بكلّ صيغه — ويندوز وماك القديم ويونكس. */
const EOL = /\r\n|\r|\n/;

/**
 * يفكّك النصّ الملصوق إلى شبكةٍ من خلايا مقلَّمة.
 * الأسطرُ الفارغةُ تُسقط (سطرٌ أخيرٌ فارغٌ يرافق كلّ نسخةٍ من إكسل)،
 * والخلايا الفارغةُ في ذيل السطر تُقصّ (تبويبٌ متأخّرٌ لا يعني عمودًا).
 *
 * @returns {string[][]} صفوفٌ من خلايا — فارغةٌ إن لم يكن في النصّ شيء.
 */
export function parsePastedGrid(text) {
  return String(text ?? '')
    .split(EOL)
    .map((row) => {
      const cells = row.split('\t').map((c) => c.trim());
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      return cells;
    })
    .filter((cells) => cells.length > 0);
}

/**
 * هل هذه لصقةٌ جماعيّةٌ أصلًا؟
 *
 * ★ سطرٌ واحدٌ بخليّةٍ واحدة **ليس** لصقًا جماعيًّا: هو لصقُ كودٍ واحدٍ في
 * خانة، وسلوكُه اليوم صحيحٌ ولا يُغيَّر (شرطُ BULK-102). والتغييرُ يبدأ
 * حيث يعجز القديم لا قبله.
 */
export function isBulkPaste(text) {
  const grid = parsePastedGrid(text);
  return grid.length > 1 || (grid.length === 1 && grid[0].length > 1);
}

/**
 * خطّةُ اللصق: أيّ خليّةٍ تأخذ ماذا، وكم صفًّا يُضاف إلى الجدول.
 *
 * الصفُّ `k` من اللصقة يقع على البند `startIndex + k` — كما يفعل إكسل حين
 * تلصق في خليّة: من هنا ونزولًا. وما تجاوز آخرَ البنود يُضاف.
 *
 * ★ **وما خارج مدى اللصقة لا يُمسّ**: بنودٌ فوق `startIndex` وبنودٌ بعد
 * آخر صفٍّ ملصوقٍ تبقى كما هي حرفيًّا — واللصقُ لا يُعيد بناء الجدول.
 *
 * @param {object} p
 * @param {string} p.text النصّ الملصوق كما وصل من الحافظة
 * @param {number} p.startIndex فهرس البند الذي بدأ منه اللصق
 * @param {string[]} p.columnKeys مفاتيح أعمدة الجدول بترتيب العرض
 * @param {string} p.startColumnKey مفتاح العمود الذي بدأ منه اللصق
 * @param {number} p.lineCount عدد البنود القائمة الآن
 * @returns {{rows: Array<{index: number, patch: object}>, appendCount: number, cellsDropped: number}}
 */
export function planPaste({ text, startIndex = 0, columnKeys = [], startColumnKey, lineCount = 0 }) {
  const grid = parsePastedGrid(text);
  const from = columnKeys.indexOf(startColumnKey);
  // عمودٌ لا يعرفه الجدول ⇒ لا خطّة. ولا نخمّن عمودًا لم يُطلب.
  if (!grid.length || from < 0) return { rows: [], appendCount: 0, cellsDropped: 0 };

  const targets = columnKeys.slice(from);
  let cellsDropped = 0;
  const rows = [];

  for (let k = 0; k < grid.length; k++) {
    const cells = grid[k];
    const patch = {};
    for (let c = 0; c < cells.length; c++) {
      // ③ الفارغ لا يدهس المكتوب.
      if (cells[c] === '') continue;
      // أعمدةٌ أكثر ممّا يتّسع له الجدول تُسقط — ويُصرَّح بعددها لا تُبتلع.
      if (c >= targets.length) { cellsDropped += 1; continue; }
      patch[targets[c]] = cells[c];
    }
    rows.push({ index: startIndex + k, patch });
  }

  const lastIndex = startIndex + grid.length; // أوّلُ فهرسٍ بعد اللصقة
  return { rows, appendCount: Math.max(0, lastIndex - lineCount), cellsDropped };
}

/**
 * يطبّق الخطّة على مصفوفة البنود — دالّةٌ خالصةٌ تُعيد مصفوفةً جديدة.
 *
 * @param {object[]} lines البنود القائمة
 * @param {object} plan ناتج `planPaste`
 * @param {() => object} makeLine مصنعُ بندٍ فارغٍ مطابقٍ للمخطّط (`emptyLine`)
 */
export function applyPastePlan(lines, plan, makeLine) {
  const next = [...(lines || [])];
  for (let i = 0; i < (plan?.appendCount || 0); i++) next.push(makeLine());
  for (const { index, patch } of plan?.rows || []) {
    if (!next[index]) continue;
    next[index] = { ...next[index], ...patch };
  }
  return next;
}

/**
 * قرارُ اللصق في خانةٍ مرجعيّة: أيُترك للمتصفّح أم يُلتقط جملةً؟
 *
 * ★★ **هذه هي البوّابة التي تحمي ٤٥ مستندًا.** المكوّن واحدٌ يخدمها كلَّها،
 * ومسارُ قارئ الباركود يمرّ بالخانة نفسِها. فالقاعدة: **لا يُلتقط إلّا ما
 * يعجز عنه القديم** — كلمةٌ واحدةٌ تُترك للمتصفّح كما كانت، وخطّةٌ خاويةٌ
 * تُترك أيضًا. والالتقاطُ استثناءٌ يُبرّر نفسه لا أصلٌ يُفترض.
 *
 * @returns {{kind:'default'}|{kind:'bulk', plan: object}}
 */
export function pasteDecision(input) {
  if (!isBulkPaste(input?.text)) return { kind: 'default' };
  const plan = planPaste(input || {});
  if (!plan.rows.length) return { kind: 'default' };
  return { kind: 'bulk', plan };
}

/** أكوادُ اللصقة في عمود الاستدعاء — بفهارس بنودها، وبلا فارغ. */
export function pastedCodes(plan, columnKey) {
  return (plan?.rows || [])
    .map(({ index, patch }) => ({ index, value: patch?.[columnKey] || '' }))
    .filter((c) => c.value);
}
