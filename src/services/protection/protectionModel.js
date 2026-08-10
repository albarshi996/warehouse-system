/**
 * سياسات البضاعة المحميّة وحقّ الإرجاع — القاعدة التي تحكم ما يُستردّ وما لا.
 *
 * المشكلة: «البضاعة المحمية» ليست ميزةً واحدة بل **وعدٌ تجاريّ** يختلف من صنفٍ
 * إلى صنف ومن قطاعٍ إلى قطاع. مستحضرات التجميل تُودَع بحقّ إرجاعٍ كامل، والأدوية
 * بحقّ إرجاع المنتهي وحده، والمواد سريعة الدوران بلا حقٍّ أصلًا. وحين يُدار هذا
 * بالذاكرة، يصير الإرجاع مفاوضةً عند باب المتجر: المندوب يقبل ليُرضي، والمشرف
 * يرفض ليُوازن، والشركة لا تعرف كم وعدت ولا كم استُحقّ عليها.
 *
 * الحلّ: **السياسة بيانٌ لا اجتهاد**. تُعرَّف مرّة، وتُقرأ لحظة الإرجاع، فتُجيب
 * عن سؤالٍ واحد بجوابٍ واحد: هل يُقبل هذا المرتجع؟ وإن قُبل، فإلى أين يذهب؟
 *
 * ═══ التمييز الحاكم: الأهليّة غير المصير ═══
 * سؤالان لا سؤال:
 *   ① **هل يُقبل الاسترداد؟** تُجيبه السياسة (النوع · النافذة · حالة الصنف).
 *   ② **إلى أين تذهب البضاعة؟** يُجيبه حالُها لا السياسة: السليم يعود للرفّ،
 *      والتالف والمنتهي إلى الإتلاف، والمشكوك فيه إلى الفحص.
 * وخلطُهما هو ما يجعل الأنظمة تُعيد منتهيَ الصلاحية إلى رفّ البيع لأنّ «العميل
 * يملك حقّ الإرجاع» — والحقّ كان في **قبول المرتجع** لا في **إعادة بيعه**.
 *
 * منطق خالص: بلا Firestore وبلا DOM.
 */

/** أنواع الحماية — وعدٌ تجاريّ لكلّ صنفٍ أو فئة. */
export const PROTECTION_POLICIES = {
  none: {
    id: 'none',
    labelAr: 'لا يُسمح بالإرجاع',
    hint: 'بيعٌ قاطع — تخرج الملكيّة عند التسليم ولا تعود.',
    consignable: false,
  },
  full_return: {
    id: 'full_return',
    labelAr: 'يحقّ إرجاعه بالكامل',
    hint: 'أمانةٌ كاملة — يُستردّ السليم والمنتهي معًا.',
    consignable: true,
  },
  expired_only: {
    id: 'expired_only',
    labelAr: 'يحقّ إرجاع المنتهي فقط',
    hint: 'الأشيع في الأدوية والأغذية — السليم لا يُستردّ.',
    consignable: true,
  },
  exchange_only: {
    id: 'exchange_only',
    labelAr: 'استبدال لا إرجاع',
    hint: 'يُستبدَل بمثله ولا تُردّ قيمته — يحمي التدفّق النقديّ.',
    consignable: true,
  },
  window_days: {
    id: 'window_days',
    labelAr: 'حماية لمدّة محدّدة',
    hint: 'حقّ الإرجاع ينقضي بعد عددٍ من الأيّام من تاريخ التسليم (٩٠ يومًا مثلًا).',
    consignable: true,
    needs: ['windowDays'],
  },
  until_expiry: {
    id: 'until_expiry',
    labelAr: 'حماية حتى انتهاء الصلاحية',
    hint: 'يُستردّ ما دام صالحًا أو قارب — وبعد الانتهاء يصير تالفًا لا مرتجعًا.',
    consignable: true,
    needs: ['graceDays'],
  },
};

/** حالات الصنف المرتجَع — تُقرَّر بالعين لا بالسياسة. */
export const RETURN_CONDITIONS = ['سليم', 'قارب الانتهاء', 'منتهي', 'تالف', 'كسر', 'ناقص'];

