/**
 * Odoo Simulator — state engine (reducer).
 * ─────────────────────────────────────────────────────────────────────────
 * Drives the Brandzo document cycle across the simulated Odoo apps. The GRN
 * (Receipt) enforces the golden rules verbatim:
 *   • Traceability: Lot/Serial + Expiry are mandatory before QC.
 *   • Quality gate: a receipt can NEVER be validated (Done) before a Quality
 *     Inspector approves it — "Validate" is blocked until QC = Passed.
 *   • Putaway (Stage 05) unlocks only once the receipt is Done.
 *
 * GRN state machine: draft → ready → in_progress → waiting_qc → done.
 * Bill state machine: draft → posted → in_payment (gated by the 3-Way Match).
 */
import { SAMPLE_PO } from './odooTheme.js';

const PO_QTY = SAMPLE_PO.lines[0].qty;

/** Received quantity as seen by Accounting = the GRN's done quantity (else 0). */
function receivedQtyOf(grn) {
  if (grn.state !== 'done') return 0;
  return grn.lot ? grn.lot.qty : PO_QTY;
}

/** '2026-12-31' → '2027-12-31' (guarantees a strictly later decoy expiry). */
function nextYear(dateStr) {
  return String(Number(dateStr.slice(0, 4)) + 1) + dateStr.slice(4);
}

/**
 * Lots available at delivery, sorted earliest-expiry first (FEFO order).
 * Lot A = the one the trainee recorded during the GRN (earliest → must ship).
 * Lot B = a later batch in stock (the FEFO "trap": newer, must NOT ship first).
 */
export function deliveryLots(grn) {
  const gExp = grn.lot ? grn.lot.expiry : '2026-12-31';
  const gNum = grn.lot ? grn.lot.number : 'LOT-2026-A';
  const gQty = grn.lot ? grn.lot.qty : PO_QTY;
  const a = { number: gNum, expiry: gExp, qty: gQty, source: 'Received — this cycle' };
  const b = { number: 'LOT-2027-NEW', expiry: nextYear(gExp), qty: 60, source: 'Later batch in stock' };
  return [a, b].sort((x, z) => x.expiry.localeCompare(z.expiry));
}

export const initialState = {
  app: 'purchase', // 'purchase' | 'inventory' | 'accounting'
  invView: 'list', // inventory view: 'list' | 'receipt' | 'putaway' | 'delivery'
  acctView: 'list', // accounting landing: 'list' | 'form'
  po: { state: 'draft' }, // 'draft' (RFQ) | 'purchase' (confirmed)
  grn: {
    created: false, // the receipt exists once the PO is confirmed
    state: 'draft', // draft | ready | in_progress | waiting_qc | done
    lot: null, // { number, expiry, qty }
    qc: null, // null | 'passed' | 'failed'
  },
  bill: {
    created: false, // the vendor bill exists once "Create Bill" is clicked
    state: 'draft', // draft | posted | in_payment
    billedQty: PO_QTY, // editable — matches by default; change it to trigger a mismatch
  },
  putaway: {
    state: 'ready', // ready | done  (a putaway transfer is ready once the GRN is done)
    bin: 'WH/Stock/Rack-A/A3-12', // suggested by the putaway rule; trainee confirms
  },
  delivery: {
    pickedLot: null, // the lot the trainee selected (must be the earliest expiry)
    done: false,
  },
  wizard: null, // null | 'lots' | 'payment'
  alert: null, // { kind: 'error'|'warn'|'success', text }
};

