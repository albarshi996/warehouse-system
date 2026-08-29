/**
 * أدوات قراءة المخطّطات — الطبقة التي يفهم بها المحرّك أي نموذج.
 *
 * كلّها دوال خالصة (pure) لا تلمس الشبكة ولا الواجهة، فتُختبر وحدها.
 */

/** أقسام الحقول فقط (لا الجداول ولا قوائم الفحص). */
export function fieldSections(schema) {
  return (schema?.sections || []).filter((s) => s.kind === 'fields');
}

/** قسم الجدول (البنود) — نموذج واحد له جدول واحد اليوم. */
export function tableSection(schema) {
  return (schema?.sections || []).find((s) => s.kind === 'table') || null;
}

/** كل حقول الرأس عبر كل الأقسام (بما فيها الحقول الإضافية). */
export function allFields(schema) {
  return fieldSections(schema).flatMap((s) => [...(s.fields || []), ...(s.extraFields || [])]);
}

/** يبني رأسًا فارغًا بكل مفاتيح المخطّط (فلا تظهر حقول «غير معرّفة»). */
export function emptyHeader(schema) {
  const header = {};
  for (const f of allFields(schema)) {
    if (f.kind === 'computed' || f.kind === 'identity') continue;
    header[f.key] = f.kind === 'boolean' ? false : '';
  }
  return header;
}

/** يبني بندًا فارغًا بأعمدة الجدول. */
export function emptyLine(schema) {
  const table = tableSection(schema);
  if (!table) return {};
  return Object.fromEntries((table.columns || []).map((c) => [c.key, '']));
}

/** يبني قائمة فحص فارغة: كل بند { checked, na }. */
export function emptyChecklist(schema) {
  const out = {};
  for (const s of schema?.sections || []) {
    if (s.kind !== 'checklist') continue;
    for (const item of s.items || []) out[item.key] = { checked: false, na: false };
  }
  return out;
}

/**
 * مستند جديد فارغ مطابق للمخطّط.
 *
 * `rows` = صفوفُ الإدخال الجاهزة. الافتراضُ **واحد** كما كان — فمن لم
 * يطلب شيئًا لم يتغيّر عليه شيء (المعالجُ المصغّر يُنشئ أبًا لا يُدخل فيه
 * بنودًا، وعشرةُ صفوفٍ هناك عشرةُ بنودٍ بيضاء في مستندٍ حقيقيّ).
 * والمحرّكُ وحدَه يطلب العشرة — ويقصّها عند الحفظ والطباعة (BULK-105).
 */
export function emptyDocument(schema, { rows = 1 } = {}) {
  const count = Math.max(1, Number(rows) || 1);
  return {
    header: { ...emptyHeader(schema), _checklist: emptyChecklist(schema) },
    // كائنٌ لكلّ صفّ — لا مرجعٌ واحدٌ مكرّر، وإلّا لَغيّر بندٌ إخوتَه.
    lines: Array.from({ length: count }, () => emptyLine(schema)),
  };
}

/**
 * قيمة الحقل للعرض — تتكفّل بالمحسوب وبالمشتقّ من الهوية.
 * `doc` = { header, lines, createdByName, approvedByName, ... }
 */
export function fieldValue(field, doc) {
  if (field.kind === 'computed') {
    return typeof field.compute === 'function' ? field.compute(doc) : '';
  }
  if (field.kind === 'identity') {
    if (field.source === 'creator') return doc?.createdByName || '';
    if (field.source === 'approver') return doc?.approvedByName || '';
    return '';
  }
  return doc?.header?.[field.key] ?? '';
}

/**
 * يفحص الحقول الإلزامية قبل الإرسال. يُعيد قائمة عناوين ناقصة (فارغة = سليم).
 * المحسوب والمشتقّ لا يُطالَب بهما المستخدم.
 */
