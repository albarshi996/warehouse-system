/**
 * محاكي Odoo — محرّك الحالة (reducer) للدورة المستندية الكاملة (12 مرحلة).
 * ─────────────────────────────────────────────────────────────────────────
 * يقود المتدرّب عبر الدورة المستندية لِـ Brandzo كما في المرجع التشغيلي الرسمي:
 *   01 طلب الشراء ← 02 أمر الشراء ← 03 إشعار الشحن المسبق ← 04 الاستلام والجودة
 *   ← 05 التخزين ← 06 السحب/التسليم (FEFO) ← 07 الشحن وتصريح البوابة
 *   ← 08 المرتجعات والإشعار الدائن ← 09 الجرد الدوري ← 10 تسويات المخزون
 *   ← 11 المطابقة الثلاثية والفاتورة ← 12 الإغلاق المالي.
 *
 * القواعد الذهبية مفروضة آلياً (كل محاولة مخالفة تُحجب وتُحتسب):
 *   • حوكمة الشراء: لا أمر شراء دون طلب شراء معتمد.
 *   • بوابة الجودة: لا اعتماد استلام قبل موافقة مفتّش الجودة.
 *   • FEFO: الأقرب انتهاءً يخرج أولاً — أي دفعة أحدث تُحجب.
 *   • تصريح البوابة: لا تخرج مركبة دون Gate Pass معتمد مربوط بإذن التسليم.
 *   • المطابقة الثلاثية: أمر + استلام + فاتورة يجب أن تتطابق قبل الترحيل.
 *   • التسويات: لا تعديل رصيد دون سند تسوية معتمد من المدير المالي.
 */
import { SAMPLE_PO, RETURN_QTY, CC_SYSTEM_QTY, CC_LOT, CN_REF } from './odooTheme.js';

const PO_QTY = SAMPLE_PO.lines[0].qty;

/** الكمية المستلمة كما تراها المحاسبة = كمية الاستلام المكتمل (وإلا 0). */
function receivedQtyOf(grn) {
  if (grn.state !== 'done') return 0;
  return grn.lot ? grn.lot.qty : PO_QTY;
}

/** '2026-12-31' → '2027-12-31' (يضمن تاريخ انتهاء طُعم لاحقاً بشكل مؤكّد). */
function nextYear(dateStr) {
  return String(Number(dateStr.slice(0, 4)) + 1) + dateStr.slice(4);
}

/**
 * الدفعات المتاحة عند التسليم، مرتّبة بالأقرب انتهاءً أولاً (ترتيب FEFO).
 * الدفعة A = التي سجّلها المتدرّب أثناء الاستلام (الأقرب → يجب شحنها).
 * الدفعة B = دفعة أحدث في المخزون («فخّ» FEFO: أحدث، يجب ألّا تُشحن أولاً).
 */
export function deliveryLots(grn) {
  const gExp = grn.lot ? grn.lot.expiry : '2026-12-31';
  const gNum = grn.lot ? grn.lot.number : 'LOT-2026-A';
  const gQty = grn.lot ? grn.lot.qty : PO_QTY;
  const a = { number: gNum, expiry: gExp, qty: gQty, source: 'مستلَمة — هذه الدورة' };
  const b = { number: CC_LOT, expiry: nextYear(gExp), qty: CC_SYSTEM_QTY, source: 'دفعة أحدث في المخزون' };
  return [a, b].sort((x, z) => x.expiry.localeCompare(z.expiry));
}

