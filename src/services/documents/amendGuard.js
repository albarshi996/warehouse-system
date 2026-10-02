/**
 * التعديلُ في كلّ مرحلة — وحكمُه (طلب المالك ٢ و٣ · 2026-10-02).
 *
 * ═══ الطلبُ حرفيًّا ═══
 * «خاصية التعديل في كل مرحلة مستند» و«خاصية حذف مستند».
 *
 * ═══ ما كان قائمًا قبل هذه الوحدة ═══
 * `EDITABLE_STATES = ['draft','rejected']` — فالمستندُ بعد الإرسال مُغلقٌ
 * تمامًا على الجميع إلّا المدير العامّ. ومن وجد خطأً مطبعيًّا في استلامٍ
 * معتمَدٍ لم يكن له إلّا أن يُلغيه ويُعيد كتابته كلَّه. و«لا حذفَ لمستند
 * أبدًا» (`allow delete: if false` في الخادم).
 *
 * ═══ ★★★ ولماذا لا يُفتح التعديلُ فتحًا ═══
 * القاعدةُ القائمةُ في `firestore.rules` ليست تزمّتًا، ولها نصٌّ صريح:
 *
 *   «المعتمِد يبتّ فيما أُرسِل، لا يُعيد تسعيره. بدون هذا كان صاحب دور
 *    اعتمادٍ (مثل المالي على أمر الشراء) يبدّل `unitPrice` في **نفس**
 *    كتابة الاعتماد — تلاعبٌ ماليّ **بلا أثرٍ في سجلّ التدقيق**.»
 *
 * ★★★ والمفتاحُ في آخر الجملة: الممنوعُ ليس التعديلَ، بل التعديلُ
 * **المستخفي داخل كتابةِ الاعتماد**. فالعلاجُ ليس إبقاءَ الباب مغلقًا، بل
 * أن يصير التعديلُ **فعلًا مستقلًّا مُعلَنًا**:
 *   ١. كتابةٌ منفردةٌ لا تلمس الحالة ولا الرقم ولا الهويّة.
 *   ٢. بسببٍ مكتوبٍ إلزاميًّا.
 *   ٣. وبقيدٍ في سجلّ التدقيق يحمل **كلَّ حقلٍ تغيّر: قبلَه وبعدَه**.
 * وحينها لا يكون تلاعبًا بل تصحيحًا موثَّقًا — وهذا ما بُنيَ هنا.
 *
 * ═══ وثلاثُ حالاتٍ مختومةٌ لا تُعدَّل، ولا استثناء ═══
 * `done` و`closed` و`canceled`. و`done` رحّلت حركاتٍ في دفترٍ **ملحق-فقط**؛
 * فتعديلُ بندٍ بعدها يترك حركةً في الدفتر لا يبرّرها المستند. والتصحيحُ بعد
 * الإنجاز **بمستندٍ عكسيّ** لا بتعديلٍ (§16.9 ‹660›). وهذا السقفُ ليس
 * اجتهادًا يُراجَع: هو شرطُ أن يبقى الدفترُ صادقًا.
 *
 * ═══ ⚠️ والحذفُ: ما يقع فعلًا وما لا يقع ═══
 * الخادمُ يقول `allow delete: if false` لكلّ مستند. فزرُّ «حذف» الذي يمحو
 * **لا يعمل اليوم ولا يمكن أن يعمل** حتى ينشر المالكُ قواعدَ جديدة. فلا
 * يُرسَم زرٌّ يَعِد ثمّ يرتدّ من الخادم.
 *
 * والذي يعمل اليوم وهو **المقصودُ عمليًّا**: `canceled` — يُخرج المستند من
 * كلّ قائمةٍ وصندوقٍ وسلسلةٍ ويُبقيه في السجلّ. ولمَ لا يُمحى؟ لأنّ المستند
 * المرقَّم رسميًّا **رقمٌ في تسلسلٍ قانونيّ**: محوُه يترك ثغرةً في التسلسل
 * لا يفسّرها شيء — وهي أوّلُ ما يسأل عنه مدقّقٌ خارجيّ.
 *
 * ★★ وللمسودّة التي لم تُرقَّم قطّ (`number == null`) الحالُ مختلف: لا
 * تسلسلَ يُثقَب ولا أثرَ يُفقد. فهذه **تستحقّ محوًا حقيقيًّا** — ورقعةُ
 * القواعد جاهزةٌ بنصّها وحجّتها في `docs/رقعة-قواعد-التعديل-والمحو.md`،
 * **ينشرها المالك وحده**. وحتّى تُنشَر، `removalOptions` تقول «غيرُ متاح»
 * **ولا يُرسَم الزرّ** — ولا وعدٌ يُخلَف.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

import { EDITABLE_STATES, TERMINAL_STATES, getState, isEditable } from './states.js';
import { tableSection, allFields } from './schemaUtils.js';

const text = (v) => String(v ?? '').trim();

/* ═══════════════ أصنافُ التعديل ═══════════════ */

