/**
 * عقد الأثر المالي — جدولٌ واحد يُقرأ في دقيقة (SAP-17 · يسدّ ف‑٤٠ وف‑٤١).
 *
 * ═══ قرار المالك الحاكم (2026-08-12) ═══
 * «أودو هو المصدر المالي. **والمنطق يبقى موجودًا في البوابة**: تعرف أثر
 * كلّ مستند وتعرض المستند المالي والقيد والحساب وتسمح بالحفر إليها —
 * **ولا تُولّد قيدًا**.»
 *
 * فهذا الملفّ يُجيب سؤالًا واحدًا لكلّ نوع مستند: **ما أثره المالي، ومن
 * يُنشئه؟** — ولا يُنشئ قيدًا ولا يحسب مبلغًا ولا يخترع حسابًا (§16.1 ‹453›).
 * الأرقام كلّها تأتي مستوردةً من مرآة أودو (SAP-16).
 *
 * ═══ الحدّ الفاصل ═══
 *   **الكمّيّة للبوابة، والقيمة لأودو.**
 * فحقل `stockEffect` هنا يجب أن **يطابق** `postingRules.js` حرفيًّا —
 * ويحرسه اختبارٌ آليّ يقارن الجدولين ويكشف أيّ تعارضٍ (§16.8 ‹617›:
 * «أيّ تعديلٍ يُسجَّل في سجلّ الفروقات ولا يمرّ بصمت»).
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { POSTING_RULES } from '../ledger/postingRules.js';

/** من يُنشئ الأثر المالي؟ أودو وحده (قرار‑٢) — والبوابة تعرضه. */
export const FINANCE_OWNER = 'odoo';

/**
 * مصفوفة أثر المستندات (§16.8 ‹619-640›).
 *
 * `financial`: هل لهذا النوع أثرٌ ماليّ؟ ومتى ينشأ ومن أيّ مستندٍ في أودو.
 * `stockEffect`: هل يحرّك بضاعةً؟ — **يُطابَق آليًّا مع postingRules**.
 * `note`: لماذا — فالجدول يُقرأ ولا يُحفظ.
 *
 * ولا يُذكر حسابٌ ولا رقم حسابٍ ولا سياسةٌ ضريبيّة (§16.1 ‹453›): تلك في
 * أودو، والبوابة تعرض ما تستورده لا ما تفترضه.
 */
