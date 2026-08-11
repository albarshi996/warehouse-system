/**
 * سياسة التكامل — بياناتٌ لا شيفرة (م٧-أ · يكمل سدّ ف‑٩).
 *
 * ═══ ما تحلّه ═══
 * اليوم اتّجاه كلّ نوعٍ مخبوزٌ في الكود: `pushPurchaseOrder` تدفع، والأصناف
 * تُسحب، وحدُّ المال مغلقٌ بثابت. فكلّ تغييرٍ في سياسة الشركة نشرةُ إصدار.
 * وهذا يخالف المبدأ الثامن كما خالفته القرارات ٤–٧ قبل م١-ج.
 *
 * ═══ ما تُعطيه للشركة ═══
 * لكلّ نوع مستندٍ (وكلّ نوع بيانات) قرارٌ مستقلّ: **أيُدفع أم يُسحب أم يُستورَد
 * مرّةً أم يُعزَل؟** وأيّ حقولٍ تعبر؟ ومتى؟ — تختاره الشركة من شاشة، لا نختاره
 * نحن في ملفّ.
 *
 * ═══ الافتراض الآمن ═══
 * غياب السياسة = **الحالة المعتمدة اليوم**: كمّيّاتٌ ومراجعُ تُدفع، ومالٌ لا
 * يُدفع أبدًا (م١-ب). فالميزة تُفعَّل بقرارٍ لا بترقية، ولا يتغيّر سلوكٌ لأنّ
 * أحدًا نشر كودًا.
 *
 * ═══ ولا تتحوّل البوابة إلى محرّك قيودٍ مزدوج ═══
 * `money: 'pull'` هو الافتراض المقفل. وتحويله إلى `push` قرارٌ يحمل تحذيره في
 * المحاكاة — لأنّه يعني مصدرَين لرقمٍ واحد.
 *
 * منطق خالص: بلا Firestore وبلا شبكة.
 */
import { DOC_ODOO_MAP } from '../odoo/docCrosswalk.js';
import { MONEY_FIELD_NAMES } from '../odoo/moneyFields.js';


/** الاتّجاهات الأربعة — قرارُ كلّ نوع. */
export const DIRECTIONS = [
  { id: 'push', labelAr: 'دفع إلى النظام المرتبط', hint: 'البوابة تُنتج والنظام يستقبل' },
  { id: 'pull', labelAr: 'سحب من النظام المرتبط', hint: 'النظام المرتبط هو المصدر' },
  { id: 'import_once', labelAr: 'استيراد مرّةً واحدة', hint: 'نقلٌ ابتدائيّ ثمّ استقلال' },
  { id: 'isolated', labelAr: 'معزول', hint: 'لا يعبر شيء في الاتّجاهين' },
];

export const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

/** فئات البيانات — على سبيل المثال لا الحصر (نصّ الخطة). */
export const DATA_SCOPES = [
  { id: 'items', labelAr: 'الأصناف' },
  { id: 'customers', labelAr: 'العملاء' },
  { id: 'suppliers', labelAr: 'الموردون' },
  { id: 'warehouses', labelAr: 'المستودعات' },
  { id: 'accounts', labelAr: 'الحسابات' },
  { id: 'documents', labelAr: 'المستندات' },
];

/**
 * أعمدة مصفوفة الأثر الستّة (نصّ الخطة: ٣٥ مستندًا × ٦ أعمدة).
 * كلّ عمودٍ سؤالٌ يُجاب لكلّ نوع.
 */
export const MATRIX_COLUMNS = [
  { key: 'direction', labelAr: 'الاتّجاه', kind: 'select' },
  { key: 'quantities', labelAr: 'الكمّيّات', kind: 'bool' },
  { key: 'references', labelAr: 'المراجع', kind: 'bool' },
  { key: 'money', labelAr: 'حقول المال', kind: 'select' },
  { key: 'timing', labelAr: 'التوقيت', kind: 'select' },
  { key: 'onConflict', labelAr: 'عند التعارض', kind: 'select' },
];

