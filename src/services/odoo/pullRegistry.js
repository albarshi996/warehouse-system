/**
 * سجلّ السحب — **ماذا يُسحب من أودو، وإلى أين، وبأيّ حقول** (SAP-16 · يسدّ ف‑٣٨ وف‑٣٩).
 *
 * ═══ لماذا جدولٌ لا شيفرةٌ متفرّقة؟ ═══
 * نفس فلسفة `ledger/postingRules.js`: السؤال «ما الذي نسحبه من أودو؟» يجب أن
 * يُجاب من مكانٍ واحد يُقرأ في دقيقة. وقبل هذا الملفّ كان الجواب دالّةً واحدة
 * (`pullProducts`) مخبوزةً في خدمة المزامنة — فكان السحب يغطّي الأصناف وحدها،
 * ولا أحد يرى أنّ الباقي غير مسحوب.
 *
 * إضافة نطاقٍ جديد صارت **سطرًا هنا**، لا جراحةً في الخدمة.
 *
 * ═══ الاتّجاه ═══
 * كلّ ما في هذا الملفّ **قراءةٌ من أودو**. لا حقل كتابةٍ واحدًا — الدفع مختوم
 * (انظر `directionGuard.js`). فأودو مصدر الحقيقة، والبوابة تحفظ مرآةً وهويّة
 * ربطٍ وحالة مزامنةٍ ونتيجة، ولا تُعيد توليد قيدٍ محلّيّ (§16.5 ‹500›).
 *
 * ═══ المرآة ليست دفترًا ═══
 * المجموعات المالية أدناه **مرايا للقراءة**: تُكتب بالسحب وحده، وتُستبدل عند
 * كلّ سحبٍ ولا تُحرَّر بيد. فلو عبث بها أحدٌ صحّحها السحب التالي — لأنّ الحقيقة
 * ليست فيها. وهذا ما يمنع أن تصير دفترًا محاسبيًّا ثانيًا (§16.1 ‹454›).
 *
 * ═══ حدٌّ صادق ═══
 * لا وظائف سحابيّة على خطّة Spark، فلا جدولة على الخادم. «الدوريّة» تعني
 * مؤقّتًا في المتصفّح ما دامت الصفحة مفتوحة — وهذا مُعلَنٌ في الواجهة بـ«آخر
 * سحب» كي لا يظنّ أحدٌ أنّ ما يراه حيٌّ وهو قديم.
 *
 * منطق خالص: بلا شبكة وبلا Firestore وبلا DOM.
 */

/** فئات النطاقات — للعرض والتجميع في الواجهة. */
export const PULL_FAMILIES = Object.freeze({
  master: { id: 'master', labelAr: 'البيانات الأساسية' },
  operations: { id: 'operations', labelAr: 'العمليات' },
  finance: { id: 'finance', labelAr: 'المالية' },
});

/**
 * سجلّ النطاقات.
 *
 * `odooModel` — نموذج أودو المقروء.
 * `fields`    — الحقول المطلوبة صراحةً. لا نطلب «الكلّ» أبدًا: كلّ حقلٍ زائد
 *               حمولةٌ على الشبكة وسطحُ تسريبٍ محتمل (§16.20 ‹803›).
 * `mirror`    — مجموعة Firestore التي تهبط فيها المرآة. `null` تعني أنّ
 *               النطاق يهبط في نموذجٍ قائم (الأصناف تهبط في ماستر الأصناف).
 * `key`       — الحقل الذي يصير معرّف المستند في المرآة، فالسحب المتكرّر
 *               يكتب فوق نفسه ولا يُضاعف (نفس مبدأ `moveId` الحتميّ).
 * `domain`    — مرشِّح أودو، فارغٌ يعني الكلّ.
 */
export const PULL_SCOPES = Object.freeze({
  items: {
    id: 'items',
    family: 'master',
    labelAr: 'ماستر الأصناف',
    odooModel: 'product.product',
    fields: ['default_code', 'name', 'x_name_en', 'categ_id', 'uom_id', 'qty_available', 'x_min_stock'],
    mirror: null, // يهبط في `Items_Master` عبر `productToItem` — نموذجٌ قائم لا مرآة
    key: 'default_code',
    domain: [],
    order: 'default_code asc',
  },

  accounts: {
    id: 'accounts',
    family: 'finance',
    labelAr: 'شجرة الحسابات',
    odooModel: 'account.account',
    // مفاهيم §16.4 ‹504-514› بقدر ما يعطيه أودو: كودٌ فريد واسمٌ ونوعٌ
    // وطبيعةٌ وشركةٌ وعملةٌ وقابليّة ترحيل.
    fields: ['code', 'name', 'account_type', 'reconcile', 'deprecated', 'company_id', 'currency_id'],
    mirror: 'odoo_accounts',
    key: 'code',
    domain: [],
    order: 'code asc',
  },

  moves: {
    id: 'moves',
    family: 'finance',
    labelAr: 'القيود والفواتير',
    // في أودو الفاتورة **قيدٌ** بنوعٍ مختلف — فنموذجٌ واحد يغطّي §16.6 كلّها،
    // والتصنيف بـ`move_type` لا بمجموعاتٍ متفرّقة.
    odooModel: 'account.move',
    fields: [
      'name', 'ref', 'move_type', 'state', 'date', 'invoice_date', 'invoice_date_due',
      'partner_id', 'journal_id', 'currency_id', 'amount_total', 'amount_residual',
      'company_id', 'reversed_entry_id', 'invoice_origin',
    ],
    mirror: 'odoo_moves',
    key: 'name',
    domain: [],
    order: 'date desc',
  },

  moveLines: {
    id: 'moveLines',
    family: 'finance',
    labelAr: 'أسطر القيود',
    odooModel: 'account.move.line',
    fields: ['move_id', 'account_id', 'partner_id', 'name', 'debit', 'credit', 'balance', 'date', 'currency_id'],
    mirror: 'odoo_move_lines',
    key: 'id',
    domain: [],
    order: 'date desc',
  },

  payments: {
    id: 'payments',
    family: 'finance',
    labelAr: 'المدفوعات والتحصيلات',
    odooModel: 'account.payment',
    fields: ['name', 'payment_type', 'partner_type', 'partner_id', 'amount', 'currency_id', 'date', 'state', 'journal_id'],
    mirror: 'odoo_payments',
    key: 'name',
    domain: [],
    order: 'date desc',
  },
});

