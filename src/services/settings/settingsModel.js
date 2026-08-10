/**
 * سياسات التشغيل — `settings/current`.
 *
 * ═══ المبدأ ٨: لا سياسة مخبوزة ═══
 * القرارات الأربعة (٤–٧) من الخطة المعتمدة **قراراتٌ إداريّة لا حقائق برمجيّة**:
 * أيُمنع الصنف الداخليّ في أمر بيع؟ أيُسمح بتعديل السعر يدويًّا؟ متى يُنذَر
 * الائتمان ومتى يُمنع؟ كم يومًا يجوز التأريخ للماضي؟ كلّها تتغيّر بقرارٍ من
 * المالك، فمن يخبزها في الكود يجعل كلّ قرارٍ إداريٍّ نشرةَ إصدارٍ جديدة.
 *
 * والأهمّ: **التراجع يصير تغيير إعداد لا إرجاع كوميت.** فإن آذى حارسٌ العمل
 * يومَ جردٍ مزدحم، يُطفأ من الشاشة في ثانية — لا ننتظر بناءً ونشرًا.
 *
 * ═══ لماذا هذا الملفّ أوّلًا ═══
 * م‑٢ تقرأ `dating`، وم‑٣ تقرأ `items` و`pricing`، وم‑٤ تقرأ `credit`.
 * بناؤه متأخّرًا يعني ثلاثة حرّاس بقيمٍ مخبوزة تُعاد كتابتها ثلاث مرّات.
 *
 * ═══ قاعدة الغياب ═══
 * غياب المستند **لا يعطّل النظام ولا يفتحه**: تُستعمل الافتراضات، وهي نصّ
 * الخطة حرفيًّا. وقيمةٌ فاسدة (نصّ مكان رقم، دورٌ غير معروف) تسقط إلى
 * افتراضها ولا تُسقط الشاشة — لأنّ إعدادًا معطوبًا يجب ألّا يوقف مستودعًا.
 *
 * منطق خالص: بلا Firestore وبلا شبكة. التخزين في `settingsService.js`.
 */
import { ROLES } from '../auth/roles.js';

/** معرّف المستند الواحد. سياسةٌ واحدة للنسخة — لا تعدّديّة في المرحلة الأولى. */
export const SETTINGS_DOC = 'current';
export const SETTINGS_COLLECTION = 'settings';

/**
 * الافتراضات = نصّ الخطة المعتمدة (القسم ١‑أ) حرفيًّا.
 * تغييرها هنا يغيّر سلوك كلّ نسخةٍ بلا مستند إعدادات — فلا تُغيَّر إلّا بقرار.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  items: { internalInSales: 'block', overrideRole: 'warehouse_manager' },
  pricing: { manualOverride: 'tagged', overrideRole: 'sales_supervisor' },
  credit: { enforce: 'block', warnAtPct: 90, unlockRole: 'finance_manager' },
  dating: { backdateDays: 7, requireReason: true, approveRole: 'warehouse_manager' },
});

/** القيم المسموحة لكلّ حقلٍ خياريّ — مصدرٌ واحد للشاشة وللتطبيع وللاختبار. */
export const SETTING_CHOICES = Object.freeze({
  'items.internalInSales': [
    { value: 'block', label: 'يُمنع (يفكّه صاحب الصلاحية)' },
    { value: 'warn', label: 'يُنبَّه ويمرّ' },
    { value: 'allow', label: 'مسموح بلا قيد' },
  ],
  'pricing.manualOverride': [
    { value: 'tagged', label: 'مسموح بوسمٍ وصلاحية' },
    { value: 'block', label: 'ممنوع — سعر القائمة فقط' },
    { value: 'allow', label: 'مسموح بلا وسم' },
  ],
  'credit.enforce': [
    { value: 'block', label: 'إنذارٌ ثمّ منعٌ عند التجاوز' },
    { value: 'warn', label: 'إنذارٌ بلا منع' },
    { value: 'off', label: 'معطَّل' },
  ],
});

/** حدود عدديّة — تمنع إعدادًا يُفرغ الحارس من معناه (٠٪ أو ٣٦٥ يومًا). */
export const SETTING_LIMITS = Object.freeze({
  'credit.warnAtPct': { min: 50, max: 100 },
  'dating.backdateDays': { min: 0, max: 90 },
});

const choicesOf = (path) => (SETTING_CHOICES[path] || []).map((c) => c.value);

/** خيارٌ صالح أو الافتراض — لا يُسقط الشاشة على قيمةٍ غريبة. */
function pickChoice(path, value, fallback) {
  const allowed = choicesOf(path);
  return allowed.includes(value) ? value : fallback;
}