/** مصائر الاسترداد — إلى أين تذهب البضاعة بعد قبولها. */
export const DISPOSITIONS = {
  restock: { id: 'restock', labelAr: 'إعادة للمخزون', hint: 'صالحٌ للبيع ثانيةً.' },
  scrap: { id: 'scrap', labelAr: 'إتلاف', hint: 'لا يعود للرفّ — يُشطب بسند تالف.' },
  inspect: { id: 'inspect', labelAr: 'تحت الفحص', hint: 'يُحجَز حتى تقرّر الجودة.' },
  exchange: { id: 'exchange', labelAr: 'استبدال بمثله', hint: 'يخرج بديلٌ ولا تُردّ قيمة.' },
};

/** أيّام السماح الافتراضيّة قبل انتهاء الصلاحية لاعتبار الصنف «قارب الانتهاء». */
export const DEFAULT_GRACE_DAYS = 30;

const DAY_MS = 86400000;

/** يقرأ `YYYY-MM-DD` منتصفَ ليل UTC — نفس قاعدة `journeyPlan.parseDay`. */
export function parseDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** عدد الأيّام بين تاريخين نصّيّين (موجبٌ إن تأخّر الثاني). */
export function daysBetween(fromIso, toIso) {
  const a = parseDay(fromIso);
  const b = parseDay(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * حالة الصلاحية في يومٍ بعينه: `valid` · `near` · `expired` · `unknown`.
 * «قارب الانتهاء» ليس تفصيلًا: هو النافذة الوحيدة التي يمكن فيها إنقاذ البضاعة
 * — إمّا بتصريفها بعرضٍ، أو باستردادها قبل أن تصير خسارةً كاملة.
 */
export function expiryStatus(expiry, asOf, graceDays = DEFAULT_GRACE_DAYS) {
  const left = daysBetween(asOf, expiry);
  if (left === null) return { status: 'unknown', daysLeft: null };
  if (left < 0) return { status: 'expired', daysLeft: left };
  if (left <= (Number(graceDays) || DEFAULT_GRACE_DAYS)) return { status: 'near', daysLeft: left };
  return { status: 'valid', daysLeft: left };
}

/** يقرأ سياسة صنفٍ من خريطة السياسات، أو الافتراضيّة. */
export function policyFor(item, policies, fallback = 'none') {
  const bySku = policies?.bySku?.[String(item?.sku || '').toUpperCase()];
  if (bySku) return bySku;
  const byCat = policies?.byCategory?.[String(item?.category || '').toUpperCase()];
  if (byCat) return byCat;
  return policies?.default || { type: fallback };
}

/** هل هذه السياسة تسمح بالإيداع أمانةً أصلًا؟ */
export function isConsignable(policy) {
  return Boolean(PROTECTION_POLICIES[policy?.type]?.consignable);
}

/**
 * حكم الاسترداد — الحارس الذي يُستدعى قبل تسجيل مرتجع.
 *
 * @param {object} args
 * @param {object} args.policy سياسة الصنف `{type, windowDays?, graceDays?}`
 * @param {string} args.condition حالة الصنف المرتجَع (من `RETURN_CONDITIONS`)
 * @param {string} [args.deliveredOn] تاريخ التسليم `YYYY-MM-DD` (لنافذة الحماية)
 * @param {string} [args.expiry] تاريخ الصلاحية
 * @param {string} [args.asOf] اليوم
 * @returns {{allowed:boolean, disposition:string, reason:string,
 *            needsApproval:boolean, daysSinceDelivery:number|null}}
 */
export function returnVerdict({ policy, condition, deliveredOn, expiry, asOf } = {}) {
  const type = policy?.type || 'none';
  const meta = PROTECTION_POLICIES[type];
  const cond = String(condition || '').trim();
  const daysSinceDelivery = deliveredOn && asOf ? daysBetween(deliveredOn, asOf) : null;
  const exp = expiryStatus(expiry, asOf, policy?.graceDays);

  // المصير يُقرَّر من الحال لا من السياسة — ويُحسب حتى حين يُرفض الاسترداد.
  const disposition = dispositionFor(cond, exp.status, type);

  if (!meta) {
    return { allowed: false, disposition, reason: `سياسة غير معروفة: «${type}»`, needsApproval: true, daysSinceDelivery };
  }

  if (type === 'none') {
    return {
      allowed: false,
      disposition,
      reason: 'هذا الصنف بيعٌ قاطع — لا يحقّ إرجاعه. الاستثناء يحتاج اعتماد المشرف.',
      needsApproval: true,
      daysSinceDelivery,
    };
  }

  if (type === 'expired_only' && exp.status !== 'expired' && exp.status !== 'near') {
    return {
      allowed: false,
      disposition,
      reason: 'السياسة تسمح بإرجاع المنتهي أو المقارب فقط — وهذا الصنف ما يزال صالحًا.',
      needsApproval: true,
      daysSinceDelivery,
    };
  }

  if (type === 'window_days') {
    const window = Number(policy?.windowDays) || 0;
    if (!window) {
      return { allowed: false, disposition, reason: 'نافذة الحماية غير محدّدة في السياسة.', needsApproval: true, daysSinceDelivery };
    }
    if (daysSinceDelivery === null) {
      return { allowed: false, disposition, reason: 'لا تاريخ تسليم — تعذّر حساب نافذة الحماية.', needsApproval: true, daysSinceDelivery };
    }
    if (daysSinceDelivery > window) {
      return {
        allowed: false,
        disposition,
        reason: `انقضت نافذة الحماية (${window} يومًا) — مضى ${daysSinceDelivery} يومًا على التسليم.`,
        needsApproval: true,
        daysSinceDelivery,
      };
    }
  }

  if (type === 'until_expiry' && exp.status === 'expired') {
    // بعد الانتهاء لم يعد مرتجعًا بل تالفًا — يُقبل ومصيره الإتلاف لا الرفّ.
    return {
      allowed: true,
      disposition: DISPOSITIONS.scrap.id,
      reason: 'انتهت صلاحيته داخل الحماية — يُستردّ ومصيره الإتلاف لا الرفّ.',
      needsApproval: false,
      daysSinceDelivery,
    };
  }

  if (type === 'exchange_only') {
    return {
      allowed: true,
      disposition: DISPOSITIONS.exchange.id,
      reason: 'السياسة استبدالٌ بمثله — لا تُردّ القيمة.',
      needsApproval: false,
      daysSinceDelivery,
    };
  }

  return {
    allowed: true,
    disposition,
    reason: `مقبول بموجب سياسة «${meta.labelAr}».`,
    needsApproval: disposition === DISPOSITIONS.inspect.id,
    daysSinceDelivery,
  };
}

/**
 * المصير من الحال — القاعدة التي تمنع إعادة المنتهي إلى رفّ البيع.
 * لاحظ أنّها **لا تقرأ السياسة إلّا للاستبدال**: حقّ الإرجاع لا يجعل التالف سليمًا.
 */
export function dispositionFor(condition, expiryState, policyType) {
  if (policyType === 'exchange_only') return DISPOSITIONS.exchange.id;
  if (['تالف', 'كسر'].includes(condition)) return DISPOSITIONS.scrap.id;
  if (condition === 'منتهي' || expiryState === 'expired') return DISPOSITIONS.scrap.id;
  if (condition === 'ناقص') return DISPOSITIONS.inspect.id;
  if (condition === 'قارب الانتهاء' || expiryState === 'near') return DISPOSITIONS.inspect.id;
  if (condition === 'سليم') return DISPOSITIONS.restock.id;
  return DISPOSITIONS.inspect.id; // حالٌ غير مصرَّح به لا يعود للرفّ بالافتراض
}

/**
 * تنبيهات ما لدى العملاء: المنتهي والمقارب والحماية التي أوشكت على الانقضاء.
 *
 * هذا هو التقرير الذي يُنقذ المال فعلًا: بضاعةٌ عند تاجرٍ تنتهي بعد أسبوعين
 * يمكن استردادها اليوم وبيعها في مكانٍ آخر — وبعد أسبوعين تصير خسارةً كاملة.
 *
 * @param {Array} balances أرصدة مواقع العملاء (من `atCustomerBalances`)
 * @param {object} policies خريطة السياسات
 * @param {object} opts `{asOf, graceDays, windowWarnDays, deliveredByKey}`
 */
export function customerStockAlerts(balances, policies, { asOf, graceDays = DEFAULT_GRACE_DAYS, windowWarnDays = 14, deliveredByKey = {} } = {}) {
  const rows = [];
  for (const b of balances || []) {
    const policy = policyFor(b, policies);
    const exp = expiryStatus(b?.expiry, asOf, policy?.graceDays ?? graceDays);
    const key = `${String(b?.sku || '').toUpperCase()}__${String(b?.customerCode || '').toUpperCase()}__${String(b?.batch || '').toUpperCase()}`;
    const deliveredOn = deliveredByKey[key] || null;
    const daysSince = deliveredOn && asOf ? daysBetween(deliveredOn, asOf) : null;

    const flags = [];
    if (exp.status === 'expired') flags.push({ kind: 'expired', text: `منتهي منذ ${Math.abs(exp.daysLeft)} يومًا` });
    else if (exp.status === 'near') flags.push({ kind: 'near', text: `يبقى ${exp.daysLeft} يومًا على الانتهاء` });

    if (policy?.type === 'window_days' && Number(policy.windowDays) > 0 && daysSince !== null) {
      const left = Number(policy.windowDays) - daysSince;
      if (left <= 0) flags.push({ kind: 'window_closed', text: `انقضت الحماية منذ ${Math.abs(left)} يومًا` });
      else if (left <= windowWarnDays) flags.push({ kind: 'window_soon', text: `تنقضي الحماية بعد ${left} يومًا` });
    }

    if (flags.length) {
      rows.push({
        ...b,
        policyType: policy?.type || 'none',
        policyLabel: PROTECTION_POLICIES[policy?.type]?.labelAr || '—',
        expiryStatus: exp.status,
        daysLeft: exp.daysLeft,
        deliveredOn,
        daysSinceDelivery: daysSince,
        flags,
        severity: flags.some((f) => f.kind === 'expired' || f.kind === 'window_closed') ? 'high' : 'medium',
      });
    }
  }
  return rows.sort(
    (a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)
  );
}

/** ملخّص ما لدى العملاء — لبطاقات اللوحة. */
export function customerStockSummary(balances, policies, opts = {}) {
  const alerts = customerStockAlerts(balances, policies, opts);
  const totalQty = (balances || []).reduce((s, b) => s + (Number(b?.qty) || 0), 0);
  const totalValue = (balances || []).reduce((s, b) => s + (Number(b?.qty) || 0) * (Number(b?.unitCost) || 0), 0);
  return {
    customers: new Set((balances || []).map((b) => b?.customerCode)).size,
    lines: (balances || []).length,
    totalQty: Math.round(totalQty * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
    expired: alerts.filter((a) => a.expiryStatus === 'expired').length,
    near: alerts.filter((a) => a.expiryStatus === 'near').length,
    windowClosing: alerts.filter((a) => a.flags.some((f) => f.kind === 'window_soon' || f.kind === 'window_closed')).length,
    high: alerts.filter((a) => a.severity === 'high').length,
  };
}

/** حكمٌ على تعريف السياسة قبل حفظها. */
export function policyVerdict(policy) {
  const problems = [];
  const meta = PROTECTION_POLICIES[policy?.type];
  if (!meta) problems.push('نوع سياسة غير معروف');
  else {
    for (const need of meta.needs || []) {
      if (!(Number(policy?.[need]) > 0)) {
        problems.push(need === 'windowDays' ? 'مدّة الحماية بالأيّام مطلوبة' : 'أيّام السماح قبل الانتهاء مطلوبة');
      }
    }
  }
  return { ok: problems.length === 0, problems };
}