/**
 * أصنافُ التعديل الثلاثة.
 *
 * `free` ما كان قائمًا ولم يُمسّ — فمن كان يحرّر مسودّته بلا سببٍ يحرّرها
 * كما كان. ولا تُفرَض طقوسٌ جديدةٌ على عملٍ يسير.
 */
export const AMEND_CLASSES = Object.freeze({
  free: {
    id: 'free',
    label: 'تحريرٌ حرّ',
    needsReason: false,
    hint: 'المستندُ في يد صاحبه — يحرّره كما يشاء قبل الإرسال.',
  },
  governed: {
    id: 'governed',
    label: 'تعديلٌ محكوم',
    needsReason: true,
    hint: 'المستندُ خرج من يد صاحبه — التعديلُ يلزمه سببٌ مكتوب، ويُسجَّل حقلًا حقلًا في سجلّ التدقيق.',
  },
  sealed: {
    id: 'sealed',
    label: 'مختومٌ — لا يُعدَّل',
    needsReason: false,
    hint: 'انتهى المستندُ وتُرِك أثرُه في الدفتر. والتصحيحُ بمستندٍ عكسيٍّ لا بتعديلٍ على المختوم.',
  },
});

/**
 * الحالاتُ التي يجوز فيها تعديلٌ محكوم.
 *
 * ★ `submitted` فيها عمدًا: الخطأُ المطبعيُّ يُكتشف غالبًا **على مكتب
 * المعتمِد** لا قبله. ومن منعه هناك أجبر المعتمِدَ على الرفض ثمّ انتظار
 * صاحبه — دورةٌ كاملةٌ لحرفٍ واحد.
 */
export const GOVERNED_STATES = Object.freeze(['submitted', 'approved']);

/**
 * الأدوارُ التي تملك التعديلَ المحكوم — زائدًا `admin` دائمًا.
 *
 * ★★★ **قائمةٌ واحدةٌ مقصودةٌ ضيّقة.** ولا تُشتقّ من `roles.approve` في
 * المخطّط، وهذا قرارٌ لا سهو: لو مُنح كلُّ معتمِدٍ تعديلَ ما يعتمده لعاد
 * بابُ «المالي يبدّل السعر ثمّ يعتمد» مفتوحًا — بخطوتين بدل خطوة. ومديرُ
 * المستودع سلطةٌ تشغيليّةٌ **خارج سلسلة الاعتماد الماليّ**، فتعديلُه يُرى
 * ويُسأل عنه.
 *
 * ⚠️ وهذه القائمةُ **تُكرَّر في `firestore.rules`** — والازدواجُ مقصودٌ
 * ومُعلَنٌ كازدواج `approveRoles`: القواعدُ لا تستورد JS. فمن عدّلها هنا
 * عدّلها هناك، و`amendRulesParity` في الاختبارات يحرس التطابق.
 */
export const AMEND_ROLES = Object.freeze(['warehouse_manager']);

/**
 * صنفُ تعديلِ مستندٍ بحالته — بلا نظرٍ في الدور.
 * يُعيد أحدَ `AMEND_CLASSES`.
 */
export function amendClassOf(stateId) {
  if (isEditable(stateId)) return AMEND_CLASSES.free;
  if (GOVERNED_STATES.includes(stateId)) return AMEND_CLASSES.governed;
  return AMEND_CLASSES.sealed;
}

