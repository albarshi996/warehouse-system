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
 */

export const initialState = {
  app: 'purchase', // 'purchase' | 'inventory' | 'accounting'
  invView: 'list', // inventory landing: 'list' | 'form'
  po: { state: 'draft' }, // 'draft' (RFQ) | 'purchase' (confirmed)
  grn: {
    created: false, // the receipt exists once the PO is confirmed
    state: 'draft', // draft | ready | in_progress | waiting_qc | done
    lot: null, // { number, expiry, qty }
    qc: null, // null | 'passed' | 'failed'
  },
  wizard: null, // null | 'lots'
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
      return { ...state, app: 'inventory', invView: 'form', alert: null, wizard: null };

    /* ── Inventory navigation ── */
    case 'INV_SHOW_LIST':
      return { ...state, invView: 'list', alert: null };
    case 'INV_OPEN_FORM':
      return { ...state, invView: 'form', alert: null };

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

    case 'PUTAWAY_INFO':
      return {
        ...state,
        alert: {
          kind: 'success',
          text: 'Putaway (Stage 05): assign the storage location per Putaway rules. This screen is the next build phase of the cycle.',
        },
      };

    case 'DISMISS_ALERT':
      return { ...state, alert: null };

    default:
      return state;
  }
}
