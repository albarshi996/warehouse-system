/**
 * تحديد صفوف الجداول والنسخ منها (طلب المالك ٥ · 2026-10-02).
 *
 * ═══ ما يحلّه ═══
 * `ListView` كان يرسم خانات اختيارٍ **لا تعمل**: `<input type="checkbox">`
 * بلا `checked` ولا `onChange` ولا حالةٍ تحفظ ما اختير. فالموظّف يضغطها
 * فتُعلَّم، ثمّ يُعاد الرسم لأيّ سببٍ (وصولُ لقطةٍ من Firestore كلَّ ثانية)
 * فتُمحى — ولا شيء يُحدث بها شيئًا على أيّ حال.
 *
 * ★★★ وهذا نمطُ «مبنيٌّ ومنشورٌ وبلا مستدعٍ» بعينه — نفسُ عطبِ
 * `bz-barcode.js` الذي عاش شهورًا يُحمَّل من الخادم ولا يستدعيه أحد. الفرقُ
 * أنّ هذا **يُرى**: المستخدم يرى مربّعًا فيستنتج أنّ ثمّة تحديدًا، فيبحث
 * عن زرٍّ يفعل بالمحدَّد شيئًا ولا يجد. والمربّعُ الذي لا يفعل أسوأ من
 * غيابه، لأنّه يَعِد.
 *
 * ═══ ولماذا النسخُ من البيانات لا من الشاشة ═══
 * ★★★ خلايا `ListView` **عقدُ React** لا نصوص: الحالةُ شارةٌ ملوّنة،
 * و«الانتظار» أيقونةٌ ورقم، والإجراءاتُ زرّان. فنسخُ المرسوم (بقراءة
 * `innerText`) يُخرج «⚠ 12 يومًا فتح ←» في خليّةٍ واحدة — ويُلصَق في إكسل
 * ركامًا. فالنسخُ يقرأ **صفوفَ البيانات المسطَّحة** التي بُنيت للتصدير
 * أصلًا، فما يُنسَخ هو ما يُصدَّر حرفًا بحرف.
 *
 * منطق خالص: بلا DOM وبلا React — الحالةُ تُحفظ حيث شاء المستدعي.
 */

/* ═══════════════ التحديد ═══════════════ */

/**
 * يقلب تحديد صفٍّ واحد — يُعيد **مجموعةً جديدة** لا يعدّل القديمة.
 *
 * ولمَ جديدة؟ لأنّ React لا يُعيد الرسم على تعديلِ `Set` في موضعه: المرجع
 * لم يتغيّر فالمقارنة السطحيّة تقول «لا جديد». وتعديلٌ في الموضع يعطي
 * خانةً تُضغط ولا تتغيّر — وهو العطب نفسه بلبوسٍ آخر.
 */