/* ═══════════════ الحكمُ على محاولةِ تعديل ═══════════════ */

/**
 * هل يملك هذا المستخدمُ تعديلَ هذا المستند؟ ولماذا لا؟
 *
 * @param {object} docData
 * @param {{role:string, uid:string}} user
 * @param {{reason?:string}} [opts]
 * @returns {{
 *   allowed: boolean,
 *   cls: object,
 *   needsReason: boolean,
 *   problem: string,
 *   serverReady: boolean,
 * }}
 */
export function amendVerdict(docData, user, opts = {}) {
  const stateId = text(docData?.state);
  const cls = amendClassOf(stateId);
  const reason = text(opts.reason);
  const role = text(user?.role);
  const isAdmin = role === 'admin';

  const base = { cls, needsReason: cls.needsReason, serverReady: true };

  if (!docData) {
    return { ...base, allowed: false, problem: 'المستند غير موجود.' };
  }

  // ═══ المختوم: لا تعديلَ ولا للمدير العامّ ═══
  // ★★★ وهذا الاستثناءُ الوحيدُ من «الأدمن يملك كلّ شيء» في هذا الملفّ،
  // وسببُه تقنيٌّ لا سياسيّ: الحركاتُ مُرحَّلةٌ في مجموعةٍ ملحق-فقط، فلا
  // سبيلَ إلى تعديلها مع المستند. فتعديلُ المختوم يُنتج تعارضًا **لا
  // يُصلحه أحدٌ لاحقًا**، أمّا منعُه فمخرجُه موجود (مستندٌ عكسيّ).
  if (cls.id === 'sealed') {
    return {
      ...base,
      allowed: false,
      problem: `المستندُ «${getState(stateId).label}» — ${AMEND_CLASSES.sealed.hint}`,
    };
  }

  // ═══ الحرّ: صاحبُه أو المدير العامّ (كما كان، بلا زيادةٍ ولا نقص) ═══
  if (cls.id === 'free') {
    const mine = docData.createdByUid === user?.uid;
    if (!mine && !isAdmin) {
      return { ...base, allowed: false, problem: 'المسودّةُ لصاحبها — ولا يحرّرها غيره.' };
    }
    return { ...base, allowed: true, problem: '' };
  }

  // ═══ المحكوم ═══
  // ⚠️ حارسُ القيد قبل حارس الدور: مستندٌ مُرحَّلٌ لا يُعدَّل مهما كان الدور.
  // والحالةُ وحدها لا تكفي — فقد ظهر `posted` على `approved` في حجز أمر البيع.
  if (docData.posted === true) {
    return {
      ...base,
      allowed: false,
      problem: 'المستندُ قُيِّد في الدفتر — والمُقيَّد لا يُعدَّل. التصحيحُ بمستندٍ عكسيّ.',
    };
  }

  const hasAuthority = isAdmin || AMEND_ROLES.includes(role);
  if (!hasAuthority) {
    return {
      ...base,
      allowed: false,
      problem: `التعديلُ بعد الإرسال لمدير المستودع أو المدير العامّ — ودورُك «${role || 'بلا دور'}» لا يملكه. اطلب الرفضَ ليعود إليك.`,
      // ما دون السلطةِ لا يُجرَّب على الخادم أصلًا.
      serverReady: false,
    };
  }

  // الخادمُ اليومَ يقبل تعديلَ غير المسودّة **من المدير العامّ وحده**
  // (`isAdmin()` في `allow update`). ومديرُ المستودع يحتاج رقعةَ القواعد.
  // فيُقال له ذلك **قبل** أن يكتب تعديلًا يرتدّ — ولا يُدَّعى قدرةٌ غائبة.
  const serverReady = isAdmin;

  if (!reason) {
    return {
      ...base,
      allowed: false,
      serverReady,
      problem: 'اكتب سببَ التعديلَ أوّلًا — التعديلُ بعد الإرسال لا يقع بلا سببٍ مكتوب.',
    };
  }

  return { ...base, allowed: true, serverReady, problem: '' };
}