export function missingRequired(schema, doc) {
  return allFields(schema)
    .filter((f) => f.required && f.kind !== 'computed' && f.kind !== 'identity')
    .filter((f) => String(doc?.header?.[f.key] ?? '').trim() === '')
    .map((f) => f.label);
}

/**
 * حقول المرجع المستنديّ (`docref`) في المخطّط — كلٌّ يعلن نوع أبيه (`docType`).
 * تُستهلك في واجهة التعرّف التلقائيّ وفي حارس «لا إنجاز قبل اعتماد الأب».
 */
export function docrefFields(schema) {
  return allFields(schema).filter((f) => f.kind === 'docref' && f.docType);
}

/**
 * نوع الأب المرجعيّ الأساسيّ للمخطّط — من أوّل حقل `docref` **إلزاميّ**
 * (وإلا أوّل docref). يُستعمل في الحارس لمعرفة أيّ رابطٍ يجب أن يكون معتمَدًا.
 */
export function primaryParentType(schema) {
  const fields = docrefFields(schema);
  const req = fields.find((f) => f.required);
  return (req || fields[0])?.docType || null;
}

/** عدد بنود قائمة الفحص المطابقة (المؤشَّرة) وإجماليها — لعدّاد «N / 10». */
export function checklistCount(schema, doc) {
  const items = (schema?.sections || []).filter((s) => s.kind === 'checklist').flatMap((s) => s.items || []);
  const state = doc?.header?._checklist || {};
  const checked = items.filter((i) => state[i.key]?.checked).length;
  return { checked, total: items.length };
}

/** هل البند فارغ تمامًا؟ (لتنظيف الصفوف غير المستخدمة قبل الحفظ) */
export function isEmptyLine(line) {
  return Object.values(line || {}).every((v) => String(v ?? '').trim() === '');
}

/**
 * بنودُ المستند ذاتُ المحتوى — قصُّ الفارغ في مكانٍ واحد (BULK-105 · ث‑٤).
 *
 * ★★ **يُقرأ من الحفظ ومن الطباعة معًا.** الحفظُ كان يقصّ منذ أوّل يوم،
 * والطباعةُ لا — فبقيت صفوفُ الإدخال الفارغةُ تُطبع. وما دام الجدولُ سيبدأ
 * بعشرة صفوفٍ للإدخال (ث‑٥)، فقصٌّ في موضعٍ دون موضعٍ يعني ورقةً فيها تسعةُ
 * صفوفٍ بيضاء — وهو عينُ العيب الذي وُجد هذا الجدولُ ليُنهيه.
 *
 * ولا فارقَ في الشكل: يُعيد المصفوفة نفسَها إن لم يكن فيها فارغ.
 */
export function contentLines(lines) {
  return (lines || []).filter((line) => !isEmptyLine(line));
}

/**
 * يطبّق صنفًا من الماستر على بند مستند — **يملأ الفارغ فقط ولا يدهس المكتوب**.
 *
 * هذه قطعة الحلقة الأخيرة (I-ب/2): مسح باركود في بند GRN يستدعي الصنف
 * فيتعبّأ الكود والوصف تلقائيًّا بدل الكتابة اليدوية. لو كان الموظّف قد كتب
 * وصفًا بيده فهو أعلم — لا نمحوه.
 *
 * @param {object} line البند الحالي
 * @param {object} item صنف الماستر { sku, nameAr, shade, ... }
 * @returns {{ line: object, filled: string[] }} البند المحدَّث وأسماء ما مُلئ
 */
export function applyItemToLine(line, item) {
  if (!item) return { line, filled: [] };
  const description = [item.nameAr, item.shade].filter(Boolean).join(' — ');
  const candidates = { sku: item.sku || '', description };
  const next = { ...line };
  const filled = [];
  for (const [key, value] of Object.entries(candidates)) {
    if (!value) continue;
    if (String(next[key] ?? '').trim() !== '') continue;
    next[key] = value;
    filled.push(key);
  }
  return { line: next, filled };
}