export const initialState = {
  app: 'purchase', // 'purchase' | 'inventory' | 'accounting'
  purchView: 'pr', // عرض المشتريات: 'pr' | 'po'
  invView: 'list', // عرض المخزون: list | receipt | putaway | delivery | gatepass | return | cyclecount | adjustment
  acctView: 'list', // عرض المحاسبة: list | form | refund | close
  pr: { state: 'draft' }, // 01: draft | to_approve | approved
  po: { state: 'draft' }, // 02: 'draft' (طلب عرض سعر) | 'purchase' (مؤكّد)
  grn: {
    created: false, // يُنشأ الاستلام (مجدولاً عبر ASN) بمجرّد تأكيد أمر الشراء
    state: 'scheduled', // 03/04: scheduled | ready | in_progress | waiting_qc | done
    lot: null, // { number, expiry, qty }
    qc: null, // null | 'passed' | 'failed'
  },
  putaway: {
    state: 'ready', // 05: ready | done
    bin: 'WH/Stock/Rack-A/A3-12', // تقترحه قاعدة التخزين؛ يؤكّده المتدرّب
  },
  delivery: {
    pickedLot: null, // 06: الدفعة المختارة (يجب أن تكون الأقرب انتهاءً)
    done: false,
  },
  gatepass: {
    approved: false, // 07: اعتماد أمن المستودع
    exited: false, //     تسجيل خروج المركبة من البوابة
    vehicle: 'LBY-5-88214', // رقم لوحة مركبة التوزيع
    driver: 'أيمن الفيتوري',
  },
  returnDoc: {
    state: 'draft', // 08: draft | approved | done
    reason: null, // null | 'good' | 'damaged' | 'expired' — التصنيف إلزامي
    qty: RETURN_QTY,
  },
  refund: {
    state: 'draft', // 08: draft | posted — الإشعار الدائن المربوط بفاتورة المورّد
    qty: RETURN_QTY, // قابلة للتحرير — الترحيل يُحجب إن خالفت كمية المرتجع
  },
  cycleCount: {
    state: 'none', // 09: none | in_progress | validated
    counted: null, // العدّ الفعلي المُدخل
  },
  adjustment: {
    state: 'none', // 10: none | draft | validated  (draft يُنشأ آلياً عند وجود فارق)
    qty: 0, // الفارق (فعلي − نظام)
    financeApproved: false, // اعتماد المدير المالي — إلزامي قبل التصديق
  },
  bill: {
    created: false, // 11: تُنشأ فاتورة المورّد عند «إنشاء فاتورة»
    state: 'draft', // draft | posted | in_payment
    billedQty: PO_QTY, // قابلة للتحرير — لتوليد عدم تطابق تعليمي
  },
  close: { state: 'open' }, // 12: open | closed
  stats: { violations: 0 }, // محاولات مخالفة القواعد المحجوبة
  completionDismissed: false,
  wizard: null, // null | 'lots' | 'payment'
  alert: null, // { kind: 'error'|'warn'|'success', text }
};

/* اختصار: حجب مخالفة قاعدة + احتساب المحاولة. */
function block(state, text) {
  return {
    ...state,
    stats: { violations: state.stats.violations + 1 },
    alert: { kind: 'error', text },
  };
}