/** هل يُرسَم حقلُ التحرير مفتوحًا؟ (اختصارٌ للواجهة) */
export function canEditNow(docData, user, opts = {}) {
  return amendVerdict(docData, user, opts).allowed;
}

/* ═══════════════ فارقُ التعديل — قلبُ سجلّ التدقيق ═══════════════ */

/**
 * يقارن رأسين ويُعيد الحقولَ التي تغيّرت: `{key, label, before, after}`.
 *
 * ★★★ وهذا **جوهرُ الأمان كلِّه** في هذه الميزة: قيدٌ يقول «عُدِّل المستند»
 * لا يساوي شيئًا؛ والقيدُ الذي يقول «الكمّيّةُ المستلمةُ من 100 إلى 95»
 * يجعل التلاعبَ مرئيًّا بعد سنة. فبلا هذه الدالّة تكون الميزةُ ثغرةً، ومعها
 * تكون تحسينًا.
 *
 * والعناوينُ من المخطّط لا من المفاتيح: مدقّقٌ يقرأ «سعر الوحدة» لا
 * `unitPrice`.
 */
export function headerDiff(before, after, schema) {
  const labels = new Map((allFields(schema) || []).map((f) => [f.key, f.label || f.key]));
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out = [];
  for (const key of keys) {
    // الحقولُ الداخليّةُ (`_checklist` وأمثالُها) لا تُقارَن حقلًا حقلًا هنا.
    if (key.startsWith('_')) continue;
    const b = before?.[key];
    const a = after?.[key];
    if (sameValue(b, a)) continue;
    out.push({ key, label: labels.get(key) || key, before: b, after: a });
  }
  return out.sort((x, y) => (x.label < y.label ? -1 : 1));
}

/**
 * يقارن بنودًا ويُعيد التغييرَ صفًّا صفًّا.
 *
 * والمقارنةُ **بالموضع** لا بمفتاحٍ طبيعيّ: البنودُ مصفوفةٌ بلا معرّفاتٍ
 * ثابتة، والصنفُ نفسُه قد يتكرّر في صفّين (دفعتان مختلفتان). فالموضعُ هو
 * الهويّةُ الوحيدةُ الصادقة — ومن أدخل صفًّا في الوسط يظهر تغييرُ ما بعده،
 * وهو صحيحٌ لا عطب: الصفُّ الثالثُ صار شيئًا آخر فعلًا.
 */
export function linesDiff(before, after, schema) {
  const cols = tableSection(schema)?.columns || [];
  const labels = new Map(cols.map((c) => [c.key, c.label || c.key]));
  const b = (before || []).map(sig);
  const a = (after || []).map(sig);
  const max = Math.max(b.length, a.length);
  const changes = [];

  for (let i = 0; i < max; i += 1) {
    const rowBefore = before?.[i] || null;
    const rowAfter = after?.[i] || null;
    const emptyBefore = !b[i];
    const emptyAfter = !a[i];
    if (emptyBefore && emptyAfter) continue;
    if (emptyBefore && !emptyAfter) {
      changes.push({ row: i + 1, kind: 'added', fields: describeRow(rowAfter, labels) });
      continue;
    }
    if (!emptyBefore && emptyAfter) {
      changes.push({ row: i + 1, kind: 'removed', fields: describeRow(rowBefore, labels) });
      continue;
    }
    const fields = [];
    const keys = new Set([...Object.keys(rowBefore || {}), ...Object.keys(rowAfter || {})]);
    for (const key of keys) {
      if (sameValue(rowBefore?.[key], rowAfter?.[key])) continue;
      fields.push({ key, label: labels.get(key) || key, before: rowBefore?.[key], after: rowAfter?.[key] });
    }
    if (fields.length) changes.push({ row: i + 1, kind: 'changed', fields });
  }
  return changes;
}

/** بصمةُ صفٍّ — فارغةٌ للصفّ الفارغ، فلا يُحسب صفٌّ فارغٌ حذفًا ولا إضافة. */
function sig(line) {
  if (!line) return '';
  return Object.entries(line)
    .filter(([, v]) => text(v) !== '')
    .map(([k, v]) => `${k}=${text(v)}`)
    .sort()
    .join('|');
}

