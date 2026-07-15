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

/** مستند جديد فارغ مطابق للمخطّط. */
export function emptyDocument(schema) {
  return {
    header: { ...emptyHeader(schema), _checklist: emptyChecklist(schema) },
    lines: [emptyLine(schema)],
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