export const MONEY_MODES = [
  { id: 'pull', labelAr: 'تُسحب ولا تُرفع', hint: 'السياسة المعتمدة — أودو يولّد القيد' },
  { id: 'none', labelAr: 'لا تعبر إطلاقًا' },
  { id: 'push', labelAr: 'تُرفع أيضًا', hint: '⚠ مصدران لرقمٍ واحد' },
];

export const TIMINGS = [
  { id: 'on_done', labelAr: 'عند الإنجاز' },
  { id: 'on_approve', labelAr: 'عند الاعتماد' },
  { id: 'manual', labelAr: 'يدويًّا فقط' },
];

export const CONFLICT_MODES = [
  { id: 'adopt', labelAr: 'تبنّي الموجود', hint: 'الحقيقة عند النظام المرتبط' },
  { id: 'report', labelAr: 'إبلاغٌ بلا تغيير' },
  { id: 'overwrite', labelAr: 'الكتابة فوقه', hint: '⚠ يُفقد ما في النظام المرتبط' },
];

/**
 * السياسة الافتراضيّة لنوعٍ ما = **الحالة المعتمدة اليوم**.
 * الأصناف تُسحب (الماستر من أودو)، وما عداها يُدفع بلا مال.
 */
export function defaultPolicyFor(type) {
  return {
    direction: type === 'items' ? 'pull' : 'push',
    quantities: true,
    references: true,
    money: 'pull', // م١-ب: اسحب المالي ولا ترفعه
    timing: 'on_done',
    onConflict: 'adopt', // idempotency.js: الحقيقة عند أودو لا عند مرآتنا
  };
}

/** يطبّع سياسة نوعٍ — القيمة الفاسدة تسقط إلى الافتراض ولا تُعطّل. */
export function normalizePolicy(raw, type = '') {
  const d = defaultPolicyFor(type);
  const s = raw && typeof raw === 'object' ? raw : {};
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  return {
    direction: pick(s.direction, DIRECTION_IDS, d.direction),
    quantities: s.quantities !== false,
    references: s.references !== false,
    money: pick(s.money, MONEY_MODES.map((m) => m.id), d.money),
    timing: pick(s.timing, TIMINGS.map((t) => t.id), d.timing),
    onConflict: pick(s.onConflict, CONFLICT_MODES.map((c) => c.id), d.onConflict),
  };
}

/** أنواع المستندات التي تخضع للسياسة — من جدول العبور نفسه، فلا قائمةٌ ثانية. */
export function policyTypes() {
  return Object.keys(DOC_ODOO_MAP).sort();
}

/** السياسة الكاملة: كلّ نوعٍ مطبَّعًا. الغياب يعطي الافتراض لا فراغًا. */
export function fullPolicy(stored = {}) {
  const out = {};
  for (const type of policyTypes()) out[type] = normalizePolicy(stored?.[type], type);
  for (const scope of DATA_SCOPES) out[scope.id] = normalizePolicy(stored?.[scope.id], scope.id);
  return out;
}

/**
 * أيُدفع هذا النوع الآن؟ يستدعيها الجسر بدل الثوابت المخبوزة.
 * @returns {{allowed:boolean, reason:string, timing:string, onConflict:string}}
 */
export function pushDecision(policy, type, { state = 'done' } = {}) {
  const p = normalizePolicy(policy?.[type], type);
  if (p.direction === 'isolated') return { allowed: false, reason: 'النوع معزولٌ بقرارٍ من لوحة التكامل.', timing: p.timing, onConflict: p.onConflict };
  if (p.direction === 'pull') return { allowed: false, reason: 'الاتّجاه سحبٌ لا دفع.', timing: p.timing, onConflict: p.onConflict };
  if (p.timing === 'manual' && state !== 'manual') {
    return { allowed: false, reason: 'الدفع يدويٌّ بقرارٍ من لوحة التكامل.', timing: p.timing, onConflict: p.onConflict };
  }
  if (p.timing === 'on_done' && state === 'approved') {
    return { allowed: false, reason: 'الدفع عند الإنجاز لا عند الاعتماد.', timing: p.timing, onConflict: p.onConflict };
  }
  return { allowed: true, reason: '', timing: p.timing, onConflict: p.onConflict };
}

