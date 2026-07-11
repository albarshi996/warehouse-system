/**
 * محاكي Odoo — محرّك الحالة (reducer).
 * ─────────────────────────────────────────────────────────────────────────
 * يقود الدورة المستندية لِـ Brandzo عبر تطبيقات Odoo المُحاكاة. يفرض الاستلام
 * (GRN) القواعد الذهبية حرفياً:
 *   • التتبّع: رقم الدفعة/التسلسل + الانتهاء إلزاميان قبل الجودة.
 *   • بوابة الجودة: لا يُصدَّق الاستلام (مكتمل) قبل موافقة مفتّش الجودة —
 *     زر «تصديق» محجوب حتى تُصبح الجودة = ناجحة.
 *   • التخزين (المرحلة 05) لا يُفتح إلا بعد اكتمال الاستلام.
 *
 * حالات الاستلام: draft → ready → in_progress → waiting_qc → done.
 * حالات الفاتورة: draft → posted → in_payment (تحكمها المطابقة الثلاثية).
 */
import { SAMPLE_PO } from './odooTheme.js';

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
  const b = { number: 'LOT-2027-NEW', expiry: nextYear(gExp), qty: 60, source: 'دفعة أحدث في المخزون' };
  return [a, b].sort((x, z) => x.expiry.localeCompare(z.expiry));
}

export const initialState = {
  app: 'purchase', // 'purchase' | 'inventory' | 'accounting'
  invView: 'list', // عرض المخزون: 'list' | 'receipt' | 'putaway' | 'delivery'
  acctView: 'list', // صفحة المحاسبة: 'list' | 'form'
  po: { state: 'draft' }, // 'draft' (طلب عرض سعر) | 'purchase' (مؤكّد)
  grn: {
    created: false, // يُنشأ الاستلام بمجرّد تأكيد أمر الشراء
    state: 'draft', // draft | ready | in_progress | waiting_qc | done
    lot: null, // { number, expiry, qty }
    qc: null, // null | 'passed' | 'failed'
  },
  bill: {
    created: false, // تُنشأ فاتورة المورّد عند الضغط على «إنشاء فاتورة»
    state: 'draft', // draft | posted | in_payment
    billedQty: PO_QTY, // قابلة للتحرير — تطابق افتراضياً؛ غيّرها لتوليد عدم تطابق
  },
  putaway: {
    state: 'ready', // ready | done  (تحويل التخزين جاهز بمجرّد اكتمال الاستلام)
    bin: 'WH/Stock/Rack-A/A3-12', // تقترحه قاعدة التخزين؛ يؤكّده المتدرّب
  },
  delivery: {
    pickedLot: null, // الدفعة التي اختارها المتدرّب (يجب أن تكون الأقرب انتهاءً)
    done: false,
  },
  wizard: null, // null | 'lots' | 'payment'
  alert: null, // { kind: 'error'|'warn'|'success', text }
};

export function simReducer(state, action) {
  switch (action.type) {
    case 'OPEN_APP':
      return { ...state, app: action.app, alert: null, wizard: null };

    /* ── المشتريات ── */
    case 'CONFIRM_PO':
      return {
        ...state,
        po: { state: 'purchase' },
        grn: { ...state.grn, created: true },
        alert: { kind: 'success', text: 'تم تأكيد أمر الشراء. أُنشئ إذن استلام (WH/IN/00001) في المخزون.' },
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

    /* ── آلة حالة الاستلام (GRN) ── */
    case 'GRN_MARK_TODO':
      return { ...state, grn: { ...state.grn, state: 'ready' }, alert: null };
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
        return {
          ...state,
          alert: {
            kind: 'error',
            text: 'لا يمكن الإرسال لمراقبة الجودة: سجّل رقم الدفعة/التسلسل وتاريخ الانتهاء أولاً (التتبّع يُهيّئ FEFO).',
          },
        };
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
      return {
        ...state,
        alert: {
          kind: 'error',
          text: '🔒 القاعدة الذهبية — بوابة الجودة: لا يمكن تصديق هذا الاستلام (مكتمل) قبل موافقة مراقبة الجودة. سجّل الدفعة/الانتهاء ثم استخدم «إرسال لمراقبة الجودة».',
        },
      };

    /* ── التخزين (المرحلة 05) ── */
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

    /* ── السحب / التسليم بفرض قاعدة FEFO (المرحلة 06) ── */
    case 'PICK_LOT': {
      const lots = deliveryLots(state.grn);
      const earliest = lots[0];
      const chosen = lots.find((l) => l.number === action.lotNumber);
      if (action.lotNumber !== earliest.number) {
        return {
          ...state,
          alert: {
            kind: 'error',
            text: `🔒 مخالفة FEFO: الدفعة ${action.lotNumber} تنتهي ${chosen ? chosen.expiry : '—'}، لكن ${earliest.number} تنتهي أبكر (${earliest.expiry}) ويجب شحنها أولاً (الأقرب انتهاءً يخرج أولاً).`,
          },
        };
      }
      return {
        ...state,
        delivery: { ...state.delivery, pickedLot: action.lotNumber },
        alert: { kind: 'success', text: `✓ صحيح — ${earliest.number} (انتهاء ${earliest.expiry}) هي الدفعة الأقرب انتهاءً. تحقّقت قاعدة FEFO.` },
      };
    }
    case 'DELIVERY_VALIDATE':
      if (!state.delivery.pickedLot) {
        return { ...state, alert: { kind: 'error', text: 'اختر الدفعة المطلوب شحنها (FEFO) قبل تصديق التسليم.' } };
      }
      return {
        ...state,
        delivery: { ...state.delivery, done: true },
        alert: { kind: 'success', text: '✅ تم تصديق التسليم بالدفعة الصحيحة وفق FEFO. اكتملت دورة المخزون: استلام ← جودة ← تخزين ← تسليم.' },
      };

    /* ── المحاسبة: فاتورة المورّد + المطابقة الثلاثية + الدفع ── */
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
        return {
          ...state,
          alert: {
            kind: 'error',
            text: `🔒 فشلت المطابقة الثلاثية — لا يمكن الترحيل: المفوتَر ${billed} ≠ المستلَم ${received} (الأمر ${PO_QTY}). يحجب Odoo الفاتورة حتى تتطابق كميات الأمر والاستلام والفاتورة.`,
          },
        };
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
        alert: { kind: 'success', text: '💳 سُجّلت الدفعة — حالة الفاتورة الآن «قيد الدفع». اكتملت الدورة: أمر شراء ← استلام ← فاتورة ← دفع.' },
      };

    case 'DISMISS_ALERT':
      return { ...state, alert: null };

    default:
      return state;
  }
}