/** دورٌ معروف أو الافتراض. دورٌ محذوف لا يعني «لا أحد يفكّ» بل «يعود للافتراض». */
function pickRole(value, fallback) {
  return Object.prototype.hasOwnProperty.call(ROLES, value) ? value : fallback;
}

/** رقمٌ ضمن الحدّ أو الافتراض. */
function pickNumber(path, value, fallback) {
  const n = Number(value);
  const { min, max } = SETTING_LIMITS[path] || {};
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return fallback;
  if (max != null && n > max) return fallback;
  return n;
}

/**
 * يطبّع مستندًا خامًا (أو غيابه) إلى سياسةٍ كاملةٍ صالحة.
 * لا يرمي أبدًا: أسوأ الحالات أن يعود بالافتراضات.
 *
 * @param {object|null} raw مستند `settings/current` كما ورد من Firestore
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const s = raw && typeof raw === 'object' ? raw : {};
  const items = s.items || {};
  const pricing = s.pricing || {};
  const credit = s.credit || {};
  const dating = s.dating || {};

  return {
    items: {
      internalInSales: pickChoice('items.internalInSales', items.internalInSales, d.items.internalInSales),
      overrideRole: pickRole(items.overrideRole, d.items.overrideRole),
    },
    pricing: {
      manualOverride: pickChoice('pricing.manualOverride', pricing.manualOverride, d.pricing.manualOverride),
      overrideRole: pickRole(pricing.overrideRole, d.pricing.overrideRole),
    },
    credit: {
      enforce: pickChoice('credit.enforce', credit.enforce, d.credit.enforce),
      warnAtPct: pickNumber('credit.warnAtPct', credit.warnAtPct, d.credit.warnAtPct),
      unlockRole: pickRole(credit.unlockRole, d.credit.unlockRole),
    },
    dating: {
      backdateDays: pickNumber('dating.backdateDays', dating.backdateDays, d.dating.backdateDays),
      requireReason: dating.requireReason !== false,
      approveRole: pickRole(dating.approveRole, d.dating.approveRole),
    },
  };
}

/**
 * ما الذي رُفض من المستند الخام ولماذا — للشاشة، كي يرى المالك أنّ قيمةً
 * سقطت إلى افتراضها بدل أن تختفي بصمت.
 *
 * @returns {{path:string, given:*, used:*, why:string}[]}
 */
export function settingsIssues(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const used = normalizeSettings(raw);
  const out = [];
  const check = (path, given, why) => {
    if (given === undefined) return;
    const [a, b] = path.split('.');
    if (used[a][b] !== given) out.push({ path, given, used: used[a][b], why });
  };
  check('items.internalInSales', raw.items?.internalInSales, 'خيارٌ غير معروف');
  check('items.overrideRole', raw.items?.overrideRole, 'دورٌ غير معروف');
  check('pricing.manualOverride', raw.pricing?.manualOverride, 'خيارٌ غير معروف');
  check('pricing.overrideRole', raw.pricing?.overrideRole, 'دورٌ غير معروف');
  check('credit.enforce', raw.credit?.enforce, 'خيارٌ غير معروف');
  check('credit.warnAtPct', raw.credit?.warnAtPct, 'خارج المدى ٥٠–١٠٠');
  check('credit.unlockRole', raw.credit?.unlockRole, 'دورٌ غير معروف');
  check('dating.backdateDays', raw.dating?.backdateDays, 'خارج المدى ٠–٩٠');
  check('dating.approveRole', raw.dating?.approveRole, 'دورٌ غير معروف');
  return out;
}

/* ═══════════════ القارئات — ما تستدعيه الحرّاس ═══════════════ */
/*
 * الحارس لا يقرأ `settings.credit.warnAtPct` مباشرةً بل يسأل سؤالًا:
 * «أأمنع هذا البيع؟». فإن تغيّر شكل المستند لاحقًا تغيّر هنا موضعٌ واحد،
 * ولم تتغيّر خمسة حرّاس متفرّقة.
 */

/**
 * القرار ٤ — صنف داخليّ في أمر بيع.
 * @returns {{allowed:boolean, needsOverride:boolean, overrideRole:string, message:string}}
 */
export function internalItemInSaleVerdict(settings, roleId) {
  const s = normalizeSettings(settings).items;
  if (s.internalInSales === 'allow') return { allowed: true, needsOverride: false, overrideRole: s.overrideRole, message: '' };
  if (s.internalInSales === 'warn') {
    return { allowed: true, needsOverride: false, overrideRole: s.overrideRole, message: 'صنفٌ داخليّ في أمر بيع — تنبيه.' };
  }
  const unlocked = roleId === 'admin' || roleId === s.overrideRole;
  return {
    allowed: unlocked,
    needsOverride: !unlocked,
    overrideRole: s.overrideRole,
    message: unlocked ? 'صنفٌ داخليّ — مرّ بصلاحية فكّ المنع.' : 'الصنف الداخليّ لا يُباع. يفكّ المنع صاحب الصلاحية.',
  };
}