export function simReducer(state, action) {
  switch (action.type) {
    case 'OPEN_APP':
      return { ...state, app: action.app, alert: null, wizard: null };

    /* ── Purchase ── */
    case 'CONFIRM_PO':
      return {
        ...state,
        po: { state: 'purchase' },
        grn: { ...state.grn, created: true },
        alert: { kind: 'success', text: 'Purchase Order confirmed. A Receipt (WH/IN/00001) has been generated in Inventory.' },
      };
    case 'RESET_PO':
      return { ...state, po: { state: 'draft' } };
    case 'OPEN_RECEIPT':
      return { ...state, app: 'inventory', invView: 'receipt', alert: null, wizard: null };

    /* ── Inventory navigation ── */
    case 'INV_SHOW_LIST':
      return { ...state, invView: 'list', alert: null };
    case 'INV_OPEN_FORM':
      return { ...state, invView: 'receipt', alert: null };

    /* ── GRN state machine ── */
    case 'GRN_MARK_TODO':
      return { ...state, grn: { ...state.grn, state: 'ready' }, alert: null };
    case 'GRN_START':
      return {
        ...state,
        grn: { ...state.grn, state: 'in_progress' },
        alert: {
          kind: 'warn',
          text: 'Traceability required — record a Lot/Serial Number and Expiry Date (Detailed Operations) for the received goods before sending to Quality Control.',
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
          text: `Lot ${action.lot.number} (Exp ${action.lot.expiry}) recorded for ${action.lot.qty} Units. You may now send the receipt to Quality Control.`,
        },
      };
    case 'GRN_SEND_QC':
      if (!state.grn.lot) {
        return {
          ...state,
          alert: {
            kind: 'error',
            text: 'Cannot send to Quality Control: record a Lot/Serial Number and Expiry Date first (traceability sets up FEFO).',
          },
        };
      }
      return {
        ...state,
        grn: { ...state.grn, state: 'waiting_qc' },
        alert: {
          kind: 'warn',
          text: 'Receipt is now Waiting for Quality Control. A Quality Inspector must approve (Pass) before it can be validated.',
        },
      };

    /* ── Quality Inspector decision (the golden gate) ── */
    case 'QC_APPROVE':
      return {
        ...state,
        grn: { ...state.grn, state: 'done', qc: 'passed' },
        alert: { kind: 'success', text: '✓ Quality Control passed. Receipt validated (Done). Putaway (Stage 05) is now available.' },
      };
    case 'QC_REJECT':
      return {
        ...state,
        grn: { ...state.grn, state: 'in_progress', qc: 'failed' },
        alert: {
          kind: 'warn',
          text: '✗ Quality Control failed. Goods moved to Quarantine and the vendor is notified — the receipt cannot be validated.',
        },
      };

    /* ── The blocked "Validate" — teaches the QC golden rule ── */
    case 'GRN_VALIDATE_ATTEMPT':
      if (state.grn.qc === 'passed') {
        return { ...state, grn: { ...state.grn, state: 'done' } };
      }
      return {
        ...state,
        alert: {
          kind: 'error',
          text: '🔒 Golden Rule — Quality gate: this receipt cannot be validated (Done) before Quality Control approves it. Record lot/expiry, then use “Send to Quality Control”.',
        },
      };

    /* ── Putaway (Stage 05) ── */
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
          text: `Putaway complete — goods stored at ${state.putaway.bin}. Proceed to Delivery (Stage 06).`,
        },
      };
    case 'OPEN_DELIVERY':
      return { ...state, app: 'inventory', invView: 'delivery', alert: null };

    /* ── Picking / Delivery with FEFO enforcement (Stage 06) ── */
    case 'PICK_LOT': {
      const lots = deliveryLots(state.grn);
      const earliest = lots[0];
      const chosen = lots.find((l) => l.number === action.lotNumber);
      if (action.lotNumber !== earliest.number) {
        return {
          ...state,
          alert: {
            kind: 'error',
            text: `🔒 FEFO violation: ${action.lotNumber} expires ${chosen ? chosen.expiry : '—'}, but ${earliest.number} expires earlier (${earliest.expiry}) and MUST ship first (First-Expiry-First-Out).`,
          },
        };
      }
      return {
        ...state,
        delivery: { ...state.delivery, pickedLot: action.lotNumber },
        alert: { kind: 'success', text: `✓ Correct — ${earliest.number} (Exp ${earliest.expiry}) is the earliest-expiry lot. FEFO respected.` },
      };
    }
    case 'DELIVERY_VALIDATE':
      if (!state.delivery.pickedLot) {
        return { ...state, alert: { kind: 'error', text: 'Select the lot to ship (FEFO) before validating the delivery.' } };
      }
      return {
        ...state,
        delivery: { ...state.delivery, done: true },
        alert: { kind: 'success', text: '✅ Delivery validated with the FEFO-correct lot. Inventory cycle complete: Receipt → QC → Putaway → Delivery.' },
      };

    /* ── Accounting: Vendor Bill + 3-Way Match + Payment ── */
    case 'CREATE_BILL':
      return {
        ...state,
        app: 'accounting',
        acctView: 'form',
        bill: { ...state.bill, created: true },
        wizard: null,
        alert: { kind: 'success', text: `Draft Vendor Bill created from ${SAMPLE_PO.name}. Review the 3-Way Match before posting.` },
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
            text: `🔒 3-Way Match failed — cannot Post: Billed ${billed} ≠ Received ${received} (PO ${PO_QTY}). Odoo blocks the bill until PO, Receipt and Bill quantities all match.`,
          },
        };
      }
      return {
        ...state,
        bill: { ...state.bill, state: 'posted' },
        alert: { kind: 'success', text: '✓ 3-Way Match passed. Vendor Bill posted (BILL/2026/07/0001). You can now Register Payment.' },
      };
    }

    case 'REGISTER_PAYMENT':
      return {
        ...state,
        bill: { ...state.bill, state: 'in_payment' },
        wizard: null,
        alert: { kind: 'success', text: '💳 Payment registered — the bill status is now “In Payment”. Cycle complete: PO → Receipt → Bill → Payment.' },
      };

    case 'DISMISS_ALERT':
      return { ...state, alert: null };

    default:
      return state;
  }
}