export function simReducer(state, action) {
  switch (action.type) {
    case 'OPEN_APP':
      return { ...state, app: action.app, alert: null, wizard: null };
    case 'RESET_CYCLE':
      return { ...initialState };
    case 'DISMISS_COMPLETION':
      return { ...state, completionDismissed: true };

    /* ── 01 طلب الشراء الداخلي (حوكمة الشراء) ── */
    case 'PURCH_VIEW':
      return { ...state, purchView: action.view, alert: null };
    case 'PR_SUBMIT':
      return {
        ...state,
        pr: { state: 'to_approve' },
        alert: { kind: 'warn', text: 'أُرسل طلب الشراء للموافقة — بانتظار اعتماد مدير المشتريات.' },
      };
    case 'PR_APPROVE':
      return {
        ...state,
        pr: { state: 'approved' },
        alert: { kind: 'success', text: `✓ اعتُمد طلب الشراء. أُنشئ طلب عرض سعر ${SAMPLE_PO.name} تلقائياً — افتحه من «أوامر الشراء».` },
      };

    /* ── 02 أمر الشراء ── */
    case 'CONFIRM_PO':
      if (state.pr.state !== 'approved') {
        return block(state, '🔒 حوكمة الشراء: لا يمكن تأكيد أمر الشراء قبل اعتماد طلب الشراء الداخلي (PR) من مدير المشتريات.');
      }
      return {
        ...state,
        po: { state: 'purchase' },
        grn: { ...state.grn, created: true, state: 'scheduled' },
        alert: { kind: 'success', text: 'تم تأكيد أمر الشراء. وصل إشعار شحن مسبق (ASN) من المورّد — جُدول الاستلام WH/IN/00001 في المخزون.' },
      };
    case 'RESET_PO':
      return { ...state, po: { state: 'draft' } };
    case 'OPEN_RECEIPT':
      return { ...state, app: 'inventory', invView: 'receipt', alert: null, wizard: null };

    /* ── تنقّل المخزون ── */
    case 'INV_SHOW_LIST':
      return { ...state, invView: 'list', alert: null };
    case 'INV_OPEN_FORM':
      return { ...state, invView: 'receipt', alert: null };

    /* ── 03 إشعار الشحن المسبق → 04 آلة حالة الاستلام (GRN) ── */
    case 'TRUCK_ARRIVED':
      return {
        ...state,
        grn: { ...state.grn, state: 'ready' },
        alert: { kind: 'success', text: 'وصلت الشاحنة إلى رصيف الاستلام. الاستلام جاهز — اضغط «بدء» لفتح العملية.' },
      };
    case 'GRN_START':
      return {
        ...state,
        grn: { ...state.grn, state: 'in_progress' },
        alert: {
          kind: 'warn',
          text: 'التتبّع مطلوب — سجّل رقم الدفعة/التسلسل وتاريخ الانتهاء (العمليات التفصيلية) للبضاعة المستلمة قبل الإرسال لمراقبة الجودة.',
        },
      };
    case 'OPEN_WIZARD':
      return { ...state, wizard: action.which };
    case 'CLOSE_WIZARD':
      return { ...state, wizard: null };
    case 'SAVE_LOT':
      return {
        ...state,
        grn: { ...state.grn, lot: action.lot },
        wizard: null,
        alert: {
          kind: 'success',
          text: `سُجّلت الدفعة ${action.lot.number} (انتهاء ${action.lot.expiry}) بكمية ${action.lot.qty} وحدة. يمكنك الآن إرسال الاستلام لمراقبة الجودة.`,
        },
      };
    case 'GRN_SEND_QC':
      if (!state.grn.lot) {
        return block(state, 'لا يمكن الإرسال لمراقبة الجودة: سجّل رقم الدفعة/التسلسل وتاريخ الانتهاء أولاً (التتبّع يُهيّئ FEFO).');
      }
      return {
        ...state,
        grn: { ...state.grn, state: 'waiting_qc' },
        alert: {
          kind: 'warn',
          text: 'الاستلام الآن بانتظار مراقبة الجودة. على مفتّش الجودة الموافقة (اجتياز) قبل إمكانية التصديق.',
        },
      };

    /* ── قرار مفتّش الجودة (البوابة الذهبية) ── */
    case 'QC_APPROVE':
      return {
        ...state,
        grn: { ...state.grn, state: 'done', qc: 'passed' },
        alert: { kind: 'success', text: '✓ اجتازت مراقبة الجودة. تم اعتماد الاستلام (مكتمل). التخزين (المرحلة 05) متاح الآن.' },
      };
    case 'QC_REJECT':
      return {
        ...state,
        grn: { ...state.grn, state: 'in_progress', qc: 'failed' },
        alert: {
          kind: 'warn',
          text: '✗ فشلت مراقبة الجودة. نُقلت البضاعة إلى الحجر الصحي وأُبلغ المورّد — لا يمكن تصديق الاستلام.',
        },
      };

    /* ── زر «تصديق» المحجوب — يُعلّم قاعدة الجودة الذهبية ── */
    case 'GRN_VALIDATE_ATTEMPT':
      if (state.grn.qc === 'passed') {
        return { ...state, grn: { ...state.grn, state: 'done' } };
      }
      return block(state, '🔒 القاعدة الذهبية — بوابة الجودة: لا يمكن تصديق هذا الاستلام (مكتمل) قبل موافقة مراقبة الجودة. سجّل الدفعة/الانتهاء ثم استخدم «إرسال لمراقبة الجودة».');

    /* ── 05 التخزين ── */
    case 'OPEN_PUTAWAY':
      return { ...state, app: 'inventory', invView: 'putaway', alert: null };
    case 'SET_PUTAWAY_BIN':
      return { ...state, putaway: { ...state.putaway, bin: action.bin } };
    case 'PUTAWAY_VALIDATE':
      return {
        ...state,
        putaway: { ...state.putaway, state: 'done' },
        alert: {
          kind: 'success',
          text: `اكتمل التخزين — خُزّنت البضاعة في ${state.putaway.bin}. تابع إلى التسليم (المرحلة 06).`,
        },
      };
    case 'OPEN_DELIVERY':
      return { ...state, app: 'inventory', invView: 'delivery', alert: null };

    /* ── 06 السحب / التسليم بفرض قاعدة FEFO ── */
    case 'PICK_LOT': {
      const lots = deliveryLots(state.grn);
      const earliest = lots[0];
      const chosen = lots.find((l) => l.number === action.lotNumber);
      if (action.lotNumber !== earliest.number) {
        return block(state, `🔒 مخالفة FEFO: الدفعة ${action.lotNumber} تنتهي ${chosen ? chosen.expiry : '—'}، لكن ${earliest.number} تنتهي أبكر (${earliest.expiry}) ويجب شحنها أولاً (الأقرب انتهاءً يخرج أولاً).`);
      }
      return {
        ...state,
        delivery: { ...state.delivery, pickedLot: action.lotNumber },
        alert: { kind: 'success', text: `✓ صحيح — ${earliest.number} (انتهاء ${earliest.expiry}) هي الدفعة الأقرب انتهاءً. تحقّقت قاعدة FEFO.` },
      };
    }
    case 'DELIVERY_VALIDATE':
      if (!state.delivery.pickedLot) {
        return block(state, 'اختر الدفعة المطلوب شحنها (FEFO) قبل تصديق التسليم.');
      }
      return {
        ...state,
        delivery: { ...state.delivery, done: true },
        alert: { kind: 'success', text: '✅ تم تصديق التسليم بالدفعة الصحيحة وفق FEFO. التالي: أصدر تصريح خروج البوابة (Gate Pass) قبل تحرّك الشاحنة.' },
      };

    /* ── 07 الشحن وتصريح خروج البوابة (القاعدة الذهبية الثالثة) ── */
    case 'OPEN_GATEPASS':
      return { ...state, app: 'inventory', invView: 'gatepass', alert: null };
    case 'GP_APPROVE':
      if (!state.delivery.done) {
        return block(state, 'لا يمكن اعتماد تصريح البوابة قبل تصديق إذن التسليم WH/OUT/00001.');
      }
      return {
        ...state,
        gatepass: { ...state.gatepass, approved: true },
        alert: { kind: 'success', text: '✓ اعتمد أمن المستودع تصريح البوابة GP/2026/0001 المربوط بإذن التسليم WH/OUT/00001.' },
      };
    case 'GP_EXIT_ATTEMPT':
      if (!state.gatepass.approved) {
        return block(state, '🔒 القاعدة الذهبية — البوابة: لا تخرج أي مركبة من بوابة المستودع دون تصريح خروج (Gate Pass) معتمد مربوط برقم إذن التسليم.');
      }
      return {
        ...state,
        gatepass: { ...state.gatepass, exited: true },
        alert: { kind: 'success', text: '🚚 سجّل الحارس خروج المركبة بمسح QR. اكتمل الشحن — التالي: معالجة مرتجع العميل (المرحلة 08).' },
      };

    /* ── 08 المرتجعات والتالف + الإشعار الدائن ── */
    case 'OPEN_RETURN':
      return { ...state, app: 'inventory', invView: 'return', alert: null };
    case 'RETURN_CLASSIFY':
      return {
        ...state,
        returnDoc: { ...state.returnDoc, reason: action.reason },
        alert: action.reason === 'damaged'
          ? { kind: 'warn', text: 'صُنّف المرتجع «تالف» — سيُنشأ تقرير بضاعة تالفة وتُعاد الوحدات للمورّد مع إشعار دائن.' }
          : { kind: 'success', text: 'سُجّل تصنيف المرتجع.' },
      };
    case 'RETURN_APPROVE':
      if (!state.returnDoc.reason) {
        return block(state, 'لا اعتماد لمرتجع دون تصنيف (سليم / تالف / منتهٍ) — التصنيف يحدّد مسار المعالجة.');
      }
      return {
        ...state,
        returnDoc: { ...state.returnDoc, state: 'approved' },
        alert: { kind: 'success', text: '✓ اعتمد مدير المستودع إشعار المرتجع. صدّق الآن لإدخاله في السجلّات.' },
      };
    case 'RETURN_VALIDATE':
      if (state.returnDoc.state !== 'approved') {
        return block(state, '🔒 لا يمكن تصديق إشعار المرتجع قبل التصنيف واعتماد مدير المستودع.');
      }
      return {
        ...state,
        returnDoc: { ...state.returnDoc, state: 'done' },
        alert: { kind: 'success', text: `✅ صُدّق المرتجع WH/RET/00001 (${state.returnDoc.qty} وحدة تالفة → تُعاد للمورّد). أُنشئت مسودة إشعار دائن ${CN_REF} في المحاسبة.` },
      };
    case 'OPEN_REFUND':
      return { ...state, app: 'accounting', acctView: 'refund', alert: null };
    case 'SET_REFUND_QTY':
      return { ...state, refund: { ...state.refund, qty: action.qty } };
    case 'POST_REFUND':
      if (state.returnDoc.state !== 'done') {
        return block(state, 'لا يمكن ترحيل الإشعار الدائن قبل تصديق إشعار المرتجع في المخزون.');
      }
      if (state.refund.qty !== state.returnDoc.qty) {
        return block(state, `🔒 كمية الإشعار الدائن (${state.refund.qty}) يجب أن تساوي الكمية المرتجعة فعلياً (${state.returnDoc.qty}) — الربط بالمرتجع والـ GRN إلزامي.`);
      }
      return {
        ...state,
        refund: { ...state.refund, state: 'posted' },
        alert: { kind: 'success', text: `✓ رُحّل الإشعار الدائن ${CN_REF} مربوطاً بفاتورة المورّد الأصلية والمرتجع. اكتملت المرحلة 08.` },
      };

    /* ── 09 الجرد الدوري ── */
    case 'OPEN_CYCLECOUNT':
      return { ...state, app: 'inventory', invView: 'cyclecount', alert: null };
    case 'CC_START':
      return {
        ...state,
        cycleCount: { ...state.cycleCount, state: 'in_progress' },
        alert: { kind: 'warn', text: `جُمّد رصيد الدفعة ${CC_LOT} مؤقتاً. عُدّ الوحدات فعلياً بالباركود وأدخل النتيجة.` },
      };
    case 'CC_SET_COUNT':
      return { ...state, cycleCount: { ...state.cycleCount, counted: action.qty } };
    case 'CC_VALIDATE': {
      const counted = state.cycleCount.counted;
      if (counted === null || counted === '' || Number.isNaN(Number(counted))) {
        return block(state, 'أدخل العدّ الفعلي قبل تصديق ورقة الجرد.');
      }
      const variance = Number(counted) - CC_SYSTEM_QTY;
      const next = {
        ...state,
        cycleCount: { ...state.cycleCount, counted: Number(counted), state: 'validated' },
      };
      if (variance === 0) {
        return {
          ...next,
          adjustment: { state: 'validated', qty: 0, financeApproved: true },
          alert: { kind: 'success', text: '✓ العدّ الفعلي يطابق رصيد النظام — لا حاجة لسند تسوية. اكتملت المرحلتان 09 و10.' },
        };
      }
      return {
        ...next,
        adjustment: { state: 'draft', qty: variance, financeApproved: false },
        alert: { kind: 'warn', text: `فارق جرد: الفعلي ${counted} − النظام ${CC_SYSTEM_QTY} = ${variance > 0 ? '+' : ''}${variance}. أُنشئ سند تسوية ADJ/2026/0001 — يلزم اعتماد المدير المالي قبل التصديق.` },
      };
    }

    /* ── 10 سند تسوية المخزون (اعتماد المدير المالي إلزامي) ── */
    case 'OPEN_ADJUSTMENT':
      return { ...state, app: 'inventory', invView: 'adjustment', alert: null };
    case 'ADJ_FINANCE_APPROVE':
      if (state.adjustment.state === 'none') {
        return { ...state, alert: { kind: 'warn', text: 'لا يوجد سند تسوية بعد — أكمل الجرد الدوري أولاً.' } };
      }
      return {
        ...state,
        adjustment: { ...state.adjustment, financeApproved: true },
        alert: { kind: 'success', text: '✓ اعتمد المدير المالي سند التسوية. يمكنك الآن التصديق — سيُنشأ قيد محاسبي تلقائياً.' },
      };
    case 'ADJ_VALIDATE_ATTEMPT':
      if (state.adjustment.state === 'none') {
        return { ...state, alert: { kind: 'warn', text: 'لا يوجد سند تسوية بعد — أكمل الجرد الدوري أولاً.' } };
      }
      if (!state.adjustment.financeApproved) {
        return block(state, '🔒 قاعدة التسويات: لا يُعدَّل أي رصيد يدوياً دون سند تسوية معتمد من المدير المالي.');
      }
      return {
        ...state,
        adjustment: { ...state.adjustment, state: 'validated' },
        alert: { kind: 'success', text: `✓ صُدّق سند التسوية (${state.adjustment.qty > 0 ? '+' : ''}${state.adjustment.qty} وحدة) وأُنشئ القيد المحاسبي. اكتملت المرحلة 10.` },
      };

    /* ── 11 المحاسبة: فاتورة المورّد + المطابقة الثلاثية + الدفع ── */
    case 'CREATE_BILL':
      return {
        ...state,
        app: 'accounting',
        acctView: 'form',
        bill: { ...state.bill, created: true },
        wizard: null,
        alert: { kind: 'success', text: `أُنشئت مسودة فاتورة مورّد من ${SAMPLE_PO.name}. راجع المطابقة الثلاثية قبل الترحيل.` },
      };
    case 'ACCT_SHOW_LIST':
      return { ...state, acctView: 'list', alert: null };
    case 'ACCT_OPEN_FORM':
      return { ...state, acctView: 'form', alert: null };
    case 'SET_BILLED_QTY':
      return { ...state, bill: { ...state.bill, billedQty: action.qty } };

    case 'POST_BILL': {
      const received = receivedQtyOf(state.grn);
      const billed = state.bill.billedQty;
      if (billed !== PO_QTY || billed !== received) {
        return block(state, `🔒 فشلت المطابقة الثلاثية — لا يمكن الترحيل: المفوتَر ${billed} ≠ المستلَم ${received} (الأمر ${PO_QTY}). يحجب Odoo الفاتورة حتى تتطابق كميات الأمر والاستلام والفاتورة.`);
      }
      return {
        ...state,
        bill: { ...state.bill, state: 'posted' },
        alert: { kind: 'success', text: '✓ نجحت المطابقة الثلاثية. رُحّلت فاتورة المورّد (BILL/2026/07/0001). يمكنك الآن تسجيل الدفعة.' },
      };
    }

    case 'REGISTER_PAYMENT':
      return {
        ...state,
        bill: { ...state.bill, state: 'in_payment' },
        wizard: null,
        alert: { kind: 'success', text: '💳 سُجّلت الدفعة — حالة الفاتورة الآن «قيد الدفع». تبقّى الإغلاق المالي للفترة (المرحلة 12).' },
      };

    /* ── 12 الإغلاق المالي ── */
    case 'OPEN_CLOSE':
      return { ...state, app: 'accounting', acctView: 'close', alert: null };
    case 'CLOSE_ATTEMPT': {
      const checks = closeChecklist(state);
      const missing = checks.filter((c) => !c.ok);
      if (missing.length) {
        return block(state, `🔒 لا يمكن إغلاق الفترة: ${missing.map((m) => m.label).join(' · ')} — أكمل المتطلّبات أولاً.`);
      }
      return {
        ...state,
        close: { state: 'closed' },
        alert: { kind: 'success', text: '🏁 أُغلقت الفترة المالية لمستندات المخازن. اكتملت الدورة المستندية الكاملة (12 مرحلة)!' },
      };
    }

    case 'DISMISS_ALERT':
      return { ...state, alert: null };

    default:
      return state;
  }
}

