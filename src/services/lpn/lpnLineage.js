/**
 * نسب الطبالي — التقسيم والدمج بعلاقة أمٍّ وبنت. منطق خالص بلا Firebase.
 *
 * المشكلة التي يحلّها: طبليةُ صرفٍ جُمعت من ثلاث طبالي استلام — من أين جاءت
 * الكرتونة التالفة التي وصلت العميل؟ بلا نسبٍ لا جواب، ومع النسب سؤالُ
 * ثوانٍ: البنت تسمّي أمّهاتها والأمّ تسمّي بناتها حتى أوّل استلام.
 *
 * ═══ قاعدة خطة ٧ الحاكمة (LPN-402) ═══
 * **الطبلية الكاملة غير المفتوحة تعبر بهويّتها** — لا هويّة جديدة لنقلٍ لم
 * يغيّر المحتوى (استمرارية التتبّع). أمّا **التقسيم والدمج وتغيير المحتوى
 * فهويّةٌ جديدة** بروابط `parentCodes` — فلأيّ كمّيّةٍ أصلٌ يُتتبَّع.
 *
 * والدمج لا يبتلع: طبليتان تُدمجان في **هويّةٍ ثالثة** تسمّيهما معًا — لو
 * ابتلعت إحداهما الأخرى لَضاع نصف النسب وبقي رقمٌ يكذب عن نصف حمولته.
 *
 * توليد هويّة البنت في `lpnService.js` (العدّاد الذرّي) — هنا يُمرَّر
 * `childCode` جاهزًا ويُتحقّق من نحوه فقط.
 */

import { isValidLpnCode, normalizeLpnCode } from './lpnCode.js';
import { addReading, removeQty, isEmpty, lineKey } from './lpnContents.js';
import { contentChangeProblem, activeFlags } from './lpnLifecycle.js';

/**
 * تقسيم: سحبُ بنودٍ من الأمّ إلى بنتٍ جديدة.
 *
 * الأمّ تبقى بهويّتها وحالتها — ينقص محتواها فقط. والبنت تولد بحالة ميلادٍ
 * يمرّرها المستدعي (`PICKING` لطبلية صرف، `SCANNING` لإعادة تكوين) وتحمل
 * `parentCodes: [أمّها]`.
 *
 * @param {object} parent الطبلية الأمّ {code, warehouse, bin, lines, ...}
 * @param {object} opts {takes: بنود السحب, childCode, childState, actor}
 * @returns {{parent:object, child:object}|{problem:string}}
 */
export function splitUnit(parent, { takes, childCode, childState = 'PICKING', actor, override = false, overrideNote = '' } = {}) {
  const code = normalizeLpnCode(childCode);
  if (!isValidLpnCode(code)) return { problem: `هويّة البنت «${childCode ?? ''}» غير صالحة — تولد من العدّاد لا من اليد.` };
  if (code === normalizeLpnCode(parent?.code)) return { problem: 'البنت لا تحمل هويّة أمّها — التقسيم يولّد هويّةً جديدة.' };
  if (!Array.isArray(takes) || takes.length === 0) return { problem: 'تقسيمٌ بلا بنودٍ مسحوبة لا معنى له.' };
  if (!String(actor ?? '').trim()) return { problem: 'التقسيم بلا فاعلٍ لا يُسجَّل.' };

  // ★★ الحارس الذي يمنع «غسل الوسم بالتقسيم»: أمٌّ ختاميّةٌ أو موسومةٌ حاجبًا
  // لا تُقسَّم — وإلّا ولدت بنتٌ نظيفةُ الأوسمة من حمولةٍ تالفةٍ أو مصروفة.
  const guard = contentChangeProblem(parent, { override, overrideNote });
  if (guard) return { problem: guard };

  let parentLines = parent?.lines ?? [];
  let childLines = [];
  for (const take of takes) {
    // ★ بند البنت يُبنى من **بند الأمّ** (الاسم والمعامل والباركود) والكمّيّة
    // وحدها من `take` — وإلّا ضاع المعامل فصار baseQty مجهولًا، فاختلّ فاحص
    // الاحتواء وحُسبت البنت أربعةً بدل ثمانيةٍ وأربعين.
    const source = (parentLines ?? []).find((l) => lineKey(l) === lineKey(take));
    if (!source) {
      return { problem: `الصنف «${take?.sku || take?.barcode || ''}» بدفعة «${take?.batch || 'بلا رقم'}» ليس على هذه الطبلية.` };
    }
    const removed = removeQty(parentLines, take);
    if (removed.problem) return { problem: removed.problem };
    parentLines = removed.lines;
    // البنت تُبنى بقواعد الإضافة نفسها — لا بابَ خلفيًّا يمرّر ما تمنعه القراءة.
    // بلا asOf عمدًا: ما كان على الأمّ مشروعٌ أن ينتقل للبنت ولو اقترب أجله —
    // حكم الصلاحية وقع يوم الاستلام، والتقسيم نقلٌ لا استلامٌ جديد.
    const added = addReading(childLines, { ...source, qty: Number(take?.qty) }, {});
    if (added.problem) return { problem: added.problem };
    childLines = added.lines;
  }

  return {
    parent: { ...parent, lines: parentLines },
    child: {
      code,
      warehouse: parent?.warehouse ?? '',
      bin: parent?.bin ?? '',
      state: childState,
      // ★ البنت ترث أوسمة أمّها: الوسم صفةُ **البضاعة** لا صفةُ الرقم —
      // بضاعةٌ تالفةٌ تبقى تالفةً وإن نُقلت إلى حمولةٍ جديدة.
      flags: activeFlags(parent),
      lines: childLines,
      parentCodes: [normalizeLpnCode(parent?.code)],
      sourceDoc: parent?.sourceDoc ?? null,
    },
  };
}