export const FINANCIAL_IMPACT = Object.freeze({
  PR: { financial: false, stockEffect: false, odooDoc: null, note: 'طلبٌ داخليّ — نيّةٌ لا التزام، ولا بضاعة في اليد.' },
  PO: { financial: false, stockEffect: false, odooDoc: 'purchase.order', note: 'التزامٌ مستقبليّ: يظهر في أودو أمرَ شراءٍ ولا قيدَ له حتى الفاتورة.' },
  GRN: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'الاستلام يُنشئ التزامًا على المنشأة (بضاعةٌ مستلمة لم تُفوتر) — والقيد في أودو.' },
  QC: { financial: false, stockEffect: true, odooDoc: null, note: 'عزلٌ داخليّ: البضاعة تنتقل للحجر ولا تتغيّر قيمتها ولا مالكها.' },
  PUTAWAY: { financial: false, stockEffect: true, odooDoc: null, note: 'نقلٌ داخليّ من الرصيف إلى الرفّ — لا أثر ماليّ.' },
  // ‹FNB-502› الإنتاج **تحويلُ قيمةٍ لا خلقُها**: موادُّ بقيمةٍ تصير منتَجًا
  // بقيمةٍ، والملكيّة لم تخرج من المنشأة. فلا قيدَ ماليّ عندنا ولا في أودو —
  // والتكلفة تُقرأ من الحركة (استهلاكٌ داخليّ). ومن جعله ماليًّا ضاعف
  // تكلفة المخزون: خصمها مادّةً وأثبتها منتَجًا.
  PRO: { financial: false, stockEffect: false, odooDoc: 'mrp.production', note: 'أمر إنتاج: خطّةٌ لا حركة — يظهر في أودو أمرَ تصنيعٍ ولا قيدَ له.' },
  MIS: { financial: false, stockEffect: true, odooDoc: null, note: 'صرفُ موادٍّ للإنتاج: نقلٌ داخليّ إلى موقع الإنتاج — القيمة تتحوّل ولا تخرج.' },
  PRC: { financial: false, stockEffect: true, odooDoc: null, note: 'استلامُ المنتَج: نقلٌ داخليّ من موقع الإنتاج إلى الرفّ — لا مالكَ تغيّر.' },
  SRN: { financial: false, stockEffect: false, odooDoc: null, note: 'إشعار رفضٍ توثيقيّ — الفحص عزل المرفوض أصلًا، والأثر الماليّ عند إرجاعه فعلًا.' },
  VRT: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'إرجاعٌ للمورّد: يُنقص الالتزام — إشعارٌ دائن في أودو.' },
  SO: { financial: false, stockEffect: false, odooDoc: 'sale.order', note: 'أمر بيع: التزامٌ تجاريّ يظهر في أودو، ولا قيدَ حتى التسليم/الفاتورة.' },
  PICK: { financial: false, stockEffect: true, odooDoc: null, note: 'سحبٌ داخليّ إلى ساحة التجهيز.' },
  PACK: { financial: false, stockEffect: false, odooDoc: null, note: 'تغليفٌ في الموقع نفسه — لا انتقال ولا قيمة.' },
  DN: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'التسليم يُخرج الملكيّة ⇒ إيرادٌ وتكلفة مبيعات في أودو.' },
  GP: { financial: false, stockEffect: false, odooDoc: null, note: 'تصريح بوّابة: رقابةٌ على ما حرّكه التسليم — قيدُه ازدواج.' },
  POD: { financial: false, stockEffect: true, odooDoc: null, note: 'تأكيد التسليم: يُفرغ المركبة للعميل — القيمة قُيّدت مع التسليم.' },
  INV: { financial: true, stockEffect: false, odooDoc: 'account.move', note: 'الفاتورة **مستندٌ ماليّ خالص** — تُنشأ في أودو وتُستورد مرآةً، ولا تحرّك بضاعة.' },
  RCP: { financial: true, stockEffect: false, odooDoc: 'account.payment', note: 'سند قبض: يُقاصّ فواتير — دفعةٌ في أودو.' },
  SPV: { financial: true, stockEffect: false, odooDoc: 'account.payment', note: 'سداد مورّد: دفعةٌ في أودو تُقاصّ فواتيره.' },
  RCV: { financial: true, stockEffect: false, odooDoc: 'account.payment', note: 'تحصيلٌ ميدانيّ: دفعةٌ تُقاصّ فواتير عملاء المندوب.' },
  TR: { financial: false, stockEffect: false, odooDoc: null, note: 'طلب نقلٍ: نيّةٌ — لا حركة ولا قيمة حتى الشحن.' },
  TRN: { financial: false, stockEffect: true, odooDoc: null, note: 'شحنٌ بين مستودعاتنا: البضاعة في العبور، والملكيّة لم تتغيّر.' },
  TRC: { financial: false, stockEffect: true, odooDoc: null, note: 'استلام النقل: يُفرغ العبور — ولا أثر ماليّ ما دام الكيان واحدًا (قرار‑٦).' },
  RET: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'مرتجع عميل: يُنقص الإيراد — إشعارٌ دائن في أودو، والبضاعة تدخل الفحص.' },
  CN: { financial: true, stockEffect: false, odooDoc: 'account.move', note: 'إشعارٌ دائن: أثرٌ ماليٌّ بحت على ذمّة العميل لا على الرفّ.' },
  CC: { financial: false, stockEffect: false, odooDoc: null, note: 'عَدٌّ لا يُغيّر شيئًا — المغيِّر هو التسوية المشتقّة منه.' },
  ADJ: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'تسوية جردٍ: فرقٌ يُقيَّد ربحًا أو خسارةً في أودو.' },
  DMG: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'تالف: شطبُ قيمةٍ — مصروفٌ في أودو.' },
  VLD: { financial: false, stockEffect: true, odooDoc: null, note: 'تحميل مركبة: نقلٌ إلى عهدة المندوب — الملكيّة لم تخرج.' },
  VSI: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'بيعٌ من المركبة: الفاتورة والخصم في اللحظة نفسها.' },
  VCD: { financial: false, stockEffect: true, odooDoc: null, note: 'إيداع أمانة: بضاعةٌ عند العميل والملكيّة لنا — لا إيراد بعد.' },
  VCS: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'تحقّق بيع الأمانة: هنا تخرج الملكيّة ⇒ الإيراد يُقيَّد.' },
  VCR: { financial: false, stockEffect: true, odooDoc: null, note: 'استرداد الأمانة: تعود لنا — ولا إيراد كان قد قُيّد.' },
  CRN: { financial: true, stockEffect: true, odooDoc: 'account.move', note: 'مرتجع ميدانيّ: يُنقص إيراد البيع الميدانيّ.' },
  VSR: { financial: false, stockEffect: false, odooDoc: null, note: 'تسوية الرحلة: محضر إقفالٍ يقرأ ما قُيّد ولا يقيّد.' },
  CTR: { financial: false, stockEffect: false, odooDoc: null, note: 'مناولة حاوية: تشغيلٌ لوجستيّ — تكلفته إن وُجدت مصروفٌ في أودو بمستندٍ مستقلّ.' },
  // سلسلة المشتريات الداخليّة (طلبات الإدارات من المالية): الصرف النقديّ
  // هو الواقعة الماليّة الوحيدة فيها؛ وما قبله طلبٌ وعروضٌ وأمر، وما بعده
  // تسليمٌ لموادّ تشغيلٍ لا تدخل مخزون البيع.
  IPR: { financial: false, stockEffect: false, odooDoc: null, note: 'طلب شراءٍ داخليّ: نيّةُ إدارةٍ — لا التزام ولا صرف بعد.' },
  RFQ: { financial: false, stockEffect: false, odooDoc: null, note: 'طلب عروض أسعار: مقارنةٌ بين موردين — لا التزامَ ماليًّا حتى الترسية.' },
  IPO: { financial: false, stockEffect: false, odooDoc: 'purchase.order', note: 'أمر شراءٍ داخليّ: التزامٌ يظهر في أودو، ولا قيدَ حتى الصرف.' },
  PV: { financial: true, stockEffect: false, odooDoc: 'account.payment', note: 'سند صرفٍ نقديّ: **الواقعة الماليّة** في السلسلة — دفعةٌ في أودو.' },
  DLV: { financial: false, stockEffect: false, odooDoc: null, note: 'تسليم موادّ التشغيل لطالبها: إثباتُ استلامٍ — والقيمة صُرفت في السند.' },
});