/**
 * الحقول التي يُسمح لها بالعبور — يستعملها الجسر بدل `moneyFields` وحدها.
 * الافتراض يستبعد كلّ حقل مال؛ و`money:'push'` وحده يفتحها.
 */
export function fieldGate(policy, type) {
  const p = normalizePolicy(policy?.[type], type);
  return {
    quantities: p.quantities,
    references: p.references,
    money: p.money === 'push',
    blockedNames: p.money === 'push' ? [] : [...MONEY_FIELD_NAMES],
  };
}

/**
 * **محاكاة أثر الإعداد قبل تفعيله** (نصّ الخطة).
 * تُخرج ما سيتغيّر وما يستحقّ تحذيرًا — فالسياسة تُغيَّر وهي مرئيّة لا في الظلام.
 *
 * @returns {{changes:object[], warnings:string[]}}
 */
export function simulate(current = {}, next = {}) {
  const changes = [];
  const warnings = [];
  const types = [...new Set([...policyTypes(), ...DATA_SCOPES.map((s) => s.id)])];

  for (const type of types) {
    const a = normalizePolicy(current?.[type], type);
    const b = normalizePolicy(next?.[type], type);
    for (const col of MATRIX_COLUMNS) {
      if (a[col.key] === b[col.key]) continue;
      changes.push({ type, field: col.key, labelAr: col.labelAr, from: a[col.key], to: b[col.key] });
    }

    if (a.money !== 'push' && b.money === 'push') {
      warnings.push(
        `${type}: رفعُ حقول المال يعني **مصدرَين لرقمٍ واحد** — وانحرافُ أحدهما عن الآخر لا يظهر إلّا في تقريرٍ ماليٍّ بعد شهور. والقرار ٢ يجعل أودو مولّد القيد.`
      );
    }
    if (a.onConflict !== 'overwrite' && b.onConflict === 'overwrite') {
      warnings.push(`${type}: الكتابة فوق الموجود تُفقد ما في النظام المرتبط بلا رجعة — والتبنّي أسلم.`);
    }
    if (a.direction !== 'isolated' && b.direction === 'isolated') {
      warnings.push(`${type}: العزل يوقف التبادل في الاتّجاهين — تأكّد أنّ النظام المرتبط لم يعد مصدرًا لهذا النوع.`);
    }
    if (a.direction === 'push' && b.direction === 'pull') {
      warnings.push(`${type}: قلبُ الاتّجاه يجعل النظام المرتبط مصدر الحقيقة — وما في البوابة يصير مرآةً تُدهَس.`);
    }
  }
  return { changes, warnings };
}

/** تحقّقٌ من السياسة قبل الحفظ. */
export function policyProblems(policy = {}) {
  const problems = [];
  for (const [type, p] of Object.entries(policy)) {
    if (!p || typeof p !== 'object') {
      problems.push(`${type}: سياسةٌ فاسدة.`);
      continue;
    }
    if (p.direction && !DIRECTION_IDS.includes(p.direction)) problems.push(`${type}: اتّجاهٌ غير معروف «${p.direction}».`);
    if (p.direction === 'isolated' && (p.quantities || p.references)) {
      problems.push(`${type}: معزولٌ ومع ذلك يُمرّر حقولًا — تناقضٌ صريح.`);
    }
    if (p.direction === 'push' && !p.quantities && !p.references && p.money !== 'push') {
      problems.push(`${type}: دفعٌ بلا حقلٍ واحد يعبر — دفعٌ فارغ.`);
    }
  }
  return problems;
}

/** ملخّصٌ للشاشة: كم نوعًا في كلّ اتّجاه، وكم يرفع مالًا. */
export function policySummary(policy = {}) {
  const full = fullPolicy(policy);
  const byDirection = Object.fromEntries(DIRECTION_IDS.map((d) => [d, 0]));
  let moneyPush = 0;
  for (const p of Object.values(full)) {
    byDirection[p.direction] += 1;
    if (p.money === 'push') moneyPush += 1;
  }
  return { total: Object.keys(full).length, byDirection, moneyPush };
}