function describeRow(line, labels) {
  return Object.entries(line || {})
    .filter(([, v]) => text(v) !== '')
    .map(([key, v]) => ({ key, label: labels.get(key) || key, before: undefined, after: v }));
}

/**
 * مقارنةُ قيمتين.
 * `''` و`null` و`undefined` **سواءٌ**: حقلٌ لم يُملأ قطّ وحقلٌ مُسح إلى فراغٍ
 * ليسا تغييرًا يستحقّ قيدًا — وبلا هذا يُسجَّل تعديلٌ على كلّ حقلٍ فارغٍ في
 * المستند فيغرق السجلُّ بضجيجٍ يُخفي التغييرَ الحقيقيّ.
 * والأرقامُ تُقارَن قيمةً: `5` و`'5'` سواءٌ (إكسل يُعيدها نصًّا).
 */
function sameValue(a, b) {
  const ea = a === '' || a == null;
  const eb = b === '' || b == null;
  if (ea && eb) return true;
  if (ea !== eb) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && text(a) !== '' && text(b) !== '') return na === nb;
  return text(a) === text(b);
}

/**
 * نصُّ قيدِ التدقيق للتعديل — سطرٌ عربيٌّ يقرؤه مدقّقٌ بعد سنة.
 *
 * ⚠️ ويُقصُّ عند حدٍّ مُعلَن: قيدُ التدقيق مستندُ Firestore وسقفُه ١ م.ب،
 * ومستندٌ بمئة بندٍ عُدّلت كلُّها يُنتج نصًّا هائلًا يُسقط الكتابة — فيُقصّ
 * **ويُقال إنّه قُصّ** مع العددِ الكامل، فلا يُفقد خبرُ الحجم.
 */
export function amendAuditNote({ reason, headerChanges = [], lineChanges = [], max = 40 }) {
  const parts = [`تعديلٌ محكوم: ${text(reason) || 'بلا سبب'}`];
  const shown = [];

  for (const c of headerChanges.slice(0, max)) {
    shown.push(`${c.label}: «${fmtVal(c.before)}» ← «${fmtVal(c.after)}»`);
  }
  const remainingBudget = Math.max(0, max - headerChanges.length);
  for (const c of lineChanges.slice(0, remainingBudget)) {
    if (c.kind === 'added') shown.push(`بندٌ ${c.row}: أُضيف (${c.fields.map((f) => `${f.label}=${fmtVal(f.after)}`).join('، ')})`);
    else if (c.kind === 'removed') shown.push(`بندٌ ${c.row}: حُذف (${c.fields.map((f) => `${f.label}=${fmtVal(f.after)}`).join('، ')})`);
    else shown.push(`بندٌ ${c.row}: ${c.fields.map((f) => `${f.label} «${fmtVal(f.before)}» ← «${fmtVal(f.after)}»`).join('، ')}`);
  }

  const total = headerChanges.length + lineChanges.length;
  if (total === 0) parts.push('لا حقلَ تغيّر.');
  else {
    parts.push(`تغيّر ${total} موضعًا:`);
    parts.push(shown.join(' · '));
    if (total > shown.length) parts.push(`… و${total - shown.length} موضعًا آخر لم يُفصَّل (قُصّ النصُّ عند ${max}).`);
  }
  return parts.join(' ');
}

function fmtVal(v) {
  const s = text(v);
  return s === '' ? 'فراغ' : s;
}

/** هل في التعديل ما يستحقّ كتابةً؟ (لا يُكتب قيدٌ على ضغطةِ «حفظ» بلا تغيير) */
export function hasChanges(headerChanges, lineChanges) {
  return (headerChanges?.length || 0) + (lineChanges?.length || 0) > 0;
}

/* ═══════════════ الحذف ═══════════════ */

/** إجراءاتُ «إزالةِ» مستندٍ المتاحةُ، مرتَّبةً بما يقع فعلًا. */
export const REMOVAL_ACTIONS = Object.freeze({
  cancel: {
    id: 'cancel',
    label: 'إلغاء المستند',
    needsReason: true,
    destructive: false,
    hint: 'يُبطل المستندَ ويُخرجه من كلّ قائمةٍ وسلسلة — ويُبقيه في السجلّ. وهذا هو «الحذف» في نظامٍ مرقَّم.',
  },
  hardDelete: {
    id: 'hardDelete',
    label: 'محوٌ نهائيّ',
    needsReason: true,
    destructive: true,
    hint: 'محوٌ لا رجعةَ فيه — لمسوّدةٍ لم تُرقَّم قطّ ولم تُقيَّد. ويحتاج نشرَ قواعدِ أمانٍ من المالك.',
  },
});