/**
 * دمج: حمولتان فأكثر تلتقيان في هويّةٍ ثالثة جديدة.
 *
 * المصادر تُفرَّغ وتبقى بهويّاتها فارغةً معلَمة — لا تُحذف (الهويّة لا يُعاد
 * استخدامها)، والدامجُ الحقّ سجلُّ الأحداث: «أُفرغت في LPN-كذا».
 *
 * @returns {{merged:object, sources:Array<object>}|{problem:string}}
 */
export function mergeUnits(units, { mergedCode, mergedState = 'APPROVED', actor, override = false, overrideNote = '' } = {}) {
  const code = normalizeLpnCode(mergedCode);
  if (!isValidLpnCode(code)) return { problem: `هويّة الدمج «${mergedCode ?? ''}» غير صالحة — تولد من العدّاد لا من اليد.` };
  if (!Array.isArray(units) || units.length < 2) return { problem: 'الدمج يحتاج طبليتين فأكثر.' };
  if (units.some((u) => normalizeLpnCode(u?.code) === code)) {
    return { problem: 'هويّة الدمج جديدةٌ دائمًا — لا يبتلع مصدرٌ بقية المصادر بهويّته.' };
  }
  if (!String(actor ?? '').trim()) return { problem: 'الدمج بلا فاعلٍ لا يُسجَّل.' };

  // ★★ كلّ مصدرٍ يمرّ بحارس مسّ الحمولة — فلا تُغسل أوسمةُ تالفٍ بدمجه
  // في حمولةٍ جديدة، ولا تُستأنف حياةُ مصروفةٍ انتهت دورتها.
  for (const u of units) {
    const guard = contentChangeProblem(u, { override, overrideNote });
    if (guard) return { problem: `الطبلية «${u?.code ?? ''}»: ${guard}` };
  }

  const warehouses = [...new Set(units.map((u) => String(u?.warehouse ?? '').trim().toUpperCase()).filter(Boolean))];
  if (warehouses.length > 1) {
    return { problem: `الدمج داخل مستودعٍ واحد — المصادر في ${warehouses.join(' و')}؛ النقل بين المستودعين بمستنده لا بالدمج.` };
  }

  let mergedLines = [];
  for (const u of units) {
    for (const line of u?.lines ?? []) {
      const added = addReading(mergedLines, line, {});
      if (added.problem) return { problem: added.problem };
      mergedLines = added.lines;
    }
  }

  return {
    merged: {
      code,
      warehouse: units[0]?.warehouse ?? '',
      bin: units[0]?.bin ?? '',
      state: mergedState,
      // اتّحاد أوسمة المصادر — الوسم صفةُ البضاعة، والدمج لا يُطهّرها.
      flags: [...new Set(units.flatMap((u) => activeFlags(u)))],
      lines: mergedLines,
      parentCodes: units.map((u) => normalizeLpnCode(u?.code)),
      sourceDoc: null,
    },
    sources: units.map((u) => ({ ...u, lines: [] })),
  };
}

/**
 * شجرة النسب من سجلّ الطبالي كلّه: أصولًا صعودًا وفروعًا نزولًا.
 *
 * قراءةٌ محضة على خريطة `code → unit` — والحلقة الدوريّة (فسادُ بياناتٍ
 * نظريّ) تُقطَع بزيارةٍ واحدة لكلّ عقدة فلا دوران أبديّ.
 *
 * @returns {{ancestors:string[], descendants:string[]}}
 */
export function lineageTrace(allUnits, rawCode) {
  const code = normalizeLpnCode(rawCode);
  const byCode = new Map((allUnits ?? []).map((u) => [normalizeLpnCode(u?.code), u]));

  const ancestors = [];
  const upSeen = new Set([code]);
  const climb = (c) => {
    for (const p of byCode.get(c)?.parentCodes ?? []) {
      const pc = normalizeLpnCode(p);
      if (upSeen.has(pc)) continue;
      upSeen.add(pc);
      ancestors.push(pc);
      climb(pc);
    }
  };
  climb(code);

  const descendants = [];
  const downSeen = new Set([code]);
  const dive = (c) => {
    for (const [uc, u] of byCode) {
      if (downSeen.has(uc)) continue;
      if ((u?.parentCodes ?? []).some((p) => normalizeLpnCode(p) === c)) {
        downSeen.add(uc);
        descendants.push(uc);
        dive(uc);
      }
    }
  };
  dive(code);

  return { ancestors, descendants };
}

/** أتحتاج الحركةُ هويّةً جديدة؟ قاعدة LPN-402 دالّةً واحدة تُستدعى لا تُحفظ. */
export function needsNewIdentity({ contentChanged = false, isSplit = false, isMerge = false } = {}) {
  return Boolean(contentChanged || isSplit || isMerge);
}

export { isEmpty };