/* ═══════════════════ الجولة الموجَّهة: التقدّم والمهمة التالية ═══════════════════ */

/** بنود قائمة الإغلاق المالي (المرحلة 12) — مشتقّة من حالة الدورة. */
export function closeChecklist(state) {
  const adjDone = state.adjustment.state === 'validated';
  return [
    { label: 'فاتورة المورّد مُرحّلة', ok: state.bill.created && state.bill.state !== 'draft' },
    { label: 'الدفعة مسجّلة (قيد الدفع)', ok: state.bill.state === 'in_payment' },
    { label: 'الإشعار الدائن مُرحّل', ok: state.refund.state === 'posted' },
    { label: 'محضر الجرد الدوري مُصادَق', ok: state.cycleCount.state === 'validated' },
    { label: 'سند التسوية معتمد ومُصادَق', ok: adjDone },
    { label: 'المرتجعات مُقفلة', ok: state.returnDoc.state === 'done' },
  ];
}

/** حالة اكتمال المراحل الـ12 — تُغذّي شريط التقدّم وشاشة الإنجاز. */
export function cycleProgress(state) {
  const s = state;
  const stage10 = s.adjustment.state === 'validated';
  return [
    { num: '01', title: 'طلب الشراء', done: s.pr.state === 'approved' },
    { num: '02', title: 'أمر الشراء', done: s.po.state === 'purchase' },
    { num: '03', title: 'إشعار الشحن المسبق', done: s.grn.created && s.grn.state !== 'scheduled' },
    { num: '04', title: 'الاستلام وفحص الجودة', done: s.grn.state === 'done' },
    { num: '05', title: 'التخزين الموجّه', done: s.putaway.state === 'done' },
    { num: '06', title: 'السحب والتسليم (FEFO)', done: s.delivery.done },
    { num: '07', title: 'الشحن وتصريح البوابة', done: s.gatepass.exited },
    { num: '08', title: 'المرتجعات والإشعار الدائن', done: s.returnDoc.state === 'done' && s.refund.state === 'posted' },
    { num: '09', title: 'الجرد الدوري', done: s.cycleCount.state === 'validated' },
    { num: '10', title: 'تسويات المخزون', done: stage10 },
    { num: '11', title: 'المطابقة الثلاثية والفاتورة', done: s.bill.state === 'in_payment' },
    { num: '12', title: 'الإغلاق المالي', done: s.close.state === 'closed' },
  ];
}