/** الأثر الماليّ لنوعٍ ما، أو null لغير المعروف. */
export function financialImpactFor(type) {
  return FINANCIAL_IMPACT[String(type ?? '').trim()] || null;
}

/** الأنواع ذات الأثر الماليّ — للعرض والتقارير. */
export function financialTypes() {
  return Object.keys(FINANCIAL_IMPACT).filter((t) => FINANCIAL_IMPACT[t].financial);
}

/**
 * **سجلّ الفروقات** (§16.8 ‹617›): يقارن عمود «أثر الكمّيّة» في هذا العقد
 * بـ`postingRules.js` الفعليّ — فأيّ تعارضٍ يُكشف بيّنةً رقميّة لا رأيًا.
 * @returns {Array<{type:string, problem:string}>} فارغةٌ = الجدولان متطابقان
 */
export function stockEffectDiscrepancies() {
  const out = [];
  for (const [type, impact] of Object.entries(FINANCIAL_IMPACT)) {
    const posts = Boolean(POSTING_RULES[type]);
    if (impact.stockEffect !== posts) {
      out.push({
        type,
        problem: impact.stockEffect
          ? 'العقد الماليّ يقول «يحرّك بضاعة» وقواعد الترحيل لا تُقيّد له حركة.'
          : 'قواعد الترحيل تُقيّد له حركةً والعقد الماليّ يقول «لا يحرّك بضاعة».',
      });
    }
  }
  // ونوعٌ يُقيّد حركةً ولا ذكرَ له في العقد الماليّ أصلًا — أخطر الفروقات.
  for (const type of Object.keys(POSTING_RULES)) {
    if (!FINANCIAL_IMPACT[type]) {
      out.push({ type, problem: 'يحرّك بضاعةً ولا أثرَ ماليًّا معلَنًا له في العقد.' });
    }
  }
  return out;
}