/**
 * هل يصلح هذا المستندُ لمحوٍ نهائيٍّ **مبدئيًّا** (بغضّ النظر عن القواعد)؟
 *
 * ثلاثةُ شروطٍ لا رابع: مسودّةٌ (أو مرفوضة) · **بلا رقمٍ رسميّ قطّ** · وبلا
 * قيدٍ في الدفتر. والرقمُ هو الفيصل: ما رُقِّم صار في تسلسلٍ قانونيّ، وثغرةٌ
 * في التسلسل أوّلُ ما يسأل عنه مدقّق.
 */
export function eligibleForHardDelete(docData) {
  if (!docData) return false;
  if (!EDITABLE_STATES.includes(text(docData.state))) return false;
  if (text(docData.number)) return false;
  if (docData.posted === true) return false;
  return true;
}

/**
 * ما يُتاح من إجراءات الإزالة لهذا المستند ولهذا المستخدم — مع سببِ المنع.
 *
 * ★★★ و`available:false` تعني **لا يُرسَم الزرّ**. لأنّ الخادمَ اليومَ
 * `allow delete: if false` لكلّ مستندٍ بلا استثناء، فزرُّ محوٍ يُرسَم اليوم
 * يرتدّ حتمًا — ووعدٌ يُخلَف أسوأ من غيابِ الوعد. ويُعاد `requiresRulesPublish`
 * كي تقول الشاشةُ **لماذا** غاب، فلا يظنّ المالكُ أنّ الطلبَ أُهمل.
 */
export function removalOptions(docData, user, { rulesPublished = false } = {}) {
  const role = text(user?.role);
  const isAdmin = role === 'admin';
  const stateId = text(docData?.state);
  const mine = docData?.createdByUid === user?.uid;

  const canCancel =
    (isAdmin ||
      (EDITABLE_STATES.includes(stateId) && mine) ||
      (stateId === 'approved' && (AMEND_ROLES.includes(role) || role === 'warehouse_manager'))) &&
    ['draft', 'rejected', 'approved'].includes(stateId);

  const options = [
    {
      ...REMOVAL_ACTIONS.cancel,
      available: canCancel,
      problem: canCancel
        ? ''
        : TERMINAL_STATES.includes(stateId)
          ? `المستندُ «${getState(stateId).label}» — انتهى أمرُه.`
          : stateId === 'done'
            ? 'المنجَزُ لا يُلغى — أثرُه مُرحَّل. أغلِقه أو صحّحه بمستندٍ عكسيّ.'
            : stateId === 'submitted'
              ? 'المستندُ عند المعتمِد — لا يُسحب من تحته. يرفضه فيعود إليك ثمّ تُلغيه.'
              : 'لا تملك إلغاءَ هذا المستند.',
      requiresRulesPublish: false,
    },
  ];

  const hardEligible = eligibleForHardDelete(docData) && (isAdmin || mine);
  options.push({
    ...REMOVAL_ACTIONS.hardDelete,
    available: hardEligible && rulesPublished,
    problem: !hardEligible
      ? text(docData?.number)
        ? 'المستندُ مرقَّمٌ رسميًّا — ولا يُمحى رقمٌ من تسلسلٍ قانونيّ. ألغِه فيبقى أثرُه.'
        : 'المحوُ لمسوّدةٍ لم تُرقَّم ولم تُقيَّد، ولصاحبها أو للمدير العامّ.'
      : rulesPublished
        ? ''
        : 'المحوُ النهائيُّ يحتاج نشرَ قواعدِ الأمان — الرقعةُ جاهزةٌ في المستودع، والنشرُ للمالك وحده.',
    requiresRulesPublish: hardEligible && !rulesPublished,
  });

  return options;
}