/** المهمة الإرشادية الحالية — أول مرحلة غير مكتملة بترتيب الدورة. */
export function nextMission(state) {
  const s = state;
  if (s.pr.state !== 'approved') {
    return {
      num: '01', title: 'طلب الشراء الداخلي',
      text: s.pr.state === 'draft'
        ? 'من «المشتريات ← طلبات الشراء الداخلية»: اضغط «إرسال للموافقة».'
        : 'بصفتك مدير المشتريات: اضغط «اعتماد» — سيُنشأ طلب عرض السعر تلقائياً.',
    };
  }
  if (s.po.state !== 'purchase') {
    return { num: '02', title: 'أمر الشراء', text: 'افتح «أوامر الشراء» واضغط «تأكيد الطلب» لتحويل طلب العرض إلى أمر شراء ملزم.' };
  }
  if (s.grn.state === 'scheduled') {
    return { num: '03', title: 'إشعار الشحن المسبق', text: 'وصل ASN من المورّد. افتح الاستلام WH/IN/00001 (المخزون) واضغط «وصلت الشاحنة».' };
  }
  if (s.grn.state !== 'done') {
    if (s.grn.state === 'ready') return { num: '04', title: 'الاستلام وفحص الجودة', text: 'اضغط «بدء» لفتح عملية الاستلام.' };
    if (s.grn.state === 'in_progress' && !s.grn.lot) return { num: '04', title: 'الاستلام وفحص الجودة', text: 'سجّل رقم الدفعة وتاريخ الانتهاء عبر «العمليات التفصيلية» (التتبّع إلزامي).' };
    if (s.grn.state === 'in_progress') return { num: '04', title: 'الاستلام وفحص الجودة', text: 'اضغط «إرسال لمراقبة الجودة» — وجرّب «تصديق» لترى بوابة الجودة تحجبك!' };
    return { num: '04', title: 'الاستلام وفحص الجودة', text: 'بصفتك مفتّش الجودة: اضغط «اعتماد — اجتياز الفحص».' };
  }
  if (s.putaway.state !== 'done') {
    return { num: '05', title: 'التخزين الموجّه', text: 'من زر «التخزين» الذكي: أكّد الموقع المقترح ثم «تصديق».' };
  }
  if (!s.delivery.done) {
    return { num: '06', title: 'السحب والتسليم', text: 'اختر الدفعة الأقرب انتهاءً (FEFO) ثم «تصديق» — جرّب الدفعة الأحدث لترى الحجب!' };
  }
  if (!s.gatepass.exited) {
    return {
      num: '07', title: 'الشحن وتصريح البوابة',
      text: s.gatepass.approved
        ? 'اضغط «تسجيل خروج المركبة» — الحارس يمسح QR.'
        : 'افتح «تصاريح البوابة»: جرّب «خروج المركبة» أولاً لترى الحجب، ثم «اعتماد (أمن المستودع)».',
    };
  }
  if (!(s.returnDoc.state === 'done' && s.refund.state === 'posted')) {
    if (s.returnDoc.state === 'draft' && !s.returnDoc.reason) return { num: '08', title: 'المرتجعات', text: 'وصل مرتجع من العميل (20 وحدة). افتح «المرتجعات» وصنّفه «تالف».' };
    if (s.returnDoc.state === 'draft') return { num: '08', title: 'المرتجعات', text: 'اضغط «اعتماد المرتجع» (مدير المستودع).' };
    if (s.returnDoc.state === 'approved') return { num: '08', title: 'المرتجعات', text: 'اضغط «تصديق» لإدخال المرتجع — سيُنشأ إشعار دائن تلقائياً.' };
    return { num: '08', title: 'الإشعار الدائن', text: 'من «المحاسبة ← الإشعارات الدائنة»: رحّل الإشعار المربوط بفاتورة المورّد.' };
  }
  if (s.cycleCount.state !== 'validated') {
    return {
      num: '09', title: 'الجرد الدوري',
      text: s.cycleCount.state === 'none'
        ? 'افتح «الجرد الدوري» واضغط «بدء مهمة الجرد» لتجميد رصيد LOT-2027-NEW.'
        : 'العدّ الفعلي وجد 58 وحدة — أدخل 58 ثم «تصديق ورقة الجرد».',
    };
  }
  if (s.adjustment.state !== 'validated') {
    return {
      num: '10', title: 'تسويات المخزون',
      text: s.adjustment.financeApproved
        ? 'اضغط «تصديق السند» لإنشاء القيد المحاسبي.'
        : 'جرّب «تصديق السند» لترى الحجب، ثم «اعتماد المدير المالي».',
    };
  }
  if (s.bill.state !== 'in_payment') {
    if (!s.bill.created) return { num: '11', title: 'المطابقة والفاتورة', text: 'من أمر الشراء: اضغط «إنشاء فاتورة».' };
    if (s.bill.state === 'draft') return { num: '11', title: 'المطابقة والفاتورة', text: 'تحقّق من المطابقة الثلاثية ثم «ترحيل» — جرّب تغيير الكمية لترى الحجب!' };
    return { num: '11', title: 'المطابقة والفاتورة', text: 'اضغط «تسجيل الدفعة» ثم «إنشاء الدفعة».' };
  }
  if (s.close.state !== 'closed') {
    return { num: '12', title: 'الإغلاق المالي', text: 'من «المحاسبة ← الإغلاق المالي»: راجع القائمة ثم «إغلاق الفترة المالية».' };
  }
  return null; // اكتملت الدورة 🎉
}