/**
 * القرار ٥ — تعديل السعر يدويًّا.
 * @returns {{allowed:boolean, mustTag:boolean, overrideRole:string, message:string}}
 */
export function manualPriceVerdict(settings, roleId) {
  const s = normalizeSettings(settings).pricing;
  if (s.manualOverride === 'allow') return { allowed: true, mustTag: false, overrideRole: s.overrideRole, message: '' };
  if (s.manualOverride === 'block') {
    return { allowed: false, mustTag: false, overrideRole: s.overrideRole, message: 'السعر من القائمة وحدها — التعديل اليدويّ ممنوع.' };
  }
  const permitted = roleId === 'admin' || roleId === s.overrideRole;
  return {
    allowed: permitted,
    mustTag: permitted,
    overrideRole: s.overrideRole,
    message: permitted ? 'سعرٌ يدويّ — يُوسم البند ويظهر في تقرير الانحراف.' : 'تعديل السعر يحتاج صلاحية.',
  };
}

/**
 * القرار ٦ — حدّ الائتمان. إنذارٌ عند الاقتراب ومنعٌ عند التجاوز.
 * سقفٌ صفرٌ أو غائب = لا سقف مُدخَل ⇒ لا منع (القسم ٦: «لا يُطبَّق المنع حتى إدخالها»).
 *
 * @returns {{verdict:'ok'|'warn'|'block', usedPct:number, unlockRole:string, message:string}}
 */
export function creditVerdict(settings, { balance = 0, limit = 0, addition = 0 } = {}) {
  const s = normalizeSettings(settings).credit;
  const cap = Number(limit) || 0;
  const after = (Number(balance) || 0) + (Number(addition) || 0);
  if (s.enforce === 'off' || cap <= 0) {
    return { verdict: 'ok', usedPct: 0, unlockRole: s.unlockRole, message: '' };
  }
  const usedPct = Math.round((after / cap) * 100);
  if (after > cap) {
    return {
      verdict: s.enforce === 'block' ? 'block' : 'warn',
      usedPct,
      unlockRole: s.unlockRole,
      message: `تجاوزُ سقف الائتمان (${usedPct}٪ من السقف). يفكّه صاحب الصلاحية.`,
    };
  }
  if (usedPct >= s.warnAtPct) {
    return { verdict: 'warn', usedPct, unlockRole: s.unlockRole, message: `اقترابٌ من سقف الائتمان (${usedPct}٪).` };
  }
  return { verdict: 'ok', usedPct, unlockRole: s.unlockRole, message: '' };
}

/**
 * القرار ٧ — مدى التأريخ للماضي.
 * `today` يُمرَّر صراحةً لا يُقرأ من الساعة — فالمنطق الخالص لا يعرف الزمن،
 * ولولا ذلك لصار الاختبار متقلّبًا بتقلّب يوم تشغيله.
 *
 * @param {string} eventDate تاريخ الواقعة `YYYY-MM-DD`
 * @param {string} today اليوم بختم الخادم `YYYY-MM-DD`
 * @returns {{verdict:'ok'|'future'|'needsApproval', daysBack:number, approveRole:string, requireReason:boolean, message:string}}
 */
export function backdateVerdict(settings, eventDate, today) {
  const s = normalizeSettings(settings).dating;
  const base = { approveRole: s.approveRole, requireReason: s.requireReason };
  const ev = Date.parse(`${String(eventDate ?? '').slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${String(today ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ev) || !Number.isFinite(now)) {
    return { ...base, verdict: 'ok', daysBack: 0, message: '' };
  }
  const daysBack = Math.round((now - ev) / 86400000);
  if (daysBack < 0) {
    return { ...base, verdict: 'future', daysBack, message: 'لا واقعة في المستقبل — تاريخٌ بعد اليوم يُرفض.' };
  }
  if (daysBack > s.backdateDays) {
    return {
      ...base,
      verdict: 'needsApproval',
      daysBack,
      message: `تأريخٌ لما قبل ${s.backdateDays} يومًا (${daysBack} يومًا) — يحتاج اعتمادًا وسببًا مكتوبًا.`,
    };
  }
  return { ...base, verdict: 'ok', daysBack, message: '' };
}

/** هل يملك هذا الدور فكّ هذا القيد؟ الأدمن يفكّ كلّ شيء. */
export function canOverride(settings, area, roleId) {
  const s = normalizeSettings(settings);
  const roleFor = {
    items: s.items.overrideRole,
    pricing: s.pricing.overrideRole,
    credit: s.credit.unlockRole,
    dating: s.dating.approveRole,
  }[area];
  return roleId === 'admin' || (Boolean(roleFor) && roleId === roleFor);
}