export function toggleId(selected, id) {
  const next = new Set(selected || []);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * يقلب تحديد الكلّ: إن كان كلُّ المعروض محدَّدًا أُفرِغ، وإلّا حُدِّد الكلّ.
 *
 * ⚠️ «الكلّ» هو **المعروضُ بعد التصفية** لا كلُّ ما في المجموعة. فمن صفّى
 * على مورّدٍ ثمّ ضغط «تحديد الكلّ» أراد مستندات ذلك المورّد — ولو حُدِّد
 * ما خلف التصفية لاعتمد ما لا يرى. وهذا الفرقُ هو الفرق بين إجراءٍ جماعيٍّ
 * آمنٍ وكارثة.
 */
export function toggleAll(selected, visibleIds) {
  const ids = (visibleIds || []).filter((id) => id != null);
  const next = new Set(selected || []);
  if (ids.length > 0 && ids.every((id) => next.has(id))) {
    for (const id of ids) next.delete(id);
    return next;
  }
  for (const id of ids) next.add(id);
  return next;
}

/** هل كلُّ المعروض محدَّد؟ (الفارغُ ليس «كلًّا» — فلا تُعلَّم الخانةُ على لا شيء) */
export function isAllSelected(selected, visibleIds) {
  const ids = (visibleIds || []).filter((id) => id != null);
  if (ids.length === 0) return false;
  const set = selected || new Set();
  return ids.every((id) => set.has(id));
}

/** هل بعضُ المعروض محدَّدٌ لا كلُّه؟ (لحالة `indeterminate` في الخانة) */
export function isSomeSelected(selected, visibleIds) {
  const ids = (visibleIds || []).filter((id) => id != null);
  const set = selected || new Set();
  const hit = ids.filter((id) => set.has(id)).length;
  return hit > 0 && hit < ids.length;
}

/**
 * يُقصّ التحديدَ على ما بقي معروضًا.
 *
 * ★★ ضرورةٌ لا ترفٌ: المستخدم يحدّد خمسةً ثمّ يشدّد التصفية فيختفي ثلاثة
 * منها عن عينه — ويبقون محدَّدين. فيضغط «اعتماد المحدَّد» فيعتمد ثلاثةً
 * **لا يراها**. والتصفيةُ تُقصّ التحديد فلا يبقى محدَّدٌ خارج النظر.
 */
export function pruneSelection(selected, visibleIds) {
  const ids = new Set((visibleIds || []).filter((id) => id != null));
  const next = new Set();
  for (const id of selected || []) if (ids.has(id)) next.add(id);
  return next;
}

/** الصفوفُ المحدَّدة بترتيب العرض — لا بترتيب الضغط. */
export function selectedRows(rows, selected, idKey = 'id') {
  const set = selected || new Set();
  return (rows || []).filter((r) => set.has(r?.[idKey]));
}

/** عددُ المحدَّد من المعروض — ما يُكتب على الزرّ. */
export function selectedCount(selected, visibleIds) {
  const ids = (visibleIds || []).filter((id) => id != null);
  const set = selected || new Set();
  return ids.filter((id) => set.has(id)).length;
}

/* ═══════════════ النسخ ═══════════════ */

/**
 * يُهيّئ خليّةً لحافظة الجداول.
 *
 * ⚠️ الجدولُ المُلصَق في إكسل يُفصَل بـ`\t` وأسطرُه بـ`\r\n`. وخليّةٌ فيها
 * تبويبٌ أو سطرٌ **تُمزّق الجدول**: قيمةٌ واحدةٌ تصير عمودين أو صفّين.
 * فتُستبدل المسافاتُ البنيويّة بمسافةٍ عاديّة — ولا تُحذف القيمة.
 */
export function clipCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * جدولٌ نصّيٌّ للحافظة — عناوينُ ثمّ صفوف، مفصولةٌ بتبويب.
 *
 * TSV لا CSV: إكسل يفتح النصَّ المفصولَ بتبويبٍ أعمدةً **بلا معالج استيراد**
 * عند اللصق، أمّا الفاصلةُ فتحتاج ترحيلًا أو تقع كلُّها في عمودٍ واحد. وهذا
 * هو الفرقُ العمليّ بين «انسخ والصق» و«انسخ ثمّ عالج».
 *
 * @param {{key:string,label:string}[]} columns
 * @param {object[]} rows صفوفٌ مسطَّحة (قيمٌ نصّيّةٌ وأرقام) لا عقدُ React
 * @param {{headers?:boolean}} [opts]
 */
export function toTsv(columns, rows, opts = {}) {
  const cols = (columns || []).filter((c) => c && c.key);
  const withHeaders = opts.headers !== false;
  const lines = [];
  if (withHeaders) lines.push(cols.map((c) => clipCell(c.label ?? c.key)).join('\t'));
  for (const r of rows || []) {
    lines.push(cols.map((c) => clipCell(r?.[c.key])).join('\t'));
  }
  return lines.join('\r\n');
}

/**
 * نصُّ النسخ للمحدَّد — أو للمعروض كلِّه إن لم يُحدَّد شيء.
 *
 * ★ والتراجعُ مقصود: من ضغط «انسخ» بلا تحديدٍ يريد الجدول الذي أمامه، لا
 * رسالةَ «حدّد أوّلًا». والعددُ يُعاد معه كي تقول الشاشة ماذا نُسخ بالضبط
 * — فالنسخُ لا أثرَ له يُرى، فإن لم يُخبَر المستخدمُ شكَّ أنّه وقع.
 */
export function copyPlan({ columns, rows, selected, idKey = 'id', headers = true }) {
  const chosen = selected && selected.size > 0 ? selectedRows(rows, selected, idKey) : rows || [];
  return {
    count: chosen.length,
    scope: selected && selected.size > 0 ? 'selected' : 'visible',
    tsv: toTsv(columns, chosen, { headers }),
  };
}

/**
 * رسالةُ تأكيدِ النسخ — عربيّةٌ وبأرقامٍ لاتينيّة (R2).
 * تُبنى هنا لا في الشاشة كي لا تفترق صيغتُها بين جدولٍ وآخر.
 */
export function copyMessage(plan) {
  if (!plan || plan.count === 0) return 'لا صفوفَ للنسخ.';
  const what = plan.scope === 'selected' ? 'المحدَّد' : 'المعروض';
  return `نُسِخ ${plan.count} صفًّا (${what}) — الصقه في إكسل مباشرةً.`;
}

/* ═══════════════ الكتابة إلى الحافظة ═══════════════ */

/**
 * يكتب نصًّا في حافظة النظام — ويُعيد `true` عند النجاح.
 *
 * ⚠️ **ثلاثُ بيئاتٍ لا بيئةٌ واحدة**، ولذلك التراجع:
 *   ١. `navigator.clipboard.writeText` تحتاج **سياقًا آمنًا** (https أو
 *      localhost). والبوّابةُ على GitHub Pages فهي https — لكنّ تطبيق
 *      ويندوز (قشرة Tauri) وشبكةَ المستودع الداخليّة قد لا تكونا.
 *   ٢. وتحتاج **إيماءةَ مستخدم**: استدعاؤها بعد `await` طويلٍ يُرفض في
 *      بعض المتصفّحات لانقطاع سلسلة الإيماءة.
 *   ٣. فالتراجعُ إلى `textarea` مخفيّةٍ و`execCommand('copy')` — مهجورةٌ
 *      ومدعومةٌ في كلّ ما نُشغّل عليه، وهي الطريقُ الوحيد في الأوفلاين
 *      غير الآمن.
 * ولا تُلتقط الأخطاءُ صامتةً: يُعاد `false` فتقول الشاشةُ «تعذّر النسخ»
 * بدل أن تدّعي نجاحًا لم يقع.
 *
 * @param {string} value
 * @param {{navigator?:object, document?:object}} [env] للاختبار في Node
 * @returns {Promise<boolean>}
 */
export async function writeClipboard(value, env = {}) {
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const docu = env.document ?? (typeof document !== 'undefined' ? document : null);
  const payload = String(value ?? '');
  if (!payload) return false;

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(payload);
      return true;
    } catch {
      // يُجرَّب التراجع — لا يُستسلم على أوّل رفض.
    }
  }

  if (docu?.createElement && docu?.body && docu?.execCommand) {
    try {
      const ta = docu.createElement('textarea');
      ta.value = payload;
      // بعيدًا عن الشاشة لا `display:none`: المخفيّةُ تمامًا لا تُحدَّد فلا تُنسَخ.
      ta.setAttribute('aria-hidden', 'true');
      if (ta.style) {
        ta.style.position = 'fixed';
        ta.style.insetInlineStart = '-9999px';
        ta.style.top = '0';
      }
      docu.body.appendChild(ta);
      ta.focus?.();
      ta.select?.();
      const ok = docu.execCommand('copy');
      ta.remove?.();
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  return false;
}