export const PULL_SCOPE_IDS = Object.freeze(Object.keys(PULL_SCOPES));

/** نطاقات فئةٍ ما، بترتيب السجلّ. */
export function scopesOfFamily(family) {
  return PULL_SCOPE_IDS.map((id) => PULL_SCOPES[id]).filter((s) => s.family === family);
}

/** النطاقات المالية — يستعملها زرّ «اسحب المالية» ولوحة الأثر المالي. */
export function financeScopes() {
  return scopesOfFamily('finance');
}

/** نطاقٌ بمعرّفه، أو `null` للمجهول — فلا يُسحب ما ليس في السجلّ. */
export function scopeOf(id) {
  return PULL_SCOPES[String(id ?? '')] ?? null;
}

/**
 * مجموعات المرآة كلّها — يستعملها حارس القواعد والتدقيق.
 * الأصناف ليست منها: تهبط في نموذجٍ قائم لا في مرآة.
 */
export function mirrorCollections() {
  return PULL_SCOPE_IDS.map((id) => PULL_SCOPES[id].mirror).filter(Boolean);
}

/**
 * معرّف مستند المرآة — حتميٌّ من مفتاح النطاق، فإعادة السحب تكتب فوق نفسها.
 *
 * السجلّ بلا مفتاحٍ صالح **يُرفض** ولا يُحفظ بمعرّفٍ عشوائيّ: سجلٌّ لا يُعرف
 * أصله في أودو لا يصلح مرآةً، ووجوده يُوهم بتغطيةٍ لا وجود لها.
 */
export function mirrorDocId(scopeId, record) {
  const scope = scopeOf(scopeId);
  if (!scope) return null;
  const raw = record?.[scope.key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  // أودو يعيد `false` للحقل الفارغ. و`String(false)` = «false» — معرّفٌ يبدو
  // صالحًا وليس كذلك، فيُنشئ سجلّ مرآةٍ باسمٍ كاذب. لذلك النوع يُفحص لا القيمة.
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  // Firestore يمنع `/` في المعرّف، وأودو يستعمله في أرقام القيود (`INV/2026/0001`).
  return text.replace(/\//g, '__');
}

/** فترة السحب التلقائيّ الافتراضيّة — خمس دقائق. */
export const AUTO_PULL_MS = 5 * 60 * 1000;

/** أقلّ فترةٍ مسموحة — حارسٌ ضدّ مؤقّتٍ يُنهك الحصّة. */
export const MIN_PULL_MS = 60 * 1000;

/** هل حان وقت سحبٍ تلقائيّ؟ منطق خالص كي يُختبَر بلا مؤقّت. */
export function isPullDue(lastPulledAtMs, nowMs, everyMs = AUTO_PULL_MS) {
  const every = Math.max(MIN_PULL_MS, Number(everyMs) || AUTO_PULL_MS);
  if (!lastPulledAtMs) return true;
  return Number(nowMs) - Number(lastPulledAtMs) >= every;
}

/** «قبل ٣ دقائق» — نصٌّ عربيّ لآخر سحب، أو حدٌّ صريح إن لم يقع سحبٌ قطّ. */
export function lastPullLabel(lastPulledAtMs, nowMs) {
  if (!lastPulledAtMs) return 'لم يُسحب بعد';
  const diff = Math.max(0, Number(nowMs) - Number(lastPulledAtMs));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'الآن';
  if (min === 1) return 'قبل دقيقة';
  if (min === 2) return 'قبل دقيقتين';
  if (min < 11) return `قبل ${min} دقائق`;
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr === 1) return 'قبل ساعة';
  if (hr === 2) return 'قبل ساعتين';
  if (hr < 11) return `قبل ${hr} ساعات`;
  if (hr < 24) return `قبل ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  return day === 1 ? 'قبل يوم' : day === 2 ? 'قبل يومين' : `قبل ${day} يومًا`;
}