/**
 * الثمانية التي تعرضها واجهة «الأثر المالي» (§16.18 ‹774-783› · ف‑٤١).
 *
 * كلّها **مستوردة** من مرآة أودو (SAP-16) لا محسوبةٌ هنا — والغائب يُقال
 * غائبًا ولا يُلفَّق. و«دون كشف أسرار النظام المتصل» (‹783›): الأخطاء
 * تُعرض برسالةٍ مفهومة بلا مسارات ولا اعتمادات.
 *
 * @param {object} doc المستند التشغيليّ
 * @param {{moves?:Array, mirror?:object}} sources مرآة أودو المستوردة
 */
export function financialImpactView(doc, { moves = [], moveLines = [], payments = [] } = {}) {
  const type = String(doc?.type ?? '').trim();
  const impact = financialImpactFor(type);
  if (!impact) {
    return { known: false, message: 'نوعٌ غير معلَن في عقد الأثر المالي.' };
  }
  if (!impact.financial) {
    return {
      known: true,
      financial: false,
      note: impact.note,
      message: 'لا أثرَ ماليًّا لهذا النوع — والسبب مكتوب.',
    };
  }

  // القيد المرآة المرتبط بهذا المستند (إن استُورد) — بحقول `financeMapper`
  // الحقيقيّة لا بأسماءٍ مفترضة: name · ref · date · amountTotal · currency
  // · reversedEntry · sourceDocument (invoice_origin).
  const linked = (moves || []).filter((m) => matchesDocument(m, doc));
  const linkedPayments = (payments || []).filter((p) => matchesDocument(p, doc));
  const entry = linked[0] || null;
  const lines = entry ? (moveLines || []).filter((l) => sameMove(l, entry)) : [];
  const sum = (field) => lines.reduce((s, l) => s + (Number(l?.[field]) || 0), 0);
  const hasLines = lines.length > 0;

  return {
    known: true,
    financial: true,
    note: impact.note,
    // ١ — حالة المزامنة (لا «الترحيل»: البوابة لا تُرحّل)
    syncState: entry ? 'مستورَدٌ من أودو' : 'لم يُستورد بعد',
    // ٢ — المستند المالي في أودو
    odooDoc: impact.odooDoc,
    odooRef: entry?.ref || entry?.sourceDocument || null,
    // ٣ — رقم القيد وتاريخه
    entryNumber: entry?.name || null,
    entryDate: entry?.date || entry?.invoiceDate || null,
    // ٤ — إجمالي المدين والدائن: من أسطر القيد المستوردة إن وُجدت، وإلّا
    // إجمالي المستند كما استُورد (`amountTotal`) — ولا تُسوّى هنا بحال.
    totalDebit: hasLines ? round2(sum('debit')) : (entry?.amountTotal ?? null),
    totalCredit: hasLines ? round2(sum('credit')) : (entry?.amountTotal ?? null),
    balanced: hasLines ? round2(sum('debit')) === round2(sum('credit')) : null,
    // ٥ — أسطر الحسابات
    lines,
    // ٦ — العملة وسعر الصرف والأبعاد
    currency: entry?.currency || null,
    exchangeRate: entry?.exchangeRate ?? null,
    dimensions: entry?.dimensions || null,
    // ٧ — المستند العكسي
    reversal: entry?.reversedEntry || entry?.reversedBy || null,
    // ٨ — أخطاء المزامنة (بلا كشف أسرار النظام المتصل — ‹783›)
    syncError: entry?.error ? 'تعذّرت المزامنة مع النظام المالي — أعد المحاولة أو راجع المسؤول.' : null,
    payments: linkedPayments,
    residual: entry?.amountResidual ?? null,
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** هل هذا السطرُ من هذا القيد؟ (`move_id` المرآة يحمل اسم القيد أو معرّفه). */
function sameMove(line, entry) {
  const want = [entry?.name, entry?.odooId, entry?.id].filter(Boolean).map(String);
  const have = [line?.moveId, line?.move, line?.moveName].filter(Boolean).map(String);
  return have.some((h) => want.includes(h));
}

/** هل يخصّ هذا القيدُ المستورَد مستندَنا؟ بالمرجع أو رقم المستند. */
function matchesDocument(mirrorRow, doc) {
  const number = String(doc?.number ?? '').trim();
  const id = String(doc?.id ?? '').trim();
  if (!number && !id) return false;
  const fields = [mirrorRow?.ref, mirrorRow?.name, mirrorRow?.sourceDocument, mirrorRow?.portalDocId];
  return fields.some((f) => {
    const v = String(f ?? '').trim();
    return v && (v === number || v === id || v.includes(number));
  });
}
